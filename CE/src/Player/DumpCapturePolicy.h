#pragma once

#include <juce_core/juce_core.h>
#include <vector>
#include "DeviceProfile/DeviceProfileEngine.h"

// DumpCapturePolicy.h — which device dumps an exported plugin may save with a session and send back.
//
// THE RULE: never send a byte the session did not actually hold.
//
// Total Recall S3 saves "the whole patch, as bytes" by asking the profile for every dump it declares
// and building each one from the APVTS. But the APVTS holds only the panel's `exportParameters`, and
// `buildDumpMessage` fills every parameter it is not given with the definition's `defaultByte` —
// correctly, for a script that wants a dump assembled from part of a patch, and catastrophically for
// a restore. The plugin kept every dump that built, so a GAIA session stored the System block with
// all 89 parameters at 0 (Master Level 0 is a silent synth; Master Tune, Rx channel and the rest out
// of range or wrong), all sixteen arpeggio patterns zeroed, and on "Send saved sound" sent them
// before the values. On the AN1x the `userVoice` and `userPattern` bulks address `$slot`, which
// defaults to 0, so the same restore overwrote User Voice 001 and User Pattern 1 in the synth's
// memory. (release audit 2026-10-04, C-11.)
//
// So: a dump is captured only when the panel supplies EVERY parameter its mappings cover. A dump
// with even one parameter missing is not saved, and not sent; the values that ARE bound still go out
// one by one after it, which is what they did anyway. Bytes no mapping covers at all (reserved and
// padding bytes) keep the profile's declared default — that is the profile author's statement about
// those bytes, not the absence of one.
//
// The SAME test is applied on restore to dumps a session already holds. A project saved by an older
// export carries the zero-filled blocks in its `DeviceDumps`, and restoring them verbatim would
// send the zeros this rule exists to prevent. A stored dump is sent only if the current profile
// declares it and the current panel would capture it whole; anything else is dropped, by name.
//
// SECOND RULE: Total Recall never writes the synth's stored memory. Completeness is not enough on
// its own. The AN1x `userPattern` bulk carries exactly the 70 parameters of the edit-buffer
// `stepSeq`, so a panel exporting the whole step sequencer makes it complete. It is addressed by
// `$slot`, though (`F0 43 00 5C 00 46 01 $slot 00 ...`), and sending it writes User Pattern 1. A
// dump is a STORED-MEMORY dump when its address uses a variable the profile names preset slots with:
// any `$slot`/`$program`/`$bankMsb`/`$bankLsb` or declared `slotVariable` in the dump's matcher, or in
// the template of a request that fetches it (DeviceProfileEngine::dumpAddressVariables and
// presetSlotVariables). Such a dump is never captured and never restored, complete or not. The
// rule is about how the profile declares the dump, not about its id, so it holds for any profile
// that declares one the same way. A session restores the sound the synth is playing, not its library.
//
// The engine's own zero-fill is deliberately left alone. `ce.device.buildDump` is a script asking
// for exactly that, and `unmappedParameters` is how it is told. What changes is the plugin's policy
// about what to keep.
//
// Kept out of PluginProcessor.h, like RestorePolicy.h, so it can be tested against real profiles
// without standing the plugin up.

