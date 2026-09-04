// RackModelTests — Hostage's persistent Performance → InstrumentRack → Part document.
//
// What must hold, because every later stage leans on it: partId is identity and reordering
// never touches it; a full JSON round trip loses nothing (this document later travels inside
// Host Projects, session files and the outer VST3's DAW state); and loading is forgiving on
// numbers but strict on structure — clamped ranges load, duplicate identities refuse.
//
// juce_core only; runs anywhere.

#include "InstrumentHost/RackModel.h"
#include <cmath>
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::Performance;
using ceditor::host::RackPart;
using ceditor::host::ModulationRoute;
using ceditor::host::MidiLfo;
using ceditor::host::MidiLfoOutput;
using ceditor::host::EnvelopeGenerator;
using ceditor::host::MsegGenerator;
using ceditor::host::MsegPoint;
using ceditor::host::RandomModulator;
using ceditor::host::LayerGroup;
using ceditor::host::PerformanceTake;

void testStructure()
{
    std::cout << "\nstructure and identity" << std::endl;

    auto perf = Performance::create();
    check (perf.performanceId.isNotEmpty(), "create mints a performance id");

    const auto a = perf.addPart();
    const auto b = perf.addPart();
    const auto c = perf.addPart();
    check (a != b && b != c, "every part gets its own id");
    check (perf.focusedPartId == a, "the first part added becomes focused");

    check (perf.movePart (c, 0), "movePart accepts a valid part");
    check (perf.parts.getReference (0).partId == c && perf.parts.getReference (1).partId == a,
           "reorder changes the array order");
    check (perf.focusedPartId == a, "and never the identities or the focus");

    check (perf.removePart (a), "removePart accepts a valid part");
    check (perf.findPart (a) == nullptr && perf.parts.size() == 2, "and the part is gone");
    check (perf.focusedPartId == c, "removing the focused part refocuses the first remaining");

    check (! perf.removePart ("no-such-part"), "an unknown part is refused");
    check (! perf.movePart ("no-such-part", 0), "for moving too");
}

