#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "BinaryData.h"
#include "WebViewHost.h"
#include "AppSettings.h"

#if JUCE_WINDOWS
 #include <dwmapi.h>
#endif

class MainWindow : public juce::DocumentWindow
{
public:
    MainWindow (const juce::String& name, AppSettings& settingsToUse)
        : DocumentWindow (name,
                          juce::Colour (0xFF1E1E1E),
                          DocumentWindow::allButtons),
          settings (settingsToUse)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (new WebViewHost (&settingsToUse), true);
        setResizable (true, true);

        if (settings.hasWindowBounds())
        {
            setBounds (settings.getWindowBounds());
        }
        else
        {
            centreWithSize (getWidth(), getHeight());
        }

        setVisible (true);

        // Window icon
        auto icon = juce::ImageFileFormat::loadFrom (BinaryData::logo_png, BinaryData::logo_pngSize);
        if (icon.isValid())
        {
            setIcon (icon);
            if (auto* peer = getPeer())
                peer->setIcon (icon);
        }

        // Dark title bar
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

    void saveAndClose()
    {
        settings.setWindowBounds (getBounds());
    }

private:
    AppSettings& settings;
};
