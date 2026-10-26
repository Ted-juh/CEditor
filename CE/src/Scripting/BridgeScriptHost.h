#pragma once
//
// BridgeScriptHost — the concrete ScriptHostApi the app installs. It forwards each API call to an
// app-supplied callback, and computes the transmit-by-default (Q2) from the ScriptRuntime's origin
// state. The app wires the callbacks to ValueTreeBridge (values) + DeviceProfileService (MIDI/dumps)
// with the real schemas — keeping the schema knowledge in the app, not guessed here.
//
// Wiring order (see Scripting/README.md):
//   BridgeScriptHost host { callbacks };
//   ScriptRuntime runtime { host };
//   host.attachRuntime (&runtime);   // so setValue can read the transmit default
//
// THREADING: all calls happen on the message thread, inside a dispatch.

#include "ScriptRuntime.h"
#include "ScriptColours.h"
#include <cmath>
#include <map>
#include <set>

namespace ceditor::scripting
{

// Hex text is read a token at a time, and a token is one byte: one or two hex digits, with or
// without 0x. A longer token was read as ONE number and the low byte kept, so "F0411000" went out
// as F0 00 F7 (the WebView runtime clamped it and sent F0 FF F7), and neither said anything. These
// find the token that is not one byte and say so, in the same words as scriptBytes in the WebView
// runtime (panelRuntime.js). Splits on the same separators in every runtime: space, tab, the line
// breaks, form feed, vertical tab and the comma (Lua's %s, and not JavaScript's \s, which would also
// take a no-break space).
inline juce::StringArray hexTextTokens (const juce::String& text)
{
    auto tokens = juce::StringArray::fromTokens (text, " ,\t\r\n\f\v", "");
    tokens.removeEmptyStrings();
    return tokens;
}

/** One hex byte's value, or -1 when the text is not one byte. */
inline int hexTextByte (const juce::String& token)
{
    const auto digits = token.startsWithIgnoreCase ("0x") ? token.substring (2) : token;
    if (digits.isEmpty() || digits.length() > 2 || ! digits.containsOnly ("0123456789abcdefABCDEF")) return -1;
    return digits.getHexValue32();
}

/** The first token of `bytes`' hex text that is not one byte, or empty when it is all bytes (or not
 *  text at all: a list of numbers is never refused here). */
inline juce::String firstTokenNotOneByte (const juce::var& bytes)
{
    if (! bytes.isString()) return {};
    for (const auto& token : hexTextTokens (bytes.toString()))
        if (hexTextByte (token) < 0) return token;
    return {};
}

/** How a refusal shows a value a script passed, in the same words as the WebView runtime's
 *  shownValue and the preludes' __shownValue, whichever engine it came from: "nothing", NaN and
 *  Infinity as JavaScript writes them, a whole number without ".0", text in quotes, "a list". */
inline juce::String shownScriptValue (const juce::var& v)
{
    if (v.isVoid() || v.isUndefined()) return "nothing";
    if (v.isBool()) return static_cast<bool> (v) ? "true" : "false";
    if (v.isInt() || v.isInt64()) return juce::String (static_cast<juce::int64> (v));
    if (v.isDouble())
    {
        const double d = v;
        if (std::isnan (d)) return "NaN";
        if (std::isinf (d)) return d > 0 ? "Infinity" : "-Infinity";
        if (d == std::floor (d) && std::abs (d) < 9007199254740992.0) return juce::String (static_cast<juce::int64> (d));
        return juce::String (d);
    }
    if (v.isString()) return "\"" + v.toString() + "\"";
    if (v.isMethod()) return "a function";
    return "a list";
}

/** Text that is a decimal number, as the WebView runtime's realNumber reads it ("64", " -1.5 ",
 *  "2e3"), into `out`; false for anything else, hex and "inf" included. */
inline bool decimalTextValue (const juce::String& text, double& out)
{
    const auto t = text.trim();
    int i = 0, digits = 0;
    if (t[i] == '+' || t[i] == '-') ++i;
    while (juce::CharacterFunctions::isDigit (t[i])) { ++i; ++digits; }
    if (t[i] == '.') { ++i; while (juce::CharacterFunctions::isDigit (t[i])) { ++i; ++digits; } }
    if (digits == 0) return false;
    if (t[i] == 'e' || t[i] == 'E')
    {
        ++i;
        if (t[i] == '+' || t[i] == '-') ++i;
        if (! juce::CharacterFunctions::isDigit (t[i])) return false;
        while (juce::CharacterFunctions::isDigit (t[i])) ++i;
    }
    if (i != t.length()) return false;
    out = t.getDoubleValue();
    return std::isfinite (out);
}

/** ce.device.setVariable / setTiming's value, as the editor's runtime reads it (deviceWords.js,
 *  deviceOverrideValue): a number, or text that is one, as the nearest whole number from lo to hi.
 *  `refused` is the sentence for a value that is no number, `said` the one for a number not used as
 *  given; test/deviceOverrides.test.js holds the two runtimes to the same words. */
struct DeviceOverrideValue { bool ok = false; int value = 0; juce::String refused, said; };
inline DeviceOverrideValue deviceOverrideValue (const juce::String& label, const juce::String& name,
                                                const juce::var& v, int lo, int hi)
{
    DeviceOverrideValue out;
    const auto call = "ce.device." + label + "(\"" + name + "\", " + shownScriptValue (v) + ")";
    double d = 0.0;
    const bool number = (v.isInt() || v.isInt64() || v.isDouble()) ? std::isfinite (d = static_cast<double> (v))
                                                                   : v.isString() && decimalTextValue (v.toString(), d);
    if (! number)
    {
        out.refused = call + ": " + shownScriptValue (v) + " is not a number, so nothing was changed.";
        return out;
    }
    const auto whole = std::floor (d + 0.5);
    out.ok = true;
    out.value = static_cast<int> (juce::jlimit (static_cast<double> (lo), static_cast<double> (hi), whole));
    if (static_cast<double> (out.value) != whole)
        out.said = call + ": " + shownScriptValue (v) + " is outside " + juce::String (lo) + " to " + juce::String (hi)
                 + ", so " + juce::String (out.value) + " was used.";
    else if (whole != d)
        out.said = call + ": " + shownScriptValue (v) + " is not a whole number, so " + juce::String (out.value) + " was used.";
    return out;
}

/** One item of a script's list of bytes: a whole number from 0 to 255, or text that is one hex
 *  byte. -1 when it is neither. */
inline int scriptListByte (const juce::var& v)
{
    if (v.isInt() || v.isInt64())
    {
        const auto n = static_cast<juce::int64> (v);
        return n >= 0 && n <= 255 ? static_cast<int> (n) : -1;
    }
    if (v.isDouble())
    {
        const double d = v;
        return d >= 0.0 && d <= 255.0 && d == std::floor (d) ? static_cast<int> (d) : -1;
    }
    return v.isString() ? hexTextByte (v.toString()) : -1;
}

/** "sendSysex: "F0411000" is not one byte, so nothing was sent. Put a space between …" */
inline juce::String notOneByteMessage (const juce::String& verb, const juce::String& token, const juce::String& outcome)
{
    auto message = verb + ": \"" + token + "\" is not one byte, so " + outcome + ". ";
    if (token.containsOnly ("0123456789abcdefABCDEF") && token.length() % 2 == 0)
    {
        juce::StringArray pairs;
        for (int i = 0; i < token.length(); i += 2) pairs.add (token.substring (i, i + 2));
        return message + "Put a space between the bytes: \"" + pairs.joinIntoString (" ") + "\".";
    }
    return message + "Each byte is one or two hex digits, with spaces between the bytes: \"F0 41 10 F7\".";
}

class BridgeScriptHost final : public ScriptHostApi
{
public:
    struct Callbacks
    {
        // Values (path = "control.value" style; form = value|normalizedValue|midiValue).
        std::function<juce::var (const juce::String& path, const juce::String& form)> getValue;
        // Why a read that answered nothing found nothing, as the line to write, or empty when the
        // answer is simply nothing (PanelValueModel::whyNoAnswer). Optional: unset, get() of a
        // control that is not there says nothing, which is what it always did.
        std::function<juce::String (const juce::String& path)> whyNoValue;
        // `form` is the value representation the script asked for: "value" (default) or
        // "normalizedValue". The app maps it, because only the app knows the control's range.
        std::function<void (const juce::String& path, const juce::var& value, bool transmit,
                            const juce::String& form)> setValue;
        // What a write stores in the colour properties it reaches, by the editor's rule
        // (ScriptColours.h; PanelValueModel::colourWrites): CSS's short forms written out, and a
        // refusal line for each colour the panel cannot read, in which case nothing is written.
        // `call` begins each line: set("<path as the script wrote it>"). Asked before setValue, for
        // every engine's set(), Lua's self.set and a native handler's set alike. Unset: every value
        // is written as it was given, which is all a host with no panel document can do.
        std::function<colours::Writes (const juce::String& call, const juce::String& path,
                                       const juce::var& value, const juce::String& form)> colourWrites;
        // Whether a path is a colour property, which ce.anim refuses to move (isColourProperty).
        // Unset: nothing is, as before.
        std::function<bool (const juce::String& path)> isColourProperty;
        // Whether a path names a control the panel does not have, which ce.anim refuses to move
        // (namesMissingControl). Unset: none does, as before.
        std::function<bool (const juce::String& path)> namesMissingControl;
        // Whether a write to a path has to be a number: a range control's own value, or a
        // .normalizedValue (PanelValueModel::writeNeedsNumber). Unset: none has, as before.
        std::function<bool (const juce::String& path, const juce::String& form)> writeNeedsNumber;
        // Whether a transmitting write to `path` would reach the synth at all — the path is bound to
        // a device parameter. Only those writes spend the MIDI flood budget. Unset: every
        // transmitting write counts, which is how every set() was counted before this existed.
        std::function<bool (const juce::String& path)> transmitsTo;
        // Device / MIDI.
        std::function<void (int ch, int cc, const juce::var& value)> sendCC;
        std::function<void (int ch, int msb, int lsb, const juce::var& value)> sendNRPN;
        std::function<void (const juce::var& bytes)> sendSysex;
        std::function<void (const juce::var& bytes)> sendMidi;   // raw bytes, no wrapping
        // routeMidi(role, fn) blocks and feedMidi(bytes). Left unset by a host that has neither,
        // in which case the verbs report rather than pretending — see the overrides below.
        std::function<void (const juce::String& role)> beginRoute;
        std::function<void()> endRoute;
        std::function<void (const juce::var& bytes)> feedMidi;
        std::function<void (const juce::String& kind)> requestDump;
        std::function<void (const juce::var& bytes)> applyDump;   // host should run inside an InboundScope
        std::function<void (const juce::String& kind)> sendDump;
        std::function<juce::var (const juce::String& kind)> buildDump;
        // Reads against the device profile — what the synth IS and what parameters it has.
        // Unset means "no device host": the members report that rather than returning a quiet
        // nothing, which is the rule requiresDeviceHost has followed since it was introduced.
        std::function<juce::var (const juce::String& kind, const juce::var& payload)> deviceQuery;
        std::function<juce::var (const juce::String& kind, const juce::var& payload)> panelQuery;
        std::function<bool (const juce::String& parameterId, const juce::var& value,
                            const juce::String& role)> deviceWrite;
        // ce.device.setVariable / setTiming. A write like deviceWrite, not a question like
        // deviceQuery — and it lands on the PROJECT's role mapping rather than the device
        // profile, because a profile is shared and two panels driving two units of the same
        // synth must be able to disagree about a device id without editing it.
        std::function<bool (const juce::String& kind, const juce::String& name,
                            const juce::var& value, const juce::String& role)> deviceSet;
        // The transport snapshot behind tempo() / isPlaying() / transportInfo(). Unset means
        // nothing is reporting one, and the prelude reports valid=false rather than guessing.
        std::function<juce::var()> transportState;
        // ce.ui — unset in the shipped plugin, which has no surface to show anything on.
        std::function<void (const juce::String& message, const juce::var& opts)> uiNotify;
        std::function<void (const juce::String& message)> uiStatus;
        // Flow / debug. runAction and emitEvent are OPTIONAL: left unset, they fall through to the
        // ScriptRuntime, which resolves them against the loaded script set. That is the right
        // default — cross-script calls need the script set, not app state — so only override them
        // if the app has actions of its own to expose.
        std::function<juce::var (const juce::String& target, const juce::var& args)> runAction;
        std::function<void (const juce::String& name, const juce::var& data)> emitEvent;
        std::function<void (const juce::String& message, const juce::var& value)> log;
        // Timers.
        std::function<void (const juce::String& id, int intervalMs)> startTimer;
        std::function<void (const juce::String& id)> stopTimer;
        // Settings that outlive the session (ce.storage). Optional: unset means the panel simply
        // has nowhere to persist, and loadSetting always returns the fallback.
        // `store` is "panel" or "local" — see ScriptHostApi. A host that only has one of them
        // ignores the argument, and settingsAvailable reports which is real.
        std::function<void (const juce::String& key, const juce::var& value, const juce::String& store)> saveSetting;
        std::function<juce::var (const juce::String& key, const juce::String& store)> loadSetting;
        // The other two thirds of the interface. Without these, ce.storage.settings() and .forget()
        // are dead in the player — and so are all(), clear() and info(), which are listSettings on
        // top of loadSetting.
        std::function<juce::var (const juce::String& store)> listSettings;
        std::function<bool (const juce::String& key, const juce::String& store)> forgetSetting;
        // Optional: unset means "whatever saveSetting being wired implies", which is right for a
        // host with one store. A host with a panel store but no machine-local one sets this.
        std::function<bool (const juce::String& store)> settingsAvailable;
    };

