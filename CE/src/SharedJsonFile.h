#pragma once

#include "AtomicFileWrite.h"

#include <functional>
#include <mutex>

namespace ceditor
{

/** Reads, mutates and atomically replaces one shared JSON object under process-wide locks.
    Missing files start as an empty object; malformed files are refused and left untouched. */
inline bool updateSharedJsonObject (const juce::File& file,
                                    const std::function<void (juce::DynamicObject&)>& mutation)
{
    static std::mutex inProcessMutex;
    const std::scoped_lock inProcessGuard (inProcessMutex);

    auto path = file.getFullPathName();
   #if JUCE_WINDOWS
    path = path.toLowerCase();
   #endif
    juce::InterProcessLock lock (
        "CEditorJson-" + juce::String::toHexString (path.hashCode64()));
    if (! lock.enter (1000))
        return false;

    struct Unlock { juce::InterProcessLock& lock; ~Unlock() { lock.exit(); } } unlock { lock };

    juce::var root;
    if (file.existsAsFile())
    {
        const auto text = file.loadFileAsString();
        if (text.isEmpty() || juce::JSON::parse (text, root).failed() || ! root.isObject())
            return false;
    }
    else
    {
        root = juce::var (new juce::DynamicObject());
    }

    mutation (*root.getDynamicObject());
    return writeTextAtomically (file, juce::JSON::toString (root));
}

} // namespace ceditor
