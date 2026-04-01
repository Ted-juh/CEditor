#include <juce_gui_basics/juce_gui_basics.h>
#include "MainWindow.h"

class CEditorApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return "CEditor"; }
    const juce::String getApplicationVersion() override { return "0.1.0"; }
    bool moreThanOneInstanceAllowed() override           { return false; }

    void initialise (const juce::String&) override
    {
        mainWindow = std::make_unique<MainWindow> ("CEditor");
    }

    void shutdown() override
    {
        mainWindow = nullptr;
    }

    void systemRequestedQuit() override
    {
        quit();
    }

private:
    std::unique_ptr<MainWindow> mainWindow;
};

START_JUCE_APPLICATION (CEditorApplication)
