#include "WebViewHost.h"

namespace
{
juce::File getDevWebView2ProfileFolder()
{
    return juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("CEditor_WebView2");
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
}

WebViewHost::WebViewHost (AppSettings* settings)
{
    bridge.setAppSettings (settings);

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
        [] (const juce::String&) -> std::optional<juce::WebBrowserComponent::Resource>
        {
            return std::nullopt; // No resources served in dev mode
        },
        juce::String ("http://localhost:5173")
    );
   #endif

    webView = std::make_unique<juce::WebBrowserComponent> (options);
    addAndMakeVisible (*webView);

    bridge.connectToWebView (webView.get());

   #if CEDITOR_DEV_MODE
    webView->goToURL ("http://localhost:5173");
   #else
    webView->goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
   #endif

    setSize (1280, 720);
}

void WebViewHost::resized()
{
    if (webView != nullptr)
        webView->setBounds (getLocalBounds());
}
