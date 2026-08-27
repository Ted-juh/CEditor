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
        if (partId == editorPartId)
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
        // pane when the newly focused part has nothing to show.
        if (editorPartId.isNotEmpty() && editorPartId != partId)
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

        if (rack.getPerformance().findPart (partId) == nullptr)
        {
            emitError ("Unknown rack part.");
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
        if (it == partParameters.end())
        {
            emitError ("That part has no instrument loaded.");
            return;
        }

        const auto& processorParams = rack.getInstrument (partId)->getParameters();
        juce::Array<juce::var> parameters;
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

        juce::Array<juce::var> warnings;
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
        const auto partId = payload.getProperty ("partId", {}).toString();
        const auto parameterId = payload.getProperty ("parameterId", {}).toString();

        const auto* part = rack.getPerformance().findPart (partId);
        if (part == nullptr)
        {
            emitError ("Unknown rack part.");
            return;
        }
        if (resolveParameter (partId, parameterId) == nullptr)
        {
            // Assignment needs the live instrument: the registry is what proves the id and
            // whose class identity the binding captures.
            emitError ("Unknown parameter " + parameterId + " on that part.");
            return;
        }

        ControlBinding binding;
        binding.partId = partId;
        binding.pluginCeId = part->pluginCeId;
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

        const auto& b = slot->binding;
        const auto raw = juce::jlimit (0.0f, 1.0f, (float) (double) payload.getProperty ("value", 0.0));
        const auto positioned = b.inverted ? 1.0f - raw : raw;
        const auto mapped = b.rangeMin + positioned * (b.rangeMax - b.rangeMin);
        resolveParameter (b.partId, b.parameterId)->setValueNotifyingHost (mapped);
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
        {
            for (const auto& unresolved : rack.loadModel (std::move (restored)))
                requestInstrument (unresolved.partId, unresolved.ceId);
        }
        else
        {
            emitError ("The saved rack session could not be read; starting empty.");
        }
    }

    if (options.enableAudio)
        startAudio();
}

void InstrumentHostService::requestInstrument (const juce::String& partId, const juce::String& ceId)
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
        [this, aliveToken = alive, partId, generation, info]
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
            const bool editorWasHere = (editorPartId == partId);

            if (! rack.commitLoad (partId, generation, std::move (instrument),
                                   { info.ceId, info.modulePath, info.name, info.vendor }))
            {
                // Superseded by a newer selection, or the part left in the meantime — the
                // rack host's ticket refused it, which is the designed outcome, not a fault.
                emitState();
                return;
            }

            attachParameters (partId);

            if (editorWasHere)
                showEditorFor (partId);

            savePerformance();
            emitState();
        });
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

    editorPartId = partId;
    if (options.editorPane.show != nullptr)
        options.editorPane.show (partId, *instrument,
                                 part->pluginName.isNotEmpty() ? part->pluginName
                                                               : juce::String ("Instrument"));
}

void InstrumentHostService::hideEditor()
{
    if (editorPartId.isEmpty())
        return;

    editorPartId = {};
    if (options.editorPane.hide != nullptr)
        options.editorPane.hide();
}

