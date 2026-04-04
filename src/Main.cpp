#include <juce_gui_basics/juce_gui_basics.h>
#include "MainWindow.h"
#include "AppSettings.h"

class CEditorApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return "CEditor"; }
    const juce::String getApplicationVersion() override { return "0.1.0"; }
    bool moreThanOneInstanceAllowed() override           { return false; }

    void initialise (const juce::String&) override
    {
        settings = std::make_unique<AppSettings>();
        mainWindow = std::make_unique<MainWindow> ("CEditor", *settings);
    }

    void shutdown() override
    {
        mainWindow = nullptr;
        settings = nullptr;
    }

    void systemRequestedQuit() override
    {
        if (mainWindow != nullptr)
            mainWindow->saveAndClose();

        quit();
    }

private:
    std::unique_ptr<AppSettings> settings;
    std::unique_ptr<MainWindow> mainWindow;
};

START_JUCE_APPLICATION (CEditorApplication)