    explicit BridgeScriptHost (Callbacks cb) : callbacks (std::move (cb)) {}

    void attachRuntime (ScriptRuntime* r) { runtime = r; }

    // The script currently running — exposed so callbacks can resolve scope-relative paths if needed.
    const ScriptContext& currentScript() const { return context; }

    /** Split a trailing value accessor off a path. The accessor may be a SUFFIX
        ("cutoff.normalizedValue") or an explicit `form` ARGUMENT — both spellings are documented,
        and an explicit argument wins. `.value` is left on the path: it is the shorthand that
        already resolves to the value, so stripping it would leave nothing to resolve. */
    static std::pair<juce::String, juce::String> splitAccessor (const juce::String& path,
                                                                const juce::String& explicitForm)
    {
        const auto form = formWord (explicitForm);
        const bool explicitIsDerived = form == "normalizedValue" || form == "midiValue";
        const auto tail = path.containsChar ('.') ? formWord (path.fromLastOccurrenceOf (".", false, false)) : juce::String();
        if (tail == "normalizedValue" || tail == "midiValue")
            return { path.upToLastOccurrenceOf (".", false, false), explicitIsDerived ? form : tail };
        return { path, explicitIsDerived ? form : juce::String ("value") };
    }

    /** A form in any case and with spaces around it, as it is spelled, or empty: "NormalizedValue"
        is normalizedValue, as the WebView's formWord reads it. "normalised" is still not a form. */
    static juce::String formWord (const juce::String& text)
    {
        const auto written = text.trim();
        for (const auto* form : { "value", "normalizedValue", "midiValue" })
            if (written.equalsIgnoreCase (form)) return form;
        return {};
    }

