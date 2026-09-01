#include "HostRuntimeShell.h"
#include "ControlSurface/Ctrl49SurfaceBroker.h"
#include "ControlSurface/Ctrl49WindowsEndpoints.h"
#include "ControlSurface/Ctrl49EmbeddedAssets.h"

namespace ceditor::host
{

HostRuntimeShell::HostRuntimeShell()
{
    formatManager.addFormat (new juce::VST3PluginFormat());

    addChildComponent (editorPane);
    editorPane.onLayoutChanged = [this] { resized(); };

    InstrumentHostService::Options options;

    // The generated product's own per-user directory — never CEditor's. Its catalogue, scan
    // paths and session live and die with the product.
    options.dataDirectory = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                .getChildFile ("CEditorInstrumentHost");
    options.workerExecutable = findHostScannerWorker ({ options.dataDirectory });
    options.factoryPerformanceFile = findFactoryPerformance();

    options.emit = [safe = juce::Component::SafePointer<HostRuntimeShell> (this)]
                   (const juce::String& eventName, const juce::var& payload)
    {
        // May fire from the scan thread; callAsync is the marshal, the SafePointer the
        // lifetime guard — a straggler emit after the window closed lands on nothing.
        juce::MessageManager::callAsync ([safe, eventName, payload]
        {
            if (safe != nullptr)
                safe->emitToWebView (eventName, payload);
        });
    };

    options.editorPane.show = [this] (const juce::String& targetId, juce::AudioProcessor& processor,
                                      const juce::String& title)
    {
        // Remembered because the pane itself is told a processor and a title, not who they
        // belong to, and the thumbnail hooks below need to name the class they captured.
        panedTargetId = targetId;
        editorPane.show (processor, title);
    };
    options.editorPane.hide = [this] { editorPane.hide(); };

    options.editorWindows.show = [this] (const juce::String& partId,
                                         juce::AudioProcessor& processor,
                                         const juce::String& title)
    {
        editorWindows.show (partId, processor, title);
    };
    options.editorWindows.close = [this] (const juce::String& partId) { editorWindows.close (partId); };
    options.editorWindows.closeAll = [this] { editorWindows.closeAll(); };

    options.pickDirectory = [this] (std::function<void (const juce::String&)> done)
    {
        fileChooser = std::make_unique<juce::FileChooser> (
            "Add VST3 Scan Folder",
            juce::File::getSpecialLocation (juce::File::userHomeDirectory));
        fileChooser->launchAsync (
            juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectDirectories,
            [done] (const juce::FileChooser& fc)
            {
                const auto result = fc.getResult();
                done (result == juce::File() ? juce::String() : result.getFullPathName());
            });
    };

    options.instantiate = makePluginInstantiator (formatManager);
    options.applyVstPreset = applyVstPresetFile;
    options.enableAudio = true;   // the shell is the Performance Runtime: it owns the device

    service = std::make_unique<InstrumentHostService> (std::move (options));

    // The CTRL49 as the product's front panel: discover, claim, start the display session,
    // then pump — all driven from the same 30 Hz timer that drains parameter events. Without
    // the hardware the broker idles in `searching` at one poll every two seconds.
    {
        namespace surface = ceditor::ctrl49;
        surface::Ctrl49SurfaceBroker::Options surfaceOptions;
        surfaceOptions.discover = &surface::discoverCtrl49WindowsEndpoints;
        surfaceOptions.emit = [safe = juce::Component::SafePointer<HostRuntimeShell> (this)]
                              (const juce::String& eventName, const juce::var& payload)
        {
            // Broker emits happen on the message thread (tick), but the same marshal-and-
            // guard as the service's emit keeps teardown stragglers harmless.
            juce::MessageManager::callAsync ([safe, eventName, payload]
            {
                if (safe != nullptr)
                    safe->emitToWebView (eventName, payload);
            });
        };
        surfaceOptions.pageLua.assign (surface::assets::kKnobPageLua,
                                       surface::assets::kKnobPageLua + surface::assets::kKnobPageLuaSize);
        surfaceOptions.pngAssets.push_back ({ 0x0200,
            surface::Bytes (surface::assets::kKnobStripPng,
                            surface::assets::kKnobStripPng + surface::assets::kKnobStripPngSize) });
        surfaceBroker = std::make_unique<surface::Ctrl49SurfaceBroker> (*service,
                                                                        std::move (surfaceOptions));
    }

    // A floating window's X routes through the service like the pane's close button does.
    editorWindows.onCloseRequested = [this] (const juce::String& partId)
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "closeEditorWindow");
        payload->setProperty ("partId", partId);
        service->handleCommand (juce::var (payload));
    };

    // The pane's close button goes through the service, same as the editor's preview — the
    // WebView's state stays authoritative instead of the pane closing behind its back.
    editorPane.onCloseRequested = [this]
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "closeEditor");
        service->handleCommand (juce::var (payload));
    };

    // Thumbnails: the pane and the floating windows take the picture, the service decides
    // whether it wanted one and where it goes.
    editorPane.shouldCaptureEditor = [this]
    {
        return service != nullptr && service->wantsEditorSnapshot (panedTargetId);
    };
    editorPane.onEditorPictured = [this] (const juce::Image& picture)
    {
        if (service != nullptr)
            service->offerEditorSnapshot (panedTargetId, picture);
    };
    editorWindows.shouldCaptureEditor = [this] (const juce::String& partId)
    {
        return service != nullptr && service->wantsEditorSnapshot (partId);
    };
    editorWindows.onEditorPictured = [this] (const juce::String& partId, const juce::Image& picture)
    {
        if (service != nullptr)
            service->offerEditorSnapshot (partId, picture);
    };

    auto webViewOptions = makeHostWebViewOptions ("CEHost_WebView2",
        [safe = juce::Component::SafePointer<HostRuntimeShell> (this)] (const juce::var& payload)
        {
            if (safe != nullptr && safe->service != nullptr)
                safe->service->handleCommand (payload);
        });

    if (juce::WebBrowserComponent::areOptionsSupported (webViewOptions))
    {
        webView = std::make_unique<juce::WebBrowserComponent> (webViewOptions);
        addAndMakeVisible (*webView);
        webView->goToURL (hostRuntimeStartUrl());
    }
    else
    {
        // An end user's machine without the WebView2 runtime gets told so, not a black
        // window. The installer will carry the bootstrapper; this covers hand-copied builds.
        statusLabel.setJustificationType (juce::Justification::centred);
        statusLabel.setText ("The Microsoft Edge WebView2 runtime is not available.\n"
                             "Install it from Microsoft and start this application again.",
                             juce::dontSendNotification);
        addAndMakeVisible (statusLabel);
    }

    setSize (1100, 700);
    startTimerHz (30);
}

