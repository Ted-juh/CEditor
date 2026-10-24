// PlayerStandaloneApp.cpp — the exported player's standalone application, in place of JUCE's own
// (JUCE_USE_CUSTOM_PLUGIN_STANDALONE_APP, set in CMakeLists.txt). It is JUCE's StandaloneFilterApp
// (juce_audio_plugin_client_Standalone.cpp) with one difference: where the plug-in's state and the
// window's settings are kept.
//
// JUCE keeps them in one file named after the product, ~/.config/<name>.settings on Linux. Every
// copy of the standalone that is open reads it as it starts and writes it as it quits, so two copies
// of a panel started as one and the last to close overwrote the other; and two panels with one
// product name — the template player's until a sidecar names it, or two panels both called "GAIA" —
// shared the file outright.
//
// Here the file is named after the panel, by its GUID, and each copy open at once has a slot of its
// own: the first takes slot 1, a second (while the first is open) slot 2, and so on. A slot is held
// by an InterProcessLock for as long as the copy runs, so a copy takes the lowest slot nobody holds,
// and opening copies in the same order finds the same state again. A new slot starts from slot 1's
// settings — the audio device, the window — but not its plug-in state: a second copy starts as a
// new instance, as a second plug-in in a DAW does.

#include <juce_core/system/juce_TargetPlatform.h>

#if JucePlugin_Build_Standalone

// The headers JUCE's own standalone file includes before the window, in its order.
#include <juce_audio_plugin_client/detail/juce_CheckSettingMacros.h>
#include <juce_audio_plugin_client/detail/juce_IncludeSystemHeaders.h>
#include <juce_audio_plugin_client/detail/juce_IncludeModuleHeaders.h>
#include <juce_gui_basics/native/juce_WindowsHooks_windows.h>
#include <juce_audio_plugin_client/detail/juce_PluginUtilities.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h>

#include "PlayerPanelFile.h"

namespace ceditor
{

namespace
{

/** The panel's GUID, read from the top of its file, where the document puts it; empty if it has none. */
juce::String panelGuid()
{
    juce::FileInputStream in (ceditorPlayerPanelFile());
    if (in.failedToOpen()) return {};
    juce::MemoryBlock head;
    in.readIntoMemoryBlock (head, 8192);
    const auto text = head.toString();
    const auto key = text.indexOf ("\"panelGuid\"");
    if (key < 0) return {};
    const auto open = text.indexOfChar (text.indexOfChar (key + 11, ':') + 1, '"');
    const auto close = open >= 0 ? text.indexOfChar (open + 1, '"') : -1;
    return open >= 0 && close > open ? text.substring (open + 1, close) : juce::String();
}

/** A string safe in a file name and a lock name. */
juce::String tidy (const juce::String& s)
{
    return s.retainCharacters ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ ").trim();
}

juce::PropertiesFile::Options settingsOptions (const juce::String& name)
{
    juce::PropertiesFile::Options options;
    options.applicationName     = name;
    options.filenameSuffix      = ".settings";
    options.osxLibrarySubFolder = "Application Support";
   #if JUCE_LINUX || JUCE_BSD
    options.folderName          = "~/.config";
   #else
    options.folderName          = "";
   #endif
    return options;
}

} // namespace

class PlayerStandaloneApp final : public juce::JUCEApplication
{
public:
    PlayerStandaloneApp()
    {
        const juce::String product = juce::CharPointer_UTF8 (JucePlugin_Name);
        const auto guid = tidy (panelGuid());
        // "GAIA SH-01 (3f2a91c0…)": the product name to find it by, the GUID to keep panels apart.
        const auto base = guid.isNotEmpty() ? product + " (" + guid + ")" : product;

        int slot = 1;
        for (;; ++slot)
        {
            auto lock = std::make_unique<juce::InterProcessLock> (tidy ("CEditorStandalone " + base + " " + juce::String (slot)));
            if (lock->enter (0)) { slotLock = std::move (lock); break; }
            if (slot >= 64) break;   // something is wrong with locking here; share the last slot rather than fail
        }

        const auto name = slot == 1 ? base : base + " " + juce::String (slot);
        const auto options = settingsOptions (name);
        const auto file = options.getDefaultFile();
        if (! file.existsAsFile())
        {
            if (slot == 1)
            {
                // Slot 1 is what JUCE's file was: carry a pre-October-2026 state over, once.
                if (const auto old = settingsOptions (product).getDefaultFile(); old.existsAsFile() && old != file)
                    old.copyFileTo (file);
            }
            else
            {
                // A new copy: slot 1's device and window, none of its plug-in state.
                juce::PropertiesFile first (settingsOptions (base));
                juce::PropertiesFile fresh (options);
                const auto& values = first.getAllProperties();
                for (int i = 0; i < values.size(); ++i)
                    if (values.getAllKeys()[i] != "filterState")
                        fresh.setValue (values.getAllKeys()[i], values.getAllValues()[i]);
                fresh.saveIfNeeded();
            }
        }
        appProperties.setStorageParameters (options);
        windowTitle = slot == 1 ? product : product + " (" + juce::String (slot) + ")";
    }

