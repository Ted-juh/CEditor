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

private:
    std::unique_ptr<juce::PropertiesFile> propertiesFile;
};
