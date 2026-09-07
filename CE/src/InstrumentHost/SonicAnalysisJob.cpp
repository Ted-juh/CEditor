#include "SonicAnalysisJob.h"

#include "SnapshotStore.h"

namespace ceditor::host
{

namespace
{

void writeProfile (juce::XmlElement& element, const SonicProfile& profile)
{
    element.setAttribute ("measured", profile.measured ? 1 : 0);
    element.setAttribute ("silent", profile.silent ? 1 : 0);
    element.setAttribute ("brightness", profile.brightness);
    element.setAttribute ("centroidHz", profile.centroidHz);
    element.setAttribute ("attack", profile.attack);
    element.setAttribute ("attackSeconds", profile.attackSeconds);
    element.setAttribute ("tail", profile.tail);
    element.setAttribute ("tailSeconds", profile.tailSeconds);
    element.setAttribute ("width", profile.width);
    element.setAttribute ("noisiness", profile.noisiness);
    element.setAttribute ("dynamics", profile.dynamics);
    element.setAttribute ("peak", profile.peak);
    element.setAttribute ("cost", profile.cost);
    element.setAttribute ("costPercent", profile.costPercent);
    element.setAttribute ("latencySamples", profile.latencySamples);

    // The envelope is the tile's drawn waveform: 48 peaks, three decimals each, which is all
    // a 190-pixel tile can show and keeps a finding on one readable line.
    juce::StringArray points;
    for (const auto value : profile.envelope)
        points.add (juce::String (value, 3));
    element.setAttribute ("envelope", points.joinIntoString (","));
}

SonicProfile readProfile (const juce::XmlElement& element)
{
    SonicProfile profile;
    profile.measured = element.getIntAttribute ("measured", 0) != 0;
    profile.silent = element.getIntAttribute ("silent", 0) != 0;
    profile.brightness = (float) element.getDoubleAttribute ("brightness");
    profile.centroidHz = (float) element.getDoubleAttribute ("centroidHz");
    profile.attack = (float) element.getDoubleAttribute ("attack");
    profile.attackSeconds = (float) element.getDoubleAttribute ("attackSeconds");
    profile.tail = (float) element.getDoubleAttribute ("tail");
    profile.tailSeconds = (float) element.getDoubleAttribute ("tailSeconds");
    profile.width = (float) element.getDoubleAttribute ("width");
    profile.noisiness = (float) element.getDoubleAttribute ("noisiness");
    profile.dynamics = (float) element.getDoubleAttribute ("dynamics");
    profile.peak = (float) element.getDoubleAttribute ("peak");
    profile.cost = (float) element.getDoubleAttribute ("cost");
    profile.costPercent = (float) element.getDoubleAttribute ("costPercent");
    profile.latencySamples = element.getIntAttribute ("latencySamples", 0);

    juce::StringArray points;
    points.addTokens (element.getStringAttribute ("envelope"), ",", "");
    for (const auto& point : points)
        if (point.isNotEmpty())
            profile.envelope.add (point.getFloatValue());

    return profile;
}

/** One element, one line. `toString` with no line breaks and no header is what makes a line
    protocol possible at all — the default would wrap and the reader would see fragments. */
juce::String oneLine (const juce::XmlElement& element)
{
    return element.toString (juce::XmlElement::TextFormat().singleLine().withoutHeader());
}

} // namespace

juce::String analysisJobToXml (const AnalysisJob& job)
{
    juce::XmlElement root ("AUDITIONJOB");
    root.setAttribute ("ceId", job.targetCeId);
    root.setAttribute ("description", job.descriptionXml);
    root.setAttribute ("sampleRate", job.spec.sampleRate);
    root.setAttribute ("blockSize", job.spec.blockSize);
    root.setAttribute ("note", job.spec.note);
    root.setAttribute ("velocity", job.spec.velocity);
    root.setAttribute ("quietVelocity", job.spec.quietVelocity);
    root.setAttribute ("holdSeconds", job.spec.holdSeconds);
    root.setAttribute ("tailSeconds", job.spec.tailSeconds);
    root.setAttribute ("snapshotDir", job.snapshotDirectory.getFullPathName());

    for (const auto& preset : job.presets)
    {
        auto* element = root.createNewChildElement ("PRESET");
        element->setAttribute ("recordId", preset.recordId);
        element->setAttribute ("fingerprint", preset.fingerprint);
        element->setAttribute ("name", preset.name);
        element->setAttribute ("sourceType", preset.sourceType);
        element->setAttribute ("sourceLocator", preset.sourceLocator);
        element->setAttribute ("state", preset.stateBlobBase64);
    }

    return root.toString();
}

bool analysisJobFromXml (const juce::String& xml, AnalysisJob& job)
{
    const auto parsed = juce::XmlDocument::parse (xml);
    if (parsed == nullptr || ! parsed->hasTagName ("AUDITIONJOB"))
        return false;

    job = {};
    job.targetCeId = parsed->getStringAttribute ("ceId");
    job.descriptionXml = parsed->getStringAttribute ("description");
    job.spec.sampleRate = parsed->getDoubleAttribute ("sampleRate", 44100.0);
    job.spec.blockSize = parsed->getIntAttribute ("blockSize", 512);
    job.spec.note = parsed->getIntAttribute ("note", 60);
    job.spec.velocity = parsed->getIntAttribute ("velocity", 100);
    job.spec.quietVelocity = parsed->getIntAttribute ("quietVelocity", 40);
    job.spec.holdSeconds = parsed->getDoubleAttribute ("holdSeconds", 1.2);
    job.spec.tailSeconds = parsed->getDoubleAttribute ("tailSeconds", 0.8);

    if (const auto dir = parsed->getStringAttribute ("snapshotDir"); dir.isNotEmpty())
        job.snapshotDirectory = juce::File (dir);

    for (auto* element : parsed->getChildWithTagNameIterator ("PRESET"))
    {
        AnalysisPreset preset;
        preset.recordId = element->getStringAttribute ("recordId");
        preset.fingerprint = element->getStringAttribute ("fingerprint");
        preset.name = element->getStringAttribute ("name");
        preset.sourceType = element->getStringAttribute ("sourceType");
        preset.sourceLocator = element->getStringAttribute ("sourceLocator");
        preset.stateBlobBase64 = element->getStringAttribute ("state");
        job.presets.push_back (std::move (preset));
    }

    return true;
}

juce::String analysisTryingLine (const juce::String& recordId)
{
    juce::XmlElement element ("TRYING");
    element.setAttribute ("recordId", recordId);
    return oneLine (element);
}

juce::String analysisFindingLine (const AnalysisFinding& finding)
{
    juce::XmlElement element ("FINDING");
    element.setAttribute ("recordId", finding.recordId);
    element.setAttribute ("fingerprint", finding.fingerprint);
    if (finding.problem.isNotEmpty())
        element.setAttribute ("problem", finding.problem);
    writeProfile (element, finding.profile);
    return oneLine (element);
}

AnalysisEvent analysisEventFromLine (const juce::String& line)
{
    AnalysisEvent event;

    const auto trimmed = line.trim();
    if (! trimmed.startsWith ("<"))
        return event;

    const auto parsed = juce::XmlDocument::parse (trimmed);
    if (parsed == nullptr)
        return event;

    if (parsed->hasTagName ("TRYING"))
    {
        event.kind = AnalysisEvent::Kind::trying;
        event.recordId = parsed->getStringAttribute ("recordId");
    }
    else if (parsed->hasTagName ("FINDING"))
    {
        event.kind = AnalysisEvent::Kind::finding;
        event.finding.recordId = parsed->getStringAttribute ("recordId");
        event.finding.fingerprint = parsed->getStringAttribute ("fingerprint");
        event.finding.problem = parsed->getStringAttribute ("problem");
        event.finding.profile = readProfile (*parsed);
    }
    else if (parsed->hasTagName ("FATAL"))
    {
        event.kind = AnalysisEvent::Kind::fatal;
        event.detail = parsed->getStringAttribute ("detail");
    }
    else if (parsed->hasTagName ("DONE"))
    {
        event.kind = AnalysisEvent::Kind::done;
    }

    return event;
}

juce::String applyPresetStatePlain (juce::AudioProcessor& instrument, const AnalysisPreset& preset)
{
    if (preset.sourceType == "vstpreset")
        return "Vendor preset loading is not available here.";

    if (preset.sourceType == "programList")
    {
        const auto index = preset.sourceLocator.fromLastOccurrenceOf ("/", false, false).getIntValue();
        if (index < 0 || index >= instrument.getNumPrograms())
            return "The plug-in no longer has this program: " + preset.name;
        instrument.setCurrentProgram (index);
        return {};
    }

    juce::MemoryOutputStream decoded;
    if (! juce::Base64::convertFromBase64 (decoded, preset.stateBlobBase64))
        return "The captured state for " + preset.name + " is damaged.";

    instrument.setStateInformation (decoded.getData(), (int) decoded.getDataSize());
    return {};
}

void measurePresets (const AnalysisJob& job,
                     juce::AudioProcessor& instrument,
                     const std::function<juce::String (juce::AudioProcessor&, const AnalysisPreset&)>& applyState,
                     const std::function<void (const AnalysisEvent&)>& onEvent,
                     const std::function<bool()>& shouldContinue)
{
    std::unique_ptr<SnapshotStore> snapshots;
    if (job.snapshotDirectory != juce::File())
        snapshots = std::make_unique<SnapshotStore> (job.snapshotDirectory);

    for (const auto& preset : job.presets)
    {
        if (shouldContinue != nullptr && ! shouldContinue())
            return;

        // Named before it is touched, so a process that dies here is a preset somebody can
        // point at rather than a plug-in that has to be written off whole.
        AnalysisEvent trying;
        trying.kind = AnalysisEvent::Kind::trying;
        trying.recordId = preset.recordId;
        onEvent (trying);

        AnalysisEvent result;
        result.kind = AnalysisEvent::Kind::finding;
        result.finding.recordId = preset.recordId;
        result.finding.fingerprint = preset.fingerprint;

        if (const auto refusal = applyState (instrument, preset); refusal.isNotEmpty())
        {
            result.finding.problem = refusal;
            onEvent (result);
            continue;
        }

        // The two passes by hand rather than through probeProcessor(), because the loud render
        // is not only measured — it is KEPT, and that is what makes the next click on this
        // preset instant instead of a four-second wait for a plug-in.
        const auto loud = renderProbe (instrument, job.spec, job.spec.velocity);
        const auto quiet = renderProbe (instrument, job.spec, job.spec.quietVelocity);
        result.finding.profile = analyseProbe (loud, quiet, job.spec);

        if (snapshots != nullptr && ! result.finding.profile.silent)
            snapshots->put (snapshotKeyFor (preset.fingerprint, preset.recordId),
                            loud.audio, job.spec.sampleRate);

        onEvent (result);
    }
}

} // namespace ceditor::host
