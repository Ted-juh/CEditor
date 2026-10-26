#pragma once

#include <juce_core/juce_core.h>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include "Scripting/ScriptColours.h"

namespace ceditor
{

/**
 * The C++ "full mirror" of a panel's control state for the exported plugin's script runtime.
 *
 * The window-OPEN runtime is the WebView JS (panelRuntime.js): it resolves script paths like
 * "cutoff.value" or "knob.background.fill.colour" against the live panel object. When the plugin
 * window is CLOSED there is no WebView, so the C++ ScriptRuntime needs its own value store with
 * IDENTICAL path semantics — otherwise a script would behave differently open vs closed.
 *
 * This holds the parsed .cepanel as a juce::var tree (the same shape the JS object has: controls[]
 * each with a `_children` map of sections) and resolves get/set exactly like the JS runtime:
 *   splitScriptPath → findControlByName → resolveModelPath (SHORTHANDS / section walk / channelize)
 *   → valueAtPath (readChildValue: array-index, then _children[part], then plain [part]).
 *
 * findControlByName answers from an index of names and ids built on first use; nameIndex below
 * says why, and what keeps it true.
 *
 * An export payload's controls arrive as a diff against their types, and the entries of their
 * lists as a diff against baselines, carrying the defaults both are against and the drawings several
 * controls share, and share() rebuilds them sharing all of it; rebuildFromDefaults says how.
 *
 * The rebuilt document is shared by every model of that panel in the process (SharedPanelDocument):
 * two copies of a panel in a DAW hold it once. Each model owns only what it has written; ownership
 * below says how.
 *
 * Pure juce_core; message-thread only (like the rest of ScriptRuntime). Header-only for easy testing.
 */

/**
 * A panel document, parsed and its controls rebuilt, for every PanelValueModel of that panel: each
 * instance of an exported plug-in loads the same file, and holding it once per instance was most of
 * what an instance cost (GAIA: the parse 14 MB, the rebuilt controls 9.5 MB, each time).
 *
 * Never written once built. A model writes into copies of what it changes (PanelValueModel's
 * ownership), so instances do not see each other's writes, and reading a tree nobody writes needs
 * no lock whichever thread reads it.
 */
struct SharedPanelDocument
{
    juce::var doc;
};

class PanelValueModel
{
public:
    PanelValueModel() = default;

    /** Parse-and-rebuild once: an export payload's controls rebuilt from the defaults it carries,
        in the document itself, which is then never written again. */
    static std::shared_ptr<const SharedPanelDocument> share (const juce::var& panelDocument)
    {
        PanelValueModel builder;
        builder.building = true;
        builder.doc = panelDocument;
        builder.rebuildFromDefaults();
        return std::make_shared<const SharedPanelDocument> (SharedPanelDocument { builder.doc });
    }

    /** The shared document for a panel file, parsed and rebuilt by the first caller and shared by
        every caller while any of them holds it. A file that has changed since (size or time) is
        read again. Callers may be on any thread: hosts build plug-in instances where they like. */
    static std::shared_ptr<const SharedPanelDocument> sharedForFile (const juce::File& file)
    {
        static std::mutex lock;
        static std::weak_ptr<const SharedPanelDocument> cached;
        static juce::String cachedKey;
        const auto key = file.getFullPathName() + "|" + juce::String (file.getSize())
                       + "|" + juce::String (file.getLastModificationTime().toMilliseconds());
        const std::scoped_lock held (lock);
        if (auto panel = cached.lock(); panel != nullptr && cachedKey == key) return panel;
        auto panel = share (juce::JSON::parse (file.loadFileAsString()));
        cached = panel;
        cachedKey = key;
        return panel;
    }

    /** Load a shared document. This model's panel is its own from here: a write copies what it
        goes through, and nothing it writes reaches the shared document or another model. */
    void load (std::shared_ptr<const SharedPanelDocument> panel)
    {
        shared = std::move (panel);
        ownedNodes.clear();
        ownedHold.clear();
        building = false;
        doc = shared != nullptr ? ownCopy (shared->doc) : juce::var();
        forgetNames();
    }

    /** Load from a parsed panel document (juce::JSON::parse of a .cepanel), shared by nobody. An
        export payload's controls are rebuilt from the defaults it carries, in the document itself. */
    void load (const juce::var& panelDocument) { load (share (panelDocument)); }

    /** Load from raw .cepanel JSON text. Returns false if the JSON is invalid. */
    bool loadFromJson (const juce::String& json)
    {
        auto parsed = juce::JSON::parse (json);
        if (! parsed.isObject()) return false;
        load (share (parsed));
        return true;
    }

    const juce::var& panel() const noexcept { return doc; }

    /** Read a script path ("control.section.prop" or a shorthand like "control.value").
        `form` selects the representation (Q8): "value" (default) or "normalizedValue". Both are
        arithmetic over the control's own Behavior.min/max, so they need nothing but the panel
        document. "midiValue" is the DPD's encoding and cannot be answered here — the caller
        (BridgeScriptHost) rejects it before we get this far. */
    juce::var getValue (const juce::String& scriptPath, const juce::String& form = "value") const
    {
        const auto split = splitScriptPath (scriptPath);
        if (isPanelTarget (split.first)) return getPanelValue (split.second);
        const auto control = findControlByName (split.first);
        if (! control.isObject()) return {};
        const auto raw = valueAtPath (control, resolveModelPath (control, split.second));
        if (form != "normalizedValue") return raw;
        // Nothing there is nothing as a position too, as the WebView runtime answers: (double) of
        // nothing is 0, a plausible position that hid the missing path behind it.
        if (raw.isVoid()) return {};

        double lo = 0.0, hi = 0.0;
        if (! rangeOf (control, lo, hi)) return {};
        const double n = (double) raw;
        return juce::var (juce::jlimit (0.0, 1.0, (n - lo) / (hi - lo)));
    }

    /** Why a read of `scriptPath` that found nothing found nothing, as the line to write, or empty
        when the read was a fair question whose answer is nothing (a property not set yet).

        set() always said when it could not find a control, and get() said nothing, so a misspelled
        name read exactly like an unset value. This gives get() set()'s words, the same as the
        WebView runtime's getValue: a control that is not there, and a path no reading of which
        resolves (not a shorthand, not a section, not a property of any section). The WebView also
        reports an explicit section path that names a property its section's type does not have; it
        has the section templates to tell that from a default the document left out, and this model
        does not, so it stays silent there rather than guess. `panel.*` is not checked here or there:
        the panel document takes any key. */
    juce::String whyNoAnswer (const juce::String& scriptPath) const
    {
        const auto split = splitScriptPath (scriptPath);
        if (isPanelTarget (split.first)) return {};
        const auto control = findControlByName (split.first);
        if (! control.isObject())
            return "get: control \"" + split.first + "\" not found on the active panel, so there is no answer.";
        if (! readsNothing (control, split.second)) return {};
        return "get(\"" + scriptPath + "\"): \"" + split.second.joinIntoString (".") + "\" does not lead anywhere on \""
             + split.first + "\", so there is no answer.";
    }

