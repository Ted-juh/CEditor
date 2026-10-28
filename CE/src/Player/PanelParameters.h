#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <cmath>

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

    // The folder the DAW lists it in ("DAW group" in the control's inspector), or empty for none.
    juce::String group;
};

/** Read `exportParameters` from a parsed .cepanel. Returns an empty list if absent/malformed. */
inline juce::Array<PanelParameter> parseExportParameters (const juce::var& parsed)
{
    juce::Array<PanelParameter> params;
    juce::StringArray ids;
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
            // The first of two entries with one id wins. Two host parameters with one id is a
            // broken plug-in: the host keys automation and saved state by it, so a project restored
            // one of them and left the other at its default (clap-validator's state tests, on
            // QA-08's two controls named Cutoff). collectExportParameters drops the second as well;
            // this covers panels exported before it did.
            if (ids.contains (p.id))
                continue;
            ids.add (p.id);

            p.label = entry.getProperty ("label", p.id).toString();
            p.min   = static_cast<float> (static_cast<double> (entry.getProperty ("min", 0.0)));
            p.max   = static_cast<float> (static_cast<double> (entry.getProperty ("max", 1.0)));
            if (p.max <= p.min)
                p.max = p.min + 1.0f;
            p.defaultValue = juce::jlimit (p.min, p.max,
                static_cast<float> (static_cast<double> (entry.getProperty ("defaultValue", p.min))));
            p.unit = entry.getProperty ("unit", "").toString();
            p.group = entry.getProperty ("group", "").toString().trim();

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

/** Read `exportParameters` from a .cepanel file. The plug-in parses its panel once and calls the
    overload above; this one is for a caller holding nothing but the path. */
inline juce::Array<PanelParameter> parseExportParameters (const juce::File& panelFile)
{
    if (! panelFile.existsAsFile())
        return {};
    return parseExportParameters (juce::JSON::parse (panelFile.loadFileAsString()));
}

// --- ce.daw: names a script can change, and spare parameters ---------------------------------
//
// A DAW keys automation by a parameter's id and place in the list, so the list is fixed at export.
// What a script may change is a parameter's NAME (ce.daw.rename), and which control a spare
// parameter stands for (ce.daw.assign). Both are read by the host from any thread, so each lives
// behind a lock of its own and is written on the message thread.

/** The part of a parameter that holds a name set after export. */
class NameOverride
{
public:
    virtual ~NameOverride() = default;

    void setNameOverride (const juce::String& name)
    {
        const juce::SpinLock::ScopedLockType lock (nameLock);
        nameOverride = name;
    }

    juce::String nameOverrideOrEmpty() const
    {
        const juce::SpinLock::ScopedLockType lock (nameLock);
        return nameOverride;
    }

protected:
    juce::String nameOr (const juce::String& baked, int maximumLength) const
    {
        auto name = nameOverrideOrEmpty();
        if (name.isEmpty()) name = baked;
        return maximumLength > 0 ? name.substring (0, maximumLength) : name;
    }

private:
    mutable juce::SpinLock nameLock;
    juce::String nameOverride;
};

class RenamableFloat : public juce::AudioParameterFloat, public NameOverride
{
public:
    using juce::AudioParameterFloat::AudioParameterFloat;
    juce::String getName (int maximumLength) const override
    {
        return nameOr (juce::AudioParameterFloat::getName (1024), maximumLength);
    }
};

class RenamableChoice : public juce::AudioParameterChoice, public NameOverride
{
public:
    using juce::AudioParameterChoice::AudioParameterChoice;
    juce::String getName (int maximumLength) const override
    {
        return nameOr (juce::AudioParameterChoice::getName (1024), maximumLength);
    }
};

class RenamableBool : public juce::AudioParameterBool, public NameOverride
{
public:
    using juce::AudioParameterBool::AudioParameterBool;
    juce::String getName (int maximumLength) const override
    {
        return nameOr (juce::AudioParameterBool::getName (1024), maximumLength);
    }
};

/** How a spare parameter shows the control it stands for: the DAW holds 0 to 1, and is shown the
    control's own range and text, so "440 Hz" and not "0.53". */
struct SpareDisplay
{
    bool assigned = false;
    float min = 0.0f, max = 1.0f;
    juce::String unit;
    juce::StringArray choices;   // a list control: its texts, in index order
};

class SpareParameter : public RenamableFloat
{
public:
    SpareParameter (int slotNumber)
        : RenamableFloat (juce::ParameterID { "spare" + juce::String (slotNumber), 1 },
                          "Spare " + juce::String (slotNumber),
                          juce::NormalisableRange<float> (0.0f, 1.0f), 0.0f),
          slot (slotNumber) {}

    const int slot;

    /** Where it is, 0 to 1 (AudioParameterFloat keeps getValue private). */
    float position() const { return static_cast<const juce::AudioProcessorParameter&> (*this).getValue(); }

    void setDisplay (const SpareDisplay& d)
    {
        const juce::SpinLock::ScopedLockType lock (displayLock);
        display = d;
    }

    SpareDisplay getDisplay() const
    {
        const juce::SpinLock::ScopedLockType lock (displayLock);
        return display;
    }

    /** The control's value for a position of 0 to 1, as the control holds it. */
    static float controlValueAt (const SpareDisplay& d, float normalised)
    {
        const auto v = d.min + juce::jlimit (0.0f, 1.0f, normalised) * (d.max - d.min);
        return d.choices.isEmpty() ? v : (float) juce::roundToInt (v);
    }

    juce::String getText (float normalised, int maximumLength) const override
    {
        const auto d = getDisplay();
        juce::String text;
        if (! d.assigned) text = juce::String (normalised, 3);
        else if (! d.choices.isEmpty())
            text = d.choices[juce::jlimit (0, d.choices.size() - 1, juce::roundToInt (controlValueAt (d, normalised)))];
        else
        {
            const auto v = controlValueAt (d, normalised);
            const auto span = std::abs (d.max - d.min);
            const auto decimals = juce::jlimit (0, 6, 4 - (int) std::floor (std::log10 (span > 0 ? span : 1.0f)));
            text = decimals > 0 ? juce::String (v, decimals) : juce::String (juce::roundToInt (v));
            if (d.unit.isNotEmpty()) text << " " << d.unit;
        }
        return maximumLength > 0 ? text.substring (0, maximumLength) : text;
    }

    float getValueForText (const juce::String& text) const override
    {
        const auto d = getDisplay();
        if (! d.assigned) return juce::jlimit (0.0f, 1.0f, text.getFloatValue());
        float v = text.getFloatValue();
        if (! d.choices.isEmpty())
        {
            const auto at = d.choices.indexOf (text.trim(), true);
            if (at >= 0) v = (float) at;
        }
        return d.max > d.min ? juce::jlimit (0.0f, 1.0f, (v - d.min) / (d.max - d.min)) : 0.0f;
    }

private:
    mutable juce::SpinLock displayLock;
    SpareDisplay display;
};

/** "Spare DAW parameters" in the panel's export settings: 0 to 32, absent 0. */
inline int readSpareParameterCount (const juce::var& panelDocument)
{
    const auto settings = panelDocument.getProperty ("exportSettings", juce::var());
    const auto n = settings.getProperty ("spareDawParameters", juce::var());
    if (! (n.isInt() || n.isInt64() || n.isDouble())) return 0;
    return juce::jlimit (0, 32, (int) std::floor ((double) n));
}

/** Set a parameter's name as the DAW shows it; empty goes back to the name baked at export.
    False for a parameter whose name cannot change. */
inline bool renameParameter (juce::AudioProcessorParameter* parameter, const juce::String& name)
{
    if (auto* renamable = dynamic_cast<NameOverride*> (parameter))
    {
        renamable->setNameOverride (name);
        return true;
    }
    return false;
}

/**
 * Build an APVTS parameter layout — an AudioParameterChoice, Bool or Float per entry, each with a
 * name a script can change, then `spareCount` spare parameters, `spare1` onwards, at the end so no
 * parameter moves.
 *
 * Everything downstream keeps reading `getRawParameterValue (id)`, which is why this branch is
 * contained: for a Choice that atomic holds the selected index and for a Bool it holds 0 or 1, so
 * the send loop, the editor bridge and the state save all carry on unchanged. Only what the host
 * SHOWS differs — a named menu instead of a number, a switch instead of a number.
 *
 * Groups ("DAW group" on a control) become folders in the DAW's list. A folder holds a RUN of
 * neighbouring parameters with the same group, so the list keeps its order: two separate runs of
 * one group are two folders of one name, rather than parameters moved to sit together, which would
 * put the automation in a saved project on the wrong knobs in a DAW that keys it by place.
 */
inline std::unique_ptr<juce::RangedAudioParameter> makeParameter (const PanelParameter& p)
{
    if (p.valueKind == "choice")
    {
        // The index is already clamped into [min, max] by the parser, and max is choices-1.
        const auto defaultIndex = juce::jlimit (0, p.choiceLabels.size() - 1,
                                                juce::roundToInt (p.defaultValue));
        return std::make_unique<RenamableChoice> (juce::ParameterID { p.id, 1 }, p.label, p.choiceLabels, defaultIndex);
    }

    if (p.valueKind == "bool")
        return std::make_unique<RenamableBool> (juce::ParameterID { p.id, 1 }, p.label, p.defaultValue >= 0.5f);

    // The text a host shows, and reads back. JUCE's default for a range with no step is seven
    // decimals, finer than a 32-bit value survives: a value read back from its own text printed
    // a different last digit (clap-validator's param-conversions, on QA-08's Kinetic Gravity,
    // -1 to 1). Five significant digits of the range's span is as fine as anybody reads, and
    // survives the trip.
    const auto decimals = juce::jlimit (0, 6, 4 - (int) std::floor (std::log10 (p.max - p.min)));
    return std::make_unique<RenamableFloat> (
        juce::ParameterID { p.id, 1 },
        p.label,
        juce::NormalisableRange<float> (p.min, p.max),
        p.defaultValue,
        juce::AudioParameterFloatAttributes()
            .withLabel (p.unit)
            .withStringFromValueFunction ([decimals] (float value, int maximumLength)
            {
                const auto text = decimals > 0 ? juce::String (value, decimals)
                                               : juce::String (juce::roundToInt (value));
                return maximumLength > 0 ? text.substring (0, maximumLength) : text;
            }));
}

inline juce::AudioProcessorValueTreeState::ParameterLayout buildParameterLayout (const juce::Array<PanelParameter>& params,
                                                                                int spareCount = 0)
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    int runs = 0;
    for (int i = 0; i < params.size();)
    {
        const auto group = params.getReference (i).group;
        if (group.isEmpty())
        {
            layout.add (makeParameter (params.getReference (i)));
            ++i;
            continue;
        }
        auto folder = std::make_unique<juce::AudioProcessorParameterGroup> (
            "group" + juce::String (++runs), group, "|");
        for (; i < params.size() && params.getReference (i).group == group; ++i)
            folder->addChild (makeParameter (params.getReference (i)));
        layout.add (std::move (folder));
    }
    for (int slot = 1; slot <= juce::jlimit (0, 32, spareCount); ++slot)
        layout.add (std::make_unique<SpareParameter> (slot));
    return layout;
}

} // namespace ce