void testRoundTrip()
{
    std::cout << "\nJSON round trip" << std::endl;

    auto perf = Performance::create();
    perf.name = "Stage Rig";
    const auto a = perf.addPart();
    const auto b = perf.addPart();

    auto* partA = perf.findPart (a);
    partA->pluginCeId = "VST3-sample-synth";
    partA->pluginModulePath = "C:\\VST3\\Sample.vst3";
    partA->pluginName = "Sample Synth";
    partA->pluginVendor = "Sample Audio";
    partA->stateBlobBase64 = "AAECAw==";
    partA->midi.channel = 2;
    partA->midi.keyLow = 36;
    partA->midi.keyHigh = 59;
    partA->midi.velocityLow = 10;
    partA->midi.velocityHigh = 100;
    partA->midi.transpose = -12;
    partA->mute = true;
    partA->solo = true;
    partA->volume = 0.5f;
    partA->pan = -0.25f;
    partA->editorOpen = true;
    partA->microtuningEnabled = true;
    perf.findPart (b)->enabled = false;
    perf.focusedPartId = b;

    perf.microtuning.enabled = true;
    perf.microtuning.name = "Five-limit triad";
    perf.microtuning.sourceName = "triad.scl";
    perf.microtuning.rootMidiNote = 48;
    perf.microtuning.referenceMidiNote = 69;
    perf.microtuning.referenceFrequency = 442.0;
    perf.microtuning.mtsDeviceId = 12;
    perf.microtuning.mtsProgram = 3;
    perf.microtuning.degreesCents = { 0.0, 386.3137139, 701.9550009, 1200.0 };

    ModulationRoute route;
    route.routeId = "route-1";
    route.sourceType = "midiCc";
    route.sourceChannel = 2;
    route.sourceNumber = 74;
    route.targetId = a;
    route.targetCeId = partA->pluginCeId;
    route.parameterId = "cutoff";
    route.amount = -0.4f;
    route.baseValue = 0.65f;
    route.enabled = false;
    perf.modulationRoutes.add (route);

    MidiLfo lfo;
    lfo.lfoId = "lfo-1";
    lfo.name = "Slow Motion";
    lfo.shape = "triangle";
    lfo.sync = false;
    lfo.rateHz = 0.37;
    lfo.syncBeats = 8.0;
    lfo.phaseOffset = 0.25f;
    lfo.minimum = 0.1f;
    lfo.maximum = 0.8f;
    MidiLfoOutput output;
    output.outputId = "lfo-out-1";
    output.type = "nrpn";
    output.targetPartId = b;
    output.channel = 3;
    output.number = 1400;
    output.enabled = true;
    lfo.outputs.add (output);
    perf.midiLfos.add (lfo);

    EnvelopeGenerator envelope;
    envelope.envelopeId = "envelope-1";
    envelope.name = "Filter Pluck";
    envelope.channel = 3;
    envelope.noteLow = 36;
    envelope.noteHigh = 96;
    envelope.retrigger = false;
    envelope.attackMs = 7.5;
    envelope.decayMs = 240.0;
    envelope.sustain = 0.42f;
    envelope.releaseMs = 810.0;
    envelope.curve = -0.35f;
    envelope.velocityAmount = 0.8f;
    perf.envelopes.add (envelope);

    MsegGenerator mseg;
    mseg.msegId = "mseg-1";
    mseg.name = "Moving Shape";
    mseg.sync = false;
    mseg.rateHz = 0.75;
    mseg.syncBeats = 8.0;
    mseg.phaseOffset = 0.2f;
    MsegPoint start;
    start.pointId = "point-a";
    start.position = 0.0f;
    start.value = 0.1f;
    MsegPoint middle;
    middle.pointId = "point-b";
    middle.position = 0.4f;
    middle.value = 0.9f;
    middle.curve = -0.5f;
    MsegPoint end;
    end.pointId = "point-c";
    end.position = 1.0f;
    end.value = 0.3f;
    end.curve = 0.6f;
    mseg.points.add (start);
    mseg.points.add (middle);
    mseg.points.add (end);
    perf.msegs.add (mseg);

    RandomModulator random;
    random.randomId = "random-1";
    random.name = "Slow Drift";
    random.mode = "randomWalk";
    random.sync = false;
    random.rateHz = 0.6;
    random.syncBeats = 2.0;
    random.seed = 424242;
    random.probability = 0.72f;
    random.smoothing = 0.4f;
    random.stepSize = 0.18f;
    random.chaos = 0.91f;
    random.minimum = 0.15f;
    random.maximum = 0.82f;
    perf.randomModulators.add (random);

    LayerGroup layer;
    layer.layerGroupId = "layer-1";
    layer.name = "Velocity orchestra";
    layer.allocation = "leastBusy";
    layer.source = "velocity";
    layer.controller = 74;
    layer.members.add ({ a, 0.0f, 0.55f, 0.08f });
    layer.members.add ({ b, 0.45f, 1.0f, 0.08f });
    perf.layerGroups.add (layer);
    perf.automaticFailover.enabled = false;
    perf.automaticFailover.maxAttempts = 5;
    perf.automaticFailover.retryDelayMs = 1250;

    // Through actual JSON text, because that is the trip the document really makes.
    const auto json = juce::JSON::toString (perf.toVar());
    Performance restored;
    check (Performance::fromVar (juce::JSON::parse (json), restored), "the JSON parses back");

    check (restored.performanceId == perf.performanceId && restored.name == "Stage Rig",
           "performance identity and name survive");
    check (restored.focusedPartId == b, "focus survives");
    check (restored.parts.size() == 2, "every part survives");

    const auto* ra = restored.findPart (a);
    check (ra != nullptr, "part identity survives");
    check (ra != nullptr
             && ra->pluginCeId == "VST3-sample-synth"
             && ra->pluginModulePath == "C:\\VST3\\Sample.vst3"
             && ra->stateBlobBase64 == "AAECAw==",
           "plugin identity and state blob survive");
    check (ra != nullptr
             && ra->midi.channel == 2 && ra->midi.keyLow == 36 && ra->midi.keyHigh == 59
             && ra->midi.velocityLow == 10 && ra->midi.velocityHigh == 100
             && ra->midi.transpose == -12,
           "MIDI rules survive");
    check (ra != nullptr && ra->mute && ra->solo && ra->editorOpen
             && juce::approximatelyEqual (ra->volume, 0.5f)
             && juce::approximatelyEqual (ra->pan, -0.25f),
           "mixer and editor state survive");
    check (ra != nullptr && ra->microtuningEnabled
             && restored.microtuning.enabled
             && restored.microtuning.name == "Five-limit triad"
             && restored.microtuning.sourceName == "triad.scl"
             && restored.microtuning.rootMidiNote == 48
             && restored.microtuning.referenceMidiNote == 69
             && std::abs (restored.microtuning.referenceFrequency - 442.0) < 0.001
             && restored.microtuning.mtsDeviceId == 12
             && restored.microtuning.mtsProgram == 3
             && restored.microtuning.degreesCents.size() == 4
             && std::abs (restored.microtuning.degreesCents[1] - 386.3137139) < 0.001,
           "the shared tuning and per-part opt-in survive");
    check (restored.findPart (b) != nullptr && ! restored.findPart (b)->enabled,
           "enabled survives");
    check (restored.modulationRoutes.size() == 1
             && restored.modulationRoutes[0].routeId == "route-1"
             && restored.modulationRoutes[0].sourceType == "midiCc"
             && restored.modulationRoutes[0].sourceChannel == 2
             && restored.modulationRoutes[0].sourceNumber == 74
             && restored.modulationRoutes[0].targetId == a
             && restored.modulationRoutes[0].targetCeId == "VST3-sample-synth"
             && restored.modulationRoutes[0].parameterId == "cutoff"
             && juce::approximatelyEqual (restored.modulationRoutes[0].amount, -0.4f)
             && juce::approximatelyEqual (restored.modulationRoutes[0].baseValue, 0.65f)
             && ! restored.modulationRoutes[0].enabled,
           "modulation routes retain source, destination, depth and unmodulated base");
    check (restored.midiLfos.size() == 1
             && restored.midiLfos[0].lfoId == "lfo-1"
             && restored.midiLfos[0].name == "Slow Motion"
             && restored.midiLfos[0].shape == "triangle"
             && ! restored.midiLfos[0].sync
             && juce::approximatelyEqual ((float) restored.midiLfos[0].rateHz, 0.37f)
             && juce::approximatelyEqual (restored.midiLfos[0].phaseOffset, 0.25f)
             && restored.midiLfos[0].outputs.size() == 1
             && restored.midiLfos[0].outputs[0].type == "nrpn"
             && restored.midiLfos[0].outputs[0].targetPartId == b
             && restored.midiLfos[0].outputs[0].channel == 3
             && restored.midiLfos[0].outputs[0].number == 1400
             && restored.midiLfos[0].outputs[0].enabled,
           "MIDI LFO timing, shape, range and hardware destinations survive");
    check (restored.envelopes.size() == 1
             && restored.envelopes[0].envelopeId == "envelope-1"
             && restored.envelopes[0].name == "Filter Pluck"
             && restored.envelopes[0].channel == 3
             && restored.envelopes[0].noteLow == 36
             && restored.envelopes[0].noteHigh == 96
             && ! restored.envelopes[0].retrigger
             && juce::approximatelyEqual ((float) restored.envelopes[0].attackMs, 7.5f)
             && juce::approximatelyEqual ((float) restored.envelopes[0].decayMs, 240.0f)
             && juce::approximatelyEqual (restored.envelopes[0].sustain, 0.42f)
             && juce::approximatelyEqual ((float) restored.envelopes[0].releaseMs, 810.0f)
             && juce::approximatelyEqual (restored.envelopes[0].curve, -0.35f)
             && juce::approximatelyEqual (restored.envelopes[0].velocityAmount, 0.8f),
           "external envelope timing, note filter and response survive");
    check (restored.msegs.size() == 1
             && restored.msegs[0].msegId == "mseg-1"
             && restored.msegs[0].name == "Moving Shape"
             && ! restored.msegs[0].sync
             && juce::approximatelyEqual ((float) restored.msegs[0].rateHz, 0.75f)
             && juce::approximatelyEqual ((float) restored.msegs[0].syncBeats, 8.0f)
             && juce::approximatelyEqual (restored.msegs[0].phaseOffset, 0.2f)
             && restored.msegs[0].points.size() == 3
             && restored.msegs[0].points[1].pointId == "point-b"
             && juce::approximatelyEqual (restored.msegs[0].points[1].position, 0.4f)
             && juce::approximatelyEqual (restored.msegs[0].points[1].value, 0.9f)
             && juce::approximatelyEqual (restored.msegs[0].points[1].curve, -0.5f),
           "MSEG timing, stable point identities and segment curves survive");
    check (restored.randomModulators.size() == 1
             && restored.randomModulators[0].randomId == "random-1"
             && restored.randomModulators[0].name == "Slow Drift"
             && restored.randomModulators[0].mode == "randomWalk"
             && ! restored.randomModulators[0].sync
             && juce::approximatelyEqual ((float) restored.randomModulators[0].rateHz, 0.6f)
             && juce::approximatelyEqual ((float) restored.randomModulators[0].syncBeats, 2.0f)
             && restored.randomModulators[0].seed == 424242
             && juce::approximatelyEqual (restored.randomModulators[0].probability, 0.72f)
             && juce::approximatelyEqual (restored.randomModulators[0].stepSize, 0.18f)
             && juce::approximatelyEqual (restored.randomModulators[0].minimum, 0.15f)
             && juce::approximatelyEqual (restored.randomModulators[0].maximum, 0.82f),
           "seeded random mode, timing, probability and bounds survive");
    check (restored.layerGroups.size() == 1
             && restored.layerGroups[0].layerGroupId == "layer-1"
             && restored.layerGroups[0].name == "Velocity orchestra"
             && restored.layerGroups[0].allocation == "leastBusy"
             && restored.layerGroups[0].members.size() == 2
             && restored.layerGroups[0].members[0].partId == a
             && juce::approximatelyEqual (restored.layerGroups[0].members[0].maximum, 0.55f)
             && juce::approximatelyEqual (restored.layerGroups[0].members[1].crossfade, 0.08f),
           "layer allocation, source ranges and crossfades survive");
    check (! restored.automaticFailover.enabled
             && restored.automaticFailover.maxAttempts == 5
             && restored.automaticFailover.retryDelayMs == 1250,
           "automatic failover policy survives with the performance");
}

