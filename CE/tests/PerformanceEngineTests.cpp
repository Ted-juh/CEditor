// PerformanceEngineTests — Hostage's timing and event engine.
//
// What must hold, and why each is here rather than in a Windows-only smoke test:
//
//   The transport is the only clock.       Tempo, signature, start/continue/stop and the
//                                          block window are pure arithmetic; if bar three is
//                                          in the wrong place it is wrong for the sequencer,
//                                          the arp and the hardware display at once.
//   Compilation decides everything it can. Ties, ratchets, swing and microtiming are already
//                                          in the compiled events, so the audio thread never
//                                          reasons about intent.
//   Randomness is reproducible.            Probability and conditions roll from the pattern's
//                                          seed and the loop index — same seed, same show.
//   No note is ever orphaned.              Stop, jump, clip stop, scene change and panic all
//                                          release exactly what is sounding.
//   Polymeter is not a special case.       A 7-step lane against a 16-step lane is two lanes
//                                          with different lengths, nothing more.

#include "Performance/PerformanceEngine.h"
#include "Performance/ArticulationManager.h"
#include "Performance/MidiInsertRack.h"
#include <map>
#include <set>
#include "Performance/ArpEngine.h"
#include "Performance/MidiFxChain.h"
#include "Performance/Microtuning.h"
#include "Performance/MicrotuningMidi.h"
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

using namespace ceditor::perf;

constexpr double sampleRate = 48000.0;
constexpr int blockSize = 256;

/** A lane of `stepCount` steps at `stepsPerBeat`, every `every`th step active. */
Lane makeNoteLane (const juce::String& id, const juce::String& partId, int stepCount,
                   int stepsPerBeat, int every, int note = 60)
{
    Lane lane;
    lane.laneId = id;
    lane.type = LaneType::note;
    lane.targetPartId = partId;
    lane.stepCount = stepCount;
    lane.stepsPerBeat = stepsPerBeat;
    lane.resizeSteps();

    for (int i = 0; i < stepCount; ++i)
        if (i % every == 0)
        {
            auto& step = lane.steps.getReference (i);
            step.active = true;
            step.note = note;
            step.velocity = 100;
            step.gate = 0.5f;
        }

    return lane;
}

/** The first message in a buffer — the iterator yields metadata, not messages. */
juce::MidiMessage firstMessage (const juce::MidiBuffer& buffer)
{
    for (const auto metadata : buffer)
        return metadata.getMessage();
    return {};
}

CompileContext contextForOnePart()
{
    CompileContext context;
    context.partIndexFor = [] (const juce::String& partId) { return partId == "p1" ? 0 : -1; };
    context.parameterResolves = [] (const juce::String&, const juce::String&, const juce::String&)
                                { return true; };
    return context;
}

/** Runs the engine for `blocks` blocks and collects everything one part received. */
struct Capture
{
    struct Event { int block; int sample; juce::MidiMessage message; };
    std::vector<Event> events;

    void run (PerformanceEngine& engine, int blocks, int partIndex = 0)
    {
        juce::MidiBuffer empty;
        for (int b = 0; b < blocks; ++b)
        {
            engine.processBlock (blockSize, empty);
            for (const auto metadata : engine.stagingFor (partIndex))
                events.push_back ({ b, metadata.samplePosition, metadata.getMessage() });
        }
    }

    int countNoteOns() const
    {
        int n = 0;
        for (const auto& event : events)
            n += event.message.isNoteOn() ? 1 : 0;
        return n;
    }

    int countNoteOffs() const
    {
        int n = 0;
        for (const auto& event : events)
            n += event.message.isNoteOff() ? 1 : 0;
        return n;
    }

    /** Absolute sample position of the nth note-on. */
    int noteOnSample (int index) const
    {
        int seen = 0;
        for (const auto& event : events)
            if (event.message.isNoteOn() && seen++ == index)
                return event.block * blockSize + event.sample;
        return -1;
    }

    void clear() { events.clear(); }
};

void testTransport()
{
    std::cout << "\ntransport: the one clock" << std::endl;

    Transport transport;
    transport.setTempo (120.0);
    transport.setTimeSignature (4, 4);

    // 120bpm = 2 quarter notes a second; one 48k block of 256 samples is a known slice.
    auto block = transport.advance (blockSize, sampleRate);
    check (! block.playing && juce::approximatelyEqual (block.startPpq, block.endPpq),
           "a stopped transport does not move");

    transport.start();
    block = transport.advance (blockSize, sampleRate);
    const auto expected = 2.0 * (double) blockSize / sampleRate;
    check (block.playing && block.justStarted,
           "start is consumed at the top of the block, not somewhere inside it");
    check (std::abs (block.endPpq - expected) < 1.0e-9,
           "one block advances exactly tempo/60/sampleRate per sample");

    // Bars and beats are a reading of ppq, so a signature change re-reads the same position.
    transport.setPosition (4.0);
    transport.advance (blockSize, sampleRate);
    int bar = 0, beat = 0; double fraction = 0.0;
    transport.positionInBarsBeats (bar, beat, fraction);
    check (bar == 2 && beat == 1, "four quarter notes into 4/4 is bar 2 beat 1");
    transport.setTimeSignature (3, 4);
    transport.positionInBarsBeats (bar, beat, fraction);
    check (bar == 2 && beat == 2, "the same position in 3/4 is bar 2 beat 2");

    // Quantized launch boundaries.
    transport.setTimeSignature (4, 4);
    check (std::abs (transport.nextBoundary (4.2, Quantize::bar) - 8.0) < 1.0e-9,
           "the next bar after 4.2 is 8.0");
    check (std::abs (transport.nextBoundary (4.0, Quantize::bar) - 4.0) < 1.0e-9,
           "a position already on the boundary is the boundary");
    check (std::abs (transport.nextBoundary (4.2, Quantize::beat) - 5.0) < 1.0e-9,
           "beat quantization lands on the next quarter note");
    check (std::abs (transport.nextBoundary (4.2, Quantize::immediate) - 4.2) < 1.0e-9,
           "immediate means now, so every launch path can share one code path");

    // Start rewinds; continue does not — the MIDI verbs, kept apart.
    transport.stop();
    transport.advance (blockSize, sampleRate);
    transport.setPosition (7.5);
    transport.advance (blockSize, sampleRate);
    transport.continuePlayback();
    block = transport.advance (blockSize, sampleRate);
    check (block.playing && std::abs (block.startPpq - 7.5) < 1.0e-9,
           "continue resumes where the playhead was");
    transport.start();
    block = transport.advance (blockSize, sampleRate);
    check (std::abs (block.startPpq) < 1.0e-9, "start goes back to the top");
}

void testRetrospectiveMidiJournal()
{
    std::cout << "\ncapture: always-listening retrospective MIDI journal" << std::endl;

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);

    // Deliberately leave both song and transport absent/stopped. The history is meant to
    // rescue playing that happened before the person thought about recording it.
    juce::MidiBuffer played;
    played.addEvent (juce::MidiMessage::noteOn (2, 65, (juce::uint8) 109), 20);
    played.addEvent (juce::MidiMessage::controllerEvent (2, 74, 88), 100);
    played.addEvent (juce::MidiMessage::noteOff (2, 65), 200);
    engine.processBlock (blockSize, played);

    bool sawVelocity = false, sawCc = false, sawEnvelopeOn = false, sawEnvelopeOff = false;
    PerformanceEngine::OutEvent source;
    while (engine.popEvent (source))
    {
        if (source.type == PerformanceEngine::OutEvent::Type::envelopeGate)
        {
            sawEnvelopeOn = sawEnvelopeOn
                         || (source.index == 1 && source.data1 == 2 && source.data2 == 65
                             && std::abs (source.value - 109.0f / 127.0f) < 0.0001f);
            sawEnvelopeOff = sawEnvelopeOff
                          || (source.index == 0 && source.data1 == 2 && source.data2 == 65);
            continue;
        }
        if (source.type != PerformanceEngine::OutEvent::Type::modulationSource)
            continue;
        sawVelocity = sawVelocity
                   || (source.index == PerformanceEngine::velocitySource
                       && source.data1 == 2 && source.data2 == 65
                       && std::abs (source.value - 109.0f / 127.0f) < 0.0001f);
        sawCc = sawCc
             || (source.index == PerformanceEngine::midiCcSource
                 && source.data1 == 2 && source.data2 == 74
                 && std::abs (source.value - 88.0f / 127.0f) < 0.0001f);
    }
    check (sawVelocity && sawCc,
           "velocity and CC reach the modulation queue even with transport stopped");
    check (sawEnvelopeOn && sawEnvelopeOff,
           "note gates reach external envelopes even with transport stopped");

    const auto recent = engine.recentMidi (1.0);
    check (recent.events.size() == 3,
           "notes and expressive channel messages are remembered while stopped");
    check (recent.events.size() >= 2
             && recent.events.front().message().isNoteOn()
             && recent.events.front().message().getChannel() == 2
             && recent.events.front().message().getVelocity() == 109
             && recent.events.back().message().isNoteOff(),
           "the compact journal round-trips channel, velocity and note-off data");
    check (engine.hasRecentMidiNotes (1.0), "the message thread can report a capturable take");

    juce::MidiBuffer empty;
    for (int block = 0; block < 4; ++block)
        engine.processBlock (blockSize, empty);
    check (engine.recentMidi (0.005).events.empty() && ! engine.hasRecentMidiNotes (0.005),
           "requesting a short tail excludes events that have aged out of that window");
}

void testExternalClock()
{
    std::cout << "\ntransport: following an external clock" << std::endl;

    Transport transport;
    transport.setExternalClockEnabled (true);
    transport.setTempo (120.0);

    // 24 ticks per quarter note at 120bpm = one tick every 1000 samples at 48k.
    juce::MidiBuffer clock;
    clock.addEvent (juce::MidiMessage::midiStart(), 0);
    transport.consumeExternalClock (clock, sampleRate);
    transport.advance (blockSize, sampleRate);
    check (transport.isPlaying(), "the master's start starts the slave");

    for (int i = 0; i < 48; ++i)
    {
        juce::MidiBuffer tick;
        tick.addEvent (juce::MidiMessage::midiClock(), 0);
        // Four blocks of 250 samples between ticks = 1000 samples = 120bpm.
        for (int b = 0; b < 4; ++b)
        {
            transport.consumeExternalClock (b == 0 ? tick : juce::MidiBuffer(), sampleRate);
            transport.advance (250, sampleRate);
        }
    }

    check (std::abs (transport.getTempo() - 120.0) < 3.0,
           "tempo is derived from the interval between ticks");
    check (transport.getPositionPpq() > 1.5,
           "and the position follows the tick count rather than free-running");

    // Clock loss has a defined outcome: stop, and say so.
    for (int b = 0; b < 200; ++b)
        transport.advance (256, sampleRate);
    check (! transport.isPlaying() && transport.hasLostExternalClock(),
           "a master that goes silent stops the slave and is reported, not guessed at");

    juce::MidiBuffer stop;
    stop.addEvent (juce::MidiMessage::midiStop(), 0);
    transport.setExternalClockEnabled (false);
    transport.consumeExternalClock (stop, sampleRate);
    check (! transport.hasLostExternalClock(),
           "leaving external mode clears the diagnostic");
}

// Stage 7 (§18.9.3): the DAW is a third clock SOURCE, not a second clock. The transport
// follows the host's playhead the way it follows a MIDI master — so a loop jump, a locate and
// a tempo ramp all land where the DAW says, and the sequencer, the arps and the hardware
// display keep agreeing with each other.
void testHostSync()
{
    std::cout << "\ntransport: following a DAW playhead" << std::endl;

    Transport transport;
    transport.setHostSyncEnabled (true);
    check (! transport.hasHostPosition(),
           "a DAW that never reports a position leaves the transport on its own clock");

    // A host that is stopped at bar 2 (ppq 4) with its own tempo and signature.
    transport.applyHostPosition (140.0, 3, 4, 4.0, false);
    auto block = transport.advance (blockSize, sampleRate);
    check (transport.hasHostPosition() && ! block.playing,
           "the host's stopped playhead stops the transport");
    check (std::abs (transport.getTempo() - 140.0) < 1.0e-9
             && transport.getTimeSignatureNumerator() == 3,
           "and its tempo and signature are adopted");
    check (std::abs (block.startPpq - 4.0) < 1.0e-9, "at the host's position");

    // Rolling: the position comes from the host every block, never integrated here.
    transport.applyHostPosition (140.0, 3, 4, 4.0, true);
    block = transport.advance (blockSize, sampleRate);
    check (block.playing && std::abs (block.startPpq - 4.0) < 1.0e-9, "rolling from there");

    transport.applyHostPosition (140.0, 3, 4, 4.5, true);
    block = transport.advance (blockSize, sampleRate);
    check (std::abs (block.startPpq - 4.5) < 1.0e-9,
           "the next block starts where the host says, not where we would have integrated to");

    // A loop jump backwards is a jump, and the scheduler is told so it can release notes.
    transport.applyHostPosition (140.0, 3, 4, 0.0, true);
    transport.advance (blockSize, sampleRate);
    check (transport.consumeJumped(), "a host locate reports as a jump");

    // Local transport control is refused while the DAW owns it: its play button is the one.
    transport.stop();
    transport.applyHostPosition (140.0, 3, 4, 1.0, true);
    block = transport.advance (blockSize, sampleRate);
    check (block.playing, "a local stop cannot stop a transport the host is driving");

    // Leaving host sync hands the clock back.
    transport.setHostSyncEnabled (false);
    check (! transport.hasHostPosition(), "and leaving host sync releases it");
    transport.stop();
    block = transport.advance (blockSize, sampleRate);
    check (! block.playing, "after which local control works again");
}

void testCompileAndPlay()
{
    std::cout << "\npatterns: compile, schedule, release" << std::endl;

    auto pattern = Pattern::create ("Test");
    pattern.lanes.add (makeNoteLane ("l1", "p1", 4, 4, 1));   // four sixteenths = one beat

    juce::Array<Clip> clips;
    Clip clip;
    clip.clipId = "c1";
    clip.patternId = pattern.patternId;
    clip.launchQuantize = Quantize::immediate;
    clips.add (clip);

    juce::Array<Pattern> patterns;
    patterns.add (pattern);

    auto song = compileSong (patterns, clips, contextForOnePart());
    check (song->patterns.size() == 1 && song->patterns[0].lanes.size() == 1
             && song->patterns[0].lanes[0].events.size() == 4,
           "four active steps compile into four events");
    check (std::abs (song->patterns[0].lanes[0].lengthPpq - 1.0) < 1.0e-9,
           "four sixteenths is one quarter note of lane");
    check (song->clips.size() == 1 && song->clips[0].patternIndex == 0,
           "the clip resolves to its pattern");

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (std::move (song), 1);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    // One beat at 120bpm is 24000 samples ≈ 94 blocks of 256.
    // One beat is 24000 samples; 93 blocks of 256 is 23808 — one loop and not a sample more.
    Capture capture;
    capture.run (engine, 93);
    check (capture.countNoteOns() == 4, "one loop plays its four notes");
    check (capture.countNoteOffs() == 4, "and releases every one of them");

    // Sixteenths at 120bpm are 6000 samples apart; the first sits at zero.
    check (capture.noteOnSample (0) == 0, "the first note lands on the launch");
    check (std::abs (capture.noteOnSample (1) - 6000) <= 1,
           "and the next exactly one sixteenth later, inside the block it belongs to");
    check (std::abs (capture.noteOnSample (3) - 18000) <= 1,
           "sample-accurate all the way through the loop");

    // The loop repeats without drift.
    capture.clear();
    capture.run (engine, 93);
    check (capture.countNoteOns() == 4, "the loop repeats");
    // The next loop's first note is at absolute sample 24000; this capture began at 23808.
    check (std::abs (capture.noteOnSample (0) - 192) <= 1,
           "starting exactly one beat after the first, with no accumulated drift");
}

