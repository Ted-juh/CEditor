#include "InstrumentHostService.h"

#include <algorithm>
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
        partParameters.erase (partId);
        if (partId == editorTargetId)
            hideEditor();
    };
}

InstrumentHostService::~InstrumentHostService()
{
    // Hand the hardware back on the way out: a claim outliving its owner is what the heartbeat
    // timeout exists to recover from, not the normal path.
    releaseHardwareSurface();
    stopAudio();
    *alive = false;
    stopRequested.store (true);
    if (scanThread.joinable())
        scanThread.join();
}

void InstrumentHostService::handleCommand (const juce::var& payload)
{
    const auto cmd = payload.getProperty ("cmd", {}).toString();

    if (cmd == "getState")
    {
        if (! sessionRestored)
            restoreSession();
        emitState();
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
        if (! rack.removePart (payload.getProperty ("partId", {}).toString()))
        {
            emitError ("Unknown rack part.");
            return;
        }
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
        const bool on = (bool) payload.getProperty ("on", true);

        auto message = on ? juce::MidiMessage::noteOn (1, note, (juce::uint8) velocity)
                          : juce::MidiMessage::noteOff (1, note);
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
            if (fields->hasProperty ("volume"))  rack.setVolume  (partId, (float) (double) payload["volume"]);
            if (fields->hasProperty ("pan"))     rack.setPan     (partId, (float) (double) payload["pan"]);
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

        auto* root = new juce::DynamicObject();
        root->setProperty ("partId", partId);
        root->setProperty ("parameters", parameters);
        root->setProperty ("warnings", warnings);
        if (options.emit != nullptr)
            options.emit ("instrumentHostParameters", juce::var (root));
        return;
    }

    if (cmd == "setParameter" || cmd == "resetParameter"
        || cmd == "beginParameterGesture" || cmd == "endParameterGesture")
    {
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto id = payload.getProperty ("id", {}).toString();

        if (isVirtualParameterId (id))
        {
            if (! virtualParameterExists (partId, id))
            {
                emitError ("Unknown parameter " + id + " on that part.");
                return;
            }

            // Gestures are accepted and mean nothing here — a mixer value has no plug-in
            // host to notify. Writes persist because the value lives in the manifest.
            if (cmd == "setParameter")
                setVirtualParameter (partId, id, juce::jlimit (0.0f, 1.0f,
                                     (float) (double) payload.getProperty ("value", 0.0)));
            else if (cmd == "resetParameter")
                setVirtualParameter (partId, id, virtualParameterDefault (id));
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
            parameter->setValueNotifyingHost (
                juce::jlimit (0.0f, 1.0f, (float) (double) payload.getProperty ("value", 0.0)));
        else if (cmd == "resetParameter")
            parameter->setValueNotifyingHost (parameter->getDefaultValue());
        else if (cmd == "beginParameterGesture")
            parameter->beginChangeGesture();
        else
            parameter->endChangeGesture();
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
            setVirtualParameter (partId, id, juce::jlimit (0.0f, 1.0f, text.getFloatValue()));
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
        parameter->setValueNotifyingHost (
            juce::jlimit (0.0f, 1.0f, parameter->getValueForText (text)));
        parameter->endChangeGesture();
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

        // A virtual write changed the manifest itself (a fader, a send, a macro), so it
        // persists and re-announces; a plug-in write is captured by the next save as ever.
        if (isVirtualParameterId (slot->binding.parameterId))
        {
            savePerformance();
            emitState();
        }
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
        if (! rack.removeMacro (payload.getProperty ("macroId", {}).toString()))
        {
            emitError ("Unknown macro.");
            return;
        }
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

        macro->value = juce::jlimit (0.0f, 1.0f, (float) (double) payload.getProperty ("value", 0.0));
        applyMacroValue (*macro);

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
                    }
                }
                break;
            }
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
        if (! rack.setSendLevel (payload.getProperty ("partId", {}).toString(),
                                 payload.getProperty ("returnId", {}).toString(),
                                 (float) (double) payload.getProperty ("level", 0.0)))
        {
            emitError ("Unknown part or return.");
            return;
        }
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
            // Clips that named it go with it: a clip pointing at nothing is a launch button
            // that does nothing, which is worse than an absent button.
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
                for (int i = 0; i < pattern->lanes.size(); ++i)
                    if (pattern->lanes.getReference (i).laneId == laneId)
                    {
                        pattern->lanes.remove (i);
                        break;
                    }
            }
            else if (cmd == "clearLane")
            {
                for (auto& step : lane->steps)
                    step = perf::PatternStep();
                lane->euclidPulses = 0;
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
            const auto index = performance.indexOfClip (clipId);
            if (index >= 0)
                rack.getEngine().stopClip (index, perf::Quantize::immediate);

            for (auto& scene : performance.scenes)
                scene.clipIds.removeString (clipId);
            performance.clips.remove (index);
        }
        else if (const auto* fields = payload.getDynamicObject())
        {
            if (fields->hasProperty ("name"))   clip->name = payload["name"].toString().trim();
            if (fields->hasProperty ("loop"))   clip->loop = (bool) payload["loop"];
            if (fields->hasProperty ("launchQuantize"))
                clip->launchQuantize = perf::quantizeFromName (payload["launchQuantize"].toString());
            if (fields->hasProperty ("followClipId"))
                clip->followClipId = payload["followClipId"].toString();
            if (fields->hasProperty ("followAfterLoops"))
                clip->followAfterLoops = juce::jlimit (0, 64, (int) payload["followAfterLoops"]);
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

    if (cmd == "stopAllClips")
    {
        rack.getEngine().stopAllClips (rack.getPerformance().transport.defaultQuantize);
        emitState();
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
            for (int i = performance.setlist.items.size(); --i >= 0;)
                if (performance.setlist.items.getReference (i).sceneId == sceneId)
                    performance.setlist.items.remove (i);

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
        item.name = payload.getProperty ("name", {}).toString().trim();
        if (item.name.isEmpty())
        {
            const auto* scene = performance.findScene (item.sceneId);
            item.name = scene != nullptr ? scene->name
                                         : "Item " + juce::String (performance.setlist.items.size() + 1);
        }
        performance.setlist.items.add (std::move (item));
        savePerformance();
        emitState();
        return;
    }

    if (cmd == "removeSetlistItem" || cmd == "setSetlistItem" || cmd == "moveSetlistItem")
    {
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
            if (fields->hasProperty ("tempo"))   item.tempo = juce::jlimit (0.0, 300.0, (double) payload["tempo"]);
        }

        savePerformance();
        emitState();
        return;
    }

    if (cmd == "setlistGo" || cmd == "setlistNext" || cmd == "setlistPrev")
    {
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

    // -- Stage 6: per-part arp and MIDI FX ---------------------------------------------------

    if (cmd == "setPartArp" || cmd == "setPartMidiFx")
    {
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
            {
                if (fields->hasProperty ("enabled"))      arp.enabled = (bool) payload["enabled"];
                if (fields->hasProperty ("mode"))         arp.mode = perf::ArpSettings::modeFromName (payload["mode"].toString());
                if (fields->hasProperty ("stepsPerBeat")) arp.stepsPerBeat = juce::jlimit (1, 16, (int) payload["stepsPerBeat"]);
                if (fields->hasProperty ("gate"))         arp.gate = juce::jlimit (0.05f, 1.0f, (float) (double) payload["gate"]);
                if (fields->hasProperty ("swing"))        arp.swing = juce::jlimit (0.0f, 0.75f, (float) (double) payload["swing"]);
                if (fields->hasProperty ("octaves"))      arp.octaves = juce::jlimit (1, 4, (int) payload["octaves"]);
                if (fields->hasProperty ("latch"))        arp.latch = (bool) payload["latch"];
                if (fields->hasProperty ("constrainToScale")) arp.constrainToScale = (bool) payload["constrainToScale"];
                if (fields->hasProperty ("velocityPattern"))
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
                if (fields->hasProperty ("patternSemitones"))
                    arp.patternSemitones = (bool) payload["patternSemitones"];
                if (fields->hasProperty ("degreePattern"))
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
            rack.setPartArp (partId, arp);
        }
        else
        {
            auto fx = part->midiFx;
            if (fields != nullptr)
            {
                if (fields->hasProperty ("transpose"))        fx.transpose = juce::jlimit (-48, 48, (int) payload["transpose"]);
                if (fields->hasProperty ("constrainToScale")) fx.constrainToScale = (bool) payload["constrainToScale"];
                if (fields->hasProperty ("scaleRoot"))        fx.scaleRoot = juce::jlimit (0, 11, (int) payload["scaleRoot"]);
                if (fields->hasProperty ("scaleType"))        fx.scaleType = payload["scaleType"].toString();
                if (fields->hasProperty ("chord"))            fx.chord = perf::MidiFxSettings::chordTypeFromName (payload["chord"].toString());
                if (fields->hasProperty ("velocityFixed"))    fx.velocityFixed = juce::jlimit (0, 127, (int) payload["velocityFixed"]);
                if (fields->hasProperty ("velocityScale"))    fx.velocityScale = juce::jlimit (0.1f, 2.0f, (float) (double) payload["velocityScale"]);
            }
            rack.setPartMidiFx (partId, fx);
        }

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

        juce::Array<juce::var> rows;
        for (const auto& entry : previewSupportBundle (bundleOptions))
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("name",        entry.name);
            obj->setProperty ("description", entry.description);
            obj->setProperty ("sizeBytes",   (int) entry.sizeBytes);
            obj->setProperty ("included",    entry.included);
            obj->setProperty ("note",        entry.note);
            rows.add (juce::var (obj));
        }

        auto* answer = new juce::DynamicObject();
        answer->setProperty ("entries", rows);
        answer->setProperty ("includeStateBlobs", bundleOptions.includeStateBlobs);

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
        auto* instrument = rack.getInstrument (partId);
        if (part == nullptr || instrument == nullptr)
        {
            emitError ("That part has no instrument to capture.");
            return;
        }

        juce::MemoryBlock state;
        instrument->getStateInformation (state);

        LibraryRecord record;
        record.type = "preset";
        record.sourceType = "userState";
        record.targetCeId = part->pluginCeId;
        record.instrument = part->pluginName;
        record.manufacturer = part->pluginVendor;
        record.name = payload.getProperty ("name", {}).toString().trim();
        if (record.name.isEmpty())
            record.name = part->pluginName + " preset";
        record.category = payload.getProperty ("category", {}).toString().trim();
        record.stateBlobBase64 = juce::Base64::toBase64 (state.getData(), state.getSize());
        record.fingerprint = juce::String::toHexString (record.stateBlobBase64.hashCode64());

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

    if (cmd == "loadLibraryRecord")
    {
        ensureLibrary();
        const auto* record = library.find (payload.getProperty ("recordId", {}).toString());
        if (record == nullptr)
        {
            emitError ("Unknown library record.");
            return;
        }

        if (const auto reason = recordUnavailableReason (*record); reason.isNotEmpty()
            && record->type != "rack")   // a rack loads degraded-but-loud; presets refuse
        {
            emitError (reason);
            return;
        }

        if (record->type == "rack")
        {
            loadRackRecord (*record);
            return;
        }

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

        loadPresetRecord (*record, partId);
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
        if (part->pluginCeId.isEmpty() || part->hardware)
        {
            emitError ("Load an instrument on this part first — presets walk what is loaded.");
            return;
        }

        juce::Array<const LibraryRecord*> candidates;
        for (const auto& record : library.allRecords())
            if (record.type == "preset" && ! record.missing
                && record.targetCeId == part->pluginCeId)
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
            emitError ("No presets in the library for " + part->pluginName
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

        loadPresetRecord (*candidates[next], partId);
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

    restartAudioIfNeeded();
}

void InstrumentHostService::requestInstrument (const juce::String& partId, const juce::String& ceId,
                                               std::function<void (juce::AudioProcessor&)> afterCommit)
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
        emitError (refusal);
        emitState();
        return;
    }

    const auto generation = rack.beginLoad (partId);
    if (generation == 0)
    {
        emitError ("Unknown rack part.");
        return;
    }

    if (options.instantiate == nullptr)
    {
        emitError ("No instrument instantiator is configured.");
        return;
    }

    // The callback can arrive after this service is gone (an async load racing shutdown);
    // the alive token is the same pattern ValueTreeBridge documents for its update check.
    if (activeMarker != nullptr)
        activeMarker->markActive (info.modulePath, info.name);

    // Two markers, two questions. The active marker names WHICH module was live; this names
    // WHAT the product was doing with it, because a crash while restoring a whole session and
    // a crash while adding one plug-in look identical in a log and need different repairs.
    if (recovery != nullptr)
        recovery->beginOperation ("loadInstrument", info.name);

    options.instantiate (descriptionXml, options.sampleRate, options.blockSize,
        [this, aliveToken = alive, partId, generation, info, afterCommit = std::move (afterCommit)]
        (std::unique_ptr<juce::AudioProcessor> instrument, const juce::String& error)
        {
            if (! aliveToken->load())
                return;

            // Survived construction: whatever happens next is not attributable to this load.
            if (activeMarker != nullptr)
                activeMarker->clear();
            if (recovery != nullptr)
                recovery->endOperation();

            if (instrument == nullptr)
            {
                emitError ("Could not load " + info.name
                           + (error.isNotEmpty() ? ": " + error : juce::String()));
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
                emitState();
                return;
            }

            if (afterCommit != nullptr)
                if (auto* committed = rack.getInstrument (partId))
                    afterCommit (*committed);

            attachParameters (partId);
            ingestProgramList (partId);

            if (editorWasHere)
                showEditorFor (partId);

            savePerformance();
            emitState();
        });
}

