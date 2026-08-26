#include "WebViewHost.h"

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

std::optional<juce::WebBrowserComponent::Resource> provideFrontendResource (const juce::String& rawPath)
{
    auto distFolder = getFrontendDistFolder();
    auto path = normaliseRequestPath (rawPath);

    if (! distFolder.getChildFile ("index.html").existsAsFile())
        return path == "/" ? makeMissingFrontendPage() : std::nullopt;

    auto relativePath = path == "/" ? "index.html"
                                    : path.fromFirstOccurrenceOf ("/", false, false);

    if (relativePath.contains (".."))
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

class CEditorWebBrowserComponent final : public juce::WebBrowserComponent
{
public:
    using juce::WebBrowserComponent::WebBrowserComponent;

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
}

WebViewHost::WebViewHost (AppSettings* settings)
{
    bridge.setAppSettings (settings);

    // The instrument host's native editor pane: a reserved region beside the WebView, never
    // overlapping it. Hidden until an editor opens; the split in resized() follows.
    addChildComponent (editorPane);
    editorPane.onLayoutChanged = [this] { resized(); };
    editorPane.onCloseRequested = [this] { bridge.requestInstrumentEditorClose(); };
    bridge.setEditorPane (&editorPane);

    auto webview2Options = juce::WebBrowserComponent::Options::WinWebView2()
        .withBackgroundColour (juce::Colour (0xFF1E1E1E))
        .withStatusBarDisabled();

   #if CEDITOR_DEV_MODE
    auto devWebViewProfile = getDevWebView2ProfileFolder();
    trimDevWebView2Caches (devWebViewProfile);

    // Use a fixed user data folder so we can locate/clear WebView2 cache,
    // and pass flags to disable aggressive caching during development.
    webview2Options = webview2Options
        .withUserDataFolder (devWebViewProfile);
   #else
    auto installedWebViewProfile = getInstalledWebView2ProfileFolder();
    installedWebViewProfile.createDirectory();
    webview2Options = webview2Options
        .withUserDataFolder (installedWebViewProfile);
   #endif

    auto options = juce::WebBrowserComponent::Options()
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withWinWebView2Options (webview2Options);

    // Register bridge event listeners and native functions
    options = bridge.buildOptions (options);

   #if CEDITOR_DEV_MODE
    // In dev mode, allow the Vite dev server as an origin for resource provider access
    options = options.withResourceProvider (
        [] (const juce::String& path)
        {
            return provideFrontendResource (path);
        },
        juce::String ("http://localhost:5173")
    );
   #else
    options = options.withResourceProvider (
        [] (const juce::String& path)
        {
            return provideFrontendResource (path);
        }
    );
   #endif

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
