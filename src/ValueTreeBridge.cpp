#include "ValueTreeBridge.h"

ValueTreeBridge::ValueTreeBridge()
{
    // Create a sample tree to test with
    tree = juce::ValueTree ("Control");
    tree.setProperty ("controlType", "Button", nullptr);
    tree.setProperty ("name", "TestButton", nullptr);

    // Nested children with uniform property names
    juce::ValueTree identity ("Identity");
    identity.setProperty ("x", 50, nullptr);
    identity.setProperty ("y", 50, nullptr);
    identity.setProperty ("width", 120, nullptr);
    identity.setProperty ("height", 40, nullptr);
    identity.setProperty ("visible", true, nullptr);
    identity.setProperty ("enabled", true, nullptr);
    tree.appendChild (identity, nullptr);

    juce::ValueTree bg ("Background");
    bg.setProperty ("mode", "solid", nullptr);
    juce::ValueTree bgFill ("Fill");
    bgFill.setProperty ("colour", "FF3A3A3A", nullptr);
    bg.appendChild (bgFill, nullptr);
    tree.appendChild (bg, nullptr);

    juce::ValueTree text ("Text");
    text.setProperty ("content", "Click Me", nullptr);

    juce::ValueTree textFill ("Fill");
    textFill.setProperty ("mode", "solid", nullptr);
    textFill.setProperty ("colour", "FFFFFFFF", nullptr);
    text.appendChild (textFill, nullptr);

    juce::ValueTree font ("Font");
    font.setProperty ("family", "Arial", nullptr);
    font.setProperty ("weight", "Regular", nullptr);
    font.setProperty ("style", "Normal", nullptr);
    font.setProperty ("size", 14, nullptr);
    text.appendChild (font, nullptr);

    juce::ValueTree position ("Position");
    position.setProperty ("justification", "centred", nullptr);
    position.setProperty ("paddingLeft", 4, nullptr);
    position.setProperty ("paddingRight", 4, nullptr);
    position.setProperty ("paddingTop", 2, nullptr);
    position.setProperty ("paddingBottom", 2, nullptr);
    text.appendChild (position, nullptr);

    tree.appendChild (text, nullptr);

    juce::ValueTree border ("Border");
    border.setProperty ("enabled", true, nullptr);
    border.setProperty ("style", "solid", nullptr);

    juce::ValueTree borderFill ("Fill");
    borderFill.setProperty ("colour", "FF888888", nullptr);
    border.appendChild (borderFill, nullptr);

    juce::ValueTree corners ("Corners");
    corners.setProperty ("radius", 6, nullptr);
    border.appendChild (corners, nullptr);

    tree.appendChild (border, nullptr);

    tree.addListener (this);
}

juce::WebBrowserComponent::Options ValueTreeBridge::buildOptions (
    const juce::WebBrowserComponent::Options& base)
{
    auto options = base
        .withNativeIntegrationEnabled()
        .withEventListener ("setProperty", [this] (const juce::var& payload)
        {
            if (auto* obj = payload.getDynamicObject())
            {
                auto path = obj->getProperty ("path").toString();
                auto value = obj->getProperty ("value");

                juce::MessageManager::callAsync ([this, path, value]()
                {
                    suppressOutgoing = true;
                    setPropertyFromPath (path, value);
                    suppressOutgoing = false;
                });
            }
        })
        .withEventListener ("requestFullState", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]() { pushFullState(); });
        })
        .withEventListener ("undo", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                undoManager.undo();
            });
        })
        .withEventListener ("redo", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                undoManager.redo();
            });
        });

    return options;
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
    auto json = juce::JSON::toString (state, true);

    browser->emitEventIfBrowserIsVisible ("fullState", state);
}

// -- ValueTree::Listener callbacks --

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

// -- Helpers --

juce::var ValueTreeBridge::treeToVar (const juce::ValueTree& t)
{
    auto* obj = new juce::DynamicObject();

    obj->setProperty ("_type", t.getType().toString());

    // Properties
    for (int i = 0; i < t.getNumProperties(); ++i)
    {
        auto propName = t.getPropertyName (i);
        obj->setProperty (propName, t[propName]);
    }

    // Children
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
    // Path format: "ChildType.SubChild.propertyName"
    // e.g., "Text.Fill.colour" means tree -> child "Text" -> child "Fill" -> property "colour"

    juce::StringArray parts;
    parts.addTokens (path, ".", "");

    if (parts.isEmpty())
        return;

    auto node = tree;

    // Navigate to the correct child node (all parts except the last)
    for (int i = 0; i < parts.size() - 1; ++i)
    {
        auto childType = juce::Identifier (parts[i]);
        auto child = node.getChildWithName (childType);

        if (! child.isValid())
            return; // Path doesn't exist

        node = child;
    }

    // Set the property (last part of the path)
    auto propName = juce::Identifier (parts[parts.size() - 1]);
    node.setProperty (propName, value, &undoManager);
}

juce::String ValueTreeBridge::buildPath (const juce::ValueTree& node,
                                          const juce::Identifier& prop) const
{
    juce::StringArray pathParts;

    // Walk up from node to tree root, collecting type names
    auto current = node;

    while (current.isValid() && current != tree)
    {
        pathParts.insert (0, current.getType().toString());
        current = current.getParent();
    }

    pathParts.add (prop.toString());

    return pathParts.joinIntoString (".");
}