void InstrumentHostService::requestEffect (const juce::String& effectId, const juce::String& ceId)
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
        emitError (refusal);
        emitState();
        return;
    }

    rack.primeEffectSlot (effectId, { info.ceId, info.modulePath, info.name, info.vendor },
                          rack.getPerformance().findEffect (effectId)->stateBlobBase64);

    const auto generation = rack.beginEffectLoad (effectId);
    if (generation == 0 || options.instantiate == nullptr)
    {
        emitError (generation == 0 ? "Unknown effect." : "No instrument instantiator is configured.");
        return;
    }

    if (activeMarker != nullptr)
        activeMarker->markActive (info.modulePath, info.name);
    if (recovery != nullptr)
        recovery->beginOperation ("loadEffect", info.name);

    options.instantiate (descriptionXml, options.sampleRate, options.blockSize,
        [this, aliveToken = alive, effectId, generation, info]
        (std::unique_ptr<juce::AudioProcessor> effect, const juce::String& error)
        {
            if (! aliveToken->load())
                return;

            if (activeMarker != nullptr)
                activeMarker->clear();
            if (recovery != nullptr)
                recovery->endOperation();

            if (effect == nullptr)
            {
                emitError ("Could not load " + info.name
                           + (error.isNotEmpty() ? ": " + error : juce::String()));
                emitState();
                return;
            }

            const bool editorWasHere = (editorTargetId == effectId);

            if (! rack.commitEffectLoad (effectId, generation, std::move (effect),
                                         { info.ceId, info.modulePath, info.name, info.vendor }))
            {
                emitState();   // superseded or the slot left — the ticket's designed refusal
                return;
            }

            attachParameters (effectId);

            if (editorWasHere)
                showEditorForEffect (effectId);

            savePerformance();
            emitState();
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
}

void InstrumentHostService::stopAudio()
{
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
    entry.sync = std::make_unique<PartParameterSync> (partId, *processor);
    partParameters[partId] = std::move (entry);
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
        setVirtualParameter (binding.partId, binding.parameterId, mapped);
        return;
    }

    if (auto* parameter = resolveParameter (binding.partId, binding.parameterId))
    {
        parameter->beginChangeGesture();
        parameter->setValueNotifyingHost (mapped);
        parameter->endChangeGesture();
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
    int presets = 0, racks = 0, missing = 0;

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
        if (record.type == "preset") ++presets; else ++racks;
        if (record.missing) ++missing;
    }

    auto* counts = new juce::DynamicObject();
    counts->setProperty ("total",   library.allRecords().size());
    counts->setProperty ("presets", presets);
    counts->setProperty ("racks",   racks);
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

void InstrumentHostService::loadPresetRecord (const LibraryRecord& record, const juce::String& partId)
{
    const auto* part = rack.getPerformance().findPart (partId);
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
                           [applyVendorPreset] (juce::AudioProcessor& instrument)
                           { applyVendorPreset (instrument); });
    else if (record.sourceType == "programList")
        requestInstrument (partId, record.targetCeId,
                           [this, index = record.sourceLocator.fromLastOccurrenceOf ("/", false, false)
                                        .getIntValue(),
                            name = record.name] (juce::AudioProcessor& instrument)
                           {
                               if (index >= 0 && index < instrument.getNumPrograms())
                                   instrument.setCurrentProgram (index);
                               else
                                   emitError ("The plug-in no longer has this program: " + name);
                           });
    else
        requestInstrument (partId, record.targetCeId);
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

void InstrumentHostService::applyAutomationValue (const juce::String& targetId,
                                                  const juce::String& parameterId, float value)
{
    if (isVirtualParameterId (parameterId))
    {
        setVirtualParameter (targetId, parameterId, value);
        return;
    }

    // No gestures: automation is a continuous stream, and a begin/end pair around every value
    // would tell the host a human is grabbing the control sixty times a second.
    if (auto* parameter = resolveParameter (targetId, parameterId))
        parameter->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, value));
}

