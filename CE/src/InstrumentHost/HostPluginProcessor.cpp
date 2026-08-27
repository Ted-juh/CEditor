#include "HostPluginProcessor.h"

namespace ceditor::host
{

// ---------------------------------------------------------------------------------- the editor

// The DAW-owned window: host.html in a WebView plus the native editor pane, wired to the
// processor's long-lived service for exactly as long as this component exists. All the state
// lives in the service; this class only attaches presentation and detaches it again.
class HostPluginEditor final : public juce::AudioProcessorEditor
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
    }

    ~HostPluginEditor() override
    {
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
    HostPluginProcessor& owner;
    std::unique_ptr<juce::WebBrowserComponent> webView;
    juce::Label statusLabel;   // only ever visible when WebView2 could not start
    PluginEditorHost editorPane;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HostPluginEditor)
};

// ------------------------------------------------------------------------------- the processor

HostPluginProcessor::HostPluginProcessor()
    : juce::AudioProcessor (BusesProperties()
          .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    formatManager.addFormat (new juce::VST3PluginFormat());

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
    options.enableAudio = false;    // the DAW owns the device
    options.persistSession = false; // the DAW owns the session (get/setStateInformation)

    service = std::make_unique<InstrumentHostService> (std::move (options));
}

HostPluginProcessor::~HostPluginProcessor()
{
    *alive = false;
}

void HostPluginProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    service->prepareRuntime (sampleRate, samplesPerBlock);
}

void HostPluginProcessor::releaseResources()
{
    service->releaseRuntime();
}

bool HostPluginProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        && layouts.getMainInputChannelSet().isDisabled();
}

void HostPluginProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

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
