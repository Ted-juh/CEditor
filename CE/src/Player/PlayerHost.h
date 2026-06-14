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
    // externalService: when the plugin processor owns the MIDI engine (so it persists window-closed),
    // it passes its service here. nullptr (the standalone) makes PlayerHost own its own.
    explicit PlayerHost (juce::File panelFile = {},
                         ceditor::device::DeviceProfileService* externalService = nullptr);
    ~PlayerHost() override;

    void resized() override;

    // --- Host-parameter sync (M2) ---
    // Called when the user moves a control in the panel (JS "paramChanged"): the plugin sets the
    // matching host parameter so the DAW records automation. Set by the plugin editor.
    std::function<void (const juce::String& parameterId, float value)> onUiParamChange;

    // Push a host-parameter value into the panel UI (automation playback -> on-screen control moves).
    void pushParamToUi (const juce::String& parameterId, float value);

    // The UI is ready and wants the current value of every parameter (re-push them all).
    std::function<void()> onResyncRequest;

private:
    void showStatusMessage (const juce::String& title, const juce::String& message);
    void loadPanelIntoWebView();
    void emitToWebView (const juce::String& eventName, const juce::var& payload);

    juce::File panelFile;
    juce::String panelJson;
    std::unique_ptr<ceditor::device::DeviceProfileService> ownedService; // standalone only
    ceditor::device::DeviceProfileService& service;                      // owned or the processor's
    std::unique_ptr<juce::WebBrowserComponent> webView;
    std::unique_ptr<juce::Label> statusLabel;
};
