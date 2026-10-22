#include "PlayerHost.h"
#include "WebViewProfileFolders.h"
#include "TrustedWebBrowser.h"
#include "DeviceProfile/DeviceRuntimeBridge.h"
#include "EmbeddedWebBundle.h" // PlayerWebData — the embedded web bundle (player.html + assets)
#include "HostKeyForwarding.h"

#include <atomic>
#include <cstring>
#include <optional>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#endif

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
    if (auto bytes = ceditor::embeddedWebFile (basename))
        return juce::WebBrowserComponent::Resource { std::move (*bytes), mimeFor (mimeFile) };

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

class PlayerWebBrowserComponent final : public ceditor::TrustedWebBrowser
{
public:
    using ceditor::TrustedWebBrowser::TrustedWebBrowser;
    std::function<void (const juce::String&)> onNetworkError;

    bool pageLoadHadNetworkError (const juce::String& errorInfo) override
    {
        if (onNetworkError != nullptr) { onNetworkError (errorInfo); return false; }
        return juce::WebBrowserComponent::pageLoadHadNetworkError (errorInfo);
    }
};
}

PlayerHost::PlayerHost (juce::File panelFileToLoad, ceditor::device::DeviceProfileService* externalService)
    : panelFile (std::move (panelFileToLoad)),
      ownedService (externalService != nullptr ? nullptr
                                               : std::make_unique<ceditor::device::DeviceProfileService>()),
      service (externalService != nullptr ? *externalService : *ownedService)
{
    if (panelFile.existsAsFile())
        panelFile.loadFileAsString().swapWith (panelJson);

    // Async device events from the service (e.g. incoming MIDI) -> WebView, on the message thread.
    // The service may now outlive this host (the processor owns it), so guard with a SafePointer.
    service.setEventCallback ([safe = juce::Component::SafePointer<PlayerHost> (this)]
                              (const juce::String& eventName, const juce::var& payload)
    {
        juce::MessageManager::callAsync ([safe, eventName, payload]()
        {
            if (safe != nullptr) safe->emitToWebView (eventName, payload);
        });
    });

    // Never a fixed WebView2 user-data folder: one a second process also used (a plug-in loaded
    // while a standalone ran) failed to create its WebView -> blank panel. The folder is this
    // process's and this binary's, shared by its copies so they share one engine, or one per
    // window with CEDITOR_WEBVIEW2_SHARED=0; the folders processes that have gone left behind are
    // swept (WebViewProfileFolders.h).
    auto userDataFolder = ceditor::webview::profileFolderForNewWebView ("CEditorPlayer_WebView2");

    auto webview2Options = juce::WebBrowserComponent::Options::WinWebView2()
        .withBackgroundColour (juce::Colour (0xFF1E1E1E))
        .withStatusBarDisabled()
        .withUserDataFolder (userDataFolder);

    // WebView2 by name on Windows only, as WebViewHost.cpp does for the app: elsewhere JUCE accepts
    // the platform default alone, and naming webview2 there means the missing-runtime message
    // instead of the panel (WebKitGTK on Linux; the bridge is window.__JUCE__ on every backend).
    auto options = juce::WebBrowserComponent::Options()
       #if JUCE_WINDOWS
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
       #endif
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withWinWebView2Options (webview2Options)
        .withNativeIntegrationEnabled();

    // Shared device-runtime surface (Phase B1), reporting to this player's WebView.
    options = ceditor::device::withDeviceRuntimeEvents (
        std::move (options), service,
        [safe = juce::Component::SafePointer<PlayerHost> (this)] (const juce::String& eventName, const juce::var& payload)
        { if (safe != nullptr) safe->emitToWebView (eventName, payload); });

    // Panel-load handshake: the JS player announces readiness, we push the panel document.
    // The load is posted, and the host can be closed before it runs (release audit X-02): the same
    // SafePointer the device events above use, so a late post finds nothing to load into.
    options = options.withEventListener ("playerReady", [safe = juce::Component::SafePointer<PlayerHost> (this)] (const juce::var&)
    {
        juce::MessageManager::callAsync ([safe]()
        {
            if (safe != nullptr && safe->onWebViewStage != nullptr) safe->onWebViewStage ("page ready");
            if (safe != nullptr) safe->loadPanelIntoWebView();
        });
    });

    // Host-parameter sync (M2): the user moved a control -> set the matching host parameter so the
    // DAW records automation. Runs on the message thread.
    options = options.withEventListener ("paramChanged", [this] (const juce::var& payload)
    {
        if (onUiParamChange != nullptr)
            onUiParamChange (payload.getProperty ("id", "").toString(),
                             (float) (double) payload.getProperty ("value", 0.0));
    });

    // The JS player finished loading the panel and wants every parameter's current value pushed
    // (so the on-screen controls reflect a restored/automated state on open).
    options = options.withEventListener ("requestParamSync", [this] (const juce::var&)
    {
        if (onWebViewStage != nullptr) onWebViewStage ("panel shown");
        if (onResyncRequest != nullptr) onResyncRequest();
        if (! hostWindowShown) sendHostWindow();   // a page loaded behind a minimised host
    });

    // A ce.storage write the page made (scriptStores, in PlayerHost.h).
    options = options.withEventListener ("scriptSetting", [this] (const juce::var& payload)
    {
        if (onScriptSetting != nullptr) onScriptSetting (payload);
    });

    // The answer to the restore question: "always", "never", or "load" (take the synth's patch
    // instead). "Not now" simply dismisses the bar, because a restore the user deferred is still
    // pending and should be offered again next time the project opens.
    options = options.withEventListener ("restoreAnswer", [this] (const juce::var& payload)
    {
        if (onRestoreAnswer != nullptr)
            onRestoreAnswer (payload.getProperty ("answer", "").toString());
    });

    // A key the page did not use, for the DAW (utils/hostKeys.js, HostKeyForwarding.h).
    options = options.withEventListener ("hostKey", [this] (const juce::var& payload)
    {
        forwardKeyToHost (payload);
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

    webViewProfileName = userDataFolder.getFileName();
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

   #if JUCE_WINDOWS
    startTimerHz (4);   // whether the host's window is showing ours (timerCallback)
   #endif

    setSize (800, 480);
}

void PlayerHost::timerCallback()
{
   #if JUCE_WINDOWS
    // In a plug-in this window is a child of the host's, and Windows tells a child nothing when the
    // top-level window is minimised, nor when a host hides its plug-in window, so the page goes on
    // drawing for nobody (release checks #17: sixty frames a second through 30 s minimised). The
    // page is TOLD, and nothing is hidden: a hidden webview drops every event sent to it, and a
    // hidden page gets no frames and runs its timers once a second, while with the window open it
    // is what drives free-running modulators, scripts' timers and automation out to the hardware.
    // Told, the page stops redrawing what cannot be seen and carries on with the rest
    // (stores/hostWindow.js).
    auto* peer = webView != nullptr ? getPeer() : nullptr;
    if (peer == nullptr)
        return;
    const auto window = static_cast<HWND> (peer->getNativeHandle());
    const auto top = GetAncestor (window, GA_ROOT);
    const bool shown = IsWindowVisible (window) && ! (top != nullptr && IsIconic (top));
    if (shown != hostWindowShown)
    {
        hostWindowShown = shown;
        sendHostWindow();
    }
   #endif
}

bool PlayerHost::keysGoToHost() const
{
   #if JUCE_WINDOWS
    return forwardKeysToHost;
   #else
    // A host off Windows already gets the keys an embedded view leaves (X11), or has a responder
    // chain of its own (macOS): docs/known-issues.md. The page keeps its keys there.
    return false;
   #endif
}

void PlayerHost::forwardKeyToHost (const juce::var& payload)
{
   #if JUCE_WINDOWS
    if (! keysGoToHost())
        return;
    const auto key = ceditor::player::hostkeys::keyEventFromPage (payload);
    auto* peer = key ? getPeer() : nullptr;
    if (peer != nullptr)
        ceditor::player::hostkeys::postToParentWindow (static_cast<HWND> (peer->getNativeHandle()), *key);
   #else
    juce::ignoreUnused (payload);
   #endif
}

void PlayerHost::sendHostWindow()
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("shown", hostWindowShown);
    emitToWebView ("hostWindow", juce::var (obj));
}

PlayerHost::~PlayerHost()
{
    // Stop the (possibly processor-owned, longer-lived) service from calling back into this host.
    service.setEventCallback (nullptr);
}

void PlayerHost::showRestorePrompt (const juce::String& deviceName)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("deviceName", deviceName);
    emitToWebView ("restorePrompt", juce::var (obj));
}

