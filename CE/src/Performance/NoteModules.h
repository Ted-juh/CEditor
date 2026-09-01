#pragma once

#include <array>
#include <atomic>
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
        stepPpq.store (juce::jlimit (0.03125, 4.0, settings.echoStepBeats));
        feedback.store (juce::jlimit (0.1f, 1.0f, settings.echoFeedback));
        semitones.store (juce::jlimit (-12, 12, settings.echoTranspose));
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

            for (int repeat = 1; repeat <= count; ++repeat)
            {
                velocity *= decay;
                const auto note = message.getNoteNumber() + repeat * climb;
                if (! juce::isPositiveAndBelow (note, 128) || velocity < 1.0f)
                    break;      // off the keyboard or below hearing: stop, do not wrap

                const auto onAt = at + (double) repeat * step;
                pending.add (onAt, juce::MidiMessage::noteOn (message.getChannel(), note,
                                                              (juce::uint8) juce::jlimit (1, 127,
                                                                  juce::roundToInt (velocity))));
                // Nine tenths of a step: long enough to sound, short enough that consecutive
                // repeats of the same pitch do not overlap into one held note.
                pending.add (onAt + step * 0.9,
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
};

//==================================================================================================
/** Strum — a chord spread over a moment, in pitch order.

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
        downwards.store (settings.strumDown);
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        // Spreading nothing must not cost the collection window's latency. A strum turned off
        // is a wire, not a very fast strum.
        if (spreadPpq.load() <= 0.0 && collecting == 0)
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
                    if (collected[(size_t) i].message.getNoteNumber() == message.getNoteNumber())
                    {
                        pending.add (collectUntil + spreadPpq.load(), message);
                        goto nextEvent;
                    }
            }

            out.addEvent (message, metadata.samplePosition);
            nextEvent: ;
        }

        if (collecting > 0 && window.end >= collectUntil)
            dealOut (out, block, numSamples, window);
    }

    void allNotesOff (juce::MidiBuffer& out, int position) noexcept
    {
        collecting = 0;
        pending.dropNoteOns();
        pending.flushAll (out, position);
    }

private:
    struct Waiting { juce::MidiMessage message; double at; };

    void dealOut (juce::MidiBuffer& out, const Transport::BlockTime& block, int numSamples,
                  ModuleClock::Window window) noexcept
    {
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

        const auto spread = spreadPpq.load();
        const auto down = downwards.load();
        const auto gap = collecting > 1 ? spread / (double) (collecting - 1) : 0.0;

        for (int i = 0; i < collecting; ++i)
        {
            const auto order = down ? (collecting - 1 - i) : i;
            pending.add (collectUntil + (double) order * gap, collected[(size_t) i].message);
        }

        collecting = 0;
        pending.flushDue (out, window.start, window.end, block, numSamples);
    }

    ModuleClock clock;
    PendingEvents pending;
    std::array<Waiting, maxChord> collected {};
    int collecting = 0;
    double collectUntil = 0.0;
    /** A sixty-fourth note. Long enough that a hand-played chord arrives inside it, short
        enough that nobody feels it. */
    static constexpr double collectPpq = 0.0625;
    std::atomic<double> spreadPpq { 0.125 };
    std::atomic<bool> downwards { false };
};

//==================================================================================================
/** Humanize — bounded jitter on when a note lands and how hard.

    Notes can only be pushed LATER. Playing one earlier than it arrived would need to know the
    future, so the module delays within a window instead of centring on the original — which
    means it adds a little latency by construction, and says so rather than pretending.

    A note-off is delayed by exactly what its note-on was, so the length you played survives.
    Getting that wrong is what makes a naive humanizer chop notes in half. */
class HumanizeEngine
{
public:
    void setSettings (const NoteModuleSettings& settings) noexcept
    {
        timingPpq.store (juce::jlimit (0.0, 0.25, settings.humanizeTimingBeats));
        velocityAmount.store (juce::jlimit (0, 64, settings.humanizeVelocity));
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        const auto jitter = timingPpq.load();
        const auto velocityJitter = velocityAmount.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;

            if (message.isNoteOn())
            {
                const auto delay = jitter * random.nextDouble();
                const auto index = slotFor (message.getChannel(), message.getNoteNumber());
                if (index >= 0)
                    delays[(size_t) index] = { message.getChannel(), message.getNoteNumber(), delay };

                auto velocity = (int) message.getVelocity();
                if (velocityJitter > 0)
                    velocity += random.nextInt (velocityJitter * 2 + 1) - velocityJitter;

                pending.add (at + delay,
                             juce::MidiMessage::noteOn (message.getChannel(),
                                                        message.getNoteNumber(),
                                                        (juce::uint8) juce::jlimit (1, 127, velocity)));
                continue;
            }

            if (message.isNoteOff())
            {
                pending.add (at + takeDelay (message.getChannel(), message.getNoteNumber()), message);
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
    struct Delay { int channel = 0; int note = -1; double ppq = 0.0; };

    int slotFor (int channel, int note) noexcept
    {
        for (int i = 0; i < (int) delays.size(); ++i)
            if (delays[(size_t) i].note < 0
                  || (delays[(size_t) i].channel == channel && delays[(size_t) i].note == note))
                return i;
        return -1;
    }

    double takeDelay (int channel, int note) noexcept
    {
        for (auto& entry : delays)
            if (entry.note == note && entry.channel == channel)
            {
                entry.note = -1;
                return entry.ppq;
            }
        return 0.0;      // never heard its note-on: send it now rather than not at all
    }

    ModuleClock clock;
    PendingEvents pending;
    std::array<Delay, 32> delays {};
    juce::Random random { 0x5eed1234 };
    std::atomic<double> timingPpq { 0.02 };
    std::atomic<int> velocityAmount { 12 };
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
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out) noexcept
    {
        out.clear();
        const auto pass = probability.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();

            if (message.isNoteOn())
            {
                if (random.nextFloat() <= pass)
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
    std::atomic<float> probability { 1.0f };
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
    }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples) noexcept
    {
        out.clear();
        const auto window = clock.advance (block, numSamples);
        pending.flushDue (out, window.start, window.end, block, numSamples);

        const auto length = lengthPpq.load();
        const auto holding = legato.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto at = window.start + (double) metadata.samplePosition * block.ppqPerSample;

            if (message.isNoteOn())
            {
                if (holding)
                    releaseSounding (out, metadata.samplePosition);

                out.addEvent (message, metadata.samplePosition);
                remember (message.getChannel(), message.getNoteNumber());

                if (! holding && length > 0.0)
                    pending.add (at + length,
                                 juce::MidiMessage::noteOff (message.getChannel(),
                                                             message.getNoteNumber()));
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

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto position = metadata.samplePosition;

            if (message.isNoteOn())
            {
                if (keysDown == 0)
                    releaseLatched (out, position);      // a new phrase replaces the old one

                ++keysDown;
                out.addEvent (message, position);
                remember (message.getChannel(), message.getNoteNumber());
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
    std::atomic<bool> on { false };
};

} // namespace ceditor::perf