    /** Write a script path. Returns true if the control + path resolved and the write landed.
        With form == "normalizedValue" the incoming 0–1 position is mapped onto the control's range
        first — clamped, because a position outside 0–1 is a bug in the caller's maths and letting
        it through would drive the control past its own limits. */
    bool setValue (const juce::String& scriptPath, const juce::var& value, const juce::String& form = "value")
    {
        const auto split = splitScriptPath (scriptPath);
        if (isPanelTarget (split.first)) return setPanelValue (split.second, value);
        const auto* where = findControlPath (split.first);
        if (where == nullptr) return false;
        const auto control = ownedAt (*where);
        if (! control.isObject()) return false;

        juce::var toWrite = value;
        if (form == "normalizedValue")
        {
            double lo = 0.0, hi = 0.0;
            if (! rangeOf (control, lo, hi)) return false;
            toWrite = juce::var (lo + juce::jlimit (0.0, 1.0, (double) value) * (hi - lo));
        }
        const auto modelPath = resolveModelPath (control, split.second);
        // A script renaming a control follows the editor's rule: no dots in a name. The name is the
        // first segment of every script path, and splitScriptPath above ends it at the first dot, so
        // a dotted name would make the control unreachable by the very path that renamed it.
        // Mirrors sanitizeControlName in utils/controlNames.js.
        if (modelPath == "Core.name")
            toWrite = juce::var (toWrite.toString().replaceCharacter ('.', '_'));
        if (writeCanMoveAName (modelPath)) forgetNames();
        return setAtPath (control, modelPath, toWrite);
    }

    /** What a script's write of `value` to `scriptPath` stores in the colour properties it reaches,
        by the editor's rule (Scripting/ScriptColours.h; colourWrites in panelRuntime.js): what the
        panel reads as written, CSS's short forms written out, and for each colour the panel cannot
        read a refusal in the editor's words, in which case nothing is to be written. Each refusal
        begins with `call`, set("<the path as the script wrote it>").

        BridgeScriptHost asks this before every engine's set() is written. A write it cannot place (a
        control that is not there, .normalizedValue on a control with no range) comes back as it was,
        for setValue to report as it always has. A `panel.*` path is read by the panel's own colours
        (panelColourWrites in panelRuntime.js, panelColourFieldAt here), the form set aside as
        setPanelValue sets it aside. */
    scripting::colours::Writes colourWrites (const juce::String& call, const juce::String& scriptPath,
                                             const juce::var& value, const juce::String& form = "value") const
    {
        scripting::colours::Writes unchanged;
        unchanged.value = value;
        const auto split = splitScriptPath (scriptPath);
        const auto resolves = [this] (const juce::String& name) { return scripting::colours::controlSetResolves (doc, name); };
        if (isPanelTarget (split.first))
            return scripting::colours::panelColourWrites (call, "nothing was set", split.second.joinIntoString ("."),
                                                          value, resolves);
        const auto control = findControlByName (split.first);
        if (! control.isObject()) return unchanged;

        // A position is read as the number it stands for, as the editor reads it before asking, so a
        // refusal names that number. Nothing else changes: a number is never a colour, and setValue
        // maps the position itself.
        juce::var written = value;
        if (form == "normalizedValue")
        {
            double lo = 0.0, hi = 0.0;
            if (! rangeOf (control, lo, hi)) return unchanged;
            written = juce::var (lo + juce::jlimit (0.0, 1.0, (double) value) * (hi - lo));
        }
        auto out = scripting::colours::colourWrites (call, "nothing was set", control, resolveModelPath (control, split.second),
                                                     written, resolves);
        if (form == "normalizedValue" && ! out.refused) out.value = value;
        return out;
    }

    /** Whether `scriptPath` is a colour property, a control's or the panel's own (panel.bgColour),
        for ce.anim to refuse it as a path (animatesColour in panelRuntime.js): every tick of a move
        would write a number into it. */
    bool isColourProperty (const juce::String& scriptPath) const
    {
        const auto split = splitScriptPath (scriptPath);
        if (split.second.isEmpty()) return false;
        if (isPanelTarget (split.first))
            return scripting::colours::panelColourFieldAt (split.second.joinIntoString (".")).has_value();
        const auto control = findControlByName (split.first);
        if (! control.isObject()) return false;
        return scripting::colours::colourFieldAt (control, resolveModelPath (control, split.second)).has_value();
    }

    /** Whether a write to `scriptPath` has to be a number, for BridgeScriptHost to refuse one that
        is not (setNumber in panelRuntime.js): a range control's own value, a Knob's, a Slider's, a
        Number's or a Range's, and any control's .normalizedValue where it has a range to map onto.
        A control bound to a device parameter is not: its binding reads the value, a choice by its
        name included. A path it cannot place is not its to judge: setValue reports it as it always
        has. */
    bool writeNeedsNumber (const juce::String& scriptPath, const juce::String& form) const
    {
        const auto split = splitScriptPath (scriptPath);
        if (isPanelTarget (split.first)) return false;
        const auto control = findControlByName (split.first);
        if (! control.isObject()) return false;
        if (form == "normalizedValue")
        {
            double lo = 0.0, hi = 0.0;
            return rangeOf (control, lo, hi);
        }
        auto* behavior = readChildValue (control, "Behavior").getDynamicObject();
        if (behavior == nullptr || ! behavior->getProperty ("family").toString().trim().equalsIgnoreCase ("range"))
            return false;
        // valueBindingFor in panelRuntime.js: an enabled section with a device parameter on "value".
        if (auto* bindings = readChildValue (control, "DeviceBindings").getDynamicObject())
            if (! bindings->hasProperty ("enabled") || ! bindings->getProperty ("enabled").isBool()
                || static_cast<bool> (bindings->getProperty ("enabled")))
                if (auto* list = bindings->getProperty ("bindings").getArray())
                    for (const auto& b : *list)
                        if (b.getProperty ("kind", {}).toString() == "deviceParameter"
                            && b.getProperty ("parameterId", {}).toString().isNotEmpty()
                            && (b.getProperty ("port", {}).isVoid() || b.getProperty ("port", {}).toString() == "value"))
                            return false;
        // isLiveValuePath in scripting/liveValue.js.
        const auto path = resolveModelPath (control, split.second).toLowerCase();
        return path == "value" || path == "value.value" || path.endsWith (".currentvalue");
    }

