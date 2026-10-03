#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <limits>
#include <utility>
#include <juce_audio_basics/juce_audio_basics.h>
#include "PatternModel.h"
#include "Transport.h"

// NoteModules — the six MIDI inserts that were missing, all of them modes over the same
// transport the arpeggiator and the pattern scheduler already share.
//
//   Echo       every note repeats, decaying, optionally climbing. Not the arp: the arp
//              REORDERS notes you are holding, this repeats each note through time, which is
//              what a hardware note-repeat does and what nothing here did.
//   Strum      a chord spread over a moment, low to high or high to low. Turns a pad or a
//              guitar library from a block into something played.
//   Humanize   bounded jitter on when a note lands and how hard. Takes the machine edge off
//              everything downstream, the arp and the sequencer included.
//   Chance     a note passes, or it does not. Behind a sequencer this is what stops a rig
//              sounding identical every bar.
//   Length     every note the same length, or held until the next one arrives.
//   Latch      the chord keeps sounding after you let go, until you play another.
//
// EVERYTHING IS MUSICAL, IN PPQ, and that is a decision rather than an accident. The obvious
// alternative — milliseconds — needs a sample rate this layer does not have, and would make a
// strum that is right at 90bpm wrong at 160. Working in beats means every module here locks to
// the same grid the arp and the pattern lanes do, which is the one timing authority the
// baseline insists on. It also means these free-count from the same tempo when the transport
// is parked, exactly as the arp does, so a rig that is not running still plays.
//
// WHAT SOUNDS MUST BE RELEASABLE. Every module that emits a note it invented, or that swallows
// the note-off for one it passed on, owns that note until something ends it: a panic, a slot
// being removed, a retype. Each one can be told to let go of everything at a given sample, and
// the insert rack's flush path reaches all of them. Nothing here allocates or locks.

namespace ceditor::perf
{

/** A handful of MIDI events waiting for their moment, timed in PPQ.
    Fixed capacity and no allocation: this runs on the audio thread. An overflow drops the
    NEWEST event rather than an older one — a repeat that never happens is a missing echo,
    while dropping an older entry could strand a note-off and leave something sounding for
    ever. */
class PendingEvents
{
public:
    static constexpr int capacity = 192;

    void clear() noexcept       { count = 0; }
    bool isEmpty() const noexcept { return count == 0; }

    bool add (double ppq, const juce::MidiMessage& message) noexcept
    {
        if (count >= capacity)
            return false;
        events[(size_t) count++] = { ppq, message };
        return true;
    }

    /** Emits everything due before `endPpq`, oldest first, at the sample it belongs to. */
    void flushDue (juce::MidiBuffer& out, double startPpq, double endPpq,
                   const Transport::BlockTime& block, int numSamples) noexcept
    {
        int kept = 0;
        for (int i = 0; i < count; ++i)
        {
            auto& event = events[(size_t) i];
            if (event.ppq >= endPpq)
            {
                events[(size_t) kept++] = event;
                continue;
            }

            // Anything already overdue lands at the top of this block rather than being
            // dropped: late is a glitch, missing is a stuck note.
            const auto offset = block.playing
                                  ? block.sampleFor (juce::jmax (event.ppq, startPpq), numSamples)
                                  : juce::jlimit (0, juce::jmax (0, numSamples - 1),
                                                  (int) ((juce::jmax (event.ppq, startPpq) - startPpq)
                                                          / juce::jmax (1.0e-9, block.ppqPerSample)));
            out.addEvent (event.message, offset);
        }
        count = kept;
    }

    /** Emits everything immediately — the panic path, and slot teardown. */
    void flushAll (juce::MidiBuffer& out, int position) noexcept
    {
        for (int i = 0; i < count; ++i)
            out.addEvent (events[(size_t) i].message, position);
        count = 0;
    }

    /** Removes every queued note-on for this note (a key let go before its re-strum came). */
    void removeNoteOns (int channel, int note) noexcept
    {
        int kept = 0;
        for (int i = 0; i < count; ++i)
        {
            const auto& message = events[(size_t) i].message;
            if (! (message.isNoteOn() && message.getChannel() == channel && message.getNoteNumber() == note))
                events[(size_t) kept++] = events[(size_t) i];
        }
        count = kept;
    }

    /** Removes the first queued note-off for this note. False when there was none. */
    bool removeNoteOff (int channel, int note) noexcept
    {
        for (int i = 0; i < count; ++i)
        {
            const auto& message = events[(size_t) i].message;
            if (message.isNoteOff() && message.getChannel() == channel && message.getNoteNumber() == note)
            {
                for (int j = i; j + 1 < count; ++j)
                    events[(size_t) j] = events[(size_t) (j + 1)];
                --count;
                return true;
            }
        }
        return false;
    }

    /** Drops everything that is not a note-off. Used when a module is asked to let go: the
        offs still have to happen, the ons must not. */
    void dropNoteOns() noexcept
    {
        int kept = 0;
        for (int i = 0; i < count; ++i)
            if (! events[(size_t) i].message.isNoteOn())
                events[(size_t) kept++] = events[(size_t) i];
        count = kept;
    }

private:
    struct Event { double ppq = 0.0; juce::MidiMessage message; };
    std::array<Event, capacity> events {};
    int count = 0;
};

/** Where this block sits on the grid, whether or not the transport is rolling — the arp's own
    accommodation, applied to every module here so they all agree with it and with each other. */
struct ModuleClock
{
    double localPpq = 0.0;

    struct Window { double start; double end; };

    Window advance (const Transport::BlockTime& block, int numSamples) noexcept
    {
        const auto span = block.ppqPerSample * (double) numSamples;
        const auto start = block.playing ? block.startPpq : localPpq;
        localPpq = start + span;
        return { start, localPpq };
    }
};

//==================================================================================================
/** Echo — each note repeats, quieter each time and optionally climbing.

    The repeats are the module's OWN notes, complete with their own note-offs, so the original
    keeps whatever length you played and the echoes keep theirs. That is why a chord held for a
    bar does not produce a bar-long smear: every repeat is a note, not a sustain. */
class NoteEchoEngine
{
public:
    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        repeats.store (juce::jlimit (0, 8, settings.echoRepeats));
        const auto feel = settings.echoFeel == "dotted" ? 1.5 : settings.echoFeel == "triplet" ? 2.0 / 3.0 : 1.0;
        stepPpq.store (juce::jlimit (0.03125, 4.0, settings.echoStepBeats) * feel);
        feedback.store (juce::jlimit (0.1f, 1.0f, settings.echoFeedback));
        semitones.store (juce::jlimit (-12, 12, settings.echoTranspose));
        scaleClimb.store (settings.echoScaleClimb);
        shorter.store (settings.echoShorter);
        floorVelocity.store (juce::jlimit (1, 127, settings.echoFloor));
    }