void InstrumentHostService::applySceneState (const perf::Scene& scene)
{
    // Everything here goes through the systems that already own it: the rack's mixer, the
    // Stage 5 macro path, the existing focus and page state. A scene is a set of calls, not
    // a snapshot format (§18.8.8).
    for (const auto& slot : scene.slots)
    {
        rack.setEnabled (slot.partId, slot.enabled);
        rack.setMute (slot.partId, slot.mute);
        if (slot.applyVolume)
            rack.setVolume (slot.partId, slot.volume);
    }

    for (const auto& value : scene.macros)
        if (auto* macro = rack.findMutableMacro (value.macroId))
        {
            macro->value = juce::jlimit (0.0f, 1.0f, value.value);
            applyMacroValue (*macro);
        }

    if (scene.focusPartId.isNotEmpty() && rack.focusPart (scene.focusPartId))
        showEditorFor (scene.focusPartId);

    if (scene.tempo > 0.0)
    {
        rack.getEngine().getTransport().setTempo (scene.tempo);
        const_cast<Performance&> (rack.getPerformance()).transport.tempo = scene.tempo;
    }

    savePerformance();
}

void InstrumentHostService::captureSceneFromRack (perf::Scene& scene)
{
    const auto& performance = rack.getPerformance();

    scene.slots.clear();
    for (const auto& part : performance.parts)
        scene.slots.add ({ part.partId, part.enabled, part.mute, part.volume, true });

    scene.macros.clear();
    for (const auto& macro : performance.macros)
        scene.macros.add ({ macro.macroId, macro.value });

    scene.clipIds.clear();
    for (int i = 0; i < performance.clips.size(); ++i)
        if (rack.getEngine().isClipActive (i))
            scene.clipIds.add (performance.clips.getReference (i).clipId);

    scene.focusPartId = performance.focusedPartId;
}