    /** Whether `scriptPath` names a control the panel does not have, for ce.anim to refuse it as a
        path (animatesNoControl in panelRuntime.js): every tick of the move would be a write set()
        refuses. `panel.*` is the panel document, which is always there. */
    bool namesMissingControl (const juce::String& scriptPath) const
    {
        const auto split = splitScriptPath (scriptPath);
        if (isPanelTarget (split.first)) return false;
        return ! findControlByName (split.first).isObject();
    }

    /** Every control's name, in document order, containers included — what ce.panel.snapshot walks.
        Public because panelQuery("controls") answers from it; the walk itself stays private. */
    juce::StringArray controlNames() const
    {
        juce::StringArray out;
        forEachControl ([&out] (const juce::var& c)
        {
            if (auto* core = readChildValue (c, "Core").getDynamicObject())
            {
                const auto name = core->getProperty ("name").toString();
                if (name.isNotEmpty()) out.add (name);
            }
        });
        return out;
    }

    /** A control's numeric range from its Behavior section. False when it hasn't got one. */
    static bool rangeOf (const juce::var& control, double& lo, double& hi)
    {
        const auto behavior = readChildValue (control, "Behavior");
        auto* obj = behavior.getDynamicObject();
        if (obj == nullptr) return false;
        const auto minVar = obj->getProperty ("min");
        const auto maxVar = obj->getProperty ("max");
        if (minVar.isVoid() || maxVar.isVoid()) return false;
        lo = (double) minVar;
        hi = (double) maxVar;
        return lo != hi;
    }

    /** Find a control's live var by friendly name (case-insensitive) or id — for event dispatch. */
    juce::var controlByName (const juce::String& name) const { return findControlByName (name); }

    // ---- path navigation (mirrors controlTreeUtils.js / panelRuntime.js) -------------------------

    // readChildValue: array index, then _children[part], then plain [part] — EXACT-case (the resolved
    // path already carries real-case keys). Returns void when the segment is absent.
    static juce::var readChildValue (const juce::var& current, const juce::String& part)
    {
        if (auto* arr = current.getArray())
        {
            if (part.isNotEmpty() && part.containsOnly ("0123456789"))
            {
                const int i = part.getIntValue();
                if (i >= 0 && i < arr->size()) return (*arr)[i];
            }
        }
        if (auto* obj = current.getDynamicObject())
        {
            const juce::Identifier id (part);
            if (auto* children = obj->getProperty ("_children").getDynamicObject())
                if (children->hasProperty (id)) return children->getProperty (id);
            if (obj->hasProperty (id)) return obj->getProperty (id);
        }
        return {};
    }

    static juce::var valueAtPath (const juce::var& control, const juce::String& path)
    {
        if (! control.isObject() || path.isEmpty()) return {};
        juce::var current = control;
        for (const auto& part : juce::StringArray::fromTokens (path, ".", ""))
        {
            current = readChildValue (current, part);
            if (current.isVoid()) return {};
        }
        return current;
    }

    /** `panel` is a RESERVED first path segment addressing the panel DOCUMENT rather than a control,
        so a script can read and write the thing it lives inside — size, name, background, the panic
        key. Mirrors the same rule in panelRuntime.js. A control genuinely named "panel" loses to the
        document: behaviour that depends on whether somebody named a knob "panel" would be worse than
        a reserved word. */
    static bool isPanelTarget (const juce::String& name) { return name.equalsIgnoreCase ("panel"); }

    /** Identity and structure. Writing these would corrupt the document or detach it from its file,
        so they read but do not write. Everything else on the panel is writable, exactly as every
        control property is. Mirrors PANEL_READONLY_PROPERTIES in panelApi.js. */
    static bool isPanelReadOnly (const juce::String& property)
    {
        return property.equalsIgnoreCase ("id") || property.equalsIgnoreCase ("panelGuid")
            || property.equalsIgnoreCase ("scriptId") || property.equalsIgnoreCase ("filePath")
            || property.equalsIgnoreCase ("controls") || property.equalsIgnoreCase ("scripts");
    }

private:
    juce::var doc;

    // The position `segment` names in `list`, as the editor's walk finds it among the list's own
    // keys ("0", "1", …, with no leading zeros), or -1.
    static int listPosition (const juce::Array<juce::var>& list, const juce::String& segment)
    {
        for (int i = 0; i < list.size(); ++i)
            if (segment == juce::String (i)) return i;
        return -1;
    }

    // Case-insensitive walk over the panel document, which is flat (no _children sections). A list
    // is stepped into by position, as the editor's walk steps into one (bgGradient.stops.0.color).
    static juce::var panelValueAt (const juce::var& node, const juce::StringArray& segs, int from = 0)
    {
        juce::var current = node;
        for (int i = from; i < segs.size(); ++i)
        {
            if (auto* list = current.getArray())
            {
                const int at = listPosition (*list, segs[i]);
                if (at < 0) return {};
                current = (*list)[at];
                continue;
            }
            auto* obj = current.getDynamicObject();
            if (obj == nullptr) return {};
            juce::var next;
            bool found = false;
            for (const auto& p : obj->getProperties())
                if (p.name.toString().equalsIgnoreCase (segs[i])) { next = p.value; found = true; break; }
            if (! found) return {};
            current = next;
        }
        return current;
    }

    juce::var getPanelValue (const juce::StringArray& segs) const
    {
        auto* obj = doc.getDynamicObject();
        if (obj == nullptr) return {};

        if (segs.isEmpty())
        {
            // A bare `panel` gives the summary a script usually wants, not the whole document.
            auto* out = new juce::DynamicObject();
            out->setProperty ("id", obj->getProperty ("id"));
            out->setProperty ("name", obj->getProperty ("name"));
            out->setProperty ("width", obj->getProperty ("width"));
            out->setProperty ("height", obj->getProperty ("height"));
            auto controls = obj->getProperty ("controls");
            out->setProperty ("controlCount", controls.getArray() != nullptr ? controls.getArray()->size() : 0);
            return juce::var (out);
        }
        if (segs.size() == 1 && segs[0].equalsIgnoreCase ("controlCount"))
        {
            auto controls = obj->getProperty ("controls");
            return controls.getArray() != nullptr ? juce::var (controls.getArray()->size()) : juce::var (0);
        }
        return panelValueAt (doc, segs);
    }