void testHeldFillSystem()
{
    std::cout << "\npatterns: held fills preserve clip phase" << std::endl;

    auto source = Pattern::create ("A");
    source.lanes.add (makeNoteLane ("source-lane", "p1", 4, 4, 2, 60));
    auto fill = Pattern::create ("D");
    fill.lanes.add (makeNoteLane ("fill-lane", "p1", 4, 4, 2, 72));

    juce::Array<Pattern> patterns;
    patterns.add (source);
    patterns.add (fill);
    Clip clip;
    clip.clipId = "clip";
    clip.patternId = source.patternId;
    clip.fillPatternId = fill.patternId;
    clip.launchQuantize = Quantize::immediate;
    juce::Array<Clip> clips;
    clips.add (clip);

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (compileSong (patterns, clips, contextForOnePart()), 1);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    Capture opening;
    opening.run (engine, 1);
    check (opening.countNoteOns() == 1 && opening.events[0].message.getNoteNumber() == 60,
           "the authored pattern starts the clip");
    const auto phaseBeforeFill = engine.clipPhase (0);

    engine.setClipFill (0, 1, Quantize::immediate);
    Capture filling;
    filling.run (engine, 47);
    bool heardFill = false;
    for (const auto& event : filling.events)
        heardFill = heardFill || (event.message.isNoteOn() && event.message.getNoteNumber() == 72);
    check (heardFill && engine.isClipFillActive (0),
           "pressing Fill substitutes the alternate pattern without launching another clip");
    check (engine.clipPhase (0) > phaseBeforeFill,
           "the fill keeps advancing the original clip phase instead of restarting it");

    engine.setClipFill (0, -1, Quantize::immediate);
    Capture returned;
    returned.run (engine, 47);
    bool heardSourceAgain = false;
    for (const auto& event : returned.events)
        heardSourceAgain = heardSourceAgain
                           || (event.message.isNoteOn() && event.message.getNoteNumber() == 60);
    check (heardSourceAgain && ! engine.isClipFillActive (0),
           "releasing Fill returns to A at the continuing phase");
}

void testSwingRatchetsTiesMicrotiming()
{
    std::cout << "\npatterns: swing, ratchets, ties, microtiming" << std::endl;

    // Swing: the odd sixteenth moves later by swing * half a step.
    {
        auto pattern = Pattern::create ("Swung");
        pattern.swing = 0.5f;
        pattern.lanes.add (makeNoteLane ("l1", "p1", 4, 4, 1));
        juce::Array<Pattern> patterns; patterns.add (pattern);
        juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
        clip.launchQuantize = Quantize::immediate; clips.add (clip);

        auto song = compileSong (patterns, clips, contextForOnePart());
        const auto& events = song->patterns[0].lanes[0].events;
        check (std::abs (events[0].ppq) < 1.0e-9 && std::abs (events[1].ppq - 0.3125) < 1.0e-9,
               "swing delays the odd steps and leaves the even ones alone");
    }

    // Ratchets: one step becomes N events inside the step.
    {
        auto pattern = Pattern::create ("Ratchet");
        auto lane = makeNoteLane ("l1", "p1", 4, 4, 4);
        lane.steps.getReference (0).ratchets = 3;
        pattern.lanes.add (lane);
        juce::Array<Pattern> patterns; patterns.add (pattern);
        juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
        clip.launchQuantize = Quantize::immediate; clips.add (clip);

        auto song = compileSong (patterns, clips, contextForOnePart());
        const auto& events = song->patterns[0].lanes[0].events;
        check (events.size() == 3, "three ratchets compile into three events");
        check (std::abs (events[1].ppq - 1.0 / 12.0) < 1.0e-9,
               "spaced evenly across the step they subdivide");
    }

    // Ties: the following step extends the note instead of retriggering it.
    {
        auto pattern = Pattern::create ("Tied");
        auto lane = makeNoteLane ("l1", "p1", 4, 4, 4);
        lane.steps.getReference (0).gate = 1.0f;
        lane.steps.getReference (1).active = true;
        lane.steps.getReference (1).tie = true;
        pattern.lanes.add (lane);
        juce::Array<Pattern> patterns; patterns.add (pattern);
        juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
        clip.launchQuantize = Quantize::immediate; clips.add (clip);

        auto song = compileSong (patterns, clips, contextForOnePart());
        const auto& events = song->patterns[0].lanes[0].events;
        check (events.size() == 1, "a tie is not an event of its own");
        check (std::abs (events[0].durationPpq - 0.5) < 1.0e-9,
               "it is length on the note before it");
    }

    // Microtiming: a per-step nudge, ahead or behind the grid.
    {
        auto pattern = Pattern::create ("Nudged");
        auto lane = makeNoteLane ("l1", "p1", 4, 4, 4);
        lane.steps.getReference (0).microtiming = 0.25f;
        pattern.lanes.add (lane);
        juce::Array<Pattern> patterns; patterns.add (pattern);
        juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
        clip.launchQuantize = Quantize::immediate; clips.add (clip);

        auto song = compileSong (patterns, clips, contextForOnePart());
        check (std::abs (song->patterns[0].lanes[0].events[0].ppq - 0.0625) < 1.0e-9,
               "microtiming moves the event by a fraction of its step");
    }
}

void testProbabilityAndConditions()
{
    std::cout << "\npatterns: probability and conditions are reproducible" << std::endl;

    CompiledEvent event;
    event.probability = 50;
    event.seed = 12345;

    int played = 0;
    for (int loop = 0; loop < 1000; ++loop)
        played += eventPlaysOnLoop (event, loop, 0) ? 1 : 0;
    check (played > 400 && played < 600, "a 50% step plays about half the time");

    int replayed = 0;
    for (int loop = 0; loop < 1000; ++loop)
        replayed += eventPlaysOnLoop (event, loop, 0) ? 1 : 0;
    check (played == replayed, "and exactly the same times on the next run — a rehearsable show");

    event.probability = 100;
    event.conditionEvery = 3;
    event.conditionOffset = 1;
    check (! eventPlaysOnLoop (event, 0, 0) && eventPlaysOnLoop (event, 1, 0)
             && ! eventPlaysOnLoop (event, 2, 0) && eventPlaysOnLoop (event, 4, 0),
           "a 2:3 condition plays on the second loop of every three");

    event.probability = 0;
    event.conditionEvery = 1;
    check (! eventPlaysOnLoop (event, 0, 0), "zero probability never plays");
}

void testPolymeterAndEuclid()
{
    std::cout << "\npatterns: polymeter and euclidean fills" << std::endl;

    auto pattern = Pattern::create ("Poly");
    pattern.lanes.add (makeNoteLane ("l1", "p1", 4, 4, 4, 60));   // one hit every beat
    pattern.lanes.add (makeNoteLane ("l2", "p1", 3, 4, 3, 72));   // one hit every 3/4 beat
    juce::Array<Pattern> patterns; patterns.add (pattern);
    juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
    clip.launchQuantize = Quantize::immediate; clips.add (clip);

    auto song = compileSong (patterns, clips, contextForOnePart());
    check (std::abs (song->patterns[0].lanes[0].lengthPpq - 1.0) < 1.0e-9
             && std::abs (song->patterns[0].lanes[1].lengthPpq - 0.75) < 1.0e-9,
           "each lane keeps its own loop length");
    check (std::abs (song->patterns[0].lengthPpq - 1.0) < 1.0e-9,
           "the pattern's own loop is the longest lane");

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (std::move (song), 1);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    Capture capture;
    capture.run (engine, 281);   // three beats at 120bpm, less one block
    int low = 0, high = 0;
    for (const auto& e : capture.events)
        if (e.message.isNoteOn())
            (e.message.getNoteNumber() == 60 ? low : high) += 1;
    check (low == 3 && high == 4,
           "three beats give the 1-beat lane three hits and the 3/4-beat lane four");

    const auto euclid = euclideanPattern (8, 3, 0);
    juce::String shape;
    for (const auto hit : euclid)
        shape += hit ? "x" : ".";
    check (shape == "..x..x.x" || shape == "x..x..x." || shape == ".x..x..x",
           "E(3,8) distributes three hits evenly over eight steps (" + shape + ")");
    check (euclideanPattern (16, 0, 0).contains (true) == false, "no pulses is silence");
}

void testNoOrphanNotes()
{
    std::cout << "\npatterns: no orphan notes, ever" << std::endl;

    auto pattern = Pattern::create ("Long");
    auto lane = makeNoteLane ("l1", "p1", 4, 4, 4);
    lane.steps.getReference (0).gate = 4.0f;    // a note that outlives any single block
    pattern.lanes.add (lane);
    juce::Array<Pattern> patterns; patterns.add (pattern);
    juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
    clip.launchQuantize = Quantize::immediate; clips.add (clip);

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (compileSong (patterns, clips, contextForOnePart()), 1);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    Capture capture;
    capture.run (engine, 4);
    check (capture.countNoteOns() == 1 && capture.countNoteOffs() == 0,
           "a long note is still sounding");

    // Stopping the transport releases it.
    engine.getTransport().stop();
    capture.clear();
    capture.run (engine, 2);
    check (capture.countNoteOffs() == 1, "stopping the transport releases what was sounding");

    // A jump releases too.
    engine.getTransport().start();
    engine.launchClip (0);
    capture.clear();
    capture.run (engine, 4);
    check (capture.countNoteOns() == 1, "playing again");
    engine.getTransport().setPosition (16.0);
    capture.clear();
    capture.run (engine, 2);
    check (capture.countNoteOffs() == 1, "and jumping the playhead releases it too");

    // Panic, from anywhere.
    engine.getTransport().setPosition (0.0);
    engine.launchClip (0);
    capture.clear();
    capture.run (engine, 4);
    check (capture.countNoteOns() >= 1, "sounding again");
    engine.panic();
    capture.clear();
    capture.run (engine, 1);
    check (capture.countNoteOffs() >= 1, "panic releases everything and stops every clip");
    check (! engine.isClipActive (0), "including the clips themselves");
}

void testLaunchQuantizeAndScenes()
{
    std::cout << "\nclips and scenes: quantized launch" << std::endl;

    auto pattern = Pattern::create ("Bar");
    pattern.lanes.add (makeNoteLane ("l1", "p1", 4, 4, 4));   // one note at the top
    juce::Array<Pattern> patterns; patterns.add (pattern);

    juce::Array<Clip> clips;
    Clip a; a.clipId = "a"; a.patternId = pattern.patternId; a.launchQuantize = Quantize::bar;
    Clip b; b.clipId = "b"; b.patternId = pattern.patternId; b.launchQuantize = Quantize::bar;
    clips.add (a); clips.add (b);

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (compileSong (patterns, clips, contextForOnePart()), 7);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().setTimeSignature (4, 4);
    engine.getTransport().start();

    // Launched a beat in, a bar-quantized clip waits for the bar line.
    Capture capture;
    capture.run (engine, 94);          // one beat
    engine.launchClip (0);
    capture.clear();
    capture.run (engine, 94);          // second beat: still waiting
    check (capture.countNoteOns() == 0 && engine.isClipPending (0),
           "a bar-quantized launch waits, and says it is waiting");

    capture.clear();
    capture.run (engine, 190);         // through the bar line
    check (capture.countNoteOns() >= 1 && engine.isClipActive (0),
           "and starts exactly at the bar");

    // A scene launches its clips together and announces itself with its token.
    juce::Array<int> sceneClips;
    sceneClips.add (1);
    engine.launchScene (sceneClips, true, Quantize::bar, 42);
    capture.clear();
    capture.run (engine, 380);

    bool sawScene = false;
    PerformanceEngine::OutEvent event;
    while (engine.popEvent (event))
        if (event.type == PerformanceEngine::OutEvent::Type::sceneApplied && event.index == 42)
            sawScene = event.generation == 7;
    check (sawScene, "a scene reports the moment it landed, with the song generation");
    check (engine.isClipActive (1) && ! engine.isClipActive (0),
           "its clips are running and the ones it omits were stopped");

    // A macro/mixer-only scene has no clip state to carry its token, but must still wait for
    // the requested boundary rather than applying as soon as the command queue is drained.
    PerformanceEngine emptySceneEngine;
    emptySceneEngine.prepare (sampleRate, blockSize, 1);
    emptySceneEngine.setSong (compileSong (patterns, clips, contextForOnePart()), 8);
    emptySceneEngine.getTransport().setTempo (120.0);
    emptySceneEngine.getTransport().setTimeSignature (4, 4);
    emptySceneEngine.getTransport().start();
    capture.run (emptySceneEngine, 94);   // roughly one beat into the bar
    while (emptySceneEngine.popEvent (event)) {}

    juce::Array<int> noSceneClips;
    emptySceneEngine.launchScene (noSceneClips, true, Quantize::bar, 43);
    capture.run (emptySceneEngine, 94);
    bool arrivedEarly = false;
    while (emptySceneEngine.popEvent (event))
        arrivedEarly = arrivedEarly || (event.type == PerformanceEngine::OutEvent::Type::sceneApplied
                                         && event.index == 43);
    check (! arrivedEarly, "an empty scene also waits for its musical boundary");

    capture.run (emptySceneEngine, 190);
    bool emptySceneLanded = false;
    while (emptySceneEngine.popEvent (event))
        emptySceneLanded = emptySceneLanded
                           || (event.type == PerformanceEngine::OutEvent::Type::sceneApplied
                               && event.index == 43 && event.generation == 8);
    check (emptySceneLanded, "and announces at the boundary without needing a dummy clip");
}

void testFrozenMidiUsesPostFxStaging()
{
    std::cout << "\nMIDI freeze: rendered clips bypass the part chain" << std::endl;

    auto pattern = Pattern::create ("Frozen notes");
    pattern.lanes.add (makeNoteLane ("frozen-lane", "p1", 4, 4, 4));
    juce::Array<Pattern> patterns; patterns.add (pattern);
    Clip clip;
    clip.clipId = "frozen";
    clip.patternId = pattern.patternId;
    clip.launchQuantize = Quantize::immediate;
    clip.frozenMidi = true;
    juce::Array<Clip> clips; clips.add (clip);

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (compileSong (patterns, clips, contextForOnePart()), 9);
    engine.getTransport().start();
    engine.launchClip (0, Quantize::immediate);
    juce::MidiBuffer input;
    engine.processBlock (blockSize, input);

    int ordinaryNotes = 0, renderedNotes = 0;
    for (const auto metadata : engine.stagingFor (0))
        ordinaryNotes += metadata.getMessage().isNoteOn() ? 1 : 0;
    for (const auto metadata : engine.postFxStagingFor (0))
        renderedNotes += metadata.getMessage().isNoteOn() ? 1 : 0;
    check (ordinaryNotes == 0 && renderedNotes == 1,
           "a frozen note leaves only through the post-MIDI-FX staging buffer");
}