bool InstrumentHostService::launchScene (const juce::String& sceneId)
{
    const auto& performance = rack.getPerformance();
    const auto* scene = performance.findScene (sceneId);
    if (scene == nullptr)
        return false;

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
    rack.getEngine().launchScene (clipIndices, scene->stopOtherClips, scene->launchQuantize, token);

    // A parked transport has no boundary to wait for, so the scene applies immediately —
    // otherwise recalling a scene before pressing play would appear to do nothing.
    if (! rack.getEngine().getTransport().isPlaying())
    {
        applySceneState (*scene);
        pendingScenes.erase (token);
    }

    return true;
}

bool InstrumentHostService::goToSetlistItem (int index)
{
    auto& setlist = const_cast<Performance&> (rack.getPerformance()).setlist;
    if (! juce::isPositiveAndBelow (index, setlist.items.size()))
        return false;

    const auto& item = setlist.items.getReference (index);
    const auto previous = setlist.currentIndex;
    setlist.currentIndex = index;

    if (item.tempo > 0.0)
    {
        rack.getEngine().getTransport().setTempo (item.tempo);
        const_cast<Performance&> (rack.getPerformance()).transport.tempo = item.tempo;
    }

    // A scene that will not recall leaves the rig on the last stable item rather than
    // half-loading it (§18.8.9) — on stage, "nothing changed" beats "something changed".
    if (item.sceneId.isNotEmpty() && ! launchScene (item.sceneId))
    {
        setlist.currentIndex = previous;
        return false;
    }

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("index", index);
    payload->setProperty ("name", item.name);
    payload->setProperty ("notes", item.notes);
    emitScriptEvent ("setlistChanged", juce::var (payload));

    savePerformance();
    return true;
}