void testValidation()
{
    std::cout << "\nvalidation on load" << std::endl;

    Performance out;
    check (! Performance::fromVar (juce::var(), out), "a non-object refuses");
    check (! Performance::fromVar (juce::JSON::parse (R"({"name":"x"})"), out),
           "a missing performanceId refuses");
    check (! Performance::fromVar (juce::JSON::parse (R"({"performanceId":"p"})"), out),
           "missing parts refuse");

    check (! Performance::fromVar (juce::JSON::parse (
               R"({"performanceId":"p","parts":[{"partId":"x"},{"partId":"x"}]})"), out),
           "duplicate part ids refuse — that is structural damage");
    check (! Performance::fromVar (juce::JSON::parse (
               R"({"performanceId":"p","parts":[{"partId":""}]})"), out),
           "an empty part id refuses");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "focusedPartId":"gone",
               "parts":[{"partId":"x","channel":99,"keyLow":90,"keyHigh":10,
                          "velocityLow":300,"velocityHigh":-5,"transpose":900,
                          "volume":50,"pan":-9}]})"), out),
           "out-of-range numbers load rather than refuse");

    const auto* p = out.findPart ("x");
    check (p != nullptr && p->midi.channel == 16, "channel clamps");
    check (p != nullptr && p->midi.keyLow == 10 && p->midi.keyHigh == 90,
           "an inverted key range is swapped");
    check (p != nullptr && p->midi.velocityLow == 1 && p->midi.velocityHigh == 127,
           "velocity clamps then orders");
    check (p != nullptr && p->midi.transpose == 60, "transpose clamps");
    check (p != nullptr && juce::approximatelyEqual (p->volume, 2.0f)
             && juce::approximatelyEqual (p->pan, -1.0f),
           "mixer values clamp");
    check (out.focusedPartId.isEmpty(), "a focus naming no part is cleared, not fatal");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "automaticFailover":{
                 "enabled":false,"maxAttempts":99,"retryDelayMs":1
               }})"), out)
             && ! out.automaticFailover.enabled
             && out.automaticFailover.maxAttempts == 5
             && out.automaticFailover.retryDelayMs == 100,
           "automatic failover attempts and delay clamp to a safe persisted policy");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "modulationRoutes":[
                 {"routeId":"same","sourceType":"velocity","targetId":"p","parameterId":"x"},
                 {"routeId":"same","sourceType":"velocity","targetId":"p","parameterId":"y"}
               ]})"), out),
           "duplicate modulation route ids refuse — route identity is structural");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "modulationRoutes":[
                 {"routeId":"r","sourceType":"midiCc","sourceChannel":99,"sourceNumber":500,
                  "targetId":"part","parameterId":"cutoff","amount":-9,"baseValue":3}
               ]})"), out)
             && out.modulationRoutes.size() == 1
             && out.modulationRoutes[0].sourceChannel == 16
             && out.modulationRoutes[0].sourceNumber == 127
             && juce::approximatelyEqual (out.modulationRoutes[0].amount, -1.0f)
             && juce::approximatelyEqual (out.modulationRoutes[0].baseValue, 1.0f),
           "modulation values clamp while unresolved cables remain repairable");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "midiLfos":[
                 {"lfoId":"same"},{"lfoId":"same"}
               ]})"), out),
           "duplicate MIDI LFO ids refuse");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "midiLfos":[{
                 "lfoId":"l", "shape":"unknown", "rateHz":500, "syncBeats":0,
                 "phaseOffset":8, "minimum":0.9, "maximum":0.2,
                 "outputs":[{"outputId":"o","type":"nrpn","channel":40,"number":99999}]
               }]})"), out)
             && out.midiLfos.size() == 1
             && out.midiLfos[0].shape == "sine"
             && juce::approximatelyEqual ((float) out.midiLfos[0].rateHz, 40.0f)
             && juce::approximatelyEqual ((float) out.midiLfos[0].syncBeats, 0.03125f)
             && juce::approximatelyEqual (out.midiLfos[0].minimum, 0.2f)
             && juce::approximatelyEqual (out.midiLfos[0].maximum, 0.9f)
             && out.midiLfos[0].outputs[0].channel == 16
             && out.midiLfos[0].outputs[0].number == 16383,
           "MIDI LFO values clamp, ranges order, and unknown shapes fall back safely");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "envelopes":[
                 {"envelopeId":"same"},{"envelopeId":"same"}
               ]})"), out),
           "duplicate envelope ids refuse");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "envelopes":[{
                 "envelopeId":"e", "channel":99, "noteLow":120, "noteHigh":4,
                 "attackMs":-1, "decayMs":99999, "sustain":2, "releaseMs":-20,
                 "curve":-9, "velocityAmount":5
               }]})"), out)
             && out.envelopes.size() == 1
             && out.envelopes[0].channel == 16
             && out.envelopes[0].noteLow == 4
             && out.envelopes[0].noteHigh == 120
             && juce::approximatelyEqual ((float) out.envelopes[0].attackMs, 0.0f)
             && juce::approximatelyEqual ((float) out.envelopes[0].decayMs, 60000.0f)
             && juce::approximatelyEqual (out.envelopes[0].sustain, 1.0f)
             && juce::approximatelyEqual ((float) out.envelopes[0].releaseMs, 0.0f)
             && juce::approximatelyEqual (out.envelopes[0].curve, -1.0f)
             && juce::approximatelyEqual (out.envelopes[0].velocityAmount, 1.0f),
           "envelope timing, note range and response values clamp safely");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "msegs":[
                 {"msegId":"same","points":[{"pointId":"a"},{"pointId":"b"}]},
                 {"msegId":"same","points":[{"pointId":"c"},{"pointId":"d"}]}
               ]})"), out),
           "duplicate MSEG ids refuse");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "msegs":[{
                 "msegId":"m","points":[{"pointId":"same"},{"pointId":"same"}]
               }]})"), out),
           "duplicate MSEG point ids refuse");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "msegs":[{
                 "msegId":"m","rateHz":500,"syncBeats":0,"phaseOffset":4,
                 "points":[
                   {"pointId":"end","position":2,"value":-1,"curve":8},
                   {"pointId":"start","position":-2,"value":3,"curve":-8},
                   {"pointId":"middle","position":0.7,"value":0.4,"curve":0.2}
                 ]
               }]})"), out)
             && out.msegs.size() == 1
             && juce::approximatelyEqual ((float) out.msegs[0].rateHz, 40.0f)
             && juce::approximatelyEqual ((float) out.msegs[0].syncBeats, 0.03125f)
             && juce::approximatelyEqual (out.msegs[0].phaseOffset, 1.0f)
             && out.msegs[0].points.size() == 3
             && out.msegs[0].points[0].position == 0.0f
             && out.msegs[0].points[2].position == 1.0f
             && out.msegs[0].points[0].value == 1.0f
             && out.msegs[0].points[2].value == 0.0f,
           "MSEG timing and point data clamp, sort and anchor their endpoints");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "randomModulators":[
                 {"randomId":"same"},{"randomId":"same"}
               ]})"), out),
           "duplicate random modulator ids refuse");

    check (Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p", "parts":[], "randomModulators":[{
                 "randomId":"r","mode":"unknown","rateHz":500,"syncBeats":0,"seed":-9,
                 "probability":3,"smoothing":-2,"stepSize":4,"chaos":-1,
                 "minimum":0.9,"maximum":0.2
               }]})"), out)
             && out.randomModulators.size() == 1
             && out.randomModulators[0].mode == "sampleHold"
             && juce::approximatelyEqual ((float) out.randomModulators[0].rateHz, 40.0f)
             && juce::approximatelyEqual ((float) out.randomModulators[0].syncBeats, 0.03125f)
             && out.randomModulators[0].seed == 1
             && juce::approximatelyEqual (out.randomModulators[0].probability, 1.0f)
             && juce::approximatelyEqual (out.randomModulators[0].smoothing, 0.0f)
             && juce::approximatelyEqual (out.randomModulators[0].stepSize, 1.0f)
             && juce::approximatelyEqual (out.randomModulators[0].chaos, 0.0f)
             && juce::approximatelyEqual (out.randomModulators[0].minimum, 0.2f)
             && juce::approximatelyEqual (out.randomModulators[0].maximum, 0.9f),
           "random modulator values clamp, bounds order, and unknown modes fall back safely");
}

