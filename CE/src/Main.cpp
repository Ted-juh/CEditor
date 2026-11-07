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

    // The close button, Alt+F4 and File → Close Program all arrive here. The page is asked first,
    // so unsaved work can be saved or knowingly left (QuitGate.h); the quit runs on its answer, or
    // when it does not answer in time.
    void systemRequestedQuit() override
    {
        if (mainWindow == nullptr)
        {
            quit();
            return;
        }

        mainWindow->requestQuit ([this]
        {
            if (mainWindow != nullptr)
                mainWindow->saveAndClose();

            quit();
        });
    }

private:
    std::unique_ptr<AppSettings> settings;
    std::unique_ptr<MainWindow> mainWindow;
};

START_JUCE_APPLICATION (CEditorApplication)