    /** The part's scale, for climbing in scale steps; 0x0fff = chromatic. */
    void setScaleMask (juce::uint16 newMask) noexcept { mask.store (newMask); }

    /** `note` moved `steps` scale degrees up or down within `scale` (chromatic when the scale
        is empty or has every note). Off the keyboard returns -1. */
    static int climbInScale (int note, int steps, juce::uint16 scale) noexcept
    {
        if (scale == 0 || scale == (juce::uint16) 0x0fff)
            return juce::isPositiveAndBelow (note + steps, 128) ? note + steps : -1;
        auto n = note;
        const auto direction = steps > 0 ? 1 : -1;
        for (int s = 0; s < std::abs (steps); ++s)
        {
            do
            {
                n += direction;
                if (! juce::isPositiveAndBelow (n, 128))
                    return -1;
            } while ((scale & (1 << (n % 12))) == 0);
        }
        return n;
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        const auto count = repeats.load();
        const auto step = stepPpq.load();
        const auto decay = feedback.load();
        const auto climb = semitones.load();
        const auto inScale = scaleClimb.load();
        const auto scale = mask.load();
        const auto shortening = shorter.load();
        const auto floorAt = (float) floorVelocity.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            out.addEvent (message, metadata.samplePosition);

            if (! message.isNoteOn())
                continue;

            // Where this note actually landed, so the first repeat is one step after the note
            // rather than one step after the block began.
            const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;
            auto velocity = (float) message.getVelocity();

            auto length = step * 0.9;
            for (int repeat = 1; repeat <= count; ++repeat)
            {
                // Quieter each time, but never below the floor, so a tail stays audible on
                // synths that fade out quiet notes.
                velocity = juce::jmax (floorAt, velocity * decay);
                const auto note = inScale ? climbInScale (message.getNoteNumber(), repeat * climb, scale)
                                          : message.getNoteNumber() + repeat * climb;
                if (! juce::isPositiveAndBelow (note, 128) || velocity < 1.0f)
                    break;      // off the keyboard or below hearing: stop, do not wrap

                if (shortening)
                    length *= 0.75;
                const auto onAt = at + (double) repeat * step;
                pending.add (onAt, juce::MidiMessage::noteOn (message.getChannel(), note,
                                                              (juce::uint8) juce::jlimit (1, 127,
                                                                  juce::roundToInt (velocity))));
                // Nine tenths of a step: long enough to sound, short enough that consecutive
                // repeats of the same pitch do not overlap into one held note.
                pending.add (onAt + length,
                             juce::MidiMessage::noteOff (message.getChannel(), note));
            }
        }
    }

    void allNotesOff (juce::MidiBuffer& out, int position) noexcept
    {
        pending.dropNoteOns();
        pending.flushAll (out, position);
    }

private:
    ModuleClock clock;
    PendingEvents pending;
    std::atomic<int> repeats { 3 };
    std::atomic<double> stepPpq { 0.5 };
    std::atomic<float> feedback { 0.7f };
    std::atomic<int> semitones { 0 };
    std::atomic<bool> scaleClimb { false };
    std::atomic<bool> shorter { false };
    std::atomic<int> floorVelocity { 1 };
    std::atomic<juce::uint16> mask { 0x0fff };
};

//==================================================================================================
/** Strum — a chord spread over a moment, with playable stroke patterns and dynamics.

    The catch this is built around: you cannot strum a chord you have not finished hearing. The
    notes of a chord arrive over a few milliseconds, so emitting each one as it lands can only
    ever strum in arrival order — which is not pitch order, and which cannot go downwards at
    all. So note-ons are collected for a short window first, then sorted and dealt out. The
    window is what costs the latency, and it is deliberately small. */
