// PerformanceEngineTests — the Stage 6 timing and event engine (VIP-successor §18.8).
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
#include "Performance/ArpEngine.h"
#include "Performance/MidiFxChain.h"
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
    auto lane = makeNoteLane ("l1", "p1", 7, 6, 2, 48);
    lane.steps.getReference (0).probability = 60;
    lane.steps.getReference (0).ratchets = 3;
    lane.steps.getReference (2).microtiming = -0.25f;
    lane.type = LaneType::chord;
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
             && std::abs (restored.swing - 0.25f) < 1.0e-6f,
           "with every step property intact");
    check (restored.seed == pattern.seed, "and the seed, so the same dice roll again");

    Scene scene;
    scene.sceneId = "s1";
    scene.name = "Verse";
    scene.clipIds.add ("c1");
    scene.slots.add ({ "p1", true, false, 0.8f, true });
    scene.macros.add ({ "m1", 0.5f });
    scene.tempo = 96.0;
    Scene restoredScene;
    check (sceneFromVar (sceneToVar (scene), restoredScene)
             && restoredScene.name == "Verse"
             && restoredScene.clipIds.contains ("c1")
             && restoredScene.slots.size() == 1
             && std::abs (restoredScene.slots[0].volume - 0.8f) < 1.0e-6f
             && restoredScene.macros.size() == 1
             && std::abs (restoredScene.tempo - 96.0) < 1.0e-9,
           "a scene carries its clips, slots, macros and tempo");

    Setlist setlist;
    setlist.items.add ({ "i1", "Opener", "s1", "count in on the hats", 128.0 });
    setlist.currentIndex = 0;
    Setlist restoredSetlist;
    check (setlistFromVar (setlistToVar (setlist), restoredSetlist)
             && restoredSetlist.items.size() == 1
             && restoredSetlist.items[0].notes == "count in on the hats"
             && restoredSetlist.currentIndex == 0,
           "and a setlist keeps its notes and its place");

    ArpSettings arp;
    arp.enabled = true;
    arp.mode = ArpSettings::Mode::upDown;
    arp.octaves = 3;
    arp.velocityPattern.add (127);
    arp.velocityPattern.add (80);
    ArpSettings restoredArp;
    arpFromVar (arpToVar (arp), restoredArp);
    check (restoredArp.enabled && restoredArp.mode == ArpSettings::Mode::upDown
             && restoredArp.octaves == 3 && restoredArp.velocityPattern.size() == 2,
           "arp settings round trip, accents included");

    MidiFxSettings fx;
    fx.transpose = -7;
    fx.chord = MidiFxSettings::ChordType::seventh;
    fx.constrainToScale = true;
    fx.scaleType = "dorian";
    MidiFxSettings restoredFx;
    midiFxFromVar (midiFxToVar (fx), restoredFx);
    check (restoredFx.transpose == -7 && restoredFx.chord == MidiFxSettings::ChordType::seventh
             && restoredFx.scaleType == "dorian",
           "and so do the MIDI FX");
}

} // namespace

int main()
{
    std::cout << "Performance engine tests" << std::endl;

    testTransport();
    testExternalClock();
    testHostSync();
    testCompileAndPlay();
    testSwingRatchetsTiesMicrotiming();
    testProbabilityAndConditions();
    testPolymeterAndEuclid();
    testNoOrphanNotes();
    testLaunchQuantizeAndScenes();
    testParameterLanesAndGlide();
    testFollowActions();
    testSongSwapWhilePlaying();
    testArpeggiator();
    testMidiFxChain();
    testScalesAndSerialization();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures))
              << std::endl;
    return failures == 0 ? 0 : 1;
}
