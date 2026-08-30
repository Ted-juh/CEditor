#pragma once

#include <array>
#include <atomic>
#include <limits>
#include <juce_audio_basics/juce_audio_basics.h>
#include "PatternModel.h"
#include "Transport.h"

// ArpEngine — the arpeggiator, as a mode over the shared engine (baseline §18.8.5).
//
// It does not own a clock. Rate is steps per beat, exactly as a lane's is, and the step grid
// comes from the SAME transport the pattern scheduler reads — so an arp and a sequence agree
// about where beat three is, which is the whole reason the baseline insists on one timing
// authority.
//
// One deliberate accommodation: a held chord arpeggiates whether or not the transport is
// running. When it runs, the arp locks to its position (so the arp starts on the beat and
// stays there); when it is parked, the arp keeps counting from the same tempo. That is one
// clock used two ways, not two clocks — every step still lands on a transport-derived grid.
//
// HELD NOTES are the arp's input, so this sits AFTER the zone filter and the MIDI FX chain:
// what the part accepted and transformed is what gets arpeggiated. Latch keeps the set after
// the keys are released and replaces it wholesale when a fresh chord starts, which is what
// every hardware arp means by the word.
//
// The notes the arp emits are its own and are tracked as such: stopping, panicking, changing
// mode or losing the held set releases exactly what is sounding, at the sample where it
// happened. Nothing here allocates or locks.

namespace ceditor::perf
{

class ArpEngine
{
public:
    static constexpr int maxHeld = 16;
    static constexpr int maxSounding = 32;
    static constexpr int maxPatternSteps = 32;

    void setSettings (const ArpSettings& settings) noexcept
    {
        enabled.store (settings.enabled);
        mode.store ((int) settings.mode);
        stepsPerBeat.store (juce::jlimit (1, 16, settings.stepsPerBeat));
        gate.store (juce::jlimit (0.05f, 1.0f, settings.gate));
        swing.store (juce::jlimit (0.0f, 0.75f, settings.swing));
        octaves.store (juce::jlimit (1, 4, settings.octaves));
        latch.store (settings.latch);

        // Velocity 0 is a REST — the step passes on the grid and nothing sounds — which is
        // what turns the accent list into a drawable pattern rather than a loudness curve.
        const auto count = juce::jmin (maxPatternSteps, settings.velocityPattern.size());
        for (int i = 0; i < count; ++i)
            velocities[(size_t) i].store ((juce::uint8) juce::jlimit (0, 127,
                                                                       settings.velocityPattern[i]));
        velocityCount.store (count);

        // The drawn melody (Mode::pattern): per step, a grid row into the held pool or an
        // offset row around the ground note (patternSemitones decides), -1 rest.
        const auto drawn = juce::jmin (maxPatternSteps, settings.degreePattern.size());
        for (int i = 0; i < drawn; ++i)
            degrees[(size_t) i].store (juce::jlimit (-1, 63, settings.degreePattern[i]));
        degreeCount.store (drawn);
        semitoneRows.store (settings.patternSemitones);
    }

    /** The scale the arp folds its notes into when the part asks it to; 0x0fff = chromatic. */
    void setScaleMask (juce::uint16 newMask) noexcept   { mask.store (newMask); }
    void setConstrainToScale (bool shouldConstrain) noexcept { constrain.store (shouldConstrain); }

    bool isEnabled() const noexcept                     { return enabled.load(); }

    /** The pattern step that last sounded (0-based), for the UI playhead; -1 while the arp
        is idle, disabled, or running without a drawn pattern. Any thread. */
    int patternStep() const noexcept                    { return livePatternStep.load(); }

    /** Audio thread. Consumes note-ons/offs from `in` into the held set and writes the arp's
        own notes to `out`; non-note messages pass through. When the arp is off this is a
        straight copy, so a part can be switched live without a gap. */
    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples)
    {
        out.clear();

        const bool on = enabled.load();

        if (! on)
        {
            if (anySounding())
                releaseAll (out, 0);
            heldCount = 0;
            releasedAll = true;
            livePatternStep.store (-1);
            out.addEvents (in, 0, -1, 0);
            localPpq = block.playing ? block.endPpq : localPpq;
            return;
        }

        // The arp swallows the notes it is arpeggiating and passes everything else.
        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            if (message.isNoteOn())
                addHeld (message.getNoteNumber(), message.getVelocity());
            else if (message.isNoteOff())
                removeHeld (message.getNoteNumber());
            else
                out.addEvent (message, metadata.samplePosition);
        }