class StrumEngine
{
public:
    static constexpr int maxChord = 16;

    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        spreadPpq.store (juce::jlimit (0.0, 1.0, settings.strumBeats));
        auto chosenPattern = settings.strumPattern;
        // An in-memory caller from before StrumPattern existed may still set only this bool.
        if (chosenPattern == NoteModuleSettings::StrumPattern::ascending && settings.strumDown)
            chosenPattern = NoteModuleSettings::StrumPattern::descending;
        pattern.store ((int) chosenPattern);
        curve.store (juce::jlimit (-1.0f, 1.0f, settings.strumCurve));
        velocityRamp.store (juce::jlimit (-64, 64, settings.strumVelocityRamp));
        guitar.store (settings.strumGuitar);
        harderFaster.store (settings.strumHarderFaster);
        repeatPerBeat.store (settings.strumRepeatPerBeat >= 2 ? juce::jmin (4, settings.strumRepeatPerBeat) : 0);
    }

    static constexpr int strings = 6;
    /** Standard tuning, low E to high E. */
    static constexpr int tuning[strings] = { 40, 45, 50, 55, 59, 64 };

    /** A chord laid onto six strings the way a guitarist would fret it: the lowest sounding
        string plays the chord's bass note, every other string the nearest chord tone inside a
        four-fret hand position (open strings always allowed), duplicate pitches skipped. Of all
        hand positions up to the ninth fret, the one covering every chord tone with the most
        strings wins; ties go to the lower position. `owner[i]` is the index in `notes` whose
        pitch class string `i` of the result plays. Returns how many strings sound. */
    static int guitarVoicing (const int* notes, int count, int (&out)[strings],
                              int (&owner)[strings]) noexcept
    {
        if (count <= 0)
            return 0;
        auto lowest = 0;
        for (int i = 1; i < count; ++i)
            if (notes[i] < notes[lowest])
                lowest = i;
        const auto bassClass = notes[lowest] % 12;
        auto ownerOf = [&] (int note)
        {
            if (note % 12 == bassClass)
                return lowest;
            for (int i = 0; i < count; ++i)
                if (notes[i] % 12 == note % 12)
                    return i;
            return -1;
        };

        auto bestScore = std::numeric_limits<int>::max();
        auto bestCount = 0;
        for (int base = 0; base <= 9; ++base)
        {
            const auto low = juce::jmax (1, base);
            // The lowest note on string `s` in this hand position that is a chord tone above
            // `floor` (open string first), or -1 for a muted string.
            auto fret = [&] (int s, int floor, bool bassOnly)
            {
                auto fits = [&] (int note)
                {
                    return note > floor && ownerOf (note) >= 0 && (! bassOnly || note % 12 == bassClass);
                };
                if (fits (tuning[s]))
                    return tuning[s];
                for (int f = low; f <= low + 3; ++f)
                    if (fits (tuning[s] + f))
                        return tuning[s] + f;
                return -1;
            };

            // The bass string is the lowest that can play the bass note; everything under it
            // is muted, and nothing above it may sound lower than it.
            auto first = 0, bassNote = -1;
            for (; first < strings; ++first)
                if ((bassNote = fret (first, -1, true)) >= 0)
                    break;
            if (first == strings)
                continue;

            int fretted[strings];
            for (int s = 0; s < strings; ++s)
                fretted[s] = s < first ? -1 : s == first ? bassNote : fret (s, bassNote, false);

            int voiced[strings], owners[strings];
            auto sounding = 0, innerMutes = 0;
            juce::uint16 covered = 0;
            for (int s = first; s < strings; ++s)
            {
                if (fretted[s] < 0)
                {
                    ++innerMutes;
                    continue;
                }
                auto duplicate = false;
                for (int k = 0; k < sounding; ++k)
                    duplicate = duplicate || voiced[k] == fretted[s];
                if (duplicate)
                    continue;
                voiced[sounding] = fretted[s];
                owners[sounding] = ownerOf (fretted[s]);
                covered |= (juce::uint16) (1 << (fretted[s] % 12));
                ++sounding;
            }

            auto missing = 0;
            for (int i = 0; i < count; ++i)
                if ((covered & (1 << (notes[i] % 12))) == 0)
                {
                    ++missing;
                    covered |= (juce::uint16) (1 << (notes[i] % 12));   // count each class once
                }

            // Every chord tone first, then no gaps inside the chord, then the lowest position:
            // guitarists reach for the open shape before a barre.
            const auto score = missing * 1000 + innerMutes * 20 + base * 3 + first;
            if (score < bestScore)
            {
                bestScore = score;
                bestCount = sounding;
                for (int k = 0; k < sounding; ++k)
                {
                    out[k] = voiced[k];
                    owner[k] = owners[k];
                }
            }
        }
        return bestCount;
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        // Spreading nothing must not cost the collection window's latency. A strum turned off
        // is a wire, not a very fast strum.
        if (spreadPpq.load() <= 0.0 && ! guitar.load() && repeatPerBeat.load() == 0
            && collecting == 0 && trackedNotes == 0 && pending.isEmpty() && ringingCount == 0)
        {
            for (const auto metadata : in)
                out.addEvent (metadata.getMessage(), metadata.samplePosition);
            return;
        }

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;

            if (message.isNoteOn())
            {
                if (collecting == 0)
                    collectUntil = at + collectPpq;

                if (collecting < maxChord)
                    collected[(size_t) collecting++] = { message, at };
                else
                    out.addEvent (message, metadata.samplePosition);   // past a sane chord
                continue;
            }

            // A note-off for something still waiting to be strummed has to wait too, or it
            // arrives before its own note-on and the note never stops.
            if (message.isNoteOff())
            {
                for (int i = 0; i < collecting; ++i)
                    if (collected[(size_t) i].message.getChannel() == message.getChannel()
                          && collected[(size_t) i].message.getNoteNumber() == message.getNoteNumber())
                    {
                        collected[(size_t) i].noteOff = message;
                        collected[(size_t) i].offAt = at;
                        collected[(size_t) i].hasNoteOff = true;
                        goto nextEvent;
                    }

                // A key whose chord went out on strings releases the strings it owns.
                if (releaseStrings (message.getChannel(), message.getNoteNumber(), at, out,
                                    metadata.samplePosition))
                    goto nextEvent;

                // It stops ringing, and a re-strum of it still waiting must not start.
                stopRinging (message.getChannel(), message.getNoteNumber());

                double releaseDelay = 0.0;
                if (takeReleaseDelay (message.getChannel(), message.getNoteNumber(), releaseDelay))
                {
                    if (releaseDelay <= 0.0)
                        out.addEvent (message, metadata.samplePosition);
                    else
                        pending.add (at + releaseDelay, message);
                    goto nextEvent;
                }
            }

            out.addEvent (message, metadata.samplePosition);
            nextEvent: ;
        }

        if (collecting > 0 && window.end >= collectUntil)
            dealOut (out, block, numSamples, window);

        // Rhythm: the chord still held is strummed again on each tick of the beat, the
        // direction alternating, until its keys come up.
        if (const auto per = repeatPerBeat.load(); per > 0 && ringingCount > 0)
        {
            const auto tick = 1.0 / (double) per;
            for (auto t = std::ceil (window.start / tick) * tick; t < window.end; t += tick)
            {
                if (t <= lastStrumAt + tick * 0.5)
                    continue;      // too close to the stroke you played
                restrum (t);
                lastStrumAt = t;
            }
        }

        // An off delayed by less than this block belongs in this block, not one buffer late.
        pending.flushDue (out, window.start, window.end, block, numSamples);
    }

    void allNotesOff (juce::MidiBuffer& out, int position) noexcept
    {
        collecting = 0;
        ringingCount = 0;
        pending.dropNoteOns();
        pending.flushAll (out, position);
        for (int channel = 0; channel < 16; ++channel)
            for (int note = 0; note < 128; ++note)
            {
                auto& entry = releaseDelays[(size_t) channel][(size_t) note];
                if (entry.active)
                    out.addEvent (juce::MidiMessage::noteOff (channel + 1, note), position);
                entry.active = false;
            }
        trackedNotes = 0;
        for (auto& channel : stringsOf)
            for (auto& key : channel)
                key.count = 0;
    }