void InstrumentHostService::startAudio()
{
    // The simplest honest Preview Runtime: default output, every MIDI input, the player
    // driving the rack's graph. What actually opened is reported through the state payload;
    // explicit device selection is a later step.
    const auto error = deviceManager.initialiseWithDefaultDevices (0, 2);

    player.setProcessor (&rack.getGraph());
    deviceManager.addAudioCallback (&player);
    deviceManager.addMidiInputDeviceCallback ({}, &player);
    for (const auto& input : juce::MidiInput::getAvailableDevices())
        deviceManager.setMidiInputDeviceEnabled (input.identifier, true);

    audioRunning = true;

    if (error.isNotEmpty())
        emitError ("Audio device: " + error);
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

    auto* current = deviceManager.getCurrentAudioDevice();
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("outputs", outputs);
    obj->setProperty ("current", current != nullptr ? current->getName() : juce::String());
    obj->setProperty ("midiInputs", midiInputs);

    if (options.emit != nullptr)
        options.emit ("instrumentHostAudioDevices", juce::var (obj));
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

void InstrumentHostService::prepareRuntime (double sampleRate, int blockSize)
{
    options.sampleRate = sampleRate;
    options.blockSize = blockSize;
    rack.prepare (sampleRate, blockSize);
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

    for (const auto& unresolved : rack.loadModel (std::move (restored)))
        requestInstrument (unresolved.partId, unresolved.ceId);

    savePerformance();
    emitState();
}

void InstrumentHostService::attachParameters (const juce::String& partId)
{
    auto* instrument = rack.getInstrument (partId);
    if (instrument == nullptr)
        return;

    PartParameters entry;
    entry.inventory = describeParameters (*instrument);
    entry.sync = std::make_unique<PartParameterSync> (partId, *instrument);
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
    return rack.getInstrument (partId)->getParameters()[descriptor->index];
}

bool InstrumentHostService::bindingResolves (const ControlBinding& binding) const
{
    if (binding.isEmpty())
        return false;

    const auto* part = rack.getPerformance().findPart (binding.partId);
    if (part == nullptr || part->pluginCeId != binding.pluginCeId)
        return false;

    const auto it = partParameters.find (binding.partId);
    return it != partParameters.end()
        && it->second.inventory.find (binding.parameterId) != nullptr;
}

void InstrumentHostService::drainParameterEvents()
{
    for (auto& [partId, part] : partParameters)
    {
        juce::SortedSet<int> changed;
        juce::Array<PartParameterSync::Gesture> gestures;
        if (! part.sync->drain (changed, gestures))
            continue;

        const auto& processorParams = rack.getInstrument (partId)->getParameters();
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
    if (editorPartId.isNotEmpty())
        showEditorFor (editorPartId);
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
    juce::Array<juce::var> parts;
    for (const auto& part : performance.parts)
    {
        auto* obj = new juce::DynamicObject();
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

            // The display name resolves live so a rename inside the plug-in shows through:
            // label override first, then the descriptor's name, then the raw id for an
            // unresolved binding — which is exactly the diagnostic the repair needs.
            juce::String displayName = b.label;
            if (displayName.isEmpty() && resolved)
                if (const auto it = partParameters.find (b.partId); it != partParameters.end())
                    if (const auto* d = it->second.inventory.find (b.parameterId))
                        displayName = d->name;
            if (displayName.isEmpty())
                displayName = b.parameterId;

            const auto* part = performance.findPart (b.partId);

            auto* s = new juce::DynamicObject();
            s->setProperty ("slotId",      slot.slotId);
            s->setProperty ("assigned",    ! b.isEmpty());
            s->setProperty ("partId",      b.partId);
            s->setProperty ("parameterId", b.parameterId);
            s->setProperty ("label",       b.label);
            s->setProperty ("displayName", b.isEmpty() ? juce::String() : displayName);
            s->setProperty ("partName",    part != nullptr ? part->pluginName : juce::String());
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
        pg->setProperty ("slots",  slots);
        pages.add (juce::var (pg));
    }

    auto* rackObj = new juce::DynamicObject();
    rackObj->setProperty ("performanceId", performance.performanceId);
    rackObj->setProperty ("focusedPartId", performance.focusedPartId);
    rackObj->setProperty ("parts", parts);
    rackObj->setProperty ("pages", pages);

    auto* audio = new juce::DynamicObject();
    auto* device = deviceManager.getCurrentAudioDevice();
    audio->setProperty ("enabled",    options.enableAudio);
    audio->setProperty ("running",    audioRunning && device != nullptr);
    audio->setProperty ("deviceName", device != nullptr ? device->getName() : juce::String());
    audio->setProperty ("sampleRate", device != nullptr ? device->getCurrentSampleRate() : 0.0);
    audio->setProperty ("bufferSize", device != nullptr ? device->getCurrentBufferSizeSamples() : 0);

    auto* root = new juce::DynamicObject();
    root->setProperty ("instruments", instruments);
    root->setProperty ("modules", modules);
    root->setProperty ("scanPaths", [this]
    {
        juce::Array<juce::var> paths;
        for (const auto& p : userScanPaths)
            paths.add (p);
        return paths;
    }());
    root->setProperty ("scanning", scanBusy.load());
    root->setProperty ("editorOpenPartId", editorPartId);
    root->setProperty ("audio", juce::var (audio));
    root->setProperty ("rack", juce::var (rackObj));
    return juce::var (root);
}

void InstrumentHostService::savePerformance()
{
    if (! options.persistSession)
        return;

    performanceFile().replaceWithText (juce::JSON::toString (rack.captureState().toVar()));
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
