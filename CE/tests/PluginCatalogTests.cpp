// PluginCatalogTests — Hostage's persistent class-level VST3 catalogue.
//
// The failures being designed against, in order of how bad they are:
//
//   Silent history loss.     A rescan or an unplugged drive deletes records; favourites and
//                            mappings pointing at them die with no explanation. Missing is a
//                            flag here, never a removal.
//   A stale catalogue read   needsRescan says "unchanged" for a module whose binary moved on
//   as fresh.                — the fingerprint must move when any file inside a bundle does.
//   A quarantined module     One crash-quarantined module getting rescanned unprompted takes
//   silently retried.        the next scan pass down with it, every time.
//
// juce_core only; runs anywhere. The scanner's half of the story is
// PluginScannerCoordinatorTests.

#include "InstrumentHost/PluginCatalog.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::PluginCatalog;
using ceditor::host::PluginClassRecord;
using ceditor::host::ModuleScanResult;
using ceditor::host::PluginSnapshotRegistry;

juce::File makeTempDir (const juce::String& name)
{
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                   .getChildFile ("ceditor-catalog-tests")
                   .getChildFile (name);
    dir.deleteRecursively();
    dir.createDirectory();
    return dir;
}

ModuleScanResult sampleResult (const juce::String& path)
{
    ModuleScanResult r;
    r.modulePath  = path;
    r.fingerprint = "fp-1";

    PluginClassRecord synth;
    synth.ceId = "VST3-sample-synth";
    synth.name = "Sample Synth";
    synth.vendor = "Sample Audio";
    synth.version = "2.0";
    synth.category = "Instrument";
    synth.isInstrument = true;
    synth.descriptionXml = "<PLUGIN name=\"Sample Synth\" isInstrument=\"1\"/>";
    r.classes.add (synth);

    PluginClassRecord fx;
    fx.ceId = "VST3-sample-fx";
    fx.name = "Sample Fx";
    fx.vendor = "Sample Audio";
    fx.isInstrument = false;
    r.classes.add (fx);

    return r;
}

void testCommitAndQuery()
{
    std::cout << "\ncommit + query" << std::endl;

    PluginCatalog cat;
    cat.commitScanResult (sampleResult ("C:\\VST3\\Sample.vst3"));

    check (cat.numModules() == 1, "one module record per module");
    const auto* rec = cat.findModule ("C:\\VST3\\Sample.vst3");
    check (rec != nullptr && rec->classes.size() == 2, "one record per exposed class");
    check (rec != nullptr && rec->lastScanned.isNotEmpty(), "a successful scan is timestamped");

    const auto instruments = cat.instrumentClasses();
    check (instruments.size() == 1 && instruments[0].ceId == "VST3-sample-synth",
           "instrumentClasses returns instruments only");
}

void testPersistenceRoundTrip()
{
    std::cout << "\npersistence round trip" << std::endl;

    const auto dir = makeTempDir ("roundtrip");
    const auto file = dir.getChildFile ("plugin-catalog.json");

    PluginCatalog cat;
    cat.commitScanResult (sampleResult ("C:\\VST3\\Sample.vst3"));
    cat.recordFailure ("C:\\VST3\\Broken.vst3", "fp-x", "scanner exited with code 3", true);
    check (cat.saveTo (file), "saveTo writes the file");

    PluginCatalog loaded;
    check (loaded.loadFrom (file), "loadFrom parses it back");
    check (loaded.numModules() == 2, "both modules survive the trip");

    const auto* sample = loaded.findModule ("C:\\VST3\\Sample.vst3");
    check (sample != nullptr && sample->classes.size() == 2
             && sample->classes[0].descriptionXml.isNotEmpty(),
           "class records survive with their description XML");

    const auto* broken = loaded.findModule ("C:\\VST3\\Broken.vst3");
    check (broken != nullptr && broken->quarantined && broken->failureCount == 1
             && broken->lastFailureReason.isNotEmpty(),
           "failure state survives the trip");

    PluginCatalog empty;
    check (empty.loadFrom (dir.getChildFile ("does-not-exist.json")) && empty.numModules() == 0,
           "a missing file is an empty catalogue, not an error");

    const auto garbage = dir.getChildFile ("garbage.json");
    garbage.replaceWithText ("not json at all");
    PluginCatalog fromGarbage;
    check (! fromGarbage.loadFrom (garbage) && fromGarbage.numModules() == 0,
           "unparseable content fails clean instead of half-loading");

    dir.deleteRecursively();
}

