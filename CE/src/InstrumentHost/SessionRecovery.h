#pragma once

#include <juce_core/juce_core.h>

// SessionRecovery — what §17.3 asks a session to maintain, and what to do with it after a crash.
//
// The baseline's list is short and every item on it earns its place:
//
//   Last explicitly saved session      session-performance.json, since Stage 1.
//   Rolling recovery snapshots         session-revisions/, since Stage 5.
//   Last-known-good snapshot           HERE.
//   Pending risky-operation marker     HERE.
//   Plug-in state hashes               beside each state blob, in the manifest.
//
// The first two already existed and neither is a recovery story on its own. The rolling
// revisions are minutes apart and say nothing about whether the rig in them ever ran; the last
// saved session is the one that was live when the process died, which — after a crash — is
// precisely the state under suspicion. Recovering to it is recovering to the crash.
//
// LAST-KNOWN-GOOD is the missing piece: a copy taken when the product has actually proved the
// rig, meaning the restore completed with everything resolved and nothing refused. That is a
// state somebody can be returned to.
//
// THE RISKY-OPERATION MARKER answers §17.3's third recovery step, "identify the last
// operation". The active-hosting marker already names the MODULE that was live; this names
// what the product was DOING — restoring a session, loading an instrument into a part,
// replacing one. A crash during a restore and a crash while adding one plug-in look identical
// in a log and call for different repairs.
//
// THE CRASHED STATE IS PRESERVED, not overwritten (§17.3 step 4). The first save of the new
// run would otherwise destroy the only copy of the state that produced the crash, which is the
// one file a diagnosis needs.
//
// What this deliberately does NOT do: decide anything. It records, preserves and reports. Which
// plug-in is skipped on the way back up is SafeMode's business, and whether to restore from the
// last-known-good at all is the user's.
//
// juce_core only.

namespace ceditor::host
{

class SessionRecovery
{
public:
    explicit SessionRecovery (juce::File dataDirectoryToUse)
        : dataDirectory (std::move (dataDirectoryToUse))
    {
    }

    /** What the last run was doing when it stopped, and what is available to go back to. */
    struct Report
    {
        /** True when a marker was still on disk at startup: the last run did not finish what
            it started. Not the same as "crashed" — a kill, a power cut and a hang all land
            here, and none of them is a plug-in's fault by itself. */
        bool interrupted = false;
        juce::String lastOperation;         // "restoreSession", "loadInstrument", "loadEffect"
        juce::String lastOperationDetail;   // the plug-in or part it was working on
        juce::String preservedStateFile;    // where the state live at the interruption was kept
        juce::String lastKnownGoodAt;       // ISO 8601, empty when there is none
        bool hasLastKnownGood = false;

        bool anythingToReport() const { return interrupted || hasLastKnownGood; }
    };

    /** Names what is about to happen, in case it does not finish. Cheap enough to call around
        every plug-in load: one small file write, and the alternative is not knowing. */
    void beginOperation (const juce::String& kind, const juce::String& detail) const
    {
        dataDirectory.createDirectory();
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("kind",   kind);
        obj->setProperty ("detail", detail);
        obj->setProperty ("at",     juce::Time::getCurrentTime().toISO8601 (true));
        operationMarkerFile().replaceWithText (juce::JSON::toString (juce::var (obj)));
    }

    /** It finished. Nothing that happens from here is attributable to that operation. */
    void endOperation() const
    {
        operationMarkerFile().deleteFile();
    }

