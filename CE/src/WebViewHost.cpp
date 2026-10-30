#include "WebViewHost.h"
#include "TrustedWebBrowser.h"
#include "DocumentationWindow.h"
#include "AppSettings.h"

#include "InstrumentHost/PluginCatalog.h"
#include "PngResourceValidation.h"

#include <cstring>
#include <functional>
#include <optional>

namespace
{
juce::File getDevWebView2ProfileFolder()
{
    return juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("CEditor_WebView2");
}

juce::File getInstalledWebView2ProfileFolder()
{
    return juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
        .getChildFile ("CEditor")
        .getChildFile ("WebView2");
}

void trimDevWebView2Caches (const juce::File& profileFolder)
{
    if (! profileFolder.isDirectory())
        return;

    static const juce::StringArray volatileRelativePaths {
        "EBWebView/Default/Cache",
        "EBWebView/Default/Code Cache",
        "EBWebView/Default/GPUCache",
        "EBWebView/Default/DawnWebGPUCache",
        "EBWebView/Default/DawnGraphiteCache",
        "EBWebView/Default/Service Worker/CacheStorage",
        "EBWebView/Default/blob_storage",
        "EBWebView/GrShaderCache",
        "EBWebView/ShaderCache",
        "EBWebView/GraphiteDawnCache",
        "EBWebView/component_crx_cache",
        "EBWebView/Subresource Filter",
        "EBWebView/Speech Recognition"
    };

    for (const auto& relativePath : volatileRelativePaths)
    {
        auto target = profileFolder.getChildFile (relativePath);

        if (target.exists())
            target.deleteRecursively();
    }

    static const juce::StringArray volatileFiles {
        "EBWebView/BrowserMetrics-spare.pma"
    };

    for (const auto& relativePath : volatileFiles)
    {
        auto target = profileFolder.getChildFile (relativePath);

        if (target.existsAsFile())
            target.deleteFile();
    }
}

juce::File getInstalledFrontendDistFolder()
{
    return juce::File::getSpecialLocation (juce::File::currentExecutableFile)
        .getParentDirectory()
        .getChildFile ("web")
        .getChildFile ("dist");
}

juce::File getBuildTreeFrontendDistFolder()
{
    auto directory = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();

    for (int i = 0; i < 4; ++i)
        directory = directory.getParentDirectory();

    return directory.getChildFile ("CE")
        .getChildFile ("web")
        .getChildFile ("dist");
}

juce::File getFrontendDistFolder()
{
    auto installedDist = getInstalledFrontendDistFolder();

    if (installedDist.getChildFile ("index.html").existsAsFile())
        return installedDist;

    auto buildTreeDist = getBuildTreeFrontendDistFolder();

    if (buildTreeDist.getChildFile ("index.html").existsAsFile())
        return buildTreeDist;

    return installedDist;
}

juce::String normaliseRequestPath (juce::String path)
{
    if (path.isEmpty())
        path = "/";

    path = path.upToFirstOccurrenceOf ("?", false, false);
    path = path.upToFirstOccurrenceOf ("#", false, false);

    if (! path.startsWithChar ('/'))
        path = "/" + path;

    return path;
}

juce::String getMimeTypeForFile (const juce::File& file)
{
    auto extension = file.getFileExtension().toLowerCase();

    if (extension == ".html")
        return "text/html; charset=utf-8";
    if (extension == ".js" || extension == ".mjs")
        return "application/javascript; charset=utf-8";
    if (extension == ".css")
        return "text/css; charset=utf-8";
    if (extension == ".json")
        return "application/json; charset=utf-8";
    if (extension == ".svg")
        return "image/svg+xml";
    if (extension == ".png")
        return "image/png";
    if (extension == ".jpg" || extension == ".jpeg")
        return "image/jpeg";
    if (extension == ".ico")
        return "image/x-icon";
    if (extension == ".woff2")
        return "font/woff2";
    if (extension == ".woff")
        return "font/woff";
    if (extension == ".ttf")
        return "font/ttf";
    if (extension == ".wasm")
        return "application/wasm";
    if (extension == ".map")
        return "application/json; charset=utf-8";

    return "application/octet-stream";
}

juce::WebBrowserComponent::Resource makeResource (const void* data,
                                                  size_t size,
                                                  juce::String mimeType)
{
    std::vector<std::byte> bytes (size);

    if (size > 0)
        std::memcpy (bytes.data(), data, size);

    return { std::move (bytes), std::move (mimeType) };
}

std::optional<juce::WebBrowserComponent::Resource> makeTextResource (const juce::String& text,
                                                                     juce::String mimeType)
{
    auto utf8 = text.toRawUTF8();
    return makeResource (utf8, std::strlen (utf8), std::move (mimeType));
}

std::optional<juce::WebBrowserComponent::Resource> loadFrontendFile (const juce::File& file)
{
    juce::MemoryBlock data;

    if (! file.loadFileAsData (data))
        return std::nullopt;

    return makeResource (data.getData(), data.getSize(), getMimeTypeForFile (file));
}

std::optional<juce::WebBrowserComponent::Resource> makeMissingFrontendPage()
{
    return makeTextResource (R"(
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>CEditor Setup Incomplete</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font-family: "Segoe UI", sans-serif;
        background: #171a21;
        color: #f3f5f7;
      }
      .panel {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 16px;
        background: #232734;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.3);
      }
      code {
        background: rgba(255, 255, 255, 0.08);
        padding: 2px 6px;
        border-radius: 6px;
      }
      li + li {
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>CEditor could not find its packaged frontend.</h1>
      <p>The native executable started, but <code>web/dist/index.html</code> was not found next to the app.</p>
      <ol>
        <li>Run <code>npm run build</code> in <code>CE/web</code>.</li>
        <li>Build the native app with <code>CEDITOR_DEV_MODE=OFF</code>.</li>
        <li>Stage the install files with <code>cmake --install</code> or use <code>tools/scripts/package-installer.ps1</code>.</li>
      </ol>
    </div>
  </body>
</html>
)", "text/html; charset=utf-8");
}

// Plug-in artwork the catalogue has decided is serveable, addressed by token.
//
// The path never leaves the native side: PluginSnapshotRegistry holds token -> file, and this
// serves a token or nothing. So the WebView cannot ask for a file the catalogue did not put
// there, which is the whole point of routing artwork through a registry rather than letting
// the frontend fetch an absolute path.
//
// The service publishes the URL absolute, at the provider root, so this route is reached from a
// dev build's Vite-served page too (a relative one went to Vite and the tiles showed initials).
constexpr const char* snapshotRoutePrefix = "/plugin-snapshot/";

std::optional<juce::WebBrowserComponent::Resource> providePluginSnapshot (const juce::String& path)
{
    // The service spells the provider root out (it is built without the web module too).
    jassert (ceditor::host::PluginSnapshotRegistry::routeUrl ({})
             == juce::WebBrowserComponent::getResourceProviderRoot() + "plugin-snapshot/");

    const auto token = path.fromFirstOccurrenceOf (snapshotRoutePrefix, false, false);
    const auto file = ceditor::host::PluginSnapshotRegistry::instance().resolve (token);

    if (token.isEmpty() || ! file.existsAsFile() || ! file.hasFileExtension ("png"))
        return std::nullopt;

    juce::MemoryBlock data;
    if (! file.loadFileAsData (data)
        || ! ceditor::isSafePngResource (data.getData(), data.getSize()))
        return std::nullopt;

    // Never infer this MIME type from vendor input. The route is image-only even if a file is
    // swapped after publication, so HTML or SVG cannot join the editor page's privileged origin.
    return makeResource (data.getData(), data.getSize(), "image/png");
}

std::optional<juce::WebBrowserComponent::Resource> provideFrontendResource (const juce::String& rawPath)
{
    auto distFolder = getFrontendDistFolder();
    auto path = normaliseRequestPath (rawPath);

    if (path.startsWith (snapshotRoutePrefix))
        return providePluginSnapshot (path);

    if (! distFolder.getChildFile ("index.html").existsAsFile())
        return path == "/" ? makeMissingFrontendPage() : std::nullopt;

    auto relativePath = path == "/" ? "index.html"
                                    : path.fromFirstOccurrenceOf ("/", false, false);

    if (relativePath.contains ("..") || relativePath.containsChar ('\\')
        || relativePath.containsChar (':') || relativePath.startsWithChar ('/'))
        return std::nullopt;

    auto requestedFile = distFolder.getChildFile (relativePath);

    if (requestedFile.isDirectory())
        requestedFile = requestedFile.getChildFile ("index.html");

    if (! requestedFile.existsAsFile() && requestedFile.getFileExtension().isEmpty())
        requestedFile = distFolder.getChildFile ("index.html");

    if (! requestedFile.existsAsFile())
        return std::nullopt;

    return loadFrontendFile (requestedFile);
}

juce::String makeMissingWebView2Message()
{
    return "CEditor could not start the Microsoft Edge WebView2 browser engine.\n\n"
           "Install or repair the Microsoft Edge WebView2 Runtime, then launch the app again.\n\n"
           "Frontend bundle expected at:\n"
           + getFrontendDistFolder().getChildFile ("index.html").getFullPathName();
}

juce::String makeFrontendLoadErrorMessage (const juce::String& errorInfo)
{
    return "The native window opened, but the packaged frontend did not load correctly.\n\n"
           "Browser error:\n"
           + errorInfo
           + "\n\nFrontend bundle root:\n"
           + getFrontendDistFolder().getFullPathName();
}

class CEditorWebBrowserComponent final : public ceditor::TrustedWebBrowser
{
public:
    using ceditor::TrustedWebBrowser::TrustedWebBrowser;