    /** The form `text` is another way of writing (other capitals, the label's leading dot, or
        "normalised"/"normalise"/"normalize" for "normalized"), or empty. Mirrors formMeant in
        panelRuntime.js, regular expression and all: the first normali[sz]e?d? becomes normalized. */
    static juce::String formMeant (const juce::String& text)
    {
        auto canonical = text.trim().toLowerCase();
        if (canonical.startsWithChar ('.')) canonical = canonical.substring (1);
        const int s = canonical.indexOf ("normalis"), z = canonical.indexOf ("normaliz");
        if (const int at = (s < 0 || (z >= 0 && z < s)) ? z : s; at >= 0)
        {
            int end = at + 8;
            if (end < canonical.length() && canonical[end] == 'e') ++end;
            if (end < canonical.length() && canonical[end] == 'd') ++end;
            canonical = canonical.substring (0, at) + "normalized" + canonical.substring (end);
        }
        for (const char* form : { "value", "normalizedValue", "midiValue" })
            if (canonical == juce::String (form).toLowerCase()) return form;
        return {};
    }

    /** The console's line refusing an explicit `form` that is not one of a value's three, or empty
        when it is one or none was given. A form that was not one used to be dropped here without a
        word, so get("cutoff", "normalisedValue") answered the raw value and set("cutoff", 0.5,
        "normalisedValue") wrote 0.5 into a 0..200 control. The WebView runtime refuses the same
        calls in the same words (formRefusal in panelRuntime.js; scriptGetReports.test.js). */
    static juce::String formRefusal (const juce::String& call, const juce::String& outcome, const juce::String& form)
    {
        if (form.isEmpty() || formWord (form).isNotEmpty()) return {};
        const auto meant = formMeant (form);
        return call + ": \"" + form + "\" is not a value form, so " + outcome
             + ". The forms are value, normalizedValue and midiValue." + (meant.isNotEmpty() ? " Write " + meant + "." : juce::String());
    }

