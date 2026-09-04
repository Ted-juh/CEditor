#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

// PluginEditorHost — the one native pane that shows a plug-in's own interface (VIP-successor
// Stage 1).
//
// The baseline's rule made concrete: vendor editors are native platform views and stay native
// — this component owns exactly one AudioProcessorEditor at a time in a reserved region
// BESIDE the WebView, never rasterized into it. One reusable host follows the focused part;
// the same ownership path serves a later pop-out.
//
// THE ORDERING INVARIANT. An AudioProcessorEditor must be destroyed before its processor.
// This class enforces its half — hide() and show() destroy the previous editor first, and its
// own destructor releases whatever is up — but the caller owns the other half: the service
// subscribes to InstrumentRackHost::onInstrumentWillBeRemoved and hides this pane before any
// processor dies. Close is not unload: hide() never touches the processor.
//
// A vendor editor picks its own size and may resize itself at will (watched through a
// ComponentListener — it lives inside the viewport, so childBoundsChanged would never see
// it); the pane reports a preferred width and scrolls anything taller than the window
// instead of clipping it. The WebView owner listens on onLayoutChanged and re-splits.

namespace ceditor::host
{

class PluginEditorHost : public juce::Component,
                         private juce::ComponentListener,
                         private juce::Timer
{
public:
    PluginEditorHost();
    ~PluginEditorHost() override;

    /** Shows the processor's own editor, or JUCE's generic parameter editor when it has
        none. Replaces whatever was showing. */
    void show (juce::AudioProcessor& processor, const juce::String& title);

    /** Destroys the editor and hides the pane. The processor is untouched. */
    void hide();

    bool isShowingEditor() const                  { return editor != nullptr; }
    juce::AudioProcessor* currentProcessor() const { return processor; }

    /** The width the pane wants from the window split, chrome included. */
    int preferredWidth() const;

    /** Fired whenever the pane appears, disappears or wants a different width. */
    std::function<void()> onLayoutChanged;

    /** Fired by the pane's own close button — routed through the service so the WebView's
        state stays authoritative rather than the pane closing itself behind its back. */
    std::function<void()> onCloseRequested;

    // -- thumbnail capture ---------------------------------------------------------------
    // Most plug-ins ship no artwork, so their own window is the best picture of them there
    // is, and the moment it is on screen is the only moment it can be had. The pane takes
    // the picture because the pane holds the editor; what it is worth and where it goes is
    // the service's business, which is what these two hooks are for.

    /** Asked shortly after an editor appears: is a picture of this one wanted? Absent, or
        false, and nothing is captured. Separate from the hook below so an already-pictured
        plug-in costs a bool rather than a screen grab. */
    std::function<bool()> shouldCaptureEditor;

    /** The editor's own picture, once it has had time to paint. Never fires with a blank
        image — a plug-in that could not be captured simply produces nothing, and the caller
        keeps whatever it was showing. */
    std::function<void (const juce::Image&)> onEditorPictured;

    void resized() override;
    void paint (juce::Graphics& g) override;

private:
    void componentMovedOrResized (juce::Component&, bool wasMoved, bool wasResized) override;
    void timerCallback() override;

    static constexpr int headerHeight = 28;

    // A plug-in is not finished drawing when its editor is constructed: it may be loading a
    // skin, a sample set or a GPU surface. So the capture waits, and a blank result is
    // retried rather than believed — some editors take seconds, and one that never paints
    // costs three cheap attempts and then nothing at all.
    static constexpr int captureDelaysMs[] { 900, 2200, 4500 };

    int captureAttempt = -1;

    juce::Label titleLabel;
    juce::TextButton closeButton { juce::String::fromUTF8 ("\xc3\x97") };   // multiplication sign
    juce::Viewport viewport;
    std::unique_ptr<juce::AudioProcessorEditor> editor;
    juce::AudioProcessor* processor = nullptr;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginEditorHost)
};

} // namespace ceditor::host
