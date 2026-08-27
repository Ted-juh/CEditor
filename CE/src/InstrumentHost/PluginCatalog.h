#pragma once

#include <juce_core/juce_core.h>

// PluginCatalog — the persistent, class-level VST3 catalogue (VIP-successor Stage 1).
//
// Reuse rulings and the reasoning behind this file's shape are in
// docs/design/instrument-host-integration-audit.md. The two that matter here:
//
//   CLASS-LEVEL, NOT MODULE-LEVEL. One .vst3 module can expose several selectable classes, so
//   the catalogue stores one record per exposed class under its module, and identity is the
//   class's `ceId` — JUCE's PluginDescription identifier string, computed by the scanner worker
//   from the loaded module. Display names are metadata, never identity. The same class installed
//   in two locations produces two module records with equal ceIds; grouping those is a browser
//   concern, not a storage one.
//
//   JUCE-CORE ONLY. This type is compiled into the editor and into plain test executables that
//   run on any machine. Nothing here loads a plug-in or touches juce_audio_processors — the
//   per-class `descriptionXml` is carried as the opaque string the worker produced, and only
//   code that actually instantiates a plug-in (app-side, behind JUCE_PLUGINHOST_VST3) parses it
//   back into a PluginDescription.
//
// Failure state lives with the module because that is what the scanner can attribute: a crash
// or hang kills the helper process while exactly one module is on its plate. A quarantined
// module is skipped by every future scan until the user clears it — never silently retried,
// and never deleted (`missing` is a flag for the same reason: history survives an unplugged
// drive or an uninstalled plug-in).

namespace ceditor::host
{

struct PluginClassRecord
{
    juce::String ceId;             // stable CEditor identity: the JUCE plugin identifier string
    juce::String name;
    juce::String vendor;
    juce::String version;
    juce::String category;
    bool isInstrument = false;
    juce::String descriptionXml;   // lossless JUCE PluginDescription XML, opaque at this layer
};

struct ModuleRecord
{
    juce::String path;             // the .vst3 file or bundle directory
    juce::String fingerprint;      // PluginCatalog::fingerprintFor at last scan
    juce::String lastScanned;      // ISO 8601, empty until first successful scan
    bool missing = false;
    bool quarantined = false;
    int failureCount = 0;
    juce::String lastFailureReason;
    juce::Array<PluginClassRecord> classes;
};

struct ModuleScanResult
{
    juce::String modulePath;
    juce::String fingerprint;
    juce::Array<PluginClassRecord> classes;
};

class PluginCatalog
{
public:
    /** Replaces the in-memory catalogue with the file's contents. A missing file is an empty
        catalogue and returns true; unparseable content returns false and leaves the catalogue
        empty rather than half-loaded. */
    bool loadFrom (const juce::File& file);

    bool saveTo (const juce::File& file) const;

    /** Upserts the module and its classes. A successful scan clears failure state, quarantine
        and the missing flag — the module just proved itself. Zero classes is still a success
        (a module this platform cannot load, or one exposing nothing). */
    void commitScanResult (const ModuleScanResult& result,
                           juce::Time when = juce::Time::getCurrentTime());

    /** Records a failed scan. Increments the failure count, keeps any previously scanned
        classes (stale beats gone), and quarantines when asked — the coordinator decides the
        policy, this stores the outcome. */
    void recordFailure (const juce::String& modulePath,
                        const juce::String& fingerprint,
                        const juce::String& reason,
                        bool quarantineNow);

    /** Manual retry: clears quarantine and the failure count so the next scan tries again. */
    void clearQuarantine (const juce::String& modulePath);

    /** True when a scan job is warranted: an unknown module, a changed fingerprint, or a module
        that was missing and is back. Quarantined modules always return false — release them
        with clearQuarantine, not by rescanning. */
    bool needsRescan (const juce::String& modulePath, const juce::String& currentFingerprint) const;

    /** Marks every catalogued module absent from `presentPaths` as missing, and every one
        present as not missing. Never deletes a record. */
    void markMissingExcept (const juce::StringArray& presentPaths);

    const ModuleRecord* findModule (const juce::String& modulePath) const;

    /** Every instrument class from modules that are present and not quarantined — the default
        browser projection. */
    juce::Array<PluginClassRecord> instrumentClasses() const;
    /** The non-instrument classes of healthy modules — the effect picker's projection
        (Stage 5), same health rules as the instrument browser's. */
    juce::Array<PluginClassRecord> effectClasses() const;

    const juce::Array<ModuleRecord>& allModules() const   { return modules; }
    int numModules() const                                { return modules.size(); }

    /** Change-detection stamp for a module file or bundle directory. For a directory the walk
        is recursive and sorted by relative path, so the stamp is deterministic and moves when
        any inner binary does — a bundle's own mtime does not reliably change when its contents
        do. Size + mtime, not content hashes: cheap enough to run on every scan pass. */
    static juce::String fingerprintFor (const juce::File& moduleFileOrBundle);

private:
    ModuleRecord* find (const juce::String& modulePath);

    juce::Array<ModuleRecord> modules;
};

} // namespace ceditor::host
