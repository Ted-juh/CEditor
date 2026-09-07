// ProbeSynth — a real VST3, built so the auditioner can be pointed at something that is not a
// stub. Three programs whose sounds genuinely differ, a state blob that carries the sound, and
// no editor (nothing here needs a window).
#include <juce_audio_processors/juce_audio_processors.h>
#include <cmath>

class ProbeSynth : public juce::AudioProcessor
{
public:
    ProbeSynth()
        : juce::AudioProcessor (BusesProperties()
                                    .withOutput ("Out", juce::AudioChannelSet::stereo(), true))
    {
        // These defaults are program 0's values, deliberately: see setCurrentProgram.
        addParameter (cutoff  = new juce::AudioParameterFloat ({ "cutoff", 1 }, "Cutoff", 200.0f, 8000.0f, 300.0f));
        addParameter (attack  = new juce::AudioParameterFloat ({ "attack", 1 }, "Attack", 0.001f, 1.5f, 0.004f));
        addParameter (release = new juce::AudioParameterFloat ({ "release", 1 }, "Release", 0.01f, 3.0f, 0.04f));
        addParameter (noise   = new juce::AudioParameterFloat ({ "noise", 1 }, "Noise", 0.0f, 1.0f, 0.0f));
        addParameter (spread  = new juce::AudioParameterFloat ({ "spread", 1 }, "Spread", 0.0f, 1.0f, 0.0f));
        addParameter (touch   = new juce::AudioParameterBool  ({ "touch", 1 }, "Velocity", true));
    }

    void prepareToPlay (double rate, int) override
    {
        sampleRate = rate; phase = 0.0; level = 0.0f; held = false;
        for (auto& stage : lp) stage = 0.0f;
        for (auto& stage : lpR) stage = 0.0f;
    }
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        audio.clear();
        int next = 0;
        for (const auto meta : midi)
        {
            render (audio, next, meta.samplePosition - next);
            next = meta.samplePosition;
            const auto m = meta.getMessage();
            if (m.isNoteOn())
            {
                held = true;
                target = touch->get() ? m.getFloatVelocity() : 1.0f;
                // A synth that ignores which key was pressed is a poor thing to verify a
                // brightness measurement with: its harmonics never move.
                frequency = (float) juce::MidiMessage::getMidiNoteInHertz (m.getNoteNumber());
            }
            if (m.isNoteOff())    held = false;
        }
        render (audio, next, audio.getNumSamples() - next);
    }

    void render (juce::AudioBuffer<float>& audio, int start, int length)
    {
        if (length <= 0) return;
        const auto atk = 1.0f / juce::jmax (1.0f, (float) (attack->get() * sampleRate));
        const auto rel = (float) std::exp (-1.0 / juce::jmax (1.0, release->get() * sampleRate));
        const auto k = (float) (1.0 - std::exp (-juce::MathConstants<double>::twoPi * cutoff->get() / sampleRate));
        const auto delta = juce::MathConstants<double>::twoPi * frequency / sampleRate;

        for (int i = 0; i < length; ++i)
        {
            level = held ? juce::jmin (target, level + atk * target) : level * rel;
            phase += delta;
            if (phase > juce::MathConstants<double>::twoPi) phase -= juce::MathConstants<double>::twoPi;

            // A saw, so there is real harmonic content for a centroid to land on, filtered by
            // a one-pole so "cutoff" genuinely moves the brightness.
            const auto saw = (float) (phase / juce::MathConstants<double>::pi - 1.0);
            const auto src = (1.0f - noise->get()) * saw
                               + noise->get() * (random.nextFloat() * 2.0f - 1.0f);
            // Three poles, 18 dB/oct: enough that the cutoff genuinely decides the colour.
            auto filtered = src;
            for (auto& stage : lp) { stage += k * (filtered - stage); filtered = stage; }

            auto other = filtered;
            if (spread->get() > 0.0f)
            {
                auto n = random.nextFloat() * 2.0f - 1.0f;
                for (auto& stage : lpR) { stage += k * (n - stage); n = stage; }
                other = n;
            }

            audio.setSample (0, start + i, filtered * level * 0.9f);
            if (audio.getNumChannels() > 1)
                audio.setSample (1, start + i,
                                 juce::jmap (spread->get(), filtered, other) * level * 0.9f);
        }
    }

    // Three programs that are three genuinely different sounds.
    int getNumPrograms() override { return 3; }
    int getCurrentProgram() override { return program; }
    // Through a real VST3 wrapper a program change has to NOTIFY: writing a parameter object
    // directly leaves the host's cached value in place, and the host wins the moment it syncs.
    // A program that only half-applies is exactly the sort of thing this instrument exists to
    // not have.
    void setProgramValue (juce::RangedAudioParameter& p, float realValue)
    {
        p.setValueNotifyingHost (p.convertTo0to1 (realValue));
    }

    void setCurrentProgram (int index) override
    {
        program = juce::jlimit (0, 2, index);
        const float presets[3][5] = {
            //  cutoff   attack  release  noise  spread
            {   300.0f,  0.004f,  0.040f,  0.0f,  0.0f },   // Dark Pluck
            {  7500.0f,  0.003f,  0.040f,  0.0f,  0.0f },   // Bright Pluck
            {  1200.0f,  0.600f,  0.900f,  0.0f,  0.9f },   // Wide Slow Pad
        };
        const auto* p = presets[program];
        setProgramValue (*cutoff, p[0]);
        setProgramValue (*attack, p[1]);
        setProgramValue (*release, p[2]);
        setProgramValue (*noise, p[3]);
        setProgramValue (*spread, p[4]);
    }
    const juce::String getProgramName (int index) override
    {
        return index == 0 ? "Dark Pluck" : index == 1 ? "Bright Pluck" : "Wide Slow Pad";
    }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& dest) override
    {
        juce::MemoryOutputStream out (dest, false);
        out.writeInt (program);
        for (auto* p : getParameters())
            out.writeFloat (p->getValue());
    }
    void setStateInformation (const void* data, int size) override
    {
        juce::MemoryInputStream in (data, (size_t) size, false);
        if (size < 4) return;
        program = in.readInt();
        for (auto* p : getParameters())
            if (! in.isExhausted())
                p->setValueNotifyingHost (in.readFloat());
    }

    const juce::String getName() const override                { return "Probe Synth"; }
    bool acceptsMidi() const override                          { return true; }
    bool producesMidi() const override                         { return false; }
    bool isMidiEffect() const override                         { return false; }
    double getTailLengthSeconds() const override               { return 3.0; }
    juce::AudioProcessorEditor* createEditor() override        { return nullptr; }
    bool hasEditor() const override                            { return false; }

private:
    juce::AudioParameterFloat *cutoff, *attack, *release, *noise, *spread;
    juce::AudioParameterBool* touch;
    double sampleRate = 44100.0, phase = 0.0;
    float level = 0.0f, target = 1.0f, frequency = 261.63f;
    float lp[3] {}, lpR[3] {};
    bool held = false;
    int program = 0;
    juce::Random random { 424242 };
};

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new ProbeSynth(); }
