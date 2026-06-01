#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "DeviceProfile/DeviceProfileService.h"

/**
 * Phase B4 — standalone player host.
 *
 * Hosts a WebBrowserComponent that loads the player frontend (player.html), owns a
 * per-instance DeviceProfileService, and wires the shared device-runtime surface
 * (withDeviceRuntimeEvents) plus a panel-load handshake:
 *   JS Player mounts -> emits "playerReady" -> C++ emits "loadPanel" with the panel doc.
 *
 * No editor concerns (no ValueTreeBridge, undo, file dialogs). This is the runtime that
 * an exported VST3/standalone (Phase C/D) wraps.
 */
class PlayerHost : public juce::Component
{
public:
    explicit PlayerHost (juce::File panelFile = {});

    void resized() override;

private:
    void showStatusMessage (const juce::String& title, const juce::String& message);
    void loadPanelIntoWebView();
    void emitToWebView (const juce::String& eventName, const juce::var& payload);

    juce::File panelFile;
    juce::String panelJson;
    ceditor::device::DeviceProfileService service;
    std::unique_ptr<juce::WebBrowserComponent> webView;
    std::unique_ptr<juce::Label> statusLabel;
};