    std::function<void (const juce::String&)> onPageFinishedLoading;
    std::function<void (const juce::String&)> onNetworkError;

    void pageFinishedLoading (const juce::String& url) override
    {
        if (onPageFinishedLoading != nullptr)
            onPageFinishedLoading (url);

        juce::WebBrowserComponent::pageFinishedLoading (url);
    }

    bool pageLoadHadNetworkError (const juce::String& errorInfo) override
    {
        if (onNetworkError != nullptr)
        {
            onNetworkError (errorInfo);
            return false;
        }

        return juce::WebBrowserComponent::pageLoadHadNetworkError (errorInfo);
    }
};

juce::WebBrowserComponent::Options::WinWebView2 makeWebView2Options()
{
    auto webview2Options = juce::WebBrowserComponent::Options::WinWebView2()
        .withBackgroundColour (juce::Colour (0xFF1E1E1E))
        .withStatusBarDisabled();

   #if CEDITOR_DEV_MODE
    // Use a fixed user data folder so we can locate/clear WebView2 cache,
    // and pass flags to disable aggressive caching during development.
    return webview2Options.withUserDataFolder (getDevWebView2ProfileFolder());
   #else
    auto installedWebViewProfile = getInstalledWebView2ProfileFolder();
    installedWebViewProfile.createDirectory();
    return webview2Options.withUserDataFolder (installedWebViewProfile);
   #endif
}

// What every browser on the editor's origin starts from: the backend, the WebView2 profile and
// the resource provider. The editor's own page adds the bridge to it; the documentation window
// adds its one event and nothing else. One function, so the two cannot disagree about the
// profile — WebView2 refuses a second environment on one profile with different options.
juce::WebBrowserComponent::Options makeEditorOriginOptions()
{
    // Ask for WebView2 by name only where it exists. Everywhere else JUCE's areOptionsSupported
    // answers true for the platform default alone (WebKitGTK on Linux, WKWebView on macOS) and
    // false for any named backend - so naming webview2 there is not "try WebView2", it is
    // "show the missing-runtime message and stop". The bridge is JUCE's own window.__JUCE__
    // integration on every backend, so nothing above this line cares which one it got.
    auto options = juce::WebBrowserComponent::Options()
       #if JUCE_WINDOWS
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
       #endif
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withWinWebView2Options (makeWebView2Options());

   #if CEDITOR_DEV_MODE
    // In dev mode, allow the Vite dev server as an origin for resource provider access
    return options.withResourceProvider (
        [] (const juce::String& path)
        {
            return provideFrontendResource (path);
        },
        juce::String ("http://localhost:5173")
    );
   #else
    return options.withResourceProvider (
        [] (const juce::String& path)
        {
            return provideFrontendResource (path);
        }
    );
   #endif
}

/** Where the editor's pages are served from, with the trailing slash. */
juce::String editorOrigin()
{
   #if CEDITOR_DEV_MODE
    return "http://localhost:5173/";
   #else
    return juce::WebBrowserComponent::getResourceProviderRoot();
   #endif
}

juce::String stringProperty (const juce::var& payload, const char* name)
{
    if (auto* object = payload.getDynamicObject())
        return object->getProperty (name).toString();
    return {};
}
}

