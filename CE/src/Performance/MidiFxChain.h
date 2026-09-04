#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <array>
#include <atomic>
#include "PatternModel.h"

// MidiFxChain — the per-part MIDI processors that sit between the rack's zone filter and the
// instrument (VIP-successor Stage 6, baseline §18.8.5).
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
        chordType.store ((int) settings.chord);
        velocityFixed.store (juce::jlimit (0, 127, settings.velocityFixed));
        velocityScale.store (juce::jlimit (0.1f, 2.0f, settings.velocityScale));
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
            && mask.load() == (juce::uint16) 0x0fff;
    }

    /** Audio thread: reads `in`, writes the processed stream to `out` (which is cleared). */
    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out)
    {
        out.clear();

        const auto semitones = transpose.load();
        const auto scale = mask.load();
        const auto chord = (MidiFxSettings::ChordType) chordType.load();
        const auto fixed = velocityFixed.load();
        const auto scaleVelocity = velocityScale.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto position = metadata.samplePosition;

            if (message.isNoteOn())
            {
                const auto channel = message.getChannel();
                const auto sourceNote = message.getNoteNumber();

                auto velocity = juce::jlimit (1, 127,
                                              juce::roundToInt ((float) message.getVelocity() * scaleVelocity));
                if (fixed > 0)
                    velocity = fixed;

                const auto root = constrainNoteToScale (juce::jlimit (0, 127, sourceNote + semitones),
                                                        scale);

                // Retrigger without an off: release what is sounding for this source note
                // before the table forgets it.
                releaseTracked (channel, sourceNote, out, position);

                int notes[maxVoices];
                const auto count = chordNotes (chord, root, scale, diatonicMask.load(), notes);
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
    }

    void forgetAll() noexcept
    {
        for (auto& channel : emitted)
            for (auto& note : channel)
                for (auto& slot : note)
                    slot = 0;
    }

private:
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

    std::atomic<int> transpose { 0 };
    std::atomic<int> chordType { 0 };
    std::atomic<int> velocityFixed { 0 };
    std::atomic<float> velocityScale { 1.0f };
    std::atomic<juce::uint16> mask { 0x0fff };
    std::atomic<juce::uint16> diatonicMask { 0x0fff };
    std::array<std::array<std::atomic<juce::uint8>, 6>, 128> customOffsets {};
    std::array<std::atomic<juce::uint8>, 128> customCount {};
};

} // namespace ceditor::perf