    /** Does this path write a read-only property of the panel document? Mirrors
        PANEL_READONLY_PROPERTIES in panelApi.js — panelApiParity.test.js checks the two agree. */
    static bool isPanelReadOnlyPath (const juce::String& path)
    {
        if (! path.upToFirstOccurrenceOf (".", false, false).equalsIgnoreCase ("panel")) return false;
        const auto property = path.fromFirstOccurrenceOf (".", false, false)
                                  .upToFirstOccurrenceOf (".", false, false);
        static const char* readOnly[] = { "id", "panelGuid", "scriptId", "filePath", "controls", "scripts" };
        for (auto* r : readOnly) if (property.equalsIgnoreCase (r)) return true;
        return false;
    }

    // -- ScriptHostApi --
    void enterScript (const ScriptContext& c) override { context = c; }
    void exitScript() override { context = {}; }
    void beginTransmitOverride (bool transmit) override { if (runtime) runtime->pushTransmit (transmit); }
    void endTransmitOverride() override { if (runtime) runtime->popTransmit(); }

    juce::var getValue (const juce::String& path, const juce::String& form) override
    {
        if (const auto refusal = formRefusal ("get(\"" + path + "\")", "there is no answer", form); refusal.isNotEmpty())
        {
            logAt ("error", refusal, juce::var());
            return {};
        }
        const auto addressed = splitAccessor (path, form);
        if (addressed.second == "midiValue")
        {
            reportNeedsDeviceHost ("get(.midiValue)", addressed.first);
            return {};
        }
        return callbacks.getValue ? callbacks.getValue (addressed.first, addressed.second) : juce::var();
    }

    // set() reports a control it cannot find; get() returned nothing, the same nothing an unset value
    // is. The app says why (PanelValueModel::whyNoAnswer), in the editor's words, of the path with
    // its accessor taken off, as getValue hands it over. .midiValue has its own message already.
    juce::String whyNoValue (const juce::String& path, const juce::String& form) override
    {
        // A form that is not one has been refused by getValue, in words of its own.
        if (formRefusal ({}, {}, form).isNotEmpty()) return {};
        const auto addressed = splitAccessor (path, form);
        if (addressed.second == "midiValue" || ! callbacks.whyNoValue) return {};
        return callbacks.whyNoValue (addressed.first);
    }

    // The third argument is set()'s options table, or, as text, the value form, as the WebView
    // runtime reads it: set("cutoff", 0.5, "normalizedValue") is the form-argument spelling of
    // set("cutoff.normalizedValue", 0.5). Text was dropped here, so that spelling wrote 0.5 as it was.
    void setValue (const juce::String& path, const juce::var& value, const juce::var& options) override
    {
        // A value left out is refused, where it was written as nothing: set("Cutoff.value") cleared
        // the knob's value. The editor's set() says the same (scriptSet in panelRuntime.js). A colour
        // property says it in its own words, with the forms a colour takes (colourWrites, below).
        if ((value.isVoid() || value.isUndefined())
            && ! (callbacks.isColourProperty
                  && callbacks.isColourProperty (splitAccessor (path, options.isString() ? options.toString() : juce::String()).first)))
        {
            logAt ("error", "set(\"" + path + "\"): no value was given, so nothing was set.", juce::var());
            return;
        }
        const auto form = options.isString() ? options.toString() : juce::String();
        if (const auto refusal = formRefusal ("set(\"" + path + "\")", "nothing was set", form); refusal.isNotEmpty())
        {
            logAt ("error", refusal, juce::var());
            return;
        }
        const auto addressed = splitAccessor (path, form);
        if (addressed.second == "midiValue")
        {
            reportNeedsDeviceHost ("set(.midiValue)", addressed.first);
            return;
        }
        // `panel` is a reserved first segment addressing the document; a few of its properties are
        // its identity or its structure and writing them would detach the document from itself.
        // The refusal is REPORTED here rather than swallowed by the value model, because the web
        // runtime explains it and a script must get the same answer from both.
        if (isPanelReadOnlyPath (addressed.first))
        {
            const auto property = addressed.first.fromFirstOccurrenceOf (".", false, false);
            if (callbacks.log)
                callbacks.log ("set(\"panel." + property + "\", …) is read-only — it is the panel's identity or its "
                               "structure, and writing it would detach the document from itself.", juce::var());
            return;
        }

        // A colour the panel cannot read used to be stored as written: "red", "#000", a number, a
        // name ce.anim had swept into a number. Read as the editor's set() reads it, after any
        // intercept() filter has answered (the engines run those first) and before anything is
        // written or sent: the short forms are written out, and what has no one reading is refused,
        // a line for each colour, in the editor's sentence, with nothing written.
        juce::var toWrite = value;
        if (callbacks.colourWrites)
        {
            const auto read = callbacks.colourWrites ("set(\"" + path + "\")", addressed.first, value, addressed.second);
            if (read.refused)
            {
                for (const auto& line : read.lines) logAt ("error", line, juce::var());
                return;
            }
            toWrite = read.value;
        }

        // A range control's value and a .normalizedValue are numbers: text that is one is read as
        // one, and anything else is refused, where "x" was written as given. One bound to a device
        // parameter is the binding's to read. The editor's set() says the same (setNumber in
        // panelRuntime.js).
        if (callbacks.writeNeedsNumber && callbacks.writeNeedsNumber (addressed.first, addressed.second))
        {
            double d = 0.0;
            const bool number = (toWrite.isInt() || toWrite.isInt64() || toWrite.isDouble())
                                    ? std::isfinite (d = static_cast<double> (toWrite))
                                    : toWrite.isString() && decimalTextValue (toWrite.toString(), d);
            if (! number)
            {
                logAt ("error", "set(\"" + path + "\"): " + shownScriptValue (toWrite) + " is not a number, so nothing was set.",
                       juce::var());
                return;
            }
            // Stored as a whole number where it is one, as a script's own 100 is, so a Lua get() reads
            // 100 back and not 100.0.
            if (toWrite.isString())
                toWrite = (d == std::floor (d) && std::abs (d) < 9007199254740992.0) ? juce::var (static_cast<juce::int64> (d))
                                                                                     : juce::var (d);
        }

        bool transmit = runtime ? runtime->defaultTransmit() : true;
        if (auto* o = options.getDynamicObject())
            if (o->hasProperty ("transmit")) transmit = (bool) o->getProperty ("transmit");
        // Under a MIDI flood the value still applies locally — only the synth send is dropped. A write
        // that could never send (a label's text, a colour, a tooltip) spends nothing: the GAIA's
        // preset list paints ~1,500 of those on load, which counted as 1,500 MIDI sends, tripped the
        // guard, and silently dropped the MIDI of any BOUND control set in the rest of that second.
        const bool wouldSend = ! callbacks.transmitsTo || callbacks.transmitsTo (addressed.first);
        if (transmit && wouldSend && ! midiSendAllowed())
            transmit = false;
        if (callbacks.setValue) callbacks.setValue (addressed.first, toWrite, transmit, addressed.second);
    }