void testRescanRules()
{
    std::cout << "\nneedsRescan" << std::endl;

    PluginCatalog cat;
    check (cat.needsRescan ("C:\\VST3\\New.vst3", "fp-1"), "an unknown module needs a scan");

    cat.commitScanResult (sampleResult ("C:\\VST3\\Sample.vst3"));
    check (! cat.needsRescan ("C:\\VST3\\Sample.vst3", "fp-1"), "unchanged fingerprint is skipped");
    check (cat.needsRescan ("C:\\VST3\\Sample.vst3", "fp-2"), "changed fingerprint rescans");

    cat.markMissingExcept ({});
    check (cat.needsRescan ("C:\\VST3\\Sample.vst3", "fp-1"),
           "a module that was missing and is back rescans");

    juce::StringArray present;
    present.add ("C:\\VST3\\Sample.vst3");
    cat.markMissingExcept (present);
    cat.recordFailure ("C:\\VST3\\Sample.vst3", "fp-1", "licence dialog", false);
    check (cat.needsRescan ("C:\\VST3\\Sample.vst3", "fp-1"),
           "an unquarantined failure retries even with an unchanged fingerprint");

    cat.recordFailure ("C:\\VST3\\Sample.vst3", "fp-1", "hung", true);
    check (! cat.needsRescan ("C:\\VST3\\Sample.vst3", "fp-2"),
           "quarantine wins over a changed fingerprint");

    cat.clearQuarantine ("C:\\VST3\\Sample.vst3");
    check (cat.needsRescan ("C:\\VST3\\Sample.vst3", "fp-2"),
           "clearQuarantine is the manual retry path");
}

void testMissingAndRecovery()
{
    std::cout << "\nmissing + recovery" << std::endl;

    PluginCatalog cat;
    cat.commitScanResult (sampleResult ("C:\\VST3\\Sample.vst3"));

    cat.markMissingExcept ({});
    check (cat.numModules() == 1, "a missing module is marked, never deleted");
    check (cat.findModule ("C:\\VST3\\Sample.vst3")->missing, "and carries the missing flag");
    check (cat.instrumentClasses().isEmpty(), "missing modules leave the browser projection");

    juce::StringArray present;
    present.add ("C:\\VST3\\Sample.vst3");
    cat.markMissingExcept (present);
    check (! cat.findModule ("C:\\VST3\\Sample.vst3")->missing, "reappearing clears the flag");

    cat.recordFailure ("C:\\VST3\\Sample.vst3", "fp-1", "hung", true);
    check (cat.instrumentClasses().isEmpty(), "quarantined modules leave the projection too");
    check (cat.findModule ("C:\\VST3\\Sample.vst3")->classes.size() == 2,
           "a failure keeps the previously scanned classes (stale beats gone)");

    cat.commitScanResult (sampleResult ("C:\\VST3\\Sample.vst3"));
    const auto* rec = cat.findModule ("C:\\VST3\\Sample.vst3");
    check (rec != nullptr && ! rec->quarantined && rec->failureCount == 0
             && rec->lastFailureReason.isEmpty(),
           "a successful scan clears quarantine and failure state");
}

void testFingerprint()
{
    std::cout << "\nfingerprintFor" << std::endl;

    const auto dir = makeTempDir ("fingerprint");

    const auto file = dir.getChildFile ("Plain.vst3");
    file.replaceWithText ("aaaa");
    const auto fp1 = PluginCatalog::fingerprintFor (file);
    check (fp1.isNotEmpty(), "a file fingerprints");

    file.replaceWithText ("aaaaaaaa");
    check (PluginCatalog::fingerprintFor (file) != fp1, "a changed file changes the fingerprint");

    const auto bundle = dir.getChildFile ("Bundle.vst3");
    bundle.getChildFile ("Contents").getChildFile ("x86_64-win").createDirectory();
    const auto inner = bundle.getChildFile ("Contents").getChildFile ("x86_64-win")
                             .getChildFile ("Bundle.vst3");
    inner.replaceWithText ("binary-v1");
    const auto bundleFp1 = PluginCatalog::fingerprintFor (bundle);
    check (bundleFp1.isNotEmpty(), "a bundle directory fingerprints");

    inner.replaceWithText ("binary-v2-longer");
    check (PluginCatalog::fingerprintFor (bundle) != bundleFp1,
           "a changed inner binary changes the bundle fingerprint");

    check (PluginCatalog::fingerprintFor (dir.getChildFile ("gone.vst3")).isEmpty(),
           "a nonexistent path fingerprints empty");

    dir.deleteRecursively();
}

