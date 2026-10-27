#include "../src/DeviceProfile/DeviceProfileEngine.h"
#include "../src/DeviceProfile/DeviceProfileService.h"
#include "../src/DeviceProfile/MidiCiSession.h"
#include "../src/DeviceProfile/ProfileChecksums.h"
#include "../src/Player/DumpCapturePolicy.h"

#include <juce_midi_ci/juce_midi_ci.h>

#include <algorithm>
#include <deque>
#include <map>
#include <iostream>
#include <memory>
#include <optional>
#include <utility>
#include <vector>

namespace ceditor::device
{
/** Reaches a service's pending requests, which only a real MIDI send creates otherwise. */
struct DeviceProfileServiceTestAccess
{
    static void awaitDump (DeviceProfileService& service, const juce::String& role, const juce::String& dumpId)
    {
        DeviceProfileService::PendingDeviceRequest request;
        request.correlationId = "test_" + dumpId;
        request.deviceRole = role;
        request.expectedResponseKind = "dump";
        request.expectedDumpId = dumpId;
        request.createdAtMs = juce::Time::getMillisecondCounterHiRes();
        request.timeoutAtMs = request.createdAtMs + 60000.0;
        service.addPendingDeviceRequest (request);
    }

    /** Moves what the service was answered with past the grace period, as time would. */
    static void lapseAnswers (DeviceProfileService& service)
    {
        for (auto& answered : service.answeredReplies)
            answered.atMs -= DeviceProfileService::answeredReplyGraceMs + 1.0;
    }

    /** One timer tick's publishing, which these tests have no message loop to run. */
    static void publish (DeviceProfileService& service)  { service.publishPendingRequests(); }
    static void tick (DeviceProfileService& service)  { service.timerCallback(); }
    static juce::File publishedFile (const DeviceProfileService& service)  { return service.publishedRequestsFile; }
    static juce::File directory()  { return DeviceProfileService::pendingRequestsDirectory(); }
    static const void* engineFor (DeviceProfileService& service, const juce::String& profileId)  { return service.resolveEngine (profileId, {}); }

    /** A request already past its timeout, holding what it sent and how many tries it has left. */
    static void awaitExpired (DeviceProfileService& service, const juce::String& role, const juce::String& dumpId, int retries)
    {
        DeviceProfileService::PendingDeviceRequest request;
        request.correlationId = "expired_" + dumpId;
        request.deviceRole = role;
        request.requestId = "request_" + dumpId;
        request.expectedResponseKind = "dump";
        request.expectedDumpId = dumpId;
        MidiMessageSpec message;
        message.kind = "sysex";
        message.bytes = { 0xF0, 0x7D, 0x01, 0xF7 };
        request.transaction.messages.add (message);
        request.timeoutMs = 10;
        request.createdAtMs = juce::Time::getMillisecondCounterHiRes() - 100.0;
        request.timeoutAtMs = request.createdAtMs;
        request.retriesRemaining = retries;
        service.addPendingDeviceRequest (request);
    }
    static void runTimeouts (DeviceProfileService& service)  { service.processPendingRequestTimeouts(); }
    static int pendingCount (const DeviceProfileService& service)  { return (int) service.pendingDeviceRequests.size(); }
    /** Every status line in the MIDI log, oldest first (the page is sent it later, on a timer). */
    static juce::StringArray loggedStatuses (const DeviceProfileService& service)
    {
        juce::StringArray out;
        for (const auto& event : service.monitorEvents)
            out.add (event.getProperty ("status", "").toString());
        return out;
    }
};
} // namespace ceditor::device

namespace
{
juce::File profileRoot()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT)
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");
   #else
    return juce::File::getCurrentWorkingDirectory()
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");
   #endif
}

/*
 * The nibbled encoder, against the profile that actually uses it.
 *
 * WHY THIS EXISTS. 622 of the GAIA's 793 parameters are nibbled — every envelope, filter and LFO
 * value the instrument has. They could not be SENT at all from the desktop build until the profile
 * was taught the encoder's vocabulary, and inbound they were read as their top nibble alone. That
 * fix was verified by reading DeviceProfileEngine.cpp and mirroring it in the JS runtime; nothing
 * ever compiled the C++ and watched it produce bytes. This file had zero nibbled tests while the
 * engine had nineteen references to them.
 *
 * WHAT IS ASSERTED IS THE FORMAT'S PROPERTY, not the implementation's shape: a nibbled field is the
 * value in base 16, most significant nibble first, one nibble per byte. Every byte is therefore
 * 0x0F or less — which is the whole point, since the bug was a value above 15 being written into a
 * single byte. Checking `encodedValueHex` keeps the framing and the Roland checksum out of it;
 * those have their own tests, and folding them in here would make a nibble test that fails for
 * reasons that are not about nibbles.
 */
int runGaiaNoteChoiceTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error)) return 1;
    const auto document = juce::JSON::parse (file.loadFileAsString());
    auto* parameters = document.getProperty ("parameters", {}).getArray();
    if (parameters == nullptr) return 1;
    int failures = 0, checked = 0;
    for (const auto& parameter : *parameters)
    {
        const auto id = parameter.getProperty ("id", {}).toString();
        if (! id.endsWith (".tempoSyncNote")) continue;
        auto* choices = parameter.getProperty ("choices", {}).getArray();
        if (choices == nullptr) { ++failures; continue; }
        for (const auto& choice : *choices)
        {
            const auto expected = juce::String::toHexString ((int) choice.getProperty ("value", {})).paddedLeft ('0', 2).toUpperCase();
            for (const auto* field : { "id", "label", "value" })
            {
                const auto value = choice.getProperty (field, {});
                const auto result = engine.compileSetParameter ("mainSynth", id, value, true);
                if (! result.ok || result.transaction.encodedValueHex != expected
                    || result.transaction.semanticValue.toString() != choice.getProperty ("id", {}).toString())
                {
                    std::cerr << "[FAIL] note choice " << id << " " << field << "=" << value.toString()
                              << ": expected " << expected << ", got " << result.transaction.encodedValueHex << "\n";
                    ++failures;
                }
                ++checked;
            }

            // AudioProcessor parameters arrive as floating-point values (2.0, not the string
            // "2"). That representation must select the same wire value while the window is shut.
            const auto floating = juce::var ((double) (int) choice.getProperty ("value", {}));
            const auto floatResult = engine.compileSetParameter ("mainSynth", id, floating, true);
            if (! floatResult.ok || floatResult.transaction.encodedValueHex != expected)
            {
                std::cerr << "[FAIL] note choice " << id << " floating=" << floating.toString()
                          << ": expected " << expected << ", got "
                          << floatResult.transaction.encodedValueHex << "\n";
                ++failures;
            }
            ++checked;
        }
    }
    if (checked != 480) ++failures;
    if (failures == 0) std::cout << "[PASS] GAIA note choices: all 480 ID, label and numeric encodings\n";
    return failures;
}

int runNibbledEncoderTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] nibbled: could not load " << file.getFileName() << ": " << error << "\n";
        return 1;
    }

    auto failures = 0;
    const auto hexOf = [&engine] (const juce::String& id, const juce::var& value) -> juce::String
    {
        const auto result = engine.compileSetParameter ("mainSynth", id, value, true);
        return result.ok ? result.transaction.encodedValueHex : juce::String ("!" + result.error);
    };

    // Base-16, high nibble first. 300 = 0x12C, and the profile gives Patch Tempo three nibbles.
    struct Known { const char* id; int value; const char* expected; };
    const Known known[] = {
        { "common.patchTempo", 300, "01 02 0C" },   // 0x12C
        { "common.patchTempo", 5,   "00 00 05" },   // the parameter's own minimum
        { "common.patchTempo", 256, "01 00 00" },   // a carry across every nibble
    };

    for (const auto& k : known)
    {
        const auto actual = hexOf (k.id, k.value);
        if (actual != k.expected)
        {
            std::cerr << "[FAIL] nibbled " << k.id << " = " << k.value
                      << ": expected " << k.expected << ", got " << actual << "\n";
            ++failures;
        }
    }
    if (failures == 0)
        std::cout << "[PASS] nibbled :: base-16 split, high nibble first (3-nibble Patch Tempo)\n";

    // THE SWEEP. Every nibbled parameter, at the bottom, middle and top of its own range: it must
    // encode at all (the "could not be sent" bug), it must produce exactly `nibbles` bytes, and
    // none of them may exceed 0x0F.
    //
    // Read from the profile FILE rather than from listParameterDescriptors, which does not carry
    // `encoding` — widening a shipped API so a test can see the field it wants to test would be the
    // tail wagging the dog. This is the same document the engine just loaded.
    const auto document = juce::JSON::parse (file.loadFileAsString());
    auto* documentObject = document.getDynamicObject();
    auto* list = documentObject != nullptr ? documentObject->getProperty ("parameters").getArray() : nullptr;
    if (list == nullptr)
    {
        std::cerr << "[FAIL] nibbled: could not read parameters out of " << file.getFileName() << "\n";
        return failures + 1;
    }

    auto nibbledSeen = 0, sweepFailures = 0;
    for (const auto& descriptor : *list)
    {
        auto* object = descriptor.getDynamicObject();
        if (object == nullptr)
            continue;

        auto encoding = object->getProperty ("encoding");
        auto* encodingObject = encoding.getDynamicObject();
        if (encodingObject == nullptr || encodingObject->getProperty ("type").toString() != "nibbled")
            continue;

        const auto id = object->getProperty ("id").toString();
        const auto nibbles = (int) encodingObject->getProperty ("nibbles");
        auto range = object->getProperty ("range");
        auto* rangeObject = range.getDynamicObject();
        if (rangeObject == nullptr)
            continue;

        const auto low = (int) rangeObject->getProperty ("min");
        const auto high = (int) rangeObject->getProperty ("max");
        ++nibbledSeen;

        for (const auto value : { low, (low + high) / 2, high })
        {
            const auto result = engine.compileSetParameter ("mainSynth", id, value, true);
            if (! result.ok)
            {
                if (sweepFailures < 5)
                    std::cerr << "[FAIL] nibbled " << id << " = " << value << ": " << result.error << "\n";
                ++sweepFailures;
                continue;
            }

            juce::StringArray bytes;
            bytes.addTokens (result.transaction.encodedValueHex, " ", "");
            bytes.removeEmptyStrings();

            if (bytes.size() != nibbles)
            {
                if (sweepFailures < 5)
                    std::cerr << "[FAIL] nibbled " << id << " = " << value << ": expected "
                              << nibbles << " bytes, got " << bytes.size() << "\n";
                ++sweepFailures;
                continue;
            }

            for (const auto& byte : bytes)
            {
                if (byte.getHexValue32() > 0x0f)
                {
                    if (sweepFailures < 5)
                        std::cerr << "[FAIL] nibbled " << id << " = " << value
                                  << ": byte " << byte << " is not a nibble\n";
                    ++sweepFailures;
                    break;
                }
            }
        }
    }

    // A guard on the guard: if the descriptor walk stopped finding nibbled parameters, the sweep
    // above would pass by doing nothing at all.
    if (nibbledSeen < 600)
    {
        std::cerr << "[FAIL] nibbled: expected the GAIA's ~622 nibbled parameters, swept "
                  << nibbledSeen << "\n";
        ++failures;
    }
    else if (sweepFailures == 0)
    {
        std::cout << "[PASS] nibbled :: all " << nibbledSeen
                  << " nibbled parameters encode at min/mid/max, every byte <= 0x0F\n";
    }

    failures += sweepFailures;

    // Out of range must be refused rather than silently truncated: a 2-nibble field holds 0..255,
    // and 256 wrapping to 00 00 would move the wrong parameter on the instrument.
    const auto tooBig = engine.compileSetParameter ("mainSynth", "common.patchTempo", 4096, true);
    if (tooBig.ok)
    {
        std::cerr << "[FAIL] nibbled: 4096 fits in three nibbles, apparently\n";
        ++failures;
    }
    else
    {
        std::cout << "[PASS] nibbled :: a value past the field's width is refused\n";
    }

    return failures;
}

/*
 * Reading a patch back off the wire, and writing its name.
 *
 * WHAT WAS MISSING. The GAIA's block requests declared `response: {kind: 'dt1', address}` — which
 * says only "a reply will arrive at this address" and does nothing with it. The request went out,
 * the synth answered with the whole 61-byte Patch Common block, and every byte of it was dropped.
 * The profile had no dumpDefinitions at all, so there was nothing to parse it WITH. That is an
 * editor that can only write: you could change the synth but never open it on the patch already
 * loaded, and nothing on screen said which half of the panel was real.
 *
 * The name is the second half of the same story, and a worse failure than a dropped dump. Patch
 * Name was declared `type: "patchName"` — a word that appears in no branch of either engine — so it
 * fell through to the numeric path. In the JS runtime that meant a write of "GAIA TEST" compiled,
 * reported success, and sent one byte of NUL over the first character of the patch's name.
 *
 * These assertions are against the format's properties, not ours: a dump is the block's bytes in
 * address order, so a parameter's payload offset is its address delta — checked here on parameters
 * whose addresses the manual prints, and on a name that must survive a round trip through the
 * encoder and the dump reader unchanged.
 */
/**
 * buildDumpMessage — the encode direction, and the only assertion that really matters for it.
 *
 * `parseDumpMessage` has existed for a long time; `buildDump` returned an empty var, so a script
 * could read a patch out of a synth and had no way to assemble one to send back. That asymmetry is
 * what these tests close.
 *
 * The central one is a ROUND TRIP against the real GAIA profile: build a dump from semantic values,
 * parse the result with the existing decoder, and require the values to come back. Asserting on the
 * bytes instead would only prove the builder agrees with whatever it produced the day it was
 * written. Round-tripping proves it agrees with the decoder — and the decoder is what a synth's
 * reply goes through, so agreement with it is the real contract.
 */
int runDumpBuildTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] buildDump: could not load " << file.getFileName() << ": " << error << "\n";
        return 1;
    }

    auto failures = 0;
    const juce::String patchName { "ROUND TRIP" };

    auto* wanted = new juce::DynamicObject();
    wanted->setProperty ("common.patchName", patchName);
    wanted->setProperty ("common.patchLevel", 100);
    const juce::var values { wanted };

    const auto built = engine.buildDumpMessage ("common", values);
    if (! built.ok)
    {
        std::cerr << "[FAIL] buildDump: Patch Common did not build: " << built.error << "\n";
        return failures + 1;
    }

    if (built.checksumStatus != "ok")
    {
        std::cerr << "[FAIL] buildDump: checksum reported \"" << built.checksumStatus << "\"\n";
        ++failures;
    }

    // THE ROUND TRIP. If this passes, the builder and the decoder agree about framing, mapping
    // offsets, codecs and the checksum all at once — and disagreeing about any one of them is the
    // failure mode that would otherwise reach a synth.
    const auto parsed = engine.parseDumpMessage (built.hex);
    if (! parsed.ok)
    {
        std::cerr << "[FAIL] buildDump: the built message does not parse: " << parsed.error
                  << "\n         " << built.hex << "\n";
        ++failures;
    }
    else
    {
        if (parsed.dumpId != "common")
        {
            std::cerr << "[FAIL] buildDump: built message matched \"" << parsed.dumpId << "\"\n";
            ++failures;
        }
        if (parsed.checksumStatus != "ok")
        {
            std::cerr << "[FAIL] buildDump: the decoder rejected the built checksum ("
                      << parsed.checksumStatus << ")\n";
            ++failures;
        }

        auto* got = parsed.values.getDynamicObject();
        const auto valueOf = [got] (const char* id) { return got != nullptr ? got->getProperty (id) : juce::var(); };

        if (valueOf ("common.patchName").toString() != patchName)
        {
            std::cerr << "[FAIL] buildDump: name round-tripped as \"" << valueOf ("common.patchName").toString()
                      << "\", not \"" << patchName << "\"\n";
            ++failures;
        }
        if ((int) valueOf ("common.patchLevel") != 100)
        {
            std::cerr << "[FAIL] buildDump: level round-tripped as " << (int) valueOf ("common.patchLevel") << "\n";
            ++failures;
        }

        if (failures == 0)
            std::cout << "[PASS] buildDump :: a built Patch Common parses back to the values it was given\n";
    }

    // Partial coverage is the NORMAL case, not an error: a panel binds some of a dump's parameters.
    // The rest keep the definition's default bytes and are reported so a caller can tell.
    if (built.unmappedParameters.isEmpty())
    {
        std::cerr << "[FAIL] buildDump: 26 mappings, 2 values given, and nothing reported unmapped\n";
        ++failures;
    }
    else if (built.unmappedParameters.contains ("common.patchName"))
    {
        std::cerr << "[FAIL] buildDump: a parameter that WAS given is reported unmapped\n";
        ++failures;
    }
    else
    {
        std::cout << "[PASS] buildDump :: " << built.unmappedParameters.size()
                  << " unsupplied parameters reported, not silently zeroed\n";
    }

    // A value the dump does not carry is reported rather than dropped — otherwise a typo in a
    // parameter id is a dump that builds cleanly and does nothing.
    {
        auto* withJunk = new juce::DynamicObject();
        withJunk->setProperty ("common.patchLevel", 64);
        withJunk->setProperty ("common.notAThing", 1);
        const auto r = engine.buildDumpMessage ("common", juce::var (withJunk));
        if (! r.ok || ! r.unknownParameters.contains ("common.notAThing"))
        {
            std::cerr << "[FAIL] buildDump: an unknown parameter id was not reported back\n";
            ++failures;
        }
        else
            std::cout << "[PASS] buildDump :: an unknown parameter id is reported, not silently ignored\n";
    }

    // Refusals, each naming what went wrong. A dump that builds "successfully" from a bad request is
    // worse than one that fails, because the bytes reach the instrument.
    {
        const auto missing = engine.buildDumpMessage ("no-such-dump", values);
        if (missing.ok || ! missing.error.contains ("no-such-dump"))
        {
            std::cerr << "[FAIL] buildDump: an unknown dump id did not fail by name\n";
            ++failures;
        }

        auto* outOfRange = new juce::DynamicObject();
        outOfRange->setProperty ("common.patchLevel", 9999);   // range is 0-127
        const auto refused = engine.buildDumpMessage ("common", juce::var (outOfRange));
        if (refused.ok || ! refused.error.contains ("common.patchLevel"))
        {
            std::cerr << "[FAIL] buildDump: an out-of-range value still produced a message\n";
            ++failures;
        }
        else
            std::cout << "[PASS] buildDump :: unknown dumps and out-of-range values are refused by name\n";

        // WHAT IS *NOT* REFUSED, recorded because it surprised the author of this test. A
        // non-numeric string is COERCED, not rejected: JUCE's var gives 0.0 for it, which is finite
        // and inside 0-127, so validateAndEncodeValue accepts it. That is the shared encoder every
        // knob move already goes through, where the value cannot be a string — buildDump is the
        // first caller that can hand it one. Changing the encoder would change the knob path too,
        // so the behaviour is pinned here rather than quietly altered.
        auto* coerced = new juce::DynamicObject();
        coerced->setProperty ("common.patchLevel", "not a number");
        const auto accepted = engine.buildDumpMessage ("common", juce::var (coerced));
        if (! accepted.ok)
        {
            std::cerr << "[FAIL] buildDump: a coercible value should build (this pins existing behaviour)\n";
            ++failures;
        }
    }

    // Building by NAME as well as by id — a script author reaches for whichever the DPD shows them.
    {
        const auto byName = engine.buildDumpMessage (built.dumpName, values);
        if (built.dumpName.isNotEmpty() && (! byName.ok || byName.hex != built.hex))
        {
            std::cerr << "[FAIL] buildDump: building by name did not match building by id\n";
            ++failures;
        }
    }

    // Determinism. The same values must produce the same bytes, or a re-send is a different message.
    {
        const auto again = engine.buildDumpMessage ("common", values);
        if (again.hex != built.hex)
        {
            std::cerr << "[FAIL] buildDump: two builds of the same values differ\n";
            ++failures;
        }
    }

    // dumpDefinitionIds — added for Total Recall S3, which has to capture a whole patch into the
    // DAW session with no script naming a dump first: the plugin asks the profile what patches
    // exist. Two things are asserted, and the second is the one that matters on restore.
    {
        const auto ids = engine.dumpDefinitionIds();
        if (! ids.contains ("common"))
        {
            std::cerr << "[FAIL] dumpDefinitionIds: the profile's own dump is not listed\n";
            ++failures;
        }

        // Every id it reports must build, or S3 stores a patch with a hole in it and says nothing.
        for (const auto& id : ids)
            if (! engine.buildDumpMessage (id, values).ok)
            {
                std::cerr << "[FAIL] dumpDefinitionIds: listed \"" << id << "\" which does not build\n";
                ++failures;
            }

        // DECLARATION ORDER, not sorted and not hash order. A device with a common block and
        // per-part blocks wants the common block sent first on restore, and the profile author is
        // the only one who knows which is which — so the list has to preserve what they wrote.
        const auto document = juce::JSON::parse (file.loadFileAsString());
        auto* object = document.getDynamicObject();
        auto* declared = object != nullptr ? object->getProperty ("dumpDefinitions").getArray() : nullptr;
        if (declared != nullptr)
        {
            juce::StringArray expected;
            for (const auto& entry : *declared)
                if (auto* o = entry.getDynamicObject())
                    if (o->getProperty ("id").toString().isNotEmpty())
                        expected.add (o->getProperty ("id").toString());
            if (expected != ids)
            {
                std::cerr << "[FAIL] dumpDefinitionIds: order does not match the profile's own\n";
                ++failures;
            }
        }
    }

    return failures;
}