    // The Lua, JavaScript and Python preludes check a CC's numbers before they get here (__midiArg);
    // a native handler's sendCC does not pass through a prelude, so the same check is made here, in
    // the same words: an address outside its range, or a value that is not a number, is refused,
    // and a value is rounded half up and clamped. A script's call arrives already checked.
    void sendCC (int ch, int cc, const juce::var& v) override
    {
        juce::var value;
        if (! midiAddress ("sendCC", ch, 1, 16, "a channel", "A channel is a whole number from 1 to 16.")
            || ! midiAddress ("sendCC", cc, 0, 127, "a controller number", "A controller number is a whole number from 0 to 127.")
            || ! midiValue ("sendCC", v, 127, "A value is a number from 0 to 127.", value))
            return;
        if (callbacks.sendCC && midiSendAllowed()) callbacks.sendCC (ch, cc, value);
    }
    void sendNRPN (int ch, int msb, int lsb, const juce::var& v) override
    {
        juce::var value;
        if (! midiAddress ("sendNRPN", ch, 1, 16, "a channel", "A channel is a whole number from 1 to 16.")
            || ! midiAddress ("sendNRPN", msb, 0, 127, "an MSB", "An MSB is a whole number from 0 to 127.")
            || ! midiAddress ("sendNRPN", lsb, 0, 127, "an LSB", "An LSB is a whole number from 0 to 127.")
            || ! midiValue ("sendNRPN", v, 16383, "A value is a number from 0 to 16383.", value))
            return;
        if (callbacks.sendNRPN && midiSendAllowed()) callbacks.sendNRPN (ch, msb, lsb, value);
    }
    void sendSysex (const juce::var& bytes) override
    {
        auto message = bytes;
        if (! bytesFromScript ("sendSysex", "nothing was sent", message) || ! hasBytes ("sendSysex", message)) return;
        if (callbacks.sendSysex && midiSendAllowed()) callbacks.sendSysex (message);
    }
    void sendMidi (const juce::var& bytes) override
    {
        auto message = bytes;
        if (! bytesFromScript ("sendMidi", "nothing was sent", message) || ! hasBytes ("sendMidi", message)) return;
        if (callbacks.sendMidi && midiSendAllowed()) callbacks.sendMidi (message);
    }
    // routeMidi / feedMidi. A host that wires neither gets the honest failure rather than the quiet
    // one: the block still RUNS (its sends go to the default device, which is what they did before
    // routing existed), and feedMidi says it could not. Silence here is exactly the defect the
    // window-closed audit kept finding — an API that reads as working and does nothing.
    void beginRouteOverride (const juce::String& role) override
    {
        if (callbacks.beginRoute) { callbacks.beginRoute (role); routeWired = true; return; }
        routeWired = false;
        logAt ("warn", "routeMidi(\"" + role + "\"): this host has no MIDI routing, so the block's sends "
                       "go to the default device.", juce::var());
    }
    void endRouteOverride() override { if (routeWired && callbacks.endRoute) callbacks.endRoute(); }

