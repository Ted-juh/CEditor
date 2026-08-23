// Unit test for ceditor::parseExportParameters — the exported plugin's automation list.
//
// WHY IT EXISTS NOW. The parameter list carried `deviceParameterId` and nothing else, so the
// processor's window-closed send loop skipped every control bound to a RAW MIDI message: a CC, an
// aftertouch, an NRPN, an RPN, a program change. Those parameters appeared in the DAW, automated,
// and saved with the session — and sent nothing to the synth with the window closed. Silent, and
// indistinguishable from a MIDI cable problem.
//
// exportParameters.js now emits a `midiControl` object for those, and this pins the reading of it:
// the fields the processor's sendParamRawMidi needs, the resolution clamp, and — the part most
// likely to break quietly — that a panel exported BEFORE the field existed still reads as "no raw
// binding" rather than as one with every number zeroed.
//
// This file is also the only thing that compiles PanelParameters.h. The header was reachable solely
// through PluginProcessor.h, which needs WebView2 and cannot be built off Windows, so a typo in it
// would have gone unnoticed everywhere except a Windows plugin build.

#include "Player/PanelParameters.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

/**
 * What juce::AudioParameter* class each entry in a built layout actually is.
 *
 * Asserting on `valueKind` alone would only prove the parser read a string. The thing that matters
 * is what the HOST is handed, so this walks the built layout and reports the concrete type.
 */
juce::StringArray layoutParameterKinds (juce::AudioProcessorValueTreeState::ParameterLayout&& layout)
{
    juce::StringArray kinds;
    // A layout can only be consumed by an APVTS, so stand up a throwaway processor to hold it.
    struct Dummy : juce::AudioProcessor
    {
        explicit Dummy (juce::AudioProcessorValueTreeState::ParameterLayout&& l)
            : state (*this, nullptr, "T", std::move (l)) {}
        juce::AudioProcessorValueTreeState state;
        const juce::String getName() const override { return "T"; }
        void prepareToPlay (double, int) override {}
        void releaseResources() override {}
        void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}
        juce::AudioProcessorEditor* createEditor() override { return nullptr; }
        bool hasEditor() const override { return false; }
        double getTailLengthSeconds() const override { return 0.0; }
        bool acceptsMidi() const override { return false; }
        bool producesMidi() const override { return false; }
        int getNumPrograms() override { return 1; }
        int getCurrentProgram() override { return 0; }
        void setCurrentProgram (int) override {}
        const juce::String getProgramName (int) override { return {}; }
        void changeProgramName (int, const juce::String&) override {}
        void getStateInformation (juce::MemoryBlock&) override {}
        void setStateInformation (const void*, int) override {}
    };

    Dummy dummy (std::move (layout));
    for (auto* p : dummy.getParameters())
    {
        if (dynamic_cast<juce::AudioParameterChoice*> (p) != nullptr)    kinds.add ("choice");
        else if (dynamic_cast<juce::AudioParameterBool*> (p) != nullptr) kinds.add ("bool");
        else if (dynamic_cast<juce::AudioParameterFloat*> (p) != nullptr) kinds.add ("float");
        else kinds.add ("other");
    }
    return kinds;
}

/** Write a panel carrying these exportParameters to a temp file and read it back. */
juce::Array<ce::PanelParameter> roundTrip (const juce::String& entriesJson)
{
    auto file = juce::File::getSpecialLocation (juce::File::tempDirectory)
                    .getChildFile ("ceditor-panel-parameters-test.cepanel");
    file.replaceWithText ("{ \"name\": \"T\", \"exportParameters\": [" + entriesJson + "] }");
    auto params = ce::parseExportParameters (file);
    file.deleteFile();
    return params;
}

const char* kDeviceBound = R"JSON({
  "id": "cutoff.value", "path": "cutoff.value", "label": "Cutoff",
  "min": 0, "max": 127, "defaultValue": 64,
  "deviceRole": "mainSynth", "deviceParameterId": "filter.cutoff"
})JSON";