/** The parts of a profile document the dump-policy tests read directly. */
struct DumpTestProfile
{
    explicit DumpTestProfile (const juce::File& file)
        : document (juce::JSON::parse (file.loadFileAsString()))
    {
        if (auto* list = document.getProperty ("parameters", {}).getArray())
            for (const auto& p : *list)
                parameters[p.getProperty ("id", {}).toString()] = p;
    }

    /** The distinct parameters a dump's mappings cover. */
    juce::StringArray mappedIds (const juce::String& dumpId) const
    {
        juce::StringArray ids;
        if (auto* dumps = document.getProperty ("dumpDefinitions", {}).getArray())
            for (const auto& d : *dumps)
                if (d.getProperty ("id", {}).toString() == dumpId)
                    if (auto* mappings = d.getProperty ("mappings", {}).getArray())
                        for (const auto& m : *mappings)
                            ids.addIfNotAlreadyThere (m.getProperty ("parameter", {}).toString());
        return ids;
    }

    // A legal value that is NOT zero wherever the parameter allows it, so a byte the panel supplied
    // cannot be mistaken for a byte the builder defaulted. A double, as the APVTS hands it over.
    double nonZeroValue (const juce::String& id) const
    {
        const auto it = parameters.find (id);
        if (it == parameters.end()) return 0.0;
        const auto& p = it->second;
        if (auto* choices = p.getProperty ("choices", {}).getArray())
            return choices->isEmpty() ? 0.0 : (double) choices->getLast().getProperty ("value", 0);
        return (double) p.getProperty ("range", {}).getProperty ("max", 0);
    }

    juce::var document;
    std::map<juce::String, juce::var> parameters;
};

/**
 * The exported plugin's dump capture and restore policy — release audit 2026-10-04, C-11.
 *
 * WHAT WENT WRONG. The plugin saved every dump the profile declares, built from the APVTS alone, and
 * kept any that built. The APVTS holds only the panel's exported parameters, and buildDumpMessage
 * fills the rest with the definition's default byte — so a GAIA session stored the System block with
 * all of it at 0 (Master Level 0: a silent synth) and "Send saved sound" sent it, before the values.
 *
 * WHAT IS ASSERTED, with the values shaped exactly as the plugin's `boundParameterValues` shapes
 * them (doubles keyed by device parameter id): a panel that exports every Arpeggio Common control
 * and three System ones gets Arpeggio Common captured and sent, and nothing at all for System, the
 * arpeggio patterns or anything else it does not cover. And a session saved by an older export —
 * one that DOES carry a zero-filled System block — does not get it sent either.
 */
int runDumpCapturePolicyTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] dump capture: could not load " << file.getFileName() << ": " << error << "\n";
        return 1;
    }

    const DumpTestProfile profile (file);
    const auto mappedIds = [&profile] (const juce::String& dumpId) { return profile.mappedIds (dumpId); };
    const auto nonZeroValue = [&profile] (const juce::String& id) { return profile.nonZeroValue (id); };

    auto failures = 0;
    const auto fail = [&failures] (const juce::String& what)
    {
        std::cerr << "[FAIL] dump capture: " << what << "\n";
        ++failures;
    };

    const auto arpIds = mappedIds ("arpeggioCommon");
    const auto systemIds = mappedIds ("system");
    if (arpIds.isEmpty() || systemIds.size() < 4)
    {
        std::cerr << "[FAIL] dump capture: the GAIA profile no longer has the dumps this test is about\n";
        return 1;
    }

    auto* bound = new juce::DynamicObject();
    for (const auto& id : arpIds)
        bound->setProperty (id, nonZeroValue (id));
    for (int i = 0; i < 3; ++i)                       // part of System, as a real panel might export
        bound->setProperty (systemIds[i], nonZeroValue (systemIds[i]));
    const juce::var values { bound };

    // --- Capture -----------------------------------------------------------------------------------
    const auto capture = ce::captureCompleteDumps (engine, values);
    auto* captured = capture.captured.getDynamicObject();
    const auto fullArp = engine.buildDumpMessage ("arpeggioCommon", values);

    if (captured == nullptr || fullArp.hex.isEmpty()
        || captured->getProperty ("arpeggioCommon").toString() != fullArp.hex)
        fail ("a dump the panel binds completely was not captured as built");

    if (captured != nullptr && captured->hasProperty ("system"))
        fail ("System was captured with 3 of its " + juce::String (systemIds.size())
              + " parameters supplied — the rest would be sent as 0");

    if (captured != nullptr && captured->getProperties().size() != 1)
    {
        juce::StringArray names;
        for (const auto& property : captured->getProperties())
            names.add (property.name.toString());
        fail ("expected exactly one dump captured, got " + juce::String (names.size()) + ": "
              + names.joinIntoString (", "));
    }

    bool systemReported = false;
    for (const auto& skipped : capture.skipped)
        if (skipped.id == "system")
            systemReported = skipped.missingParameters == systemIds.size() - 3;
    if (! systemReported)
        fail ("System was not reported as skipped with " + juce::String (systemIds.size() - 3)
              + " parameters missing");

    if (failures == 0)
        std::cout << "[PASS] dump capture :: only a dump the panel covers completely is saved ("
                  << capture.capturedCount << " captured, " << capture.skipped.size()
                  << " partial ones skipped and reported)\n";

    // --- Restore -----------------------------------------------------------------------------------
    // What an older export stored: the partial System block, zero-filled, beside the good one, and
    // a dump the profile has never heard of.
    const auto failuresBeforeRestore = failures;
    const auto zeroFilledSystem = engine.buildDumpMessage ("system", values);
    if (! zeroFilledSystem.ok || zeroFilledSystem.unmappedParameters.isEmpty())
        fail ("could not build the zero-filled System block an older session would carry");

    auto* stored = new juce::DynamicObject();
    stored->setProperty ("system", zeroFilledSystem.hex);
    stored->setProperty ("arpeggioCommon", fullArp.hex);
    stored->setProperty ("notInThisProfile", "F0 7D 00 F7");
    const juce::var storedDumps { stored };

    const auto plan = ce::planRestoredDumps (&engine, storedDumps, values);
    if (plan.send.size() != 1 || plan.send.front().id != "arpeggioCommon")
    {
        juce::StringArray names;
        for (const auto& dump : plan.send)
            names.add (dump.id);
        fail ("restore should send Arpeggio Common alone, would send: " + names.joinIntoString (", "));
    }
    else if (plan.send.front().bytes != ce::dumpBytesFromHex (fullArp.hex) || plan.send.front().bytes.isEmpty())
    {
        fail ("the stored Arpeggio Common bytes were not sent verbatim");
    }

    juce::StringArray dropped;
    for (const auto& d : plan.dropped)
        dropped.add (d.id);
    if (! dropped.contains ("system") || ! dropped.contains ("notInThisProfile"))
        fail ("a stored partial or unknown dump was not dropped by name (dropped: "
              + dropped.joinIntoString (", ") + ")");

    // No profile to check against: send nothing rather than whatever the project file holds.
    if (! ce::planRestoredDumps (nullptr, storedDumps, values).send.empty())
        fail ("with no profile, stored dumps were sent unchecked");

    if (failures == failuresBeforeRestore)
        std::cout << "[PASS] dump restore :: a stored zero-filled System block is dropped, a complete dump is sent verbatim\n";

    return failures;
}

/**
 * Total Recall never writes the synth's stored memory, even with a complete dump (C-11 follow-up).
 *
 * The AN1x `userPattern` bulk carries exactly the 70 parameters of the edit-buffer `stepSeq`, so a
 * panel that exports the whole step sequencer makes it COMPLETE. Completeness alone would capture it,
 * and the restore would write User Pattern 1, because the dump is addressed by `$slot` (default 0).
 * The rule is about how the profile declares the dump (a preset-slot variable in its address or in
 * the request that fetches it), not about its id. The GAIA, whose dumps are addressed by `$deviceId`
 * only, must lose nothing to it.
 */
int runDumpMemorySlotTests (const juce::File& an1xFile, const juce::File& gaiaFile)
{
    auto failures = 0;
    const auto fail = [&failures] (const juce::String& what)
    {
        std::cerr << "[FAIL] dump memory: " << what << "\n";
        ++failures;
    };

    ceditor::device::DeviceProfileEngine an1x;
    juce::String error;
    if (! an1x.loadFromFile (an1xFile, error))
    {
        std::cerr << "[FAIL] dump memory: could not load " << an1xFile.getFileName() << ": " << error << "\n";
        return 1;
    }
    const DumpTestProfile profile (an1xFile);

    // Classification, from the profile's own declarations.
    for (const auto& id : an1x.dumpDefinitionIds())
    {
        const bool memory = ! ce::memorySlotVariables (an1x, id).isEmpty();
        const bool expected = id == "userVoice" || id == "userPattern";
        if (memory != expected)
            fail ("\"" + id + "\" classified as " + (memory ? "stored memory" : "edit buffer"));
    }
    if (! ce::memorySlotVariables (an1x, "userPattern").contains ("slot"))
        fail ("userPattern's $slot address was not found");

    // A panel exporting the whole step sequencer: every parameter of stepSeq, hence of userPattern.
    auto* bound = new juce::DynamicObject();
    for (const auto& id : profile.mappedIds ("stepSeq"))
        bound->setProperty (id, profile.nonZeroValue (id));
    const juce::var values { bound };

    const auto userPattern = an1x.buildDumpMessage ("userPattern", values);
    const auto stepSeq = an1x.buildDumpMessage ("stepSeq", values);
    if (profile.mappedIds ("stepSeq").size() != 70 || ! ce::isCompleteDump (userPattern) || ! ce::isCompleteDump (stepSeq))
    {
        std::cerr << "[FAIL] dump memory: precondition: 70 step-sequencer values should make both stepSeq and "
                     "userPattern complete (" << userPattern.error << stepSeq.error << ")\n";
        return failures + 1;
    }

    const auto capture = ce::captureCompleteDumps (an1x, values);
    auto* captured = capture.captured.getDynamicObject();
    if (captured == nullptr || captured->getProperty ("stepSeq").toString() != stepSeq.hex)
        fail ("the complete edit-buffer stepSeq dump was not captured");
    if (captured != nullptr && captured->hasProperty ("userPattern"))
        fail ("userPattern was captured: restoring it writes User Pattern " + juce::String (1));
    if (captured != nullptr && captured->hasProperty ("userVoice"))
        fail ("userVoice was captured");

    bool reported = false;
    for (const auto& skipped : capture.skipped)
        if (skipped.id == "userPattern")
            reported = skipped.reason.contains ("$slot");
    if (! reported)
        fail ("userPattern was not reported as skipped for its $slot address");

    // A stored copy, as a session from before this rule would hold it, is not sent.
    auto* stored = new juce::DynamicObject();
    stored->setProperty ("stepSeq", stepSeq.hex);
    stored->setProperty ("userPattern", userPattern.hex);
    const auto plan = ce::planRestoredDumps (&an1x, juce::var (stored), values);
    juce::StringArray sent;
    for (const auto& dump : plan.send)
        sent.add (dump.id);
    if (sent != juce::StringArray { "stepSeq" })
        fail ("restore should send stepSeq alone, would send: " + sent.joinIntoString (", "));
    bool dropped = false;
    for (const auto& d : plan.dropped)
        dropped = dropped || d.id == "userPattern";
    if (! dropped)
        fail ("a stored userPattern was not dropped by name");

    // The GAIA addresses nothing by slot: no dump of it may be lost to this rule.
    ceditor::device::DeviceProfileEngine gaia;
    if (! gaia.loadFromFile (gaiaFile, error))
        return failures + 1;
    for (const auto& id : gaia.dumpDefinitionIds())
        if (! ce::memorySlotVariables (gaia, id).isEmpty())
            fail ("GAIA \"" + id + "\" classified as stored memory");

    if (failures == 0)
        std::cout << "[PASS] dump memory :: a complete AN1x userPattern ($slot) is neither captured nor restored; "
                     "stepSeq and the GAIA's dumps are unaffected\n";
    return failures;
}

int runPatchDumpTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] dump: could not load " << file.getFileName() << ": " << error << "\n";
        return 1;
    }

    auto failures = 0;

    // Build a Patch Common dump the way the synth would: DT1 at 10 00 00 00, 61 bytes, Roland
    // checksum over address and data. The name goes in at offset 0 and Patch Level at offset 12.
    juce::Array<int> body { 0x10, 0x00, 0x00, 0x00 };
    juce::Array<int> data;
    for (auto i = 0; i < 61; ++i)
        data.add (0);

    const juce::String name { "BASS MONSTER" };
    for (auto i = 0; i < name.length(); ++i)
        data.set (i, (int) name[i]);
    data.set (12, 100);   // common.patchLevel
    data.set (13, 120);   // common.patchTempo is nibbled — this is its first nibble

    for (auto byte : data)
        body.add (byte);

    auto sum = 0;
    for (auto byte : body)
        sum += byte;

    juce::Array<int> message { 0xf0, 0x41, 0x10, 0x00, 0x00, 0x41, 0x12 };
    message.addArray (body);
    message.add ((128 - (sum % 128)) % 128);
    message.add (0xf7);

    const auto parsed = engine.parseDumpMessage (ceditor::device::DeviceProfileEngine::bytesToHex (message));
    if (! parsed.ok)
    {
        std::cerr << "[FAIL] dump: Patch Common did not parse: " << parsed.error << "\n";
        ++failures;
    }
    else
    {
        if (parsed.dumpId != "common")
        {
            std::cerr << "[FAIL] dump: matched \"" << parsed.dumpId << "\", not the Patch Common definition\n";
            ++failures;
        }
        if (parsed.checksumStatus != "ok")
        {
            std::cerr << "[FAIL] dump: checksum reported \"" << parsed.checksumStatus << "\"\n";
            ++failures;
        }

        auto* values = parsed.values.getDynamicObject();
        const auto valueOf = [values] (const char* id)
        {
            return values != nullptr ? values->getProperty (id) : juce::var();
        };

        // The name, which is the assertion the old `type: "patchName"` could never have passed.
        if (valueOf ("common.patchName").toString() != name)
        {
            std::cerr << "[FAIL] dump: patch name read back as \""
                      << valueOf ("common.patchName").toString() << "\", not \"" << name << "\"\n";
            ++failures;
        }
        if ((int) valueOf ("common.patchLevel") != 100)
        {
            std::cerr << "[FAIL] dump: Patch Level read back as " << (int) valueOf ("common.patchLevel")
                      << " — a mapping offset is wrong\n";
            ++failures;
        }

        if (failures == 0)
            std::cout << "[PASS] dump :: Patch Common parses, name and level land at their addresses\n";
    }

    // A Tone 2 reply must not be applied as Tone 1's. The three tone blocks are the same table at a
    // 0x0100 stride, so the ONLY thing telling them apart is the address — and it is in the matcher
    // rather than a field read afterwards precisely so this cannot go wrong silently.
    {
        juce::Array<int> toneBody { 0x10, 0x00, 0x02, 0x00 };
        for (auto i = 0; i < 62; ++i)
            toneBody.add (0);

        auto toneSum = 0;
        for (auto byte : toneBody)
            toneSum += byte;

        juce::Array<int> toneMessage { 0xf0, 0x41, 0x10, 0x00, 0x00, 0x41, 0x12 };
        toneMessage.addArray (toneBody);
        toneMessage.add ((128 - (toneSum % 128)) % 128);
        toneMessage.add (0xf7);

        const auto tone = engine.parseDumpMessage (ceditor::device::DeviceProfileEngine::bytesToHex (toneMessage));
        if (! tone.ok || tone.dumpId != "tone2")
        {
            std::cerr << "[FAIL] dump: a Tone 2 block matched \"" << tone.dumpId << "\"\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] dump :: the tone blocks are told apart by address, not by order\n";
        }
    }

    // Every request that names a dump must name one that exists. A request for a dump the profile
    // does not define makes loadFromJson reject the WHOLE profile — silently, taking all 793
    // parameters with it — so this is a check on the profile, not on the engine.
    {
        const auto document = juce::JSON::parse (file.loadFileAsString());
        auto* object = document.getDynamicObject();
        auto* requests = object != nullptr ? object->getProperty ("requests").getArray() : nullptr;
        auto* dumps = object != nullptr ? object->getProperty ("dumpDefinitions").getArray() : nullptr;

        juce::StringArray declared;
        if (dumps != nullptr)
            for (const auto& dump : *dumps)
                if (auto* d = dump.getDynamicObject())
                    declared.add (d->getProperty ("id").toString());

        auto dangling = 0, wired = 0;
        if (requests != nullptr)
            for (const auto& request : *requests)
            {
                auto* r = request.getDynamicObject();
                auto* response = r != nullptr ? r->getProperty ("response").getDynamicObject() : nullptr;
                if (response == nullptr || response->getProperty ("kind").toString() != "bulkDump")
                    continue;
                ++wired;
                if (! declared.contains (response->getProperty ("dump").toString()))
                {
                    std::cerr << "[FAIL] dump: request \"" << r->getProperty ("id").toString()
                              << "\" asks for a dump that is not defined\n";
                    ++dangling;
                }
            }

        if (wired < 25)
        {
            std::cerr << "[FAIL] dump: only " << wired << " requests parse their reply — the rest still drop it\n";
            ++failures;
        }
        else if (dangling == 0)
        {
            std::cout << "[PASS] dump :: all " << wired << " block requests parse the reply they ask for\n";
        }
        failures += dangling;
    }

    // Writing the name. The round trip is the point: what the encoder produces is what the dump
    // reader must give back, or the field on screen and the field in the synth drift by a save.
    {
        const auto written = engine.compileSetParameter ("mainSynth", "common.patchName", juce::var (name), true);
        if (! written.ok)
        {
            std::cerr << "[FAIL] dump: the patch name could not be written: " << written.error << "\n";
            ++failures;
        }
        else
        {
            juce::StringArray bytes;
            bytes.addTokens (written.transaction.encodedValueHex, " ", "");
            bytes.removeEmptyStrings();
            if (bytes.size() != 12)
            {
                std::cerr << "[FAIL] dump: the patch name encoded to " << bytes.size()
                          << " bytes, not 12\n";
                ++failures;
            }
            else
            {
                std::cout << "[PASS] dump :: a 12-character patch name writes as 12 ASCII bytes\n";
            }
        }

        // Refused, not truncated. Cutting "BASS MONSTER 2" down to fit would rename the patch on
        // the instrument to something nobody typed.
        const auto tooLong = engine.compileSetParameter ("mainSynth", "common.patchName",
                                                         juce::var ("THIRTEEN CHARS"), true);
        if (tooLong.ok)
        {
            std::cerr << "[FAIL] dump: a 14-character patch name was accepted into a 12-byte field\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] dump :: an over-long patch name is refused rather than cut\n";
        }
    }

    return failures;
}

/*
 * Preset recall, in the engine.
 *
 * The engine knew nothing about presets: it passed `presetBrowser` through and stopped. So the
 * exported plugin could not recall one with the window closed, and a script had no way to ask —
 * both of which the editor could do, through localCompilePresetRecall in the JS fallback engine.
 * A capability that exists in the preview and not in the export is the shape of bug this whole
 * two-engine arrangement exists to prevent, so the two now build the same bytes and this says so
 * against the real profiles.
 */
