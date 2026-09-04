#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <array>
#include <atomic>
#include <cmath>
#include <limits>
#include "PatternModel.h"

// MidiFxChain — the per-part MIDI processors that sit between the rack's zone filter and the
// instrument (Hostage performance system).
//
// Four named operations in a fixed order — transpose, scale constrain, chord generate,
// velocity — because the baseline is explicit that this is a defined chain and NOT arbitrary
// script on the real-time path. Order is not a preference: transposing after constraining
// would walk notes back out of the scale, and generating a chord before constraining would
// leave the added voices outside it.
//
// THE NOTE-OFF INVARIANT, again. Every stage here can change which note number leaves for a
// given note that arrived, and the rules can change while a key is held. So the chain tracks
// what it actually emitted per (channel, incoming note) and releases exactly that — the same
// discipline PartMidiFilterCore keeps for zones, for the same reason: a note-off must reach
// the note that is sounding, not the note today's settings would produce.
//
// THREADING. Settings arrive from the message thread through one atomic packed word plus an
// atomic scale mask; the audio thread reads them once per block. Nothing allocates.

namespace ceditor::perf
{

class MidiFxChain
{
public:
    static constexpr int maxVoices = 6;

    void setSettings (const MidiFxSettings& settings) noexcept
    {
        transpose.store (juce::jlimit (-48, 48, settings.transpose));
        transposeDiatonic.store (settings.transposeMode == "diatonic");
        chordType.store ((int) settings.chord);
        chordInversion.store (juce::jlimit (0, 3, settings.chordInversion));
        chordVoicing.store ((int) settings.chordVoicing);
        chordVoiceLeading.store (settings.chordVoiceLeading);
        velocityFixed.store (juce::jlimit (0, 127, settings.velocityFixed));
        velocityScale.store (juce::jlimit (0.1f, 2.0f, settings.velocityScale));
        velocityCurve.store ((int) settings.velocityCurve);
        velocityInputMin.store (juce::jlimit (1, 127, settings.velocityInputMin));
        velocityInputMax.store (juce::jlimit (1, 127, settings.velocityInputMax));
        velocityOutputMin.store (juce::jlimit (1, 127, settings.velocityOutputMin));
        velocityOutputMax.store (juce::jlimit (1, 127, settings.velocityOutputMax));
        expressionEnabled.store (settings.expressionEnabled);
        expressionSource.store (settings.expressionSource == "channel pressure" ? 1
                              : settings.expressionSource == "poly aftertouch" ? 2 : 0);
        expressionCc.store (juce::jlimit (0, 127, settings.expressionCc));
        expressionCurve.store ((int) settings.expressionCurve);
        expressionInputMin.store (juce::jlimit (0, 127, settings.expressionInputMin));
        expressionInputMax.store (juce::jlimit (0, 127, settings.expressionInputMax));
        expressionOutputMin.store (juce::jlimit (0, 127, settings.expressionOutputMin));
        expressionOutputMax.store (juce::jlimit (0, 127, settings.expressionOutputMax));
        const auto velocityPointsComplete =
            settings.velocityCurveValues.size() == MidiFxSettings::responseCurvePoints;
        const auto expressionPointsComplete =
            settings.expressionCurveValues.size() == MidiFxSettings::responseCurvePoints;
        for (int i = 0; i < MidiFxSettings::responseCurvePoints; ++i)
        {
            const auto identity = juce::roundToInt (
                127.0f * (float) i / (float) (MidiFxSettings::responseCurvePoints - 1));
            velocityCurveValues[(size_t) i].store (velocityPointsComplete
                ? juce::jlimit (0, 127, settings.velocityCurveValues[i]) : identity);
            expressionCurveValues[(size_t) i].store (expressionPointsComplete
                ? juce::jlimit (0, 127, settings.expressionCurveValues[i]) : identity);
        }
        mask.store (settings.constrainToScale
                      ? scaleMask (settings.scaleType, settings.scaleRoot)
                      : (juce::uint16) 0x0fff);
        // Diatonic stacking needs the REAL scale even when constrain is off — a chromatic
        // mask would stack minor thirds and call them chords.
        diatonicMask.store (scaleMask (settings.scaleType, settings.scaleRoot));

        // The learned per-key map: offsets stored +64 so 0 can mean "unused"; a key's
        // count of 0 means unmapped and the note passes through plain in keyChords mode.
        for (int key = 0; key < 128; ++key)
            customCount[(size_t) key].store (0);
        for (const auto& keyChord : settings.keyChords)
        {
            if (! juce::isPositiveAndBelow (keyChord.key, 128))
                continue;
            const auto count = juce::jmin (maxVoices, keyChord.offsets.size());
            for (int i = 0; i < count; ++i)
                customOffsets[(size_t) keyChord.key][(size_t) i].store (
                    (juce::uint8) (juce::jlimit (-60, 60, keyChord.offsets[i]) + 64));
            customCount[(size_t) keyChord.key].store ((juce::uint8) count);
        }
    }

