#include "InstrumentHostService.h"

namespace ceditor::host
{

InstrumentHostService::InstrumentHostService (Options optionsToUse)
    : options (std::move (optionsToUse))
{
    // The pane's half of the editor-before-processor invariant: whatever path destroys an
    // instrument, its editor is torn down first. Replacement re-shows afterwards (see the
    // commit callback in requestInstrument).
    rack.onInstrumentWillBeRemoved = [this] (const juce::String& partId, juce::AudioProcessor&)
    {
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

    emitError ("Unknown instrument-host command: " + cmd);
}

void InstrumentHostService::restoreSession()
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

    if (performanceFile().existsAsFile())
    {
        Performance restored;
        if (Performance::fromVar (juce::JSON::parse (performanceFile().loadFileAsString()), restored))
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

void InstrumentHostService::stopAudio()
{
    if (! audioRunning)
        return;

    deviceManager.removeMidiInputDeviceCallback ({}, &player);
    deviceManager.removeAudioCallback (&player);
    player.setProcessor (nullptr);
    audioRunning = false;
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
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("path",              module.path);
            obj->setProperty ("quarantined",       module.quarantined);
            obj->setProperty ("missing",           module.missing);
            obj->setProperty ("failureCount",      module.failureCount);
            obj->setProperty ("lastFailureReason", module.lastFailureReason);
            obj->setProperty ("numClasses",        module.classes.size());
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

    auto* rackObj = new juce::DynamicObject();
    rackObj->setProperty ("performanceId", performance.performanceId);
    rackObj->setProperty ("focusedPartId", performance.focusedPartId);
    rackObj->setProperty ("parts", parts);

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
