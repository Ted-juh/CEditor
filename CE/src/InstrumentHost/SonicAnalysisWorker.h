#pragma once

#include "SonicAnalysisJob.h"

// SonicAnalysisWorker — running an audition job in a child process (Stage B2).
//
// The counterpart to PluginScannerCoordinator, and deliberately its sibling rather than its
// copy: the scan hands over one module and waits for one document, because a scan is short and
// its answer is small. An audition is neither. A synth with five hundred presets is five
// hundred renders — minutes of work — and the answer arrives a preset at a time.
//
// So this streams, and streaming buys two things that a wait-then-read cannot:
//
//   THE 299 SURVIVE. A crash at preset 300 keeps everything measured before it. Under the
//   in-process auditioner the same crash lost the editor, so this is not a smaller loss of the
//   same kind — it is the difference between an hour of listening surviving and not.
//
//   THE DEAD PRESET IS NAMED. The worker prints which preset it is about to touch before it
//   touches it, so a process that dies without a matching result identifies the preset that
//   killed it. That preset is blamed, recorded as attempted-and-failed so it is not walked into
//   again on the next run, and the job RELAUNCHES for the rest. The scan can only ever blame a
//   whole module; this blames one sound out of five hundred and keeps going.
//
// A plug-in that will not load AT ALL is treated differently on purpose: it is reported and its
// presets are left untouched, not stamped as failed. A crash while playing a particular preset
// is usually that preset; a plug-in that will not start is usually the machine that day — an
// absent dongle, a licence server, a missing dependency — and stamping five hundred presets as
// unmeasurable because of a Tuesday would be the worse mistake.

namespace ceditor::host
{

class SonicAnalysisWorker
{
public:
    struct Options
    {
        juce::File workerExecutable;
        juce::File jobDirectory;        // where the job document is written; empty = system temp

        // Until the worker's first line, which covers loading the plug-in — the slow part, and
        // the one a heavy sampler can genuinely spend half a minute on.
        int startupTimeoutMs = 90'000;

        // Between lines afterwards. Each line is one preset: two renders of about two seconds,
        // plus whatever the plug-in spends applying the state. A minute of silence is a hang.
        int quietTimeoutMs = 60'000;

        // A crash costs one relaunch, which costs another plug-in load. A plug-in that dies on
        // every preset would otherwise reload itself once per preset for an hour.
        int maxRelaunches = 3;

        std::function<void (const juce::String&)> log;   // optional
    };

    explicit SonicAnalysisWorker (Options optionsToUse);

    struct Outcome
    {
        int measured = 0;       // findings with no problem
        int blamed = 0;         // presets a crash or hang was attributed to
        int relaunches = 0;
        bool moduleFailed = false;   // the plug-in never loaded; presets left untouched
        juce::String detail;
    };

    /** Runs `job` to completion, relaunching around crashes. `onFinding` is called on THIS
        thread as each result arrives — including the attempted-and-failed ones, which the
        caller records so the same preset is not tried again on every future run.

        `shouldContinue`, when given, is checked as output arrives; a false answer kills the
        child and returns what has been measured so far. Blocking: the caller owns threading,
        exactly as the scan coordinator does. */
    Outcome run (const AnalysisJob& job,
                 const std::function<void (const AnalysisFinding&)>& onFinding,
                 const std::function<bool()>& shouldContinue = {});

private:
    struct Pass
    {
        bool sawDone = false;
        bool sawAnyOutput = false;
        juce::String onThePlate;    // named by TRYING, cleared by its FINDING
        juce::String fatal;         // the worker said why it could not start
        bool timedOut = false;
        std::vector<juce::String> measuredIds;
    };

    Pass runOnePass (const AnalysisJob& job,
                     const std::function<void (const AnalysisFinding&)>& onFinding,
                     const std::function<bool()>& shouldContinue);

    Options options;
};

} // namespace ceditor::host
