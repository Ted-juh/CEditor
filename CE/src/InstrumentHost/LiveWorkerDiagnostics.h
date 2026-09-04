#pragma once

#include <juce_core/juce_core.h>

// A deliberately small, host-side diagnostic trail for disposable live plug-in workers.
// Nothing here is called from the audio callback. The file contains lifecycle/error metadata,
// never opaque plug-in state or parameter values, and rotates at a fixed size so a crash loop
// cannot consume the user's disk. The support bundle names both files explicitly.

namespace ceditor::host
{

class LiveWorkerDiagnostics
{
public:
    static juce::File currentFile (const juce::File& dataDirectory)
    {
        return dataDirectory.getChildFile ("logs").getChildFile ("live-worker-events.jsonl");
    }

    static juce::File previousFile (const juce::File& dataDirectory)
    {
        return dataDirectory.getChildFile ("logs")
                            .getChildFile ("live-worker-events.previous.jsonl");
    }

    static juce::Array<juce::File> supportFiles (const juce::File& dataDirectory)
    {
        juce::Array<juce::File> files;
        files.add (currentFile (dataDirectory));
        files.add (previousFile (dataDirectory));
        return files;
    }

    static void append (const juce::File& file, const juce::String& event,
                        juce::uint32 generation, const juce::String& pluginName = {},
                        const juce::String& detail = {})
    {
        if (file == juce::File() || event.isEmpty())
            return;

        // The same product can run as a standalone and several VST3 instances. Serialise their
        // writes across processes; a diagnostic must not become the failure it is describing.
        juce::InterProcessLock processLock (
            "HostageLiveWorkerLog-" + juce::String::toHexString (
                file.getFullPathName().hashCode64()));
        if (! processLock.enter (100))
            return;

        struct Unlock
        {
            explicit Unlock (juce::InterProcessLock& lockToUse) : lock (lockToUse) {}
            ~Unlock() { lock.exit(); }
            juce::InterProcessLock& lock;
        } unlock (processLock);

        file.getParentDirectory().createDirectory();

        auto* object = new juce::DynamicObject();
        object->setProperty ("at", juce::Time::getCurrentTime().toISO8601 (true));
        object->setProperty ("event", event.substring (0, 96));
        object->setProperty ("generation", static_cast<juce::int64> (generation));
        if (pluginName.isNotEmpty())
            object->setProperty ("plugin", pluginName.substring (0, 256));
        if (detail.isNotEmpty())
            object->setProperty ("detail", detail.substring (0, 2048));

        const auto line = juce::JSON::toString (juce::var (object), true) + "\n";
        constexpr juce::int64 maximumBytes = 512 * 1024;
        if (file.existsAsFile()
            && file.getSize() + static_cast<juce::int64> (line.getNumBytesAsUTF8())
                 > maximumBytes)
        {
            auto previous = file.getSiblingFile ("live-worker-events.previous.jsonl");
            previous.deleteFile();
            if (! file.moveFileTo (previous))
                file.deleteFile();
        }

        file.appendText (line, false, false, "\n");
    }
};

} // namespace ceditor::host