    bool setPanelValue (const juce::StringArray& segs, const juce::var& value)
    {
        if (segs.isEmpty() || isPanelReadOnly (segs[0])) return false;

        // Walk to the leaf's parent, case-insensitively, making each node on the way this model's
        // own, then assign with the document's real-case key. A list is stepped into by position,
        // as the editor's walk steps into one, so a gradient's stop can be written by its path.
        juce::var node = doc;
        for (int i = 0; i < segs.size() - 1; ++i)
        {
            if (auto* list = node.getArray())
            {
                const int at = listPosition (*list, segs[i]);
                if (at < 0) return false;
                node = ownedChild (node, juce::String (at));
                continue;
            }
            auto* parent = node.getDynamicObject();
            if (parent == nullptr) return false;
            juce::Identifier key;
            for (const auto& p : parent->getProperties())
                if (p.name.toString().equalsIgnoreCase (segs[i])) { key = p.name; break; }
            if (key.isNull()) return false;
            node = ownProperty (*parent, key);
        }
        const auto& leaf = segs[segs.size() - 1];
        if (auto* list = node.getArray())
        {
            const int at = listPosition (*list, leaf);
            if (at < 0) return false;
            list->getReference (at) = value;
            return true;
        }
        auto* obj = node.getDynamicObject();
        if (obj == nullptr) return false;

        for (const auto& p : obj->getProperties())
            if (p.name.toString().equalsIgnoreCase (leaf)) { obj->setProperty (p.name, value); return true; }
        obj->setProperty (juce::Identifier (leaf), value);
        return true;
    }

    // "cutoff.background.fill.colour" -> { "cutoff", ["background","fill","colour"] }
    static std::pair<juce::String, juce::StringArray> splitScriptPath (const juce::String& path)
    {
        auto parts = juce::StringArray::fromTokens (path, ".", "");
        juce::String name = parts.isEmpty() ? juce::String() : parts[0];
        juce::StringArray segs;
        for (int i = 1; i < parts.size(); ++i) segs.add (parts[i]);
        return { name, segs };
    }

    /** Walk every control in the document, containers included, in document order.
        Controls nest inside a container's `Children._children.<id>` (a map, not an array), which is
        the same shape the editor's own containment walk follows. */
    template <typename Fn>
    void forEachControl (Fn&& fn) const
    {
        forEachControlAt ([&fn] (const juce::var& c, const juce::StringArray&) { fn (c); });
    }

    // Each control with where it is: the steps from the document to it, as readChildValue takes
    // them ("controls", "3", then "Children", "<key>" for each container it is inside).
    template <typename Fn>
    void forEachControlAt (Fn&& fn) const
    {
        auto* obj = doc.getDynamicObject();
        if (obj == nullptr) return;
        auto* arr = obj->getProperty ("controls").getArray();
        if (arr == nullptr) return;
        for (int i = 0; i < arr->size(); ++i)
            visitControlAt ((*arr)[i], juce::StringArray { "controls", juce::String (i) }, fn);
    }

    // Matches on name OR id, case-insensitively, and DOES descend into containers — a control
    // inside a group was unreachable window-closed until snapshot needed to list one, at which
    // point listing a name that get() could not read would have been worse than not listing it.
    // The first control in document order wins, whether it matched by name or by id.
    juce::var findControlByName (const juce::String& name) const
    {
        const auto* where = findControlPath (name);
        return where != nullptr ? at (*where) : juce::var();
    }

    const juce::StringArray* findControlPath (const juce::String& name) const
    {
        if (! nameIndexBuilt)
        {
            forEachControlAt ([this] (const juce::var& c, const juce::StringArray& where)
            {
                if (auto* coreObj = readChildValue (c, "Core").getDynamicObject())
                {
                    // emplace keeps the first entry for a key, which is what keeps document order.
                    nameIndex.emplace (coreObj->getProperty ("name").toString().toLowerCase(), where);
                    nameIndex.emplace (coreObj->getProperty ("id").toString().toLowerCase(), where);
                }
            });
            nameIndexBuilt = true;
        }
        const auto it = nameIndex.find (name.toLowerCase());
        return it != nameIndex.end() ? &it->second : nullptr;
    }

    // The node at `where`, read; and made this model's own, each node on the way included.
    juce::var at (const juce::StringArray& where) const
    {
        juce::var node = doc;
        for (const auto& step : where) node = readChildValue (node, step);
        return node;
    }

    juce::var ownedAt (const juce::StringArray& where) const
    {
        juce::var node = doc;
        for (const auto& step : where)
        {
            node = ownedChild (node, step);
            if (node.isVoid()) return {};
        }
        return node;
    }

    // The index findControlByName answers from: lower-cased name and id to where the control is.
    // A panel's load scripts call set() thousands of times, and each call used to walk every
    // control lower-casing two strings apiece; on the GAIA panel that was two thirds of an
    // instance's start-up.
    //
    // It holds where, not the control, because a write replaces the control it reaches with this
    // model's own copy the first time (ownership below): a control held here would be the shared
    // one, which a later write must not go into and a later read must not see.
    //
    // What a name finds depends on each control's Core.name and Core.id and on the controls under
    // each Children section, and on nothing else in the document. Every write that reaches a
    // control comes through setValue, which drops the index when the write could touch one of
    // those (writeCanMoveAName); writes to the panel document cannot, because `controls` is
    // read-only there. The next lookup rebuilds it.
    mutable std::unordered_map<juce::String, juce::StringArray> nameIndex;
    mutable bool nameIndexBuilt = false;

    void forgetNames() { nameIndex.clear(); nameIndexBuilt = false; }

    /** Whether a write at this resolved path could change which control a name finds. Plainly
        inside a section other than Core and Children, it cannot, and nor can the rest of Core.
        Everything else counts: a whole section, the sections map itself, a key outside every
        section — a script can reach those by spelling the path out, and each can rename or
        replace a control. Paths are as resolveModelPath returns them, so the case is the
        document's. */
    static bool writeCanMoveAName (const juce::String& modelPath)
    {
        const auto parts = juce::StringArray::fromTokens (modelPath, ".", "");
        if (parts.size() < 2 || parts[0].startsWithChar ('_') || parts[0] == "Children") return true;
        if (parts[0] == "Core") return parts[1] == "name" || parts[1] == "id";
        return false;
    }

private:
    template <typename Fn>
    static void visitControlAt (const juce::var& control, const juce::StringArray& where, Fn& fn)
    {
        if (! control.isObject()) return;
        fn (control, where);
        if (auto* kids = readChildValue (control, "Children").getDynamicObject())
        {
            auto nested = kids->getProperty ("_children");
            if (auto* nestedObj = nested.getDynamicObject())
                for (const auto& prop : nestedObj->getProperties())
                {
                    auto inside = where;
                    inside.add ("Children");
                    inside.add (prop.name.toString());
                    visitControlAt (prop.value, inside, fn);
                }
        }
    }

public:

