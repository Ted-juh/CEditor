#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "ValueTreeBridge.h"
#include "InstrumentHost/PluginEditorHost.h"

/**
 * A component that hosts a WebBrowserComponent and bridges it to a ValueTree.
 * In dev mode, loads from Vite dev server (localhost:5173).
 * In production, serves from the ResourceProvider.
 */
class AppSettings;

class WebViewHost : public juce::Component
{
public:
    WebViewHost (AppSettings* settings = nullptr);

    void resized() override;

private:
    void showStatusMessage (const juce::String& title, const juce::String& message);

    ValueTreeBridge bridge;
    // Declared after the bridge ON PURPOSE: members destroy in reverse order, so the pane —
    // and any plug-in editor it holds — is gone before the bridge's instrument host destroys
    // the processors those editors watch. The webView below stays after the bridge for the
    // lifetime invariant ValueTreeBridge.h documents.
    ceditor::host::PluginEditorHost editorPane;
    std::unique_ptr<juce::WebBrowserComponent> webView;
    std::unique_ptr<juce::Label> statusLabel;
};
