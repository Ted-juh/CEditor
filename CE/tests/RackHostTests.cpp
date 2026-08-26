// RackHostTests — the live multi-part rack over the real AudioProcessorGraph (VIP-successor
// Stage 1).
//
// These drive the PRODUCTION graph host — the same topology, connections, transactions and
// mixer the app will run — with stub instruments instead of real VST3s, so the whole thing is
// provable on any machine with no plug-ins installed and no audio device opened. A stub
// instrument outputs a known DC level while any of its notes is held and records every MIDI
// message it receives, which turns routing, layering, splitting, mixing, panic and
// replacement into numeric assertions.
//
// The gain nodes ramp over one block to avoid clicks, so tests that change the mixer process
// one settle block before asserting a level — the same thing a listener's ear would do.

#include "InstrumentHost/InstrumentRackHost.h"
#include "StubSynthProcessor.h"
#include <iostream>
#include <vector>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

bool near (float value, float wanted, float tolerance = 0.001f)
{
    return std::abs (value - wanted) <= tolerance;
}

using ceditor::host::InstrumentRackHost;
using ceditor::host::Performance;
using ceditor::host::PartMidiRules;
using StubSynth = ceditor::test::StubSynthProcessor;   // shared with InstrumentHostServiceTests

int noteOnsIn (const StubSynth& stub)
{
    int count = 0;
    for (const auto& m : stub.received)
        if (m.isNoteOn())
            ++count;
    return count;
}

//==============================================================================
struct Rig
{
    Rig()
    {
        host.prepare (48000.0, 64);
    }

    /** Runs one block through the real graph; midi is consumed. */
    void process()
    {
        buffer.clear();
        host.getGraph().processBlock (buffer, midi);
        midi.clear();
    }

    /** One block for gain ramps to land, then one to assert on. */
    void settle()
    {
        process();
        process();
    }

    void noteOn (int channel, int note, int velocity = 100)
    {
        midi.addEvent (juce::MidiMessage::noteOn (channel, note, (juce::uint8) velocity), 0);
    }

    void noteOff (int channel, int note)
    {
        midi.addEvent (juce::MidiMessage::noteOff (channel, note), 0);
    }

    StubSynth* load (const juce::String& partId, float amp = 0.25f,
                     const juce::String& ceId = "stub.synth")
    {
        auto stub = std::make_unique<StubSynth> (amp);
        auto* raw = stub.get();
        const auto generation = host.beginLoad (partId);
        if (! host.commitLoad (partId, generation, std::move (stub),
                               { ceId, "C:\\VST3\\Stub.vst3", "Stub Synth", "Test" }))
            return nullptr;
        return raw;
    }

    float level (int channel = 0) const
    {
        return buffer.getSample (channel, buffer.getNumSamples() - 1);
    }

    InstrumentRackHost host;
    juce::AudioBuffer<float> buffer { 2, 64 };
    juce::MidiBuffer midi;
};

//==============================================================================
void testLayeringAndMixing()
{
    std::cout << "\nlayering and mixing" << std::endl;

    Rig rig;
    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();
    auto* stubA = rig.load (a, 0.25f);
    auto* stubB = rig.load (b, 0.5f);
    check (stubA != nullptr && stubB != nullptr, "both parts commit an instrument");
    check (near ((float) stubA->preparedRate, 48000.0f),
           "a committed instrument is prepared with the engine's rate");

    rig.noteOn (1, 60);
    rig.process();
    check (stubA->activeNotes == 1 && stubB->activeNotes == 1,
           "one incoming note reaches both parts — a layer by default");
    check (near (rig.level (0), 0.75f) && near (rig.level (1), 0.75f),
           "the stereo mix is the sum of both parts");

    check (rig.host.setVolume (b, 0.5f), "volume accepts");
    rig.settle();
    check (near (rig.level (0), 0.5f), "part volume scales its contribution");

    check (rig.host.setPan (b, -1.0f), "pan accepts");
    rig.settle();
    check (near (rig.level (0), 0.5f) && near (rig.level (1), 0.25f),
           "hard-left pan removes the part from the right side only");
}