private:
    /** Which string notes a played key put out, so its note-off can release them. */
    struct StringSet
    {
        juce::uint8 notes[strings] {};
        juce::uint8 count = 0;
    };

    bool releaseStrings (int channel, int note, double at, juce::MidiBuffer& out, int position) noexcept
    {
        if (channel < 1 || channel > 16 || ! juce::isPositiveAndBelow (note, 128))
            return false;
        auto& set = stringsOf[(size_t) (channel - 1)][(size_t) note];
        if (set.count == 0)
            return false;
        for (int i = 0; i < set.count; ++i)
        {
            const auto emitted = (int) set.notes[i];
            stopRinging (channel, emitted);
            const auto off = juce::MidiMessage::noteOff (channel, emitted);
            double delay = 0.0;
            if (takeReleaseDelay (channel, emitted, delay) && delay > 0.0)
                pending.add (at + delay, off);
            else
                out.addEvent (off, position);
        }
        set.count = 0;
        return true;
    }

    /** Guitar mode: replaces the collected chord with its six-string voicing. Every string
        note inherits the velocity, timing and (if it already came) the release of the key
        that owns it, and each key remembers its strings for a note-off that comes later. */
    void voiceOnStrings() noexcept
    {
        if (collecting <= 0)
            return;
        int notes[maxChord], voiced[strings], owner[strings];
        for (int i = 0; i < collecting; ++i)
            notes[i] = collected[(size_t) i].message.getNoteNumber();
        const auto sounding = guitarVoicing (notes, collecting, voiced, owner);
        if (sounding == 0)
            return;

        std::array<Waiting, maxChord> source = collected;
        for (int i = 0; i < collecting; ++i)
        {
            // A key struck again while its last strings still ring lets those go first.
            const auto& key = source[(size_t) i].message;
            auto& old = stringsOf[(size_t) (key.getChannel() - 1)][(size_t) key.getNoteNumber()];
            for (int k = 0; k < old.count; ++k)
            {
                double ignored = 0.0;
                takeReleaseDelay (key.getChannel(), old.notes[k], ignored);
                pending.add (collectUntil, juce::MidiMessage::noteOff (key.getChannel(), old.notes[k]));
            }
            old.count = 0;
        }
        for (int k = 0; k < sounding; ++k)
        {
            const auto& from = source[(size_t) owner[k]];
            const auto channel = from.message.getChannel();
            auto& w = collected[(size_t) k];
            w = from;
            w.message = juce::MidiMessage::noteOn (channel, voiced[k], from.message.getVelocity());
            if (from.hasNoteOff)
                w.noteOff = juce::MidiMessage::noteOff (channel, voiced[k]);
            else
            {
                auto& set = stringsOf[(size_t) (channel - 1)][(size_t) from.message.getNoteNumber()];
                if (set.count < strings)
                    set.notes[set.count++] = (juce::uint8) voiced[k];
            }
        }
        collecting = sounding;
    }

    struct Waiting
    {
        juce::MidiMessage message;
        double at = 0.0;
        juce::MidiMessage noteOff;
        double offAt = 0.0;
        bool hasNoteOff = false;
    };

    struct ReleaseDelay
    {
        double ppq = 0.0;
        bool active = false;
    };

    static double strokePosition (int rank, int count, float amount) noexcept
    {
        if (count <= 1)
            return 0.0;
        const auto t = (double) rank / (double) (count - 1);
        const auto exponent = amount >= 0.0f ? 1.0 + 3.0 * (double) amount
                                             : 1.0 / (1.0 + 3.0 * (double) -amount);
        return std::pow (t, exponent);
    }

    juce::uint32 nextRandom() noexcept
    {
        randomState ^= randomState << 13;
        randomState ^= randomState >> 17;
        randomState ^= randomState << 5;
        return randomState;
    }

    void makeOrder (NoteModuleSettings::StrumPattern stroke, int count,
                    int (&order)[maxChord], int averageVelocity = 100) noexcept
    {
        for (int i = 0; i < count; ++i)
            order[i] = i;

        // By velocity: a hard hit is a down-stroke (high to low), a soft one an up-stroke.
        if (stroke == NoteModuleSettings::StrumPattern::byVelocity)
            stroke = averageVelocity >= 90 ? NoteModuleSettings::StrumPattern::descending
                                           : NoteModuleSettings::StrumPattern::ascending;

        if (stroke == NoteModuleSettings::StrumPattern::alternate)
        {
            stroke = alternateDescending ? NoteModuleSettings::StrumPattern::descending
                                         : NoteModuleSettings::StrumPattern::ascending;
            alternateDescending = ! alternateDescending;
        }

        if (stroke == NoteModuleSettings::StrumPattern::descending)
        {
            for (int i = 0; i < count; ++i)
                order[i] = count - 1 - i;
        }
        else if (stroke == NoteModuleSettings::StrumPattern::outsideIn)
        {
            auto low = 0;
            auto high = count - 1;
            for (int i = 0; i < count; ++i)
                order[i] = (i % 2 == 0) ? low++ : high--;
        }
        else if (stroke == NoteModuleSettings::StrumPattern::insideOut)
        {
            auto low = (count - 1) / 2;
            auto high = count / 2;
            auto cursor = 0;
            if (low == high)
            {
                order[cursor++] = low;
                --low;
                ++high;
            }
            while (cursor < count)
            {
                if (low >= 0)
                    order[cursor++] = low--;
                if (cursor < count && high < count)
                    order[cursor++] = high++;
            }
        }
        else if (stroke == NoteModuleSettings::StrumPattern::random)
        {
            for (int i = count - 1; i > 0; --i)
            {
                const auto other = (int) (nextRandom() % (juce::uint32) (i + 1));
                std::swap (order[i], order[other]);
            }
        }
    }

    void rememberReleaseDelay (int channel, int note, double ppq) noexcept
    {
        if (channel < 1 || channel > 16 || ! juce::isPositiveAndBelow (note, 128))
            return;
        auto& entry = releaseDelays[(size_t) (channel - 1)][(size_t) note];
        if (! entry.active)
            ++trackedNotes;
        entry = { ppq, true };
    }

    bool takeReleaseDelay (int channel, int note, double& ppq) noexcept
    {
        if (channel < 1 || channel > 16 || ! juce::isPositiveAndBelow (note, 128))
            return false;
        auto& entry = releaseDelays[(size_t) (channel - 1)][(size_t) note];
        if (! entry.active)
            return false;
        ppq = entry.ppq;
        entry.active = false;
        trackedNotes = juce::jmax (0, trackedNotes - 1);
        return true;
    }

    void dealOut (juce::MidiBuffer& out, const Transport::BlockTime& block, int numSamples,
                  ModuleClock::Window window) noexcept
    {
        if (guitar.load())
            voiceOnStrings();

        // Insertion sort by pitch: sixteen notes at most, and no allocation.
        for (int i = 1; i < collecting; ++i)
        {
            auto held = collected[(size_t) i];
            int j = i - 1;
            while (j >= 0 && collected[(size_t) j].message.getNoteNumber()
                               > held.message.getNoteNumber())
            {
                collected[(size_t) (j + 1)] = collected[(size_t) j];
                --j;
            }
            collected[(size_t) (j + 1)] = held;
        }

        auto averageVelocity = 0;
        for (int i = 0; i < collecting; ++i)
            averageVelocity += collected[(size_t) i].message.getVelocity();
        averageVelocity /= juce::jmax (1, collecting);

        // Harder is faster: a hard hit strums in half the spread, a soft one in half again as
        // much, the way a pick moves quicker when you dig in.
        const auto spread = spreadPpq.load()
                          * (harderFaster.load() ? juce::jlimit (0.5, 1.5, 1.5 - (double) averageVelocity / 127.0) : 1.0);
        const auto shape = curve.load();
        const auto velocityChange = velocityRamp.load();
        int order[maxChord] {};
        makeOrder ((NoteModuleSettings::StrumPattern) pattern.load(), collecting, order, averageVelocity);

        for (int rank = 0; rank < collecting; ++rank)
        {
            auto& waiting = collected[(size_t) order[rank]];
            const auto position = strokePosition (rank, collecting, shape);
            const auto strokeDelay = spread * position;
            const auto totalDelay = juce::jmax (0.0, collectUntil - waiting.at) + strokeDelay;
            auto noteOn = waiting.message;
            const auto velocity = juce::jlimit (1, 127,
                (int) noteOn.getVelocity() + juce::roundToInt ((double) velocityChange * position));
            noteOn = juce::MidiMessage::noteOn (noteOn.getChannel(), noteOn.getNoteNumber(),
                                                 (juce::uint8) velocity);

            if (pending.add (collectUntil + strokeDelay, noteOn))
            {
                rememberReleaseDelay (noteOn.getChannel(), noteOn.getNoteNumber(), totalDelay);
                if (waiting.hasNoteOff)
                {
                    pending.add (waiting.offAt + totalDelay, waiting.noteOff);
                    double ignored = 0.0;
                    takeReleaseDelay (noteOn.getChannel(), noteOn.getNoteNumber(), ignored);
                }
            }
        }

        // What is still held rings on, for the rhythm re-strum.
        ringingCount = 0;
        for (int i = 0; i < collecting && ringingCount < maxChord; ++i)
        {
            const auto& w = collected[(size_t) i];
            if (! w.hasNoteOff)
                ringing[(size_t) ringingCount++] = { w.message.getChannel(), w.message.getNoteNumber(),
                                                     w.message.getVelocity() };
        }
        lastStrumAt = collectUntil;
        restrumDown = false;
        lastSpread = spread;

        collecting = 0;
        pending.flushDue (out, window.start, window.end, block, numSamples);
    }

    void stopRinging (int channel, int note) noexcept
    {
        for (int i = 0; i < ringingCount;)
        {
            if (ringing[(size_t) i].channel == channel && ringing[(size_t) i].note == note)
            {
                pending.removeNoteOns (channel, note);
                ringing[(size_t) i] = ringing[(size_t) --ringingCount];
            }
            else
                ++i;
        }
    }

    /** One more stroke of the chord still held, at `t`: everything ringing stops, then plays
        again across the spread, up and down in turn; the up-strokes a little softer. */
    void restrum (double t) noexcept
    {
        // Pitch order, so the stroke order means low-to-high.
        std::array<Ringing, maxChord> sorted = ringing;
        std::sort (sorted.begin(), sorted.begin() + ringingCount,
                   [] (const Ringing& a, const Ringing& b) { return a.note < b.note; });
        for (int i = 0; i < ringingCount; ++i)
            pending.add (t, juce::MidiMessage::noteOff (sorted[(size_t) i].channel, sorted[(size_t) i].note));

        restrumDown = ! restrumDown;
        const auto shape = curve.load();
        for (int rank = 0; rank < ringingCount; ++rank)
        {
            const auto index = restrumDown ? ringingCount - 1 - rank : rank;
            const auto& r = sorted[(size_t) index];
            const auto velocity = restrumDown ? (int) r.velocity : juce::roundToInt ((float) r.velocity * 0.8f);
            pending.add (t + lastSpread * strokePosition (rank, ringingCount, shape),
                         juce::MidiMessage::noteOn (r.channel, r.note, (juce::uint8) juce::jlimit (1, 127, velocity)));
        }
    }

    ModuleClock clock;
    PendingEvents pending;
    std::array<Waiting, maxChord> collected {};
    std::array<std::array<ReleaseDelay, 128>, 16> releaseDelays {};
    int collecting = 0;
    int trackedNotes = 0;
    double collectUntil = 0.0;
    /** A sixty-fourth note. Long enough that a hand-played chord arrives inside it, short
        enough that nobody feels it. */
    static constexpr double collectPpq = 0.0625;
    std::atomic<double> spreadPpq { 0.125 };
    std::atomic<int> pattern { (int) NoteModuleSettings::StrumPattern::ascending };
    std::atomic<float> curve { 0.0f };
    std::atomic<int> velocityRamp { 0 };
    std::atomic<bool> guitar { false };
    std::atomic<bool> harderFaster { false };
    std::atomic<int> repeatPerBeat { 0 };
    struct Ringing { int channel = 1; int note = 0; juce::uint8 velocity = 100; };
    std::array<Ringing, maxChord> ringing {};
    int ringingCount = 0;
    double lastStrumAt = 0.0;
    double lastSpread = 0.0;
    bool restrumDown = false;
    std::array<std::array<StringSet, 128>, 16> stringsOf {};
    bool alternateDescending = false;
    juce::uint32 randomState = 0x51f15e1du;
};