void PlayerHost::notifySessionRestored()
{
    emitToWebView ("sessionRestored", juce::var (new juce::DynamicObject()));
}

void PlayerHost::emitToWebView (const juce::String& eventName, const juce::var& payload)
{
    // The player shows no MIDI monitor, so it is sent none of it. When every MIDI message pushed the
    // whole log, up to 500 events and about 120 KB of JSON at up to 20 a second, a panel whose
    // controls send MIDI as they move (QA-08's free-running ones send 17 messages a second) had each
    // window compile and parse 2 MB a second of a log nothing on the page reads: release checks #17
    // watched it from inside the page, and it was most of what grew. The service now sends only
    // what is new, but nothing here reads that either.
    if (eventName == "midiMonitorEvents")
        return;
    if (webView != nullptr)
        webView->emitEventIfBrowserIsVisible (eventName, payload);
}

void PlayerHost::pushParamToUi (const juce::String& parameterId, float value)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("id", parameterId);
    obj->setProperty ("value", value);
    emitToWebView ("paramSync", juce::var (obj));
}

void PlayerHost::pushHostTransport (const HostTransport& t)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("isPlaying", t.playing);
    obj->setProperty ("isRecording", t.recording);
    // Only set what the host actually gave us. An absent property reads as undefined in
    // JS, which parseHostPosition() reports as null; sending 0.0 instead would make a host
    // that hasn't reported a tempo yet look like a host running at 0 bpm.
    if (t.hasTempo)   obj->setProperty ("bpm", t.bpm);
    if (t.hasPpq)     obj->setProperty ("ppqPosition", t.ppqPosition);
    if (t.hasTimeSig)
    {
        obj->setProperty ("timeSigNumerator", t.timeSigNumerator);
        obj->setProperty ("timeSigDenominator", t.timeSigDenominator);
    }
    emitToWebView ("hostTransport", juce::var (obj));
}