    void feedMidi (const juce::var& bytes) override
    {
        auto message = bytes;
        if (! bytesFromScript ("feedMidi", "nothing was fed", message) || ! hasBytes ("feedMidi", message)) return;
        if (callbacks.feedMidi) { callbacks.feedMidi (message); return; }
        logAt ("error", "feedMidi(): this host has no MIDI input to inject into — nothing was fed.", juce::var());
    }
    // A layout the SCRIPT declared carries its own request bytes, so asking for it is a raw send
    // and needs no profile at all — which is the case defineDump exists for. Checked BEFORE the
    // host callback, so a declaration can also stand in for a profile request the host gets wrong.
    void requestDump (const juce::String& kind) override
    {
        if (runtime != nullptr && runtime->hasDeviceDump (defaultDeviceRole, kind))
        {
            const auto bytes = runtime->deviceDumpRequest (defaultDeviceRole, kind);
            if (auto* arr = bytes.getArray(); arr != nullptr && ! arr->isEmpty())
            {
                sendMidi (bytes);
                return;
            }
            logAt ("error", "requestDump(\"" + kind + "\"): the declared layout has no request bytes, so there "
                            "is nothing to send. Add `request` to defineDump, or wait for the synth to send it "
                            "unasked.", juce::var());
            return;
        }
        if (unknownDumpKind ("requestDump", kind, true)) return;
        if (callbacks.requestDump) callbacks.requestDump (kind);
    }
    void applyDump (const juce::var& bytes) override
    {
        auto dump = bytes;
        // A decoded { parameter: value } map is not bytes, and goes to the callback as it is.
        const bool decodedMap = dump.getDynamicObject() != nullptr && ! dump.isArray();
        if (! decodedMap && ! bytesFromScript ("applyDump", "nothing was decoded", dump)) return;
        if (callbacks.applyDump) callbacks.applyDump (dump);
    }
    void sendDump (const juce::String& kind) override
    {
        if (runtime == nullptr || ! runtime->hasDeviceDump (defaultDeviceRole, kind))
            if (unknownDumpKind ("sendDump", kind, false)) return;
        if (callbacks.sendDump) callbacks.sendDump (kind);
    }
    // A kind the main synth's profile has no dump by (nor, for requestDump, request) went to the
    // service, which refused it where no script could see. Refused here, in the editor's words
    // (deviceWords.js, dumpKindUnknownWords), while the profile's document is there to say so: the
    // host's "dumps" query is void when there is none.
    bool unknownDumpKind (const juce::String& verb, const juce::String& kind, bool requests,
                          const juce::String& outcome = "nothing was sent")
    {
        if (kind.isEmpty() || ! callbacks.deviceQuery) return false;
        auto* q = new juce::DynamicObject();
        q->setProperty ("role", defaultDeviceRole);
        const juce::var payload (q);
        const auto dumpList = callbacks.deviceQuery ("dumps", payload);
        auto* dumps = dumpList.getArray();
        if (dumps == nullptr) return false;
        juce::StringArray ids;
        for (const auto& id : *dumps) ids.add (id.toString());
        if (ids.contains (kind)) return false;
        if (requests)
        {
            const auto requestList = callbacks.deviceQuery ("requests", payload);
            if (auto* known = requestList.getArray())
                for (const auto& id : *known)
                    if (id.toString() == kind) return false;
        }
        logAt ("error", verb + "(\"" + kind + "\"): the " + defaultDeviceRole + " profile has no dump called \"" + kind
                        + "\", so " + outcome + "." + (ids.isEmpty() ? juce::String (" It defines none.")
                                                                      : " One of: " + ids.joinIntoString (", ") + "."),
               juce::var());
        return true;
    }
    juce::var buildDump (const juce::String& kind) override
    {
        if (runtime == nullptr || ! runtime->hasDeviceDump (defaultDeviceRole, kind))
            if (unknownDumpKind ("buildDump", kind, false, "nothing was built")) return {};
        return callbacks.buildDump ? callbacks.buildDump (kind) : juce::var();
    }

    /**
     * The reads, with the script's own declarations folded in.
     *
     * The merge lives here rather than in each prelude for the reason the preludes exist at all:
     * three copies of "profile first, declarations last" is three chances for one engine to answer
     * a different question. Declarations come LAST so a declared id overrides a profile one, which
     * is what lets a script correct a single wrong parameter without redeclaring the rest.
     */
    juce::var deviceQuery (const juce::String& kind, const juce::var& payload) override
    {
        const auto fromHost = callbacks.deviceQuery ? callbacks.deviceQuery (kind, payload) : juce::var();
        if (runtime == nullptr || (kind != "parameters" && kind != "parameter")) return fromHost;

        auto* p = payload.getDynamicObject();
        auto role = p != nullptr ? p->getProperty ("role").toString() : juce::String();
        if (role.isEmpty()) role = defaultDeviceRole;

        if (kind == "parameter")
        {
            const auto id = p != nullptr ? p->getProperty ("id").toString() : juce::String();
            const auto declared = runtime->declaredDeviceParameter (role, id);
            return declared.isVoid() ? fromHost : declared;
        }

        const auto declared = runtime->declaredDeviceParameters (role);
        auto* declaredArr = declared.getArray();
        if (declaredArr == nullptr || declaredArr->isEmpty()) return fromHost;

        juce::Array<juce::var> merged;
        if (auto* hostArr = fromHost.getArray())
            for (const auto& item : *hostArr)
            {
                bool overridden = false;
                if (auto* o = item.getDynamicObject())
                    for (const auto& d : *declaredArr)
                        if (auto* dObj = d.getDynamicObject())
                            if (dObj->getProperty ("id").toString() == o->getProperty ("id").toString())
                            { overridden = true; break; }
                if (! overridden) merged.add (item);
            }
        merged.addArray (*declaredArr);
        return juce::var (merged);
    }

    /** The role rides INSIDE the spec, the way it rides inside deviceQuery's payload — so adding a
        role did not add a fourth argument to an ABI slot every engine has to match. */
    bool deviceDefine (const juce::String& what, const juce::String& id, const juce::var& spec) override
    {
        if (runtime == nullptr) return false;
        juce::String role = defaultDeviceRole;
        if (auto* o = spec.getDynamicObject())
            if (o->getProperty ("role").toString().isNotEmpty()) role = o->getProperty ("role").toString();
        if (what == "parameter") return runtime->defineDeviceParameter (role, id, spec);
        if (what == "dump")      return runtime->defineDeviceDump (role, id, spec);
        return false;
    }

    juce::var panelQuery (const juce::String& kind, const juce::var& payload) override
    { return callbacks.panelQuery ? callbacks.panelQuery (kind, payload) : juce::var(); }