    // Common shorthands → canonical section path (mirrors SHORTHANDS in panelRuntime.js).
    static juce::String shorthand (const juce::String& lowerFirst)
    {
        static const std::map<juce::String, juce::String> m {
            { "visible", "Core.visible" }, { "enabled", "Core.enabled" }, { "locked", "Core.locked" },
            { "name", "Core.name" }, { "zindex", "Core.zIndex" },
            { "x", "Transform.x" }, { "y", "Transform.y" }, { "width", "Transform.width" }, { "height", "Transform.height" },
            { "opacity", "Transform.opacity" }, { "rotation", "Transform.rotation" }, { "scale", "Transform.scale" },
            { "value", "Value.value" },
        };
        const auto it = m.find (lowerFirst);
        return it != m.end() ? it->second : juce::String();
    }

    // Walk a node case-insensitively through _children first, then plain keys (excluding
    // _children/_type); returns the real-case dotted path, or empty if any segment is missing. A list
    // is stepped into by position, as the editor's walk finds a position among a list's own keys, so
    // a control's gradient stop or Meter zone is found by its path in any capitals, as it is there;
    // the path used to be written as the script spelled it, and only the document's capitals landed.
    static juce::String walkCaseInsensitive (juce::var node, const juce::StringArray& segments)
    {
        juce::StringArray out;
        for (const auto& seg : segments)
        {
            if (auto* list = node.getArray())
            {
                const int at = listPosition (*list, seg);
                if (at < 0) return {};
                out.add (seg);
                node = (*list)[at];
                continue;
            }
            const auto low = seg.toLowerCase();
            juce::String foundKey;

            if (auto* obj = node.getDynamicObject())
            {
                if (auto* children = obj->getProperty ("_children").getDynamicObject())
                {
                    for (const auto& p : children->getProperties())
                        if (p.name.toString().toLowerCase() == low) { foundKey = p.name.toString(); break; }
                    if (foundKey.isNotEmpty()) { out.add (foundKey); node = children->getProperty (juce::Identifier (foundKey)); continue; }
                }
                for (const auto& p : obj->getProperties())
                {
                    const auto nm = p.name.toString();
                    if (nm == "_children" || nm == "_type") continue;
                    if (nm.toLowerCase() == low) { foundKey = nm; break; }
                }
                if (foundKey.isNotEmpty()) { out.add (foundKey); node = obj->getProperty (juce::Identifier (foundKey)); continue; }
            }
            return {};
        }
        return out.joinIntoString (".");
    }

    // No reading of `segments` resolves: resolveModelPath would fall through every branch to the
    // segments as written. Mirrors pathReadsNothing in panelRuntime.js.
    static bool readsNothing (const juce::var& control, const juce::StringArray& segments)
    {
        if (segments.isEmpty()) return false;
        const auto first = segments[0].toLowerCase();
        if (shorthand (first).isNotEmpty() || firstSegmentIsSection (control, first)) return false;
        if (auto* obj = control.getDynamicObject())
            if (auto* children = obj->getProperty ("_children").getDynamicObject())
                for (const auto& p : children->getProperties())
                    if (walkCaseInsensitive (p.value, segments).isNotEmpty()) return false;
        return true;
    }

    static bool firstSegmentIsSection (const juce::var& control, const juce::String& lowerFirst)
    {
        if (auto* obj = control.getDynamicObject())
            if (auto* children = obj->getProperty ("_children").getDynamicObject())
                for (const auto& p : children->getProperties())
                    if (p.name.toString().toLowerCase() == lowerFirst) return true;
        return false;
    }

    // If the resolved path lands on a custom-component value channel object, address its currentValue.
    static juce::String channelizePath (const juce::var& control, const juce::String& path)
    {
        if (path.isEmpty()) return path;
        const auto node = valueAtPath (control, path);
        if (auto* obj = node.getDynamicObject())
            if (obj->hasProperty ("currentValue")) return path + ".currentValue";
        return path;
    }

    // Mirror of resolveModelPath(): shorthand → explicit-section walk → per-section search → channelize.
    static juce::String resolveModelPath (const juce::var& control, const juce::StringArray& segments)
    {
        // A bare control name means its value — `.value` is the documented default representation,
        // so get("cutoff") and get("cutoff.value") ask the same question. Mirrors the same rule in
        // panelRuntime.js, and is what lets get("cutoff", "normalizedValue") find a value to
        // normalise once the accessor suffix has been stripped off the path.
        if (segments.isEmpty()) return channelizePath (control, "Value.value");
        const auto first = segments[0].toLowerCase();
        juce::String path;

        if (segments.size() == 1 && shorthand (first).isNotEmpty())
        {
            path = shorthand (first);
        }
        else if (firstSegmentIsSection (control, first))
        {
            path = walkCaseInsensitive (control, segments);
            if (path.isEmpty()) path = segments.joinIntoString (".");
        }
        else
        {
            juce::String found;
            if (auto* obj = control.getDynamicObject())
                if (auto* children = obj->getProperty ("_children").getDynamicObject())
                    for (const auto& p : children->getProperties())
                    {
                        const auto sub = walkCaseInsensitive (p.value, segments);
                        if (sub.isNotEmpty()) { found = p.name.toString() + "." + sub; break; }
                    }
            if (found.isEmpty())
                found = shorthand (first).isNotEmpty() ? shorthand (first) : segments.joinIntoString (".");
            path = found;
        }

        return channelizePath (control, path);
    }

private:
    // Navigate to the leaf's parent (via readChildValue semantics) and assign the leaf with the same
    // _children-first precedence. `control` is this model's own (setValue made it so); each node on
    // the way that is not is copied first (ownedChild), so the write reaches this control in this
    // model and nothing else: not another control of the same type, not the defaults, not the
    // shared document another instance reads.
    bool setAtPath (const juce::var& control, const juce::String& path, const juce::var& value)
    {
        const auto parts = juce::StringArray::fromTokens (path, ".", "");
        if (parts.isEmpty()) return false;

        juce::var node = control;
        for (int i = 0; i < parts.size() - 1; ++i)
        {
            node = ownedChild (node, parts[i]);
            if (node.isVoid()) return false;
        }

        const juce::Identifier last (parts[parts.size() - 1]);
        if (auto* obj = node.getDynamicObject())
        {
            if (auto* children = obj->getProperty ("_children").getDynamicObject(); children != nullptr && children->hasProperty (last))
            {
                ownProperty (*obj, "_children").getDynamicObject()->setProperty (last, value);
                return true;
            }
            obj->setProperty (last, value);
            return true;
        }
        return false;
    }