HostRuntimeShell::~HostRuntimeShell()
{
    stopTimer();
    // The pane member is destroyed before the service either way; unhooking first just makes
    // sure nothing the service does during its own teardown reaches a half-dead pane.
    if (service != nullptr)
        service->setEditorPaneHooks ({});
}

void HostRuntimeShell::timerCallback()
{
    if (service != nullptr)
        service->drainParameterEvents();

    if (surfaceBroker != nullptr)
        surfaceBroker->tick();
}

void HostRuntimeShell::emitToWebView (const juce::String& eventName, const juce::var& payload)
{
    if (webView != nullptr)
        webView->emitEventIfBrowserIsVisible (eventName, payload);
}

void HostRuntimeShell::resized()
{
    auto area = getLocalBounds();

    if (editorPane.isVisible())
    {
        // Same clamp as the editor's WebViewHost: the vendor UI's own width, never more than
        // half the window — anything wider scrolls inside the pane's viewport.
        const auto paneWidth = juce::jlimit (280, juce::jmax (280, area.getWidth() / 2),
                                             editorPane.preferredWidth());
        editorPane.setBounds (area.removeFromRight (paneWidth));
    }

    if (webView != nullptr)
        webView->setBounds (area);

    statusLabel.setBounds (getLocalBounds());
}

} // namespace ceditor::host