void PlayerHost::loadPanelIntoWebView()
{
    if (panelJson.isEmpty() || webView == nullptr)
        return;

    // Hand the panel document to the player frontend. We use evaluateJavascript rather than
    // the native event channel (emitEventIfBrowserIsVisible) because the latter does not
    // deliver reliably in this standalone WebView2 config, whereas evaluateJavascript does.
    // The panel JSON is itself a valid JS object literal, so it can be passed directly.
    // Before the panel, so the Player knows at connect time whether this is a reopened project,
    // whose saved sound must not be read over, or a new instance, which reads the synth.
    // The instance's ce.storage stores go with it, when there is an instance to have them.
    // And whether the keys it does not use go to the host (utils/hostKeys.js).
    const bool restored = isSessionRestored != nullptr && isSessionRestored();
    const auto stores = scriptStores != nullptr ? juce::JSON::toString (scriptStores(), true) : juce::String ("null");
    webView->evaluateJavascript (juce::String ("window.__CE_PLAYER_SESSION__ = { restored: ")
                                 + (restored ? "true" : "false") + ", storage: " + stores
                                 + ", hostKeys: " + (keysGoToHost() ? "true" : "false") + " };"
                                 + "if (window.__CE_LOAD_PANEL__) window.__CE_LOAD_PANEL__(" + panelJson + ");");
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
