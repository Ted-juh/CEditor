#include <juce_gui_basics/juce_gui_basics.h>
#include "HostRuntimeShell.h"

#if JUCE_WINDOWS
 #include <dwmapi.h>
#endif

// HostRuntimeMain — the generated Hostage standalone target.
//
// A window around HostRuntimeShell and nothing else; everything the product does lives in the
// shell and the service. The product name and version arrive from CMake (CEHOST_PRODUCT_NAME /
// CEHOST_PRODUCT_VERSION) because the Host Project build stamps them per product — the same
// binary shape ships under whatever name the project chose.

#ifndef CEHOST_PRODUCT_NAME
 #define CEHOST_PRODUCT_NAME "Hostage"
#endif
#ifndef CEHOST_PRODUCT_VERSION
 #define CEHOST_PRODUCT_VERSION "0.1.0"
#endif

class HostRuntimeWindow : public juce::DocumentWindow
{
public:
    explicit HostRuntimeWindow (const juce::String& name)
        : DocumentWindow (name, juce::Colour (0xFF1E1E1E), DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (new ceditor::host::HostRuntimeShell(), true);
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

class CEHostApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return CEHOST_PRODUCT_NAME; }
    const juce::String getApplicationVersion() override { return CEHOST_PRODUCT_VERSION; }
    bool moreThanOneInstanceAllowed() override           { return false; }

    void initialise (const juce::String&) override
    {
        mainWindow = std::make_unique<HostRuntimeWindow> (getApplicationName());
    }

    void shutdown() override { mainWindow = nullptr; }
    void systemRequestedQuit() override { quit(); }

private:
    std::unique_ptr<HostRuntimeWindow> mainWindow;
};

START_JUCE_APPLICATION (CEHostApplication)
