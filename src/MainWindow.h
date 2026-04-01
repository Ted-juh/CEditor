#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "WebViewHost.h"

class MainWindow : public juce::DocumentWindow
{
public:
    MainWindow (const juce::String& name)
        : DocumentWindow (name,
                          juce::Colour (0xFF1E1E1E),
                          DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (new WebViewHost(), true);
        setResizable (true, true);
        centreWithSize (getWidth(), getHeight());
        setVisible (true);
    }

    void closeButtonPressed() override
    {
        juce::JUCEApplication::getInstance()->systemRequestedQuit();
    }
};
