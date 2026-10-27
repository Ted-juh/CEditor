#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "TrustedWebBrowser.h"

#if JUCE_WINDOWS
 #include <dwmapi.h>
#endif

#include <functional>

namespace ceditor
{
/**
 * The manual in a window of its own.
 *
 * The documentation was a modal overlay inside the editor's page: a box that could be neither
 * moved nor resized, over the thing being read about. In the editor it is a tab now; this is its
 * other place, for a second screen — a real window the operating system moves, resizes and
 * maximises, holding a second WebView on the editor's own origin that shows help.html.
 *
 * WHAT IT DOES NOT HAVE. No ValueTreeBridge: the page only reads baked-in documents, so it gets
 * native integration for three events and nothing that can touch a document, a file or the
 * instrument host. Its links follow TrustedWebBrowser's rule — an outside page goes to the
 * user's browser, the app's own origin goes nowhere.
 *
 * Owned by WebViewHost, which builds the browser options (the resource provider and WebView2
 * profile are the editor's) and decides what closing means.
 */
class DocumentationWindow final : public juce::DocumentWindow
{
public:
    DocumentationWindow (const juce::WebBrowserComponent::Options& options,
                         const juce::String& pageUrl,
                         juce::Rectangle<int> savedBounds,
                         std::function<void()> onCloseRequested)
        : juce::DocumentWindow ("CEditor Documentation",
                                juce::Colour (0xFF1E1E1E),
                                juce::DocumentWindow::allButtons),
          closeRequested (std::move (onCloseRequested))
    {
        setUsingNativeTitleBar (true);

        browser = std::make_unique<TrustedWebBrowser> (options);
        browser->setSize (1000, 780);
        setContentNonOwned (browser.get(), true);

        setResizable (true, false);
        setResizeLimits (420, 320, 16384, 16384);

        // Back where it was, if that place is still on a screen; otherwise centred. A window
        // remembered on a monitor that has since been unplugged must not open out of reach.
        const auto& displays = juce::Desktop::getInstance().getDisplays();
        if (! savedBounds.isEmpty() && displays.getDisplayForPoint (savedBounds.getCentre()) != nullptr)
            setBounds (savedBounds);
        else
            centreWithSize (getWidth(), getHeight());

        setVisible (true);

       #if JUCE_WINDOWS
        // The editor's dark title bar, so the two windows read as one program.
        if (auto* peer = getPeer())
        {
            auto hwnd = (HWND) peer->getNativeHandle();
            BOOL useDarkMode = TRUE;
            ::DwmSetWindowAttribute (hwnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */,
                                     &useDarkMode, sizeof (useDarkMode));
        }
       #endif

        browser->goToURL (pageUrl);
    }

    ~DocumentationWindow() override
    {
        clearContentComponent();
    }

    /** The close button: the owner deletes this window, later, not from inside its own callback. */
    void closeButtonPressed() override
    {
        if (closeRequested != nullptr)
            closeRequested();
    }

    /** Bring it forward and, when a document is named, show that one. */
    void showDocument (const juce::String& doc, const juce::String& anchor)
    {
        if (isMinimised())
            setMinimised (false);
        toFront (true);

        if (doc.isEmpty() && anchor.isEmpty())
            return;

        auto* payload = new juce::DynamicObject();
        payload->setProperty ("doc", doc);
        payload->setProperty ("anchor", anchor);
        browser->emitEventIfBrowserIsVisible ("documentationRequest", juce::var (payload));
    }

    /** The page this window opens on, with its document in the query. */
    static juce::String pageUrl (const juce::String& origin, const juce::String& doc, const juce::String& anchor)
    {
        auto url = origin + "help.html";
        juce::StringArray query;
        if (doc.isNotEmpty())    query.add ("doc=" + juce::URL::addEscapeChars (doc, true));
        if (anchor.isNotEmpty()) query.add ("anchor=" + juce::URL::addEscapeChars (anchor, true));
        return query.isEmpty() ? url : url + "?" + query.joinIntoString ("&");
    }

private:
    std::unique_ptr<TrustedWebBrowser> browser;
    std::function<void()> closeRequested;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DocumentationWindow)
};
} // namespace ceditor