// --- Architecture (§17.1, §17.2) -------------------------------------------------------------
//
// The failure being designed against: a 32-bit plug-in in a 64-bit host is offered, fails to
// load, and gets quarantined for being broken. It is not broken. It is the wrong shape, that
// is readable from the file, and reading it costs nothing.

/** Writes a minimal but structurally real PE header naming `machine`. Not a loadable binary —
    the architecture check reads a header, so a header is what the test must provide. */
void writePeHeader (const juce::File& file, juce::uint16 machine)
{
    juce::MemoryBlock block (256, true);
    auto* bytes = static_cast<juce::uint8*> (block.getData());
    bytes[0] = 'M'; bytes[1] = 'Z';
    const juce::uint32 peOffset = 0x80;
    for (int i = 0; i < 4; ++i) bytes[0x3C + i] = (juce::uint8) ((peOffset >> (8 * i)) & 0xff);
    bytes[peOffset] = 'P'; bytes[peOffset + 1] = 'E';
    bytes[peOffset + 2] = 0; bytes[peOffset + 3] = 0;
    bytes[peOffset + 4] = (juce::uint8) (machine & 0xff);
    bytes[peOffset + 5] = (juce::uint8) ((machine >> 8) & 0xff);
    file.getParentDirectory().createDirectory();
    file.replaceWithData (block.getData(), block.getSize());
}

void writeElfHeader (const juce::File& file, juce::uint16 machine)
{
    juce::MemoryBlock block (256, true);
    auto* bytes = static_cast<juce::uint8*> (block.getData());
    bytes[0] = 0x7f; bytes[1] = 'E'; bytes[2] = 'L'; bytes[3] = 'F';
    bytes[4] = 2;   // 64-bit
    bytes[5] = 1;   // little-endian
    bytes[0x12] = (juce::uint8) (machine & 0xff);
    bytes[0x13] = (juce::uint8) ((machine >> 8) & 0xff);
    file.getParentDirectory().createDirectory();
    file.replaceWithData (block.getData(), block.getSize());
}

/** A VST3 bundle with one slice directory per named architecture, each holding a file — an
    empty slice directory declares nothing, which is a case the reader has to get right. */
juce::File makeBundle (const juce::File& parent, const juce::String& name,
                       const juce::StringArray& sliceDirectories)
{
    const auto bundle = parent.getChildFile (name);
    for (const auto& slice : sliceDirectories)
    {
        const auto dir = bundle.getChildFile ("Contents").getChildFile (slice);
        dir.createDirectory();
        dir.getChildFile (name).replaceWithText ("binary");
    }
    return bundle;
}