void testPerformanceTakes()
{
    std::cout << "\nperformance take persistence" << std::endl;

    auto performance = Performance::create();
    PerformanceTake take;
    take.takeId = "take-1";
    take.name = "First show";
    take.createdAt = "2026-09-03T20:00:00Z";
    take.sampleRate = 48000.0;
    take.durationSamples = 96000;
    take.startPositionPpq = 12.5;
    take.transportWasPlaying = true;
    take.initialStateJson = R"({"performanceId":"initial","parts":[]})";
    take.midiDataBase64 = "AAAA";
    take.midiEventCount = 2;
    take.actions.add ({ 24000, R"({"cmd":"launchScene","sceneId":"chorus"})" });
    performance.performanceTakes.add (take);

    Performance restored;
    check (Performance::fromVar (performance.toVar(), restored)
             && restored.performanceTakes.size() == 1
             && restored.performanceTakes[0].takeId == "take-1"
             && restored.performanceTakes[0].name == "First show"
             && restored.performanceTakes[0].durationSamples == 96000
             && juce::approximatelyEqual (restored.performanceTakes[0].startPositionPpq, 12.5)
             && restored.performanceTakes[0].transportWasPlaying
             && restored.performanceTakes[0].midiEventCount == 2
             && restored.performanceTakes[0].actions.size() == 1
             && restored.performanceTakes[0].actions[0].sampleOffset == 24000,
           "a complete take round-trips its initial rig, MIDI metadata and action timeline");

    check (! Performance::fromVar (juce::JSON::parse (R"({
               "performanceId":"p","parts":[],"performanceTakes":[
                 {"takeId":"same"},{"takeId":"same"}
               ]})"), restored),
           "duplicate performance-take ids refuse instead of making replay ambiguous");
}
} // namespace

int main()
{
    std::cout << "RackModel tests" << std::endl;

    testStructure();
    testRoundTrip();
    testValidation();
    testPerformanceTakes();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
