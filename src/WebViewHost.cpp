#include "WebViewHost.h"

WebViewHost::WebViewHost (AppSettings* settings)
{
    bridge.setAppSettings (settings);

    auto webview2Options = juce::WebBrowserComponent::Options::WinWebView2()
        .withBackgroundColour (juce::Colour (0xFF1E1E1E))
        .withStatusBarDisabled();

   #if CEDITOR_DEV_MODE
    // Use a fixed user data folder so we can locate/clear WebView2 cache,
    // and pass flags to disable aggressive caching during development.
    webview2Options = webview2Options
        .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory)
                                 .getChildFile ("CEditor_WebView2"));
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