namespace ce
{

/** A dump that was not captured, or a stored one that will not be sent, and why. */
struct SkippedDump
{
    juce::String id;
    int missingParameters = 0;   ///< distinct parameters the panel does not supply; 0 if skipped for another reason
    juce::String reason;
};

/**
 * The preset-slot variables this dump's address uses, e.g. { "slot" } for the AN1x `userPattern`.
 * Empty for a dump that addresses the edit buffer. Non-empty means it writes stored memory.
 */
inline juce::StringArray memorySlotVariables (const ceditor::device::DeviceProfileEngine& engine, const juce::String& dumpId)
{
    const auto slotNames = engine.presetSlotVariables();
    juce::StringArray used;
    for (const auto& name : engine.dumpAddressVariables (dumpId))
        if (slotNames.contains (name))
            used.add (name);
    return used;
}

inline juce::String describeMemoryDump (const juce::StringArray& slotVariables)
{
    return "it is addressed by $" + slotVariables.joinIntoString (", $")
         + ", a stored-memory slot, and restoring it would overwrite a patch saved in the synth";
}

/** Every parameter the dump's mappings cover was supplied, and it built. */
inline bool isCompleteDump (const ceditor::device::DumpBuildResult& result)
{
    return result.ok && result.hex.isNotEmpty() && result.unmappedParameters.isEmpty();
}

inline int distinctCount (juce::StringArray ids)
{
    ids.removeDuplicates (false);
    return ids.size();
}

inline SkippedDump describeIncompleteDump (const juce::String& id, const ceditor::device::DumpBuildResult& result)
{
    SkippedDump skipped;
    skipped.id = id;
    if (! result.ok)
    {
        skipped.reason = result.error.isNotEmpty() ? result.error : juce::String ("does not build");
        return skipped;
    }
    if (result.hex.isEmpty())
    {
        skipped.reason = "built empty";
        return skipped;
    }
    skipped.missingParameters = distinctCount (result.unmappedParameters);
    skipped.reason = juce::String (skipped.missingParameters)
                   + " of its parameters are not exported by this panel, and a partial dump would send them as "
                     "the profile's default byte";
    return skipped;
}

struct DumpCapture
{
    juce::var captured;                 ///< DynamicObject, dumpId -> hex, profile order; complete dumps only
    juce::Array<SkippedDump> skipped;   ///< everything else, in profile order
    int capturedCount = 0;
};

/**
 * What a session may store: every declared dump the bound values cover completely, except one
 * addressed to stored memory.
 */
inline DumpCapture captureCompleteDumps (const ceditor::device::DeviceProfileEngine& engine, const juce::var& values)
{
    DumpCapture capture;
    auto* built = new juce::DynamicObject();
    capture.captured = juce::var (built);

    for (const auto& id : engine.dumpDefinitionIds())
    {
        if (const auto slots = memorySlotVariables (engine, id); ! slots.isEmpty())
        {
            capture.skipped.add ({ id, 0, describeMemoryDump (slots) });
            continue;
        }

        const auto result = engine.buildDumpMessage (id, values);
        if (isCompleteDump (result))
        {
            built->setProperty (id, result.hex);
            ++capture.capturedCount;
        }
        else
        {
            capture.skipped.add (describeIncompleteDump (id, result));
        }
    }
    return capture;
}

inline juce::Array<int> dumpBytesFromHex (const juce::String& hex)
{
    juce::Array<int> bytes;
    for (const auto& token : juce::StringArray::fromTokens (hex, " ", ""))
        if (token.isNotEmpty())
            bytes.add (token.getHexValue32() & 0xff);
    return bytes;
}

struct RestoredDump
{
    juce::String id;
    juce::Array<int> bytes;
};

struct RestoredDumpPlan
{
    std::vector<RestoredDump> send;     ///< in the profile's declared order
    juce::Array<SkippedDump> dropped;   ///< stored, and not to be sent
};

/**
 * Which of a session's stored dumps may go to the device, in the profile's order.
 *
 * `engine` may be null (no profile for the role): then nothing is sent, because there is nothing to
 * check the stored bytes against. `values` are the bound values as restored — the same thing
 * capture builds from, so a dump passes here exactly when today's panel would have captured it.
 */
inline RestoredDumpPlan planRestoredDumps (const ceditor::device::DeviceProfileEngine* engine,
                                           const juce::var& stored, const juce::var& values)
{
    RestoredDumpPlan plan;
    auto* storedObject = stored.getDynamicObject();
    if (storedObject == nullptr) return plan;

    const auto declared = engine != nullptr ? engine->dumpDefinitionIds() : juce::StringArray();

    for (const auto& id : declared)
    {
        const auto hex = storedObject->getProperty (id).toString();
        if (hex.isEmpty()) continue;

        if (const auto slots = memorySlotVariables (*engine, id); ! slots.isEmpty())
        {
            plan.dropped.add ({ id, 0, describeMemoryDump (slots) });
            continue;
        }

        const auto rebuilt = engine->buildDumpMessage (id, values);
        if (! isCompleteDump (rebuilt))
        {
            plan.dropped.add (describeIncompleteDump (id, rebuilt));
            continue;
        }

        auto bytes = dumpBytesFromHex (hex);
        if (bytes.isEmpty()) continue;
        plan.send.push_back ({ id, std::move (bytes) });
    }

    for (const auto& property : storedObject->getProperties())
    {
        const auto id = property.name.toString();
        if (declared.contains (id)) continue;
        SkippedDump skipped;
        skipped.id = id;
        skipped.reason = engine != nullptr ? juce::String ("the device profile does not declare it")
                                           : juce::String ("no device profile to check it against");
        plan.dropped.add (skipped);
    }
    return plan;
}

} // namespace ce