    /** True when nothing in the chain would change a note — the caller can skip the copy. */
    bool isTransparent() const noexcept
    {
        return transpose.load() == 0
            && chordType.load() == (int) MidiFxSettings::ChordType::off
            && velocityFixed.load() == 0
            && juce::approximatelyEqual (velocityScale.load(), 1.0f)
            && velocityCurve.load() == (int) MidiFxSettings::ResponseCurve::linear
            && velocityInputMin.load() == 1 && velocityInputMax.load() == 127
            && velocityOutputMin.load() == 1 && velocityOutputMax.load() == 127
            && ! expressionEnabled.load()
            && mask.load() == (juce::uint16) 0x0fff;
    }

    /** Audio thread: reads `in`, writes the processed stream to `out` (which is cleared). */
    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out)
    {
        out.clear();

        const auto semitones = transpose.load();
        const auto useDiatonicTranspose = transposeDiatonic.load();
        const auto scale = mask.load();
        const auto chord = (MidiFxSettings::ChordType) chordType.load();
        const auto inversion = chordInversion.load();
        const auto voicing = (MidiFxSettings::ChordVoicing) chordVoicing.load();
        const auto voiceLeading = chordVoiceLeading.load();
        const auto fixed = velocityFixed.load();
        const auto scaleVelocity = velocityScale.load();
        const auto velocityCurveType = (MidiFxSettings::ResponseCurve) velocityCurve.load();
        const auto velocityInLow = velocityInputMin.load();
        const auto velocityInHigh = velocityInputMax.load();
        const auto velocityOutLow = velocityOutputMin.load();
        const auto velocityOutHigh = velocityOutputMax.load();
        const auto mapExpression = expressionEnabled.load();
        const auto expressionKind = expressionSource.load();
        const auto mappedCc = expressionCc.load();
        const auto expressionCurveType = (MidiFxSettings::ResponseCurve) expressionCurve.load();
        const auto expressionInLow = expressionInputMin.load();
        const auto expressionInHigh = expressionInputMax.load();
        const auto expressionOutLow = expressionOutputMin.load();
        const auto expressionOutHigh = expressionOutputMax.load();
        int velocityPoints[MidiFxSettings::responseCurvePoints] {};
        int expressionPoints[MidiFxSettings::responseCurvePoints] {};
        for (int i = 0; i < MidiFxSettings::responseCurvePoints; ++i)
        {
            velocityPoints[i] = velocityCurveValues[(size_t) i].load();
            expressionPoints[i] = expressionCurveValues[(size_t) i].load();
        }

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto position = metadata.samplePosition;

            if (message.isNoteOn())
            {
                const auto channel = message.getChannel();
                const auto sourceNote = message.getNoteNumber();

                auto velocity = shape7Bit ((int) message.getVelocity(), velocityInLow,
                                           velocityInHigh, velocityOutLow, velocityOutHigh,
                                           velocityCurveType, velocityPoints, true);
                velocity = juce::jlimit (1, 127,
                                         juce::roundToInt ((float) velocity * scaleVelocity));
                if (fixed > 0)
                    velocity = fixed;

                const auto transposed = useDiatonicTranspose
                    ? scaleSteps (sourceNote, semitones, diatonicMask.load())
                    : juce::jlimit (0, 127, sourceNote + semitones);
                const auto root = constrainNoteToScale (transposed, scale);

                // Retrigger without an off: release what is sounding for this source note
                // before the table forgets it.
                releaseTracked (channel, sourceNote, out, position);

                int notes[maxVoices];
                const auto count = chordNotes (chord, root, scale, diatonicMask.load(), notes);
                if (chord != MidiFxSettings::ChordType::off && count > 1)
                {
                    // With all three Smart Chorder controls at their defaults, retain the
                    // exact legacy ordering too (not merely the same pitch set).
                    if (inversion != 0 || voicing != MidiFxSettings::ChordVoicing::close
                        || voiceLeading)
                        applyVoicing (notes, count, inversion, voicing);
                    if (voiceLeading)
                        chooseNearestVoicing (channel - 1, notes, count);
                    rememberVoicing (channel - 1, notes, count);
                }
                else
                {
                    clearVoiceHistory (channel - 1);
                }
                for (int i = 0; i < count; ++i)
                {
                    out.addEvent (juce::MidiMessage::noteOn (channel, notes[i],
                                                             (juce::uint8) velocity), position);
                    track (channel, sourceNote, i, notes[i]);
                }
            }
            else if (message.isNoteOff())
            {
                releaseTracked (message.getChannel(), message.getNoteNumber(), out, position);
            }
            else if (mapExpression && expressionMatches (message, expressionKind, mappedCc))
            {
                const auto value = shape7Bit (expressionValue (message), expressionInLow,
                                              expressionInHigh, expressionOutLow,
                                              expressionOutHigh, expressionCurveType,
                                              expressionPoints, false);
                if (message.isController())
                    out.addEvent (juce::MidiMessage::controllerEvent (
                                      message.getChannel(), message.getControllerNumber(), value), position);
                else if (message.isChannelPressure())
                    out.addEvent (juce::MidiMessage::channelPressureChange (
                                      message.getChannel(), value), position);
                else
                    out.addEvent (juce::MidiMessage::aftertouchChange (
                                      message.getChannel(), message.getNoteNumber(), value), position);
            }
            else
            {
                out.addEvent (message, position);
            }
        }
    }

    /** Emits an off for everything this chain is holding, then forgets. */
    void allNotesOff (juce::MidiBuffer& out, int position)
    {
        for (int channel = 0; channel < 16; ++channel)
            for (int note = 0; note < 128; ++note)
                releaseTracked (channel + 1, note, out, position);
        clearVoiceHistory();
    }

    void forgetAll() noexcept
    {
        for (auto& channel : emitted)
            for (auto& note : channel)
                for (auto& slot : note)
                    slot = 0;
        clearVoiceHistory();
    }

