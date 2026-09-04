#include "SupportBundle.h"
#include "SessionRecovery.h"

namespace ceditor::host
{

namespace
{
    juce::var arrayOf (const juce::StringArray& strings)
    {
        juce::Array<juce::var> out;
        for (const auto& s : strings)
            out.add (s);
        return out;
    }

    /** The one place a session manifest's state blobs are removed. Walks arrays and objects
        rather than known key paths: the manifest has blobs in parts, in each part's insert
        chain, in the master chain and in every return chain, and a redactor written against
        today's shape is a leak waiting for tomorrow's. */
    juce::var redact (const juce::var& value)
    {
        if (auto* array = value.getArray())
        {
            juce::Array<juce::var> out;
            for (const auto& element : *array)
                out.add (redact (element));
            return out;
        }

        auto* object = value.getDynamicObject();
        if (object == nullptr)
            return value;

        auto* copy = new juce::DynamicObject();
        for (const auto& property : object->getProperties())
        {
            const auto name = property.name.toString();

            if (name == "stateBlob")
            {
                const auto blob = property.value.toString();
                copy->setProperty ("stateBlob", "");
                copy->setProperty ("stateBlobBytes", (int) blob.length());
                // The digest travels even when the bytes do not, so a corruption question is
                // still answerable from the bundle — it is the same digest §17.3 checks.
                if (! object->hasProperty ("stateBlobHash"))
                    copy->setProperty ("stateBlobHash", SessionRecovery::hashState (blob));
                continue;
            }

            copy->setProperty (property.name, redact (property.value));
        }

        return juce::var (copy);
    }