//==================================================================================================
/** Humanize — bounded jitter on when a note lands, how hard, and how long it lasts.

    Notes can only be pushed LATER. Playing one earlier than it arrived would need to know the
    future, so the module delays within a window instead of centring on the original — which
    means it adds a little latency by construction, and says so rather than pretending.

    Gate variation is based on the played duration. A shortened gate can never be scheduled in
    the past or before its delayed note-on, which is what prevents tiny notes becoming stuck or
    inverted. Chord lock shares timing between notes at the same source position; beat protect
    keeps exact whole-beat attacks on the grid. */
class HumanizeEngine
{
public:
    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        timingPpq.store (juce::jlimit (0.0, 0.25, settings.humanizeTimingBeats));
        velocityAmount.store (juce::jlimit (0, 64, settings.humanizeVelocity));
        gateAmount.store (juce::jlimit (0, 100, settings.humanizeGatePercent));
        preserveChords.store (settings.humanizePreserveChords);
        protectBeats.store (settings.humanizeProtectBeats);
        layBackPpq.store (juce::jlimit (0.0, 0.125, settings.humanizeLayBackBeats));
        swingAmount.store (juce::jlimit (0.0f, 0.75f, settings.humanizeSwing));
        swingGrid.store (settings.humanizeSwingGrid >= 0.375 ? 0.5 : 0.25);
        accentAmount.store (juce::jlimit (0, 40, settings.humanizeAccent));
        frozen.store (settings.humanizeFreeze);
        seed.store (juce::jlimit (1, 9999, settings.humanizeSeed));
    }

    /** A number in [0, 1) fixed by where a note is in a four-beat bar, which note it is and
        what it is for, so a frozen humanize plays the same notes the same way every time. */
    static double frozenRoll (double atPpq, int note, int salt, int seed) noexcept
    {
        auto place = (juce::uint32) juce::roundToInt (std::fmod (juce::jmax (0.0, atPpq), 4.0) * 96.0);
        auto h = place * 0x9e3779b1u ^ (juce::uint32) note * 0x85ebca6bu ^ (juce::uint32) salt * 0xc2b2ae35u
                 ^ (juce::uint32) seed * 0x27d4eb2fu;
        h ^= h >> 15; h *= 0x2c1b3c6du;
        h ^= h >> 12; h *= 0x297a2d39u;
        h ^= h >> 15;
        return (double) h / 4294967296.0;
    }

    /** How late the swing grid moves a note at `atPpq`: the off-beat of each pair, by the
        amount the arpeggiator's swing uses (half the swing of one grid step). */
    static double swingDelay (double atPpq, double grid, float swing) noexcept
    {
        if (swing <= 0.0f)
            return 0.0;
        const auto position = atPpq / grid;
        const auto nearest = std::round (position);
        if (std::abs (position - nearest) > 0.1 || ((long long) nearest % 2) == 0)
            return 0.0;
        return grid * (double) swing * 0.5;
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        const auto jitter = timingPpq.load();
        const auto velocityJitter = velocityAmount.load();
        const auto gateJitter = (double) gateAmount.load() / 100.0;
        const auto keepChordsTogether = preserveChords.load();
        const auto keepBeatAnchors = protectBeats.load();
        const auto layBack = layBackPpq.load();
        const auto swing = swingAmount.load();
        const auto grid = swingGrid.load();
        const auto accent = accentAmount.load();
        const auto freeze = frozen.load();
        const auto roll = seed.load();
        // Random, or fixed by the note's place when frozen.
        const auto chance = [&] (double atPpq, int note, int salt)
        {
            return freeze ? frozenRoll (atPpq, note, salt, roll) : random.nextDouble();
        };
        auto lastAttackAt = std::numeric_limits<double>::lowest();
        auto lastAttackDelay = 0.0;

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;

            if (message.isNoteOn())
            {
                const auto onBeat = std::abs (at - std::round (at))
                                      <= block.ppqPerSample * 0.5;
                auto delay = (keepBeatAnchors && onBeat ? 0.0 : jitter * chance (at, message.getNoteNumber(), 1))
                             + layBack + swingDelay (at, grid, swing);
                if (keepChordsTogether
                    && std::abs (at - lastAttackAt) <= block.ppqPerSample * 0.5)
                    delay = lastAttackDelay;
                else
                {
                    lastAttackAt = at;
                    lastAttackDelay = delay;
                }
                const auto index = slotFor (message.getChannel(), message.getNoteNumber());
                if (index >= 0)
                    delays[(size_t) index] = { message.getChannel(), message.getNoteNumber(),
                                              delay, at, at + delay };

                auto velocity = (int) message.getVelocity() + (onBeat ? accent : 0);
                if (velocityJitter > 0)
                    velocity += juce::jlimit (0, velocityJitter * 2,
                                              (int) (chance (at, message.getNoteNumber(), 2) * (velocityJitter * 2 + 1)))
                                - velocityJitter;

                pending.add (at + delay,
                             juce::MidiMessage::noteOn (message.getChannel(),
                                                        message.getNoteNumber(),
                                                        (juce::uint8) juce::jlimit (1, 127, velocity)));
                continue;
            }

            if (message.isNoteOff())
            {
                const auto timing = takeTiming (message.getChannel(), message.getNoteNumber());
                if (timing.note < 0)
                {
                    pending.add (at, message);
                    continue;
                }

                const auto playedDuration = juce::jmax (0.0, at - timing.sourceOnPpq);
                const auto gateScale = gateJitter > 0.0
                    ? (chance (timing.sourceOnPpq, message.getNoteNumber(), 3) * 2.0 - 1.0) * gateJitter : 0.0;
                auto releaseAt = at + timing.delayPpq + playedDuration * gateScale;
                // The source release has arrived, so this is the earliest real-time-safe
                // shortening. The delayed on must still sound for at least one sample.
                releaseAt = juce::jmax (at, timing.scheduledOnPpq + block.ppqPerSample,
                                        releaseAt);
                pending.add (releaseAt, message);
                continue;
            }

            out.addEvent (message, metadata.samplePosition);
        }

        pending.flushDue (out, window.start, window.end, block, numSamples);
    }

    void allNotesOff (juce::MidiBuffer& out, int position) noexcept
    {
        pending.dropNoteOns();
        pending.flushAll (out, position);
        for (auto& entry : delays)
            entry.note = -1;
    }

