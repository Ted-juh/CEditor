#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "ValueTreeBridge.h"

/**
 * A component that hosts a WebBrowserComponent and bridges it to a ValueTree.
 * In dev mode, loads from Vite dev server (localhost:5173).
 * In production, serves from the ResourceProvider.
 */
class WebViewHost : public juce::Component
{
public:
    WebViewHost();

    void resized() override;

private:
    ValueTreeBridge bridge;
    std::unique_ptr<juce::WebBrowserComponent> webView;
};