// Vendor artwork: the path is catalogue data, and the WebView never sees it.
//
// The failure this is guarding is not a missing picture. It is a resource provider that will
// read any absolute path the frontend asks for, which is what a naive "just serve the
// snapshotPath" would be — so the registry is the only way a file becomes readable, and a
// token that was never published resolves to nothing.
void testSnapshots()
{
    std::cout << "\nvendor snapshots" << std::endl;

    auto dir = makeTempDir ("snapshots");
    auto png = dir.getChildFile ("Sample.png");
    png.replaceWithText ("not really a png, but it exists");

    // The path survives a save/load, or every start would show artwork only after a rescan.
    auto result = sampleResult ("/plugins/Art.vst3");
    result.classes.getReference (0).snapshotPath = png.getFullPathName();
    PluginCatalog catalog;
    catalog.commitScanResult (result);

    const auto file = dir.getChildFile ("catalog.json");
    check (catalog.saveTo (file), "the catalogue saves");
    PluginCatalog reloaded;
    check (reloaded.loadFrom (file), "and reloads");
    check (reloaded.findModule ("/plugins/Art.vst3")->classes.getReference (0).snapshotPath
             == png.getFullPathName(),
           "a class's snapshot path survives the round trip");
    check (reloaded.findModule ("/plugins/Art.vst3")->classes.getReference (1).snapshotPath.isEmpty(),
           "and a class with no artwork stays empty rather than inheriting its neighbour's");

    auto& registry = PluginSnapshotRegistry::instance();
    const auto token = registry.publish ("VST3-sample-synth", png);
    check (token.isNotEmpty(), "publishing a file that exists yields a token");
    check (! token.contains (dir.getFullPathName()) && ! token.contains ("Sample.png"),
           "and the token does not carry the path it stands for");
    check (registry.resolve (token) == png, "the token resolves back to the file");
    check (registry.publish ("VST3-sample-synth", png) == token,
           "publishing the same class twice is the same token");

    check (registry.publish ("VST3-ghost", dir.getChildFile ("nothing.png")).isEmpty(),
           "a file that is not there publishes nothing");

    // The whole point: anything not published is unreachable, however it is spelled.
    check (! registry.resolve ("").existsAsFile(), "an empty token resolves to nothing");
    check (! registry.resolve ("deadbeef").existsAsFile(), "an unknown token resolves to nothing");
    check (! registry.resolve (png.getFullPathName()).existsAsFile(),
           "and the path itself is not a token — asking for a file by name gets nothing");

    dir.deleteRecursively();
}

void testArchitectureReading()
{
    auto dir = makeTempDir ("architecture");

    // Bundles declare their slices by directory name, in the VST3 SDK's spelling.
    check (PluginCatalog::architecturesOf (makeBundle (dir, "Win64.vst3", { "x86_64-win" }))
             == juce::StringArray { "x86_64" }, "a 64-bit Windows bundle reads as x86_64");
    check (PluginCatalog::architecturesOf (makeBundle (dir, "Win32.vst3", { "x86-win" }))
             == juce::StringArray { "x86" }, "a 32-bit Windows bundle reads as x86");
    check (PluginCatalog::architecturesOf (makeBundle (dir, "Arm.vst3", { "aarch64-linux" }))
             == juce::StringArray { "arm64" }, "aarch64 and arm64 are the same architecture");

    const auto fat = PluginCatalog::architecturesOf (
        makeBundle (dir, "Fat.vst3", { "x86-win", "x86_64-win" }));
    check (fat.size() == 2 && fat.contains ("x86") && fat.contains ("x86_64"),
           "a bundle carrying two slices reports both");

    // An empty slice directory is a declaration of nothing — a stale build leftover must not
    // make a module look like it supports an architecture it has no binary for.
    const auto hollow = dir.getChildFile ("Hollow.vst3");
    hollow.getChildFile ("Contents").getChildFile ("x86-win").createDirectory();
    check (PluginCatalog::architecturesOf (hollow).isEmpty(),
           "an empty slice directory declares nothing");

    check (PluginCatalog::architecturesOf (dir.getChildFile ("NoContents.vst3")).isEmpty(),
           "a path that is not there reads as unknown, not as unsupported");

    // Bare modules name themselves in their own header.
    const auto pe64 = dir.getChildFile ("Bare64.vst3");
    writePeHeader (pe64, 0x8664);
    check (PluginCatalog::architecturesOf (pe64) == juce::StringArray { "x86_64" },
           "a bare PE module reads its machine field");

    const auto pe32 = dir.getChildFile ("Bare32.vst3");
    writePeHeader (pe32, 0x014c);
    check (PluginCatalog::architecturesOf (pe32) == juce::StringArray { "x86" },
           "and a 32-bit one reads as x86 without being loaded");

    const auto elf = dir.getChildFile ("Bare.so");
    writeElfHeader (elf, 0x3e);
    check (PluginCatalog::architecturesOf (elf) == juce::StringArray { "x86_64" },
           "an ELF module reads its e_machine");

    const auto garbage = dir.getChildFile ("Garbage.vst3");
    garbage.replaceWithText ("this is not a binary at all");
    check (PluginCatalog::architecturesOf (garbage).isEmpty(),
           "an unrecognisable header reads as unknown");

    // A bundle whose slice directory is unnamed (macOS spells it MacOS) falls through to the
    // binary inside it.
    const auto mac = dir.getChildFile ("Mac.vst3");
    const auto macos = mac.getChildFile ("Contents").getChildFile ("MacOS");
    macos.createDirectory();
    writeElfHeader (macos.getChildFile ("Mac"), 0x3e);
    check (PluginCatalog::architecturesOf (mac) == juce::StringArray { "x86_64" },
           "an unnamed slice directory falls back to reading the binary in it");

    dir.deleteRecursively();
}

