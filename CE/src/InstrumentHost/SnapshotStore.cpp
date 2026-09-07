#include "SnapshotStore.h"

#include <juce_audio_basics/juce_audio_basics.h>

namespace ceditor::host
{

namespace
{

/** Keys come from fingerprints and record ids, both of which are ours but neither of which is
    promised to be a legal filename. Anything outside a conservative set is replaced, and a key
    that loses characters that way gets a hash suffix so two different keys cannot collapse into
    one file — which would serve one preset's audio for another's, silently. */
juce::String safeName (const juce::String& key)
{
    juce::String out;
    bool substituted = false;
    for (int i = 0; i < key.length(); ++i)
    {
        const auto c = key[i];
        if (juce::CharacterFunctions::isLetterOrDigit (c) || c == '-' || c == '_')
            out << c;
        else
        {
            out << '_';
            substituted = true;
        }
    }

    if (out.length() > 96)
    {
        out = out.substring (0, 96);
        substituted = true;
    }

    if (substituted)
        out << '-' << juce::String::toHexString (key.hashCode64()).getLastCharacters (12);

    return out;
}

} // namespace

juce::String snapshotKeyFor (const juce::String& fingerprint, const juce::String& recordId)
{
    return fingerprint.isNotEmpty() ? fingerprint : recordId;
}

SnapshotStore::SnapshotStore (juce::File directory) : dir (std::move (directory))
{
    formats.registerBasicFormats();
}

juce::File SnapshotStore::fileFor (const juce::String& key) const
{
    return dir.getChildFile (safeName (key) + ".flac");
}

bool SnapshotStore::put (const juce::String& key, const juce::AudioBuffer<float>& audio,
                         double sampleRate)
{
    if (key.isEmpty() || audio.getNumSamples() <= 0 || audio.getNumChannels() <= 0
        || sampleRate <= 0.0)
        return false;

    // Down to mono first: this is a preview, and the width is a number in the profile.
    juce::AudioBuffer<float> mono (1, audio.getNumSamples());
    mono.clear();
    for (int channel = 0; channel < audio.getNumChannels(); ++channel)
        mono.addFrom (0, 0, audio, channel, 0, audio.getNumSamples(),
                      1.0f / (float) audio.getNumChannels());

    const auto ratio = sampleRate / (double) snapshotSampleRate;
    const auto outSamples = juce::jmax (1, (int) (mono.getNumSamples() / ratio));
    juce::AudioBuffer<float> resampled (1, outSamples);
    resampled.clear();
    {
        juce::LagrangeInterpolator interpolator;
        interpolator.process (ratio, mono.getReadPointer (0), resampled.getWritePointer (0),
                              outSamples);
    }

    if (! dir.createDirectory())
        return false;

    // Written beside the real name and moved into place, so a snapshot that exists is a
    // snapshot that is complete — a half-written FLAC would read back as a decode failure on
    // every future browse rather than as a miss.
    const auto destination = fileFor (key);
    const auto temporary = destination.getSiblingFile (destination.getFileNameWithoutExtension()
                                                         + ".part");
    temporary.deleteFile();

    {
        juce::FlacAudioFormat flac;
        auto stream = std::make_unique<juce::FileOutputStream> (temporary);
        if (! stream->openedOk())
            return false;

        std::unique_ptr<juce::AudioFormatWriter> writer (
            flac.createWriterFor (stream.get(), (double) snapshotSampleRate, 1, 16, {}, 5));
        if (writer == nullptr)
            return false;
        stream.release();   // the writer owns it now

        if (! writer->writeFromAudioSampleBuffer (resampled, 0, resampled.getNumSamples()))
            return false;
    }

    destination.deleteFile();
    return temporary.moveFileTo (destination);
}

juce::AudioBuffer<float> SnapshotStore::get (const juce::String& key)
{
    juce::AudioBuffer<float> out;
    const auto file = fileFor (key);
    if (! file.existsAsFile())
        return out;

    std::unique_ptr<juce::AudioFormatReader> reader (formats.createReaderFor (file));
    if (reader == nullptr || reader->lengthInSamples <= 0)
        return out;

    out.setSize (1, (int) reader->lengthInSamples);
    reader->read (&out, 0, (int) reader->lengthInSamples, 0, true, false);

    // Heard, so it survives the next sweep. This is the whole of the eviction policy: the
    // snapshots you actually browse are the ones that stay.
    file.setLastModificationTime (juce::Time::getCurrentTime());
    return out;
}

bool SnapshotStore::has (const juce::String& key) const
{
    return fileFor (key).existsAsFile();
}

bool SnapshotStore::remove (const juce::String& key)
{
    return fileFor (key).deleteFile();
}

juce::int64 SnapshotStore::bytes() const
{
    juce::int64 total = 0;
    for (const auto& file : dir.findChildFiles (juce::File::findFiles, false, "*.flac"))
        total += file.getSize();
    return total;
}

int SnapshotStore::count() const
{
    return dir.findChildFiles (juce::File::findFiles, false, "*.flac").size();
}

int SnapshotStore::sweep (juce::int64 budgetBytes)
{
    auto files = dir.findChildFiles (juce::File::findFiles, false, "*.flac");

    juce::int64 total = 0;
    for (const auto& file : files)
        total += file.getSize();

    if (total <= budgetBytes)
        return 0;

    // Oldest first, where "old" means least recently heard — get() touches what it reads.
    std::sort (files.begin(), files.end(), [] (const juce::File& a, const juce::File& b)
               { return a.getLastModificationTime() < b.getLastModificationTime(); });

    int removed = 0;
    for (const auto& file : files)
    {
        if (total <= budgetBytes)
            break;
        const auto size = file.getSize();
        if (file.deleteFile())
        {
            total -= size;
            ++removed;
        }
    }

    return removed;
}

} // namespace ceditor::host