WebViewHost::WebViewHost (AppSettings* settings)
    : appSettings (settings)
{
    bridge.setAppSettings (settings);

    // The instrument host's native editor pane: a reserved region beside the WebView, never
    // overlapping it. Hidden until an editor opens; the split in resized() follows.
    addChildComponent (editorPane);
    editorPane.onLayoutChanged = [this] { resized(); };
    editorPane.onCloseRequested = [this] (const juce::String& targetId)
    {
        bridge.requestInstrumentEditorClose (targetId);
    };
    bridge.setEditorPane (&editorPane);

   #if CEDITOR_DEV_MODE
    trimDevWebView2Caches (getDevWebView2ProfileFolder());
   #endif

    // Register bridge event listeners and native functions
    auto options = bridge.buildOptions (makeEditorOriginOptions());

    // The manual's own window. Not the bridge's business: it is a window of this host's, like the
    // editor pane, and the page that asks for it needs nothing back.
    juce::Component::SafePointer<WebViewHost> safeThis (this);
    options = options.withEventListener ("openDocumentationWindow", [safeThis] (const juce::var& payload)
    {
        const auto doc = stringProperty (payload, "doc");
        const auto anchor = stringProperty (payload, "anchor");
        juce::MessageManager::callAsync ([safeThis, doc, anchor]
        {
            if (safeThis != nullptr)
                safeThis->openDocumentationWindow (doc, anchor);
        });
    });

    // The interface size, Settings → General. The page sends it when it has read its settings and
    // whenever it changes; WebView2's own Ctrl+wheel zoom is off (JUCE/VENDORED.md, patch 10).
    options = options.withEventListener ("setInterfaceZoom", [safeThis] (const juce::var& payload)
    {
        const auto factor = juce::jlimit (0.5, 2.0, payload.isObject() ? (double) payload.getProperty ("factor", 1.0) : 1.0);
        juce::MessageManager::callAsync ([safeThis, factor]
        {
            if (safeThis != nullptr && safeThis->webView != nullptr)
                safeThis->webView->setZoomFactor (factor);
        });
    });

    if (! juce::WebBrowserComponent::areOptionsSupported (options))
    {
        showStatusMessage ("WebView2 Runtime Unavailable", makeMissingWebView2Message());
        setSize (1280, 720);
        return;
    }

    auto browser = std::make_unique<CEditorWebBrowserComponent> (options);
    browser->onPageFinishedLoading = [this] (const juce::String&)
    {
        if (statusLabel != nullptr)
            statusLabel->setVisible (false);
    };
    browser->onNetworkError = [this] (const juce::String& errorInfo)
    {
        showStatusMessage ("Frontend Load Error", makeFrontendLoadErrorMessage (errorInfo));
    };

    webView = std::move (browser);
    addAndMakeVisible (*webView);

    bridge.connectToWebView (webView.get());

   #if CEDITOR_DEV_MODE
    webView->goToURL ("http://localhost:5173");
   #else
    webView->goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
   #endif

    setSize (1280, 720);
}

