#include "FloatingEditorWindows.h"
#include "EditorSnapshot.h"
#include "IsolatedPluginProxy.h"

namespace ceditor::host
{

// One part's window: native title bar, the editor as non-owned content so destruction order
// stays explicit (editor first, window after), and a listener so a vendor GUI that resizes
// itself carries its window along instead of being clipped.
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
        setContentNonOwned (editor.get(), true);
        setResizable (editor->isResizable(), false);
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
        // A vendor editor that resizes itself takes its window with it.
        if (wasResized && editor != nullptr)
            setContentNonOwned (editor.get(), true);
    }

    FloatingEditorWindows& owner;
    juce::String partId;
    int captureAttempt = 0;
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

    if (auto* isolated = dynamic_cast<IsolatedPluginProxy*> (&processor))
    {
        if (remote.count (partId) > 0)
        {
            isolated->showRemoteEditor ({});
            return;
        }

        // The worker's window goes where this part's own window last was, if it ever had
        // one; the worker centres it otherwise, and keeps its own memory after that.
        juce::Rectangle<int> anchor;
        if (const auto remembered = rememberedBounds.find (partId); remembered != rememberedBounds.end())
            anchor = remembered->second;

        if (isolated->acquireRemoteEditor (anchor))
        {
            remote[partId] = isolated;
            return;
        }
        // The worker would not open its window (no vendor editor, or a control failure).
        // Let go of the hold that acquire took — nothing here will release it later — and
        // fall through to a window of our own around the placeholder, whose button retries
        // and whose own lifetime holds the count from here on.
        isolated->releaseRemoteEditor();
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
    if (const auto it = remote.find (partId); it != remote.end())
    {
        if (const auto bounds = it->second->lastRemoteEditorBounds(); ! bounds.isEmpty())
            rememberedBounds[partId] = bounds;
        it->second->releaseRemoteEditor();
        remote.erase (it);
        return;
    }

    const auto it = windows.find (partId);
    if (it == windows.end())
        return;

    rememberedBounds[partId] = it->second->getBounds();
    windows.erase (it);
}

void FloatingEditorWindows::closeAll()
{
    for (auto& [partId, proxy] : remote)
    {
        if (const auto bounds = proxy->lastRemoteEditorBounds(); ! bounds.isEmpty())
            rememberedBounds[partId] = bounds;
        proxy->releaseRemoteEditor();
    }
    remote.clear();

    for (auto& [partId, window] : windows)
        rememberedBounds[partId] = window->getBounds();
    windows.clear();
}

} // namespace ceditor::host
