#include "PlayerHost.h"
#include "DeviceProfile/DeviceRuntimeBridge.h"
#include "BinaryData.h" // PlayerWebData — the embedded web bundle (player.html + assets)

#include <atomic>
#include <cstring>
#include <optional>

namespace
{
juce::File getInstalledDistFolder()
{
    return juce::File::getSpecialLocation (juce::File::currentExecutableFile)
        .getParentDirectory()
        .getChildFile ("web")
        .getChildFile ("dist");
}

juce::File getDistFolder()
{
    // Installed layout: web/dist next to the exe.
    auto installed = getInstalledDistFolder();
    if (installed.getChildFile ("player.html").existsAsFile())
        return installed;

    // Build tree: walk up looking for CE/web/dist (or web/dist). The depth differs between
    // the standalone app and the plugin's Standalone wrapper (which nests one level deeper),
    // so don't assume a fixed number of parents.
    auto dir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
    for (int i = 0; i < 8 && dir.getFullPathName().isNotEmpty(); ++i)
    {
        for (auto candidate : { dir.getChildFile ("CE").getChildFile ("web").getChildFile ("dist"),
                                dir.getChildFile ("web").getChildFile ("dist") })
            if (candidate.getChildFile ("player.html").existsAsFile())
                return candidate;

        auto parent = dir.getParentDirectory();
        if (parent == dir) break;
        dir = parent;
    }
    return installed;
}

juce::String mimeFor (const juce::File& file)
{
    auto ext = file.getFileExtension().toLowerCase();
    if (ext == ".html") return "text/html; charset=utf-8";
    if (ext == ".js" || ext == ".mjs") return "application/javascript; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".json" || ext == ".map") return "application/json; charset=utf-8";
    if (ext == ".svg") return "image/svg+xml";
    if (ext == ".png") return "image/png";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".woff2") return "font/woff2";
    if (ext == ".woff") return "font/woff";
    if (ext == ".ttf") return "font/ttf";
    if (ext == ".wasm") return "application/wasm";
    return "application/octet-stream";
}

juce::WebBrowserComponent::Resource makeResource (const void* data, size_t size, juce::String mime)
{
    std::vector<std::byte> bytes (size);
    if (size > 0) std::memcpy (bytes.data(), data, size);
    return { std::move (bytes), std::move (mime) };
}

std::optional<juce::WebBrowserComponent::Resource> providePlayerResource (const juce::String& rawPath)
{
    auto path = rawPath.upToFirstOccurrenceOf ("?", false, false)
                       .upToFirstOccurrenceOf ("#", false, false);
    if (path.isEmpty() || path == "/") path = "/player.html";
    if (path.contains ("..")) return std::nullopt;
    auto basename = path.fromLastOccurrenceOf ("/", false, false);
    if (basename.isEmpty()) basename = "player.html";
    auto mimeFile = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile (basename);

    // Primary: the embedded web bundle. Vite emits unique asset basenames, so a basename
    // lookup is unambiguous. This is host-path-independent — it paints inside any DAW.
    for (int i = 0; i < PlayerWebData::namedResourceListSize; ++i)
    {
        if (juce::String (PlayerWebData::originalFilenames[i]) == basename)
        {
            int size = 0;
            if (auto* data = PlayerWebData::getNamedResource (PlayerWebData::namedResourceList[i], size))
                return makeResource (data, (size_t) size, mimeFor (mimeFile));
        }
    }

    // Fallback: filesystem dist (dev / build tree) if the bundle wasn't embedded.
    auto file = getDistFolder().getChildFile (basename);
    if (file.existsAsFile())
    {
        juce::MemoryBlock blk;
        if (file.loadFileAsData (blk))
            return makeResource (blk.getData(), blk.getSize(), mimeFor (file));
    }
    return std::nullopt;
}

class PlayerWebBrowserComponent final : public juce::WebBrowserComponent
{
public:
    using juce::WebBrowserComponent::WebBrowserComponent;
    std::function<void (const juce::String&)> onNetworkError;

    bool pageLoadHadNetworkError (const juce::String& errorInfo) override
    {
        if (onNetworkError != nullptr) { onNetworkError (errorInfo); return false; }
        return juce::WebBrowserComponent::pageLoadHadNetworkError (errorInfo);
    }
};
}