void testSplitsAndRouting()
{
    std::cout << "\nsplits, channels, velocity and transpose" << std::endl;

    Rig rig;
    const auto low = rig.host.addPart();
    const auto high = rig.host.addPart();
    auto* stubLow = rig.load (low);
    auto* stubHigh = rig.load (high);

    PartMidiRules lowRules;
    lowRules.keyHigh = 59;
    PartMidiRules highRules;
    highRules.keyLow = 60;
    check (rig.host.setMidiRules (low, lowRules) && rig.host.setMidiRules (high, highRules),
           "key-split rules accept");

    rig.noteOn (1, 40);
    rig.process();
    check (stubLow->activeNotes == 1 && stubHigh->activeNotes == 0,
           "a low note plays the low side of the split only");

    rig.noteOff (1, 40);
    rig.noteOn (1, 72);
    rig.process();
    check (stubLow->activeNotes == 0 && stubHigh->activeNotes == 1,
           "a high note plays the high side only");
    rig.noteOff (1, 72);
    rig.process();

    PartMidiRules channelTwo;
    channelTwo.channel = 2;
    rig.host.setMidiRules (high, channelTwo);
    rig.noteOn (1, 72);
    rig.process();
    check (stubHigh->activeNotes == 0, "a channel rule shuts out other channels");
    rig.noteOff (1, 72);
    rig.process();

    PartMidiRules transposed;
    transposed.transpose = 12;
    rig.host.setMidiRules (low, transposed);
    stubLow->received.clear();
    rig.noteOn (1, 60);
    rig.process();
    check (! stubLow->received.empty()
             && stubLow->received.front().isNoteOn()
             && stubLow->received.front().getNoteNumber() == 72,
           "transpose reaches the instrument as the shifted note");

    // The core invariant, proven through the whole graph: exclude the key, then release.
    PartMidiRules excluding;
    excluding.keyLow = 0;
    excluding.keyHigh = 10;
    rig.host.setMidiRules (low, excluding);
    stubLow->received.clear();
    rig.noteOff (1, 60);
    rig.process();
    check (! stubLow->received.empty() && stubLow->received.front().isNoteOff()
             && stubLow->received.front().getNoteNumber() == 72
             && stubLow->activeNotes == 0,
           "the note-off follows the note the instrument actually received");
}

void testMuteSoloDisable()
{
    std::cout << "\nmute, solo, disable" << std::endl;

    Rig rig;
    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();
    auto* stubA = rig.load (a, 0.25f);
    auto* stubB = rig.load (b, 0.5f);

    rig.noteOn (1, 60);
    rig.settle();
    check (near (rig.level(), 0.75f), "both parts sounding to start");

    rig.host.setMute (a, true);
    rig.settle();
    check (near (rig.level(), 0.5f), "mute silences the part's audio");
    check (stubA->activeNotes == 1, "without touching its notes or state");

    rig.host.setMute (a, false);
    rig.host.setSolo (b, true);
    rig.settle();
    check (near (rig.level(), 0.5f), "solo leaves only the soloed part audible");

    rig.host.setSolo (b, false);
    rig.settle();
    check (near (rig.level(), 0.75f), "releasing solo restores the mix");

    stubA->received.clear();
    rig.host.setEnabled (a, false);
    rig.settle();
    bool aGotPanic = false;
    for (const auto& m : stubA->received)
        if (m.isNoteOff() || (m.isController() && m.getControllerNumber() == 123))
            aGotPanic = true;
    check (aGotPanic && stubA->activeNotes == 0, "disabling a part panics its notes");
    check (near (rig.level(), 0.5f), "and removes it from the mix");

    rig.noteOn (1, 62);
    rig.process();
    check (stubA->activeNotes == 0 && stubB->activeNotes == 2,
           "a disabled part receives no new notes; the rest of the rack does");
}

void testLoadTransactions()
{
    std::cout << "\nload transactions" << std::endl;

    Rig rig;
    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();
    auto* stubA = rig.load (a, 0.25f);
    rig.load (b, 0.5f);

    rig.noteOn (1, 60);
    rig.settle();
    check (near (rig.level(), 0.75f), "two instruments sounding before the replacement");

    // The rapid-selection race: two tickets, the older callback loses.
    const auto stale = rig.host.beginLoad (a);
    const auto fresh = rig.host.beginLoad (a);
    check (! rig.host.commitLoad (a, stale, std::make_unique<StubSynth> (0.9f),
                                  { "stub.other", "", "Other", "Test" }),
           "a stale generation is refused");
    check (rig.host.getInstrument (a) == stubA,
           "and the part still holds the instrument it had");

    auto replacement = std::make_unique<StubSynth> (0.125f);
    auto* stubA2 = replacement.get();
    check (rig.host.commitLoad (a, fresh, std::move (replacement),
                                { "stub.other", "", "Other", "Test" }),
           "the newest generation commits");
    check (rig.host.getInstrument (a) == stubA2, "and the part now holds the replacement");

    rig.settle();
    check (noteOnsIn (*stubA2) == 0 && stubA2->received.empty(),
           "the replacement receives no stray note-offs from its predecessor's notes");
    check (near (rig.level(), 0.5f),
           "the other part kept sounding through the whole replacement");

    rig.noteOn (1, 64);
    rig.settle();
    check (stubA2->activeNotes == 1 && near (rig.level(), 0.625f),
           "the replacement plays from the next note on");

    const auto abandoned = rig.host.beginLoad (b);
    juce::ignoreUnused (abandoned);   // the candidate failed to construct; nothing commits
    check (rig.host.partHasInstrument (b) && near (rig.level(), 0.625f),
           "a load that never commits leaves the previous instrument untouched");

    check (! rig.host.commitLoad ("no-such-part", 1, std::make_unique<StubSynth>(), {}),
           "an unknown part is refused");
    check (rig.host.beginLoad ("no-such-part") == 0, "beginLoad refuses it too");
}

