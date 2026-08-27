#include "HostPluginProcessor.h"

namespace ceditor::host
{

// ---------------------------------------------------------------------------------- the editor

// The DAW-owned window: host.html in a WebView plus the native editor pane, wired to the
// processor's long-lived service for exactly as long as this component exists. All the state
// lives in the service; this class only attaches presentation and detaches it again.
class HostPluginEditor final : public juce::AudioProcessorEditor,
                               private juce::Timer
{
public:
    explicit HostPluginEditor (HostPluginProcessor& processorToUse)
        : juce::AudioProcessorEditor (processorToUse), owner (processorToUse)
    {
        addChildComponent (editorPane);
        editorPane.onLayoutChanged = [this] { resized(); };
        editorPane.onCloseRequested = [this]
        {
            auto* payload = new juce::DynamicObject();
            payload->setProperty ("cmd", "closeEditor");
            owner.getService().handleCommand (juce::var (payload));
        };

        InstrumentHostService::EditorPaneHooks hooks;
        hooks.show = [this] (const juce::String&, juce::AudioProcessor& instrument,
                             const juce::String& title)
        {
            editorPane.show (instrument, title);
        };
        hooks.hide = [this] { editorPane.hide(); };
        owner.getService().setEditorPaneHooks (std::move (hooks));

        auto webViewOptions = makeHostWebViewOptions ("CEHost_WebView2",
            [safe = juce::Component::SafePointer<HostPluginEditor> (this)] (const juce::var& payload)
            {
                if (safe != nullptr)
                    safe->owner.getService().handleCommand (payload);
            });

        if (juce::WebBrowserComponent::areOptionsSupported (webViewOptions))
        {
            webView = std::make_unique<juce::WebBrowserComponent> (webViewOptions);
            addAndMakeVisible (*webView);
            webView->goToURL (hostRuntimeStartUrl());
        }
        else
        {
            statusLabel.setJustificationType (juce::Justification::centred);
            statusLabel.setText ("The Microsoft Edge WebView2 runtime is not available.\n"
                                 "Install it from Microsoft and reopen this window.",
                                 juce::dontSendNotification);
            addAndMakeVisible (statusLabel);
        }

        setResizable (true, true);
        setSize (1100, 700);

        // The DAW reopened the window; which part's editor was open survived in the service.
        owner.getService().reassertEditorPane();

        // The processor owns the pump now (Stage 7): automation, captured notes and scene
        // landings must be applied whether or not this window exists. The editor keeps a
        // timer only to keep the WebView's own repaint cadence honest.
        startTimerHz (30);
    }

    ~HostPluginEditor() override
    {
        stopTimer();
        // Detach before members die: the service keeps its editor intent, but its hooks must
        // stop pointing at a pane that is about to go. The pane's own destructor then
        // destroys any hosted editor — before its processor, which lives on in the service.
        owner.getService().setEditorPaneHooks ({});
    }

    void emitEvent (const juce::String& eventName, const juce::var& payload)
    {
        if (webView != nullptr)
            webView->emitEventIfBrowserIsVisible (eventName, payload);
    }

    void resized() override
    {
        auto area = getLocalBounds();

        if (editorPane.isVisible())
        {
            const auto paneWidth = juce::jlimit (280, juce::jmax (280, area.getWidth() / 2),
                                                 editorPane.preferredWidth());
            editorPane.setBounds (area.removeFromRight (paneWidth));
        }

        if (webView != nullptr)
            webView->setBounds (area);

        statusLabel.setBounds (getLocalBounds());
    }

private:
    void timerCallback() override { owner.getService().drainParameterEvents(); }

    HostPluginProcessor& owner;
    std::unique_ptr<juce::WebBrowserComponent> webView;
    juce::Label statusLabel;   // only ever visible when WebView2 could not start
    PluginEditorHost editorPane;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HostPluginEditor)
};

// ------------------------------------------------------------------------------- the processor