    // ---- an export payload's controls, rebuilt from the defaults it carries -----------------------
    //
    // An export payload (documentForm "export", exportFormDocument in panelModel.js) stores each
    // control as a diff against its type's pristine control, as a saved document does, and carries
    // what the diff is against in `controlDefaults`: `types`, a pristine control per control type
    // the panel uses; `part`, the shell an authored part (any part a type does not ship with) is a
    // diff against; `partSections`, what each section of an authored part is a diff against. The
    // payload used to carry every control whole instead, because this reader could not rebuild a
    // default it never saw: 12.2 MB for GAIA, where the payload is now 1.8.
    //
    // What follows is expandControl and expandPart in documentShape.js, step for step, so a control
    // comes out exactly as the complete form had it, key order included: a key in `_removed` is the
    // author's deletion and is left out, the diff's own keys win, an array or a value is taken whole.
    // With one difference that is the point of it: a default the diff does not touch is not copied
    // into the control but shared with it, so 818 GAIA controls hold their own changes and refer to
    // twelve pristine ones for the rest. The defaults are therefore read-only, and setAtPath, the one
    // place that writes into a control, copies a shared node before writing into it.
    //
    // A document without `controlDefaults` (a complete one, from before the export form) is used
    // as it is.
    //
    // The diff stops at the entries of a control's lists, which a pristine control has nothing
    // under: a binding, a grab area, a value channel, a behaviour, a device binding, a choice. Each
    // of those is written as a diff against a baseline for its list, which the payload carries too,
    // in `controlDefaults.entries` (documentEntries.js). They are put back first, as readPanelDocument
    // puts them back in the WebView before anything else sees the controls; restoreEntries says which.
    //
    // A payload also writes a drawing (a custom component's Parts section) that several controls use
    // once, in `drawings`, and those controls refer to it by name (documentDrawings.js). It goes back
    // into each of them first, as readPanelDocument does in the WebView, shared like the defaults.
    // And since a drawing over the same type rebuilds to the same parts every time, it is rebuilt
    // once and that is shared too: GAIA's 163 controls that use a shared drawing hold 15 of them.
    void rebuildFromDefaults()
    {
        carriedDefaults = juce::var();
        carriedDrawings = juce::var();
        drawingNames.clear();
        rebuiltDrawings.clear();
        sharedNodes.clear();
        auto* obj = doc.getDynamicObject();
        if (obj == nullptr) return;
        auto* controls = obj->getProperty ("controls").getArray();
        // Neither table is part of the panel a script can see, as neither is in the WebView's.
        if (obj->hasProperty ("drawings"))
        {
            carriedDrawings = obj->getProperty ("drawings");
            obj->removeProperty ("drawings");
            markShared (carriedDrawings);
            if (auto* table = carriedDrawings.getDynamicObject())
                for (const auto& p : table->getProperties())
                    if (auto* drawing = p.value.getDynamicObject()) drawingNames[drawing] = p.name.toString();
            if (controls != nullptr)
                for (const auto& control : *controls) resolveDrawings (control);
        }
        if (! obj->hasProperty ("controlDefaults")) return;
        carriedDefaults = obj->getProperty ("controlDefaults");
        obj->removeProperty ("controlDefaults");
        markShared (carriedDefaults);
        const auto entryBaselines = carriedDefaults.getProperty ("entries", {});
        if (controls != nullptr)
            for (auto& control : *controls)
            {
                if (entryBaselines.isObject()) restoreEntries (control, entryBaselines);
                control = rebuildControl (control);
            }
    }

    // restoreEntries in documentEntries.js: each entry of a list the payload has a baseline for, put
    // back over it, in the control as it came and in its children's, whatever their type. A map's
    // entry (Bindings, HitZones, ValueChannels, Behaviors: section._children.<name>) only when it
    // carries the baseline's `_type`, which marks it whole: one without is a diff against the entry
    // of that name in its type's pristine control, and rebuildControl puts that back. An array's
    // (DeviceBindings.bindings, Value.rows) always: an array is written whole when it differs from its
    // type's, so all its entries are written over the baseline. As merge does everywhere else here,
    // what an entry leaves at the baseline is the baseline's own node, shared.
    //
    // A payload written before payloads carried baselines has its entries whole, and has none to
    // restore them from; one that carries them carries those its entries were written against, and
    // a list it has no baseline for is left as it came.
    static void restoreEntries (const juce::var& control, const juce::var& baselines)
    {
        auto* sections = control.getProperty ("_children", {}).getDynamicObject();
        if (sections == nullptr) return;
        for (const auto& p : sections->getProperties())
        {
            const auto name = p.name.toString();
            if (name == "Children")
            {
                if (auto* kids = p.value.getProperty ("_children", {}).getDynamicObject())
                    for (const auto& kid : kids->getProperties())
                        if (kid.value.getDynamicObject() != nullptr) restoreEntries (kid.value, baselines);
                continue;
            }
            auto* section = p.value.getDynamicObject();
            const auto base = baselines.getProperty (p.name, {});
            if (section == nullptr || base.getDynamicObject() == nullptr) continue;
            if (name == "DeviceBindings" || name == "Value")
            {
                if (auto* list = section->getProperty (name == "Value" ? "rows" : "bindings").getArray())
                    for (auto& entry : *list)
                        if (entry.getDynamicObject() != nullptr) entry = merge (entry, base);
            }
            else if (name == "Bindings" || name == "HitZones" || name == "ValueChannels" || name == "Behaviors")
            {
                const auto type = base.getProperty ("_type", {});
                auto* entries = section->getProperty ("_children").getDynamicObject();
                if (entries == nullptr || ! type.isString()) continue;
                // `_removed` is in this map too, as a list of names. Replaced by name: setProperty on a
                // name already there keeps its place.
                for (const auto& key : namesOf (*entries))
                {
                    if (key.toString() == "_removed") continue;
                    const auto entry = entries->getProperty (key);
                    const auto entryType = entry.getProperty ("_type", {});
                    if (entry.getDynamicObject() != nullptr && entryType.isString() && entryType.toString() == type.toString())
                        entries->setProperty (key, merge (entry, base));
                }
            }
        }
    }

    // resolveDrawings in documentDrawings.js: each control's reference, its children's included,
    // replaced by the drawing it names. A reference that is nothing else becomes the carried
    // drawing itself (which is how rebuildControl knows it); one with keys of its own has them over
    // it; one naming a drawing the table lacks keeps only its own keys, as the editor does.
    void resolveDrawings (const juce::var& control)
    {
        auto* sections = control.getProperty ("_children", {}).getDynamicObject();
        if (sections == nullptr) return;
        if (auto* parts = sections->getProperty ("Parts").getDynamicObject(); parts != nullptr && parts->hasProperty ("_drawing"))
        {
            const auto drawing = carriedDrawings.getProperty (juce::Identifier (parts->getProperty ("_drawing").toString()), {});
            auto* own = new juce::DynamicObject();
            for (const auto& p : parts->getProperties())
                if (p.name.toString() != "_drawing") own->setProperty (p.name, p.value);
            const juce::var ownVar (own);
            const bool onlyTheName = own->getProperties().isEmpty();
            sections->setProperty ("Parts", ! drawing.isObject() ? ownVar : onlyTheName ? drawing : merge (ownVar, drawing));
        }
        if (auto* kids = sections->getProperty ("Children").getProperty ("_children", {}).getDynamicObject())
            for (const auto& p : kids->getProperties())
                if (p.value.isObject()) resolveDrawings (p.value);
    }

