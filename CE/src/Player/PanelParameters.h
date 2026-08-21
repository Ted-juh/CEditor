#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

// Milestone 2 — the host-automatable parameter layer.
//
// A panel exposes a FIXED set of parameters so a DAW can automate them and save/restore their
// values with the window closed. The list is authored/derived in the editor
// (web/.../utils/exportParameters.js `collectExportParameters`) and written into the .cepanel as
// `exportParameters`. Here we parse that list and build a juce::AudioProcessorValueTreeState layout
// from it — one AudioParameterFloat per entry. Keeping the derivation in JS means a single source
// of truth; the processor just reads the baked list.
//
// Each entry: { id, label, path, min, max, defaultValue, unit, midiCC }.

namespace ce
{

struct PanelParameter
{
    juce::String id, label, path, unit;
    float min = 0.0f, max = 1.0f, defaultValue = 0.0f;
    int midiCC = -1; // -1 = none
    // The synth parameter this drives (the control's device binding) — lets the processor send MIDI
    // for automation with the plugin window closed. Empty when the control isn't device-bound.
    juce::String deviceRole, deviceParameterId;

    // OR the raw MIDI message it sends, for a control bound to a CC / aftertouch / NRPN / RPN /
    // program change rather than to a profile parameter. Those automated fine in the DAW and sent
    // NOTHING with the window closed, because the send loop skipped anything with an empty
    // deviceParameterId — silent, and indistinguishable from a cable problem.
    //
    // Not a pre-built byte string: the value is not known until the host moves the parameter, so the
    // bytes are built at send time from these fields (see PluginProcessor::sendParamRawMidi).
    struct MidiControl
    {
        juce::String kind;          // cc | aftertouch | nrpn | rpn | programChange
        int channel = 0;            // 0 = the device's own channel; 1-16 pins it
        int controller = 0;         // cc only
        int parameterMsb = 0, parameterLsb = 0;   // nrpn / rpn only
        int valueResolution = 7;    // 7 or 14, nrpn / rpn only
        bool nullAfterSend = false; // nrpn / rpn only
    };
    bool hasMidiControl = false;
    MidiControl midiControl;
};

/** Read `exportParameters` from a .cepanel file. Returns an empty list if absent/malformed. */
inline juce::Array<PanelParameter> parseExportParameters (const juce::File& panelFile)
{
    juce::Array<PanelParameter> params;
    if (! panelFile.existsAsFile())
        return params;

    const auto parsed = juce::JSON::parse (panelFile.loadFileAsString());
    const auto list = parsed.getProperty ("exportParameters", juce::var());
    if (auto* arr = list.getArray())
    {
        for (const auto& entry : *arr)
        {
            PanelParameter p;
            p.id   = entry.getProperty ("id", "").toString();
            p.path = entry.getProperty ("path", "").toString();
            if (p.id.isEmpty() || p.path.isEmpty())
                continue;

            p.label = entry.getProperty ("label", p.id).toString();
            p.min   = static_cast<float> (static_cast<double> (entry.getProperty ("min", 0.0)));
            p.max   = static_cast<float> (static_cast<double> (entry.getProperty ("max", 1.0)));
            if (p.max <= p.min)
                p.max = p.min + 1.0f;
            p.defaultValue = juce::jlimit (p.min, p.max,
                static_cast<float> (static_cast<double> (entry.getProperty ("defaultValue", p.min))));
            p.unit = entry.getProperty ("unit", "").toString();

            const auto cc = entry.getProperty ("midiCC", juce::var());
            p.midiCC = (cc.isVoid() || cc.isString()) ? -1 : static_cast<int> (cc);

            p.deviceRole = entry.getProperty ("deviceRole", "").toString();
            p.deviceParameterId = entry.getProperty ("deviceParameterId", "").toString();

            // The presence of the object is the flag — exportParameters.js omits it entirely rather
            // than writing an empty one, so a panel exported before this existed reads as "none".
            if (auto* midi = entry.getProperty ("midiControl", juce::var()).getDynamicObject())
            {
                p.hasMidiControl = true;
                p.midiControl.kind = midi->getProperty ("kind").toString();
                p.midiControl.channel = static_cast<int> (midi->getProperty ("channel"));
                p.midiControl.controller = static_cast<int> (midi->getProperty ("controller"));
                p.midiControl.parameterMsb = static_cast<int> (midi->getProperty ("parameterMsb"));
                p.midiControl.parameterLsb = static_cast<int> (midi->getProperty ("parameterLsb"));
                const auto resolution = static_cast<int> (midi->getProperty ("valueResolution"));
                p.midiControl.valueResolution = resolution == 14 ? 14 : 7;
                p.midiControl.nullAfterSend = midi->getProperty ("nullAfterSend").equals (juce::var (true));
            }

            params.add (p);
        }
    }

    return params;
}

/** Build an APVTS parameter layout (one AudioParameterFloat per entry). */
inline juce::AudioProcessorValueTreeState::ParameterLayout buildParameterLayout (const juce::Array<PanelParameter>& params)
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (const auto& p : params)
    {
        layout.add (std::make_unique<juce::AudioParameterFloat> (
            juce::ParameterID { p.id, 1 },
            p.label,
            juce::NormalisableRange<float> (p.min, p.max),
            p.defaultValue,
            juce::AudioParameterFloatAttributes().withLabel (p.unit)));
    }
    return layout;
}

} // namespace ce
