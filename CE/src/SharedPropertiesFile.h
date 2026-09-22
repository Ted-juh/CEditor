#pragma once

#include <juce_data_structures/juce_data_structures.h>

#include <functional>
#include <mutex>
#include <optional>

namespace ceditor
{

/** Transactional access to a PropertiesFile shared by several app/plugin instances.

    A PropertiesFile process lock serialises complete saves, but each long-lived object still
    writes its stale in-memory PropertySet. Open a fresh view and apply only the requested keys
    while both same-process and cross-process writers are excluded. */
class SharedPropertiesFile
{
public:
    explicit SharedPropertiesFile (juce::PropertiesFile::Options optionsToUse)
        : options (std::move (optionsToUse)), file (options.getDefaultFile())
    {
        prepareOptions();
    }

    SharedPropertiesFile (juce::File fileToUse, juce::PropertiesFile::Options optionsToUse = {})
        : options (std::move (optionsToUse)), file (std::move (fileToUse))
    {
        prepareOptions();
    }

    std::optional<juce::StringPairArray> read() const
    {
        std::scoped_lock processGuard (inProcessMutex());
        auto lock = makeLock();
        if (! lock.enter (1000))
            return std::nullopt;

        const ScopedExit unlock { lock };
        juce::PropertiesFile fresh (file, options);
        if (! fresh.isValidFile())
            return std::nullopt;
        return fresh.getAllProperties();
    }

    bool update (const std::function<void (juce::PropertySet&)>& mutation)
    {
        std::scoped_lock processGuard (inProcessMutex());
        auto lock = makeLock();
        if (! lock.enter (1000))
            return false;

        const ScopedExit unlock { lock };
        juce::PropertiesFile fresh (file, options);
        if (! fresh.isValidFile())
            return false;

        mutation (fresh);
        return fresh.save();
    }

    const juce::File& getFile() const noexcept { return file; }

private:
    struct ScopedExit
    {
        explicit ScopedExit (juce::InterProcessLock& lockToUse) : lock (lockToUse) {}
        ~ScopedExit() { lock.exit(); }
        juce::InterProcessLock& lock;
    };

    void prepareOptions()
    {
        options.millisecondsBeforeSaving = -1;
        options.processLock = nullptr;
    }

    static std::mutex& inProcessMutex()
    {
        static std::mutex mutex;
        return mutex;
    }

    juce::InterProcessLock makeLock() const
    {
        auto path = file.getFullPathName();
       #if JUCE_WINDOWS
        path = path.toLowerCase();
       #endif
        return juce::InterProcessLock (
            "CEditorProperties-" + juce::String::toHexString (path.hashCode64()));
    }

    juce::PropertiesFile::Options options;
    juce::File file;
};

} // namespace ceditor