    /** A parameter the SCRIPT declared carries its own wire format, so it is compiled here and sent
        as raw bytes. That is the whole reason defineParameter exists: this path needs no profile,
        and so it works on a synth the app has never heard of. */
    bool deviceWrite (const juce::String& parameterId, const juce::var& value,
                      const juce::String& role) override
    {
        if (runtime != nullptr)
        {
            const auto& r = role.isEmpty() ? defaultDeviceRole : role;
            const auto bytes = runtime->encodeDeviceParameter (r, parameterId, value);
            if (auto* arr = bytes.getArray(); arr != nullptr && ! arr->isEmpty())
            {
                sendMidi (bytes);
                return true;
            }
            // A parameter the script declared, whose write the runtime refused (and said why), is
            // finished here. Falling through handed the same id to the device profile, which sent
            // whatever its own parameter of that name means, or nothing.
            if (runtime->hasDeviceParameter (r, parameterId)) return false;
        }
        return callbacks.deviceWrite && callbacks.deviceWrite (parameterId, value, role);
    }
    // Unset means no device host, and the base returns false for exactly that reason: the verb
    // reports that it did nothing rather than returning a quiet success. Same shape as
    // deviceWrite's tail above.
    bool deviceSet (const juce::String& kind, const juce::String& name,
                    const juce::var& value, const juce::String& role) override
    { return callbacks.deviceSet && callbacks.deviceSet (kind, name, value, role); }
    juce::var transportState() override
    { return callbacks.transportState ? callbacks.transportState() : juce::var(); }
    // ce.anim routes to the runtime, never to a callback: the animation list has to live in ONE
    // place or two hosts would each run their own copy of the same sweep.
    bool startAnimation (const juce::String& kind, const juce::var& path,
                         double target, const juce::var& opts) override
    { return runtime && runtime->startAnimation (kind, path, target, opts); }
    void stopAnimation (const juce::String& path) override
    { if (runtime) runtime->stopAnimation (path); }
    bool isColourProperty (const juce::String& path) override
    { return callbacks.isColourProperty && callbacks.isColourProperty (path); }
    bool namesMissingControl (const juce::String& path) override
    { return callbacks.namesMissingControl && callbacks.namesMissingControl (path); }
    bool animationRunning (const juce::String& path) override
    { return runtime && runtime->animationRunning (path); }
    juce::var animationValue (const juce::String& path) override
    { return runtime ? runtime->animationValue (path) : juce::var(); }
    juce::var animationList() override
    { return runtime ? runtime->animationList() : juce::var(); }
    bool animationPause (const juce::String& path) override
    { return runtime && runtime->animationPause (path); }
    bool animationResume (const juce::String& path) override
    { return runtime && runtime->animationResume (path); }
    bool animationReverse (const juce::String& path) override
    { return runtime && runtime->animationReverse (path); }
    bool animationFinish (const juce::String& path) override
    { return runtime && runtime->animationFinish (path); }
    // ce.ui is panel-view only; a host with a surface supplies these, the shipped plugin does not.
    void uiNotify (const juce::String& message, const juce::var& opts) override
    { if (callbacks.uiNotify) callbacks.uiNotify (message, opts); }
    void uiStatus (const juce::String& message) override
    { if (callbacks.uiStatus) callbacks.uiStatus (message); }
    juce::var runAction (const juce::String& target, const juce::var& args) override
    {
        if (callbacks.runAction) return callbacks.runAction (target, args);
        return runtime ? runtime->runAction (target, args) : juce::var();
    }

    void emitEvent (const juce::String& name, const juce::var& data) override
    {
        if (callbacks.emitEvent) { callbacks.emitEvent (name, data); return; }
        // A custom event is just an event: it reaches on(name, …) listeners and any script whose
        // handler is named for it. dispatchEvent carries the loop backstop.
        if (runtime) runtime->dispatchEvent (name, juce::String(), data);
    }
    void log (const juce::String& message, const juce::var& value) override { if (callbacks.log) callbacks.log (message, value); }
    void startTimer (const juce::String& id, int intervalMs) override { if (callbacks.startTimer) callbacks.startTimer (id, intervalMs); }
    void stopTimer  (const juce::String& id) override { if (callbacks.stopTimer) callbacks.stopTimer (id); }
    void saveSetting (const juce::String& key, const juce::var& value,
                      const juce::String& store) override
    { if (callbacks.saveSetting) callbacks.saveSetting (key, value, store); }
    juce::var loadSetting (const juce::String& key, const juce::String& store) override
    { return callbacks.loadSetting ? callbacks.loadSetting (key, store) : juce::var(); }
    juce::var listSettings (const juce::String& store) override
    {
        if (callbacks.listSettings) return callbacks.listSettings (store);
        return juce::var (juce::Array<juce::var>());
    }
    bool forgetSetting (const juce::String& key, const juce::String& store) override
    { return callbacks.forgetSetting ? callbacks.forgetSetting (key, store) : false; }
    bool settingsAvailable (const juce::String& store) override
    {
        if (callbacks.settingsAvailable) return callbacks.settingsAvailable (store);
        return callbacks.saveSetting != nullptr;
    }

private:
    // The role every device verb means when a script does not name one. Matches DEFAULT_DEVICE_ROLE
    // in the web runtime; panelApiParity keeps the spelling honest.
    static constexpr const char* defaultDeviceRole = "mainSynth";

    // Whether the host actually wired routing, so endRouteOverride does not unbalance a host
    // that never began one.
    bool routeWired = false;
    std::set<juce::String> edgeWarned;   // the commands that have said a value was past its end

    // Scope (Q7) is NOT enforced here, and that is a decision rather than an omission. The
    // Device/MIDI verbs used to declare device/panel/project scope; enforcing that list denied a
    // COMPONENT script — a per-control script — the ability to send a CC, which is the ordinary
    // thing a panel control does. The list was aspirational, so panelApi.js now declares those
    // verbs 'any' and the only genuinely scoped members left are the panel-component verbs, which
    // need a component to exist. Those are webview-only: the C++ engines define them as stubs that
    // explain themselves, which is the enforcement. scriptValidate flags the misuse at edit time.

