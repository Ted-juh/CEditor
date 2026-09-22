#pragma once

#include <juce_data_structures/juce_data_structures.h>
#include "SharedPropertiesFile.h"

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

        propertiesFile = std::make_unique<ceditor::SharedPropertiesFile> (options);
    }

    bool hasWindowBounds() const
    {
        const auto values = propertiesFile->read();
        return values.has_value() && values->containsKey ("windowX");
    }

    juce::Rectangle<int> getWindowBounds() const
    {
        const auto values = propertiesFile->read().value_or (juce::StringPairArray());
        const auto integer = [&] (const char* key, int fallback = 0)
        {
            return values.containsKey (key) ? values[key].getIntValue() : fallback;
        };
        return { integer ("windowX"), integer ("windowY"),
                 integer ("windowWidth", 1280), integer ("windowHeight", 720) };
    }

    void setWindowBounds (juce::Rectangle<int> bounds)
    {
        propertiesFile->update ([&] (juce::PropertySet& values)
        {
            values.setValue ("windowX",      bounds.getX());
            values.setValue ("windowY",      bounds.getY());
            values.setValue ("windowWidth",  bounds.getWidth());
            values.setValue ("windowHeight", bounds.getHeight());
        });
    }

    /** Get the list of panel file paths that were open last session */
    juce::StringArray getOpenPanelPaths() const
    {
        juce::StringArray paths;
        const auto values = propertiesFile->read();
        const auto stored = values.has_value() && values->containsKey ("openPanelPaths")
                              ? (*values)["openPanelPaths"] : juce::String();

        if (stored.isNotEmpty())
            paths.addTokens (stored, "|", "");

        return paths;
    }

    /** Store the list of currently open panel file paths */
    void setOpenPanelPaths (const juce::StringArray& paths)
    {
        propertiesFile->update ([&] (juce::PropertySet& values)
        {
            values.setValue ("openPanelPaths", paths.joinIntoString ("|"));
        });
    }

    /** Get the list of script workspace file paths that were open last session */
    juce::StringArray getOpenScriptWorkspacePaths() const
    {
        juce::StringArray paths;
        const auto values = propertiesFile->read();
        const auto stored = values.has_value() && values->containsKey ("openScriptWorkspacePaths")
                              ? (*values)["openScriptWorkspacePaths"] : juce::String();

        if (stored.isNotEmpty())
            paths.addTokens (stored, "|", "");

        return paths;
    }

    /** Store the list of currently open script workspace file paths */
    void setOpenScriptWorkspacePaths (const juce::StringArray& paths)
    {
        propertiesFile->update ([&] (juce::PropertySet& values)
        {
            values.setValue ("openScriptWorkspacePaths", paths.joinIntoString ("|"));
        });
    }

    /** Get persisted app-level UI settings as a JSON-like var object */
    juce::var getAppSettingsData() const
    {
        const auto values = propertiesFile->read();
        const auto stored = values.has_value() && values->containsKey ("appSettings")
                              ? (*values)["appSettings"] : juce::String();

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
        propertiesFile->update ([&] (juce::PropertySet& values)
        {
            values.setValue ("appSettings", juce::JSON::toString (data));
        });
    }

private:
    std::unique_ptr<ceditor::SharedPropertiesFile> propertiesFile;
};
