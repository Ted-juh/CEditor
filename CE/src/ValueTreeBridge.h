#pragma once

#include <juce_data_structures/juce_data_structures.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "DeviceProfile/DeviceProfileService.h"

class AppSettings;

/**
 * Bridges a juce::ValueTree to a WebBrowserComponent via native events.
 *
 * C++ -> JS:  emits "fullState" and "propUpdate" events
 * JS -> C++:  receives "setProperty", "undo", "redo" via event listeners
 *             receives "savePanelAs", "savePanel", "openPanel",
 *             "loadOpenPanels", "updateOpenPanels" for file operations
 *
 * LIFETIME INVARIANT (load-bearing — do not break): the event listeners
 * registered in buildOptions() and the MessageManager::callAsync bodies they
 * queue capture `this` raw. That is safe only while
 *   1. the WebBrowserComponent built from these Options is destroyed BEFORE
 *      this bridge (owners must declare the browser after the bridge, or
 *      reset it first), and
 *   2. both are destroyed on the message thread (so no queued callAsync body
 *      can run after ~ValueTreeBridge mid-teardown).
 * If either ordering ever has to change, switch the captures to a
 * weak alive-token (std::weak_ptr member) checked at the top of each lambda
 * instead of loosening this contract.
 */
class ValueTreeBridge : public juce::ValueTree::Listener
{
public:
    ValueTreeBridge();

    /** Set the AppSettings reference for panel persistence */
    void setAppSettings (AppSettings* s) { appSettings = s; }

    /** Returns WebBrowserComponent::Options with all native functions and event listeners
     *  registered. Chain this into your Options builder before constructing the WebBrowserComponent.
     */
    juce::WebBrowserComponent::Options buildOptions (const juce::WebBrowserComponent::Options& base);

    /** Bind the bridge to a WebBrowserComponent (needed to push events to JS). */
    void connectToWebView (juce::WebBrowserComponent* webView);

    /** Bind to a ValueTree. Replaces any previous binding. */
    void bindToTree (juce::ValueTree newTree);

    /** Push the entire tree state to JS as a "fullState" event. */
    void pushFullState();

    /** Access the underlying tree. */
    juce::ValueTree& getTree() { return tree; }
    juce::UndoManager& getUndoManager() { return undoManager; }

    // -- ValueTree::Listener --
    void valueTreePropertyChanged (juce::ValueTree& treeWhosePropertyHasChanged,
                                   const juce::Identifier& property) override;
    void valueTreeChildAdded (juce::ValueTree& parentTree,
                              juce::ValueTree& childWhichHasBeenAdded) override;
    void valueTreeChildRemoved (juce::ValueTree& parentTree,
                                juce::ValueTree& childWhichHasBeenRemoved,
                                int indexFromWhichChildWasRemoved) override;

private:
    // Convert a ValueTree to a JSON-compatible juce::var (recursive)
    static juce::var treeToVar (const juce::ValueTree& t);

    static bool decodeDataUrlToMemoryBlock (const juce::String& dataUrl, juce::MemoryBlock& out);
    static juce::String renderFontPreviewDataUrl (const juce::String& fontDataUrl,
                                                  const juce::String& familyName,
                                                  const juce::String& styleName,
                                                  const juce::String& text,
                                                  int width,
                                                  int height,
                                                  float fontHeight,
                                                  const juce::String& colourHex,
                                                  const juce::String& justification,
                                                  int paddingLeft,
                                                  int paddingRight,
                                                  int paddingTop,
                                                  int paddingBottom,
                                                  int offsetX,
                                                  int offsetY,
                                                  float letterSpacing,
                                                  bool italic,
                                                  bool underline);
    void emitDebugLog (const juce::String& level, const juce::String& message) const;
    void emitPerfDebug (const juce::String& message) const;

    // Set a property via dot-notation path (e.g., "Text.Fill.colour"). Validates the path and
    // returns a failure (reported to the JS console by the caller) instead of silently no-oping.
    juce::Result setPropertyFromPath (const juce::String& path, const juce::var& value);

    // Start a scripting-toolchain provision ("ensure") or "remove" run for payload.languages, streaming
    // progress to the WebView. Implemented in ValueTreeBridgeHandlers.cpp.
    void runToolchainJob (const juce::var& payload, const juce::String& subcommand);

    // Where installed third-party scripting modules (ce.ext.*) live: one .cemodule file each,
    // under the per-user data dir. Not beside the exe — an installed build puts that under
    // Program Files, which a non-elevated app cannot write to.
    static juce::File scriptModulesDirectory();

    // Read every .cemodule in that directory and emit "scriptModulesListed" to the WebView, which
    // validates them against the API contract and reports whatever it refuses.
    void emitScriptModules() const;

    // Build the dot-notation path for a property change
    juce::String buildPath (const juce::ValueTree& node, const juce::Identifier& prop) const;

    juce::ValueTree tree;
    juce::UndoManager undoManager;
    juce::WebBrowserComponent* browser = nullptr;
    bool suppressOutgoing = false;
    bool perfDebugEnabled = false;

    AppSettings* appSettings = nullptr;
    std::unique_ptr<juce::FileChooser> fileChooser;
    // Active/last in-app VST3 build, held as its Timer base so this header needn't see the concrete
    // VstBuildJob (it lives in the handlers .cpp). Timer has a virtual destructor, so deleting
    // through the base correctly tears down the real job. Busy-state is read via isTimerRunning().
    std::unique_ptr<juce::Timer> buildJob;
    // Active scripting-toolchain provision/remove job (Settings → Scripting Toolchains), held as its
    // Timer base for the same reason as buildJob (the concrete ToolchainJob lives in the handlers .cpp).
    std::unique_ptr<juce::Timer> toolchainJob;
    ceditor::device::DeviceProfileService deviceProfileService;
};