private:
    struct Delay
    {
        int channel = 0;
        int note = -1;
        double delayPpq = 0.0;
        double sourceOnPpq = 0.0;
        double scheduledOnPpq = 0.0;
    };

    int slotFor (int channel, int note) noexcept
    {
        for (int i = 0; i < (int) delays.size(); ++i)
            if (delays[(size_t) i].channel == channel && delays[(size_t) i].note == note)
                return i;
        for (int i = 0; i < (int) delays.size(); ++i)
            if (delays[(size_t) i].note < 0)
                return i;
        return -1;
    }

    Delay takeTiming (int channel, int note) noexcept
    {
        for (auto& entry : delays)
            if (entry.note == note && entry.channel == channel)
            {
                const auto found = entry;
                entry.note = -1;
                return found;
            }
        return {};      // never heard its note-on: send its off now rather than not at all
    }

    ModuleClock clock;
    PendingEvents pending;
    std::array<Delay, 32> delays {};
    juce::Random random { 0x5eed1234 };
    std::atomic<double> timingPpq { 0.0 };
    std::atomic<int> velocityAmount { 0 };
    std::atomic<int> gateAmount { 0 };
    std::atomic<bool> preserveChords { false };
    std::atomic<bool> protectBeats { false };
    std::atomic<double> layBackPpq { 0.0 };
    std::atomic<float> swingAmount { 0.0f };
    std::atomic<double> swingGrid { 0.25 };
    std::atomic<int> accentAmount { 0 };
    std::atomic<bool> frozen { false };
    std::atomic<int> seed { 1 };
};