PlayerHost::PlayerHost (juce::File panelFileToLoad)
    : panelFile (std::move (panelFileToLoad))
{
    if (panelFile.existsAsFile())
        panelFile.loadFileAsString().swapWith (panelJson);

    // Async device events from the service (e.g. incoming MIDI) -> WebView, on the message thread.
    service.setEventCallback ([this] (const juce::String& eventName, const juce::var& payload)
    {
        juce::MessageManager::callAsync ([this, eventName, payload]() { emitToWebView (eventName, payload); });
    });

    // Unique WebView2 user-data folder PER INSTANCE. WebView2 cannot share a folder across
    // processes/instances, so a fixed folder makes a second user (e.g. a plugin loaded while a
    // standalone runs, or two plugin instances) fail to create its WebView -> blank panel.
    static std::atomic<int> instanceCounter { 0 };
    auto userDataFolder = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("CEditorPlayer_WebView2")
        .getChildFile (juce::String::toHexString (juce::Time::getHighResolutionTicks())
                       + "_" + juce::String (++instanceCounter));

    auto webview2Options = juce::WebBrowserComponent::Options::WinWebView2()
        .withBackgroundColour (juce::Colour (0xFF1E1E1E))
        .withStatusBarDisabled()
        .withUserDataFolder (userDataFolder);

    auto options = juce::WebBrowserComponent::Options()
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withWinWebView2Options (webview2Options)
        .withNativeIntegrationEnabled();

    // Shared device-runtime surface (Phase B1), reporting to this player's WebView.
    options = ceditor::device::withDeviceRuntimeEvents (
        std::move (options), service,
        [this] (const juce::String& eventName, const juce::var& payload) { emitToWebView (eventName, payload); });

    // Panel-load handshake: the JS player announces readiness, we push the panel document.
    options = options.withEventListener ("playerReady", [this] (const juce::var&)
    {
        juce::MessageManager::callAsync ([this]() { loadPanelIntoWebView(); });
    });

   #if CEDITOR_DEV_MODE
    options = options.withResourceProvider ([] (const juce::String& path) { return providePlayerResource (path); },
                                            juce::String ("http://localhost:5173"));
   #else
    options = options.withResourceProvider ([] (const juce::String& path) { return providePlayerResource (path); });
   #endif

    if (! juce::WebBrowserComponent::areOptionsSupported (options))
    {
        showStatusMessage ("WebView2 Runtime Unavailable",
                           "CEditor Player could not start the Microsoft Edge WebView2 engine.");
        setSize (800, 480);
        return;
    }

    auto browser = std::make_unique<PlayerWebBrowserComponent> (options);
    browser->onNetworkError = [this] (const juce::String& errorInfo)
    {
        showStatusMessage ("Frontend Load Error", errorInfo);
    };
    webView = std::move (browser);
    addAndMakeVisible (*webView);

   #if CEDITOR_DEV_MODE
    webView->goToURL ("http://localhost:5173/player.html");
   #else
    webView->goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
   #endif

    setSize (800, 480);
}

void PlayerHost::emitToWebView (const juce::String& eventName, const juce::var& payload)
{
    if (webView != nullptr)
        webView->emitEventIfBrowserIsVisible (eventName, payload);
}

void PlayerHost::loadPanelIntoWebView()
{
    if (panelJson.isEmpty() || webView == nullptr)
        return;

    // Hand the panel document to the player frontend. We use evaluateJavascript rather than
    // the native event channel (emitEventIfBrowserIsVisible) because the latter does not
    // deliver reliably in this standalone WebView2 config, whereas evaluateJavascript does.
    // The panel JSON is itself a valid JS object literal, so it can be passed directly.
    webView->evaluateJavascript ("if (window.__CE_LOAD_PANEL__) window.__CE_LOAD_PANEL__(" + panelJson + ");");
}

void PlayerHost::showStatusMessage (const juce::String& title, const juce::String& message)
{
    if (statusLabel == nullptr)
    {
        statusLabel = std::make_unique<juce::Label>();
        statusLabel->setJustificationType (juce::Justification::topLeft);
        statusLabel->setColour (juce::Label::backgroundColourId, juce::Colour (0xFF1E1E1E));
        statusLabel->setColour (juce::Label::textColourId, juce::Colour (0xFFE0E0E0));
        statusLabel->setBorderSize (juce::BorderSize<int> (24));
        addAndMakeVisible (*statusLabel);
    }
    statusLabel->setText (title + "\n\n" + message, juce::dontSendNotification);
    statusLabel->setVisible (true);
    statusLabel->toFront (false);
    resized();
}

void PlayerHost::resized()
{
    if (webView != nullptr)
        webView->setBounds (getLocalBounds());
    if (statusLabel != nullptr)
        statusLabel->setBounds (getLocalBounds());
}