HostPluginProcessor::HostPluginProcessor()
    : juce::AudioProcessor (BusesProperties()
          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
          // Multi-output where justified (§18.9.3): a multi-timbral rack in a DAW wants its
          // parts on their own channels. The aux pairs are declared but disabled by default,
          // so a plain stereo project sees a plain stereo instrument.
          .withOutput ("Out 3-4", juce::AudioChannelSet::stereo(), false)
          .withOutput ("Out 5-6", juce::AudioChannelSet::stereo(), false)
          .withOutput ("Out 7-8", juce::AudioChannelSet::stereo(), false))
{
    formatManager.addFormat (new juce::VST3PluginFormat());
    addProductParameters();

    InstrumentHostService::Options options;

    // The same per-user product directory as the standalone: one catalogue, one scan-path
    // list, whichever wrapper scanned. The SESSION file is deliberately not shared —
    // persistSession=false keeps the rack in the DAW's project chunk instead.
    options.dataDirectory = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                .getChildFile ("CEditorInstrumentHost");
    options.workerExecutable = findHostScannerWorker ({ options.dataDirectory });
    options.factoryPerformanceFile = findFactoryPerformance();

    options.emit = [this, aliveToken = alive] (const juce::String& eventName, const juce::var& payload)
    {
        // May fire from the scan thread; callAsync marshals, the token guards the gap between
        // this processor dying and the queued lambda running.
        juce::MessageManager::callAsync ([this, aliveToken, eventName, payload]
        {
            if (! aliveToken->load())
                return;

            if (auto* editor = dynamic_cast<HostPluginEditor*> (getActiveEditor()))
                editor->emitEvent (eventName, payload);
        });
    };

    options.pickDirectory = [this, aliveToken = alive] (std::function<void (const juce::String&)> done)
    {
        fileChooser = std::make_unique<juce::FileChooser> (
            "Add VST3 Scan Folder",
            juce::File::getSpecialLocation (juce::File::userHomeDirectory));
        fileChooser->launchAsync (
            juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectDirectories,
            [aliveToken, done] (const juce::FileChooser& fc)
            {
                if (! aliveToken->load())
                    return;
                const auto result = fc.getResult();
                done (result == juce::File() ? juce::String() : result.getFullPathName());
            });
    };

    options.instantiate = makePluginInstantiator (formatManager);
    options.applyVstPreset = applyVstPresetFile;
    options.enableAudio = false;    // the DAW owns the device
    options.persistSession = false; // the DAW owns the session (get/setStateInformation)

    service = std::make_unique<InstrumentHostService> (std::move (options));

    // The DAW's clock is the clock, from the first block — the transport follows the playhead
    // exactly as it follows a MIDI master, and there is still only one of it.
    service->getEngine().getTransport().setHostSyncEnabled (true);

    startTimerHz (30);
}

HostPluginProcessor::~HostPluginProcessor()
{
    stopTimer();
    *alive = false;
}

void HostPluginProcessor::addProductParameters()
{
    // Order is the contract. These indices are what a DAW writes into its project file, so
    // they are fixed here once and never reordered — a macro that does not exist yet still
    // owns its slot, because a stable surface is the whole point (§18.9.3).
    for (int i = 0; i < InstrumentHostService::exposedMacroCount; ++i)
    {
        auto* parameter = new juce::AudioParameterFloat (
            juce::ParameterID { "macro" + juce::String (i + 1), 1 },
            "Macro " + juce::String (i + 1), 0.0f, 1.0f, 0.0f);
        macroParams[(size_t) i] = parameter;
        addParameter (parameter);
    }

    sceneParam = new juce::AudioParameterInt (juce::ParameterID { "scene", 1 }, "Scene",
                                              0, 32, 0);
    addParameter (sceneParam);

    masterLevelParam = new juce::AudioParameterFloat (juce::ParameterID { "masterLevel", 1 },
                                                      "Master Level", 0.0f, 2.0f, 1.0f);
    addParameter (masterLevelParam);
}

void HostPluginProcessor::timerCallback()
{
    // One pump for everything the message thread owes the engine: automation values, captured
    // notes, scene landings, and the DAW's own parameter moves.
    service->drainParameterEvents();
    syncProductParameters();

    const auto latency = service->reportedLatencySamples();
    if (latency != lastReportedLatency)
    {
        lastReportedLatency = latency;
        setLatencySamples (latency);
    }
}

void HostPluginProcessor::syncProductParameters()
{
    for (int i = 0; i < InstrumentHostService::exposedMacroCount; ++i)
    {
        auto* parameter = macroParams[(size_t) i];
        if (parameter == nullptr)
            continue;

        const auto hostValue = parameter->get();
        const auto rackValue = service->exposedMacroValue (i);

        // Whoever moved last wins, and the other side follows: the DAW's automation writes
        // into the rack, and a macro moved in the UI writes back so the host's lane shows it.
        if (std::abs (hostValue - lastMacroValues[(size_t) i]) > 1.0e-4f)
        {
            lastMacroValues[(size_t) i] = hostValue;
            service->setExposedMacroValue (i, hostValue);
        }
        else if (std::abs (rackValue - hostValue) > 1.0e-4f)
        {
            lastMacroValues[(size_t) i] = rackValue;
            parameter->setValueNotifyingHost (rackValue);
        }
    }

    if (sceneParam != nullptr)
    {
        const auto value = sceneParam->get();
        if (value != lastSceneParamValue)
        {
            lastSceneParamValue = value;
            // 0 is "no scene": a project that never touched the selector must not launch one.
            if (value > 0)
                service->selectSceneByIndex (value - 1);
        }
    }

    if (masterLevelParam != nullptr)
    {
        const auto hostValue = masterLevelParam->get();
        const auto rackValue = service->masterLevel();

        if (std::abs (hostValue - lastMasterLevel) > 1.0e-4f)
        {
            lastMasterLevel = hostValue;
            service->setMasterLevel (hostValue);
        }
        else if (std::abs (rackValue - hostValue) > 1.0e-4f)
        {
            lastMasterLevel = rackValue;
            masterLevelParam->setValueNotifyingHost (
                masterLevelParam->convertTo0to1 (rackValue));
        }
    }
}

