#include "SonicAnalysisWorker.h"

#include <atomic>
#include <set>
#include <thread>

namespace ceditor::host
{

SonicAnalysisWorker::SonicAnalysisWorker (Options optionsToUse)
    : options (std::move (optionsToUse))
{
}

SonicAnalysisWorker::Pass
SonicAnalysisWorker::runOnePass (const AnalysisJob& job,
                                 const std::function<void (const AnalysisFinding&)>& onFinding,
                                 const std::function<bool()>& shouldContinue)
{
    Pass pass;

    auto directory = options.jobDirectory != juce::File()
                       ? options.jobDirectory
                       : juce::File::getSpecialLocation (juce::File::tempDirectory);
    directory.createDirectory();

    // The job goes in a file rather than on the command line: a captured state is eighteen
    // kilobytes of base64 and there can be hundreds of them in one job, which is orders past
    // what any platform will accept as an argument.
    const auto jobFile = directory.getNonexistentChildFile ("ce-audition", ".xml");
    if (! jobFile.replaceWithText (analysisJobToXml (job)))
    {
        pass.fatal = "could not write the audition job to " + jobFile.getFullPathName();
        return pass;
    }

    const juce::ScopeGuard removeJobFile { [&jobFile] { jobFile.deleteFile(); } };

    juce::StringArray args;
    args.add (options.workerExecutable.getFullPathName());
    args.add ("--audition");
    args.add (jobFile.getFullPathName());

    juce::ChildProcess child;
    if (! child.start (args, juce::ChildProcess::wantStdOut))
    {
        pass.fatal = "could not start " + options.workerExecutable.getFullPathName();
        return pass;
    }

    // The watchdog exists because there is no read-with-timeout: a hung plug-in would otherwise
    // block this thread on a pipe that will never produce another byte. Killing the child is
    // what makes the read return, so the timeout is enforced from beside the loop rather than
    // inside it.
    std::atomic<juce::int64> lastOutput { juce::Time::currentTimeMillis() };
    std::atomic<bool> readingFinished { false };
    std::atomic<bool> killedByWatchdog { false };
    std::atomic<bool> seenOutput { false };

    std::thread watchdog ([&]
    {
        while (! readingFinished.load())
        {
            std::this_thread::sleep_for (std::chrono::milliseconds (100));
            if (readingFinished.load())
                return;

            const auto limit = seenOutput.load() ? options.quietTimeoutMs : options.startupTimeoutMs;
            const auto quietFor = juce::Time::currentTimeMillis() - lastOutput.load();

            const auto cancelled = shouldContinue != nullptr && ! shouldContinue();
            if (cancelled || quietFor > limit)
            {
                killedByWatchdog = ! cancelled;
                child.kill();
                return;
            }
        }
    });

    juce::String pending;
    char buffer[8192];

    for (;;)
    {
        const auto read = child.readProcessOutput (buffer, (int) sizeof (buffer));
        if (read <= 0)
            break;

        lastOutput = juce::Time::currentTimeMillis();
        seenOutput = true;
        pending += juce::String::fromUTF8 (buffer, read);

        for (;;)
        {
            const auto newline = pending.indexOfChar ('\n');
            if (newline < 0)
                break;

            const auto line = pending.substring (0, newline);
            pending = pending.substring (newline + 1);

            // A plug-in that prints to stdout on load is common enough that it must not be able
            // to derail the run: anything that is not one of our lines is simply not one of our
            // lines.
            const auto event = analysisEventFromLine (line);

            switch (event.kind)
            {
                case AnalysisEvent::Kind::trying:
                    pass.onThePlate = event.recordId;
                    break;

                case AnalysisEvent::Kind::finding:
                    pass.onThePlate.clear();
                    pass.measuredIds.push_back (event.finding.recordId);
                    if (onFinding != nullptr)
                        onFinding (event.finding);
                    break;

                case AnalysisEvent::Kind::fatal:
                    pass.fatal = event.detail;
                    break;

                case AnalysisEvent::Kind::done:
                    pass.sawDone = true;
                    break;

                case AnalysisEvent::Kind::unknown:
                default:
                    break;
            }
        }
    }

    readingFinished = true;
    watchdog.join();

    child.waitForProcessToFinish (2000);
    pass.sawAnyOutput = seenOutput.load();
    pass.timedOut = killedByWatchdog.load();
    return pass;
}

SonicAnalysisWorker::Outcome
SonicAnalysisWorker::run (const AnalysisJob& job,
                          const std::function<void (const AnalysisFinding&)>& onFinding,
                          const std::function<bool()>& shouldContinue)
{
    Outcome outcome;

    if (! options.workerExecutable.existsAsFile())
    {
        outcome.moduleFailed = true;
        outcome.detail = "audition worker not found: " + options.workerExecutable.getFullPathName();
        return outcome;
    }

    auto remaining = job;

    for (;;)
    {
        if (remaining.presets.empty())
            return outcome;
        if (shouldContinue != nullptr && ! shouldContinue())
            return outcome;

        const auto pass = runOnePass (remaining, [&] (const AnalysisFinding& finding)
        {
            if (finding.problem.isEmpty())
                ++outcome.measured;
            if (onFinding != nullptr)
                onFinding (finding);
        }, shouldContinue);

        // Everything it reported, whether measured or refused, is done with.
        const std::set<juce::String> handled (pass.measuredIds.begin(), pass.measuredIds.end());
        std::vector<AnalysisPreset> left;
        for (auto& preset : remaining.presets)
            if (handled.find (preset.recordId) == handled.end())
                left.push_back (std::move (preset));
        remaining.presets = std::move (left);

        if (pass.sawDone || remaining.presets.empty())
            return outcome;

        if (shouldContinue != nullptr && ! shouldContinue())
            return outcome;

        // It never got as far as playing anything: the plug-in did not load. Report it and
        // leave the presets alone — a load failure is usually the machine that day, and
        // stamping five hundred presets unmeasurable because of it would be the worse mistake.
        if (! pass.sawAnyOutput || (pass.fatal.isNotEmpty() && pass.onThePlate.isEmpty()))
        {
            outcome.moduleFailed = true;
            outcome.detail = pass.fatal.isNotEmpty()
                               ? pass.fatal
                               : (pass.timedOut ? juce::String ("the plug-in did not answer in time")
                                                : juce::String ("the plug-in would not load"));
            if (options.log != nullptr)
                options.log ("audition: " + remaining.targetCeId + " — " + outcome.detail);
            return outcome;
        }

        // It died with a preset on the plate. That preset is named, blamed and recorded so the
        // next run does not walk into it again; the rest get a fresh process.
        if (pass.onThePlate.isNotEmpty())
        {
            const auto blamedId = pass.onThePlate;
            const auto reason = pass.timedOut
                                  ? juce::String ("The plug-in stopped responding while playing this sound.")
                                  : juce::String ("The plug-in crashed while playing this sound.");

            for (auto it = remaining.presets.begin(); it != remaining.presets.end(); ++it)
                if (it->recordId == blamedId)
                {
                    AnalysisFinding blamed;
                    blamed.recordId = it->recordId;
                    blamed.fingerprint = it->fingerprint;
                    blamed.problem = reason;
                    if (onFinding != nullptr)
                        onFinding (blamed);

                    ++outcome.blamed;
                    remaining.presets.erase (it);
                    break;
                }

            if (options.log != nullptr)
                options.log ("audition: " + remaining.targetCeId + " — " + reason
                               + " (" + blamedId + ")");
        }

        if (remaining.presets.empty())
            return outcome;

        if (outcome.relaunches >= options.maxRelaunches)
        {
            outcome.detail = "gave up after " + juce::String (outcome.relaunches)
                               + " crashes; " + juce::String ((int) remaining.presets.size())
                               + " sounds were not measured";
            if (options.log != nullptr)
                options.log ("audition: " + remaining.targetCeId + " — " + outcome.detail);
            return outcome;
        }

        ++outcome.relaunches;
    }
}

} // namespace ceditor::host