void testStateCaptureRestore()
{
    std::cout << "\ncapture and restore" << std::endl;

    Rig rig;
    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();
    auto* stubA = rig.load (a, 0.25f, "stub.alpha");
    rig.load (b, 0.5f, "stub.beta");
    stubA->patch = 42;

    PartMidiRules split;
    split.keyHigh = 59;
    rig.host.setMidiRules (a, split);
    rig.host.setVolume (a, 0.7f);
    rig.host.focusPart (b);

    // Through real JSON, like the document will actually travel.
    const auto json = juce::JSON::toString (rig.host.captureState().toVar());

    Performance restored;
    check (Performance::fromVar (juce::JSON::parse (json), restored), "the capture parses back");

    Rig rig2;
    const auto unresolved = rig2.host.loadModel (restored);
    check (unresolved.size() == 2, "loadModel reports every part awaiting its instrument");
    check (rig2.host.getPerformance().focusedPartId == b, "focus restores");
    check (! rig2.host.partHasInstrument (a), "structure first — no instruments yet");

    for (const auto& u : unresolved)
    {
        auto stub = std::make_unique<StubSynth>();
        auto* raw = stub.get();
        const auto generation = rig2.host.beginLoad (u.partId);
        check (rig2.host.commitLoad (u.partId, generation, std::move (stub),
                                     { u.ceId, u.modulePath, "Stub Synth", "Test" }),
               "an unresolved part commits through the normal transaction");
        if (u.partId == a)
            check (raw->patch == 42, "matching identity restores the captured state");
    }

    const auto* partA = rig2.host.getPerformance().findPart (a);
    check (partA != nullptr && partA->midi.keyHigh == 59
             && juce::approximatelyEqual (partA->volume, 0.7f),
           "rules and mixer values restore");

    // A different class must not inherit the blob.
    const auto generation = rig2.host.beginLoad (a);
    auto other = std::make_unique<StubSynth>();
    auto* otherRaw = other.get();
    rig2.host.commitLoad (a, generation, std::move (other),
                          { "stub.gamma", "", "Other", "Test" });
    check (otherRaw->patch == 0, "a different class identity gets no restored state");
    check (rig2.host.getPerformance().findPart (a)->stateBlobBase64.isEmpty(),
           "and the stale blob is cleared rather than kept misleading");
}

void testUnloadAndRemove()
{
    std::cout << "\nunload and remove" << std::endl;

    Rig rig;
    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();
    auto* stubA = rig.load (a, 0.25f, "stub.alpha");
    rig.load (b, 0.5f, "stub.beta");
    stubA->patch = 7;

    check (rig.host.unloadInstrument (a), "unload accepts a loaded part");
    check (! rig.host.partHasInstrument (a), "the instrument is gone");
    check (rig.host.getPerformance().findPart (a) != nullptr
             && rig.host.getPerformance().findPart (a)->pluginCeId == "stub.alpha",
           "the part and its identity remain");

    auto* reloaded = rig.load (a, 0.25f, "stub.alpha");
    check (reloaded != nullptr && reloaded->patch == 7,
           "reloading the same class resumes from the state captured at unload");

    rig.noteOn (1, 60);
    rig.settle();
    check (near (rig.level(), 0.75f), "both parts sounding before removal");

    check (rig.host.removePart (a), "removePart accepts");
    check (rig.host.getPerformance().findPart (a) == nullptr, "the part leaves the document");
    rig.settle();
    check (near (rig.level(), 0.5f), "its audio leaves the mix, the other part plays on");

    check (! rig.host.removePart (a), "removing it again is refused");
}
} // namespace

int main()
{
    std::cout << "RackHost tests" << std::endl;

    testLayeringAndMixing();
    testSplitsAndRouting();
    testMuteSoloDisable();
    testLoadTransactions();
    testStateCaptureRestore();
    testUnloadAndRemove();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
