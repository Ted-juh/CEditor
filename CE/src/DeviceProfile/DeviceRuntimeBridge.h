#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include <functional>

namespace ceditor::device
{
class DeviceProfileService;

/** Emits a (C++ -> JS) event with a payload. The owner decides where it goes
 *  (e.g. the editor's WebView, or the exported player's WebView). */
using DeviceEmitFn = std::function<void (const juce::String&, const juce::var&)>;

/**
 * Phase B1 — shared device-runtime event wiring.
 *
 * Registers the runtime device events (profile/parameter listing, role mapping, MIDI
 * destinations, parameter compile/send, sync, preset scans, bulk dumps, dump parsing,
 * incoming-MIDI ingest, runtime/monitor/diagnostics queries) onto a
 * WebBrowserComponent::Options builder, driving a DeviceProfileService and reporting
 * results through `emit`.
 *
 * This is the seam that lets BOTH the editor bridge and the exported player share one
 * implementation of the device runtime surface — instead of the wiring being locked inside
 * the editor-only ValueTreeBridge. It deliberately omits editor/profile-authoring events
 * (import via file chooser, profile-source editing): a running player consumes profiles, it
 * does not author them.
 *
 * @param options  the builder to extend (taken by value, returned extended)
 * @param service  the device runtime (must outlive the WebView)
 * @param emit     C++ -> JS event sink (should no-op if its target is gone)
 */
juce::WebBrowserComponent::Options withDeviceRuntimeEvents (
    juce::WebBrowserComponent::Options options,
    DeviceProfileService& service,
    DeviceEmitFn emit);
}