void testParameterLanesAndGlide()
{
    std::cout << "\nautomation: parameter lanes leave through the queue" << std::endl;

    auto pattern = Pattern::create ("Auto");
    Lane lane;
    lane.laneId = "auto";
    lane.type = LaneType::parameter;
    lane.targetId = "p1";
    lane.parameterId = "cutoff";
    lane.stepCount = 4;
    lane.stepsPerBeat = 4;
    lane.resizeSteps();
    for (int i = 0; i < 4; ++i)
    {
        auto& step = lane.steps.getReference (i);
        step.active = true;
        step.value = (float) i / 3.0f;
    }
    pattern.lanes.add (lane);

    juce::Array<Pattern> patterns; patterns.add (pattern);
    juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
    clip.launchQuantize = Quantize::immediate; clips.add (clip);

    auto song = compileSong (patterns, clips, contextForOnePart());
    check (song->parameterTargets.size() == 1
             && song->parameterTargets[0].parameterId == "cutoff",
           "a resolved automation lane registers its target once");

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (std::move (song), 3);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    juce::MidiBuffer empty;
    for (int b = 0; b < 93; ++b)
        engine.processBlock (blockSize, empty);

    std::vector<float> values;
    PerformanceEngine::OutEvent event;
    while (engine.popEvent (event))
        if (event.type == PerformanceEngine::OutEvent::Type::parameterValue)
        {
            check (event.index == 0 && event.generation == 3, "carrying its target and generation");
            values.push_back (event.value);
        }

    check (values.size() == 4, "four steps deliver four values");
    check (! values.empty() && std::abs (values.back() - 1.0f) < 1.0e-6,
           "and the last is the value the last step holds");
    check (engine.stagingFor (0).isEmpty(),
           "a parameter lane emits no MIDI — it is not a CC in disguise");

    // An unresolved target is marked, never retargeted by name.
    CompileContext refusing;
    refusing.partIndexFor = [] (const juce::String&) { return 0; };
    refusing.parameterResolves = [] (const juce::String&, const juce::String&, const juce::String&)
                                 { return false; };
    auto unresolvedSong = compileSong (patterns, clips, refusing);
    check (unresolvedSong->parameterTargets.empty()
             && unresolvedSong->patterns[0].lanes[0].targetIndex == -1,
           "an unresolved automation lane compiles to silence, not to somebody else's parameter");
}

void testFollowActions()
{
    std::cout << "\nclips: follow actions and one-shots" << std::endl;

    auto pattern = Pattern::create ("Beat");
    pattern.lanes.add (makeNoteLane ("l1", "p1", 4, 4, 4));
    juce::Array<Pattern> patterns; patterns.add (pattern);

    juce::Array<Clip> clips;
    Clip a; a.clipId = "a"; a.patternId = pattern.patternId; a.launchQuantize = Quantize::immediate;
    a.followClipId = "b"; a.followAfterLoops = 2;
    Clip b; b.clipId = "b"; b.patternId = pattern.patternId; b.launchQuantize = Quantize::immediate;
    b.loop = false;
    clips.add (a); clips.add (b);

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (compileSong (patterns, clips, contextForOnePart()), 1);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    Capture capture;
    capture.run (engine, 200);   // two loops of one beat
    check (! engine.isClipActive (0) && engine.isClipActive (1),
           "after its follow count the clip hands over to the one it names");

    capture.clear();
    capture.run (engine, 200);
    check (! engine.isClipActive (1), "and a one-shot clip stops itself after a single loop");

    const auto runFollowAction = [&patterns] (const juce::String& action)
    {
        juce::Array<Clip> candidates;
        for (int i = 0; i < 3; ++i)
        {
            Clip candidate;
            candidate.clipId = "candidate-" + juce::String (i);
            candidate.patternId = patterns[0].patternId;
            candidate.launchQuantize = Quantize::immediate;
            if (i == 0)
            {
                candidate.followAction = action;
                candidate.followAfterLoops = 1;
            }
            candidates.add (candidate);
        }

        PerformanceEngine candidateEngine;
        candidateEngine.prepare (sampleRate, blockSize, 1);
        candidateEngine.setSong (compileSong (patterns, candidates, contextForOnePart()), 1);
        candidateEngine.getTransport().setTempo (120.0);
        candidateEngine.getTransport().start();
        candidateEngine.launchClip (0);
        Capture actionCapture;
        actionCapture.run (candidateEngine, 100);

        int active = -1;
        for (int i = 0; i < 3; ++i)
            if (candidateEngine.isClipActive (i))
                active = active < 0 ? i : -2;
        return active;
    };

    check (runFollowAction ("next") == 1,
           "Next follows document order without naming a target");
    const auto firstRandom = runFollowAction ("random");
    check ((firstRandom == 1 || firstRandom == 2) && runFollowAction ("random") == firstRandom,
           "Random chooses another clip reproducibly from the clip identity");
    check (runFollowAction ("stop") == -1,
           "Stop ends the clip after its loop count without launching another");
}

void testSongSwapWhilePlaying()
{
    std::cout << "\nedits: a new song swaps without corrupting the old one" << std::endl;

    auto pattern = Pattern::create ("A");
    pattern.lanes.add (makeNoteLane ("l1", "p1", 4, 4, 1, 60));
    juce::Array<Pattern> patterns; patterns.add (pattern);
    juce::Array<Clip> clips; Clip clip; clip.clipId = "c"; clip.patternId = pattern.patternId;
    clip.launchQuantize = Quantize::immediate; clips.add (clip);

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    engine.setSong (compileSong (patterns, clips, contextForOnePart()), 1);
    engine.getTransport().setTempo (120.0);
    engine.getTransport().start();
    engine.launchClip (0);

    Capture capture;
    capture.run (engine, 20);
    const auto before = capture.countNoteOns();
    check (before >= 1, "the first song is playing");

    // Edit: same pattern id, different note. The clip keeps running across the swap.
    auto edited = pattern;
    edited.lanes.getReference (0) = makeNoteLane ("l1", "p1", 4, 4, 1, 67);
    juce::Array<Pattern> editedPatterns; editedPatterns.add (edited);
    engine.setSong (compileSong (editedPatterns, clips, contextForOnePart()), 2);

    capture.clear();
    capture.run (engine, 90);
    bool sawNewNote = false;
    for (const auto& e : capture.events)
        sawNewNote = sawNewNote || (e.message.isNoteOn() && e.message.getNoteNumber() == 67);
    check (sawNewNote, "the edit is audible on the next event");
    check (engine.isClipActive (0), "and the clip never stopped");
    check (capture.countNoteOns() == capture.countNoteOffs()
             || capture.countNoteOns() - capture.countNoteOffs() <= 1,
           "with no notes stranded across the swap");
}

void testArpeggiator()
{
    std::cout << "\narpeggiator: a mode over the same clock" << std::endl;

    ArpEngine arp;
    ArpSettings settings;
    settings.enabled = true;
    settings.mode = ArpSettings::Mode::up;
    settings.stepsPerBeat = 4;
    settings.gate = 0.5f;
    arp.setSettings (settings);

    Transport transport;
    transport.setTempo (120.0);
    transport.start();

    juce::MidiBuffer in, out;
    in.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
    in.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 0);
    in.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 0);

    std::vector<int> played;
    for (int b = 0; b < 93; ++b)   // one beat, less a block
    {
        const auto block = transport.advance (blockSize, sampleRate);
        arp.process (b == 0 ? in : juce::MidiBuffer(), out, block, blockSize);
        for (const auto metadata : out)
            if (metadata.getMessage().isNoteOn())
                played.push_back (metadata.getMessage().getNoteNumber());
    }

    check (played.size() == 4, "one beat of sixteenths is four arp steps");
    check (played.size() >= 3 && played[0] == 60 && played[1] == 64 && played[2] == 67,
           "up mode walks the held chord upward");
    check (played.size() >= 4 && played[3] == 60, "and wraps to the bottom");

    // Down mode over two octaves. A fresh chord restarts the walk (the grid keeps running),
    // so the first note of the new chord is the mode's first note.
    juce::MidiBuffer lift;
    lift.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
    lift.addEvent (juce::MidiMessage::noteOff (1, 64), 0);
    lift.addEvent (juce::MidiMessage::noteOff (1, 67), 0);
    const auto lifted = transport.advance (blockSize, sampleRate);
    arp.process (lift, out, lifted, blockSize);

    settings.mode = ArpSettings::Mode::down;
    settings.octaves = 2;
    arp.setSettings (settings);
    played.clear();
    for (int b = 0; b < 93; ++b)
    {
        const auto block = transport.advance (blockSize, sampleRate);
        arp.process (b == 0 ? in : juce::MidiBuffer(), out, block, blockSize);
        for (const auto metadata : out)
            if (metadata.getMessage().isNoteOn())
                played.push_back (metadata.getMessage().getNoteNumber());
    }
    check (! played.empty() && played[0] == 79,
           "down mode over two octaves starts at the top of the upper octave");

    // Releasing the keys ends the arp and strands nothing.
    juce::MidiBuffer release;
    release.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
    release.addEvent (juce::MidiMessage::noteOff (1, 64), 0);
    release.addEvent (juce::MidiMessage::noteOff (1, 67), 0);
    int ons = 0;
    for (int b = 0; b < 40; ++b)
    {
        const auto block = transport.advance (blockSize, sampleRate);
        arp.process (b == 0 ? release : juce::MidiBuffer(), out, block, blockSize);
        for (const auto metadata : out)
            ons += metadata.getMessage().isNoteOn() ? 1 : 0;
    }
    check (ons == 0, "releasing the chord stops the arp");

    juce::MidiBuffer leftovers;
    arp.allNotesOff (leftovers, 0);
    check (leftovers.isEmpty(), "and left nothing sounding behind it");

    // Latch keeps the chord after the keys are up.
    settings.mode = ArpSettings::Mode::up;
    settings.octaves = 1;
    settings.latch = true;
    arp.setSettings (settings);

    juce::MidiBuffer chord;
    chord.addEvent (juce::MidiMessage::noteOn (1, 48, (juce::uint8) 100), 0);
    chord.addEvent (juce::MidiMessage::noteOff (1, 48), 10);
    ons = 0;
    for (int b = 0; b < 100; ++b)
    {
        const auto block = transport.advance (blockSize, sampleRate);
        arp.process (b == 0 ? chord : juce::MidiBuffer(), out, block, blockSize);
        for (const auto metadata : out)
            ons += metadata.getMessage().isNoteOn() ? 1 : 0;
    }
    check (ons >= 3, "latched, the arp keeps running after the key comes up");

    // --- the drawable pattern: rests, long patterns, and the playhead -----------------------
    // Velocity 0 is a rest — the grid advances, nothing sounds — and the pattern may now be
    // up to 32 steps, both of which the step-grid UI depends on.
    {
        ArpEngine drawn;
        ArpSettings drawnSettings;
        drawnSettings.enabled = true;
        drawnSettings.mode = ArpSettings::Mode::up;
        drawnSettings.stepsPerBeat = 4;
        drawnSettings.gate = 0.5f;
        drawnSettings.velocityPattern = { 100, 0, 90, 0 };   // sound, rest, sound, rest
        drawn.setSettings (drawnSettings);
        check (drawn.patternStep() == -1, "idle, the playhead reports nowhere");

        Transport clock;
        clock.setTempo (120.0);
        clock.start();

        juce::MidiBuffer hold, stepped;
        hold.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);

        std::vector<int> velocitiesHeard;
        for (int b = 0; b < 186; ++b)   // two beats = eight sixteenth steps
        {
            const auto block = clock.advance (blockSize, sampleRate);
            drawn.process (b == 0 ? hold : juce::MidiBuffer(), stepped, block, blockSize);
            for (const auto metadata : stepped)
                if (metadata.getMessage().isNoteOn())
                    velocitiesHeard.push_back (metadata.getMessage().getVelocity());
        }
        check (velocitiesHeard.size() == 4,
               "eight steps of a sound-rest pattern sound exactly four times");
        check (velocitiesHeard.size() >= 2
                 && velocitiesHeard[0] == 100 && velocitiesHeard[1] == 90,
               "each sounding step carries its own drawn velocity");
        check (drawn.patternStep() >= 0 && drawn.patternStep() < 4,
               "the playhead reports a live pattern position while held");

        juce::MidiBuffer flush;
        drawn.allNotesOff (flush, 0);
        check (drawn.patternStep() == -1, "and reports nowhere again once silenced");
    }

    {
        // Twelve distinct velocities, all used: the old eight-step cap is really gone.
        ArpEngine wide;
        ArpSettings wideSettings;
        wideSettings.enabled = true;
        wideSettings.stepsPerBeat = 4;
        wideSettings.velocityPattern.clear();
        for (int i = 0; i < 12; ++i)
            wideSettings.velocityPattern.add (40 + i);
        wide.setSettings (wideSettings);

        Transport clock;
        clock.setTempo (120.0);
        clock.start();

        juce::MidiBuffer hold, stepped;
        hold.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);

        std::vector<int> velocitiesHeard;
        for (int b = 0; b < 279; ++b)   // three beats = twelve sixteenth steps
        {
            const auto block = clock.advance (blockSize, sampleRate);
            wide.process (b == 0 ? hold : juce::MidiBuffer(), stepped, block, blockSize);
            for (const auto metadata : stepped)
                if (metadata.getMessage().isNoteOn())
                    velocitiesHeard.push_back (metadata.getMessage().getVelocity());
        }
        check (velocitiesHeard.size() == 12, "a twelve-step pattern cycles all twelve steps");
        bool allDistinct = velocitiesHeard.size() == 12;
        for (size_t i = 0; allDistinct && i < velocitiesHeard.size(); ++i)
            allDistinct = velocitiesHeard[i] == 40 + (int) i;
        check (allDistinct, "in order, one velocity per step, none truncated at eight");
    }

    {
        // --- pattern mode: the DRAWN melody ---------------------------------------------
        // Each step names which note of the held pool plays (0 = lowest, octave-extended),
        // -1 rests, and a degree past the pool clamps to the top instead of wrapping into
        // a different note than the one drawn.
        ArpEngine melodic;
        ArpSettings drawnSettings;
        drawnSettings.enabled = true;
        drawnSettings.mode = ArpSettings::Mode::pattern;
        drawnSettings.stepsPerBeat = 4;
        drawnSettings.gate = 0.5f;
        drawnSettings.octaves = 2;
        drawnSettings.degreePattern = { 0, 2, 1, -1, 3, 9 };   // C E4? -> see asserts below
        melodic.setSettings (drawnSettings);

        Transport clock;
        clock.setTempo (120.0);
        clock.start();

        juce::MidiBuffer hold, stepped;
        hold.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        hold.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 0);
        hold.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 0);

        std::vector<int> played;
        for (int b = 0; b < 140; ++b)   // six sixteenth steps and change
        {
            const auto block = clock.advance (blockSize, sampleRate);
            melodic.process (b == 0 ? hold : juce::MidiBuffer(), stepped, block, blockSize);
            for (const auto metadata : stepped)
                if (metadata.getMessage().isNoteOn())
                    played.push_back (metadata.getMessage().getNoteNumber());
        }

        // Pool over two octaves: 60 64 67 72 76 79. Drawn: 0->60, 2->67, 1->64, rest,
        // 3->72 (the octave row), 9 clamps to the pool top 79.
        check (played.size() == 5, "six drawn steps with one rest sound five notes");
        check (played.size() >= 3 && played[0] == 60 && played[1] == 67 && played[2] == 64,
               "the drawn degrees play the drawn notes, not a walk");
        check (played.size() >= 4 && played[3] == 72,
               "a degree above the held count reaches the octave extension");
        check (played.size() >= 5 && played[4] == 79,
               "a degree past the whole pool clamps to the top");
        check (melodic.patternStep() >= 0 && melodic.patternStep() < 6,
               "the playhead reports the drawn grid's position");
    }

    {
        // --- semitone rows: the FREE drawing --------------------------------------------
        // Rows are offsets around the ground note (the lowest held key, row 12 = ground),
        // so one finger transposes the whole riff chromatically — and the riff may hold
        // notes the chord does not, which the degree grid cannot.
        ArpEngine free;
        ArpSettings freeSettings;
        freeSettings.enabled = true;
        freeSettings.mode = ArpSettings::Mode::pattern;
        freeSettings.patternSemitones = true;
        freeSettings.stepsPerBeat = 4;
        freeSettings.gate = 0.5f;
        freeSettings.degreePattern = { 12, 19, 24, -1, 10 };   // ground, +7, +12, rest, -2
        free.setSettings (freeSettings);

        auto runHolding = [&] (int ground)
        {
            Transport clock;
            clock.setTempo (120.0);
            clock.start();
            juce::MidiBuffer hold, stepped;
            hold.addEvent (juce::MidiMessage::noteOn (1, ground, (juce::uint8) 100), 0);
            std::vector<int> played;
            for (int b = 0; b < 116; ++b)   // five sixteenth steps
            {
                const auto block = clock.advance (blockSize, sampleRate);
                free.process (b == 0 ? hold : juce::MidiBuffer(), stepped, block, blockSize);
                for (const auto metadata : stepped)
                    if (metadata.getMessage().isNoteOn())
                        played.push_back (metadata.getMessage().getNoteNumber());
            }
            juce::MidiBuffer lift, flush;
            lift.addEvent (juce::MidiMessage::noteOff (1, ground), 0);
            free.process (lift, flush, clock.advance (blockSize, sampleRate), blockSize);
            return played;
        };

        const auto fromC = runHolding (60);
        check (fromC.size() == 4, "five drawn steps with one rest sound four notes");
        check (fromC.size() >= 4 && fromC[0] == 60 && fromC[1] == 67 && fromC[2] == 72
                 && fromC[3] == 58,
               "rows play as offsets: ground, a fifth up, an octave up, a tone below");

        const auto fromF = runHolding (65);
        check (fromF.size() >= 3 && fromF[0] == 65 && fromF[1] == 72 && fromF[2] == 77,
               "and the same drawing transposes with the finger — that is the point");
    }
}

