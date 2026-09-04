#include "InstrumentHostService.h"
#include "PatchDiff.h"
#include "EditorSnapshot.h"
#include "LiveWorkerDiagnostics.h"
#include "PluginWorkerCrashDumps.h"
#include "Performance/MicrotuningMidi.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <iterator>
#include <set>
#include <utility>

namespace ceditor::host
{

InstrumentHostService::InstrumentHostService (Options optionsToUse)
    : options (std::move (optionsToUse))
{
    activeMarker = std::make_unique<ActiveHostingMarker> (options.dataDirectory);
    safeMode = std::make_unique<SafeMode> (options.dataDirectory);
    recovery = std::make_unique<SessionRecovery> (options.dataDirectory);

    // The pane's half of the editor-before-processor invariant: whatever path destroys an
    // instrument, its editor is torn down first, and its parameter sync stops listening
    // first too. Replacement re-shows and re-attaches afterwards (see the commit callback
    // in requestInstrument).
    rack.onInstrumentWillBeRemoved = [this] (const juce::String& partId, juce::AudioProcessor&)
    {
        if (soundComparison.active && soundComparison.partId == partId)
        {
            soundComparison = {};
            presetAuditionEvents.clear();
            presetAuditionHeldNotes.clear();
            presetAuditionPartId = {};
            presetAuditionPlaying = false;
        }
        partParameters.erase (partId);
        if (partId == editorTargetId)
            hideEditor();
        if (floatingEditorIds.contains (partId))
        {
            floatingEditorIds.removeString (partId);
            if (options.editorWindows.close != nullptr)
                options.editorWindows.close (partId);
        }
    };
}

InstrumentHostService::~InstrumentHostService()
{
    if (options.editorWindows.closeAll != nullptr)
        options.editorWindows.closeAll();
    // Hand the hardware back on the way out: a claim outliving its owner is what the heartbeat
    // timeout exists to recover from, not the normal path.
    releaseHardwareSurface();
    stopPresetAudition();
    stopAudio();
    *alive = false;
    stopRequested.store (true);
    if (scanThread.joinable())
        scanThread.join();
}

namespace
{
    /** Stage Lock is a native boundary, not just a hidden set of WebView buttons. Anything
        omitted here is treated as an edit to the rig and refused while playing. The list is
        deliberately small: performance gestures stay live; construction and configuration
        wait until Build is deliberately unlocked. */
    bool isStageSafeCommand (const juce::String& command)
    {
        static const juce::StringArray safeCommands {
            "beginParameterGesture", "endParameterGesture", "getAudioDevices",
            "getHostProject", "getLibrary", "getLicence", "getParameters",
            "getSurfaceLayout", "focusPart", "hostNote", "launchClip", "launchScene", "panic",
            "previewSupportBundle", "resetParameter", "setBusLevel",
            "setControlSlotValue", "setEffectBypassed", "setExternalClock",
            "setMacroValue", "setMasterLevel", "setParameter", "setParameterText",
            "setModulationRoute", "setMidiLfo", "setMidiLfoOutput", "resetMidiLfo",
            "setEnvelope", "triggerEnvelope", "resetEnvelope", "setMseg", "resetMseg",
            "setRandomModulator", "resetRandomModulator",
            "setPerformanceFill",
            "startSoundComparison", "stepSoundComparison", "keepSoundComparison",
            "cancelSoundComparison",
            "setPartMixer", "setReturnLevel", "setSendLevel", "setTempo",
            "sendMicrotuning",
            "setTimeSignature", "setTransportPosition", "setlistGo", "setlistNext",
            "setlistPrev", "startArrangement", "stopArrangement",
            "stopAllClips", "stopClip", "transportContinue",
            "transportPlay", "transportStop", "walkPartPreset", "startMidiLoop",
            "finishMidiLoop", "cancelMidiLoop",
            "startGestureRecording", "finishGestureRecording", "cancelGestureRecording",
            "startPerformanceRecording", "finishPerformanceRecording",
            "cancelPerformanceRecording", "removePerformanceTake",
            "replayPerformanceTake", "stopPerformanceReplay", "surfacePerformanceEncoder",
            "surfaceStepPad", "retryFailedProcessor", "dismissFailoverEvent",

            // Escape/cancellation actions must never be trapped behind the lock.
            "cancelHardwarePatchCapture", "cancelKeyChordLearn",
            "cancelLearnControlSlotParameter", "cancelMidiLearn", "disarmCapture"
        };
        return safeCommands.contains (command);
    }

    /** Merges the arp fields a payload names into `arp`; absent fields keep their value.
        Shared by the part-level command and the per-slot one so "gate" can never come to
        mean two different things depending on which door it came through. */
    void applyArpFields (perf::ArpSettings& arp, const juce::var& payload,
                         const juce::DynamicObject& fields)
    {
        if (fields.hasProperty ("enabled"))      arp.enabled = (bool) payload["enabled"];
        if (fields.hasProperty ("mode"))         arp.mode = perf::ArpSettings::modeFromName (payload["mode"].toString());
        if (fields.hasProperty ("stepsPerBeat")) arp.stepsPerBeat = juce::jlimit (1, 16, (int) payload["stepsPerBeat"]);
        if (fields.hasProperty ("gate"))         arp.gate = juce::jlimit (0.05f, 1.0f, (float) (double) payload["gate"]);
        if (fields.hasProperty ("swing"))        arp.swing = juce::jlimit (0.0f, 0.75f, (float) (double) payload["swing"]);
        if (fields.hasProperty ("octaves"))      arp.octaves = juce::jlimit (1, 4, (int) payload["octaves"]);
        if (fields.hasProperty ("latch"))        arp.latch = (bool) payload["latch"];
        if (fields.hasProperty ("constrainToScale")) arp.constrainToScale = (bool) payload["constrainToScale"];
        if (fields.hasProperty ("patternSemitones")) arp.patternSemitones = (bool) payload["patternSemitones"];

        if (fields.hasProperty ("velocityPattern"))
        {
            arp.velocityPattern.clear();
            if (const auto* velocities = payload["velocityPattern"].getArray())
                for (const auto& velocity : *velocities)
                {
                    if (arp.velocityPattern.size() >= perf::ArpEngine::maxPatternSteps)
                        break;
                    // 0 is a rest, drawable from the grid; the engine skips it.
                    arp.velocityPattern.add (juce::jlimit (0, 127, (int) velocity));
                }
        }

        if (fields.hasProperty ("degreePattern"))
        {
            arp.degreePattern.clear();
            if (const auto* degrees = payload["degreePattern"].getArray())
                for (const auto& degree : *degrees)
                {
                    if (arp.degreePattern.size() >= perf::ArpEngine::maxPatternSteps)
                        break;
                    // -1 is a drawn rest; anything else picks a held-pool degree.
                    arp.degreePattern.add (juce::jlimit (-1, 63, (int) degree));
                }
        }
    }

    /** The note-shaping fields, same contract. */
    void applyMidiFxFields (perf::MidiFxSettings& fx, const juce::var& payload,
                            const juce::DynamicObject& fields)
    {
        if (fields.hasProperty ("transpose"))        fx.transpose = juce::jlimit (-48, 48, (int) payload["transpose"]);
        if (fields.hasProperty ("transposeMode"))    fx.transposeMode = payload["transposeMode"].toString() == "diatonic"
                                                                          ? "diatonic" : "chromatic";
        if (fields.hasProperty ("constrainToScale")) fx.constrainToScale = (bool) payload["constrainToScale"];
        if (fields.hasProperty ("scaleRoot"))        fx.scaleRoot = juce::jlimit (0, 11, (int) payload["scaleRoot"]);
        if (fields.hasProperty ("scaleType"))        fx.scaleType = payload["scaleType"].toString();
        if (fields.hasProperty ("chord"))            fx.chord = perf::MidiFxSettings::chordTypeFromName (payload["chord"].toString());
        if (fields.hasProperty ("chordInversion"))   fx.chordInversion = juce::jlimit (0, 3, (int) payload["chordInversion"]);
        if (fields.hasProperty ("chordVoicing"))     fx.chordVoicing = perf::MidiFxSettings::chordVoicingFromName (payload["chordVoicing"].toString());
        if (fields.hasProperty ("chordVoiceLeading")) fx.chordVoiceLeading = (bool) payload["chordVoiceLeading"];
        if (fields.hasProperty ("velocityFixed"))    fx.velocityFixed = juce::jlimit (0, 127, (int) payload["velocityFixed"]);
        if (fields.hasProperty ("velocityScale"))    fx.velocityScale = juce::jlimit (0.1f, 2.0f, (float) (double) payload["velocityScale"]);
        if (fields.hasProperty ("responseProfileName"))
            fx.responseProfileName = payload["responseProfileName"].toString().trim().substring (0, 80);
        if (fields.hasProperty ("velocityCurve"))
            fx.velocityCurve = perf::MidiFxSettings::responseCurveFromName (
                                   payload["velocityCurve"].toString());
        if (fields.hasProperty ("velocityInputMin"))  fx.velocityInputMin = juce::jlimit (1, 127, (int) payload["velocityInputMin"]);
        if (fields.hasProperty ("velocityInputMax"))  fx.velocityInputMax = juce::jlimit (1, 127, (int) payload["velocityInputMax"]);
        if (fields.hasProperty ("velocityOutputMin")) fx.velocityOutputMin = juce::jlimit (1, 127, (int) payload["velocityOutputMin"]);
        if (fields.hasProperty ("velocityOutputMax")) fx.velocityOutputMax = juce::jlimit (1, 127, (int) payload["velocityOutputMax"]);
        if (fx.velocityInputMin > fx.velocityInputMax)
            std::swap (fx.velocityInputMin, fx.velocityInputMax);
        if (fx.velocityOutputMin > fx.velocityOutputMax)
            std::swap (fx.velocityOutputMin, fx.velocityOutputMax);
        if (fields.hasProperty ("velocityCurveValues"))
        {
            fx.velocityCurveValues.clearQuick();
            if (const auto* values = payload["velocityCurveValues"].getArray())
                for (const auto& value : *values)
                {
                    if (fx.velocityCurveValues.size() >= perf::MidiFxSettings::responseCurvePoints)
                        break;
                    fx.velocityCurveValues.add (juce::jlimit (0, 127, (int) value));
                }
        }

        if (fields.hasProperty ("expressionEnabled")) fx.expressionEnabled = (bool) payload["expressionEnabled"];
        if (fields.hasProperty ("expressionSource"))
        {
            const auto source = payload["expressionSource"].toString();
            const juce::StringArray sources { "cc", "channel pressure", "poly aftertouch" };
            if (sources.contains (source))
                fx.expressionSource = source;
        }
        if (fields.hasProperty ("expressionCc")) fx.expressionCc = juce::jlimit (0, 127, (int) payload["expressionCc"]);
        if (fields.hasProperty ("expressionCurve"))
            fx.expressionCurve = perf::MidiFxSettings::responseCurveFromName (
                                     payload["expressionCurve"].toString());
        if (fields.hasProperty ("expressionInputMin"))  fx.expressionInputMin = juce::jlimit (0, 127, (int) payload["expressionInputMin"]);
        if (fields.hasProperty ("expressionInputMax"))  fx.expressionInputMax = juce::jlimit (0, 127, (int) payload["expressionInputMax"]);
        if (fields.hasProperty ("expressionOutputMin")) fx.expressionOutputMin = juce::jlimit (0, 127, (int) payload["expressionOutputMin"]);
        if (fields.hasProperty ("expressionOutputMax")) fx.expressionOutputMax = juce::jlimit (0, 127, (int) payload["expressionOutputMax"]);
        if (fx.expressionInputMin > fx.expressionInputMax)
            std::swap (fx.expressionInputMin, fx.expressionInputMax);
        if (fx.expressionOutputMin > fx.expressionOutputMax)
            std::swap (fx.expressionOutputMin, fx.expressionOutputMax);
        if (fields.hasProperty ("expressionCurveValues"))
        {
            fx.expressionCurveValues.clearQuick();
            if (const auto* values = payload["expressionCurveValues"].getArray())
                for (const auto& value : *values)
                {
                    if (fx.expressionCurveValues.size() >= perf::MidiFxSettings::responseCurvePoints)
                        break;
                    fx.expressionCurveValues.add (juce::jlimit (0, 127, (int) value));
                }
        }
    }

    /** What a hardware patch record targets. A plug-in has a class identity; a synth on a
        cable has nothing of the kind, so the best available stand-in is used and the record
        says which: the device profile it was linked to, or failing that the port it was
        reached through. "hw:" keeps it out of the catalogue's namespace — no lookup will
        ever mistake it for a class, and the availability check knows to leave it alone. */
    juce::String hardwarePatchTarget (const RackPart& part)
    {
        const auto identity = part.deviceProfileId.isNotEmpty() ? part.deviceProfileId
                                                                : part.midiOutputName;
        return identity.isEmpty() ? juce::String ("hw:")
                                  : "hw:" + identity.trim().toLowerCase();
    }

    juce::String hardwareInstrumentName (const RackPart& part)
    {
        return part.deviceProfileId.isNotEmpty() ? part.deviceProfileId
             : part.midiOutputName.isNotEmpty()  ? part.midiOutputName
                                                 : juce::String ("External hardware");
    }

    /** The later note modules' fields. Clamped here as well as in the codec because a command
        arrives from a WebView and a codec only sees what was written to disk — an echo asked
        for four hundred repeats has to be refused at the door, not on the next load. */
    void applyNoteModuleFields (perf::NoteModuleSettings& mod, const juce::var& payload,
                                const juce::DynamicObject& fields)
    {
        if (fields.hasProperty ("echoRepeats"))    mod.echoRepeats = juce::jlimit (0, 8, (int) payload["echoRepeats"]);
        if (fields.hasProperty ("echoStepBeats"))  mod.echoStepBeats = juce::jlimit (0.03125, 4.0, (double) payload["echoStepBeats"]);
        if (fields.hasProperty ("echoFeedback"))   mod.echoFeedback = juce::jlimit (0.1f, 1.0f, (float) (double) payload["echoFeedback"]);
        if (fields.hasProperty ("echoTranspose"))  mod.echoTranspose = juce::jlimit (-12, 12, (int) payload["echoTranspose"]);
        if (fields.hasProperty ("strumBeats"))     mod.strumBeats = juce::jlimit (0.0, 1.0, (double) payload["strumBeats"]);
        if (fields.hasProperty ("strumDown"))
        {
            mod.strumDown = (bool) payload["strumDown"];
            mod.strumPattern = mod.strumDown ? perf::NoteModuleSettings::StrumPattern::descending
                                             : perf::NoteModuleSettings::StrumPattern::ascending;
        }
        if (fields.hasProperty ("strumPattern"))
        {
            mod.strumPattern = perf::NoteModuleSettings::strumPatternFromName (payload["strumPattern"].toString());
            mod.strumDown = mod.strumPattern == perf::NoteModuleSettings::StrumPattern::descending;
        }
        if (fields.hasProperty ("strumCurve"))     mod.strumCurve = juce::jlimit (-1.0f, 1.0f, (float) (double) payload["strumCurve"]);
        if (fields.hasProperty ("strumVelocityRamp")) mod.strumVelocityRamp = juce::jlimit (-64, 64, (int) payload["strumVelocityRamp"]);
        if (fields.hasProperty ("humanizeTimingBeats")) mod.humanizeTimingBeats = juce::jlimit (0.0, 0.25, (double) payload["humanizeTimingBeats"]);
        if (fields.hasProperty ("humanizeVelocity"))    mod.humanizeVelocity = juce::jlimit (0, 64, (int) payload["humanizeVelocity"]);
        if (fields.hasProperty ("humanizeGatePercent")) mod.humanizeGatePercent = juce::jlimit (0, 100, (int) payload["humanizeGatePercent"]);
        if (fields.hasProperty ("humanizePreserveChords")) mod.humanizePreserveChords = (bool) payload["humanizePreserveChords"];
        if (fields.hasProperty ("humanizeProtectBeats")) mod.humanizeProtectBeats = (bool) payload["humanizeProtectBeats"];
        if (fields.hasProperty ("chance"))         mod.chance = juce::jlimit (0.0f, 1.0f, (float) (double) payload["chance"]);
        if (fields.hasProperty ("lengthBeats"))    mod.lengthBeats = juce::jlimit (0.0, 8.0, (double) payload["lengthBeats"]);
        if (fields.hasProperty ("legato"))         mod.legato = (bool) payload["legato"];
        if (fields.hasProperty ("latchOn"))        mod.latchOn = (bool) payload["latchOn"];
        const juce::StringArray mpeFormats { "mpe", "poly aftertouch", "channel pressure", "cc" };
        const juce::StringArray mpeAxes { "pressure", "timbre", "pitch bend" };
        const juce::StringArray mpeCollapseModes { "latest", "highest", "average" };
        if (fields.hasProperty ("mpeEnabled")) mod.mpeEnabled = (bool) payload["mpeEnabled"];
        if (fields.hasProperty ("mpeInput") && mpeFormats.contains (payload["mpeInput"].toString()))
            mod.mpeInput = payload["mpeInput"].toString();
        if (fields.hasProperty ("mpeOutput") && mpeFormats.contains (payload["mpeOutput"].toString()))
            mod.mpeOutput = payload["mpeOutput"].toString();
        if (fields.hasProperty ("mpeInputAxis") && mpeAxes.contains (payload["mpeInputAxis"].toString()))
            mod.mpeInputAxis = payload["mpeInputAxis"].toString();
        if (fields.hasProperty ("mpeOutputAxis") && mpeAxes.contains (payload["mpeOutputAxis"].toString()))
            mod.mpeOutputAxis = payload["mpeOutputAxis"].toString();
        if (fields.hasProperty ("mpeInputCc"))       mod.mpeInputCc = juce::jlimit (0, 127, (int) payload["mpeInputCc"]);
        if (fields.hasProperty ("mpeOutputCc"))      mod.mpeOutputCc = juce::jlimit (0, 127, (int) payload["mpeOutputCc"]);
        if (fields.hasProperty ("mpeOutputChannel")) mod.mpeOutputChannel = juce::jlimit (1, 16, (int) payload["mpeOutputChannel"]);
        if (fields.hasProperty ("mpeMemberFirst"))   mod.mpeMemberFirst = juce::jlimit (1, 16, (int) payload["mpeMemberFirst"]);
        if (fields.hasProperty ("mpeMemberLast"))    mod.mpeMemberLast = juce::jlimit (1, 16, (int) payload["mpeMemberLast"]);
        if (mod.mpeMemberFirst > mod.mpeMemberLast)
            std::swap (mod.mpeMemberFirst, mod.mpeMemberLast);
        if (fields.hasProperty ("mpeCollapse") && mpeCollapseModes.contains (payload["mpeCollapse"].toString()))
            mod.mpeCollapse = payload["mpeCollapse"].toString();
        if (fields.hasProperty ("articulationEnabled"))
            mod.articulationEnabled = (bool) payload["articulationEnabled"];
        if (fields.hasProperty ("articulationMapName"))
            mod.articulationMapName = payload["articulationMapName"].toString().trim()
                                          .substring (0, 80);
        if (fields.hasProperty ("articulations"))
        {
            mod.articulations.clearQuick();
            const juce::StringArray articulationTypes { "keyswitch", "program change", "cc" };
            if (const auto* entries = payload["articulations"].getArray())
                for (const auto& entry : *entries)
                {
                    if (mod.articulations.size() >= perf::ArticulationManagerEngine::maxArticulations
                        || ! entry.isObject())
                        break;
                    perf::NoteModuleSettings::Articulation articulation;
                    articulation.articulationId = entry.getProperty ("articulationId", {}).toString();
                    if (articulation.articulationId.isEmpty())
                        articulation.articulationId = juce::Uuid().toDashedString();
                    articulation.name = entry.getProperty ("name", "Articulation").toString().trim()
                                            .substring (0, 80);
                    if (articulation.name.isEmpty())
                        articulation.name = "Articulation";
                    articulation.triggerNote = juce::jlimit (0, 127,
                        (int) entry.getProperty ("triggerNote", 24));
                    articulation.triggerChannel = juce::jlimit (0, 16,
                        (int) entry.getProperty ("triggerChannel", 0));
                    const auto type = entry.getProperty ("type", "keyswitch").toString();
                    articulation.type = articulationTypes.contains (type) ? type : "keyswitch";
                    articulation.outputChannel = juce::jlimit (0, 16,
                        (int) entry.getProperty ("outputChannel", 0));
                    articulation.keyswitchNote = juce::jlimit (0, 127,
                        (int) entry.getProperty ("keyswitchNote", articulation.triggerNote));
                    articulation.keyswitchVelocity = juce::jlimit (1, 127,
                        (int) entry.getProperty ("keyswitchVelocity", 100));
                    articulation.program = juce::jlimit (0, 127,
                        (int) entry.getProperty ("program", 0));
                    articulation.bankMsb = juce::jlimit (-1, 127,
                        (int) entry.getProperty ("bankMsb", -1));
                    articulation.bankLsb = juce::jlimit (-1, 127,
                        (int) entry.getProperty ("bankLsb", -1));
                    articulation.controller = juce::jlimit (0, 127,
                        (int) entry.getProperty ("controller", 0));
                    articulation.controllerValue = juce::jlimit (0, 127,
                        (int) entry.getProperty ("controllerValue", 127));
                    mod.articulations.add (std::move (articulation));
                }
        }
    }
} // namespace

void InstrumentHostService::handleCommand (const juce::var& payload)
{
    const auto cmd = payload.getProperty ("cmd", {}).toString();
    const auto outermostCommand = ! handlingCommand;
    const juce::ScopedValueSetter<bool> handlingScope (handlingCommand, true);
    if (outermostCommand)
        recordPerformanceAction (payload);

    if (cmd == "getState")
    {
        if (! sessionRestored)
            restoreSession();
        emitState();
        return;
    }

    if (cmd == "setStageLock")
    {
        const auto requested = (bool) payload.getProperty ("enabled", true);
        if (requested)
        {
            stageLocked = true;
            stageUnlockStartedMs = 0.0;
            emitState();
            return;
        }

        const auto heldMs = stageUnlockStartedMs > 0.0
                              ? juce::Time::getMillisecondCounterHiRes() - stageUnlockStartedMs
                              : 0.0;
        if (stageLocked && heldMs < stageUnlockHoldMs)
        {
            stageUnlockStartedMs = 0.0;
            emitError ("Hold Build for one second to leave Stage Lock.");
            emitState();
            return;
        }

        stageLocked = false;
        stageUnlockStartedMs = 0.0;
        emitState();
        return;
    }

    if (cmd == "beginStageUnlock")
    {
        if (stageLocked && stageUnlockStartedMs <= 0.0)
            stageUnlockStartedMs = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    if (cmd == "cancelStageUnlock")
    {
        stageUnlockStartedMs = 0.0;
        return;
    }

    if (stageLocked && ! isStageSafeCommand (cmd))
    {
        emitError ("Stage Lock blocked '" + cmd
                   + "'. Hold Build for one second before changing the rig.");
        emitState();
        return;
    }

    if (cmd == "startPerformanceRecording")
    {
        startPerformanceRecording (payload.getProperty ("name", {}).toString());
        return;
    }
    if (cmd == "finishPerformanceRecording")
    {
        finishPerformanceRecording();
        return;
    }
    if (cmd == "cancelPerformanceRecording")
    {
        cancelPerformanceRecording();
        return;
    }
    if (cmd == "removePerformanceTake")
    {
        const auto takeId = payload.getProperty ("takeId", {}).toString();
        if (performanceReplay.state != PerformanceReplayRuntime::State::idle
            && performanceReplay.take.takeId == takeId)
            stopPerformanceReplay (false);
        auto& takes = const_cast<Performance&> (rack.getPerformance()).performanceTakes;
        for (int i = takes.size(); --i >= 0;)
            if (takes.getReference (i).takeId == takeId)
            {
                takes.remove (i);
                savePerformance();
                emitState();
                return;
            }
        emitError ("That performance take no longer exists.");
        return;
    }
    if (cmd == "replayPerformanceTake")
    {
        startPerformanceReplay (payload.getProperty ("takeId", {}).toString());
        return;
    }
    if (cmd == "stopPerformanceReplay")
    {
        stopPerformanceReplay();
        return;
    }
    if (cmd == "surfacePerformanceEncoder")
    {
        nudgePerformanceEncoder (
            (SurfaceEncoder) juce::jlimit (0, (int) SurfaceEncoder::velocity,
                                            (int) payload.getProperty ("encoder", 0)),
            juce::jlimit (-127, 127, (int) payload.getProperty ("delta", 0)));
        return;
    }
    if (cmd == "surfaceStepPad")
    {
        surfaceStepPad (juce::jlimit (0, 127, (int) payload.getProperty ("padIndex", 0)));
        return;
    }

    // Describe the controller on your desk. Three numbers and a name is the whole of it,
    // because control already works — see SurfaceProfile.h, buildGenericLayout.
    if (cmd == "setUserSurface")
    {
        loadUserSurface();
        const auto name = payload.getProperty ("name", {}).toString().trim();
        if (name.isEmpty())
        {
            emitError ("Give the controller a name.");
            return;
        }

        const auto count = [&payload] (const char* key)
        {
            return juce::jlimit (0, 64, (int) payload.getProperty (key, 0));
        };

        userSurfaceName = name;
        userSurfaceCapabilities = {};
        userSurfaceCapabilities.encoders = count ("encoders");
        userSurfaceCapabilities.faders   = count ("faders");
        userSurfaceCapabilities.pads     = count ("pads");

        if (userSurfaceCapabilities.encoders + userSurfaceCapabilities.faders
              + userSurfaceCapabilities.pads == 0)
        {
            emitError ("A controller with nothing on it has nothing to draw.");
            userSurfaceName = {};
            return;
        }

        userSurfaceLearning = false;
        saveUserSurface();
        emitSurfaceLayout();
        return;
    }

    if (cmd == "clearUserSurface")
    {
        loadUserSurface();
        userSurfaceName = {};
        userSurfaceCapabilities = {};
        userSurfaceLearning = false;
        saveUserSurface();
        emitSurfaceLayout();
        return;
    }

    // Counting instead of asking: sweep every knob and fader you want to use, and CEditor
    // counts the distinct controllers it hears. It cannot tell a knob from a fader — both are
    // continuous controllers on the wire — so it calls them all encoders and the owner can
    // split them afterwards if the picture matters to them. Saying that plainly beats
    // guessing, and guessing is what would make the drawing a lie.
    if (cmd == "learnUserSurface")
    {
        userSurfaceLearning = true;
        userSurfaceHeard.clear();
        {
            const std::scoped_lock lock (midiActivityLock);
            pendingCcs.clear();     // only what moves from NOW counts
        }
        emitSurfaceLayout();
        return;
    }

    if (cmd == "finishUserSurfaceLearn")
    {
        if (! userSurfaceLearning)
            return;

        userSurfaceLearning = false;
        const auto heard = userSurfaceHeard.size();
        if (heard == 0)
        {
            emitError ("Nothing moved — sweep the knobs and faders you want to use, then finish.");
            emitSurfaceLayout();
            return;
        }

        loadUserSurface();
        if (userSurfaceName.isEmpty())
            userSurfaceName = payload.getProperty ("name", {}).toString().trim();
        if (userSurfaceName.isEmpty())
            userSurfaceName = "My controller";

        userSurfaceCapabilities.encoders = juce::jlimit (0, 64, heard);
        saveUserSurface();
        emitSurfaceLayout();
        return;
    }

    if (cmd == "getSurfaceLayout")
    {
        emitSurfaceLayout (payload.getProperty ("profileId", {}).toString());
        return;
    }

    if (cmd == "scan")
    {
        if (scanBusy.exchange (true))
        {
            emitError ("A scan is already running.");
            return;
        }

        if (scanThread.joinable())
            scanThread.join();   // a finished previous scan; reclaim it

        auto body = [this] { runScanNow(); };
        if (options.scanExecutor != nullptr)
            options.scanExecutor (body);
        else
            scanThread = std::thread (body);
        return;
    }

    if (cmd == "browseScanPath")
    {
        if (options.pickDirectory == nullptr)
        {
            emitError ("A folder picker is not available in this build — type the path instead.");
            return;
        }

        options.pickDirectory ([this, aliveToken = alive] (const juce::String& directory)
        {
            // The picker is asynchronous; the token guards a choice arriving after teardown,
            // and an empty result is a cancel — nothing changes, nothing is said.
            if (! aliveToken->load() || directory.isEmpty())
                return;

            userScanPaths.addIfNotAlreadyThere (directory);
            saveScanPaths();
            emitState();
        });
        return;
    }

    if (cmd == "addScanPath" || cmd == "removeScanPath")
    {
        const auto path = payload.getProperty ("path", {}).toString().trim();
        if (path.isEmpty())
        {
            emitError ("A scan path must not be empty.");
            return;
        }

        if (cmd == "addScanPath")
            userScanPaths.addIfNotAlreadyThere (path);
        else
            userScanPaths.removeString (path);

        saveScanPaths();
        emitState();
        return;
    }

    if (cmd == "clearQuarantine")
    {
        const auto modulePath = payload.getProperty ("modulePath", {}).toString();
        {
            const std::scoped_lock lock (catalogLock);
            catalog.clearQuarantine (modulePath);
            catalog.saveTo (catalogFile());
        }
        emitState();
        return;
    }

    if (cmd == "addPart")
    {
        rack.addPart();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removePart")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (! rack.removePart (partId))
        {
            emitError ("Unknown rack part.");
            return;
        }
        hardwareMidiErrors.erase (partId);
        microtuningErrors.erase (partId);
        savePerformance();
        emitState();
        return;
    }

    // Where the user put a box on the rack canvas. Refused for an id that is not a node: an
    // unknown id would be a position for something that cannot be drawn, kept in the session
    // for ever, and eventually applied to whatever inherits the id.
    // A picture the user chooses for a plug-in class, beating the vendor's own and any
    // capture. Copied into the host's own folder rather than referenced where it sits: a file
    // in Downloads is one tidy-up away from a plug-in with no picture and no explanation, and
    // the copy is normalised to a thumbnail-sized PNG on the way in so every source format
    // ends up the same shape.
    if (cmd == "setPluginArtwork")
    {
        const auto ceId = payload.getProperty ("ceId", {}).toString();
        PluginClassRecord record;
        {
            const std::scoped_lock lock (catalogLock);
            const auto* found = findClass (ceId);
            if (found == nullptr)
            {
                emitError ("That plug-in is not in the catalogue.");
                return;
            }
            record = *found;
        }

        if (options.dataDirectory == juce::File())
        {
            emitError ("There is nowhere to keep a picture in this build.");
            return;
        }

        // An explicit path is the scriptable route and what the tests use; without one the
        // native picker is asked, and its absence is said out loud rather than ignored.
        const auto chosen = payload.getProperty ("file", {}).toString();
        const auto apply = [this, record] (const juce::String& imagePath)
        {
            if (imagePath.isEmpty())
                return;                                  // cancelled: nothing to say

            const juce::File source (imagePath);
            const auto image = juce::ImageFileFormat::loadFrom (source);
            if (! image.isValid())
            {
                emitError ("That file is not a picture this build can read.");
                return;
            }

            // rejectBlank is off here on purpose: a flat colour is a strange thing to choose
            // and it is still exactly what was chosen. The blank check exists to catch a
            // plug-in that failed to draw itself, and a person is not that.
            if (! editorSnapshot::writePng (editorSnapshot::downscaled (image, editorSnapshot::thumbnailMaxEdge),
                                            snapshotOverrideFile (record), false))
            {
                emitError ("The picture could not be saved.");
                return;
            }

            emitState();
        };

        if (chosen.isNotEmpty())
        {
            apply (chosen);
            return;
        }

        if (options.pickImage == nullptr)
        {
            emitError ("Choosing a picture is not available in this build.");
            return;
        }

        options.pickImage ([this, aliveToken = alive, apply] (const juce::String& imagePath)
        {
            if (aliveToken->load())
                apply (imagePath);
        });
        return;
    }

    // Back to whatever the plug-in itself offers — the vendor's snapshot, the capture taken
    // when its editor was open, or the generated tile. The override is deleted; nothing else
    // is, which is why the capture is kept in a file of its own.
    if (cmd == "clearPluginArtwork")
    {
        const auto ceId = payload.getProperty ("ceId", {}).toString();
        PluginClassRecord record;
        {
            const std::scoped_lock lock (catalogLock);
            const auto* found = findClass (ceId);
            if (found == nullptr)
            {
                emitError ("That plug-in is not in the catalogue.");
                return;
            }
            record = *found;
        }

        if (options.dataDirectory != juce::File())
            snapshotOverrideFile (record).deleteFile();

        emitState();
        return;
    }

    if (cmd == "setCanvasPosition")
    {
        if (! rack.setCanvasPosition (payload.getProperty ("nodeId", {}).toString(),
                                      (int) payload.getProperty ("x", 0),
                                      (int) payload.getProperty ("y", 0)))
        {
            emitError ("Unknown canvas node.");
            return;
        }

        savePerformance();
        emitState();
        return;
    }

    // The complete undo: every box goes back to being laid out for you. One command rather
    // than a position-per-node reset, because "put it back the way it was" is one intention.
    if (cmd == "clearCanvasPositions")
    {
        rack.clearCanvasPositions();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "movePart")
    {
        if (! rack.movePart (payload.getProperty ("partId", {}).toString(),
                             (int) payload.getProperty ("index", 0)))
        {
            emitError ("Unknown rack part.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "focusPart")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (! rack.focusPart (partId))
        {
            emitError ("Unknown rack part.");
            return;
        }

        // The editor follows the focused part (baseline §8.6.9): showEditorFor hides the
        // pane when the newly focused part has nothing to show. An EFFECT editor stays put —
        // the focus model distinguishes focused part from focused processor (§18.7.8), and
        // yanking an effect editor away on part focus would fight the mixing workflow.
        if (editorTargetId.isNotEmpty() && editorTargetId != partId
            && rack.getPerformance().findPart (editorTargetId) != nullptr)
            showEditorFor (partId);

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "getAudioDevices")
    {
        emitAudioDevices();
        return;
    }

    if (cmd == "setAudioDevice")
    {
        auto setup = deviceManager.getAudioDeviceSetup();
        setup.outputDeviceName = payload.getProperty ("name", {}).toString();
        setup.useDefaultOutputChannels = true;

        const auto error = deviceManager.setAudioDeviceSetup (setup, true);
        if (error.isNotEmpty())
            emitError ("Audio device: " + error);

        emitAudioDevices();
        emitState();
        return;
    }

    if (cmd == "setMidiInputEnabled")
    {
        deviceManager.setMidiInputDeviceEnabled (payload.getProperty ("id", {}).toString(),
                                                 (bool) payload.getProperty ("enabled", true));
        emitAudioDevices();
        return;
    }

    if (cmd == "hostNote")
    {
        // The on-screen keyboard. Deliberately the SAME entry hardware MIDI uses — the
        // player's collector, ahead of the graph — so zones, splits, the event chain and the
        // arp all apply, and what you audition is what a keyboard would play. A note with
        // audio off would vanish silently, so it refuses aloud instead.
        if (! audioRunning)
        {
            emitError ("Audio is off, so there is nothing to hear. Open Audio & MIDI and "
                       "pick an output device.");
            return;
        }

        const auto note = juce::jlimit (0, 127, (int) payload.getProperty ("note", 60));
        const auto velocity = juce::jlimit (1, 127, (int) payload.getProperty ("velocity", 100));
        const auto channel = juce::jlimit (1, 16, (int) payload.getProperty ("channel", 1));
        const bool on = (bool) payload.getProperty ("on", true);

        auto message = on ? juce::MidiMessage::noteOn (channel, note, (juce::uint8) velocity)
                          : juce::MidiMessage::noteOff (channel, note);
        message.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
        player.getMidiMessageCollector().addMessageToQueue (message);
        return;
    }

    if (cmd == "openEditor")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (rack.getPerformance().findPart (partId) == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        if (rack.getInstrument (partId) == nullptr)
        {
            emitError ("That part has no instrument loaded.");
            return;
        }

        showEditorFor (partId);
        emitState();
        return;
    }

    if (cmd == "closeEditor")
    {
        hideEditor();
        emitState();
        return;
    }

    if (cmd == "floatEditor")
    {
        // Any editor in its own window, beside however many others: the docked pane was
        // policy, not a limit. The target is a part's instrument OR an insert effect — the
        // same either-or the pane serves; the owner's first session found the effects half
        // missing. A processor carries one live editor, so floating what is docked moves
        // it out of the pane first.
        const auto targetId = payload.getProperty ("partId", {}).toString();

        juce::AudioProcessor* processor = rack.getInstrument (targetId);
        juce::String title;
        if (processor != nullptr)
        {
            const auto* part = rack.getPerformance().findPart (targetId);
            title = part != nullptr && part->pluginName.isNotEmpty() ? part->pluginName
                                                                     : juce::String ("Instrument");
        }
        else if (auto* effect = rack.getEffect (targetId))
        {
            processor = effect;
            const auto* slot = rack.getPerformance().findEffect (targetId);
            title = slot != nullptr && slot->pluginName.isNotEmpty() ? slot->pluginName
                                                                     : juce::String ("Effect");
        }

        if (processor == nullptr)
        {
            emitError ("Nothing is loaded there to show.");
            return;
        }

        if (targetId == editorTargetId)
            hideEditor();

        floatingEditorIds.addIfNotAlreadyThere (targetId);
        if (options.editorWindows.show != nullptr)
            options.editorWindows.show (targetId, *processor, title);
        emitState();
        return;
    }

    if (cmd == "closeEditorWindow")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (! floatingEditorIds.contains (partId))
            return;
        floatingEditorIds.removeString (partId);
        if (options.editorWindows.close != nullptr)
            options.editorWindows.close (partId);
        emitState();
        return;
    }

    if (cmd == "setPartMidiRules")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        // Absent fields keep their current value, so the UI can send only what changed.
        PartMidiRules rules = part->midi;
        rules.channel      = (int) payload.getProperty ("channel",      rules.channel);
        rules.keyLow       = (int) payload.getProperty ("keyLow",       rules.keyLow);
        rules.keyHigh      = (int) payload.getProperty ("keyHigh",      rules.keyHigh);
        rules.velocityLow  = (int) payload.getProperty ("velocityLow",  rules.velocityLow);
        rules.velocityHigh = (int) payload.getProperty ("velocityHigh", rules.velocityHigh);
        rules.transpose    = (int) payload.getProperty ("transpose",    rules.transpose);

        rack.setMidiRules (partId, rules);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "importScalaTuning")
    {
        const auto text = payload.getProperty ("text", {}).toString();
        if (text.isEmpty() || text.getNumBytesAsUTF8() > 1024 * 1024)
        {
            emitError (text.isEmpty() ? "That Scala file is empty."
                                      : "That Scala file is too large to be a tuning table.");
            return;
        }

        perf::Microtuning parsed;
        juce::String error;
        if (! perf::scalaTuningFromText (text,
                                         payload.getProperty ("sourceName", {}).toString(),
                                         parsed, error))
        {
            emitError (error);
            return;
        }

        auto& tuning = const_cast<Performance&> (rack.getPerformance()).microtuning;
        // Import replaces the scale, not the user's rig addressing and concert-pitch setup.
        parsed.rootMidiNote = tuning.rootMidiNote;
        parsed.referenceMidiNote = tuning.referenceMidiNote;
        parsed.referenceFrequency = tuning.referenceFrequency;
        parsed.mtsDeviceId = tuning.mtsDeviceId;
        parsed.mtsProgram = tuning.mtsProgram;
        tuning = std::move (parsed);
        microtuningErrors.clear();
        sendMicrotuningToEnabledParts();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "resetMicrotuning")
    {
        auto& tuning = const_cast<Performance&> (rack.getPerformance()).microtuning;
        const auto deviceId = tuning.mtsDeviceId;
        const auto program = tuning.mtsProgram;
        tuning = perf::Microtuning::equalTemperament();
        tuning.mtsDeviceId = deviceId;
        tuning.mtsProgram = program;
        microtuningErrors.clear();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setMicrotuning")
    {
        auto& tuning = const_cast<Performance&> (rack.getPerformance()).microtuning;
        if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("enabled"))
                tuning.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("name"))
                tuning.name = payload["name"].toString().trim().substring (0, 80);
            if (fields->hasProperty ("rootMidiNote"))
                tuning.rootMidiNote = juce::jlimit (0, 127, (int) payload["rootMidiNote"]);
            if (fields->hasProperty ("referenceMidiNote"))
                tuning.referenceMidiNote = juce::jlimit (0, 127, (int) payload["referenceMidiNote"]);
            if (fields->hasProperty ("referenceFrequency"))
                tuning.referenceFrequency = juce::jlimit (1.0, 40000.0,
                                                          (double) payload["referenceFrequency"]);
            if (fields->hasProperty ("mtsDeviceId"))
                tuning.mtsDeviceId = juce::jlimit (0, 127, (int) payload["mtsDeviceId"]);
            if (fields->hasProperty ("mtsProgram"))
                tuning.mtsProgram = juce::jlimit (0, 127, (int) payload["mtsProgram"]);
        }

        if (tuning.name.isEmpty())
            tuning.name = "Untitled tuning";
        microtuningErrors.clear();
        if (tuning.enabled)
            sendMicrotuningToEnabledParts();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setPartMicrotuning")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        auto* part = const_cast<Performance&> (rack.getPerformance()).findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        part->microtuningEnabled = (bool) payload.getProperty ("enabled", false);
        microtuningErrors.erase (partId);
        if (part->microtuningEnabled && rack.getPerformance().microtuning.enabled)
            sendMicrotuningToPart (partId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "sendMicrotuning")
    {
        if (! rack.getPerformance().microtuning.enabled)
        {
            emitError ("Enable microtuning before sending its MTS table.");
            return;
        }

        const auto partId = payload.getProperty ("partId", {}).toString();
        if (partId.isNotEmpty())
        {
            if (rack.getPerformance().findPart (partId) == nullptr)
            {
                emitError ("Unknown rack part.");
                return;
            }
            sendMicrotuningToPart (partId);
        }
        else
        {
            sendMicrotuningToEnabledParts();
        }
        emitState();
        return;
    }

    if (cmd == "setPartMixer")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (rack.getPerformance().findPart (partId) == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        const auto* fields = payload.getDynamicObject();
        if (fields != nullptr)
        {
            if (fields->hasProperty ("enabled")) rack.setEnabled (partId, (bool)  payload["enabled"]);
            if (fields->hasProperty ("mute"))    rack.setMute    (partId, (bool)  payload["mute"]);
            if (fields->hasProperty ("solo"))    rack.setSolo    (partId, (bool)  payload["solo"]);
            if (fields->hasProperty ("volume"))
            {
                const auto value = (float) (double) payload["volume"] * 0.5f;
                writeTargetBaseValue (partId, "@gain", value);
                recordGestureValue (partId, "@gain", value);
            }
            if (fields->hasProperty ("pan"))
            {
                const auto value = ((float) (double) payload["pan"] + 1.0f) * 0.5f;
                writeTargetBaseValue (partId, "@pan", value);
                recordGestureValue (partId, "@pan", value);
            }
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "loadInstrument")
    {
        auto partId = payload.getProperty ("partId", {}).toString();
        const auto ceId = payload.getProperty ("ceId", {}).toString();

        // No part named means "into a new part". The first thing anyone does with an empty
        // rack is click Load on an instrument, and the old contract made that click silently
        // do nothing until a part existed — a hidden prerequisite nobody asked for. An
        // explicit-but-unknown id is still an error: that is a stale UI, not an intention.
        if (partId.isEmpty())
        {
            partId = rack.addPart();
            rack.focusPart (partId);
        }

        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        if (part->hardware)
        {
            emitError ("That part is a hardware instrument — clear that first.");
            return;
        }

        // A plain instrument load starts from the plug-in's own default, so the preset
        // cursor clears — the walk starts at the top, and no stale name is displayed.
        rack.setPartLastPreset (partId, {}, {});
        requestInstrument (partId, ceId);
        return;
    }

    if (cmd == "unloadInstrument")
    {
        if (! rack.unloadInstrument (payload.getProperty ("partId", {}).toString()))
        {
            emitError ("That part has no instrument to unload.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "panic")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (partId.isEmpty())
            rack.panicAll();
        else if (rack.getPerformance().findPart (partId) != nullptr)
            rack.panicPart (partId);
        else
            emitError ("Unknown rack part.");
        return;
    }

    if (cmd == "getParameters")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto it = partParameters.find (partId);
        const auto* part = rack.getPerformance().findPart (partId);
        if (it == partParameters.end() && part == nullptr)
        {
            emitError ("That part has no instrument loaded.");
            return;
        }

        juce::Array<juce::var> parameters;
        if (it != partParameters.end())
        {
            const auto& processorParams = targetProcessor (partId)->getParameters();
            for (const auto& d : it->second.inventory.descriptors)
            {
                auto* parameter = processorParams[d.index];
                auto* obj = new juce::DynamicObject();
                obj->setProperty ("id",           d.definitionId);
                obj->setProperty ("index",        d.index);
                obj->setProperty ("name",         d.name);
                obj->setProperty ("label",        d.label);
                obj->setProperty ("group",        d.group);
                obj->setProperty ("value",        parameter->getValue());
                obj->setProperty ("text",         parameter->getCurrentValueAsText());
                obj->setProperty ("defaultValue", d.defaultValue);
                obj->setProperty ("numSteps",     d.numSteps);
                obj->setProperty ("discrete",     d.discrete);
                // For a small discrete set, the label of every position — what turns 0/1/2
                // into Saw/Square/Sine on a segmented control. Larger sets keep the payload
                // lean and step through texts live instead.
                if (d.discrete && d.numSteps > 1 && d.numSteps <= 16)
                {
                    juce::Array<juce::var> texts;
                    for (int stepIndex = 0; stepIndex < d.numSteps; ++stepIndex)
                        texts.add (parameter->getText (
                            (float) stepIndex / (float) (d.numSteps - 1), 64));
                    obj->setProperty ("valueTexts", texts);
                }
                obj->setProperty ("boolean",      d.boolean);
                obj->setProperty ("automatable",  d.automatable);
                obj->setProperty ("meta",         d.metaParameter);
                parameters.add (juce::var (obj));
            }
        }

        // A rack part also answers with its mixer addresses — level, pan, one send per
        // return — so pages, macros and hardware reach the mixer through the same registry
        // the plug-in rows use. An empty or hardware part has exactly these.
        if (part != nullptr)
        {
            juce::StringArray ids { "@gain", "@pan" };
            for (const auto& chain : rack.getPerformance().returns)
                ids.add ("@send:" + chain.returnId);

            for (const auto& id : ids)
            {
                auto* obj = new juce::DynamicObject();
                obj->setProperty ("id",           id);
                obj->setProperty ("index",        -1);
                obj->setProperty ("name",         virtualParameterName (partId, id));
                obj->setProperty ("label",        juce::String());
                obj->setProperty ("group",        "Mixer");
                obj->setProperty ("value",        virtualParameterValue (partId, id));
                obj->setProperty ("text",         virtualParameterText (partId, id));
                obj->setProperty ("defaultValue", virtualParameterDefault (id));
                obj->setProperty ("numSteps",     0);
                obj->setProperty ("discrete",     false);
                obj->setProperty ("boolean",      false);
                obj->setProperty ("automatable",  true);
                obj->setProperty ("meta",         false);
                parameters.add (juce::var (obj));
            }
        }

        juce::Array<juce::var> warnings;
        if (it != partParameters.end())
            for (const auto& w : it->second.inventory.warnings)
                warnings.add (w);

        loadParameterFavourites();
        juce::Array<juce::var> favourites;
        if (const auto found = parameterFavourites.find (targetClassCeId (partId));
            found != parameterFavourites.end())
            for (const auto& id : found->second)
                favourites.add (id);

        auto* root = new juce::DynamicObject();
        root->setProperty ("partId", partId);
        root->setProperty ("parameters", parameters);
        root->setProperty ("warnings", warnings);
        root->setProperty ("favourites", favourites);
        // What was last reached for in the plug-in's own window, so the list can offer it
        // before anybody types. Carried here as well as on the change events, because opening
        // the list is exactly when you want yesterday's shortlist.
        juce::Array<juce::var> touchedVars;
        if (const auto found = touchedParametersByTarget.find (partId);
            found != touchedParametersByTarget.end())
            for (const auto& id : found->second)
                touchedVars.add (id);
        root->setProperty ("touched", touchedVars);
        if (options.emit != nullptr)
            options.emit ("instrumentHostParameters", juce::var (root));
        return;
    }

    if (cmd == "setParameter" || cmd == "resetParameter"
        || cmd == "beginParameterGesture" || cmd == "endParameterGesture")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto id = payload.getProperty ("id", {}).toString();

        // Remembered so the drain can tell OUR write from the user's hand on the plug-in's own
        // knob. Both arrive as the same change event; only one of them answers "which
        // parameter did you just reach for", and a list full of whatever you last dragged in
        // CEditor is a list nobody needs.
        if (cmd == "setParameter" || cmd == "resetParameter")
            parametersWrittenByUs.addIfNotAlreadyThere (id);

        if (isVirtualParameterId (id))
        {
            if (! virtualParameterExists (partId, id))
            {
                emitError ("Unknown parameter " + id + " on that part.");
                return;
            }

            // A mixer value has no plug-in host to notify, but begin still samples the value
            // for the gesture recorder so the curve starts where the hand picked it up.
            if (cmd == "setParameter")
            {
                writeTargetBaseValue (partId, id, juce::jlimit (0.0f, 1.0f,
                                      (float) (double) payload.getProperty ("value", 0.0)));
                recordGestureValue (partId, id, virtualParameterValue (partId, id));
            }
            else if (cmd == "resetParameter")
            {
                writeTargetBaseValue (partId, id, virtualParameterDefault (id));
                recordGestureValue (partId, id, virtualParameterValue (partId, id));
            }
            else if (cmd == "beginParameterGesture")
            {
                recordGestureValue (partId, id, virtualParameterValue (partId, id));
                return;
            }
            else
                return;

            savePerformance();
            emitState();
            return;
        }

        auto* parameter = resolveParameter (partId, id);
        if (parameter == nullptr)
        {
            // A stale binding or a wrong-instance command is refused, never routed to some
            // other parameter index (baseline §18.4.5).
            emitError ("Unknown parameter " + id + " on that part.");
            return;
        }

        if (cmd == "setParameter")
        {
            writeTargetBaseValue (partId, id,
                                  juce::jlimit (0.0f, 1.0f,
                                                (float) (double) payload.getProperty ("value", 0.0)));
            recordGestureValue (partId, id, parameter->getValue());
        }
        else if (cmd == "resetParameter")
        {
            writeTargetBaseValue (partId, id, parameter->getDefaultValue());
            recordGestureValue (partId, id, parameter->getValue());
        }
        else if (cmd == "beginParameterGesture")
        {
            parameter->beginChangeGesture();
            recordGestureValue (partId, id, parameter->getValue());
        }
        else
        {
            parameter->endChangeGesture();
            for (const auto& route : rack.getPerformance().modulationRoutes)
                if (route.targetId == partId && route.parameterId == id)
                {
                    savePerformance();
                    emitState();
                    break;
                }
        }
        return;
    }

    if (cmd == "setParameterText")
    {
        // Typed entry: "440", "-12 dB", "Sine" — the PLUG-IN parses its own text, because
        // only it knows what its numbers mean. getValueForText is part of the parameter
        // contract; a parameter that cannot parse simply lands where it lands, exactly as
        // it would in any DAW's typed-entry field.
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto id = payload.getProperty ("id", {}).toString();
        const auto text = payload.getProperty ("text", {}).toString().trim();

        if (isVirtualParameterId (id))
        {
            // Virtual addresses are plain 0..1 numbers; parse locally and refuse nonsense.
            if (! virtualParameterExists (partId, id))
            {
                emitError ("Unknown parameter " + id + " on that part.");
                return;
            }
            if (! text.containsAnyOf ("0123456789"))
            {
                emitError ("Not a number: " + text);
                return;
            }
            writeTargetBaseValue (partId, id, juce::jlimit (0.0f, 1.0f, text.getFloatValue()));
            recordGestureValue (partId, id, virtualParameterValue (partId, id));
            savePerformance();
            emitState();
            return;
        }

        auto* parameter = resolveParameter (partId, id);
        if (parameter == nullptr)
        {
            emitError ("Unknown parameter " + id + " on that part.");
            return;
        }

        parameter->beginChangeGesture();
        parametersWrittenByUs.addIfNotAlreadyThere (id);
        writeTargetBaseValue (partId, id,
                              juce::jlimit (0.0f, 1.0f, parameter->getValueForText (text)));
        recordGestureValue (partId, id, parameter->getValue());
        parameter->endChangeGesture();
        for (const auto& route : rack.getPerformance().modulationRoutes)
            if (route.targetId == partId && route.parameterId == id)
            {
                savePerformance();
                emitState();
                break;
            }
        return;
    }

    if (cmd == "addControlPage")
    {
        const auto name = payload.getProperty ("name", {}).toString().trim();
        rack.addControlPage (name.isNotEmpty() ? name
                                               : "Page " + juce::String (rack.getPerformance().pages.size() + 1));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeControlPage" || cmd == "renameControlPage")
    {
        const auto pageId = payload.getProperty ("pageId", {}).toString();
        const auto ok = cmd == "removeControlPage"
                          ? rack.removeControlPage (pageId)
                          : rack.renameControlPage (pageId, payload.getProperty ("name", {}).toString().trim());
        if (! ok)
        {
            emitError ("Unknown control page.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "assignControlSlot")
    {
        const auto pageId = payload.getProperty ("pageId", {}).toString();
        const auto slotId = payload.getProperty ("slotId", {}).toString();
        const auto partId = payload.getProperty ("partId", {}).toString();   // any target id
        const auto parameterId = payload.getProperty ("parameterId", {}).toString();

        if (! targetParameterExists (partId, parameterId))
        {
            // Assignment needs the live address: for a plug-in parameter the registry proves
            // the id and whose class the binding captures; for a virtual one the rack itself
            // does. Parts, effects, mixer values and macros alike.
            emitError ("Unknown parameter " + parameterId + " on that target.");
            return;
        }

        ControlBinding binding;
        binding.partId = partId;
        binding.pluginCeId = targetClassCeId (partId);
        binding.parameterId = parameterId;

        if (! rack.setSlotBinding (pageId, slotId, std::move (binding)))
        {
            emitError ("Unknown control slot.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "assignSurfaceControl" || cmd == "learnSurfaceControl")
    {
        // The drawing's own commands: name the control, not the slot. A fader or a pad gets
        // its slot minted here the first time; from then on it is an ordinary slot and
        // everything that works on one — options, clear, learn, value — works on it.
        auto pageId = payload.getProperty ("pageId", {}).toString();
        const auto kind = payload.getProperty ("kind", {}).toString();
        const auto index = (int) payload.getProperty ("index", -1);

        // No page yet is not a reason to refuse a drop on the drawing: the first thing put
        // on the surface mints the page it lands on, as quickLearnParameter mints one when
        // every slot is taken. Named for where it came from, so it reads as what it is.
        if (pageId.isEmpty() && rack.getPerformance().pages.isEmpty())
        {
            auto* mint = new juce::DynamicObject();
            mint->setProperty ("cmd", "addControlPage");
            mint->setProperty ("name", "Surface");
            handleCommand (juce::var (mint));
        }
        if (pageId.isEmpty() && ! rack.getPerformance().pages.isEmpty())
            pageId = rack.getPerformance().pages.getReference (0).pageId;

        const auto slotId = rack.ensureSurfaceSlot (pageId, kind, index);
        if (slotId.isEmpty())
        {
            emitError (rack.getPerformance().findPage (pageId) == nullptr
                         ? "Unknown control page."
                         : "CEditor does not address that control (" + kind + " "
                             + juce::String (index) + ").");
            return;
        }

        auto* forwarded = new juce::DynamicObject();
        forwarded->setProperty ("cmd", cmd == "assignSurfaceControl" ? "assignControlSlot"
                                                                      : "learnControlSlotMidi");
        forwarded->setProperty ("pageId", pageId);
        forwarded->setProperty ("slotId", slotId);
        forwarded->setProperty ("partId", payload.getProperty ("partId", {}));
        forwarded->setProperty ("parameterId", payload.getProperty ("parameterId", {}));
        handleCommand (juce::var (forwarded));
        refreshSlotNoteListening();
        return;
    }

    if (cmd == "quickLearnParameter")
    {
        // The two-click knob: find this parameter a slot (first empty anywhere, or a fresh
        // "MIDI" page when every slot is taken), bind it, and arm MIDI learn on that slot —
        // one gesture from "I found the parameter" to "wiggle the knob you want". Atomic
        // here because the web cannot chain create-assign-arm across async state pushes.
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto parameterId = payload.getProperty ("parameterId", {}).toString();

        if (! targetParameterExists (partId, parameterId))
        {
            emitError ("Unknown parameter " + parameterId + " on that target.");
            return;
        }

        juce::String pageId, slotId;
        for (const auto& page : rack.getPerformance().pages)
        {
            for (const auto& slot : page.slots)
                if (slot.binding.isEmpty())
                {
                    pageId = page.pageId;
                    slotId = slot.slotId;
                    break;
                }
            if (slotId.isNotEmpty())
                break;
        }
        if (slotId.isEmpty())
        {
            pageId = rack.addControlPage ("MIDI");
            slotId = "s1";
        }

        ControlBinding binding;
        binding.partId = partId;
        binding.pluginCeId = targetClassCeId (partId);
        binding.parameterId = parameterId;
        rack.setSlotBinding (pageId, slotId, std::move (binding));

        midiLearnPageId = pageId;
        midiLearnSlotId = slotId;
        {   // Armed means the NEXT movement binds, same as the slot row's own learn.
            const std::scoped_lock lock (midiActivityLock);
            pendingCcs.clear();
        }
        savePerformance();
        emitState();
        emitMidiLearn (true, pageId, slotId, -1, 0);
        return;
    }

    if (cmd == "generateControlPages")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto it = partParameters.find (partId);
        const auto* part = rack.getPerformance().findPart (partId);
        if (it == partParameters.end() || part == nullptr)
        {
            emitError ("That part has no instrument loaded.");
            return;
        }

        // Regeneration replaces exactly this part's generated pages; user-authored pages
        // and other parts' generated pages are never touched (baseline §18.5.7).
        for (int i = rack.getPerformance().pages.size(); --i >= 0;)
        {
            const auto& page = rack.getPerformance().pages.getReference (i);
            if (page.generated && page.generatedForPartId == partId)
                rack.removeControlPage (page.pageId);
        }

        auto generated = generateControlPages (partId, part->pluginCeId,
                                               part->pluginName, it->second.inventory);
        if (generated.isEmpty())
        {
            emitError ("This instrument exposes nothing suitable for automatic pages.");
            emitState();
            return;
        }

        for (auto& page : generated)
            rack.adoptControlPage (std::move (page));

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "clearControlSlot")
    {
        if (! rack.setSlotBinding (payload.getProperty ("pageId", {}).toString(),
                                   payload.getProperty ("slotId", {}).toString(), {}))
        {
            emitError ("Unknown control slot.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setControlSlotOptions")
    {
        const auto pageId = payload.getProperty ("pageId", {}).toString();
        const auto slotId = payload.getProperty ("slotId", {}).toString();
        const auto* page = rack.getPerformance().findPage (pageId);
        const auto* slot = page != nullptr ? page->findSlot (slotId) : nullptr;
        if (slot == nullptr)
        {
            emitError ("Unknown control slot.");
            return;
        }

        auto binding = slot->binding;   // absent fields keep their value, like setPartMixer
        const auto* fields = payload.getDynamicObject();
        if (fields != nullptr)
        {
            if (fields->hasProperty ("rangeMin")) binding.rangeMin = juce::jlimit (0.0f, 1.0f, (float) (double) payload["rangeMin"]);
            if (fields->hasProperty ("rangeMax")) binding.rangeMax = juce::jlimit (0.0f, 1.0f, (float) (double) payload["rangeMax"]);
            if (fields->hasProperty ("inverted")) binding.inverted = (bool) payload["inverted"];
            if (fields->hasProperty ("bipolar"))  binding.bipolar  = (bool) payload["bipolar"];
            if (fields->hasProperty ("toggle"))   binding.toggle   = (bool) payload["toggle"];
            if (fields->hasProperty ("label"))    binding.label    = payload["label"].toString().trim();
        }

        rack.setSlotBinding (pageId, slotId, std::move (binding));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setControlSlotValue")
    {
        const auto* page = rack.getPerformance().findPage (payload.getProperty ("pageId", {}).toString());
        const auto* slot = page != nullptr
                             ? page->findSlot (payload.getProperty ("slotId", {}).toString())
                             : nullptr;
        if (slot == nullptr || slot->binding.isEmpty())
        {
            emitError ("That control slot is not assigned.");
            return;
        }
        if (! bindingResolves (slot->binding))
        {
            // The unresolved case, refused rather than retargeted (baseline §18.4.7): the
            // part no longer carries what this slot was assigned against.
            emitError ("That control slot's binding is unresolved.");
            return;
        }

        writeMappedBinding (slot->binding,
                            juce::jlimit (0.0f, 1.0f,
                                          (float) (double) payload.getProperty ("value", 0.0)));
        const auto sourceValue = juce::jlimit (0.0f, 1.0f,
                                               (float) (double) payload.getProperty ("value", 0.0));
        const auto positioned = slot->binding.inverted ? 1.0f - sourceValue : sourceValue;
        recordGestureValue (slot->binding.partId, slot->binding.parameterId,
                            slot->binding.rangeMin
                              + positioned * (slot->binding.rangeMax - slot->binding.rangeMin));

        // A virtual write changed the manifest itself (a fader, a send, a macro), so it
        // persists and re-announces; a plug-in write is captured by the next save as ever.
        if (isVirtualParameterId (slot->binding.parameterId))
        {
            savePerformance();
            emitState();
        }
        return;
    }

    // Learn a PARAMETER rather than a controller: arm a slot, then move the control in the
    // plug-in's own window. Deliberately the same shape as learnControlSlotMidi below, because
    // it is the same idea pointed at the other side of the binding — and a user who has met
    // one should not have to learn the other.
    // The dozen you reach for on this synth every time, marked once and remembered per CLASS.
    // Not per part and not per session: it is a fact about the plug-in, not about today's rack.
    if (cmd == "toggleParameterFavourite")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto parameterId = payload.getProperty ("parameterId", {}).toString();
        const auto ceId = targetClassCeId (partId);

        if (ceId.isEmpty() || ! targetParameterExists (partId, parameterId))
        {
            emitError ("Unknown parameter " + parameterId + " on that target.");
            return;
        }

        loadParameterFavourites();
        auto& ids = parameterFavourites[ceId];
        if (ids.contains (parameterId))
            ids.removeString (parameterId);
        else
            ids.add (parameterId);

        saveParameterFavourites();

        // Re-answer with the registry rather than emitting a favourites-only event: the list
        // is rendered from one payload, and a second source for one field is a second thing
        // to keep in step.
        auto* again = new juce::DynamicObject();
        again->setProperty ("cmd", "getParameters");
        again->setProperty ("partId", partId);
        handleCommand (juce::var (again));
        return;
    }

    if (cmd == "learnControlSlotParameter")
    {
        const auto pageId = payload.getProperty ("pageId", {}).toString();
        const auto slotId = payload.getProperty ("slotId", {}).toString();
        const auto* page = rack.getPerformance().findPage (pageId);
        if (page == nullptr || page->findSlot (slotId) == nullptr)
        {
            emitError ("Unknown control slot.");
            return;
        }

        parameterLearnPageId = pageId;
        parameterLearnSlotId = slotId;
        // Armed means the NEXT movement binds. Anything already queued was moved before the
        // click and is not what was meant by it.
        for (auto& [targetId, sync] : partParameters)
        {
            juce::SortedSet<int> stale;
            juce::Array<PartParameterSync::Gesture> staleGestures;
            if (sync.sync != nullptr)
                sync.sync->drain (stale, staleGestures);
        }
        emitParameterLearn (true, pageId, slotId, {});
        return;
    }

    if (cmd == "cancelLearnControlSlotParameter")
    {
        const auto pageId = std::exchange (parameterLearnPageId, {});
        const auto slotId = std::exchange (parameterLearnSlotId, {});
        emitParameterLearn (false, pageId, slotId, {});
        return;
    }

    if (cmd == "learnControlSlotMidi")
    {
        const auto pageId = payload.getProperty ("pageId", {}).toString();
        const auto slotId = payload.getProperty ("slotId", {}).toString();
        const auto* page = rack.getPerformance().findPage (pageId);
        if (page == nullptr || page->findSlot (slotId) == nullptr)
        {
            emitError ("Unknown control slot.");
            return;
        }

        midiLearnPageId = pageId;
        midiLearnSlotId = slotId;
        {   // Armed means the NEXT movement binds — not one still queued from before the click.
            const std::scoped_lock lock (midiActivityLock);
            pendingCcs.clear();
        }
        emitMidiLearn (true, pageId, slotId, -1, 0);
        return;
    }

    if (cmd == "cancelMidiLearn")
    {
        midiLearnPageId.clear();
        midiLearnSlotId.clear();
        emitMidiLearn (false, {}, {}, -1, 0);
        return;
    }

    if (cmd == "clearControlSlotMidi")
    {
        if (! rack.setSlotMidi (payload.getProperty ("pageId", {}).toString(),
                                payload.getProperty ("slotId", {}).toString(), -1, 0))
        {
            emitError ("Unknown control slot.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "getHostProject")
    {
        ensureHostProject();
        emitHostProject();
        return;
    }

    if (cmd == "setHostProject")
    {
        ensureHostProject();

        // Only the authored fields merge; the appId never does. Installer identity is minted
        // once and survives every rename — Inno treats a changed AppId as a different product,
        // which is exactly the upgrade-breaks-into-two-installs bug this rule prevents.
        auto* project = hostProject.getDynamicObject();
        const auto* fields = payload.getDynamicObject();
        if (project != nullptr && fields != nullptr)
        {
            for (const auto* key : { "productName", "version", "publisher" })
                if (fields->hasProperty (key))
                    project->setProperty (key, payload.getProperty (key, {}).toString().trim());
            for (const auto* key : { "includeStandalone", "includeVst3" })
                if (fields->hasProperty (key))
                    project->setProperty (key, (bool) payload.getProperty (key, true));
        }

        hostProjectFile().replaceWithText (juce::JSON::toString (hostProject));
        emitHostProject();
        return;
    }

    if (cmd == "buildHostProduct")
    {
        ensureHostProject();

        if (options.runBuild == nullptr)
        {
            emitError ("Building is not available in this build.");
            return;
        }

        const auto name = hostProject.getProperty ("productName", {}).toString().trim();
        if (name.isEmpty())
        {
            emitError ("The Host Project needs a product name before it can build.");
            return;
        }
        if (! (bool) hostProject.getProperty ("includeStandalone", true)
            && ! (bool) hostProject.getProperty ("includeVst3", true))
        {
            emitError ("The Host Project has no targets enabled — nothing to build.");
            return;
        }

        options.runBuild (hostProject, payload.getProperty ("outputDirectory", {}).toString());
        return;
    }

    if (cmd == "addEffect")
    {
        const auto chainId = payload.getProperty ("chainId", {}).toString();
        const auto ceId = payload.getProperty ("ceId", {}).toString();

        const auto effectId = rack.addEffectSlot (chainId);
        if (effectId.isEmpty())
        {
            emitError ("Unknown effect chain.");
            return;
        }

        requestEffect (effectId, ceId);
        return;
    }

    if (cmd == "removeEffect")
    {
        if (! rack.removeEffectSlot (payload.getProperty ("effectId", {}).toString()))
        {
            emitError ("Unknown effect.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "moveEffect")
    {
        if (! rack.moveEffectSlot (payload.getProperty ("effectId", {}).toString(),
                                   (int) payload.getProperty ("index", 0)))
        {
            emitError ("Unknown effect.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setEffectBypassed")
    {
        if (! rack.setEffectBypassed (payload.getProperty ("effectId", {}).toString(),
                                      (bool) payload.getProperty ("bypassed", false)))
        {
            emitError ("Unknown effect.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "openEffectEditor")
    {
        const auto effectId = payload.getProperty ("effectId", {}).toString();
        if (rack.getEffect (effectId) == nullptr)
        {
            emitError ("That effect is not loaded.");
            return;
        }

        showEditorForEffect (effectId);
        emitState();
        return;
    }

    if (cmd == "addLayerGroup" || cmd == "removeLayerGroup" || cmd == "setLayerGroup"
        || cmd == "addLayerMember" || cmd == "removeLayerMember" || cmd == "setLayerMember")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto groupId = payload.getProperty ("layerGroupId", {}).toString();
        const auto findGroup = [&performance] (const juce::String& id) -> LayerGroup*
        {
            for (auto& group : performance.layerGroups)
                if (group.layerGroupId == id)
                    return &group;
            return nullptr;
        };
        const auto partClaimed = [&performance] (const juce::String& partId,
                                                  const juce::String& exceptGroupId)
        {
            for (const auto& group : performance.layerGroups)
                if (group.layerGroupId != exceptGroupId)
                    for (const auto& member : group.members)
                        if (member.partId == partId)
                            return true;
            return false;
        };
        const auto canAddPart = [&performance, &partClaimed] (const juce::String& partId,
                                                              const juce::String& exceptGroupId)
        {
            const auto* part = performance.findPart (partId);
            return part != nullptr && part->midiSourcePartId.isEmpty()
                   && ! partClaimed (partId, exceptGroupId);
        };

        if (cmd == "addLayerGroup")
        {
            if (performance.layerGroups.size() >= LayerRouter::maxGroups)
            {
                emitError ("The layer-group limit has been reached.");
                return;
            }

            juce::StringArray requested;
            if (const auto* ids = payload.getProperty ("partIds", {}).getArray())
                for (const auto& id : *ids)
                    if (! requested.contains (id.toString()))
                        requested.add (id.toString());
            if (requested.isEmpty())
                for (const auto& part : performance.parts)
                    if (canAddPart (part.partId, {}) && requested.size() < 2)
                        requested.add (part.partId);

            LayerGroup group;
            group.layerGroupId = juce::Uuid().toDashedString();
            group.name = payload.getProperty (
                "name", "Layer " + juce::String (performance.layerGroups.size() + 1))
                             .toString().trim().substring (0, 80);
            for (const auto& partId : requested)
                if (canAddPart (partId, {}) && group.members.size() < LayerRouter::maxMembers)
                    group.members.add ({ partId, 0.0f, 1.0f, 0.0f });

            if (group.members.size() < 2)
            {
                emitError ("A layer group needs two available keyboard parts.");
                return;
            }
            performance.layerGroups.add (std::move (group));
        }
        else
        {
            auto* group = findGroup (groupId);
            if (group == nullptr)
            {
                emitError ("Unknown layer group.");
                return;
            }

            if (cmd == "removeLayerGroup")
            {
                for (int i = performance.layerGroups.size(); --i >= 0;)
                    if (performance.layerGroups.getReference (i).layerGroupId == groupId)
                        performance.layerGroups.remove (i);
            }
            else if (cmd == "setLayerGroup")
            {
                auto updated = *group;
                const auto* fields = payload.getDynamicObject();
                if (fields != nullptr)
                {
                    if (fields->hasProperty ("name"))
                        updated.name = payload["name"].toString().trim().substring (0, 80);
                    if (fields->hasProperty ("enabled"))
                        updated.enabled = (bool) payload["enabled"];
                    if (fields->hasProperty ("allocation"))
                    {
                        const auto allocation = payload["allocation"].toString();
                        static const juce::StringArray valid { "all", "roundRobin", "leastBusy" };
                        if (! valid.contains (allocation))
                        {
                            emitError ("Unknown layer allocation mode.");
                            return;
                        }
                        updated.allocation = allocation;
                    }
                    if (fields->hasProperty ("source"))
                    {
                        const auto source = payload["source"].toString();
                        static const juce::StringArray valid {
                            "velocity", "key", "cc", "expression", "macro"
                        };
                        if (! valid.contains (source))
                        {
                            emitError ("Unknown layer source.");
                            return;
                        }
                        updated.source = source;
                    }
                    if (fields->hasProperty ("controller"))
                        updated.controller = juce::jlimit (0, 127, (int) payload["controller"]);
                    if (fields->hasProperty ("macroId"))
                        updated.macroId = payload["macroId"].toString();
                }
                if (updated.source == "macro"
                    && performance.findMacro (updated.macroId) == nullptr)
                {
                    emitError ("Choose an existing macro for this layer.");
                    return;
                }
                if (updated.source != "macro")
                    updated.macroId.clear();
                *group = std::move (updated);
            }
            else
            {
                const auto partId = payload.getProperty ("partId", {}).toString();
                if (cmd == "addLayerMember")
                {
                    if (group->members.size() >= LayerRouter::maxMembers)
                    {
                        emitError ("A layer group can contain at most eight parts.");
                        return;
                    }
                    if (! canAddPart (partId, groupId))
                    {
                        emitError ("That part is unavailable or already belongs to a layer.");
                        return;
                    }
                    for (const auto& member : group->members)
                        if (member.partId == partId)
                        {
                            emitError ("That part is already in this layer.");
                            return;
                        }
                    group->members.add ({ partId, 0.0f, 1.0f, 0.0f });
                }
                else
                {
                    int memberIndex = -1;
                    for (int i = 0; i < group->members.size(); ++i)
                        if (group->members.getReference (i).partId == partId)
                            memberIndex = i;
                    if (memberIndex < 0)
                    {
                        emitError ("That part is not in this layer.");
                        return;
                    }

                    if (cmd == "removeLayerMember")
                    {
                        group->members.remove (memberIndex);
                        if (group->members.size() < 2)
                            for (int i = performance.layerGroups.size(); --i >= 0;)
                                if (performance.layerGroups.getReference (i).layerGroupId == groupId)
                                    performance.layerGroups.remove (i);
                    }
                    else
                    {
                        auto& member = group->members.getReference (memberIndex);
                        const auto* fields = payload.getDynamicObject();
                        if (fields != nullptr && fields->hasProperty ("minimum"))
                            member.minimum = juce::jlimit (
                                0.0f, 1.0f, (float) (double) payload["minimum"]);
                        if (fields != nullptr && fields->hasProperty ("maximum"))
                            member.maximum = juce::jlimit (
                                0.0f, 1.0f, (float) (double) payload["maximum"]);
                        if (member.minimum > member.maximum)
                            std::swap (member.minimum, member.maximum);
                        if (fields != nullptr && fields->hasProperty ("crossfade"))
                            member.crossfade = juce::jlimit (
                                0.0f, 0.5f, (float) (double) payload["crossfade"]);
                    }
                }
            }
        }

        rack.refreshLayerRouting();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addMacro")
    {
        const auto name = payload.getProperty ("name", {}).toString().trim();
        rack.addMacro (name.isNotEmpty() ? name
                                         : "Macro " + juce::String (rack.getPerformance().macros.size() + 1));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeMacro")
    {
        const auto macroId = payload.getProperty ("macroId", {}).toString();
        if (! rack.removeMacro (macroId))
        {
            emitError ("Unknown macro.");
            return;
        }
        for (auto& group : const_cast<Performance&> (rack.getPerformance()).layerGroups)
            if (group.source == "macro" && group.macroId == macroId)
            {
                group.source = "velocity";
                group.macroId.clear();
            }
        rack.refreshLayerRouting();
        juce::StringArray targets;
        for (const auto& route : rack.getPerformance().modulationRoutes)
            if (route.sourceType == "macro" && route.sourceId == macroId)
            {
                const auto key = route.targetId + "\n" + route.parameterId;
                if (! targets.contains (key))
                    targets.add (key);
            }
        for (const auto& key : targets)
            applyModulationTarget (key.upToFirstOccurrenceOf ("\n", false, false),
                                   key.fromFirstOccurrenceOf ("\n", false, false));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "renameMacro")
    {
        auto* macro = rack.findMutableMacro (payload.getProperty ("macroId", {}).toString());
        if (macro == nullptr)
        {
            emitError ("Unknown macro.");
            return;
        }
        macro->name = payload.getProperty ("name", {}).toString().trim();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setMacroValue")
    {
        auto* macro = rack.findMutableMacro (payload.getProperty ("macroId", {}).toString());
        if (macro == nullptr)
        {
            emitError ("Unknown macro.");
            return;
        }

        writeTargetBaseValue (macro->macroId, "@macro",
                              juce::jlimit (0.0f, 1.0f,
                                            (float) (double) payload.getProperty ("value", 0.0)));
        recordGestureValue (macro->macroId, "@macro", macro->value);

        // Drags stay cheap: targets move now, persistence and the state re-announcement ride
        // the change-end (`final:true`) — or whatever mutation saves next.
        if ((bool) payload.getProperty ("final", false))
        {
            savePerformance();
            emitState();
        }
        return;
    }

    if (cmd == "addMacroTarget" || cmd == "removeMacroTarget" || cmd == "setMacroTargetOptions")
    {
        auto* macro = rack.findMutableMacro (payload.getProperty ("macroId", {}).toString());
        if (macro == nullptr)
        {
            emitError ("Unknown macro.");
            return;
        }

        const auto targetId = payload.getProperty ("targetId", {}).toString();
        const auto parameterId = payload.getProperty ("parameterId", {}).toString();

        if (cmd == "addMacroTarget")
        {
            // A macro driving a macro would be a loop dressed as a feature; page slots may
            // target macros, macros may not.
            if (parameterId == "@macro")
            {
                emitError ("A macro cannot target another macro.");
                return;
            }
            if (! targetParameterExists (targetId, parameterId))
            {
                emitError ("Unknown parameter " + parameterId + " on that target.");
                return;
            }

            ControlBinding target;
            target.partId = targetId;
            target.pluginCeId = targetClassCeId (targetId);
            target.parameterId = parameterId;
            bool exists = false;
            for (const auto& t : macro->targets)
                exists = exists || (t.partId == targetId && t.parameterId == parameterId);
            if (! exists)
                macro->targets.add (std::move (target));
        }
        else
        {
            for (int i = macro->targets.size(); --i >= 0;)
            {
                auto& target = macro->targets.getReference (i);
                if (target.partId != targetId || target.parameterId != parameterId)
                    continue;

                if (cmd == "removeMacroTarget")
                {
                    macro->targets.remove (i);
                }
                else
                {
                    const auto* fields = payload.getDynamicObject();
                    if (fields != nullptr)
                    {
                        if (fields->hasProperty ("rangeMin")) target.rangeMin = juce::jlimit (0.0f, 1.0f, (float) (double) payload["rangeMin"]);
                        if (fields->hasProperty ("rangeMax")) target.rangeMax = juce::jlimit (0.0f, 1.0f, (float) (double) payload["rangeMax"]);
                        if (fields->hasProperty ("inverted")) target.inverted = (bool) payload["inverted"];
                        if (target.rangeMin > target.rangeMax)
                            std::swap (target.rangeMin, target.rangeMax);
                    }
                }
                break;
            }
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addModulationRoute")
    {
        auto& routes = const_cast<Performance&> (rack.getPerformance()).modulationRoutes;
        if (routes.size() >= 128)
        {
            emitError ("The modulation matrix is full.");
            return;
        }

        ModulationRoute route;
        route.routeId = juce::Uuid().toDashedString();
        route.sourceType = payload.getProperty ("sourceType", {}).toString();
        route.sourceId = (route.sourceType == "macro" || route.sourceType == "lfo"
                          || route.sourceType == "envelope" || route.sourceType == "mseg"
                          || route.sourceType == "random")
                           ? payload.getProperty ("sourceId", {}).toString() : juce::String();
        route.sourceChannel = (route.sourceType == "macro" || route.sourceType == "lfo"
                               || route.sourceType == "envelope" || route.sourceType == "mseg"
                               || route.sourceType == "random") ? 0
          : juce::jlimit (0, 16, (int) payload.getProperty ("sourceChannel", 0));
        route.sourceNumber = (route.sourceType == "macro" || route.sourceType == "lfo"
                              || route.sourceType == "envelope" || route.sourceType == "mseg"
                              || route.sourceType == "random")
          ? 0 : juce::jlimit (0, 127, (int) payload.getProperty ("sourceNumber", 0));
        route.targetId = payload.getProperty ("targetId", {}).toString();
        route.parameterId = payload.getProperty ("parameterId", {}).toString();
        route.targetCeId = targetClassCeId (route.targetId);
        route.amount = juce::jlimit (-1.0f, 1.0f,
                                     (float) (double) payload.getProperty ("amount", 0.25));

        if (! validModulationSourceType (route.sourceType))
        {
            emitError ("Unknown modulation source.");
            return;
        }
        if (route.sourceType == "macro" && rack.getPerformance().findMacro (route.sourceId) == nullptr)
        {
            emitError ("Unknown macro source.");
            return;
        }
        if (route.sourceType == "lfo" && rack.getPerformance().findMidiLfo (route.sourceId) == nullptr)
        {
            emitError ("Unknown LFO source.");
            return;
        }
        if (route.sourceType == "envelope"
            && rack.getPerformance().findEnvelope (route.sourceId) == nullptr)
        {
            emitError ("Unknown envelope source.");
            return;
        }
        if (route.sourceType == "mseg" && rack.getPerformance().findMseg (route.sourceId) == nullptr)
        {
            emitError ("Unknown MSEG source.");
            return;
        }
        if (route.sourceType == "random"
            && rack.getPerformance().findRandomModulator (route.sourceId) == nullptr)
        {
            emitError ("Unknown random modulator source.");
            return;
        }
        if (route.parameterId == "@macro"
            && route.sourceType != "lfo" && route.sourceType != "envelope"
            && route.sourceType != "mseg" && route.sourceType != "random")
        {
            emitError ("Only a generator can target a macro.");
            return;
        }
        if (! targetParameterExists (route.targetId, route.parameterId))
        {
            emitError ("Unknown modulation destination.");
            return;
        }

        bool copiedBase = false;
        for (const auto& existing : routes)
            if (existing.targetId == route.targetId && existing.parameterId == route.parameterId)
            {
                route.baseValue = existing.baseValue;
                copiedBase = true;
                break;
            }
        if (! copiedBase)
            route.baseValue = isVirtualParameterId (route.parameterId)
                                ? virtualParameterValue (route.targetId, route.parameterId)
                                : resolveParameter (route.targetId, route.parameterId)->getValue();

        routes.add (route);
        applyModulationTarget (route.targetId, route.parameterId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setModulationRoute")
    {
        auto& routes = const_cast<Performance&> (rack.getPerformance()).modulationRoutes;
        ModulationRoute* route = nullptr;
        const auto routeId = payload.getProperty ("routeId", {}).toString();
        for (auto& candidate : routes)
            if (candidate.routeId == routeId)
            {
                route = &candidate;
                break;
            }
        if (route == nullptr)
        {
            emitError ("Unknown modulation route.");
            return;
        }

        auto updated = *route;
        const auto* fields = payload.getDynamicObject();
        if (fields != nullptr)
        {
            if (fields->hasProperty ("amount"))
                updated.amount = juce::jlimit (-1.0f, 1.0f, (float) (double) payload["amount"]);
            if (fields->hasProperty ("enabled"))
                updated.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("sourceChannel"))
                updated.sourceChannel = juce::jlimit (0, 16, (int) payload["sourceChannel"]);
            if (fields->hasProperty ("sourceNumber"))
                updated.sourceNumber = juce::jlimit (0, 127, (int) payload["sourceNumber"]);
            if (fields->hasProperty ("sourceType"))
            {
                const auto sourceType = payload["sourceType"].toString();
                if (! validModulationSourceType (sourceType))
                {
                    emitError ("Unknown modulation source.");
                    return;
                }
                updated.sourceType = sourceType;
                if (sourceType == "macro" || sourceType == "lfo" || sourceType == "envelope"
                    || sourceType == "mseg" || sourceType == "random")
                    updated.sourceChannel = 0;
                else
                    updated.sourceId.clear();
            }
            if (fields->hasProperty ("sourceId"))
                updated.sourceId = payload["sourceId"].toString();
        }
        if (updated.sourceType == "macro"
            && rack.getPerformance().findMacro (updated.sourceId) == nullptr)
        {
            emitError ("Unknown macro source.");
            return;
        }
        if (updated.sourceType == "lfo"
            && rack.getPerformance().findMidiLfo (updated.sourceId) == nullptr)
        {
            emitError ("Unknown LFO source.");
            return;
        }
        if (updated.sourceType == "envelope"
            && rack.getPerformance().findEnvelope (updated.sourceId) == nullptr)
        {
            emitError ("Unknown envelope source.");
            return;
        }
        if (updated.sourceType == "mseg"
            && rack.getPerformance().findMseg (updated.sourceId) == nullptr)
        {
            emitError ("Unknown MSEG source.");
            return;
        }
        if (updated.sourceType == "random"
            && rack.getPerformance().findRandomModulator (updated.sourceId) == nullptr)
        {
            emitError ("Unknown random modulator source.");
            return;
        }
        if (updated.parameterId == "@macro"
            && updated.sourceType != "lfo" && updated.sourceType != "envelope"
            && updated.sourceType != "mseg" && updated.sourceType != "random")
        {
            emitError ("Only a generator can target a macro.");
            return;
        }
        if (updated.sourceType == "macro" || updated.sourceType == "lfo"
            || updated.sourceType == "envelope" || updated.sourceType == "mseg"
            || updated.sourceType == "random")
        {
            updated.sourceChannel = 0;
            updated.sourceNumber = 0;
        }

        *route = updated;
        applyModulationTarget (route->targetId, route->parameterId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeModulationRoute")
    {
        auto& routes = const_cast<Performance&> (rack.getPerformance()).modulationRoutes;
        const auto routeId = payload.getProperty ("routeId", {}).toString();
        ModulationRoute removed;
        bool found = false;
        for (int i = routes.size(); --i >= 0;)
            if (routes.getReference (i).routeId == routeId)
            {
                removed = routes.getReference (i);
                routes.remove (i);
                found = true;
                break;
            }
        if (! found)
        {
            emitError ("Unknown modulation route.");
            return;
        }

        bool stillTargeted = false;
        for (const auto& route : routes)
            stillTargeted = stillTargeted
                         || (route.targetId == removed.targetId
                             && route.parameterId == removed.parameterId);
        if (stillTargeted)
            applyModulationTarget (removed.targetId, removed.parameterId);
        else if (targetParameterExists (removed.targetId, removed.parameterId)
                 && (isVirtualParameterId (removed.parameterId)
                     || removed.targetCeId == targetClassCeId (removed.targetId)))
            writeTargetValueRaw (removed.targetId, removed.parameterId, removed.baseValue);

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "clearModulationRoutes")
    {
        auto& routes = const_cast<Performance&> (rack.getPerformance()).modulationRoutes;
        const auto removed = routes;
        routes.clear();
        juce::StringArray restored;
        for (const auto& route : removed)
        {
            const auto key = route.targetId + "\n" + route.parameterId;
            if (restored.contains (key))
                continue;
            restored.add (key);
            if (targetParameterExists (route.targetId, route.parameterId)
                && (isVirtualParameterId (route.parameterId)
                    || route.targetCeId == targetClassCeId (route.targetId)))
                writeTargetValueRaw (route.targetId, route.parameterId, route.baseValue);
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addMidiLfo")
    {
        auto& lfos = const_cast<Performance&> (rack.getPerformance()).midiLfos;
        if (lfos.size() >= 32)
        {
            emitError ("The MIDI LFO rack is full.");
            return;
        }

        MidiLfo lfo;
        lfo.lfoId = juce::Uuid().toDashedString();
        lfo.name = payload.getProperty ("name", {}).toString().trim();
        if (lfo.name.isEmpty())
            lfo.name = "LFO " + juce::String (lfos.size() + 1);
        lfos.add (lfo);
        midiLfoRuntimes.erase (lfo.lfoId);
        tickMidiLfos();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setMidiLfo")
    {
        auto* lfo = const_cast<Performance&> (rack.getPerformance()).findMidiLfo (
            payload.getProperty ("lfoId", {}).toString());
        if (lfo == nullptr)
        {
            emitError ("Unknown MIDI LFO.");
            return;
        }

        auto updated = *lfo;
        if (const auto* fields = payload.getDynamicObject(); fields != nullptr)
        {
            if (fields->hasProperty ("name"))
            {
                const auto name = payload["name"].toString().trim();
                if (name.isNotEmpty()) updated.name = name;
            }
            if (fields->hasProperty ("shape"))
            {
                const auto shape = payload["shape"].toString();
                if (! validMidiLfoShape (shape))
                {
                    emitError ("Unknown LFO shape.");
                    return;
                }
                updated.shape = shape;
            }
            if (fields->hasProperty ("enabled"))     updated.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("sync"))        updated.sync = (bool) payload["sync"];
            if (fields->hasProperty ("rateHz"))
                updated.rateHz = juce::jlimit (0.01, 40.0, (double) payload["rateHz"]);
            if (fields->hasProperty ("syncBeats"))
                updated.syncBeats = juce::jlimit (0.03125, 64.0, (double) payload["syncBeats"]);
            if (fields->hasProperty ("phaseOffset"))
                updated.phaseOffset = juce::jlimit (0.0f, 1.0f,
                                                     (float) (double) payload["phaseOffset"]);
            if (fields->hasProperty ("minimum"))
                updated.minimum = juce::jlimit (0.0f, 1.0f, (float) (double) payload["minimum"]);
            if (fields->hasProperty ("maximum"))
                updated.maximum = juce::jlimit (0.0f, 1.0f, (float) (double) payload["maximum"]);
        }
        if (updated.minimum > updated.maximum)
            std::swap (updated.minimum, updated.maximum);
        *lfo = updated;
        tickMidiLfos();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "resetMidiLfo")
    {
        const auto lfoId = payload.getProperty ("lfoId", {}).toString();
        if (rack.getPerformance().findMidiLfo (lfoId) == nullptr)
        {
            emitError ("Unknown MIDI LFO.");
            return;
        }
        auto& runtime = midiLfoRuntimes[lfoId];
        runtime = {};
        runtime.syncOriginPpq = rack.getEngine().getTransport().getPositionPpq();
        runtime.retriggered = true;
        tickMidiLfos();
        emitState();
        return;
    }

    if (cmd == "removeMidiLfo")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto lfoId = payload.getProperty ("lfoId", {}).toString();
        int found = -1;
        for (int i = 0; i < performance.midiLfos.size(); ++i)
            if (performance.midiLfos.getReference (i).lfoId == lfoId)
            {
                found = i;
                break;
            }
        if (found < 0)
        {
            emitError ("Unknown MIDI LFO.");
            return;
        }

        setModulationSourceValue ("lfo", lfoId, 0, 0, 0.0f);
        for (const auto& output : performance.midiLfos.getReference (found).outputs)
        {
            midiLfoLastSentValue.erase (output.outputId);
            midiLfoLastSentSeconds.erase (output.outputId);
        }
        performance.midiLfos.remove (found);
        midiLfoRuntimes.erase (lfoId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addMidiLfoOutput")
    {
        auto* lfo = const_cast<Performance&> (rack.getPerformance()).findMidiLfo (
            payload.getProperty ("lfoId", {}).toString());
        if (lfo == nullptr)
        {
            emitError ("Unknown MIDI LFO.");
            return;
        }
        if (lfo->outputs.size() >= 32)
        {
            emitError ("That LFO has too many MIDI outputs.");
            return;
        }

        MidiLfoOutput output;
        output.outputId = juce::Uuid().toDashedString();
        output.type = payload.getProperty ("type", "cc").toString();
        output.targetPartId = payload.getProperty ("targetPartId", {}).toString();
        output.channel = juce::jlimit (1, 16, (int) payload.getProperty ("channel", 1));
        output.number = juce::jlimit (0, output.type == "nrpn" ? 16383 : 127,
                                      (int) payload.getProperty ("number", 1));
        output.sysexTemplate = payload.getProperty ("sysexTemplate",
                                                     "F0 7D {value7} F7").toString().trim();
        if (! validMidiLfoOutputType (output.type))
        {
            emitError ("Unknown MIDI LFO output type.");
            return;
        }
        const auto* part = rack.getPerformance().findPart (output.targetPartId);
        if (part == nullptr || ! part->hardware)
        {
            emitError ("Choose a hardware part for the MIDI LFO output.");
            return;
        }
        if (output.type == "sysex")
        {
            juce::MidiMessage test;
            if (! buildMidiLfoSysEx (output.sysexTemplate, 0, 0, test))
            {
                emitError ("SysEx must start with F0, end with F7, and contain valid hex bytes or value placeholders.");
                return;
            }
        }
        // Deliberately stays disabled until the player reviews and enables it.
        lfo->outputs.add (output);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setMidiLfoOutput" || cmd == "removeMidiLfoOutput")
    {
        auto* lfo = const_cast<Performance&> (rack.getPerformance()).findMidiLfo (
            payload.getProperty ("lfoId", {}).toString());
        if (lfo == nullptr)
        {
            emitError ("Unknown MIDI LFO.");
            return;
        }
        const auto outputId = payload.getProperty ("outputId", {}).toString();
        int index = -1;
        for (int i = 0; i < lfo->outputs.size(); ++i)
            if (lfo->outputs.getReference (i).outputId == outputId)
            {
                index = i;
                break;
            }
        if (index < 0)
        {
            emitError ("Unknown MIDI LFO output.");
            return;
        }

        if (cmd == "removeMidiLfoOutput")
        {
            lfo->outputs.remove (index);
            midiLfoLastSentValue.erase (outputId);
            midiLfoLastSentSeconds.erase (outputId);
            savePerformance();
            emitState();
            return;
        }

        auto updated = lfo->outputs.getReference (index);
        if (const auto* fields = payload.getDynamicObject(); fields != nullptr)
        {
            if (fields->hasProperty ("type"))          updated.type = payload["type"].toString();
            if (fields->hasProperty ("targetPartId"))  updated.targetPartId = payload["targetPartId"].toString();
            if (fields->hasProperty ("channel"))
                updated.channel = juce::jlimit (1, 16, (int) payload["channel"]);
            if (fields->hasProperty ("number"))        updated.number = (int) payload["number"];
            if (fields->hasProperty ("sysexTemplate")) updated.sysexTemplate = payload["sysexTemplate"].toString().trim();
            if (fields->hasProperty ("enabled"))       updated.enabled = (bool) payload["enabled"];
        }
        if (! validMidiLfoOutputType (updated.type))
        {
            emitError ("Unknown MIDI LFO output type.");
            return;
        }
        updated.number = juce::jlimit (0, updated.type == "nrpn" ? 16383 : 127,
                                       updated.number);
        const auto* target = rack.getPerformance().findPart (updated.targetPartId);
        if (target == nullptr || ! target->hardware)
        {
            emitError ("Choose a hardware part for the MIDI LFO output.");
            return;
        }
        if (updated.type == "sysex")
        {
            juce::MidiMessage test;
            if (! buildMidiLfoSysEx (updated.sysexTemplate, 0, 0, test))
            {
                emitError ("SysEx must start with F0, end with F7, and contain valid hex bytes or value placeholders.");
                return;
            }
        }
        lfo->outputs.set (index, updated);
        midiLfoLastSentValue.erase (outputId);
        midiLfoLastSentSeconds.erase (outputId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addEnvelope")
    {
        auto& envelopes = const_cast<Performance&> (rack.getPerformance()).envelopes;
        if (envelopes.size() >= 32)
        {
            emitError ("The envelope rack is full.");
            return;
        }
        EnvelopeGenerator envelope;
        envelope.envelopeId = juce::Uuid().toDashedString();
        envelope.name = payload.getProperty ("name", {}).toString().trim();
        if (envelope.name.isEmpty())
            envelope.name = "Envelope " + juce::String (envelopes.size() + 1);
        envelopes.add (envelope);
        envelopeRuntimes.erase (envelope.envelopeId);
        tickEnvelopeGenerators();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setEnvelope")
    {
        auto* envelope = const_cast<Performance&> (rack.getPerformance()).findEnvelope (
            payload.getProperty ("envelopeId", {}).toString());
        if (envelope == nullptr)
        {
            emitError ("Unknown envelope.");
            return;
        }
        auto updated = *envelope;
        if (const auto* fields = payload.getDynamicObject(); fields != nullptr)
        {
            if (fields->hasProperty ("name"))
            {
                const auto name = payload["name"].toString().trim();
                if (name.isNotEmpty()) updated.name = name;
            }
            if (fields->hasProperty ("enabled")) updated.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("channel"))
                updated.channel = juce::jlimit (0, 16, (int) payload["channel"]);
            if (fields->hasProperty ("noteLow"))
                updated.noteLow = juce::jlimit (0, 127, (int) payload["noteLow"]);
            if (fields->hasProperty ("noteHigh"))
                updated.noteHigh = juce::jlimit (0, 127, (int) payload["noteHigh"]);
            if (fields->hasProperty ("retrigger")) updated.retrigger = (bool) payload["retrigger"];
            if (fields->hasProperty ("attackMs"))
                updated.attackMs = juce::jlimit (0.0, 60000.0, (double) payload["attackMs"]);
            if (fields->hasProperty ("decayMs"))
                updated.decayMs = juce::jlimit (0.0, 60000.0, (double) payload["decayMs"]);
            if (fields->hasProperty ("sustain"))
                updated.sustain = juce::jlimit (0.0f, 1.0f, (float) (double) payload["sustain"]);
            if (fields->hasProperty ("releaseMs"))
                updated.releaseMs = juce::jlimit (0.0, 60000.0, (double) payload["releaseMs"]);
            if (fields->hasProperty ("curve"))
                updated.curve = juce::jlimit (-1.0f, 1.0f, (float) (double) payload["curve"]);
            if (fields->hasProperty ("velocityAmount"))
                updated.velocityAmount = juce::jlimit (0.0f, 1.0f,
                                                        (float) (double) payload["velocityAmount"]);
        }
        if (updated.noteLow > updated.noteHigh)
            std::swap (updated.noteLow, updated.noteHigh);
        const auto filterChanged = updated.channel != envelope->channel
                                || updated.noteLow != envelope->noteLow
                                || updated.noteHigh != envelope->noteHigh;
        *envelope = updated;
        auto& runtime = envelopeRuntimes[envelope->envelopeId];
        if (filterChanged)
        {
            runtime.heldNotes.clear();
            triggerEnvelopeRelease (runtime);
        }
        if (! envelope->enabled)
        {
            runtime = {};
            setModulationSourceValue ("envelope", envelope->envelopeId, 0, 0, 0.0f);
        }
        tickEnvelopeGenerators();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "triggerEnvelope")
    {
        const auto* envelope = rack.getPerformance().findEnvelope (
            payload.getProperty ("envelopeId", {}).toString());
        if (envelope == nullptr)
        {
            emitError ("Unknown envelope.");
            return;
        }
        auto& runtime = envelopeRuntimes[envelope->envelopeId];
        const auto gate = (bool) payload.getProperty ("gate", true);
        if (gate)
        {
            const auto wasEmpty = runtime.heldNotes.empty();
            runtime.heldNotes.insert (-1); // the editor's audition gate
            if (envelope->enabled && (envelope->retrigger || wasEmpty))
                triggerEnvelopeAttack (*envelope, runtime,
                    juce::jlimit (0.0f, 1.0f,
                                  (float) (double) payload.getProperty ("velocity", 1.0)));
        }
        else
        {
            runtime.heldNotes.erase (-1);
            if (runtime.heldNotes.empty())
                triggerEnvelopeRelease (runtime);
        }
        tickEnvelopeGenerators();
        emitState();
        return;
    }

    if (cmd == "resetEnvelope")
    {
        const auto envelopeId = payload.getProperty ("envelopeId", {}).toString();
        if (rack.getPerformance().findEnvelope (envelopeId) == nullptr)
        {
            emitError ("Unknown envelope.");
            return;
        }
        envelopeRuntimes[envelopeId] = {};
        setModulationSourceValue ("envelope", envelopeId, 0, 0, 0.0f);
        tickEnvelopeGenerators();
        emitState();
        return;
    }

    if (cmd == "removeEnvelope")
    {
        auto& envelopes = const_cast<Performance&> (rack.getPerformance()).envelopes;
        const auto envelopeId = payload.getProperty ("envelopeId", {}).toString();
        int found = -1;
        for (int i = 0; i < envelopes.size(); ++i)
            if (envelopes.getReference (i).envelopeId == envelopeId)
            {
                found = i;
                break;
            }
        if (found < 0)
        {
            emitError ("Unknown envelope.");
            return;
        }
        setModulationSourceValue ("envelope", envelopeId, 0, 0, 0.0f);
        envelopes.remove (found);
        envelopeRuntimes.erase (envelopeId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addMseg")
    {
        auto& msegs = const_cast<Performance&> (rack.getPerformance()).msegs;
        if (msegs.size() >= 32)
        {
            emitError ("The MSEG rack is full.");
            return;
        }
        MsegGenerator mseg;
        mseg.msegId = juce::Uuid().toDashedString();
        mseg.name = payload.getProperty ("name", {}).toString().trim();
        if (mseg.name.isEmpty())
            mseg.name = "MSEG " + juce::String (msegs.size() + 1);
        const auto addPoint = [&mseg] (float position, float value)
        {
            MsegPoint point;
            point.pointId = juce::Uuid().toDashedString();
            point.position = position;
            point.value = value;
            mseg.points.add (std::move (point));
        };
        addPoint (0.0f, 0.0f);
        addPoint (0.25f, 1.0f);
        addPoint (0.5f, 0.2f);
        addPoint (0.75f, 0.8f);
        addPoint (1.0f, 0.0f);
        msegs.add (std::move (mseg));
        tickMsegs();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setMseg")
    {
        auto* mseg = const_cast<Performance&> (rack.getPerformance()).findMseg (
            payload.getProperty ("msegId", {}).toString());
        if (mseg == nullptr)
        {
            emitError ("Unknown MSEG.");
            return;
        }
        auto updated = *mseg;
        if (const auto* fields = payload.getDynamicObject(); fields != nullptr)
        {
            if (fields->hasProperty ("name"))
            {
                const auto name = payload["name"].toString().trim();
                if (name.isNotEmpty()) updated.name = name;
            }
            if (fields->hasProperty ("enabled")) updated.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("sync")) updated.sync = (bool) payload["sync"];
            if (fields->hasProperty ("rateHz"))
                updated.rateHz = juce::jlimit (0.01, 40.0, (double) payload["rateHz"]);
            if (fields->hasProperty ("syncBeats"))
                updated.syncBeats = juce::jlimit (0.03125, 64.0, (double) payload["syncBeats"]);
            if (fields->hasProperty ("phaseOffset"))
                updated.phaseOffset = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["phaseOffset"]);
            if (fields->hasProperty ("points"))
            {
                const auto* pointArray = payload["points"].getArray();
                if (pointArray == nullptr || pointArray->size() < 2 || pointArray->size() > 64)
                {
                    emitError ("An MSEG needs 2 to 64 points.");
                    return;
                }
                juce::Array<MsegPoint> parsed;
                juce::StringArray seenIds;
                for (const auto& p : *pointArray)
                {
                    MsegPoint point;
                    point.pointId = p.getProperty ("pointId", {}).toString();
                    if (point.pointId.isEmpty())
                        point.pointId = juce::Uuid().toDashedString();
                    if (seenIds.contains (point.pointId))
                    {
                        emitError ("MSEG point identities must be unique.");
                        return;
                    }
                    seenIds.add (point.pointId);
                    point.position = juce::jlimit (0.0f, 1.0f,
                        (float) (double) p.getProperty ("position", 0.0));
                    point.value = juce::jlimit (0.0f, 1.0f,
                        (float) (double) p.getProperty ("value", 0.0));
                    point.curve = juce::jlimit (-1.0f, 1.0f,
                        (float) (double) p.getProperty ("curve", 0.0));
                    parsed.add (std::move (point));
                }
                std::sort (parsed.begin(), parsed.end(),
                           [] (const MsegPoint& a, const MsegPoint& b)
                           { return a.position < b.position; });
                parsed.getReference (0).position = 0.0f;
                parsed.getReference (parsed.size() - 1).position = 1.0f;
                updated.points = std::move (parsed);
            }
        }
        *mseg = std::move (updated);
        if (! mseg->enabled)
        {
            msegRuntimes[mseg->msegId] = {};
            setModulationSourceValue ("mseg", mseg->msegId, 0, 0, 0.0f);
        }
        tickMsegs();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "resetMseg")
    {
        const auto msegId = payload.getProperty ("msegId", {}).toString();
        if (rack.getPerformance().findMseg (msegId) == nullptr)
        {
            emitError ("Unknown MSEG.");
            return;
        }
        msegRuntimes[msegId] = {};
        tickMsegs();
        emitState();
        return;
    }

    if (cmd == "removeMseg")
    {
        auto& msegs = const_cast<Performance&> (rack.getPerformance()).msegs;
        const auto msegId = payload.getProperty ("msegId", {}).toString();
        int found = -1;
        for (int i = 0; i < msegs.size(); ++i)
            if (msegs.getReference (i).msegId == msegId)
            {
                found = i;
                break;
            }
        if (found < 0)
        {
            emitError ("Unknown MSEG.");
            return;
        }
        setModulationSourceValue ("mseg", msegId, 0, 0, 0.0f);
        msegs.remove (found);
        msegRuntimes.erase (msegId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addRandomModulator")
    {
        auto& randoms = const_cast<Performance&> (rack.getPerformance()).randomModulators;
        if (randoms.size() >= 32)
        {
            emitError ("The random modulator rack is full.");
            return;
        }
        RandomModulator random;
        random.randomId = juce::Uuid().toDashedString();
        random.name = payload.getProperty ("name", {}).toString().trim();
        if (random.name.isEmpty())
            random.name = "Random " + juce::String (randoms.size() + 1);
        const auto requestedMode = payload.getProperty ("mode", "sampleHold").toString();
        if (validRandomModulatorMode (requestedMode))
            random.mode = requestedMode;
        random.seed = juce::Random::getSystemRandom().nextInt (0x7ffffffe) + 1;
        randoms.add (std::move (random));
        tickRandomModulators();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setRandomModulator")
    {
        auto* random = const_cast<Performance&> (rack.getPerformance()).findRandomModulator (
            payload.getProperty ("randomId", {}).toString());
        if (random == nullptr)
        {
            emitError ("Unknown random modulator.");
            return;
        }
        auto updated = *random;
        if (const auto* fields = payload.getDynamicObject(); fields != nullptr)
        {
            if (fields->hasProperty ("name"))
            {
                const auto name = payload["name"].toString().trim();
                if (name.isNotEmpty()) updated.name = name;
            }
            if (fields->hasProperty ("mode"))
            {
                const auto mode = payload["mode"].toString();
                if (! validRandomModulatorMode (mode))
                {
                    emitError ("Unknown random modulator mode.");
                    return;
                }
                updated.mode = mode;
            }
            if (fields->hasProperty ("enabled")) updated.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("sync")) updated.sync = (bool) payload["sync"];
            if (fields->hasProperty ("rateHz"))
                updated.rateHz = juce::jlimit (0.01, 40.0, (double) payload["rateHz"]);
            if (fields->hasProperty ("syncBeats"))
                updated.syncBeats = juce::jlimit (0.03125, 64.0,
                                                  (double) payload["syncBeats"]);
            if (fields->hasProperty ("seed"))
                updated.seed = juce::jlimit (1, 0x7fffffff, (int) payload["seed"]);
            if (fields->hasProperty ("probability"))
                updated.probability = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["probability"]);
            if (fields->hasProperty ("smoothing"))
                updated.smoothing = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["smoothing"]);
            if (fields->hasProperty ("stepSize"))
                updated.stepSize = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["stepSize"]);
            if (fields->hasProperty ("chaos"))
                updated.chaos = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["chaos"]);
            if (fields->hasProperty ("minimum"))
                updated.minimum = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["minimum"]);
            if (fields->hasProperty ("maximum"))
                updated.maximum = juce::jlimit (0.0f, 1.0f,
                    (float) (double) payload["maximum"]);
        }
        if (updated.minimum > updated.maximum)
            std::swap (updated.minimum, updated.maximum);
        *random = std::move (updated);
        randomModulatorRuntimes[random->randomId] = {};
        if (! random->enabled)
            setModulationSourceValue ("random", random->randomId, 0, 0, 0.0f);
        tickRandomModulators();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "resetRandomModulator")
    {
        const auto randomId = payload.getProperty ("randomId", {}).toString();
        if (rack.getPerformance().findRandomModulator (randomId) == nullptr)
        {
            emitError ("Unknown random modulator.");
            return;
        }
        randomModulatorRuntimes[randomId] = {};
        tickRandomModulators();
        emitState();
        return;
    }

    if (cmd == "removeRandomModulator")
    {
        auto& randoms = const_cast<Performance&> (rack.getPerformance()).randomModulators;
        const auto randomId = payload.getProperty ("randomId", {}).toString();
        int found = -1;
        for (int i = 0; i < randoms.size(); ++i)
            if (randoms.getReference (i).randomId == randomId)
            {
                found = i;
                break;
            }
        if (found < 0)
        {
            emitError ("Unknown random modulator.");
            return;
        }
        setModulationSourceValue ("random", randomId, 0, 0, 0.0f);
        randoms.remove (found);
        randomModulatorRuntimes.erase (randomId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addBus")
    {
        // Buses are routing, and routing is the advanced tier — the same gate the returns
        // and the multi-output pairs already sit behind.
        if (! requireFeature (licensing::Feature::advancedRouting))
            return;

        const auto name = payload.getProperty ("name", {}).toString().trim();
        rack.addBus (name.isNotEmpty() ? name
                                       : "Bus " + juce::String (rack.getPerformance().buses.size() + 1));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeBus")
    {
        if (! rack.removeBus (payload.getProperty ("busId", {}).toString()))
        {
            emitError ("Unknown bus.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "renameBus")
    {
        if (! rack.renameBus (payload.getProperty ("busId", {}).toString(),
                              payload.getProperty ("name", {}).toString().trim()))
        {
            emitError ("Unknown bus.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setBusLevel")
    {
        if (! rack.setBusLevel (payload.getProperty ("busId", {}).toString(),
                                (float) (double) payload.getProperty ("level", 1.0)))
        {
            emitError ("Unknown bus.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setBusDestination")
    {
        const auto busId = payload.getProperty ("busId", {}).toString();
        const auto destination = payload.getProperty ("destinationBusId", {}).toString();
        if (! rack.setBusDestination (busId, destination))
        {
            // The refusal a person can act on: a loop is the interesting failure here, and
            // saying "unknown bus" for it would send them looking for the wrong thing.
            emitError (rack.getPerformance().findBus (busId) == nullptr
                         ? juce::String ("Unknown bus.")
                         : "That would feed a bus back into itself.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setPartDestination")
    {
        if (! rack.setPartDestination (payload.getProperty ("partId", {}).toString(),
                                       payload.getProperty ("busId", {}).toString()))
        {
            emitError ("Unknown rack part or bus.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addReturn")
    {
        if (! requireFeature (licensing::Feature::advancedRouting))
            return;

        const auto name = payload.getProperty ("name", {}).toString().trim();
        rack.addReturn (name.isNotEmpty() ? name
                                          : "Return " + juce::String (rack.getPerformance().returns.size() + 1));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeReturn")
    {
        if (! rack.removeReturn (payload.getProperty ("returnId", {}).toString()))
        {
            emitError ("Unknown return.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "renameReturn")
    {
        if (! rack.renameReturn (payload.getProperty ("returnId", {}).toString(),
                                 payload.getProperty ("name", {}).toString().trim()))
        {
            emitError ("Unknown return.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setReturnLevel")
    {
        if (! rack.setReturnLevel (payload.getProperty ("returnId", {}).toString(),
                                   (float) (double) payload.getProperty ("level", 1.0)))
        {
            emitError ("Unknown return.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setSendLevel")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto returnId = payload.getProperty ("returnId", {}).toString();
        const auto level = (float) (double) payload.getProperty ("level", 0.0);
        if (rack.getPerformance().findPart (partId) == nullptr
            || rack.getPerformance().findReturn (returnId) == nullptr)
        {
            emitError ("Unknown part or return.");
            return;
        }
        writeTargetBaseValue (partId, "@send:" + returnId, level * 0.5f);
        recordGestureValue (partId, "@send:" + returnId, level * 0.5f);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setExtraOut")
    {
        if (! requireFeature (licensing::Feature::advancedRouting))
            return;

        if (! rack.setExtraOut (payload.getProperty ("partId", {}).toString(),
                                (int) payload.getProperty ("pairIndex", 0),
                                (float) (double) payload.getProperty ("gain", 1.0)))
        {
            emitError ("Unknown part, or that is not an extra output pair.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeExtraOut")
    {
        if (! rack.removeExtraOut (payload.getProperty ("partId", {}).toString(),
                                   (int) payload.getProperty ("pairIndex", 0)))
        {
            emitError ("That part has no such output route.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setHardwareConfig")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        // Absent fields keep their value, like setPartMixer — the command is also how a
        // software part BECOMES hardware, so the current values are the defaults.
        InstrumentRackHost::HardwareConfig config;
        config.midiOutputId       = part->midiOutputId;
        config.midiOutputName     = part->midiOutputName;
        config.midiOutChannel     = part->midiOutChannel;
        config.audioReturnChannel = part->audioReturnChannel;
        config.audioReturnStereo  = part->audioReturnStereo;
        config.programBank        = part->programBank;
        config.programNumber      = part->programNumber;
        config.deviceProfileId    = part->deviceProfileId;

        if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("midiOutputId"))       config.midiOutputId       = payload["midiOutputId"].toString();
            if (fields->hasProperty ("midiOutputName"))     config.midiOutputName     = payload["midiOutputName"].toString();
            if (fields->hasProperty ("midiOutChannel"))     config.midiOutChannel     = (int) payload["midiOutChannel"];
            if (fields->hasProperty ("audioReturnChannel")) config.audioReturnChannel = (int) payload["audioReturnChannel"];
            if (fields->hasProperty ("audioReturnStereo"))  config.audioReturnStereo  = (bool) payload["audioReturnStereo"];
            if (fields->hasProperty ("programBank"))        config.programBank        = (int) payload["programBank"];
            if (fields->hasProperty ("programNumber"))      config.programNumber      = (int) payload["programNumber"];
            if (fields->hasProperty ("deviceProfileId"))    config.deviceProfileId    = payload["deviceProfileId"].toString();
        }

        rack.setHardwareConfig (partId, config);
        openHardwareMidi (partId);
        restartAudioIfNeeded();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "clearHardware")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (! rack.clearHardware (partId))
        {
            emitError ("That part is not a hardware instrument.");
            return;
        }
        hardwareMidiErrors.erase (partId);
        microtuningErrors.erase (partId);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setPartMidiSource")
    {
        // One part driving another: the destination takes the source's chain output instead
        // of the keyboard. Refusals are the model's — a loop, or a part that is not there.
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto sourcePartId = payload.getProperty ("sourcePartId", {}).toString();
        const auto& performance = rack.getPerformance();
        if (performance.findPart (partId) == nullptr
            || (sourcePartId.isNotEmpty() && performance.findPart (sourcePartId) == nullptr))
        {
            emitError ("Unknown rack part.");
            return;
        }
        if (performance.midiRoutingWouldLoop (partId, sourcePartId))
        {
            emitError (sourcePartId == partId
                         ? "A part cannot take its MIDI from itself."
                         : "That would loop — the source already takes its MIDI from this part.");
            return;
        }
        if (! rack.setPartMidiSource (partId, sourcePartId))
        {
            emitError ("Remove that part from its layer before giving it another MIDI source.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "sendHardwareProgram")
    {
        if (! rack.sendHardwareProgram (payload.getProperty ("partId", {}).toString()))
        {
            emitError ("That part has no program to send — configure a bank or program first.");
            return;
        }
        return;
    }

    // -- hardware total recall -------------------------------------------------------------

    if (cmd == "captureHardwarePatch")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr || ! part->hardware)
        {
            emitError ("That part is not a hardware instrument.");
            return;
        }

        {
            const std::scoped_lock lock (midiActivityLock);
            pendingPatchSysex.clear();
        }
        patchCapture = {};
        patchCapture.armed = true;
        patchCapture.partId = partId;
        patchCaptureListening.store (true);
        emitHardwarePatchCapture (true, partId, 0, 0);
        return;
    }

    if (cmd == "cancelHardwarePatchCapture")
    {
        patchCaptureListening.store (false);
        {
            const std::scoped_lock lock (midiActivityLock);
            pendingPatchSysex.clear();
        }
        patchCapture = {};
        emitHardwarePatchCapture (false, {}, 0, 0);
        return;
    }

    if (cmd == "finishHardwarePatchCapture")
    {
        // Whatever arrived in the window is the patch, so drain first: the last message may
        // still be sitting in the observer's queue when the player presses Done.
        drainHardwarePatchCapture();

        if (! patchCapture.armed)
        {
            emitError ("No patch capture is running.");
            return;
        }

        const auto partId = patchCapture.partId;
        auto messages = std::move (patchCapture.messages);
        patchCaptureListening.store (false);
        patchCapture = {};

        if (messages.empty())
        {
            emitHardwarePatchCapture (false, {}, 0, 0);
            emitError ("Nothing arrived. Send a patch dump from the synth while capture is armed.");
            return;
        }

        juce::MemoryBlock blob;
        for (const auto& message : messages)
            blob.append (message.getRawData(), (size_t) message.getRawDataSize());

        auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitHardwarePatchCapture (false, {}, 0, 0);
            emitError ("Unknown rack part.");
            return;
        }

        auto name = payload.getProperty ("name", {}).toString().trim();
        if (name.isEmpty())
            name = "Captured patch";

        if (! rack.setHardwarePatch (partId, blob.toBase64Encoding(), name))
        {
            emitHardwarePatchCapture (false, {}, 0, 0);
            emitError ("Unknown rack part.");
            return;
        }

        emitHardwarePatchCapture (false, partId, (int) messages.size(), (int) blob.getSize());
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "clearHardwarePatch")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (! rack.setHardwarePatch (partId, {}, {}))
        {
            emitError ("Unknown rack part.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setHardwareRestorePolicy")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto policy = payload.getProperty ("policy", {}).toString();
        if (policy != "ask" && policy != "always" && policy != "never")
        {
            emitError ("Restore policy must be ask, always or never.");
            return;
        }
        if (! rack.setHardwareRestorePolicy (partId, policy))
        {
            emitError ("Unknown rack part.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "compareHardwarePatches")
    {
        // What changed between the patch on a part and one in the library — or between two
        // library patches. Offsets, not meanings: the bytes stay unread here as everywhere.
        ensureLibrary();
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto recordIdA = payload.getProperty ("recordIdA", {}).toString();
        const auto recordId = payload.getProperty ("recordId", payload.getProperty ("recordIdB", {})).toString();

        juce::String nameA, nameB, blobA, blobB;
        if (partId.isNotEmpty())
        {
            const auto* part = rack.getPerformance().findPart (partId);
            if (part == nullptr || ! part->hardware)
            {
                emitError ("That part is not a hardware instrument.");
                return;
            }
            if (part->hardwarePatchBase64.isEmpty())
            {
                emitError ("That part has no captured patch to compare.");
                return;
            }
            nameA = part->hardwarePatchName.isNotEmpty() ? part->hardwarePatchName
                                                         : juce::String ("The part's patch");
            blobA = part->hardwarePatchBase64;
        }
        else if (const auto* a = library.find (recordIdA); a != nullptr && a->sourceType == "hardwarePatch")
        {
            nameA = a->name;
            blobA = a->stateBlobBase64;
        }
        else
        {
            emitError ("Name a hardware part or a hardware patch record to compare from.");
            return;
        }

        const auto* b = library.find (recordId);
        if (b == nullptr || b->sourceType != "hardwarePatch")
        {
            emitError ("That library record is not a hardware patch.");
            return;
        }
        nameB = b->name;
        blobB = b->stateBlobBase64;

        juce::MemoryBlock bytesA, bytesB;
        if (! bytesA.fromBase64Encoding (blobA) || ! bytesB.fromBase64Encoding (blobB))
        {
            emitError ("One of the patches could not be read back.");
            return;
        }

        auto result = patchDiff::toVar (patchDiff::compare (bytesA, bytesB));
        if (auto* obj = result.getDynamicObject())
        {
            obj->setProperty ("partId",   partId);
            obj->setProperty ("recordId", recordId);
            obj->setProperty ("nameA",    nameA);
            obj->setProperty ("nameB",    nameB);
        }
        if (options.emit != nullptr)
            options.emit ("instrumentHostPatchCompare", result);
        return;
    }

    if (cmd == "sendHardwarePatch")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr || ! part->hardware)
        {
            emitError ("That part is not a hardware instrument.");
            return;
        }
        if (part->hardwarePatchBase64.isEmpty())
        {
            emitError ("That part has no captured patch to send.");
            return;
        }

        const auto before = patchSends.size();
        queueHardwarePatchSend (partId);
        if (patchSends.size() == before && before == 0)
        {
            emitError ("That part's captured patch could not be read back.");
            return;
        }
        return;
    }

    // -- Stage 6: transport ----------------------------------------------------------------

    if (cmd == "transportPlay" || cmd == "transportStop" || cmd == "transportContinue")
    {
        auto& transport = rack.getEngine().getTransport();
        if (cmd == "transportPlay")          transport.start();
        else if (cmd == "transportStop")     transport.stop();
        else                                 transport.continuePlayback();
        emitState();
        return;
    }

    if (cmd == "setTempo")
    {
        auto& performance = rack.getPerformance();
        const auto tempo = juce::jlimit (20.0, 300.0, (double) payload.getProperty ("tempo", 120.0));
        rack.getEngine().getTransport().setTempo (tempo);
        const_cast<Performance&> (performance).transport.tempo = tempo;
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setTimeSignature")
    {
        const auto numerator = juce::jlimit (1, 32, (int) payload.getProperty ("numerator", 4));
        const auto denominator = juce::jlimit (2, 16, (int) payload.getProperty ("denominator", 4));
        rack.getEngine().getTransport().setTimeSignature (numerator, denominator);
        auto& settings = const_cast<Performance&> (rack.getPerformance()).transport;
        settings.timeSignatureNumerator = numerator;
        settings.timeSignatureDenominator = denominator;
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setTransportPosition")
    {
        rack.getEngine().getTransport().setPosition ((double) payload.getProperty ("ppq", 0.0));
        emitState();
        return;
    }

    if (cmd == "setExternalClock")
    {
        const auto enabled = (bool) payload.getProperty ("enabled", false);
        rack.getEngine().getTransport().setExternalClockEnabled (enabled);
        const_cast<Performance&> (rack.getPerformance()).transport.externalClock = enabled;
        savePerformance();
        emitState();
        return;
    }

    // -- Stage 6: patterns, lanes and steps -------------------------------------------------

    if (cmd == "importGrooveTemplate" || cmd == "removeGrooveTemplate"
        || cmd == "applyGrooveTemplate")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        if (cmd == "importGrooveTemplate")
        {
            if (performance.grooves.size() >= 32)
            {
                emitError ("Remove a groove before importing another one.");
                return;
            }

            perf::GrooveTemplate groove;
            groove.grooveId = juce::Uuid().toDashedString();
            groove.name = payload.getProperty ("name", "Imported groove").toString()
                              .trim().substring (0, 80);
            if (groove.name.isEmpty())
                groove.name = "Imported groove";
            groove.source = "imported";
            groove.stepsPerBeat = juce::jlimit (1, 16,
                (int) payload.getProperty ("stepsPerBeat", 4));
            if (const auto* values = payload.getProperty ("timingOffsets", {}).getArray())
                for (const auto& value : *values)
                {
                    if (groove.timingOffsets.size() >= 64)
                        break;
                    groove.timingOffsets.add (juce::jlimit (-0.5f, 0.5f,
                                                             (float) (double) value));
                }
            if (groove.timingOffsets.size() < 2)
            {
                emitError ("A groove needs at least two timing offsets.");
                return;
            }
            if (const auto* values = payload.getProperty ("velocityMultipliers", {}).getArray())
                for (const auto& value : *values)
                {
                    if (groove.velocityMultipliers.size() >= 64)
                        break;
                    groove.velocityMultipliers.add (juce::jlimit (0.25f, 2.0f,
                                                                    (float) (double) value));
                }
            performance.grooves.add (std::move (groove));
        }
        else
        {
            const auto grooveId = payload.getProperty ("grooveId", {}).toString();
            int grooveIndex = -1;
            for (int i = 0; i < performance.grooves.size(); ++i)
                if (performance.grooves.getReference (i).grooveId == grooveId)
                {
                    grooveIndex = i;
                    break;
                }
            if (grooveIndex < 0)
            {
                emitError ("Unknown groove template.");
                return;
            }

            if (cmd == "removeGrooveTemplate")
            {
                if (performance.grooves.getReference (grooveIndex).source == "factory")
                {
                    emitError ("Factory grooves cannot be removed.");
                    return;
                }
                performance.grooves.remove (grooveIndex);
            }
            else
            {
                auto* pattern = performance.findPattern (
                    payload.getProperty ("patternId", {}).toString());
                if (pattern == nullptr)
                {
                    emitError ("Unknown pattern.");
                    return;
                }
                perf::applyGrooveTemplate (*pattern, performance.grooves.getReference (grooveIndex),
                    juce::jlimit (0.0f, 1.0f,
                        (float) (double) payload.getProperty ("amount", 1.0)),
                    (bool) payload.getProperty ("applyVelocity", true));
                recompilePerformance();
            }
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addPattern")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto name = payload.getProperty ("name", {}).toString().trim();
        auto pattern = perf::Pattern::create (name.isNotEmpty()
                                                ? name
                                                : "Pattern " + juce::String (performance.patterns.size() + 1));

        // A pattern with no lane cannot be edited into anything, so it arrives with one
        // aimed at the focused part — the shortest path from "new pattern" to a sound.
        perf::Lane lane;
        lane.laneId = juce::Uuid().toDashedString();
        lane.name = "Notes";
        lane.targetPartId = performance.focusedPartId;
        lane.resizeSteps();
        pattern.lanes.add (std::move (lane));

        performance.patterns.add (std::move (pattern));
        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "createPatternVariations")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        auto* selected = performance.findPattern (payload.getProperty ("patternId", {}).toString());
        if (selected == nullptr)
        {
            emitError ("Unknown pattern.");
            return;
        }

        // The command may be invoked while B, C or D is selected. Always regenerate from A
        // when that source still exists; a removed A promotes the selected pattern instead
        // of leaving the variation group permanently unusable.
        auto* source = selected;
        if (selected->variationSourcePatternId.isNotEmpty()
            && selected->variationSourcePatternId != selected->patternId)
            if (auto* authored = performance.findPattern (selected->variationSourcePatternId))
                source = authored;

        const auto amount = juce::jlimit (0.0f, 1.0f,
                                          (float) (double) payload.getProperty ("amount", 0.55));
        const auto sourceId = source->patternId;
        const auto groupId = source->variationGroupId.isNotEmpty()
                               ? source->variationGroupId : juce::Uuid().toDashedString();
        source->variationGroupId = groupId;
        source->variationLabel = "A";
        source->variationSourcePatternId = sourceId;
        source->variationAmount = amount;
        const auto authored = *source;
        juce::String defaultFillPatternId;

        for (const auto label : { 'B', 'C', 'D' })
        {
            const auto labelText = juce::String::charToString ((juce::juce_wchar) label);
            int existingIndex = -1;
            for (int i = 0; i < performance.patterns.size(); ++i)
            {
                const auto& candidate = performance.patterns.getReference (i);
                if (candidate.variationGroupId == groupId && candidate.variationLabel == labelText)
                {
                    existingIndex = i;
                    break;
                }
            }

            auto variation = perf::makePatternVariation (authored, label, amount);
            variation.variationGroupId = groupId;
            variation.variationSourcePatternId = sourceId;
            if (existingIndex >= 0)
            {
                // A clip names the pattern id, not its lane ids. Keeping this id makes
                // regeneration safe for live sets which already launch this variation.
                variation.patternId = performance.patterns.getReference (existingIndex).patternId;
                if (label == 'D')
                    defaultFillPatternId = variation.patternId;
                performance.patterns.getReference (existingIndex) = std::move (variation);
            }
            else
            {
                if (label == 'D')
                    defaultFillPatternId = variation.patternId;
                performance.patterns.add (std::move (variation));
            }
        }

        for (auto& clip : performance.clips)
            if (clip.patternId == sourceId && clip.fillPatternId.isEmpty())
                clip.fillPatternId = defaultFillPatternId;

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removePattern" || cmd == "renamePattern" || cmd == "setPatternOptions")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto patternId = payload.getProperty ("patternId", {}).toString();
        auto* pattern = performance.findPattern (patternId);
        if (pattern == nullptr)
        {
            emitError ("Unknown pattern.");
            return;
        }

        if (cmd == "removePattern")
        {
            if (midiLoopRecording && midiLoopTargetClipId.isNotEmpty())
                if (const auto* recordingClip = performance.findClip (midiLoopTargetClipId))
                    if (recordingClip->patternId == patternId)
                    {
                        emitError ("Finish or cancel the overdub before removing its pattern.");
                        return;
                    }

            // Clips that named it go with it: a clip pointing at nothing is a launch button
            // that does nothing, which is worse than an absent button.
            for (int i = 0; i < performance.clips.size(); ++i)
                if (performance.clips.getReference (i).fillPatternId == patternId)
                {
                    rack.getEngine().setClipFill (i, -1, perf::Quantize::immediate);
                    performance.clips.getReference (i).fillPatternId.clear();
                    fillPedalStates[performance.clips.getReference (i).clipId] = false;
                }
            for (int i = performance.clips.size(); --i >= 0;)
                if (performance.clips.getReference (i).patternId == patternId)
                    performance.clips.remove (i);

            for (int i = 0; i < performance.patterns.size(); ++i)
                if (performance.patterns.getReference (i).patternId == patternId)
                {
                    performance.patterns.remove (i);
                    break;
                }
        }
        else if (cmd == "renamePattern")
        {
            pattern->name = payload.getProperty ("name", {}).toString().trim();
        }
        else
        {
            const auto* fields = payload.getDynamicObject();
            if (fields != nullptr)
            {
                if (fields->hasProperty ("swing"))
                    pattern->swing = juce::jlimit (0.0f, 0.75f, (float) (double) payload["swing"]);
                if (fields->hasProperty ("seed"))
                    pattern->seed = (juce::uint32) juce::jmax (1, (int) payload["seed"]);
            }
        }

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addLane" || cmd == "removeLane" || cmd == "setLaneOptions"
        || cmd == "euclidFill" || cmd == "clearLane")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        auto* pattern = performance.findPattern (payload.getProperty ("patternId", {}).toString());
        if (pattern == nullptr)
        {
            emitError ("Unknown pattern.");
            return;
        }

        if (cmd == "addLane")
        {
            perf::Lane lane;
            lane.laneId = juce::Uuid().toDashedString();
            lane.type = perf::laneTypeFromName (payload.getProperty ("type", "note").toString());
            lane.name = payload.getProperty ("name", {}).toString().trim();
            if (lane.name.isEmpty())
                lane.name = juce::String (perf::laneTypeName (lane.type)).substring (0, 1).toUpperCase()
                              + juce::String (perf::laneTypeName (lane.type)).substring (1);
            lane.targetPartId = payload.getProperty ("targetPartId", performance.focusedPartId).toString();
            lane.resizeSteps();
            pattern->lanes.add (std::move (lane));
        }
        else
        {
            const auto laneId = payload.getProperty ("laneId", {}).toString();
            auto* lane = pattern->findLane (laneId);
            if (lane == nullptr)
            {
                emitError ("Unknown lane.");
                return;
            }

            if (cmd == "removeLane")
            {
                // Lock lanes have no independent meaning; removing their visible source
                // removes them in the same document transaction.
                for (int i = pattern->lanes.size(); --i >= 0;)
                    if (pattern->lanes.getReference (i).laneId == laneId
                        || pattern->lanes.getReference (i).lockSourceLaneId == laneId)
                        pattern->lanes.remove (i);
            }
            else if (cmd == "clearLane")
            {
                for (auto& step : lane->steps)
                    step = perf::PatternStep();
                lane->euclidPulses = 0;
                for (int i = pattern->lanes.size(); --i >= 0;)
                    if (pattern->lanes.getReference (i).lockSourceLaneId == laneId)
                        pattern->lanes.remove (i);
            }
            else if (cmd == "euclidFill")
            {
                // A generated fill writes real steps: the user edits them afterwards and
                // nothing downstream has to know a lane was ever generated.
                lane->euclidPulses = juce::jlimit (0, lane->stepCount,
                                                   (int) payload.getProperty ("pulses", 0));
                lane->euclidRotation = (int) payload.getProperty ("rotation", 0);
                const auto hits = perf::euclideanPattern (lane->stepCount, lane->euclidPulses,
                                                          lane->euclidRotation);
                for (int i = 0; i < lane->steps.size() && i < hits.size(); ++i)
                {
                    auto& step = lane->steps.getReference (i);
                    step.active = hits[i];
                    if (step.active && lane->type == perf::LaneType::note && step.note == 0)
                        step.note = 60;
                }
            }
            else
            {
                const auto* fields = payload.getDynamicObject();
                if (fields != nullptr)
                {
                    if (fields->hasProperty ("name"))         lane->name = payload["name"].toString();
                    if (fields->hasProperty ("targetPartId")) lane->targetPartId = payload["targetPartId"].toString();
                    if (fields->hasProperty ("channel"))      lane->channel = juce::jlimit (1, 16, (int) payload["channel"]);
                    if (fields->hasProperty ("ccNumber"))     lane->ccNumber = juce::jlimit (0, 127, (int) payload["ccNumber"]);
                    if (fields->hasProperty ("drumNote"))     lane->drumNote = juce::jlimit (0, 127, (int) payload["drumNote"]);
                    if (fields->hasProperty ("stepsPerBeat")) lane->stepsPerBeat = juce::jlimit (1, 16, (int) payload["stepsPerBeat"]);
                    if (fields->hasProperty ("muted"))        lane->muted = (bool) payload["muted"];
                    if (fields->hasProperty ("glide"))        lane->glide = (bool) payload["glide"];
                    if (fields->hasProperty ("stepCount"))
                    {
                        lane->stepCount = juce::jlimit (1, 128, (int) payload["stepCount"]);
                        lane->resizeSteps();
                    }

                    // An automation lane's address is captured with the class it was authored
                    // against, exactly like a page slot or a macro target.
                    if (fields->hasProperty ("targetId") || fields->hasProperty ("parameterId"))
                    {
                        const auto targetId = fields->hasProperty ("targetId")
                                                ? payload["targetId"].toString() : lane->targetId;
                        const auto parameterId = fields->hasProperty ("parameterId")
                                                   ? payload["parameterId"].toString() : lane->parameterId;
                        if (! targetParameterExists (targetId, parameterId))
                        {
                            emitError ("Unknown parameter " + parameterId + " on that target.");
                            return;
                        }
                        lane->targetId = targetId;
                        lane->parameterId = parameterId;
                        lane->targetCeId = targetClassCeId (targetId);
                    }

                    // Linked lock lanes are an implementation detail of this visible grid.
                    // Resizing or muting the source keeps every lock on the same step and
                    // prevents a hidden lane from continuing after its notes were muted.
                    for (auto& lockLane : pattern->lanes)
                        if (lockLane.lockSourceLaneId == laneId)
                        {
                            lockLane.stepCount = lane->stepCount;
                            lockLane.stepsPerBeat = lane->stepsPerBeat;
                            lockLane.muted = lane->muted;
                            lockLane.resizeSteps();
                            for (int stepIndex = 0; stepIndex < lockLane.steps.size(); ++stepIndex)
                                if (lockLane.steps.getReference (stepIndex).active)
                                {
                                    const auto& sourceStep = lane->steps.getReference (stepIndex);
                                    auto& lockStep = lockLane.steps.getReference (stepIndex);
                                    lockStep.microtiming = sourceStep.microtiming;
                                    lockStep.probability = sourceStep.probability;
                                    lockStep.conditionEvery = sourceStep.conditionEvery;
                                    lockStep.conditionOffset = sourceStep.conditionOffset;
                                }
                        }

                    // A shrink may have discarded the only locked step in a linked lane.
                    // Do not keep empty implementation lanes in the saved Performance.
                    for (int laneIndex = pattern->lanes.size(); --laneIndex >= 0;)
                    {
                        const auto& lockLane = pattern->lanes.getReference (laneIndex);
                        if (lockLane.lockSourceLaneId != laneId)
                            continue;
                        const auto hasLocks = std::any_of (lockLane.steps.begin(), lockLane.steps.end(),
                                                           [] (const auto& step) { return step.active; });
                        if (! hasLocks)
                            pattern->lanes.remove (laneIndex);
                    }
                }
            }
        }

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setStep" || cmd == "toggleStep")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        auto* pattern = performance.findPattern (payload.getProperty ("patternId", {}).toString());
        auto* lane = pattern != nullptr
                       ? pattern->findLane (payload.getProperty ("laneId", {}).toString())
                       : nullptr;
        auto* step = lane != nullptr ? lane->findStep ((int) payload.getProperty ("index", -1))
                                     : nullptr;
        if (step == nullptr)
        {
            emitError ("Unknown step.");
            return;
        }

        if (cmd == "toggleStep")
        {
            step->active = ! step->active;
            if (step->active && lane->type == perf::LaneType::note && step->note == 0)
                step->note = 60;
        }
        else if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("active"))      step->active = (bool) payload["active"];
            if (fields->hasProperty ("note"))        step->note = juce::jlimit (0, 127, (int) payload["note"]);
            if (fields->hasProperty ("velocity"))    step->velocity = juce::jlimit (1, 127, (int) payload["velocity"]);
            if (fields->hasProperty ("value"))       step->value = juce::jlimit (0.0f, 1.0f, (float) (double) payload["value"]);
            if (fields->hasProperty ("gate"))        step->gate = juce::jlimit (0.05f, 4.0f, (float) (double) payload["gate"]);
            if (fields->hasProperty ("microtiming")) step->microtiming = juce::jlimit (-0.5f, 0.5f, (float) (double) payload["microtiming"]);
            if (fields->hasProperty ("probability")) step->probability = juce::jlimit (0, 100, (int) payload["probability"]);
            if (fields->hasProperty ("ratchets"))    step->ratchets = juce::jlimit (1, 8, (int) payload["ratchets"]);
            if (fields->hasProperty ("tie"))         step->tie = (bool) payload["tie"];
            if (fields->hasProperty ("every"))       step->conditionEvery = juce::jlimit (1, 16, (int) payload["every"]);
            if (fields->hasProperty ("offset"))      step->conditionOffset = juce::jlimit (0, 15, (int) payload["offset"]);
            if (fields->hasProperty ("chord"))
            {
                step->chordNotes.clear();
                if (const auto* notes = payload["chord"].getArray())
                    for (const auto& note : *notes)
                        step->chordNotes.add (juce::jlimit (0, 127, (int) note));
            }
        }

        // Probability, conditions and timing belong to the trig. A lock on that trig must
        // make the same decision at the same instant, not fire when its note did not.
        for (auto& lockLane : pattern->lanes)
            if (lockLane.lockSourceLaneId == lane->laneId)
                if (auto* lockStep = lockLane.findStep ((int) payload.getProperty ("index", -1));
                    lockStep != nullptr && lockStep->active)
                {
                    lockStep->microtiming = step->microtiming;
                    lockStep->probability = step->probability;
                    lockStep->conditionEvery = step->conditionEvery;
                    lockStep->conditionOffset = step->conditionOffset;
                }

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setStepParameterLock" || cmd == "setStepCcLock"
        || cmd == "removeStepLock" || cmd == "clearStepLocks")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        auto* pattern = performance.findPattern (payload.getProperty ("patternId", {}).toString());
        auto* sourceLane = pattern != nullptr
                             ? pattern->findLane (payload.getProperty ("laneId", {}).toString())
                             : nullptr;
        const auto stepIndex = (int) payload.getProperty ("index", -1);
        auto* sourceStep = sourceLane != nullptr ? sourceLane->findStep (stepIndex) : nullptr;
        if (pattern == nullptr || sourceLane == nullptr || ! sourceLane->lockSourceLaneId.isEmpty())
        {
            emitError ("Unknown parameter-lock source lane.");
            return;
        }
        const auto sourceLaneId = sourceLane->laneId;
        const auto sourceTargetPartId = sourceLane->targetPartId;
        const auto sourceChannel = sourceLane->channel;
        const auto sourceStepCount = sourceLane->stepCount;
        const auto sourceStepsPerBeat = sourceLane->stepsPerBeat;
        const auto sourceMuted = sourceLane->muted;
        const auto sourceMicrotiming = sourceStep != nullptr ? sourceStep->microtiming : 0.0f;
        const auto sourceProbability = sourceStep != nullptr ? sourceStep->probability : 100;
        const auto sourceEvery = sourceStep != nullptr ? sourceStep->conditionEvery : 1;
        const auto sourceOffset = sourceStep != nullptr ? sourceStep->conditionOffset : 0;

        const auto removeEmptyLockLane = [pattern] (int laneIndex)
        {
            const auto& candidate = pattern->lanes.getReference (laneIndex);
            const auto hasLocks = std::any_of (candidate.steps.begin(), candidate.steps.end(),
                                               [] (const auto& step) { return step.active; });
            if (! hasLocks)
                pattern->lanes.remove (laneIndex);
        };

        if (cmd == "clearStepLocks")
        {
            const auto* fields = payload.getDynamicObject();
            const auto oneStep = fields != nullptr && fields->hasProperty ("index");
            if (oneStep && sourceStep == nullptr)
            {
                emitError ("Unknown step.");
                return;
            }

            for (int laneIndex = pattern->lanes.size(); --laneIndex >= 0;)
            {
                auto& lockLane = pattern->lanes.getReference (laneIndex);
                if (lockLane.lockSourceLaneId != sourceLaneId)
                    continue;
                if (! oneStep)
                    pattern->lanes.remove (laneIndex);
                else
                {
                    lockLane.steps.getReference (stepIndex) = {};
                    removeEmptyLockLane (laneIndex);
                }
            }
        }
        else if (cmd == "removeStepLock")
        {
            if (sourceStep == nullptr)
            {
                emitError ("Unknown step.");
                return;
            }
            const auto lockLaneId = payload.getProperty ("lockLaneId", {}).toString();
            bool removed = false;
            for (int laneIndex = pattern->lanes.size(); --laneIndex >= 0;)
            {
                auto& lockLane = pattern->lanes.getReference (laneIndex);
                if (lockLane.laneId != lockLaneId
                    || lockLane.lockSourceLaneId != sourceLaneId)
                    continue;
                lockLane.steps.getReference (stepIndex) = {};
                removeEmptyLockLane (laneIndex);
                removed = true;
                break;
            }
            if (! removed)
            {
                emitError ("Unknown parameter lock on that step.");
                return;
            }
        }
        else
        {
            if (sourceStep == nullptr)
            {
                emitError ("Unknown step.");
                return;
            }

            perf::Lane* lockLane = nullptr;
            if (cmd == "setStepParameterLock")
            {
                const auto targetId = payload.getProperty ("targetId", {}).toString();
                const auto parameterId = payload.getProperty ("parameterId", {}).toString();
                if (! targetParameterExists (targetId, parameterId))
                {
                    emitError ("Unknown parameter " + parameterId + " on that target.");
                    return;
                }

                for (auto& candidate : pattern->lanes)
                    if (candidate.lockSourceLaneId == sourceLaneId
                        && candidate.type == perf::LaneType::parameter
                        && candidate.targetId == targetId && candidate.parameterId == parameterId)
                    {
                        lockLane = &candidate;
                        break;
                    }

                if (lockLane == nullptr)
                {
                    perf::Lane added;
                    added.laneId = juce::Uuid().toDashedString();
                    added.type = perf::LaneType::parameter;
                    added.name = "Lock — " + (isVirtualParameterId (parameterId)
                                                  ? virtualParameterName (targetId, parameterId)
                                                  : parameterId);
                    if (const auto found = partParameters.find (targetId);
                        ! isVirtualParameterId (parameterId) && found != partParameters.end())
                        if (const auto* descriptor = found->second.inventory.find (parameterId))
                            added.name = "Lock — " + descriptor->name;
                    added.targetId = targetId;
                    added.parameterId = parameterId;
                    added.targetCeId = targetClassCeId (targetId);
                    added.lockSourceLaneId = sourceLaneId;
                    added.stepCount = sourceStepCount;
                    added.stepsPerBeat = sourceStepsPerBeat;
                    added.muted = sourceMuted;
                    added.glide = false;
                    added.resizeSteps();
                    pattern->lanes.add (std::move (added));
                    lockLane = &pattern->lanes.getReference (pattern->lanes.size() - 1);
                }
            }
            else
            {
                const auto targetPartId = payload.getProperty ("targetPartId",
                                                                sourceTargetPartId).toString();
                if (performance.findPart (targetPartId) == nullptr)
                {
                    emitError ("Unknown hardware or rack part for that MIDI lock.");
                    return;
                }
                const auto channel = juce::jlimit (1, 16,
                    (int) payload.getProperty ("channel", sourceChannel));
                const auto ccNumber = juce::jlimit (0, 127,
                    (int) payload.getProperty ("ccNumber", 74));

                for (auto& candidate : pattern->lanes)
                    if (candidate.lockSourceLaneId == sourceLaneId
                        && candidate.type == perf::LaneType::cc
                        && candidate.targetPartId == targetPartId
                        && candidate.channel == channel && candidate.ccNumber == ccNumber)
                    {
                        lockLane = &candidate;
                        break;
                    }

                if (lockLane == nullptr)
                {
                    perf::Lane added;
                    added.laneId = juce::Uuid().toDashedString();
                    added.type = perf::LaneType::cc;
                    added.name = "Lock — CC" + juce::String (ccNumber);
                    added.targetPartId = targetPartId;
                    added.channel = channel;
                    added.ccNumber = ccNumber;
                    added.lockSourceLaneId = sourceLaneId;
                    added.stepCount = sourceStepCount;
                    added.stepsPerBeat = sourceStepsPerBeat;
                    added.muted = sourceMuted;
                    added.glide = false;
                    added.resizeSteps();
                    pattern->lanes.add (std::move (added));
                    lockLane = &pattern->lanes.getReference (pattern->lanes.size() - 1);
                }
            }

            auto& lockStep = lockLane->steps.getReference (stepIndex);
            lockStep.active = true;
            lockStep.value = juce::jlimit (0.0f, 1.0f,
                (float) (double) payload.getProperty ("value", 0.0));
            lockStep.microtiming = sourceMicrotiming;
            lockStep.probability = sourceProbability;
            lockStep.conditionEvery = sourceEvery;
            lockStep.conditionOffset = sourceOffset;
        }

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    // -- Stage 6: clips ----------------------------------------------------------------------

    if (cmd == "addClip")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto patternId = payload.getProperty ("patternId", {}).toString();
        const auto* pattern = performance.findPattern (patternId);
        if (pattern == nullptr)
        {
            emitError ("Unknown pattern.");
            return;
        }

        perf::Clip clip;
        clip.clipId = juce::Uuid().toDashedString();
        clip.patternId = patternId;
        clip.name = payload.getProperty ("name", {}).toString().trim();
        if (clip.name.isEmpty())
            clip.name = pattern->name;
        clip.launchQuantize = performance.transport.defaultQuantize;

        // A clip made from an A/B/C/D family is immediately fill-capable. D is the natural
        // ending gesture; the clip editor can point it at B or C instead.
        if (pattern->variationGroupId.isNotEmpty())
            for (const auto& candidate : performance.patterns)
                if (candidate.variationGroupId == pattern->variationGroupId
                    && candidate.variationLabel == "D" && candidate.patternId != patternId)
                {
                    clip.fillPatternId = candidate.patternId;
                    break;
                }
        performance.clips.add (std::move (clip));

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeClip" || cmd == "setClipOptions")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto clipId = payload.getProperty ("clipId", {}).toString();
        auto* clip = performance.findClip (clipId);
        if (clip == nullptr)
        {
            emitError ("Unknown clip.");
            return;
        }

        if (cmd == "removeClip")
        {
            if (gestureRecording && gestureTargetClipId == clipId)
            {
                emitError ("Finish or cancel the gesture take before removing its clip.");
                return;
            }
            if (clip->looperLayer)
            {
                removeMidiLoop (clipId);
                return;
            }

            const auto removePrivatePattern = clip->gestureClip || clip->frozenMidi;
            const auto privatePatternId = clip->patternId;
            const auto index = performance.indexOfClip (clipId);
            if (index >= 0)
                rack.getEngine().stopClip (index, perf::Quantize::immediate);

            for (auto& scene : performance.scenes)
                scene.clipIds.removeString (clipId);
            fillPedalStates.erase (clipId);
            performance.clips.remove (index);
            for (auto& remaining : performance.clips)
                if (remaining.followClipId == clipId)
                {
                    remaining.followClipId.clear();
                    if (remaining.followAction == "clip")
                    {
                        remaining.followAction = "none";
                        remaining.followAfterLoops = 0;
                    }
                }

            if (removePrivatePattern)
            {
                bool stillUsed = false;
                for (const auto& remaining : performance.clips)
                    stillUsed = stillUsed || remaining.patternId == privatePatternId;
                if (! stillUsed)
                    for (int patternIndex = performance.patterns.size(); --patternIndex >= 0;)
                        if (performance.patterns.getReference (patternIndex).patternId == privatePatternId)
                        {
                            performance.patterns.remove (patternIndex);
                            break;
                        }
            }
        }
        else if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("name"))   clip->name = payload["name"].toString().trim();
            if (fields->hasProperty ("loop"))   clip->loop = (bool) payload["loop"];
            if (fields->hasProperty ("launchQuantize"))
                clip->launchQuantize = perf::quantizeFromName (payload["launchQuantize"].toString());
            if (fields->hasProperty ("followClipId"))
            {
                const auto target = payload["followClipId"].toString();
                if (target.isNotEmpty()
                    && (target == clipId || performance.findClip (target) == nullptr))
                {
                    emitError ("Choose a different existing clip as the follow target.");
                    return;
                }
                clip->followClipId = target;
                if (! fields->hasProperty ("followAction"))
                    clip->followAction = target.isNotEmpty() ? "clip" : "none";
            }
            if (fields->hasProperty ("followAfterLoops"))
                clip->followAfterLoops = juce::jlimit (0, 64, (int) payload["followAfterLoops"]);
            if (fields->hasProperty ("followAction"))
            {
                const auto action = payload["followAction"].toString();
                if (! juce::StringArray { "none", "clip", "next", "random", "stop" }
                       .contains (action))
                {
                    emitError ("Unknown follow action.");
                    return;
                }
                clip->followAction = action;
            }
            if (fields->hasProperty ("fillPatternId"))
            {
                const auto fillPatternId = payload["fillPatternId"].toString();
                if (fillPatternId.isNotEmpty()
                    && (fillPatternId == clip->patternId
                        || performance.findPattern (fillPatternId) == nullptr))
                {
                    emitError ("Choose a different existing pattern for the fill.");
                    return;
                }
                clip->fillPatternId = fillPatternId;
            }
            if (fields->hasProperty ("fillQuantize"))
                clip->fillQuantize = perf::quantizeFromName (payload["fillQuantize"].toString());
            if (fields->hasProperty ("fillCc"))
                clip->fillCc = juce::jlimit (-1, 127, (int) payload["fillCc"]);
            if (fields->hasProperty ("fillChannel"))
                clip->fillChannel = juce::jlimit (0, 16, (int) payload["fillChannel"]);
        }

        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "launchClip" || cmd == "stopClip")
    {
        const auto clipId = payload.getProperty ("clipId", {}).toString();
        const auto index = rack.getPerformance().indexOfClip (clipId);
        const auto* clip = rack.getPerformance().findClip (clipId);
        if (index < 0 || clip == nullptr)
        {
            emitError ("Unknown clip.");
            return;
        }

        // A clip's own quantization governs BOTH its start and its stop. Mixing a clip-level
        // launch setting with a performance-level stop setting is the kind of surprise that
        // only shows up on stage: a clip set to launch immediately would stop at the bar.
        if (cmd == "launchClip")
            rack.getEngine().launchClip (index);
        else
            rack.getEngine().stopClip (index, clip->launchQuantize);

        emitState();
        return;
    }

    if (cmd == "setPerformanceFill")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        setClipFillState (payload.getProperty ("clipId", {}).toString(),
                          (bool) payload.getProperty ("active", false));
        emitState();
        return;
    }

    if (cmd == "stopAllClips")
    {
        stopArrangementPlayback (false);
        rack.getEngine().stopAllClips (rack.getPerformance().transport.defaultQuantize);
        emitState();
        return;
    }

    if (cmd == "captureRecentMidi")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        createRetrospectiveClip ((double) payload.getProperty ("seconds", 30.0));
        return;
    }

    if (cmd == "freezeMidiClip")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;
        freezeMidiClip (payload.getProperty ("clipId", {}).toString(),
                        (int) payload.getProperty ("cycles", 1));
        return;
    }

    if (cmd == "startMidiLoop" || cmd == "finishMidiLoop" || cmd == "cancelMidiLoop"
        || cmd == "removeMidiLoop")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        if (cmd == "startMidiLoop")
            startMidiLoop (payload.getProperty ("clipId", {}).toString());
        else if (cmd == "finishMidiLoop")
            finishMidiLoop();
        else if (cmd == "cancelMidiLoop")
            cancelMidiLoop();
        else
            removeMidiLoop (payload.getProperty ("clipId", {}).toString());
        return;
    }

    if (cmd == "startGestureRecording" || cmd == "finishGestureRecording"
        || cmd == "cancelGestureRecording" || cmd == "clearGestureLanes")
    {
        if (! requireFeature (licensing::Feature::patternEngine))
            return;

        if (cmd == "startGestureRecording")
            startGestureRecording (payload.getProperty ("clipId", {}).toString(),
                                   payload.getProperty ("mode", "overdub").toString() == "replace");
        else if (cmd == "finishGestureRecording")
            finishGestureRecording();
        else if (cmd == "cancelGestureRecording")
            cancelGestureRecording();
        else
            clearGestureLanes (payload.getProperty ("clipId", {}).toString());
        return;
    }

    if (cmd == "armCapture" || cmd == "disarmCapture")
    {
        if (cmd == "disarmCapture")
        {
            rack.getEngine().armCapture (-1, -1);
            captureClipId = captureLaneId = {};
            emitState();
            return;
        }

        const auto clipId = payload.getProperty ("clipId", {}).toString();
        const auto laneId = payload.getProperty ("laneId", {}).toString();
        const auto clipIndex = rack.getPerformance().indexOfClip (clipId);
        const auto* clip = rack.getPerformance().findClip (clipId);
        const auto* pattern = clip != nullptr ? rack.getPerformance().findPattern (clip->patternId)
                                              : nullptr;
        int laneIndex = -1;
        if (pattern != nullptr)
            for (int i = 0; i < pattern->lanes.size(); ++i)
                if (pattern->lanes.getReference (i).laneId == laneId)
                    laneIndex = i;

        if (clipIndex < 0 || laneIndex < 0)
        {
            emitError ("Unknown clip or lane.");
            return;
        }

        rack.getEngine().armCapture (clipIndex, laneIndex);
        captureClipId = clipId;
        captureLaneId = laneId;
        emitState();
        return;
    }

    // -- Stage 6: scenes ---------------------------------------------------------------------

    if (cmd == "addScene")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        perf::Scene scene;
        scene.sceneId = juce::Uuid().toDashedString();
        scene.name = payload.getProperty ("name", {}).toString().trim();
        if (scene.name.isEmpty())
            scene.name = "Scene " + juce::String (performance.scenes.size() + 1);
        scene.launchQuantize = performance.transport.defaultQuantize;
        // A new scene captures the rig as it stands: the fastest honest way to make one.
        captureSceneFromRack (scene);
        performance.scenes.add (std::move (scene));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeScene" || cmd == "renameScene" || cmd == "captureScene"
        || cmd == "setSceneOptions" || cmd == "setSceneClip")
    {
        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto sceneId = payload.getProperty ("sceneId", {}).toString();
        auto* scene = performance.findScene (sceneId);
        if (scene == nullptr)
        {
            emitError ("Unknown scene.");
            return;
        }

        if (cmd == "removeScene")
        {
            bool sceneIsArranged = false;
            for (const auto& item : performance.arrangement.items)
                sceneIsArranged = sceneIsArranged || item.sceneId == sceneId;
            if (sceneIsArranged && arrangementPlaying)
                stopArrangementPlayback (true);

            if (sceneMorph.active && sceneMorph.sceneId == sceneId)
                sceneMorph = {};

            for (int i = performance.setlist.items.size(); --i >= 0;)
                if (performance.setlist.items.getReference (i).sceneId == sceneId)
                    performance.setlist.items.remove (i);

            for (int i = performance.arrangement.items.size(); --i >= 0;)
                if (performance.arrangement.items.getReference (i).sceneId == sceneId)
                    performance.arrangement.items.remove (i);

            for (int i = 0; i < performance.scenes.size(); ++i)
                if (performance.scenes.getReference (i).sceneId == sceneId)
                {
                    performance.scenes.remove (i);
                    break;
                }
        }
        else if (cmd == "renameScene")
        {
            scene->name = payload.getProperty ("name", {}).toString().trim();
        }
        else if (cmd == "captureScene")
        {
            captureSceneFromRack (*scene);
        }
        else if (cmd == "setSceneClip")
        {
            const auto clipId = payload.getProperty ("clipId", {}).toString();
            if ((bool) payload.getProperty ("included", true))
                scene->clipIds.addIfNotAlreadyThere (clipId);
            else
                scene->clipIds.removeString (clipId);
        }
        else if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("launchQuantize"))
                scene->launchQuantize = perf::quantizeFromName (payload["launchQuantize"].toString());
            if (fields->hasProperty ("stopOtherClips"))
                scene->stopOtherClips = (bool) payload["stopOtherClips"];
            if (fields->hasProperty ("tempo"))
                scene->tempo = juce::jlimit (0.0, 300.0, (double) payload["tempo"]);
            if (fields->hasProperty ("pageId"))
                scene->pageId = payload["pageId"].toString();
            if (fields->hasProperty ("morphBeats"))
                scene->morphBeats = juce::jlimit (0.0, 32.0,
                                                  (double) payload["morphBeats"]);
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "launchScene")
    {
        if (! launchScene (payload.getProperty ("sceneId", {}).toString()))
        {
            emitError ("Unknown scene.");
            return;
        }
        emitState();
        return;
    }

    // -- Stage 6: the setlist ----------------------------------------------------------------

    if (cmd == "addSetlistItem")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        perf::SetlistItem item;
        item.itemId = juce::Uuid().toDashedString();
        item.sceneId = payload.getProperty ("sceneId", {}).toString();
        item.rackRecordId = payload.getProperty ("rackRecordId", {}).toString();
        item.pageId = payload.getProperty ("pageId", {}).toString();
        if (item.pageId.isEmpty())
            if (const auto* scene = performance.findScene (item.sceneId))
                item.pageId = scene->pageId;
        item.name = payload.getProperty ("name", {}).toString().trim();
        if (item.name.isEmpty())
        {
            const auto* scene = performance.findScene (item.sceneId);
            item.name = scene != nullptr ? scene->name
                                         : "Item " + juce::String (performance.setlist.items.size() + 1);
        }
        performance.setlist.items.add (std::move (item));
        savePerformance();
        refreshSetlistPreloads();
        emitState();
        return;
    }

    if (cmd == "setSetlistOptions")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;
        auto& setlist = const_cast<Performance&> (rack.getPerformance()).setlist;
        if (const auto* fields = payload.getDynamicObject();
            fields != nullptr && fields->hasProperty ("preloadAhead"))
            setlist.preloadAhead = juce::jlimit (0, 2, (int) payload["preloadAhead"]);
        savePerformance();
        refreshSetlistPreloads();
        emitState();
        return;
    }

    if (cmd == "removeSetlistItem" || cmd == "setSetlistItem" || cmd == "moveSetlistItem")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;
        auto& setlist = const_cast<Performance&> (rack.getPerformance()).setlist;
        const auto itemId = payload.getProperty ("itemId", {}).toString();
        int index = -1;
        for (int i = 0; i < setlist.items.size(); ++i)
            if (setlist.items.getReference (i).itemId == itemId)
                index = i;

        if (index < 0)
        {
            emitError ("Unknown setlist item.");
            return;
        }

        if (cmd == "removeSetlistItem")
        {
            setlist.items.remove (index);
            setlist.currentIndex = juce::jlimit (-1, setlist.items.size() - 1, setlist.currentIndex);
        }
        else if (cmd == "moveSetlistItem")
        {
            setlist.items.move (index, juce::jlimit (0, setlist.items.size() - 1,
                                                     (int) payload.getProperty ("index", index)));
        }
        else if (const auto* fields = payload.getDynamicObject())
        {
            auto& item = setlist.items.getReference (index);
            if (fields->hasProperty ("name"))    item.name = payload["name"].toString();
            if (fields->hasProperty ("notes"))   item.notes = payload["notes"].toString();
            if (fields->hasProperty ("sceneId")) item.sceneId = payload["sceneId"].toString();
            if (fields->hasProperty ("rackRecordId")) item.rackRecordId = payload["rackRecordId"].toString();
            if (fields->hasProperty ("pageId"))       item.pageId = payload["pageId"].toString();
            if (fields->hasProperty ("tempo"))   item.tempo = juce::jlimit (0.0, 300.0, (double) payload["tempo"]);
        }

        savePerformance();
        refreshSetlistPreloads();
        emitState();
        return;
    }

    if (cmd == "setlistGo" || cmd == "setlistNext" || cmd == "setlistPrev")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;
        const auto& setlist = rack.getPerformance().setlist;
        const auto target = cmd == "setlistGo"  ? (int) payload.getProperty ("index", 0)
                          : cmd == "setlistNext" ? setlist.currentIndex + 1
                                                 : setlist.currentIndex - 1;
        if (! goToSetlistItem (target))
        {
            emitError ("That setlist item cannot be recalled; staying where we are.");
            emitState();
            return;
        }
        emitState();
        return;
    }

    // -- Song/Scene Arranger ---------------------------------------------------------------

    if (cmd == "addArrangementItem")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;
        if (arrangementPlaying)
        {
            emitError ("Stop the arrangement before editing its order.");
            return;
        }

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        const auto sceneId = payload.getProperty ("sceneId", {}).toString();
        const auto* scene = performance.findScene (sceneId);
        if (scene == nullptr)
        {
            emitError ("Choose an existing scene for the arrangement.");
            return;
        }

        perf::ArrangementItem item;
        item.itemId = juce::Uuid().toDashedString();
        item.sceneId = sceneId;
        item.name = payload.getProperty ("name", {}).toString().trim();
        if (item.name.isEmpty())
            item.name = scene->name;
        item.bars = juce::jlimit (1, 128, (int) payload.getProperty ("bars", 4));
        performance.arrangement.items.add (std::move (item));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeArrangementItem" || cmd == "setArrangementItem"
        || cmd == "moveArrangementItem")
    {
        if (arrangementPlaying)
        {
            emitError ("Stop the arrangement before editing its order.");
            return;
        }

        auto& performance = const_cast<Performance&> (rack.getPerformance());
        auto& arrangement = performance.arrangement;
        const auto itemId = payload.getProperty ("itemId", {}).toString();
        int index = -1;
        for (int i = 0; i < arrangement.items.size(); ++i)
            if (arrangement.items.getReference (i).itemId == itemId)
                index = i;

        if (index < 0)
        {
            emitError ("Unknown arrangement item.");
            return;
        }

        if (cmd == "removeArrangementItem")
        {
            arrangement.items.remove (index);
        }
        else if (cmd == "moveArrangementItem")
        {
            arrangement.items.move (index, juce::jlimit (0, arrangement.items.size() - 1,
                                      (int) payload.getProperty ("index", index)));
        }
        else if (const auto* fields = payload.getDynamicObject())
        {
            auto& item = arrangement.items.getReference (index);
            if (fields->hasProperty ("name"))
                item.name = payload["name"].toString().trim();
            if (fields->hasProperty ("sceneId"))
            {
                const auto sceneId = payload["sceneId"].toString();
                if (performance.findScene (sceneId) == nullptr)
                {
                    emitError ("Choose an existing scene for the arrangement.");
                    return;
                }
                item.sceneId = sceneId;
            }
            if (fields->hasProperty ("bars"))
                item.bars = juce::jlimit (1, 128, (int) payload["bars"]);
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setArrangementOptions")
    {
        auto& arrangement = const_cast<Performance&> (rack.getPerformance()).arrangement;
        if (const auto* fields = payload.getDynamicObject();
            fields != nullptr && fields->hasProperty ("loop"))
            arrangement.loop = (bool) payload["loop"];
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "startArrangement")
    {
        if (! requireFeature (licensing::Feature::scenesAndSetlists))
            return;
        if (! startArrangementPlayback ((int) payload.getProperty ("index", 0)))
            emitError ("That arrangement item cannot be played.");
        emitState();
        return;
    }

    if (cmd == "stopArrangement")
    {
        stopArrangementPlayback (true);
        emitState();
        return;
    }

    // -- Stage 6: per-part arp and MIDI FX ---------------------------------------------------

    if (cmd == "setPartArp" || cmd == "setPartMidiFx")
    {
        // The part-level doors onto the chain: they write the first slot of their family,
        // minting one when the chain has none. Every existing caller — the control pages,
        // the surface, the panels — keeps addressing "this part's arp" and means it.
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        const auto* fields = payload.getDynamicObject();

        if (cmd == "setPartArp")
        {
            auto arp = part->arp;   // absent fields keep their value, like setPartMixer
            if (fields != nullptr)
                applyArpFields (arp, payload, *fields);
            rack.setPartArp (partId, arp);
        }
        else
        {
            auto fx = part->midiFx;
            if (fields != nullptr)
                applyMidiFxFields (fx, payload, *fields);
            rack.setPartMidiFx (partId, fx);
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "addMidiSlot" || cmd == "removeMidiSlot" || cmd == "moveMidiSlot"
        || cmd == "setMidiSlotBypassed" || cmd == "setMidiSlotOptions")
    {
        // The chain's own commands: everything addresses (partId, slotId) except add, which
        // names a module type. The same shape the audio insert chain already uses, because
        // a MIDI insert IS an insert — that was the whole point of unwelding it.
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        auto chain = part->midiChain;
        const auto slotId = payload.getProperty ("slotId", {}).toString();
        int index = -1;
        for (int i = 0; i < chain.size(); ++i)
            if (chain.getReference (i).slotId == slotId)
                index = i;

        if (cmd == "addMidiSlot")
        {
            const auto type = payload.getProperty ("type", {}).toString();
            if (! perf::MidiSlot::types().contains (type))
            {
                emitError ("Unknown MIDI module: " + type);
                return;
            }
            if (chain.size() >= perf::MidiInsertRack::maxSlots)
            {
                emitError ("This part already has " + juce::String (perf::MidiInsertRack::maxSlots)
                           + " MIDI modules — remove one before adding another.");
                return;
            }

            auto minted = perf::MidiSlot::create (type, juce::Uuid().toDashedString());
            // A fresh module reads the part's current scale, exactly as the welded chain's
            // arpeggiator and chorder always did.
            minted.fx.scaleType = part->midiFx.scaleType;
            minted.fx.scaleRoot = part->midiFx.scaleRoot;
            chain.add (std::move (minted));
        }
        else if (index < 0)
        {
            emitError ("Unknown MIDI module.");
            return;
        }
        else if (cmd == "removeMidiSlot")
        {
            chain.remove (index);
        }
        else if (cmd == "moveMidiSlot")
        {
            const auto to = juce::jlimit (0, juce::jmax (0, chain.size() - 1),
                                          (int) payload.getProperty ("index", index));
            chain.move (index, to);
        }
        else if (cmd == "setMidiSlotBypassed")
        {
            chain.getReference (index).bypassed = (bool) payload.getProperty ("bypassed", false);
        }
        else
        {
            auto& slot = chain.getReference (index);
            if (const auto* fields = payload.getDynamicObject())
            {
                if (slot.type == "arp")
                    applyArpFields (slot.arp, payload, *fields);
                else if (perf::MidiSlot::types().indexOf (slot.type) >= 6)
                    applyNoteModuleFields (slot.mod, payload, *fields);
                else
                    applyMidiFxFields (slot.fx, payload, *fields);
            }
        }

        rack.setPartMidiChain (partId, std::move (chain));
        savePerformance();
        emitState();
        return;
    }

    // -- Stage 7: the mature generated product ------------------------------------------------

    if (cmd == "setMasterLevel")
    {
        rack.setMasterLevel ((float) (double) payload.getProperty ("level", 1.0));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setOutputPairs")
    {
        rack.setOutputPairs ((int) payload.getProperty ("pairs", 1));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setPartOutputPair")
    {
        if (! rack.setPartOutputPair (payload.getProperty ("partId", {}).toString(),
                                      (int) payload.getProperty ("pair", 0)))
        {
            emitError ("Unknown rack part.");
            return;
        }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "claimHardwareSurface" || cmd == "releaseHardwareSurface")
    {
        if (cmd == "releaseHardwareSurface")
        {
            releaseHardwareSurface();
        }
        else if (! claimHardwareSurface())
        {
            emitError ("Another instance is using the hardware surface.");
            emitState();
            return;
        }
        emitState();
        return;
    }

    if (cmd == "clearActiveHostingIncidents")
    {
        if (activeMarker != nullptr)
            activeMarker->clearIncidents();
        emitState();
        return;
    }

    // -- safe startup (§17.1, §18.3.3) --------------------------------------------------------

    if (cmd == "setSafeMode")
    {
        setSafeModeLevel (SafeMode::levelFromName (payload.getProperty ("level", {}).toString()));
        emitState();
        return;
    }

    if (cmd == "clearSafeModeSuspect")
    {
        clearSafeModeSuspect (payload.getProperty ("modulePath", {}).toString());
        emitState();
        return;
    }

    if (cmd == "clearAllSafeModeSuspects")
    {
        clearAllSafeModeSuspects();
        emitState();
        return;
    }

    // -- session recovery (§17.3) --------------------------------------------------------------

    if (cmd == "acknowledgeRecovery")
    {
        acknowledgeRecoveryReport();
        emitState();
        return;
    }

    if (cmd == "restoreLastKnownGood")
    {
        if (! restoreLastKnownGood())
            emitError ("There is no known-good session to go back to yet.");
        emitState();
        return;
    }

    if (cmd == "setAutomaticFailover")
    {
        auto& settings = const_cast<Performance&> (rack.getPerformance()).automaticFailover;
        if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("enabled"))
                settings.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("maxAttempts"))
                settings.maxAttempts = juce::jlimit (1, 5, (int) payload["maxAttempts"]);
            if (fields->hasProperty ("retryDelayMs"))
                settings.retryDelayMs = juce::jlimit (100, 10000, (int) payload["retryDelayMs"]);
        }
        if (settings.enabled)
            for (auto& [id, retry] : failovers)
            {
                juce::ignoreUnused (id);
                if (retry.state == "bypassed" || retry.state == "failed")
                {
                    retry.state = "waiting";
                    retry.attempts = 0;
                    retry.nextAttemptMs = juce::Time::getMillisecondCounterHiRes();
                }
            }
        else
            for (auto& [id, retry] : failovers)
            {
                juce::ignoreUnused (id);
                if (retry.state == "waiting")
                {
                    retry.state = "bypassed";
                    retry.nextAttemptMs = 0.0;
                }
            }
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "retryFailedProcessor")
    {
        retryFailedProcessor (payload.getProperty ("targetId", {}).toString());
        return;
    }

    if (cmd == "dismissFailoverEvent")
    {
        failovers.erase (payload.getProperty ("targetId", {}).toString());
        emitState();
        return;
    }

    // -- licensing (§19 "Trust") ---------------------------------------------------------------

    if (cmd == "getLicence")
    {
        emitState();
        return;
    }

    if (cmd == "installLicence")
    {
        // Either the text of the file, or a path to it. A path is what a file picker gives;
        // the text is what a paste box gives, and somebody with a licence in an email should
        // not have to save it first.
        auto text = payload.getProperty ("text", {}).toString();
        if (text.isEmpty())
        {
            const auto path = payload.getProperty ("path", {}).toString();
            if (path.isNotEmpty())
                text = juce::File (path).loadFileAsString();
        }

        if (const auto failure = installLicence (text); failure.isNotEmpty())
            emitError (failure);

        emitState();
        return;
    }

    if (cmd == "removeLicence")
    {
        removeLicence();
        emitState();
        return;
    }

    if (cmd == "activateLicenceHere")
    {
        if (const auto failure = activateLicenceHere(); failure.isNotEmpty())
            emitError (failure);
        emitState();
        return;
    }

    if (cmd == "deactivateLicenceHere")
    {
        // The receipt is spoken rather than merely returned: it is the one thing the customer
        // needs to keep, and a value nobody shows them is a value they do not have.
        if (const auto receipt = deactivateLicenceHere(); receipt.isNotEmpty())
            if (options.emit != nullptr)
                options.emit ("instrumentHostLicenceReceipt",
                              [&receipt] { auto* obj = new juce::DynamicObject();
                                           obj->setProperty ("receipt", receipt);
                                           return juce::var (obj); }());
        emitState();
        return;
    }

    // -- support bundle (§17.7) ----------------------------------------------------------------

    if (cmd == "previewSupportBundle" || cmd == "exportSupportBundle")
    {
        SupportBundleOptions bundleOptions;
        bundleOptions.includeStateBlobs  = (bool) payload.getProperty ("includeStateBlobs", false);
        bundleOptions.includeCrashStates = (bool) payload.getProperty ("includeCrashStates", true);
        bundleOptions.includeLogs        = (bool) payload.getProperty ("includeLogs", true);
        bundleOptions.includeWorkerDumps = (bool) payload.getProperty ("includeWorkerDumps", false);

        juce::Array<juce::var> rows;
        for (const auto& entry : previewSupportBundle (bundleOptions))
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("name",        entry.name);
            obj->setProperty ("description", entry.description);
            obj->setProperty ("sizeBytes",   entry.sizeBytes);
            obj->setProperty ("included",    entry.included);
            obj->setProperty ("note",        entry.note);
            rows.add (juce::var (obj));
        }

        auto* answer = new juce::DynamicObject();
        answer->setProperty ("entries", rows);
        answer->setProperty ("includeStateBlobs", bundleOptions.includeStateBlobs);
        answer->setProperty ("includeWorkerDumps", bundleOptions.includeWorkerDumps);

        if (cmd == "exportSupportBundle")
        {
            // The export is a second, explicit command. Previewing must never write anything —
            // "with user review" only means something if the review happens before the file
            // exists, and a preview that also wrote it would make the review decorative.
            const auto path = payload.getProperty ("path", {}).toString();
            const auto destination = path.isNotEmpty()
                                       ? juce::File (path)
                                       : options.dataDirectory.getChildFile (
                                             "support-bundle-"
                                             + juce::Time::getCurrentTime().formatted ("%Y%m%d-%H%M%S")
                                             + ".zip");

            const auto failure = writeSupportBundle (destination, bundleOptions);
            if (failure.isNotEmpty())
                emitError (failure);

            answer->setProperty ("written", failure.isEmpty());
            answer->setProperty ("path",    failure.isEmpty() ? destination.getFullPathName()
                                                              : juce::String());
        }

        if (options.emit != nullptr)
            options.emit ("instrumentHostSupportBundle", juce::var (answer));
        return;
    }

    if (cmd == "getLibrary")
    {
        ensureLibrary();
        emitLibrary (payload.getProperty ("query", {}).toString(),
                     payload.getProperty ("type", {}).toString());
        return;
    }

    if (cmd == "scanLibrary")
    {
        ensureLibrary();
        scanVstPresets();
        library.saveTo (libraryFile());
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "addLibraryPath" || cmd == "removeLibraryPath")
    {
        ensureLibrary();
        const auto path = payload.getProperty ("path", {}).toString().trim();
        if (path.isEmpty())
        {
            emitError ("A preset folder must not be empty.");
            return;
        }

        if (cmd == "addLibraryPath")
            libraryPaths.addIfNotAlreadyThere (path);
        else
            libraryPaths.removeString (path);

        auto* root = new juce::DynamicObject();
        root->setProperty ("paths", [this] { juce::Array<juce::var> a;
                                             for (const auto& p : libraryPaths) a.add (p);
                                             return a; }());
        libraryPathsFile().replaceWithText (juce::JSON::toString (juce::var (root)));
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "browseLibraryPath")
    {
        if (options.pickDirectory == nullptr)
        {
            emitError ("A folder picker is not available in this build — type the path instead.");
            return;
        }

        options.pickDirectory ([this, aliveToken = alive] (const juce::String& directory)
        {
            if (! aliveToken->load() || directory.isEmpty())
                return;
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("cmd", "addLibraryPath");
            obj->setProperty ("path", directory);
            handleCommand (juce::var (obj));
        });
        return;
    }

    if (cmd == "saveUserPreset")
    {
        ensureLibrary();
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        LibraryRecord record;
        record.type = "preset";
        record.name = payload.getProperty ("name", {}).toString().trim();
        record.category = payload.getProperty ("category", {}).toString().trim();

        if (part->hardware)
        {
            // A hardware part's sound is the patch it captured, and the library is where a
            // sound belongs whichever box makes it: "warm pad" should find the Serum preset
            // and the Juno patch in one list. The bytes stay opaque here exactly as they are
            // on the part — the record carries them, never reads them.
            if (part->hardwarePatchBase64.isEmpty())
            {
                emitError ("Capture a patch from the synth first — there is nothing to save yet.");
                return;
            }
            record.sourceType = "hardwarePatch";
            record.targetCeId = hardwarePatchTarget (*part);
            record.instrument = hardwareInstrumentName (*part);
            if (record.name.isEmpty())
                record.name = part->hardwarePatchName.isNotEmpty() ? part->hardwarePatchName
                                                                   : record.instrument + " patch";
            record.stateBlobBase64 = part->hardwarePatchBase64;
        }
        else
        {
            auto* instrument = rack.getInstrument (partId);
            if (instrument == nullptr)
            {
                emitError ("That part has no instrument to capture.");
                return;
            }

            juce::MemoryBlock state;
            instrument->getStateInformation (state);

            record.sourceType = "userState";
            record.targetCeId = part->pluginCeId;
            record.instrument = part->pluginName;
            record.manufacturer = part->pluginVendor;
            if (record.name.isEmpty())
                record.name = part->pluginName + " preset";
            record.stateBlobBase64 = juce::Base64::toBase64 (state.getData(), state.getSize());
        }
        record.fingerprint = juce::String::toHexString (record.stateBlobBase64.hashCode64());

        const auto recordId = library.addCapturedRecord (std::move (record));
        library.saveTo (libraryFile());

        // Saving is also arriving: the part's preset cursor lands on what it just saved, so
        // prev/next walks on from here rather than from the top.
        if (const auto* saved = library.find (recordId))
        {
            rack.setPartLastPreset (partId, saved->recordId, saved->name);
            savePerformance();
            emitState();
        }
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "saveChainToLibrary")
    {
        // The whole voice, not just the sound: the instrument and its state, the MIDI
        // modules ahead of it, and the insert chain after it — one record you drop onto any
        // part. The manifest is a Performance carrying exactly one part, so it reuses the
        // proven serialization instead of inventing a second document format.
        ensureLibrary();
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto captured = rack.captureState();
        const auto* part = captured.findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        if (part->pluginCeId.isEmpty())
        {
            emitError ("That part has no instrument to capture.");
            return;
        }

        Performance one = Performance::create();
        one.parts.add (*part);
        one.focusedPartId = part->partId;

        LibraryRecord record;
        record.type = "chain";
        record.sourceType = "chainCapture";
        record.targetCeId = part->pluginCeId;
        record.instrument = part->pluginName;
        record.manufacturer = part->pluginVendor;
        record.name = payload.getProperty ("name", {}).toString().trim();
        if (record.name.isEmpty())
            record.name = (part->pluginName.isNotEmpty() ? part->pluginName
                                                         : juce::String ("Chain")) + " chain";
        record.rackManifestJson = juce::JSON::toString (one.toVar());
        record.fingerprint = juce::String::toHexString (record.rackManifestJson.hashCode64());

        library.addCapturedRecord (std::move (record));
        library.saveTo (libraryFile());
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "saveRackToLibrary")
    {
        ensureLibrary();
        LibraryRecord record;
        record.type = "rack";
        record.sourceType = "rackCapture";
        record.name = payload.getProperty ("name", {}).toString().trim();
        if (record.name.isEmpty())
            record.name = rack.getPerformance().name.isNotEmpty() ? rack.getPerformance().name
                                                                  : juce::String ("Rack capture");
        record.rackManifestJson = juce::JSON::toString (rack.captureState().toVar());
        record.fingerprint = juce::String::toHexString (record.rackManifestJson.hashCode64());

        library.addCapturedRecord (std::move (record));
        library.saveTo (libraryFile());
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "setLibraryUserMetadata")
    {
        ensureLibrary();
        auto* record = library.find (payload.getProperty ("recordId", {}).toString());
        if (record == nullptr)
        {
            emitError ("Unknown library record.");
            return;
        }

        // Partial merge, like setPartMixer: only named fields move.
        auto user = record->user;
        const auto* fields = payload.getDynamicObject();
        if (fields != nullptr)
        {
            if (fields->hasProperty ("favourite")) user.favourite = (bool) payload["favourite"];
            if (fields->hasProperty ("rating"))    user.rating = juce::jlimit (0, 5, (int) payload["rating"]);
            if (fields->hasProperty ("notes"))     user.notes = payload["notes"].toString();
            if (fields->hasProperty ("tags"))
            {
                user.tags.clear();
                if (const auto* tags = payload["tags"].getArray())
                    for (const auto& t : *tags)
                        user.tags.add (t.toString().trim());
            }
            if (fields->hasProperty ("collections"))
            {
                user.collections.clear();
                if (const auto* collections = payload["collections"].getArray())
                    for (const auto& c : *collections)
                        user.collections.add (c.toString().trim());
            }
        }

        library.setUserMetadata (record->recordId, user);
        library.saveTo (libraryFile());
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "removeLibraryRecord")
    {
        ensureLibrary();
        const auto* record = library.find (payload.getProperty ("recordId", {}).toString());
        if (record == nullptr)
        {
            emitError ("Unknown library record.");
            return;
        }
        if (record->factory)
        {
            // A vendor record's source is the file on disk; deleting the row would only last
            // until the next rescan resurrected it. Say so instead of pretending.
            emitError ("Vendor records come back on rescan — remove the source file instead.");
            return;
        }

        library.removeRecord (record->recordId);
        library.saveTo (libraryFile());
        emitLibrary ({}, {});
        return;
    }

    if (cmd == "setPresetAudition")
    {
        auto& settings = const_cast<Performance&> (rack.getPerformance()).presetAudition;
        const auto* fields = payload.getDynamicObject();
        if (fields != nullptr)
        {
            if (fields->hasProperty ("enabled"))
                settings.enabled = (bool) payload["enabled"];
            if (fields->hasProperty ("phrase"))
            {
                static const juce::StringArray phrases { "single", "chord", "scale", "riff" };
                const auto phrase = payload["phrase"].toString();
                if (phrases.contains (phrase))
                    settings.phrase = phrase;
            }
            if (fields->hasProperty ("rootNote"))
                settings.rootNote = juce::jlimit (0, 127, (int) payload["rootNote"]);
            if (fields->hasProperty ("velocity"))
                settings.velocity = juce::jlimit (1, 127, (int) payload["velocity"]);
            if (fields->hasProperty ("noteLengthMs"))
                settings.noteLengthMs = juce::jlimit (40, 4000,
                                                       (int) payload["noteLengthMs"]);
            if (fields->hasProperty ("gapMs"))
                settings.gapMs = juce::jlimit (0, 2000, (int) payload["gapMs"]);
        }
        if (! settings.enabled)
            stopPresetAudition();
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "startSoundComparison")
    {
        ensureLibrary();
        auto partId = payload.getProperty ("partId", {}).toString();
        if (partId.isEmpty())
            partId = rack.getPerformance().focusedPartId;
        juce::StringArray requested;
        if (const auto* ids = payload.getProperty ("recordIds", {}).getArray())
            for (const auto& id : *ids)
                requested.addIfNotAlreadyThere (id.toString());
        startSoundComparison (partId, requested);
        return;
    }

    if (cmd == "stepSoundComparison")
    {
        if (! soundComparison.active || soundComparison.recordIds.isEmpty())
        {
            emitError ("Sound Comparison Mode is not active.");
            return;
        }
        const auto delta = (int) payload.getProperty ("delta", 1) < 0 ? -1 : 1;
        const auto count = soundComparison.recordIds.size();
        applySoundComparisonIndex ((soundComparison.index + delta + count) % count);
        return;
    }

    if (cmd == "keepSoundComparison" || cmd == "cancelSoundComparison")
    {
        if (! soundComparison.active)
        {
            emitError ("Sound Comparison Mode is not active.");
            return;
        }
        finishSoundComparison (cmd == "keepSoundComparison");
        return;
    }

    if (cmd == "loadLibraryRecord" || cmd == "auditionLibraryRecord")
    {
        const auto shouldAudition = cmd == "auditionLibraryRecord";
        ensureLibrary();
        const auto* record = library.find (payload.getProperty ("recordId", {}).toString());
        if (record == nullptr)
        {
            emitError ("Unknown library record.");
            return;
        }

        if (const auto reason = recordUnavailableReason (*record); reason.isNotEmpty()
            && record->type != "rack"     // a rack loads degraded-but-loud; presets refuse
            && record->type != "chain")   // a chain reports its missing effects and loads
        {
            emitError (reason);
            return;
        }

        if (record->type == "rack")
        {
            if (shouldAudition)
            {
                emitError ("Preset audition plays presets, not whole racks.");
                return;
            }
            loadRackRecord (*record);
            return;
        }

        // A chain lands on a part like a preset does — same target resolution below — but it
        // brings the MIDI modules and the inserts with it, which is the whole point.

        // Resolve the target part per §18.6.7: focused, replace a named part, or add new.
        const auto action = payload.getProperty ("action", "focused").toString();
        juce::String partId;
        if (action == "add")
            partId = rack.addPart();
        else if (action == "replace")
            partId = payload.getProperty ("partId", {}).toString();
        else
            partId = rack.getPerformance().focusedPartId;

        if (rack.getPerformance().findPart (partId) == nullptr)
        {
            emitError (action == "focused" ? "No rack part is focused."
                                           : "Unknown rack part.");
            return;
        }

        if (record->type == "chain")
        {
            if (shouldAudition)
            {
                emitError ("Preset audition plays presets; load a chain normally.");
                return;
            }
            loadChainRecord (*record, partId);
        }
        else
        {
            std::function<void()> afterLoaded;
            if (shouldAudition)
                afterLoaded = [this, partId] { startPresetAudition (partId); };
            loadPresetRecord (*record, partId, std::move (afterLoaded));
        }
        return;
    }

    if (cmd == "learnKeyChord")
    {
        // The chorder's capture, one arm per chord: tap the key that should carry it,
        // play the chord, done — grouped by "pressed together until released together",
        // heard through the same observer the other learns use.
        const auto partId = payload.getProperty ("partId", {}).toString();
        if (rack.getPerformance().findPart (partId) == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        chordLearn = {};
        chordLearn.armed = true;
        chordLearn.partId = partId;
        {
            const std::scoped_lock lock (midiActivityLock);
            pendingChordNotes.clear();
        }
        chordLearnListening.store (true);
        emitChordLearn (true, "key", -1, 0);
        return;
    }

    if (cmd == "cancelKeyChordLearn")
    {
        chordLearn = {};
        chordLearnListening.store (false);
        emitChordLearn (false, "cancelled", -1, 0);
        return;
    }

    if (cmd == "clearKeyChord")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        const auto key = (int) payload.getProperty ("key", -1);
        auto fx = part->midiFx;
        for (int i = fx.keyChords.size(); --i >= 0;)
            if (fx.keyChords.getReference (i).key == key)
                fx.keyChords.remove (i);
        rack.setPartMidiFx (partId, fx);
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "walkPartPreset")
    {
        // Prev/next preset on a part, VIP's front-panel walk: every library preset for the
        // part's plug-in class, in one predictable order — the factory program list by its
        // own indexes, then vendor .vstpreset files by name, then captured user state by
        // name — wrapping at the ends. The cursor is wherever the last preset load landed,
        // whichever source it came from.
        ensureLibrary();
        auto partId = payload.getProperty ("partId", {}).toString();
        if (partId.isEmpty())
            partId = rack.getPerformance().focusedPartId;

        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        if (part->pluginCeId.isEmpty() && ! part->hardware)
        {
            emitError ("Load an instrument on this part first — presets walk what is loaded.");
            return;
        }

        // A hardware part walks the patches captured from the same synth — the front-panel
        // prev/next VIP had for plug-ins, on a box that never had a preset browser at all.
        const auto target = part->hardware ? hardwarePatchTarget (*part) : part->pluginCeId;
        juce::Array<const LibraryRecord*> candidates;
        for (const auto& record : library.allRecords())
            if (record.type == "preset" && ! record.missing
                && record.targetCeId == target
                && (record.sourceType == "hardwarePatch") == part->hardware)
                candidates.add (&record);

        const auto rankOf = [] (const LibraryRecord& r)
        { return r.sourceType == "programList" ? 0 : r.sourceType == "vstpreset" ? 1 : 2; };
        const auto indexOf = [] (const LibraryRecord& r)
        { return r.sourceLocator.fromLastOccurrenceOf ("/", false, false).getIntValue(); };
        std::sort (candidates.begin(), candidates.end(),
                   [&] (const LibraryRecord* a, const LibraryRecord* b)
                   {
                       if (rankOf (*a) != rankOf (*b)) return rankOf (*a) < rankOf (*b);
                       if (rankOf (*a) == 0 && indexOf (*a) != indexOf (*b))
                           return indexOf (*a) < indexOf (*b);
                       const auto byName = a->name.compareIgnoreCase (b->name);
                       if (byName != 0) return byName < 0;
                       return a->recordId < b->recordId;
                   });

        if (candidates.isEmpty())
        {
            emitError (part->hardware
                         ? "No patches in the library for " + hardwareInstrumentName (*part)
                             + " — capture one from the synth and save it."
                         : "No presets in the library for " + part->pluginName
                             + " — its factory sounds may only live in its own browser.");
            return;
        }

        const auto delta = (int) payload.getProperty ("delta", 1) < 0 ? -1 : 1;
        int position = -1;
        for (int i = 0; i < candidates.size(); ++i)
            if (candidates[i]->recordId == part->lastPresetRecordId)
                { position = i; break; }

        // No cursor yet (or its record is gone): next starts at the top, prev at the end.
        const auto next = position < 0
                            ? (delta > 0 ? 0 : candidates.size() - 1)
                            : (position + delta + candidates.size()) % candidates.size();

        std::function<void()> afterLoaded;
        if (rack.getPerformance().presetAudition.enabled)
            afterLoaded = [this, partId] { startPresetAudition (partId); };
        loadPresetRecord (*candidates[next], partId, std::move (afterLoaded));
        return;
    }

    emitError ("Unknown instrument-host command: " + cmd);
}

void InstrumentHostService::restoreSession()
{
    restoreSessionImpl (true);
}

void InstrumentHostService::restoreSessionImpl (bool includePerformance)
{
    if (sessionRestored)
        return;
    sessionRestored = true;

    options.dataDirectory.createDirectory();

    // §17.3, before anything else touches disk: consume the risky-operation marker and, when
    // one was there, preserve the session that was live. The first save of this run would
    // otherwise overwrite the only copy of the state that produced the crash.
    if (recovery != nullptr)
        recovery->consumeAtStartup (performanceFile());

    {
        const std::scoped_lock lock (catalogLock);
        catalog.loadFrom (catalogFile());

        // Safe startup, active side (§17.1, §18.3.3): a leftover ACTIVE marker names the plug-in
        // that was live when the process died. Stage 7 recorded it as evidence for the
        // isolation decision §18.9.8 gates. Recording is not enough on its own — a module
        // counted and then loaded again on the very next start is a crash loop with a log
        // file attached — so the incident also makes the module a SUSPECT, and a suspect does
        // not load until somebody vouches for it. The evidence log is untouched by this: the
        // count is what a decision about isolation rests on, the suspect list is what keeps
        // the product startable in the meantime.
        if (activeMarker != nullptr)
        {
            const auto incident = activeMarker->consumePendingIncident();
            if (incident.modulePath.isNotEmpty())
            {
                pendingActiveIncident = incident;

                if (safeMode != nullptr)
                    safeMode->addSuspect (incident.modulePath, incident.name,
                                          "live when the last run ended abnormally",
                                          incident.count);
            }
        }

        // Safe startup: a leftover dead-man marker names the module that was on the scanner's
        // plate when something died abnormally. Quarantine it before anything loads.
        const auto suspect = PluginScannerCoordinator::pendingMarkerModule (options.dataDirectory);
        if (suspect.isNotEmpty())
        {
            catalog.recordFailure (suspect, PluginCatalog::fingerprintFor (juce::File (suspect)),
                                   "active during an abnormal termination", true);
            PluginScannerCoordinator::markerFile (options.dataDirectory).deleteFile();
            catalog.saveTo (catalogFile());
        }
    }

    if (scanPathsFile().existsAsFile())
    {
        const auto parsed = juce::JSON::parse (scanPathsFile().loadFileAsString());
        if (const auto* arr = parsed.getProperty ("paths", {}).getArray())
            for (const auto& p : *arr)
                userScanPaths.addIfNotAlreadyThere (p.toString());
    }

    rack.prepare (options.sampleRate, options.blockSize);

    // Which Performance boots the rack, in order of who knows best: the user's own saved
    // session (only where persistence is on — the outer VST3's session arrives through
    // restoreFromVar from the DAW's chunk, and a file read would race it); otherwise the
    // product's shipped factory rack, so a generated product opens as the rack its author
    // built rather than empty. restoreFromVar suppresses both — the chunk it carries is
    // about to replace whatever this would load.
    const auto performanceSource = [this]() -> juce::File
    {
        if (options.persistSession && performanceFile().existsAsFile())
            return performanceFile();
        if (options.factoryPerformanceFile.existsAsFile())
            return options.factoryPerformanceFile;
        return {};
    }();

    if (includePerformance && performanceSource != juce::File())
    {
        // Named, so a crash inside a vendor's setStateInformation says "restoring the session"
        // rather than leaving the next start to guess (§17.3 step 3).
        const SessionRecovery::ScopedOperation operation (recovery.get(), "restoreSession",
                                                          performanceSource.getFileName());

        Performance restored;
        if (Performance::fromVar (juce::JSON::parse (performanceSource.loadFileAsString()), restored))
            applyPerformance (std::move (restored));
        else
            emitError ("The saved rack session could not be read; starting empty.");
    }

    checkStateDigests();

    // The rig has proved itself: it restored, everything it named resolved, nothing was
    // refused and no stored state was damaged. THAT is a state worth being returned to — the
    // last saved session is the one that was live at the crash, which is exactly the state
    // under suspicion, so it cannot serve as the thing recovery goes back to.
    //
    // The run that FOLLOWS an interruption is excluded, and that is the point: it is restoring
    // the very state that was live when the last one died, and promoting it here would quietly
    // replace the offer the user is about to be shown with the thing they are being offered an
    // escape from. A later run that starts cleanly promotes it — two clean boots is evidence,
    // one is the state under suspicion loading once.
    if (recovery != nullptr && options.persistSession && performanceSource == performanceFile()
        && ! recovery->lastReport().interrupted
        && ! lastRestoreReport().degraded() && safeModeRefusals.empty()
        && stateDigestMismatches.isEmpty())
        recovery->markKnownGood (performanceFile());

    if (options.enableAudio)
        startAudio();
}

void InstrumentHostService::checkStateDigests()
{
    stateDigestMismatches.clear();

    const auto checkOne = [this] (const juce::String& label, const juce::String& blob,
                                  const juce::String& storedHash)
    {
        // An empty hash is a state written before hashes existed. Unchecked, not damaged —
        // calling every pre-existing session corrupt would be a false alarm at scale.
        if (blob.isEmpty() || storedHash.isEmpty())
            return;

        if (SessionRecovery::hashState (blob) != storedHash)
            stateDigestMismatches.add (label + "'s saved state does not match the digest stored "
                                               "with it; it was kept and loaded anyway.");
    };

    const auto& performance = rack.getPerformance();

    const auto checkChain = [&checkOne] (const juce::Array<EffectSlot>& chain)
    {
        for (const auto& slot : chain)
            checkOne (slot.pluginName.isNotEmpty() ? slot.pluginName : slot.effectId,
                      slot.stateBlobBase64, slot.stateBlobHash);
    };

    for (const auto& part : performance.parts)
    {
        checkOne (part.pluginName.isNotEmpty() ? part.pluginName : part.partId,
                  part.stateBlobBase64, part.stateBlobHash);
        checkChain (part.effects);
    }

    checkChain (performance.masterEffects);
    for (const auto& chain : performance.returns)
        checkChain (chain.effects);
}

SessionRecovery::Report InstrumentHostService::recoveryReport() const
{
    return recovery != nullptr ? recovery->lastReport() : SessionRecovery::Report();
}

void InstrumentHostService::acknowledgeRecoveryReport()
{
    if (recovery != nullptr)
        recovery->acknowledgeReport();
}

bool InstrumentHostService::restoreLastKnownGood()
{
    if (recovery == nullptr)
        return false;

    const auto good = recovery->lastKnownGoodFile();
    if (! good.existsAsFile())
        return false;

    Performance restored;
    if (! Performance::fromVar (juce::JSON::parse (good.loadFileAsString()), restored))
    {
        emitError ("The last known good session could not be read.");
        return false;
    }

    {
        const SessionRecovery::ScopedOperation operation (recovery.get(), "restoreLastKnownGood",
                                                          good.getFileName());
        applyPerformance (std::move (restored));
    }

    // The rig on screen is now the recovered one, so the live session file must agree — a
    // recovery the next start silently undoes is not a recovery.
    savePerformance();
    checkStateDigests();
    return true;
}

void InstrumentHostService::applyPerformance (Performance&& performance)
{
    // A document restore replaces the complete live environment. Runtime-only capture and
    // replay state must not survive it, otherwise a newly loaded rig could receive events
    // that were recorded against the previous one.
    performanceRecording = false;
    performanceRecordingTake = {};
    performanceRecordingStartSample = 0;
    performanceRecordingMidiCursor = 0;
    performanceRecordingMidi.clear();
    rack.getEngine().clearReplayMidi();
    performanceReplay = {};
    pendingSetlistRecall = {};
    failovers.clear();
    currentSurfacePageId.clear();
    requestedSurfacePageId.clear();

    pendingScenes.clear();
    sceneMorph = {};
    pendingArrangementLaunches.clear();
    arrangementPlaying = false;
    arrangementCurrentIndex = -1;
    arrangementQueuedIndex = -1;
    arrangementItemStartPpq = 0.0;
    arrangementStopAtPpq = -1.0;
    modulationSourceValues.clear();
    midiLfoRuntimes.clear();
    midiLfoLastSentValue.clear();
    midiLfoLastSentSeconds.clear();
    lastMidiLfoActivitySeconds = 0.0;
    envelopeRuntimes.clear();
    lastEnvelopeActivitySeconds = 0.0;
    msegRuntimes.clear();
    lastMsegActivitySeconds = 0.0;
    randomModulatorRuntimes.clear();
    lastRandomModulatorActivitySeconds = 0.0;
    applyingModulation = false;
    midiLoopRecording = false;
    midiLoopOverdub = false;
    midiLoopTargetClipId = {};
    midiLoopStartSample = 0;
    midiLoopStartPhasePpq = 0.0;
    fillPedalStates.clear();
    gestureRecording = false;
    gestureReplace = false;
    gestureTruncated = false;
    gestureTargetClipId = {};
    lastGestureClipId = {};
    gestureStartSample = 0;
    gestureStartPhasePpq = 0.0;
    gesturePoints.clear();

    for (const auto& unresolved : rack.loadModel (std::move (performance)))
        requestInstrument (unresolved.partId, unresolved.ceId);

    // The Stage 5 halves of the manifest load through their own transaction; a class that
    // fails to resolve leaves its slot unresolved-and-repairable, same as an instrument.
    const auto& model = rack.getPerformance();
    juce::Array<std::pair<juce::String, juce::String>> effectLoads;
    for (const auto& part : model.parts)
        for (const auto& slot : part.effects)
            if (slot.pluginCeId.isNotEmpty())
                effectLoads.add ({ slot.effectId, slot.pluginCeId });
    for (const auto& slot : model.masterEffects)
        if (slot.pluginCeId.isNotEmpty())
            effectLoads.add ({ slot.effectId, slot.pluginCeId });
    for (const auto& chain : model.returns)
        for (const auto& slot : chain.effects)
            if (slot.pluginCeId.isNotEmpty())
                effectLoads.add ({ slot.effectId, slot.pluginCeId });
    for (const auto& chain : model.buses)
        for (const auto& slot : chain.effects)
            if (slot.pluginCeId.isNotEmpty())
                effectLoads.add ({ slot.effectId, slot.pluginCeId });

    for (const auto& [effectId, ceId] : effectLoads)
        requestEffect (effectId, ceId);

    // The Stage 6 half: transport defaults become live, and the patterns compile so the
    // engine has something to play the moment a clip is launched.
    auto& transport = rack.getEngine().getTransport();
    transport.setTempo (model.transport.tempo);
    transport.setTimeSignature (model.transport.timeSignatureNumerator,
                                model.transport.timeSignatureDenominator);
    transport.setExternalClockEnabled (model.transport.externalClock);
    recompilePerformance();

    // Hardware parts reconnect their ports and recall their program; a port that is gone
    // shows up as the part's diagnostic, never as a silent no-op.
    juce::StringArray hardwarePartIds;
    for (const auto& part : model.parts)
        if (part.hardware)
            hardwarePartIds.add (part.partId);
    for (const auto& partId : hardwarePartIds)
    {
        openHardwareMidi (partId);
        rack.sendHardwareProgram (partId);   // no-op unless a bank/program is configured
    }

    // Total recall: a captured patch goes home, but never silently and never by default.
    // "always" is a decision the owner of that synth already made for that part; "ask" puts
    // the question to them, because the thing on the other end of that cable may not be the
    // thing that was there when the patch was captured, and transmitting a dump at it
    // uninvited can overwrite an edit buffer somebody is standing in front of.
    juce::StringArray askParts, askNames;
    for (const auto& partId : hardwarePartIds)
    {
        const auto* part = model.findPart (partId);
        if (part == nullptr || part->hardwarePatchBase64.isEmpty())
            continue;

        if (part->hardwareRestore == "always")
            queueHardwarePatchSend (partId);
        else if (part->hardwareRestore != "never")
        {
            askParts.add (partId);
            askNames.add (part->hardwarePatchName.isNotEmpty() ? part->hardwarePatchName
                                                               : part->pluginName);
        }
    }

    if (! askParts.isEmpty() && options.emit != nullptr)
    {
        juce::Array<juce::var> asks;
        for (int i = 0; i < askParts.size(); ++i)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("partId", askParts[i]);
            obj->setProperty ("patchName", askNames[i]);
            asks.add (juce::var (obj));
        }
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("parts", asks);
        options.emit ("instrumentHostHardwarePatchPrompt", juce::var (payload));
    }

    // Virtual mixer destinations can be recalled immediately; plug-in destinations are
    // applied from attachParameters as each asynchronous instance becomes available.
    applyAllModulationRoutes();
    restartAudioIfNeeded();
    refreshSetlistPreloads();
}

void InstrumentHostService::requestInstrument (const juce::String& partId, const juce::String& ceId,
                                               std::function<void (juce::AudioProcessor&)> afterCommit,
                                               std::function<void (bool, const juce::String&)> completion,
                                               bool failoverAttempt)
{
    juce::String descriptionXml, refusal;
    ClassInfoForCommit info;

    // Emitting under catalogLock would deadlock — buildStatePayload takes the same lock —
    // so refusals are carried out of the block and spoken after it.
    {
        const std::scoped_lock lock (catalogLock);
        const ModuleRecord* module = nullptr;
        const auto* record = findClass (ceId, &module);

        if (record == nullptr || module == nullptr)
        {
            refusal = "Instrument not in the catalogue: " + ceId;
        }
        else if (const auto why = module->unavailableReason(); why.isNotEmpty())
        {
            // One sentence for every reason a module cannot be offered — quarantine, absence
            // and now the wrong architecture (§17.2). Three separate checks here would drift.
            refusal = "Module is " + why + ": " + module->path;
        }
        else if (const auto blocked = safeModeRefusal (module->path); blocked.isNotEmpty())
        {
            // Safe startup (§17.1, §18.3.3). Recorded per module as well as spoken, so the
            // restore report can say the part was REFUSED rather than merely missing — the
            // difference matters: one is repaired by installing something, the other by
            // clicking "load it anyway".
            refusal = record->name + " was " + blocked;
            safeModeRefusals[module->path] = blocked;
        }
        else if (const auto allowed = entitlements();
                 ! rack.partHasInstrument (partId) && loadedPartCount() >= allowed.maxLoadedParts)
        {
            // §26.2's free tier loads "one plug-in". Replacing the one already loaded is not
            // an extra plug-in and is deliberately allowed — the free edition is a product
            // somebody uses, not a demonstration they get one shot at.
            refusal = allowed.maxLoadedParts == 1
                        ? "The " + allowed.label() + " edition loads one plug-in at a time. "
                          "Replace the one already loaded, or unload it first — the keyboard, "
                          "the pages and the mappings all keep working."
                        : "The " + allowed.label() + " edition loads "
                            + juce::String (allowed.maxLoadedParts) + " plug-ins at a time.";
        }
        else
        {
            descriptionXml = record->descriptionXml;
            info = { record->ceId, module->path, record->name, record->vendor };
        }
    }

    if (refusal.isNotEmpty())
    {
        if (completion != nullptr)
            completion (false, refusal);
        emitError (refusal);
        emitState();
        return;
    }

    // A deliberate selection owns this slot from now on. Cancelling its old recovery before the
    // generation ticket is minted prevents a scheduled automatic retry from superseding what the
    // user just chose, even when both asynchronous constructors finish in the opposite order.
    if (! failoverAttempt)
        failovers.erase (partId);

    const auto generation = rack.beginLoad (partId);
    if (generation == 0)
    {
        if (completion != nullptr)
            completion (false, "Unknown rack part.");
        emitError ("Unknown rack part.");
        return;
    }

    auto preloaded = takePreloadedProcessor (partId, ceId, false);
    if (preloaded == nullptr && options.instantiate == nullptr)
    {
        if (completion != nullptr)
            completion (false, "No instrument instantiator is configured.");
        emitError ("No instrument instantiator is configured.");
        return;
    }

    auto finishLoad =
        [this, aliveToken = alive, partId, generation, info,
         afterCommit = std::move (afterCommit), completion = std::move (completion)]
        (std::unique_ptr<juce::AudioProcessor> instrument, const juce::String& error,
         bool completedInstantiation)
        {
            if (! aliveToken->load())
                return;

            // Survived construction: whatever happens next is not attributable to this load.
            if (completedInstantiation && activeMarker != nullptr)
                activeMarker->clear();
            if (completedInstantiation && recovery != nullptr)
                recovery->endOperation();

            if (instrument == nullptr)
            {
                const auto message = "Could not load " + info.name
                                   + (error.isNotEmpty() ? ": " + error : juce::String());
                if (completion != nullptr)
                    completion (false, message);
                emitError (message);
                emitState();
                return;
            }

            // The replacement will tear down the old editor through the rack hook; remember
            // whether the pane was on this part so it can come straight back on the new one.
            const bool editorWasHere = (editorTargetId == partId);

            if (! rack.commitLoad (partId, generation, std::move (instrument),
                                   { info.ceId, info.modulePath, info.name, info.vendor }))
            {
                // Superseded by a newer selection, or the part left in the meantime — the
                // rack host's ticket refused it, which is the designed outcome, not a fault.
                if (completion != nullptr)
                    completion (false, "The load was superseded before it could commit.");
                emitState();
                return;
            }

            if (afterCommit != nullptr)
                if (auto* committed = rack.getInstrument (partId))
                    afterCommit (*committed);

            attachParameters (partId);
            ingestProgramList (partId);
            if (const auto* loadedPart = rack.getPerformance().findPart (partId);
                loadedPart != nullptr && loadedPart->microtuningEnabled
                    && rack.getPerformance().microtuning.enabled)
                sendMicrotuningToPart (partId, false);

            if (editorWasHere)
                showEditorFor (partId);

            if (completion != nullptr)
                completion (true, {});
            savePerformance();
            emitState();
        };

    if (preloaded != nullptr)
    {
        finishLoad (std::move (preloaded), {}, false);
        return;
    }

    // The callback can arrive after this service is gone (an async load racing shutdown);
    // the alive token is the same pattern ValueTreeBridge documents for its update check.
    if (activeMarker != nullptr)
        activeMarker->markActive (info.modulePath, info.name);
    if (recovery != nullptr)
        recovery->beginOperation ("loadInstrument", info.name);

    options.instantiate (descriptionXml, options.sampleRate, options.blockSize,
        [finishLoad = std::move (finishLoad)]
        (std::unique_ptr<juce::AudioProcessor> instrument, const juce::String& error) mutable
        {
            finishLoad (std::move (instrument), error, true);
        });
}

void InstrumentHostService::requestEffect (
    const juce::String& effectId, const juce::String& ceId,
    std::function<void (bool, const juce::String&)> completion,
    bool failoverAttempt)
{
    juce::String descriptionXml, refusal;
    ClassInfoForCommit info;

    {
        const std::scoped_lock lock (catalogLock);
        const ModuleRecord* module = nullptr;
        const auto* record = findClass (ceId, &module);

        if (record == nullptr || module == nullptr)
            refusal = "Effect not in the catalogue: " + ceId;
        else if (const auto why = module->unavailableReason(); why.isNotEmpty())
            refusal = "Module is " + why + ": " + module->path;
        else if (const auto blocked = safeModeRefusal (module->path); blocked.isNotEmpty())
        {
            refusal = record->name + " was " + blocked;
            safeModeRefusals[module->path] = blocked;
        }
        else
        {
            descriptionXml = record->descriptionXml;
            info = { record->ceId, module->path, record->name, record->vendor };
        }
    }

    if (refusal.isNotEmpty())
    {
        if (completion != nullptr)
            completion (false, refusal);
        emitError (refusal);
        emitState();
        return;
    }

    auto* effectSlot = rack.getPerformance().findEffect (effectId);
    if (effectSlot == nullptr)
    {
        if (completion != nullptr)
            completion (false, "Unknown effect.");
        emitError ("Unknown effect.");
        return;
    }

    if (! failoverAttempt)
        failovers.erase (effectId);

    rack.primeEffectSlot (effectId, { info.ceId, info.modulePath, info.name, info.vendor },
                          effectSlot->stateBlobBase64);

    const auto generation = rack.beginEffectLoad (effectId);
    auto preloaded = generation != 0 ? takePreloadedProcessor (effectId, ceId, true)
                                     : std::unique_ptr<juce::AudioProcessor>();
    if (generation == 0 || (preloaded == nullptr && options.instantiate == nullptr))
    {
        const auto message = generation == 0 ? juce::String ("Unknown effect.")
                                              : juce::String ("No instrument instantiator is configured.");
        if (completion != nullptr)
            completion (false, message);
        emitError (message);
        return;
    }

    auto finishLoad = [this, aliveToken = alive, effectId, generation, info,
                       completion = std::move (completion)]
        (std::unique_ptr<juce::AudioProcessor> effect, const juce::String& error,
         bool completedInstantiation)
        {
            if (! aliveToken->load())
                return;

            if (completedInstantiation && activeMarker != nullptr)
                activeMarker->clear();
            if (completedInstantiation && recovery != nullptr)
                recovery->endOperation();

            if (effect == nullptr)
            {
                const auto message = "Could not load " + info.name
                                   + (error.isNotEmpty() ? ": " + error : juce::String());
                if (completion != nullptr)
                    completion (false, message);
                emitError (message);
                emitState();
                return;
            }

            const bool editorWasHere = (editorTargetId == effectId);

            if (! rack.commitEffectLoad (effectId, generation, std::move (effect),
                                         { info.ceId, info.modulePath, info.name, info.vendor }))
            {
                if (completion != nullptr)
                    completion (false, "The load was superseded before it could commit.");
                emitState();   // superseded or the slot left — the ticket's designed refusal
                return;
            }

            attachParameters (effectId);

            if (editorWasHere)
                showEditorForEffect (effectId);

            if (completion != nullptr)
                completion (true, {});
            savePerformance();
            emitState();
        };

    if (preloaded != nullptr)
    {
        finishLoad (std::move (preloaded), {}, false);
        return;
    }

    if (activeMarker != nullptr)
        activeMarker->markActive (info.modulePath, info.name);
    if (recovery != nullptr)
        recovery->beginOperation ("loadEffect", info.name);

    options.instantiate (descriptionXml, options.sampleRate, options.blockSize,
        [finishLoad = std::move (finishLoad)]
        (std::unique_ptr<juce::AudioProcessor> effect, const juce::String& error) mutable
        {
            finishLoad (std::move (effect), error, true);
        });
}

juce::AudioProcessor* InstrumentHostService::targetProcessor (const juce::String& targetId) const
{
    if (auto* instrument = rack.getInstrument (targetId))
        return instrument;
    return rack.getEffect (targetId);
}

juce::String InstrumentHostService::targetClassCeId (const juce::String& targetId) const
{
    if (const auto* part = rack.getPerformance().findPart (targetId))
        return part->pluginCeId;
    if (const auto* slot = rack.getPerformance().findEffect (targetId))
        return slot->pluginCeId;
    return {};
}

juce::String InstrumentHostService::targetDisplayName (const juce::String& targetId) const
{
    if (const auto* part = rack.getPerformance().findPart (targetId))
        return part->hardware ? (part->midiOutputName.isNotEmpty() ? part->midiOutputName
                                                                   : juce::String ("Hardware"))
                              : part->pluginName;
    if (const auto* slot = rack.getPerformance().findEffect (targetId))
        return slot->pluginName;
    if (rack.getPerformance().findMacro (targetId) != nullptr)
        return "Macro";
    return {};
}

void InstrumentHostService::showEditorForEffect (const juce::String& effectId)
{
    auto* effect = rack.getEffect (effectId);
    const auto* slot = rack.getPerformance().findEffect (effectId);
    if (effect == nullptr || slot == nullptr)
    {
        hideEditor();
        return;
    }

    editorTargetId = effectId;
    if (options.editorPane.show != nullptr)
        options.editorPane.show (effectId, *effect,
                                 slot->pluginName.isNotEmpty() ? slot->pluginName
                                                               : juce::String ("Effect"));
}

void InstrumentHostService::applyMacroValue (const Macro& macro)
{
    // Macro-driven layer crossfades are audio gains in the rack, not parameter bindings.
    // Publish the value even when this macro has no ordinary fan-out targets.
    rack.setLayerMacroValue (macro.macroId, macro.value);

    // The same mapped write the page slots use — every fan-out target through the central
    // parameter path, unresolved ones skipped (and shown as such in state). Mixer and send
    // addresses ride the same fan-out; "@macro" is refused at assignment, so no loops.
    for (const auto& target : macro.targets)
        if (bindingResolves (target))
            writeMappedBinding (target, macro.value);
}

void InstrumentHostService::showEditorFor (const juce::String& partId)
{
    const auto* part = rack.getPerformance().findPart (partId);
    auto* instrument = rack.getInstrument (partId);

    if (part == nullptr || instrument == nullptr)
    {
        hideEditor();
        return;
    }

    // Docking a floating part moves the one editor back in; its window closes first.
    if (floatingEditorIds.contains (partId))
    {
        floatingEditorIds.removeString (partId);
        if (options.editorWindows.close != nullptr)
            options.editorWindows.close (partId);
    }

    editorTargetId = partId;
    if (options.editorPane.show != nullptr)
        options.editorPane.show (partId, *instrument,
                                 part->pluginName.isNotEmpty() ? part->pluginName
                                                               : juce::String ("Instrument"));
}

void InstrumentHostService::hideEditor()
{
    if (editorTargetId.isEmpty())
        return;

    editorTargetId = {};
    if (options.editorPane.hide != nullptr)
        options.editorPane.hide();
}

int InstrumentHostService::neededInputChannels() const
{
    // Only a hardware part's configured audio return asks for device inputs — an editor
    // session with no hardware parts opens no input device (and trips no OS microphone
    // permission it has no use for).
    int needed = 0;
    for (const auto& part : rack.getPerformance().parts)
        if (part.hardware && part.audioReturnChannel >= 0)
            needed = juce::jmax (needed, part.audioReturnChannel
                                           + (part.audioReturnStereo ? 2 : 1));
    return needed;
}

void InstrumentHostService::startAudio()
{
    // The simplest honest Preview Runtime: default output (inputs only where a hardware
    // return needs them), every MIDI input, the player driving the rack's graph. What
    // actually opened is reported through the state payload; explicit device selection is a
    // later step.
    const auto error = deviceManager.initialiseWithDefaultDevices (neededInputChannels(), 2);

    // The graph must know the real device shape before the wiring against the input node is
    // rebuilt — prepare runs the rewire.
    if (auto* device = deviceManager.getCurrentAudioDevice())
        rack.prepare (device->getCurrentSampleRate(), device->getCurrentBufferSizeSamples(),
                      device->getActiveInputChannels().countNumberOfSetBits());

    player.setProcessor (&rack.getGraph());
    deviceManager.addAudioCallback (&player);
    deviceManager.addMidiInputDeviceCallback ({}, &player);
    deviceManager.addMidiInputDeviceCallback ({}, &midiObserver);
    for (const auto& input : juce::MidiInput::getAvailableDevices())
        deviceManager.setMidiInputDeviceEnabled (input.identifier, true);

    audioRunning = true;

    if (error.isNotEmpty())
        emitError ("Audio device: " + error);
}

void InstrumentHostService::restartAudioIfNeeded()
{
    if (! audioRunning)
        return;

    auto* device = deviceManager.getCurrentAudioDevice();
    const auto have = device != nullptr ? device->getActiveInputChannels().countNumberOfSetBits() : 0;
    if (neededInputChannels() > have)
    {
        stopAudio();
        startAudio();
    }
}

void InstrumentHostService::emitAudioDevices()
{
    juce::Array<juce::var> outputs;
    if (auto* type = deviceManager.getCurrentDeviceTypeObject())
    {
        type->scanForDevices();
        for (const auto& name : type->getDeviceNames (false))
            outputs.add (name);
    }

    juce::Array<juce::var> midiInputs;
    for (const auto& input : juce::MidiInput::getAvailableDevices())
    {
        auto* device = new juce::DynamicObject();
        device->setProperty ("id", input.identifier);
        device->setProperty ("name", input.name);
        device->setProperty ("enabled", deviceManager.isMidiInputDeviceEnabled (input.identifier));
        midiInputs.add (juce::var (device));
    }

    // MIDI outputs ride the same on-demand answer: hardware parts pick their port here.
    juce::Array<juce::var> midiOutputs;
    const auto outputsNow = listMidiOutputsNow();
    for (const auto& id : outputsNow.getAllKeys())
    {
        auto* device = new juce::DynamicObject();
        device->setProperty ("id", id);
        device->setProperty ("name", outputsNow[id]);
        midiOutputs.add (juce::var (device));
    }

    auto* current = deviceManager.getCurrentAudioDevice();
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("outputs", outputs);
    obj->setProperty ("current", current != nullptr ? current->getName() : juce::String());
    obj->setProperty ("midiInputs", midiInputs);
    obj->setProperty ("midiOutputs", midiOutputs);
    obj->setProperty ("inputChannels", current != nullptr
                                         ? current->getActiveInputChannels().countNumberOfSetBits() : 0);

    if (options.emit != nullptr)
        options.emit ("instrumentHostAudioDevices", juce::var (obj));
}

juce::StringPairArray InstrumentHostService::listMidiOutputsNow() const
{
    if (options.listMidiOutputs != nullptr)
        return options.listMidiOutputs();

    juce::StringPairArray out;
    for (const auto& device : juce::MidiOutput::getAvailableDevices())
        out.set (device.identifier, device.name);
    return out;
}

MidiSendProcessor::Sink InstrumentHostService::openMidiOutputNow (const juce::String& deviceId,
                                                                  juce::String& errorOut) const
{
    if (options.openMidiOutput != nullptr)
        return options.openMidiOutput (deviceId, errorOut);

    auto device = juce::MidiOutput::openDevice (deviceId);
    if (device == nullptr)
    {
        errorOut = "Cannot open MIDI output.";
        return {};
    }

    // sendMessageNow from the audio thread is the pragmatic choice for a live rig's note
    // traffic — MIDI ports drain far faster than a block lasts; the shared_ptr keeps the
    // device alive as long as any sender still holds the sink.
    std::shared_ptr<juce::MidiOutput> shared (std::move (device));
    return [shared] (const juce::MidiBuffer& messages)
    {
        for (const auto metadata : messages)
            shared->sendMessageNow (metadata.getMessage());
    };
}

void InstrumentHostService::openHardwareMidi (const juce::String& partId)
{
    const auto* part = rack.getPerformance().findPart (partId);
    if (part == nullptr || ! part->hardware)
        return;

    hardwareMidiErrors.erase (partId);
    if (part->midiOutputId.isEmpty())
    {
        rack.setHardwareMidiSink (partId, {});
        return;   // not configured yet — nothing to fail
    }

    juce::String error;
    auto sink = openMidiOutputNow (part->midiOutputId, error);
    if (sink == nullptr)
    {
        rack.setHardwareMidiSink (partId, {});
        hardwareMidiErrors[partId] = (error.isNotEmpty() ? error : juce::String ("Cannot open MIDI output."))
                                       + (part->midiOutputName.isNotEmpty()
                                            ? " (" + part->midiOutputName + ")" : juce::String());
        return;
    }

    rack.setHardwareMidiSink (partId, std::move (sink));
    if (part->microtuningEnabled && rack.getPerformance().microtuning.enabled)
        sendMicrotuningToPart (partId, false);
}

bool InstrumentHostService::sendMicrotuningToPart (const juce::String& partId, bool reportError)
{
    const auto& performance = rack.getPerformance();
    const auto* part = performance.findPart (partId);
    juce::String refusal;

    if (part == nullptr)
        refusal = "Unknown rack part.";
    else if (! performance.microtuning.enabled || ! performance.microtuning.hasUsableScale())
        refusal = "No usable microtuning is enabled.";
    else if (! part->microtuningEnabled)
        refusal = "Microtuning is not enabled for that part.";
    else if (part->hardware && part->midiOutputId.isEmpty())
        refusal = "Choose a MIDI output before sending this tuning.";
    else if (part->hardware && hardwareMidiErrors.find (partId) != hardwareMidiErrors.end())
        refusal = "The part's MIDI output is not available.";
    else if (! part->hardware && ! rack.partHasInstrument (partId))
        refusal = "Load an instrument before sending this tuning.";

    if (refusal.isEmpty())
    {
        juce::MidiBuffer buffer;
        int sampleOffset = 0;
        for (const auto& message : perf::mtsSingleNoteTuningMessages (performance.microtuning))
            buffer.addEvent (message, sampleOffset++);

        if (! rack.sendPartMidi (partId, buffer))
            refusal = "The tuning could not be delivered to that part.";
    }

    if (refusal.isEmpty())
    {
        microtuningErrors.erase (partId);
        return true;
    }

    microtuningErrors[partId] = refusal;
    if (reportError)
        emitError (refusal);
    return false;
}

void InstrumentHostService::sendMicrotuningToEnabledParts()
{
    for (const auto& part : rack.getPerformance().parts)
        if (part.microtuningEnabled)
            sendMicrotuningToPart (part.partId, false);
}

void InstrumentHostService::stopAudio()
{
    stopPresetAudition();
    if (! audioRunning)
        return;

    deviceManager.removeMidiInputDeviceCallback ({}, &midiObserver);
    deviceManager.removeMidiInputDeviceCallback ({}, &player);
    deviceManager.removeAudioCallback (&player);
    player.setProcessor (nullptr);
    audioRunning = false;
}

void InstrumentHostService::ensureHostProject()
{
    if (hostProjectLoaded)
        return;
    hostProjectLoaded = true;

    options.dataDirectory.createDirectory();
    hostProject = juce::JSON::parse (hostProjectFile().loadFileAsString());

    auto* project = hostProject.getDynamicObject();
    if (project == nullptr)
    {
        hostProject = juce::var (new juce::DynamicObject());
        project = hostProject.getDynamicObject();
    }

    // Fill only what is absent, so a manifest from a newer build keeps its extra fields. The
    // appId is the one field minted rather than defaulted — a fresh GUID per project, then
    // pinned in the file forever (see setHostProject for why it is not writable).
    bool changed = false;
    const auto fillString = [&] (const char* key, const juce::String& fallback)
    {
        if (! project->hasProperty (key) || project->getProperty (key).toString().isEmpty())
        {
            project->setProperty (key, fallback);
            changed = true;
        }
    };
    fillString ("productName", "My Instrument Rack");
    fillString ("version", "1.0.0");
    if (! project->hasProperty ("publisher"))     { project->setProperty ("publisher", "");           changed = true; }
    if (! project->hasProperty ("appId"))
    {
        project->setProperty ("appId", juce::Uuid().toDashedString().toUpperCase());
        changed = true;
    }
    for (const auto* key : { "includeStandalone", "includeVst3" })
        if (! project->hasProperty (key))         { project->setProperty (key, true);                 changed = true; }

    if (changed)
        hostProjectFile().replaceWithText (juce::JSON::toString (hostProject));
}

void InstrumentHostService::emitHostProject()
{
    if (options.emit != nullptr)
        options.emit ("instrumentHostProject", hostProject);
}

void InstrumentHostService::prepareRuntime (double sampleRate, int blockSize, int numInputChannels)
{
    options.sampleRate = sampleRate;
    options.blockSize = blockSize;
    rack.prepare (sampleRate, blockSize, numInputChannels);
}

void InstrumentHostService::releaseRuntime()
{
    rack.release();
}

juce::var InstrumentHostService::captureStateVar()
{
    // The SAME Runtime State the standalone's session file holds — §18.9.4 forbids a DAW-only
    // Performance format — with the package identity added as extra root properties that an
    // older parser simply ignores.
    auto state = rack.captureState().toVar();

    const_cast<InstrumentHostService*> (this)->ensureHostProject();
    if (auto* root = state.getDynamicObject())
    {
        const auto identity = packageIdentity();
        for (const auto* key : { "packageId", "packageName", "packageVersion" })
            root->setProperty (key, identity.getProperty (key, {}));
    }

    return state;
}

void InstrumentHostService::restoreFromVar (const juce::var& state)
{
    // The catalogue must be live before part ceIds can resolve to real instruments —
    // setStateInformation can arrive before any UI has asked getState. The performance half
    // is skipped: the chunk in hand is about to replace it, and booting the factory rack
    // first would fire instantiations whose commits the replacement then refuses.
    if (! sessionRestored)
        restoreSessionImpl (false);

    Performance restored;
    if (! Performance::fromVar (state, restored))
    {
        emitError ("The saved host state could not be read; keeping the current rack.");
        return;
    }

    // A state written by a newer schema than this build understands still loads — every field
    // it does not know is simply absent — but the fact is said out loud rather than hidden.
    if ((int) state.getProperty ("schemaVersion", 1) > Performance::currentSchemaVersion)
        emitError ("This project was saved by a newer version of "
                   + state.getProperty ("packageName", "the product").toString()
                   + "; anything it added is not in this build.");

    applyPerformance (std::move (restored));
    savePerformance();
    emitState();
}

void InstrumentHostService::attachParameters (const juce::String& partId)
{
    auto* processor = targetProcessor (partId);   // a part's instrument or an effect
    if (processor == nullptr)
        return;

    PartParameters entry;
    entry.inventory = describeParameters (*processor);
    const auto& processorParameters = processor->getParameters();
    for (const auto& descriptor : entry.inventory.descriptors)
        if (juce::isPositiveAndBelow (descriptor.index, processorParameters.size()))
            if (const auto* parameter = processorParameters[descriptor.index])
                entry.lastKnownValues[descriptor.definitionId] = parameter->getValue();
    entry.sync = std::make_unique<PartParameterSync> (partId, *processor);
    partParameters[partId] = std::move (entry);

    juce::StringArray parameterIds;
    for (const auto& route : rack.getPerformance().modulationRoutes)
        if (route.targetId == partId && ! parameterIds.contains (route.parameterId))
            parameterIds.add (route.parameterId);
    for (const auto& parameterId : parameterIds)
        applyModulationTarget (partId, parameterId);
}

juce::AudioProcessorParameter* InstrumentHostService::resolveParameter (const juce::String& partId,
                                                                        const juce::String& definitionId,
                                                                        const ParameterDescriptor** descriptorOut)
{
    const auto it = partParameters.find (partId);
    if (it == partParameters.end())
        return nullptr;

    const auto* descriptor = it->second.inventory.find (definitionId);
    if (descriptor == nullptr)
        return nullptr;

    if (descriptorOut != nullptr)
        *descriptorOut = descriptor;

    auto* processor = targetProcessor (partId);
    return processor != nullptr ? processor->getParameters()[descriptor->index] : nullptr;
}

bool InstrumentHostService::virtualParameterExists (const juce::String& targetId,
                                                    const juce::String& parameterId) const
{
    const auto& performance = rack.getPerformance();
    if (parameterId == "@macro")
        return performance.findMacro (targetId) != nullptr;

    if (performance.findPart (targetId) == nullptr)
        return false;
    if (parameterId == "@gain" || parameterId == "@pan")
        return true;
    if (parameterId.startsWith ("@send:"))
        return performance.findReturn (parameterId.substring (6)) != nullptr;
    return false;
}

float InstrumentHostService::virtualParameterValue (const juce::String& targetId,
                                                    const juce::String& parameterId) const
{
    const auto& performance = rack.getPerformance();
    if (parameterId == "@macro")
    {
        const auto* macro = performance.findMacro (targetId);
        return macro != nullptr ? macro->value : 0.0f;
    }

    const auto* part = performance.findPart (targetId);
    if (part == nullptr)
        return 0.0f;
    if (parameterId == "@gain")
        return part->volume * 0.5f;                     // 0..2 linear → 0..1
    if (parameterId == "@pan")
        return (part->pan + 1.0f) * 0.5f;               // -1..+1 → 0..1
    if (parameterId.startsWith ("@send:"))
    {
        const auto returnId = parameterId.substring (6);
        for (const auto& send : part->sends)
            if (send.returnId == returnId)
                return send.level * 0.5f;
    }
    return 0.0f;
}

juce::String InstrumentHostService::virtualParameterText (const juce::String& targetId,
                                                          const juce::String& parameterId) const
{
    const auto value = virtualParameterValue (targetId, parameterId);
    if (parameterId == "@macro")
        return juce::String (juce::roundToInt (value * 100.0f)) + "%";
    if (parameterId == "@pan")
    {
        const auto pan = value * 2.0f - 1.0f;
        if (std::abs (pan) < 0.005f)
            return "C";
        return (pan < 0 ? "L" : "R") + juce::String (std::abs (pan), 2);
    }
    return juce::String (value * 2.0f, 2);              // gains and sends read linear
}

juce::String InstrumentHostService::virtualParameterName (const juce::String& targetId,
                                                          const juce::String& parameterId) const
{
    if (parameterId == "@macro")
    {
        const auto* macro = rack.getPerformance().findMacro (targetId);
        return macro != nullptr && macro->name.isNotEmpty() ? macro->name : juce::String ("Macro");
    }
    if (parameterId == "@gain")
        return "Level";
    if (parameterId == "@pan")
        return "Pan";
    if (parameterId.startsWith ("@send:"))
    {
        const auto* chain = rack.getPerformance().findReturn (parameterId.substring (6));
        return "Send — " + (chain != nullptr && chain->name.isNotEmpty() ? chain->name
                                                                          : juce::String ("gone"));
    }
    return parameterId;
}

float InstrumentHostService::virtualParameterDefault (const juce::String& parameterId)
{
    if (parameterId == "@gain")
        return 0.5f;    // unity
    if (parameterId == "@pan")
        return 0.5f;    // centre
    return 0.0f;        // sends and macros rest at zero
}

void InstrumentHostService::setVirtualParameter (const juce::String& targetId,
                                                 const juce::String& parameterId, float normalized)
{
    const auto value = juce::jlimit (0.0f, 1.0f, normalized);

    if (parameterId == "@macro")
    {
        if (auto* macro = rack.findMutableMacro (targetId))
        {
            macro->value = value;
            applyMacroValue (*macro);
            setModulationSourceValue ("macro", macro->macroId, 0, 0, value);
        }
        return;
    }

    if (parameterId == "@gain")
        rack.setVolume (targetId, value * 2.0f);
    else if (parameterId == "@pan")
        rack.setPan (targetId, value * 2.0f - 1.0f);
    else if (parameterId.startsWith ("@send:"))
        rack.setSendLevel (targetId, parameterId.substring (6), value * 2.0f);
}

bool InstrumentHostService::validModulationSourceType (const juce::String& sourceType)
{
    static const juce::StringArray sourceTypes {
        "velocity", "modWheel", "expression", "channelPressure",
        "polyAftertouch", "pitchBend", "midiCc", "macro", "lfo", "envelope", "mseg",
        "random"
    };
    return sourceTypes.contains (sourceType);
}

juce::String InstrumentHostService::modulationSourceKey (const juce::String& sourceType,
                                                         const juce::String& sourceId,
                                                         int channel, int number)
{
    return sourceType + "|" + sourceId + "|" + juce::String (channel)
                      + "|" + juce::String (number);
}

bool InstrumentHostService::modulationRouteResolves (const ModulationRoute& route)
{
    if (! validModulationSourceType (route.sourceType))
        return false;

    if (route.sourceType == "macro"
        && rack.getPerformance().findMacro (route.sourceId) == nullptr)
        return false;
    if (route.sourceType == "lfo"
        && rack.getPerformance().findMidiLfo (route.sourceId) == nullptr)
        return false;
    if (route.sourceType == "envelope"
        && rack.getPerformance().findEnvelope (route.sourceId) == nullptr)
        return false;
    if (route.sourceType == "mseg"
        && rack.getPerformance().findMseg (route.sourceId) == nullptr)
        return false;
    if (route.sourceType == "random"
        && rack.getPerformance().findRandomModulator (route.sourceId) == nullptr)
        return false;
    if (route.parameterId == "@macro"
        && route.sourceType != "lfo" && route.sourceType != "envelope"
        && route.sourceType != "mseg" && route.sourceType != "random")
        return false;

    if (! isVirtualParameterId (route.parameterId)
        && route.targetCeId != targetClassCeId (route.targetId))
        return false;

    return targetParameterExists (route.targetId, route.parameterId);
}

float InstrumentHostService::modulationSourceValue (const ModulationRoute& route) const
{
    if (route.sourceType == "macro")
    {
        const auto* macro = rack.getPerformance().findMacro (route.sourceId);
        return macro != nullptr ? macro->value : 0.0f;
    }

    if (route.sourceType == "lfo")
    {
        const auto key = modulationSourceKey ("lfo", route.sourceId, 0, 0);
        if (const auto found = modulationSourceValues.find (key); found != modulationSourceValues.end())
            return found->second;
        return 0.0f;
    }

    if (route.sourceType == "envelope")
    {
        const auto key = modulationSourceKey ("envelope", route.sourceId, 0, 0);
        if (const auto found = modulationSourceValues.find (key); found != modulationSourceValues.end())
            return found->second;
        return 0.0f;
    }

    if (route.sourceType == "mseg")
    {
        const auto key = modulationSourceKey ("mseg", route.sourceId, 0, 0);
        if (const auto found = modulationSourceValues.find (key); found != modulationSourceValues.end())
            return found->second;
        return 0.0f;
    }

    if (route.sourceType == "random")
    {
        const auto key = modulationSourceKey ("random", route.sourceId, 0, 0);
        if (const auto found = modulationSourceValues.find (key); found != modulationSourceValues.end())
            return found->second;
        return 0.0f;
    }

    const auto key = modulationSourceKey (route.sourceType, {}, route.sourceChannel,
                                          route.sourceType == "midiCc" ? route.sourceNumber : 0);
    if (const auto found = modulationSourceValues.find (key); found != modulationSourceValues.end())
        return found->second;
    return route.sourceType == "pitchBend" ? 0.5f : 0.0f;
}

void InstrumentHostService::writeTargetValueRaw (const juce::String& targetId,
                                                  const juce::String& parameterId,
                                                  float value, bool wrapGesture)
{
    const auto normalized = juce::jlimit (0.0f, 1.0f, value);
    if (isVirtualParameterId (parameterId))
    {
        setVirtualParameter (targetId, parameterId, normalized);
        return;
    }

    if (auto* parameter = resolveParameter (targetId, parameterId))
    {
        parametersWrittenByUs.addIfNotAlreadyThere (parameterId);
        if (wrapGesture)
            parameter->beginChangeGesture();
        parameter->setValueNotifyingHost (normalized);
        if (const auto found = partParameters.find (targetId); found != partParameters.end())
            found->second.lastKnownValues[parameterId] = parameter->getValue();
        if (wrapGesture)
            parameter->endChangeGesture();
    }
}

bool InstrumentHostService::updateModulationBase (const juce::String& targetId,
                                                   const juce::String& parameterId, float value)
{
    bool found = false;
    auto& routes = const_cast<Performance&> (rack.getPerformance()).modulationRoutes;
    for (auto& route : routes)
        if (route.targetId == targetId && route.parameterId == parameterId)
        {
            if (! isVirtualParameterId (parameterId)
                && route.targetCeId != targetClassCeId (targetId))
                continue;
            route.baseValue = juce::jlimit (0.0f, 1.0f, value);
            found = true;
        }
    return found;
}

void InstrumentHostService::writeTargetBaseValue (const juce::String& targetId,
                                                   const juce::String& parameterId,
                                                   float value, bool wrapGesture)
{
    if (! applyingModulation && updateModulationBase (targetId, parameterId, value))
    {
        auto* parameter = wrapGesture && ! isVirtualParameterId (parameterId)
                            ? resolveParameter (targetId, parameterId) : nullptr;
        if (parameter != nullptr)
            parameter->beginChangeGesture();
        applyModulationTarget (targetId, parameterId);
        if (parameter != nullptr)
            parameter->endChangeGesture();
        return;
    }
    writeTargetValueRaw (targetId, parameterId, value, wrapGesture);
}

void InstrumentHostService::applyModulationTarget (const juce::String& targetId,
                                                    const juce::String& parameterId)
{
    const auto& routes = rack.getPerformance().modulationRoutes;
    const ModulationRoute* baseRoute = nullptr;
    float contribution = 0.0f;
    for (const auto& route : routes)
    {
        if (route.targetId != targetId || route.parameterId != parameterId)
            continue;
        const auto destinationResolves = (isVirtualParameterId (route.parameterId)
              || route.targetCeId == targetClassCeId (route.targetId))
          && targetParameterExists (route.targetId, route.parameterId);
        if (! destinationResolves)
            continue;
        if (baseRoute == nullptr)
            baseRoute = &route;
        if (! route.enabled || ! modulationRouteResolves (route))
            continue;

        auto source = modulationSourceValue (route);
        if (route.sourceType == "pitchBend")
            source = source * 2.0f - 1.0f;
        contribution += route.amount * source;
    }

    if (baseRoute == nullptr)
        return;

    const juce::ScopedValueSetter<bool> guard (applyingModulation, true);
    writeTargetValueRaw (targetId, parameterId,
                         juce::jlimit (0.0f, 1.0f, baseRoute->baseValue + contribution));
}

void InstrumentHostService::applyAllModulationRoutes()
{
    juce::StringArray targets;
    for (const auto& route : rack.getPerformance().modulationRoutes)
    {
        const auto key = route.targetId + "\n" + route.parameterId;
        if (! targets.contains (key))
            targets.add (key);
    }
    for (const auto& key : targets)
        applyModulationTarget (key.upToFirstOccurrenceOf ("\n", false, false),
                               key.fromFirstOccurrenceOf ("\n", false, false));
}

void InstrumentHostService::setModulationSourceValue (const juce::String& sourceType,
                                                       const juce::String& sourceId,
                                                       int channel, int number, float value)
{
    const auto normalized = juce::jlimit (0.0f, 1.0f, value);
    const auto sourceNumber = sourceType == "midiCc" ? juce::jlimit (0, 127, number) : 0;
    modulationSourceValues[modulationSourceKey (sourceType, sourceId, channel, sourceNumber)] = normalized;
    if (channel != 0)
        modulationSourceValues[modulationSourceKey (sourceType, sourceId, 0, sourceNumber)] = normalized;

    juce::StringArray targets;
    for (const auto& route : rack.getPerformance().modulationRoutes)
    {
        if (route.sourceType != sourceType || route.sourceId != sourceId
            || (route.sourceChannel != 0 && route.sourceChannel != channel)
            || (sourceType == "midiCc" && route.sourceNumber != sourceNumber))
            continue;
        const auto key = route.targetId + "\n" + route.parameterId;
        if (! targets.contains (key))
            targets.add (key);
    }
    for (const auto& key : targets)
        applyModulationTarget (key.upToFirstOccurrenceOf ("\n", false, false),
                               key.fromFirstOccurrenceOf ("\n", false, false));
}

bool InstrumentHostService::validMidiLfoShape (const juce::String& shape)
{
    static const juce::StringArray shapes {
        "sine", "triangle", "sawUp", "sawDown", "square", "sampleHold"
    };
    return shapes.contains (shape);
}

bool InstrumentHostService::validMidiLfoOutputType (const juce::String& type)
{
    static const juce::StringArray types { "cc", "nrpn", "sysex" };
    return types.contains (type);
}

float InstrumentHostService::evaluateMidiLfo (const MidiLfo& lfo, MidiLfoRuntime& runtime,
                                               double nowSeconds)
{
    const auto& transport = rack.getEngine().getTransport();
    if (! runtime.initialized)
    {
        runtime.initialized = true;
        runtime.lastSeconds = nowSeconds;
    }

    const auto elapsed = juce::jlimit (0.0, 1.0, nowSeconds - runtime.lastSeconds);
    runtime.lastSeconds = nowSeconds;
    if (lfo.sync && transport.isPlaying())
    {
        const auto origin = runtime.retriggered ? runtime.syncOriginPpq : 0.0;
        runtime.cycles = (transport.getPositionPpq() - origin)
                           / juce::jmax (0.03125, lfo.syncBeats);
    }
    else
    {
        const auto cyclesPerSecond = lfo.sync
          ? transport.getTempo() / (60.0 * juce::jmax (0.03125, lfo.syncBeats))
          : juce::jmax (0.01, lfo.rateHz);
        runtime.cycles += elapsed * cyclesPerSecond;
    }

    const auto cycleWithOffset = runtime.cycles + (double) lfo.phaseOffset;
    auto phase = cycleWithOffset - std::floor (cycleWithOffset);
    if (phase < 0.0)
        phase += 1.0;
    runtime.phase = (float) phase;

    float shape = 0.0f;
    if (lfo.shape == "triangle")
        shape = (float) (1.0 - std::abs (phase * 2.0 - 1.0));
    else if (lfo.shape == "sawUp")
        shape = (float) phase;
    else if (lfo.shape == "sawDown")
        shape = (float) (1.0 - phase);
    else if (lfo.shape == "square")
        shape = phase < 0.5 ? 0.0f : 1.0f;
    else if (lfo.shape == "sampleHold")
    {
        // A stable hash of oscillator identity and cycle: seeking the DAW playhead produces
        // the same held value again instead of consuming an unrelated random stream.
        auto bits = (std::uint64_t) lfo.lfoId.hashCode64()
                  ^ ((std::uint64_t) (std::int64_t) std::floor (cycleWithOffset)
                     * UINT64_C (0x9e3779b97f4a7c15));
        bits ^= bits >> 30;
        bits *= UINT64_C (0xbf58476d1ce4e5b9);
        bits ^= bits >> 27;
        bits *= UINT64_C (0x94d049bb133111eb);
        bits ^= bits >> 31;
        shape = (float) (bits & UINT64_C (0x00ffffff)) / 16777215.0f;
    }
    else
        shape = (float) (0.5 - 0.5 * std::cos (juce::MathConstants<double>::twoPi * phase));

    runtime.value = juce::jlimit (0.0f, 1.0f,
                                  lfo.minimum + shape * (lfo.maximum - lfo.minimum));
    return runtime.value;
}

bool InstrumentHostService::buildMidiLfoSysEx (const juce::String& text, int value7,
                                               int value14, juce::MidiMessage& message)
{
    juce::StringArray tokens;
    tokens.addTokens (text.trim(), " ,;\t\r\n", "");
    tokens.removeEmptyStrings();
    if (tokens.size() < 3 || tokens.size() > 258)
        return false;

    std::vector<juce::uint8> bytes;
    bytes.reserve ((size_t) tokens.size());
    for (auto token : tokens)
    {
        int byte = -1;
        if (token.equalsIgnoreCase ("{value7}"))
            byte = juce::jlimit (0, 127, value7);
        else if (token.equalsIgnoreCase ("{valueMSB}"))
            byte = (juce::jlimit (0, 16383, value14) >> 7) & 0x7f;
        else if (token.equalsIgnoreCase ("{valueLSB}"))
            byte = juce::jlimit (0, 16383, value14) & 0x7f;
        else
        {
            if (token.startsWithIgnoreCase ("0x"))
                token = token.substring (2);
            if (token.isEmpty() || token.length() > 2
                || ! token.containsOnly ("0123456789abcdefABCDEF"))
                return false;
            byte = token.getHexValue32();
        }
        if (! juce::isPositiveAndBelow (byte, 256))
            return false;
        bytes.push_back ((juce::uint8) byte);
    }

    if (bytes.front() != 0xf0 || bytes.back() != 0xf7)
        return false;
    for (size_t i = 1; i + 1 < bytes.size(); ++i)
        if (bytes[i] >= 0x80)
            return false;

    message = juce::MidiMessage::createSysExMessage (bytes.data() + 1,
                                                      (int) bytes.size() - 2);
    return true;
}

void InstrumentHostService::sendMidiLfoOutputs (const MidiLfo& lfo, float value,
                                                 double nowSeconds)
{
    const auto value7 = juce::jlimit (0, 127, juce::roundToInt (value * 127.0f));
    const auto value14 = juce::jlimit (0, 16383, juce::roundToInt (value * 16383.0f));
    for (const auto& output : lfo.outputs)
    {
        if (! output.enabled)
            continue;
        const auto* part = rack.getPerformance().findPart (output.targetPartId);
        if (part == nullptr || ! part->hardware)
            continue;

        const auto sentValue = output.type == "cc" ? value7 : value14;
        const auto previous = midiLfoLastSentValue.find (output.outputId);
        if (previous != midiLfoLastSentValue.end() && previous->second == sentValue)
            continue;
        const auto minimumInterval = output.type == "sysex" ? 0.1 : 0.025;
        const auto previousTime = midiLfoLastSentSeconds.find (output.outputId);
        if (previousTime != midiLfoLastSentSeconds.end()
            && nowSeconds - previousTime->second < minimumInterval)
            continue;

        juce::MidiBuffer messages;
        if (output.type == "cc")
        {
            messages.addEvent (juce::MidiMessage::controllerEvent (
                output.channel, juce::jlimit (0, 127, output.number), value7), 0);
        }
        else if (output.type == "nrpn")
        {
            const auto number = juce::jlimit (0, 16383, output.number);
            messages.addEvent (juce::MidiMessage::controllerEvent (output.channel, 99,
                                                                    (number >> 7) & 0x7f), 0);
            messages.addEvent (juce::MidiMessage::controllerEvent (output.channel, 98,
                                                                    number & 0x7f), 0);
            messages.addEvent (juce::MidiMessage::controllerEvent (output.channel, 6,
                                                                    (value14 >> 7) & 0x7f), 0);
            messages.addEvent (juce::MidiMessage::controllerEvent (output.channel, 38,
                                                                    value14 & 0x7f), 0);
        }
        else
        {
            juce::MidiMessage sysex;
            if (! buildMidiLfoSysEx (output.sysexTemplate, value7, value14, sysex))
                continue;
            messages.addEvent (sysex, 0);
        }

        if (rack.sendHardwareMidi (output.targetPartId, messages))
        {
            midiLfoLastSentValue[output.outputId] = sentValue;
            midiLfoLastSentSeconds[output.outputId] = nowSeconds;
        }
    }
}

void InstrumentHostService::emitMidiLfoActivity()
{
    if (options.emit == nullptr)
        return;
    juce::Array<juce::var> values;
    for (const auto& lfo : rack.getPerformance().midiLfos)
    {
        const auto found = midiLfoRuntimes.find (lfo.lfoId);
        auto* item = new juce::DynamicObject();
        item->setProperty ("lfoId", lfo.lfoId);
        item->setProperty ("phase", found != midiLfoRuntimes.end() ? found->second.phase : 0.0f);
        item->setProperty ("value", found != midiLfoRuntimes.end() ? found->second.value : 0.0f);
        values.add (juce::var (item));
    }
    juce::Array<juce::var> macros;
    for (const auto& macro : rack.getPerformance().macros)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("macroId", macro.macroId);
        item->setProperty ("value", macro.value);
        macros.add (juce::var (item));
    }
    auto* payload = new juce::DynamicObject();
    payload->setProperty ("lfos", values);
    payload->setProperty ("macros", macros);
    options.emit ("instrumentHostLfoActivity", juce::var (payload));
}

void InstrumentHostService::tickMidiLfos()
{
    const auto nowSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
    juce::StringArray liveIds;
    for (const auto& lfo : rack.getPerformance().midiLfos)
    {
        liveIds.add (lfo.lfoId);
        auto& runtime = midiLfoRuntimes[lfo.lfoId];
        const auto value = lfo.enabled ? evaluateMidiLfo (lfo, runtime, nowSeconds) : 0.0f;
        if (! lfo.enabled)
        {
            runtime.value = 0.0f;
            runtime.lastSeconds = nowSeconds;
        }

        const auto key = modulationSourceKey ("lfo", lfo.lfoId, 0, 0);
        const auto previous = modulationSourceValues.find (key);
        if (previous == modulationSourceValues.end() || std::abs (previous->second - value) > 0.0001f)
            setModulationSourceValue ("lfo", lfo.lfoId, 0, 0, value);
        if (lfo.enabled)
            sendMidiLfoOutputs (lfo, value, nowSeconds);
    }

    for (auto it = midiLfoRuntimes.begin(); it != midiLfoRuntimes.end();)
        it = liveIds.contains (it->first) ? std::next (it) : midiLfoRuntimes.erase (it);

    if (! liveIds.isEmpty() && nowSeconds - lastMidiLfoActivitySeconds >= 0.05)
    {
        lastMidiLfoActivitySeconds = nowSeconds;
        emitMidiLfoActivity();
    }
}

float InstrumentHostService::shapeEnvelopeProgress (float progress, float curve, bool falling)
{
    const auto p = juce::jlimit (0.0f, 1.0f, progress);
    const auto exponent = std::pow (4.0f, juce::jlimit (-1.0f, 1.0f, curve));
    return falling ? 1.0f - std::pow (1.0f - p, exponent)
                   : std::pow (p, exponent);
}

const char* InstrumentHostService::envelopeStageName (EnvelopeRuntime::Stage stage)
{
    switch (stage)
    {
        case EnvelopeRuntime::Stage::attack:  return "attack";
        case EnvelopeRuntime::Stage::decay:   return "decay";
        case EnvelopeRuntime::Stage::sustain: return "sustain";
        case EnvelopeRuntime::Stage::release: return "release";
        case EnvelopeRuntime::Stage::idle:    break;
    }
    return "idle";
}

void InstrumentHostService::triggerEnvelopeAttack (const EnvelopeGenerator& envelope,
                                                    EnvelopeRuntime& runtime, float velocity)
{
    runtime.stage = EnvelopeRuntime::Stage::attack;
    runtime.stageElapsed = 0.0;
    runtime.stageStartValue = runtime.value;
    runtime.peak = juce::jlimit (0.0f, 1.0f,
        1.0f - envelope.velocityAmount
          + envelope.velocityAmount * juce::jlimit (0.0f, 1.0f, velocity));
    runtime.progress = 0.0f;
}

void InstrumentHostService::triggerEnvelopeRelease (EnvelopeRuntime& runtime)
{
    if (runtime.stage == EnvelopeRuntime::Stage::idle
        || runtime.stage == EnvelopeRuntime::Stage::release)
        return;
    runtime.stage = EnvelopeRuntime::Stage::release;
    runtime.stageElapsed = 0.0;
    runtime.stageStartValue = runtime.value;
    runtime.progress = 0.0f;
}

void InstrumentHostService::noteEnvelopeGate (int channel, int note, bool on, float velocity)
{
    const auto key = juce::jlimit (1, 16, channel) * 128 + juce::jlimit (0, 127, note);
    for (const auto& envelope : rack.getPerformance().envelopes)
    {
        if (! envelope.enabled
            || (envelope.channel != 0 && envelope.channel != channel)
            || note < envelope.noteLow || note > envelope.noteHigh)
            continue;

        auto& runtime = envelopeRuntimes[envelope.envelopeId];
        if (on)
        {
            const auto wasEmpty = runtime.heldNotes.empty();
            runtime.heldNotes.insert (key);
            if (envelope.retrigger || wasEmpty)
                triggerEnvelopeAttack (envelope, runtime, velocity);
        }
        else
        {
            runtime.heldNotes.erase (key);
            if (runtime.heldNotes.empty())
                triggerEnvelopeRelease (runtime);
        }
    }
}

float InstrumentHostService::advanceEnvelope (const EnvelopeGenerator& envelope,
                                              EnvelopeRuntime& runtime, double nowSeconds)
{
    if (! runtime.initialized)
    {
        runtime.initialized = true;
        runtime.lastSeconds = nowSeconds;
    }
    auto remaining = juce::jlimit (0.0, 1.0, nowSeconds - runtime.lastSeconds);
    runtime.lastSeconds = nowSeconds;

    // Consume the whole elapsed slice, even when a very short attack and decay both finish
    // inside one 30 Hz control tick. The loop is bounded by the four possible transitions.
    for (int transitions = 0; transitions < 5; ++transitions)
    {
        if (runtime.stage == EnvelopeRuntime::Stage::idle)
        {
            runtime.value = 0.0f;
            runtime.progress = 0.0f;
            break;
        }
        if (runtime.stage == EnvelopeRuntime::Stage::sustain)
        {
            runtime.value = runtime.peak * envelope.sustain;
            runtime.progress = 1.0f;
            break;
        }

        const auto duration = 0.001 * (runtime.stage == EnvelopeRuntime::Stage::attack
                                         ? envelope.attackMs
                                         : runtime.stage == EnvelopeRuntime::Stage::decay
                                             ? envelope.decayMs : envelope.releaseMs);
        if (duration <= 0.0)
        {
            runtime.progress = 1.0f;
        }
        else
        {
            const auto available = juce::jmax (0.0, duration - runtime.stageElapsed);
            const auto consumed = juce::jmin (remaining, available);
            runtime.stageElapsed += consumed;
            remaining -= consumed;
            runtime.progress = (float) juce::jlimit (0.0, 1.0, runtime.stageElapsed / duration);
        }

        if (runtime.stage == EnvelopeRuntime::Stage::attack)
        {
            const auto shaped = shapeEnvelopeProgress (runtime.progress, envelope.curve, false);
            runtime.value = runtime.stageStartValue
                          + (runtime.peak - runtime.stageStartValue) * shaped;
            if (runtime.progress >= 1.0f)
            {
                runtime.value = runtime.peak;
                runtime.stage = EnvelopeRuntime::Stage::decay;
                runtime.stageElapsed = 0.0;
                runtime.stageStartValue = runtime.peak;
                runtime.progress = 0.0f;
                continue;
            }
        }
        else if (runtime.stage == EnvelopeRuntime::Stage::decay)
        {
            const auto target = runtime.peak * envelope.sustain;
            const auto shaped = shapeEnvelopeProgress (runtime.progress, envelope.curve, true);
            runtime.value = runtime.stageStartValue + (target - runtime.stageStartValue) * shaped;
            if (runtime.progress >= 1.0f)
            {
                runtime.value = target;
                runtime.stage = runtime.heldNotes.empty() ? EnvelopeRuntime::Stage::release
                                                           : EnvelopeRuntime::Stage::sustain;
                runtime.stageElapsed = 0.0;
                runtime.stageStartValue = runtime.value;
                runtime.progress = 0.0f;
                continue;
            }
        }
        else
        {
            const auto shaped = shapeEnvelopeProgress (runtime.progress, envelope.curve, true);
            runtime.value = runtime.stageStartValue * (1.0f - shaped);
            if (runtime.progress >= 1.0f)
            {
                runtime.value = 0.0f;
                runtime.stage = EnvelopeRuntime::Stage::idle;
                runtime.stageElapsed = 0.0;
                runtime.progress = 0.0f;
                continue;
            }
        }
        break;
    }

    runtime.value = juce::jlimit (0.0f, 1.0f, runtime.value);
    return runtime.value;
}

void InstrumentHostService::emitEnvelopeActivity()
{
    if (options.emit == nullptr)
        return;
    juce::Array<juce::var> values;
    for (const auto& envelope : rack.getPerformance().envelopes)
    {
        const auto found = envelopeRuntimes.find (envelope.envelopeId);
        auto* item = new juce::DynamicObject();
        item->setProperty ("envelopeId", envelope.envelopeId);
        item->setProperty ("stage", found != envelopeRuntimes.end()
                                      ? envelopeStageName (found->second.stage) : "idle");
        item->setProperty ("progress", found != envelopeRuntimes.end()
                                         ? found->second.progress : 0.0f);
        item->setProperty ("value", found != envelopeRuntimes.end()
                                      ? found->second.value : 0.0f);
        item->setProperty ("gate", found != envelopeRuntimes.end()
                                     && ! found->second.heldNotes.empty());
        values.add (juce::var (item));
    }
    juce::Array<juce::var> macros;
    for (const auto& macro : rack.getPerformance().macros)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("macroId", macro.macroId);
        item->setProperty ("value", macro.value);
        macros.add (juce::var (item));
    }
    auto* payload = new juce::DynamicObject();
    payload->setProperty ("envelopes", values);
    payload->setProperty ("macros", macros);
    options.emit ("instrumentHostEnvelopeActivity", juce::var (payload));
}

void InstrumentHostService::tickEnvelopeGenerators()
{
    const auto nowSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
    juce::StringArray liveIds;
    for (const auto& envelope : rack.getPerformance().envelopes)
    {
        liveIds.add (envelope.envelopeId);
        auto& runtime = envelopeRuntimes[envelope.envelopeId];
        const auto value = envelope.enabled ? advanceEnvelope (envelope, runtime, nowSeconds) : 0.0f;
        if (! envelope.enabled)
        {
            runtime = {};
            runtime.lastSeconds = nowSeconds;
        }
        const auto key = modulationSourceKey ("envelope", envelope.envelopeId, 0, 0);
        const auto previous = modulationSourceValues.find (key);
        if (previous == modulationSourceValues.end() || std::abs (previous->second - value) > 0.0001f)
            setModulationSourceValue ("envelope", envelope.envelopeId, 0, 0, value);
    }

    for (auto it = envelopeRuntimes.begin(); it != envelopeRuntimes.end();)
        it = liveIds.contains (it->first) ? std::next (it) : envelopeRuntimes.erase (it);

    if (! liveIds.isEmpty() && nowSeconds - lastEnvelopeActivitySeconds >= 0.05)
    {
        lastEnvelopeActivitySeconds = nowSeconds;
        emitEnvelopeActivity();
    }
}

float InstrumentHostService::evaluateMseg (const MsegGenerator& mseg, MsegRuntime& runtime,
                                            double nowSeconds)
{
    const auto& transport = rack.getEngine().getTransport();
    if (! runtime.initialized)
    {
        runtime.initialized = true;
        runtime.lastSeconds = nowSeconds;
    }

    const auto elapsed = juce::jlimit (0.0, 1.0, nowSeconds - runtime.lastSeconds);
    runtime.lastSeconds = nowSeconds;
    if (mseg.sync && transport.isPlaying())
        runtime.cycles = transport.getPositionPpq() / juce::jmax (0.03125, mseg.syncBeats);
    else
    {
        const auto cyclesPerSecond = mseg.sync
          ? transport.getTempo() / (60.0 * juce::jmax (0.03125, mseg.syncBeats))
          : juce::jmax (0.01, mseg.rateHz);
        runtime.cycles += elapsed * cyclesPerSecond;
    }

    const auto withOffset = runtime.cycles + (double) mseg.phaseOffset;
    auto phase = withOffset - std::floor (withOffset);
    if (phase < 0.0)
        phase += 1.0;
    runtime.phase = (float) phase;

    if (mseg.points.isEmpty())
    {
        runtime.value = 0.0f;
        return runtime.value;
    }

    auto value = mseg.points.getFirst().value;
    for (int i = 1; i < mseg.points.size(); ++i)
    {
        const auto& left = mseg.points.getReference (i - 1);
        const auto& right = mseg.points.getReference (i);
        if (phase > right.position)
        {
            value = right.value;
            continue;
        }
        const auto span = right.position - left.position;
        if (span <= 0.000001f)
            value = right.value;
        else
        {
            const auto progress = juce::jlimit (0.0f, 1.0f,
                ((float) phase - left.position) / span);
            const auto exponent = std::pow (4.0f, juce::jlimit (-1.0f, 1.0f, right.curve));
            const auto shaped = std::pow (progress, exponent);
            value = left.value + (right.value - left.value) * shaped;
        }
        break;
    }
    runtime.value = juce::jlimit (0.0f, 1.0f, value);
    return runtime.value;
}

void InstrumentHostService::emitMsegActivity()
{
    if (options.emit == nullptr)
        return;
    juce::Array<juce::var> values;
    for (const auto& mseg : rack.getPerformance().msegs)
    {
        const auto found = msegRuntimes.find (mseg.msegId);
        auto* item = new juce::DynamicObject();
        item->setProperty ("msegId", mseg.msegId);
        item->setProperty ("phase", found != msegRuntimes.end() ? found->second.phase : 0.0f);
        item->setProperty ("value", found != msegRuntimes.end() ? found->second.value : 0.0f);
        values.add (juce::var (item));
    }
    juce::Array<juce::var> macros;
    for (const auto& macro : rack.getPerformance().macros)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("macroId", macro.macroId);
        item->setProperty ("value", macro.value);
        macros.add (juce::var (item));
    }
    auto* payload = new juce::DynamicObject();
    payload->setProperty ("msegs", values);
    payload->setProperty ("macros", macros);
    options.emit ("instrumentHostMsegActivity", juce::var (payload));
}

void InstrumentHostService::tickMsegs()
{
    const auto nowSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
    juce::StringArray liveIds;
    for (const auto& mseg : rack.getPerformance().msegs)
    {
        liveIds.add (mseg.msegId);
        auto& runtime = msegRuntimes[mseg.msegId];
        const auto value = mseg.enabled ? evaluateMseg (mseg, runtime, nowSeconds) : 0.0f;
        if (! mseg.enabled)
        {
            runtime.value = 0.0f;
            runtime.lastSeconds = nowSeconds;
        }
        const auto key = modulationSourceKey ("mseg", mseg.msegId, 0, 0);
        const auto previous = modulationSourceValues.find (key);
        if (previous == modulationSourceValues.end() || std::abs (previous->second - value) > 0.0001f)
            setModulationSourceValue ("mseg", mseg.msegId, 0, 0, value);
    }

    for (auto it = msegRuntimes.begin(); it != msegRuntimes.end();)
        it = liveIds.contains (it->first) ? std::next (it) : msegRuntimes.erase (it);

    if (! liveIds.isEmpty() && nowSeconds - lastMsegActivitySeconds >= 0.05)
    {
        lastMsegActivitySeconds = nowSeconds;
        emitMsegActivity();
    }
}

bool InstrumentHostService::validRandomModulatorMode (const juce::String& mode)
{
    static const juce::StringArray modes {
        "sampleHold", "smoothRandom", "chaos", "randomWalk"
    };
    return modes.contains (mode);
}

float InstrumentHostService::deterministicRandomUnit (int seed, std::int64_t step,
                                                       std::uint32_t salt)
{
    auto x = static_cast<std::uint32_t> (seed) ^ salt;
    x ^= static_cast<std::uint32_t> (step) * 0x9e3779b9u;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return static_cast<float> (x & 0x00ffffffu) / 16777215.0f;
}

float InstrumentHostService::evaluateRandomModulator (const RandomModulator& random,
                                                        RandomModulatorRuntime& runtime,
                                                        double nowSeconds)
{
    const auto& transport = rack.getEngine().getTransport();
    if (! runtime.initialized)
    {
        runtime.initialized = true;
        runtime.lastSeconds = nowSeconds;
        runtime.chaosValue = 0.05f + 0.9f * deterministicRandomUnit (
            random.seed, 0, 0x68bc21ebu);
    }

    const auto elapsed = juce::jlimit (0.0, 1.0, nowSeconds - runtime.lastSeconds);
    runtime.lastSeconds = nowSeconds;
    if (random.sync && transport.isPlaying())
        runtime.cycles = transport.getPositionPpq() / juce::jmax (0.03125, random.syncBeats);
    else
    {
        const auto decisionsPerSecond = random.sync
          ? transport.getTempo() / (60.0 * juce::jmax (0.03125, random.syncBeats))
          : juce::jmax (0.01, random.rateHz);
        runtime.cycles += elapsed * decisionsPerSecond;
    }

    const auto boundedCycles = juce::jmax (0.0, runtime.cycles);
    const auto stepIndex = static_cast<std::int64_t> (std::floor (boundedCycles));
    runtime.phase = static_cast<float> (boundedCycles - std::floor (boundedCycles));

    // A transport seek must give the same result every time. Stateful modes replay at most
    // 4096 deterministic decisions; very large seeks start from a documented neutral value
    // near the destination rather than spending an unbounded amount of the control tick.
    if (stepIndex < runtime.step || runtime.step < stepIndex - 4096)
    {
        runtime.step = juce::jmax<std::int64_t> (-1, stepIndex - 4096);
        runtime.previous = runtime.target = 0.5f;
        runtime.walkValue = 0.5f;
        runtime.chaosValue = 0.05f + 0.9f * deterministicRandomUnit (
            random.seed, runtime.step + 1, 0x68bc21ebu);
    }

    while (runtime.step < stepIndex)
    {
        const auto nextStep = runtime.step + 1;
        const auto decision = deterministicRandomUnit (random.seed, nextStep, 0xa341316cu);
        const auto changes = random.probability >= 1.0f || decision < random.probability;

        if (random.mode == "smoothRandom")
        {
            runtime.previous = runtime.target;
            if (changes)
                runtime.target = deterministicRandomUnit (random.seed, nextStep, 0xc8013ea4u);
        }
        else if (random.mode == "chaos")
        {
            if (changes)
            {
                const auto intensity = 3.57f + 0.43f * random.chaos;
                runtime.chaosValue = juce::jlimit (0.0001f, 0.9999f,
                    intensity * runtime.chaosValue * (1.0f - runtime.chaosValue));
                runtime.target = runtime.chaosValue;
            }
            runtime.previous = runtime.target;
        }
        else if (random.mode == "randomWalk")
        {
            if (changes)
            {
                const auto direction = deterministicRandomUnit (
                    random.seed, nextStep, 0xad90777du) * 2.0f - 1.0f;
                auto walked = runtime.walkValue + direction * random.stepSize;
                if (walked < 0.0f) walked = -walked;
                if (walked > 1.0f) walked = 2.0f - walked;
                runtime.walkValue = juce::jlimit (0.0f, 1.0f, walked);
                runtime.target = runtime.walkValue;
            }
            runtime.previous = runtime.target;
        }
        else
        {
            if (changes)
                runtime.target = deterministicRandomUnit (random.seed, nextStep, 0xc8013ea4u);
            runtime.previous = runtime.target;
        }
        runtime.step = nextStep;
    }

    auto normalized = runtime.target;
    if (random.mode == "smoothRandom")
    {
        const auto duration = juce::jmax (0.0001f, random.smoothing);
        auto progress = random.smoothing <= 0.0f ? 1.0f
                                                  : juce::jlimit (0.0f, 1.0f,
                                                      runtime.phase / duration);
        progress = progress * progress * (3.0f - 2.0f * progress);
        normalized = runtime.previous + (runtime.target - runtime.previous) * progress;
    }
    runtime.value = random.minimum
                  + juce::jlimit (0.0f, 1.0f, normalized) * (random.maximum - random.minimum);
    return runtime.value;
}

void InstrumentHostService::emitRandomModulatorActivity()
{
    if (options.emit == nullptr)
        return;
    juce::Array<juce::var> values;
    for (const auto& random : rack.getPerformance().randomModulators)
    {
        const auto found = randomModulatorRuntimes.find (random.randomId);
        auto* item = new juce::DynamicObject();
        item->setProperty ("randomId", random.randomId);
        item->setProperty ("phase", found != randomModulatorRuntimes.end()
                                      ? found->second.phase : 0.0f);
        item->setProperty ("value", found != randomModulatorRuntimes.end()
                                      ? found->second.value : 0.0f);
        item->setProperty ("step", found != randomModulatorRuntimes.end()
                                     ? static_cast<juce::int64> (found->second.step) : -1);
        values.add (juce::var (item));
    }
    juce::Array<juce::var> macros;
    for (const auto& macro : rack.getPerformance().macros)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("macroId", macro.macroId);
        item->setProperty ("value", macro.value);
        macros.add (juce::var (item));
    }
    auto* payload = new juce::DynamicObject();
    payload->setProperty ("randomModulators", values);
    payload->setProperty ("macros", macros);
    options.emit ("instrumentHostRandomModulatorActivity", juce::var (payload));
}

void InstrumentHostService::tickRandomModulators()
{
    const auto nowSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
    juce::StringArray liveIds;
    for (const auto& random : rack.getPerformance().randomModulators)
    {
        liveIds.add (random.randomId);
        auto& runtime = randomModulatorRuntimes[random.randomId];
        const auto value = random.enabled
          ? evaluateRandomModulator (random, runtime, nowSeconds) : 0.0f;
        if (! random.enabled)
        {
            runtime = {};
            runtime.lastSeconds = nowSeconds;
        }
        const auto key = modulationSourceKey ("random", random.randomId, 0, 0);
        const auto previous = modulationSourceValues.find (key);
        if (previous == modulationSourceValues.end()
            || std::abs (previous->second - value) > 0.0001f)
            setModulationSourceValue ("random", random.randomId, 0, 0, value);
    }

    for (auto it = randomModulatorRuntimes.begin(); it != randomModulatorRuntimes.end();)
        it = liveIds.contains (it->first) ? std::next (it)
                                         : randomModulatorRuntimes.erase (it);

    if (! liveIds.isEmpty() && nowSeconds - lastRandomModulatorActivitySeconds >= 0.05)
    {
        lastRandomModulatorActivitySeconds = nowSeconds;
        emitRandomModulatorActivity();
    }
}

bool InstrumentHostService::targetParameterExists (const juce::String& targetId,
                                                   const juce::String& parameterId)
{
    return isVirtualParameterId (parameterId)
             ? virtualParameterExists (targetId, parameterId)
             : resolveParameter (targetId, parameterId) != nullptr;
}

void InstrumentHostService::writeMappedBinding (const ControlBinding& binding, float value01)
{
    const auto positioned = binding.inverted ? 1.0f - value01 : value01;
    const auto mapped = binding.rangeMin + positioned * (binding.rangeMax - binding.rangeMin);

    if (isVirtualParameterId (binding.parameterId))
    {
        writeTargetBaseValue (binding.partId, binding.parameterId, mapped);
        return;
    }

    if (auto* parameter = resolveParameter (binding.partId, binding.parameterId))
    {
        juce::ignoreUnused (parameter);
        writeTargetBaseValue (binding.partId, binding.parameterId, mapped, true);
    }
}

void InstrumentHostService::ensureLibrary()
{
    if (libraryLoaded)
        return;
    libraryLoaded = true;

    options.dataDirectory.createDirectory();
    library.loadFrom (libraryFile());

    if (libraryPathsFile().existsAsFile())
    {
        const auto parsed = juce::JSON::parse (libraryPathsFile().loadFileAsString());
        if (const auto* arr = parsed.getProperty ("paths", {}).getArray())
            for (const auto& p : *arr)
                libraryPaths.addIfNotAlreadyThere (p.toString());
    }
}

juce::String InstrumentHostService::recordUnavailableReason (const LibraryRecord& record) const
{
    if (record.type == "rack")
    {
        Performance manifest;
        if (! Performance::fromVar (juce::JSON::parse (record.rackManifestJson), manifest))
            return "The captured rack manifest is damaged.";

        juce::StringArray missing;
        {
            const std::scoped_lock lock (catalogLock);
            for (const auto& part : manifest.parts)
                if (part.pluginCeId.isNotEmpty() && findClass (part.pluginCeId) == nullptr)
                    missing.addIfNotAlreadyThere (part.pluginName.isNotEmpty() ? part.pluginName
                                                                               : part.pluginCeId);
        }
        return missing.isEmpty() ? juce::String()
                                 : "Missing instruments: " + missing.joinIntoString (", ");
    }

    if (record.type == "chain")
    {
        // What makes a chain unloadable is its instrument, not its effects: a missing insert
        // is named at load time and the rest still plays, so flagging the whole record
        // unavailable for one absent reverb would be a lie the library tells before you ask.
        Performance manifest;
        if (! Performance::fromVar (juce::JSON::parse (record.rackManifestJson), manifest)
            || manifest.parts.isEmpty())
            return "The captured chain is damaged.";

        const auto& source = manifest.parts.getReference (0);
        if (source.pluginCeId.isEmpty())
            return "This chain has no instrument.";

        const std::scoped_lock lock (catalogLock);
        const ModuleRecord* module = nullptr;
        if (findClass (source.pluginCeId, &module) == nullptr)
            return "Requires " + (source.pluginName.isNotEmpty() ? source.pluginName
                                                                 : source.pluginCeId)
                 + ", which is not in the catalogue.";
        if (module != nullptr)
            if (const auto why = module->unavailableReason(); why.isNotEmpty())
                return "Requires " + source.pluginName + ", whose module is " + why + ".";

        return {};
    }

    // A hardware patch has no class to be missing. What it needs is a synth on a cable, which
    // the library cannot see and must not pretend to: the record is always loadable, and
    // whether the bytes reach anything is reported by the send, not guessed at here.
    if (record.sourceType == "hardwarePatch")
        return record.stateBlobBase64.isEmpty() ? juce::String ("The captured patch is empty.")
                                                : juce::String();

    if (record.targetCeId.isEmpty())
        return "No installed instrument matches this preset — scan for instruments, then "
               "rescan the library.";

    const ModuleRecord* module = nullptr;
    const std::scoped_lock lock (catalogLock);
    if (findClass (record.targetCeId, &module) == nullptr)
        return "Requires " + (record.instrument.isNotEmpty() ? record.instrument : record.targetCeId)
             + ", which is not in the catalogue.";
    if (module != nullptr)
        if (const auto why = module->unavailableReason(); why.isNotEmpty())
            return "Requires " + record.instrument + ", whose module is " + why + ".";

    if (record.sourceType == "vstpreset" && ! juce::File (record.sourceLocator).existsAsFile())
        return "The preset file is gone: " + record.sourceLocator;

    return {};
}

void InstrumentHostService::emitLibrary (const juce::String& query, const juce::String& type)
{
    juce::Array<juce::var> recordVars;
    int presets = 0, racks = 0, chains = 0, missing = 0;

    for (const auto* record : searchLibrary (library, query, type))
    {
        const auto reason = recordUnavailableReason (*record);

        auto* r = new juce::DynamicObject();
        r->setProperty ("recordId",     record->recordId);
        r->setProperty ("type",         record->type);
        r->setProperty ("sourceType",   record->sourceType);
        r->setProperty ("targetCeId",   record->targetCeId);
        r->setProperty ("name",         record->name);
        r->setProperty ("manufacturer", record->manufacturer);
        r->setProperty ("instrument",   record->instrument);
        r->setProperty ("category",     record->category);
        r->setProperty ("factory",      record->factory);
        r->setProperty ("missing",      record->missing);
        r->setProperty ("available",    reason.isEmpty());
        r->setProperty ("reason",       reason);
        r->setProperty ("favourite",    record->user.favourite);
        r->setProperty ("rating",       record->user.rating);
        r->setProperty ("notes",        record->user.notes);
        r->setProperty ("tags",         [record] { juce::Array<juce::var> a;
                                                   for (const auto& t : record->user.tags) a.add (t);
                                                   return a; }());
        recordVars.add (juce::var (r));
    }

    for (const auto& record : library.allRecords())
    {
        if (record.type == "preset")     ++presets;
        else if (record.type == "chain") ++chains;
        else                             ++racks;
        if (record.missing) ++missing;
    }

    auto* counts = new juce::DynamicObject();
    counts->setProperty ("total",   library.allRecords().size());
    counts->setProperty ("presets", presets);
    counts->setProperty ("racks",   racks);
    counts->setProperty ("chains",  chains);
    counts->setProperty ("missing", missing);

    auto* root = new juce::DynamicObject();
    root->setProperty ("records", recordVars);
    root->setProperty ("query",   query);
    root->setProperty ("type",    type);
    root->setProperty ("counts",  juce::var (counts));
    root->setProperty ("paths",   [this] { juce::Array<juce::var> a;
                                           for (const auto& p : libraryPaths) a.add (p);
                                           return a; }());
    if (options.emit != nullptr)
        options.emit ("instrumentHostLibrary", juce::var (root));
}

void InstrumentHostService::scanVstPresets()
{
    // Steinberg's convention plus whatever folders the user added. Enumeration reads only
    // each file's header — indexing thousands of presets is file-system bound, not parse
    // bound — and one unreadable file skips, never aborts the scan (baseline §18.6.5).
    juce::Array<juce::File> roots {
        juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile ("VST3 Presets"),
        juce::File::getSpecialLocation (juce::File::commonApplicationDataDirectory).getChildFile ("VST3 Presets"),
    };
    for (const auto& path : libraryPaths)
        if (juce::File (path).isDirectory())
            roots.add (juce::File (path));

    juce::Array<LibraryRecord> scanned;
    for (const auto& root : roots)
    {
        if (! root.isDirectory())
            continue;

        for (const auto& entry : juce::RangedDirectoryIterator (root, true, "*.vstpreset",
                                                                juce::File::findFiles))
        {
            const auto file = entry.getFile();
            juce::MemoryBlock head;
            {
                juce::FileInputStream stream (file);
                if (! stream.openedOk())
                    continue;
                stream.readIntoMemoryBlock (head, 4096);
            }

            const auto header = parseVstPresetHeader (head.getData(), head.getSize());
            if (! header.valid)
                continue;

            LibraryRecord record;
            record.type = "preset";
            record.sourceType = "vstpreset";
            record.factory = true;
            record.sourceLocator = file.getFullPathName();
            record.name = file.getFileNameWithoutExtension();
            record.classIdHex = header.classIdHex;
            // The Steinberg layout is <root>/<Vendor>/<Plugin>/<preset>.vstpreset; anything
            // shallower keeps what path it has.
            record.instrument = file.getParentDirectory() == root
                                  ? juce::String()
                                  : file.getParentDirectory().getFileName();
            record.manufacturer = file.getParentDirectory().getParentDirectory() == root
                                    || file.getParentDirectory() == root
                                    ? juce::String()
                                    : file.getParentDirectory().getParentDirectory().getFileName();
            // Content identity follows the file, not the path: a renamed preset keeps its
            // favourites through the fingerprint match in mergeVendorScan.
            record.fingerprint = juce::String::toHexString (
                head.toBase64Encoding().hashCode64() ^ (juce::int64) file.getSize());

            // The class id is the preset's real identity, but the catalogue keys on JUCE's
            // identifier — so the target resolves by the layout's plug-in name, and the
            // format's own loader re-validates the class id at load time.
            {
                const std::scoped_lock lock (catalogLock);
                for (const auto& instrumentClass : catalog.instrumentClasses())
                    if (record.instrument.isNotEmpty()
                        && instrumentClass.name.equalsIgnoreCase (record.instrument))
                    {
                        record.targetCeId = instrumentClass.ceId;
                        break;
                    }
            }

            scanned.add (std::move (record));
        }
    }

    library.mergeVendorScan ("vstpreset", std::move (scanned));
}

void InstrumentHostService::ingestProgramList (const juce::String& partId)
{
    // Layer B of the layered preset engine (baseline §6.2): a plug-in that exposes its
    // factory programs through the program-list interface gets them into the ONE library,
    // beside .vstpreset files and captured state, the moment it is live — no separate scan.
    // JUCE surfaces IUnitInfo program lists through the standard program API, and the API's
    // mandatory single program is not a list, so below two programs there is nothing to say.
    const auto* part = rack.getPerformance().findPart (partId);
    auto* instrument = rack.getInstrument (partId);
    if (part == nullptr || instrument == nullptr || part->pluginCeId.isEmpty())
        return;

    const auto count = instrument->getNumPrograms();
    if (count <= 1)
        return;

    ensureLibrary();
    const auto scope = "program://" + part->pluginCeId + "/";
    juce::Array<LibraryRecord> scanned;
    for (int i = 0; i < count; ++i)
    {
        LibraryRecord record;
        record.type = "preset";
        record.sourceType = "programList";
        record.factory = true;
        record.sourceLocator = scope + juce::String (i);
        const auto reported = instrument->getProgramName (i);
        record.name = reported.isNotEmpty() ? reported : "Program " + juce::String (i + 1);
        record.instrument = part->pluginName;
        record.manufacturer = part->pluginVendor;
        record.targetCeId = part->pluginCeId;
        // Index and name together: a reordered or renamed factory list reads as changed
        // content, and the scoped merge then keeps ids where the identity really held.
        record.fingerprint = juce::String::toHexString (
            (record.sourceLocator + "|" + record.name).hashCode64());
        scanned.add (std::move (record));
    }

    // Scoped to this class so refreshing one plug-in's list never marks another's missing.
    library.mergeVendorScan ("programList", std::move (scanned), scope);
    library.saveTo (libraryFile());
}

void InstrumentHostService::stopPresetAudition()
{
    if (! presetAuditionHeldNotes.empty() && presetAuditionPartId.isNotEmpty())
    {
        juce::MidiBuffer noteOffs;
        for (const auto note : presetAuditionHeldNotes)
            noteOffs.addEvent (juce::MidiMessage::noteOff (1, note), 0);
        rack.sendPartMidi (presetAuditionPartId, noteOffs);
    }

    presetAuditionEvents.clear();
    presetAuditionHeldNotes.clear();
    presetAuditionPartId = {};
    presetAuditionStartedMs = 0.0;
    presetAuditionPlaying = false;
}

void InstrumentHostService::startPresetAudition (const juce::String& partId, bool force)
{
    stopPresetAudition();

    const auto& settings = rack.getPerformance().presetAudition;
    if (! settings.enabled && ! force)
        return;

    const auto* part = rack.getPerformance().findPart (partId);
    if (part == nullptr || (! part->hardware && rack.getInstrument (partId) == nullptr))
    {
        emitError ("The audition target has no instrument to play.");
        return;
    }
    if (! part->hardware && options.enableAudio && ! audioRunning)
    {
        emitError ("Audio is off, so the audition phrase cannot be heard. Open Audio & MIDI "
                   "and pick an output device.");
        return;
    }

    std::vector<PresetAuditionEvent> plan;
    const auto addNote = [&] (int interval, double atMs)
    {
        const auto note = juce::jlimit (0, 127, settings.rootNote + interval);
        plan.push_back ({ atMs, note, settings.velocity, true });
        plan.push_back ({ atMs + (double) settings.noteLengthMs, note, 0, false });
    };
    const auto stepMs = (double) settings.noteLengthMs + (double) settings.gapMs;

    if (settings.phrase == "single")
    {
        addNote (0, 0.0);
    }
    else if (settings.phrase == "chord")
    {
        addNote (0, 0.0);
        addNote (4, 0.0);
        addNote (7, 0.0);
    }
    else if (settings.phrase == "scale")
    {
        static constexpr int intervals[] { 0, 2, 4, 5, 7, 9, 11, 12 };
        for (int i = 0; i < (int) std::size (intervals); ++i)
            addNote (intervals[i], (double) i * stepMs);
    }
    else
    {
        // A short register-spanning phrase reveals attack, sustain and release without
        // making somebody listen to a whole demo every time they press Down.
        static constexpr int intervals[] { 0, 7, 12, 7, 4, 5, 0 };
        for (int i = 0; i < (int) std::size (intervals); ++i)
            addNote (intervals[i], (double) i * stepMs);
    }

    std::sort (plan.begin(), plan.end(), [] (const PresetAuditionEvent& a,
                                             const PresetAuditionEvent& b)
    {
        if (! juce::approximatelyEqual (a.dueMs, b.dueMs))
            return a.dueMs < b.dueMs;
        // Repeated notes retrigger cleanly when an off and the next on share a boundary.
        return (int) a.noteOn < (int) b.noteOn;
    });

    presetAuditionPartId = partId;
    presetAuditionStartedMs = juce::Time::getMillisecondCounterHiRes();
    presetAuditionPlaying = ! plan.empty();
    for (auto& event : plan)
        presetAuditionEvents.push_back (std::move (event));
    tickPresetAudition(); // The first note is immediate; later ones ride the normal UI pump.
}

void InstrumentHostService::tickPresetAudition()
{
    if (! presetAuditionPlaying)
        return;

    const auto elapsed = juce::Time::getMillisecondCounterHiRes() - presetAuditionStartedMs;
    juce::MidiBuffer due;
    std::vector<PresetAuditionEvent> delivered;
    while (! presetAuditionEvents.empty() && presetAuditionEvents.front().dueMs <= elapsed)
    {
        auto event = presetAuditionEvents.front();
        presetAuditionEvents.pop_front();
        due.addEvent (event.noteOn
                        ? juce::MidiMessage::noteOn (1, event.note,
                                                      (juce::uint8) event.velocity)
                        : juce::MidiMessage::noteOff (1, event.note), 0);
        delivered.push_back (event);
    }

    if (! due.isEmpty())
    {
        if (! rack.sendPartMidi (presetAuditionPartId, due))
        {
            presetAuditionEvents.clear();
            presetAuditionHeldNotes.clear();
            presetAuditionPlaying = false;
            emitError ("The audition phrase could not reach its target part.");
            emitState();
            return;
        }
        for (const auto& event : delivered)
            if (event.noteOn)
                presetAuditionHeldNotes.insert (event.note);
            else
                presetAuditionHeldNotes.erase (event.note);
    }

    if (presetAuditionEvents.empty() && presetAuditionHeldNotes.empty())
    {
        presetAuditionPlaying = false;
        presetAuditionPartId = {};
        emitState();
    }
}

bool InstrumentHostService::startSoundComparison (
    const juce::String& partId, const juce::StringArray& requestedRecordIds)
{
    if (soundComparison.active)
        finishSoundComparison (false);

    const auto* part = rack.getPerformance().findPart (partId);
    auto* instrument = rack.getInstrument (partId);
    if (part == nullptr || instrument == nullptr || part->hardware)
    {
        emitError ("Focus a software instrument before starting Sound Comparison Mode.");
        return false;
    }

    juce::StringArray candidates;
    const auto consider = [&] (const LibraryRecord& record)
    {
        if (candidates.size() >= 20 || record.type != "preset"
            || record.sourceType == "hardwarePatch" || record.targetCeId != part->pluginCeId
            || record.missing || recordUnavailableReason (record).isNotEmpty())
            return;
        candidates.addIfNotAlreadyThere (record.recordId);
    };

    if (requestedRecordIds.isEmpty())
    {
        for (const auto& record : library.allRecords())
            consider (record);
    }
    else
    {
        for (const auto& recordId : requestedRecordIds)
            if (const auto* record = library.find (recordId))
                consider (*record);
    }

    if (candidates.size() < 2)
    {
        emitError ("Sound Comparison Mode needs at least two available presets for "
                   + part->pluginName + ".");
        return false;
    }

    soundComparison = {};
    soundComparison.active = true;
    soundComparison.partId = partId;
    soundComparison.recordIds = std::move (candidates);
    soundComparison.originalPresetRecordId = part->lastPresetRecordId;
    soundComparison.originalPresetName = part->lastPresetName;
    instrument->getStateInformation (soundComparison.originalState);

    auto first = soundComparison.recordIds.indexOf (part->lastPresetRecordId);
    if (first < 0)
        first = 0;
    if (! applySoundComparisonIndex (first))
    {
        finishSoundComparison (false);
        return false;
    }
    return true;
}

bool InstrumentHostService::applySoundComparisonIndex (int index)
{
    if (! soundComparison.active
        || ! juce::isPositiveAndBelow (index, soundComparison.recordIds.size()))
        return false;

    const auto* record = library.find (soundComparison.recordIds[index]);
    auto* part = const_cast<Performance&> (rack.getPerformance())
                   .findPart (soundComparison.partId);
    auto* instrument = rack.getInstrument (soundComparison.partId);
    if (record == nullptr || part == nullptr || instrument == nullptr
        || record->targetCeId != part->pluginCeId)
    {
        emitError ("A compared preset or its target instrument is no longer available.");
        return false;
    }

    if (record->sourceType == "vstpreset")
    {
        if (options.applyVstPreset == nullptr
            || ! options.applyVstPreset (*instrument, juce::File (record->sourceLocator)))
        {
            emitError ("The plug-in refused this preset: " + record->name);
            return false;
        }
    }
    else if (record->sourceType == "programList")
    {
        const auto program = record->sourceLocator.fromLastOccurrenceOf ("/", false, false)
                                 .getIntValue();
        if (program < 0 || program >= instrument->getNumPrograms())
        {
            emitError ("The plug-in no longer has this program: " + record->name);
            return false;
        }
        instrument->setCurrentProgram (program);
    }
    else if (record->sourceType == "userState")
    {
        juce::MemoryOutputStream decoded;
        if (! juce::Base64::convertFromBase64 (decoded, record->stateBlobBase64))
        {
            emitError ("The captured state for " + record->name + " is damaged.");
            return false;
        }
        instrument->setStateInformation (decoded.getData(), (int) decoded.getDataSize());
    }
    else
    {
        emitError ("That library record cannot be compared as a software preset.");
        return false;
    }

    soundComparison.index = index;
    rack.setPartLastPreset (soundComparison.partId, record->recordId, record->name);
    startPresetAudition (soundComparison.partId, true);
    emitState();
    return true;
}

void InstrumentHostService::finishSoundComparison (bool keepSelection)
{
    if (! soundComparison.active)
        return;

    const auto closing = soundComparison;
    soundComparison = {};
    stopPresetAudition();

    if (! keepSelection)
    {
        if (auto* instrument = rack.getInstrument (closing.partId))
            if (closing.originalState.getSize() > 0)
                instrument->setStateInformation (closing.originalState.getData(),
                                                 (int) closing.originalState.getSize());
        rack.setPartLastPreset (closing.partId, closing.originalPresetRecordId,
                               closing.originalPresetName);
    }

    // Only Keep or Cancel persists. Stepping between candidates never overwrites the rig,
    // so a comparison remains a reversible listening session rather than twenty edits.
    savePerformance();
    emitState();
}

void InstrumentHostService::loadPresetRecord (const LibraryRecord& record,
                                               const juce::String& partId,
                                               std::function<void()> afterLoaded)
{
    if (soundComparison.active)
        finishSoundComparison (false);
    // Any explicit preset change cancels the old phrase immediately. Its future notes live
    // in this scheduler rather than in the global collector precisely so there is nothing
    // left to arrive while a slower replacement plug-in is being constructed.
    stopPresetAudition();
    const auto* part = rack.getPerformance().findPart (partId);

    if (record.sourceType == "hardwarePatch")
    {
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }

        // A part with a plug-in on it is not silently turned into a hardware part: that would
        // unload somebody's instrument to make room for bytes it could never play. An EMPTY
        // part, though, is exactly what "add as new part" hands over, and becoming a
        // hardware part with no port yet is the honest shape for it — the patch is on it,
        // the port picker is one click away, and the send reports that nothing was there
        // to deliver to.
        if (! part->hardware)
        {
            if (rack.getInstrument (partId) != nullptr || part->pluginCeId.isNotEmpty())
            {
                emitError (record.name + " is a hardware patch — load it onto a hardware part.");
                return;
            }
            rack.setHardwareConfig (partId, {});
            openHardwareMidi (partId);
            restartAudioIfNeeded();
        }

        rack.setHardwarePatch (partId, record.stateBlobBase64, record.name);
        rack.setPartLastPreset (partId, record.recordId, record.name);
        queueHardwarePatchSend (partId);
        if (afterLoaded != nullptr)
            afterLoaded();
        savePerformance();
        emitState();
        return;
    }

    const auto sameClassLoaded = part != nullptr
                              && rack.getInstrument (partId) != nullptr
                              && part->pluginCeId == record.targetCeId;

    const auto applyVendorPreset = [this, record] (juce::AudioProcessor& instrument) -> bool
    {
        if (options.applyVstPreset == nullptr)
        {
            emitError ("Vendor preset loading is not available in this build.");
            return false;
        }
        if (! options.applyVstPreset (instrument, juce::File (record.sourceLocator)))
        {
            emitError ("The plug-in refused this preset: " + record.name);
            return false;
        }
        return true;
    };

    if (sameClassLoaded)
    {
        // §18.6.7's cheap path: the right processor is already live, so the state applies
        // in place and nothing is torn down.
        auto* instrument = rack.getInstrument (partId);
        if (record.sourceType == "vstpreset")
        {
            if (! applyVendorPreset (*instrument))
                return;
        }
        else if (record.sourceType == "programList")
        {
            const auto index = record.sourceLocator.fromLastOccurrenceOf ("/", false, false)
                                     .getIntValue();
            if (index < 0 || index >= instrument->getNumPrograms())
            {
                // The plug-in changed its list since ingestion; a stale index must refuse,
                // not select whatever now sits at that position.
                emitError ("The plug-in no longer has this program: " + record.name);
                return;
            }
            instrument->setCurrentProgram (index);
        }
        else
        {
            juce::MemoryOutputStream decoded;
            if (! juce::Base64::convertFromBase64 (decoded, record.stateBlobBase64))
            {
                emitError ("The captured state for " + record.name + " is damaged.");
                return;
            }
            instrument->setStateInformation (decoded.getData(), (int) decoded.getDataSize());
        }

        // The part's place in the walk moves only once the preset actually applied.
        rack.setPartLastPreset (partId, record.recordId, record.name);
        if (afterLoaded != nullptr)
            afterLoaded();
        savePerformance();
        emitState();
        return;
    }

    // The full path: prime the part's document with the preset's identity (and state, for
    // captured presets), then run the one load transaction — commit restores the primed
    // blob, and a vendor preset applies right after commit through afterCommit.
    InstrumentRackHost::ClassInfo info;
    {
        const std::scoped_lock lock (catalogLock);
        const ModuleRecord* module = nullptr;
        const auto* classRecord = findClass (record.targetCeId, &module);
        if (classRecord == nullptr || module == nullptr)
        {
            emitError ("Instrument not in the catalogue: " + record.targetCeId);
            return;
        }
        info = { classRecord->ceId, module->path, classRecord->name, classRecord->vendor };
    }

    rack.primePartState (partId, info,
                         record.sourceType == "userState" ? record.stateBlobBase64 : juce::String());
    rack.setPartLastPreset (partId, record.recordId, record.name);

    if (record.sourceType == "vstpreset")
        requestInstrument (partId, record.targetCeId,
                           [applyVendorPreset, afterLoaded = std::move (afterLoaded)]
                           (juce::AudioProcessor& instrument)
                           {
                               if (applyVendorPreset (instrument) && afterLoaded != nullptr)
                                   afterLoaded();
                           });
    else if (record.sourceType == "programList")
        requestInstrument (partId, record.targetCeId,
                           [this, index = record.sourceLocator.fromLastOccurrenceOf ("/", false, false)
                                        .getIntValue(),
                            name = record.name,
                            afterLoaded = std::move (afterLoaded)] (juce::AudioProcessor& instrument)
                           {
                               if (index >= 0 && index < instrument.getNumPrograms())
                               {
                                   instrument.setCurrentProgram (index);
                                   if (afterLoaded != nullptr)
                                       afterLoaded();
                               }
                               else
                                   emitError ("The plug-in no longer has this program: " + name);
                           });
    else
        requestInstrument (partId, record.targetCeId,
                           [afterLoaded = std::move (afterLoaded)] (juce::AudioProcessor&)
                           {
                               if (afterLoaded != nullptr)
                                   afterLoaded();
                           });
}

void InstrumentHostService::loadChainRecord (const LibraryRecord& record, const juce::String& partId)
{
    Performance captured;
    if (! Performance::fromVar (juce::JSON::parse (record.rackManifestJson), captured)
        || captured.parts.isEmpty())
    {
        emitError ("The captured chain for " + record.name + " is damaged.");
        return;
    }

    const auto& source = captured.parts.getReference (0);

    if (rack.getPerformance().findPart (partId) == nullptr)
    {
        emitError ("Unknown rack part.");
        return;
    }

    // The instrument is resolved BEFORE anything is torn down. A chain whose instrument is
    // gone must leave the part exactly as it was — half a chain over the previous sound is
    // worse than a refusal, because it looks like it worked.
    ClassInfoForCommit instrumentInfo;
    if (source.pluginCeId.isNotEmpty())
    {
        const std::scoped_lock lock (catalogLock);
        const ModuleRecord* module = nullptr;
        const auto* classRecord = findClass (source.pluginCeId, &module);
        if (classRecord == nullptr || module == nullptr)
        {
            emitError ("Requires " + (source.pluginName.isNotEmpty() ? source.pluginName
                                                                     : source.pluginCeId)
                       + ", which is not in the catalogue.");
            return;
        }
        instrumentInfo = { classRecord->ceId, module->path, classRecord->name, classRecord->vendor };
    }

    // The part's own identity, place and mix stay: dropping a chain onto part 3 must not
    // move it, rename it, or take its fader with it. Everything that describes the VOICE
    // travels — the zone rules included, because where a sound sits on the keyboard is part
    // of how the chain plays.
    //
    // Old inserts go first, through the same removal every other path uses (their editors
    // and nodes die with them); then the captured ones are minted and loaded.
    if (const auto* target = rack.getPerformance().findPart (partId))
        for (const auto& slot : juce::Array<EffectSlot> (target->effects))
            rack.removeEffectSlot (slot.effectId);

    rack.setPartMidiChain (partId, source.midiChain);
    rack.setMidiRules (partId, source.midi);

    for (const auto& slot : source.effects)
    {
        ClassInfoForCommit info;
        {
            const std::scoped_lock lock (catalogLock);
            const ModuleRecord* module = nullptr;
            const auto* classRecord = findClass (slot.pluginCeId, &module);
            if (classRecord == nullptr || module == nullptr)
            {
                // Degraded, not silent: an effect the machine does not have is named, and the
                // rest of the chain still loads — the same honesty a restored session has.
                emitError ("Missing effect in " + record.name + ": "
                           + (slot.pluginName.isNotEmpty() ? slot.pluginName : slot.pluginCeId));
                continue;
            }
            info = { classRecord->ceId, module->path, classRecord->name, classRecord->vendor };
        }

        const auto effectId = rack.addEffectSlot (partId);
        if (effectId.isEmpty())
        {
            // Only reachable if the part went away underneath us, which the check above makes
            // very unlikely — but "loaded without its effects" must never pass silently.
            emitError ("The rack part went away while " + record.name + " was loading.");
            break;
        }

        rack.primeEffectSlot (effectId, { info.ceId, info.modulePath, info.name, info.vendor },
                              slot.stateBlobBase64);
        requestEffect (effectId, slot.pluginCeId);
    }

    // The instrument last, through the one load transaction: its commit restores the primed
    // blob, so the captured sound arrives with the captured chain already around it.
    if (source.pluginCeId.isNotEmpty())
    {
        rack.primePartState (partId, { instrumentInfo.ceId, instrumentInfo.modulePath,
                                       instrumentInfo.name, instrumentInfo.vendor },
                             source.stateBlobBase64);
        requestInstrument (partId, source.pluginCeId);
    }

    savePerformance();
    emitState();
}

void InstrumentHostService::loadRackRecord (const LibraryRecord& record)
{
    Performance restored;
    if (! Performance::fromVar (juce::JSON::parse (record.rackManifestJson), restored))
    {
        emitError ("The captured rack manifest for " + record.name + " is damaged.");
        return;
    }

    // Degraded-but-loud (baseline §18.6.7): missing classes are named, the parts still load
    // as unresolved-and-repairable — the same honesty the session restore already has.
    if (const auto reason = recordUnavailableReason (record); reason.isNotEmpty())
        emitError ("Degraded restore of " + record.name + " — " + reason);


    applyPerformance (std::move (restored));
    savePerformance();
    emitState();
}

void InstrumentHostService::refreshSetlistPreloads()
{
    // A saved Pro show may be opened later under the working Free edition. Its document is
    // retained, but the hidden warm pool must obey the same entitlement as Setlist itself.
    if (! entitlements().allows (licensing::Feature::scenesAndSetlists))
    {
        setlistPreloads.clear();
        setlistPreloadQueue.clear();
        return;
    }

    const auto& setlist = rack.getPerformance().setlist;
    juce::StringArray wanted;
    const auto first = setlist.currentIndex + 1;
    for (int offset = 0; offset < setlist.preloadAhead; ++offset)
    {
        const auto index = first + offset;
        if (juce::isPositiveAndBelow (index, setlist.items.size()))
        {
            const auto& id = setlist.items.getReference (index).rackRecordId;
            if (id.isNotEmpty())
                wanted.addIfNotAlreadyThere (id);
        }
    }

    for (auto it = setlistPreloads.begin(); it != setlistPreloads.end();)
        if (! wanted.contains (it->first))
            it = setlistPreloads.erase (it);
        else
            ++it;

    for (auto it = setlistPreloadQueue.begin(); it != setlistPreloadQueue.end();)
        if (! wanted.contains (it->recordId))
            it = setlistPreloadQueue.erase (it);
        else
            ++it;

    if (wanted.isEmpty())
        return;

    ensureLibrary();
    for (const auto& recordId : wanted)
    {
        if (setlistPreloads.find (recordId) != setlistPreloads.end())
            continue;

        SetlistPreloadRig warm;
        warm.recordId = recordId;
        const auto* record = library.find (recordId);
        if (record == nullptr || record->type != "rack")
        {
            warm.error = "Rack capture is no longer in the Library.";
            warm.failed = 1;
            setlistPreloads.emplace (recordId, std::move (warm));
            continue;
        }
        warm.name = record->name;

        Performance manifest;
        if (! Performance::fromVar (juce::JSON::parse (record->rackManifestJson), manifest))
        {
            warm.error = "Rack capture manifest is damaged.";
            warm.failed = 1;
            setlistPreloads.emplace (recordId, std::move (warm));
            continue;
        }

        struct Spec { juce::String targetId, ceId, state; bool effect = false; };
        juce::Array<Spec> specs;
        for (const auto& part : manifest.parts)
        {
            if (! part.hardware && part.pluginCeId.isNotEmpty())
                specs.add ({ part.partId, part.pluginCeId, part.stateBlobBase64, false });
            for (const auto& slot : part.effects)
                if (slot.pluginCeId.isNotEmpty())
                    specs.add ({ slot.effectId, slot.pluginCeId, slot.stateBlobBase64, true });
        }
        const auto appendEffects = [&specs] (const auto& chains)
        {
            for (const auto& chain : chains)
                for (const auto& slot : chain.effects)
                    if (slot.pluginCeId.isNotEmpty())
                        specs.add ({ slot.effectId, slot.pluginCeId, slot.stateBlobBase64, true });
        };
        appendEffects (manifest.returns);
        appendEffects (manifest.buses);
        for (const auto& slot : manifest.masterEffects)
            if (slot.pluginCeId.isNotEmpty())
                specs.add ({ slot.effectId, slot.pluginCeId, slot.stateBlobBase64, true });

        warm.total = specs.size();
        setlistPreloads.emplace (recordId, std::move (warm));
        auto& inserted = setlistPreloads.at (recordId);
        for (const auto& spec : specs)
        {
            SetlistPreloadJob job;
            job.recordId = recordId;
            job.targetId = spec.targetId;
            job.ceId = spec.ceId;
            job.stateBlobBase64 = spec.state;
            job.effect = spec.effect;

            juce::String refusal;
            {
                const std::scoped_lock lock (catalogLock);
                const ModuleRecord* module = nullptr;
                const auto* plugin = findClass (spec.ceId, &module);
                if (plugin == nullptr || module == nullptr)
                    refusal = "Plug-in is not in the catalogue: " + spec.ceId;
                else if (const auto why = module->unavailableReason(); why.isNotEmpty())
                    refusal = "Module is " + why + ": " + module->path;
                else if (const auto blocked = safeModeRefusal (module->path); blocked.isNotEmpty())
                    refusal = plugin->name + " was " + blocked;
                else
                {
                    job.descriptionXml = plugin->descriptionXml;
                    job.modulePath = module->path;
                    job.name = plugin->name;
                }
            }

            if (refusal.isNotEmpty() || options.instantiate == nullptr)
            {
                ++inserted.failed;
                if (inserted.error.isEmpty())
                    inserted.error = refusal.isNotEmpty() ? refusal
                                                           : "No plug-in instantiator is configured.";
                continue;
            }
            setlistPreloadQueue.push_back (std::move (job));
        }
    }

    pumpSetlistPreloadQueue();
}

void InstrumentHostService::pumpSetlistPreloadQueue()
{
    // A test instantiator may complete inline. Its callback asks for the next job just like
    // an asynchronous factory does; this guard lets the outer loop advance instead of
    // recursively nesting once per plug-in in a large rack.
    if (setlistPreloadPumpActive)
        return;
    const juce::ScopedValueSetter<bool> pumping (setlistPreloadPumpActive, true);

    while (! setlistPreloadBusy && ! setlistPreloadQueue.empty())
    {
        auto job = std::move (setlistPreloadQueue.front());
        setlistPreloadQueue.pop_front();
        if (setlistPreloads.find (job.recordId) == setlistPreloads.end())
            continue;

        setlistPreloadBusy = true;
        if (activeMarker != nullptr)
            activeMarker->markActive (job.modulePath, job.name);
        if (recovery != nullptr)
            recovery->beginOperation ("preloadPlugin", job.name);

        options.instantiate (job.descriptionXml, options.sampleRate, options.blockSize,
            [this, aliveToken = alive, job]
            (std::unique_ptr<juce::AudioProcessor> processor, const juce::String& instantiateError)
            {
                if (! aliveToken->load())
                    return;

                juce::String error = instantiateError;
                try
                {
                    if (processor != nullptr)
                    {
                        if (job.stateBlobBase64.isNotEmpty())
                        {
                            juce::MemoryOutputStream decoded;
                            if (! juce::Base64::convertFromBase64 (decoded, job.stateBlobBase64))
                                error = "Stored state is damaged.";
                            else
                                processor->setStateInformation (decoded.getData(),
                                                                (int) decoded.getDataSize());
                        }
                        if (error.isEmpty())
                        {
                            // Construction is usually the expensive half, but preparing here
                            // also pays lazy allocation before the song change. The graph may
                            // prepare it again when attached; JUCE processors must support that.
                            processor->setRateAndBufferSizeDetails (options.sampleRate,
                                                                    options.blockSize);
                            processor->prepareToPlay (options.sampleRate, options.blockSize);
                            processor->suspendProcessing (true);
                        }
                    }
                }
                catch (const std::exception& e)
                {
                    processor.reset();
                    error = e.what();
                }
                catch (...)
                {
                    processor.reset();
                    error = "Plug-in threw while its preloaded state was prepared.";
                }

                if (activeMarker != nullptr)
                    activeMarker->clear();
                if (recovery != nullptr)
                    recovery->endOperation();

                if (auto it = setlistPreloads.find (job.recordId); it != setlistPreloads.end())
                {
                    if (processor != nullptr && error.isEmpty())
                    {
                        WarmSetlistProcessor warm;
                        warm.ceId = job.ceId;
                        warm.effect = job.effect;
                        warm.processor = std::move (processor);
                        it->second.processors[job.targetId] = std::move (warm);
                        ++it->second.ready;
                    }
                    else
                    {
                        ++it->second.failed;
                        if (it->second.error.isEmpty())
                            it->second.error = error.isNotEmpty() ? error
                                                                 : "Plug-in construction failed.";
                    }
                }

                setlistPreloadBusy = false;
                emitState();
                pumpSetlistPreloadQueue();
            });

        // A production instantiator returns with the callback pending. Test factories may
        // complete inline; in that case the loop immediately advances to the next job.
        if (setlistPreloadBusy)
            return;
    }
}

std::unique_ptr<juce::AudioProcessor> InstrumentHostService::takePreloadedProcessor (
    const juce::String& targetId, const juce::String& ceId, bool effect)
{
    if (consumingSetlistPreloadRecordId.isEmpty())
        return {};
    const auto rig = setlistPreloads.find (consumingSetlistPreloadRecordId);
    if (rig == setlistPreloads.end())
        return {};
    const auto found = rig->second.processors.find (targetId);
    if (found == rig->second.processors.end()
        || found->second.ceId != ceId || found->second.effect != effect)
        return {};
    auto processor = std::move (found->second.processor);
    rig->second.processors.erase (found);
    if (processor != nullptr)
        processor->suspendProcessing (false);
    return processor;
}

bool InstrumentHostService::rackProcessorsReady() const
{
    const auto& model = rack.getPerformance();
    for (const auto& part : model.parts)
    {
        if (! part.hardware && part.pluginCeId.isNotEmpty() && ! rack.partHasInstrument (part.partId))
            return false;
        for (const auto& slot : part.effects)
            if (slot.pluginCeId.isNotEmpty() && rack.getEffect (slot.effectId) == nullptr)
                return false;
    }
    const auto effectsReady = [this] (const auto& chains)
    {
        for (const auto& chain : chains)
            for (const auto& slot : chain.effects)
                if (slot.pluginCeId.isNotEmpty() && rack.getEffect (slot.effectId) == nullptr)
                    return false;
        return true;
    };
    if (! effectsReady (model.returns) || ! effectsReady (model.buses))
        return false;
    for (const auto& slot : model.masterEffects)
        if (slot.pluginCeId.isNotEmpty() && rack.getEffect (slot.effectId) == nullptr)
            return false;
    return true;
}

void InstrumentHostService::tickPendingSetlistRecall()
{
    if (! pendingSetlistRecall.active)
        return;
    const auto timedOut = juce::Time::getMillisecondCounterHiRes()
                        - pendingSetlistRecall.startedMs > 15000.0;
    if (! rackProcessorsReady() && ! timedOut)
        return;

    const auto recall = pendingSetlistRecall;
    pendingSetlistRecall = {};
    if (recall.sceneId.isNotEmpty() && ! launchScene (recall.sceneId))
        emitError ("The song loaded, but its requested scene is no longer available.");
    if (recall.pageId.isNotEmpty())
    {
        currentSurfacePageId = recall.pageId;
        requestedSurfacePageId = recall.pageId;
    }
    if (timedOut && ! rackProcessorsReady())
        emitError ("The song opened after the preload timeout; unavailable plug-ins remain visible for repair.");
    emitState();
}

void InstrumentHostService::drainProcessorFailures()
{
    const auto failures = rack.takeProcessorFailures();
    if (failures.isEmpty())
        return;

    const auto& settings = rack.getPerformance().automaticFailover;
    const auto now = juce::Time::getMillisecondCounterHiRes();
    for (const auto& failure : failures)
    {
        // Stop every direct UI path into the failed vendor object before scheduling a new
        // one. The graph guard has already made audio safe, but an open editor or parameter
        // listener could otherwise keep calling the object during the retry delay.
        std::map<juce::String, float> lastKnownValues;
        if (const auto found = partParameters.find (failure.targetId);
            found != partParameters.end())
            lastKnownValues = found->second.lastKnownValues;
        partParameters.erase (failure.targetId);
        touchedParametersByTarget.erase (failure.targetId);
        if (editorTargetId == failure.targetId)
            hideEditor();
        if (floatingEditorIds.contains (failure.targetId))
        {
            floatingEditorIds.removeString (failure.targetId);
            if (options.editorWindows.close != nullptr)
                options.editorWindows.close (failure.targetId);
        }

        auto& retry = failovers[failure.targetId];
        retry.targetId = failure.targetId;
        retry.ceId = targetClassCeId (failure.targetId);
        retry.name = failure.name.isNotEmpty() ? failure.name : failure.targetId;
        retry.effect = failure.effect;
        retry.error = "The processor failed, disconnected or missed its audio deadline and was taken out of the audio path.";
        retry.attempts = 0;
        retry.state = settings.enabled ? "waiting" : "bypassed";
        retry.nextAttemptMs = now + settings.retryDelayMs;
        retry.parameterValues = std::move (lastKnownValues);

        auto* event = new juce::DynamicObject();
        event->setProperty ("targetId", retry.targetId);
        event->setProperty ("name", retry.name);
        event->setProperty ("effect", retry.effect);
        event->setProperty ("automatic", settings.enabled);
        emitScriptEvent ("pluginFailover", juce::var (event));
    }
    emitState();
}

void InstrumentHostService::tickAutomaticFailover()
{
    const auto& settings = rack.getPerformance().automaticFailover;
    if (! settings.enabled)
        return;
    const auto now = juce::Time::getMillisecondCounterHiRes();

    juce::StringArray due;
    for (const auto& [targetId, retry] : failovers)
        if (retry.state == "waiting" && retry.nextAttemptMs <= now)
            due.add (targetId);

    for (const auto& targetId : due)
        beginFailoverAttempt (targetId);
}

void InstrumentHostService::beginFailoverAttempt (const juce::String& targetId)
{
    const auto found = failovers.find (targetId);
    if (found == failovers.end() || found->second.state != "waiting")
        return;

    auto& retry = found->second;
    const auto ceId = targetClassCeId (targetId);
    if (retry.ceId.isEmpty() || ceId != retry.ceId)
    {
        // The target was removed or deliberately replaced while its retry was queued. That user
        // action is the resolution; an old incident must never reload over the new choice.
        failovers.erase (found);
        emitState();
        return;
    }

    retry.state = "loading";
    ++retry.attempts;
    emitState();
    const auto completion = [this, targetId] (bool ok, const juce::String& error)
    {
        const auto current = failovers.find (targetId);
        if (current == failovers.end())
            return;
        auto& state = current->second;
        if (targetClassCeId (targetId) != state.ceId)
        {
            failovers.erase (current);
            emitState();
            return;
        }
        if (ok)
        {
            // commitLoad restored the last opaque state and attachParameters rebuilt the stable
            // registry before this callback. Overlay the freshest observed values by ID. Active
            // modulation destinations are excluded because attachParameters has already rebuilt
            // their current value from the persisted base and live source.
            for (const auto& [parameterId, value] : state.parameterValues)
            {
                bool modulated = false;
                for (const auto& route : rack.getPerformance().modulationRoutes)
                    modulated = modulated || (route.targetId == targetId
                                           && route.parameterId == parameterId);
                if (! modulated)
                    writeTargetValueRaw (targetId, parameterId, value);
            }
            state.state = "recovered";
            state.error.clear();
        }
        else
        {
            const auto& policy = rack.getPerformance().automaticFailover;
            state.error = error;
            if (! policy.enabled)
            {
                state.state = "bypassed";
                state.nextAttemptMs = 0.0;
            }
            else if (state.attempts >= policy.maxAttempts)
                state.state = "failed";
            else
            {
                state.state = "waiting";
                const auto multiplier = 1 << juce::jmin (4, state.attempts - 1);
                state.nextAttemptMs = juce::Time::getMillisecondCounterHiRes()
                                    + policy.retryDelayMs * multiplier;
            }
        }
        emitState();
    };

    if (retry.effect)
        requestEffect (targetId, ceId, completion, true);
    else
        requestInstrument (targetId, ceId, {}, completion, true);
}

void InstrumentHostService::retryFailedProcessor (const juce::String& targetId)
{
    const auto found = failovers.find (targetId);
    if (found == failovers.end())
    {
        emitError ("That failed plug-in is no longer in the recovery list.");
        return;
    }
    found->second.state = "waiting";
    found->second.attempts = 0;
    found->second.nextAttemptMs = juce::Time::getMillisecondCounterHiRes();
    // A manual retry remains available when automatic attempts are disabled. Turning the
    // policy off means "do not keep trying on your own", not "disable the repair button".
    beginFailoverAttempt (targetId);
}

juce::String InstrumentHostService::slotDisplayName (const ControlBinding& binding, bool resolved) const
{
    if (binding.label.isNotEmpty())
        return binding.label;

    if (isVirtualParameterId (binding.parameterId))
        return virtualParameterName (binding.partId, binding.parameterId);

    if (resolved)
        if (const auto it = partParameters.find (binding.partId); it != partParameters.end())
            if (const auto* d = it->second.inventory.find (binding.parameterId))
                return d->name;

    return binding.parameterId;
}

float InstrumentHostService::slotPositionFor (const ControlBinding& binding, float parameterValue)
{
    const auto span = binding.rangeMax - binding.rangeMin;
    const auto positioned = span > 0.0f
                              ? juce::jlimit (0.0f, 1.0f, (parameterValue - binding.rangeMin) / span)
                              : 0.0f;
    return binding.inverted ? 1.0f - positioned : positioned;
}

juce::Array<InstrumentHostService::SurfaceSlot> InstrumentHostService::surfaceSlots (const juce::String& pageId) const
{
    juce::Array<SurfaceSlot> out;
    const auto* page = rack.getPerformance().findPage (pageId);
    if (page == nullptr)
        return out;

    auto* self = const_cast<InstrumentHostService*> (this);
    for (const auto& slot : page->slots)
    {
        const auto& b = slot.binding;
        SurfaceSlot view;
        view.slotId = slot.slotId;
        view.assigned = ! b.isEmpty();
        view.resolved = bindingResolves (b);
        view.displayName = view.assigned ? slotDisplayName (b, view.resolved) : juce::String();

        if (view.resolved)
        {
            if (isVirtualParameterId (b.parameterId))
            {
                view.valueText = virtualParameterText (b.partId, b.parameterId);
                view.position = slotPositionFor (b, virtualParameterValue (b.partId, b.parameterId));
            }
            else if (auto* parameter = self->resolveParameter (b.partId, b.parameterId))
            {
                view.valueText = parameter->getCurrentValueAsText();
                view.position = slotPositionFor (b, parameter->getValue());
            }
        }

        out.add (std::move (view));
    }

    return out;
}

bool InstrumentHostService::nudgeControlSlot (const juce::String& pageId, const juce::String& slotId,
                                              int delta)
{
    const auto* page = rack.getPerformance().findPage (pageId);
    const auto* slot = page != nullptr ? page->findSlot (slotId) : nullptr;
    if (slot == nullptr || slot->binding.isEmpty() || ! bindingResolves (slot->binding))
        return false;

    const auto& b = slot->binding;

    float current = 0.0f;
    if (isVirtualParameterId (b.parameterId))
    {
        current = virtualParameterValue (b.partId, b.parameterId);
    }
    else if (auto* parameter = resolveParameter (b.partId, b.parameterId))
    {
        current = parameter->getValue();
    }
    else
    {
        return false;
    }

    const auto position = juce::jlimit (0.0f, 1.0f,
                                        slotPositionFor (b, current) + (float) delta / 127.0f);
    writeMappedBinding (b, position);
    if (! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "setControlSlotValue");
        action->setProperty ("pageId", pageId);
        action->setProperty ("slotId", slotId);
        action->setProperty ("value", position);
        recordPerformanceAction (juce::var (action));
    }
    const auto positioned = b.inverted ? 1.0f - position : position;
    recordGestureValue (b.partId, b.parameterId,
                        b.rangeMin + positioned * (b.rangeMax - b.rangeMin));

    // A virtual nudge changed the manifest (fader, send, macro): persist it and let the UI
    // follow the hardware — plug-in nudges reach the UI through the drain instead.
    if (isVirtualParameterId (b.parameterId))
    {
        savePerformance();
        emitState();
    }
    return true;
}

bool InstrumentHostService::bindingResolves (const ControlBinding& binding) const
{
    if (binding.isEmpty())
        return false;

    // A virtual address belongs to the rack itself, not a plug-in class: it resolves as
    // long as its part/return/macro still exists, whatever the part now hosts.
    if (isVirtualParameterId (binding.parameterId))
        return virtualParameterExists (binding.partId, binding.parameterId);

    // The target may be a rack part or an effect slot; either way the class it CURRENTLY
    // carries must still be the one the binding was assigned against.
    const auto currentClass = targetClassCeId (binding.partId);
    if (currentClass.isEmpty() || currentClass != binding.pluginCeId)
        return false;

    const auto it = partParameters.find (binding.partId);
    return it != partParameters.end()
        && it->second.inventory.find (binding.parameterId) != nullptr;
}

void InstrumentHostService::recompilePerformance()
{
    const auto& performance = rack.getPerformance();

    perf::CompileContext context;
    context.partIndexFor = [this] (const juce::String& partId)
    {
        return rack.partIndexFor (partId);
    };
    context.parameterResolves = [this] (const juce::String& targetId, const juce::String& parameterId,
                                        const juce::String& expectedCeId)
    {
        // The Stage 2 honesty rule, applied to automation: the address must exist AND the
        // target must still carry the class the lane was authored against. A lane that fails
        // this compiles to silence and shows unresolved — it is never retargeted by name.
        if (! targetParameterExists (targetId, parameterId))
            return false;
        if (isVirtualParameterId (parameterId) || expectedCeId.isEmpty())
            return true;
        return targetClassCeId (targetId) == expectedCeId;
    };

    rack.getEngine().setSong (perf::compileSong (performance.patterns, performance.clips, context),
                              ++songGeneration);
}

namespace
{
    struct CapturedMidiNote
    {
        std::int64_t startSample = 0;
        std::int64_t endSample = 0;
        int note = 60;
        int velocity = 100;
        int channel = 1;
    };

    std::vector<CapturedMidiNote> extractCapturedNotes (
        const perf::MidiCaptureJournal::Snapshot& history,
        std::int64_t firstSample, std::int64_t lastSample)
    {
        struct HeldNote
        {
            bool active = false;
            std::int64_t startSample = 0;
            int velocity = 100;
        };

        std::array<std::array<HeldNote, 128>, 16> held {};
        std::vector<CapturedMidiNote> notes;
        notes.reserve (history.events.size() / 2 + 1);

        const auto finishHeld = [&notes] (HeldNote& active, int note, int channel,
                                          std::int64_t endSample)
        {
            if (! active.active)
                return;
            notes.push_back ({ active.startSample, juce::jmax (active.startSample + 1, endSample),
                               note, active.velocity, channel });
            active = {};
        };

        for (const auto& event : history.events)
        {
            if (event.samplePosition < firstSample || event.samplePosition > lastSample)
                continue;
            const auto message = event.message();
            if (! message.isNoteOnOrOff())
                continue;

            const auto channel = juce::jlimit (1, 16, message.getChannel());
            const auto note = juce::jlimit (0, 127, message.getNoteNumber());
            auto& active = held[(size_t) (channel - 1)][(size_t) note];
            if (message.isNoteOn())
            {
                finishHeld (active, note, channel, event.samplePosition);
                active = { true, event.samplePosition,
                           juce::jlimit (1, 127, (int) message.getVelocity()) };
            }
            else
            {
                finishHeld (active, note, channel, event.samplePosition);
            }
        }

        // A key still held when capture closes ends at the loop/take boundary.
        for (int channel = 1; channel <= 16; ++channel)
            for (int note = 0; note < 128; ++note)
                finishHeld (held[(size_t) (channel - 1)][(size_t) note], note, channel,
                            lastSample);

        std::stable_sort (notes.begin(), notes.end(), [] (const auto& a, const auto& b)
        {
            return a.startSample < b.startSample;
        });
        return notes;
    }

    struct CaptureGrid { int stepCount = 16; int stepsPerBeat = 4; };

    CaptureGrid captureGridFor (double phrasePpq)
    {
        constexpr int candidateRates[] { 16, 12, 8, 6, 4, 3, 2, 1 };
        for (const auto rate : candidateRates)
        {
            const auto steps = juce::jmax (1, (int) std::ceil (phrasePpq * (double) rate));
            if (steps <= 128)
                return { steps, rate };
        }
        return { 128, 1 };
    }

    CaptureGrid freezeGridFor (double phrasePpq)
    {
        // Pattern lengths are rational because every source lane is steps / stepsPerBeat.
        // Prefer a rate that represents the bounced span exactly so the new loop cannot
        // acquire a rounding seam after repeated playback.
        for (int rate = 16; rate >= 1; --rate)
        {
            const auto exactSteps = phrasePpq * (double) rate;
            const auto rounded = (int) std::llround (exactSteps);
            if (rounded >= 1 && rounded <= 128
                && std::abs (exactSteps - (double) rounded) < 1.0e-7)
                return { rounded, rate };
        }
        return captureGridFor (phrasePpq);
    }

    bool channelIsPresent (const std::vector<CapturedMidiNote>& notes, int channel)
    {
        return std::any_of (notes.begin(), notes.end(), [channel] (const auto& note)
        {
            return note.channel == channel;
        });
    }

    perf::Lane makeCaptureLane (int channel, const CaptureGrid& grid,
                                const juce::String& targetPartId, bool multipleChannels)
    {
        perf::Lane lane;
        lane.laneId = juce::Uuid().toDashedString();
        lane.type = perf::LaneType::chord;
        lane.name = multipleChannels ? "Captured notes — Ch " + juce::String (channel)
                                     : "Captured notes";
        lane.targetPartId = targetPartId;
        lane.channel = channel;
        lane.stepCount = grid.stepCount;
        lane.stepsPerBeat = grid.stepsPerBeat;
        lane.resizeSteps();
        return lane;
    }

    void placeCapturedNote (perf::Lane& lane, const CapturedMidiNote& note,
                            std::int64_t captureOrigin, double ppqPerSample,
                            double phaseOffsetPpq = 0.0, double loopLengthPpq = 0.0)
    {
        auto eventPpq = phaseOffsetPpq
                      + (double) (note.startSample - captureOrigin) * ppqPerSample;
        if (loopLengthPpq > 0.0)
        {
            eventPpq = std::fmod (eventPpq, loopLengthPpq);
            if (eventPpq < 0.0)
                eventPpq += loopLengthPpq;
        }

        const auto exactStep = eventPpq * (double) lane.stepsPerBeat;
        const auto roundedStep = (int) std::llround (exactStep);
        const auto stepIndex = loopLengthPpq > 0.0
            ? ((roundedStep % lane.stepCount) + lane.stepCount) % lane.stepCount
            : juce::jlimit (0, lane.stepCount - 1, roundedStep);
        auto& step = lane.steps.getReference (stepIndex);
        const auto durationSteps = (double) (note.endSample - note.startSample)
                                   * ppqPerSample * (double) lane.stepsPerBeat;

        if (! step.active)
        {
            step.note = note.note;
            step.velocity = note.velocity;
            step.microtiming = juce::jlimit (-0.5f, 0.5f,
                                              (float) (exactStep - roundedStep));
            step.gate = juce::jlimit (0.05f, 4.0f, (float) durationSteps);
        }
        else
        {
            step.chordNotes.addIfNotAlreadyThere (step.note);
            step.chordNotes.addIfNotAlreadyThere (note.note);
            step.velocity = juce::jmax (step.velocity, note.velocity);
            step.gate = juce::jmax (step.gate,
                                    juce::jlimit (0.05f, 4.0f, (float) durationSteps));
        }
        step.active = true;
    }

    void appendCapturedEvent (perf::MidiCaptureJournal::Snapshot& capture,
                              const juce::MidiMessage& message,
                              std::int64_t samplePosition)
    {
        const auto* bytes = message.getRawData();
        const auto size = message.getRawDataSize();
        if (bytes == nullptr || size < 1 || size > 3)
            return;

        const auto statusClass = bytes[0] & 0xf0;
        if (statusClass < 0x80 || statusClass > 0xe0)
            return;

        perf::MidiCaptureJournal::Event event;
        event.samplePosition = samplePosition;
        event.packedMessage = (std::uint32_t) size << 24;
        for (int i = 0; i < size; ++i)
            event.packedMessage |= (std::uint32_t) bytes[i] << (8 * i);
        capture.events.push_back (event);
    }
}

void InstrumentHostService::createRetrospectiveClip (double seconds)
{
    auto& performance = const_cast<Performance&> (rack.getPerformance());
    auto& engine = rack.getEngine();
    const auto history = engine.recentMidi (
        juce::jlimit (1.0, perf::MidiCaptureJournal::maxHistorySeconds, seconds));
    auto notes = extractCapturedNotes (history, history.startSample, history.endSample);

    if (notes.empty())
    {
        emitError ("No notes were played in that part of the MIDI history.");
        return;
    }

    auto captureStart = notes.front().startSample;
    auto captureEnd = captureStart + 1;
    for (const auto& note : notes)
        captureEnd = juce::jmax (captureEnd, note.endSample);

    const auto tempo = juce::jlimit (20.0, 300.0, engine.getTransport().getTempo());
    const auto ppqPerSample = tempo / (60.0 * juce::jmax (1.0, history.sampleRate));
    const auto maxPhraseSamples = (std::int64_t) std::floor (128.0 / ppqPerSample);
    const bool trimmed = captureEnd - captureStart > maxPhraseSamples;
    if (trimmed)
        captureStart = captureEnd - maxPhraseSamples;

    notes.erase (std::remove_if (notes.begin(), notes.end(), [captureStart] (const auto& note)
    {
        return note.endSample <= captureStart;
    }), notes.end());
    for (auto& note : notes)
        note.startSample = juce::jmax (note.startSample, captureStart);

    const auto phrasePpq = juce::jmax (1.0 / 16.0,
                                      (double) (captureEnd - captureStart) * ppqPerSample);
    const auto grid = captureGridFor (phrasePpq);
    int channels = 0;
    for (int channel = 1; channel <= 16; ++channel)
        channels += channelIsPresent (notes, channel) ? 1 : 0;

    const auto capturedName = "Retrospective " + juce::Time::getCurrentTime().formatted ("%H:%M:%S");
    auto pattern = perf::Pattern::create (capturedName);
    for (int channel = 1; channel <= 16; ++channel)
    {
        if (! channelIsPresent (notes, channel))
            continue;
        auto lane = makeCaptureLane (channel, grid, performance.focusedPartId, channels > 1);
        for (const auto& note : notes)
            if (note.channel == channel)
                placeCapturedNote (lane, note, captureStart, ppqPerSample);
        pattern.lanes.add (std::move (lane));
    }

    perf::Clip clip;
    clip.clipId = juce::Uuid().toDashedString();
    clip.patternId = pattern.patternId;
    clip.name = capturedName;
    clip.launchQuantize = performance.transport.defaultQuantize;

    lastRetrospectivePatternId = pattern.patternId;
    lastRetrospectiveClipId = clip.clipId;
    lastRetrospectiveNoteCount = (int) notes.size();
    lastRetrospectiveStepCount = grid.stepCount;
    lastRetrospectiveSeconds = (double) (captureEnd - captureStart) / history.sampleRate;
    lastRetrospectiveTrimmed = trimmed || history.eventCapacityReached;

    performance.patterns.add (std::move (pattern));
    performance.clips.add (std::move (clip));
    recompilePerformance();
    savePerformance();
    emitState();
}

void InstrumentHostService::freezeMidiClip (const juce::String& clipId, int requestedCycles)
{
    auto& performance = const_cast<Performance&> (rack.getPerformance());
    const auto* sourceClip = performance.findClip (clipId);
    const auto* sourcePattern = sourceClip != nullptr
                                  ? performance.findPattern (sourceClip->patternId) : nullptr;
    if (sourceClip == nullptr || sourcePattern == nullptr)
    {
        emitError ("Unknown clip or source pattern.");
        return;
    }
    if (sourceClip->frozenMidi)
    {
        emitError ("That clip is already frozen MIDI.");
        return;
    }

    const auto cycles = juce::jlimit (1, 8, requestedCycles);
    const auto sourceLengthPpq = juce::jmax (0.0625, sourcePattern->lengthPpq());
    const auto resultLengthPpq = sourceLengthPpq * (double) cycles;
    if (resultLengthPpq > 128.0)
    {
        emitError ("That many cycles exceed the editable 128-beat MIDI freeze limit.");
        return;
    }

    std::set<int> targetParts;
    for (const auto& lane : sourcePattern->lanes)
    {
        if (lane.type == perf::LaneType::parameter)
            continue;
        const auto index = performance.indexOfPart (lane.targetPartId);
        if (juce::isPositiveAndBelow (index, perf::PerformanceEngine::maxParts))
            targetParts.insert (index);
    }
    if (targetParts.empty())
    {
        emitError ("This clip has no playable MIDI lanes to freeze.");
        return;
    }

    // Render in isolation: the live graph, transport and plug-ins are untouched. One warm-up
    // cycle establishes arp/echo/chorder state; the following requested cycles become the
    // steady, loopable result. Seeded probability remains deterministic in the source engine.
    constexpr double renderSampleRate = 48000.0;
    constexpr int renderBlockSize = 256;
    const auto tempo = juce::jlimit (20.0, 300.0, rack.getEngine().getTransport().getTempo());
    const auto ppqPerSample = tempo / (60.0 * renderSampleRate);
    const auto captureStartPpq = sourceLengthPpq;
    const auto captureEndPpq = captureStartPpq + resultLengthPpq;
    const auto captureSamples = (std::int64_t) std::ceil (resultLengthPpq / ppqPerSample);

    juce::Array<perf::Pattern> renderPatterns;
    renderPatterns.add (*sourcePattern);
    auto renderClip = *sourceClip;
    renderClip.clipId = "@midi-freeze";
    renderClip.launchQuantize = perf::Quantize::immediate;
    renderClip.loop = true;
    renderClip.followClipId.clear();
    renderClip.followAfterLoops = 0;
    renderClip.followAction = "none";
    renderClip.fillPatternId.clear();
    renderClip.frozenMidi = false;
    juce::Array<perf::Clip> renderClips;
    renderClips.add (renderClip);

    perf::CompileContext context;
    context.partIndexFor = [&performance] (const juce::String& partId)
    {
        return performance.indexOfPart (partId);
    };
    context.parameterResolves = [] (const juce::String&, const juce::String&,
                                    const juce::String&) { return false; };

    perf::PerformanceEngine renderer;
    renderer.prepare (renderSampleRate, renderBlockSize,
                      juce::jmin (performance.parts.size(), perf::PerformanceEngine::maxParts));
    renderer.setSong (perf::compileSong (renderPatterns, renderClips, context), 1);
    renderer.getTransport().setTempo (tempo);
    renderer.getTransport().setTimeSignature (
        rack.getEngine().getTransport().getTimeSignatureNumerator(),
        rack.getEngine().getTransport().getTimeSignatureDenominator());
    renderer.getTransport().start();
    renderer.launchClip (0, perf::Quantize::immediate);

    struct PartRender
    {
        int partIndex = -1;
        std::unique_ptr<perf::MidiInsertRack> inserts;
        perf::MidiCaptureJournal::Snapshot capture;
        juce::MidiBuffer output;
    };
    std::vector<PartRender> partRenders;
    partRenders.reserve (targetParts.size());
    for (const auto partIndex : targetParts)
    {
        PartRender part;
        part.partIndex = partIndex;
        part.inserts = std::make_unique<perf::MidiInsertRack>();
        part.inserts->setSlots (performance.parts.getReference (partIndex).midiChain);
        part.inserts->prepare (renderBlockSize);
        part.capture.sampleRate = renderSampleRate;
        part.capture.startSample = 0;
        part.capture.endSample = captureSamples;
        part.capture.requestedSeconds = (double) captureSamples / renderSampleRate;
        partRenders.push_back (std::move (part));
    }

    juce::MidiBuffer noLiveInput;
    const auto maximumBlocks = 4 + (int) std::ceil (
        captureEndPpq / ppqPerSample / (double) renderBlockSize);
    for (int blockIndex = 0; blockIndex < maximumBlocks
                              && renderer.getTransport().getPositionPpq() < captureEndPpq;
         ++blockIndex)
    {
        renderer.processBlock (renderBlockSize, noLiveInput);
        const auto block = renderer.lastBlockTime();
        for (auto& part : partRenders)
        {
            part.inserts->process (renderer.stagingFor (part.partIndex), part.output,
                                   block, renderBlockSize);
            for (const auto metadata : part.output)
            {
                const auto eventPpq = block.startPpq
                                      + block.ppqPerSample * (double) metadata.samplePosition;
                if (eventPpq + 1.0e-9 < captureStartPpq
                    || eventPpq >= captureEndPpq - 1.0e-9)
                    continue;
                const auto relativeSample = (std::int64_t) std::llround (
                    (eventPpq - captureStartPpq) / ppqPerSample);
                appendCapturedEvent (part.capture, metadata.getMessage(), relativeSample);
            }
        }
    }

    const auto grid = freezeGridFor (resultLengthPpq);
    auto frozenPattern = perf::Pattern::create (sourceClip->name + " (Frozen MIDI)");
    int totalNotes = 0;
    for (const auto& part : partRenders)
    {
        auto notes = extractCapturedNotes (part.capture, 0, captureSamples);
        if (notes.empty())
            continue;
        totalNotes += (int) notes.size();

        int channelCount = 0;
        for (int channel = 1; channel <= 16; ++channel)
            channelCount += channelIsPresent (notes, channel) ? 1 : 0;

        const auto& target = performance.parts.getReference (part.partIndex);
        const auto targetName = target.pluginName.isNotEmpty()
                                  ? target.pluginName : "Part " + juce::String (part.partIndex + 1);
        for (int channel = 1; channel <= 16; ++channel)
        {
            if (! channelIsPresent (notes, channel))
                continue;
            auto lane = makeCaptureLane (channel, grid, target.partId, channelCount > 1);
            lane.name = "Frozen — " + targetName
                        + (channelCount > 1 ? " · Ch " + juce::String (channel) : juce::String());
            for (const auto& note : notes)
                if (note.channel == channel)
                    placeCapturedNote (lane, note, 0, ppqPerSample);
            frozenPattern.lanes.add (std::move (lane));
        }
    }

    if (totalNotes == 0)
    {
        emitError ("The selected clip produced no notes to freeze.");
        return;
    }

    perf::Clip frozenClip;
    frozenClip.clipId = juce::Uuid().toDashedString();
    frozenClip.patternId = frozenPattern.patternId;
    frozenClip.name = sourceClip->name + " (Frozen MIDI)";
    frozenClip.launchQuantize = sourceClip->launchQuantize;
    frozenClip.loop = true;
    frozenClip.frozenMidi = true;
    frozenClip.frozenFromClipId = sourceClip->clipId;
    frozenClip.frozenCycles = cycles;
    frozenClip.frozenNoteCount = totalNotes;

    performance.patterns.add (std::move (frozenPattern));
    performance.clips.add (std::move (frozenClip));
    recompilePerformance();
    savePerformance();
    emitState();
}

void InstrumentHostService::startMidiLoop (const juce::String& clipId)
{
    if (midiLoopRecording)
    {
        emitError ("A MIDI loop pass is already recording.");
        return;
    }

    auto& engine = rack.getEngine();
    midiLoopOverdub = clipId.isNotEmpty();
    midiLoopTargetClipId = clipId;
    midiLoopStartPhasePpq = 0.0;

    if (midiLoopOverdub)
    {
        const auto& performance = rack.getPerformance();
        const auto index = performance.indexOfClip (clipId);
        const auto* clip = performance.findClip (clipId);
        const auto* pattern = clip != nullptr ? performance.findPattern (clip->patternId) : nullptr;
        if (index < 0 || clip == nullptr || pattern == nullptr || ! clip->looperLayer)
        {
            midiLoopOverdub = false;
            midiLoopTargetClipId = {};
            emitError ("That clip is not a MIDI looper layer.");
            return;
        }

        midiLoopStartPhasePpq = (double) engine.clipPhase (index) * pattern->lengthPpq();
        if (! engine.isClipActive (index))
            engine.launchClip (index, perf::Quantize::immediate);
    }

    midiLoopStartSample = engine.midiHistorySamplePosition();
    midiLoopRecording = true;

    // Closing the first pass must immediately have a clock to play against. Starting here is
    // also what makes a looper useful without first visiting the transport controls.
    if (! engine.getTransport().isPlaying())
        engine.getTransport().start();

    emitState();
}

void InstrumentHostService::finishMidiLoop()
{
    if (! midiLoopRecording)
    {
        emitError ("No MIDI loop pass is recording.");
        return;
    }

    auto& performance = const_cast<Performance&> (rack.getPerformance());
    auto& engine = rack.getEngine();
    const auto wasOverdub = midiLoopOverdub;
    const auto targetClipId = midiLoopTargetClipId;
    const auto startSample = midiLoopStartSample;
    const auto startPhasePpq = midiLoopStartPhasePpq;
    const auto endSample = engine.midiHistorySamplePosition();
    const auto sampleRate = juce::jmax (1.0, engine.midiHistorySampleRate());

    midiLoopRecording = false;
    midiLoopOverdub = false;
    midiLoopTargetClipId = {};
    midiLoopStartSample = 0;
    midiLoopStartPhasePpq = 0.0;

    if (endSample <= startSample)
    {
        emitError ("The loop pass was too short to record.");
        emitState();
        return;
    }

    const auto elapsedSeconds = (double) (endSample - startSample) / sampleRate;
    const auto history = engine.recentMidi (juce::jmin (
        perf::MidiCaptureJournal::maxHistorySeconds, elapsedSeconds + 0.1));
    auto notes = extractCapturedNotes (history, juce::jmax (startSample, history.startSample),
                                      endSample);
    if (notes.empty())
    {
        emitError ("No notes were played during that loop pass.");
        emitState();
        return;
    }

    const auto tempo = juce::jlimit (20.0, 300.0, engine.getTransport().getTempo());
    const auto ppqPerSample = tempo / (60.0 * sampleRate);

    if (wasOverdub)
    {
        auto* clip = performance.findClip (targetClipId);
        auto* pattern = clip != nullptr ? performance.findPattern (clip->patternId) : nullptr;
        if (clip == nullptr || pattern == nullptr || ! clip->looperLayer)
        {
            emitError ("The looper layer disappeared before the overdub finished.");
            emitState();
            return;
        }

        const auto loopPpq = pattern->lengthPpq();
        const auto grid = captureGridFor (loopPpq);
        int channels = 0;
        for (int channel = 1; channel <= 16; ++channel)
            channels += channelIsPresent (notes, channel) ? 1 : 0;

        for (int channel = 1; channel <= 16; ++channel)
        {
            if (! channelIsPresent (notes, channel))
                continue;

            perf::Lane* lane = nullptr;
            for (auto& candidate : pattern->lanes)
                if (candidate.type == perf::LaneType::chord && candidate.channel == channel)
                {
                    lane = &candidate;
                    break;
                }

            if (lane == nullptr)
            {
                auto added = makeCaptureLane (channel, grid, performance.focusedPartId,
                                              channels > 1 || ! pattern->lanes.isEmpty());
                pattern->lanes.add (std::move (added));
                lane = &pattern->lanes.getReference (pattern->lanes.size() - 1);
            }

            for (const auto& note : notes)
                if (note.channel == channel)
                    placeCapturedNote (*lane, note, startSample, ppqPerSample,
                                       startPhasePpq, loopPpq);
        }

        ++clip->overdubPasses;
        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    // The first pass defines the layer. Whole-beat closure absorbs button-release latency and
    // produces a rehearsable loop; sub-step timing inside the pass remains in microtiming.
    const auto rawLoopPpq = (double) (endSample - startSample) * ppqPerSample;
    const auto loopPpq = juce::jlimit (1.0, 128.0, std::round (rawLoopPpq));
    const auto grid = captureGridFor (loopPpq);
    int channels = 0;
    for (int channel = 1; channel <= 16; ++channel)
        channels += channelIsPresent (notes, channel) ? 1 : 0;

    const auto layerNumber = std::count_if (performance.clips.begin(), performance.clips.end(),
                                             [] (const perf::Clip& clip) { return clip.looperLayer; }) + 1;
    const auto layerName = "Loop layer " + juce::String ((int) layerNumber);
    auto pattern = perf::Pattern::create (layerName);
    for (int channel = 1; channel <= 16; ++channel)
    {
        if (! channelIsPresent (notes, channel))
            continue;
        auto lane = makeCaptureLane (channel, grid, performance.focusedPartId, channels > 1);
        for (const auto& note : notes)
            if (note.channel == channel)
                placeCapturedNote (lane, note, startSample, ppqPerSample, 0.0, loopPpq);
        pattern.lanes.add (std::move (lane));
    }

    perf::Clip clip;
    clip.clipId = juce::Uuid().toDashedString();
    clip.patternId = pattern.patternId;
    clip.name = layerName;
    clip.launchQuantize = perf::Quantize::immediate;
    clip.loop = true;
    clip.looperLayer = true;

    const auto newClipIndex = performance.clips.size();
    performance.patterns.add (std::move (pattern));
    performance.clips.add (std::move (clip));
    recompilePerformance();
    engine.launchClip (newClipIndex, perf::Quantize::immediate);
    savePerformance();
    emitState();
}

void InstrumentHostService::cancelMidiLoop()
{
    if (! midiLoopRecording)
        return;

    midiLoopRecording = false;
    midiLoopOverdub = false;
    midiLoopTargetClipId = {};
    midiLoopStartSample = 0;
    midiLoopStartPhasePpq = 0.0;
    emitState();
}

void InstrumentHostService::removeMidiLoop (const juce::String& clipId)
{
    auto& performance = const_cast<Performance&> (rack.getPerformance());
    const auto clipIndex = performance.indexOfClip (clipId);
    const auto* clip = performance.findClip (clipId);
    if (clipIndex < 0 || clip == nullptr || ! clip->looperLayer)
    {
        emitError ("That clip is not a MIDI looper layer.");
        return;
    }
    if (midiLoopRecording && midiLoopTargetClipId == clipId)
    {
        emitError ("Finish or cancel the overdub before removing its layer.");
        return;
    }
    if (gestureRecording && gestureTargetClipId == clipId)
    {
        emitError ("Finish or cancel the gesture take before removing its layer.");
        return;
    }

    const auto patternId = clip->patternId;
    rack.getEngine().stopClip (clipIndex, perf::Quantize::immediate);
    for (auto& scene : performance.scenes)
        scene.clipIds.removeString (clipId);
    performance.clips.remove (clipIndex);

    bool patternStillUsed = false;
    for (const auto& remaining : performance.clips)
        patternStillUsed = patternStillUsed || remaining.patternId == patternId;
    if (! patternStillUsed)
        for (int i = performance.patterns.size(); --i >= 0;)
            if (performance.patterns.getReference (i).patternId == patternId)
            {
                performance.patterns.remove (i);
                break;
            }

    recompilePerformance();
    savePerformance();
    emitState();
}

void InstrumentHostService::recordGestureValue (const juce::String& targetId,
                                                const juce::String& parameterId, float value)
{
    if (! gestureRecording || targetId.isEmpty() || parameterId.isEmpty()
        || ! targetParameterExists (targetId, parameterId))
        return;

    const auto samplePosition = rack.getEngine().midiHistorySamplePosition();
    if (samplePosition < gestureStartSample)
        return;

    const auto normalized = juce::jlimit (0.0f, 1.0f, value);
    for (auto point = gesturePoints.rbegin(); point != gesturePoints.rend(); ++point)
    {
        if (point->targetId != targetId || point->parameterId != parameterId)
            continue;

        // Several UI/controller values can arrive inside one audio block. Only the last one
        // can own that musical instant; replacing it also keeps a stationary noisy encoder
        // from consuming the bounded take buffer.
        if (point->samplePosition == samplePosition)
        {
            point->value = normalized;
            return;
        }
        if (std::abs (point->value - normalized) < 0.001f)
            return;
        break;
    }

    if (gesturePoints.size() >= maxGesturePoints)
    {
        gestureTruncated = true;
        return;
    }

    juce::String name;
    if (isVirtualParameterId (parameterId))
    {
        name = virtualParameterName (targetId, parameterId);
    }
    else if (const auto found = partParameters.find (targetId); found != partParameters.end())
    {
        if (const auto* descriptor = found->second.inventory.find (parameterId))
            name = descriptor->name;
    }
    if (name.isEmpty())
        name = parameterId;

    gesturePoints.push_back ({ samplePosition, targetId, parameterId,
                               targetClassCeId (targetId), name, normalized });
}

void InstrumentHostService::startGestureRecording (const juce::String& clipId, bool replace)
{
    if (gestureRecording)
    {
        emitError ("A gesture take is already recording.");
        return;
    }

    auto& engine = rack.getEngine();
    gestureTargetClipId = clipId;
    gestureReplace = replace && clipId.isNotEmpty();
    gestureStartPhasePpq = 0.0;

    if (clipId.isNotEmpty())
    {
        const auto& performance = rack.getPerformance();
        const auto clipIndex = performance.indexOfClip (clipId);
        const auto* clip = performance.findClip (clipId);
        const auto* pattern = clip != nullptr ? performance.findPattern (clip->patternId) : nullptr;
        if (clipIndex < 0 || clip == nullptr || pattern == nullptr
            || (! clip->looperLayer && ! clip->gestureClip))
        {
            gestureTargetClipId = {};
            gestureReplace = false;
            emitError ("Gestures can be added to a MIDI loop or an existing gesture clip.");
            return;
        }

        gestureStartPhasePpq = (double) engine.clipPhase (clipIndex) * pattern->lengthPpq();
        if (! engine.isClipActive (clipIndex))
            engine.launchClip (clipIndex, perf::Quantize::immediate);
    }

    gesturePoints.clear();
    if (gesturePoints.capacity() < maxGesturePoints)
        gesturePoints.reserve (maxGesturePoints);
    gestureTruncated = false;
    gestureStartSample = engine.midiHistorySamplePosition();
    gestureRecording = true;

    if (! engine.getTransport().isPlaying())
        engine.getTransport().start();

    emitState();
}

void InstrumentHostService::finishGestureRecording()
{
    if (! gestureRecording)
    {
        emitError ("No gesture take is recording.");
        return;
    }

    auto& performance = const_cast<Performance&> (rack.getPerformance());
    auto& engine = rack.getEngine();
    const auto targetClipId = gestureTargetClipId;
    const auto replace = gestureReplace;
    const auto startSample = gestureStartSample;
    const auto startPhasePpq = gestureStartPhasePpq;
    const auto endSample = engine.midiHistorySamplePosition();
    const auto sampleRate = juce::jmax (1.0, engine.midiHistorySampleRate());
    auto points = std::move (gesturePoints);

    gestureRecording = false;
    gestureReplace = false;
    gestureTargetClipId = {};
    gestureStartSample = 0;
    gestureStartPhasePpq = 0.0;
    gesturePoints.clear();

    if (endSample <= startSample)
    {
        emitError ("The gesture take was too short to record.");
        emitState();
        return;
    }
    if (points.empty())
    {
        emitError ("No knobs, faders or parameters moved during that gesture take.");
        emitState();
        return;
    }

    const auto tempo = juce::jlimit (20.0, 300.0, engine.getTransport().getTempo());
    const auto ppqPerSample = tempo / (60.0 * sampleRate);

    struct GestureTake
    {
        GesturePoint first;
        std::vector<const GesturePoint*> points;
    };
    std::vector<GestureTake> takes;
    for (const auto& point : points)
    {
        auto found = std::find_if (takes.begin(), takes.end(), [&point] (const auto& take)
        {
            return take.first.targetId == point.targetId
                && take.first.parameterId == point.parameterId;
        });
        if (found == takes.end())
        {
            takes.push_back ({ point, {} });
            found = std::prev (takes.end());
        }
        found->points.push_back (&point);
    }

    const auto writeTake = [startSample, startPhasePpq, ppqPerSample, replace]
                           (perf::Pattern& pattern, const CaptureGrid& grid,
                            const GestureTake& take)
    {
        perf::Lane* lane = nullptr;
        for (auto& candidate : pattern.lanes)
            if (candidate.type == perf::LaneType::parameter
                && candidate.lockSourceLaneId.isEmpty()
                && candidate.targetId == take.first.targetId
                && candidate.parameterId == take.first.parameterId)
            {
                lane = &candidate;
                break;
            }

        if (lane == nullptr)
        {
            perf::Lane added;
            added.laneId = juce::Uuid().toDashedString();
            added.type = perf::LaneType::parameter;
            added.name = take.first.name;
            added.targetId = take.first.targetId;
            added.parameterId = take.first.parameterId;
            added.targetCeId = take.first.targetCeId;
            added.stepCount = grid.stepCount;
            added.stepsPerBeat = grid.stepsPerBeat;
            added.glide = true;
            added.resizeSteps();
            pattern.lanes.add (std::move (added));
            lane = &pattern.lanes.getReference (pattern.lanes.size() - 1);
        }
        else
        {
            lane->glide = true;
            if (replace)
                for (auto& step : lane->steps)
                    step = {};
        }

        const auto laneLengthPpq = juce::jmax (1.0 / 16.0, lane->lengthPpq());
        for (const auto* point : take.points)
        {
            auto eventPpq = startPhasePpq
                          + (double) (point->samplePosition - startSample) * ppqPerSample;
            eventPpq = std::fmod (eventPpq, laneLengthPpq);
            if (eventPpq < 0.0)
                eventPpq += laneLengthPpq;

            const auto exactStep = eventPpq * (double) lane->stepsPerBeat;
            const auto roundedStep = (int) std::llround (exactStep);
            const auto stepIndex = ((roundedStep % lane->stepCount) + lane->stepCount)
                                   % lane->stepCount;
            auto& step = lane->steps.getReference (stepIndex);
            step.active = true;
            step.value = point->value;
            step.microtiming = juce::jlimit (-0.5f, 0.5f,
                                              (float) (exactStep - roundedStep));
            step.probability = 100;
        }
    };

    if (targetClipId.isNotEmpty())
    {
        auto* clip = performance.findClip (targetClipId);
        auto* pattern = clip != nullptr ? performance.findPattern (clip->patternId) : nullptr;
        if (clip == nullptr || pattern == nullptr
            || (! clip->looperLayer && ! clip->gestureClip))
        {
            emitError ("The target loop disappeared before the gesture take finished.");
            emitState();
            return;
        }

        // Copy the grid of the lane that already defines the pattern's full length. This
        // keeps odd meters and polymeters exact; adding automation must never lengthen a
        // MIDI loop by rounding its denominator to a different grid.
        auto grid = captureGridFor (pattern->lengthPpq());
        double longest = -1.0;
        for (const auto& lane : pattern->lanes)
            if (lane.lengthPpq() > longest)
            {
                longest = lane.lengthPpq();
                grid = { lane.stepCount, lane.stepsPerBeat };
            }

        for (const auto& take : takes)
            writeTake (*pattern, grid, take);

        ++clip->gesturePasses;
        lastGestureClipId = clip->clipId;
        recompilePerformance();
        savePerformance();
        emitState();
        return;
    }

    // A new gesture performance is a loop in its own right. Like the MIDI looper, the
    // button release rounds the outer length to beats; every movement keeps its sub-step
    // timing and the lane glides between the captured points.
    const auto rawLengthPpq = (double) (endSample - startSample) * ppqPerSample;
    const auto loopPpq = juce::jlimit (1.0, 128.0, std::round (rawLengthPpq));
    const auto grid = captureGridFor (loopPpq);
    const auto gestureNumber = std::count_if (performance.clips.begin(), performance.clips.end(),
                                               [] (const perf::Clip& clip)
                                               { return clip.gestureClip; }) + 1;
    const auto name = "Gesture " + juce::String ((int) gestureNumber);
    auto pattern = perf::Pattern::create (name);
    for (const auto& take : takes)
        writeTake (pattern, grid, take);

    perf::Clip clip;
    clip.clipId = juce::Uuid().toDashedString();
    clip.patternId = pattern.patternId;
    clip.name = name;
    clip.launchQuantize = perf::Quantize::immediate;
    clip.loop = true;
    clip.gestureClip = true;
    clip.gesturePasses = 1;

    const auto newClipIndex = performance.clips.size();
    lastGestureClipId = clip.clipId;
    performance.patterns.add (std::move (pattern));
    performance.clips.add (std::move (clip));
    recompilePerformance();
    engine.launchClip (newClipIndex, perf::Quantize::immediate);
    savePerformance();
    emitState();
}

void InstrumentHostService::cancelGestureRecording()
{
    if (! gestureRecording)
        return;

    gestureRecording = false;
    gestureReplace = false;
    gestureTruncated = false;
    gestureTargetClipId = {};
    gestureStartSample = 0;
    gestureStartPhasePpq = 0.0;
    gesturePoints.clear();
    emitState();
}

bool InstrumentHostService::isPerformanceReplayableCommand (const juce::String& command)
{
    // Construction commands are intentionally absent. A performance take restores the rig
    // it began with and then repeats what was played on it; it is not an edit-history format.
    static const juce::StringArray commands {
        "setParameter", "setParameterText", "resetParameter", "setPartMixer",
        "setReturnLevel", "setSendLevel", "setBusLevel", "setMasterLevel",
        "setControlSlotValue", "setMacroValue", "setEffectBypassed",
        "setModulationRoute", "setMidiLfo", "setMidiLfoOutput", "resetMidiLfo",
        "setEnvelope", "triggerEnvelope", "resetEnvelope", "setMseg", "resetMseg",
        "setRandomModulator", "resetRandomModulator", "launchScene", "launchClip",
        "stopClip", "stopAllClips", "setPerformanceFill", "setlistGo", "setlistNext",
        "setlistPrev", "startArrangement", "stopArrangement", "transportPlay",
        "transportContinue", "transportStop", "setTransportPosition", "setTempo",
        "setTimeSignature", "setExternalClock", "focusPart", "surfacePerformanceEncoder",
        "surfaceStepPad"
    };
    return commands.contains (command);
}

juce::String InstrumentHostService::encodePerformanceMidi (
    const std::vector<perf::MidiCaptureJournal::Event>& events, juce::int64 startSample)
{
    juce::MemoryOutputStream stream;
    for (const auto& event : events)
    {
        stream.writeInt64 (juce::jmax ((juce::int64) 0,
                                      (juce::int64) event.samplePosition - startSample));
        stream.writeInt ((int) event.packedMessage);
    }
    return stream.getMemoryBlock().toBase64Encoding();
}

std::vector<perf::MidiCaptureJournal::Event> InstrumentHostService::decodePerformanceMidi (
    const PerformanceTake& take)
{
    std::vector<perf::MidiCaptureJournal::Event> events;
    juce::MemoryBlock bytes;
    if (! bytes.fromBase64Encoding (take.midiDataBase64))
        return events;

    juce::MemoryInputStream stream (bytes, false);
    events.reserve ((size_t) juce::jmin (take.midiEventCount, 500000));
    while (stream.getNumBytesRemaining() >= 12 && events.size() < 500000)
    {
        perf::MidiCaptureJournal::Event event;
        event.samplePosition = juce::jmax ((juce::int64) 0, stream.readInt64());
        event.packedMessage = (std::uint32_t) stream.readInt();
        const auto size = event.size();
        if (size >= 1 && size <= 3)
            events.push_back (event);
    }
    return events;
}

void InstrumentHostService::startPerformanceRecording (const juce::String& requestedName)
{
    if (performanceRecording)
    {
        emitError ("A whole performance is already recording.");
        return;
    }
    if (performanceReplay.state != PerformanceReplayRuntime::State::idle)
    {
        emitError ("Stop Instant Replay before recording a new performance.");
        return;
    }

    auto initialState = rack.captureState().toVar();
    if (auto* root = initialState.getDynamicObject())
        root->removeProperty ("performanceTakes"); // no take-within-take exponential growth

    auto& engine = rack.getEngine();
    performanceRecordingTake = {};
    performanceRecordingTake.takeId = juce::Uuid().toDashedString();
    performanceRecordingTake.name = requestedName.trim().substring (0, 80);
    if (performanceRecordingTake.name.isEmpty())
        performanceRecordingTake.name = "Performance "
                                      + juce::String (rack.getPerformance().performanceTakes.size() + 1);
    performanceRecordingTake.createdAt = juce::Time::getCurrentTime().toISO8601 (true);
    performanceRecordingTake.sampleRate = juce::jmax (1.0, engine.midiHistorySampleRate());
    performanceRecordingTake.startPositionPpq = engine.getTransport().getPositionPpq();
    performanceRecordingTake.transportWasPlaying = engine.getTransport().isPlaying();
    performanceRecordingTake.initialStateJson = juce::JSON::toString (initialState);
    performanceRecordingStartSample = engine.midiHistorySamplePosition();
    performanceRecordingMidiCursor = performanceRecordingStartSample;
    performanceRecordingMidi.clear();
    performanceRecordingMidi.reserve (32768);
    performanceRecording = true;
    emitState();
}

void InstrumentHostService::drainPerformanceRecordingMidi()
{
    if (! performanceRecording)
        return;

    auto& engine = rack.getEngine();
    const auto now = engine.midiHistorySamplePosition();
    const auto rate = juce::jmax (1.0, engine.midiHistorySampleRate());
    const auto seconds = juce::jlimit (0.1, perf::MidiCaptureJournal::maxHistorySeconds,
        (double) juce::jmax ((juce::int64) 0, now - performanceRecordingMidiCursor) / rate + 0.1);
    const auto snapshot = engine.recentMidi (seconds);
    performanceRecordingTake.truncated = performanceRecordingTake.truncated
                                      || snapshot.eventCapacityReached;

    for (const auto& event : snapshot.events)
    {
        if (event.samplePosition < performanceRecordingMidiCursor
            || event.samplePosition < performanceRecordingStartSample)
            continue;
        if (performanceRecordingMidi.size() >= maxPerformanceMidiEvents)
        {
            performanceRecordingTake.truncated = true;
            break;
        }
        performanceRecordingMidi.push_back (event);
    }
    performanceRecordingMidiCursor = juce::jmax (performanceRecordingMidiCursor,
                                                  snapshot.endSample);
}

void InstrumentHostService::recordPerformanceAction (const juce::var& payload)
{
    if (! performanceRecording || performanceReplayDispatching || ! payload.isObject())
        return;
    const auto command = payload.getProperty ("cmd", {}).toString();
    if (! isPerformanceReplayableCommand (command))
        return;

    if (performanceRecordingTake.actions.size() >= maxPerformanceActions)
    {
        performanceRecordingTake.truncated = true;
        return;
    }

    PerformanceTakeAction action;
    action.sampleOffset = juce::jmax ((juce::int64) 0,
        rack.getEngine().midiHistorySamplePosition() - performanceRecordingStartSample);
    action.commandJson = juce::JSON::toString (payload);
    performanceRecordingTake.actions.add (std::move (action));
}

void InstrumentHostService::finishPerformanceRecording()
{
    if (! performanceRecording)
    {
        emitError ("No whole performance is recording.");
        return;
    }

    drainPerformanceRecordingMidi();
    const auto endSample = rack.getEngine().midiHistorySamplePosition();
    performanceRecordingTake.durationSamples = juce::jmax ((juce::int64) 0,
        endSample - performanceRecordingStartSample);
    performanceRecordingTake.midiEventCount = (int) performanceRecordingMidi.size();
    performanceRecordingTake.midiDataBase64 = encodePerformanceMidi (
        performanceRecordingMidi, performanceRecordingStartSample);

    performanceRecording = false;
    performanceRecordingStartSample = 0;
    performanceRecordingMidiCursor = 0;
    performanceRecordingMidi.clear();
    const_cast<Performance&> (rack.getPerformance()).performanceTakes.add (
        std::move (performanceRecordingTake));
    performanceRecordingTake = {};
    savePerformance();
    emitState();
}

void InstrumentHostService::cancelPerformanceRecording()
{
    if (! performanceRecording)
        return;
    performanceRecording = false;
    performanceRecordingTake = {};
    performanceRecordingStartSample = 0;
    performanceRecordingMidiCursor = 0;
    performanceRecordingMidi.clear();
    emitState();
}

bool InstrumentHostService::startPerformanceReplay (const juce::String& takeId)
{
    if (performanceRecording)
    {
        emitError ("Finish or cancel the performance recording before replaying a take.");
        return false;
    }

    const auto& current = rack.getPerformance();
    const PerformanceTake* found = nullptr;
    for (const auto& take : current.performanceTakes)
        if (take.takeId == takeId)
        {
            found = &take;
            break;
        }
    if (found == nullptr)
    {
        emitError ("That performance take no longer exists.");
        return false;
    }

    juce::var stored;
    if (juce::JSON::parse (found->initialStateJson, stored).failed())
    {
        emitError ("That performance take's starting state is damaged.");
        return false;
    }
    Performance initial;
    if (! Performance::fromVar (stored, initial))
    {
        emitError ("That performance take's starting state cannot be restored.");
        return false;
    }

    const auto take = *found;
    const auto retainedTakes = current.performanceTakes;
    stopPerformanceReplay (false);
    initial.performanceTakes = retainedTakes;
    applyPerformance (std::move (initial));

    performanceReplay = {};
    performanceReplay.state = PerformanceReplayRuntime::State::restoring;
    performanceReplay.take = take;
    performanceReplay.midi = decodePerformanceMidi (take);
    performanceReplay.restoreStartedMs = juce::Time::getMillisecondCounterHiRes();
    rack.getEngine().clearReplayMidi();
    emitState();
    return true;
}

void InstrumentHostService::stopPerformanceReplay (bool announce)
{
    if (performanceReplay.state == PerformanceReplayRuntime::State::idle)
        return;
    rack.getEngine().clearReplayMidi();
    rack.getEngine().panic();
    performanceReplay = {};
    if (announce)
        emitState();
}

void InstrumentHostService::tickPerformanceReplay()
{
    if (performanceReplay.state == PerformanceReplayRuntime::State::idle)
        return;

    auto& engine = rack.getEngine();
    if (performanceReplay.state == PerformanceReplayRuntime::State::restoring)
    {
        bool ready = true;
        const auto& model = rack.getPerformance();
        for (const auto& part : model.parts)
        {
            if (! part.hardware && part.pluginCeId.isNotEmpty()
                && ! rack.partHasInstrument (part.partId))
                ready = false;
            for (const auto& effect : part.effects)
                if (effect.pluginCeId.isNotEmpty() && rack.getEffect (effect.effectId) == nullptr)
                    ready = false;
        }
        const auto inspectEffects = [&] (const auto& chains)
        {
            for (const auto& chain : chains)
                for (const auto& effect : chain.effects)
                    if (effect.pluginCeId.isNotEmpty() && rack.getEffect (effect.effectId) == nullptr)
                        ready = false;
        };
        inspectEffects (model.returns);
        inspectEffects (model.buses);
        for (const auto& effect : model.masterEffects)
            if (effect.pluginCeId.isNotEmpty() && rack.getEffect (effect.effectId) == nullptr)
                ready = false;

        const auto timedOut = juce::Time::getMillisecondCounterHiRes()
                            - performanceReplay.restoreStartedMs > 15000.0;
        if (! ready && ! timedOut)
            return;
        performanceReplay.degraded = ! ready;

        auto& transport = engine.getTransport();
        transport.setPosition (performanceReplay.take.startPositionPpq);
        if (performanceReplay.take.transportWasPlaying)
            transport.start();
        else
            transport.stop();
        performanceReplay.startSample = engine.midiHistorySamplePosition()
                                      + juce::jmax (1, options.blockSize);
        performanceReplay.state = PerformanceReplayRuntime::State::playing;
    }

    const auto currentSample = engine.midiHistorySamplePosition();
    const auto elapsed = juce::jmax ((juce::int64) 0,
                                     currentSample - performanceReplay.startSample);
    const auto recordedRate = juce::jmax (1.0, performanceReplay.take.sampleRate);
    const auto currentRate = juce::jmax (1.0, engine.midiHistorySampleRate());
    const auto sampleScale = currentRate / recordedRate;
    const auto recordedElapsed = (juce::int64) std::llround ((double) elapsed / sampleScale);
    const auto lookAhead = recordedElapsed + (juce::int64) std::llround (recordedRate * 2.0);

    while (performanceReplay.nextMidi < performanceReplay.midi.size()
           && performanceReplay.midi[performanceReplay.nextMidi].samplePosition <= lookAhead
           && engine.replayMidiSlotsAvailable() > 0)
    {
        const auto& event = performanceReplay.midi[performanceReplay.nextMidi];
        if (! engine.scheduleReplayMidi (event.message(),
                performanceReplay.startSample
                  + (juce::int64) std::llround ((double) event.samplePosition * sampleScale)))
            break;
        ++performanceReplay.nextMidi;
    }

    while (performanceReplay.nextAction < performanceReplay.take.actions.size()
           && performanceReplay.take.actions.getReference (performanceReplay.nextAction)
                    .sampleOffset <= recordedElapsed)
    {
        const auto& action = performanceReplay.take.actions.getReference (
            performanceReplay.nextAction++);
        juce::var payload;
        if (juce::JSON::parse (action.commandJson, payload).wasOk() && payload.isObject())
        {
            const juce::ScopedValueSetter<bool> replayScope (performanceReplayDispatching, true);
            handleCommand (payload);
        }
    }

    const auto duration = juce::jmax ((juce::int64) 1,
        (juce::int64) std::llround ((double) performanceReplay.take.durationSamples * sampleScale));
    performanceReplay.progress = (float) juce::jlimit (0.0, 1.0,
                                                        (double) elapsed / (double) duration);
    if (elapsed >= duration
        && performanceReplay.nextMidi >= performanceReplay.midi.size()
        && performanceReplay.nextAction >= performanceReplay.take.actions.size()
        && ! engine.hasReplayMidiPending())
    {
        performanceReplay.progress = 1.0f;
        performanceReplay.state = PerformanceReplayRuntime::State::idle;
        engine.panic();
        emitState();
    }
}

void InstrumentHostService::clearGestureLanes (const juce::String& clipId)
{
    auto& performance = const_cast<Performance&> (rack.getPerformance());
    auto* clip = performance.findClip (clipId);
    auto* pattern = clip != nullptr ? performance.findPattern (clip->patternId) : nullptr;
    if (clip == nullptr || pattern == nullptr || (! clip->looperLayer && ! clip->gestureClip))
    {
        emitError ("That clip has no recorded gesture performance.");
        return;
    }
    if (gestureRecording && gestureTargetClipId == clipId)
    {
        emitError ("Finish or cancel the gesture take before clearing it.");
        return;
    }

    juce::StringArray removedSourceIds;
    for (const auto& lane : pattern->lanes)
        if (lane.type == perf::LaneType::parameter && lane.lockSourceLaneId.isEmpty())
            removedSourceIds.add (lane.laneId);

    for (int laneIndex = pattern->lanes.size(); --laneIndex >= 0;)
    {
        const auto& lane = pattern->lanes.getReference (laneIndex);
        if (removedSourceIds.contains (lane.laneId)
            || removedSourceIds.contains (lane.lockSourceLaneId))
            pattern->lanes.remove (laneIndex);
    }
    clip->gesturePasses = 0;

    recompilePerformance();
    savePerformance();
    emitState();
}

void InstrumentHostService::applyAutomationValue (const juce::String& targetId,
                                                  const juce::String& parameterId, float value)
{
    // No gestures: automation is a continuous stream, and a begin/end pair around every value
    // would tell the host a human is grabbing the control sixty times a second. The common
    // base path also marks plug-in writes as ours, preventing a gesture clip from recording
    // its own playback, and adds any active modulation afterwards.
    writeTargetBaseValue (targetId, parameterId, value);
}

void InstrumentHostService::applySceneState (const perf::Scene& scene)
{
    // Boolean state remains a boundary action. Crossfading a mute or half-enabling a plug-in
    // has no useful meaning, whereas levels and normalized parameters can move coherently.
    sceneMorph = {};
    for (const auto& slot : scene.slots)
    {
        rack.setEnabled (slot.partId, slot.enabled);
        rack.setMute (slot.partId, slot.mute);
    }

    if (scene.focusPartId.isNotEmpty() && rack.focusPart (scene.focusPartId))
        showEditorFor (scene.focusPartId);

    if (scene.pageId.isNotEmpty() && rack.getPerformance().findPage (scene.pageId) != nullptr)
    {
        currentSurfacePageId = scene.pageId;
        requestedSurfacePageId = scene.pageId;
    }

    if (scene.tempo > 0.0)
    {
        rack.getEngine().getTransport().setTempo (scene.tempo);
        const_cast<Performance&> (rack.getPerformance()).transport.tempo = scene.tempo;
    }

    const auto currentBaseValue = [this] (const juce::String& targetId,
                                           const juce::String& parameterId,
                                           float& value) -> bool
    {
        for (const auto& route : rack.getPerformance().modulationRoutes)
            if (route.targetId == targetId && route.parameterId == parameterId
                && (isVirtualParameterId (parameterId)
                    || route.targetCeId == targetClassCeId (targetId)))
            {
                value = route.baseValue;
                return true;
            }

        if (isVirtualParameterId (parameterId))
        {
            if (! virtualParameterExists (targetId, parameterId))
                return false;
            value = virtualParameterValue (targetId, parameterId);
            return true;
        }

        if (auto* parameter = resolveParameter (targetId, parameterId))
        {
            value = parameter->getValue();
            return true;
        }
        return false;
    };

    juce::Array<SceneMorphTarget> targets;
    const auto addTarget = [&] (const juce::String& targetId,
                                const juce::String& parameterId, float endValue)
    {
        float startValue = 0.0f;
        if (! currentBaseValue (targetId, parameterId, startValue))
            return;

        for (auto& existing : targets)
            if (existing.targetId == targetId && existing.parameterId == parameterId)
            {
                existing.endValue = juce::jlimit (0.0f, 1.0f, endValue);
                return;
            }
        targets.add ({ targetId, parameterId, juce::jlimit (0.0f, 1.0f, startValue),
                       juce::jlimit (0.0f, 1.0f, endValue) });
    };

    for (const auto& slot : scene.slots)
    {
        if (slot.applyVolume)
            addTarget (slot.partId, "@gain", slot.volume * 0.5f);
        if (slot.applyPan)
            addTarget (slot.partId, "@pan", (slot.pan + 1.0f) * 0.5f);
    }

    for (const auto& value : scene.macros)
        addTarget (value.macroId, "@macro", value.value);

    for (const auto& value : scene.parameters)
    {
        if (! isVirtualParameterId (value.parameterId)
            && value.targetCeId != targetClassCeId (value.targetId))
            continue;
        addTarget (value.targetId, value.parameterId, value.value);
    }

    if (scene.morphBeats <= 0.0 || targets.isEmpty())
    {
        for (const auto& target : targets)
            writeTargetBaseValue (target.targetId, target.parameterId, target.endValue);
    }
    else
    {
        auto& transport = rack.getEngine().getTransport();
        sceneMorph.active = true;
        sceneMorph.followsTransport = transport.isPlaying();
        sceneMorph.sceneId = scene.sceneId;
        sceneMorph.name = scene.name;
        sceneMorph.durationBeats = scene.morphBeats;
        sceneMorph.startPpq = transport.getPositionPpq();
        sceneMorph.lastPpq = sceneMorph.startPpq;
        sceneMorph.startMs = juce::Time::getMillisecondCounterHiRes();
        sceneMorph.durationMs = scene.morphBeats * 60000.0
                              / juce::jmax (1.0, transport.getTempo());
        sceneMorph.lastReportedBucket = 0;
        sceneMorph.targets = std::move (targets);
    }

    savePerformance();
}

void InstrumentHostService::tickSceneMorph()
{
    if (! sceneMorph.active)
        return;

    const auto& transport = rack.getEngine().getTransport();
    double progress = 0.0;
    if (sceneMorph.followsTransport)
    {
        // A stopped transport freezes a beat-defined morph. Restarting continues from the
        // same musical position instead of letting a wall clock silently finish the scene.
        if (! transport.isPlaying())
        {
            sceneMorph.lastPpq = -1.0;
            return;
        }

        const auto ppq = transport.getPositionPpq();
        if (sceneMorph.lastPpq >= 0.0)
        {
            const auto delta = ppq - sceneMorph.lastPpq;
            // A Play command may rewind; that is a new origin, not negative morph time.
            if (delta >= 0.0)
                sceneMorph.elapsedBeats += delta;
        }
        sceneMorph.lastPpq = ppq;
        progress = sceneMorph.elapsedBeats / juce::jmax (0.001, sceneMorph.durationBeats);
    }
    else
    {
        progress = (juce::Time::getMillisecondCounterHiRes() - sceneMorph.startMs)
                 / juce::jmax (1.0, sceneMorph.durationMs);
    }

    sceneMorph.progress = juce::jlimit (0.0f, 1.0f, (float) progress);
    for (const auto& target : sceneMorph.targets)
        writeTargetBaseValue (target.targetId, target.parameterId,
                              target.startValue
                                + (target.endValue - target.startValue) * sceneMorph.progress);

    const auto done = sceneMorph.progress >= 1.0f;
    const auto reportBucket = juce::jlimit (0, 20,
                                            (int) std::floor (sceneMorph.progress * 20.0f));
    const auto report = done || reportBucket != sceneMorph.lastReportedBucket;
    sceneMorph.lastReportedBucket = reportBucket;

    if (done)
    {
        // Persist only the landing, never thirty intermediate session revisions per second.
        savePerformance();
        sceneMorph = {};
    }

    if (report)
        emitState();
}

void InstrumentHostService::captureSceneFromRack (perf::Scene& scene)
{
    const auto& performance = rack.getPerformance();

    const auto currentBaseValue = [this, &performance] (const juce::String& targetId,
                                                         const juce::String& parameterId,
                                                         float& value) -> bool
    {
        for (const auto& route : performance.modulationRoutes)
            if (route.targetId == targetId && route.parameterId == parameterId
                && (isVirtualParameterId (parameterId)
                    || route.targetCeId == targetClassCeId (targetId)))
            {
                value = route.baseValue;
                return true;
            }

        if (isVirtualParameterId (parameterId))
        {
            if (! virtualParameterExists (targetId, parameterId))
                return false;
            value = virtualParameterValue (targetId, parameterId);
            return true;
        }
        if (auto* parameter = resolveParameter (targetId, parameterId))
        {
            value = parameter->getValue();
            return true;
        }
        return false;
    };

    scene.slots.clear();
    for (const auto& part : performance.parts)
    {
        float volume = part.volume * 0.5f;
        float pan = (part.pan + 1.0f) * 0.5f;
        currentBaseValue (part.partId, "@gain", volume);
        currentBaseValue (part.partId, "@pan", pan);
        scene.slots.add ({ part.partId, part.enabled, part.mute, volume * 2.0f, true,
                           pan * 2.0f - 1.0f, true });
    }

    scene.macros.clear();
    for (const auto& macro : performance.macros)
    {
        auto value = macro.value;
        currentBaseValue (macro.macroId, "@macro", value);
        scene.macros.add ({ macro.macroId, value });
    }

    scene.parameters.clear();
    juce::StringArray capturedAddresses;
    for (const auto& page : performance.pages)
        for (const auto& slot : page.slots)
        {
            const auto& binding = slot.binding;
            if (binding.isEmpty() || ! bindingResolves (binding)
                || binding.parameterId == "@gain" || binding.parameterId == "@pan"
                || binding.parameterId == "@macro")
                continue;

            const auto address = binding.partId + "\n" + binding.parameterId;
            if (capturedAddresses.contains (address))
                continue;

            float value = 0.0f;
            if (! currentBaseValue (binding.partId, binding.parameterId, value))
                continue;
            capturedAddresses.add (address);
            scene.parameters.add ({ binding.partId, binding.pluginCeId, binding.parameterId,
                                    juce::jlimit (0.0f, 1.0f, value) });
        }

    scene.clipIds.clear();
    for (int i = 0; i < performance.clips.size(); ++i)
        if (rack.getEngine().isClipActive (i))
            scene.clipIds.add (performance.clips.getReference (i).clipId);

    scene.focusPartId = performance.focusedPartId;
    scene.pageId = currentSurfacePageId;
}

int InstrumentHostService::queueSceneLaunch (const juce::String& sceneId,
                                             perf::Quantize quantize)
{
    const auto& performance = rack.getPerformance();
    const auto* scene = performance.findScene (sceneId);
    if (scene == nullptr)
        return 0;

    juce::Array<int> clipIndices;
    for (const auto& clipId : scene->clipIds)
    {
        const auto index = performance.indexOfClip (clipId);
        if (index >= 0)
            clipIndices.add (index);
    }

    // The engine decides WHEN (the quantization boundary) and tells us when it landed; the
    // rest of the scene is applied at that instant, so the whole recall is one musical event.
    const auto token = nextSceneToken++;
    pendingScenes[token] = sceneId;
    rack.getEngine().launchScene (clipIndices, scene->stopOtherClips, quantize, token);

    // A parked transport has no boundary to wait for, so the scene applies immediately —
    // otherwise recalling a scene before pressing play would appear to do nothing.
    if (! rack.getEngine().getTransport().isPlaying())
    {
        applySceneState (*scene);
        pendingScenes.erase (token);
    }

    return token;
}

bool InstrumentHostService::launchScene (const juce::String& sceneId)
{
    const auto* scene = rack.getPerformance().findScene (sceneId);
    return scene != nullptr && queueSceneLaunch (sceneId, scene->launchQuantize) != 0;
}

bool InstrumentHostService::startArrangementPlayback (int index)
{
    const auto& arrangement = rack.getPerformance().arrangement;
    if (! juce::isPositiveAndBelow (index, arrangement.items.size()))
        return false;

    const auto& item = arrangement.items.getReference (index);
    if (rack.getPerformance().findScene (item.sceneId) == nullptr)
        return false;

    if (arrangementPlaying)
        stopArrangementPlayback (true);

    auto& transport = rack.getEngine().getTransport();
    const auto wasPlaying = transport.isPlaying();
    const auto startPpq = wasPlaying
                            ? transport.nextBoundary (transport.getPositionPpq() + 1.0e-4,
                                                      perf::Quantize::bar)
                            : 0.0;
    const auto token = queueSceneLaunch (item.sceneId, wasPlaying ? perf::Quantize::bar
                                                                  : perf::Quantize::immediate);
    if (token == 0)
        return false;

    arrangementPlaying = true;
    arrangementStopAtPpq = -1.0;
    arrangementItemStartPpq = startPpq;
    if (wasPlaying)
    {
        arrangementCurrentIndex = -1;
        arrangementQueuedIndex = index;
        pendingArrangementLaunches[token] = { index, startPpq };
    }
    else
    {
        // Start is the MIDI "start" verb and therefore rewinds. The scene is made visible
        // immediately while parked, then its clips begin at PPQ zero in the first audio block.
        arrangementCurrentIndex = index;
        arrangementQueuedIndex = -1;
        transport.start();
    }

    auto* event = new juce::DynamicObject();
    event->setProperty ("index", index);
    event->setProperty ("name", item.name);
    emitScriptEvent ("arrangementStarted", juce::var (event));
    return true;
}

void InstrumentHostService::stopArrangementPlayback (bool stopClips)
{
    if (stopClips)
        rack.getEngine().stopAllClips (perf::Quantize::immediate);

    for (const auto& [token, launch] : pendingArrangementLaunches)
    {
        juce::ignoreUnused (launch);
        pendingScenes.erase (token);
    }
    pendingArrangementLaunches.clear();
    arrangementPlaying = false;
    arrangementCurrentIndex = -1;
    arrangementQueuedIndex = -1;
    arrangementItemStartPpq = 0.0;
    arrangementStopAtPpq = -1.0;
}

void InstrumentHostService::tickArrangement()
{
    if (! arrangementPlaying)
        return;

    auto& transport = rack.getEngine().getTransport();
    if (! transport.isPlaying())
    {
        stopArrangementPlayback (false);
        emitState();
        return;
    }

    const auto position = transport.getPositionPpq();
    if (arrangementStopAtPpq >= 0.0)
    {
        if (position + 1.0e-6 >= arrangementStopAtPpq)
        {
            stopArrangementPlayback (false);
            emitScriptEvent ("arrangementStopped", juce::var());
            emitState();
        }
        return;
    }

    if (arrangementQueuedIndex >= 0 || arrangementCurrentIndex < 0)
        return;

    const auto& arrangement = rack.getPerformance().arrangement;
    if (! juce::isPositiveAndBelow (arrangementCurrentIndex, arrangement.items.size()))
    {
        stopArrangementPlayback (true);
        emitState();
        return;
    }

    const auto& current = arrangement.items.getReference (arrangementCurrentIndex);
    const auto endPpq = arrangementItemStartPpq
                        + (double) current.bars * transport.barLengthPpq();
    // At 300 BPM the 30 Hz controlling-thread pump advances about 0.17 PPQ per tick. Half a
    // quarter-note is therefore ample look-ahead without visibly shortening the current item.
    if (position + 0.5 < endPpq)
        return;

    auto nextIndex = arrangementCurrentIndex + 1;
    if (nextIndex >= arrangement.items.size())
    {
        if (arrangement.loop && ! arrangement.items.isEmpty())
            nextIndex = 0;
        else
        {
            rack.getEngine().stopAllClips (perf::Quantize::bar);
            arrangementStopAtPpq = endPpq;
            return;
        }
    }

    const auto& next = arrangement.items.getReference (nextIndex);
    const auto token = queueSceneLaunch (next.sceneId, perf::Quantize::bar);
    if (token == 0)
    {
        stopArrangementPlayback (true);
        emitError ("The next arrangement scene is missing; playback stopped safely.");
        emitState();
        return;
    }

    arrangementQueuedIndex = nextIndex;
    pendingArrangementLaunches[token] = { nextIndex, endPpq };
}

bool InstrumentHostService::goToSetlistItem (int index)
{
    const auto& currentSetlist = rack.getPerformance().setlist;
    if (! juce::isPositiveAndBelow (index, currentSetlist.items.size()))
        return false;

    const auto item = currentSetlist.items.getReference (index);
    const auto previous = currentSetlist.currentIndex;
    pendingSetlistRecall = {};

    if (item.rackRecordId.isNotEmpty())
    {
        ensureLibrary();
        const auto* record = library.find (item.rackRecordId);
        if (record == nullptr || record->type != "rack")
            return false;

        Performance restored;
        if (! Performance::fromVar (juce::JSON::parse (record->rackManifestJson), restored))
            return false;
        if (item.sceneId.isNotEmpty() && restored.findScene (item.sceneId) == nullptr)
            return false;
        if (item.pageId.isNotEmpty() && restored.findPage (item.pageId) == nullptr)
            return false;

        // A rack capture supplies the song, while the Setlist itself is the show-level
        // document and must survive the swap. Whole-performance takes remain reachable too.
        auto retainedSetlist = currentSetlist;
        retainedSetlist.currentIndex = index;
        restored.setlist = std::move (retainedSetlist);
        restored.performanceTakes = rack.getPerformance().performanceTakes;

        consumingSetlistPreloadRecordId = item.rackRecordId;
        applyPerformance (std::move (restored));
        consumingSetlistPreloadRecordId.clear();
        setlistPreloads.erase (item.rackRecordId);

        if (item.tempo > 0.0)
        {
            rack.getEngine().getTransport().setTempo (item.tempo);
            const_cast<Performance&> (rack.getPerformance()).transport.tempo = item.tempo;
        }

        if (rackProcessorsReady())
        {
            if (item.sceneId.isNotEmpty() && ! launchScene (item.sceneId))
            {
                const_cast<Performance&> (rack.getPerformance()).setlist.currentIndex = previous;
                return false;
            }
            if (item.pageId.isNotEmpty())
            {
                currentSurfacePageId = item.pageId;
                requestedSurfacePageId = item.pageId;
            }
        }
        else
        {
            pendingSetlistRecall.active = true;
            pendingSetlistRecall.index = index;
            pendingSetlistRecall.itemId = item.itemId;
            pendingSetlistRecall.sceneId = item.sceneId;
            pendingSetlistRecall.pageId = item.pageId;
            pendingSetlistRecall.tempo = item.tempo;
            pendingSetlistRecall.startedMs = juce::Time::getMillisecondCounterHiRes();
        }
    }
    else
    {
        // Validate everything before touching tempo or position. A broken row is a no-op,
        // which is the only safe failure mode in the middle of a performance.
        if (item.sceneId.isNotEmpty() && rack.getPerformance().findScene (item.sceneId) == nullptr)
            return false;
        if (item.pageId.isNotEmpty() && rack.getPerformance().findPage (item.pageId) == nullptr)
            return false;

        auto& setlist = const_cast<Performance&> (rack.getPerformance()).setlist;
        setlist.currentIndex = index;
        if (item.tempo > 0.0)
        {
            rack.getEngine().getTransport().setTempo (item.tempo);
            const_cast<Performance&> (rack.getPerformance()).transport.tempo = item.tempo;
        }
        if (item.sceneId.isNotEmpty() && ! launchScene (item.sceneId))
        {
            setlist.currentIndex = previous;
            return false;
        }
        if (item.pageId.isNotEmpty())
        {
            currentSurfacePageId = item.pageId;
            requestedSurfacePageId = item.pageId;
        }
    }

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("index", index);
    payload->setProperty ("name", item.name);
    payload->setProperty ("notes", item.notes);
    payload->setProperty ("loading", pendingSetlistRecall.active);
    emitScriptEvent ("setlistChanged", juce::var (payload));

    savePerformance();
    refreshSetlistPreloads();
    return true;
}

bool InstrumentHostService::setClipFillState (const juce::String& clipId, bool active,
                                              bool reportError)
{
    const auto& performance = rack.getPerformance();
    const auto clipIndex = performance.indexOfClip (clipId);
    const auto* clip = performance.findClip (clipId);
    const auto fail = [this, reportError] (const juce::String& message)
    {
        if (reportError)
            emitError (message);
        return false;
    };

    if (clipIndex < 0 || clip == nullptr)
        return fail ("Unknown clip.");
    if (active && ! rack.getEngine().isClipActive (clipIndex))
        return fail ("Launch the clip before holding its fill.");
    if (active && clip->fillPatternId.isEmpty())
        return fail ("Choose a fill pattern for this clip first.");

    int patternIndex = -1;
    if (active)
    {
        const auto* song = rack.getEngine().getSong();
        patternIndex = song != nullptr ? song->indexOfPattern (clip->fillPatternId) : -1;
        if (patternIndex < 0)
            return fail ("The selected fill pattern is no longer available.");
    }

    rack.getEngine().setClipFill (clipIndex, patternIndex, clip->fillQuantize);
    fillPedalStates[clipId] = active;
    return true;
}

void InstrumentHostService::drainEngineEvents()
{
    auto& engine = rack.getEngine();
    const auto* song = engine.getSong();
    const auto generation = engine.getGeneration();

    bool stateChanged = false;
    bool modulationChanged = false;
    perf::PerformanceEngine::OutEvent event;

    while (engine.popEvent (event))
    {
        // Anything queued before the current song was published addresses indices that no
        // longer mean what they meant; dropping it is safer than guessing.
        if (event.generation != generation)
            continue;

        switch (event.type)
        {
            case perf::PerformanceEngine::OutEvent::Type::parameterValue:
                if (song != nullptr
                    && juce::isPositiveAndBelow (event.index, (int) song->parameterTargets.size()))
                {
                    const auto& target = song->parameterTargets[(size_t) event.index];
                    applyAutomationValue (target.targetId, target.parameterId, event.value);
                }
                break;

            case perf::PerformanceEngine::OutEvent::Type::sceneApplied:
            {
                const auto it = pendingScenes.find (event.index);
                if (it == pendingScenes.end())
                    break;
                const auto arranged = pendingArrangementLaunches.find (event.index);
                if (const auto* scene = rack.getPerformance().findScene (it->second))
                {
                    applySceneState (*scene);
                    auto* payload = new juce::DynamicObject();
                    payload->setProperty ("sceneId", scene->sceneId);
                    payload->setProperty ("name", scene->name);
                    emitScriptEvent ("sceneApplied", juce::var (payload));
                }
                if (arranged != pendingArrangementLaunches.end())
                {
                    arrangementCurrentIndex = arranged->second.index;
                    arrangementQueuedIndex = -1;
                    arrangementItemStartPpq = arranged->second.startPpq;
                    pendingArrangementLaunches.erase (arranged);
                }
                pendingScenes.erase (it);
                stateChanged = true;
                break;
            }

            case perf::PerformanceEngine::OutEvent::Type::clipStarted:
            case perf::PerformanceEngine::OutEvent::Type::clipStopped:
            {
                // Approved script events, on the controlling thread, from what the engine
                // reported — never from inside the scheduler (§18.8.11).
                const auto& clips = rack.getPerformance().clips;
                if (juce::isPositiveAndBelow (event.index, clips.size()))
                {
                    auto* payload = new juce::DynamicObject();
                    payload->setProperty ("clipId", clips.getReference (event.index).clipId);
                    payload->setProperty ("name", clips.getReference (event.index).name);
                    emitScriptEvent (event.type == perf::PerformanceEngine::OutEvent::Type::clipStarted
                                       ? "clipStarted" : "clipStopped",
                                     juce::var (payload));
                }
                stateChanged = true;
                break;
            }

            case perf::PerformanceEngine::OutEvent::Type::fillChanged:
                stateChanged = true;
                break;

            case perf::PerformanceEngine::OutEvent::Type::capturedNote:
            {
                // Played material becomes a step, on this thread, in the document — the audio
                // thread only ever said what it heard and where it fell (§18.8.2).
                auto& performance = const_cast<Performance&> (rack.getPerformance());
                auto* clip = performance.findClip (captureClipId);
                auto* pattern = clip != nullptr ? performance.findPattern (clip->patternId) : nullptr;
                auto* lane = pattern != nullptr ? pattern->findLane (captureLaneId) : nullptr;
                auto* step = lane != nullptr ? lane->findStep (event.index) : nullptr;
                if (step == nullptr)
                    break;

                step->active = true;
                step->note = juce::jlimit (0, 127, event.data1);
                step->velocity = juce::jlimit (1, 127, event.data2);
                stateChanged = true;
                break;
            }

            case perf::PerformanceEngine::OutEvent::Type::modulationSource:
            {
                const auto channel = juce::jlimit (1, 16, event.data1);
                switch (event.index)
                {
                    case perf::PerformanceEngine::velocitySource:
                        setModulationSourceValue ("velocity", {}, channel, 0, event.value);
                        break;
                    case perf::PerformanceEngine::midiCcSource:
                        setModulationSourceValue ("midiCc", {}, channel, event.data2, event.value);
                        if (event.data2 == 1)
                            setModulationSourceValue ("modWheel", {}, channel, 0, event.value);
                        else if (event.data2 == 11)
                            setModulationSourceValue ("expression", {}, channel, 0, event.value);
                        break;
                    case perf::PerformanceEngine::channelPressureSource:
                        setModulationSourceValue ("channelPressure", {}, channel, 0, event.value);
                        break;
                    case perf::PerformanceEngine::polyAftertouchSource:
                        setModulationSourceValue ("polyAftertouch", {}, channel, 0, event.value);
                        break;
                    case perf::PerformanceEngine::pitchBendSource:
                        setModulationSourceValue ("pitchBend", {}, channel, 0, event.value);
                        break;
                    default:
                        break;
                }
                modulationChanged = ! rack.getPerformance().modulationRoutes.isEmpty();
                break;
            }

            case perf::PerformanceEngine::OutEvent::Type::envelopeGate:
                noteEnvelopeGate (juce::jlimit (1, 16, event.data1),
                                  juce::jlimit (0, 127, event.data2), event.index != 0,
                                  juce::jlimit (0.0f, 1.0f, event.value));
                break;
        }
    }

    if (stateChanged)
    {
        // A captured note changed what would play, so the compiled song has to follow.
        recompilePerformance();
        savePerformance();
        emitState();
    }
    else if (modulationChanged)
    {
        // Source meters and effective values are live state, never a reason to rewrite the
        // session or recompile the sequencer.
        emitState();
    }
}

void InstrumentHostService::noteMidiActivity (const juce::String& deviceName,
                                              const juce::MidiMessage& message)
{
    // System-exclusive is the one non-voice message that means something here: while a patch
    // capture is armed it IS the payload. Taken before the indicator filter below, because it
    // is not activity to display — it is the thing being collected.
    if (message.isSysEx() && patchCaptureListening.load())
    {
        const std::scoped_lock lock (midiActivityLock);
        if ((int) pendingPatchSysex.size() < maxCapturedPatchMessages)
            pendingPatchSysex.push_back (message);
        return;
    }

    // Clock, active sensing and sysex housekeeping would light the indicator continuously and
    // prove nothing about the keys. Channel voice messages are what a person is testing.
    if (! (message.isNoteOnOrOff() || message.isController() || message.isPitchWheel()
           || message.isAftertouch() || message.isChannelPressure() || message.isProgramChange()))
        return;

    const auto text = message.isNoteOn()
        ? juce::MidiMessage::getMidiNoteName (message.getNoteNumber(), true, true, 4)
            + " on, velocity " + juce::String (message.getVelocity())
        : message.isNoteOff()
            ? juce::MidiMessage::getMidiNoteName (message.getNoteNumber(), true, true, 4) + " off"
            : message.getDescription();

    const std::scoped_lock lock (midiActivityLock);
    midiActivityDevice = deviceName;
    midiActivityText = text;
    midiActivityCc = message.isController() ? message.getControllerNumber() : -1;
    midiActivityNote = message.isNoteOnOrOff() ? message.getNoteNumber() : -1;
    midiActivityChannel = message.getChannel();
    midiActivityValue = message.isController() ? message.getControllerValue()
                      : message.isNoteOn()     ? message.getVelocity() : 0;
    ++midiActivitySeq;

    // Notes for the slots — a pad, or a key standing in for one — only while something is
    // listening for them; the rest of the time playing the keyboard costs this nothing.
    if (slotNotesWanted.load() && message.isNoteOnOrOff())
    {
        if (pendingCcs.size() < 64)
            pendingCcs.push_back ({ message.getChannel(), -1,
                                    message.isNoteOn() ? (int) message.getVelocity() : 0,
                                    message.getNoteNumber(), message.isNoteOn() });
    }

    // While a chord capture is armed, raw note on/offs feed it — the drain groups them
    // into "everything pressed until everything released", which is what a played chord is.
    if (chordLearnListening.load() && (message.isNoteOnOrOff()))
    {
        if (pendingChordNotes.size() < 64)
            pendingChordNotes.push_back ({ message.getNoteNumber(), message.isNoteOn() });
    }

    // Controller changes additionally feed MIDI learn and the learned-slot writes, which
    // happen on the controlling thread — this only queues. Coalesced per (channel, cc):
    // a knob sweep between drains is one entry carrying its latest value, and the arrival
    // order of DISTINCT controllers is kept, because learn binds the first one heard.
    if (message.isController())
    {
        const PendingCc event { message.getChannel(), message.getControllerNumber(),
                                message.getControllerValue() };
        for (auto& queued : pendingCcs)
            if (queued.channel == event.channel && queued.cc == event.cc)
            {
                queued.value = event.value;
                return;
            }
        if (pendingCcs.size() < 64)
            pendingCcs.push_back (event);
    }
}

void InstrumentHostService::emitSurfaceLayout (const juce::String& requestedProfileId)
{
    // The layout is static per profile, so it is asked for rather than pushed: sixty-odd
    // controls have no business riding along on every status change.
    const auto& registry = ctrl49::SurfaceProfileRegistry::instance();
    const ctrl49::SurfaceProfile* profile = requestedProfileId.isNotEmpty()
                                              ? registry.find (requestedProfileId) : nullptr;

    if (profile == nullptr && requestedProfileId.isEmpty())
        for (const auto& id : registry.profileIds())
            if (const auto* candidate = registry.find (id);
                candidate != nullptr && ! candidate->layout.isEmpty())
            {
                profile = candidate;
                break;
            }

    // The owner's own controller wins over an authored profile, and that is deliberate:
    // describing one is something you only do when the authored profile is not your device.
    // Clearing it hands the drawing straight back.
    loadUserSurface();
    const auto useOwn = userSurfaceName.isNotEmpty() && requestedProfileId.isEmpty();

    const auto layout = useOwn ? ctrl49::buildGenericLayout (userSurfaceCapabilities)
                               : (profile != nullptr ? profile->layout : ctrl49::SurfaceLayout());

    auto* root = new juce::DynamicObject();
    if (useOwn || profile != nullptr)
    {
        root->setProperty ("profileId",   useOwn ? juce::String ("user") : profile->profileId);
        root->setProperty ("displayName", useOwn ? userSurfaceName : profile->displayName);
        root->setProperty ("vendor",      useOwn ? juce::String ("Described by you")
                                                 : profile->vendor);
        root->setProperty ("aspect",      layout.aspect);
        juce::Array<juce::var> controls;
        for (const auto& control : layout.controls)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("controlId", control.controlId);
            obj->setProperty ("kind",      control.kind);
            obj->setProperty ("label",     control.label);
            obj->setProperty ("x",         control.x);
            obj->setProperty ("y",         control.y);
            obj->setProperty ("w",         control.w);
            obj->setProperty ("h",         control.h);
            obj->setProperty ("index",     control.index);
            controls.add (juce::var (obj));
        }
        root->setProperty ("controls", controls);
    }

    // Every authored drawing there is, so the panel can offer them beside the described one.
    // A described controller wins by default, but "I described one and now the CTRL49
    // picture is gone" is a support call — the choice has to be on screen, not in a form.
    juce::Array<juce::var> profiles;
    for (const auto& id : registry.profileIds())
        if (const auto* candidate = registry.find (id); candidate != nullptr && ! candidate->layout.isEmpty())
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("profileId",   candidate->profileId);
            obj->setProperty ("displayName", candidate->displayName);
            obj->setProperty ("vendor",      candidate->vendor);
            profiles.add (juce::var (obj));
        }
    root->setProperty ("profiles", profiles);
    root->setProperty ("own", useOwn);

    // What the panel needs to offer "describe your controller" without a second round trip:
    // whether one is described, and whether a count is running.
    root->setProperty ("userSurface",  userSurfaceName);
    root->setProperty ("userEncoders", userSurfaceCapabilities.encoders);
    root->setProperty ("userFaders",   userSurfaceCapabilities.faders);
    root->setProperty ("userPads",     userSurfaceCapabilities.pads);
    root->setProperty ("learning",     userSurfaceLearning);
    root->setProperty ("heard",        userSurfaceHeard.size());

    if (options.emit != nullptr)
        options.emit ("instrumentHostSurfaceLayout", juce::var (root));
}

void InstrumentHostService::loadUserSurface()
{
    if (userSurfaceLoaded)
        return;

    userSurfaceLoaded = true;
    if (options.dataDirectory == juce::File())
        return;

    const auto stored = juce::JSON::parse (userSurfaceFile().loadFileAsString());
    if (! stored.isObject())
        return;

    userSurfaceName = stored.getProperty ("name", {}).toString();
    // Clamped rather than trusted: these numbers come from a text field, and a layout is built
    // from them. Sixty-four of anything is already past any controller ever made.
    userSurfaceCapabilities.encoders = juce::jlimit (0, 64, (int) stored.getProperty ("encoders", 0));
    userSurfaceCapabilities.faders   = juce::jlimit (0, 64, (int) stored.getProperty ("faders", 0));
    userSurfaceCapabilities.pads     = juce::jlimit (0, 64, (int) stored.getProperty ("pads", 0));
}

void InstrumentHostService::saveUserSurface() const
{
    if (options.dataDirectory == juce::File())
        return;

    if (userSurfaceName.isEmpty())
    {
        userSurfaceFile().deleteFile();      // cleared means gone, not an empty record
        return;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("name",     userSurfaceName);
    root->setProperty ("encoders", userSurfaceCapabilities.encoders);
    root->setProperty ("faders",   userSurfaceCapabilities.faders);
    root->setProperty ("pads",     userSurfaceCapabilities.pads);

    userSurfaceFile().getParentDirectory().createDirectory();
    userSurfaceFile().replaceWithText (juce::JSON::toString (juce::var (root)));
}

void InstrumentHostService::loadParameterFavourites()
{
    if (parameterFavouritesLoaded)
        return;

    parameterFavouritesLoaded = true;
    if (options.dataDirectory == juce::File())
        return;

    const auto stored = juce::JSON::parse (parameterFavouritesFile().loadFileAsString());
    if (auto* object = stored.getDynamicObject())
        for (const auto& property : object->getProperties())
        {
            juce::StringArray ids;
            if (const auto* array = property.value.getArray())
                for (const auto& id : *array)
                    ids.addIfNotAlreadyThere (id.toString());

            if (! ids.isEmpty())
                parameterFavourites[property.name.toString()] = ids;
        }
}

void InstrumentHostService::saveParameterFavourites() const
{
    if (options.dataDirectory == juce::File())
        return;

    auto* root = new juce::DynamicObject();
    for (const auto& [ceId, ids] : parameterFavourites)
    {
        if (ids.isEmpty())
            continue;      // a class with nothing marked is absent, not an empty list

        juce::Array<juce::var> values;
        for (const auto& id : ids)
            values.add (id);
        root->setProperty (ceId, values);
    }

    parameterFavouritesFile().getParentDirectory().createDirectory();
    parameterFavouritesFile().replaceWithText (juce::JSON::toString (juce::var (root)));
}

void InstrumentHostService::emitParameterLearn (bool armed, const juce::String& pageId,
                                                const juce::String& slotId,
                                                const juce::String& parameterId)
{
    if (options.emit == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("armed",       armed);
    obj->setProperty ("pageId",      pageId);
    obj->setProperty ("slotId",      slotId);
    obj->setProperty ("parameterId", parameterId);
    options.emit ("instrumentHostParamLearn", juce::var (obj));
}

void InstrumentHostService::emitMidiLearn (bool armed, const juce::String& pageId,
                                           const juce::String& slotId, int cc, int channel,
                                           int note)
{
    if (options.emit == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("armed",   armed);
    obj->setProperty ("pageId",  pageId);
    obj->setProperty ("slotId",  slotId);
    obj->setProperty ("cc",      cc);
    obj->setProperty ("note",    note);   // -1 unless a pad's note was what bound
    obj->setProperty ("channel", channel);
    options.emit ("instrumentHostMidiLearn", juce::var (obj));
}

void InstrumentHostService::refreshSlotNoteListening()
{
    bool wanted = midiLearnPageId.isNotEmpty();
    if (! wanted)
        for (const auto& page : rack.getPerformance().pages)
            for (const auto& slot : page.slots)
                if (slot.midiNote >= 0)
                {
                    wanted = true;
                    break;
                }
    slotNotesWanted.store (wanted);
}

void InstrumentHostService::drainControllerEvents()
{
    // Recomputed here, at the rate everything else is drained, so every path that binds or
    // unbinds a note — learn, clear, a page removed, a session restored — is covered by one
    // line rather than remembered at each of them.
    refreshSlotNoteListening();

    std::vector<PendingCc> events;
    {
        const std::scoped_lock lock (midiActivityLock);
        events.swap (pendingCcs);
    }
    if (events.empty())
        return;

    // Counting the owner's controls, when they are sweeping them. Distinct (channel, cc) pairs
    // only: one knob swept through its range is one control, not a hundred.
    if (userSurfaceLearning)
    {
        const auto before = userSurfaceHeard.size();
        for (const auto& event : events)
            userSurfaceHeard.add (event.channel * 128 + event.cc);

        if (userSurfaceHeard.size() != before)
            emitSurfaceLayout();     // the running count, so the sweep can be watched
    }

    // Learn first: the armed slot takes the first controller heard since arming — or the
    // first note, which is what a pad sends. A note-off is not a press and cannot arm.
    if (midiLearnPageId.isNotEmpty())
    {
        const auto* firstPress = [&events]() -> const PendingCc*
        {
            for (const auto& event : events)
                if (event.note < 0 || event.on)
                    return &event;
            return nullptr;
        }();

        if (firstPress != nullptr)
        {
            const auto pageId = std::exchange (midiLearnPageId, {});
            const auto slotId = std::exchange (midiLearnSlotId, {});
            const auto first = *firstPress;
            const auto isNote = first.note >= 0;

            // One controller drives one slot: learning a controller that is already bound
            // elsewhere moves it, because two slots silently riding one knob is a support call.
            for (const auto& page : rack.getPerformance().pages)
                for (const auto& other : page.slots)
                {
                    if (page.pageId == pageId && other.slotId == slotId)
                        continue;
                    if (other.midiChannel != first.channel)
                        continue;
                    if (isNote ? other.midiNote == first.note : other.midiCc == first.cc)
                    {
                        rack.setSlotMidi (page.pageId, other.slotId, -1, 0);
                        rack.setSlotMidiNote (page.pageId, other.slotId, -1, 0);
                    }
                }

            const auto bound = isNote ? rack.setSlotMidiNote (pageId, slotId, first.note, first.channel)
                                      : rack.setSlotMidi (pageId, slotId, first.cc, first.channel);
            if (bound)
            {
                savePerformance();
                emitState();
                emitMidiLearn (false, pageId, slotId, first.cc, first.channel, first.note);
            }
            else
            {
                // The slot vanished while armed (its page was removed): disarm out loud.
                emitMidiLearn (false, {}, {}, -1, 0);
            }
            refreshSlotNoteListening();
        }
    }

    // A configured MIDI CC is a momentary fill pedal. Thresholding at 64 works for both
    // switch pedals (0/127) and continuous pedals, and edge tracking prevents a stream of
    // repeated controller values from filling the engine command queue.
    for (const auto& event : events)
    {
        if (event.note >= 0)
            continue;
        for (const auto& clip : rack.getPerformance().clips)
        {
            if (clip.fillCc < 0 || clip.fillCc != event.cc)
                continue;
            if (clip.fillChannel != 0 && clip.fillChannel != event.channel)
                continue;

            const auto pressed = event.value >= 64;
            const auto previous = fillPedalStates.find (clip.clipId);
            if (previous != fillPedalStates.end() && previous->second == pressed)
                continue;
            setClipFillState (clip.clipId, pressed, false);
            auto* action = new juce::DynamicObject();
            action->setProperty ("cmd", "setPerformanceFill");
            action->setProperty ("clipId", clip.clipId);
            action->setProperty ("active", pressed);
            recordPerformanceAction (juce::var (action));
        }
    }

    // Every event lands on every slot bound to it — absolute position, the controller value
    // scaling the slot's mapped range exactly as the on-screen knob does. The freshly
    // learned slot is caught here too, so the knob takes effect the moment it binds.
    //
    // A pad is a press, not a position. Momentary (the default): down is the top of the
    // range, up is the bottom — hold for a filter sweep, let go and it closes. Toggle: each
    // press flips, the release is ignored, and the state is kept on the slot so a session
    // comes back with the pad where it was left. A controller-sending pad (127 down, 0 up)
    // gets the same treatment through the toggle flag; without it, 127/0 already IS
    // momentary through the ordinary write.
    bool virtualWritten = false;
    bool latchChanged = false;
    for (const auto& event : events)
        for (const auto& page : rack.getPerformance().pages)
            for (const auto& slot : page.slots)
            {
                const auto isNote = event.note >= 0;
                if (isNote ? slot.midiNote != event.note : slot.midiCc != event.cc)
                    continue;
                if (slot.midiChannel != 0 && slot.midiChannel != event.channel)
                    continue;
                if (slot.binding.isEmpty() || ! bindingResolves (slot.binding))
                    continue;

                float normalised = (float) event.value / 127.0f;
                if (slot.binding.toggle)
                {
                    const auto pressed = isNote ? event.on : event.value >= 64;
                    if (! pressed)
                        continue;
                    const auto latched = ! slot.latched;
                    rack.setSlotLatched (page.pageId, slot.slotId, latched);
                    latchChanged = true;
                    normalised = latched ? 1.0f : 0.0f;
                }
                else if (isNote)
                {
                    normalised = event.on ? 1.0f : 0.0f;
                }

                writeMappedBinding (slot.binding, normalised);
                auto* action = new juce::DynamicObject();
                action->setProperty ("cmd", "setControlSlotValue");
                action->setProperty ("pageId", page.pageId);
                action->setProperty ("slotId", slot.slotId);
                action->setProperty ("value", normalised);
                recordPerformanceAction (juce::var (action));
                const auto positioned = slot.binding.inverted ? 1.0f - normalised : normalised;
                recordGestureValue (slot.binding.partId, slot.binding.parameterId,
                                    slot.binding.rangeMin
                                      + positioned * (slot.binding.rangeMax - slot.binding.rangeMin));
                virtualWritten = virtualWritten || isVirtualParameterId (slot.binding.parameterId);
            }

    // A virtual write changed the manifest (fader, send, macro): one save and one announce
    // per drain however many controllers moved — the contract the CTRL49 encoders set. A
    // latch flip is manifest too, and the drawing shows it.
    if (virtualWritten || latchChanged)
    {
        savePerformance();
        emitState();
    }
}

void InstrumentHostService::emitChordLearn (bool armed, const juce::String& stage, int key,
                                            int chordSize)
{
    if (options.emit == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("armed",  armed);
    obj->setProperty ("partId", chordLearn.partId);
    obj->setProperty ("stage",  stage);
    obj->setProperty ("key",    key);
    obj->setProperty ("size",   chordSize);
    options.emit ("instrumentHostChordLearn", juce::var (obj));
}

void InstrumentHostService::drainChordLearn()
{
    std::vector<PendingNoteEvent> events;
    {
        const std::scoped_lock lock (midiActivityLock);
        events.swap (pendingChordNotes);
    }
    if (! chordLearn.armed || events.empty())
        return;

    // The part can leave mid-capture; disarm out loud instead of learning into a hole.
    auto* part = rack.getPerformance().findPart (chordLearn.partId);
    if (part == nullptr)
    {
        chordLearn = {};
        chordLearnListening.store (false);
        emitChordLearn (false, "cancelled", -1, 0);
        return;
    }

    for (const auto& event : events)
    {
        if (event.on)
        {
            chordLearn.groupNotes.addIfNotAlreadyThere (event.note);
            ++chordLearn.downCount;
            continue;
        }

        if (! chordLearn.groupNotes.contains (event.note))
            continue;   // a key held from before arming, released now — not this capture's
        chordLearn.downCount = juce::jmax (0, chordLearn.downCount - 1);
        if (chordLearn.downCount != 0 || chordLearn.groupNotes.isEmpty())
            continue;

        // A group completed: everything pressed since the last silence is now released.
        if (chordLearn.key < 0)
        {
            if (chordLearn.groupNotes.size() != 1)
            {
                emitError ("Play the TARGET key alone first — then play the chord.");
                chordLearn.groupNotes.clear();
                continue;
            }
            chordLearn.key = chordLearn.groupNotes[0];
            chordLearn.groupNotes.clear();
            emitChordLearn (true, "chord", chordLearn.key, 0);
            continue;
        }

        // The chord itself. Capture as offsets from the target key, sorted, six voices max.
        auto notes = chordLearn.groupNotes;
        notes.sort();
        perf::MidiFxSettings::KeyChord captured;
        captured.key = chordLearn.key;
        for (const auto note : notes)
        {
            if (captured.offsets.size() >= perf::MidiFxChain::maxVoices)
                break;
            captured.offsets.add (juce::jlimit (-60, 60, note - chordLearn.key));
        }

        auto fx = part->midiFx;
        for (int i = fx.keyChords.size(); --i >= 0;)
            if (fx.keyChords.getReference (i).key == captured.key)
                fx.keyChords.remove (i);
        fx.keyChords.add (captured);
        rack.setPartMidiFx (chordLearn.partId, fx);

        const auto key = chordLearn.key;
        const auto size = captured.offsets.size();
        chordLearn = {};
        chordLearnListening.store (false);
        savePerformance();
        emitState();
        emitChordLearn (false, "done", key, size);
        return;   // one capture per arm; leftover events belong to nobody
    }
}

std::vector<juce::MidiMessage> InstrumentHostService::splitSysexBlob (const juce::MemoryBlock& blob)
{
    // F0 … F7, over and over. Nothing is inferred about what is between the delimiters —
    // that is the manufacturer's business and deliberately not ours.
    std::vector<juce::MidiMessage> out;
    const auto* bytes = static_cast<const juce::uint8*> (blob.getData());
    const auto size = (size_t) blob.getSize();

    for (size_t i = 0; i < size;)
    {
        if (bytes[i] != 0xf0)
        {
            ++i;                    // padding, or a truncated tail from an older file
            continue;
        }

        size_t end = i + 1;
        while (end < size && bytes[end] != 0xf7)
            ++end;
        if (end >= size)
            break;                  // unterminated: the last message never finished arriving

        // JUCE's createSysExMessage takes the body WITHOUT the delimiters and adds them back.
        out.push_back (juce::MidiMessage::createSysExMessage (bytes + i + 1, (int) (end - i - 1)));
        i = end + 1;
    }

    return out;
}

void InstrumentHostService::drainHardwarePatchCapture()
{
    std::vector<juce::MidiMessage> arrived;
    {
        const std::scoped_lock lock (midiActivityLock);
        arrived.swap (pendingPatchSysex);
    }
    if (arrived.empty())
        return;
    if (! patchCapture.armed)
        return;   // disarmed between the observer writing and this drain reading

    // The part can leave mid-capture; disarm out loud rather than collecting into a hole.
    if (rack.getPerformance().findPart (patchCapture.partId) == nullptr)
    {
        patchCaptureListening.store (false);
        patchCapture = {};
        emitHardwarePatchCapture (false, {}, 0, 0);
        return;
    }

    for (const auto& message : arrived)
    {
        if (patchCapture.bytes + message.getRawDataSize() > maxCapturedPatchBytes)
            break;   // a synth that will not stop talking gets a bounded amount of memory
        patchCapture.bytes += message.getRawDataSize();
        patchCapture.messages.push_back (message);
    }

    emitHardwarePatchCapture (true, patchCapture.partId,
                              (int) patchCapture.messages.size(), patchCapture.bytes);
}

void InstrumentHostService::emitHardwarePatchCapture (bool armed, const juce::String& partId,
                                                      int messages, int bytes)
{
    if (options.emit == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("armed", armed);
    obj->setProperty ("partId", partId);
    obj->setProperty ("messages", messages);
    obj->setProperty ("bytes", bytes);
    options.emit ("instrumentHostHardwarePatchCapture", juce::var (obj));
}

void InstrumentHostService::queueHardwarePatchSend (const juce::String& partId)
{
    const auto* part = rack.getPerformance().findPart (partId);
    if (part == nullptr || ! part->hardware || part->hardwarePatchBase64.isEmpty())
        return;

    juce::MemoryBlock blob;
    if (! blob.fromBase64Encoding (part->hardwarePatchBase64))
        return;

    auto messages = splitSysexBlob (blob);
    if (messages.empty())
        return;

    // A second request for a part already sending replaces it rather than queueing behind
    // itself — pressing Send twice must not transmit the patch twice.
    for (auto it = patchSends.begin(); it != patchSends.end();)
        it = (it->partId == partId) ? patchSends.erase (it) : std::next (it);

    HardwarePatchSend send;
    send.partId = partId;
    send.messages = std::move (messages);
    patchSends.push_back (std::move (send));
}

void InstrumentHostService::drainHardwarePatchSends()
{
    if (patchSends.empty())
        return;

    auto& send = patchSends.front();

    // The part may have gone, or stopped being hardware, since the send was queued.
    const auto* part = rack.getPerformance().findPart (send.partId);
    if (part == nullptr || ! part->hardware)
    {
        patchSends.pop_front();
        return;
    }

    juce::MidiBuffer buffer;
    buffer.addEvent (send.messages[send.next], 0);
    const auto delivered = rack.sendHardwareMidi (send.partId, buffer);
    ++send.next;

    const auto total = (int) send.messages.size();
    const auto sent = (int) send.next;
    const auto percent = total > 0 ? (sent * 100) / total : 100;
    const auto done = send.next >= send.messages.size();

    // Progress speaks on whole percents and on the edges, not thirty times a second.
    if (options.emit != nullptr && (done || percent != send.lastReportedPercent))
    {
        send.lastReportedPercent = percent;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("partId", send.partId);
        obj->setProperty ("sent", sent);
        obj->setProperty ("total", total);
        obj->setProperty ("done", done);
        // A sink that is not open is not an error worth stopping for — the port diagnostic
        // already says why — but it must not be reported as a patch that went home.
        obj->setProperty ("delivered", delivered);
        options.emit ("instrumentHostHardwarePatchSend", juce::var (obj));
    }

    if (done)
        patchSends.pop_front();
}

void InstrumentHostService::drainParameterEvents()
{
    drainProcessorFailures();
    tickAutomaticFailover();
    drainPerformanceRecordingMidi();
    tickPerformanceReplay();
    tickPendingSetlistRecall();
    drainEngineEvents();
    tickSceneMorph();
    tickArrangement();
    tickPresetAudition();
    // Generators run on this controlling-thread pump (30 Hz in both wrappers), where VST
    // parameter gestures and direct MIDI ports are safe to touch; musical phase still comes
    // from the audio engine's single transport.
    tickMidiLfos();
    tickEnvelopeGenerators();
    tickMsegs();
    tickRandomModulators();

    // The MIDI activity readout: at most one event per drain, carrying the latest message —
    // a UI light needs "something arrived, this is what", not a message log.
    {
        juce::String device, text;
        int cc = -1, note = -1, channel = 0, value = 0;
        bool changed = false;
        {
            const std::scoped_lock lock (midiActivityLock);
            if (midiActivitySeq != midiActivityEmittedSeq)
            {
                midiActivityEmittedSeq = midiActivitySeq;
                device = midiActivityDevice;
                text = midiActivityText;
                cc = midiActivityCc;
                note = midiActivityNote;
                channel = midiActivityChannel;
                value = midiActivityValue;
                changed = true;
            }
        }
        if (changed && options.emit != nullptr)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("device", device);
            obj->setProperty ("text", text);
            // -1 for anything that was not a controller: the drawing lights knobs, and a
            // note-on must not be allowed to match controller 0 by arithmetic accident.
            obj->setProperty ("cc", cc);
            obj->setProperty ("note", note);
            obj->setProperty ("channel", channel);
            obj->setProperty ("value", value);
            options.emit ("instrumentHostMidiActivity", juce::var (obj));
        }
    }

    drainControllerEvents();
    drainChordLearn();
    drainHardwarePatchCapture();
    drainHardwarePatchSends();

    // The arp playhead: one tiny event whenever a part's live pattern step moved, nothing
    // while everything is idle. The UI only lights a column — timing stays the engine's,
    // never the WebView's (§18.8.13).
    if (options.emit != nullptr)
        for (const auto& part : rack.getPerformance().parts)
        {
            if (! part.arp.enabled || part.arp.velocityPattern.isEmpty())
                continue;

            const auto step = rack.arpLiveStep (part.partId);
            auto& last = lastArpStepByPart[part.partId];
            if (step == last)
                continue;
            last = step;

            auto* obj = new juce::DynamicObject();
            obj->setProperty ("partId", part.partId);
            obj->setProperty ("step", step);
            options.emit ("instrumentHostArpStep", juce::var (obj));
        }

    // The hardware claim is a heartbeat, not a lock: an instance that dies stops writing and
    // the next one takes over after the timeout instead of finding a surface owned by a ghost.
    if (holdsHardwareSurface)
    {
        const auto now = juce::Time::currentTimeMillis();
        if (now - lastHardwareHeartbeat > hardwareHeartbeatMs)
        {
            lastHardwareHeartbeat = now;
            auto* claim = new juce::DynamicObject();
            claim->setProperty ("instanceId", instanceId);
            claim->setProperty ("heartbeat", now);
            hardwareOwnerFile().replaceWithText (juce::JSON::toString (juce::var (claim)));
        }
    }

    // The transport's own edges. The engine does not queue them (it has no reason to), so
    // they are noticed here, at the same rate everything else is drained.
    const auto playing = rack.getEngine().getTransport().isPlaying();
    if (playing != lastReportedPlaying)
    {
        lastReportedPlaying = playing;
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("tempo", rack.getEngine().getTransport().getTempo());
        emitScriptEvent (playing ? "transportStarted" : "transportStopped", juce::var (payload));
    }

    for (auto& [partId, part] : partParameters)
    {
        juce::SortedSet<int> changed;
        juce::Array<PartParameterSync::Gesture> gestures;
        if (! part.sync->drain (changed, gestures))
            continue;

        auto* processor = targetProcessor (partId);
        if (processor == nullptr)
            continue;

        const auto& processorParams = processor->getParameters();
        const auto idFor = [&part] (int index) -> juce::String
        {
            for (const auto& d : part.inventory.descriptors)
                if (d.index == index)
                    return d.definitionId;
            return {};
        };

        juce::Array<juce::var> changes;
        for (const auto index : changed)
        {
            if (! juce::isPositiveAndBelow (index, processorParams.size()))
                continue;
            auto* parameter = processorParams[index];
            const auto id = idFor (index);
            if (parameter == nullptr || id.isEmpty())
                continue;

            auto* obj = new juce::DynamicObject();
            obj->setProperty ("id",    id);
            obj->setProperty ("value", parameter->getValue());
            obj->setProperty ("text",  parameter->getCurrentValueAsText());
            changes.add (juce::var (obj));
            part.lastKnownValues[id] = parameter->getValue();
        }

        juce::Array<juce::var> gestureEvents;
        for (const auto& gesture : gestures)
        {
            const auto id = idFor (gesture.index);
            if (id.isEmpty())
                continue;
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("id",    id);
            obj->setProperty ("phase", gesture.begin ? "begin" : "end");
            gestureEvents.add (juce::var (obj));
        }

        // What the user reached for in the plug-in's OWN window, newest first. Our own writes
        // are excluded — they arrive as the same event and answer a different question.
        auto& touched = touchedParametersByTarget[partId];
        for (const auto index : changed)
        {
            const auto id = idFor (index);
            if (id.isEmpty() || parametersWrittenByUs.contains (id))
                continue;

            if (auto* parameter = processorParams[index])
            {
                const auto baseValue = parameter->getValue();
                if (updateModulationBase (partId, id, baseValue))
                    applyModulationTarget (partId, id);
                recordGestureValue (partId, id, baseValue);
                if (performanceRecording)
                {
                    auto* action = new juce::DynamicObject();
                    action->setProperty ("cmd", "setParameter");
                    action->setProperty ("partId", partId);
                    action->setProperty ("id", id);
                    action->setProperty ("value", baseValue);
                    recordPerformanceAction (juce::var (action));
                }
            }

            touched.removeString (id);
            touched.insert (0, id);

            // Armed: the first thing they moved is the thing they meant.
            if (parameterLearnPageId.isNotEmpty())
            {
                const auto pageId = std::exchange (parameterLearnPageId, {});
                const auto slotId = std::exchange (parameterLearnSlotId, {});

                // The same binding assignControlSlot builds, through the same call: a learned
                // assignment must be indistinguishable from a dragged one, class identity
                // included, or the two would resolve differently later.
                ControlBinding binding;
                binding.partId = partId;
                binding.pluginCeId = targetClassCeId (partId);
                binding.parameterId = id;

                if (rack.setSlotBinding (pageId, slotId, std::move (binding)))
                {
                    savePerformance();
                    emitState();
                }
                emitParameterLearn (false, pageId, slotId, id);
            }
        }
        while (touched.size() > maxTouchedParameters)
            touched.remove (touched.size() - 1);

        if (changes.isEmpty() && gestureEvents.isEmpty())
            continue;

        juce::Array<juce::var> touchedVars;
        for (const auto& id : touched)
            touchedVars.add (id);

        auto* root = new juce::DynamicObject();
        root->setProperty ("partId",   partId);
        root->setProperty ("changes",  changes);
        root->setProperty ("gestures", gestureEvents);
        root->setProperty ("touched",  touchedVars);
        if (options.emit != nullptr)
            options.emit ("instrumentHostParamValues", juce::var (root));
    }

    // Cleared at the END of the drain: a write made during this cycle is answered by a change
    // event in this cycle, and clearing earlier would let it through as a touch.
    parametersWrittenByUs.clear();
}

void InstrumentHostService::setEditorPaneHooks (EditorPaneHooks hooks)
{
    options.editorPane = std::move (hooks);
}

void InstrumentHostService::reassertEditorPane()
{
    if (editorTargetId.isNotEmpty())
        showEditorFor (editorTargetId);
}

const PluginClassRecord* InstrumentHostService::findClass (const juce::String& ceId,
                                                           const ModuleRecord** moduleOut) const
{
    for (const auto& module : catalog.allModules())
        for (const auto& record : module.classes)
            if (record.ceId == ceId)
            {
                if (moduleOut != nullptr)
                    *moduleOut = &module;
                return &record;
            }

    return nullptr;
}

juce::File InstrumentHostService::snapshotCacheFile (const PluginClassRecord& record) const
{
    // Readable half so somebody looking in the folder can tell what they are looking at,
    // hashed half so it is unique: a ceId is an identifier string with characters a filename
    // cannot carry, and two vendors are perfectly free to both ship a "Compressor".
    const auto readable = juce::File::createLegalFileName (record.name).substring (0, 40).trim();
    const auto unique = juce::String::toHexString ((record.ceId + "|" + record.version).hashCode64());

    return options.dataDirectory.getChildFile ("plugin-thumbnails")
                                .getChildFile ((readable.isNotEmpty() ? readable + "-" : juce::String())
                                                 + unique + ".png");
}

juce::File InstrumentHostService::snapshotOverrideFile (const PluginClassRecord& record) const
{
    return snapshotCacheFile (record).getSiblingFile (
        snapshotCacheFile (record).getFileNameWithoutExtension() + "-custom.png");
}

juce::File InstrumentHostService::artworkFor (const PluginClassRecord& record) const
{
    // A picture the user chose beats everything, including the vendor's own. They looked at
    // what was there and decided otherwise, which is the end of the argument.
    if (options.dataDirectory != juce::File())
        if (const auto custom = snapshotOverrideFile (record); custom.existsAsFile())
            return custom;

    if (const juce::File vendor (record.snapshotPath); vendor.existsAsFile())
        return vendor;

    if (options.dataDirectory == juce::File())
        return {};

    const auto cached = snapshotCacheFile (record);
    return cached.existsAsFile() ? cached : juce::File();
}

juce::String InstrumentHostService::artworkSourceFor (const PluginClassRecord& record) const
{
    const auto file = artworkFor (record);
    if (file == juce::File())
        return {};

    if (options.dataDirectory != juce::File() && file == snapshotOverrideFile (record))
        return "custom";

    return file.getFullPathName() == record.snapshotPath ? "vendor" : "capture";
}

bool InstrumentHostService::wantsEditorSnapshot (const juce::String& targetId) const
{
    const auto ceId = targetClassCeId (targetId);
    if (ceId.isEmpty() || options.dataDirectory == juce::File())
        return false;

    const std::scoped_lock lock (catalogLock);
    const auto* record = findClass (ceId);
    return record != nullptr && ! artworkFor (*record).existsAsFile();
}

void InstrumentHostService::offerEditorSnapshot (const juce::String& targetId,
                                                 const juce::Image& image)
{
    // Everything here is a reason to do nothing, and doing nothing costs the user a coloured
    // square with the right letters on it. Caching the wrong picture costs them a wrong
    // picture until they find the cache folder, so every gate fails towards the tile.
    if (! wantsEditorSnapshot (targetId))
        return;

    juce::File destination;
    {
        const std::scoped_lock lock (catalogLock);
        const auto* record = findClass (targetClassCeId (targetId));
        if (record == nullptr)
            return;

        destination = snapshotCacheFile (*record);
    }

    if (! editorSnapshot::writePng (editorSnapshot::downscaled (image, editorSnapshot::thumbnailMaxEdge),
                                    destination))
        return;

    // The picture exists now, and nothing else is going to say so: a thumbnail arriving is
    // not a rack mutation, so without this push it would appear the next time something
    // unrelated changed.
    emitState();
}

void InstrumentHostService::runScanNow()
{
    if (options.emit != nullptr)
        options.emit ("instrumentHostScanProgress", scanProgressPayload ("Scan started.", false));

    // The scan works on a COPY and swaps it in at the end: the coordinator holds a module's
    // scan for up to its timeout, and commands on the controlling thread (loading an
    // instrument, clearing a quarantine) must not block behind that, nor race the mutation.
    PluginCatalog working;
    {
        const std::scoped_lock lock (catalogLock);
        working = catalog;
    }

    juce::Array<juce::File> roots;
    if (options.includeDefaultScanRoots)
        roots = PluginScannerCoordinator::defaultWindowsVst3Roots();
    for (const auto& path : userScanPaths)
        if (juce::File (path).isDirectory())
            roots.add (juce::File (path));

    const auto candidates = PluginScannerCoordinator::enumerateVst3Candidates (roots);

    PluginScannerCoordinator::Options scanOptions;
    scanOptions.workerExecutable = options.workerExecutable;
    scanOptions.markerDirectory = options.dataDirectory;
    scanOptions.shouldContinue = [this] { return ! stopRequested.load(); };
    scanOptions.log = [this] (const juce::String& line)
    {
        if (options.emit != nullptr)
            options.emit ("instrumentHostScanProgress", scanProgressPayload (line, false));
    };

    PluginScannerCoordinator coordinator (scanOptions);
    const auto outcome = coordinator.scanModules (candidates, working);

    {
        const std::scoped_lock lock (catalogLock);
        catalog = working;
        catalog.saveTo (catalogFile());
    }

    scanBusy.store (false);

    if (options.emit != nullptr)
        options.emit ("instrumentHostScanProgress",
                      scanProgressPayload (juce::String (candidates.size()) + " candidates: "
                                           + juce::String (outcome.scanned) + " scanned, "
                                           + juce::String (outcome.skippedUnchanged) + " unchanged, "
                                           + juce::String (outcome.skippedQuarantined) + " quarantined, "
                                           + juce::String (outcome.skippedUnsupported) + " wrong architecture, "
                                           + juce::String (outcome.failed) + " failed.",
                                           true));
    // No state emit from here: this may be the scan thread, and the rack half of the state
    // payload belongs to the controlling thread. The final {done:true} above tells the UI to
    // ask for state through the normal command path.
}

juce::var InstrumentHostService::scanProgressPayload (const juce::String& line, bool done)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("line", line);
    obj->setProperty ("done", done);
    return juce::var (obj);
}

void InstrumentHostService::emitState()
{
    if (options.emit != nullptr)
        options.emit ("instrumentHostState", buildStatePayload());
}

void InstrumentHostService::emitError (const juce::String& message)
{
    if (options.emit != nullptr)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("message", message);
        options.emit ("instrumentHostError", juce::var (obj));
    }
}

juce::var InstrumentHostService::buildStatePayload()
{
    juce::Array<juce::var> instruments;
    juce::Array<juce::var> effectClasses;
    juce::Array<juce::var> modules;

    {
        const std::scoped_lock lock (catalogLock);

        // The plug-in's picture: the vendor's own if it shipped one, else the capture taken
        // the first time somebody opened its editor. Published rather than pathed — the
        // frontend gets a token it can fetch and nothing about where the file is.
        const auto classToVar = [this] (const PluginClassRecord& record)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("ceId",    record.ceId);
            obj->setProperty ("name",    record.name);
            obj->setProperty ("vendor",  record.vendor);
            obj->setProperty ("version", record.version);
            if (const auto token = PluginSnapshotRegistry::instance()
                                     .publish (record.ceId, artworkFor (record));
                token.isNotEmpty())
            {
                obj->setProperty ("snapshotUrl", "/plugin-snapshot/" + token);
                // Which of the three is showing, so the UI can offer "use its own picture
                // again" only where there is one to go back to.
                obj->setProperty ("artworkSource", artworkSourceFor (record));
            }
            return juce::var (obj);
        };

        for (const auto& record : catalog.instrumentClasses())
            instruments.add (classToVar (record));

        for (const auto& record : catalog.effectClasses())
            effectClasses.add (classToVar (record));

        for (const auto& module : catalog.allModules())
        {
            // The browser projection lists instruments only, so the module row must say how
            // many of its classes qualify — "3 candidates scanned, nothing shown" is
            // undiagnosable without this number in the UI.
            int numInstruments = 0;
            for (const auto& record : module.classes)
                if (record.isInstrument)
                    ++numInstruments;

            auto* obj = new juce::DynamicObject();
            obj->setProperty ("path",              module.path);
            obj->setProperty ("quarantined",       module.quarantined);
            obj->setProperty ("missing",           module.missing);
            obj->setProperty ("failureCount",      module.failureCount);
            obj->setProperty ("lastFailureReason", module.lastFailureReason);
            // What the module says it is, and — when it is not on offer — the one sentence
            // saying why. A module absent from the browser with nothing anywhere explaining
            // its absence is the support question nobody can answer.
            juce::Array<juce::var> architectures;
            for (const auto& arch : module.architectures)
                architectures.add (arch);
            obj->setProperty ("architectures",      architectures);
            obj->setProperty ("unavailableReason",  module.unavailableReason());
            obj->setProperty ("numClasses",        module.classes.size());
            obj->setProperty ("numInstruments",    numInstruments);
            modules.add (juce::var (obj));
        }
    }

    const auto& performance = rack.getPerformance();

    const auto modulationBaseFor = [&performance] (const juce::String& targetId,
                                                   const juce::String& parameterId,
                                                   float fallback)
    {
        for (const auto& route : performance.modulationRoutes)
            if (route.targetId == targetId && route.parameterId == parameterId)
                return route.baseValue;
        return fallback;
    };

    const auto effectsProjection = [this] (const juce::Array<EffectSlot>& chain)
    {
        juce::Array<juce::var> out;
        for (const auto& slot : chain)
        {
            auto* e = new juce::DynamicObject();
            e->setProperty ("effectId",     slot.effectId);
            e->setProperty ("pluginCeId",   slot.pluginCeId);
            e->setProperty ("pluginName",   slot.pluginName);
            e->setProperty ("pluginVendor", slot.pluginVendor);
            e->setProperty ("bypassed",     slot.bypassed);
            e->setProperty ("hasProcessor", rack.effectHasProcessor (slot.effectId));
            e->setProperty ("unresolved",   slot.pluginCeId.isNotEmpty()
                                              && ! rack.effectHasProcessor (slot.effectId));
            out.add (juce::var (e));
        }
        return out;
    };

    juce::Array<juce::var> parts;
    for (const auto& part : performance.parts)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("effects", effectsProjection (part.effects));
        obj->setProperty ("partId",        part.partId);
        obj->setProperty ("pluginCeId",    part.pluginCeId);
        obj->setProperty ("pluginName",    part.pluginName);
        obj->setProperty ("pluginVendor",  part.pluginVendor);
        obj->setProperty ("destinationBusId", part.destinationBusId);
        obj->setProperty ("presetRecordId", part.lastPresetRecordId);
        obj->setProperty ("presetName",     part.lastPresetName);
        obj->setProperty ("hasInstrument", rack.partHasInstrument (part.partId));
        obj->setProperty ("unresolved",    part.pluginCeId.isNotEmpty()
                                             && ! rack.partHasInstrument (part.partId));
        obj->setProperty ("channel",       part.midi.channel);
        obj->setProperty ("keyLow",        part.midi.keyLow);
        obj->setProperty ("keyHigh",       part.midi.keyHigh);
        obj->setProperty ("velocityLow",   part.midi.velocityLow);
        obj->setProperty ("velocityHigh",  part.midi.velocityHigh);
        obj->setProperty ("transpose",     part.midi.transpose);
        obj->setProperty ("enabled",       part.enabled);
        obj->setProperty ("mute",          part.mute);
        obj->setProperty ("solo",          part.solo);
        obj->setProperty ("volume",        modulationBaseFor (part.partId, "@gain",
                                                                part.volume * 0.5f) * 2.0f);
        obj->setProperty ("pan",           modulationBaseFor (part.partId, "@pan",
                                                                (part.pan + 1.0f) * 0.5f) * 2.0f - 1.0f);

        juce::Array<juce::var> sends;
        for (const auto& send : part.sends)
        {
            auto* s = new juce::DynamicObject();
            s->setProperty ("returnId", send.returnId);
            s->setProperty ("level",    modulationBaseFor (part.partId,
                                                             "@send:" + send.returnId,
                                                             send.level * 0.5f) * 2.0f);
            sends.add (juce::var (s));
        }
        obj->setProperty ("sends", sends);

        juce::Array<juce::var> extraOuts;
        for (const auto& extra : part.extraOuts)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("pairIndex", extra.pairIndex);
            o->setProperty ("gain",      extra.gain);
            extraOuts.add (juce::var (o));
        }
        obj->setProperty ("extraOuts", extraOuts);
        obj->setProperty ("outputChannels", rack.instrumentOutputChannels (part.partId));
        obj->setProperty ("outputPair",     part.outputPair);

        obj->setProperty ("midiSourcePartId", part.midiSourcePartId);
        obj->setProperty ("microtuningEnabled", part.microtuningEnabled);
        if (const auto tuningError = microtuningErrors.find (part.partId);
            tuningError != microtuningErrors.end())
            obj->setProperty ("microtuningError", tuningError->second);
        else
            obj->setProperty ("microtuningError", juce::String());
        obj->setProperty ("hardware", part.hardware);
        if (part.hardware)
        {
            obj->setProperty ("midiOutputId",       part.midiOutputId);
            obj->setProperty ("midiOutputName",     part.midiOutputName);
            obj->setProperty ("midiOutChannel",     part.midiOutChannel);
            obj->setProperty ("audioReturnChannel", part.audioReturnChannel);
            obj->setProperty ("audioReturnStereo",  part.audioReturnStereo);
            obj->setProperty ("programBank",        part.programBank);
            obj->setProperty ("programNumber",      part.programNumber);
            obj->setProperty ("deviceProfileId",    part.deviceProfileId);
            const auto errorIt = hardwareMidiErrors.find (part.partId);
            obj->setProperty ("midiOutError", errorIt != hardwareMidiErrors.end()
                                                ? errorIt->second : juce::String());

            // The patch itself never crosses the bridge. It is opaque manufacturer bytes
            // the WebView has no use for and every reason not to carry — a bank dump is
            // megabytes, and it would ride along on every state push. Its name and size are
            // what a person needs to see; "there is one" is what the buttons need to know.
            obj->setProperty ("hardwarePatchName",  part.hardwarePatchName);
            obj->setProperty ("hardwarePatchBytes", (int) ((part.hardwarePatchBase64.length() / 4) * 3));
            obj->setProperty ("hardwareRestore",    part.hardwareRestore);
            // What this synth's library patches are filed under, so the UI can offer the
            // right ones to compare with and to walk — the same target saveUserPreset writes.
            obj->setProperty ("hardwarePatchTarget", hardwarePatchTarget (part));
        }

        // What this part's own plug-ins cost. Shown because it names the thing to blame:
        // the graph compensates for it (JUCE's own PDC — see InstrumentRackHost.h), so the
        // part is not out of time, it is simply the reason everything else is waiting.
        obj->setProperty ("latencyMs", rack.partLatencySamples (part.partId)
                                         / rack.getSampleRate() * 1000.0);
        obj->setProperty ("arp",    perf::arpToVar (part.arp));
        obj->setProperty ("midiFx", perf::midiFxToVar (part.midiFx));
        {
            // The chain the UI actually edits. The legacy blocks above stay in the payload
            // because the part-level controls still read them — they are the first slot of
            // each family, projected where every existing panel already looks.
            juce::Array<juce::var> midiChain;
            for (const auto& slot : part.midiChain)
                midiChain.add (perf::midiSlotToVar (slot));
            obj->setProperty ("midiChain", midiChain);
        }
        parts.add (juce::var (obj));
    }

    juce::Array<juce::var> pages;
    for (const auto& page : performance.pages)
    {
        juce::Array<juce::var> slots;
        const auto liveSlots = surfaceSlots (page.pageId);
        for (int slotIndex = 0; slotIndex < page.slots.size(); ++slotIndex)
        {
            const auto& slot = page.slots.getReference (slotIndex);
            const auto& b = slot.binding;
            const auto resolved = bindingResolves (b);
            // Resolved live so a rename inside the plug-in shows through; the raw id for an
            // unresolved binding is exactly the diagnostic the repair needs.
            const auto displayName = slotDisplayName (b, resolved);

            auto* s = new juce::DynamicObject();
            s->setProperty ("slotId",      slot.slotId);
            s->setProperty ("assigned",    ! b.isEmpty());
            s->setProperty ("partId",      b.partId);
            s->setProperty ("parameterId", b.parameterId);
            s->setProperty ("label",       b.label);
            s->setProperty ("displayName", b.isEmpty() ? juce::String() : displayName);
            s->setProperty ("partName",    targetDisplayName (b.partId));
            s->setProperty ("rangeMin",    b.rangeMin);
            s->setProperty ("rangeMax",    b.rangeMax);
            s->setProperty ("inverted",    b.inverted);
            s->setProperty ("bipolar",     b.bipolar);
            s->setProperty ("resolved",    resolved);
            s->setProperty ("midiCc",      slot.midiCc);
            s->setProperty ("midiChannel", slot.midiChannel);
            s->setProperty ("midiNote",    slot.midiNote);
            s->setProperty ("kind",        slot.kind);
            s->setProperty ("index",       slot.index);
            s->setProperty ("toggle",      b.toggle);
            s->setProperty ("latched",     slot.latched);
            if (slotIndex < liveSlots.size())
            {
                const auto& live = liveSlots.getReference (slotIndex);
                s->setProperty ("value",     live.position);
                s->setProperty ("valueText", live.valueText);
            }
            else
            {
                s->setProperty ("value",     0.0);
                s->setProperty ("valueText", juce::String());
            }
            slots.add (juce::var (s));
        }

        auto* pg = new juce::DynamicObject();
        pg->setProperty ("pageId", page.pageId);
        pg->setProperty ("name",   page.name);
        pg->setProperty ("generated", page.generated);
        pg->setProperty ("slots",  slots);
        pages.add (juce::var (pg));
    }

    juce::Array<juce::var> macros;
    for (const auto& macro : performance.macros)
    {
        juce::Array<juce::var> targets;
        for (const auto& target : macro.targets)
        {
            auto* t = new juce::DynamicObject();
            t->setProperty ("targetId",    target.partId);
            t->setProperty ("parameterId", target.parameterId);
            t->setProperty ("targetName",  targetDisplayName (target.partId));
            t->setProperty ("displayName", slotDisplayName (target, bindingResolves (target)));
            t->setProperty ("rangeMin",    target.rangeMin);
            t->setProperty ("rangeMax",    target.rangeMax);
            t->setProperty ("inverted",    target.inverted);
            t->setProperty ("resolved",    bindingResolves (target));
            targets.add (juce::var (t));
        }

        auto* m = new juce::DynamicObject();
        m->setProperty ("macroId", macro.macroId);
        m->setProperty ("name",    macro.name);
        m->setProperty ("value",   macro.value);
        m->setProperty ("targets", targets);
        macros.add (juce::var (m));
    }

    juce::Array<juce::var> modulationRoutes;
    for (const auto& route : performance.modulationRoutes)
    {
        ControlBinding address;
        address.partId = route.targetId;
        address.pluginCeId = route.targetCeId;
        address.parameterId = route.parameterId;
        const auto resolved = modulationRouteResolves (route);

        auto* r = new juce::DynamicObject();
        r->setProperty ("routeId",       route.routeId);
        r->setProperty ("sourceType",    route.sourceType);
        r->setProperty ("sourceId",      route.sourceId);
        r->setProperty ("sourceChannel", route.sourceChannel);
        r->setProperty ("sourceNumber",  route.sourceNumber);
        r->setProperty ("sourceValue",   modulationSourceValue (route));
        r->setProperty ("targetId",      route.targetId);
        r->setProperty ("parameterId",   route.parameterId);
        r->setProperty ("targetName",    targetDisplayName (route.targetId));
        r->setProperty ("displayName",   slotDisplayName (address, resolved));
        r->setProperty ("amount",        route.amount);
        r->setProperty ("baseValue",     route.baseValue);
        r->setProperty ("enabled",       route.enabled);
        r->setProperty ("resolved",      resolved);
        modulationRoutes.add (juce::var (r));
    }

    juce::Array<juce::var> midiLfos;
    for (const auto& lfo : performance.midiLfos)
    {
        const auto runtime = midiLfoRuntimes.find (lfo.lfoId);
        juce::Array<juce::var> outputs;
        for (const auto& output : lfo.outputs)
        {
            const auto* target = performance.findPart (output.targetPartId);
            auto* o = new juce::DynamicObject();
            o->setProperty ("outputId",      output.outputId);
            o->setProperty ("type",          output.type);
            o->setProperty ("targetPartId",  output.targetPartId);
            o->setProperty ("targetName",    targetDisplayName (output.targetPartId));
            o->setProperty ("channel",       output.channel);
            o->setProperty ("number",        output.number);
            o->setProperty ("sysexTemplate", output.sysexTemplate);
            o->setProperty ("enabled",       output.enabled);
            o->setProperty ("resolved",      target != nullptr && target->hardware);
            outputs.add (juce::var (o));
        }

        auto* l = new juce::DynamicObject();
        l->setProperty ("lfoId",       lfo.lfoId);
        l->setProperty ("name",        lfo.name);
        l->setProperty ("shape",       lfo.shape);
        l->setProperty ("enabled",     lfo.enabled);
        l->setProperty ("sync",        lfo.sync);
        l->setProperty ("rateHz",      lfo.rateHz);
        l->setProperty ("syncBeats",   lfo.syncBeats);
        l->setProperty ("phaseOffset", lfo.phaseOffset);
        l->setProperty ("minimum",     lfo.minimum);
        l->setProperty ("maximum",     lfo.maximum);
        l->setProperty ("phase",       runtime != midiLfoRuntimes.end() ? runtime->second.phase : 0.0f);
        l->setProperty ("value",       runtime != midiLfoRuntimes.end() ? runtime->second.value : 0.0f);
        l->setProperty ("outputs",     outputs);
        midiLfos.add (juce::var (l));
    }

    juce::Array<juce::var> envelopes;
    for (const auto& envelope : performance.envelopes)
    {
        const auto runtime = envelopeRuntimes.find (envelope.envelopeId);
        auto* e = new juce::DynamicObject();
        e->setProperty ("envelopeId",    envelope.envelopeId);
        e->setProperty ("name",          envelope.name);
        e->setProperty ("enabled",       envelope.enabled);
        e->setProperty ("channel",       envelope.channel);
        e->setProperty ("noteLow",       envelope.noteLow);
        e->setProperty ("noteHigh",      envelope.noteHigh);
        e->setProperty ("retrigger",     envelope.retrigger);
        e->setProperty ("attackMs",      envelope.attackMs);
        e->setProperty ("decayMs",       envelope.decayMs);
        e->setProperty ("sustain",       envelope.sustain);
        e->setProperty ("releaseMs",     envelope.releaseMs);
        e->setProperty ("curve",         envelope.curve);
        e->setProperty ("velocityAmount", envelope.velocityAmount);
        e->setProperty ("stage",         runtime != envelopeRuntimes.end()
                                            ? envelopeStageName (runtime->second.stage) : "idle");
        e->setProperty ("stageProgress", runtime != envelopeRuntimes.end()
                                            ? runtime->second.progress : 0.0f);
        e->setProperty ("value",         runtime != envelopeRuntimes.end()
                                            ? runtime->second.value : 0.0f);
        e->setProperty ("gate",          runtime != envelopeRuntimes.end()
                                            && ! runtime->second.heldNotes.empty());
        envelopes.add (juce::var (e));
    }

    juce::Array<juce::var> msegs;
    for (const auto& mseg : performance.msegs)
    {
        const auto runtime = msegRuntimes.find (mseg.msegId);
        juce::Array<juce::var> points;
        for (const auto& point : mseg.points)
        {
            auto* p = new juce::DynamicObject();
            p->setProperty ("pointId",  point.pointId);
            p->setProperty ("position", point.position);
            p->setProperty ("value",    point.value);
            p->setProperty ("curve",    point.curve);
            points.add (juce::var (p));
        }
        auto* m = new juce::DynamicObject();
        m->setProperty ("msegId",      mseg.msegId);
        m->setProperty ("name",        mseg.name);
        m->setProperty ("enabled",     mseg.enabled);
        m->setProperty ("sync",        mseg.sync);
        m->setProperty ("rateHz",      mseg.rateHz);
        m->setProperty ("syncBeats",   mseg.syncBeats);
        m->setProperty ("phaseOffset", mseg.phaseOffset);
        m->setProperty ("phase",       runtime != msegRuntimes.end() ? runtime->second.phase : 0.0f);
        m->setProperty ("value",       runtime != msegRuntimes.end() ? runtime->second.value : 0.0f);
        m->setProperty ("points",      points);
        msegs.add (juce::var (m));
    }

    juce::Array<juce::var> randomModulators;
    for (const auto& random : performance.randomModulators)
    {
        const auto runtime = randomModulatorRuntimes.find (random.randomId);
        auto* r = new juce::DynamicObject();
        r->setProperty ("randomId",    random.randomId);
        r->setProperty ("name",        random.name);
        r->setProperty ("mode",        random.mode);
        r->setProperty ("enabled",     random.enabled);
        r->setProperty ("sync",        random.sync);
        r->setProperty ("rateHz",      random.rateHz);
        r->setProperty ("syncBeats",   random.syncBeats);
        r->setProperty ("seed",        random.seed);
        r->setProperty ("probability", random.probability);
        r->setProperty ("smoothing",   random.smoothing);
        r->setProperty ("stepSize",    random.stepSize);
        r->setProperty ("chaos",       random.chaos);
        r->setProperty ("minimum",     random.minimum);
        r->setProperty ("maximum",     random.maximum);
        r->setProperty ("phase",       runtime != randomModulatorRuntimes.end()
                                              ? runtime->second.phase : 0.0f);
        r->setProperty ("value",       runtime != randomModulatorRuntimes.end()
                                              ? runtime->second.value : 0.0f);
        r->setProperty ("step",        runtime != randomModulatorRuntimes.end()
                                              ? static_cast<juce::int64> (runtime->second.step) : -1);
        randomModulators.add (juce::var (r));
    }

    juce::Array<juce::var> layerGroups;
    for (const auto& group : performance.layerGroups)
    {
        juce::Array<juce::var> members;
        for (const auto& member : group.members)
        {
            const auto* part = performance.findPart (member.partId);
            auto* m = new juce::DynamicObject();
            m->setProperty ("partId",    member.partId);
            m->setProperty ("partName",  part == nullptr ? juce::String ("Missing part")
                                            : part->pluginName.isNotEmpty() ? part->pluginName
                                            : part->midiOutputName.isNotEmpty() ? part->midiOutputName
                                                                               : juce::String ("Empty part"));
            m->setProperty ("minimum",   member.minimum);
            m->setProperty ("maximum",   member.maximum);
            m->setProperty ("crossfade", member.crossfade);
            m->setProperty ("resolved",  part != nullptr && part->midiSourcePartId.isEmpty());
            members.add (juce::var (m));
        }

        auto* g = new juce::DynamicObject();
        g->setProperty ("layerGroupId", group.layerGroupId);
        g->setProperty ("name",         group.name);
        g->setProperty ("enabled",      group.enabled);
        g->setProperty ("allocation",   group.allocation);
        g->setProperty ("source",       group.source);
        g->setProperty ("controller",   group.controller);
        g->setProperty ("macroId",      group.macroId);
        g->setProperty ("members",      members);
        layerGroups.add (juce::var (g));
    }

    juce::Array<juce::var> buses;
    for (const auto& bus : performance.buses)
    {
        auto* b = new juce::DynamicObject();
        b->setProperty ("busId",            bus.busId);
        b->setProperty ("name",             bus.name);
        b->setProperty ("level",            bus.level);
        b->setProperty ("destinationBusId", bus.destinationBusId);
        b->setProperty ("effects",          effectsProjection (bus.effects));
        // What this bus adds on the way out, its own destination included. Compensated by
        // the graph, shown here because it is still what the bus costs the rig.
        b->setProperty ("latencyMs", rack.busLatencySamples (bus.busId)
                                       / rack.getSampleRate() * 1000.0);
        buses.add (juce::var (b));
    }

    juce::Array<juce::var> returns;
    for (const auto& chain : performance.returns)
    {
        auto* r = new juce::DynamicObject();
        r->setProperty ("returnId", chain.returnId);
        r->setProperty ("name",     chain.name);
        r->setProperty ("level",    chain.level);
        r->setProperty ("effects",  effectsProjection (chain.effects));
        returns.add (juce::var (r));
    }

    auto* rackObj = new juce::DynamicObject();
    rackObj->setProperty ("performanceId", performance.performanceId);
    rackObj->setProperty ("focusedPartId", performance.focusedPartId);
    rackObj->setProperty ("parts", parts);
    rackObj->setProperty ("masterEffects", effectsProjection (performance.masterEffects));
    rackObj->setProperty ("returns", returns);
    rackObj->setProperty ("buses", buses);
    rackObj->setProperty ("macros", macros);
    rackObj->setProperty ("midiLfos", midiLfos);
    rackObj->setProperty ("envelopes", envelopes);
    rackObj->setProperty ("msegs", msegs);
    rackObj->setProperty ("randomModulators", randomModulators);
    rackObj->setProperty ("layerGroups", layerGroups);
    rackObj->setProperty ("modulationRoutes", modulationRoutes);
    rackObj->setProperty ("pages", pages);
    {
        const auto& audition = performance.presetAudition;
        auto* a = new juce::DynamicObject();
        a->setProperty ("enabled",      audition.enabled);
        a->setProperty ("phrase",       audition.phrase);
        a->setProperty ("rootNote",     audition.rootNote);
        a->setProperty ("velocity",     audition.velocity);
        a->setProperty ("noteLengthMs", audition.noteLengthMs);
        a->setProperty ("gapMs",        audition.gapMs);
        a->setProperty ("playing",      presetAuditionPlaying);
        rackObj->setProperty ("presetAudition", juce::var (a));
    }
    {
        auto* comparison = new juce::DynamicObject();
        comparison->setProperty ("active", soundComparison.active);
        comparison->setProperty ("partId", soundComparison.partId);
        comparison->setProperty ("index", soundComparison.index);
        comparison->setProperty ("count", soundComparison.recordIds.size());
        comparison->setProperty ("originalName",
                                 soundComparison.originalPresetName.isNotEmpty()
                                   ? soundComparison.originalPresetName
                                   : juce::String ("Original sound"));
        comparison->setProperty ("originalRecordId",
                                 soundComparison.originalPresetRecordId);
        juce::Array<juce::var> comparisonRecordIds;
        for (const auto& id : soundComparison.recordIds)
            comparisonRecordIds.add (id);
        comparison->setProperty ("recordIds", comparisonRecordIds);
        juce::String recordId, name;
        if (soundComparison.active
            && juce::isPositiveAndBelow (soundComparison.index,
                                         soundComparison.recordIds.size()))
        {
            recordId = soundComparison.recordIds[soundComparison.index];
            if (const auto* record = library.find (recordId))
                name = record->name;
        }
        comparison->setProperty ("recordId", recordId);
        comparison->setProperty ("name", name);
        rackObj->setProperty ("soundComparison", juce::var (comparison));
    }
    {
        const auto& tuning = performance.microtuning;
        auto* t = new juce::DynamicObject();
        t->setProperty ("enabled",            tuning.enabled);
        t->setProperty ("name",               tuning.name);
        t->setProperty ("sourceName",         tuning.sourceName);
        t->setProperty ("rootMidiNote",       tuning.rootMidiNote);
        t->setProperty ("referenceMidiNote",  tuning.referenceMidiNote);
        t->setProperty ("referenceFrequency", tuning.referenceFrequency);
        t->setProperty ("mtsDeviceId",        tuning.mtsDeviceId);
        t->setProperty ("mtsProgram",         tuning.mtsProgram);
        t->setProperty ("degreeCount",        juce::jmax (0, tuning.degreesCents.size() - 1));
        t->setProperty ("periodCents",        tuning.hasUsableScale()
                                                   ? tuning.degreesCents.getLast() : 0.0);
        juce::Array<juce::var> degrees;
        for (const auto cents : tuning.degreesCents)
            degrees.add (cents);
        t->setProperty ("degreesCents", degrees);
        rackObj->setProperty ("microtuning", juce::var (t));
    }
    {
        juce::Array<juce::var> canvasPositions;
        for (const auto& position : performance.canvasPositions)
        {
            auto* c = new juce::DynamicObject();
            c->setProperty ("nodeId", position.nodeId);
            c->setProperty ("x",      position.x);
            c->setProperty ("y",      position.y);
            canvasPositions.add (juce::var (c));
        }
        rackObj->setProperty ("canvasPositions", canvasPositions);
    }
    rackObj->setProperty ("masterLatencyMs", rack.masterLatencySamples()
                                               / rack.getSampleRate() * 1000.0);

    auto* audio = new juce::DynamicObject();
    auto* device = deviceManager.getCurrentAudioDevice();
    audio->setProperty ("enabled",    options.enableAudio);
    audio->setProperty ("running",    audioRunning && device != nullptr);
    audio->setProperty ("deviceName", device != nullptr ? device->getName() : juce::String());
    audio->setProperty ("sampleRate", device != nullptr ? device->getCurrentSampleRate() : 0.0);
    audio->setProperty ("bufferSize", device != nullptr ? device->getCurrentBufferSizeSamples() : 0);
    audio->setProperty ("inputChannels", device != nullptr
                                           ? device->getActiveInputChannels().countNumberOfSetBits() : 0);
    // §18.7.11's resource visibility, in the simplest honest form the device layer offers:
    // whole-engine DSP load and the xrun count. Zeros while audio is off.
    audio->setProperty ("cpu",   audioRunning && device != nullptr ? deviceManager.getCpuUsage() : 0.0);
    audio->setProperty ("xruns", audioRunning && device != nullptr ? deviceManager.getXRunCount() : 0);

    auto* root = new juce::DynamicObject();
    root->setProperty ("instruments", instruments);
    root->setProperty ("effectClasses", effectClasses);
    root->setProperty ("modules", modules);
    root->setProperty ("scanPaths", [this]
    {
        juce::Array<juce::var> paths;
        for (const auto& p : userScanPaths)
            paths.add (p);
        return paths;
    }());
    root->setProperty ("performance", performancePayload());
    root->setProperty ("product", productPayload());
    root->setProperty ("reliability", reliabilityPayload());
    root->setProperty ("licence", licencePayload());
    root->setProperty ("stageLocked", stageLocked);
    root->setProperty ("scanning", scanBusy.load());
    root->setProperty ("editorOpenPartId", editorTargetId);
    {
        juce::Array<juce::var> floating;
        for (const auto& partId : floatingEditorIds)
            floating.add (partId);
        root->setProperty ("floatingEditorPartIds", floating);
    }
    root->setProperty ("audio", juce::var (audio));
    root->setProperty ("rack", juce::var (rackObj));
    return juce::var (root);
}

// -- the performance surface runtime (Stage 6, §18.8.10) -------------------------------------

InstrumentHostService::SurfaceTransport InstrumentHostService::surfaceTransport() const
{
    const auto& transport = rack.getEngine().getTransport();

    SurfaceTransport view;
    view.playing = transport.isPlayingOrPending();
    view.tempo = transport.getTempo();
    double fraction = 0.0;
    transport.positionInBarsBeats (view.bar, view.beat, fraction);
    view.externalClock = transport.isExternalClockEnabled();
    view.clockLost = transport.hasLostExternalClock();
    return view;
}

juce::Array<InstrumentHostService::SurfaceClip> InstrumentHostService::surfaceClips() const
{
    juce::Array<SurfaceClip> views;
    const auto& performance = rack.getPerformance();
    const auto& engine = rack.getEngine();

    for (int i = 0; i < performance.clips.size(); ++i)
    {
        const auto& clip = performance.clips.getReference (i);
        views.add ({ clip.clipId, clip.name, engine.isClipActive (i), engine.isClipPending (i),
                     engine.clipPhase (i) });
    }

    return views;
}

juce::StringArray InstrumentHostService::surfaceSceneNames() const
{
    juce::StringArray names;
    for (const auto& scene : rack.getPerformance().scenes)
        names.add (scene.name);
    return names;
}

bool InstrumentHostService::surfaceClipPad (int padIndex)
{
    const auto& performance = rack.getPerformance();
    if (! juce::isPositiveAndBelow (padIndex, performance.clips.size()))
        return false;

    // The pad is a toggle, and it goes through the same quantized launch the UI uses — the
    // driver decides nothing about timing, and the clip's own quantization governs its stop
    // exactly as it governs its start.
    const auto stopping = rack.getEngine().isClipActive (padIndex);
    if (stopping)
        rack.getEngine().stopClip (padIndex, performance.clips.getReference (padIndex).launchQuantize);
    else
        rack.getEngine().launchClip (padIndex);

    if (! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", stopping ? "stopClip" : "launchClip");
        action->setProperty ("clipId", performance.clips.getReference (padIndex).clipId);
        recordPerformanceAction (juce::var (action));
    }

    return true;
}

bool InstrumentHostService::surfaceScenePad (int padIndex)
{
    const auto& scenes = rack.getPerformance().scenes;
    if (! juce::isPositiveAndBelow (padIndex, scenes.size()))
        return false;

    const auto sceneId = scenes.getReference (padIndex).sceneId;
    const auto launched = launchScene (sceneId);
    if (launched && ! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "launchScene");
        action->setProperty ("sceneId", sceneId);
        recordPerformanceAction (juce::var (action));
    }
    return launched;
}

perf::Lane* InstrumentHostService::surfaceLane()
{
    auto& performance = const_cast<Performance&> (rack.getPerformance());

    auto* pattern = surfacePatternId.isNotEmpty() ? performance.findPattern (surfacePatternId)
                                                  : (performance.patterns.isEmpty()
                                                       ? nullptr
                                                       : &performance.patterns.getReference (0));
    if (pattern == nullptr)
        return nullptr;

    if (surfaceLaneId.isNotEmpty())
        if (auto* lane = pattern->findLane (surfaceLaneId))
            return lane;

    return pattern->lanes.isEmpty() ? nullptr : &pattern->lanes.getReference (0);
}

bool InstrumentHostService::setSurfaceLane (const juce::String& patternId, const juce::String& laneId)
{
    const auto& performance = rack.getPerformance();
    const auto* pattern = performance.findPattern (patternId);
    if (pattern == nullptr || pattern->findLane (laneId) == nullptr)
        return false;

    surfacePatternId = patternId;
    surfaceLaneId = laneId;
    return true;
}

bool InstrumentHostService::surfaceStepPad (int padIndex)
{
    auto* lane = surfaceLane();
    auto* step = lane != nullptr ? lane->findStep (padIndex) : nullptr;
    if (step == nullptr)
        return false;

    step->active = ! step->active;
    if (step->active && lane->type == perf::LaneType::note && step->note == 0)
        step->note = 60;

    if (! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "surfaceStepPad");
        action->setProperty ("padIndex", padIndex);
        recordPerformanceAction (juce::var (action));
    }

    recompilePerformance();
    savePerformance();
    emitState();
    return true;
}

bool InstrumentHostService::nudgePerformanceEncoder (SurfaceEncoder encoder, int delta)
{
    // Relative movement, like Stage 3's slot nudge: there is no absolute knob position to
    // jump to, which is what keeps a page or Performance change from snapping a value.
    const auto amount = (float) delta / 127.0f;
    if (! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "surfacePerformanceEncoder");
        action->setProperty ("encoder", (int) encoder);
        action->setProperty ("delta", delta);
        recordPerformanceAction (juce::var (action));
    }

    if (encoder == SurfaceEncoder::tempo)
    {
        auto& transport = rack.getEngine().getTransport();
        const auto tempo = juce::jlimit (20.0, 300.0, transport.getTempo() + (double) delta);
        transport.setTempo (tempo);
        const_cast<Performance&> (rack.getPerformance()).transport.tempo = tempo;
        savePerformance();
        emitState();
        return true;
    }

    auto* lane = surfaceLane();
    if (lane == nullptr)
        return false;

    auto& performance = const_cast<Performance&> (rack.getPerformance());
    auto* pattern = surfacePatternId.isNotEmpty() ? performance.findPattern (surfacePatternId)
                                                  : &performance.patterns.getReference (0);

    switch (encoder)
    {
        case SurfaceEncoder::swing:
            if (pattern != nullptr)
                pattern->swing = juce::jlimit (0.0f, 0.75f, pattern->swing + amount);
            break;

        case SurfaceEncoder::rate:
        {
            // Rate steps through the musically useful divisions rather than every integer.
            static const int rates[] = { 1, 2, 3, 4, 6, 8, 12, 16 };
            int index = 3;
            for (int i = 0; i < (int) std::size (rates); ++i)
                if (rates[i] == lane->stepsPerBeat)
                    index = i;
            index = juce::jlimit (0, (int) std::size (rates) - 1, index + (delta > 0 ? 1 : -1));
            lane->stepsPerBeat = rates[index];
            break;
        }

        case SurfaceEncoder::length:
            lane->stepCount = juce::jlimit (1, 128, lane->stepCount + (delta > 0 ? 1 : -1));
            lane->resizeSteps();
            break;

        case SurfaceEncoder::gate:
        case SurfaceEncoder::probability:
        case SurfaceEncoder::velocity:
            // These are per step, so they move every ACTIVE step of the focused lane
            // together: one encoder, the whole lane, which is what a groove box does.
            for (auto& step : lane->steps)
            {
                if (! step.active)
                    continue;
                if (encoder == SurfaceEncoder::gate)
                    step.gate = juce::jlimit (0.05f, 4.0f, step.gate + amount);
                else if (encoder == SurfaceEncoder::probability)
                    step.probability = juce::jlimit (0, 100, step.probability + delta);
                else
                    step.velocity = juce::jlimit (1, 127, step.velocity + delta);
            }
            break;

        case SurfaceEncoder::tempo:
            break;   // handled above
    }

    recompilePerformance();
    savePerformance();
    emitState();
    return true;
}

// -- the scripting surface (Stage 6, §18.8.11) ------------------------------------------------

void InstrumentHostService::emitScriptEvent (const juce::String& event, const juce::var& payload) const
{
    if (options.scriptEvent != nullptr)
        options.scriptEvent (event, payload);
}

juce::var InstrumentHostService::scriptPerformanceState() const
{
    const auto transport = surfaceTransport();

    auto* transportObj = new juce::DynamicObject();
    transportObj->setProperty ("playing", transport.playing);
    transportObj->setProperty ("tempo",   transport.tempo);
    transportObj->setProperty ("bar",     transport.bar);
    transportObj->setProperty ("beat",    transport.beat);

    juce::Array<juce::var> clips;
    for (const auto& clip : surfaceClips())
    {
        auto* c = new juce::DynamicObject();
        c->setProperty ("clipId", clip.clipId);
        c->setProperty ("name",   clip.name);
        c->setProperty ("active", clip.active);
        c->setProperty ("pending", clip.pending);
        clips.add (juce::var (c));
    }

    juce::Array<juce::var> scenes;
    for (const auto& scene : rack.getPerformance().scenes)
    {
        auto* s = new juce::DynamicObject();
        s->setProperty ("sceneId", scene.sceneId);
        s->setProperty ("name",    scene.name);
        scenes.add (juce::var (s));
    }

    auto* root = new juce::DynamicObject();
    root->setProperty ("transport", juce::var (transportObj));
    root->setProperty ("clips",     clips);
    root->setProperty ("scenes",    scenes);
    root->setProperty ("setlistIndex", rack.getPerformance().setlist.currentIndex);
    return juce::var (root);
}

juce::var InstrumentHostService::runScriptAction (const juce::String& action, const juce::var& payload)
{
    // A closed list. Anything not named here returns nothing at all, so a script cannot probe
    // its way into the rest of the command surface (§18.8.11's "bounded APIs").
    static const char* allowed[] =
    {
        "transport.play", "transport.stop", "transport.continue", "transport.setTempo",
        "clip.launch", "clip.stop", "clip.stopAll",
        "scene.launch",
        "setlist.next", "setlist.previous", "setlist.go",
        "performance.state",
        "panic",
    };

    bool known = false;
    for (const auto* name : allowed)
        known = known || action == name;
    if (! known)
        return {};

    // §20 puts "advanced scripting and package development" in Pro. Reading the performance
    // state is deliberately NOT gated: a script that can only look is how somebody decides
    // whether the tier is worth buying, and §26.3's rule against disabling half the keyboard
    // reads the same way here — the refusal is on acting, not on knowing.
    if (action != "performance.state"
        && ! entitlements().allows (licensing::Feature::advancedScripting))
    {
        auto* refused = new juce::DynamicObject();
        refused->setProperty ("ok", false);
        refused->setProperty ("error", licensing::featureRefusal (
            licensing::Feature::advancedScripting, entitlements().edition));
        return juce::var (refused);
    }

    if (action == "performance.state")
        return scriptPerformanceState();

    if (action == "transport.play")        { rack.getEngine().getTransport().start(); }
    else if (action == "transport.stop")   { rack.getEngine().getTransport().stop(); }
    else if (action == "transport.continue") { rack.getEngine().getTransport().continuePlayback(); }
    else if (action == "transport.setTempo")
    {
        const auto tempo = juce::jlimit (20.0, 300.0, (double) payload.getProperty ("tempo", 120.0));
        rack.getEngine().getTransport().setTempo (tempo);
        const_cast<Performance&> (rack.getPerformance()).transport.tempo = tempo;
        savePerformance();
    }
    else if (action == "clip.launch" || action == "clip.stop")
    {
        const auto clipId = payload.getProperty ("clipId", {}).toString();
        const auto index = rack.getPerformance().indexOfClip (clipId);
        const auto* clip = rack.getPerformance().findClip (clipId);
        if (index < 0 || clip == nullptr)
            return {};
        if (action == "clip.launch")
            rack.getEngine().launchClip (index);
        else
            rack.getEngine().stopClip (index, clip->launchQuantize);
    }
    else if (action == "clip.stopAll")
    {
        rack.getEngine().stopAllClips (rack.getPerformance().transport.defaultQuantize);
    }
    else if (action == "scene.launch")
    {
        if (! launchScene (payload.getProperty ("sceneId", {}).toString()))
            return {};
    }
    else if (action == "setlist.next" || action == "setlist.previous" || action == "setlist.go")
    {
        const auto current = rack.getPerformance().setlist.currentIndex;
        const auto index = action == "setlist.go" ? (int) payload.getProperty ("index", 0)
                         : action == "setlist.next" ? current + 1 : current - 1;
        if (! goToSetlistItem (index))
            return {};
    }
    else if (action == "panic")
    {
        rack.panicAll();
    }

    emitState();

    auto* ok = new juce::DynamicObject();
    ok->setProperty ("ok", true);
    return juce::var (ok);
}

// -- project portability, recovery and instance arbitration (Stage 7) -------------------------

InstrumentHostService::RestoreReport InstrumentHostService::lastRestoreReport() const
{
    RestoreReport restoreReport;
    const auto& performance = rack.getPerformance();

    for (const auto& part : performance.parts)
    {
        if (part.hardware || part.pluginCeId.isEmpty() || rack.partHasInstrument (part.partId))
            continue;
        restoreReport.missingInstruments.addIfNotAlreadyThere (
            part.pluginName.isNotEmpty() ? part.pluginName : part.pluginCeId);
    }

    const auto noteMissingEffects = [this, &restoreReport] (const juce::Array<EffectSlot>& chain)
    {
        for (const auto& slot : chain)
            if (slot.pluginCeId.isNotEmpty() && ! rack.effectHasProcessor (slot.effectId))
                restoreReport.missingEffects.addIfNotAlreadyThere (
                    slot.pluginName.isNotEmpty() ? slot.pluginName : slot.pluginCeId);
    };

    for (const auto& part : performance.parts)
        noteMissingEffects (part.effects);
    noteMissingEffects (performance.masterEffects);
    for (const auto& chain : performance.returns)
        noteMissingEffects (chain.effects);

    if (restoreReport.degraded())
        restoreReport.notes.add ("The parts and slots below kept their identity and saved state — "
                                 "install what is missing and reopen to get them back.");

    // Safe startup makes "missing" ambiguous, and the difference is the whole repair: a plug-in
    // that is not installed needs installing, while one this run REFUSED needs a click. Both
    // appear above as unresolved, because that is what the rack sees; only this note can tell
    // them apart, so it names the modules and says which repair applies.
    if (! safeModeRefusals.empty())
    {
        juce::StringArray refused;
        for (const auto& [modulePath, reason] : safeModeRefusals)
            refused.addIfNotAlreadyThere (juce::File (modulePath).getFileNameWithoutExtension());

        restoreReport.notes.add (
            (refused.size() == 1 ? refused[0] + " was not loaded"
                                 : refused.joinIntoString (", ") + " were not loaded")
            + " because safe startup is on. Nothing is missing from this machine — clear the "
              "suspect and reopen the project to load it again.");
    }

    return restoreReport;
}

SafeMode::Level InstrumentHostService::safeModeLevel() const
{
    return safeMode != nullptr ? safeMode->level() : SafeMode::Level::normal;
}

void InstrumentHostService::setSafeModeLevel (SafeMode::Level level)
{
    if (safeMode != nullptr)
        safeMode->setLevel (level);
}

juce::Array<SafeMode::Suspect> InstrumentHostService::safeModeSuspects() const
{
    return safeMode != nullptr ? safeMode->suspects() : juce::Array<SafeMode::Suspect>();
}

void InstrumentHostService::clearSafeModeSuspect (const juce::String& modulePath)
{
    if (safeMode != nullptr)
        safeMode->clearSuspect (modulePath);

    // The refusal record is about this run and stays until a restore actually retries the
    // module. Dropping it here would report a repair that has not happened yet.
}

void InstrumentHostService::clearAllSafeModeSuspects()
{
    if (safeMode != nullptr)
        safeMode->clearAllSuspects();
}

juce::String InstrumentHostService::safeModeRefusal (const juce::String& modulePath) const
{
    return safeMode != nullptr ? safeMode->reasonFor (modulePath) : juce::String();
}

PlatformReport InstrumentHostService::platformReport() const
{
    return checkPlatformSupport (options.dataDirectory);
}

juce::Array<ActiveHostingMarker::Incident> InstrumentHostService::activeHostingIncidents() const
{
    return activeMarker != nullptr ? activeMarker->incidents()
                                   : juce::Array<ActiveHostingMarker::Incident>();
}

juce::var InstrumentHostService::packageIdentity() const
{
    // Which product, and which revision of it, wrote this state. A project that travels to
    // another machine can then say "this was made by X 1.2" rather than failing mutely.
    auto* identity = new juce::DynamicObject();
    identity->setProperty ("packageId",      hostProject.getProperty ("appId", {}).toString());
    identity->setProperty ("packageName",    hostProject.getProperty ("productName", {}).toString());
    identity->setProperty ("packageVersion", hostProject.getProperty ("version", {}).toString());
    identity->setProperty ("schemaVersion",  Performance::currentSchemaVersion);
    return juce::var (identity);
}

SupportBundleContents InstrumentHostService::supportBundleContents() const
{
    SupportBundleContents contents;

    // The generated product's own identity, not CEditor's — a bundle from somebody's shipped
    // instrument has to say which instrument it came from.
    contents.productName    = hostProject.getProperty ("productName", {}).toString();
    contents.productVersion = hostProject.getProperty ("version", {}).toString();
    contents.buildStamp     = hostProject.getProperty ("appId", {}).toString();

    contents.osDescription = juce::SystemStats::getOperatingSystemName()
                               + " (" + juce::SystemStats::getDeviceDescription() + ")";
    contents.architecture  = PluginCatalog::hostArchitecture();

    if (auto* device = const_cast<juce::AudioDeviceManager&> (deviceManager).getCurrentAudioDevice())
        contents.audioDevices.add ("open: " + device->getName()
                                     + " @ " + juce::String (device->getCurrentSampleRate(), 0) + " Hz, "
                                     + juce::String (device->getCurrentBufferSizeSamples()) + " frames");

    if (auto* type = const_cast<juce::AudioDeviceManager&> (deviceManager).getCurrentDeviceTypeObject())
        for (const auto& name : type->getDeviceNames())
            contents.audioDevices.addIfNotAlreadyThere ("seen: " + name);

    for (const auto& input : juce::MidiInput::getAvailableDevices())
        contents.midiInputs.add (input.name);
    for (const auto& output : juce::MidiOutput::getAvailableDevices())
        contents.midiOutputs.add (output.name);

    // Surfaces by profile. The conformance verdict travels with them, because a registry entry
    // is not a claim that the controller works and a bundle implying otherwise would mislead
    // whoever reads it.
    const auto& registry = ctrl49::SurfaceProfileRegistry::instance();
    for (const auto& id : registry.profileIds())
        if (const auto* profile = registry.find (id))
            contents.hardwareSurfaces.add (profile->displayName + " (" + profile->vendor + ")");

    const auto conformance = registry.runConformance();
    for (const auto& line : conformance)
        contents.hardwareSurfaces.add ("conformance: " + line);
    if (conformance.isEmpty() && ! contents.hardwareSurfaces.isEmpty())
        contents.hardwareSurfaces.add ("conformance: every registered profile passed its checks.");

    // These are fixed, internally-owned paths rather than a directory sweep. A similarly named
    // file anywhere else in the product directory is not included.
    for (const auto& log : LiveWorkerDiagnostics::supportFiles (options.dataDirectory))
        contents.logFiles.add (log);

    // Fixed ring slots only: a file merely placed in crash-dumps with a .dmp suffix is not
    // support-bundled, and even these owned files require an explicit export opt-in.
    for (const auto& dump : plugin_worker::PluginWorkerCrashDumps::supportFiles (
             options.dataDirectory))
        contents.crashDumpFiles.add (dump);
    for (const auto& metadata : plugin_worker::PluginWorkerCrashDumps::supportMetadataFiles (
             options.dataDirectory))
        contents.crashDumpMetadataFiles.add (metadata);

    return contents;
}

juce::Array<SupportBundle::Entry>
InstrumentHostService::previewSupportBundle (const SupportBundleOptions& bundleOptions) const
{
    return SupportBundle (options.dataDirectory, supportBundleContents()).preview (bundleOptions);
}

juce::String InstrumentHostService::writeSupportBundle (const juce::File& destination,
                                                        const SupportBundleOptions& bundleOptions) const
{
    return SupportBundle (options.dataDirectory, supportBundleContents())
             .writeTo (destination, bundleOptions);
}

bool InstrumentHostService::ownsHardwareSurface() const
{
    return holdsHardwareSurface;
}

juce::String InstrumentHostService::hardwareSurfaceOwner() const
{
    if (holdsHardwareSurface)
        return "this instance";

    const auto stored = juce::JSON::parse (hardwareOwnerFile().loadFileAsString());
    const auto owner = stored.getProperty ("instanceId", {}).toString();
    if (owner.isEmpty())
        return "nobody";

    // A stale claim is nobody's: an instance that crashed must not hold the surface forever.
    const auto stamp = (juce::int64) stored.getProperty ("heartbeat", 0);
    const auto age = juce::Time::currentTimeMillis() - stamp;
    return age > hardwareClaimTimeoutMs ? "nobody" : "another instance";
}

bool InstrumentHostService::claimHardwareSurface()
{
    if (holdsHardwareSurface)
        return true;

    if (hardwareSurfaceOwner() == "another instance")
        return false;

    options.dataDirectory.createDirectory();
    auto* claim = new juce::DynamicObject();
    claim->setProperty ("instanceId", instanceId);
    claim->setProperty ("heartbeat", juce::Time::currentTimeMillis());
    hardwareOwnerFile().replaceWithText (juce::JSON::toString (juce::var (claim)));

    holdsHardwareSurface = true;
    return true;
}

void InstrumentHostService::releaseHardwareSurface()
{
    if (! holdsHardwareSurface)
        return;

    holdsHardwareSurface = false;

    // Only clear the file if it is still OURS: an instance that took over in the meantime
    // must not have its claim deleted by the one it replaced.
    const auto stored = juce::JSON::parse (hardwareOwnerFile().loadFileAsString());
    if (stored.getProperty ("instanceId", {}).toString() == instanceId)
        hardwareOwnerFile().deleteFile();
}

// -- the generated product's DAW surface (Stage 7) --------------------------------------------

float InstrumentHostService::exposedMacroValue (int index) const
{
    const auto& macros = rack.getPerformance().macros;
    if (! juce::isPositiveAndBelow (index, macros.size()))
        return 0.0f;
    const auto& macro = macros.getReference (index);
    for (const auto& route : rack.getPerformance().modulationRoutes)
        if (route.targetId == macro.macroId && route.parameterId == "@macro")
            return route.baseValue;
    return macro.value;
}

bool InstrumentHostService::setExposedMacroValue (int index, float value)
{
    const auto& macros = rack.getPerformance().macros;
    if (! juce::isPositiveAndBelow (index, macros.size()))
        return false;   // the parameter exists, the macro does not: accepted, does nothing

    auto* macro = rack.findMutableMacro (macros.getReference (index).macroId);
    if (macro == nullptr)
        return false;

    const auto normalized = juce::jlimit (0.0f, 1.0f, value);
    writeTargetBaseValue (macro->macroId, "@macro", normalized);
    if (! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "setMacroValue");
        action->setProperty ("macroId", macro->macroId);
        action->setProperty ("value", normalized);
        recordPerformanceAction (juce::var (action));
    }
    return true;
}

juce::String InstrumentHostService::exposedMacroName (int index) const
{
    const auto& macros = rack.getPerformance().macros;
    // The NAME is stable too: "Macro 3" is parameter 3 forever, and the rack's own name for
    // it rides along only as a suffix a host may or may not show.
    const auto base = "Macro " + juce::String (index + 1);
    if (! juce::isPositiveAndBelow (index, macros.size()))
        return base;

    const auto& name = macros.getReference (index).name;
    return name.isEmpty() ? base : base + " — " + name;
}

int InstrumentHostService::sceneCount() const
{
    return rack.getPerformance().scenes.size();
}

juce::String InstrumentHostService::sceneNameAt (int index) const
{
    const auto& scenes = rack.getPerformance().scenes;
    return juce::isPositiveAndBelow (index, scenes.size()) ? scenes.getReference (index).name
                                                            : juce::String();
}

int InstrumentHostService::selectedSceneIndex() const
{
    return lastSelectedScene;
}

bool InstrumentHostService::selectSceneByIndex (int index)
{
    const auto& scenes = rack.getPerformance().scenes;
    if (! juce::isPositiveAndBelow (index, scenes.size()))
    {
        lastSelectedScene = -1;
        return false;
    }

    lastSelectedScene = index;
    const auto sceneId = scenes.getReference (index).sceneId;
    const auto launched = launchScene (sceneId);
    if (launched && ! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "launchScene");
        action->setProperty ("sceneId", sceneId);
        recordPerformanceAction (juce::var (action));
    }
    return launched;
}

float InstrumentHostService::masterLevel() const
{
    return rack.getPerformance().masterLevel;
}

void InstrumentHostService::setMasterLevel (float level)
{
    rack.setMasterLevel (level);
    if (! handlingCommand)
    {
        auto* action = new juce::DynamicObject();
        action->setProperty ("cmd", "setMasterLevel");
        action->setProperty ("level", rack.getPerformance().masterLevel);
        recordPerformanceAction (juce::var (action));
    }
}

int InstrumentHostService::reportedLatencySamples() const
{
    // The DAW compensates one number for the whole instance, and the graph is the only thing
    // that knows what that number is: it builds the render sequence, it inserts the
    // compensation delays, and it costs what it costs.
    //
    // This used to be a sum walked over the parts and the master chain, which is short
    // whenever a RETURN carries the longest path — a reverb return with a lookahead limiter
    // on it costs its samples even when every part chain is empty. The DAW was then told a
    // number smaller than the truth, which puts the whole instance early against every other
    // track in the project: not a subtle bug, and invisible from inside the app.
    if (const auto measured = rack.graphLatencySamples(); measured > 0)
        return measured;

    // Nothing prepared yet — the editor before an audio device opens, or a fresh instance
    // being asked what it will report. There is no render sequence to measure, so fall back
    // to the sum. It is right whenever no return is the longest path, and it is only ever
    // read for display: the wrapper asks again once the DAW has prepared it.
    int worst = 0;
    for (const auto& part : rack.getPerformance().parts)
        worst = juce::jmax (worst, rack.partLatencySamples (part.partId));
    return worst + rack.masterLatencySamples();
}

double InstrumentHostService::tailLengthSeconds() const
{
    return rack.tailLengthSeconds();
}

int InstrumentHostService::outputPairCount() const
{
    return rack.getPerformance().outputPairs;
}

void InstrumentHostService::setOfflineRender (bool offline)
{
    if (offline == offlineRender)
        return;

    offlineRender = offline;

    // A bounce renders faster than real time and must not push notes at hardware that is not
    // part of it; the ports come back when the render ends.
    for (const auto& part : rack.getPerformance().parts)
    {
        if (! part.hardware)
            continue;

        if (offline)
            rack.setHardwareMidiSink (part.partId, {});
        else
            openHardwareMidi (part.partId);
    }
}

juce::var InstrumentHostService::productPayload() const
{
    // Everything Stage 7 added, in one block: what the DAW sees, what this instance owns,
    // whether the platform actually supports us, and the evidence log §18.9.8 asks for.
    const auto& performance = rack.getPerformance();
    const auto& transport = rack.getEngine().getTransport();

    auto* daw = new juce::DynamicObject();
    daw->setProperty ("hostSync",        transport.isHostSyncEnabled());
    daw->setProperty ("followingHost",   transport.hasHostPosition());
    daw->setProperty ("offlineRender",   offlineRender);
    daw->setProperty ("latencySamples",  reportedLatencySamples());
    daw->setProperty ("tailSeconds",     tailLengthSeconds());
    daw->setProperty ("outputPairs",     performance.outputPairs);
    daw->setProperty ("masterLevel",     performance.masterLevel);

    juce::Array<juce::var> exposed;
    for (int i = 0; i < exposedMacroCount; ++i)
    {
        auto* row = new juce::DynamicObject();
        row->setProperty ("index", i);
        row->setProperty ("name",  exposedMacroName (i));
        row->setProperty ("value", exposedMacroValue (i));
        row->setProperty ("bound", i < performance.macros.size());
        exposed.add (juce::var (row));
    }
    daw->setProperty ("exposedMacros", exposed);

    const auto report = lastRestoreReport();
    juce::Array<juce::var> missingInstruments, missingEffects, notes;
    for (const auto& name : report.missingInstruments) missingInstruments.add (name);
    for (const auto& name : report.missingEffects)     missingEffects.add (name);
    for (const auto& note : report.notes)              notes.add (note);

    auto* restore = new juce::DynamicObject();
    restore->setProperty ("degraded",           report.degraded());
    restore->setProperty ("missingInstruments", missingInstruments);
    restore->setProperty ("missingEffects",     missingEffects);
    restore->setProperty ("notes",              notes);

    const auto platform = platformReport();
    juce::Array<juce::var> rows;
    for (const auto& row : platform.rows)
    {
        auto* r = new juce::DynamicObject();
        r->setProperty ("id",          row.id);
        r->setProperty ("description", row.description);
        r->setProperty ("required",    row.required);
        r->setProperty ("present",     row.present);
        r->setProperty ("detail",      row.detail);
        rows.add (juce::var (r));
    }

    auto* platformObj = new juce::DynamicObject();
    platformObj->setProperty ("name",      platform.platformName);
    platformObj->setProperty ("supported", platform.supported());
    platformObj->setProperty ("rows",      rows);

    juce::Array<juce::var> incidents;
    for (const auto& incident : activeHostingIncidents())
    {
        auto* i = new juce::DynamicObject();
        i->setProperty ("modulePath", incident.modulePath);
        i->setProperty ("name",       incident.name);
        i->setProperty ("count",      incident.count);
        incidents.add (juce::var (i));
    }

    auto* hardware = new juce::DynamicObject();
    hardware->setProperty ("owner",    hardwareSurfaceOwner());
    hardware->setProperty ("owned",    ownsHardwareSurface());

    auto* root = new juce::DynamicObject();
    root->setProperty ("daw",       juce::var (daw));
    root->setProperty ("restore",   juce::var (restore));
    root->setProperty ("platform",  juce::var (platformObj));
    root->setProperty ("hardware",  juce::var (hardware));
    root->setProperty ("activeHostingIncidents", incidents);
    root->setProperty ("surfaceProfiles", [] {
        juce::Array<juce::var> ids;
        for (const auto& id : ctrl49::SurfaceProfileRegistry::instance().profileIds())
            ids.add (id);
        return ids;
    }());
    return juce::var (root);
}

juce::var InstrumentHostService::reliabilityPayload() const
{
    juce::Array<juce::var> suspects;
    for (const auto& suspect : safeModeSuspects())
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("modulePath", suspect.modulePath);
        obj->setProperty ("name",       suspect.name);
        obj->setProperty ("reason",     suspect.reason);
        obj->setProperty ("incidents",  suspect.incidents);
        suspects.add (juce::var (obj));
    }

    auto* safe = new juce::DynamicObject();
    safe->setProperty ("level",    SafeMode::levelName (safeModeLevel()));
    safe->setProperty ("suspects", suspects);

    // What this run actually refused, as opposed to what it would refuse. Clearing a suspect
    // does not empty this list: the module is not loaded until a restore retries it, and a UI
    // that cleared the row on the click would be claiming a repair that has not happened.
    juce::Array<juce::var> refused;
    for (const auto& [modulePath, reason] : safeModeRefusals)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("modulePath", modulePath);
        obj->setProperty ("name",       juce::File (modulePath).getFileNameWithoutExtension());
        obj->setProperty ("reason",     reason);
        refused.add (juce::var (obj));
    }

    const auto report = recoveryReport();
    auto* recoveryObj = new juce::DynamicObject();
    recoveryObj->setProperty ("interrupted",         report.interrupted);
    recoveryObj->setProperty ("lastOperation",       report.lastOperation);
    recoveryObj->setProperty ("lastOperationDetail", report.lastOperationDetail);
    recoveryObj->setProperty ("preservedStateFile",  report.preservedStateFile);
    recoveryObj->setProperty ("hasLastKnownGood",    report.hasLastKnownGood);
    recoveryObj->setProperty ("lastKnownGoodAt",     report.lastKnownGoodAt);

    juce::Array<juce::var> damaged;
    for (const auto& note : stateDigestMismatches)
        damaged.add (note);

    const auto& failoverSettings = rack.getPerformance().automaticFailover;
    auto* automaticFailover = new juce::DynamicObject();
    automaticFailover->setProperty ("isolationAvailable", options.livePluginIsolationAvailable);
    automaticFailover->setProperty ("enabled",      failoverSettings.enabled);
    automaticFailover->setProperty ("maxAttempts",  failoverSettings.maxAttempts);
    automaticFailover->setProperty ("retryDelayMs", failoverSettings.retryDelayMs);

    const auto now = juce::Time::getMillisecondCounterHiRes();
    juce::Array<juce::var> failoverEvents;
    for (const auto& [targetId, runtime] : failovers)
    {
        auto* event = new juce::DynamicObject();
        event->setProperty ("targetId",      targetId);
        event->setProperty ("name",          runtime.name);
        event->setProperty ("effect",        runtime.effect);
        event->setProperty ("state",         runtime.state);
        event->setProperty ("attempts",      runtime.attempts);
        event->setProperty ("error",         runtime.error);
        event->setProperty ("nextAttemptMs", runtime.state == "waiting"
                                                   ? juce::jmax (0.0, runtime.nextAttemptMs - now)
                                                   : 0.0);
        failoverEvents.add (juce::var (event));
    }
    automaticFailover->setProperty ("events", failoverEvents);

    auto* root = new juce::DynamicObject();
    root->setProperty ("safeMode",       juce::var (safe));
    root->setProperty ("refusedThisRun", refused);
    root->setProperty ("recovery",       juce::var (recoveryObj));
    root->setProperty ("damagedState",   damaged);
    root->setProperty ("automaticFailover", juce::var (automaticFailover));
    return juce::var (root);
}

// -- licensing (§19 "Trust", §20, §26.2, §27) -------------------------------------------------

void InstrumentHostService::ensureLicence()
{
    if (licence != nullptr)
        return;

    ensureHostProject();

    // The vendor's public key travels in the Host Project manifest, so a generated instrument
    // verifies licences issued for ITSELF and not for some other product built from the same
    // editor. A manifest with no key produces a store that can verify nothing and says so —
    // which is the honest outcome for a build nobody has set up to be sold.
    licence = std::make_unique<licensing::LicenceStore> (
        options.dataDirectory,
        hostProject.getProperty ("licencePublicKey", {}).toString(),
        hostProject.getProperty ("appId", {}).toString());
}

licensing::LicenceStatus InstrumentHostService::licenceStatus()
{
    ensureLicence();
    return licence->status();
}

licensing::Entitlements InstrumentHostService::entitlements()
{
    ensureLicence();
    return licence->entitlements();
}

juce::String InstrumentHostService::installLicence (const juce::String& licenceFileText)
{
    ensureLicence();
    return licence->install (licenceFileText);
}

void InstrumentHostService::removeLicence()
{
    ensureLicence();
    licence->remove();
}

juce::String InstrumentHostService::activateLicenceHere()
{
    ensureLicence();
    return licence->activateHere();
}

juce::String InstrumentHostService::deactivateLicenceHere()
{
    ensureLicence();
    return licence->deactivateHere();
}

juce::Array<licensing::LicenceStore::Activation> InstrumentHostService::licenceActivations()
{
    ensureLicence();
    return licence->activations();
}

bool InstrumentHostService::requireFeature (licensing::Feature feature)
{
    const auto allowed = entitlements();
    if (allowed.allows (feature))
        return true;

    emitError (licensing::featureRefusal (feature, allowed.edition));
    return false;
}

int InstrumentHostService::loadedPartCount() const
{
    int loaded = 0;
    for (const auto& part : rack.getPerformance().parts)
        if (rack.partHasInstrument (part.partId))
            ++loaded;
    return loaded;
}

juce::var InstrumentHostService::licencePayload()
{
    ensureLicence();

    const auto status = licence->status();
    const auto allowed = licence->entitlements();

    juce::Array<juce::var> seats;
    for (const auto& activation : licence->activations())
    {
        auto* obj = new juce::DynamicObject();
        // The fingerprint is a digest already; only its head is shown, because a person
        // identifying their own machine needs a few characters, not all of them.
        obj->setProperty ("fingerprint",   activation.fingerprint.substring (0, 8));
        obj->setProperty ("machineName",   activation.machineName);
        obj->setProperty ("firstSeen",     activation.firstSeen);
        obj->setProperty ("lastSeen",      activation.lastSeen);
        obj->setProperty ("isThisMachine", activation.isThisMachine);
        seats.add (juce::var (obj));
    }

    juce::Array<juce::var> gated;
    for (auto feature : { licensing::Feature::patternEngine, licensing::Feature::scenesAndSetlists,
                          licensing::Feature::advancedRouting, licensing::Feature::advancedScripting })
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("feature", licensing::featureName (feature));
        obj->setProperty ("allowed", allowed.allows (feature));
        gated.add (juce::var (obj));
    }

    juce::Array<juce::var> unconditional;
    for (const auto& capability : licensing::neverGated())
        unconditional.add (capability);

    auto* root = new juce::DynamicObject();
    root->setProperty ("edition",        licensing::editionName (allowed.edition));
    root->setProperty ("editionLabel",   allowed.label());
    root->setProperty ("state",          [&status]() -> juce::String
    {
        switch (status.state)
        {
            case licensing::LicenceStatus::State::licensed:       return "licensed";
            case licensing::LicenceStatus::State::updatesExpired: return "updatesExpired";
            case licensing::LicenceStatus::State::sunsetUnlocked: return "sunsetUnlocked";
            case licensing::LicenceStatus::State::wrongProduct:   return "wrongProduct";
            case licensing::LicenceStatus::State::tampered:       return "tampered";
            case licensing::LicenceStatus::State::unlicensed:     break;
        }
        return "unlicensed";
    }());
    root->setProperty ("detail",         status.detail);
    root->setProperty ("licensee",       status.verified() ? status.document.licensee : juce::String());
    root->setProperty ("orderId",        status.verified() ? status.document.orderId : juce::String());
    root->setProperty ("updatesUntil",   status.verified() ? status.document.updatesUntil : juce::String());
    root->setProperty ("updatesIncluded", status.updatesIncluded());
    // A constant, and it is in the payload precisely so the panel can state it: §27 says an
    // expired entitlement must never disable the application, and a person looking at a lapsed
    // licence deserves to read that rather than infer it.
    root->setProperty ("runnable",       licensing::LicenceStatus::runnable());
    root->setProperty ("maxLoadedParts", allowed.maxLoadedParts);
    root->setProperty ("loadedParts",    loadedPartCount());
    root->setProperty ("seatsAllowed",   licence->seatsAllowed());
    root->setProperty ("seatsUsed",      licence->seatsUsed());
    root->setProperty ("activatedHere",  licence->activatedHere());
    root->setProperty ("seats",          seats);
    root->setProperty ("features",       gated);
    root->setProperty ("neverGated",     unconditional);
    return juce::var (root);
}

juce::var InstrumentHostService::performancePayload() const
{
    const auto& performance = rack.getPerformance();
    const auto& engine = rack.getEngine();
    const auto& transport = engine.getTransport();

    int bar = 0, beat = 0;
    double fraction = 0.0;
    transport.positionInBarsBeats (bar, beat, fraction);

    auto* transportObj = new juce::DynamicObject();
    transportObj->setProperty ("playing",       transport.isPlayingOrPending());
    transportObj->setProperty ("tempo",         transport.getTempo());
    transportObj->setProperty ("numerator",     transport.getTimeSignatureNumerator());
    transportObj->setProperty ("denominator",   transport.getTimeSignatureDenominator());
    transportObj->setProperty ("positionPpq",   transport.getPositionPpq());
    transportObj->setProperty ("bar",           bar);
    transportObj->setProperty ("beat",          beat);
    transportObj->setProperty ("beatFraction",  fraction);
    transportObj->setProperty ("externalClock", transport.isExternalClockEnabled());
    transportObj->setProperty ("clockLost",     transport.hasLostExternalClock());
    transportObj->setProperty ("defaultQuantize", perf::quantizeName (performance.transport.defaultQuantize));

    juce::Array<juce::var> patterns;
    for (const auto& pattern : performance.patterns)
    {
        juce::Array<juce::var> lanes;
        for (const auto& lane : pattern.lanes)
        {
            juce::Array<juce::var> steps;
            for (const auto& step : lane.steps)
            {
                auto* s = new juce::DynamicObject();
                s->setProperty ("active",      step.active);
                s->setProperty ("note",        step.note);
                s->setProperty ("velocity",    step.velocity);
                s->setProperty ("value",       step.value);
                s->setProperty ("gate",        step.gate);
                s->setProperty ("microtiming", step.microtiming);
                s->setProperty ("probability", step.probability);
                s->setProperty ("ratchets",    step.ratchets);
                s->setProperty ("tie",         step.tie);
                if (! step.chordNotes.isEmpty())
                {
                    juce::Array<juce::var> chordNotes;
                    for (const auto note : step.chordNotes)
                        chordNotes.add (note);
                    s->setProperty ("chordNotes", chordNotes);
                }
                s->setProperty ("every",       step.conditionEvery);
                s->setProperty ("offset",      step.conditionOffset);
                steps.add (juce::var (s));
            }

            // An automation lane says whether its address still resolves, exactly as a page
            // slot and a macro target do.
            const bool isParameterLane = lane.type == perf::LaneType::parameter;
            const bool resolved = isParameterLane
                                    ? (targetClassCeId (lane.targetId) == lane.targetCeId
                                        || isVirtualParameterId (lane.parameterId))
                                      && const_cast<InstrumentHostService*> (this)
                                           ->targetParameterExists (lane.targetId, lane.parameterId)
                                    : rack.getPerformance().findPart (lane.targetPartId) != nullptr;

            auto* l = new juce::DynamicObject();
            l->setProperty ("laneId",       lane.laneId);
            l->setProperty ("type",         perf::laneTypeName (lane.type));
            l->setProperty ("name",         lane.name);
            l->setProperty ("targetPartId", lane.targetPartId);
            l->setProperty ("targetId",     lane.targetId);
            l->setProperty ("parameterId",  lane.parameterId);
            l->setProperty ("targetName",   isParameterLane ? targetDisplayName (lane.targetId)
                                                            : targetDisplayName (lane.targetPartId));
            l->setProperty ("resolved",     resolved);
            l->setProperty ("channel",      lane.channel);
            l->setProperty ("ccNumber",     lane.ccNumber);
            l->setProperty ("drumNote",     lane.drumNote);
            l->setProperty ("stepCount",    lane.stepCount);
            l->setProperty ("stepsPerBeat", lane.stepsPerBeat);
            l->setProperty ("muted",        lane.muted);
            l->setProperty ("glide",        lane.glide);
            l->setProperty ("lockSourceLaneId", lane.lockSourceLaneId);
            l->setProperty ("euclidPulses", lane.euclidPulses);
            l->setProperty ("steps",        steps);
            lanes.add (juce::var (l));
        }

        auto* p = new juce::DynamicObject();
        p->setProperty ("patternId", pattern.patternId);
        p->setProperty ("name",      pattern.name);
        p->setProperty ("swing",     pattern.swing);
        p->setProperty ("seed",      (int) pattern.seed);
        p->setProperty ("lengthPpq", pattern.lengthPpq());
        p->setProperty ("variationGroupId", pattern.variationGroupId);
        p->setProperty ("variationLabel", pattern.variationLabel);
        p->setProperty ("variationSourcePatternId", pattern.variationSourcePatternId);
        p->setProperty ("variationAmount", pattern.variationAmount);
        p->setProperty ("appliedGrooveId", pattern.appliedGrooveId);
        p->setProperty ("appliedGrooveAmount", pattern.appliedGrooveAmount);
        p->setProperty ("lanes",     lanes);
        patterns.add (juce::var (p));
    }

    juce::Array<juce::var> grooves;
    for (const auto& groove : performance.grooves)
        grooves.add (perf::grooveTemplateToVar (groove));

    juce::Array<juce::var> clips;
    for (int i = 0; i < performance.clips.size(); ++i)
    {
        const auto& clip = performance.clips.getReference (i);
        auto* c = new juce::DynamicObject();
        c->setProperty ("clipId",           clip.clipId);
        c->setProperty ("name",             clip.name);
        c->setProperty ("patternId",        clip.patternId);
        c->setProperty ("launchQuantize",   perf::quantizeName (clip.launchQuantize));
        c->setProperty ("loop",             clip.loop);
        c->setProperty ("followClipId",     clip.followClipId);
        c->setProperty ("followAfterLoops", clip.followAfterLoops);
        c->setProperty ("followAction",     clip.followAction);
        c->setProperty ("looperLayer",      clip.looperLayer);
        c->setProperty ("overdubPasses",    clip.overdubPasses);
        c->setProperty ("gestureClip",      clip.gestureClip);
        c->setProperty ("gesturePasses",    clip.gesturePasses);
        c->setProperty ("frozenMidi",       clip.frozenMidi);
        c->setProperty ("frozenFromClipId", clip.frozenFromClipId);
        c->setProperty ("frozenCycles",     clip.frozenCycles);
        c->setProperty ("frozenNoteCount",  clip.frozenNoteCount);
        c->setProperty ("fillPatternId",    clip.fillPatternId);
        c->setProperty ("fillQuantize",     perf::quantizeName (clip.fillQuantize));
        c->setProperty ("fillCc",           clip.fillCc);
        c->setProperty ("fillChannel",      clip.fillChannel);
        c->setProperty ("fillActive",       engine.isClipFillActive (i));
        c->setProperty ("fillPending",      engine.isClipFillPending (i));
        c->setProperty ("active",           engine.isClipActive (i));
        c->setProperty ("pending",          engine.isClipPending (i));
        c->setProperty ("phase",            engine.clipPhase (i));
        clips.add (juce::var (c));
    }

    juce::Array<juce::var> scenes;
    for (const auto& scene : performance.scenes)
    {
        juce::Array<juce::var> clipIds;
        for (const auto& clipId : scene.clipIds)
            clipIds.add (clipId);

        auto* s = new juce::DynamicObject();
        s->setProperty ("sceneId",        scene.sceneId);
        s->setProperty ("name",           scene.name);
        s->setProperty ("clipIds",        clipIds);
        s->setProperty ("focusPartId",    scene.focusPartId);
        s->setProperty ("pageId",         scene.pageId);
        s->setProperty ("launchQuantize", perf::quantizeName (scene.launchQuantize));
        s->setProperty ("stopOtherClips", scene.stopOtherClips);
        s->setProperty ("tempo",          scene.tempo);
        s->setProperty ("morphBeats",     scene.morphBeats);
        s->setProperty ("numSlots",       scene.slots.size());
        s->setProperty ("numMacros",      scene.macros.size());
        s->setProperty ("numParameters",  scene.parameters.size());
        scenes.add (juce::var (s));
    }

    auto* snapshotMorph = new juce::DynamicObject();
    snapshotMorph->setProperty ("active",        sceneMorph.active);
    snapshotMorph->setProperty ("sceneId",       sceneMorph.sceneId);
    snapshotMorph->setProperty ("name",          sceneMorph.name);
    snapshotMorph->setProperty ("durationBeats", sceneMorph.durationBeats);
    snapshotMorph->setProperty ("progress",      sceneMorph.progress);
    snapshotMorph->setProperty ("targetCount",   sceneMorph.targets.size());

    juce::Array<juce::var> setlistItems;
    for (const auto& item : performance.setlist.items)
    {
        const auto* scene = item.rackRecordId.isEmpty() ? performance.findScene (item.sceneId)
                                                        : nullptr;
        auto* i = new juce::DynamicObject();
        i->setProperty ("itemId",    item.itemId);
        i->setProperty ("name",      item.name);
        i->setProperty ("sceneId",   item.sceneId);
        i->setProperty ("rackRecordId", item.rackRecordId);
        i->setProperty ("pageId",       item.pageId);
        i->setProperty ("sceneName", scene != nullptr ? scene->name
                                                        : item.rackRecordId.isNotEmpty()
                                                            ? juce::String ("Full rack")
                                                            : juce::String());
        i->setProperty ("missing",   item.rackRecordId.isEmpty()
                                         && item.sceneId.isNotEmpty() && scene == nullptr);
        i->setProperty ("notes",     item.notes);
        i->setProperty ("tempo",     item.tempo);
        setlistItems.add (juce::var (i));
    }

    auto* setlistObj = new juce::DynamicObject();
    setlistObj->setProperty ("items",        setlistItems);
    setlistObj->setProperty ("currentIndex", performance.setlist.currentIndex);
    setlistObj->setProperty ("preloadAhead", performance.setlist.preloadAhead);
    setlistObj->setProperty ("loadingIndex", pendingSetlistRecall.active
                                               ? pendingSetlistRecall.index : -1);
    juce::Array<juce::var> preloads;
    for (const auto& [recordId, warm] : setlistPreloads)
    {
        auto* p = new juce::DynamicObject();
        p->setProperty ("recordId", recordId);
        p->setProperty ("name", warm.name);
        p->setProperty ("total", warm.total);
        p->setProperty ("ready", warm.ready);
        p->setProperty ("failed", warm.failed);
        p->setProperty ("error", warm.error);
        p->setProperty ("state", warm.failed > 0 && warm.ready + warm.failed >= warm.total
                                    ? "degraded"
                                    : warm.ready + warm.failed >= warm.total ? "ready" : "loading");
        preloads.add (juce::var (p));
    }
    setlistObj->setProperty ("preloads", preloads);

    juce::Array<juce::var> arrangementItems;
    for (const auto& item : performance.arrangement.items)
    {
        const auto* scene = performance.findScene (item.sceneId);
        auto* i = new juce::DynamicObject();
        i->setProperty ("itemId",    item.itemId);
        i->setProperty ("name",      item.name);
        i->setProperty ("sceneId",   item.sceneId);
        i->setProperty ("sceneName", scene != nullptr ? scene->name : juce::String());
        i->setProperty ("missing",   scene == nullptr);
        i->setProperty ("bars",      item.bars);
        arrangementItems.add (juce::var (i));
    }

    auto* arrangementObj = new juce::DynamicObject();
    arrangementObj->setProperty ("items",        arrangementItems);
    arrangementObj->setProperty ("loop",         performance.arrangement.loop);
    arrangementObj->setProperty ("playing",      arrangementPlaying);
    arrangementObj->setProperty ("currentIndex", arrangementCurrentIndex);
    arrangementObj->setProperty ("queuedIndex",  arrangementQueuedIndex);
    arrangementObj->setProperty ("ending",       arrangementStopAtPpq >= 0.0);
    auto arrangementProgress = 0.0;
    auto arrangementBar = 0;
    if (arrangementPlaying
        && juce::isPositiveAndBelow (arrangementCurrentIndex,
                                     performance.arrangement.items.size()))
    {
        const auto length = (double) performance.arrangement.items
                              .getReference (arrangementCurrentIndex).bars
                            * transport.barLengthPpq();
        const auto elapsed = juce::jmax (0.0, transport.getPositionPpq()
                                               - arrangementItemStartPpq);
        arrangementProgress = length > 0.0 ? juce::jlimit (0.0, 1.0, elapsed / length) : 0.0;
        arrangementBar = juce::jlimit (1, performance.arrangement.items
                                            .getReference (arrangementCurrentIndex).bars,
                                       1 + (int) std::floor (elapsed / transport.barLengthPpq()));
    }
    arrangementObj->setProperty ("progress", arrangementProgress);
    arrangementObj->setProperty ("bar",      arrangementBar);

    auto* capture = new juce::DynamicObject();
    capture->setProperty ("armed",  engine.isCapturing());
    capture->setProperty ("clipId", captureClipId);
    capture->setProperty ("laneId", captureLaneId);
    capture->setProperty ("historySeconds", engine.midiHistorySecondsAvailable());
    capture->setProperty ("historyEvents", engine.midiHistoryEventCount());
    capture->setProperty ("historyHasNotes", engine.hasRecentMidiNotes (
                                                    perf::MidiCaptureJournal::maxHistorySeconds));
    capture->setProperty ("historyCapacitySeconds", perf::MidiCaptureJournal::maxHistorySeconds);
    capture->setProperty ("lastPatternId", lastRetrospectivePatternId);
    capture->setProperty ("lastClipId", lastRetrospectiveClipId);
    capture->setProperty ("lastNoteCount", lastRetrospectiveNoteCount);
    capture->setProperty ("lastStepCount", lastRetrospectiveStepCount);
    capture->setProperty ("lastSeconds", lastRetrospectiveSeconds);
    capture->setProperty ("lastTrimmed", lastRetrospectiveTrimmed);

    auto* looper = new juce::DynamicObject();
    looper->setProperty ("recording", midiLoopRecording);
    looper->setProperty ("overdubbing", midiLoopOverdub);
    looper->setProperty ("targetClipId", midiLoopTargetClipId);
    looper->setProperty ("maxLengthBeats", 128);
    const auto historyRate = engine.midiHistorySampleRate();
    looper->setProperty ("elapsedSeconds",
                         midiLoopRecording && historyRate > 0.0
                           ? (double) (engine.midiHistorySamplePosition() - midiLoopStartSample)
                               / historyRate
                           : 0.0);

    int gestureTargetCount = 0;
    juce::StringArray gestureTargets;
    for (const auto& point : gesturePoints)
    {
        const auto address = point.targetId + "\n" + point.parameterId;
        if (! gestureTargets.contains (address))
        {
            gestureTargets.add (address);
            ++gestureTargetCount;
        }
    }
    auto* gestures = new juce::DynamicObject();
    gestures->setProperty ("recording", gestureRecording);
    gestures->setProperty ("mode", gestureTargetClipId.isEmpty() ? "new"
                                            : gestureReplace ? "replace" : "overdub");
    gestures->setProperty ("targetClipId", gestureTargetClipId);
    gestures->setProperty ("pointCount", (int) gesturePoints.size());
    gestures->setProperty ("targetCount", gestureTargetCount);
    gestures->setProperty ("truncated", gestureTruncated);
    gestures->setProperty ("maxPoints", (int) maxGesturePoints);
    gestures->setProperty ("lastClipId", lastGestureClipId);
    gestures->setProperty ("elapsedSeconds",
                           gestureRecording && historyRate > 0.0
                             ? (double) (engine.midiHistorySamplePosition() - gestureStartSample)
                                 / historyRate
                             : 0.0);

    juce::Array<juce::var> performanceTakes;
    for (const auto& take : performance.performanceTakes)
    {
        auto* t = new juce::DynamicObject();
        t->setProperty ("takeId", take.takeId);
        t->setProperty ("name", take.name);
        t->setProperty ("createdAt", take.createdAt);
        t->setProperty ("durationSeconds", take.sampleRate > 0.0
            ? (double) take.durationSamples / take.sampleRate : 0.0);
        t->setProperty ("midiEventCount", take.midiEventCount);
        t->setProperty ("actionCount", take.actions.size());
        t->setProperty ("truncated", take.truncated);
        performanceTakes.add (juce::var (t));
    }

    auto* recorder = new juce::DynamicObject();
    recorder->setProperty ("recording", performanceRecording);
    recorder->setProperty ("name", performanceRecordingTake.name);
    recorder->setProperty ("midiEventCount", (int) performanceRecordingMidi.size());
    recorder->setProperty ("actionCount", performanceRecordingTake.actions.size());
    recorder->setProperty ("truncated", performanceRecordingTake.truncated);
    recorder->setProperty ("elapsedSeconds",
        performanceRecording && historyRate > 0.0
          ? (double) (engine.midiHistorySamplePosition() - performanceRecordingStartSample)
              / historyRate
          : 0.0);

    auto* replay = new juce::DynamicObject();
    replay->setProperty ("state", performanceReplay.state == PerformanceReplayRuntime::State::restoring
                                   ? "restoring"
                                   : performanceReplay.state == PerformanceReplayRuntime::State::playing
                                       ? "playing" : "idle");
    replay->setProperty ("takeId", performanceReplay.take.takeId);
    replay->setProperty ("name", performanceReplay.take.name);
    replay->setProperty ("progress", performanceReplay.progress);
    replay->setProperty ("degraded", performanceReplay.degraded);

    auto* root = new juce::DynamicObject();
    root->setProperty ("transport", juce::var (transportObj));
    root->setProperty ("grooves",    grooves);
    root->setProperty ("patterns",  patterns);
    root->setProperty ("clips",     clips);
    root->setProperty ("scenes",    scenes);
    root->setProperty ("snapshotMorph", juce::var (snapshotMorph));
    root->setProperty ("setlist",   juce::var (setlistObj));
    root->setProperty ("arrangement", juce::var (arrangementObj));
    root->setProperty ("capture",   juce::var (capture));
    root->setProperty ("looper",    juce::var (looper));
    root->setProperty ("gestures",  juce::var (gestures));
    root->setProperty ("performanceTakes", performanceTakes);
    root->setProperty ("performanceRecorder", juce::var (recorder));
    root->setProperty ("performanceReplay", juce::var (replay));
    root->setProperty ("scales",    [] {
        juce::Array<juce::var> names;
        for (const auto& name : perf::scaleNames())
            names.add (name);
        return names;
    }());
    return juce::var (root);
}

void InstrumentHostService::savePerformance()
{
    if (! options.persistSession)
        return;

    maybeSnapshotRevision();
    performanceFile().replaceWithText (juce::JSON::toString (rack.captureState().toVar()));
}

void InstrumentHostService::maybeSnapshotRevision()
{
    // Every mutation saves, so the revisions cannot be one-per-save — they would be a
    // keystroke log. Instead the current file is copied aside when the newest copy is older
    // than the interval: what survives is a trail of rigs minutes apart, not edits.
    constexpr double snapshotIntervalMinutes = 10.0;
    constexpr int maxRevisions = 12;

    const auto current = performanceFile();
    if (! current.existsAsFile())
        return;

    const auto directory = revisionsDirectory();
    directory.createDirectory();

    juce::Array<juce::File> revisions = directory.findChildFiles (juce::File::findFiles, false, "*.json");
    revisions.sort();   // ISO-stamped names sort chronologically

    if (! revisions.isEmpty())
    {
        const auto newest = revisions.getLast().getLastModificationTime();
        if ((juce::Time::getCurrentTime() - newest).inMinutes() < snapshotIntervalMinutes)
            return;
    }

    // Milliseconds keep snapshots in the same second apart, and the sibling bump covers even
    // the same millisecond — rare live, routine when tests replay a day in a few hundred ms.
    const auto now = juce::Time::getCurrentTime();
    const auto stamp = now.formatted ("%Y%m%d-%H%M%S")
                         + "-" + juce::String (now.getMilliseconds()).paddedLeft ('0', 3);
    current.copyFileTo (directory.getChildFile ("session-" + stamp + ".json")
                            .getNonexistentSibling());

    revisions = directory.findChildFiles (juce::File::findFiles, false, "*.json");
    revisions.sort();
    while (revisions.size() > maxRevisions)
    {
        revisions.getFirst().deleteFile();
        revisions.remove (0);
    }
}

void InstrumentHostService::saveScanPaths()
{
    juce::Array<juce::var> paths;
    for (const auto& p : userScanPaths)
        paths.add (p);

    auto* root = new juce::DynamicObject();
    root->setProperty ("paths", paths);
    scanPathsFile().replaceWithText (juce::JSON::toString (juce::var (root)));
}

} // namespace ceditor::host