    // expandControl: the diff over its type's pristine control, its authored parts over theirs,
    // its children each over their own type's. A type the payload has no defaults for is used as
    // it came, its parts aside, and so are its children, as expandControl does.
    juce::var rebuildControl (const juce::var& sparse)
    {
        const auto type = readChildValue (sparse, "Core").getProperty ("controlType", {}).toString();
        const auto pristine = type.isNotEmpty() ? carriedDefaults.getProperty ("types", {}).getProperty (juce::Identifier (type), {})
                                                : juce::var();
        const auto control = pristine.isObject() ? merge (sparse, pristine) : sparse;

        // When the control's Parts is a carried drawing and nothing else, what it rebuilds to is
        // shared under "<type>/<drawing>".
        juce::String rebuiltAs;
        if (auto* parts = readChildValue (sparse, "Parts").getDynamicObject())
            if (auto it = drawingNames.find (parts); it != drawingNames.end()) rebuiltAs = type + "/" + it->second;

        if (auto it = rebuiltDrawings.find (rebuiltAs); rebuiltAs.isNotEmpty() && it != rebuiltDrawings.end())
        {
            control.getProperty ("_children", {}).getDynamicObject()->setProperty ("Parts", it->second);
        }
        else
        {
            std::set<juce::String> typeParts;
            if (auto* shipped = mapOf (pristine, "Parts"))
                for (const auto& p : shipped->getProperties()) typeParts.insert (p.name.toString());
            bool authored = false;
            if (auto* parts = mapOf (control, "Parts"))
                for (const auto& p : parts->getProperties()) authored = authored || typeParts.count (p.name.toString()) == 0;
            // Replaced by name: setProperty on a name already there keeps its place, and so the order.
            // Made the control's own first: the map is the defaults' or a carried drawing's otherwise.
            if (auto* parts = authored ? ownedMap (control, "Parts") : nullptr)
                for (const auto& name : namesOf (*parts))
                    if (typeParts.count (name.toString()) == 0) parts->setProperty (name, rebuildPart (parts->getProperty (name)));
            if (rebuiltAs.isNotEmpty())
            {
                const auto rebuilt = readChildValue (control, "Parts");
                markShared (rebuilt);
                rebuiltDrawings[rebuiltAs] = rebuilt;
            }
        }

        if (pristine.isObject())
            if (auto* kids = mapOf (control, "Children"); kids != nullptr && ! isShared (kids))
                for (const auto& name : namesOf (*kids)) kids->setProperty (name, rebuildControl (kids->getProperty (name)));
        return control;
    }

    // expandPart: the part over the shell, with each section it owns (its marker names the type) at
    // that section type's defaults. Layout is the part's own and has none.
    juce::var rebuildPart (const juce::var& sparse) const
    {
        auto* sections = sparse.getProperty ("_children", {}).getDynamicObject();
        if (sections == nullptr) return sparse;

        auto* base = new juce::DynamicObject();
        auto* baseSections = new juce::DynamicObject();
        if (auto* shell = carriedDefaults.getProperty ("part", {}).getDynamicObject())
        {
            for (const auto& p : shell->getProperties()) base->setProperty (p.name, p.value);
            if (auto* shellSections = shell->getProperty ("_children").getDynamicObject())
                for (const auto& p : shellSections->getProperties()) baseSections->setProperty (p.name, p.value);
        }
        const auto partSections = carriedDefaults.getProperty ("partSections", {});
        for (const auto& p : sections->getProperties())
        {
            const auto sectionType = p.value.getProperty ("_type", {}).toString();
            if (p.name.toString() == "Layout" || sectionType.isEmpty()) continue;
            const auto baseline = partSections.getProperty (juce::Identifier (sectionType), {});
            if (baseline.isObject()) baseSections->setProperty (p.name, baseline);
        }
        base->setProperty ("_children", juce::var (baseSections));
        return merge (sparse, juce::var (base));
    }

    // expand: the base's keys less those in `_removed`, then the diff's keys over them, an object
    // over an object merged in turn and anything else (an array, a value, a JSON null) taken whole.
    // What the diff leaves alone is the base's own node, shared, never copied.
    static juce::var merge (const juce::var& sparse, const juce::var& base)
    {
        auto* s = sparse.getDynamicObject();
        auto* b = base.getDynamicObject();
        if (s == nullptr || b == nullptr) return sparse;

        std::set<juce::String> removed;
        if (auto* list = s->getProperty ("_removed").getArray())
            for (const auto& name : *list) removed.insert (name.toString());

        auto* out = new juce::DynamicObject();
        for (const auto& p : b->getProperties())
            if (removed.count (p.name.toString()) == 0) out->setProperty (p.name, p.value);
        for (const auto& p : s->getProperties())
        {
            if (p.name.toString() == "_removed") continue;
            const auto under = removed.count (p.name.toString()) == 0 ? b->getProperty (p.name) : juce::var();
            out->setProperty (p.name, merge (p.value, under));
        }
        return juce::var (out);
    }

    static juce::Array<juce::Identifier> namesOf (const juce::DynamicObject& obj)
    {
        juce::Array<juce::Identifier> names;
        for (const auto& p : obj.getProperties()) names.add (p.name);
        return names;
    }

    // A section's `_children` map: control._children.<section>._children.
    static juce::DynamicObject* mapOf (const juce::var& control, const char* section)
    {
        return readChildValue (control, section).getProperty ("_children", {}).getDynamicObject();
    }

    void markShared (const juce::var& v)
    {
        if (auto* o = v.getDynamicObject())
        {
            if (! sharedNodes.insert (o).second) return;
            for (const auto& p : o->getProperties()) markShared (p.value);
        }
        else if (auto* a = v.getArray())
        {
            if (! sharedNodes.insert (a).second) return;
            for (const auto& item : *a) markShared (item);
        }
    }

    // OWNERSHIP. While share() rebuilds the document, what is shared is what markShared named: the
    // defaults and the drawings, which many controls point at. Once a model has loaded it, the whole
    // document is shared, with the other models of that panel, and the model's own nodes are the
    // ones it copied (ownCopy): its top-level panel object, then each node a write has gone
    // through. Everything else is copied before it is written into. The copies are held as well as
    // named, so no address in ownedNodes can come back as some other object's.
    bool isShared (const void* node) const
    {
        return building ? sharedNodes.count (node) != 0 : ownedNodes.count (node) == 0;
    }
    bool isShared (const juce::var& v) const
    {
        if (auto* o = v.getDynamicObject()) return isShared (o);
        if (auto* a = v.getArray()) return isShared (a);
        return false;
    }

