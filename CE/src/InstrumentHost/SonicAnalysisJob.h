#pragma once

#include "Library.h"
#include "SonicProbe.h"

#include <functional>
#include <vector>

// SonicAnalysisJob — what the auditioner sends to whatever is doing the listening, and what
// comes back.
//
// Stage B measured the library in the editor's own process, and said plainly that this was the
// gap: §17's whole argument is that a plug-in which takes a process down must not take the
// editor with it, which is why the SCAN is out of process. Auditioning loads the same
// third-party code and then plays it, which is strictly more of it running, so the same rule
// has to apply.
//
// The unit of work is ONE PLUG-IN AND EVERY PRESET IT HOLDS, because instantiating is the
// expensive part and playing is not — the same grouping the in-process loop already used. That
// makes a job big (a synth with 500 presets is 500 renders, minutes of work) which is the one
// place this differs from the scan protocol: a scan job is a single document at the end, and an
// audition job REPORTS AS IT GOES, one line per preset. Two things follow from that and both
// matter more than the tidiness of a single document:
//
//   - a crash at preset 300 keeps the 299 already measured, and
//   - the coordinator knows exactly which preset was on the plate when the process died, so it
//     can blame that one, skip it, and relaunch for the rest.
//
// The audio does not come back down the pipe. The worker writes snapshots into the same store
// the editor reads from, because a snapshot IS a file cache and both processes can see it —
// putting 35 kB of FLAC per preset through stdout would be a second encoding of something
// already encoded for exactly this purpose.

namespace ceditor::host
{

/** One sound to play, with everything needed to put the plug-in into that state. */
struct AnalysisPreset
{
    juce::String recordId;
    juce::String fingerprint;      // the bytes this measurement will be filed against
    juce::String name;
    juce::String sourceType;       // "vstpreset" | "programList" | captured state
    juce::String sourceLocator;
    juce::String stateBlobBase64;
};

/** One plug-in and its presets. */
struct AnalysisJob
{
    juce::String descriptionXml;   // the catalogue's stored PluginDescription
    juce::String targetCeId;       // for messages; the description is what actually loads
    std::vector<AnalysisPreset> presets;
    ProbeSpec spec;
    juce::File snapshotDirectory;  // where to keep the loud render; empty = keep none
};

/** What one preset yielded. `problem` empty means `profile` is a measurement; `problem` set
    means this preset was attempted and did not produce one, which is a DIFFERENT fact from
    never having been tried and is why it is carried back rather than dropped. */
struct AnalysisFinding
{
    juce::String recordId;
    juce::String fingerprint;
    SonicProfile profile;
    juce::String problem;
};

/** The job as the worker reads it. One XML document, written to a file rather than passed on
    the command line: a captured state is eighteen kilobytes and there are hundreds of them. */
juce::String analysisJobToXml (const AnalysisJob& job);
bool analysisJobFromXml (const juce::String& xml, AnalysisJob& job);

/** One event, one line, flushed as it happens — see the note above about why this streams.
    `<TRYING>` is the dead-man marker: it names the preset that is on the plate, so a process
    that dies without a matching result is a preset that can be blamed and skipped rather than
    a whole plug-in that has to be abandoned. */
juce::String analysisTryingLine (const juce::String& recordId);
juce::String analysisFindingLine (const AnalysisFinding& finding);

struct AnalysisEvent
{
    enum class Kind { unknown, trying, finding, fatal, done };

    Kind kind = Kind::unknown;
    juce::String recordId;    // trying
    AnalysisFinding finding;  // finding
    juce::String detail;      // fatal
};

/** Parses one line. An unparseable line is `unknown` and the caller ignores it: a plug-in that
    prints to stdout on load is common enough that it must not be able to derail the run. */
AnalysisEvent analysisEventFromLine (const juce::String& line);

/** Every preset in `job` measured, in order, against an instance that is already loaded and
    ready to be driven. Shared by the worker and by the in-process fallback so there is one
    definition of what measuring means — `applyState` is the caller's, because applying a
    vendor .vstpreset needs the VST3 format and applying a captured blob does not.

    `onEvent` is called for the trying marker and for every finding as it happens; the caller
    decides whether that goes down a pipe or straight into the library. `shouldContinue`, when
    given, is checked between presets so a cancelled analysis stops without waiting out the
    rest of a large plug-in. */
void measurePresets (const AnalysisJob& job,
                     juce::AudioProcessor& instrument,
                     const std::function<juce::String (juce::AudioProcessor&, const AnalysisPreset&)>& applyState,
                     const std::function<void (const AnalysisEvent&)>& onEvent,
                     const std::function<bool()>& shouldContinue = {});

/** Applying a preset without the VST3 format: captured state and program selection, the two
    that need nothing but the AudioProcessor. A vendor .vstpreset returns a refusal here, so a
    caller that can load one passes its own. */
juce::String applyPresetStatePlain (juce::AudioProcessor& instrument, const AnalysisPreset& preset);

} // namespace ceditor::host
