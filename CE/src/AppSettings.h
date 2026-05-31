#pragma once

#include <juce_data_structures/juce_data_structures.h>

/**
 * Persistent application settings stored as a properties file
 * in the user's application data directory.
 */
class AppSettings
{
public:
    AppSettings()
    {
        juce::PropertiesFile::Options options;
        options.applicationName     = "CEditor";
        options.filenameSuffix      = ".settings";
        options.folderName          = "CEditor";
        options.osxLibrarySubFolder = "Application Support";

        propertiesFile = std::make_unique<juce::PropertiesFile> (options);
    }

    bool hasWindowBounds() const
    {
        return propertiesFile->containsKey ("windowX");
    }

    juce::Rectangle<int> getWindowBounds() const
    {
        return { propertiesFile->getIntValue ("windowX"),
                 propertiesFile->getIntValue ("windowY"),
                 propertiesFile->getIntValue ("windowWidth",  1280),
                 propertiesFile->getIntValue ("windowHeight", 720) };
    }

    void setWindowBounds (juce::Rectangle<int> bounds)
    {
        propertiesFile->setValue ("windowX",      bounds.getX());
        propertiesFile->setValue ("windowY",      bounds.getY());
        propertiesFile->setValue ("windowWidth",  bounds.getWidth());
        propertiesFile->setValue ("windowHeight", bounds.getHeight());
        propertiesFile->save();
    }

    /** Get the list of panel file paths that were open last session */
    juce::StringArray getOpenPanelPaths() const
    {
        juce::StringArray paths;
        auto stored = propertiesFile->getValue ("openPanelPaths", "");

        if (stored.isNotEmpty())
            paths.addTokens (stored, "|", "");

        return paths;
    }

    /** Store the list of currently open panel file paths */
    void setOpenPanelPaths (const juce::StringArray& paths)
    {
        propertiesFile->setValue ("openPanelPaths", paths.joinIntoString ("|"));
        propertiesFile->save();
    }

    /** Get the list of script workspace file paths that were open last session */
    juce::StringArray getOpenScriptWorkspacePaths() const
    {
        juce::StringArray paths;
        auto stored = propertiesFile->getValue ("openScriptWorkspacePaths", "");

        if (stored.isNotEmpty())
            paths.addTokens (stored, "|", "");

        return paths;
    }

    /** Store the list of currently open script workspace file paths */
    void setOpenScriptWorkspacePaths (const juce::StringArray& paths)
    {
        propertiesFile->setValue ("openScriptWorkspacePaths", paths.joinIntoString ("|"));
        propertiesFile->save();
    }

    /** Get persisted app-level UI settings as a JSON-like var object */
    juce::var getAppSettingsData() const
    {
        auto stored = propertiesFile->getValue ("appSettings", "");

        if (stored.isNotEmpty())
        {
            auto parsed = juce::JSON::parse (stored);
            if (parsed.isObject())
            {
                if (auto* obj = parsed.getDynamicObject())
                {
                    auto general = obj->getProperty ("general");
                    if (! general.isObject())
                    {
                        auto* generalObj = new juce::DynamicObject();
                        obj->setProperty ("general", juce::var (generalObj));
                    }

                    auto fonts = obj->getProperty ("fonts");
                    if (! fonts.isArray())
                        obj->setProperty ("fonts", juce::var (juce::Array<juce::var>()));

                    auto icons = obj->getProperty ("icons");
                    if (! icons.isArray())
                        obj->setProperty ("icons", juce::var (juce::Array<juce::var>()));
                }

                return parsed;
            }
        }

        auto* obj = new juce::DynamicObject();
        obj->setProperty ("general", juce::var (new juce::DynamicObject()));
        obj->setProperty ("fonts", juce::var (juce::Array<juce::var>()));
        obj->setProperty ("icons", juce::var (juce::Array<juce::var>()));
        return juce::var (obj);
    }

    /** Persist app-level UI settings */
    void setAppSettingsData (const juce::var& data)
    {
        propertiesFile->setValue ("appSettings", juce::JSON::toString (data));
        propertiesFile->save();
    }

private:
    std::unique_ptr<juce::PropertiesFile> propertiesFile;
};