// The MIDI insert chain: the event chain stops being welded to the part. What must hold is
// that ORDER is now a decision (chord into arp and arp into chord differ, and both are
// reachable), that a bypassed module is inert, that several of a kind work, and — the one
// that bites — that changing the chain under a held chord strands nothing.
void testMidiInsertRack()
{
    std::cout << "\nMIDI inserts: a chain, not a welded order" << std::endl;

    auto slot = [] (const juce::String& type)
    {
        return MidiSlot::create (type, "slot-" + type);
    };

    auto notesFrom = [] (MidiInsertRack& rack, int key)
    {
        Transport clock;
        clock.setTempo (120.0);
        juce::MidiBuffer press, out;
        press.addEvent (juce::MidiMessage::noteOn (1, key, (juce::uint8) 100), 0);
        rack.process (press, out, clock.advance (blockSize, sampleRate), blockSize);
        std::vector<int> notes;
        for (const auto metadata : out)
            if (metadata.getMessage().isNoteOn())
                notes.push_back (metadata.getMessage().getNoteNumber());
        std::sort (notes.begin(), notes.end());
        return notes;
    };

    {
        // Order is the whole point. Transpose +12 then chord builds the triad ON the
        // transposed note; chord then transpose moves the whole triad. Same two modules,
        // deliberately different results — the welded chain could only ever do one.
        auto transpose = slot ("transpose");
        transpose.fx.transpose = 12;
        auto chord = slot ("chord");
        chord.fx.chord = MidiFxSettings::ChordType::triad;

        MidiInsertRack up;
        up.prepare (blockSize);
        up.setSlots ({ transpose, chord });
        check (notesFrom (up, 60) == std::vector<int> { 72, 76, 79 },
               "transpose then chord: the triad is built on the transposed note");

        MidiInsertRack down;
        down.prepare (blockSize);
        down.setSlots ({ chord, transpose });
        check (notesFrom (down, 60) == std::vector<int> { 72, 76, 79 },
               "chord then transpose: the whole triad moves — same notes here by symmetry");

        // Where the order genuinely diverges: a scale fold after a chord repairs the chord,
        // before it only repairs the key.
        auto scale = slot ("scale");
        scale.fx.constrainToScale = true;
        scale.fx.scaleType = "major";
        scale.fx.scaleRoot = 0;
        auto minorish = slot ("chord");
        minorish.fx.chord = MidiFxSettings::ChordType::triadFirstInversion;

        MidiInsertRack foldAfter;
        foldAfter.prepare (blockSize);
        foldAfter.setSlots ({ minorish, scale });
        const auto after = notesFrom (foldAfter, 60);
        MidiInsertRack foldBefore;
        foldBefore.prepare (blockSize);
        foldBefore.setSlots ({ scale, minorish });
        const auto before = notesFrom (foldBefore, 60);
        check (after != before,
               "a scale fold before or after a chord is audibly not the same chain");
    }

    {
        // Several of a kind: two transposes stack, which the one-of-each chain could not do.
        auto octave = slot ("transpose");
        octave.fx.transpose = 12;
        auto fifth = MidiSlot::create ("transpose", "slot-transpose-2");
        fifth.fx.transpose = 7;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ octave, fifth });
        check (notesFrom (rack, 60) == std::vector<int> { 79 }, "two transposes stack");

        // Bypass is inert, not removed: the module keeps its place and its settings.
        fifth.bypassed = true;
        rack.setSlots ({ octave, fifth });
        check (notesFrom (rack, 60) == std::vector<int> { 72 },
               "a bypassed module passes its input through untouched");
    }

    {
        // The one that bites: retype a slot while a chord is sounding. The module holding
        // those notes is about to be destroyed, so the chain owes their releases — and pays
        // them on the next block rather than leaving a stuck chord behind.
        auto chord = slot ("chord");
        chord.fx.chord = MidiFxSettings::ChordType::triad;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ chord });

        Transport clock;
        clock.setTempo (120.0);
        juce::MidiBuffer press, sounding;
        press.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        rack.process (press, sounding, clock.advance (blockSize, sampleRate), blockSize);
        int ons = 0;
        for (const auto metadata : sounding) ons += metadata.getMessage().isNoteOn() ? 1 : 0;
        check (ons == 3, "the chord is sounding three notes");

        // Swap the chorder out for a transpose — the held triad has nowhere to be released
        // from any more.
        rack.setSlots ({ slot ("transpose") });
        juce::MidiBuffer nothing, afterSwap;
        rack.process (nothing, afterSwap, clock.advance (blockSize, sampleRate), blockSize);
        std::vector<int> released;
        for (const auto metadata : afterSwap)
            if (metadata.getMessage().isNoteOff())
                released.push_back (metadata.getMessage().getNoteNumber());
        std::sort (released.begin(), released.end());
        check (released == std::vector<int> { 60, 64, 67 },
               "every note the retired module was holding is released by the new chain");
    }

    {
        // An empty chain is a wire, and panic reaches every module.
        MidiInsertRack rack;
        rack.prepare (blockSize);
        check (notesFrom (rack, 60) == std::vector<int> { 60 }, "an empty chain passes notes through");

        auto chord = slot ("chord");
        chord.fx.chord = MidiFxSettings::ChordType::seventh;
        rack.setSlots ({ chord });
        (void) notesFrom (rack, 48);
        juce::MidiBuffer panic;
        rack.allNotesOff (panic, 0);
        int offs = 0;
        for (const auto metadata : panic) offs += metadata.getMessage().isNoteOff() ? 1 : 0;
        check (offs == 4, "panic releases every voice the chain is holding");
    }

    {
        // Migration is the promise that nothing changes for anybody: a pre-chain part's two
        // settings blocks become two slots, in the order the welded code ran them.
        MidiFxSettings legacyFx;
        legacyFx.transpose = 5;
        legacyFx.scaleType = "dorian";
        ArpSettings legacyArp;
        legacyArp.enabled = true;
        legacyArp.mode = ArpSettings::Mode::down;

        const auto chain = migrateLegacyEventChain (legacyFx, legacyArp);
        check (chain.size() == 2 && chain[0].type == "fx" && chain[1].type == "arp",
               "a migrated part is note shaping first, then the arpeggiator");
        check (chain[0].fx.transpose == 5 && chain[1].arp.mode == ArpSettings::Mode::down,
               "carrying the settings it always had");
        check (chain[1].fx.scaleType == "dorian",
               "and the arp keeps the scale it used to read from the shared block");
    }
}

