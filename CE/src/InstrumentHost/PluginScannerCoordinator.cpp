#include "PluginScannerCoordinator.h"

namespace ceditor::host
{

namespace
{
    PluginClassRecord classFromPluginElement (const juce::XmlElement& e)
    {
        PluginClassRecord c;
        c.ceId         = e.getStringAttribute ("ceId");
        c.name         = e.getStringAttribute ("name");
        c.vendor       = e.getStringAttribute ("manufacturer");
        c.version      = e.getStringAttribute ("version");
        c.category     = e.getStringAttribute ("category");
        c.isInstrument = e.getBoolAttribute ("isInstrument");
        c.descriptionXml = e.toString (juce::XmlElement::TextFormat().singleLine());
        return c;
    }
}

PluginScannerCoordinator::PluginScannerCoordinator (Options optionsToUse)
    : options (std::move (optionsToUse))
{
}

PluginScannerCoordinator::JobResult PluginScannerCoordinator::runOneJob (const juce::String& modulePath)
{
    JobResult job;

    // Checked here because ChildProcess::start cannot be trusted to report it: on POSIX the
    // fork succeeds and the exec fails in the child, so a missing worker would otherwise
    // masquerade as a module crash — and quarantine an innocent module.
    if (! options.workerExecutable.existsAsFile())
    {
        job.status = JobStatus::launchFailed;
        job.detail = "scanner worker not found: " + options.workerExecutable.getFullPathName();
        return job;
    }

    juce::StringArray args;
    args.add (options.workerExecutable.getFullPathName());
    args.add ("--scan");
    args.add (modulePath);

    juce::ChildProcess child;
    if (! child.start (args, juce::ChildProcess::wantStdOut))
    {
        job.status = JobStatus::launchFailed;
        job.detail = "could not start " + options.workerExecutable.getFullPathName();
        return job;
    }

    if (! child.waitForProcessToFinish (options.perModuleTimeoutMs))
    {
        child.kill();
        job.status = JobStatus::timedOut;
        job.detail = "no result within " + juce::String (options.perModuleTimeoutMs) + " ms";
        return job;
    }

    const auto output   = child.readAllProcessOutput();
    const auto exitCode = (int) child.getExitCode();

    const auto parsed = juce::XmlDocument::parse (output);
    const bool isScanResult = parsed != nullptr && parsed->hasTagName ("SCANRESULT");

    if (! isScanResult)
    {
        job.status = exitCode == 0 ? JobStatus::badOutput : JobStatus::crashed;
        job.detail = exitCode == 0 ? "unparseable scanner output"
                                   : "scanner exited with code " + juce::String (exitCode);
        return job;
    }

    if (const auto* error = parsed->getChildByName ("ERROR"))
    {
        job.status = JobStatus::reportedError;
        job.detail = error->getStringAttribute ("message", "scan failed");
        return job;
    }

    if (exitCode != 0)
    {
        job.status = JobStatus::crashed;
        job.detail = "scanner exited with code " + juce::String (exitCode);
        return job;
    }

    job.status = JobStatus::ok;
    job.result.modulePath = modulePath;
    for (const auto* plugin : parsed->getChildWithTagNameIterator ("PLUGIN"))
        job.result.classes.add (classFromPluginElement (*plugin));

    return job;
}

PluginScannerCoordinator::ScanOutcome PluginScannerCoordinator::scanModules (const juce::StringArray& modulePaths,
                                                                             PluginCatalog& catalog)
{
    const auto log = [this] (const juce::String& line)
    {
        if (options.log != nullptr)
            options.log (line);
    };

    ScanOutcome outcome;
    catalog.markMissingExcept (modulePaths);

    const auto marker = markerFile (options.markerDirectory);

    for (const auto& path : modulePaths)
    {
        if (options.shouldContinue != nullptr && ! options.shouldContinue())
        {
            log ("scan stopped before: " + path);
            break;
        }

        const auto* existing = catalog.findModule (path);
        if (existing != nullptr && existing->quarantined)
        {
            ++outcome.skippedQuarantined;
            continue;
        }

        const auto fingerprint = PluginCatalog::fingerprintFor (juce::File (path));
        if (! catalog.needsRescan (path, fingerprint))
        {
            ++outcome.skippedUnchanged;
            continue;
        }

        log ("scanning: " + path);
        options.markerDirectory.createDirectory();
        marker.replaceWithText (path);

        auto job = runOneJob (path);

        if (job.status == JobStatus::ok)
        {
            job.result.fingerprint = fingerprint;
            catalog.commitScanResult (job.result);
            ++outcome.scanned;
        }
        else
        {
            // A crash or hang just cost a process; do not walk into it again unprompted.
            // Reported errors and garbage output get options.failuresBeforeQuarantine tries.
            const bool violent = job.status == JobStatus::timedOut
                              || job.status == JobStatus::crashed;
            const int priorFailures = existing != nullptr ? existing->failureCount : 0;
            const bool quarantineNow = violent
                                    || priorFailures + 1 >= options.failuresBeforeQuarantine;

            catalog.recordFailure (path, fingerprint, job.detail, quarantineNow);
            ++outcome.failed;
            log ("scan failed (" + job.detail + (quarantineNow ? "), quarantined: " : "): ") + path);
        }

        marker.deleteFile();
    }

    return outcome;
}

juce::File PluginScannerCoordinator::markerFile (const juce::File& markerDirectory)
{
    return markerDirectory.getChildFile ("scan-active.marker");
}

juce::String PluginScannerCoordinator::pendingMarkerModule (const juce::File& markerDirectory)
{
    const auto marker = markerFile (markerDirectory);
    return marker.existsAsFile() ? marker.loadFileAsString().trim() : juce::String();
}

juce::StringArray PluginScannerCoordinator::enumerateVst3Candidates (const juce::Array<juce::File>& roots)
{
    juce::StringArray found;

    // Recursive by hand rather than a wildcard iterator: a .vst3 can be a bundle DIRECTORY,
    // and the walk must record it and not descend into it.
    std::function<void (const juce::File&)> walk = [&] (const juce::File& dir)
    {
        for (const auto& entry : juce::RangedDirectoryIterator (dir, false, "*",
                                                                juce::File::findFilesAndDirectories))
        {
            const auto f = entry.getFile();

            if (f.getFileName().endsWithIgnoreCase (".vst3"))
                found.add (f.getFullPathName());
            else if (f.isDirectory())
                walk (f);
        }
    };

    for (const auto& root : roots)
        if (root.isDirectory())
            walk (root);

    found.sort (false);
    found.removeDuplicates (false);
    return found;
}

juce::Array<juce::File> PluginScannerCoordinator::defaultWindowsVst3Roots()
{
    juce::Array<juce::File> roots;

    const auto addIfPresent = [&roots] (const juce::File& f)
    {
        if (f.isDirectory())
            roots.add (f);
    };

    addIfPresent (juce::File ("C:\\Program Files\\Common Files\\VST3"));
    addIfPresent (juce::File ("C:\\Program Files (x86)\\Common Files\\VST3"));

    const auto localAppData = juce::SystemStats::getEnvironmentVariable ("LOCALAPPDATA", {});
    if (localAppData.isNotEmpty())
        addIfPresent (juce::File (localAppData).getChildFile ("Programs")
                                               .getChildFile ("Common")
                                               .getChildFile ("VST3"));

    return roots;
}

} // namespace ceditor::host