void testArchitectureGating()
{
    auto dir = makeTempDir ("architecture-gating");
    const auto host = PluginCatalog::hostArchitecture();
    check (host.isNotEmpty(), "this build knows its own architecture");

    const auto wrong = host == "x86" ? juce::String ("x86_64") : juce::String ("x86");

    PluginCatalog catalog;
    catalog.commitScanResult (sampleResult ("/plugins/Right.vst3"));
    catalog.commitScanResult (sampleResult ("/plugins/Wrong.vst3"));
    catalog.recordArchitectures ("/plugins/Right.vst3", { host });
    catalog.recordArchitectures ("/plugins/Wrong.vst3", { wrong });

    check (catalog.findModule ("/plugins/Right.vst3")->architectureSupported(),
           "a module built for this host is supported");
    check (! catalog.findModule ("/plugins/Wrong.vst3")->architectureSupported(),
           "and one built for another architecture is not");

    // Not quarantined. There is nothing to retry and nothing was attempted.
    check (! catalog.findModule ("/plugins/Wrong.vst3")->quarantined,
           "the wrong architecture is not a failure, so it does not quarantine");
    check (catalog.findModule ("/plugins/Wrong.vst3")->failureCount == 0,
           "and it does not count as a failure");

    check (catalog.findModule ("/plugins/Wrong.vst3")->unavailableReason().contains (wrong),
           "the reason names the architecture it was built for");
    check (catalog.findModule ("/plugins/Right.vst3")->unavailableReason().isEmpty(),
           "a healthy module has no reason to give");

    // The browser must not offer what cannot load.
    const auto instruments = catalog.instrumentClasses();
    check (instruments.size() == 1, "only the loadable module reaches the instrument browser");
    const auto effects = catalog.effectClasses();
    check (effects.size() == 1, "and the effect browser agrees");

    // And the scanner must not spend a process on it.
    check (! catalog.needsRescan ("/plugins/Wrong.vst3", "changed-fingerprint"),
           "a wrong-architecture module is not rescanned even when its file changes");
    check (catalog.needsRescan ("/plugins/Right.vst3", "changed-fingerprint"),
           "a right-architecture module still is");

    // Unknown reads as supported, from either side: hiding a working plug-in because a header
    // was unfamiliar is the worse failure.
    catalog.commitScanResult (sampleResult ("/plugins/Unknown.vst3"));
    check (catalog.findModule ("/plugins/Unknown.vst3")->architectureSupported(),
           "a module whose architecture could not be read is still offered");

    // First sighting of a wrong-architecture module still produces a record, so the answer to
    // "why is my plug-in not in the list" exists somewhere.
    catalog.recordArchitectures ("/plugins/NeverScanned.vst3", { wrong });
    check (catalog.findModule ("/plugins/NeverScanned.vst3") != nullptr,
           "a module rejected before its first scan is still catalogued");
    check (catalog.findModule ("/plugins/NeverScanned.vst3")->unavailableReason().isNotEmpty(),
           "with the reason attached");

    // Round-trips, or the check runs again on every start and the reason vanishes in between.
    const auto file = dir.getChildFile ("catalog.json");
    check (catalog.saveTo (file), "the catalogue saves");
    PluginCatalog reloaded;
    check (reloaded.loadFrom (file), "and reloads");
    check (! reloaded.findModule ("/plugins/Wrong.vst3")->architectureSupported(),
           "the architecture survives the round trip");

    dir.deleteRecursively();
}
} // namespace

int main()
{
    std::cout << "PluginCatalog tests" << std::endl;

    testCommitAndQuery();
    testPersistenceRoundTrip();
    testRescanRules();
    testMissingAndRecovery();
    testFingerprint();
    testArchitectureReading();
    testArchitectureGating();
    testSnapshots();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
