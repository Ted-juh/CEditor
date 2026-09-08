#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "Library.h"

// SonicProbe — playing a sound once, offline, and writing down what came out.
//
// This is the whole mechanism the Sound Browser's measured half rests on, and it is deliberately
// one small thing: press a key, record what happens, describe it. Everything else the browser
// does with measurements — the range sliders, "sounds like", duplicate folding, and later the
// map and the substitutes — is a face on the numbers this file produces.
//
// WHY A FIXED PROBE. Every sound has to be measured the same way or the numbers cannot be
// compared, so the note, the velocity, the hold and the tail are constants rather than settings.
// C3 because it is in range for a bass, a lead and a pad alike; 1.2 seconds held because that is
// long enough for a slow pad to arrive and short enough that twelve thousand of them is an hour;
// 0.8 seconds of tail because a release that outlasts it is reported as "at least this long"
// rather than measured wrongly.
//
// A SECOND, QUIETER PASS. Velocity 40 against velocity 100 is the only way to know whether a
// sound answers touch, which is most of what separates a playable instrument from a pad. It is
// half the cost of the probe and it is worth it.
//
// WHAT THIS IS NOT. It does not judge. Brightness is a spectral centroid, attack is the time to
// reach nine-tenths of the peak, and the profile says so in its own units beside every normalised
// value. There is no model here deciding your pad is emotional.

namespace ceditor::host
{

struct ProbeSpec
{
    double sampleRate = 44100.0;
    int blockSize = 512;
    int note = 60;                 // C3 in the naming this project uses elsewhere
    int velocity = 100;
    int quietVelocity = 40;        // the touch pass
    double holdSeconds = 1.2;
    double tailSeconds = 0.8;
    /** The note is not played until the plug-in has had this long, wall clock, of silent blocks
        after its preset went in. Plug-ins that load a program on their own audio thread, or on
        a thread of their own (Surge XT spawns one), answer the first blocks with silence and
        drop whatever MIDI arrived meanwhile - and a note that never sounded measures as a sound
        that is silent. Off-line rendering is faster than time, so this is a wait, not a length;
        it costs about this much per preset and nothing when the plug-in was ready. Zero disables
        it, for tests that want the first sample to be the note. */
    double settleWallMs = 80.0;
    int settleMinBlocks = 2;

    int holdSamples() const { return (int) (holdSeconds * sampleRate); }
    int totalSamples() const { return (int) ((holdSeconds + tailSeconds) * sampleRate); }
};

struct ProbeRender
{
    juce::AudioBuffer<float> audio;   // what came out, however many channels the plug-in has
    int noteOffSample = 0;            // where the key was released, so the tail can be measured
    double sampleRate = 44100.0;
    double renderSeconds = 0.0;       // wall clock, for the cost figure
    int latencySamples = 0;
};

/** Plays the probe through a prepared-or-not processor and hands back what came out. The
    processor is prepared and released here, so the caller can hand over an instance it has done
    nothing to. Safe to call off the message thread — this is `processBlock` and nothing else,
    which is what an audio thread does anyway. */
ProbeRender renderProbe (juce::AudioProcessor& processor, const ProbeSpec& spec, int velocity);

/** Describes one render. `quiet` is the velocity-40 pass, and may be empty — the profile then
    reports no dynamics rather than guessing at them. */
SonicProfile analyseProbe (const ProbeRender& loud, const ProbeRender& quiet, const ProbeSpec& spec);

/** Both passes and the description, for a caller that just wants the answer. */
inline SonicProfile probeProcessor (juce::AudioProcessor& processor, const ProbeSpec& spec)
{
    const auto loud = renderProbe (processor, spec, spec.velocity);
    const auto quiet = renderProbe (processor, spec, spec.quietVelocity);
    return analyseProbe (loud, quiet, spec);
}

// -- the normalisations, exposed because the browser's sliders have to agree with them ----------
//
// A slider that maps its handle differently from the filter behind it is a slider that lies, so
// the mapping lives here, once, and both sides call it.

/** 120 Hz .. 9 kHz, logarithmic. Below and above are clamped rather than wrapped: a sub bass is
    as dark as the scale goes, and it is honest to say so. */
float normaliseBrightness (float centroidHz);
float brightnessToHz (float normalised);

/** 1 ms .. 2 s, logarithmic. */
float normaliseAttack (float seconds);
float attackToSeconds (float normalised);

/** 50 ms .. 10 s, logarithmic. */
float normaliseTail (float seconds);
float tailToSeconds (float normalised);

/** 0 .. 25% of one core. Anything heavier is off the end of the scale, which is the answer a
    person browsing for something they can run live actually needs. */
float normaliseCost (float percentOfOneCore);
float costToPercent (float normalised);

} // namespace ceditor::host