double HostPluginProcessor::getTailLengthSeconds() const
{
    // Whatever the loaded instruments and effects claim: a bounce that stops at the last note
    // truncates the reverb the player can hear.
    return service != nullptr ? service->tailLengthSeconds() : 0.0;
}

void HostPluginProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    service->prepareRuntime (sampleRate, samplesPerBlock);

    // A bounce is prepared like anything else, and isNonRealtime() is the only place a host
    // says which kind of run this is — so the offline decision is made here, once per run,
    // rather than guessed at per block.
    const auto offline = isNonRealtime();
    if (offline != lastOfflineState)
    {
        lastOfflineState = offline;
        service->setOfflineRender (offline);
    }

    setLatencySamples (service->reportedLatencySamples());
}

void HostPluginProcessor::releaseResources()
{
    service->releaseRuntime();
}

bool HostPluginProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    if (! layouts.getMainInputChannelSet().isDisabled())
        return false;

    // Every enabled output bus is a stereo pair; disabled aux buses are how a plain stereo
    // project sees a plain stereo instrument.
    for (const auto& bus : layouts.outputBuses)
        if (! bus.isDisabled() && bus != juce::AudioChannelSet::stereo())
            return false;

    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void HostPluginProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    // The host's clock, handed to the one transport before the graph runs. A DAW that exposes
    // no playhead simply never gets here, and the transport keeps its own time.
    if (auto* playHead = getPlayHead())
    {
        if (const auto position = playHead->getPosition())
        {
            const auto tempo = position->getBpm().orFallback (0.0);
            const auto signature = position->getTimeSignature()
                                     .orFallback (juce::AudioPlayHead::TimeSignature {});
            const auto ppq = position->getPpqPosition().orFallback (0.0);
            service->getEngine().getTransport().applyHostPosition (
                tempo, signature.numerator, signature.denominator, ppq, position->getIsPlaying());
        }
    }

    // The rack's graph is the processor. Its own callback lock reconciles this call with
    // message-thread topology edits — identical to what AudioProcessorPlayer does for the
    // standalone, minus the device in the middle.
    service->getGraph().processBlock (buffer, midi);
}

juce::AudioProcessorEditor* HostPluginProcessor::createEditor()
{
    return new HostPluginEditor (*this);
}

const juce::String HostPluginProcessor::getName() const
{
   #ifdef JucePlugin_Name
    return JucePlugin_Name;
   #else
    return "CE Instrument Host";
   #endif
}

void HostPluginProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    // The same JSON the standalone's session file holds. Vendor state is captured through
    // each instrument's own getStateInformation inside captureStateVar.
    const auto json = juce::JSON::toString (service->captureStateVar());
    destData.replaceAll (json.toRawUTF8(), json.getNumBytesAsUTF8());
}

void HostPluginProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (data == nullptr || sizeInBytes <= 0)
        return;

    const auto parsed = juce::JSON::parse (juce::String::fromUTF8 (static_cast<const char*> (data),
                                                                   sizeInBytes));
    if (parsed.isVoid())
        return;

    // Hosts are allowed to deliver project state off the message thread; the service is
    // controlling-thread-only. The var is a value, safe to carry across.
    auto apply = [this, aliveToken = alive, parsed]
    {
        if (aliveToken->load())
            service->restoreFromVar (parsed);
    };

    if (auto* mm = juce::MessageManager::getInstanceWithoutCreating();
        mm != nullptr && mm->isThisTheMessageThread())
        apply();
    else
        juce::MessageManager::callAsync (std::move (apply));
}

} // namespace ceditor::host

// juce_add_plugin's wrapper targets resolve the factory by this exact free function.
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ceditor::host::HostPluginProcessor();
}
