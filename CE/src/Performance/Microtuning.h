#pragma once

#include <cmath>
#include <utility>
#include <juce_core/juce_core.h>

// A small, dependency-free Scala/MIDI Tuning Standard core. The Performance owns one table
// and any number of parts can subscribe to it; compatible hardware and plug-ins therefore
// hear the exact same pitches rather than each carrying a private, drifting copy.

namespace ceditor::perf
{

struct Microtuning
{
    bool enabled = false;
    juce::String name { "12-tone equal temperament" };
    juce::String sourceName;
    int rootMidiNote = 60;           // MIDI key carrying the implicit Scala 1/1
    int referenceMidiNote = 69;      // key whose frequency is stated below
    double referenceFrequency = 440.0;
    int mtsDeviceId = 0x7f;          // all-call by default
    int mtsProgram = 0;
    /** Implicit 1/1 at index 0, then every .scl entry. The last value is the repeating
        period and is not another degree inside that period. */
    juce::Array<double> degreesCents;

    static Microtuning equalTemperament()
    {
        Microtuning tuning;
        tuning.degreesCents.add (0.0);
        for (int degree = 1; degree <= 12; ++degree)
            tuning.degreesCents.add ((double) degree * 100.0);
        return tuning;
    }

    bool hasUsableScale() const noexcept
    {
        return degreesCents.size() >= 2 && degreesCents.getLast() > 0.0;
    }
};

inline bool parsePositiveNumber (const juce::String& text, double& value) noexcept
{
    const auto trimmed = text.trim();
    if (trimmed.isEmpty())
        return false;
    value = trimmed.getDoubleValue();
    return std::isfinite (value) && value > 0.0;
}

/** Parses the exchange part of a Scala .scl file. Comments may occupy a line or trail a
    value; decimal tokens are cents, fractions are ratios, and a bare integer is ratio n/1,
    as the Scala format specifies. */
inline bool scalaTuningFromText (const juce::String& text, const juce::String& sourceName,
                                 Microtuning& out, juce::String& error)
{
    juce::StringArray meaningful;
    juce::StringArray lines;
    lines.addLines (text);
    for (auto line : lines)
    {
        if (const auto comment = line.indexOfChar ('!'); comment >= 0)
            line = line.substring (0, comment);
        line = line.trim();
        if (line.isNotEmpty())
            meaningful.add (line);
    }

    if (meaningful.size() < 2)
    {
        error = "That Scala file has no description and degree count.";
        return false;
    }

    const auto countText = meaningful[1].trim();
    const auto degreeCount = countText.getIntValue();
    if (degreeCount < 1 || degreeCount > 128
        || countText != juce::String (degreeCount))
    {
        error = "The Scala degree count must be a whole number from 1 to 128.";
        return false;
    }
    if (meaningful.size() < degreeCount + 2)
    {
        error = "The Scala file ends before all of its declared degrees are present.";
        return false;
    }

    auto parsed = Microtuning::equalTemperament();
    parsed.name = meaningful[0].substring (0, 80);
    parsed.sourceName = sourceName.substring (0, 260);
    parsed.degreesCents.clear();
    parsed.degreesCents.add (0.0);

    auto previous = 0.0;
    for (int i = 0; i < degreeCount; ++i)
    {
        const auto token = meaningful[i + 2].removeCharacters (" \t");
        double cents = 0.0;
        if (token.containsChar ('/'))
        {
            const auto slash = token.indexOfChar ('/');
            double numerator = 0.0, denominator = 0.0;
            if (! parsePositiveNumber (token.substring (0, slash), numerator)
                || ! parsePositiveNumber (token.substring (slash + 1), denominator))
            {
                error = "Scala degree " + juce::String (i + 1) + " has an invalid ratio.";
                return false;
            }
            cents = 1200.0 * std::log2 (numerator / denominator);
        }
        else if (token.containsChar ('.'))
        {
            if (! parsePositiveNumber (token, cents))
            {
                error = "Scala degree " + juce::String (i + 1) + " is not a positive cents value.";
                return false;
            }
        }
        else
        {
            double ratio = 0.0;
            if (! parsePositiveNumber (token, ratio))
            {
                error = "Scala degree " + juce::String (i + 1) + " is not a positive ratio.";
                return false;
            }
            cents = 1200.0 * std::log2 (ratio);
        }

        if (! std::isfinite (cents) || cents <= previous || cents > 19200.0)
        {
            error = "Scala degrees must rise strictly and remain within sixteen octaves.";
            return false;
        }
        parsed.degreesCents.add (cents);
        previous = cents;
    }

    parsed.enabled = true;
    out = std::move (parsed);
    error.clear();
    return true;
}

inline double scaleCentsFromRoot (const Microtuning& tuning, int midiNote) noexcept
{
    if (! tuning.hasUsableScale())
        return (double) (midiNote - tuning.rootMidiNote) * 100.0;

    const auto degreeCount = tuning.degreesCents.size() - 1;
    auto relative = midiNote - tuning.rootMidiNote;
    auto period = relative / degreeCount;
    auto degree = relative % degreeCount;
    if (degree < 0)
    {
        degree += degreeCount;
        --period;
    }
    return (double) period * tuning.degreesCents.getLast()
         + tuning.degreesCents[degree];
}

/** Absolute MTS pitch in semitones, where 69.0 is A4=440 Hz in equal temperament. */
inline double tunedMidiPitch (const Microtuning& tuning, int midiNote) noexcept
{
    const auto referenceOffset = 12.0 * std::log2 (
        juce::jlimit (1.0, 40000.0, tuning.referenceFrequency) / 440.0);
    const auto centsFromReference = scaleCentsFromRoot (tuning, midiNote)
                                  - scaleCentsFromRoot (tuning, tuning.referenceMidiNote);
    return (double) tuning.referenceMidiNote + referenceOffset + centsFromReference / 100.0;
}

} // namespace ceditor::perf
