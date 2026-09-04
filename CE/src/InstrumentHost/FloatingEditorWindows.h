#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include <map>

// FloatingEditorWindows — vendor editors as top-level windows, several at once.
//
// The docked pane shows ONE editor beside the WebView; that was policy, not a model limit,
// and it made "compare two synths" impossible. This manager owns any number of
// DocumentWindows, one per part, each holding that part's AudioProcessorEditor.
//
// THE SAME ORDERING INVARIANT the pane documents: an editor must die before its processor.
// Each window's half is enforced here — close() and the destructor tear the editor down
// before the window — and the service owns the other half exactly as it does for the pane:
// it closes a part's window before that part's instrument is removed or replaced. Closing a
// window never touches the processor.
//
// A window's close button does NOT close the window; it reports through onCloseRequested so
// the service stays authoritative and the WebView's toggles keep telling the truth — the
// same discipline as the pane's own close button. Bounds are remembered per part for the
// life of the run, so re-floating a part puts its window back where it was.
//
// AN ISOLATED PLUG-IN HAS NO EDITOR TO PUT IN A WINDOW. Its interface is drawn by its worker
// process, in a top-level window that process owns. For those parts "float" means: ask the
// worker to show that window, where this manager would have put one of its own, and count
// the part as open until the service closes it. No DocumentWindow is made — the old one held
// a placeholder saying the editor was elsewhere, centred exactly over the window it was
// talking about.

namespace ceditor::host
{

class IsolatedPluginProxy;

class FloatingEditorWindows
{
public:
    // Defined in the .cpp, where EditorWindow is complete: an inline default would drag
    // the window map's destructor into every including TU for unwind purposes.
    FloatingEditorWindows();
    ~FloatingEditorWindows();

    FloatingEditorWindows (const FloatingEditorWindows&) = delete;
    FloatingEditorWindows& operator= (const FloatingEditorWindows&) = delete;

    /** Opens (or refocuses) the part's editor in its own window. Message thread. */
    void show (const juce::String& partId, juce::AudioProcessor& processor,
               const juce::String& title);

    /** Destroys the part's window and its editor. The processor is untouched. Idempotent. */
    void close (const juce::String& partId);

    void closeAll();

    bool isOpen (const juce::String& partId) const
    {
        return windows.count (partId) > 0 || remote.count (partId) > 0;
    }

    /** The window's own close button, routed out — the service decides, never the window. */
    std::function<void (const juce::String& partId)> onCloseRequested;

    /** Thumbnail capture, exactly as the docked pane does it and for the same reason: a
        floated editor is a plug-in's window on screen, which is the only moment its picture
        can be taken. See PluginEditorHost.h for why it is two hooks rather than one. */
    std::function<bool (const juce::String& partId)> shouldCaptureEditor;
    std::function<void (const juce::String& partId, const juce::Image& picture)> onEditorPictured;

private:
    class EditorWindow;

    std::map<juce::String, std::unique_ptr<EditorWindow>> windows;
    // Parts whose window lives in a worker process. A raw pointer under the same invariant
    // the windows above rely on: the service closes a part's window before it removes or
    // replaces that part's instrument, so a proxy here is alive until close() lets it go.
    std::map<juce::String, IsolatedPluginProxy*> remote;
    std::map<juce::String, juce::Rectangle<int>> rememberedBounds;
};

} // namespace ceditor::host