void testMidiFxChain()
{
    std::cout << "\nMIDI FX: a defined chain, in a defined order" << std::endl;

    MidiFxChain chain;
    MidiFxSettings settings;
    settings.transpose = 12;
    chain.setSettings (settings);

    juce::MidiBuffer in, out;
    in.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
    chain.process (in, out);
    check (out.getNumEvents() == 1 && firstMessage (out).getNoteNumber() == 72,
           "transpose moves the note");

    // The invariant: the note-off follows what was SENT, even after the rules change.
    settings.transpose = 0;
    chain.setSettings (settings);
    juce::MidiBuffer release;
    release.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
    chain.process (release, out);
    check (out.getNumEvents() == 1 && firstMessage (out).getNoteNumber() == 72
             && firstMessage (out).isNoteOff(),
           "and the release still finds the note that is actually sounding");

    {
        MidiFxChain smartTranspose;
        MidiFxSettings smart;
        smart.transpose = 2;
        smart.transposeMode = "diatonic";
        smart.scaleRoot = 0;
        smart.scaleType = "major";
        smartTranspose.setSettings (smart);

        juce::MidiBuffer phrase, shifted;
        phrase.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        phrase.addEvent (juce::MidiMessage::noteOn (1, 62, (juce::uint8) 100), 1);
        phrase.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 2);
        smartTranspose.process (phrase, shifted);
        std::vector<int> notes;
        for (const auto metadata : shifted)
            if (metadata.getMessage().isNoteOn())
                notes.push_back (metadata.getMessage().getNoteNumber());
        check (notes == std::vector<int> ({ 64, 65, 67 }),
               "smart transpose moves C, D, E up two C-major degrees to E, F, G");

        smart.transpose = -2;
        smartTranspose.setSettings (smart);
        phrase.clear();
        phrase.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
        phrase.addEvent (juce::MidiMessage::noteOff (1, 62), 1);
        phrase.addEvent (juce::MidiMessage::noteOff (1, 64), 2);
        smartTranspose.process (phrase, shifted);
        notes.clear();
        for (const auto metadata : shifted)
            if (metadata.getMessage().isNoteOff())
                notes.push_back (metadata.getMessage().getNoteNumber());
        check (notes == std::vector<int> ({ 64, 65, 67 }),
               "smart-transposed releases follow the notes already sounding after an edit");

        smart.transposeMode = "chromatic";
        smart.transpose = 2;
        smartTranspose.setSettings (smart);
        phrase.clear();
        phrase.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        smartTranspose.process (phrase, shifted);
        check (shifted.getNumEvents() == 1 && firstMessage (shifted).getNoteNumber() == 62,
               "chromatic transpose retains the original semitone behaviour");
    }

    // Scale constraint moves notes to the nearest member.
    settings.constrainToScale = true;
    settings.scaleType = "major";
    settings.scaleRoot = 0;
    chain.setSettings (settings);
    in.clear();
    in.addEvent (juce::MidiMessage::noteOn (1, 61, (juce::uint8) 100), 0);   // C#
    chain.process (in, out);
    check (out.getNumEvents() == 1 && firstMessage (out).getNoteNumber() == 62,
           "C sharp folds into the nearest note of C major");

    // Chord generation stacks voices, and all of them are released together.
    settings.constrainToScale = false;
    settings.chord = MidiFxSettings::ChordType::triad;
    chain.setSettings (settings);
    in.clear();
    in.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
    chain.process (in, out);
    int ons = 0;
    for (const auto metadata : out)
        ons += metadata.getMessage().isNoteOn() ? 1 : 0;
    check (ons == 3, "a triad plays three notes from one key");

    release.clear();
    release.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
    chain.process (release, out);
    int offs = 0;
    for (const auto metadata : out)
        offs += metadata.getMessage().isNoteOff() ? 1 : 0;
    check (offs == 3, "and one key release takes all three with it");

    // Velocity: scale then fixed.
    settings.chord = MidiFxSettings::ChordType::off;
    settings.velocityScale = 0.5f;
    chain.setSettings (settings);
    in.clear();
    in.addEvent (juce::MidiMessage::noteOn (1, 62, (juce::uint8) 100), 0);
    chain.process (in, out);
    check (firstMessage (out).getVelocity() == 50, "velocity scaling applies");

    settings.velocityFixed = 90;
    chain.setSettings (settings);
    in.clear();
    in.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 20), 0);
    chain.process (in, out);
    check (firstMessage (out).getVelocity() == 90, "a fixed velocity overrides the scale");

    {
        MidiFxChain response;
        MidiFxSettings shaped;
        check (response.isTransparent(),
               "a fresh velocity/expression designer preserves the legacy stream exactly");

        shaped.velocityInputMin = 20;
        shaped.velocityInputMax = 100;
        shaped.velocityOutputMin = 30;
        shaped.velocityOutputMax = 110;
        shaped.velocityCurve = MidiFxSettings::ResponseCurve::hard;
        response.setSettings (shaped);
        juce::MidiBuffer press, result;
        press.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 60), 0);
        response.process (press, result);
        check ((int) firstMessage (result).getVelocity() == 50,
               "device range, instrument range and a hard curve shape note velocity together");

        shaped.velocityCurve = MidiFxSettings::ResponseCurve::custom;
        shaped.velocityInputMin = 1;
        shaped.velocityInputMax = 127;
        shaped.velocityOutputMin = 1;
        shaped.velocityOutputMax = 127;
        shaped.velocityCurveValues = { 0, 0, 0, 0, 127, 127, 127, 127, 127 };
        response.setSettings (shaped);
        press.clear();
        press.addEvent (juce::MidiMessage::noteOn (1, 61, (juce::uint8) 64), 0);
        response.process (press, result);
        check ((int) firstMessage (result).getVelocity() == 127,
               "a custom nine-point response curve is used on the real-time note path");

        shaped.expressionEnabled = true;
        shaped.expressionSource = "cc";
        shaped.expressionCc = 11;
        shaped.expressionCurve = MidiFxSettings::ResponseCurve::linear;
        shaped.expressionInputMin = 20;
        shaped.expressionInputMax = 100;
        shaped.expressionOutputMin = 0;
        shaped.expressionOutputMax = 127;
        response.setSettings (shaped);
        juce::MidiBuffer expression;
        expression.addEvent (juce::MidiMessage::controllerEvent (3, 11, 60), 4);
        expression.addEvent (juce::MidiMessage::controllerEvent (3, 1, 60), 5);
        response.process (expression, result);
        std::vector<int> values;
        for (const auto metadata : result)
            if (metadata.getMessage().isController())
                values.push_back (metadata.getMessage().getControllerValue());
        check (values == std::vector<int> ({ 64, 60 }),
               "the selected expression message is normalized and unrelated controllers pass through");

        shaped.expressionSource = "poly aftertouch";
        shaped.expressionCurve = MidiFxSettings::ResponseCurve::hard;
        shaped.expressionInputMin = 0;
        shaped.expressionInputMax = 127;
        response.setSettings (shaped);
        expression.clear();
        expression.addEvent (juce::MidiMessage::aftertouchChange (2, 72, 64), 0);
        response.process (expression, result);
        check (firstMessage (result).isAftertouch()
                 && firstMessage (result).getNoteNumber() == 72
                 && firstMessage (result).getAfterTouchValue() == 32,
               "poly-aftertouch keeps its note identity while its pressure is curved");
    }

    {
        // --- the chorder's diatonic half: one finger, the chord OF that degree ----------
        MidiFxChain diatonicChain;
        MidiFxSettings diatonicSettings;
        diatonicSettings.scaleType = "major";
        diatonicSettings.scaleRoot = 0;
        diatonicSettings.chord = MidiFxSettings::ChordType::diatonic;
        diatonicChain.setSettings (diatonicSettings);

        auto notesFor = [] (MidiFxChain& fx, int key)
        {
            juce::MidiBuffer press, result;
            press.addEvent (juce::MidiMessage::noteOn (1, key, (juce::uint8) 100), 0);
            fx.process (press, result);
            std::vector<int> notes;
            for (const auto metadata : result)
                if (metadata.getMessage().isNoteOn())
                    notes.push_back (metadata.getMessage().getNoteNumber());
            juce::MidiBuffer lift, flush;
            lift.addEvent (juce::MidiMessage::noteOff (1, key), 0);
            fx.process (lift, flush);
            return notes;
        };

        check (notesFor (diatonicChain, 62) == std::vector<int> { 62, 65, 69 },
               "D in C major plays D minor — the degree's own chord, not a shape");
        check (notesFor (diatonicChain, 71) == std::vector<int> { 71, 74, 77 },
               "and B plays B diminished, because that is what lives on that degree");

        diatonicSettings.chord = MidiFxSettings::ChordType::diatonicSeventh;
        diatonicChain.setSettings (diatonicSettings);
        check (notesFor (diatonicChain, 60) == std::vector<int> { 60, 64, 67, 71 },
               "the seventh flavour stacks one more scale third");

        // --- Smart Chorder register and motion -----------------------------------------
        MidiFxChain smart;
        MidiFxSettings smartSettings;
        smartSettings.chord = MidiFxSettings::ChordType::triad;
        smartSettings.chordInversion = 1;
        smart.setSettings (smartSettings);
        check (notesFor (smart, 60) == std::vector<int> { 64, 67, 72 },
               "the inversion control rotates the lowest chord voice upward");

        smartSettings.chordInversion = 0;
        smartSettings.chordVoicing = MidiFxSettings::ChordVoicing::open;
        smart.setSettings (smartSettings);
        check (notesFor (smart, 60) == std::vector<int> { 60, 67, 76 },
               "open voicing spreads a triad without changing its chord tones");

        MidiFxChain leading;
        smartSettings.chordVoicing = MidiFxSettings::ChordVoicing::close;
        smartSettings.chordVoiceLeading = true;
        leading.setSettings (smartSettings);
        check (notesFor (leading, 60) == std::vector<int> { 60, 64, 67 },
               "voice leading starts from the played register when there is no history");
        check (notesFor (leading, 65) == std::vector<int> { 60, 65, 69 },
               "then chooses F/C so C stays put and the other voices move minimally");

        // --- and its learned half: per-key chords, exactly as captured ------------------
        MidiFxChain learned;
        MidiFxSettings learnedSettings;
        learnedSettings.chord = MidiFxSettings::ChordType::keyChords;
        MidiFxSettings::KeyChord captured;
        captured.key = 60;
        captured.offsets = { 0, 3, 7, 12 };
        learnedSettings.keyChords.add (captured);
        learned.setSettings (learnedSettings);

        check (notesFor (learned, 60) == std::vector<int> { 60, 63, 67, 72 },
               "a mapped key plays exactly the chord captured for it");
        check (notesFor (learned, 61) == std::vector<int> { 61 },
               "an unmapped key passes through plain — the map is the whole rule");

        // Six voices release cleanly: press a wide mapped chord, lift, count the offs.
        MidiFxSettings::KeyChord wide;
        wide.key = 48;
        wide.offsets = { 0, 4, 7, 12, 16, 19 };
        learnedSettings.keyChords.add (wide);
        learned.setSettings (learnedSettings);
        juce::MidiBuffer press, sound, lift, silence;
        press.addEvent (juce::MidiMessage::noteOn (1, 48, (juce::uint8) 100), 0);
        learned.process (press, sound);
        lift.addEvent (juce::MidiMessage::noteOff (1, 48), 0);
        learned.process (lift, silence);
        int ons = 0, offs = 0;
        for (const auto metadata : sound) ons += metadata.getMessage().isNoteOn() ? 1 : 0;
        for (const auto metadata : silence) offs += metadata.getMessage().isNoteOff() ? 1 : 0;
        check (ons == 6 && offs == 6, "six captured voices sound and all six release");
    }
}