    /** Call once at startup, before anything is loaded or saved. Consumes the marker and, when
        one was there, preserves a copy of the session file that was live at the time — the
        first save of this run would otherwise be the end of the only evidence.

        `liveSessionFile` may not exist (a first run, or a wrapper whose state arrives from the
        host); an interruption is still reported, without a preserved file. */
    Report consumeAtStartup (const juce::File& liveSessionFile)
    {
        Report report;

        const auto marker = operationMarkerFile();
        if (marker.existsAsFile())
        {
            const auto stored = juce::JSON::parse (marker.loadFileAsString());
            marker.deleteFile();

            report.interrupted = true;
            report.lastOperation = stored.getProperty ("kind", {}).toString();
            report.lastOperationDetail = stored.getProperty ("detail", {}).toString();

            if (liveSessionFile.existsAsFile())
            {
                const auto directory = crashStateDirectory();
                directory.createDirectory();

                const auto now = juce::Time::getCurrentTime();
                const auto stamp = now.formatted ("%Y%m%d-%H%M%S")
                                     + "-" + juce::String (now.getMilliseconds()).paddedLeft ('0', 3);
                const auto preserved = directory.getChildFile ("session-at-" + stamp + ".json")
                                                .getNonexistentSibling();

                if (liveSessionFile.copyFileTo (preserved))
                    report.preservedStateFile = preserved.getFullPathName();

                pruneCrashStates();
            }
        }

        if (const auto good = lastKnownGoodFile(); good.existsAsFile())
        {
            report.hasLastKnownGood = true;
            report.lastKnownGoodAt = good.getLastModificationTime().toISO8601 (true);
        }

        currentReport = report;
        return report;
    }

    /** The product has proved this rig: the restore completed, everything resolved, nothing
        was refused. Only then is a state worth going back to. */
    void markKnownGood (const juce::File& liveSessionFile) const
    {
        if (! liveSessionFile.existsAsFile())
            return;

        dataDirectory.createDirectory();
        liveSessionFile.copyFileTo (lastKnownGoodFile());
    }

    Report lastReport() const   { return currentReport; }

    /** The user has seen it. Clears the interruption half only — the last-known-good is a
        standing offer, not a notification. */
    void acknowledgeReport()
    {
        currentReport.interrupted = false;
        currentReport.lastOperation = {};
        currentReport.lastOperationDetail = {};
        currentReport.preservedStateFile = {};
    }

    juce::File operationMarkerFile() const { return dataDirectory.getChildFile ("operation.marker"); }
    juce::File lastKnownGoodFile() const   { return dataDirectory.getChildFile ("session-last-known-good.json"); }
    juce::File crashStateDirectory() const { return dataDirectory.getChildFile ("crash-state"); }

    /** A stable digest of a state blob, for "is this the state that was saved". Change
        detection and corruption detection, not integrity against a determined attacker —
        juce_core is the whole dependency budget here, exactly as for module fingerprints. */
    static juce::String hashState (const juce::String& base64State)
    {
        if (base64State.isEmpty())
            return {};

        return juce::String::toHexString (base64State.hashCode64())
                 + "-" + juce::String (base64State.length());
    }

    /** RAII around beginOperation/endOperation, so an early return cannot leave a marker
        behind and make the next start report an interruption that never happened. */
    class ScopedOperation
    {
    public:
        ScopedOperation (const SessionRecovery* ownerToUse, const juce::String& kind,
                         const juce::String& detail)
            : owner (ownerToUse)
        {
            if (owner != nullptr)
                owner->beginOperation (kind, detail);
        }

        ~ScopedOperation()
        {
            if (owner != nullptr)
                owner->endOperation();
        }

        ScopedOperation (const ScopedOperation&) = delete;
        ScopedOperation& operator= (const ScopedOperation&) = delete;

    private:
        const SessionRecovery* owner;
    };

private:
    /** A crash a week for a year is 52 copies of a rig nobody will read. Keep the recent ones;
        they are what a support bundle carries. */
    void pruneCrashStates() const
    {
        constexpr int maxPreserved = 8;

        auto preserved = crashStateDirectory().findChildFiles (juce::File::findFiles, false, "*.json");
        preserved.sort();   // stamped names sort chronologically

        for (int i = 0; i < preserved.size() - maxPreserved; ++i)
            preserved.getReference (i).deleteFile();
    }

    juce::File dataDirectory;
    Report currentReport;
};

} // namespace ceditor::host