//==================================================================================================
/** Chance — a note passes, or it does not.

    The decision is taken on the note-ON and remembered, so the matching note-off is dropped
    with it. Rolling again on the off would leave notes sounding for ever, which is the whole
    reason this is a table and not a coin toss per message. */
class ChanceEngine
{
public:
    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        probability.store (juce::jlimit (0.0f, 1.0f, settings.chance));
        keepDownbeats.store (settings.chanceKeepDownbeats);
        softFirst.store (settings.chanceSoftFirst);
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto pass = probability.load();
        const auto window = clock.advance (block, numSamples);
        const auto beats = keepDownbeats.load();
        const auto weighted = softFirst.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();

            if (message.isNoteOn())
            {
                // A note within a 64th of a whole beat is ON the beat: those always pass, so
                // the pulse survives however much is thinned out around it.
                const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;
                const auto onBeat = beats && std::abs (at - std::round (at)) < 1.0 / 64.0;
                // Soft notes drop first: the chance scales from half (silent) to one and a half
                // times (full) with velocity, so loud notes carry the phrase.
                const auto p = weighted ? juce::jlimit (0.0f, 1.0f, pass * (0.5f + (float) message.getVelocity() / 127.0f))
                                        : pass;
                if (onBeat || random.nextFloat() <= p)
                    out.addEvent (message, metadata.samplePosition);
                else
                    mark (message.getChannel(), message.getNoteNumber());
                continue;
            }

            if (message.isNoteOff() && clearMark (message.getChannel(), message.getNoteNumber()))
                continue;      // its note-on never went out, so neither does this

            out.addEvent (message, metadata.samplePosition);
        }
    }

    void allNotesOff (juce::MidiBuffer&, int) noexcept
    {
        for (auto& word : dropped)
            word = 0;
    }

private:
    void mark (int channel, int note) noexcept
    {
        if (juce::isPositiveAndBelow (note, 128) && channel >= 1 && channel <= 16)
            dropped[(size_t) (channel - 1)] |= (juce::uint64) 1 << (note % 64);
    }

    bool clearMark (int channel, int note) noexcept
    {
        if (! juce::isPositiveAndBelow (note, 128) || channel < 1 || channel > 16)
            return false;
        const auto bit = (juce::uint64) 1 << (note % 64);
        if ((dropped[(size_t) (channel - 1)] & bit) == 0)
            return false;
        dropped[(size_t) (channel - 1)] &= ~bit;
        return true;
    }

    std::array<juce::uint64, 16> dropped {};
    juce::Random random { 0x1a2b3c4d };
    ModuleClock clock;
    std::atomic<float> probability { 1.0f };
    std::atomic<bool> keepDownbeats { false };
    std::atomic<bool> softFirst { false };
};

//==================================================================================================
/** Length — every note the same length, or held until the next one.

    Both modes swallow the note-off you played, so both own what is sounding. Legato releases
    the previous set when a new note arrives, which is what the word means on a keyboard: one
    thing at a time, joined. */
class NoteLengthEngine
{
public:
    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        lengthPpq.store (juce::jlimit (0.0, 8.0, settings.lengthBeats));
        legato.store (settings.legato);
        mode.store (settings.lengthMode == "at most" ? atMost : settings.lengthMode == "at least" ? atLeast : fixed);
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        const auto length = lengthPpq.load();
        const auto holding = legato.load();
        const auto rule = mode.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;
            const auto channel = message.getChannel();
            const auto note = message.getNoteNumber();
            const auto tracked = channel >= 1 && channel <= 16 && juce::isPositiveAndBelow (note, 128);