void testScalesAndSerialization()
{
    std::cout << "\nmodel: scales and the document round trip" << std::endl;

    const auto major = scaleMask ("major", 0);
    check ((major & (1 << 0)) != 0 && (major & (1 << 1)) == 0 && (major & (1 << 4)) != 0,
           "C major holds C and E and not C sharp");
    check (constrainNoteToScale (61, major) == 62, "a foreign note moves to the nearest member");
    check (constrainNoteToScale (60, scaleMask ("nonsense", 0)) == 60,
           "an unknown scale name is chromatic, never a muted keyboard");

    auto pattern = Pattern::create ("Round trip");
    pattern.swing = 0.25f;
    pattern.variationGroupId = "variations-1";
    pattern.variationLabel = "A";
    pattern.variationSourcePatternId = pattern.patternId;
    pattern.variationAmount = 0.85f;
    pattern.appliedGrooveId = "@hostage-mpc54";
    pattern.appliedGrooveAmount = 0.75f;
    auto lane = makeNoteLane ("l1", "p1", 7, 6, 2, 48);
    lane.steps.getReference (0).probability = 60;
    lane.steps.getReference (0).ratchets = 3;
    lane.steps.getReference (2).microtiming = -0.25f;
    lane.type = LaneType::chord;
    lane.lockSourceLaneId = "source-lane";
    lane.steps.getReference (0).chordNotes.add (55);
    pattern.lanes.add (lane);

    Pattern restored;
    check (patternFromVar (patternToVar (pattern), restored), "a pattern serializes and parses");
    check (restored.lanes.size() == 1 && restored.lanes[0].stepCount == 7
             && restored.lanes[0].stepsPerBeat == 6
             && restored.lanes[0].steps[0].ratchets == 3
             && restored.lanes[0].steps[0].probability == 60
             && std::abs (restored.lanes[0].steps[2].microtiming + 0.25f) < 1.0e-6f
             && restored.lanes[0].steps[0].chordNotes.contains (55)
             && restored.lanes[0].lockSourceLaneId == "source-lane"
             && restored.variationGroupId == "variations-1"
             && restored.variationLabel == "A"
             && restored.variationSourcePatternId == pattern.patternId
             && std::abs (restored.variationAmount - 0.85f) < 1.0e-6f
             && restored.appliedGrooveId == "@hostage-mpc54"
             && std::abs (restored.appliedGrooveAmount - 0.75f) < 1.0e-6f
             && std::abs (restored.swing - 0.25f) < 1.0e-6f,
           "with every step property, parameter-lock link and variation identity intact");
    check (restored.seed == pattern.seed, "and the seed, so the same dice roll again");

    const auto factoryGrooves = GrooveTemplate::factoryTemplates();
    check (factoryGrooves.size() == 3
             && factoryGrooves[0].name.containsIgnoreCase ("MPC-style")
             && factoryGrooves[0].timingOffsets.size() == 16,
           "factory groove templates are reusable 16-step feels");
    GrooveTemplate restoredGroove;
    check (grooveTemplateFromVar (grooveTemplateToVar (factoryGrooves[1]), restoredGroove)
             && restoredGroove.grooveId == factoryGrooves[1].grooveId
             && restoredGroove.timingOffsets.size() == 16
             && restoredGroove.velocityMultipliers.size() == 16,
           "groove timing and velocity accents survive the document round trip");

    auto grooved = Pattern::create ("Pocket");
    auto grooveLane = makeNoteLane ("groove-lane", "p1", 16, 4, 4, 60);
    for (auto& step : grooveLane.steps)
    {
        step.active = true;
        step.velocity = 100;
    }
    grooved.lanes.add (grooveLane);
    applyGrooveTemplate (grooved, factoryGrooves[1], 0.5f, true);
    check (std::abs (grooved.lanes[0].steps[1].microtiming - 0.12f) < 1.0e-6f
             && grooved.lanes[0].steps[0].velocity == 105
             && grooved.appliedGrooveId == factoryGrooves[1].grooveId
             && std::abs (grooved.appliedGrooveAmount - 0.5f) < 1.0e-6f,
           "a groove commits scaled timing and accents into editable pattern steps");

    Pattern source = Pattern::create ("Pulse");
    source.seed = 12345;
    source.variationGroupId = "variation-group";
    source.variationLabel = "A";
    source.variationSourcePatternId = source.patternId;
    auto notes = makeNoteLane ("notes", "p1", 16, 4, 4, 60);
    source.lanes.add (notes);
    Lane locks;
    locks.laneId = "locks";
    locks.type = LaneType::parameter;
    locks.lockSourceLaneId = notes.laneId;
    locks.stepCount = 16;
    locks.resizeSteps();
    for (int i = 0; i < locks.steps.size(); ++i)
    {
        locks.steps.getReference (i).active = notes.steps.getReference (i).active;
        locks.steps.getReference (i).value = (float) i / 15.0f;
    }
    source.lanes.add (locks);

    const auto feel = makePatternVariation (source, 'B', 0.55f);
    const auto sparse = makePatternVariation (source, 'C', 0.55f);
    const auto fill = makePatternVariation (source, 'D', 0.55f);
    const auto activeSteps = [] (const Lane& candidate)
    {
        int active = 0;
        for (const auto& step : candidate.steps)
            active += step.active ? 1 : 0;
        return active;
    };
    check (feel.variationLabel == "B" && sparse.variationLabel == "C"
             && fill.variationLabel == "D" && feel.patternId != source.patternId,
           "A generates independent, labelled B/C/D patterns");
    check (feel.lanes[0].steps[0].velocity != source.lanes[0].steps[0].velocity
             || std::abs (feel.lanes[0].steps[0].microtiming
                           - source.lanes[0].steps[0].microtiming) > 1.0e-6f,
           "B changes feel without moving steps");
    check (activeSteps (sparse.lanes[0]) > 0
             && activeSteps (sparse.lanes[0]) < activeSteps (source.lanes[0]),
           "C is sparser but never empties a phrase");
    check (activeSteps (fill.lanes[0]) > activeSteps (source.lanes[0]),
           "D adds a real editable fill in the final quarter");
    check (sparse.lanes[1].lockSourceLaneId == sparse.lanes[0].laneId
             && fill.lanes[1].lockSourceLaneId == fill.lanes[0].laneId,
           "generated parameter-lock lanes point at the generated note lane");
    bool locksFollowNotes = true;
    for (int i = 0; i < sparse.lanes[1].steps.size(); ++i)
        locksFollowNotes = locksFollowNotes
                           && (! sparse.lanes[1].steps[i].active || sparse.lanes[0].steps[i].active);
    check (locksFollowNotes && ! fill.lanes[1].steps[13].active
                            && ! fill.lanes[1].steps[15].active,
           "sparse locks follow removed notes and fill notes do not invent locks");

    Clip loopClip;
    loopClip.clipId = "loop-1";
    loopClip.patternId = pattern.patternId;
    loopClip.name = "Layer 1";
    loopClip.looperLayer = true;
    loopClip.overdubPasses = 3;
    loopClip.gestureClip = true;
    loopClip.gesturePasses = 2;
    loopClip.frozenMidi = true;
    loopClip.frozenFromClipId = "source-clip";
    loopClip.frozenCycles = 4;
    loopClip.frozenNoteCount = 27;
    loopClip.followAction = "random";
    loopClip.followAfterLoops = 4;
    loopClip.fillPatternId = "variation-d";
    loopClip.fillQuantize = Quantize::beat;
    loopClip.fillCc = 80;
    loopClip.fillChannel = 2;
    Clip restoredClip;
    check (clipFromVar (clipToVar (loopClip), restoredClip)
             && restoredClip.looperLayer && restoredClip.overdubPasses == 3
             && restoredClip.gestureClip && restoredClip.gesturePasses == 2
             && restoredClip.frozenMidi && restoredClip.frozenFromClipId == "source-clip"
             && restoredClip.frozenCycles == 4 && restoredClip.frozenNoteCount == 27
             && restoredClip.followAction == "random" && restoredClip.followAfterLoops == 4
             && restoredClip.fillPatternId == "variation-d"
             && restoredClip.fillQuantize == Quantize::beat
             && restoredClip.fillCc == 80 && restoredClip.fillChannel == 2,
           "recorded roles and held-fill/pedal settings survive the session round trip");

    Scene scene;
    scene.sceneId = "s1";
    scene.name = "Verse";
    scene.clipIds.add ("c1");
    scene.slots.add ({ "p1", true, false, 0.8f, true });
    scene.macros.add ({ "m1", 0.5f });
    scene.parameters.add ({ "p1", "synth-1", "cutoff", 0.65f });
    scene.tempo = 96.0;
    scene.morphBeats = 4.0;
    Scene restoredScene;
    check (sceneFromVar (sceneToVar (scene), restoredScene)
             && restoredScene.name == "Verse"
             && restoredScene.clipIds.contains ("c1")
             && restoredScene.slots.size() == 1
             && std::abs (restoredScene.slots[0].volume - 0.8f) < 1.0e-6f
             && restoredScene.macros.size() == 1
             && restoredScene.parameters.size() == 1
             && restoredScene.parameters[0].parameterId == "cutoff"
             && std::abs (restoredScene.tempo - 96.0) < 1.0e-9
             && std::abs (restoredScene.morphBeats - 4.0) < 1.0e-9,
           "a scene carries its clips, slots, macros, mapped parameters, tempo and morph time");

    Setlist setlist;
    setlist.items.add ({ "i1", "Opener", "s1", "rack-capture-1", "page-filter",
                         "count in on the hats", 128.0 });
    setlist.currentIndex = 0;
    setlist.preloadAhead = 2;
    Setlist restoredSetlist;
    check (setlistFromVar (setlistToVar (setlist), restoredSetlist)
             && restoredSetlist.items.size() == 1
             && restoredSetlist.items[0].rackRecordId == "rack-capture-1"
             && restoredSetlist.items[0].pageId == "page-filter"
             && restoredSetlist.items[0].notes == "count in on the hats"
             && restoredSetlist.currentIndex == 0
             && restoredSetlist.preloadAhead == 2,
           "and a setlist keeps full-rack/page recall, preload policy, notes and its place");

    Arrangement arrangement;
    arrangement.items.add ({ "a1", "Intro", "s1", 2 });
    arrangement.items.add ({ "a2", "Verse", "s1", 8 });
    arrangement.loop = true;
    Arrangement restoredArrangement;
    check (arrangementFromVar (arrangementToVar (arrangement), restoredArrangement)
             && restoredArrangement.items.size() == 2
             && restoredArrangement.items[0].bars == 2
             && restoredArrangement.items[1].name == "Verse"
             && restoredArrangement.loop,
           "and the compact arranger keeps scene order, bar counts and looping");

    ArpSettings arp;
    arp.enabled = true;
    arp.mode = ArpSettings::Mode::upDown;
    arp.octaves = 3;
    arp.velocityPattern.add (127);
    arp.velocityPattern.add (80);
    arp.mode = ArpSettings::Mode::pattern;
    arp.degreePattern.add (0);
    arp.degreePattern.add (-1);
    arp.degreePattern.add (5);
    arp.patternSemitones = true;
    ArpSettings restoredArp;
    arpFromVar (arpToVar (arp), restoredArp);
    check (restoredArp.enabled && restoredArp.mode == ArpSettings::Mode::pattern
             && restoredArp.octaves == 3 && restoredArp.velocityPattern.size() == 2,
           "arp settings round trip, accents and the drawn mode included");
    check (restoredArp.degreePattern.size() == 3 && restoredArp.degreePattern[1] == -1
             && restoredArp.degreePattern[2] == 5,
           "the drawn melody survives the trip, rests included");
    check (restoredArp.patternSemitones, "and remembers whether rows are degrees or semitones");

    MidiFxSettings fx;
    fx.transpose = -7;
    fx.transposeMode = "diatonic";
    fx.chord = MidiFxSettings::ChordType::seventh;
    fx.chordInversion = 2;
    fx.chordVoicing = MidiFxSettings::ChordVoicing::drop2;
    fx.chordVoiceLeading = true;
    {
        MidiFxSettings::KeyChord kc;
        kc.key = 62;
        kc.offsets = { -2, 2, 5 };
        fx.keyChords.add (kc);
    }
    fx.constrainToScale = true;
    fx.scaleType = "dorian";
    fx.responseProfileName = "CTRL49 studio";
    fx.velocityCurve = MidiFxSettings::ResponseCurve::custom;
    fx.velocityInputMin = 18;
    fx.velocityInputMax = 116;
    fx.velocityOutputMin = 25;
    fx.velocityOutputMax = 120;
    fx.velocityCurveValues = { 0, 8, 20, 38, 62, 82, 101, 116, 127 };
    fx.expressionEnabled = true;
    fx.expressionSource = "channel pressure";
    fx.expressionCurve = MidiFxSettings::ResponseCurve::soft;
    fx.expressionInputMin = 4;
    fx.expressionInputMax = 110;
    fx.expressionOutputMin = 10;
    fx.expressionOutputMax = 118;
    MidiFxSettings restoredFx;
    midiFxFromVar (midiFxToVar (fx), restoredFx);
    check (restoredFx.transpose == -7 && restoredFx.transposeMode == "diatonic"
             && restoredFx.chord == MidiFxSettings::ChordType::seventh
             && restoredFx.scaleType == "dorian" && restoredFx.chordInversion == 2
             && restoredFx.chordVoicing == MidiFxSettings::ChordVoicing::drop2
             && restoredFx.chordVoiceLeading
             && restoredFx.responseProfileName == "CTRL49 studio"
             && restoredFx.velocityCurve == MidiFxSettings::ResponseCurve::custom
             && restoredFx.velocityInputMin == 18 && restoredFx.velocityInputMax == 116
             && restoredFx.velocityOutputMin == 25 && restoredFx.velocityOutputMax == 120
             && restoredFx.velocityCurveValues.size() == MidiFxSettings::responseCurvePoints
             && restoredFx.expressionEnabled
             && restoredFx.expressionSource == "channel pressure"
             && restoredFx.expressionCurve == MidiFxSettings::ResponseCurve::soft
             && restoredFx.expressionInputMin == 4 && restoredFx.expressionInputMax == 110
             && restoredFx.expressionOutputMin == 10 && restoredFx.expressionOutputMax == 118,
           "and so do the MIDI FX");
    check (restoredFx.keyChords.size() == 1 && restoredFx.keyChords[0].key == 62
             && restoredFx.keyChords[0].offsets == juce::Array<int> { -2, 2, 5 },
           "the learned key map survives the trip");

    NoteModuleSettings strum;
    strum.strumBeats = 0.5;
    strum.strumPattern = NoteModuleSettings::StrumPattern::outsideIn;
    strum.strumCurve = 0.65f;
    strum.strumVelocityRamp = -24;
    NoteModuleSettings restoredStrum;
    noteModuleFromVar (noteModuleToVar (strum), restoredStrum);
    check (restoredStrum.strumBeats == 0.5
             && restoredStrum.strumPattern == NoteModuleSettings::StrumPattern::outsideIn
             && juce::approximatelyEqual (restoredStrum.strumCurve, 0.65f)
             && restoredStrum.strumVelocityRamp == -24,
           "the Strummer's pattern, feel and dynamic sweep survive the trip");

    NoteModuleSettings humanize;
    humanize.humanizeTimingBeats = 0.03;
    humanize.humanizeVelocity = 18;
    humanize.humanizeGatePercent = 35;
    humanize.humanizePreserveChords = true;
    humanize.humanizeProtectBeats = true;
    NoteModuleSettings restoredHumanize;
    noteModuleFromVar (noteModuleToVar (humanize), restoredHumanize);
    check (restoredHumanize.humanizeTimingBeats == 0.03
             && restoredHumanize.humanizeVelocity == 18
             && restoredHumanize.humanizeGatePercent == 35
             && restoredHumanize.humanizePreserveChords
             && restoredHumanize.humanizeProtectBeats,
           "the Humanizer's timing, dynamics, gate and musical constraints survive the trip");

    NoteModuleSettings mpe;
    mpe.mpeEnabled = true;
    mpe.mpeInput = "poly aftertouch";
    mpe.mpeOutput = "mpe";
    mpe.mpeOutputAxis = "timbre";
    mpe.mpeInputCc = 11;
    mpe.mpeOutputCc = 1;
    mpe.mpeOutputChannel = 16;
    mpe.mpeMemberFirst = 1;
    mpe.mpeMemberLast = 15;
    mpe.mpeCollapse = "highest";
    NoteModuleSettings restoredMpe;
    noteModuleFromVar (noteModuleToVar (mpe), restoredMpe);
    check (restoredMpe.mpeEnabled && restoredMpe.mpeInput == "poly aftertouch"
             && restoredMpe.mpeOutput == "mpe" && restoredMpe.mpeOutputAxis == "timbre"
             && restoredMpe.mpeInputCc == 11 && restoredMpe.mpeOutputCc == 1
             && restoredMpe.mpeOutputChannel == 16 && restoredMpe.mpeMemberFirst == 1
             && restoredMpe.mpeMemberLast == 15 && restoredMpe.mpeCollapse == "highest",
           "the MPE transform, zone and poly-to-mono rule survive the session round trip");

    NoteModuleSettings articulationSettings;
    articulationSettings.articulationEnabled = true;
    articulationSettings.articulationMapName = "Solo strings";
    NoteModuleSettings::Articulation articulation;
    articulation.articulationId = "spiccato";
    articulation.name = "Spiccato";
    articulation.triggerNote = 25;
    articulation.triggerChannel = 2;
    articulation.type = "program change";
    articulation.outputChannel = 5;
    articulation.program = 16;
    articulation.bankMsb = 3;
    articulation.bankLsb = 9;
    articulationSettings.articulations.add (articulation);
    NoteModuleSettings restoredArticulations;
    noteModuleFromVar (noteModuleToVar (articulationSettings), restoredArticulations);
    check (restoredArticulations.articulationEnabled
             && restoredArticulations.articulationMapName == "Solo strings"
             && restoredArticulations.articulations.size() == 1
             && restoredArticulations.articulations[0].articulationId == "spiccato"
             && restoredArticulations.articulations[0].name == "Spiccato"
             && restoredArticulations.articulations[0].triggerNote == 25
             && restoredArticulations.articulations[0].triggerChannel == 2
             && restoredArticulations.articulations[0].type == "program change"
             && restoredArticulations.articulations[0].outputChannel == 5
             && restoredArticulations.articulations[0].program == 16
             && restoredArticulations.articulations[0].bankMsb == 3
             && restoredArticulations.articulations[0].bankLsb == 9,
           "the named articulation map and bank/program action survive the session round trip");

    auto* legacyStrumObject = new juce::DynamicObject();
    legacyStrumObject->setProperty ("strumBeats", 0.25);
    legacyStrumObject->setProperty ("strumDown", true);
    NoteModuleSettings legacyStrum;
    noteModuleFromVar (juce::var (legacyStrumObject), legacyStrum);
    check (legacyStrum.strumPattern == NoteModuleSettings::StrumPattern::descending,
           "a session written before stroke patterns keeps its high-to-low direction");
}

} // namespace