        // Position: locked to the transport while it runs, free-counting from the same tempo
        // when it does not.
        const auto blockPpq = block.ppqPerSample * (double) numSamples;
        const auto startPpq = block.playing ? block.startPpq : localPpq;
        const auto endPpq = startPpq + blockPpq;
        localPpq = endPpq;

        releaseDue (out, startPpq, endPpq, block, numSamples);

        if (heldCount == 0)
        {
            livePatternStep.store (-1);
            return;
        }

        const auto stepPpq = 1.0 / (double) stepsPerBeat.load();
        const auto swingAmount = (double) swing.load();

        // Which step indices could land in this window, swing included.
        const auto firstStep = (int) std::floor ((startPpq - stepPpq) / stepPpq);
        const auto lastStep = (int) std::ceil (endPpq / stepPpq);

        for (int step = firstStep; step <= lastStep; ++step)
        {
            if (step < 0)
                continue;

            auto stepTime = (double) step * stepPpq;
            if ((step % 2) == 1)
                stepTime += stepPpq * swingAmount * 0.5;

            if (stepTime < startPpq || stepTime >= endPpq)
                continue;

            const auto offset = block.playing
                                  ? block.sampleFor (stepTime, numSamples)
                                  : juce::jlimit (0, juce::jmax (0, numSamples - 1),
                                                  (int) ((stepTime - startPpq)
                                                          / juce::jmax (1.0e-9, block.ppqPerSample)));

            emitStep (out, step, stepTime + (double) gate.load() * stepPpq, offset);
        }
    }

    /** Releases everything the arp is sounding and forgets the held set. */
    void allNotesOff (juce::MidiBuffer& out, int position)
    {
        releaseAll (out, position);
        heldCount = 0;
        releasedAll = true;
        livePatternStep.store (-1);
    }

