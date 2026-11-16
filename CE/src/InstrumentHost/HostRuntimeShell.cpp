#include "HostRuntimeShell.h"
#include "ControlSurface/Ctrl49SurfaceBroker.h"
#include "ControlSurface/Ctrl49Endpoints.h"
#include "ControlSurface/Ctrl49EmbeddedAssets.h"

namespace ceditor::host
{

namespace
{
class RackClosePanel final : public juce::Component
{
public:
    RackClosePanel()
    {
        using namespace ctrl49::assets;
        icon = juce::Drawable::createFromImageData (kHostageIconSvg, kHostageIconSvgSize);
        configureLabel (brand, "HoSTage", 16.0f, true, 0xffff922f);
        configureLabel (heading, "Save rack changes?", 23.0f, true, 0xfff1f4f6);
        configureLabel (description, "Save to reopen this rack with its current plug-in settings. "
                                     "Discard to restore the rack you started with.", 15.0f, false, 0xffcad1d8);
        configureButton (cancel, 0);
        configureButton (discard, 2);
        configureButton (save, 1);
        setSize (450, 218);
    }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (juce::Colour (0xff181e23));
        if (icon != nullptr)
            icon->drawWithin (g, { 20, 12, 36, 36 }, juce::RectanglePlacement::centred, 1.0f);
        g.setColour (juce::Colour (0xff36414a));
        g.drawHorizontalLine (59, 0, (float) getWidth());
        g.drawHorizontalLine (158, 0, (float) getWidth());
    }

    void resized() override
    {
        brand.setBounds (65, 12, getWidth() - 85, 36);
        heading.setBounds (22, 69, getWidth() - 44, 31);
        description.setBounds (22, 101, getWidth() - 44, 47);
        auto buttons = getLocalBounds().reduced (20, 14).removeFromBottom (32);
        save.setBounds (buttons.removeFromRight (98));
        buttons.removeFromRight (8);
        discard.setBounds (buttons.removeFromRight (92));
        cancel.setBounds (buttons.removeFromLeft (78));
    }

private:
    void configureLabel (juce::Label& label, const juce::String& text, float size, bool bold, juce::uint32 colour)
    {
        label.setText (text, juce::dontSendNotification);
        label.setFont (juce::FontOptions (size, bold ? juce::Font::bold : juce::Font::plain));
        label.setColour (juce::Label::textColourId, juce::Colour (colour));
        label.setBorderSize (juce::BorderSize<int> (0));
        addAndMakeVisible (label);
    }

    void configureButton (juce::TextButton& button, int choice)
    {
        button.setColour (juce::TextButton::buttonColourId, juce::Colour (choice == 1 ? 0xffff922f : 0xff303a43));
        button.setColour (juce::TextButton::textColourOffId, juce::Colour (choice == 1 ? 0xff15191d : 0xfff1f4f6));
        button.onClick = [this, choice]
        {
            if (auto* window = findParentComponentOfClass<juce::DialogWindow>())
                window->exitModalState (choice);
        };
        addAndMakeVisible (button);
    }

    std::unique_ptr<juce::Drawable> icon;
    juce::Label brand, heading, description;
    juce::TextButton save { "Save rack" }, discard { "Discard" }, cancel { "Cancel" };
};
}

void HostRuntimeShell::requestClose()
{
    if (closePromptOpen)
        return;

    if (! service->rackChangedForClose())
    {
        const auto result = service->finishRackClose (false);
        if (result.wasOk())
            juce::JUCEApplication::getInstance()->quit();
        else
            juce::NativeMessageBox::showMessageBoxAsync (juce::MessageBoxIconType::WarningIcon,
                "Rack remains open", result.getErrorMessage(), this);
        return;
    }

    closePromptOpen = true;
    juce::DialogWindow::LaunchOptions options;
    options.dialogTitle = "HoSTage";
    options.dialogBackgroundColour = juce::Colour (0xff181e23);
    options.componentToCentreAround = this;
    options.resizable = false;
    options.useNativeTitleBar = false;
    options.content.setOwned (new RackClosePanel());
    auto* dialog = options.create();
    dialog->setTitleBarHeight (0);
    dialog->setContentComponentSize (dialog->getContentComponent()->getWidth(), dialog->getContentComponent()->getHeight());
    dialog->centreAroundComponent (this, dialog->getWidth(), dialog->getHeight());
    dialog->enterModalState (true, juce::ModalCallbackFunction::create (
            [safe = juce::Component::SafePointer<HostRuntimeShell> (this)] (int choice)
            {
                if (safe == nullptr)
                    return;
                safe->closePromptOpen = false;
                if (choice != 1 && choice != 2)
                    return;

                const auto result = safe->service->finishRackClose (choice == 1);
                if (result.wasOk())
                    juce::JUCEApplication::getInstance()->quit();
                else
                    juce::NativeMessageBox::showMessageBoxAsync (juce::MessageBoxIconType::WarningIcon,
                        "Rack remains open", result.getErrorMessage(), safe.getComponent());
            }), true);
}