// The later MIDI note modules. What each one must do, and — the half that matters more —
// what none of them may do: leave a note sounding.
//
// Every module here either invents notes or swallows the note-off for one it passed on, so
// every one of them owns something. A module that emits and forgets is a stuck note, which on
// stage is the only bug that matters.
void testNoteModules()
{
    std::cout << "\nthe later MIDI note modules" << std::endl;

    const auto slot = [] (const juce::String& type)
    {
        return MidiSlot::create (type, "slot-" + type);
    };

    // Runs a press-and-release through a rack and collects everything, block by block, with
    // the sample offset each event landed on.
    struct Event { int block; int sample; bool on; int note; int velocity; };
    const auto run = [] (MidiInsertRack& rack, juce::MidiBuffer input, int blocks)
    {
        Transport clock;
        clock.setTempo (120.0);
        std::vector<Event> events;
        for (int block = 0; block < blocks; ++block)
        {
            juce::MidiBuffer out;
            rack.process (input, out, clock.advance (blockSize, sampleRate), blockSize);
            input.clear();
            for (const auto metadata : out)
            {
                const auto message = metadata.getMessage();
                if (message.isNoteOnOrOff())
                    events.push_back ({ block, metadata.samplePosition, message.isNoteOn(),
                                        message.getNoteNumber(), (int) message.getVelocity() });
            }
        }
        return events;
    };
    const auto onsOf = [] (const std::vector<Event>& events)
    {
        int count = 0;
        for (const auto& event : events)
            if (event.on) ++count;
        return count;
    };
    const auto balanced = [] (const std::vector<Event>& events)
    {
        std::map<int, int> sounding;
        for (const auto& event : events)
            sounding[event.note] += event.on ? 1 : -1;
        for (const auto& [note, count] : sounding)
            if (count != 0)
                return false;
        return true;
    };

    // Every module is transparent until it is set up. This is a rule the file already had and
    // these six nearly broke — an inserted module must not change the sound by existing.
    for (const auto* type : { "echo", "strum", "humanize", "chance", "length", "latch" })
    {
        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ slot (type) });

        juce::MidiBuffer input;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::noteOff (1, 60), 40);
        const auto events = run (rack, input, 4);
        check (events.size() == 2 && events[0].on && ! events[1].on
                 && events[0].note == 60 && events[0].velocity == 100,
               juce::String ("a fresh ") + type + " passes the note through untouched");
    }

    // -- echo ---------------------------------------------------------------------------
    {
        auto echo = slot ("echo");
        echo.mod.echoRepeats = 3;
        echo.mod.echoStepBeats = 0.25;
        echo.mod.echoFeedback = 0.6f;
        echo.mod.echoTranspose = 12;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ echo });

        juce::MidiBuffer input;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::noteOff (1, 60), 20);
        const auto events = run (rack, input, 200);

        check (onsOf (events) == 4, "the note plus three repeats");
        check (balanced (events), "and every one of them ends — nothing is left sounding");

        std::vector<int> notes, velocities;
        for (const auto& event : events)
            if (event.on) { notes.push_back (event.note); velocities.push_back (event.velocity); }
        check (notes == std::vector<int> ({ 60, 72, 84, 96 }), "each repeat climbs an octave");
        check (velocities[1] < velocities[0] && velocities[2] < velocities[1]
                 && velocities[3] < velocities[2],
               "and each is quieter than the one before");

        // Off the top of the keyboard the chain stops rather than wrapping to a bass note.
        auto high = echo;
        high.mod.echoTranspose = 24;
        MidiInsertRack ceiling;
        ceiling.prepare (blockSize);
        ceiling.setSlots ({ high });
        juce::MidiBuffer top;
        top.addEvent (juce::MidiMessage::noteOn (1, 100, (juce::uint8) 100), 0);
        top.addEvent (juce::MidiMessage::noteOff (1, 100), 20);
        const auto ceilingEvents = run (ceiling, top, 200);
        bool wrapped = false;
        for (const auto& event : ceilingEvents)
            wrapped = wrapped || event.note < 100;
        check (! wrapped, "a repeat past the top of the keyboard is dropped, never wrapped");
        check (balanced (ceilingEvents), "and what did sound still stops");
    }

    // -- strum --------------------------------------------------------------------------
    {
        auto strum = slot ("strum");
        strum.mod.strumBeats = 0.25;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ strum });

        // A chord arriving together, deliberately out of pitch order.
        juce::MidiBuffer chord;
        chord.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 0);
        chord.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 1);
        chord.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 2);
        const auto events = run (rack, chord, 200);

        std::vector<int> order;
        for (const auto& event : events)
            if (event.on) order.push_back (event.note);
        check (order == std::vector<int> ({ 60, 64, 67 }),
               "the chord comes out low to high, whatever order the keys were hit in");

        // Spread means spread: the last note is genuinely later than the first.
        int firstBlock = -1, lastBlock = -1;
        for (const auto& event : events)
            if (event.on) { if (firstBlock < 0) firstBlock = event.block; lastBlock = event.block; }
        check (lastBlock > firstBlock, "and they are spread over time rather than stacked");

        // Downwards is the same notes, the other way round — the case arrival order alone
        // could never do, which is why the module collects before it deals.
        auto down = strum;
        down.mod.strumDown = true;
        MidiInsertRack downwards;
        downwards.prepare (blockSize);
        downwards.setSlots ({ down });
        juce::MidiBuffer again;
        again.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        again.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 1);
        again.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 2);
        std::vector<int> downOrder;
        for (const auto& event : run (downwards, again, 200))
            if (event.on) downOrder.push_back (event.note);
        check (downOrder == std::vector<int> ({ 67, 64, 60 }), "downwards strums high to low");

        // Guitar/harp patterns are actual deal orders, not labels on the same ramp.
        auto expressive = strum;
        expressive.mod.strumPattern = NoteModuleSettings::StrumPattern::outsideIn;
        expressive.mod.strumCurve = 1.0f;
        expressive.mod.strumVelocityRamp = -30;
        MidiInsertRack harp;
        harp.prepare (blockSize);
        harp.setSlots ({ expressive });
        juce::MidiBuffer four;
        four.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 0);
        four.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 1);
        four.addEvent (juce::MidiMessage::noteOn (1, 72, (juce::uint8) 100), 2);
        four.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 3);
        std::vector<int> harpOrder, harpVelocity;
        for (const auto& event : run (harp, four, 200))
            if (event.on)
            {
                harpOrder.push_back (event.note);
                harpVelocity.push_back (event.velocity);
            }
        check (harpOrder == std::vector<int> ({ 60, 72, 64, 67 }),
               "outside-in plucks the outer strings first, then works inward");
        check (harpVelocity.size() == 4 && harpVelocity.front() == 100
                 && harpVelocity.back() == 70,
               "the dynamic sweep reaches its exact first and last velocities");

        // Delaying only the note-on silently shortens the later strings. Each release must
        // move by that string's own delay, retaining the duration that was played.
        MidiInsertRack durations;
        durations.prepare (blockSize);
        durations.setSlots ({ strum });
        juce::MidiBuffer shortChord;
        const int shortNotes[] { 60, 64, 67 };
        for (int i = 0; i < 3; ++i)
        {
            const auto note = shortNotes[i];
            shortChord.addEvent (juce::MidiMessage::noteOn (1, note, (juce::uint8) 100), i);
            shortChord.addEvent (juce::MidiMessage::noteOff (1, note), 40 + i);
        }
        std::map<int, int> beganAt, endedAt;
        for (const auto& event : run (durations, shortChord, 200))
        {
            const auto absoluteSample = event.block * blockSize + event.sample;
            if (event.on) beganAt[event.note] = absoluteSample;
            else endedAt[event.note] = absoluteSample;
        }
        bool lengthsPreserved = beganAt.size() == 3 && endedAt.size() == 3;
        for (const auto& [note, began] : beganAt)
            lengthsPreserved = lengthsPreserved && std::abs (endedAt[note] - began - 40) <= 1;
        check (lengthsPreserved,
               "every string keeps the played note length after its staggered start");
    }

    // -- humanize -----------------------------------------------------------------------
    {
        auto humanize = slot ("humanize");
        humanize.mod.humanizeTimingBeats = 0.05;
        humanize.mod.humanizeVelocity = 20;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ humanize });

        // The same note, over and over: the point is that it does NOT come out identical.
        std::vector<int> velocities;
        std::vector<int> positions;
        Transport clock;
        clock.setTempo (120.0);
        for (int i = 0; i < 24; ++i)
        {
            juce::MidiBuffer input, out;
            input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 64), 0);
            input.addEvent (juce::MidiMessage::noteOff (1, 60), 30);
            rack.process (input, out, clock.advance (blockSize, sampleRate), blockSize);
            const auto collect = [&velocities, &positions] (const juce::MidiBuffer& buffer)
            {
                for (const auto metadata : buffer)
                    if (metadata.getMessage().isNoteOn())
                    {
                        velocities.push_back ((int) metadata.getMessage().getVelocity());
                        positions.push_back (metadata.samplePosition);
                    }
            };
            collect (out);
            // The settle blocks count too. Humanize can only push a note LATER, so most of
            // them land in a block after the one they arrived in — reading only the first
            // block would measure the module's latency rather than its output.
            for (int settle = 0; settle < 3; ++settle)
            {
                juce::MidiBuffer none, tail;
                rack.process (none, tail, clock.advance (blockSize, sampleRate), blockSize);
                collect (tail);
            }
        }
        check (velocities.size() > 12, "the notes come through");
        check (std::set<int> (velocities.begin(), velocities.end()).size() > 3,
               "velocity varies rather than repeating one value");
        check (std::set<int> (positions.begin(), positions.end()).size() > 1,
               "and so does when they land");
        bool outOfBounds = false;
        for (const auto velocity : velocities)
            outOfBounds = outOfBounds || velocity < 44 || velocity > 84;
        check (! outOfBounds, "within the bounds asked for, never outside");

        auto constrained = slot ("humanize");
        constrained.mod.humanizeTimingBeats = 0.08;
        constrained.mod.humanizeGatePercent = 100;
        constrained.mod.humanizePreserveChords = true;
        constrained.mod.humanizeProtectBeats = true;
        MidiInsertRack musical;
        musical.prepare (blockSize);
        musical.setSlots ({ constrained });

        juce::MidiBuffer chord;
        chord.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 90), 0);
        chord.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 90), 0);
        chord.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 90), 0);
        chord.addEvent (juce::MidiMessage::noteOff (1, 60), 40);
        chord.addEvent (juce::MidiMessage::noteOff (1, 64), 40);
        chord.addEvent (juce::MidiMessage::noteOff (1, 67), 40);
        const auto protectedChord = run (musical, chord, 8);
        std::set<int> attackTimes;
        std::map<int, int> attackAt, releaseAt;
        for (const auto& event : protectedChord)
        {
            const auto absolute = event.block * blockSize + event.sample;
            if (event.on)
            {
                attackTimes.insert (absolute);
                attackAt[event.note] = absolute;
            }
            else
                releaseAt[event.note] = absolute;
        }
        check (attackTimes == std::set<int> { 0 },
               "beat protect keeps the downbeat exact and chord lock keeps its tones together");
        bool validGates = attackAt.size() == 3 && releaseAt.size() == 3;
        for (const auto& [note, attack] : attackAt)
            validGates = validGates && releaseAt[note] > attack;
        check (validGates, "gate variation never releases a chord tone before it sounds");

        auto variedGate = slot ("humanize");
        variedGate.mod.humanizeGatePercent = 100;
        MidiInsertRack gates;
        gates.prepare (blockSize);
        gates.setSlots ({ variedGate });
        juce::MidiBuffer notes;
        for (int i = 0; i < 12; ++i)
        {
            notes.addEvent (juce::MidiMessage::noteOn (1, 48 + i, (juce::uint8) 90), i * 8);
            notes.addEvent (juce::MidiMessage::noteOff (1, 48 + i), i * 8 + 4);
        }
        const auto gated = run (gates, notes, 4);
        attackAt.clear();
        releaseAt.clear();
        for (const auto& event : gated)
        {
            const auto absolute = event.block * blockSize + event.sample;
            (event.on ? attackAt : releaseAt)[event.note] = absolute;
        }
        std::set<int> gateLengths;
        for (const auto& [note, attack] : attackAt)
            if (releaseAt.count (note) != 0)
                gateLengths.insert (releaseAt[note] - attack);
        check (gateLengths.size() > 1,
               "gate humanizing produces bounded duration variation, not one fixed gate");
    }

    // -- chance -------------------------------------------------------------------------
    {
        auto chance = slot ("chance");
        chance.mod.chance = 0.0f;
        MidiInsertRack none;
        none.prepare (blockSize);
        none.setSlots ({ chance });
        juce::MidiBuffer input;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::noteOff (1, 60), 20);
        const auto silent = run (none, input, 4);
        check (silent.empty(), "at zero chance nothing gets through — the note AND its note-off");

        chance.mod.chance = 1.0f;
        MidiInsertRack all;
        all.prepare (blockSize);
        all.setSlots ({ chance });
        juce::MidiBuffer again;
        again.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        again.addEvent (juce::MidiMessage::noteOff (1, 60), 20);
        check (run (all, again, 4).size() == 2, "and at full chance everything does");

        // The half that is easy to get wrong: rolling again on the note-off would let a
        // dropped note's OFF through, or a passed note's off be swallowed. Either is a stuck
        // note or a phantom one, so the decision is remembered, not repeated.
        chance.mod.chance = 0.5f;
        MidiInsertRack half;
        half.prepare (blockSize);
        half.setSlots ({ chance });
        std::vector<Event> everything;
        Transport clock;
        clock.setTempo (120.0);
        for (int i = 0; i < 200; ++i)
        {
            juce::MidiBuffer press, out;
            press.addEvent (juce::MidiMessage::noteOn (1, 60 + (i % 5), (juce::uint8) 100), 0);
            press.addEvent (juce::MidiMessage::noteOff (1, 60 + (i % 5)), 30);
            half.process (press, out, clock.advance (blockSize, sampleRate), blockSize);
            for (const auto metadata : out)
                if (metadata.getMessage().isNoteOnOrOff())
                    everything.push_back ({ i, metadata.samplePosition,
                                            metadata.getMessage().isNoteOn(),
                                            metadata.getMessage().getNoteNumber(), 0 });
        }
        check (! everything.empty() && (int) everything.size() < 400,
               "at half chance some get through and some do not");
        check (balanced (everything),
               "and every note that sounded stopped — the decision is remembered, not re-rolled");
    }

    // -- length -------------------------------------------------------------------------
    {
        auto length = slot ("length");
        length.mod.lengthBeats = 0.25;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ length });

        // Held far longer than the fixed length: the module's own note-off must win.
        juce::MidiBuffer input;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        Transport clock;
        clock.setTempo (120.0);
        std::vector<Event> events;
        for (int block = 0; block < 200; ++block)
        {
            juce::MidiBuffer out;
            rack.process (input, out, clock.advance (blockSize, sampleRate), blockSize);
            input.clear();
            if (block == 150)
                input.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
            for (const auto metadata : out)
                if (metadata.getMessage().isNoteOnOrOff())
                    events.push_back ({ block, metadata.samplePosition,
                                        metadata.getMessage().isNoteOn(),
                                        metadata.getMessage().getNoteNumber(), 0 });
        }
        check (onsOf (events) == 1 && balanced (events), "one note, ended once");
        int offBlock = -1;
        for (const auto& event : events)
            if (! event.on) offBlock = event.block;
        check (offBlock >= 0 && offBlock < 150,
               "and it ended at the length asked for, not when the key came up");

        // Legato: a new note releases the last one, so only one thing sounds at a time.
        auto joined = slot ("length");
        joined.mod.legato = true;
        MidiInsertRack legato;
        legato.prepare (blockSize);
        legato.setSlots ({ joined });
        juce::MidiBuffer first;
        first.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        first.addEvent (juce::MidiMessage::noteOff (1, 60), 10);
        std::vector<Event> legatoEvents;
        Transport legatoClock;
        legatoClock.setTempo (120.0);
        for (int block = 0; block < 8; ++block)
        {
            juce::MidiBuffer out;
            legato.process (first, out, legatoClock.advance (blockSize, sampleRate), blockSize);
            first.clear();
            if (block == 2)
            {
                first.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 0);
                first.addEvent (juce::MidiMessage::noteOff (1, 64), 10);
            }
            for (const auto metadata : out)
                if (metadata.getMessage().isNoteOnOrOff())
                    legatoEvents.push_back ({ block, metadata.samplePosition,
                                              metadata.getMessage().isNoteOn(),
                                              metadata.getMessage().getNoteNumber(), 0 });
        }
        int soundingAtOnce = 0, peak = 0;
        for (const auto& event : legatoEvents)
        {
            soundingAtOnce += event.on ? 1 : -1;
            peak = juce::jmax (peak, soundingAtOnce);
        }
        check (peak == 1, "legato joins notes rather than stacking them");

        juce::MidiBuffer panic;
        legato.allNotesOff (panic, 0);
        check (! panic.isEmpty(), "and what it is holding is released on panic");
    }

    // -- latch --------------------------------------------------------------------------
    {
        auto latch = slot ("latch");
        latch.mod.latchOn = true;

        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ latch });

        juce::MidiBuffer chord;
        chord.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        chord.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 1);
        chord.addEvent (juce::MidiMessage::noteOff (1, 60), 30);
        chord.addEvent (juce::MidiMessage::noteOff (1, 64), 31);
        const auto held = run (rack, chord, 4);
        check (onsOf (held) == 2, "the chord sounds");
        check (! balanced (held), "and keeps sounding after the keys came up — that is the feature");

        // A new phrase replaces it wholesale, which is what every hardware latch means.
        juce::MidiBuffer next;
        next.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 0);
        juce::MidiBuffer out;
        Transport clock;
        clock.setTempo (120.0);
        rack.process (next, out, clock.advance (blockSize, sampleRate), blockSize);
        int offs = 0;
        for (const auto metadata : out)
            if (metadata.getMessage().isNoteOff())
                ++offs;
        check (offs == 2, "and the next phrase releases the whole of the last one first");

        juce::MidiBuffer panic;
        rack.allNotesOff (panic, 0);
        check (! panic.isEmpty(), "panic reaches what a latch is holding");
    }

    // Retyping a slot must release what the old module was holding — the same rule the arp
    // and the chorder already answer to, now with several more ways to break it.
    {
        auto latch = slot ("latch");
        latch.mod.latchOn = true;
        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ latch });

        juce::MidiBuffer chord, out;
        chord.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        chord.addEvent (juce::MidiMessage::noteOff (1, 60), 20);
        Transport clock;
        clock.setTempo (120.0);
        rack.process (chord, out, clock.advance (blockSize, sampleRate), blockSize);

        rack.setSlots ({ slot ("chance") });      // same id, different type
        juce::MidiBuffer after, flushed;
        rack.process (after, flushed, clock.advance (blockSize, sampleRate), blockSize);
        bool released = false;
        for (const auto metadata : flushed)
            if (metadata.getMessage().isNoteOff() && metadata.getMessage().getNoteNumber() == 60)
                released = true;
        check (released, "retyping a slot releases what the old module was holding");
    }
}