void WebViewHost::showStatusMessage (const juce::String& title, const juce::String& message)
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

void WebViewHost::resized()
{
    auto area = getLocalBounds();

    if (editorPane.isVisible())
    {
        // The editor's own width, clamped so a huge vendor UI cannot squeeze the WebView out
        // of existence — anything wider scrolls inside the pane's viewport.
        const auto paneWidth = juce::jlimit (280, juce::jmax (280, area.getWidth() / 2),
                                             editorPane.preferredWidth());
        editorPane.setBounds (area.removeFromRight (paneWidth));
    }

    if (webView != nullptr)
        webView->setBounds (area);

    if (statusLabel != nullptr)
        statusLabel->setBounds (getLocalBounds());
}

WebViewHost::~WebViewHost()
{
    // A window still open when the program quits is remembered where it was, like the main one.
    closeDocumentationWindow();
}

void WebViewHost::openDocumentationWindow (const juce::String& doc, const juce::String& anchor)
{
    if (documentationWindow != nullptr)
    {
        documentationWindow->showDocument (doc, anchor);
        return;
    }

    juce::Component::SafePointer<WebViewHost> safeThis (this);

    auto options = makeEditorOriginOptions()
        .withNativeIntegrationEnabled()
        .withEventListener ("dockDocumentation", [safeThis] (const juce::var& payload)
        {
            const auto doc = stringProperty (payload, "doc");
            const auto anchor = stringProperty (payload, "anchor");
            // Not from inside the window's own browser callback: docking destroys that browser.
            juce::MessageManager::callAsync ([safeThis, doc, anchor]
            {
                if (safeThis != nullptr)
                    safeThis->dockDocumentation (doc, anchor);
            });
        });

    if (! juce::WebBrowserComponent::areOptionsSupported (options))
        return;

    const auto savedBounds = appSettings != nullptr ? appSettings->getDocumentationWindowBounds()
                                                    : juce::Rectangle<int>();

    documentationWindow = std::make_unique<ceditor::DocumentationWindow> (
        options,
        ceditor::DocumentationWindow::pageUrl (editorOrigin(), doc, anchor),
        savedBounds,
        [safeThis]
        {
            juce::MessageManager::callAsync ([safeThis]
            {
                if (safeThis != nullptr)
                    safeThis->closeDocumentationWindow();
            });
        });
}

void WebViewHost::closeDocumentationWindow()
{
    if (documentationWindow == nullptr)
        return;

    if (appSettings != nullptr && ! documentationWindow->isMinimised())
        appSettings->setDocumentationWindowBounds (documentationWindow->getBounds());

    documentationWindow.reset();
}

void WebViewHost::dockDocumentation (const juce::String& doc, const juce::String& anchor)
{
    closeDocumentationWindow();

    if (webView != nullptr)
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("doc", doc);
        payload->setProperty ("anchor", anchor);
        webView->emitEventIfBrowserIsVisible ("documentationDocked", juce::var (payload));
    }

    if (auto* top = getTopLevelComponent())
        top->toFront (true);
}
