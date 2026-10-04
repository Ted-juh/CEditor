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
        // External links get an ordinary browser, never the native bridge.
        if (url.startsWith ("https://") || url.startsWith ("http://"))
            juce::URL (url).launchInDefaultBrowser();
    }
};
}
