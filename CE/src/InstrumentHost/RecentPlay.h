#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

// RecentPlay — the last few bars you played, kept so a preset can be auditioned with them.
//
// This is the small idea the whole audition bar is built around, and it is the one thing here
// that no preset browser has ever done. Auditioning a sound with a single middle C tells you
// almost nothing: a bass sounds wrong up there, a pad has not arrived yet, and a lead is out of
// its register. What tells you everything is your own line — the phrase you were just playing
// when you decided this sound was not the one.
//
// So the host is always listening. Every note that reaches the rack goes into a ring, stamped
// with where it landed in beats, and the audition can ask for "the last eight bars" whenever it
// wants them. Nothing is recorded to disk, nothing is a take, and it costs a few kilobytes.
//
// WHY BEATS AND NOT SECONDS. The rest of this engine times everything in beats — the arpeggiator
// and the pattern lanes share one authority — and a phrase captured in seconds replays at the
// wrong tempo the moment anybody changes it. A phrase in beats is still your phrase at 160.
//
// WHOLE BARS, ALIGNED. Asking for "the last eight bars" and getting eight bars starting wherever
// you happened to stop gives a phrase that starts on an upbeat and loops wrong. The window ends
// at the last bar line you crossed, so what comes back starts on a downbeat and loops.

namespace ceditor::host
{

struct RecentNote
{
    double beat = 0.0;              // absolute position when it arrived
    juce::MidiMessage message;
};

class RecentPlay
{
public:
    /** How many notes are kept. Eight bars of enthusiastic playing is a few hundred messages;
        this is several times that, and it is a fixed cost rather than a growing one. */
    static constexpr int capacity = 2048;

    void clear()                            { notes.clear(); }
    int size() const                        { return notes.size(); }
    bool isEmpty() const                    { return notes.isEmpty(); }

    /** Records one message at an absolute beat position. Anything that is not a note is
        dropped: a phrase is what you played, and a stream of controller traffic replayed into a
        different instrument is noise at best and a stuck note at worst. */
    void add (double beat, const juce::MidiMessage& message)
    {
        if (! message.isNoteOnOrOff())
            return;

        notes.add ({ beat, message });
        if (notes.size() > capacity)
            notes.removeRange (0, notes.size() - capacity);
    }

    /** The last `bars` whole bars before `now`, rebased so the first bar line is beat 0.
        Empty when nothing was played in that window — the caller then falls back to a single
        note, which is what a browser with nothing to go on should do.

        Note-offs whose note-on fell outside the window are dropped, and notes still held at the
        end are given an off at the window's end: a phrase that leaves a note on is a phrase that
        hangs, and on stage a stuck note is the only bug that matters. */
    juce::Array<RecentNote> phrase (double now, int bars, double beatsPerBar) const
    {
        juce::Array<RecentNote> out;
        if (bars <= 0 || beatsPerBar <= 0.0 || notes.isEmpty())
            return out;

        // End at the last bar line crossed, so the phrase starts on a downbeat and loops.
        const auto lastLine = std::floor (now / beatsPerBar) * beatsPerBar;
        const auto start = lastLine - bars * beatsPerBar;
        if (! (lastLine > start))
            return out;

        juce::Array<int> sounding;
        for (const auto& note : notes)
        {
            if (note.beat < start || note.beat >= lastLine)
                continue;

            const auto pitch = note.message.getNoteNumber();
            if (note.message.isNoteOn())
            {
                sounding.addIfNotAlreadyThere (pitch);
            }
            else
            {
                // An off for something this window never started would silence a note the
                // instrument is not playing, or worse, one it is.
                if (! sounding.contains (pitch))
                    continue;
                sounding.removeFirstMatchingValue (pitch);
            }

            out.add ({ note.beat - start, note.message });
        }

        for (const auto pitch : sounding)
            out.add ({ lastLine - start,
                       juce::MidiMessage::noteOff (1, pitch) });

        return out;
    }

private:
    juce::Array<RecentNote> notes;
};

} // namespace ceditor::host
