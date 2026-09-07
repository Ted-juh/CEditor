#include "SonicProbe.h"

#include <juce_dsp/juce_dsp.h>

#include <algorithm>
#include <chrono>
#include <cmath>

namespace ceditor::host
{

namespace
{

/** A logarithmic 0..1 mapping between two ends, clamped rather than wrapped. */
float logNormalise (float value, float low, float high)
{
    if (! (value > 0.0f) || low <= 0.0f || high <= low)
        return 0.0f;
    const auto t = (std::log (juce::jlimit (low, high, value)) - std::log (low))
                     / (std::log (high) - std::log (low));
    return juce::jlimit (0.0f, 1.0f, t);
}

float logDenormalise (float normalised, float low, float high)
{
    const auto t = juce::jlimit (0.0f, 1.0f, normalised);
    return std::exp (std::log (low) + t * (std::log (high) - std::log (low)));
}

constexpr int fftOrder = 12;                  // 4096 samples: ~11 Hz bins at 44.1k
constexpr int fftSize = 1 << fftOrder;

/** The window of the loud render that the spectrum is taken from: the sustain, not the attack.
    A transient's spectrum is every frequency at once and says nothing about the sound's colour,
    which is why a naive "FFT the whole thing" reads every plucked sound as bright. */
int spectrumStart (const ProbeRender& render, const ProbeSpec& spec)
{
    const auto quarter = (int) (0.25 * spec.holdSeconds * render.sampleRate);
    return juce::jlimit (0, juce::jmax (0, render.audio.getNumSamples() - fftSize),
                         render.noteOffSample - fftSize > quarter ? render.noteOffSample - fftSize
                                                                  : quarter);
}

struct Spectrum
{
    float centroidHz = 0.0f;
    float flatness = 0.0f;      // geometric mean over arithmetic mean: 0 tonal, 1 noise
    bool valid = false;
};

Spectrum analyseSpectrum (const ProbeRender& render, const ProbeSpec& spec)
{
    Spectrum out;
    const auto& audio = render.audio;
    if (audio.getNumSamples() < fftSize || audio.getNumChannels() == 0)
        return out;

    const auto start = spectrumStart (render, spec);
    std::vector<float> data ((size_t) fftSize * 2, 0.0f);

    // Channels summed to mono: a spectral centroid is about colour, and a sound panned hard left
    // has the same colour as one panned hard right.
    for (int channel = 0; channel < audio.getNumChannels(); ++channel)
    {
        const auto* source = audio.getReadPointer (channel, start);
        for (int i = 0; i < fftSize; ++i)
            data[(size_t) i] += source[i];
    }

    const auto scale = 1.0f / (float) audio.getNumChannels();
    juce::dsp::WindowingFunction<float> window (fftSize, juce::dsp::WindowingFunction<float>::hann);
    for (int i = 0; i < fftSize; ++i)
        data[(size_t) i] *= scale;
    window.multiplyWithWindowingTable (data.data(), (size_t) fftSize);

    juce::dsp::FFT fft (fftOrder);
    fft.performFrequencyOnlyForwardTransform (data.data());

    const auto binHz = (float) (render.sampleRate / fftSize);
    double weighted = 0.0, total = 0.0, logSum = 0.0;
    int counted = 0;

    // Below 30 Hz is DC and rumble, above 16 kHz is above anything the centroid should be pulled
    // by; both ends would move the number without changing what anybody hears.
    const auto firstBin = juce::jmax (1, (int) (30.0f / binHz));
    const auto lastBin = juce::jmin (fftSize / 2, (int) (16000.0f / binHz));

    for (int bin = firstBin; bin < lastBin; ++bin)
    {
        const auto magnitude = data[(size_t) bin];
        const auto power = magnitude * magnitude;
        weighted += (double) power * bin * binHz;
        total += power;
        logSum += std::log ((double) power + 1.0e-12);
        ++counted;
    }

    if (! (total > 1.0e-9) || counted == 0)
        return out;

    out.centroidHz = (float) (weighted / total);

    const auto geometric = std::exp (logSum / counted);
    const auto arithmetic = total / counted;
    out.flatness = juce::jlimit (0.0f, 1.0f, (float) (geometric / (arithmetic + 1.0e-12)));
    out.valid = true;
    return out;
}

/** Peak magnitude across channels, per sample. */
float peakAt (const juce::AudioBuffer<float>& audio, int sample)
{
    float peak = 0.0f;
    for (int channel = 0; channel < audio.getNumChannels(); ++channel)
        peak = juce::jmax (peak, std::abs (audio.getSample (channel, sample)));
    return peak;
}

float rmsOf (const juce::AudioBuffer<float>& audio, int start, int length)
{
    if (length <= 0 || audio.getNumChannels() == 0)
        return 0.0f;
    double sum = 0.0;
    for (int channel = 0; channel < audio.getNumChannels(); ++channel)
        for (int i = 0; i < length; ++i)
        {
            const auto v = (double) audio.getSample (channel, start + i);
            sum += v * v;
        }
    return (float) std::sqrt (sum / (length * audio.getNumChannels()));
}

} // namespace

float normaliseBrightness (float centroidHz)     { return logNormalise (centroidHz, 120.0f, 9000.0f); }
float brightnessToHz (float normalised)          { return logDenormalise (normalised, 120.0f, 9000.0f); }
float normaliseAttack (float seconds)            { return logNormalise (seconds, 0.001f, 2.0f); }
float attackToSeconds (float normalised)         { return logDenormalise (normalised, 0.001f, 2.0f); }
float normaliseTail (float seconds)              { return logNormalise (seconds, 0.05f, 10.0f); }
float tailToSeconds (float normalised)           { return logDenormalise (normalised, 0.05f, 10.0f); }
float normaliseCost (float percentOfOneCore)     { return juce::jlimit (0.0f, 1.0f, percentOfOneCore / 25.0f); }
float costToPercent (float normalised)           { return juce::jlimit (0.0f, 1.0f, normalised) * 25.0f; }

ProbeRender renderProbe (juce::AudioProcessor& processor, const ProbeSpec& spec, int velocity)
{
    ProbeRender out;
    out.sampleRate = spec.sampleRate;
    out.noteOffSample = spec.holdSamples();

    processor.setNonRealtime (true);
    processor.prepareToPlay (spec.sampleRate, spec.blockSize);
    out.latencySamples = processor.getLatencySamples();

    const auto channels = juce::jmax (1, processor.getTotalNumOutputChannels());
    const auto total = spec.totalSamples();
    out.audio.setSize (channels, total);
    out.audio.clear();

    juce::AudioBuffer<float> block (juce::jmax (channels, processor.getTotalNumInputChannels()),
                                    spec.blockSize);
    juce::MidiBuffer midi;

    const auto started = std::chrono::steady_clock::now();

    for (int position = 0; position < total; position += spec.blockSize)
    {
        const auto length = juce::jmin (spec.blockSize, total - position);
        block.clear();
        midi.clear();

        // Note on in the first block, note off in whichever block the hold ends in — placed at
        // its exact sample so a fast release is not quantised to a block boundary.
        if (position == 0)
            midi.addEvent (juce::MidiMessage::noteOn (1, spec.note, (juce::uint8) velocity), 0);
        if (out.noteOffSample >= position && out.noteOffSample < position + length)
            midi.addEvent (juce::MidiMessage::noteOff (1, spec.note),
                           out.noteOffSample - position);

        juce::AudioBuffer<float> view (block.getArrayOfWritePointers(), block.getNumChannels(),
                                       0, length);
        processor.processBlock (view, midi);

        for (int channel = 0; channel < channels; ++channel)
            out.audio.copyFrom (channel, position, view, juce::jmin (channel, view.getNumChannels() - 1),
                                0, length);
    }

    out.renderSeconds = std::chrono::duration<double> (std::chrono::steady_clock::now() - started).count();

    processor.releaseResources();
    processor.setNonRealtime (false);
    return out;
}

SonicProfile analyseProbe (const ProbeRender& loud, const ProbeRender& quiet, const ProbeSpec& spec)
{
    SonicProfile profile;
    profile.measured = true;

    const auto& audio = loud.audio;
    const auto samples = audio.getNumSamples();
    if (samples <= 0 || audio.getNumChannels() == 0)
    {
        profile.silent = true;
        return profile;
    }

    profile.latencySamples = loud.latencySamples;

    // Peak first, because everything below is relative to it.
    float peak = 0.0f;
    int peakSample = 0;
    for (int i = 0; i < samples; ++i)
        if (const auto value = peakAt (audio, i); value > peak)
        {
            peak = value;
            peakSample = i;
        }

    profile.peak = juce::jlimit (0.0f, 1.0f, peak);

    // Silence is a finding, not a failure: a preset that needs a sustain pedal, or one whose
    // plug-in refused the state, is worth listing rather than dropping.
    if (peak < 1.0e-4f)
    {
        profile.silent = true;
        profile.envelope.insertMultiple (0, 0.0f, sonicEnvelopePoints);
        return profile;
    }

    // ATTACK: to nine-tenths of the peak. Measured from the first sample that leaves the noise
    // floor rather than from sample zero, so a plug-in that reports latency it does not remove
    // is not credited with a slow attack it does not have.
    const auto floorLevel = peak * 0.02f;
    int firstSound = 0;
    while (firstSound < samples && peakAt (audio, firstSound) < floorLevel)
        ++firstSound;

    const auto attackTarget = peak * 0.9f;
    int reached = firstSound;
    while (reached < peakSample && peakAt (audio, reached) < attackTarget)
        ++reached;

    profile.attackSeconds = (float) juce::jmax (0.0, (reached - firstSound) / loud.sampleRate);
    profile.attack = normaliseAttack (profile.attackSeconds);

    // TAIL: from the release to -60 dB of the level the note was holding at. Bounded by the
    // probe, so a pad that outlasts it reports the probe's length — which reads as "at least
    // this long" and is the honest answer rather than a wrong one.
    const auto holdWindow = juce::jmax (1, (int) (0.1 * loud.sampleRate));
    const auto sustained = rmsOf (audio, juce::jmax (0, loud.noteOffSample - holdWindow), holdWindow);
    const auto tailFloor = juce::jmax (1.0e-5f, sustained * 0.001f);

    int quiet60 = samples - 1;
    while (quiet60 > loud.noteOffSample && peakAt (audio, quiet60) < tailFloor)
        --quiet60;

    profile.tailSeconds = (float) juce::jmax (0.0, (quiet60 - loud.noteOffSample) / loud.sampleRate);
    profile.tail = normaliseTail (profile.tailSeconds);

    // WIDTH: how much the two sides disagree. A correlation of 1 is mono however loud it is;
    // fully decorrelated channels read 1. A mono plug-in has no width and says 0 rather than
    // being scored as narrow.
    if (audio.getNumChannels() >= 2)
    {
        double left = 0.0, right = 0.0, cross = 0.0;
        for (int i = 0; i < samples; ++i)
        {
            const auto l = (double) audio.getSample (0, i);
            const auto r = (double) audio.getSample (1, i);
            left += l * l;
            right += r * r;
            cross += l * r;
        }
        const auto denominator = std::sqrt (left * right);
        const auto correlation = denominator > 1.0e-12 ? cross / denominator : 1.0;
        profile.width = juce::jlimit (0.0f, 1.0f, (float) ((1.0 - correlation) * 0.5));
    }

    // COLOUR, from the sustain rather than from the transient.
    if (const auto spectrum = analyseSpectrum (loud, spec); spectrum.valid)
    {
        profile.centroidHz = spectrum.centroidHz;
        profile.brightness = normaliseBrightness (spectrum.centroidHz);
        // Flatness is a ratio that lives in the bottom of its range for anything tonal, so the
        // cube root spreads it across a scale a slider can actually be dragged along.
        profile.noisiness = juce::jlimit (0.0f, 1.0f, std::cbrt (spectrum.flatness));
    }

    // TOUCH: what velocity 40 did against velocity 100, over the same window. Silence at 40 is
    // the maximum answer — that is a sound that needs to be hit.
    if (quiet.audio.getNumSamples() > 0 && quiet.audio.getNumChannels() > 0)
    {
        const auto window = juce::jmin (holdWindow, quiet.audio.getNumSamples());
        const auto loudRms = rmsOf (audio, juce::jmax (0, loud.noteOffSample - window), window);
        const auto quietRms = rmsOf (quiet.audio, juce::jmax (0, quiet.noteOffSample - window), window);
        if (loudRms > 1.0e-6f)
        {
            const auto decibels = juce::Decibels::gainToDecibels (juce::jmax (1.0e-6f, quietRms / loudRms),
                                                                 -60.0f);
            profile.dynamics = juce::jlimit (0.0f, 1.0f, (float) (-decibels / 24.0));
        }
    }

    // COST: how much of one core a real-time render of this would have taken.
    const auto rendered = (double) samples / loud.sampleRate;
    if (rendered > 0.0 && loud.renderSeconds > 0.0)
    {
        profile.costPercent = (float) (100.0 * loud.renderSeconds / rendered);
        profile.cost = normaliseCost (profile.costPercent);
    }

    // THE DRAWING. Peak per bucket, normalised to the loudest — the shape, not the level, is
    // what makes a slow pad recognisable as one at 190 pixels wide.
    profile.envelope.ensureStorageAllocated (sonicEnvelopePoints);
    const auto bucket = juce::jmax (1, samples / sonicEnvelopePoints);
    for (int point = 0; point < sonicEnvelopePoints; ++point)
    {
        const auto start = juce::jmin (samples - 1, point * bucket);
        const auto length = juce::jmin (bucket, samples - start);
        float bucketPeak = 0.0f;
        for (int i = 0; i < length; ++i)
            bucketPeak = juce::jmax (bucketPeak, peakAt (audio, start + i));
        profile.envelope.add (juce::jlimit (0.0f, 1.0f, bucketPeak / peak));
    }

    return profile;
}

} // namespace ceditor::host
