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

void testWillBeRemovedHook()
{
    std::cout << "\nonInstrumentWillBeRemoved" << std::endl;

    Rig rig;
    std::vector<juce::String> fired;
    bool firedBeforeDestruction = true;
    std::shared_ptr<bool> watchedFlag;

    rig.host.onInstrumentWillBeRemoved = [&] (const juce::String& partId, juce::AudioProcessor& p)
    {
        fired.push_back (partId);
        if (auto* stub = dynamic_cast<StubSynth*> (&p);
            stub != nullptr && stub->destroyedFlag != nullptr && *stub->destroyedFlag)
            firedBeforeDestruction = false;
        juce::ignoreUnused (watchedFlag);
    };

    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();

    auto* stubA = rig.load (a, 0.25f);
    watchedFlag = std::make_shared<bool> (false);
    stubA->destroyedFlag = watchedFlag;

    // Replacement destroys the old instrument.
    rig.load (a, 0.5f);
    check (fired.size() == 1 && fired.back() == a, "replacement announces the old instrument");
    check (*watchedFlag, "which is then actually destroyed");

    // Unload destroys.
    rig.load (b, 0.25f);
    fired.clear();
    rig.host.unloadInstrument (b);
    check (fired.size() == 1 && fired.back() == b, "unload announces");

    // Part removal destroys.
    fired.clear();
    rig.host.removePart (a);
    check (fired.size() == 1 && fired.back() == a, "part removal announces");

    // A whole-rack teardown announces every live instrument.
    const auto c = rig.host.addPart();
    rig.load (c, 0.25f);
    fired.clear();
    rig.host.loadModel (Performance::create());
    check (fired.size() == 1 && fired.back() == c, "loadModel teardown announces");

    check (firedBeforeDestruction,
           "every announcement arrived while the instrument was still alive");
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

// Plug-in delay compensation: it happens, and it is not this code that does it.
//
// This file used to carry a comment saying the opposite — "the graph does not compensate
// parallel paths (a live rack keeps every path as fast as its plug-ins allow)" — and a
// compensation pass was written against it before anyone checked. juce::AudioProcessorGraph
// has done PDC all along: RenderSequenceBuilder::createRenderingOpsForNode takes
// getInputLatencyForNode over every node's inputs and inserts DelayChannelOps for the shorter
// ones (juce_AudioProcessorGraph.cpp, JUCE 8.0.7, around lines 1136-1258). Adding a second
// pass on top made the FAST path arrive 128 samples LATE — compensated twice.
//
// So this test exists to stop the claim coming back. It is not testing our code; it is
// pinning a behaviour of JUCE's that the rack depends on and that nothing else here would
// notice losing.
//
// The stub effect it uses reports its latency AND incurs it. Against one that reports without
// delaying — StubEffectProcessor, which is right for the amplitude tests it serves — the graph
// would align paths that were never misaligned and this test would pass while proving nothing.
// One part driving another: the destination takes the source's chain OUTPUT — after its
// zone and its modules — and the source keeps playing its own instrument too.
void testMidiRouting()
{
    std::cout << "\none part driving another" << std::endl;

    Rig rig;
    const auto a = rig.host.addPart();
    const auto b = rig.host.addPart();
    auto* stubA = rig.load (a);
    auto* stubB = rig.load (b);

    // A transposes up an octave. Routed through A, B must hear the SHIFTED note: that is the
    // difference between "after A's chain" and "a copy of the keyboard".
    PartMidiRules up;
    up.transpose = 12;
    rig.host.setMidiRules (a, up);

    check (rig.host.setPartMidiSource (b, a), "B takes its MIDI from A");
    check (rig.host.getPerformance().findPart (b)->midiSourcePartId == a, "and the document says so");

    stubA->received.clear();
    stubB->received.clear();
    rig.noteOn (1, 60);
    rig.process();
    check (! stubA->received.empty() && stubA->received.front().getNoteNumber() == 72,
           "A still plays its own instrument, transposed");
    check (! stubB->received.empty() && stubB->received.front().isNoteOn()
             && stubB->received.front().getNoteNumber() == 72,
           "and B hears A's output — the transposed note, not the keyboard's");
    rig.noteOff (1, 60);
    rig.process();
    check (stubA->activeNotes == 0 && stubB->activeNotes == 0, "the release reaches both");

    // B's own zone still applies to what arrives: one rule for notes, however they came.
    PartMidiRules bass;
    bass.keyHigh = 48;
    rig.host.setMidiRules (b, bass);
    stubB->received.clear();
    rig.noteOn (1, 60);
    rig.process();
    check (stubB->received.empty(), "B's zone filters the routed note like a keyboard note");
    rig.noteOff (1, 60);
    rig.process();
    rig.host.setMidiRules (b, {});

    // Loops are refused at the model: A from B while B is from A, and a part from itself.
    check (! rig.host.setPartMidiSource (a, b), "A from B would loop and is refused");
    check (! rig.host.setPartMidiSource (a, a), "a part cannot take its MIDI from itself");
    check (! rig.host.setPartMidiSource (b, "no-such-part"), "an unknown source is refused");
    check (rig.host.getPerformance().findPart (a)->midiSourcePartId.isEmpty(), "and nothing changed");

    // A chain of three: C from B from A. The keyboard reaches C through both.
    const auto c = rig.host.addPart();
    auto* stubC = rig.load (c);
    check (rig.host.setPartMidiSource (c, b), "C from B");
    check (! rig.host.setPartMidiSource (a, c), "A from C would close the loop through B");
    stubC->received.clear();
    rig.noteOn (1, 60);
    rig.process();
    check (! stubC->received.empty() && stubC->received.front().getNoteNumber() == 72,
           "C hears the note through B and A");
    rig.noteOff (1, 60);
    rig.process();

    // Back to the keyboard: an empty source is the default feed again.
    check (rig.host.setPartMidiSource (b, {}), "B back to the keyboard");
    stubB->received.clear();
    rig.noteOn (1, 60);
    rig.process();
    check (! stubB->received.empty() && stubB->received.front().getNoteNumber() == 60,
           "and hears the keyboard's note untransposed");
    rig.noteOff (1, 60);
    rig.process();

    // Removing a source hands its dependents back to the keyboard, never wires them to nothing.
    rig.host.setPartMidiSource (c, a);
    rig.host.removePart (a);
    check (rig.host.getPerformance().findPart (c)->midiSourcePartId.isEmpty(),
           "C is back on the keyboard once A is gone");
    stubC->received.clear();
    rig.noteOn (1, 62);
    rig.process();
    check (! stubC->received.empty() && stubC->received.front().getNoteNumber() == 62,
           "and plays");
    rig.noteOff (1, 62);
    rig.process();

    // The routing survives a save and a load.
    rig.host.setPartMidiSource (c, b);
    const auto saved = rig.host.captureState().toVar();
    Rig rig2;
    const auto unresolved = rig2.host.loadModel ([&saved]
    {
        Performance restored;
        Performance::fromVar (saved, restored);
        return restored;
    }());
    check (rig2.host.getPerformance().findPart (c) != nullptr
             && rig2.host.getPerformance().findPart (c)->midiSourcePartId == b,
           "a restored rack keeps who drives whom");
}

void testLatencyCompensation()
{
    std::cout << "\nplug-in delay compensation" << std::endl;

    constexpr int lateBy = 128;

    Rig rig;
    const auto fast = rig.host.addPart();
    const auto slow = rig.host.addPart();
    rig.load (fast);
    rig.load (slow);

    const auto busId = rig.host.addBus ("Layer");
    rig.host.setPartDestination (fast, busId);
    rig.host.setPartDestination (slow, busId);

    // One insert on the slow part, which really does hold its signal back.
    const auto effectId = rig.host.addEffectSlot (slow);
    const auto generation = rig.host.beginEffectLoad (effectId);
    rig.host.commitEffectLoad (effectId, generation,
                               std::make_unique<ceditor::test::DelayingEffectProcessor> (lateBy),
                               { "stub-delay", {}, "Delay", "Test" });

    check (rig.host.partLatencySamples (slow) == lateBy,
           "the reported cost of a part is what its plug-ins cost");
    check (rig.host.partLatencySamples (fast) == 0, "and a part with no inserts costs nothing");

    // Where the sound starts, in samples from the note. Both parts hold a DC level while a
    // note is down, so the summed output is a staircase: one step per part arriving. One step
    // means they arrived together; two means a flam.
    const auto firstAbove = [&rig] (float threshold)
    {
        rig.noteOn (1, 60);
        for (int block = 0, offset = 0; block < 16; ++block, offset += rig.buffer.getNumSamples())
        {
            rig.process();
            const auto* samples = rig.buffer.getReadPointer (0);
            for (int i = 0; i < rig.buffer.getNumSamples(); ++i)
                if (std::abs (samples[i]) > threshold)
                    return offset + i;
        }
        return -1;
    };

    const auto reset = [&rig]
    {
        rig.noteOff (1, 60);
        for (int i = 0; i < 12; ++i)
            rig.process();
    };

    const auto anything = firstAbove (0.01f);
    reset();
    const auto both = firstAbove (0.3f);          // one part alone is 0.25
    reset();

    check (anything >= 0 && both >= 0, "the rack makes sound at all");
    check (anything == both,
           "the layered parts start together — one step in the output, not two");
    check (anything == lateBy,
           "and both arrive when the slower one does, which is the whole of compensation");

    // The graph's own number, which is the one worth reporting anywhere. It is not a sum this
    // file computes; it is what the render sequence actually costs.
    check (rig.host.getGraph().getLatencySamples() == lateBy,
           "the graph reports the same latency it is compensating for");
    check (rig.host.graphLatencySamples() == lateBy, "and the rack passes that number on");

    // A return chain is on the master path too, and a sum walked over PARTS cannot see it.
    // This is the case that made the hand-rolled report wrong rather than merely redundant:
    // the DAW is told one number for the whole instance, and a short one puts every note
    // early against every other track in the project.
    constexpr int wetLatency = 512;
    const auto returnId = rig.host.addReturn ("Verb");
    rig.host.setSendLevel (fast, returnId, 1.0f);
    const auto wetEffect = rig.host.addEffectSlot (returnId);
    const auto wetGeneration = rig.host.beginEffectLoad (wetEffect);
    rig.host.commitEffectLoad (wetEffect, wetGeneration,
                               std::make_unique<ceditor::test::DelayingEffectProcessor> (wetLatency),
                               { "stub-delay", {}, "Delay", "Test" });

    check (rig.host.graphLatencySamples() == wetLatency,
           "a laggy return is the longest path, and the graph knows it");
    int worstPart = 0;
    for (const auto& part : rig.host.getPerformance().parts)
        worstPart = juce::jmax (worstPart, rig.host.partLatencySamples (part.partId));
    check (worstPart + rig.host.masterLatencySamples() < rig.host.graphLatencySamples(),
           "while a sum walked over parts and the master chain comes out SHORT — which is "
           "exactly what the product used to hand the DAW");
}

int main()
{
    std::cout << "RackHost tests" << std::endl;

    testLayeringAndMixing();
    testSplitsAndRouting();
    testMuteSoloDisable();
    testLoadTransactions();
    testStateCaptureRestore();
    testWillBeRemovedHook();
    testUnloadAndRemove();
    testMidiRouting();
    testLatencyCompensation();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