void testMicrotuning()
{
    std::cout << "\nScala and MIDI Tuning Standard" << std::endl;

    Microtuning tuning;
    juce::String error;
    check (scalaTuningFromText (R"SCL(! a comment
Five-limit triad scale
3
5/4
3/2 ! comments may trail values
2/1
)SCL", "five-limit.scl", tuning, error),
           "a Scala scale parses ratios, inline comments and its implicit 1/1");
    check (tuning.enabled && tuning.name == "Five-limit triad scale"
             && tuning.sourceName == "five-limit.scl" && tuning.degreesCents.size() == 4,
           "the imported scale keeps its identity and declared degrees");
    check (std::abs ((tunedMidiPitch (tuning, 61) - tunedMidiPitch (tuning, 60))
                       * 100.0 - 386.3137139) < 0.001,
           "a 5/4 degree becomes its exact cents interval");
    check (std::abs (tunedMidiPitch (tuning, tuning.referenceMidiNote) - 69.0) < 0.000001,
           "A4 at 440 Hz remains the absolute reference pitch");

    Microtuning refused;
    check (! scalaTuningFromText ("Broken\n2\n100.0\n", "broken.scl", refused, error)
             && error.isNotEmpty(),
           "a truncated Scala table is refused with a useful error");

    const auto messages = mtsSingleNoteTuningMessages (tuning);
    check (messages.size() == 2, "a full 128-key MTS table splits at the 127-entry count limit");
    if (messages.size() == 2)
    {
        const auto& first = messages.getReference (0);
        const auto* data = first.getSysExData();
        check (first.isSysEx() && first.getSysExDataSize() == 6 + 127 * 4
                 && data[0] == 0x7f && data[1] == 0x7f
                 && data[2] == 0x08 && data[3] == 0x02
                 && data[4] == 0 && data[5] == 127,
               "the first message is a universal real-time single-note tuning change");
        const auto& last = messages.getReference (1);
        const auto* lastData = last.getSysExData();
        check (last.getSysExDataSize() == 10 && lastData[5] == 1 && lastData[6] == 127,
               "the second message carries the final MIDI key");
    }
}

void testMpeTransformer()
{
    std::cout << "\nMPE expression transformer" << std::endl;

    {
        NoteModuleSettings settings;
        settings.mpeEnabled = true;
        settings.mpeInput = "poly aftertouch";
        settings.mpeOutput = "mpe";
        settings.mpeOutputAxis = "pressure";
        settings.mpeMemberFirst = 2;
        settings.mpeMemberLast = 3;

        MpeTransformerEngine transformer;
        transformer.setSettings (settings);
        juce::MidiBuffer input, output;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::aftertouchChange (1, 60, 96), 10);
        input.addEvent (juce::MidiMessage::noteOff (1, 60), 20);
        transformer.process (input, output);

        bool began = false, expressed = false, ended = false;
        for (const auto metadata : output)
        {
            const auto message = metadata.getMessage();
            began = began || (message.isNoteOn() && message.getChannel() == 2
                              && message.getNoteNumber() == 60);
            expressed = expressed || (message.isChannelPressure() && message.getChannel() == 2
                                      && message.getChannelPressureValue() == 96);
            ended = ended || (message.isNoteOff() && message.getChannel() == 2
                              && message.getNoteNumber() == 60);
        }
        check (began && expressed && ended,
               "poly aftertouch becomes per-note MPE pressure on the allocated member channel");
    }

    {
        NoteModuleSettings settings;
        settings.mpeEnabled = true;
        settings.mpeInput = "mpe";
        settings.mpeInputAxis = "pressure";
        settings.mpeOutput = "poly aftertouch";
        settings.mpeOutputChannel = 1;

        MpeTransformerEngine transformer;
        transformer.setSettings (settings);
        juce::MidiBuffer input, output;
        input.addEvent (juce::MidiMessage::noteOn (4, 64, (juce::uint8) 90), 0);
        input.addEvent (juce::MidiMessage::channelPressureChange (4, 80), 8);
        input.addEvent (juce::MidiMessage::noteOff (4, 64), 16);
        transformer.process (input, output);

        bool began = false, expressed = false, ended = false;
        for (const auto metadata : output)
        {
            const auto message = metadata.getMessage();
            began = began || (message.isNoteOn() && message.getChannel() == 1
                              && message.getNoteNumber() == 64);
            expressed = expressed || (message.isAftertouch() && message.getChannel() == 1
                                      && message.getNoteNumber() == 64
                                      && message.getAfterTouchValue() == 80);
            ended = ended || (message.isNoteOff() && message.getChannel() == 1
                              && message.getNoteNumber() == 64);
        }
        check (began && expressed && ended,
               "MPE pressure becomes poly aftertouch and the note returns on the base channel");
    }

    {
        NoteModuleSettings settings;
        settings.mpeEnabled = true;
        settings.mpeInput = "cc";
        settings.mpeInputCc = 1;
        settings.mpeOutput = "mpe";
        settings.mpeOutputAxis = "timbre";
        settings.mpeMemberFirst = 2;
        settings.mpeMemberLast = 4;

        MpeTransformerEngine transformer;
        transformer.setSettings (settings);
        juce::MidiBuffer input, output;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 1);
        input.addEvent (juce::MidiMessage::controllerEvent (1, 1, 70), 20);
        transformer.process (input, output);

        std::set<int> expressionChannels;
        for (const auto metadata : output)
        {
            const auto message = metadata.getMessage();
            if (metadata.samplePosition == 20 && message.isController()
                && message.getControllerNumber() == 74 && message.getControllerValue() == 70)
                expressionChannels.insert (message.getChannel());
        }
        check (expressionChannels == std::set<int> ({ 2, 3 }),
               "a global CC can fan out as MPE timbre to every sounding member channel");
    }

    {
        NoteModuleSettings settings;
        settings.mpeEnabled = true;
        settings.mpeInput = "mpe";
        settings.mpeInputAxis = "pressure";
        settings.mpeOutput = "cc";
        settings.mpeOutputCc = 11;
        settings.mpeOutputChannel = 1;
        settings.mpeCollapse = "highest";

        MpeTransformerEngine transformer;
        transformer.setSettings (settings);
        juce::MidiBuffer input, output;
        input.addEvent (juce::MidiMessage::noteOn (2, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::noteOn (3, 64, (juce::uint8) 100), 1);
        input.addEvent (juce::MidiMessage::channelPressureChange (2, 40), 10);
        input.addEvent (juce::MidiMessage::channelPressureChange (3, 90), 20);
        transformer.process (input, output);

        std::vector<int> values;
        for (const auto metadata : output)
        {
            const auto message = metadata.getMessage();
            if (message.isController() && message.getControllerNumber() == 11)
                values.push_back (message.getControllerValue());
        }
        check (values == std::vector<int> ({ 40, 90 }),
               "the explicit highest rule collapses per-note MPE into one CC predictably");
    }

    {
        NoteModuleSettings settings;
        settings.mpeEnabled = true;
        settings.mpeInput = "poly aftertouch";
        settings.mpeOutput = "mpe";
        settings.mpeMemberFirst = 2;
        settings.mpeMemberLast = 2;

        MpeTransformerEngine transformer;
        transformer.setSettings (settings);
        juce::MidiBuffer input, output;
        input.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        input.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 1);
        transformer.process (input, output);

        std::vector<std::pair<bool, int>> notes;
        for (const auto metadata : output)
        {
            const auto message = metadata.getMessage();
            if (message.isNoteOnOrOff())
                notes.emplace_back (message.isNoteOn(), message.getNoteNumber());
        }
        check (notes == std::vector<std::pair<bool, int>> ({ { true, 60 }, { false, 60 },
                                                             { true, 64 } }),
               "member-channel exhaustion releases the oldest voice before reusing its channel");
    }

    {
        auto slot = MidiSlot::create ("mpe", "mpe-bypass");
        slot.mod.mpeEnabled = true;
        slot.mod.mpeInput = "poly aftertouch";
        slot.mod.mpeOutput = "mpe";
        MidiInsertRack rack;
        rack.prepare (blockSize);
        rack.setSlots ({ slot });

        Transport clock;
        juce::MidiBuffer held, sound;
        held.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 100), 0);
        rack.process (held, sound, clock.advance (blockSize, sampleRate), blockSize);

        slot.bypassed = true;
        rack.setSlots ({ slot });
        juce::MidiBuffer empty, release;
        rack.process (empty, release, clock.advance (blockSize, sampleRate), blockSize);
        bool ended = false;
        for (const auto metadata : release)
            ended = ended || (metadata.getMessage().isNoteOff()
                              && metadata.getMessage().getNoteNumber() == 67);
        check (ended, "bypassing the transformer while a note is held emits its owed note-off");
    }
}

void testArticulationManager()
{
    std::cout << "\narticulation manager" << std::endl;

    ArticulationManagerEngine manager;
    manager.setPartInputChannel (2);

    juce::MidiBuffer input, playable, actions;
    input.addEvent (juce::MidiMessage::noteOn (2, 12, (juce::uint8) 100), 0);
    manager.process (input, playable, actions);
    check (playable.getNumEvents() == 1 && actions.isEmpty(),
           "an empty articulation manager is a transparent wire");

    auto slot = MidiSlot::create ("articulation", "articulations");
    slot.mod.articulationEnabled = true;
    NoteModuleSettings::Articulation keyswitch;
    keyswitch.articulationId = "legato";
    keyswitch.name = "Legato";
    keyswitch.triggerNote = 12;
    keyswitch.keyswitchNote = 24;
    keyswitch.keyswitchVelocity = 77;
    keyswitch.outputChannel = 4;
    slot.mod.articulations.add (keyswitch);
    manager.setSlots ({ slot });

    input.clear();
    input.addEvent (juce::MidiMessage::noteOn (2, 12, (juce::uint8) 100), 3);
    input.addEvent (juce::MidiMessage::noteOff (2, 12), 9);
    input.addEvent (juce::MidiMessage::noteOn (2, 60, (juce::uint8) 90), 12);
    manager.process (input, playable, actions);
    check (playable.getNumEvents() == 1 && firstMessage (playable).isNoteOn()
             && firstMessage (playable).getNoteNumber() == 60,
           "a trigger is consumed in both directions while ordinary notes keep playing");
    std::vector<juce::MidiMessage> keyMessages;
    for (const auto metadata : actions)
        keyMessages.push_back (metadata.getMessage());
    check (keyMessages.size() == 2 && keyMessages[0].isNoteOn()
             && keyMessages[0].getChannel() == 4 && keyMessages[0].getNoteNumber() == 24
             && (int) keyMessages[0].getVelocity() == 77 && keyMessages[1].isNoteOff(),
           "a mapped key emits a bounded keyswitch press and release on its output channel");

    input.clear();
    input.addEvent (juce::MidiMessage::noteOn (1, 12, (juce::uint8) 100), 0);
    manager.process (input, playable, actions);
    check (playable.getNumEvents() == 1 && actions.isEmpty(),
           "an inherited trigger channel follows the part's MIDI channel");

    auto& mapped = slot.mod.articulations.getReference (0);
    mapped.triggerNote = 13;
    mapped.triggerChannel = 0;
    mapped.type = "program change";
    mapped.outputChannel = 0;
    mapped.bankMsb = 3;
    mapped.bankLsb = 9;
    mapped.program = 16;
    manager.setSlots ({ slot });
    input.clear();
    input.addEvent (juce::MidiMessage::noteOn (2, 13, (juce::uint8) 100), 0);
    manager.process (input, playable, actions);
    std::vector<juce::MidiMessage> programMessages;
    for (const auto metadata : actions)
        programMessages.push_back (metadata.getMessage());
    check (programMessages.size() == 3
             && programMessages[0].isController() && programMessages[0].getControllerNumber() == 0
             && programMessages[0].getControllerValue() == 3
             && programMessages[1].isController() && programMessages[1].getControllerNumber() == 32
             && programMessages[1].getControllerValue() == 9
             && programMessages[2].isProgramChange() && programMessages[2].getProgramChangeNumber() == 16
             && programMessages[2].getChannel() == 2,
           "bank MSB and LSB precede program change, on the trigger channel when output is same");

    mapped.triggerNote = 14;
    mapped.type = "cc";
    mapped.outputChannel = 6;
    mapped.controller = 58;
    mapped.controllerValue = 91;
    manager.setSlots ({ slot });
    input.clear();
    input.addEvent (juce::MidiMessage::noteOn (2, 14, (juce::uint8) 100), 0);
    manager.process (input, playable, actions);
    const auto cc = firstMessage (actions);
    check (actions.getNumEvents() == 1 && cc.isController() && cc.getChannel() == 6
             && cc.getControllerNumber() == 58 && cc.getControllerValue() == 91,
           "an articulation can select a library through a CC value");

    slot.bypassed = true;
    manager.setSlots ({ slot });
    manager.process (input, playable, actions);
    check (playable.getNumEvents() == 1 && actions.isEmpty(),
           "bypassing an articulation map restores the trigger note unchanged");
}

void testPerformanceReplayMidi()
{
    std::cout << "\nperformance replay: sample-timed universal MIDI" << std::endl;

    PerformanceEngine engine;
    engine.prepare (sampleRate, blockSize, 1);
    check (engine.scheduleReplayMidi (juce::MidiMessage::noteOn (3, 64, (juce::uint8) 101), 300),
           "a channel-voice event enters the bounded replay queue");

    juce::MidiBuffer input;
    engine.processBlock (blockSize, input);
    check (input.isEmpty(), "a future replay event does not arrive a block early");

    input.clear();
    engine.processBlock (blockSize, input);
    bool found = false;
    for (const auto metadata : input)
        found = found || (metadata.samplePosition == 44
                          && metadata.getMessage().isNoteOn()
                          && metadata.getMessage().getChannel() == 3
                          && metadata.getMessage().getNoteNumber() == 64
                          && (int) metadata.getMessage().getVelocity() == 101);
    check (found, "replay MIDI lands at its exact sample offset at the universal inlet");
    check (! engine.hasReplayMidiPending(), "the replay queue reports empty after delivery");

    check (engine.scheduleReplayMidi (juce::MidiMessage::noteOff (3, 64), 2000),
           "a second event can be scheduled");
    engine.clearReplayMidi();
    input.clear();
    engine.processBlock (blockSize, input);
    check (input.isEmpty() && ! engine.hasReplayMidiPending(),
           "cancelling a replay invalidates future MIDI without touching live input");
}

int main()
{
    std::cout << "Performance engine tests" << std::endl;

    testTransport();
    testRetrospectiveMidiJournal();
    testExternalClock();
    testHostSync();
    testCompileAndPlay();
    testHeldFillSystem();
    testSwingRatchetsTiesMicrotiming();
    testProbabilityAndConditions();
    testPolymeterAndEuclid();
    testNoOrphanNotes();
    testLaunchQuantizeAndScenes();
    testFrozenMidiUsesPostFxStaging();
    testParameterLanesAndGlide();
    testFollowActions();
    testSongSwapWhilePlaying();
    testArpeggiator();
    testMidiFxChain();
    testMidiInsertRack();
    testNoteModules();
    testScalesAndSerialization();
    testMicrotuning();
    testMpeTransformer();
    testArticulationManager();
    testPerformanceReplayMidi();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures))
              << std::endl;
    return failures == 0 ? 0 : 1;
}