    juce::int64 sizeOf (const juce::File& file)
    {
        return file.existsAsFile() ? file.getSize() : 0;
    }
}

juce::var SupportBundle::redactStateBlobs (const juce::var& manifest)
{
    return redact (manifest);
}

juce::var SupportBundle::manifestVar (const SupportBundleOptions& options) const
{
    auto* product = new juce::DynamicObject();
    product->setProperty ("name",    contents.productName);
    product->setProperty ("version", contents.productVersion);
    product->setProperty ("build",   contents.buildStamp);

    auto* machine = new juce::DynamicObject();
    machine->setProperty ("os",           contents.osDescription);
    machine->setProperty ("architecture", contents.architecture);

    auto* devices = new juce::DynamicObject();
    devices->setProperty ("audio",       arrayOf (contents.audioDevices));
    devices->setProperty ("midiInputs",  arrayOf (contents.midiInputs));
    devices->setProperty ("midiOutputs", arrayOf (contents.midiOutputs));
    devices->setProperty ("surfaces",    arrayOf (contents.hardwareSurfaces));

    // What the person exporting chose, recorded in the bundle itself. Whoever reads it later
    // must be able to tell "no state blobs here" from "this rack had no state".
    auto* choices = new juce::DynamicObject();
    choices->setProperty ("stateBlobsIncluded", options.includeStateBlobs);
    choices->setProperty ("crashStatesIncluded", options.includeCrashStates);
    choices->setProperty ("logsIncluded", options.includeLogs);
    choices->setProperty ("workerMinidumpsIncluded", options.includeWorkerDumps);

    auto* root = new juce::DynamicObject();
    root->setProperty ("generatedAt", juce::Time::getCurrentTime().toISO8601 (true));
    root->setProperty ("product",     juce::var (product));
    root->setProperty ("machine",     juce::var (machine));
    root->setProperty ("devices",     juce::var (devices));
    root->setProperty ("choices",     juce::var (choices));
    root->setProperty ("collectedBy",
                       "An allowlist, not a directory sweep: nothing travels unless it is named "
                       "in SupportBundle.cpp. Licence files, tokens and unrelated documents are "
                       "not named, so they cannot be here.");
    return juce::var (root);
}

juce::Array<SupportBundle::Entry> SupportBundle::preview (const SupportBundleOptions& options) const
{
    juce::Array<Entry> entries;

    entries.add ({ "support-manifest.json",
                   "Product version, this machine's OS and architecture, the audio/MIDI devices "
                   "and hardware surfaces seen, and the choices made when this bundle was made.",
                   0, true, {} });

    const auto catalogFile = dataDirectory.getChildFile ("plugin-catalog.json");
    entries.add ({ "plugin-catalog.json",
                   "The plug-in scan results: every module, its classes, architecture, "
                   "quarantine state and last failure.",
                   sizeOf (catalogFile), catalogFile.existsAsFile(), {} });

    const auto sessionFile = dataDirectory.getChildFile ("session-performance.json");
    entries.add ({ "session-performance.json",
                   "The rack manifest: parts, routing, mixer, patterns, scenes and which "
                   "plug-in each slot holds.",
                   sizeOf (sessionFile), sessionFile.existsAsFile(),
                   options.includeStateBlobs
                     ? "state blobs INCLUDED — this carries each plug-in's own saved sound"
                     : "state blobs removed; digests and sizes kept" });

    const auto safeModeFile = dataDirectory.getChildFile ("safe-mode.json");
    entries.add ({ "safe-mode.json",
                   "Whether safe startup is on, and which plug-ins it is skipping.",
                   sizeOf (safeModeFile), safeModeFile.existsAsFile(), {} });

    const auto incidentsFile = dataDirectory.getChildFile ("active-hosting-log.json");
    entries.add ({ "active-hosting-log.json",
                   "Plug-ins that were live when a previous run ended abnormally, with counts.",
                   sizeOf (incidentsFile), incidentsFile.existsAsFile(), {} });

    // §17.7's "crash dumps where available". What this product has is not a minidump — it is
    // the state that was live when a run was interrupted, which is what a diagnosis of THIS
    // product actually needs. Calling it a crash dump would overstate it, so it is not.
    if (options.includeCrashStates)
    {
        auto preserved = dataDirectory.getChildFile ("crash-state")
                                      .findChildFiles (juce::File::findFiles, false, "*.json");
        preserved.sort();

        for (const auto& file : preserved)
            entries.add ({ "crash-state/" + file.getFileName(),
                           "The rack manifest as it was when a run was interrupted.",
                           sizeOf (file), true,
                           options.includeStateBlobs ? "state blobs INCLUDED"
                                                     : "state blobs removed" });

        if (preserved.isEmpty())
            entries.add ({ "crash-state/", "No interrupted runs have been recorded.", 0, false, {} });
    }

    if (options.includeLogs)
    {
        for (const auto& log : contents.logFiles)
            entries.add ({ "logs/" + log.getFileName(), "Application log.",
                           sizeOf (log), log.existsAsFile(), {} });

        if (contents.logFiles.isEmpty())
            entries.add ({ "logs/", "No log files were offered by this build.", 0, false, {} });
    }

    if (contents.crashDumpFiles.isEmpty())
    {
        entries.add ({ "crash-dumps/", "No live-worker minidumps have been recorded.",
                       0, false, {} });
    }
    else
    {
        for (const auto& dump : contents.crashDumpFiles)
            entries.add ({ "crash-dumps/" + dump.getFileName(),
                           "A Windows live-worker minidump for stack and module diagnosis.",
                           sizeOf (dump), options.includeWorkerDumps && dump.existsAsFile(),
                           options.includeWorkerDumps
                             ? "explicitly included; may contain stack memory and local paths"
                             : "excluded by default; may contain stack memory and local paths" });
        for (const auto& metadata : contents.crashDumpMetadataFiles)
            entries.add ({ "crash-dumps/" + metadata.getFileName(),
                           "Build fingerprint and plug-in identity paired with a worker dump.",
                           sizeOf (metadata), options.includeWorkerDumps && metadata.existsAsFile(),
                           options.includeWorkerDumps
                             ? "included with its explicitly selected minidump"
                             : "excluded with its minidump by default" });
    }

    return entries;
}

juce::String SupportBundle::writeTo (const juce::File& destination,
                                     const SupportBundleOptions& options) const
{
    if (destination == juce::File())
        return "No destination was given for the support bundle.";

    juce::ZipFile::Builder builder;

    // Every entry's bytes have to outlive the builder, which streams on write.
    juce::OwnedArray<juce::MemoryBlock> owned;

    const auto addText = [&builder, &owned] (const juce::String& name, const juce::String& text)
    {
        auto* block = owned.add (new juce::MemoryBlock());
        block->append (text.toRawUTF8(), (size_t) text.getNumBytesAsUTF8());
        builder.addEntry (new juce::MemoryInputStream (*block, false), 9, name,
                          juce::Time::getCurrentTime());
    };

    const auto addJsonFile = [&addText, &options] (const juce::File& file, const juce::String& name)
    {
        if (! file.existsAsFile())
            return;

        const auto parsed = juce::JSON::parse (file.loadFileAsString());
        addText (name, juce::JSON::toString (options.includeStateBlobs
                                               ? parsed
                                               : SupportBundle::redactStateBlobs (parsed)));
    };

    addText ("support-manifest.json", juce::JSON::toString (manifestVar (options)));

    // The catalogue carries no user content — module paths, class names, failure reasons — so
    // it travels as it is.
    if (const auto catalogFile = dataDirectory.getChildFile ("plugin-catalog.json");
        catalogFile.existsAsFile())
        addText ("plugin-catalog.json", catalogFile.loadFileAsString());

    addJsonFile (dataDirectory.getChildFile ("session-performance.json"), "session-performance.json");

    for (const auto& name : { "safe-mode.json", "active-hosting-log.json" })
        if (const auto file = dataDirectory.getChildFile (name); file.existsAsFile())
            addText (name, file.loadFileAsString());

    if (options.includeCrashStates)
    {
        auto preserved = dataDirectory.getChildFile ("crash-state")
                                      .findChildFiles (juce::File::findFiles, false, "*.json");
        preserved.sort();

        for (const auto& file : preserved)
            addJsonFile (file, "crash-state/" + file.getFileName());
    }

    if (options.includeLogs)
        for (const auto& log : contents.logFiles)
            if (log.existsAsFile())
                addText ("logs/" + log.getFileName(), log.loadFileAsString());

    if (options.includeWorkerDumps)
    {
        for (const auto& dump : contents.crashDumpFiles)
            if (dump.existsAsFile())
                builder.addFile (dump, 0, "crash-dumps/" + dump.getFileName());
        for (const auto& metadata : contents.crashDumpMetadataFiles)
            if (metadata.existsAsFile())
                addJsonFile (metadata, "crash-dumps/" + metadata.getFileName());
    }

    destination.getParentDirectory().createDirectory();
    destination.deleteFile();

    juce::FileOutputStream out (destination);
    if (! out.openedOk())
        return "Could not write the support bundle to " + destination.getFullPathName();

    double progress = 0.0;
    if (! builder.writeToStream (out, &progress))
        return "The support bundle could not be assembled.";

    return {};
}

} // namespace ceditor::host