    // A script's bytes as the app's callbacks take them. Every engine's sendSysex, sendMidi, feedMidi
    // and applyDump comes through here, so this is the one place the player reads a script's hex
    // text: refused when a token is not one byte (see firstTokenNotOneByte above), in the WebView
    // runtime's words, and otherwise turned into the list of numbers the callback is handed. The
    // app's callbacks never parse text of their own, so they cannot split it differently. Text was
    // the editor's alone until now for every verb but sendSysex: the player's sendMidi took a list
    // and dropped text without a word.
    //
    // A list is read here too, by the same rule as the WebView runtime's scriptBytes: each item a
    // whole number from 0 to 255, or text that is one hex byte. The callbacks clamped what they were
    // handed, so 300 went out as FF, a System Reset in the middle of a SysEx, and "41" was read as
    // decimal. An object is read as its values, the way the editor reads a Lua table, which is also
    // what QuickJS makes of a Uint8Array; it used to be "no bytes given". Nothing given becomes the
    // empty list, for hasBytes to report.
    bool bytesFromScript (const juce::String& verb, const juce::String& outcome, juce::var& bytes)
    {
        juce::Array<juce::var> list;
        if (bytes.isVoid() || bytes.isUndefined()) { bytes = juce::var (list); return true; }
        if (bytes.isString())
        {
            if (const auto token = firstTokenNotOneByte (bytes); token.isNotEmpty())
            {
                logAt ("error", notOneByteMessage (verb, token, outcome), juce::var());
                return false;
            }
            for (const auto& token : hexTextTokens (bytes.toString()))
                list.add (hexTextByte (token));
            bytes = juce::var (list);
            return true;
        }
        juce::Array<juce::var> items;
        if (auto* array = bytes.getArray()) items = *array;
        else if (auto* object = bytes.getDynamicObject())
            for (const auto& property : object->getProperties()) items.add (property.value);
        else
        {
            logAt ("error", verb + ": " + shownScriptValue (bytes) + " is not a list of bytes, so " + outcome + ".", juce::var());
            return false;
        }
        for (int i = 0; i < items.size(); ++i)
        {
            const int b = scriptListByte (items.getReference (i));
            if (b < 0)
            {
                logAt ("error", verb + ": " + shownScriptValue (items.getReference (i)) + " at position " + juce::String (i)
                                    + " is not a byte, so " + outcome
                                    + ". A byte is a whole number from 0 to 255, or one or two hex digits such as \"F7\".",
                       juce::var());
                return false;
            }
            list.add (b);
        }
        bytes = juce::var (list);
        return true;
    }

    bool midiAddress (const juce::String& verb, int v, int lo, int hi, const char* aNoun, const char* hint)
    {
        if (v >= lo && v <= hi) return true;
        logAt ("error", verb + ": " + juce::String (v) + " is not " + aNoun + ", so nothing was sent. " + hint, juce::var());
        return false;
    }
    bool midiValue (const juce::String& verb, const juce::var& v, int hi, const char* hint, juce::var& out)
    {
        if (v.isVoid() || v.isUndefined())
        {
            logAt ("error", verb + ": no value given, so nothing was sent.", juce::var());
            return false;
        }
        double d = 0.0;   // text that is a number ("64") is read as one, as the preludes read it
        const bool number = (v.isInt() || v.isInt64() || v.isDouble()) ? std::isfinite (d = static_cast<double> (v))
                                                                       : v.isString() && decimalTextValue (v.toString(), d);
        if (! number)
        {
            logAt ("error", verb + ": " + shownScriptValue (v) + " is not a value, so nothing was sent. " + hint, juce::var());
            return false;
        }
        const int n = static_cast<int> (std::floor (d + 0.5));
        out = juce::jlimit (0, hi, n);
        // Past the end is sent as the nearest end, and said once per command, in the preludes' words.
        if (n != static_cast<int> (out) && edgeWarned.insert (verb).second)
            logAt ("warn", verb + ": the value " + shownScriptValue (v) + " is outside 0 to " + juce::String (hi) + ", so "
                               + juce::String (static_cast<int> (out)) + " was sent. This is said only the first time.", juce::var());
        return true;
    }

    // Whether there is anything to send. The editor's sendMidi, sendSysex and feedMidi say "no bytes
    // given" for empty text, an empty list or nothing at all; the player handed its callback the
    // empty list, which sent nothing without a word. Same words now, and an empty call no longer
    // spends the flood budget either.
    bool hasBytes (const juce::String& verb, const juce::var& bytes)
    {
        if (auto* list = bytes.getArray(); list != nullptr && ! list->isEmpty()) return true;
        logAt ("error", verb + ": no bytes given", juce::var());
        return false;
    }

    // `.midiValue` is what the DPD codec would put on the wire, and the codec is the device host's,
    // not the panel's. Say so once and clearly rather than returning a quiet nothing and leaving the
    // author to work out which of several things went wrong.
    void reportNeedsDeviceHost (const juce::String& member, const juce::String& path)
    {
        if (callbacks.log)
            callbacks.log (member + " on '" + path + "' needs the device host — the MIDI encoding belongs to the "
                           "device profile, not the panel. Use .value or .normalizedValue.", juce::var());
    }

    // Anti-flood backstop (scripting-redesign §7 keep-list): scripts may not push
    // more than this many MIDI messages (CC/NRPN/sysex + transmitting setValues)
    // per rolling second. Excess sends are dropped — local value writes still
    // apply — and one notice per burst goes to the log so the author finds out.
    // Generous by design: a dump→panel pass sends a few hundred messages; only a
    // runaway send loop hits this.
    static constexpr int maxMidiSendsPerSecond = 1000;

    bool midiSendAllowed()
    {
        const double now = juce::Time::getMillisecondCounterHiRes();
        if (now - floodWindowStartMs >= 1000.0)
        {
            floodWindowStartMs = now;
            floodSendsInWindow = 0;
            floodNoticeSent = false;
        }
        if (++floodSendsInWindow <= maxMidiSendsPerSecond)
            return true;
        if (! floodNoticeSent)
        {
            floodNoticeSent = true;
            if (callbacks.log)
                callbacks.log ("[guard] MIDI flood from script '" + (context.id.isNotEmpty() ? context.id : juce::String ("<unknown>"))
                               + "': over " + juce::String (maxMidiSendsPerSecond)
                               + " sends/second — dropping further sends this second", juce::var());
        }
        return false;
    }

    Callbacks callbacks;
    ScriptRuntime* runtime = nullptr;
    ScriptContext context;

    double floodWindowStartMs = 0.0;
    int    floodSendsInWindow = 0;
    bool   floodNoticeSent = false;
};

} // namespace ceditor::scripting
