#include <juce_gui_basics/juce_gui_basics.h>
#include "PlayerHost.h"

#if JUCE_WINDOWS
 #include <dwmapi.h>
#endif

class PlayerWindow : public juce::DocumentWindow
{
public:
    PlayerWindow (const juce::String& name, juce::File panelFile)
        : DocumentWindow (name, juce::Colour (0xFF1E1E1E), DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (new PlayerHost (std::move (panelFile)), true);
        setResizable (true, true);
        centreWithSize (getWidth(), getHeight());
        setVisible (true);

       #if JUCE_WINDOWS
        if (auto* peer = getPeer())
        {
            auto hwnd = (HWND) peer->getNativeHandle();
            BOOL useDarkMode = TRUE;
            ::DwmSetWindowAttribute (hwnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */,
                                     &useDarkMode, sizeof (useDarkMode));
        }
       #endif
    }

    void closeButtonPressed() override
    {
        juce::JUCEApplication::getInstance()->systemRequestedQuit();
    }
};

class CEditorPlayerApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return "CEditor Player"; }
    const juce::String getApplicationVersion() override { return "0.1.0"; }
    bool moreThanOneInstanceAllowed() override           { return true; }

    void initialise (const juce::String&) override
    {
        // Optional first argument: a panel document (.cepanel / JSON) to load.
        juce::File panelFile;
        auto args = juce::JUCEApplication::getCommandLineParameterArray();
        if (! args.isEmpty())
        {
            juce::File candidate (args[0].unquoted());
            if (! candidate.existsAsFile())
                candidate = juce::File::getCurrentWorkingDirectory().getChildFile (args[0].unquoted());
            panelFile = candidate;
        }

        mainWindow = std::make_unique<PlayerWindow> ("CEditor Player", panelFile);
    }

    void shutdown() override { mainWindow = nullptr; }
    void systemRequestedQuit() override { quit(); }

private:
    std::unique_ptr<PlayerWindow> mainWindow;
};

START_JUCE_APPLICATION (CEditorPlayerApplication)
