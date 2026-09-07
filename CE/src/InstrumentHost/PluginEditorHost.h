#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <vector>

// PluginEditorHost — Hostage's native pane for plug-in interfaces.
//
// Each loaded target gets one card in a vertical stack. The outer viewport scrolls the stack
// vertically; each card preserves its vendor editor's natural size and provides its own
// horizontal scrollbar when the pane is narrower. Cards can be collapsed without destroying
// their editor, or closed independently.
//
// THE ORDERING INVARIANT. An AudioProcessorEditor must be destroyed before its processor.
// This class provides close(targetId) and hide() so the service can remove every affected
// editor first. The caller owns the processors and must keep that order on every unload,
// replacement and failure path.

namespace ceditor::host
{

class PluginEditorHost : public juce::Component
{
public:
    PluginEditorHost();
    ~PluginEditorHost() override;

    /** Adds the target's own editor to the stack, or scrolls to its existing card. */
    void show (const juce::String& targetId, juce::AudioProcessor& processor,
               const juce::String& title);

    /** Destroys one target's editor without touching its processor. */
    void close (const juce::String& targetId);

    /** Destroys every editor in the stack. */
    void hide();

    bool isShowingEditor() const { return ! cards.empty(); }

    /** The widest card's natural width, including room for the outer scrollbar. */
    int preferredWidth() const;

    /** Fired whenever the pane appears, disappears or wants a different width. */
    std::function<void()> onLayoutChanged;

    /** A card's close button. The service removes exactly this target from its state. */
    std::function<void (const juce::String& targetId)> onCloseRequested;

    /** Thumbnail policy and delivery, carrying the card identity explicitly. */
    std::function<bool (const juce::String& targetId)> shouldCaptureEditor;
    std::function<void (const juce::String& targetId, const juce::Image&)> onEditorPictured;

    void resized() override;
    void paint (juce::Graphics&) override;

private:
    class EditorCard;
    friend class EditorCard;

    void layoutCards();

    juce::Viewport viewport;
    juce::Component stackContent;
    std::vector<std::unique_ptr<EditorCard>> cards;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginEditorHost)
};

} // namespace ceditor::host
