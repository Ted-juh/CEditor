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
//
// ARCHITECTURE IS READ, NOT ATTEMPTED (§17.1 "Architecture check", §17.2 "Validate capability
// and architecture records"). A 32-bit plug-in in a 64-bit host cannot load, and finding that
// out by handing it to the scanner costs a process launch and produces a failure indis-
// tinguishable from a broken plug-in — so the module gets quarantined for being the wrong
// shape, which is wrong twice over. The architecture is instead read from the file: a VST3
// bundle names its slices in directories, and a bare module names itself in its own binary
// header. Neither needs the module loaded, so this stays in juce_core and runs everywhere.
//
// A wrong-architecture module is `unsupported`, which is deliberately NOT `quarantined`: it is
// not broken and there is nothing to retry. It stays in the catalogue with its reason, it is
// kept out of the browser (offering something that cannot load is a lie), and the reason is
// there when somebody asks why their plug-in is not in the list. When the architecture cannot
// be determined the module is treated as supported — silence is not evidence, and hiding a
// working plug-in because a header was unfamiliar is the worse failure.

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
    /** Which plug-in format this class came from (Stage 7, §18.9.6). "VST3" today; the field
        exists so a second format is a REGISTRATION rather than a rewrite — the catalogue, the
        library, the parameter model, the editor host and the state path all key off the same
        record, and none of them care which format produced it. An absent value reads as VST3,
        which is what every pre-Stage-7 catalogue on disk contains. */
    juce::String formatName { "VST3" };
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
    /** What the module's own file says it is: "x86", "x86_64", "arm64", or several of those
        for a fat bundle. Empty means the check could not tell, which reads as supported. */
    juce::StringArray architectures;
    juce::Array<PluginClassRecord> classes;

    /** False only when the architectures are known AND this host's is not among them. */
    bool architectureSupported() const;

    /** Why the browser is not offering this module, or empty when it is. */
    juce::String unavailableReason() const;
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

    /** Records the architectures read from a module's own files, without scanning it. Creates
        the record if this is the first time the module has been seen, so a wrong-architecture
        module is catalogued with its reason rather than silently skipped. */
    void recordArchitectures (const juce::String& modulePath, const juce::StringArray& architectures);

    /** The architecture slices a module declares, read from the file rather than by loading it:
        a VST3 bundle's `Contents/<arch>-<os>` directory names, or the machine field in a bare
        module's own binary header (PE, ELF and Mach-O are all recognised). Empty when nothing
        recognisable was found — that is "could not tell", never "unsupported". */
    static juce::StringArray architecturesOf (const juce::File& moduleFileOrBundle);

    /** The architecture this build runs as, in the same vocabulary architecturesOf returns. */
    static juce::String hostArchitecture();

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