            if (message.isNoteOn())
            {
                if (holding)
                    releaseSounding (out, metadata.samplePosition);

                out.addEvent (message, metadata.samplePosition);
                remember (channel, note);
                if (tracked)
                    startedAt[(size_t) (channel - 1)][(size_t) note] = at;

                // Fixed and "at most" both plan the end now; "at most" lets an earlier key-up
                // win (below). "At least" decides at key-up.
                if (! holding && length > 0.0 && rule != atLeast)
                    pending.add (at + length, juce::MidiMessage::noteOff (channel, note));
                continue;
            }

            if (message.isNoteOff() && ! holding && length > 0.0 && rule == atMost)
            {
                // Let go before the cut: end it now and forget the planned end. After the cut
                // it has already ended, and this off belongs to nothing.
                if (pending.removeNoteOff (channel, note))
                {
                    out.addEvent (message, metadata.samplePosition);
                    forget (channel, note);
                }
                continue;
            }

            if (message.isNoteOff() && ! holding && length > 0.0 && rule == atLeast && tracked)
            {
                // A tap shorter than the length rings on to it; a longer note ends as played.
                const auto earliest = startedAt[(size_t) (channel - 1)][(size_t) note] + length;
                if (at < earliest)
                    pending.add (earliest, message);
                else
                    out.addEvent (message, metadata.samplePosition);
                forget (channel, note);
                continue;
            }

            if (message.isNoteOff() && (holding || length > 0.0))
                continue;      // ours to end, not the keyboard's

            out.addEvent (message, metadata.samplePosition);
            forget (message.getChannel(), message.getNoteNumber());
        }
    }

    void allNotesOff (juce::MidiBuffer& out, int position) noexcept
    {
        pending.dropNoteOns();
        pending.flushAll (out, position);
        releaseSounding (out, position);
    }

private:
    struct Sounding { int channel = 0; int note = -1; };

    void remember (int channel, int note) noexcept
    {
        for (auto& entry : sounding)
            if (entry.note < 0)
            {
                entry = { channel, note };
                return;
            }
    }

    void forget (int channel, int note) noexcept
    {
        for (auto& entry : sounding)
            if (entry.channel == channel && entry.note == note)
                entry.note = -1;
    }

    void releaseSounding (juce::MidiBuffer& out, int position) noexcept
    {
        for (auto& entry : sounding)
            if (entry.note >= 0)
            {
                out.addEvent (juce::MidiMessage::noteOff (entry.channel, entry.note), position);
                entry.note = -1;
            }
    }

    ModuleClock clock;
    PendingEvents pending;
    std::array<Sounding, 32> sounding {};
    std::atomic<double> lengthPpq { 0.5 };
    std::atomic<bool> legato { false };
    enum Rule { fixed = 0, atMost, atLeast };
    std::atomic<int> mode { fixed };
    std::array<std::array<double, 128>, 16> startedAt {};
};

//==================================================================================================
/** Latch — the chord keeps sounding after you let go, until you play another.

    "Another" means a note-on arriving when no key is down: that is a new phrase, and it
    replaces what is latched wholesale. The same definition the arp's own latch uses, for the
    same reason — every hardware latch on earth means this, and meaning something else would
    be a surprise nobody asked for. */
class LatchEngine
{
public:
    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        on.store (settings.latchOn);
        mode.store (settings.latchMode == "add" ? add : settings.latchMode == "toggle" ? toggle : replace);
        pedalReleases.store (settings.latchPedalRelease);
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out) noexcept
    {
        out.clear();

        // Off is a wire. This is the one module that cannot be transparent while doing its
        // job, so it gets a switch of its own rather than changing the sound by existing.
        if (! on.load())
        {
            releaseLatched (out, 0);
            for (const auto metadata : in)
                out.addEvent (metadata.getMessage(), metadata.samplePosition);
            return;
        }

        const auto rule = mode.load();
        const auto pedal = pedalReleases.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto position = metadata.samplePosition;

            if (message.isNoteOn())
            {
                ++keysDown;
                if (rule == toggle && forget (message.getChannel(), message.getNoteNumber()))
                {
                    // Played again while held: that note lets go instead of retriggering.
                    out.addEvent (juce::MidiMessage::noteOff (message.getChannel(), message.getNoteNumber()), position);
                    continue;
                }
                if (rule == replace && keysDown == 1)
                    releaseLatched (out, position);      // a new phrase replaces the old one

                out.addEvent (message, position);
                remember (message.getChannel(), message.getNoteNumber());
                continue;
            }

            if (pedal && message.isController() && message.getControllerNumber() == 64)
            {
                // The pedal is the release here, not a sustain: consumed, and one press lets
                // go of everything held.
                const auto down = message.getControllerValue() >= 64;
                if (down && ! pedalDown)
                    releaseLatched (out, position);
                pedalDown = down;
                continue;
            }

            if (message.isNoteOff())
            {
                keysDown = juce::jmax (0, keysDown - 1);
                continue;                                // swallowed: that is the whole feature
            }

            out.addEvent (message, position);
        }
    }

    void allNotesOff (juce::MidiBuffer& out, int position) noexcept
    {
        keysDown = 0;
        releaseLatched (out, position);
    }

private:
    struct Held { int channel = 0; int note = -1; };

    void remember (int channel, int note) noexcept
    {
        for (auto& entry : latched)
            if (entry.channel == channel && entry.note == note)
                return;                                  // already latched: retrigger, not a second

        for (auto& entry : latched)
            if (entry.note < 0)
            {
                entry = { channel, note };
                return;
            }
    }

    bool forget (int channel, int note) noexcept
    {
        for (auto& entry : latched)
            if (entry.channel == channel && entry.note == note)
            {
                entry.note = -1;
                return true;
            }
        return false;
    }

    void releaseLatched (juce::MidiBuffer& out, int position) noexcept
    {
        for (auto& entry : latched)
            if (entry.note >= 0)
            {
                out.addEvent (juce::MidiMessage::noteOff (entry.channel, entry.note), position);
                entry.note = -1;
            }
    }

    std::array<Held, 32> latched {};
    int keysDown = 0;
    bool pedalDown = false;
    std::atomic<bool> on { false };
    enum Rule { replace = 0, add, toggle };
    std::atomic<int> mode { replace };
    std::atomic<bool> pedalReleases { false };
};

} // namespace ceditor::perf