HostRuntimeShell::HostRuntimeShell()
{
    addChildComponent (editorPane);
    editorPane.onLayoutChanged = [this] { resized(); };

    InstrumentHostService::Options options;

    // The generated product's own per-user directory — never CEditor's, and since each product
    // knows which it is, never another product's (HostageManifest.h). Its catalogue, scan paths
    // and session live and die with the product.
    configureForThisProgram (options);
    const auto keyboardViewFile = options.dataDirectory.getChildFile ("keyboard-view.json");
    options.confirmRackChangesOnClose = true;
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
        editorPane.show (targetId, processor, title);
    };
    options.editorPane.close = [this] (const juce::String& targetId)
    {
        editorPane.close (targetId);
    };
    options.editorPane.closeAll = [this] { editorPane.hide(); };

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

    // The same chooser, filtered to pictures: this is where a plug-in's thumbnail comes from
    // when the vendor shipped none and its editor could not be captured.
    options.pickImage = [this] (std::function<void (const juce::String&)> done)
    {
        fileChooser = std::make_unique<juce::FileChooser> (
            "Choose a picture for this plug-in",
            juce::File::getSpecialLocation (juce::File::userPicturesDirectory),
            "*.png;*.jpg;*.jpeg;*.gif");
        fileChooser->launchAsync (
            juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
            [done] (const juce::FileChooser& fc)
            {
                const auto result = fc.getResult();
                done (result == juce::File() ? juce::String() : result.getFullPathName());
            });
    };

    // A show to bring in (from a stick, a download) or a place to write one (HostShow.h).
    options.pickShowFile = [this] (bool saving, const juce::String& suggestedName,
                                std::function<void (const juce::String&)> done)
    {
        const auto documents = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
        fileChooser = std::make_unique<juce::FileChooser> (
            saving ? "Save the show as" : "Open a show",
            saving && suggestedName.isNotEmpty() ? documents.getChildFile (suggestedName) : documents,
            "*.hostageshow");
        fileChooser->launchAsync (
            saving ? (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                      | juce::FileBrowserComponent::warnAboutOverwriting)
                   : (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles),
            [done] (const juce::FileChooser& fc)
            {
                const auto result = fc.getResult();
                done (result == juce::File() ? juce::String() : result.getFullPathName());
            });
    };

    // Where a player is made (PlayerCreator.h).
    options.pickFolder = [this] (const juce::String& title, std::function<void (const juce::String&)> done)
    {
        fileChooser = std::make_unique<juce::FileChooser> (
            title, juce::File::getSpecialLocation (juce::File::userDocumentsDirectory));
        fileChooser->launchAsync (
            juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectDirectories,
            [done] (const juce::FileChooser& fc)
            {
                const auto result = fc.getResult();
                done (result == juce::File() ? juce::String() : result.getFullPathName());
            });
    };

    const auto liveWorker = findHostLiveWorker ({ options.dataDirectory });
    options.livePluginIsolationAvailable = liveWorker.existsAsFile();
    options.instantiate = makeIsolatedPluginInstantiator (
        liveWorker, options.dataDirectory.getChildFile ("worker-staging"));
    options.applyVstPreset = applyVstPresetFile;

    // The auditioner's two rules: it runs off the controlling thread, and the two things that
    // must NOT happen there — destroying a plug-in instance and writing findings into the
    // library — come back through here. Left unset, the default runs them inline on the
    // auditioner's own thread, which is exactly what a plug-in does not expect.
    options.onControlThread = [] (std::function<void()> work)
    {
        juce::MessageManager::callAsync (std::move (work));
    };
    options.enableAudio = true;   // the shell is the Performance Runtime: it owns the device

    service = std::make_unique<InstrumentHostService> (std::move (options));

    // The CTRL49 as the product's front panel: discover, claim, start the display session,
    // then pump — all driven from the same 30 Hz timer that drains parameter events. Without
    // the hardware the broker idles in `searching` at one poll every two seconds.
    {
        namespace surface = ceditor::ctrl49;
        surface::Ctrl49SurfaceBroker::Options surfaceOptions;
        surfaceOptions.discover = &surface::discoverCtrl49Endpoints;
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
        surfaceOptions.pageLua.assign (surface::assets::kHostagePageLua,
                                       surface::assets::kHostagePageLua + surface::assets::kHostagePageLuaSize);
        surfaceOptions.pngAssets.push_back ({ 0x0200,
            surface::Bytes (surface::assets::kKnobStripPng,
                            surface::assets::kKnobStripPng + surface::assets::kKnobStripPngSize) });
        surfaceOptions.pngAssets.push_back ({ 0x0220,
            surface::Bytes (surface::assets::kLiveKnobsPng,
                            surface::assets::kLiveKnobsPng + surface::assets::kLiveKnobsPngSize) });
        surfaceOptions.pngAssets.push_back ({ 0x0210,
            surface::Bytes (surface::assets::kHostageLogoPng,
                            surface::assets::kHostageLogoPng + surface::assets::kHostageLogoPngSize) });
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
    editorPane.onCloseRequested = [this] (const juce::String& targetId)
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "closeEditor");
        payload->setProperty ("partId", targetId);
        service->handleCommand (juce::var (payload));
    };

    // Thumbnails: the pane and the floating windows take the picture, the service decides
    // whether it wanted one and where it goes.
    editorPane.shouldCaptureEditor = [this] (const juce::String& targetId)
    {
        return service != nullptr && service->wantsEditorSnapshot (targetId);
    };
    editorPane.onEditorPictured = [this] (const juce::String& targetId,
                                          const juce::Image& picture)
    {
        if (service != nullptr)
            service->offerEditorSnapshot (targetId, picture);
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

    webViewOptions = webViewOptions
        .withInitialisationData ("hostKeyboardView", juce::JSON::parse (keyboardViewFile))
        .withEventListener ("saveHostKeyboardView", [keyboardViewFile] (const juce::var& view)
        {
            keyboardViewFile.replaceWithText (juce::JSON::toString (view));
        });

    if (juce::WebBrowserComponent::areOptionsSupported (webViewOptions))
    {
        webView = std::make_unique<ceditor::TrustedWebBrowser> (webViewOptions);
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
