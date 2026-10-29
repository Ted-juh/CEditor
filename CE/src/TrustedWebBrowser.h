#pragma once
#include <juce_gui_extra/juce_gui_extra.h>

namespace ceditor
{
class TrustedWebBrowser : public juce::WebBrowserComponent
{
public:
    using juce::WebBrowserComponent::WebBrowserComponent;
    bool pageAboutToLoad (const juce::String& url) override
    {
        if (url.startsWith (getResourceProviderRoot())) return true;
       #if CEDITOR_DEV_MODE
        if (url == "http://localhost:5173" || url.startsWith ("http://localhost:5173/")) return true;
       #endif
        return false;
    }
    void newWindowAttemptingToLoad (const juce::String& url) override
    {
        // External links get an ordinary browser, never the native bridge. The app's own origin
        // is not external: its pages exist only inside this component, so a browser opened on
        // one shows "not found". That is what every link in the documentation did while the
        // renderer gave in-page anchors target="_blank" — refused here too, so a link that still
        // asks for a window on the app's origin (a middle-click, a stray target) does nothing.
        if (isOwnOrigin (url))
            return;

        if (url.startsWith ("https://") || url.startsWith ("http://"))
            juce::URL (url).launchInDefaultBrowser();
    }

    static bool isOwnOrigin (const juce::String& url)
    {
        if (url.startsWith (getResourceProviderRoot())) return true;
       #if CEDITOR_DEV_MODE
        if (url == "http://localhost:5173" || url.startsWith ("http://localhost:5173/")) return true;
       #endif
        return false;
    }
};
}
