// SonicAnalysisWorkerTests — the out-of-process auditioner's protocol and its recovery
// (Sound Browser Stage B2).
//
// Driven against the stub worker (ScannerStubMain.cpp), whose path arrives as argv[1] from
// CTest, so every behaviour that matters here — a plug-in that dies on one preset, one that
// hangs, one that never loads, one that prints its own noise on stdout — runs on any machine
// with no real VST3 at all. Gate S is where a real plug-in gets played; this is where the
// coordinator's arithmetic around a worker that misbehaves is proven, because that is the part
// that must be right and the part a real plug-in will not reliably do on demand.
//
// What is being proven:
//
//   The 299 survive.        A crash partway through keeps every finding before it.
//   The dead preset is named. The one on the plate when the process died is blamed, recorded,
//                           and skipped; the rest get a fresh process.
//   A dead plug-in is not a dead library. A module that never loads leaves its presets
//                           UNTOUCHED — not stamped unmeasurable — because that is usually the
//                           machine that day, not the presets.
//   Noise is not data.      A plug-in printing to stdout cannot derail the run.
//   Nothing runs forever.   A hang is killed by the watchdog and blamed like a crash.

#include "InstrumentHost/SonicAnalysisWorker.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::AnalysisFinding;
using ceditor::host::AnalysisJob;
using ceditor::host::AnalysisPreset;
using ceditor::host::SonicAnalysisWorker;

juce::File testRoot()
{
    return juce::File::getSpecialLocation (juce::File::tempDirectory)
               .getChildFile ("ceditor-audition-tests");
}

/** A job whose presets are named by the caller — the stub picks its behaviour out of the name,
    so "two, three-crash, four" reads as the scenario it is. */
AnalysisJob jobWith (const juce::String& ceId, const juce::StringArray& presetNames)
{
    AnalysisJob job;
    job.targetCeId = ceId;
    job.descriptionXml = "<PLUGIN name=\"Stub\" ceId=\"" + ceId + "\"/>";

    for (int i = 0; i < presetNames.size(); ++i)
    {
        AnalysisPreset preset;
        preset.recordId = "rec-" + juce::String (i + 1);
        preset.fingerprint = "fp-" + juce::String (i + 1);
        preset.name = presetNames[i];
        preset.sourceType = "programList";
        preset.sourceLocator = "program/" + juce::String (i);
        job.presets.push_back (std::move (preset));
    }

    return job;
}

struct Collected
{
    std::vector<AnalysisFinding> findings;

    juce::StringArray ids() const
    {
        juce::StringArray out;
        for (const auto& finding : findings)
            out.add (finding.recordId);
        return out;
    }

    const AnalysisFinding* find (const juce::String& recordId) const
    {
        for (const auto& finding : findings)
            if (finding.recordId == recordId)
                return &finding;
        return nullptr;
    }
};

SonicAnalysisWorker::Options optionsFor (const juce::File& worker)
{
    SonicAnalysisWorker::Options options;
    options.workerExecutable = worker;
    options.jobDirectory = testRoot().getChildFile ("jobs");
    // Short, because every timeout here is a test waiting: the stub answers instantly when it
    // is going to answer at all.
    options.startupTimeoutMs = 5'000;
    options.quietTimeoutMs = 3'000;
    return options;
}

void testCleanRun (const juce::File& worker)
{
    std::cout << "\n-- a job that goes through" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-clean", { "one", "two", "three" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });

    check (outcome.measured == 3, "every preset comes back measured");
    check (outcome.blamed == 0 && outcome.relaunches == 0, "nothing was blamed and nothing restarted");
    check (! outcome.moduleFailed, "the module did not fail");
    check (collected.ids().joinIntoString (",") == "rec-1,rec-2,rec-3", "in the order they were sent");

    if (const auto* second = collected.find ("rec-2"))
    {
        check (second->profile.measured, "a finding carries a measurement");
        check (second->fingerprint == "fp-2", "filed against the bytes it was measured from");
        check (std::abs (second->profile.brightness - 0.2f) < 0.001f,
               "the numbers survive the pipe");
        check (second->profile.envelope.size() == 3, "and so does the drawn envelope");
    }
    else
    {
        check (false, "the second preset came back at all");
    }
}

