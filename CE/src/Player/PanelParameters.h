#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

// Milestone 2 — the host-automatable parameter layer.
//
// A panel exposes a FIXED set of parameters so a DAW can automate them and save/restore their
// values with the window closed. The list is authored/derived in the editor
// (web/.../utils/exportParameters.js `collectExportParameters`) and written into the .cepanel as
// `exportParameters`. Here we parse that list and build a juce::AudioProcessorValueTreeState layout
// from it. Keeping the derivation in JS means a single source of truth; the processor just reads
// the baked list.
//
// Each entry: { id, label, path, min, max, defaultValue, unit, midiCC, valueKind }.
//
// WHY valueKind EXISTS. Every parameter used to become an AudioParameterFloat, so a combobox with
// five named options and a two-state toggle both arrived in the host as an anonymous 0..1 number
// with no menu and no on/off. The range cannot be used to tell them apart — a toggle and a plain
// 0..1 knob are both min 0, max 1 — so the editor now says which it is, and buildParameterLayout
// branches on it. A panel exported before this reads as 'float', which is exactly what it had.

namespace ce
{

struct PanelParameter
{
    juce::String id, label, path, unit;
    float min = 0.0f, max = 1.0f, defaultValue = 0.0f;
    int midiCC = -1; // -1 = none

    // 'float' | 'bool' | 'choice' — which juce::AudioParameter* this becomes. Defaults to the old
    // behaviour so a panel baked before the editor emitted this field is unchanged by reading it.
    juce::String valueKind { "float" };

    // The visible option names, in index order, for a 'choice' parameter. This is what the host
    // shows in its parameter menu, so it rides on every selector — including the ones automated by
    // index, which have no choiceValues.
    juce::StringArray choiceLabels;
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

            const auto kind = entry.getProperty ("valueKind", "float").toString();
            p.valueKind = (kind == "bool" || kind == "choice") ? kind : juce::String ("float");

            if (auto* labels = entry.getProperty ("choiceLabels", juce::var()).getArray())
                for (const auto& label : *labels)
                    p.choiceLabels.add (label.toString());

            // A choice needs something to choose between. One label (or none) is not a menu, so it
            // degrades to the float it would have been rather than producing an unusable menu — a
            // host given a one-entry AudioParameterChoice shows a control that cannot move.
            if (p.valueKind == "choice" && p.choiceLabels.size() < 2)
                p.valueKind = "float";

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

/**
 * Build an APVTS parameter layout — an AudioParameterChoice, Bool or Float per entry.
 *
 * Everything downstream keeps reading `getRawParameterValue (id)`, which is why this branch is
 * contained: for a Choice that atomic holds the selected index and for a Bool it holds 0 or 1, so
 * the send loop, the editor bridge and the state save all carry on unchanged. Only what the host
 * SHOWS differs — a named menu instead of a number, a switch instead of a number.
 */
inline juce::AudioProcessorValueTreeState::ParameterLayout buildParameterLayout (const juce::Array<PanelParameter>& params)
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (const auto& p : params)
    {
        if (p.valueKind == "choice")
        {
            // The index is already clamped into [min, max] by the parser, and max is choices-1.
            const auto defaultIndex = juce::jlimit (0, p.choiceLabels.size() - 1,
                                                    juce::roundToInt (p.defaultValue));
            layout.add (std::make_unique<juce::AudioParameterChoice> (
                juce::ParameterID { p.id, 1 }, p.label, p.choiceLabels, defaultIndex));
            continue;
        }

        if (p.valueKind == "bool")
        {
            layout.add (std::make_unique<juce::AudioParameterBool> (
                juce::ParameterID { p.id, 1 }, p.label, p.defaultValue >= 0.5f));
            continue;
        }

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
