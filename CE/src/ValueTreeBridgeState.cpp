#include "ValueTreeBridge.h"

void ValueTreeBridge::emitDebugLog (const juce::String& level, const juce::String& message) const
{
    if (browser == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("level", level);
    obj->setProperty ("message", message);
    browser->emitEventIfBrowserIsVisible ("debugLog", juce::var (obj));
}

void ValueTreeBridge::emitPerfDebug (const juce::String& message) const
{
    if (! perfDebugEnabled)
        return;

    emitDebugLog ("info", "[perf] " + message);
}

void ValueTreeBridge::connectToWebView (juce::WebBrowserComponent* webView)
{
    browser = webView;
}

void ValueTreeBridge::bindToTree (juce::ValueTree newTree)
{
    tree.removeListener (this);
    tree = newTree;
    tree.addListener (this);
    pushFullState();
}

void ValueTreeBridge::pushFullState()
{
    if (browser == nullptr)
        return;

    auto state = treeToVar (tree);
    browser->emitEventIfBrowserIsVisible ("fullState", state);
}

void ValueTreeBridge::valueTreePropertyChanged (juce::ValueTree& treeWhosePropertyHasChanged,
                                                const juce::Identifier& property)
{
    if (suppressOutgoing || browser == nullptr)
        return;

    auto path = buildPath (treeWhosePropertyHasChanged, property);
    auto value = treeWhosePropertyHasChanged[property];

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("path", path);
    obj->setProperty ("value", value);

    browser->emitEventIfBrowserIsVisible ("propUpdate", juce::var (obj));
}

void ValueTreeBridge::valueTreeChildAdded (juce::ValueTree&, juce::ValueTree&)
{
    if (! suppressOutgoing)
        pushFullState();
}

void ValueTreeBridge::valueTreeChildRemoved (juce::ValueTree&, juce::ValueTree&, int)
{
    if (! suppressOutgoing)
        pushFullState();
}

juce::var ValueTreeBridge::treeToVar (const juce::ValueTree& t)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("_type", t.getType().toString());

    for (int i = 0; i < t.getNumProperties(); ++i)
    {
        auto propName = t.getPropertyName (i);
        obj->setProperty (propName, t[propName]);
    }

    if (t.getNumChildren() > 0)
    {
        auto* children = new juce::DynamicObject();

        for (int i = 0; i < t.getNumChildren(); ++i)
        {
            auto child = t.getChild (i);
            children->setProperty (child.getType(), treeToVar (child));
        }

        obj->setProperty ("_children", juce::var (children));
    }

    return juce::var (obj);
}

void ValueTreeBridge::setPropertyFromPath (const juce::String& path, const juce::var& value)
{
    juce::StringArray parts;
    parts.addTokens (path, ".", "");

    if (parts.isEmpty())
        return;

    auto node = tree;

    for (int i = 0; i < parts.size() - 1; ++i)
    {
        auto childType = juce::Identifier (parts[i]);
        auto child = node.getChildWithName (childType);

        if (! child.isValid())
            return;

        node = child;
    }

    auto propName = juce::Identifier (parts[parts.size() - 1]);
    node.setProperty (propName, value, &undoManager);
}

juce::String ValueTreeBridge::buildPath (const juce::ValueTree& node, const juce::Identifier& prop) const
{
    juce::StringArray pathParts;
    auto current = node;

    while (current.isValid() && current != tree)
    {
        pathParts.insert (0, current.getType().toString());
        current = current.getParent();
    }

    pathParts.add (prop.toString());
    return pathParts.joinIntoString (".");
}
