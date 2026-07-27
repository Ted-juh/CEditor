#pragma once

#include <juce_core/juce_core.h>
#include <map>

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
 * Pure juce_core; message-thread only (like the rest of ScriptRuntime). Header-only for easy testing.
 */
class PanelValueModel
{
public:
    PanelValueModel() = default;

    /** Load from a parsed panel document (juce::JSON::parse of a .cepanel). */
    void load (const juce::var& panelDocument) { doc = panelDocument; }

    /** Load from raw .cepanel JSON text. Returns false if the JSON is invalid. */
    bool loadFromJson (const juce::String& json)
    {
        auto parsed = juce::JSON::parse (json);
        if (! parsed.isObject()) return false;
        doc = parsed;
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
        const auto control = findControlByName (split.first);
        if (! control.isObject()) return {};
        const auto raw = valueAtPath (control, resolveModelPath (control, split.second));
        if (form != "normalizedValue") return raw;

        double lo = 0.0, hi = 0.0;
        if (! rangeOf (control, lo, hi)) return {};
        const double n = (double) raw;
        return juce::var (juce::jlimit (0.0, 1.0, (n - lo) / (hi - lo)));
    }

    /** Write a script path. Returns true if the control + path resolved and the write landed.
        With form == "normalizedValue" the incoming 0–1 position is mapped onto the control's range
        first — clamped, because a position outside 0–1 is a bug in the caller's maths and letting
        it through would drive the control past its own limits. */
    bool setValue (const juce::String& scriptPath, const juce::var& value, const juce::String& form = "value")
    {
        const auto split = splitScriptPath (scriptPath);
        const auto control = findControlByName (split.first);
        if (! control.isObject()) return false;

        juce::var toWrite = value;
        if (form == "normalizedValue")
        {
            double lo = 0.0, hi = 0.0;
            if (! rangeOf (control, lo, hi)) return false;
            toWrite = juce::var (lo + juce::jlimit (0.0, 1.0, (double) value) * (hi - lo));
        }
        return setAtPath (control, resolveModelPath (control, split.second), toWrite);
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

private:
    juce::var doc;

    // "cutoff.background.fill.colour" -> { "cutoff", ["background","fill","colour"] }
    static std::pair<juce::String, juce::StringArray> splitScriptPath (const juce::String& path)
    {
        auto parts = juce::StringArray::fromTokens (path, ".", "");
        juce::String name = parts.isEmpty() ? juce::String() : parts[0];
        juce::StringArray segs;
        for (int i = 1; i < parts.size(); ++i) segs.add (parts[i]);
        return { name, segs };
    }

    juce::var findControlByName (const juce::String& name) const
    {
        auto* obj = doc.getDynamicObject();
        if (obj == nullptr) return {};
        auto controls = obj->getProperty ("controls");
        auto* arr = controls.getArray();
        if (arr == nullptr) return {};

        const auto target = name.toLowerCase();
        for (const auto& c : *arr)
        {
            const auto core = readChildValue (c, "Core");
            if (auto* coreObj = core.getDynamicObject())
            {
                const auto cname = coreObj->getProperty ("name").toString().toLowerCase();
                const auto cid   = coreObj->getProperty ("id").toString().toLowerCase();
                if (cname == target || cid == target) return c;
            }
        }
        return {};
    }

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
    // _children/_type); returns the real-case dotted path, or empty if any segment is missing.
    static juce::String walkCaseInsensitive (juce::var node, const juce::StringArray& segments)
    {
        juce::StringArray out;
        for (const auto& seg : segments)
        {
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

    // Navigate to the leaf's parent (via readChildValue semantics) and assign the leaf with the same
    // _children-first precedence. Mutates the shared DynamicObject tree in place.
    static bool setAtPath (const juce::var& control, const juce::String& path, const juce::var& value)
    {
        const auto parts = juce::StringArray::fromTokens (path, ".", "");
        if (parts.isEmpty()) return false;

        juce::var node = control;
        for (int i = 0; i < parts.size() - 1; ++i)
        {
            node = readChildValue (node, parts[i]);
            if (node.isVoid()) return false;
        }

        const juce::Identifier last (parts[parts.size() - 1]);
        if (auto* obj = node.getDynamicObject())
        {
            if (auto* children = obj->getProperty ("_children").getDynamicObject())
                if (children->hasProperty (last)) { children->setProperty (last, value); return true; }
            obj->setProperty (last, value);
            return true;
        }
        return false;
    }
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