private:
    static float responseAt (float input, MidiFxSettings::ResponseCurve curve,
                             const int* custom) noexcept
    {
        const auto x = juce::jlimit (0.0f, 1.0f, input);
        switch (curve)
        {
            case MidiFxSettings::ResponseCurve::soft:
                return std::sqrt (x);
            case MidiFxSettings::ResponseCurve::hard:
                return x * x;
            case MidiFxSettings::ResponseCurve::sCurve:
                return x * x * (3.0f - 2.0f * x);
            case MidiFxSettings::ResponseCurve::custom:
            {
                const auto scaled = x * (float) (MidiFxSettings::responseCurvePoints - 1);
                const auto left = juce::jlimit (0, MidiFxSettings::responseCurvePoints - 1,
                                                (int) std::floor (scaled));
                const auto right = juce::jmin (MidiFxSettings::responseCurvePoints - 1, left + 1);
                const auto fraction = scaled - (float) left;
                const auto a = (float) custom[left] / 127.0f;
                const auto b = (float) custom[right] / 127.0f;
                return a + (b - a) * fraction;
            }
            case MidiFxSettings::ResponseCurve::linear:
            default:
                return x;
        }
    }

    static int shape7Bit (int value, int inputMin, int inputMax, int outputMin,
                          int outputMax, MidiFxSettings::ResponseCurve curve,
                          const int* custom, bool noteVelocity) noexcept
    {
        const auto inLow = juce::jmin (inputMin, inputMax);
        const auto inHigh = juce::jmax (inputMin, inputMax);
        const auto outLow = juce::jmin (outputMin, outputMax);
        const auto outHigh = juce::jmax (outputMin, outputMax);
        const auto normalized = inHigh == inLow ? (value >= inHigh ? 1.0f : 0.0f)
            : (float) (juce::jlimit (inLow, inHigh, value) - inLow) / (float) (inHigh - inLow);
        const auto shaped = responseAt (normalized, curve, custom);
        const auto mapped = juce::roundToInt ((float) outLow + shaped * (float) (outHigh - outLow));
        return juce::jlimit (noteVelocity ? 1 : 0, 127, mapped);
    }

    static bool expressionMatches (const juce::MidiMessage& message, int kind,
                                   int cc) noexcept
    {
        if (kind == 1) return message.isChannelPressure();
        if (kind == 2) return message.isAftertouch();
        return message.isController() && message.getControllerNumber() == cc;
    }

    static int expressionValue (const juce::MidiMessage& message) noexcept
    {
        if (message.isController())
            return message.getControllerValue();
        if (message.isChannelPressure())
            return message.getChannelPressureValue();
        return message.getAfterTouchValue();
    }

    static void sortNotes (int* notes, int count) noexcept
    {
        for (int i = 1; i < count; ++i)
        {
            const auto value = notes[i];
            auto j = i;
            while (j > 0 && notes[j - 1] > value)
            {
                notes[j] = notes[j - 1];
                --j;
            }
            notes[j] = value;
        }
    }

    /** Keeps a transformed chord inside MIDI note range without crushing its intervals. */
    static void fitToMidi (int* notes, int count) noexcept
    {
        sortNotes (notes, count);
        while (count > 0 && notes[0] < 0)
            for (int i = 0; i < count; ++i)
                notes[i] += 12;
        while (count > 0 && notes[count - 1] > 127)
            for (int i = 0; i < count; ++i)
                notes[i] -= 12;
        for (int i = 0; i < count; ++i)
            notes[i] = juce::jlimit (0, 127, notes[i]);
    }

    /** Applies the player's requested inversion and register shape before automatic motion. */
    static void applyVoicing (int* notes, int count, int inversion,
                              MidiFxSettings::ChordVoicing voicing) noexcept
    {
        sortNotes (notes, count);

        const auto rotations = count > 0 ? juce::jlimit (0, 3, inversion) % count : 0;
        for (int turn = 0; turn < rotations; ++turn)
        {
            const auto raised = notes[0] + 12;
            for (int i = 1; i < count; ++i)
                notes[i - 1] = notes[i];
            notes[count - 1] = raised;
        }

        switch (voicing)
        {
            case MidiFxSettings::ChordVoicing::close:
                break;
            case MidiFxSettings::ChordVoicing::open:
                if (count >= 3)
                    notes[1] += 12;
                break;
            case MidiFxSettings::ChordVoicing::drop2:
                if (count >= 3)
                    notes[count - 2] -= 12;
                break;
            case MidiFxSettings::ChordVoicing::wide:
                if (count >= 2)
                {
                    notes[0] -= 12;
                    notes[count - 1] += 12;
                }
                break;
        }

        fitToMidi (notes, count);
    }

    /** Picks the cyclic inversion and octave whose voices travel least from the last chord.
        The previous and current chord may have different voice counts; their low-to-high
        positions are then compared proportionally. This is still bounded stack work: no
        allocation and at most 6 * 6 * 21 comparisons per note-on. */
    void chooseNearestVoicing (int channel, int* notes, int count) noexcept
    {
        if (! juce::isPositiveAndBelow (channel, 16)
            || count < 2 || previousVoicingCount[channel] == 0)
            return;

        const auto previousCount = (int) previousVoicingCount[channel];
        int best[maxVoices] {};
        auto bestCost = std::numeric_limits<int>::max();

        for (int rotation = 0; rotation < count; ++rotation)
        {
            int base[maxVoices] {};
            for (int i = 0; i < count; ++i)
            {
                base[i] = notes[(rotation + i) % count];
                if (i > 0)
                    while (base[i] <= base[i - 1])
                        base[i] += 12;
            }

            for (int octave = -10; octave <= 10; ++octave)
            {
                const auto shift = octave * 12;
                if (base[0] + shift < 0 || base[count - 1] + shift > 127)
                    continue;

                auto cost = 0;
                for (int i = 0; i < count; ++i)
                {
                    const auto previousIndex = count == 1 || previousCount == 1 ? 0
                        : juce::roundToInt ((double) i * (double) (previousCount - 1)
                                            / (double) (count - 1));
                    cost += std::abs (base[i] + shift
                                     - previousVoicing[channel][previousIndex]);
                }

                if (cost < bestCost)
                {
                    bestCost = cost;
                    for (int i = 0; i < count; ++i)
                        best[i] = base[i] + shift;
                }
            }
        }

        if (bestCost != std::numeric_limits<int>::max())
            for (int i = 0; i < count; ++i)
                notes[i] = best[i];
    }

    void rememberVoicing (int channel, const int* notes, int count) noexcept
    {
        if (! juce::isPositiveAndBelow (channel, 16))
            return;
        previousVoicingCount[channel] = (juce::uint8) juce::jlimit (0, maxVoices, count);
        for (int i = 0; i < count && i < maxVoices; ++i)
            previousVoicing[channel][i] = notes[i];
        sortNotes (previousVoicing[channel], count);
    }

    void clearVoiceHistory (int channel = -1) noexcept
    {
        if (channel >= 0 && channel < 16)
        {
            previousVoicingCount[channel] = 0;
            return;
        }
        for (auto& count : previousVoicingCount)
            count = 0;
    }

    /** Moves a note up `steps` scale tones within `mask`. The diatonic walk. */
    static int scaleStepsUp (int note, int steps, juce::uint16 mask) noexcept
    {
        auto n = note;
        for (int s = 0; s < steps; ++s)
            for (int i = 1; i <= 12; ++i)
                if (n + i <= 127 && (mask & (juce::uint16) (1 << ((n + i) % 12))) != 0)
                {
                    n += i;
                    break;
                }
        return n;
    }

    /** Diatonic transpose: first place an accidental on the nearest scale tone (ties up),
        then walk the requested number of scale degrees in either direction. Unknown scales
        fall back to chromatic movement, so a damaged name never silences the keyboard. */
    static int scaleSteps (int note, int steps, juce::uint16 mask) noexcept
    {
        if (steps == 0)
            return note;
        if (mask == 0 || mask == (juce::uint16) 0x0fff)
            return juce::jlimit (0, 127, note + steps);

        auto current = constrainNoteToScale (note, mask);
        const auto direction = steps > 0 ? 1 : -1;
        for (int step = 0; step < std::abs (steps); ++step)
        {
            bool moved = false;
            for (int distance = 1; distance <= 12; ++distance)
            {
                const auto candidate = current + direction * distance;
                if (candidate < 0 || candidate > 127)
                    break;
                if ((mask & (juce::uint16) (1 << (candidate % 12))) != 0)
                {
                    current = candidate;
                    moved = true;
                    break;
                }
            }
            if (! moved)
                break;
        }
        return current;
    }

    /** The notes one incoming note produces. `out` must hold maxVoices. */
    int chordNotes (MidiFxSettings::ChordType type, int root, juce::uint16 scale,
                    juce::uint16 diatonic, int (&out)[maxVoices]) const noexcept
    {
        const auto add = [&scale] (int note) { return constrainNoteToScale (juce::jlimit (0, 127, note), scale); };

        switch (type)
        {
            case MidiFxSettings::ChordType::off:
                out[0] = root;
                return 1;

            case MidiFxSettings::ChordType::powerFifth:
                out[0] = root; out[1] = add (root + 7);
                return 2;

            case MidiFxSettings::ChordType::triad:
                out[0] = root; out[1] = add (root + 4); out[2] = add (root + 7);
                return 3;

            case MidiFxSettings::ChordType::triadFirstInversion:
                out[0] = root; out[1] = add (root + 3); out[2] = add (root - 5);
                return 3;

            case MidiFxSettings::ChordType::seventh:
                out[0] = root; out[1] = add (root + 4); out[2] = add (root + 7); out[3] = add (root + 10);
                return 4;

            case MidiFxSettings::ChordType::octaveDouble:
                out[0] = root; out[1] = juce::jlimit (0, 127, root + 12);
                return 2;

            case MidiFxSettings::ChordType::diatonic:
            case MidiFxSettings::ChordType::diatonicSeventh:
            {
                // Stacked scale thirds: the chord OF this degree — C major's D plays D-F-A,
                // its B plays B-D-F — which is what one-finger harmony means. Over a
                // chromatic scale (none selected) the stack degenerates, so fall back to
                // the plain shapes rather than emit diminished mush.
                if (diatonic == (juce::uint16) 0x0fff)
                {
                    out[0] = root; out[1] = add (root + 4); out[2] = add (root + 7);
                    if (type == MidiFxSettings::ChordType::diatonicSeventh)
                    {
                        out[3] = add (root + 10);
                        return 4;
                    }
                    return 3;
                }

                const auto degreeRoot = constrainNoteToScale (root, diatonic);
                out[0] = degreeRoot;
                out[1] = scaleStepsUp (degreeRoot, 2, diatonic);
                out[2] = scaleStepsUp (degreeRoot, 4, diatonic);
                if (type == MidiFxSettings::ChordType::diatonicSeventh)
                {
                    out[3] = scaleStepsUp (degreeRoot, 6, diatonic);
                    return 4;
                }
                return 3;
            }

            case MidiFxSettings::ChordType::keyChords:
            {
                // The learned map: a mapped key plays exactly what was captured for it,
                // an unmapped key passes through plain — per-key chord sets, VIP-style.
                const auto count = (int) customCount[(size_t) juce::jlimit (0, 127, root)].load();
                if (count == 0)
                {
                    out[0] = root;
                    return 1;
                }
                for (int i = 0; i < count; ++i)
                    out[i] = juce::jlimit (0, 127,
                        root + (int) customOffsets[(size_t) root][(size_t) i].load() - 64);
                return count;
            }
        }

        out[0] = root;
        return 1;
    }

    void track (int channel, int sourceNote, int voice, int emittedNote) noexcept
    {
        if (channel < 1 || channel > 16 || ! juce::isPositiveAndBelow (sourceNote, 128)
            || ! juce::isPositiveAndBelow (voice, maxVoices))
            return;
        emitted[(size_t) (channel - 1)][(size_t) sourceNote][(size_t) voice] =
            (juce::uint8) (emittedNote + 1);
    }

    void releaseTracked (int channel, int sourceNote, juce::MidiBuffer& out, int position)
    {
        if (channel < 1 || channel > 16 || ! juce::isPositiveAndBelow (sourceNote, 128))
            return;

        auto& voices = emitted[(size_t) (channel - 1)][(size_t) sourceNote];
        for (auto& slot : voices)
        {
            if (slot == 0)
                continue;
            out.addEvent (juce::MidiMessage::noteOff (channel, (int) slot - 1), position);
            slot = 0;
        }
    }

    // (channel, source note) -> up to maxVoices emitted notes + 1; 0 = not sounding.
    juce::uint8 emitted[16][128][maxVoices] = {};
    int previousVoicing[16][maxVoices] = {};
    juce::uint8 previousVoicingCount[16] = {};

    std::atomic<int> transpose { 0 };
    std::atomic<bool> transposeDiatonic { false };
    std::atomic<int> chordType { 0 };
    std::atomic<int> chordInversion { 0 };
    std::atomic<int> chordVoicing { 0 };
    std::atomic<bool> chordVoiceLeading { false };
    std::atomic<int> velocityFixed { 0 };
    std::atomic<float> velocityScale { 1.0f };
    std::atomic<int> velocityCurve { (int) MidiFxSettings::ResponseCurve::linear };
    std::atomic<int> velocityInputMin { 1 }, velocityInputMax { 127 };
    std::atomic<int> velocityOutputMin { 1 }, velocityOutputMax { 127 };
    std::array<std::atomic<int>, MidiFxSettings::responseCurvePoints> velocityCurveValues {};
    std::atomic<bool> expressionEnabled { false };
    std::atomic<int> expressionSource { 0 };
    std::atomic<int> expressionCc { 11 };
    std::atomic<int> expressionCurve { (int) MidiFxSettings::ResponseCurve::linear };
    std::atomic<int> expressionInputMin { 0 }, expressionInputMax { 127 };
    std::atomic<int> expressionOutputMin { 0 }, expressionOutputMax { 127 };
    std::array<std::atomic<int>, MidiFxSettings::responseCurvePoints> expressionCurveValues {};
    std::atomic<juce::uint16> mask { 0x0fff };
    std::atomic<juce::uint16> diatonicMask { 0x0fff };
    std::array<std::array<std::atomic<juce::uint8>, 6>, 128> customOffsets {};
    std::array<std::atomic<juce::uint8>, 128> customCount {};
};

} // namespace ceditor::perf