int runPresetRecallTests (const juce::File& root)
{
    auto failures = 0;
    const auto hexOf = [] (const ceditor::device::CompileResult& result)
    {
        juce::StringArray parts;
        for (const auto& message : result.transaction.messages)
            parts.add (ceditor::device::DeviceProfileEngine::bytesToHex (message.bytes));
        return parts.joinIntoString (" | ");
    };

    // The AN1x: one factory bank of 128, recall kind "pc", programBase 0. Slot 47 is Program
    // Change 47 on channel 1 — C0 2F.
    {
        ceditor::device::DeviceProfileEngine engine;
        juce::String error;
        if (! engine.loadFromFile (root.getChildFile ("yamaha-an1x-dpd.ceditor-device.json"), error))
        {
            std::cerr << "[FAIL] preset recall: AN1x load: " << error << "\n";
            return 1;
        }

        const auto result = engine.compilePresetRecall ("mainSynth", 47);
        if (! result.ok || hexOf (result) != "C0 2F")
        {
            std::cerr << "[FAIL] preset recall AN1x slot 47: expected C0 2F, got "
                      << (result.ok ? hexOf (result) : result.error) << "\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] preset recall :: AN1x slot 47 -> C0 2F (kind pc)\n";
        }

        // The slot's own name comes back with it, so a caller can log what it recalled rather than
        // a number.
        const auto info = engine.presetSlotInfo (0);
        if (! info.inBank || info.catalogName != "Relaxx" || info.category != "Co" || info.program != 0)
        {
            std::cerr << "[FAIL] preset recall AN1x slot 0 info: "
                      << info.catalogName << " / " << info.category << " / " << info.program << "\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] preset recall :: slot info carries the bank's name and category\n";
        }

        // Past the last slot is refused rather than silently clamped to 127.
        if (engine.compilePresetRecall ("mainSynth", 512).ok)
        {
            std::cerr << "[FAIL] preset recall: slot 512 was accepted on a 128-slot machine\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] preset recall :: a slot outside every bank is refused\n";
        }
    }

    // bankPc and sysex, against profiles written for them: CC 0 / CC 32 / PC, and a template with
    // the recall's own variables. Built here rather than shipped, because no library profile uses
    // either kind yet and a test that cannot run is not a test.
    {
        const char* bankPcJson = R"JSON({
          "schemaVersion": 1, "id": "probe-bankpc", "name": "Probe", "manufacturer": "Probe",
          "variables": { "channel": 1, "deviceId": 16 },
          "parameters": [{
            "id": "probe.value", "name": "Probe", "messageRecipe": "cc1", "type": "integer",
            "range": { "min": 0, "max": 127 }, "encoding": { "type": "u7" },
            "access": { "canWrite": true }
          }],
          "messageRecipes": [{ "id": "cc1", "kind": "cc", "channel": "$channel", "controller": 1, "value": "$encodedValue" }],
          "tests": [{ "name": "Probe 64", "parameter": "probe.value", "value": 64, "expectedHex": "B0 01 40" }],
          "presets": {
            "recall": { "kind": "bankPc", "channel": 1 },
            "banks": [
              { "id": "a", "role": "factory", "startSlot": 0, "slotCount": 4, "programBase": 0, "bankMsb": 0, "bankLsb": 0 },
              { "id": "b", "role": "factory", "startSlot": 4, "slotCount": 4, "programBase": 0, "bankMsb": 0, "bankLsb": 1 }
            ]
          }
        })JSON";

        ceditor::device::DeviceProfileEngine engine;
        juce::String error;
        if (! engine.loadFromJson (bankPcJson, error))
        {
            std::cerr << "[FAIL] preset recall: bankPc profile load: " << error << "\n";
            for (const auto& m : engine.getValidationMessages())
                std::cerr << "    " << m.path << ": " << m.message << "\n";
            return failures + 1;
        }

        // Slot 5 is the second bank's second slot: bank LSB 1, program 1.
        const auto result = engine.compilePresetRecall ("mainSynth", 5);
        if (! result.ok || hexOf (result) != "B0 00 00 | B0 20 01 | C0 01")
        {
            std::cerr << "[FAIL] preset recall bankPc slot 5: got "
                      << (result.ok ? hexOf (result) : result.error) << "\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] preset recall :: bankPc sends CC 0, CC 32, then the program\n";
        }
    }

    {
        // A SysEx recall whose template uses $slot and a Roland checksum.
        const char* sysexJson = R"JSON({
          "schemaVersion": 1, "id": "probe-sysex", "name": "Probe", "manufacturer": "Probe",
          "variables": { "channel": 1, "deviceId": 16 },
          "parameters": [{
            "id": "probe.value", "name": "Probe", "messageRecipe": "cc1", "type": "integer",
            "range": { "min": 0, "max": 127 }, "encoding": { "type": "u7" },
            "access": { "canWrite": true }
          }],
          "messageRecipes": [{ "id": "cc1", "kind": "cc", "channel": "$channel", "controller": 1, "value": "$encodedValue" }],
          "tests": [{ "name": "Probe 64", "parameter": "probe.value", "value": 64, "expectedHex": "B0 01 40" }],
          "presets": {
            "recall": {
              "kind": "sysex",
              "template": ["F0", "41", "$deviceId", "42", "12", "$slot", "$checksum", "F7"],
              "checksum": { "type": "roland-7bit" }
            },
            "banks": [{ "id": "a", "role": "factory", "startSlot": 0, "slotCount": 8, "programBase": 0 }]
          }
        })JSON";

        ceditor::device::DeviceProfileEngine engine;
        juce::String error;
        if (! engine.loadFromJson (sysexJson, error))
        {
            std::cerr << "[FAIL] preset recall: sysex profile load: " << error << "\n";
            return failures + 1;
        }

        const auto result = engine.compilePresetRecall ("mainSynth", 3);
        // Covered span is everything after F0 41 (header) up to $checksum: 10 42 12 03 = 0x67,
        // so the Roland checksum is (128 - 0x67 % 128) & 0x7f = 0x19.
        if (! result.ok || hexOf (result) != "F0 41 10 42 12 03 19 F7")
        {
            std::cerr << "[FAIL] preset recall sysex slot 3: got "
                      << (result.ok ? hexOf (result) : result.error) << "\n";
            ++failures;
        }
        else
        {
            std::cout << "[PASS] preset recall :: a SysEx template resolves $slot and its checksum\n";
        }
    }

    return failures;
}

int runProfileTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;

    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] " << file.getFileName() << ": " << error << "\n";
        for (const auto& message : engine.getValidationMessages())
            std::cerr << "  " << message.path << ": " << message.message << "\n";
        return 1;
    }

    auto results = engine.runTests();
    if (results.isEmpty())
    {
        std::cerr << "[FAIL] " << file.getFileName() << ": no tests found\n";
        return 1;
    }

    auto failures = 0;
    for (const auto& result : results)
    {
        if (result.passed)
        {
            std::cout << "[PASS] " << engine.getProfileId() << " :: " << result.name << "\n";
            continue;
        }

        ++failures;
        std::cerr << "[FAIL] " << engine.getProfileId() << " :: " << result.name << "\n"
                  << "  " << result.error << "\n"
                  << "  expected: " << result.expectedHex << "\n"
                  << "  actual:   " << result.actualHex << "\n";
    }

    return failures;
}

int runPolicyTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
        return 1;

    auto result = engine.compileSetParameter ("mainSynth", "filter.cutoff", 64, true);
    if (! result.ok)
    {
        std::cerr << "[FAIL] policy test compile: " << result.error << "\n";
        return 1;
    }

    if (result.transaction.sendPolicyMode != "continuous"
        || ! result.transaction.coalesce
        || result.transaction.minIntervalMs != 20
        || ! result.transaction.realtimeSafe)
    {
        std::cerr << "[FAIL] policy metadata was not preserved on compiled transaction\n";
        return 1;
    }

    std::cout << "[PASS] test-cc-synth :: Send policy metadata\n";
    return 0;
}

int runNrpnTimingTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
        return 1;

    auto result = engine.compileSetParameter ("mainSynth", "filter.cutoff", 64, true);
    if (! result.ok)
    {
        std::cerr << "[FAIL] NRPN timing test compile: " << result.error << "\n";
        return 1;
    }

    const auto& messages = result.transaction.messages;
    if (messages.size() != 3
        || messages[0].delayAfterMs != 5
        || messages[1].delayAfterMs != 5
        || messages[2].delayAfterMs != 0)
    {
        std::cerr << "[FAIL] NRPN timing metadata expected delays 5, 5, 0\n";
        return 1;
    }

    std::cout << "[PASS] test-nrpn-synth :: Message delay metadata\n";
    return 0;
}

// A 14-bit parameter kept least significant byte first. The encoder wrote only MSB first, so such a
// parameter could be read and never written. Its own bytes are LSB first; an NRPN's data entry is
// still the MSB on CC 6 and the LSB on CC 38, so it sends exactly what the MSB-first one sends.
int runLsbFirstEncodingTests (const juce::File& nrpnFile)
{
    juce::String error;
    ceditor::device::DeviceProfileEngine msbFirst;
    if (! msbFirst.loadFromFile (nrpnFile, error))
    {
        std::cerr << "[FAIL] LSB-first: could not load " << nrpnFile.getFileName() << ": " << error << "\n";
        return 1;
    }
    auto profile = juce::JSON::parse (nrpnFile.loadFileAsString());
    if (auto* parameters = profile.getProperty ("parameters", {}).getArray())
        for (const auto& parameter : *parameters)
            if (parameter.getProperty ("id", {}).toString() == "osc.pitch")
                if (auto* encoding = parameter.getProperty ("encoding", {}).getDynamicObject())
                    encoding->setProperty ("type", "u14-lsb-msb");
    ceditor::device::DeviceProfileEngine lsbFirst;
    if (! lsbFirst.loadFromJson (juce::JSON::toString (profile), error))
    {
        std::cerr << "[FAIL] LSB-first: the edited profile did not load: " << error << "\n";
        return 1;
    }

    const auto a = msbFirst.compileSetParameter ("mainSynth", "osc.pitch", 12345, true);
    const auto b = lsbFirst.compileSetParameter ("mainSynth", "osc.pitch", 12345, true);
    if (! a.ok || ! b.ok)
    {
        std::cerr << "[FAIL] LSB-first: osc.pitch 12345 did not compile: " << (a.ok ? b.error : a.error) << "\n";
        return 1;
    }
    if (b.transaction.encodedValueHex != "39 60")
    {
        std::cerr << "[FAIL] LSB-first: 12345 should encode as 39 60, got " << b.transaction.encodedValueHex << "\n";
        return 1;
    }
    auto same = a.transaction.messages.size() == b.transaction.messages.size();
    for (int i = 0; same && i < a.transaction.messages.size(); ++i)
        same = a.transaction.messages[i].bytes == b.transaction.messages[i].bytes;
    if (! same)
    {
        std::cerr << "[FAIL] LSB-first: the NRPN should send the MSB on CC 6 and the LSB on CC 38, as MSB-first does\n";
        return 1;
    }

    std::cout << "[PASS] test-nrpn-synth :: u14-lsb-msb encodes LSB first, and an NRPN still sends MSB on CC 6\n";
    return 0;
}

int runDumpShapeAndCodecTests (const juce::File& file)
{
    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromFile (file, error))
    {
        std::cerr << "[FAIL] dump shape test profile load: " << error << "\n";
        return 1;
    }

    auto partial = engine.parseDumpMessage ("F0 7D 10 03 03 50 61 F7");
    if (partial.ok
        || partial.matchStatus != "partial"
        || partial.expectedBytes != 13
        || partial.receivedBytes != 8
        || partial.partialFailures.isVoid())
    {
        std::cerr << "[FAIL] dump shape partial metadata was not reported\n";
        return 1;
    }

    auto checksum = engine.parseDumpMessage ("F0 7D 10 01 40 02 44 F7");
    if (checksum.ok || checksum.matchStatus != "checksumFailed" || checksum.checksumStatus != "error")
    {
        std::cerr << "[FAIL] dump shape checksum failure was not classified\n";
        return 1;
    }

    auto packedName = engine.parseDumpMessage ("F0 7D 10 04 05 00 06 01 06 04 F7");
    auto* packedValues = packedName.values.getDynamicObject();
    if (! packedName.ok
        || packedName.matchStatus != "ok"
        || ! packedName.complete
        || packedValues == nullptr
        || packedValues->getProperty ("preset.packedName").toString() != "Pad")
    {
        std::cerr << "[FAIL] dump shape packed name codec did not decode Pad\n";
        return 1;
    }

    auto unsupported = engine.parseDumpMessage ("F0 7D 10 05 41 42 F7");
    if (unsupported.ok || unsupported.matchStatus != "unsupportedCodec")
    {
        std::cerr << "[FAIL] dump shape unsupported codec was not classified\n";
        return 1;
    }

    // Whole-payload 8->7 block unpack (universal Korg case): wire 20 64 48 -> unpacked [100, 200].
    // depth=200 (>127) proves the high bit rode in the packing MSB byte and survived the round trip.
    auto packed = engine.parseDumpMessage ("F0 7D 10 08 20 64 48 F7");
    auto* packedPayloadValues = packed.values.getDynamicObject();
    if (! packed.ok
        || packed.matchStatus != "ok"
        || ! packed.complete
        || packedPayloadValues == nullptr
        || (int) packedPayloadValues->getProperty ("filter.cutoff") != 100
        || (int) packedPayloadValues->getProperty ("mod.depth") != 200)
    {
        std::cerr << "[FAIL] dump shape packed payload (8->7) did not unpack to cutoff=100 depth=200\n";
        return 1;
    }

    // XOR dump checksum verifies + decodes (0x6F = 09 ^ 64 ^ 02).
    auto xorDump = engine.parseDumpMessage ("F0 7D 10 09 64 02 6F F7");
    auto* xorValues = xorDump.values.getDynamicObject();
    if (! xorDump.ok
        || xorDump.matchStatus != "ok"
        || xorDump.checksumStatus != "ok"
        || xorValues == nullptr
        || (int) xorValues->getProperty ("filter.cutoff") != 100
        || xorValues->getProperty ("osc.waveform").toString() != "triangle")
    {
        std::cerr << "[FAIL] dump shape XOR checksum dump did not verify + decode\n";
        return 1;
    }

    // A wrong XOR checksum byte (0x6E) must be rejected, not silently accepted.
    auto xorBad = engine.parseDumpMessage ("F0 7D 10 09 64 02 6E F7");
    if (xorBad.ok || xorBad.matchStatus != "checksumFailed" || xorBad.checksumStatus != "error")
    {
        std::cerr << "[FAIL] dump shape XOR checksum did not reject a bad checksum\n";
        return 1;
    }

    // Signed 7-bit (s7) dump field: wire byte 0x36 (54) with bias 64 -> -10 (a real negative value).
    auto signedDump = engine.parseDumpMessage ("F0 7D 10 0A 36 F7");
    auto* signedValues = signedDump.values.getDynamicObject();
    if (! signedDump.ok
        || signedDump.matchStatus != "ok"
        || signedValues == nullptr
        || (int) signedValues->getProperty ("lfo.pan") != -10)
    {
        std::cerr << "[FAIL] dump shape s7 dump field did not decode to the signed value -10\n";
        return 1;
    }

    // ...and written: the value plus the bias, the reverse of the decode above. The encoder had no s7
    // branch, so every write of lfo.pan, as a message or in a dump, was refused as
    // "Unsupported numeric encoder: s7".
    struct SignedCase { int value; const char* hex; };
    for (const auto& c : { SignedCase { -64, "00" }, SignedCase { -10, "36" }, SignedCase { 0, "40" }, SignedCase { 63, "7F" } })
    {
        const auto set = engine.compileSetParameter ("mainSynth", "lfo.pan", c.value, true);
        if (! set.ok || set.transaction.encodedValueHex != c.hex)
        {
            std::cerr << "[FAIL] dump shape s7 write: lfo.pan " << c.value << " should encode as " << c.hex
                      << ", got " << (set.ok ? set.transaction.encodedValueHex : "!" + set.error) << "\n";
            return 1;
        }
    }
    auto* signedWanted = new juce::DynamicObject();
    signedWanted->setProperty ("lfo.pan", -10);
    const auto signedBuilt = engine.buildDumpMessage ("s7PatchDump", juce::var (signedWanted));
    if (! signedBuilt.ok || signedBuilt.hex != "F0 7D 10 0A 36 F7")
    {
        std::cerr << "[FAIL] dump shape s7 dump should build as F0 7D 10 0A 36 F7, got "
                  << (signedBuilt.ok ? signedBuilt.hex : "!" + signedBuilt.error) << "\n";
        return 1;
    }
    const auto signedBack = engine.parseDumpMessage (signedBuilt.hex);
    auto* signedBackValues = signedBack.values.getDynamicObject();
    if (! signedBack.ok || signedBackValues == nullptr || (int) signedBackValues->getProperty ("lfo.pan") != -10)
    {
        std::cerr << "[FAIL] dump shape s7 dump did not read its own -10 back\n";
        return 1;
    }

    // ...and a dump whose mapping gives a codec is built with it: mod.depth is u7 on its own and
    // LSB-first in u14LsbDump. Built with the parameter's own encoding, 200 was refused as a u7.
    auto* lsbWanted = new juce::DynamicObject();
    lsbWanted->setProperty ("mod.depth", 200);
    const auto lsbBuilt = engine.buildDumpMessage ("u14LsbDump", juce::var (lsbWanted));
    if (! lsbBuilt.ok || lsbBuilt.hex != "F0 7D 10 0B 48 01 F7")
    {
        std::cerr << "[FAIL] dump shape u14LsbDump should build 200 as F0 7D 10 0B 48 01 F7, got "
                  << (lsbBuilt.ok ? lsbBuilt.hex : "!" + lsbBuilt.error) << "\n";
        return 1;
    }
    const auto lsbBack = engine.parseDumpMessage (lsbBuilt.hex);
    auto* lsbBackValues = lsbBack.values.getDynamicObject();
    if (! lsbBack.ok || lsbBackValues == nullptr || (int) lsbBackValues->getProperty ("mod.depth") != 200)
    {
        std::cerr << "[FAIL] dump shape u14LsbDump did not read its own 200 back\n";
        return 1;
    }

    // 14-bit LSB-first (byteOrder lsb-first): wire 39 60 -> 12345 (LSB 0x39 first, MSB 0x60 second).
    auto lsbDump = engine.parseDumpMessage ("F0 7D 10 0B 39 60 F7");
    auto* lsbValues = lsbDump.values.getDynamicObject();
    if (! lsbDump.ok
        || lsbDump.matchStatus != "ok"
        || lsbValues == nullptr
        || (int) lsbValues->getProperty ("mod.depth") != 12345)
    {
        std::cerr << "[FAIL] dump shape u14-lsb-msb did not decode LSB-first to 12345\n";
        return 1;
    }

    juce::StringArray onePart;
    onePart.add ("F0 7D 10 06 00 40 F7");
    auto partialCollection = engine.collectDumpMessages (onePart);
    auto* missingRanges = partialCollection.missingRanges.getArray();
    if (! partialCollection.ok
        || partialCollection.complete
        || partialCollection.status != "partial"
        || partialCollection.expectedMessageCount != 2
        || partialCollection.receivedBytes != 1
        || missingRanges == nullptr
        || missingRanges->isEmpty())
    {
        std::cerr << "[FAIL] dump collection did not report a missing split range\n";
        return 1;
    }

    juce::StringArray bothParts;
    bothParts.add ("F0 7D 10 06 00 40 F7");
    bothParts.add ("F0 7D 10 06 01 02 F7");
    auto completeCollection = engine.collectDumpMessages (bothParts);
    auto* collectionValues = completeCollection.values.getDynamicObject();
    if (! completeCollection.ok
        || ! completeCollection.complete
        || completeCollection.status != "complete"
        || completeCollection.expectedBytes != 2
        || collectionValues == nullptr
        || (int) collectionValues->getProperty ("filter.cutoff") != 64
        || collectionValues->getProperty ("osc.waveform").toString() != "triangle")
    {
        std::cerr << "[FAIL] dump collection did not merge split values\n";
        return 1;
    }

    std::cout << "[PASS] test-sysex-synth :: Dump shape metadata, name codecs, 8->7 packing, XOR, s7 + u14 lsb-first\n";
    return 0;
}

/**
 * Handling a MIDI message must not cost a reload of every profile on disk.
 *
 * loadInternalTestProfiles() reads as a startup step, but resolveEngine() calls it — so it ran for
 * every knob move, every request, every parsed dump and every inbound MIDI message, re-reading and
 * re-parsing 1.9 MB of JSON and recompiling ~1,600 parameters each time, on the thread that draws
 * the UI. A knob sweep on the instrument is a CC stream; each CC queued a full reparse; the window
 * went "(Not Responding)". An identity reply queued behind that arrived past its 1000ms timeout, so
 * a synth that answered correctly reported "No answer".
 *
 * Timed rather than counted because the cost is the point, and the margin is enormous: with the
 * reload back, fifty messages cost fifty cold loads. The budget is one cold load for all fifty, so a
 * regression fails by ~50x — far outside anything a slow or loaded machine could account for.
 */
