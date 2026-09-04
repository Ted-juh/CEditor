#pragma once

#include <juce_core/juce_core.h>

// ActiveHostingMarker — startup evidence beside live failover, not process isolation.
//
// Scanning already has a dead-man marker (PluginScannerCoordinator) that names the module on
// the plate when a scan died; ACTIVE hosting needs the same evidence when failure happens
// outside a recoverable C++ exception. This writes that marker around instantiation and the
// first moments of a live plug-in's life, and reads it back at the next start.
//
// What it produces is a count per module: "this one was live when we died, three times". That
// is the field data §18.9.8 asks for. It is also immediately useful on its own — the same
// safe-startup story scanning already has — which is why it is not speculative work.
//
// What it deliberately does NOT do: move processing out of process, forward editors, or
// recover state across a boundary. Those belong to the live worker/proxy described in
// docs/design/plugin-process-isolation.md. Until that exists, this marker remains the fallback
// for failures that terminate the entire host rather than reaching GuardedPluginProcessor.

namespace ceditor::host
{

class ActiveHostingMarker
{
public:
    /** `dataDirectory` is the product's per-user directory — the same one the catalogue and
        the scanner's marker live in. */
    explicit ActiveHostingMarker (juce::File dataDirectoryToUse)
        : dataDirectory (std::move (dataDirectoryToUse))
    {
    }

    /** Called immediately before a plug-in is instantiated or first prepared: from here until
        clear(), an abnormal termination is attributable to this module. */
    void markActive (const juce::String& modulePath, const juce::String& displayName)
    {
        if (modulePath.isEmpty())
            return;

        dataDirectory.createDirectory();
        auto* marker = new juce::DynamicObject();
        marker->setProperty ("modulePath", modulePath);
        marker->setProperty ("name", displayName);
        marker->setProperty ("at", juce::Time::currentTimeMillis());
        markerFile().replaceWithText (juce::JSON::toString (juce::var (marker)));
    }

    /** The plug-in survived the window we were watching. */
    void clear()
    {
        markerFile().deleteFile();
    }

    struct Incident
    {
        juce::String modulePath;
        juce::String name;
        int count = 0;
    };

    /** Reads any marker left by a previous run, folds it into the incident log, and clears
        it. Returns the incident just recorded, or an empty modulePath when the last run
        ended cleanly. Call once at startup, before anything loads. */
    Incident consumePendingIncident()
    {
        Incident incident;

        const auto marker = markerFile();
        if (! marker.existsAsFile())
            return incident;

        const auto stored = juce::JSON::parse (marker.loadFileAsString());
        marker.deleteFile();

        incident.modulePath = stored.getProperty ("modulePath", {}).toString();
        incident.name = stored.getProperty ("name", {}).toString();
        if (incident.modulePath.isEmpty())
            return incident;

        auto log = loadLog();
        bool found = false;
        for (auto& entry : log)
            if (entry.modulePath == incident.modulePath)
            {
                ++entry.count;
                incident.count = entry.count;
                found = true;
                break;
            }

        if (! found)
        {
            incident.count = 1;
            log.add ({ incident.modulePath, incident.name, 1 });
        }

        saveLog (log);
        return incident;
    }

    /** Everything recorded so far — the evidence a decision about isolation would rest on. */
    juce::Array<Incident> incidents() const { return loadLog(); }

    void clearIncidents() const { logFile().deleteFile(); }

    juce::File markerFile() const { return dataDirectory.getChildFile ("active-hosting.marker"); }
    juce::File logFile() const    { return dataDirectory.getChildFile ("active-hosting-log.json"); }

private:
    juce::Array<Incident> loadLog() const
    {
        juce::Array<Incident> log;
        const auto stored = juce::JSON::parse (logFile().loadFileAsString());
        if (const auto* entries = stored.getProperty ("incidents", {}).getArray())
            for (const auto& entry : *entries)
                log.add ({ entry.getProperty ("modulePath", {}).toString(),
                           entry.getProperty ("name", {}).toString(),
                           juce::jmax (1, (int) entry.getProperty ("count", 1)) });
        return log;
    }

    void saveLog (const juce::Array<Incident>& log) const
    {
        juce::Array<juce::var> entries;
        for (const auto& entry : log)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("modulePath", entry.modulePath);
            obj->setProperty ("name", entry.name);
            obj->setProperty ("count", entry.count);
            entries.add (juce::var (obj));
        }

        auto* root = new juce::DynamicObject();
        root->setProperty ("incidents", entries);
        logFile().replaceWithText (juce::JSON::toString (juce::var (root)));
    }

    juce::File dataDirectory;
};

} // namespace ceditor::host