    // One level of a shared node, copied: what is under it stays shared until a write goes there.
    static juce::var copyOfNode (const juce::var& v)
    {
        if (auto* o = v.getDynamicObject())
        {
            auto* copy = new juce::DynamicObject();
            for (const auto& p : o->getProperties()) copy->setProperty (p.name, p.value);
            return juce::var (copy);
        }
        if (auto* a = v.getArray()) return juce::var (juce::Array<juce::var> (*a));
        return v;
    }

    // A copy of one node that is this model's own from now on (see isShared).
    juce::var ownCopy (const juce::var& v) const
    {
        auto copy = copyOfNode (v);
        if (! building)
        {
            if (auto* o = copy.getDynamicObject()) ownedNodes.insert (o);
            else if (auto* a = copy.getArray()) ownedNodes.insert (a);
            ownedHold.push_back (copy);
        }
        return copy;
    }

    // obj[id], made the control's own: a shared node is replaced by a copy.
    //
    // Into the slot itself, not through setProperty: that skips a value equal to the one there, and
    // JUCE compares arrays by their items, so a copy of an array, which has the same items, was never
    // put in and the write went into a copy nothing held. (An object compares by identity, which is
    // why only arrays were lost: a write into an array a control shared with its defaults, before.)
    juce::var ownProperty (juce::DynamicObject& obj, const juce::Identifier& id) const
    {
        auto v = obj.getProperty (id);
        if (isShared (v))
        {
            v = ownCopy (v);
            if (auto* slot = obj.getProperties().getVarPointer (id)) *slot = v;
        }
        return v;
    }

    // A section's `_children` map, made the control's own along with the section (ownedChild).
    juce::DynamicObject* ownedMap (const juce::var& control, const char* section) const
    {
        auto* node = ownedChild (control, section).getDynamicObject();
        return node != nullptr && node->hasProperty ("_children") ? ownProperty (*node, "_children").getDynamicObject() : nullptr;
    }

    // readChildValue for a node about to be written into (which is the control's own already): the
    // child it finds, by the same precedence, made the control's own too, the `_children` map it is
    // found in included.
    juce::var ownedChild (const juce::var& node, const juce::String& part) const
    {
        if (auto* arr = node.getArray())
        {
            if (part.isNotEmpty() && part.containsOnly ("0123456789"))
            {
                const int i = part.getIntValue();
                if (i >= 0 && i < arr->size())
                {
                    auto& item = arr->getReference (i);
                    if (isShared (item)) item = ownCopy (item);
                    return item;
                }
            }
        }
        if (auto* obj = node.getDynamicObject())
        {
            const juce::Identifier id (part);
            if (auto* children = obj->getProperty ("_children").getDynamicObject(); children != nullptr && children->hasProperty (id))
                return ownProperty (*ownProperty (*obj, "_children").getDynamicObject(), id);
            if (obj->hasProperty (id)) return ownProperty (*obj, id);
        }
        return {};
    }

    // What the payload's controls were rebuilt from, kept for the model's lifetime so every node the
    // shared set names stays alive and stays that node: the defaults, the drawings (with each one's
    // name, by node), and each drawing as rebuilt over a type ("<type>/<name>").
    juce::var carriedDefaults;
    juce::var carriedDrawings;
    std::map<const void*, juce::String> drawingNames;
    std::map<juce::String, juce::var> rebuiltDrawings;
    std::unordered_set<const void*> sharedNodes;

    std::shared_ptr<const SharedPanelDocument> shared;   // what doc was copied from, kept alive
    bool building = false;                               // share() is rebuilding the document
    mutable std::unordered_set<const void*> ownedNodes;
    mutable std::vector<juce::var> ownedHold;
};

/**
 * Gather a panel's SOURCE scripts (panel-level + per-control) as a var array ready for
 * ScriptRuntime::loadScripts. Mirrors the web collectPanelExportScripts(): honors
 * panel.scripting.{enabled,runOnExport} and each control's Scripts.enabled, drops disabled and
 * non-source (legacy command-graph) scripts, and fills default scope/target.
 */
inline juce::var gatherPanelScripts (const juce::var& panelDoc)
{
    juce::Array<juce::var> out;
    auto* doc = panelDoc.getDynamicObject();
    if (doc == nullptr) return juce::var (out);

    if (auto* sc = doc->getProperty ("scripting").getDynamicObject())
    {
        if (sc->hasProperty ("enabled")     && ! (bool) sc->getProperty ("enabled"))     return juce::var (out);
        if (sc->hasProperty ("runOnExport") && ! (bool) sc->getProperty ("runOnExport")) return juce::var (out);
    }

    auto isSourceScript = [] (const juce::var& s)
    {
        auto* o = s.getDynamicObject();
        return o != nullptr && o->getProperty ("source").toString().isNotEmpty()
                            && o->getProperty ("language").toString().isNotEmpty();
    };
    auto isEnabled = [] (const juce::var& s)
    {
        auto* o = s.getDynamicObject();
        return o != nullptr && (! o->hasProperty ("enabled") || (bool) o->getProperty ("enabled"));
    };
    auto withDefaults = [] (const juce::var& s, const juce::String& scope, const juce::String& target)
    {
        auto* o = new juce::DynamicObject();
        if (auto* src = s.getDynamicObject())
            for (const auto& p : src->getProperties()) o->setProperty (p.name, p.value);
        if (o->getProperty ("scope").toString().isEmpty()) o->setProperty ("scope", scope);
        if (target.isNotEmpty() && o->getProperty ("target").toString().isEmpty()) o->setProperty ("target", target);
        return juce::var (o);
    };

    if (auto* arr = doc->getProperty ("scripts").getArray())
        for (const auto& s : *arr)
            if (isEnabled (s) && isSourceScript (s)) out.add (withDefaults (s, "panel", {}));

    if (auto* controls = doc->getProperty ("controls").getArray())
        for (const auto& c : *controls)
        {
            const auto core = PanelValueModel::readChildValue (c, "Core");
            const auto cid  = core.getDynamicObject() != nullptr ? core.getDynamicObject()->getProperty ("id").toString() : juce::String();
            auto* scriptsSection = PanelValueModel::readChildValue (c, "Scripts").getDynamicObject();
            if (scriptsSection == nullptr) continue;
            if (scriptsSection->hasProperty ("enabled") && ! (bool) scriptsSection->getProperty ("enabled")) continue;
            if (auto* cs = scriptsSection->getProperty ("scripts").getArray())
                for (const auto& s : *cs)
                    if (isEnabled (s) && isSourceScript (s)) out.add (withDefaults (s, "component", cid));
        }

    return juce::var (out);
}

} // namespace ceditor