int runProfileCacheTests()
{
    // The cold load: a fresh service reads and compiles every shipped profile once. This is the unit
    // the budget below is expressed in, so the test carries its own scale and needs no magic number.
    auto coldStart = juce::Time::getMillisecondCounterHiRes();
    ceditor::device::DeviceProfileService service;
    auto coldLoadMs = juce::Time::getMillisecondCounterHiRes() - coldStart;

    auto* mapping = new juce::DynamicObject();
    mapping->setProperty ("role", "mainSynth");
    mapping->setProperty ("profileId", "roland-gaia-sh01");     // the big one: 793 parameters
    auto* destination = new juce::DynamicObject();
    destination->setProperty ("type", "previewOnly");
    destination->setProperty ("id", "previewOnly");
    destination->setProperty ("name", "Preview Only");
    mapping->setProperty ("midiDestination", juce::var (destination));
    service.setDeviceRoleMapping (juce::var (mapping));

    if (service.engineForRole ({}) == nullptr)
    {
        std::cerr << "[FAIL] DeviceProfileService :: an omitted role did not resolve mainSynth\n";
        return 1;
    }

    constexpr int messageCount = 50;
    auto start = juce::Time::getMillisecondCounterHiRes();
    for (int index = 0; index < messageCount; ++index)
    {
        auto* incoming = new juce::DynamicObject();
        incoming->setProperty ("deviceRole", "mainSynth");
        incoming->setProperty ("hex", "B0 66 " + juce::String::toHexString (index % 128).paddedLeft ('0', 2));
        service.ingestIncomingMidiMessage (juce::var (incoming));
    }
    auto streamMs = juce::Time::getMillisecondCounterHiRes() - start;

    if (coldLoadMs < 5.0)
    {
        // Nothing was loaded, so the comparison below would pass without measuring anything. That is
        // a broken test run, not a passing one.
        std::cerr << "[FAIL] DeviceProfileService :: constructing the service took " << coldLoadMs
                  << "ms — the profile directory was not found, so this test proves nothing\n";
        return 1;
    }

    if (streamMs > coldLoadMs)
    {
        std::cerr << "[FAIL] DeviceProfileService :: " << messageCount << " inbound MIDI messages took "
                  << streamMs << "ms, more than one cold load of every profile (" << coldLoadMs
                  << "ms) — resolveEngine is reloading the profile directory per message\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: inbound MIDI does not reload the profile directory ("
              << messageCount << " messages in " << streamMs << "ms, cold load " << coldLoadMs << "ms)\n";

    // The other half: caching must not mean going stale. An edited profile still has to be picked up,
    // which is what made the reload unconditional in the first place.
    auto scratch = profileRoot().getChildFile ("_cache-reload-check.ceditor-device.json");
    struct ScopedFile
    {
        juce::File file;
        ~ScopedFile() { file.deleteFile(); }
    } scoped { scratch };
    juce::ignoreUnused (scoped);

    const auto profileJson = [] (const juce::String& name)
    {
        return juce::String (R"({"schemaVersion":1,"id":"_cache-reload-check","name":")") + name
             + R"(","messageRecipes":[{"id":"r","kind":"cc","channel":"$channel","controller":1,"value":"$encodedValue"}],)"
             + R"("parameters":[{"id":"p","name":"P","type":"bipolar","range":{"min":0,"max":127},)"
             + R"("default":64,"encoding":{"type":"u7"},"messageRecipe":"r"}]})";
    };

    if (! scratch.replaceWithText (profileJson ("before")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: could not write the reload-check profile\n";
        return 1;
    }

    const auto loadedName = [&service] () -> juce::String
    {
        // Held in a named local: the temporary would be gone before the loop reached its array.
        auto listed = service.listProfiles();
        if (auto* items = listed.getArray())
            for (const auto& item : *items)
                if (auto* object = item.getDynamicObject())
                    if (object->getProperty ("id").toString() == "_cache-reload-check")
                        return object->getProperty ("name").toString();
        return {};
    };

    if (loadedName() != "before")
    {
        std::cerr << "[FAIL] DeviceProfileService :: a new profile file was not picked up (got \""
                  << loadedName() << "\")\n";
        return 1;
    }

    // Stamped explicitly rather than relying on the write: two writes in the same millisecond can
    // land on the same modification time, and then the test would be asking the wrong question.
    scratch.replaceWithText (profileJson ("after"));
    scratch.setLastModificationTime (juce::Time::getCurrentTime() + juce::RelativeTime::seconds (2));

    if (loadedName() != "after")
    {
        std::cerr << "[FAIL] DeviceProfileService :: an edited profile was not reloaded (still \""
                  << loadedName() << "\") — the modification-time check is not catching edits\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: an edited profile is still reloaded\n";
    return 0;
}

/**
 * Clear has to clear the copy that matters.
 *
 * The monitor log lives here, and every message used to push the WHOLE of it to the UI. So a Clear button
 * that emptied only the browser's list looked like it worked, right up until the next slider move
 * arrived carrying all five hundred old events back with it. Nothing was broken on the UI side; the
 * list it cleared was never the list.
 *
 * The third assertion is the bug: not that clearing empties the log, but that what comes after a
 * clear contains only what came after it.
 */
int runMonitorClearTests()
{
    ceditor::device::DeviceProfileService service;

    const auto ingest = [&service] (const juce::String& hex)
    {
        auto* incoming = new juce::DynamicObject();
        incoming->setProperty ("deviceRole", "mainSynth");
        incoming->setProperty ("hex", hex);
        service.ingestIncomingMidiMessage (juce::var (incoming));
    };

    const auto monitorCount = [&service]
    {
        auto events = service.getMonitorEvents();
        auto* array = events.getArray();
        return array != nullptr ? array->size() : -1;
    };

    for (int i = 0; i < 5; ++i)
        ingest ("B0 4A " + juce::String::toHexString (i).paddedLeft ('0', 2));

    const auto before = monitorCount();
    if (before <= 0)
    {
        std::cerr << "[FAIL] DeviceProfileService :: inbound MIDI did not reach the monitor log (got "
                  << before << ") — the rest of this test would pass by having nothing to clear\n";
        return 1;
    }

    service.clearMonitorEvents();
    if (monitorCount() != 0)
    {
        std::cerr << "[FAIL] DeviceProfileService :: clearMonitorEvents left " << monitorCount()
                  << " event(s) behind\n";
        return 1;
    }

    ingest ("B0 4A 7F");
    const auto after = monitorCount();
    if (after != 1)
    {
        std::cerr << "[FAIL] DeviceProfileService :: the first message after a clear brought back the old log ("
                  << after << " events, expected 1) — this is what Clear looked like from the UI\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: clearing the monitor log stays cleared\n";

    // The UI is sent what is new, not the log again. A page that opens takes the whole log, and
    // after that a publish sends only what came after it, and nothing when nothing did.
    {
        juce::Array<juce::var> payloads;
        service.setEventCallback ([&payloads] (const juce::String& name, const juce::var& payload)
        {
            if (name == "midiMonitorEvents") payloads.add (payload);
        });
        const auto snapshot = service.takeMonitorSnapshot();
        const auto* whole = snapshot.getProperty ("events", {}).getArray();
        if (! static_cast<bool> (snapshot.getProperty ("full", false)) || whole == nullptr || whole->size() != monitorCount())
        {
            std::cerr << "[FAIL] DeviceProfileService :: the snapshot for a page that opens is not the whole log\n";
            return 1;
        }
        juce::Thread::sleep (60);   // past the 20-a-second coalescing
        service.publishMonitorEvents();
        if (! payloads.isEmpty())
        {
            std::cerr << "[FAIL] DeviceProfileService :: a publish with nothing new sent " << payloads.size() << " payload(s)\n";
            return 1;
        }
        juce::Thread::sleep (60);
        ingest ("B0 4B 01");   // the ingest publishes
        const auto* sent = payloads.isEmpty() ? nullptr : payloads.getLast().getProperty ("events", {}).getArray();
        if (payloads.size() != 1 || static_cast<bool> (payloads.getLast().getProperty ("full", true))
            || sent == nullptr || sent->size() != 1
            || sent->getReference (0).getProperty ("hex", {}).toString() != "B0 4B 01")
        {
            std::cerr << "[FAIL] DeviceProfileService :: after a snapshot, one new message was not sent alone ("
                      << payloads.size() << " payload(s), " << (sent != nullptr ? sent->size() : -1) << " event(s))\n";
            return 1;
        }
        service.setEventCallback (nullptr);
        std::cout << "[PASS] DeviceProfileService :: the monitor sends a page that opens the whole log, and after that only what is new\n";
    }

    // Housekeeping the instrument sends on its own is not something it said.
    //
    // A Yamaha AN1x emits Active Sensing every ~262ms from the moment it is plugged in. Logged, it
    // fills the 500-entry monitor with identical FE lines in about two minutes and pushes every
    // real message out of it — reported from a live session as being "bombarded". Timing Clock is
    // worse: twenty-four to the beat, 48/s at 120bpm.
    service.clearMonitorEvents();
    for (int i = 0; i < 20; ++i) { ingest ("FE"); ingest ("F8"); }
    if (monitorCount() != 0)
    {
        std::cerr << "[FAIL] DeviceProfileService :: active sensing and clock reached the monitor log ("
                  << monitorCount() << " event(s)) — the log fills with keep-alives and the message"
                  << " someone is looking for scrolls away\n";
        return 1;
    }

    // But only those two. Start/Continue/Stop and System Reset are things that happened.
    for (const auto* hex : { "FA", "FB", "FC", "FF" })
        ingest (hex);
    if (monitorCount() != 4)
    {
        std::cerr << "[FAIL] DeviceProfileService :: transport real-time messages were swallowed too ("
                  << monitorCount() << " of 4 logged)\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: keep-alives stay out of the log, transport stays in\n";
    return 0;
}

/*
 * A request's `retries` is used. The profile's retries were stored on the pending request and never
 * read: one lost reply was a failed read whatever the profile asked for. Now a request past its
 * timeout is sent again while tries remain, and the attempt is in the MIDI log. There is no MIDI
 * output in this test, so what it can show is the attempt and the other half of the rule: a resend
 * that cannot be sent ends the request, rather than leaving it waiting for ever.
 */
int runRequestRetryTests()
{
    using Access = ceditor::device::DeviceProfileServiceTestAccess;
    ceditor::device::DeviceProfileService service;
    int timedOut = 0;
    service.setEventCallback ([&] (const juce::String& name, const juce::var&)
    {
        if (name == "deviceRequestTimedOut") ++timedOut;
    });
    auto logged = [&] { return Access::loggedStatuses (service).joinIntoString (" | "); };

    Access::awaitExpired (service, "mainSynth", "patch", 0);
    Access::runTimeouts (service);
    if (timedOut != 1 || Access::pendingCount (service) != 0 || logged().contains ("again"))
    {
        std::cerr << "[FAIL] a request with no retries times out at once (timed out " << timedOut
                  << ", pending " << Access::pendingCount (service) << ")\n";
        return 1;
    }

    timedOut = 0;
    Access::awaitExpired (service, "mainSynth", "voice", 2);
    Access::runTimeouts (service);
    if (! logged().contains ("No reply, and it could not be sent again"))
    {
        std::cerr << "[FAIL] a request with retries left is tried again; the log says: "
                  << logged() << "\n";
        return 1;
    }
    if (timedOut != 1 || Access::pendingCount (service) != 0)
    {
        std::cerr << "[FAIL] a resend that could not be sent still ends the request (timed out " << timedOut
                  << ", pending " << Access::pendingCount (service) << ")\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: a request's retries are tried before it times out\n";
    return 0;
}

int runRealtimeMonitorTests()
{
    ceditor::device::DeviceProfileService service;
    auto* mapping = new juce::DynamicObject();
    mapping->setProperty ("role", "mainSynth");
    mapping->setProperty ("profileId", "roland-gaia-sh01");
    service.setDeviceRoleMapping (juce::var (mapping));
    int rawMessages = 0, sysexMessages = 0, runtimeSnapshots = 0, monitorSnapshots = 0;
    auto* read = new juce::DynamicObject();
    read->setProperty ("deviceRole", "mainSynth");
    read->setProperty ("request", "requestTone1");
    read->setProperty ("dryRun", true);
    const juce::var readPayload (read);
    auto chained = service.startDeviceSync (readPayload);
    read->setProperty ("chainStartup", false);
    auto single = service.startDeviceSync (readPayload);
    if (! static_cast<bool> (single.getProperty ("ok", false))
        || chained.getProperty ("nextStartupRequestId", "").toString() != "requestTone2"
        || single.getProperty ("nextStartupRequestId", "").toString().isNotEmpty())
    {
        std::cerr << "[FAIL] a live block read must not chain through the whole startup sync\n";
        return 1;
    }
    // The UI is sent what is new each time ({ events, full: false }), so what it holds is every
    // payload's events put end to end; a whole log ({ full: true }) would replace it.
    juce::Array<juce::var> received;
    bool deltasOnly = true;
    service.setEventCallback ([&] (const juce::String& name, const juce::var& payload)
    {
        if (name == "midiInputMessage") ++rawMessages;
        if (name == "sysexInputMessage") ++sysexMessages;
        if (name == "deviceRuntimeState") ++runtimeSnapshots;
        if (name == "midiMonitorEvents")
        {
            ++monitorSnapshots;
            if (static_cast<bool> (payload.getProperty ("full", false))) { deltasOnly = false; received.clear(); }
            if (auto* events = payload.getProperty ("events", {}).getArray())
                received.addArray (*events);
        }
    });
    for (int i = 0; i < 100; ++i)
    {
        auto* incoming = new juce::DynamicObject();
        incoming->setProperty ("deviceRole", "mainSynth");
        incoming->setProperty ("hex", "F0 41 10 00 00 41 12 10 00 01 10 40 1F F7");
        service.ingestIncomingMidiMessage (juce::var (incoming));
    }
    if (rawMessages != 100 || sysexMessages != 100 || runtimeSnapshots != 0 || monitorSnapshots >= 100)
    {
        std::cerr << "[FAIL] realtime SysEx: raw=" << rawMessages << " sysex=" << sysexMessages
                  << " stale runtime=" << runtimeSnapshots << " log snapshots=" << monitorSnapshots << '\n';
        return 1;
    }
    // The final snapshot leaves on the throttle's 60 Hz timer, which JUCE's timer thread has to mark
    // due before callPendingTimersSynchronously runs it. A fixed 100 ms was enough in a plain build
    // and never under AddressSanitizer (docs/design/checkers-run-2026-10-02.md), so poll for it, up
    // to two seconds, rather than guess how long the timer thread needs.
    const auto lastIdOf = [] (const juce::Array<juce::var>& events)
    {
        return events.isEmpty() ? juce::int64 (-1) : static_cast<juce::int64> (events.getLast().getProperty ("eventId", 0));
    };
    auto expected = service.getMonitorEvents();
    for (int waited = 0; waited < 2000; waited += 10)
    {
        juce::Thread::sleep (10);
        juce::Timer::callPendingTimersSynchronously();
        expected = service.getMonitorEvents();
        if (expected.getArray() != nullptr && lastIdOf (received) == lastIdOf (*expected.getArray()))
            break;
    }
    if (expected.getArray() == nullptr || lastIdOf (received) != lastIdOf (*expected.getArray()))
    {
        std::cerr << "[FAIL] monitor throttle lost the final events (received up to id " << lastIdOf (received)
                  << ", the log ends at " << (expected.getArray() != nullptr ? lastIdOf (*expected.getArray()) : -1)
                  << ", payloads=" << monitorSnapshots << ")\n";
        return 1;
    }
    // What was received, put end to end, is the log: nothing lost to a coalesced call, nothing sent
    // twice, in order, and none of it a whole log resent.
    if (! deltasOnly || received.size() != expected.getArray()->size())
    {
        std::cerr << "[FAIL] the monitor sent " << received.size() << " events for a log of "
                  << expected.getArray()->size() << (deltasOnly ? "" : ", and a whole log") << "\n";
        return 1;
    }
    for (int i = 0; i < received.size(); ++i)
        if (received.getReference (i).getProperty ("eventId", 0) != expected.getArray()->getReference (i).getProperty ("eventId", 0))
        {
            std::cerr << "[FAIL] the monitor's events arrived out of order or with a gap at " << i << "\n";
            return 1;
        }
    juce::int64 lastId = 0;
    for (const auto& event : *expected.getArray())
    {
        auto id = static_cast<juce::int64> (event.getProperty ("eventId", 0));
        if (id <= lastId) { std::cerr << "[FAIL] monitor event ids are not unique\n"; return 1; }
        lastId = id;
    }
    std::cout << "[PASS] realtime SysEx retains every message, avoids stale state, and sends the monitor what is new, coalesced, losing none\n";
    return 0;
}

int runServiceRequestTests()
{
    ceditor::device::DeviceProfileService service;
    juce::var latestDumpCollection;
    juce::var latestBulkSend;
    juce::var latestPresetScan;
    juce::var latestContinuedRequest;
    service.setEventCallback ([&latestDumpCollection, &latestBulkSend, &latestPresetScan, &latestContinuedRequest] (const juce::String& eventName, const juce::var& payload)
    {
        if (eventName == "dumpCollectionUpdated")
            latestDumpCollection = payload;
        if (eventName == "bulkDumpSendUpdated")
            latestBulkSend = payload;
        if (eventName == "presetListScanUpdated")
            latestPresetScan = payload;
        if (eventName == "deviceRequestContinued")
            latestContinuedRequest = payload;
    });

    auto* mapping = new juce::DynamicObject();
    mapping->setProperty ("role", "mainSynth");
    mapping->setProperty ("profileId", "test-sysex-synth");
    auto* destination = new juce::DynamicObject();
    destination->setProperty ("type", "previewOnly");
    destination->setProperty ("id", "previewOnly");
    destination->setProperty ("name", "Preview Only");
    mapping->setProperty ("midiDestination", juce::var (destination));
    mapping->setProperty ("syncDirection", "live");
    service.setDeviceRoleMapping (juce::var (mapping));

    auto initialSession = service.getSessionState();
    auto* initialSessionObject = initialSession.getDynamicObject();
    auto* initialMainSynthSession = initialSessionObject != nullptr ? initialSessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (initialMainSynthSession == nullptr || initialMainSynthSession->getProperty ("syncDirection").toString() != "live")
    {
        std::cerr << "[FAIL] DeviceProfileService :: role mapping did not preserve sync direction\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: sync direction mapping\n";

    auto capabilities = service.getTransportCapabilities();
    auto* capabilitiesObject = capabilities.getDynamicObject();
    auto* pluginTransports = capabilitiesObject != nullptr ? capabilitiesObject->getProperty ("pluginTransports").getArray() : nullptr;
    if (capabilitiesObject == nullptr
        || capabilitiesObject->getProperty ("transport").toString() != "standalone"
        || capabilitiesObject->getProperty ("pluginTransportStatus").toString() != "planned"
        || pluginTransports == nullptr
        || pluginTransports->size() < 4)
    {
        std::cerr << "[FAIL] DeviceProfileService :: transport capabilities did not expose plugin transport scaffold\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: transport capability scaffold\n";

    auto* sync = new juce::DynamicObject();
    sync->setProperty ("correlationId", "service_sync_test");
    sync->setProperty ("deviceRole", "mainSynth");
    sync->setProperty ("profileId", "test-sysex-synth");
    sync->setProperty ("request", "requestCurrentPatchDump");
    sync->setProperty ("dryRun", true);

    auto result = service.startDeviceSync (juce::var (sync));
    auto* resultObject = result.getDynamicObject();
    auto* transaction = resultObject != nullptr ? resultObject->getProperty ("transaction").getDynamicObject() : nullptr;
    if (resultObject == nullptr || transaction == nullptr || ! static_cast<bool> (resultObject->getProperty ("ok")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: startDeviceSync did not return an ok transaction\n";
        return 1;
    }

    auto hex = transaction->getProperty ("hex").toString();
    if (hex != "F0 7D 10 00 01 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: startDeviceSync expected F0 7D 10 00 01 F7, got " << hex << "\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: startDeviceSync request preview\n";

    // A dump is asked for by its own id, the one its answer arrives under, which is what
    // requestDump(kind, fn) matches its callback against. Only the request's id was taken.
    auto* byDump = new juce::DynamicObject();
    byDump->setProperty ("correlationId", "service_sync_dump_test");
    byDump->setProperty ("deviceRole", "mainSynth");
    byDump->setProperty ("profileId", "test-sysex-synth");
    byDump->setProperty ("request", "currentPatchDump");
    byDump->setProperty ("dryRun", true);
    auto byDumpResult = service.startDeviceSync (juce::var (byDump));
    auto* byDumpObject = byDumpResult.getDynamicObject();
    auto* byDumpTransaction = byDumpObject != nullptr ? byDumpObject->getProperty ("transaction").getDynamicObject() : nullptr;
    if (byDumpObject == nullptr || byDumpTransaction == nullptr || ! static_cast<bool> (byDumpObject->getProperty ("ok"))
        || byDumpTransaction->getProperty ("hex").toString() != "F0 7D 10 00 01 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: a dump's id did not send the request that asks for it: "
                  << juce::JSON::toString (byDumpResult, true) << "\n";
        return 1;
    }
    auto* unknown = new juce::DynamicObject();
    unknown->setProperty ("deviceRole", "mainSynth");
    unknown->setProperty ("profileId", "test-sysex-synth");
    unknown->setProperty ("request", "noSuchDump");
    unknown->setProperty ("dryRun", true);
    auto unknownResult = service.startDeviceSync (juce::var (unknown));
    if (auto* unknownObject = unknownResult.getDynamicObject(); unknownObject == nullptr || static_cast<bool> (unknownObject->getProperty ("ok")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: an id that is neither a request nor a dump was sent\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: startDeviceSync asks for a dump by its own id\n";

    auto* identity = new juce::DynamicObject();
    identity->setProperty ("correlationId", "service_identity_test");
    identity->setProperty ("deviceRole", "mainSynth");
    identity->setProperty ("profileId", "test-sysex-synth");
    identity->setProperty ("request", "identityRequest");
    identity->setProperty ("dryRun", true);

    auto identityResult = service.startDeviceSync (juce::var (identity));
    auto* identityObject = identityResult.getDynamicObject();
    auto* identityTransaction = identityObject != nullptr ? identityObject->getProperty ("transaction").getDynamicObject() : nullptr;
    if (identityObject == nullptr
        || identityTransaction == nullptr
        || identityTransaction->getProperty ("hex").toString() != "F0 7E 10 06 01 F7"
        || identityObject->getProperty ("expectedResponseKind").toString() != "identity")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity request preview did not compile Universal SysEx identity request\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: identity request preview\n";

    auto* identityReply = new juce::DynamicObject();
    identityReply->setProperty ("requestId", "incoming_identity_match");
    identityReply->setProperty ("deviceRole", "mainSynth");
    identityReply->setProperty ("messageType", "sysex");
    identityReply->setProperty ("hex", "F0 7E 10 06 02 7D 00 01 00 02 00 00 00 01 F7");
    service.ingestIncomingMidiMessage (juce::var (identityReply));

    auto sessionState = service.getSessionState();
    auto* sessionObject = sessionState.getDynamicObject();
    auto* mainSynthSession = sessionObject != nullptr ? sessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (mainSynthSession == nullptr
        || mainSynthSession->getProperty ("state").toString() != "ready"
        || mainSynthSession->getProperty ("identityStatus").toString() != "matched")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity reply did not mark session ready/matched\n";
        return 1;
    }

    auto* identityMismatch = new juce::DynamicObject();
    identityMismatch->setProperty ("requestId", "incoming_identity_mismatch");
    identityMismatch->setProperty ("deviceRole", "mainSynth");
    identityMismatch->setProperty ("messageType", "sysex");
    identityMismatch->setProperty ("hex", "F0 7E 10 06 02 7D 00 01 00 03 00 00 00 01 F7");
    service.ingestIncomingMidiMessage (juce::var (identityMismatch));

    sessionState = service.getSessionState();
    sessionObject = sessionState.getDynamicObject();
    mainSynthSession = sessionObject != nullptr ? sessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (mainSynthSession == nullptr
        || mainSynthSession->getProperty ("state").toString() != "mismatch"
        || mainSynthSession->getProperty ("identityStatus").toString() != "mismatch")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity mismatch did not mark session mismatch\n";
        return 1;
    }

    auto* identityOverride = new juce::DynamicObject();
    identityOverride->setProperty ("deviceRole", "mainSynth");
    identityOverride->setProperty ("profileId", "test-sysex-synth");
    identityOverride->setProperty ("reason", "test accepted mismatch");
    auto overrideResult = service.overrideDeviceIdentityMismatch (juce::var (identityOverride));
    auto* overrideObject = overrideResult.getDynamicObject();
    sessionState = service.getSessionState();
    sessionObject = sessionState.getDynamicObject();
    mainSynthSession = sessionObject != nullptr ? sessionObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    if (overrideObject == nullptr
        || ! static_cast<bool> (overrideObject->getProperty ("ok"))
        || mainSynthSession == nullptr
        || mainSynthSession->getProperty ("state").toString() != "ready"
        || mainSynthSession->getProperty ("identityStatus").toString() != "overridden")
    {
        std::cerr << "[FAIL] DeviceProfileService :: identity override did not mark session ready/overridden\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: identity reply match, mismatch, and override\n";

    auto* seedPushValue = new juce::DynamicObject();
    seedPushValue->setProperty ("requestId", "seed_push_cutoff");
    seedPushValue->setProperty ("deviceRole", "mainSynth");
    seedPushValue->setProperty ("profileId", "test-sysex-synth");
    seedPushValue->setProperty ("parameterId", "filter.cutoff");
    seedPushValue->setProperty ("value", 64);
    seedPushValue->setProperty ("dryRun", true);
    service.compileParameterMessage (juce::var (seedPushValue), true);

    auto* push = new juce::DynamicObject();
    push->setProperty ("correlationId", "service_push_test");
    push->setProperty ("deviceRole", "mainSynth");
    push->setProperty ("profileId", "test-sysex-synth");
    push->setProperty ("syncDirection", "push");
    push->setProperty ("dryRun", true);
    auto pushResult = service.startDeviceSync (juce::var (push));
    auto* pushObject = pushResult.getDynamicObject();
    auto* pushTransactions = pushObject != nullptr ? pushObject->getProperty ("transactions").getArray() : nullptr;
    auto* firstPushTransaction = pushTransactions != nullptr && ! pushTransactions->isEmpty()
        ? (*pushTransactions)[0].getDynamicObject()
        : nullptr;
    if (pushObject == nullptr
        || pushObject->getProperty ("syncDirection").toString() != "push"
        || firstPushTransaction == nullptr
        || firstPushTransaction->getProperty ("hex").toString() != "F0 7D 10 20 40 60 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: push sync did not compile runtime state to MIDI transaction\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: push sync previews runtime state\n";

    auto* raw = new juce::DynamicObject();
    raw->setProperty ("requestId", "raw_send_test");
    raw->setProperty ("deviceRole", "mainSynth");
    raw->setProperty ("actionId", "bulkDumpSend");
    raw->setProperty ("message", "F0 7D 10 7F F7");
    raw->setProperty ("dryRun", false);
    auto rawResult = service.compileRawMidiAction (juce::var (raw), true);
    auto* rawObject = rawResult.getDynamicObject();
    auto status = rawObject != nullptr ? rawObject->getProperty ("status").toString() : juce::String {};
    if (! status.startsWith ("Not sent: MIDI destination is preview-only"))
    {
        std::cerr << "[FAIL] DeviceProfileService :: raw MIDI trigger should route through send path, got " << status << "\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: raw MIDI trigger uses send path\n";

    auto* bulkPreview = new juce::DynamicObject();
    bulkPreview->setProperty ("bulkSendId", "service_bulk_preview");
    bulkPreview->setProperty ("deviceRole", "mainSynth");
    bulkPreview->setProperty ("profileId", "test-sysex-synth");
    bulkPreview->setProperty ("hex", "F0 7D 10 01 02 03 04 F7");
    bulkPreview->setProperty ("chunkSizeBytes", 5);
    bulkPreview->setProperty ("chunkDelayMs", 12);
    bulkPreview->setProperty ("dryRun", true);
    auto bulkPreviewResult = service.startBulkDumpSend (juce::var (bulkPreview));
    auto* bulkPreviewObject = bulkPreviewResult.getDynamicObject();
    auto* bulkChunks = bulkPreviewObject != nullptr ? bulkPreviewObject->getProperty ("chunks").getArray() : nullptr;
    auto* secondBulkChunk = bulkChunks != nullptr && bulkChunks->size() >= 2 ? (*bulkChunks)[1].getDynamicObject() : nullptr;
    if (bulkPreviewObject == nullptr
        || bulkPreviewObject->getProperty ("status").toString() != "preview"
        || static_cast<int> (bulkPreviewObject->getProperty ("totalChunks")) != 2
        || static_cast<int> (bulkPreviewObject->getProperty ("chunkDelayMs")) != 12
        || secondBulkChunk == nullptr
        || secondBulkChunk->getProperty ("hex").toString() != "03 04 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk send preview did not chunk SysEx correctly\n";
        return 1;
    }

    auto* bulkRun = new juce::DynamicObject();
    bulkRun->setProperty ("bulkSendId", "service_bulk_cancel");
    bulkRun->setProperty ("deviceRole", "mainSynth");
    bulkRun->setProperty ("profileId", "test-sysex-synth");
    bulkRun->setProperty ("hex", "F0 7D 10 01 02 03 04 F7");
    bulkRun->setProperty ("chunkSizeBytes", 4);
    bulkRun->setProperty ("dryRun", false);
    auto bulkRunResult = service.startBulkDumpSend (juce::var (bulkRun));
    auto* bulkRunObject = bulkRunResult.getDynamicObject();
    if (bulkRunObject == nullptr || bulkRunObject->getProperty ("status").toString() != "running")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk send should start as a running job\n";
        return 1;
    }

    auto* bulkCancel = new juce::DynamicObject();
    bulkCancel->setProperty ("bulkSendId", "service_bulk_cancel");
    auto bulkCancelResult = service.cancelBulkDumpSend (juce::var (bulkCancel));
    auto* bulkCancelObject = bulkCancelResult.getDynamicObject();
    if (bulkCancelObject == nullptr
        || bulkCancelObject->getProperty ("status").toString() != "cancelled"
        || ! static_cast<bool> (bulkCancelObject->getProperty ("cancelled")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk send cancellation did not cancel queued chunks\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: bulk dump send chunking and cancel\n";

    auto* scan = new juce::DynamicObject();
    scan->setProperty ("scanId", "service_preset_scan_test");
    scan->setProperty ("deviceRole", "mainSynth");
    scan->setProperty ("profileId", "test-sysex-synth");
    scan->setProperty ("dryRun", true);
    auto scanResult = service.startPresetListScan (juce::var (scan));
    auto* scanObject = scanResult.getDynamicObject();
    auto* entries = scanObject != nullptr ? scanObject->getProperty ("entries").getArray() : nullptr;
    auto* thirdEntry = entries != nullptr && entries->size() >= 3 ? (*entries)[2].getDynamicObject() : nullptr;
    if (scanObject == nullptr
        || ! static_cast<bool> (scanObject->getProperty ("ok"))
        || static_cast<int> (scanObject->getProperty ("total")) != 3
        || thirdEntry == nullptr
        || thirdEntry->getProperty ("requestHex").toString() != "F0 7D 10 02 03 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan preview did not compile slot requests\n";
        return 1;
    }

    auto scanList = service.getPresetListScans();
    auto* scanListArray = scanList.getArray();
    if (scanListArray == nullptr || scanListArray->isEmpty())
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan registry did not retain scan job\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: preset scan request preview\n";

    auto* firstChunk = new juce::DynamicObject();
    firstChunk->setProperty ("requestId", "incoming_chunk_1");
    firstChunk->setProperty ("deviceRole", "mainSynth");
    firstChunk->setProperty ("messageType", "sysex");
    firstChunk->setProperty ("hex", "F0 7D 10 03 03 50 61");
    auto firstChunkResult = service.ingestIncomingMidiMessage (juce::var (firstChunk));
    auto* firstChunkObject = firstChunkResult.getDynamicObject();
    if (firstChunkObject == nullptr || ! static_cast<bool> (firstChunkObject->getProperty ("waitingForSysexEnd")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: split SysEx first chunk was not buffered\n";
        return 1;
    }

    auto* secondChunk = new juce::DynamicObject();
    secondChunk->setProperty ("requestId", "incoming_chunk_2");
    secondChunk->setProperty ("deviceRole", "mainSynth");
    secondChunk->setProperty ("messageType", "sysex");
    secondChunk->setProperty ("hex", "64 20 30 30 33 F7");
    auto secondChunkResult = service.ingestIncomingMidiMessage (juce::var (secondChunk));
    auto* secondChunkObject = secondChunkResult.getDynamicObject();
    if (secondChunkObject == nullptr || ! static_cast<bool> (secondChunkObject->getProperty ("assembled")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: split SysEx was not assembled\n";
        return 1;
    }

    auto runtimeState = service.getRuntimeState();
    auto* runtimeObject = runtimeState.getDynamicObject();
    auto* mainSynthState = runtimeObject != nullptr ? runtimeObject->getProperty ("mainSynth").getDynamicObject() : nullptr;
    auto presetName = mainSynthState != nullptr ? mainSynthState->getProperty ("preset.name").toString() : juce::String {};
    if (presetName != "Pad 003")
    {
        std::cerr << "[FAIL] DeviceProfileService :: split SysEx expected preset.name Pad 003, got " << presetName << "\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: split SysEx input reassembly\n";

    auto* verifiedBulk = new juce::DynamicObject();
    verifiedBulk->setProperty ("bulkSendId", "service_bulk_verify");
    verifiedBulk->setProperty ("deviceRole", "mainSynth");
    verifiedBulk->setProperty ("profileId", "test-sysex-synth");
    verifiedBulk->setProperty ("hex", "F0 7D 10 01 02 03 F7");
    verifiedBulk->setProperty ("expectedCollectionId", "splitPatchDump");
    verifiedBulk->setProperty ("ackHex", "F0 7D 10 7E 01 F7");
    verifiedBulk->setProperty ("nakHex", "F0 7D 10 7E 00 F7");
    verifiedBulk->setProperty ("retries", 1);
    verifiedBulk->setProperty ("dryRun", true);
    auto verifiedBulkResult = service.startBulkDumpSend (juce::var (verifiedBulk));
    auto* verifiedBulkObject = verifiedBulkResult.getDynamicObject();
    if (verifiedBulkObject == nullptr
        || verifiedBulkObject->getProperty ("verificationStatus").toString() != "waiting"
        || verifiedBulkObject->getProperty ("ackStatus").toString() != "waiting")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk verification policy was not initialized\n";
        return 1;
    }

    auto* nakReply = new juce::DynamicObject();
    nakReply->setProperty ("requestId", "bulk_nak_test");
    nakReply->setProperty ("deviceRole", "mainSynth");
    nakReply->setProperty ("messageType", "sysex");
    nakReply->setProperty ("hex", "F0 7D 10 7E 00 F7");
    service.ingestIncomingMidiMessage (juce::var (nakReply));
    auto* retryBulk = latestBulkSend.getDynamicObject();
    if (retryBulk == nullptr
        || retryBulk->getProperty ("ackStatus").toString() != "retrying"
        || static_cast<int> (retryBulk->getProperty ("retryCount")) != 1)
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk NAK did not schedule retry metadata\n";
        return 1;
    }

    auto* ackReply = new juce::DynamicObject();
    ackReply->setProperty ("requestId", "bulk_ack_test");
    ackReply->setProperty ("deviceRole", "mainSynth");
    ackReply->setProperty ("messageType", "sysex");
    ackReply->setProperty ("hex", "F0 7D 10 7E 01 F7");
    service.ingestIncomingMidiMessage (juce::var (ackReply));
    auto* ackBulk = latestBulkSend.getDynamicObject();
    if (ackBulk == nullptr || ackBulk->getProperty ("ackStatus").toString() != "ack")
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk ACK did not update job metadata\n";
        return 1;
    }

    auto* splitScan = new juce::DynamicObject();
    splitScan->setProperty ("scanId", "split_scan_test");
    splitScan->setProperty ("deviceRole", "mainSynth");
    splitScan->setProperty ("profileId", "test-sysex-synth");
    splitScan->setProperty ("request", "requestSplitPatchDump");
    splitScan->setProperty ("previewWaitForReplies", true);
    juce::Array<juce::var> splitSlots;
    splitSlots.add (juce::var (1));
    splitScan->setProperty ("slots", juce::var (splitSlots));
    splitScan->setProperty ("dryRun", false);
    auto splitScanResult = service.startPresetListScan (juce::var (splitScan));
    auto* splitScanObject = splitScanResult.getDynamicObject();
    if (splitScanObject == nullptr || splitScanObject->getProperty ("status").toString() != "running")
    {
        std::cerr << "[FAIL] DeviceProfileService :: split collection scan did not start\n";
        return 1;
    }

    auto* splitFirst = new juce::DynamicObject();
    splitFirst->setProperty ("requestId", "incoming_collection_1");
    splitFirst->setProperty ("deviceRole", "mainSynth");
    splitFirst->setProperty ("messageType", "sysex");
    splitFirst->setProperty ("hex", "F0 7D 10 06 00 40 F7");
    service.ingestIncomingMidiMessage (juce::var (splitFirst));
    auto* partialCollection = latestDumpCollection.getDynamicObject();
    if (partialCollection == nullptr
        || partialCollection->getProperty ("status").toString() != "partial"
        || static_cast<bool> (partialCollection->getProperty ("complete")))
    {
        std::cerr << "[FAIL] DeviceProfileService :: runtime dump collection did not report partial status\n";
        return 1;
    }
    auto* partialBulk = latestBulkSend.getDynamicObject();
    if (partialBulk == nullptr
        || partialBulk->getProperty ("verificationStatus").toString() != "partial"
        || partialBulk->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk job did not surface partial collection summary\n";
        return 1;
    }
    auto* partialScan = latestPresetScan.getDynamicObject();
    auto* partialEntries = partialScan != nullptr ? partialScan->getProperty ("entries").getArray() : nullptr;
    auto* partialEntry = partialEntries != nullptr && ! partialEntries->isEmpty()
        ? (*partialEntries)[0].getDynamicObject()
        : nullptr;
    if (partialEntry == nullptr
        || partialEntry->getProperty ("status").toString() != "partial"
        || partialEntry->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan did not surface partial collection progress\n";
        return 1;
    }
    auto* continuedRequest = latestContinuedRequest.getDynamicObject();
    auto* continueTransaction = continuedRequest != nullptr
        ? continuedRequest->getProperty ("continueTransaction").getDynamicObject()
        : nullptr;
    if (continuedRequest == nullptr
        || continuedRequest->getProperty ("continueRequestId").toString() != "requestSplitPatchContinue"
        || static_cast<int> (continuedRequest->getProperty ("continuationCount")) != 1
        || continueTransaction == nullptr
        || continueTransaction->getProperty ("hex").toString() != "F0 7D 10 08 F7")
    {
        std::cerr << "[FAIL] DeviceProfileService :: partial collection did not trigger declared continue request\n";
        return 1;
    }

    auto* splitSecond = new juce::DynamicObject();
    splitSecond->setProperty ("requestId", "incoming_collection_2");
    splitSecond->setProperty ("deviceRole", "mainSynth");
    splitSecond->setProperty ("messageType", "sysex");
    splitSecond->setProperty ("hex", "F0 7D 10 06 01 02 F7");
    service.ingestIncomingMidiMessage (juce::var (splitSecond));
    auto* completeCollection = latestDumpCollection.getDynamicObject();
    auto* collectionValues = completeCollection != nullptr
        ? completeCollection->getProperty ("values").getDynamicObject()
        : nullptr;
    if (completeCollection == nullptr
        || completeCollection->getProperty ("status").toString() != "complete"
        || ! static_cast<bool> (completeCollection->getProperty ("complete"))
        || collectionValues == nullptr
        || (int) collectionValues->getProperty ("filter.cutoff") != 64
        || collectionValues->getProperty ("osc.waveform").toString() != "triangle")
    {
        std::cerr << "[FAIL] DeviceProfileService :: runtime dump collection did not merge split values\n";
        return 1;
    }
    auto* completeBulk = latestBulkSend.getDynamicObject();
    if (completeBulk == nullptr
        || completeBulk->getProperty ("verificationStatus").toString() != "verified"
        || completeBulk->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: bulk job did not surface verified collection summary\n";
        return 1;
    }
    auto* completeScan = latestPresetScan.getDynamicObject();
    auto* completeEntries = completeScan != nullptr ? completeScan->getProperty ("entries").getArray() : nullptr;
    auto* completeEntry = completeEntries != nullptr && ! completeEntries->isEmpty()
        ? (*completeEntries)[0].getDynamicObject()
        : nullptr;
    if (completeEntry == nullptr
        || completeEntry->getProperty ("status").toString() != "complete"
        || completeEntry->getProperty ("dumpCollection").isVoid())
    {
        std::cerr << "[FAIL] DeviceProfileService :: preset scan did not surface complete collection summary\n";
        return 1;
    }

    std::cout << "[PASS] DeviceProfileService :: bulk verification ACK/NAK and collection summaries\n";
    std::cout << "[PASS] DeviceProfileService :: runtime dump collection assembly\n";
    return 0;
}

// A pure MIDI-CI *responder* for the loopback (stands in for a hardware synth). It answers Discovery
// + Property Exchange and serves ResourceList / DeviceInfo / ChannelList via a PropertyDelegate, but —
// crucially — does NOT initiate anything itself (its deviceAdded is a no-op), so it never starts a PE
// against our delegate-less initiator (which would NAK + retry-storm). Test-only.
struct TestCiResponder : juce::midi_ci::DeviceMessageHandler,
                         juce::midi_ci::DeviceListener,
                         juce::midi_ci::PropertyDelegate,
                         juce::midi_ci::ProfileDelegate
{
    std::function<void (const juce::MidiMessage&)> send;
    std::optional<juce::midi_ci::Device> device;
    // A block-level profile the responder hosts + activates, for the M2 profile-inquiry test.
    static constexpr juce::midi_ci::Profile kProfile { std::byte { 0x7E }, std::byte { 0x21 }, std::byte { 0x09 }, std::byte { 0x01 }, std::byte { 0x00 } };

    explicit TestCiResponder (std::function<void (const juce::MidiMessage&)> s) : send (std::move (s))
    {
        namespace ci = juce::midi_ci;
        juce::Random r;
        r.setSeedRandomly();
        const auto features = ci::DeviceFeatures().withPropertyExchangeSupported (true).withProfileConfigurationSupported (true);
        const juce::ump::DeviceInfo info {
            { std::byte { 0x42 }, std::byte { 0x00 }, std::byte { 0x00 } },
            { std::byte { 0x01 }, std::byte { 0x00 } },
            { std::byte { 0x02 }, std::byte { 0x00 } },
            { std::byte { 0x01 }, std::byte { 0x00 }, std::byte { 0x00 }, std::byte { 0x00 } } };
        const auto options = ci::DeviceOptions()
                                 .withOutputs ({ this })
                                 .withDeviceInfo (info)
                                 .withFeatures (features)
                                 .withProductInstanceId (ci::DeviceOptions::makeProductInstanceId (r))
                                 .withPropertyDelegate (this)
                                 .withProfileDelegate (this);
        device.emplace (options);
        device->addListener (*this);

        // Host one block-wide profile and activate it, so the initiator's inquiry sees an active profile.
        if (auto* host = device->getProfileHost())
        {
            const ci::ProfileAtAddress paa { kProfile, ci::ChannelAddress {}.withChannel (ci::ChannelInGroup::wholeBlock) };
            host->addProfile (paa, 1);
            host->setProfileEnablement (paa, 1);
        }
    }

    ~TestCiResponder() override { if (device.has_value()) device->removeListener (*this); }

    void processMessage (juce::ump::BytesOnGroup msg) override
    {
        if (send) send (juce::MidiMessage::createSysExMessage (msg.bytes));
    }
    void feed (const juce::MidiMessage& m) { if (device.has_value() && m.isSysEx()) device->processMessage ({ 0, m.getSysExDataSpan() }); }
    void pump() { if (device.has_value()) device->sendPendingMessages(); }
    uint32_t muid() const { return device.has_value() ? device->getMuid().get() : 0; }

    static juce::midi_ci::PropertyReplyData jsonReply (const juce::String& s)
    {
        juce::midi_ci::PropertyReplyData d; // header defaults: status 200, ascii, application/json
        for (const auto c : s) d.body.push_back (static_cast<std::byte> (static_cast<uint8_t> (c)));
        return d;
    }
    juce::midi_ci::PropertyReplyData propertyGetDataRequested (juce::midi_ci::MUID, const juce::midi_ci::PropertyRequestHeader& h) override
    {
        if (h.resource == "ResourceList") return jsonReply (R"([{"resource":"DeviceInfo"},{"resource":"ChannelList"},{"resource":"AllCtrlList"},{"resource":"ProgramList"}])");
        if (h.resource == "DeviceInfo")   return jsonReply (R"({"manufacturer":"CEditor Test","family":"SynthFam","model":"TestSynth","version":"1.0"})");
        if (h.resource == "ChannelList")  return jsonReply (R"({"channelList":[{"title":"Main","channel":1}]})");
        if (h.resource == "AllCtrlList")  return jsonReply (R"([{"title":"Filter Cutoff","ctrlType":"cc","ctrlIndex":[74]},{"title":"Volume","ctrlType":"cc","ctrlIndex":[7]}])");
        if (h.resource == "ProgramList")  return jsonReply (R"([{"title":"Init","bankPC":[0,0,0]},{"title":"Lead","bankPC":[0,0,1]}])");
        juce::midi_ci::PropertyReplyData d; d.header.status = 404; d.header.message = "Unknown resource"; return d;
    }
    juce::midi_ci::PropertyReplyHeader propertySetDataRequested (juce::midi_ci::MUID, const juce::midi_ci::PropertyRequestData&) override
    {
        juce::midi_ci::PropertyReplyHeader h; h.status = 405; h.message = "Read only"; return h;
    }
    bool subscriptionStartRequested (juce::midi_ci::MUID, const juce::midi_ci::PropertySubscriptionHeader&) override { return false; }
    void subscriptionDidStart (juce::midi_ci::MUID, const juce::String&, const juce::midi_ci::PropertySubscriptionHeader&) override {}
    void subscriptionWillEnd (juce::midi_ci::MUID, const juce::midi_ci::Subscription&) override {}

    // ProfileDelegate: honour enable/disable requests by updating our ProfileHost state.
    void profileEnablementRequested (juce::midi_ci::MUID, juce::midi_ci::ProfileAtAddress paa, int numChannels, bool enabled) override
    {
        if (auto* host = device.has_value() ? device->getProfileHost() : nullptr)
            host->setProfileEnablement (paa, enabled ? juce::jmax (1, numChannels) : 0);
    }
};

// The checksum table (design doc §48). There are two implementations of this arithmetic and there
// always will be — ProfileChecksums.h for the player, checksums.js for the editor — so they are
// pinned to the same fixture from both sides. A checksum that differs between the editor and the
// export means a synth accepts a dump from one and rejects it from the other, silently, and the panel
// author has no way to tell which is wrong.
//
// The numbers below are CE/web/test/fixtures/checksumCases.js. The four CRC values for "123456789"
// are additionally the published catalogue check values, which is what makes them right rather than
// merely consistent with ourselves.

/*  Two instances in one process on one MIDI input — two copies of a panel in a DAW — both receive
    whatever the synth sends. A dump one of them asked for must reach that one alone; a dump nobody
    asked for (sent from the synth's front panel) still reaches both. */
int runSharedInputReplyTests()
{
    using ceditor::device::DeviceProfileService;
    using ceditor::device::DeviceProfileServiceTestAccess;

    // The same synth on the same input for each. Opening the port fails here (there is no MIDI
    // hardware), which leaves the mapping in place: the input is what the check compares.
    const auto mapOnto = [] (DeviceProfileService& service, const juce::String& inputId)
    {
        auto* mapping = new juce::DynamicObject();
        mapping->setProperty ("role", "mainSynth");
        mapping->setProperty ("profileId", "test-sysex-synth");
        auto* input = new juce::DynamicObject();
        input->setProperty ("type", "hardwareInput");
        input->setProperty ("id", inputId);
        input->setProperty ("name", "Shared port");
        mapping->setProperty ("midiInput", juce::var (input));
        service.setDeviceRoleMapping (juce::var (mapping));
    };
    struct Heard { int sysex = 0, parsed = 0, resolved = 0; };
    const auto listen = [] (DeviceProfileService& service, Heard& heard)
    {
        service.setEventCallback ([&heard] (const juce::String& name, const juce::var&)
        {
            if (name == "sysexInputMessage") ++heard.sysex;
            if (name == "dumpMessageParsed") ++heard.parsed;
            if (name == "deviceRequestResolved") ++heard.resolved;
        });
    };
    const auto send = [] (DeviceProfileService& service, const juce::String& hex)
    {
        auto* incoming = new juce::DynamicObject();
        incoming->setProperty ("deviceRole", "mainSynth");
        incoming->setProperty ("hex", hex);
        service.ingestIncomingMidiMessage (juce::var (incoming));
    };

    // Unique to the run: a run that crashed a moment ago may have left its requests published for
    // other processes (runSharedInputAcrossProcessesTests), and they would name its port.
    const auto port = "shared-port-" + juce::Uuid().toString().substring (0, 8);
    DeviceProfileService a, b;
    mapOnto (a, port);
    mapOnto (b, port);

    // currentPatchDump in one message (the checksum is the 7-bit sum of 01 40 02), and the id the
    // profile reads it as.
    const juce::String dumpHex = "F0 7D 10 01 40 02 43 F7";
    auto* probe = new juce::DynamicObject();
    probe->setProperty ("deviceRole", "mainSynth");
    probe->setProperty ("hex", dumpHex);
    const auto dumpId = a.parseDumpMessage (juce::var (probe), false).getProperty ("dumpId", "").toString();
    if (dumpId != "currentPatchDump")
    {
        std::cerr << "[FAIL] shared input :: the test dump did not parse (got \"" << dumpId << "\")\n";
        return 1;
    }

    Heard heardA, heardB;
    listen (a, heardA);
    listen (b, heardB);

    // A asked for it: A applies it and is answered; B, on the same port, is left alone.
    DeviceProfileServiceTestAccess::awaitDump (a, "mainSynth", dumpId);
    send (b, dumpHex);
    send (a, dumpHex);
    if (heardB.sysex != 0 || heardB.parsed != 0 || heardA.parsed != 1 || heardA.resolved != 1)
    {
        std::cerr << "[FAIL] shared input :: a reply to A's request reached B (B sysex=" << heardB.sysex
                  << " parsed=" << heardB.parsed << ", A parsed=" << heardA.parsed << " resolved=" << heardA.resolved << ")\n";
        return 1;
    }

    // The same, with A handling the message first: its request is resolved by the time B looks,
    // and what answered it is what tells B the message was A's.
    heardA = {}; heardB = {};
    DeviceProfileServiceTestAccess::lapseAnswers (a);
    DeviceProfileServiceTestAccess::awaitDump (a, "mainSynth", dumpId);
    send (a, dumpHex);
    send (b, dumpHex);
    if (heardA.resolved != 1 || heardB.sysex != 0 || heardB.parsed != 0)
    {
        std::cerr << "[FAIL] shared input :: handled by A first, A's reply still reached B (B sysex=" << heardB.sysex
                  << " parsed=" << heardB.parsed << ", A resolved=" << heardA.resolved << ")\n";
        return 1;
    }

    // A's own published file still lists the request (no timer has ticked here), and must not be
    // read as another process's: this process's services are asked directly.
    heardB = {};
    DeviceProfileServiceTestAccess::lapseAnswers (a);
    send (b, dumpHex);
    if (heardB.parsed != 1)
    {
        std::cerr << "[FAIL] shared input :: once A's answer lapsed, the same bytes unasked did not reach B (parsed="
                  << heardB.parsed << ")\n";
        return 1;
    }

    // Nobody asked: both apply it, as both follow that synth.
    heardA = {}; heardB = {};
    send (a, dumpHex);
    send (b, dumpHex);
    if (heardA.parsed != 1 || heardB.parsed != 1)
    {
        std::cerr << "[FAIL] shared input :: a dump nobody asked for did not reach both (A " << heardA.parsed
                  << ", B " << heardB.parsed << ")\n";
        return 1;
    }

    // Both asked: both are answered.
    heardA = {}; heardB = {};
    DeviceProfileServiceTestAccess::awaitDump (a, "mainSynth", dumpId);
    DeviceProfileServiceTestAccess::awaitDump (b, "mainSynth", dumpId);
    send (a, dumpHex);
    send (b, dumpHex);
    if (heardA.resolved != 1 || heardB.resolved != 1)
    {
        std::cerr << "[FAIL] shared input :: when both asked, both were not answered\n";
        return 1;
    }

    // A on another port: its request says nothing about B's input.
    heardA = {}; heardB = {};
    DeviceProfileServiceTestAccess::lapseAnswers (a);
    DeviceProfileServiceTestAccess::lapseAnswers (b);
    DeviceProfileService c;
    mapOnto (c, port + "-other");
    DeviceProfileServiceTestAccess::awaitDump (c, "mainSynth", dumpId);
    send (b, dumpHex);
    if (heardB.parsed != 1)
    {
        std::cerr << "[FAIL] shared input :: a request on another port held back B's dump\n";
        return 1;
    }

    std::cout << "[PASS] shared MIDI input :: a requested dump reaches only the instance that asked; one nobody asked for reaches all\n";
    return 0;
}

/*  Each plug-in instance has a device service of its own, and each scans the whole profiles folder.
    A profile file loaded unchanged is one engine for all of them (sharedEngineForFile): two GAIA
    instances held every profile in the folder twice, 9.4 MB apiece. */
int runSharedProfileEngineTests()
{
    using ceditor::device::DeviceProfileService;
    using Access = ceditor::device::DeviceProfileServiceTestAccess;

    DeviceProfileService a, b;
    const auto* sysexA = Access::engineFor (a, "test-sysex-synth");
    const auto* sysexB = Access::engineFor (b, "test-sysex-synth");
    const auto* ccA = Access::engineFor (a, "test-cc-synth");
    if (sysexA == nullptr || sysexA != sysexB || ccA == nullptr || ccA == sysexA || ccA != Access::engineFor (b, "test-cc-synth"))
    {
        std::cerr << "[FAIL] shared profile engines :: two services do not share one engine per profile file\n";
        return 1;
    }
    std::cout << "[PASS] shared profile engines :: two services hold one engine per profile file\n";
    return 0;
}

/** The test synth, on hardware input `port` (which does not open here: there is no MIDI hardware,
    and the mapping stays). */
void mapOntoSharedPort (ceditor::device::DeviceProfileService& service, const juce::String& port)
{
    auto* mapping = new juce::DynamicObject();
    mapping->setProperty ("role", "mainSynth");
    mapping->setProperty ("profileId", "test-sysex-synth");
    auto* input = new juce::DynamicObject();
    input->setProperty ("type", "hardwareInput");
    input->setProperty ("id", port);
    input->setProperty ("name", "Shared port");
    mapping->setProperty ("midiInput", juce::var (input));
    service.setDeviceRoleMapping (juce::var (mapping));
}

/** The second process of runSharedInputAcrossProcessesTests (this binary, run with
    --hold-request): waits for the current patch on `port` until `release` exists. */
int holdRequestAsAnotherProcess (const juce::String& port, const juce::File& release)
{
    ceditor::device::DeviceProfileService service;
    mapOntoSharedPort (service, port);
    ceditor::device::DeviceProfileServiceTestAccess::awaitDump (service, "mainSynth", "currentPatchDump");
    std::cout << "holding" << std::endl;
    for (int waited = 0; ! release.exists() && waited < 20000; waited += 20)
        juce::Thread::sleep (20);
    return 0;
}

/*  The same across processes: a standalone and a DAW on one port (Linux, macOS). A service publishes
    its pending requests, and what it was just answered with, in a file; a service in another
    process reads them before applying a reply. First with a real second process, then, for the
    cases a second process cannot be steered into from here, with another process stood in for by
    a copy of a service's own file under a name that is not this process's. */
int runSharedInputAcrossProcessesTests()
{
    using ceditor::device::DeviceProfileService;
    using Access = ceditor::device::DeviceProfileServiceTestAccess;

    const auto port = "xproc-port-" + juce::Uuid().toString().substring (0, 8);
    const auto mapOnto = [&port] (DeviceProfileService& service) { mapOntoSharedPort (service, port); };
    const auto send = [] (DeviceProfileService& service, const juce::String& hex)
    {
        auto* incoming = new juce::DynamicObject();
        incoming->setProperty ("deviceRole", "mainSynth");
        incoming->setProperty ("hex", hex);
        service.ingestIncomingMidiMessage (juce::var (incoming));
    };
    const auto fail = [] (const juce::String& what)
    {
        std::cerr << "[FAIL] shared input across processes :: " << what << "\n";
        return 1;
    };

    const juce::String dumpHex  = "F0 7D 10 01 40 02 43 F7";   // currentPatchDump
    const juce::String otherHex = "F0 7D 10 01 40 03 44 F7";   // currentPatchDump, another patch
    const auto foreign = Access::directory().getChildFile ("another-process-" + juce::Uuid().toString() + ".json");

    int parsedByB = 0, sysexAtB = 0;
    DeviceProfileService b;
    mapOnto (b);
    b.setEventCallback ([&] (const juce::String& name, const juce::var&)
    {
        if (name == "dumpMessageParsed") ++parsedByB;
        if (name == "sysexInputMessage") ++sysexAtB;
    });

    // A second process, this binary, waiting for the current patch on the port.
    {
        const auto release = juce::File::createTempFile (".release");
        juce::ChildProcess other;
        const juce::StringArray command { juce::File::getSpecialLocation (juce::File::currentExecutableFile).getFullPathName(),
                                          "--hold-request", port, release.getFullPathName() };
        if (! other.start (command, juce::ChildProcess::wantStdOut))
            return fail ("could not start a second process");
        // One byte at a time: a larger read waits for that many.
        juce::String said;
        char byte = 0;
        while (! said.contains ("holding") && other.readProcessOutput (&byte, 1) == 1)
            said += juce::String::charToString ((juce::juce_wchar) (unsigned char) byte);

        send (b, dumpHex);
        const auto heldBack = parsedByB == 0 && sysexAtB == 0;
        release.create();
        other.waitForProcessToFinish (20000);
        release.deleteFile();
        if (! said.contains ("holding"))
            return fail ("the second process did not get to waiting: " + said);
        if (! heldBack)
            return fail ("a reply a second process asked for was applied");

        // It has ended, and its file with it: the next one is B's.
        send (b, dumpHex);
        if (parsedByB != 1)
            return fail ("after the second process ended, its reply still did not reach B");
        parsedByB = 0; sysexAtB = 0;
    }

    // A process waiting for the current patch: what it publishes.
    {
        auto a = std::make_unique<DeviceProfileService>();
        mapOnto (*a);
        Access::awaitDump (*a, "mainSynth", "currentPatchDump");
        const auto file = Access::publishedFile (*a);
        const auto entries = juce::JSON::parse (file.loadFileAsString());
        const auto entry = entries[0];
        if (! file.existsAsFile() || ! entries.isArray() || entries.size() != 1
            || entry["input"].toString() != port || entry["profile"].toString() != "test-sysex-synth"
            || entry["kind"].toString() != "dump" || entry["dump"].toString() != "currentPatchDump"
            || (double) entry["until"] < (double) juce::Time::currentTimeMillis() + 30000.0)
            return fail ("a pending request was not published as expected: " + file.loadFileAsString());

        if (! file.copyFileTo (foreign))
            return fail ("could not copy the published file");
        a.reset();
        if (file.exists())
            return fail ("a service's file outlived it");
    }

    // B, in "another process" from it, leaves the reply alone; and a dump of another patch too,
    // which answers the same request.
    send (b, dumpHex);
    send (b, otherHex);
    if (parsedByB != 0 || sysexAtB != 0)
        return fail ("a reply another process asked for was applied (parsed=" + juce::String (parsedByB) + ")");

    // The process got its answer: the request's entry gives way to the answer's, by the bytes.
    {
        DeviceProfileService a;
        mapOnto (a);
        Access::awaitDump (a, "mainSynth", "currentPatchDump");
        send (a, dumpHex);
        Access::publish (a);
        const auto entries = juce::JSON::parse (Access::publishedFile (a).loadFileAsString());
        if (entries.size() != 1 || ! entries[0].hasProperty ("reply") || entries[0].hasProperty ("dump"))
            return fail ("an answered request was not published as its answer: " + Access::publishedFile (a).loadFileAsString());
        Access::publishedFile (a).copyFileTo (foreign);
    }
    send (b, dumpHex);
    if (parsedByB != 0)
        return fail ("the reply another process was answered with was applied");
    send (b, otherHex);
    if (parsedByB != 1)
        return fail ("other bytes, after another process's request was answered, did not reach B");

    // Lapsed entries hold nothing back, and a file that has been lapsed a while is tidied away.
    auto lapsed = juce::JSON::parse (foreign.loadFileAsString());
    for (auto& entry : *lapsed.getArray())
        if (auto* object = entry.getDynamicObject())
            object->setProperty ("until", (double) juce::Time::currentTimeMillis() - 1000.0);
    foreign.replaceWithText (juce::JSON::toString (lapsed));
    send (b, dumpHex);
    if (parsedByB != 2)
        return fail ("a lapsed answer held back a dump");
    if (! foreign.existsAsFile())
        return fail ("a just-lapsed file was deleted (its process may still be running)");
    foreign.setLastModificationTime (juce::Time::getCurrentTime() - juce::RelativeTime::minutes (2));
    send (b, dumpHex);
    if (foreign.existsAsFile())
    {
        foreign.deleteFile();
        return fail ("a file lapsed for minutes was left behind");
    }

    // B's own file goes once nothing is left in it: its request answered, the answer lapsed.
    Access::awaitDump (b, "mainSynth", "currentPatchDump");
    const auto bFile = Access::publishedFile (b);
    send (b, dumpHex);
    Access::publish (b);
    if (! bFile.existsAsFile() || bFile.loadFileAsString().contains ("currentPatchDump"))
        return fail ("an answered request did not give way to its answer in B's file");
    Access::lapseAnswers (b);
    Access::publish (b);
    if (bFile.existsAsFile())
        return fail ("a service with nothing pending or answered kept its file: " + bFile.loadFileAsString());

    std::cout << "[PASS] shared MIDI input across processes :: published requests and answers hold a reply back for the process that asked, and lapse\n";
    return 0;
}

int runChecksumTableTests()
{
    struct Case { const char* id; juce::uint32 ascii; juce::uint32 block; int width; };

    static const Case cases[] = {
        { "sum-7bit",             93,          76, 1 },
        { "roland-7bit",          35,          52, 1 },
        { "ones-complement-7bit", 34,          51, 1 },
        { "xor-7bit",             49,          54, 1 },
        { "offset-7bit",           2,         113, 1 },
        { "sum-8bit",            221,         204, 2 },
        { "twos-complement-8bit", 35,          52, 2 },
        { "crc8",             0x00f4,         225, 2 },
        { "crc16-ccitt",      0x29b1,          68, 3 },
        { "crc16-modbus",     0x4b37,       57492, 3 },
        { "crc32",        0xcbf43926u,   176437988, 5 },
    };

    juce::Array<int> ascii;
    for (const char* p = "123456789"; *p != 0; ++p)
        ascii.add ((int) (unsigned char) *p);

    juce::Array<int> block;
    for (auto byte : { 0x40, 0x00, 0x7f, 0x03, 0x0a })
        block.add (byte);

    auto failures = 0;

    for (const auto& c : cases)
    {
        juce::uint32 got = 0;

        if (! ce::checksums::compute (c.id, ascii, got) || got != c.ascii)
        {
            std::cerr << "[FAIL] checksum " << c.id << " over the check string: expected "
                      << c.ascii << " got " << got << "\n";
            ++failures;
        }

        if (! ce::checksums::compute (c.id, block, got) || got != c.block)
        {
            std::cerr << "[FAIL] checksum " << c.id << " over the address block: expected "
                      << c.block << " got " << got << "\n";
            ++failures;
        }

        if (ce::checksums::widthOf (ce::checksums::canonicalName (c.id)) != c.width)
        {
            std::cerr << "[FAIL] checksum " << c.id << " width\n";
            ++failures;
        }

        // Every byte of a packed checksum has to be a legal SysEx data byte, which is the whole
        // reason a CRC is split rather than truncated.
        for (auto byte : ce::checksums::toBytes (c.id, block))
            if (byte < 0 || byte > 0x7f)
            {
                std::cerr << "[FAIL] checksum " << c.id << " packed a non-data byte\n";
                ++failures;
            }
    }

    // Every spelling already in the wild must keep resolving: profiles say "roland-7bit", scripts
    // say "roland", and neither may break.
    const std::pair<const char*, const char*> aliases[] = {
        { "sum", "sum-7bit" }, { "roland", "roland-7bit" }, { "yamaha", "roland-7bit" },
        { "ones", "ones-complement-7bit" }, { "xor", "xor-7bit" }, { "kawai", "offset-7bit" },
        { "crc16", "crc16-ccitt" }, { "twos-complement", "twos-complement-8bit" },
    };
    for (const auto& [alias, canonical] : aliases)
        if (ce::checksums::canonicalName (alias) != juce::String (canonical))
        {
            std::cerr << "[FAIL] checksum alias " << alias << " no longer resolves\n";
            ++failures;
        }

    // An unknown name must report rather than fall through to anything — the bug this phase fixed on
    // the scripting side, where it silently returned a Roland checksum.
    juce::uint32 ignored = 0;
    if (ce::checksums::compute ("sha256", block, ignored))
    {
        std::cerr << "[FAIL] an unknown checksum name was accepted\n";
        ++failures;
    }

    return failures;
}

// MIDI-CI live discovery (MIDI 2.0 plan, phase M1). No hardware: two MidiCiSessions are wired output ->
// input to each other (a software loopback, the JUCE-sanctioned way to exercise juce::midi_ci::Device).
// The send callbacks only enqueue, so delivery is single-threaded and non-reentrant. Proves the whole
// initiator path end-to-end: Device construction, Discovery broadcast, bytestream SysEx framing
// (createSysExMessage / getSysExDataSpan), incoming dispatch, and the discovery listener callback.
int runMidiCiTests()
{
    using ceditor::device::MidiCiSession;

    std::deque<juce::MidiMessage> inboxA, inboxB; // inboxX holds messages destined for session X
    bool peHandshakeForB = false;

    std::unique_ptr<MidiCiSession> a, b;
    a = std::make_unique<MidiCiSession> (
        [&inboxB] (const juce::MidiMessage& m) { inboxB.push_back (m); },
        [&] (uint32_t muid, const juce::var&, const juce::var&)
        {
            if (b != nullptr && muid == b->getMuid()) peHandshakeForB = true;
        });
    b = std::make_unique<MidiCiSession> (
        [&inboxA] (const juce::MidiMessage& m) { inboxA.push_back (m); });

    const auto hasDiscovered = [] (const MidiCiSession& s, uint32_t muid)
    {
        const auto v = s.getDiscoveredMuids();
        return std::find (v.begin(), v.end(), muid) != v.end();
    };

    // Drive the exchange one batch at a time. We only need Discovery for this slice, so we stop the
    // moment both sides know each other — before the auto Property-Exchange traffic (which the
    // delegate-less responder NAKs + re-queues) can amplify across rounds. Each round processes only
    // the messages already queued, so a single round can't explode.
    a->startDiscovery();
    a->pump();
    b->pump();

    bool discoveredBothWays = false;
    for (int round = 0; round < 16 && ! discoveredBothWays; ++round)
    {
        std::deque<juce::MidiMessage> da, db;
        std::swap (da, inboxA);
        std::swap (db, inboxB);
        for (const auto& m : da) a->handleIncomingSysex (m);
        for (const auto& m : db) b->handleIncomingSysex (m);
        a->pump();
        b->pump();
        discoveredBothWays = hasDiscovered (*a, b->getMuid()) && hasDiscovered (*b, a->getMuid());
    }

    if (! hasDiscovered (*a, b->getMuid()))
    {
        std::cerr << "[FAIL] MIDI-CI :: initiator did not discover the responder over the loopback\n";
        return 1;
    }
    if (! hasDiscovered (*b, a->getMuid()))
    {
        std::cerr << "[FAIL] MIDI-CI :: responder did not see the initiator (Discovery is not bidirectional)\n";
        return 1;
    }

    std::cout << "[PASS] MIDI-CI :: loopback discovery (initiator <-> responder MUIDs exchanged)"
              << (peHandshakeForB ? " + PE capabilities handshake" : "") << "\n";

    // ---- Part 2: Property Exchange extracts everything import-midici.mjs needs ----
    // Initiator (our MidiCiSession) against a property-serving responder. The library auto-fetches
    // DeviceInfo + ChannelList; the controller map (AllCtrlList) and presets (ProgramList) are NOT
    // auto-fetched, so on the PE-capabilities callback we explicitly fetchProperty() for them. Everything
    // arrives over several round-trips, so we pump + poll until all four properties are present.
    std::deque<juce::MidiMessage> toInit, toResp;
    std::unique_ptr<MidiCiSession> init;
    init = std::make_unique<MidiCiSession> (
        [&toResp] (const juce::MidiMessage& m) { toResp.push_back (m); },
        [&] (uint32_t muid, const juce::var&, const juce::var&)
        {
            if (init != nullptr) { init->fetchProperty (muid, "AllCtrlList"); init->fetchProperty (muid, "ProgramList"); }
        });
    TestCiResponder responder ([&toInit] (const juce::MidiMessage& m) { toInit.push_back (m); });

    init->startDiscovery();
    init->pump();
    responder.pump();

    juce::var deviceInfo, channelList, controllers, programs;
    for (int round = 0; round < 64; ++round)
    {
        std::deque<juce::MidiMessage> di, dr;
        std::swap (di, toInit);
        std::swap (dr, toResp);
        for (const auto& m : di) init->handleIncomingSysex (m);
        for (const auto& m : dr) responder.feed (m);
        init->pump();
        responder.pump();

        deviceInfo  = init->getDeviceInfo (responder.muid());
        channelList = init->getChannelList (responder.muid());
        controllers = init->getFetchedProperty (responder.muid(), "AllCtrlList");
        programs    = init->getFetchedProperty (responder.muid(), "ProgramList");
        if (deviceInfo != juce::var{} && channelList != juce::var{} && controllers != juce::var{} && programs != juce::var{})
            break;
    }

    auto* infoObj = deviceInfo.getDynamicObject();
    if (infoObj == nullptr || infoObj->getProperty ("manufacturer").toString() != "CEditor Test")
    {
        std::cerr << "[FAIL] MIDI-CI :: Property Exchange did not return the responder's DeviceInfo JSON"
                  << " (got " << juce::JSON::toString (deviceInfo) << ")\n";
        return 1;
    }
    if (channelList == juce::var{})
    {
        std::cerr << "[FAIL] MIDI-CI :: Property Exchange did not return the responder's ChannelList JSON\n";
        return 1;
    }
    auto* ctrlArray = controllers.getArray();
    if (ctrlArray == nullptr || ctrlArray->size() != 2
        || (*ctrlArray)[0].getProperty ("title", {}).toString() != "Filter Cutoff"
        || (int) (*ctrlArray)[0].getProperty ("ctrlIndex", {})[0] != 74)
    {
        std::cerr << "[FAIL] MIDI-CI :: explicit AllCtrlList fetch did not return the controller map"
                  << " (got " << juce::JSON::toString (controllers) << ")\n";
        return 1;
    }
    auto* progArray = programs.getArray();
    if (progArray == nullptr || progArray->size() != 2)
    {
        std::cerr << "[FAIL] MIDI-CI :: explicit ProgramList fetch did not return the presets\n";
        return 1;
    }

    std::cout << "[PASS] MIDI-CI :: property exchange extracts DeviceInfo + ChannelList + AllCtrlList + ProgramList"
              << " (manufacturer=\"" << infoObj->getProperty ("manufacturer").toString() << "\", "
              << ctrlArray->size() << " controllers, " << progArray->size() << " presets)\n";

    // ---- Part 3: Profile Configuration (M2) — inquire the responder's block profiles ----
    // The responder hosts one active block-level profile; the initiator inquires and should see it,
    // marked active. Fresh session pair so the inbox flow is independent of the parts above.
    std::deque<juce::MidiMessage> toInit3, toResp3;
    auto init3 = std::make_unique<MidiCiSession> ([&toResp3] (const juce::MidiMessage& m) { toResp3.push_back (m); });
    TestCiResponder responder3 ([&toInit3] (const juce::MidiMessage& m) { toInit3.push_back (m); });

    init3->startDiscovery();
    init3->pump();
    responder3.pump();

    const juce::String kProfileHex = "7E 21 09 01 00";
    const auto profileSeen = [&] (bool wantActive)
    {
        const auto profiles = init3->getProfiles (responder3.muid());
        auto* arr = profiles.getArray();
        return arr != nullptr && std::any_of (arr->begin(), arr->end(), [&] (const juce::var& p)
        {
            return p.getProperty ("id", {}).toString() == kProfileHex
                   && (! wantActive || static_cast<bool> (p.getProperty ("active", false)));
        });
    };

    bool inquired = false, supported = false, enabled = false, active = false;
    for (int round = 0; round < 64; ++round)
    {
        std::deque<juce::MidiMessage> di, dr;
        std::swap (di, toInit3);
        std::swap (dr, toResp3);
        for (const auto& m : di) init3->handleIncomingSysex (m);
        for (const auto& m : dr) responder3.feed (m);
        init3->pump();
        responder3.pump();

        const auto seen = init3->getDiscoveredMuids();
        if (! inquired && std::find (seen.begin(), seen.end(), responder3.muid()) != seen.end())
        {
            init3->inquireProfiles (responder3.muid());
            inquired = true;
            continue;
        }
        if (inquired && ! supported && profileSeen (false))
            supported = true;                                   // the device reported the profile
        if (supported && ! enabled)
        {
            init3->setProfileEnabled (responder3.muid(), kProfileHex, true);
            enabled = true;                                     // ask the device to activate it
            continue;
        }
        if (enabled && profileSeen (true))
        {
            active = true;                                      // device reported it active
            break;
        }
    }

    if (! supported)
    {
        std::cerr << "[FAIL] MIDI-CI :: profile inquiry did not report the responder's block profile\n";
        return 1;
    }
    if (! active)
    {
        std::cerr << "[FAIL] MIDI-CI :: enabling the profile did not make it active in the initiator's view"
                  << " (got " << juce::JSON::toString (init3->getProfiles (responder3.muid())) << ")\n";
        return 1;
    }

    std::cout << "[PASS] MIDI-CI :: profile configuration (inquired " << kProfileHex << ", enabled it, saw it go active)\n";
    return 0;
}
}

// A responder for ce.ci: resources a script reads, sets and follows, profiles on the device and on a
// channel, and a property it never answers. Its X-Name is followed by subscription updates.
struct CiScriptResponder : juce::midi_ci::DeviceMessageHandler,
                           juce::midi_ci::DeviceListener,
                           juce::midi_ci::PropertyDelegate,
                           juce::midi_ci::ProfileDelegate
{
    std::function<void (const juce::MidiMessage&)> send;
    std::optional<juce::midi_ci::Device> device;
    juce::String name = "Init", text = "hello";
    std::map<juce::String, std::pair<juce::midi_ci::MUID, juce::String>> subscribers;   // subscribeId -> (muid, resource)
    static constexpr juce::midi_ci::Profile kBlock { std::byte { 0x7E }, std::byte { 0x21 }, std::byte { 0x09 }, std::byte { 0x01 }, std::byte { 0x00 } };
    static constexpr juce::midi_ci::Profile kChannel { std::byte { 0x7E }, std::byte { 0x31 }, std::byte { 0x00 }, std::byte { 0x01 }, std::byte { 0x00 } };

    static juce::ump::DeviceInfo testInfo()
    {
        return { { std::byte { 0x42 }, std::byte { 0x00 }, std::byte { 0x00 } },
                 { std::byte { 0x01 }, std::byte { 0x00 } },
                 { std::byte { 0x02 }, std::byte { 0x00 } },
                 { std::byte { 0x01 }, std::byte { 0x00 }, std::byte { 0x00 }, std::byte { 0x00 } } };
    }
    explicit CiScriptResponder (std::function<void (const juce::MidiMessage&)> s, juce::ump::DeviceInfo info = testInfo()) : send (std::move (s))
    {
        namespace ci = juce::midi_ci;
        juce::Random r;
        r.setSeedRandomly();
        device.emplace (ci::DeviceOptions()
                            .withOutputs ({ this })
                            .withDeviceInfo (info)
                            .withFeatures (ci::DeviceFeatures().withPropertyExchangeSupported (true).withProfileConfigurationSupported (true))
                            .withProductInstanceId (ci::DeviceOptions::makeProductInstanceId (r))
                            .withPropertyDelegate (this)
                            .withProfileDelegate (this));
        device->addListener (*this);
        if (auto* host = device->getProfileHost())
        {
            host->addProfile ({ kBlock, ci::ChannelAddress {}.withChannel (ci::ChannelInGroup::wholeBlock) }, 1);
            host->setProfileEnablement ({ kBlock, ci::ChannelAddress {}.withChannel (ci::ChannelInGroup::wholeBlock) }, 1);
            host->addProfile ({ kChannel, ci::ChannelAddress {}.withChannel (ci::ChannelInGroup::channel2) }, 1);
        }
    }
    ~CiScriptResponder() override { if (device.has_value()) device->removeListener (*this); }

    void processMessage (juce::ump::BytesOnGroup msg) override { if (send) send (juce::MidiMessage::createSysExMessage (msg.bytes)); }
    void feed (const juce::MidiMessage& m) { if (device.has_value() && m.isSysEx()) device->processMessage ({ 0, m.getSysExDataSpan() }); }
    void pump() { if (device.has_value()) device->sendPendingMessages(); }
    uint32_t muid() const { return device.has_value() ? device->getMuid().get() : 0; }

    static juce::midi_ci::PropertyReplyData json (const juce::String& s)
    {
        juce::midi_ci::PropertyReplyData d;
        for (const auto c : s) d.body.push_back (static_cast<std::byte> (static_cast<uint8_t> (c)));
        return d;
    }
    juce::midi_ci::PropertyReplyData propertyGetDataRequested (juce::midi_ci::MUID, const juce::midi_ci::PropertyRequestHeader& h) override
    {
        if (h.resource == "ResourceList") return json (R"([{"resource":"DeviceInfo"},{"resource":"X-Name","canSet":"full","canSubscribe":true},{"resource":"X-Text"}])");
        if (h.resource == "DeviceInfo")   return json (R"({"manufacturer":"CEditor Test","family":"SynthFam","model":"TestSynth","version":"1.0"})");
        if (h.resource == "X-Name")       return json ("{\"name\":\"" + name + "\"}");
        if (h.resource == "X-Text")
        {
            juce::midi_ci::PropertyReplyData d;
            d.header.mediaType = "text/plain";
            d.header.mutualEncoding = juce::midi_ci::Encoding::mcoded7;
            std::vector<std::byte> raw;
            for (const auto c : text) raw.push_back (static_cast<std::byte> (static_cast<uint8_t> (c)));
            d.body = juce::midi_ci::Encodings::toMcoded7 (raw);
            return d;
        }
        juce::midi_ci::PropertyReplyData d; d.header.status = 404; d.header.message = "No such resource"; return d;
    }
    juce::midi_ci::PropertyReplyHeader propertySetDataRequested (juce::midi_ci::MUID, const juce::midi_ci::PropertyRequestData& data) override
    {
        juce::midi_ci::PropertyReplyHeader h;
        const auto body = juce::midi_ci::Encodings::decode (data.body, data.header.mutualEncoding);
        if (data.header.resource == "X-Name")
        {
            name = juce::midi_ci::Encodings::jsonFrom7BitText (body).getProperty ("name", "").toString();
            for (const auto& [id, who] : subscribers)
            {
                juce::midi_ci::PropertySubscriptionHeader sh;
                sh.command = juce::midi_ci::PropertySubscriptionCommand::full;
                sh.subscribeId = id;
                sh.resource = who.second;
                const auto update = juce::midi_ci::Encodings::jsonTo7BitText (juce::JSON::parse ("{\"name\":\"" + name + "\"}"));
                device->getPropertyHost()->sendSubscriptionUpdate (who.first, sh, update, [] (const auto&) {});
            }
            return h;
        }
        if (data.header.resource == "X-Text" && data.header.mediaType == "text/plain")
        {
            text = juce::String::fromUTF8 ((const char*) body.data(), (int) body.size());
            return h;
        }
        h.status = 405; h.message = "Read only"; return h;
    }
    bool subscriptionStartRequested (juce::midi_ci::MUID, const juce::midi_ci::PropertySubscriptionHeader& h) override { return h.resource == "X-Name"; }
    void subscriptionDidStart (juce::midi_ci::MUID m, const juce::String& id, const juce::midi_ci::PropertySubscriptionHeader& h) override { subscribers.insert_or_assign (id, std::make_pair (m, h.resource)); }
    void subscriptionWillEnd (juce::midi_ci::MUID, const juce::midi_ci::Subscription& sub) override { subscribers.erase (sub.subscribeId); }
    void profileEnablementRequested (juce::midi_ci::MUID, juce::midi_ci::ProfileAtAddress paa, int numChannels, bool enabled) override
    {
        if (auto* host = device.has_value() ? device->getProfileHost() : nullptr)
            host->setProfileEnablement (paa, enabled ? juce::jmax (1, numChannels) : 0);
    }
};

/*  ce.ci's session over a loopback: what a script is told about a device, reads and sets with their
    statuses, a subscription's updates, a request nobody answers, profiles per channel, and a device
    that leaves. */
int runCiScriptTests()
{
    using ceditor::device::MidiCiSession;
    int failures = 0;
    const auto check = [&failures] (bool ok, const juce::String& label, const juce::var& got = {})
    {
        std::cout << (ok ? "[PASS] ce.ci :: " : "[FAIL] ce.ci :: ") << label;
        if (! ok && ! got.isVoid()) std::cout << " (got " << juce::JSON::toString (got, true) << ")";
        std::cout << "\n";
        if (! ok) ++failures;
    };

    std::deque<juce::MidiMessage> toSession, toDevice;
    bool deviceListens = true;
    double now = 1000.0;
    MidiCiSession session ([&toDevice] (const juce::MidiMessage& m) { toDevice.push_back (m); });
    session.setClockForTesting ([&now] { return now; });
    auto device = std::make_unique<CiScriptResponder> ([&toSession] (const juce::MidiMessage& m) { toSession.push_back (m); });
    std::vector<uint32_t> added, removed;
    std::vector<juce::String> profileChanges;
    session.setEvents ({ [&added] (uint32_t m) { added.push_back (m); }, [&removed] (uint32_t m) { removed.push_back (m); },
                         [&profileChanges] (uint32_t, const juce::String& hex, int channel, bool on)
                         { profileChanges.push_back (hex + "@" + juce::String (channel) + (on ? " on" : " off")); } });
    const auto run = [&] (int rounds = 64)
    {
        for (int round = 0; round < rounds; ++round)
        {
            std::deque<juce::MidiMessage> ds, dd;
            std::swap (ds, toSession);
            std::swap (dd, toDevice);
            for (const auto& m : ds) session.handleIncomingSysex (m);
            if (device != nullptr && deviceListens) for (const auto& m : dd) device->feed (m);
            session.tick (now);
            if (device != nullptr) device->pump();
            if (toSession.empty() && toDevice.empty()) break;
        }
    };

    session.startDiscovery();
    session.pump();
    run();
    const auto muid = device->muid();
    check (added.size() == 1 && added[0] == muid, "a device that answers is announced");
    const auto d = session.describe (muid);
    check (d.getProperty ("manufacturer", "").toString() == "42" && d.getProperty ("family", "").toString() == "01 00"
           && d.getProperty ("model", "").toString() == "02 00" && d.getProperty ("version", "").toString() == "01 00 00 00",
           "who it is, as hex text in the form device profiles use", d);
    check ((bool) d.getProperty ("propertyExchange", false) && (bool) d.getProperty ("profiles", false), "what it supports", d);
    check (d.getProperty ("names", {}).getProperty ("model", "").toString() == "TestSynth", "its names, from its DeviceInfo", d);

    juce::var got;
    const auto keep = [&got] (const juce::var& v) { got = v; };
    check (session.get (muid, "X-Name", {}, keep), "get is sent");
    run();
    check ((bool) got.getProperty ("ok", false) && (int) got.getProperty ("status", 0) == 200
           && got.getProperty ("body", {}).getProperty ("name", "").toString() == "Init"
           && got.getProperty ("mediaType", "").toString() == "application/json", "a JSON resource comes as a table", got);
    session.get (muid, "Missing", {}, keep);
    run();
    check (! (bool) got.getProperty ("ok", true) && (int) got.getProperty ("status", 0) == 404
           && got.getProperty ("message", "").toString() == "No such resource", "the device's own refusal, with its status and message", got);
    session.get (muid, "X-Text", {}, keep);
    run();
    check (got.getProperty ("body", {}).toString() == "hello", "a text resource comes as text, Mcoded7 undone", got);

    juce::var updates = juce::Array<juce::var>();
    const auto id = session.subscribe (muid, "X-Name", {}, [&updates] (const juce::var& u) { updates.getArray()->add (u); });
    run();
    check (id > 0, "subscribe gives an id");
    session.set (muid, "X-Name", juce::JSON::parse ("{\"name\":\"Warm\"}"), {}, keep);
    run();
    check ((bool) got.getProperty ("ok", false), "set changes a resource", got);
    check (updates.size() >= 1 && updates[updates.size() - 1].getProperty ("command", "").toString() == "full"
           && updates[updates.size() - 1].getProperty ("body", {}).getProperty ("name", "").toString() == "Warm",
           "the change reaches the subscription", updates);
    session.set (muid, "ReadOnly", juce::JSON::parse ("{}"), {}, keep);
    run();
    check (! (bool) got.getProperty ("ok", true) && (int) got.getProperty ("status", 0) == 405, "a resource the device will not change says 405", got);
    auto textOpts = new juce::DynamicObject();
    textOpts->setProperty ("mediaType", "text/plain");
    session.set (muid, "X-Text", "written", juce::var (textOpts), keep);
    run();
    check ((bool) got.getProperty ("ok", false) && device->text == "written", "text is sent as text", got);

    check (session.unsubscribe (id) && ! session.unsubscribe (id), "unsubscribe, once");
    run();
    const auto before = updates.size();
    session.set (muid, "X-Name", juce::JSON::parse ("{\"name\":\"Cold\"}"), {}, keep);
    run();
    check (updates.size() == before && device->subscribers.empty(), "after unsubscribe no update comes, and the device was told");

    juce::var profiles;
    session.inquireProfiles (muid, [&profiles] (const juce::var& v) { profiles = v; });
    run();
    const auto profileText = juce::JSON::toString (profiles, true);
    check (profileText.contains ("\"id\": \"7E 21 09 01 00\", \"address\": \"device\"")
           && profileText.contains ("\"id\": \"7E 31 00 01 00\", \"address\": 3, \"enabled\": false"),
           "profiles on the device and on a channel", profiles);
    session.setProfile (muid, "7E 31 00 01 00", true, 3);
    run();
    check (std::find (profileChanges.begin(), profileChanges.end(), juce::String ("7E 31 00 01 00@3 on")) != profileChanges.end(),
           "a profile turned on for a channel is raised", juce::var (juce::StringArray (profileChanges.data(), (int) profileChanges.size()).joinIntoString (", ")));
    check (juce::JSON::toString (session.profiles (muid), true).contains ("\"id\": \"7E 31 00 01 00\", \"address\": 3, \"enabled\": true"),
           "and profiles shows it on", session.profiles (muid));

    deviceListens = false;
    session.get (muid, "X-Name", {}, keep);
    got = juce::var();
    run();
    check (got.isVoid(), "nothing yet while the device is silent");
    now += 3001.0;
    session.tick (now);
    check (! (bool) got.getProperty ("ok", true) && got.getProperty ("message", "").toString() == "no reply in time", "no reply in time ends the request", got);
    deviceListens = true;

    session.subscribe (muid, "X-Name", {}, [&updates] (const juce::var& u) { updates.getArray()->add (u); });
    run();
    device.reset();      // the device leaves: it invalidates its MUID
    run();
    check (removed.size() == 1 && removed[0] == muid, "a device that leaves is announced");
    check (updates[updates.size() - 1].getProperty ("command", "").toString() == "end", "its subscriptions end with it", updates);
    check (! session.busy(), "nothing is left waiting");
    return failures;
}

/*  ce.ci through the device service, as every runtime reaches it: one command at a time, answers as
    "ciReply" events under the command's token, a device matched to the role's profile by the codes
    its Discovery reply carries, and the events a script hears. The MIDI output is a tap here. */
int runCiServiceTests()
{
    using ceditor::device::DeviceProfileService;
    using ceditor::device::DeviceProfileServiceTestAccess;
    int failures = 0;
    const auto check = [&failures] (bool ok, const juce::String& label, const juce::var& got = {})
    {
        std::cout << (ok ? "[PASS] ce.ci service :: " : "[FAIL] ce.ci service :: ") << label;
        if (! ok && ! got.isVoid()) std::cout << " (got " << juce::JSON::toString (got, true) << ")";
        std::cout << "\n";
        if (! ok) ++failures;
    };

    DeviceProfileService service;
    auto* mapping = new juce::DynamicObject();
    mapping->setProperty ("role", "mainSynth");
    mapping->setProperty ("profileId", "test-sysex-synth");
    auto* output = new juce::DynamicObject();
    output->setProperty ("type", "hardwareOutput");
    output->setProperty ("id", "ci-test-out");
    output->setProperty ("name", "CI test");
    mapping->setProperty ("midiDestination", juce::var (output));
    service.setDeviceRoleMapping (juce::var (mapping));

    std::deque<juce::MidiMessage> toDevice, toService;
    service.rawMidiTapForTesting = [&toDevice] (const juce::String&, const juce::MidiMessage& m) { toDevice.push_back (m); };
    // The synth test-sysex-synth describes: 7D, family 00 01, model 00 02, version 00 00 00 01.
    const juce::ump::DeviceInfo identity { { std::byte { 0x7D }, std::byte {}, std::byte {} }, { std::byte {}, std::byte { 0x01 } },
                                           { std::byte {}, std::byte { 0x02 } }, { std::byte {}, std::byte {}, std::byte {}, std::byte { 0x01 } } };
    CiScriptResponder device ([&toService] (const juce::MidiMessage& m) { toService.push_back (m); }, identity);
    std::vector<std::pair<juce::String, juce::var>> events;
    service.setEventCallback ([&events] (const juce::String& name, const juce::var& payload)
    {
        if (name.startsWith ("ci")) events.push_back ({ name, payload });
    });
    const auto run = [&]
    {
        for (int round = 0; round < 64; ++round)
        {
            std::deque<juce::MidiMessage> dd, ds;
            std::swap (dd, toDevice);
            std::swap (ds, toService);
            for (const auto& m : dd) device.feed (m);
            for (const auto& m : ds)
            {
                juce::Array<int> bytes;
                for (int i = 0; i < m.getRawDataSize(); ++i) bytes.add (m.getRawData()[i]);
                auto* in = new juce::DynamicObject();
                in->setProperty ("deviceRole", "mainSynth");
                in->setProperty ("hex", ceditor::device::DeviceProfileEngine::bytesToHex (bytes));
                in->setProperty ("messageType", "sysex");
                service.ingestIncomingMidiMessage (juce::var (in));
            }
            device.pump();
            DeviceProfileServiceTestAccess::tick (service);
            if (toDevice.empty() && toService.empty()) break;
        }
    };
    const auto command = [&service] (const juce::String& json) { return service.ciCommand (juce::JSON::parse (json)); };
    const auto reply = [&events] (const juce::var& token) -> juce::var
    {
        for (auto it = events.rbegin(); it != events.rend(); ++it)
            if (it->first == "ciReply" && it->second.getProperty ("token", {}) == token) return it->second;
        return {};
    };
    const auto named = [&events] (const juce::String& name) -> juce::var
    {
        for (auto it = events.rbegin(); it != events.rend(); ++it) if (it->first == name) return it->second;
        return {};
    };

    const auto refused = command (R"({"op":"discover","role":"nobody"})");
    check (! (bool) refused.getProperty ("ok", true) && refused.getProperty ("error", "").toString().contains ("no hardware MIDI output"), "a role with no output cannot be asked", refused);
    const auto started = command (R"({"op":"discover","role":"mainSynth","timeoutMs":100})");
    check ((bool) started.getProperty ("ok", false) && ! started.getProperty ("token", {}).isVoid(), "discover answers with a token", started);
    run();
    const auto found = named ("ciDiscovered");
    check (found.getProperty ("muid", {}) == juce::var ((juce::int64) device.muid()) && found.getProperty ("role", "").toString() == "mainSynth",
           "a device that answers is raised as ciDiscovered", found);
    check ((bool) found.getProperty ("matchesProfile", false), "it is matched to the role's device profile by its Discovery codes", found);
    check (found.getProperty ("names", {}).getProperty ("model", "").toString() == "TestSynth", "and announced once it has said its names", found);
    juce::Thread::sleep (150);
    run();
    const auto done = reply (started.getProperty ("token", {}));
    check ((bool) done.getProperty ("final", false) && done.getProperty ("result", {}).size() == 1, "when the time is up, the devices that answered", done);
    check (command (R"({"op":"devices"})").size() == 1, "devices lists them without asking");

    const auto muid = juce::String ((juce::int64) device.muid());
    const auto get = command (R"({"op":"get","muid":)" + muid + R"(,"resource":"X-Name"})");
    run();
    const auto got = reply (get.getProperty ("token", {}));
    check (got.getProperty ("result", {}).getProperty ("body", {}).getProperty ("name", "").toString() == "Init", "get answers under its token", got);
    const auto sub = command (R"({"op":"subscribe","muid":)" + muid + R"(,"resource":"X-Name","token":"page-7"})");
    run();
    check (sub.getProperty ("token", "").toString() == "page-7", "a caller's own token is kept", sub);
    command (R"({"op":"set","muid":)" + muid + R"(,"resource":"X-Name","body":{"name":"Warm"}})");
    run();
    const auto update = reply ("page-7");
    check (update.getProperty ("result", {}).getProperty ("command", "").toString() == "full" && ! (bool) update.getProperty ("final", true),
           "a subscription's update comes under its token, not final", update);
    check ((bool) command (R"({"op":"unsubscribe","id":"page-7"})") && ! (bool) command (R"({"op":"unsubscribe","id":"page-7"})"), "unsubscribe, once");

    const auto listed = command (R"({"op":"profiles","muid":)" + muid + "}");
    check (juce::JSON::toString (listed).contains ("7E 21 09 01 00"), "profiles as last asked, at once", listed);
    check ((bool) command (R"({"op":"setProfile","muid":)" + muid + R"(,"id":"7E 31 00 01 00","on":true,"channel":3})"), "setProfile is sent");
    run();
    const auto changed = named ("ciProfileChanged");
    check (changed.getProperty ("id", "").toString() == "7E 31 00 01 00" && (int) changed.getProperty ("address", 0) == 3 && (bool) changed.getProperty ("enabled", false),
           "the device's new state is raised as ciProfileChanged", changed);
    const auto unknown = command (R"({"op":"get","muid":12345,"resource":"X-Name"})");
    check (! (bool) unknown.getProperty ("ok", true) && unknown.getProperty ("error", "").toString().contains ("has answered"), "a device nobody found is refused", unknown);
    // The service says goodbye to the device as it closes (its MUID is invalidated), and the tap
    // that would hear it goes before the service does.
    service.setEventCallback (nullptr);
    service.rawMidiTapForTesting = nullptr;
    return failures;
}

/**
 * A profile's display.middleC reaches every parameter's descriptor, unless the parameter has its
 * own, and the profile document itself is left as it was. ce.format.parameter and the value
 * readouts write a note parameter from the descriptor, so this is where a Yamaha's C3 comes from.
 */
int runProfileMiddleCTests (const juce::File& file)
{
    auto document = juce::JSON::parse (file.loadFileAsString());
    auto* root = document.getDynamicObject();
    auto* parameters = document.getProperty ("parameters", {}).getArray();
    if (root == nullptr || parameters == nullptr || parameters->size() < 2)
    {
        std::cerr << "[FAIL] middleC: the test profile has fewer than two parameters\n";
        return 1;
    }
    auto* profileDisplay = new juce::DynamicObject();
    profileDisplay->setProperty ("middleC", 3);
    root->setProperty ("display", juce::var (profileDisplay));
    auto* own = new juce::DynamicObject();
    own->setProperty ("middleC", 4);
    own->setProperty ("format", "note");
    if (auto* second = parameters->getReference (1).getDynamicObject())
        second->setProperty ("display", juce::var (own));

    ceditor::device::DeviceProfileEngine engine;
    juce::String error;
    if (! engine.loadFromJson (juce::JSON::toString (document), error))
    {
        std::cerr << "[FAIL] middleC: profile did not load: " << error << "\n";
        return 1;
    }
    int failures = 0;
    for (int pass = 0; pass < 2; ++pass)   // twice: the first answer must not have changed the document
    {
        const auto descriptors = engine.listParameterDescriptors();
        auto* list = descriptors.getArray();
        if (list == nullptr || list->size() < 2) { std::cerr << "[FAIL] middleC: no descriptors\n"; return 1; }
        const auto first = (*list)[0].getProperty ("display", {}).getProperty ("middleC", {});
        const auto second = (*list)[1].getProperty ("display", {});
        if (! first.isInt() && ! first.isDouble()) { std::cerr << "[FAIL] middleC: the profile's 3 did not reach the first parameter\n"; ++failures; }
        else if ((int) first != 3) { std::cerr << "[FAIL] middleC: first parameter got " << first.toString() << ", not 3\n"; ++failures; }
        if ((int) second.getProperty ("middleC", {}) != 4 || second.getProperty ("format", {}).toString() != "note")
        {
            std::cerr << "[FAIL] middleC: the parameter's own 4 (and its format) did not survive: " << juce::JSON::toString (second, true) << "\n";
            ++failures;
        }
    }
    if (failures == 0) std::cout << "[PASS] a profile's display.middleC reaches each parameter that has none of its own\n";
    return failures;
}

int main (int argc, char** argv)
{
    if (argc == 4 && juce::String (argv[1]) == "--hold-request")
        return holdRequestAsAnotherProcess (juce::String (argv[2]), juce::File (juce::String (argv[3])));

    // Run a copied test binary beside an installed profile tree to prove checkout independence.
    if (argc == 2 && juce::String (argv[1]) == "--installed-profiles")
    {
        ceditor::device::DeviceProfileService service;
        const auto list = service.listProfiles();
        const auto installRoot = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
        bool genericFound = false;
        if (auto* entries = list.getArray())
            for (const auto& entry : *entries)
            {
                const juce::File source (entry.getProperty ("filePath", "").toString());
                if (! source.isAChildOf (installRoot))
                {
                    std::cerr << "[FAIL] profile escaped installed tree: " << source.getFullPathName() << '\n';
                    return 1;
                }
                genericFound |= entry.getProperty ("id", "").toString() == "generic-cc-dpd";
            }
        auto* mapping = new juce::DynamicObject();
        mapping->setProperty ("role", "freshDevice");
        mapping->setProperty ("profileId", "generic-cc-dpd");
        if (! genericFound || ! (bool) service.setDeviceRoleMapping (juce::var (mapping)).getProperty ("ok", false))
            return 1;
        std::cout << "[PASS] installed profiles resolve locally and map a new MIDI device\n";
        return 0;
    }
    const auto root = profileRoot();
    const juce::Array<juce::File> profiles {
        root.getChildFile ("test-cc-synth.ceditor-device.json"),
        root.getChildFile ("test-sysex-synth.ceditor-device.json"),
        root.getChildFile ("test-nrpn-synth.ceditor-device.json"),
        root.getChildFile ("roland-sh-201.ceditor-device.json"),
        root.getChildFile ("roland-gaia.ceditor-device.json")
    };

    auto failures = 0;
    for (const auto& profile : profiles)
        failures += runProfileTests (profile);

    failures += runPolicyTests (root.getChildFile ("test-cc-synth.ceditor-device.json"));
    failures += runNrpnTimingTests (root.getChildFile ("test-nrpn-synth.ceditor-device.json"));
    failures += runLsbFirstEncodingTests (root.getChildFile ("test-nrpn-synth.ceditor-device.json"));
    failures += runDumpShapeAndCodecTests (root.getChildFile ("test-sysex-synth.ceditor-device.json"));
    failures += runProfileCacheTests();
    failures += runMonitorClearTests();
    failures += runRealtimeMonitorTests();
    failures += runRequestRetryTests();
    failures += runServiceRequestTests();
    failures += runSharedInputReplyTests();
    failures += runSharedProfileEngineTests();
    failures += runSharedInputAcrossProcessesTests();
    failures += runMidiCiTests();
    failures += runCiScriptTests();
    failures += runCiServiceTests();
    failures += runChecksumTableTests();
    failures += runNibbledEncoderTests (root.getChildFile ("roland-gaia-sh01.ceditor-device.json"));
    failures += runGaiaNoteChoiceTests (root.getChildFile ("roland-gaia-sh01.ceditor-device.json"));
    failures += runPatchDumpTests (root.getChildFile ("roland-gaia-sh01.ceditor-device.json"));
    failures += runDumpBuildTests (root.getChildFile ("roland-gaia-sh01.ceditor-device.json"));
    failures += runDumpCapturePolicyTests (root.getChildFile ("roland-gaia-sh01.ceditor-device.json"));
    failures += runDumpMemorySlotTests (root.getChildFile ("yamaha-an1x-dpd.ceditor-device.json"),
                                        root.getChildFile ("roland-gaia-sh01.ceditor-device.json"));
    failures += runPresetRecallTests (root);
    failures += runProfileMiddleCTests (root.getChildFile ("test-cc-synth.ceditor-device.json"));

    if (failures == 0)
    {
        std::cout << "Device Profile Engine tests passed.\n";
        return 0;
    }

    std::cerr << failures << " Device Profile Engine test(s) failed.\n";
    return 1;
}