    const juce::String getApplicationName() override              { return juce::CharPointer_UTF8 (JucePlugin_Name); }
    const juce::String getApplicationVersion() override           { return JucePlugin_VersionString; }
    bool moreThanOneInstanceAllowed() override                    { return true; }
    void anotherInstanceStarted (const juce::String&) override    {}

    void initialise (const juce::String&) override
    {
        if (juce::Desktop::getInstance().getDisplays().displays.isEmpty())
        {
            pluginHolder = createPluginHolder();   // no display: no window, the plug-in still runs
            return;
        }
        mainWindow = std::make_unique<juce::StandaloneFilterWindow> (
            windowTitle,
            juce::LookAndFeel::getDefaultLookAndFeel().findColour (juce::ResizableWindow::backgroundColourId),
            createPluginHolder());
        mainWindow->setVisible (true);
    }

    void shutdown() override
    {
        pluginHolder = nullptr;
        mainWindow = nullptr;
        appProperties.saveIfNeeded();
        slotLock = nullptr;
    }

    void systemRequestedQuit() override
    {
        if (pluginHolder != nullptr) pluginHolder->savePluginState();
        if (mainWindow != nullptr)   mainWindow->pluginHolder->savePluginState();

        if (juce::ModalComponentManager::getInstance()->cancelAllModalComponents())
        {
            juce::Timer::callAfterDelay (100, []
            {
                if (auto app = juce::JUCEApplicationBase::getInstance())
                    app->systemRequestedQuit();
            });
        }
        else
        {
            quit();
        }
    }

private:
    std::unique_ptr<juce::StandalonePluginHolder> createPluginHolder()
    {
       #ifdef JucePlugin_PreferredChannelConfigurations
        constexpr juce::StandalonePluginHolder::PluginInOuts channels[] { JucePlugin_PreferredChannelConfigurations };
        const juce::Array<juce::StandalonePluginHolder::PluginInOuts> channelConfig (channels, juce::numElementsInArray (channels));
       #else
        const juce::Array<juce::StandalonePluginHolder::PluginInOuts> channelConfig;
       #endif
        return std::make_unique<juce::StandalonePluginHolder> (appProperties.getUserSettings(), false, juce::String{},
                                                               nullptr, channelConfig, false);
    }

    std::unique_ptr<juce::InterProcessLock> slotLock;   // this copy's slot, held while it runs
    juce::String windowTitle;
    juce::ApplicationProperties appProperties;
    std::unique_ptr<juce::StandaloneFilterWindow> mainWindow;
    std::unique_ptr<juce::StandalonePluginHolder> pluginHolder;
};

} // namespace ceditor

juce::JUCEApplicationBase* juce_CreateApplication();
juce::JUCEApplicationBase* juce_CreateApplication() { return new ceditor::PlayerStandaloneApp(); }

#endif
