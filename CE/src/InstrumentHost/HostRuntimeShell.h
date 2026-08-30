#pragma once

#include "HostRuntimeShared.h"
#include "FloatingEditorWindows.h"
#include "PluginEditorHost.h"

// HostRuntimeShell — the generated standalone's whole window content (VIP-successor Stage 1).
//
// The same split WebViewHost gives the editor, without any of the editor: host.html in a
// WebView on the left, the native PluginEditorHost pane on the right, one
// InstrumentHostService between them with audio enabled — the shell IS the Performance
// Runtime, so it opens the default output device and every MIDI input the way the editor's
// preview does, and persists its session per user under its own product directory (never
// CEditor's: the generated product is self-contained, baseline product boundary).
//
// MEMBER ORDER IS THE DESTRUCTION CONTRACT, same as WebViewHost documents: the pane is
// declared last so it is destroyed first, which puts any hosted AudioProcessorEditor in the
// ground before the service's rack destroys the processor it watches. The service precedes
// the WebView for the same reason in the other direction — emits marshalled through
// callAsync check a SafePointer to this component, so a straggler after death is a no-op
// rather than a crash.

namespace ceditor::ctrl49 { class Ctrl49SurfaceBroker; }

namespace ceditor::host
{

class HostRuntimeShell final : public juce::Component,
                               private juce::Timer
{
public:
    HostRuntimeShell();
    ~HostRuntimeShell() override;

    void resized() override;

private:
    // The UI-rate pump for parameter deltas: vendor edits land on audio-thread listeners in
    // the service, and this drains them to the runtime page.
    void timerCallback() override;
    void emitToWebView (const juce::String& eventName, const juce::var& payload);

    juce::AudioPluginFormatManager formatManager;
    std::unique_ptr<juce::FileChooser> fileChooser;
    std::unique_ptr<InstrumentHostService> service;
    // Floating vendor-editor windows — declared after the service so they are destroyed
    // first, before the rack tears the processors down (same contract as the pane's).
    FloatingEditorWindows editorWindows;
    // The CTRL49 broker — the generated product is where the hardware matters most, so the
    // surface comes alive at launch, not on demand. Declared after the service (destroyed
    // first: its teardown releases the hardware claim through the service) and ticked from
    // timerCallback() beside the parameter drain.
    std::unique_ptr<ctrl49::Ctrl49SurfaceBroker> surfaceBroker;
    std::unique_ptr<juce::WebBrowserComponent> webView;
    juce::Label statusLabel;   // only ever visible when WebView2 could not start
    PluginEditorHost editorPane;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HostRuntimeShell)
};

} // namespace ceditor::host
