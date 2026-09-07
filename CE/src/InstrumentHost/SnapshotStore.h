#pragma once

#include <juce_audio_formats/juce_audio_formats.h>

// SnapshotStore — the two seconds of audio that make browsing instant.
//
// The auditioner already renders every sound once (SonicProbe.h). Keeping that render is what
// turns browsing from "click, wait four seconds for Omnisphere, hear a note" into "click, hear
// it now" — which is the single thing about a preset browser that people actually feel, and the
// thing the product this succeeds could never do because it never rendered anything.
//
// A CACHE, AND IT SAYS SO. Descriptors are twenty-odd floats and are kept forever. Audio is not:
// a 2-second mono snapshot at 16 kHz in FLAC is around 35 kB, so a twelve-thousand-preset
// library is roughly 430 MB. That is real money on a laptop, so this is explicitly a cache with
// a budget — least recently heard is evicted first — and a MISSING SNAPSHOT IS NOT AN ERROR. It
// degrades to exactly the behaviour we have today: load the plug-in and wait. Every caller has
// to be written for that, because it is the normal case for a library bigger than the budget.
//
// WHY 16 kHz MONO. It is a preview, not the sound. Mono because auditioning is "is this the one",
// not "how wide is it" — the width is a number in the profile and the live instrument arrives a
// moment later anyway. 16 kHz because it halves the file and the top octave is not what anybody
// is judging in the second before the real thing takes over.

namespace ceditor::host
{

class SnapshotStore
{
public:
    /** `directory` is created on first write; nothing is read or written until then. */
    explicit SnapshotStore (juce::File directory);

    static constexpr int snapshotSampleRate = 16000;

    /** Downmixes, resamples and writes one snapshot under `key`. False when the key is unusable
        or the file could not be written — never throws, and never leaves a half-written file
        under the real name. */
    bool put (const juce::String& key, const juce::AudioBuffer<float>& audio, double sampleRate);

    /** Reads one back at `snapshotSampleRate`, mono. An empty buffer means "not here", which is
        the caller's cue to load the plug-in the slow way rather than to report a failure. */
    juce::AudioBuffer<float> get (const juce::String& key);

    bool has (const juce::String& key) const;
    bool remove (const juce::String& key);

    /** Total bytes on disk. */
    juce::int64 bytes() const;
    int count() const;

    /** Deletes least-recently-heard snapshots until the store is at or under `budgetBytes`.
        Returns how many went. Reading a snapshot counts as hearing it, which is what makes
        "the ones you actually browse" the ones that survive. */
    int sweep (juce::int64 budgetBytes);

    juce::File getDirectory() const   { return dir; }

private:
    juce::File fileFor (const juce::String& key) const;

    juce::File dir;
    juce::AudioFormatManager formats;
};

/** The key a record's snapshot is filed under: its content fingerprint where it has one, its
    record id otherwise. Content-keyed means two copies of the same preset share one snapshot,
    which is exactly the case a library full of duplicates is made of. */
juce::String snapshotKeyFor (const juce::String& fingerprint, const juce::String& recordId);

} // namespace ceditor::host
