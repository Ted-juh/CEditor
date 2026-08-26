// PluginCatalogTests — the persistent class-level VST3 catalogue (VIP-successor Stage 1).
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
} // namespace

int main()
{
    std::cout << "PluginCatalog tests" << std::endl;

    testCommitAndQuery();
    testPersistenceRoundTrip();
    testRescanRules();
    testMissingAndRecovery();
    testFingerprint();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