const char* kRawCc = R"JSON({
  "id": "mod.value", "path": "mod.value", "label": "Mod",
  "min": 0, "max": 127, "defaultValue": 0,
  "deviceRole": "mainSynth", "deviceParameterId": "",
  "midiControl": { "kind": "cc", "channel": 3, "controller": 74, "parameterMsb": 0, "parameterLsb": 0, "valueResolution": 7, "nullAfterSend": false }
})JSON";

const char* kRawNrpn = R"JSON({
  "id": "depth.value", "path": "depth.value", "label": "Depth",
  "min": 0, "max": 16383, "defaultValue": 0,
  "deviceRole": "mainSynth", "deviceParameterId": "",
  "midiControl": { "kind": "nrpn", "channel": 1, "controller": 0, "parameterMsb": 1, "parameterLsb": 32, "valueResolution": 14, "nullAfterSend": true }
})JSON";
}

int main()
{
    std::cout << "PanelParameters tests" << std::endl;

    // A device-bound parameter reads as it always did, and reports NO raw binding — the flag is what
    // the send loop branches on, so a false positive here would send bytes instead of compiling a
    // profile message.
    {
        const auto params = roundTrip (kDeviceBound);
        check (params.size() == 1, "device-bound entry parsed");
        if (params.size() == 1)
        {
            check (params[0].deviceParameterId == "filter.cutoff", "  deviceParameterId carried");
            check (! params[0].hasMidiControl, "  and it reports no raw MIDI binding");
        }
    }

    // A raw CC binding.
    {
        const auto params = roundTrip (kRawCc);
        check (params.size() == 1, "raw CC entry parsed");
        if (params.size() == 1)
        {
            const auto& p = params[0];
            check (p.hasMidiControl, "  reports a raw MIDI binding");
            check (p.deviceParameterId.isEmpty(), "  and no device parameter");
            check (p.midiControl.kind == "cc", "  kind cc");
            check (p.midiControl.channel == 3, "  channel 3");
            check (p.midiControl.controller == 74, "  controller 74");
            check (p.midiControl.valueResolution == 7, "  7-bit");
        }
    }

    // A 14-bit NRPN with a closing null — every field sendParamRawMidi reads.
    {
        const auto params = roundTrip (kRawNrpn);
        check (params.size() == 1, "raw NRPN entry parsed");
        if (params.size() == 1)
        {
            const auto& p = params[0];
            check (p.hasMidiControl, "  reports a raw MIDI binding");
            check (p.midiControl.kind == "nrpn", "  kind nrpn");
            check (p.midiControl.parameterMsb == 1 && p.midiControl.parameterLsb == 32, "  parameter 1:32");
            check (p.midiControl.valueResolution == 14, "  14-bit");
            check (p.midiControl.nullAfterSend, "  nullAfterSend");
        }
    }

    // THE MIGRATION CASE. A panel exported before `midiControl` existed carries no such field, and
    // must read as "no raw binding" rather than as one with every number defaulted to zero — which
    // would be a CC 0 (Bank Select MSB) sent on every automation move of every parameter.
    {
        const auto params = roundTrip (kDeviceBound);
        check (params.size() == 1 && ! params[0].hasMidiControl,
               "an entry with no midiControl is not a raw binding (CC 0 on every move otherwise)");
    }

    // A resolution the emitter should never write is clamped to a legal one rather than trusted.
    {
        const auto params = roundTrip (R"JSON({
          "id": "x", "path": "x", "min": 0, "max": 127,
          "midiControl": { "kind": "cc", "channel": 0, "controller": 1, "valueResolution": 9 }
        })JSON");
        check (params.size() == 1 && params[0].midiControl.valueResolution == 7,
               "an out-of-spec valueResolution falls back to 7");
        check (params.size() == 1 && params[0].midiControl.channel == 0,
               "channel 0 is kept as 'the device's own channel', not forced to 1 here");
    }

    // Several entries, mixed — the real shape of a panel.
    {
        const auto params = roundTrip (juce::String (kDeviceBound) + "," + kRawCc + "," + kRawNrpn);
        check (params.size() == 3, "a mixed panel keeps every entry");
        int raw = 0;
        for (const auto& p : params) if (p.hasMidiControl) ++raw;
        check (raw == 2, "  two of them are raw-MIDI bound");
    }

    // ---------------------------------------------------------------- valueKind
    //
    // The second silent export defect this file pins. Every parameter used to become an
    // AudioParameterFloat, so a combobox with five named options arrived in the host as an
    // anonymous 0..1 number with no menu, and a toggle as a number with no on/off. That looks
    // correct in the editor and is only visible in a DAW.

    {
        const auto params = roundTrip (R"JSON({
          "id": "wave.value", "path": "wave.value", "label": "Waveform",
          "min": 0, "max": 4, "defaultValue": 2, "valueKind": "choice",
          "choiceLabels": ["Saw", "Square", "Triangle", "Sine", "Noise"]
        })JSON");
        check (params.size() == 1 && params[0].valueKind == "choice", "a selector reads as a choice");
        check (params.size() == 1 && params[0].choiceLabels.size() == 5, "  all five option names survive");
        check (params.size() == 1 && params[0].choiceLabels[2] == "Triangle", "  in index order");

        auto kinds = layoutParameterKinds (ce::buildParameterLayout (params));
        check (kinds.size() == 1 && kinds[0] == "choice", "  and becomes an AudioParameterChoice");
    }

    {
        const auto params = roundTrip (R"JSON({
          "id": "sync.value", "path": "sync.value", "label": "Sync",
          "min": 0, "max": 1, "defaultValue": 1, "valueKind": "bool"
        })JSON");
        check (params.size() == 1 && params[0].valueKind == "bool", "a toggle reads as a bool");
        auto kinds = layoutParameterKinds (ce::buildParameterLayout (params));
        check (kinds.size() == 1 && kinds[0] == "bool", "  and becomes an AudioParameterBool");
    }

    // A bool and a plain 0..1 knob have identical ranges, which is exactly why valueKind has to be
    // explicit — this is the pair that made inference impossible.
    {
        const auto params = roundTrip (R"JSON({
          "id": "level.value", "path": "level.value", "label": "Level",
          "min": 0, "max": 1, "defaultValue": 0.5, "valueKind": "float"
        })JSON");
        auto kinds = layoutParameterKinds (ce::buildParameterLayout (params));
        check (kinds.size() == 1 && kinds[0] == "float",
               "a 0..1 knob stays a float even though its range matches a bool's");
    }

    // THE MIGRATION CASE, again. A panel exported before valueKind existed has no such field and
    // must keep the float it already had, not silently change type under a saved session.
    {
        const auto params = roundTrip (kDeviceBound);
        check (params.size() == 1 && params[0].valueKind == "float",
               "an entry with no valueKind is a float, as it was before the field existed");
    }

    // A choice with nothing to choose between is not a menu. A one-entry AudioParameterChoice shows
    // the host a control that cannot move, which is worse than the number it replaced.
    {
        const auto params = roundTrip (R"JSON({
          "id": "only.value", "path": "only.value", "min": 0, "max": 1,
          "valueKind": "choice", "choiceLabels": ["Only"]
        })JSON");
        check (params.size() == 1 && params[0].valueKind == "float",
               "a single-label choice degrades to a float rather than an unusable menu");
    }

    // Garbage in the field is not trusted into the layout.
    {
        const auto params = roundTrip (R"JSON({
          "id": "odd.value", "path": "odd.value", "min": 0, "max": 1, "valueKind": "quaternion"
        })JSON");
        check (params.size() == 1 && params[0].valueKind == "float",
               "an unrecognised valueKind falls back to float");
    }

    if (failures == 0)
    {
        std::cout << "--------------------\nALL PASS" << std::endl;
        return 0;
    }

    std::cout << "--------------------\n" << failures << " FAILED" << std::endl;
    return 1;
}
