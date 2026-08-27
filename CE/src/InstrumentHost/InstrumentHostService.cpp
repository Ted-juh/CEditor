#include "InstrumentHostService.h"

namespace ceditor::host
{

InstrumentHostService::InstrumentHostService (Options optionsToUse)
    : options (std::move (optionsToUse))
{
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
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto ceId = payload.getProperty ("ceId", {}).toString();

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
                            arp.velocityPattern.add (juce::jlimit (1, 127, (int) velocity));
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

    {
        const std::scoped_lock lock (catalogLock);
        catalog.loadFrom (catalogFile());

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
        Performance restored;
        if (Performance::fromVar (juce::JSON::parse (performanceSource.loadFileAsString()), restored))
            applyPerformance (std::move (restored));
        else
            emitError ("The saved rack session could not be read; starting empty.");
    }

    if (options.enableAudio)
        startAudio();
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
        else if (module->quarantined || module->missing)
        {
            refusal = (module->quarantined ? juce::String ("Module is quarantined: ")
                                           : juce::String ("Module is missing: "))
                      + module->path;
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
    options.instantiate (descriptionXml, options.sampleRate, options.blockSize,
        [this, aliveToken = alive, partId, generation, info, afterCommit = std::move (afterCommit)]
        (std::unique_ptr<juce::AudioProcessor> instrument, const juce::String& error)
        {
            if (! aliveToken->load())
                return;

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
        else if (module->quarantined || module->missing)
            refusal = (module->quarantined ? juce::String ("Module is quarantined: ")
                                           : juce::String ("Module is missing: "))
                      + module->path;
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

    options.instantiate (descriptionXml, options.sampleRate, options.blockSize,
        [this, aliveToken = alive, effectId, generation, info]
        (std::unique_ptr<juce::AudioProcessor> effect, const juce::String& error)
        {
            if (! aliveToken->load())
                return;

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
    return rack.captureState().toVar();
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
    if (module != nullptr && (module->quarantined || module->missing))
        return "Requires " + record.instrument + ", whose module is "
             + (module->quarantined ? "quarantined." : "missing.");

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

    if (record.sourceType == "vstpreset")
        requestInstrument (partId, record.targetCeId,
                           [applyVendorPreset] (juce::AudioProcessor& instrument)
                           { applyVendorPreset (instrument); });
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

void InstrumentHostService::drainParameterEvents()
{
    drainEngineEvents();

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

    juce::Array<juce::File> roots = PluginScannerCoordinator::defaultWindowsVst3Roots();
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

juce::var InstrumentHostService::buildStatePayload() const
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