void InstrumentHostService::drainEngineEvents()
{
    auto& engine = rack.getEngine();
    const auto* song = engine.getSong();
    const auto generation = engine.getGeneration();

    bool stateChanged = false;
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
                if (const auto* scene = rack.getPerformance().findScene (it->second))
                {
                    applySceneState (*scene);
                    auto* payload = new juce::DynamicObject();
                    payload->setProperty ("sceneId", scene->sceneId);
                    payload->setProperty ("name", scene->name);
                    emitScriptEvent ("sceneApplied", juce::var (payload));
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
        }
    }

    if (stateChanged)
    {
        // A captured note changed what would play, so the compiled song has to follow.
        recompilePerformance();
        savePerformance();
        emitState();
    }
}

void InstrumentHostService::noteMidiActivity (const juce::String& deviceName,
                                              const juce::MidiMessage& message)
{
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
    ++midiActivitySeq;

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

void InstrumentHostService::emitMidiLearn (bool armed, const juce::String& pageId,
                                           const juce::String& slotId, int cc, int channel)
{
    if (options.emit == nullptr)
        return;

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("armed",   armed);
    obj->setProperty ("pageId",  pageId);
    obj->setProperty ("slotId",  slotId);
    obj->setProperty ("cc",      cc);
    obj->setProperty ("channel", channel);
    options.emit ("instrumentHostMidiLearn", juce::var (obj));
}

void InstrumentHostService::drainControllerEvents()
{
    std::vector<PendingCc> events;
    {
        const std::scoped_lock lock (midiActivityLock);
        events.swap (pendingCcs);
    }
    if (events.empty())
        return;

    // Learn first: the armed slot takes the first controller heard since arming.
    if (midiLearnPageId.isNotEmpty())
    {
        const auto pageId = std::exchange (midiLearnPageId, {});
        const auto slotId = std::exchange (midiLearnSlotId, {});
        const auto& first = events.front();

        // One controller drives one slot: learning a controller that is already bound
        // elsewhere moves it, because two slots silently riding one knob is a support call.
        for (const auto& page : rack.getPerformance().pages)
            for (const auto& other : page.slots)
                if (other.midiCc == first.cc && other.midiChannel == first.channel
                      && ! (page.pageId == pageId && other.slotId == slotId))
                    rack.setSlotMidi (page.pageId, other.slotId, -1, 0);

        if (rack.setSlotMidi (pageId, slotId, first.cc, first.channel))
        {
            savePerformance();
            emitState();
            emitMidiLearn (false, pageId, slotId, first.cc, first.channel);
        }
        else
        {
            // The slot vanished while armed (its page was removed): disarm out loud.
            emitMidiLearn (false, {}, {}, -1, 0);
        }
    }

    // Every event lands on every slot bound to it — absolute position, the controller value
    // scaling the slot's mapped range exactly as the on-screen knob does. The freshly
    // learned slot is caught here too, so the knob takes effect the moment it binds.
    bool virtualWritten = false;
    for (const auto& event : events)
        for (const auto& page : rack.getPerformance().pages)
            for (const auto& slot : page.slots)
            {
                if (slot.midiCc != event.cc)
                    continue;
                if (slot.midiChannel != 0 && slot.midiChannel != event.channel)
                    continue;
                if (slot.binding.isEmpty() || ! bindingResolves (slot.binding))
                    continue;

                writeMappedBinding (slot.binding, (float) event.value / 127.0f);
                virtualWritten = virtualWritten || isVirtualParameterId (slot.binding.parameterId);
            }

    // A virtual write changed the manifest (fader, send, macro): one save and one announce
    // per drain however many controllers moved — the contract the CTRL49 encoders set.
    if (virtualWritten)
    {
        savePerformance();
        emitState();
    }
}

void InstrumentHostService::drainParameterEvents()
{
    drainEngineEvents();

    // The MIDI activity readout: at most one event per drain, carrying the latest message —
    // a UI light needs "something arrived, this is what", not a message log.
    {
        juce::String device, text;
        bool changed = false;
        {
            const std::scoped_lock lock (midiActivityLock);
            if (midiActivitySeq != midiActivityEmittedSeq)
            {
                midiActivityEmittedSeq = midiActivitySeq;
                device = midiActivityDevice;
                text = midiActivityText;
                changed = true;
            }
        }
        if (changed && options.emit != nullptr)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("device", device);
            obj->setProperty ("text", text);
            options.emit ("instrumentHostMidiActivity", juce::var (obj));
        }
    }

    drainControllerEvents();

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
            auto* parameter = processorParams[index];
            const auto id = idFor (index);
            if (parameter == nullptr || id.isEmpty())
                continue;

            auto* obj = new juce::DynamicObject();
            obj->setProperty ("id",    id);
            obj->setProperty ("value", parameter->getValue());
            obj->setProperty ("text",  parameter->getCurrentValueAsText());
            changes.add (juce::var (obj));
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

        if (changes.isEmpty() && gestureEvents.isEmpty())
            continue;

        auto* root = new juce::DynamicObject();
        root->setProperty ("partId",   partId);
        root->setProperty ("changes",  changes);
        root->setProperty ("gestures", gestureEvents);
        if (options.emit != nullptr)
            options.emit ("instrumentHostParamValues", juce::var (root));
    }
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

        for (const auto& record : catalog.instrumentClasses())
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("ceId",    record.ceId);
            obj->setProperty ("name",    record.name);
            obj->setProperty ("vendor",  record.vendor);
            obj->setProperty ("version", record.version);
            instruments.add (juce::var (obj));
        }

        for (const auto& record : catalog.effectClasses())
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("ceId",    record.ceId);
            obj->setProperty ("name",    record.name);
            obj->setProperty ("vendor",  record.vendor);
            obj->setProperty ("version", record.version);
            effectClasses.add (juce::var (obj));
        }

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
        obj->setProperty ("volume",        part.volume);
        obj->setProperty ("pan",           part.pan);

        juce::Array<juce::var> sends;
        for (const auto& send : part.sends)
        {
            auto* s = new juce::DynamicObject();
            s->setProperty ("returnId", send.returnId);
            s->setProperty ("level",    send.level);
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
        }

        // Chain latency, visible rather than pretended away — the graph does not compensate
        // parallel paths (a live rack keeps every path as fast as its plug-ins allow).
        obj->setProperty ("latencyMs", rack.partLatencySamples (part.partId)
                                         / rack.getSampleRate() * 1000.0);
        obj->setProperty ("arp",    perf::arpToVar (part.arp));
        obj->setProperty ("midiFx", perf::midiFxToVar (part.midiFx));
        parts.add (juce::var (obj));
    }

    juce::Array<juce::var> pages;
    for (const auto& page : performance.pages)
    {
        juce::Array<juce::var> slots;
        for (const auto& slot : page.slots)
        {
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
    rackObj->setProperty ("macros", macros);
    rackObj->setProperty ("pages", pages);
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
    root->setProperty ("scanning", scanBusy.load());
    root->setProperty ("editorOpenPartId", editorTargetId);
    root->setProperty ("audio", juce::var (audio));
    root->setProperty ("rack", juce::var (rackObj));
    return juce::var (root);
}

// -- the performance surface runtime (Stage 6, §18.8.10) -------------------------------------

InstrumentHostService::SurfaceTransport InstrumentHostService::surfaceTransport() const
{
    const auto& transport = rack.getEngine().getTransport();

    SurfaceTransport view;
    view.playing = transport.isPlaying();
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
    if (rack.getEngine().isClipActive (padIndex))
        rack.getEngine().stopClip (padIndex, performance.clips.getReference (padIndex).launchQuantize);
    else
        rack.getEngine().launchClip (padIndex);

    return true;
}

bool InstrumentHostService::surfaceScenePad (int padIndex)
{
    const auto& scenes = rack.getPerformance().scenes;
    if (! juce::isPositiveAndBelow (padIndex, scenes.size()))
        return false;

    return launchScene (scenes.getReference (padIndex).sceneId);
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
    return juce::isPositiveAndBelow (index, macros.size()) ? macros.getReference (index).value
                                                            : 0.0f;
}

bool InstrumentHostService::setExposedMacroValue (int index, float value)
{
    const auto& macros = rack.getPerformance().macros;
    if (! juce::isPositiveAndBelow (index, macros.size()))
        return false;   // the parameter exists, the macro does not: accepted, does nothing

    auto* macro = rack.findMutableMacro (macros.getReference (index).macroId);
    if (macro == nullptr)
        return false;

    macro->value = juce::jlimit (0.0f, 1.0f, value);
    applyMacroValue (*macro);
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
    return launchScene (scenes.getReference (index).sceneId);
}

float InstrumentHostService::masterLevel() const
{
    return rack.getPerformance().masterLevel;
}

void InstrumentHostService::setMasterLevel (float level)
{
    rack.setMasterLevel (level);
}

int InstrumentHostService::reportedLatencySamples() const
{
    // The DAW compensates one number for the whole instance, so it has to be the worst path
    // through the rack: the slowest part chain, plus whatever the master chain adds after it.
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

    auto* root = new juce::DynamicObject();
    root->setProperty ("safeMode",       juce::var (safe));
    root->setProperty ("refusedThisRun", refused);
    root->setProperty ("recovery",       juce::var (recoveryObj));
    root->setProperty ("damagedState",   damaged);
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
    transportObj->setProperty ("playing",       transport.isPlaying());
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
            l->setProperty ("euclidPulses", lane.euclidPulses);
            l->setProperty ("steps",        steps);
            lanes.add (juce::var (l));
        }

        auto* p = new juce::DynamicObject();
        p->setProperty ("patternId", pattern.patternId);
        p->setProperty ("name",      pattern.name);
        p->setProperty ("swing",     pattern.swing);
        p->setProperty ("lengthPpq", pattern.lengthPpq());
        p->setProperty ("lanes",     lanes);
        patterns.add (juce::var (p));
    }

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
        s->setProperty ("launchQuantize", perf::quantizeName (scene.launchQuantize));
        s->setProperty ("stopOtherClips", scene.stopOtherClips);
        s->setProperty ("tempo",          scene.tempo);
        s->setProperty ("numSlots",       scene.slots.size());
        s->setProperty ("numMacros",      scene.macros.size());
        scenes.add (juce::var (s));
    }

    juce::Array<juce::var> setlistItems;
    for (const auto& item : performance.setlist.items)
    {
        const auto* scene = performance.findScene (item.sceneId);
        auto* i = new juce::DynamicObject();
        i->setProperty ("itemId",    item.itemId);
        i->setProperty ("name",      item.name);
        i->setProperty ("sceneId",   item.sceneId);
        i->setProperty ("sceneName", scene != nullptr ? scene->name : juce::String());
        i->setProperty ("missing",   item.sceneId.isNotEmpty() && scene == nullptr);
        i->setProperty ("notes",     item.notes);
        i->setProperty ("tempo",     item.tempo);
        setlistItems.add (juce::var (i));
    }

    auto* setlistObj = new juce::DynamicObject();
    setlistObj->setProperty ("items",        setlistItems);
    setlistObj->setProperty ("currentIndex", performance.setlist.currentIndex);

    auto* capture = new juce::DynamicObject();
    capture->setProperty ("armed",  engine.isCapturing());
    capture->setProperty ("clipId", captureClipId);
    capture->setProperty ("laneId", captureLaneId);

    auto* root = new juce::DynamicObject();
    root->setProperty ("transport", juce::var (transportObj));
    root->setProperty ("patterns",  patterns);
    root->setProperty ("clips",     clips);
    root->setProperty ("scenes",    scenes);
    root->setProperty ("setlist",   juce::var (setlistObj));
    root->setProperty ("capture",   juce::var (capture));
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
