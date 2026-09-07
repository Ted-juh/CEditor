#include "FloatingEditorWindows.h"
#include "EditorSnapshot.h"

namespace ceditor::host
{

// One part's window: native title bar, a scrollable viewport around the non-owned editor,
// and a listener so a vendor GUI that resizes itself carries its window along when it fits.
// The viewport keeps every part of an editor reachable when its natural size is larger than
// the display, or when the user deliberately makes the floating window smaller.
class FloatingEditorWindows::EditorWindow final : public juce::DocumentWindow,
                                                 private juce::ComponentListener,
                                                 private juce::Timer
{
public:
    EditorWindow (FloatingEditorWindows& ownerToUse, juce::String partIdToUse,
                  juce::AudioProcessor& processor, const juce::String& title)
        : juce::DocumentWindow (title,
                                juce::Desktop::getInstance().getDefaultLookAndFeel()
                                    .findColour (juce::ResizableWindow::backgroundColourId),
                                juce::DocumentWindow::closeButton | juce::DocumentWindow::minimiseButton),
          owner (ownerToUse),
          partId (std::move (partIdToUse))
    {
        setUsingNativeTitleBar (true);

        if (auto* own = processor.createEditorIfNeeded())
            editor.reset (own);
        else
            editor = std::make_unique<juce::GenericAudioProcessorEditor> (processor);

        editor->addComponentListener (this);
        viewport.setScrollBarsShown (true, true);
        viewport.setViewedComponent (editor.get(), false);
        setContentNonOwned (&viewport, false);
        fitWindowToEditor();

        // A fixed-size VST editor still needs a resizable HOST window: resizing changes the
        // viewport, never the vendor editor, and reveals scrollbars whenever it no longer fits.
        setResizable (true, false);
        setVisible (true);

        if (owner.onEditorPictured != nullptr
            && (owner.shouldCaptureEditor == nullptr || owner.shouldCaptureEditor (partId)))
            startTimer (captureDelaysMs[0]);
    }

    ~EditorWindow() override
    {
        // Before anything else: a pending capture must not outlive the editor it aimed at.
        stopTimer();

        // The invariant's window half: the editor dies here, first, every path.
        if (editor != nullptr)
            editor->removeComponentListener (this);
        viewport.setViewedComponent (nullptr, false);
        setContentNonOwned (nullptr, false);
        editor.reset();
    }

    void closeButtonPressed() override
    {
        // Report, never self-destruct: the service owns editor state, same as the pane.
        if (owner.onCloseRequested != nullptr)
            owner.onCloseRequested (partId);
    }

private:
    // The same waiting the docked pane does, for the same reason: a plug-in is not finished
    // drawing when its editor is constructed, and a blank result is retried rather than
    // believed. PluginEditorHost.h carries the full reasoning.
    static constexpr int captureDelaysMs[] { 900, 2200, 4500 };

    void timerCallback() override
    {
        stopTimer();

        if (editor == nullptr || owner.onEditorPictured == nullptr)
            return;

        if (auto picture = editorSnapshot::capture (*editor); picture.isValid())
        {
            owner.onEditorPictured (partId, picture);
            return;
        }

        if (++captureAttempt < (int) juce::numElementsInArray (captureDelaysMs))
            startTimer (captureDelaysMs[captureAttempt]);
    }

    void componentMovedOrResized (juce::Component&, bool, bool wasResized) override
    {
        // A vendor editor that changes its natural size takes the viewport with it, capped
        // to the current display so an oversized UI never puts its window edges off-screen.
        if (wasResized && editor != nullptr)
            fitWindowToEditor();
    }

    void fitWindowToEditor()
    {
        if (editor == nullptr)
            return;

        const auto& displays = juce::Desktop::getInstance().getDisplays();
        auto* display = displays.getDisplayForRect (getScreenBounds());
        if (display == nullptr)
            display = displays.getDisplayForPoint (juce::Desktop::getMousePosition());
        if (display == nullptr)
            display = displays.getPrimaryDisplay();

        auto available = display != nullptr ? display->userArea.reduced (32)
                                            : juce::Rectangle<int> (0, 0, 1280, 720);
        const auto maximumWidth = juce::jmax (160, available.getWidth());
        const auto maximumHeight = juce::jmax (120, available.getHeight());
        const auto scrollBar = viewport.getScrollBarThickness();
        const auto editorWidth = juce::jmax (1, editor->getWidth());
        const auto editorHeight = juce::jmax (1, editor->getHeight());

        // Reserve room for the other scrollbar only when that dimension overflows. This
        // keeps normal editors pixel-tight and prevents one scrollbar from hiding the last
        // strip of content in the other direction.
        const auto wantedWidth = editorWidth + (editorHeight > maximumHeight ? scrollBar : 0);
        const auto wantedHeight = editorHeight + (editorWidth > maximumWidth ? scrollBar : 0);
        setContentComponentSize (juce::jmin (wantedWidth, maximumWidth),
                                 juce::jmin (wantedHeight, maximumHeight));
    }

    FloatingEditorWindows& owner;
    juce::String partId;
    int captureAttempt = 0;
    juce::Viewport viewport;
    std::unique_ptr<juce::AudioProcessorEditor> editor;
};

FloatingEditorWindows::FloatingEditorWindows() = default;

FloatingEditorWindows::~FloatingEditorWindows()
{
    closeAll();
}

void FloatingEditorWindows::show (const juce::String& partId, juce::AudioProcessor& processor,
                                  const juce::String& title)
{
    // A processor carries at most one live editor, so re-showing rebuilds rather than
    // duplicating — and refocusing an already-open window is just bringing it forward.
    if (const auto existing = windows.find (partId); existing != windows.end())
    {
        existing->second->toFront (true);
        return;
    }

    auto window = std::make_unique<EditorWindow> (*this, partId, processor, title);

    if (const auto remembered = rememberedBounds.find (partId); remembered != rememberedBounds.end())
        window->setBounds (remembered->second);
    else
        window->centreAroundComponent (nullptr, window->getWidth(), window->getHeight());

    window->toFront (true);
    windows[partId] = std::move (window);
}

void FloatingEditorWindows::close (const juce::String& partId)
{
    const auto it = windows.find (partId);
    if (it == windows.end())
        return;

    rememberedBounds[partId] = it->second->getBounds();
    windows.erase (it);
}

void FloatingEditorWindows::closeAll()
{
    for (auto& [partId, window] : windows)
        rememberedBounds[partId] = window->getBounds();
    windows.clear();
}

} // namespace ceditor::host