void testCrashBlamesOnePresetAndCarriesOn (const juce::File& worker)
{
    std::cout << "\n-- a plug-in that dies on one preset" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-crashy", { "one", "two", "three-crash", "four", "five" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });

    check (outcome.measured == 4, "the four that could be played were");
    check (outcome.blamed == 1, "exactly one preset was blamed");
    check (outcome.relaunches == 1, "and it cost exactly one relaunch");

    check (collected.find ("rec-1") != nullptr && collected.find ("rec-2") != nullptr,
           "everything measured BEFORE the crash survives it");
    check (collected.find ("rec-4") != nullptr && collected.find ("rec-5") != nullptr,
           "and everything after it is measured by the next process");

    if (const auto* blamed = collected.find ("rec-3"))
    {
        check (blamed->problem.isNotEmpty(), "the preset that was on the plate is blamed");
        check (blamed->problem.containsIgnoreCase ("crashed"), "and told what happened to it");
        check (! blamed->profile.measured, "with no measurement pretended");
        check (blamed->fingerprint == "fp-3",
               "stamped against its bytes, so the next run does not walk into it again");
    }
    else
    {
        check (false, "the crashing preset is reported rather than silently dropped");
    }
}

void testHangIsKilledAndBlamed (const juce::File& worker)
{
    std::cout << "\n-- a plug-in that stops answering" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;

    const auto started = juce::Time::currentTimeMillis();
    const auto outcome = runner.run (jobWith ("stub-hangs", { "one", "two-hang", "three" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });
    const auto took = juce::Time::currentTimeMillis() - started;

    check (took < 30'000, "the watchdog kills it rather than waiting out the hang");
    check (collected.find ("rec-1") != nullptr, "what it managed before hanging survives");
    check (outcome.blamed == 1, "the preset it hung on is blamed");

    if (const auto* blamed = collected.find ("rec-2"))
        check (blamed->problem.containsIgnoreCase ("responding"),
               "and is told apart from one that crashed");
    else
        check (false, "the hanging preset is reported");

    check (collected.find ("rec-3") != nullptr, "and the rest are measured after the relaunch");
}

void testAPluginThatNeverLoadsLeavesItsPresetsAlone (const juce::File& worker)
{
    std::cout << "\n-- a plug-in that will not load at all" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-noload", { "one", "two", "three" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });

    check (outcome.moduleFailed, "the module is reported as failed");
    check (outcome.detail.isNotEmpty(), "with the worker's own reason, not a guess");
    check (outcome.blamed == 0, "no preset is blamed for it");
    check (collected.findings.empty(),
           "and NOTHING is stamped: a dongle that is not in today is not a preset that cannot "
           "be measured");
}

void testNoiseOnStdoutIsIgnored (const juce::File& worker)
{
    std::cout << "\n-- a plug-in that prints things" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-chatty", { "one", "two" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });

    check (outcome.measured == 2, "its noise does not derail the run");
    check (! outcome.moduleFailed, "nor is it mistaken for a failure");
}

void testARefusalIsCarriedBack (const juce::File& worker)
{
    std::cout << "\n-- a preset the plug-in will not take" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-refusing", { "one", "two-refuse", "three" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });

    check (outcome.measured == 2, "the two that applied are measured");
    check (outcome.relaunches == 0, "a refusal is not a crash and costs no relaunch");

    if (const auto* refused = collected.find ("rec-2"))
        check (refused->problem.isNotEmpty() && ! refused->profile.measured,
               "and the refusal comes back as a refusal, not as a silence");
    else
        check (false, "the refused preset is reported");
}

void testAMissingWorkerIsSaidPlainly()
{
    std::cout << "\n-- no worker to run it in" << std::endl;

    auto options = optionsFor (testRoot().getChildFile ("no-such-worker"));
    SonicAnalysisWorker runner (options);
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-clean", { "one" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); });

    check (outcome.moduleFailed, "it fails rather than hanging");
    check (outcome.detail.contains ("no-such-worker"), "and names what it could not find");
    check (collected.findings.empty(), "with nothing stamped on the way out");
}

void testCancellationStops (const juce::File& worker)
{
    std::cout << "\n-- somebody presses stop" << std::endl;

    SonicAnalysisWorker runner (optionsFor (worker));
    Collected collected;
    const auto outcome = runner.run (jobWith ("stub-clean", { "one", "two", "three" }),
                                     [&collected] (const AnalysisFinding& f)
                                     { collected.findings.push_back (f); },
                                     [] { return false; });

    check (collected.findings.empty() && outcome.measured == 0, "nothing is measured after a stop");
    check (! outcome.moduleFailed, "and stopping is not reported as a failure");
}

void testStaleJobsAreSweptUp (const juce::File& worker)
{
    std::cout << "\n-- what a killed run leaves behind" << std::endl;

    const auto jobs = testRoot().getChildFile ("jobs");
    jobs.createDirectory();

    // A job document from a run that never finished. One job can be a hundred presets of
    // base64, so these are not small, and nothing else would ever remove them.
    const auto old = jobs.getChildFile ("ce-audition-old.xml");
    old.replaceWithText ("<AUDITIONJOB/>");
    old.setLastModificationTime (juce::Time::getCurrentTime() - juce::RelativeTime::days (3.0));

    const auto recent = jobs.getChildFile ("ce-audition-recent.xml");
    recent.replaceWithText ("<AUDITIONJOB/>");

    SonicAnalysisWorker runner (optionsFor (worker));
    runner.run (jobWith ("stub-clean", { "one" }), {});

    check (! old.existsAsFile(), "a job document from a run that was killed is swept up");
    check (recent.existsAsFile(),
           "while one from today is left alone — it may belong to a run still going");
}

void testTheJobSurvivesTheRoundTrip()
{
    std::cout << "\n-- the job document" << std::endl;

    auto job = jobWith ("stub-clean", { "one", "two" });
    job.spec.holdSeconds = 1.5;
    job.spec.velocity = 111;
    job.snapshotDirectory = testRoot().getChildFile ("snaps");
    job.presets[0].stateBlobBase64 = "YWJjZGVm";

    AnalysisJob back;
    check (ceditor::host::analysisJobFromXml (ceditor::host::analysisJobToXml (job), back),
           "it parses back");
    check (back.presets.size() == 2 && back.presets[0].stateBlobBase64 == "YWJjZGVm",
           "with the captured state intact");
    check (back.targetCeId == job.targetCeId && back.descriptionXml == job.descriptionXml,
           "and the plug-in it names");

    // The probe is the reason every measurement is comparable, so a job that changed it in
    // transit would silently produce numbers that cannot be compared with the rest.
    check (std::abs (back.spec.holdSeconds - 1.5) < 1e-9 && back.spec.velocity == 111,
           "and the probe is exactly the probe that was asked for");
    check (back.snapshotDirectory == job.snapshotDirectory, "and the snapshots go where they were to go");

    check (! ceditor::host::analysisJobFromXml ("<SCANRESULT/>", back),
           "and something that is not a job is refused rather than half-read");
}

} // namespace

int main (int argc, char* argv[])
{
    if (argc < 2)
    {
        std::cerr << "usage: CEditorSonicAnalysisWorkerTests <path-to-stub-worker>" << std::endl;
        return 64;
    }

    const juce::File worker (juce::String::fromUTF8 (argv[1]));
    testRoot().deleteRecursively();
    testRoot().createDirectory();

    testCleanRun (worker);
    testCrashBlamesOnePresetAndCarriesOn (worker);
    testHangIsKilledAndBlamed (worker);
    testAPluginThatNeverLoadsLeavesItsPresetsAlone (worker);
    testNoiseOnStdoutIsIgnored (worker);
    testARefusalIsCarriedBack (worker);
    testAMissingWorkerIsSaidPlainly();
    testStaleJobsAreSweptUp (worker);
    testCancellationStops (worker);
    testTheJobSurvivesTheRoundTrip();

    testRoot().deleteRecursively();

    std::cout << std::endl << (failures == 0 ? "ALL PASSED" : "FAILURES: " + juce::String (failures))
              << std::endl;
    return failures == 0 ? 0 : 1;
}