private:
    struct Held { int note = 0; juce::uint8 velocity = 100; int order = 0; };
    struct Sounding { bool active = false; int note = 0; double releasePpq = 0.0; };

    void addHeld (int note, juce::uint8 velocity) noexcept
    {
        // A fresh chord (nothing currently held, or latch has parked the last one) replaces
        // the set and restarts the sequence — the hardware behaviour players expect.
        if (releasedAll)
        {
            heldCount = 0;
            releasedAll = false;
            stepCounter = 0;
            // A fresh chord restarts the SEQUENCE while the grid keeps running: the first
            // step of the new chord is the mode's first note, wherever the beat happens to
            // be. Timing stays locked to the transport; only the walk restarts.
            sequenceOrigin = noOrigin;
        }

        ++keysPressed;

        for (int i = 0; i < heldCount; ++i)
            if (held[(size_t) i].note == note)
                return;

        if (heldCount >= maxHeld)
            return;

        held[(size_t) heldCount] = { note, velocity, orderCounter++ };
        ++heldCount;
        sortHeld();
    }

    void removeHeld (int note) noexcept
    {
        if (latch.load())
        {
            // Latched: the key going up does not take the note with it, but it does mean the
            // next key press starts a new chord.
            bool anyStillDown = false;
            for (int i = 0; i < heldCount; ++i)
                if (held[(size_t) i].note != note)
                    anyStillDown = true;
            keysDown = juce::jmax (0, keysDown - 1);
            if (keysDown == 0)
                releasedAll = true;
            juce::ignoreUnused (anyStillDown);
            return;
        }

        for (int i = 0; i < heldCount; ++i)
        {
            if (held[(size_t) i].note != note)
                continue;

            for (int j = i; j + 1 < heldCount; ++j)
                held[(size_t) j] = held[(size_t) (j + 1)];
            --heldCount;
            break;
        }

        if (heldCount == 0)
            releasedAll = true;
    }

    void sortHeld() noexcept
    {
        // Insertion sort by pitch: at most sixteen entries, no allocation, stable enough that
        // `order` mode can still recover the played sequence from its own field.
        for (int i = 1; i < heldCount; ++i)
        {
            auto value = held[(size_t) i];
            int j = i - 1;
            while (j >= 0 && held[(size_t) j].note > value.note)
            {
                held[(size_t) (j + 1)] = held[(size_t) j];
                --j;
            }
            held[(size_t) (j + 1)] = value;
        }
        keysDown = heldCount;
    }

    /** The note this step plays, by mode; also fills `chordAll` for chord mode. */
    int noteForStep (int step, juce::uint8& velocityOut, bool& chordAll) const noexcept
    {
        const auto count = heldCount;
        const auto octaveCount = octaves.load();
        const auto total = count * octaveCount;
        chordAll = false;

        if (count <= 0 || total <= 0)
            return -1;

        int index = 0;
        switch ((ArpSettings::Mode) mode.load())
        {
            case ArpSettings::Mode::up:
            case ArpSettings::Mode::pattern:   // an empty drawing falls back to the up walk
                index = step % total;
                break;

            case ArpSettings::Mode::down:
                index = total - 1 - (step % total);
                break;

            case ArpSettings::Mode::upDown:
            {
                // Endpoints played once: the classic 1-2-3-2 shape rather than 1-2-3-3-2-1.
                const auto span = juce::jmax (1, total * 2 - 2);
                const auto position = step % span;
                index = position < total ? position : span - position;
                break;
            }

            case ArpSettings::Mode::downUp:
            {
                const auto span = juce::jmax (1, total * 2 - 2);
                const auto position = step % span;
                const auto up = position < total ? position : span - position;
                index = total - 1 - up;
                break;
            }

            case ArpSettings::Mode::order:
            {
                // As played: `order` remembers arrival even though the array is pitch-sorted.
                const auto slot = step % total;
                const auto octave = slot / count;
                const auto within = slot % count;
                int byArrival[maxHeld];
                for (int i = 0; i < count; ++i)
                    byArrival[i] = i;
                for (int i = 1; i < count; ++i)
                {
                    const auto value = byArrival[i];
                    int j = i - 1;
                    while (j >= 0 && held[(size_t) byArrival[j]].order > held[(size_t) value].order)
                    {
                        byArrival[j + 1] = byArrival[j];
                        --j;
                    }
                    byArrival[j + 1] = value;
                }
                index = octave * count + byArrival[within];
                break;
            }

            case ArpSettings::Mode::random:
                index = (int) (deterministicRandom (step) % (juce::uint32) total);
                break;

            case ArpSettings::Mode::chord:
                chordAll = true;
                index = 0;
                break;
        }

        index = juce::jlimit (0, total - 1, index);
        const auto octave = index / count;
        const auto within = index % count;
        velocityOut = held[(size_t) within].velocity;
        return held[(size_t) within].note + octave * 12;
    }

    void emitStep (juce::MidiBuffer& out, int step, double releasePpq, int offset)
    {
        if (sequenceOrigin == noOrigin)
            sequenceOrigin = step;

        const bool patternMode = (ArpSettings::Mode) mode.load() == ArpSettings::Mode::pattern
                                   && degreeCount.load() > 0;

        juce::uint8 velocity = 100;
        bool chordAll = false;
        int note = -1;

        if (patternMode)
        {
            // The drawn melody: this step's degree indexes the same pitch-sorted,
            // octave-extended pool the walk modes read — degree 0 is the lowest held note,
            // past the pool clamps to the top, and -1 is a drawn rest.
            const auto count = heldCount;
            const auto total = count * octaves.load();
            if (count <= 0 || total <= 0)
                return;

            const auto position = stepCounter % degreeCount.load();
            const auto degree = (int) degrees[(size_t) position].load();
            livePatternStep.store (position);
            if (degree < 0)
            {
                ++stepCounter;
                return;
            }

            if (semitoneRows.load())
            {
                // Free mode: the row is an offset around the GROUND note — the lowest held
                // key, since the held set is pitch-sorted. Row 12 is the ground itself, so
                // the drawing spans an octave down to an octave up and transposes with the
                // finger. Octaves are the drawing's own business here.
                velocity = held[0].velocity;
                note = juce::jlimit (0, 127, held[0].note + (degree - 12));
            }
            else
            {
                const auto index = juce::jlimit (0, total - 1, degree);
                velocity = held[(size_t) (index % count)].velocity;
                note = held[(size_t) (index % count)].note + (index / count) * 12;
            }
        }
        else
        {
            note = noteForStep (step - sequenceOrigin, velocity, chordAll);
            if (note < 0)
                return;
        }

        const auto patternCount = velocityCount.load();
        if (patternCount > 0)
        {
            const auto patternIndex = stepCounter % patternCount;
            const auto patternVelocity = velocities[(size_t) patternIndex].load();
            if (! patternMode)   // the playhead follows whichever grid is being drawn
                livePatternStep.store (patternIndex);
            ++stepCounter;
            if (patternVelocity == 0)
                return;   // a rest: the grid advances, nothing sounds
            velocity = patternVelocity;
        }
        else
        {
            ++stepCounter;
        }

        const auto scale = constrain.load() ? mask.load() : (juce::uint16) 0x0fff;

        if (chordAll)
        {
            const auto octaveCount = octaves.load();
            for (int octave = 0; octave < octaveCount; ++octave)
                for (int i = 0; i < heldCount; ++i)
                    startNote (out, constrainNoteToScale (held[(size_t) i].note + octave * 12, scale),
                               velocity, releasePpq, offset);
            return;
        }

        startNote (out, constrainNoteToScale (note, scale), velocity, releasePpq, offset);
    }

    void startNote (juce::MidiBuffer& out, int note, juce::uint8 velocity, double releasePpq,
                    int offset)
    {
        note = juce::jlimit (0, 127, note);

        for (auto& slot : sounding)
            if (slot.active && slot.note == note)
            {
                out.addEvent (juce::MidiMessage::noteOff (1, note), offset);
                slot.active = false;
            }

        for (auto& slot : sounding)
        {
            if (slot.active)
                continue;
            slot = { true, note, releasePpq };
            out.addEvent (juce::MidiMessage::noteOn (1, note, velocity), offset);
            return;
        }
    }

    void releaseDue (juce::MidiBuffer& out, double startPpq, double endPpq,
                     const Transport::BlockTime& block, int numSamples)
    {
        for (auto& slot : sounding)
        {
            if (! slot.active || slot.releasePpq >= endPpq)
                continue;

            const auto at = juce::jmax (slot.releasePpq, startPpq);
            const auto offset = block.playing
                                  ? block.sampleFor (at, numSamples)
                                  : juce::jlimit (0, juce::jmax (0, numSamples - 1),
                                                  (int) ((at - startPpq)
                                                          / juce::jmax (1.0e-9, block.ppqPerSample)));
            out.addEvent (juce::MidiMessage::noteOff (1, slot.note), offset);
            slot.active = false;
        }
    }

    void releaseAll (juce::MidiBuffer& out, int position)
    {
        for (auto& slot : sounding)
        {
            if (! slot.active)
                continue;
            out.addEvent (juce::MidiMessage::noteOff (1, slot.note), position);
            slot.active = false;
        }
    }

    bool anySounding() const noexcept
    {
        for (const auto& slot : sounding)
            if (slot.active)
                return true;
        return false;
    }

    juce::uint32 deterministicRandom (int step) const noexcept
    {
        juce::uint32 h = (juce::uint32) (step * 0x9e3779b9) ^ (juce::uint32) (heldCount * 0x85ebca6b);
        h ^= h >> 16; h *= 0x7feb352d;
        h ^= h >> 15; h *= 0x846ca68b;
        h ^= h >> 16;
        return h;
    }

    std::array<Held, maxHeld> held {};
    std::array<Sounding, maxSounding> sounding {};
    static constexpr int noOrigin = std::numeric_limits<int>::min();

    int heldCount = 0;
    int keysDown = 0;
    int keysPressed = 0;
    int orderCounter = 0;
    int stepCounter = 0;
    int sequenceOrigin = noOrigin;   // the grid step the current chord's walk starts from
    bool releasedAll = true;
    double localPpq = 0.0;

    std::atomic<bool> enabled { false };
    std::atomic<int> mode { 0 };
    std::atomic<int> stepsPerBeat { 4 };
    std::atomic<float> gate { 0.5f };
    std::atomic<float> swing { 0.0f };
    std::atomic<int> octaves { 1 };
    std::atomic<bool> latch { false };
    std::atomic<bool> constrain { false };
    std::atomic<juce::uint16> mask { 0x0fff };
    std::array<std::atomic<juce::uint8>, maxPatternSteps> velocities {};
    std::atomic<int> velocityCount { 0 };
    std::array<std::atomic<int>, maxPatternSteps> degrees {};
    std::atomic<int> degreeCount { 0 };
    std::atomic<bool> semitoneRows { false };
    std::atomic<int> livePatternStep { -1 };
};

} // namespace ceditor::perf
