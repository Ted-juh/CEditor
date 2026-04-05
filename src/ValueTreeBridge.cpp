#include "ValueTreeBridge.h"
#include "AppSettings.h"

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
        })
        .withEventListener ("closeApplication", [] (const juce::var&)
        {
            juce::MessageManager::callAsync ([]()
            {
                juce::JUCEApplication::getInstance()->systemRequestedQuit();
            });
        })
        .withEventListener ("savePanelAs", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto panelId = payloadObj->getProperty ("panelId").toString();
                auto jsonData = payloadObj->getProperty ("data").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Save Panel As",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanel");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::warnAboutOverwriting,
                    [this, panelId, jsonData] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File())
                            return;

                        auto file = result.withFileExtension ("cepanel");
                        file.replaceWithText (jsonData);

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("panelId", panelId);
                        obj->setProperty ("filePath", file.getFullPathName());
                        obj->setProperty ("name", file.getFileNameWithoutExtension());

                        browser->emitEventIfBrowserIsVisible ("panelSaved", juce::var (obj));
                    });
            });
        })
        .withEventListener ("savePanel", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = payload.getDynamicObject();
                if (obj == nullptr)
                    return;

                auto panelId = obj->getProperty ("panelId").toString();
                auto filePath = obj->getProperty ("filePath").toString();
                auto jsonData = obj->getProperty ("data").toString();

                juce::File file (filePath);
                file.replaceWithText (jsonData);

                auto* resp = new juce::DynamicObject();
                resp->setProperty ("panelId", panelId);
                resp->setProperty ("filePath", filePath);

                browser->emitEventIfBrowserIsVisible ("panelSaved", juce::var (resp));
            });
        })
        .withEventListener ("openPanel", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Open Panel",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanel");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto jsonData = result.loadFileAsString();

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("filePath", result.getFullPathName());
                        obj->setProperty ("name", result.getFileNameWithoutExtension());
                        obj->setProperty ("data", jsonData);

                        browser->emitEventIfBrowserIsVisible ("panelOpened", juce::var (obj));
                    });
            });
        })
        .withEventListener ("openPanelFile", [this] (const juce::var& payload)
        {
            // Open a specific panel file by path (used for restoring session)
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto filePath = payloadObj->getProperty ("filePath").toString();
                juce::File file (filePath);

                if (! file.existsAsFile())
                    return;

                auto jsonData = file.loadFileAsString();

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("filePath", filePath);
                obj->setProperty ("name", file.getFileNameWithoutExtension());
                obj->setProperty ("data", jsonData);

                browser->emitEventIfBrowserIsVisible ("panelOpened", juce::var (obj));
            });
        })
        .withEventListener ("requestFileInfo", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto filePath = payloadObj->getProperty ("filePath").toString();
                juce::File file (filePath);

                if (! file.existsAsFile())
                    return;

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("filePath", filePath);
                obj->setProperty ("size", (juce::int64) file.getSize());
                obj->setProperty ("created", file.getCreationTime().toISO8601 (true));
                obj->setProperty ("modified", file.getLastModificationTime().toISO8601 (true));

                browser->emitEventIfBrowserIsVisible ("fileInfo", juce::var (obj));
            });
        })
        .withEventListener ("requestFileData", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();
                auto filePath = payloadObj->getProperty ("filePath").toString();

                juce::File file (filePath);
                if (! file.existsAsFile())
                    return;

                juce::MemoryBlock mb;
                file.loadFileAsData (mb);

                auto base64 = juce::Base64::toBase64 (mb.getData(), mb.getSize());

                // Determine MIME type from extension
                auto ext = file.getFileExtension().toLowerCase();
                juce::String mimeType = "image/png";
                if (ext == ".jpg" || ext == ".jpeg") mimeType = "image/jpeg";
                else if (ext == ".gif") mimeType = "image/gif";
                else if (ext == ".bmp") mimeType = "image/bmp";
                else if (ext == ".svg") mimeType = "image/svg+xml";
                else if (ext == ".webp") mimeType = "image/webp";

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("requestId", requestId);
                obj->setProperty ("data", "data:" + mimeType + ";base64," + base64);

                browser->emitEventIfBrowserIsVisible ("fileData", juce::var (obj));
            });
        })
        .withEventListener ("browseImage", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Select Image",
                    juce::File::getSpecialLocation (juce::File::userPicturesDirectory),
                    "*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.svg;*.webp");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this, requestId] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("requestId", requestId);
                        obj->setProperty ("filePath", result.getFullPathName());

                        browser->emitEventIfBrowserIsVisible ("imageBrowsed", juce::var (obj));
                    });
            });
        })
        .withEventListener ("loadOpenPanels", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr || appSettings == nullptr)
                    return;

                auto paths = appSettings->getOpenPanelPaths();
                juce::Array<juce::var> arr;

                for (const auto& path : paths)
                    arr.add (path);

                browser->emitEventIfBrowserIsVisible ("openPanelPaths", arr);
            });
        })
        .withEventListener ("updateOpenPanels", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (appSettings == nullptr)
                    return;

                juce::StringArray paths;

                if (auto* arr = payload.getArray())
                {
                    for (const auto& item : *arr)
                        paths.add (item.toString());
                }

                appSettings->setOpenPanelPaths (paths);
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
