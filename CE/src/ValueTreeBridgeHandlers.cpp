#include "ValueTreeBridge.h"
#include "AppSettings.h"

namespace
{
juce::String perfFileLabel (const juce::String& path)
{
    return juce::File (path).getFileName().isNotEmpty() ? juce::File (path).getFileName() : path;
}
}

juce::WebBrowserComponent::Options ValueTreeBridge::buildOptions (const juce::WebBrowserComponent::Options& base)
{
    auto options = base
        .withNativeIntegrationEnabled()
        .withEventListener ("setProperty", [this] (const juce::var& payload)
        {
            if (auto* obj = payload.getDynamicObject())
            {
                auto path = obj->getProperty ("path").toString();
                auto value = obj->getProperty ("value");

                juce::MessageManager::callAsync ([this, path, value]()
                {
                    suppressOutgoing = true;
                    setPropertyFromPath (path, value);
                    suppressOutgoing = false;
                });
            }
        })
        .withEventListener ("requestFullState", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]() { pushFullState(); });
        })
        .withEventListener ("undo", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                undoManager.undo();
            });
        })
        .withEventListener ("redo", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                undoManager.redo();
            });
        })
        .withEventListener ("closeApplication", [] (const juce::var&)
        {
            juce::MessageManager::callAsync ([]()
            {
                juce::JUCEApplication::getInstance()->systemRequestedQuit();
            });
        })
        .withEventListener ("savePanelAs", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto panelId = payloadObj->getProperty ("panelId").toString();
                auto jsonData = payloadObj->getProperty ("data").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Save Panel As",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanel");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::warnAboutOverwriting,
                    [this, panelId, jsonData] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File())
                            return;

                        auto file = result.withFileExtension ("cepanel");
                        file.replaceWithText (jsonData);

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("panelId", panelId);
                        obj->setProperty ("filePath", file.getFullPathName());
                        obj->setProperty ("name", file.getFileNameWithoutExtension());

                        browser->emitEventIfBrowserIsVisible ("panelSaved", juce::var (obj));
                    });
            });
        })
        .withEventListener ("savePanel", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = payload.getDynamicObject();
                if (obj == nullptr)
                    return;

                auto panelId = obj->getProperty ("panelId").toString();
                auto filePath = obj->getProperty ("filePath").toString();
                auto jsonData = obj->getProperty ("data").toString();

                juce::File file (filePath);
                file.replaceWithText (jsonData);

                auto* resp = new juce::DynamicObject();
                resp->setProperty ("panelId", panelId);
                resp->setProperty ("filePath", filePath);

                browser->emitEventIfBrowserIsVisible ("panelSaved", juce::var (resp));
            });
        })
        .withEventListener ("openPanel", [this] (const juce::var&)
        {
            auto requestStartMs = juce::Time::getMillisecondCounterHiRes();
            emitPerfDebug ("openPanel event received");
            juce::MessageManager::callAsync ([this, requestStartMs]()
            {
                if (browser == nullptr)
                    return;

                emitPerfDebug ("openPanel creating file chooser after "
                               + juce::String (juce::Time::getMillisecondCounterHiRes() - requestStartMs, 1) + "ms");
                fileChooser = std::make_unique<juce::FileChooser> (
                    "Open Panel",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanel");

                emitPerfDebug ("openPanel launching async file chooser");
                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this, requestStartMs] (const juce::FileChooser& fc)
                    {
                        auto callbackElapsedMs = juce::Time::getMillisecondCounterHiRes() - requestStartMs;
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                        {
                            emitPerfDebug ("openPanel chooser closed without file after " + juce::String (callbackElapsedMs, 1) + "ms");
                            return;
                        }

                        emitPerfDebug ("openPanel chooser selected " + perfFileLabel (result.getFullPathName())
                                       + " after " + juce::String (callbackElapsedMs, 1) + "ms");
                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("filePath", result.getFullPathName());
                        obj->setProperty ("name", result.getFileNameWithoutExtension());
                        obj->setProperty ("byteSize", (juce::int64) result.getSize());
                        obj->setProperty ("deferredData", true);

                        emitPerfDebug ("openPanel before emit panelOpened " + perfFileLabel (result.getFullPathName())
                                       + " bytes=" + juce::String ((juce::int64) result.getSize())
                                       + " total=" + juce::String (juce::Time::getMillisecondCounterHiRes() - requestStartMs, 1) + "ms");
                        auto emitStartMs = juce::Time::getMillisecondCounterHiRes();
                        browser->emitEventIfBrowserIsVisible ("panelOpened", juce::var (obj));
                        emitPerfDebug ("openPanel after emit panelOpened " + perfFileLabel (result.getFullPathName())
                                       + " emitCall=" + juce::String (juce::Time::getMillisecondCounterHiRes() - emitStartMs, 1) + "ms");
                    });
            });
        })
        .withEventListener ("openPanelFile", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto filePath = payloadObj->getProperty ("filePath").toString();
                juce::File file (filePath);
                auto requestStartMs = juce::Time::getMillisecondCounterHiRes();
                emitPerfDebug ("openPanelFile received " + perfFileLabel (filePath));

                if (! file.existsAsFile())
                {
                    emitPerfDebug ("openPanelFile missing file " + filePath);
                    return;
                }

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("filePath", filePath);
                obj->setProperty ("name", file.getFileNameWithoutExtension());
                obj->setProperty ("byteSize", (juce::int64) file.getSize());
                obj->setProperty ("deferredData", true);

                emitPerfDebug ("openPanelFile before emit panelOpened " + perfFileLabel (filePath)
                               + " bytes=" + juce::String ((juce::int64) file.getSize())
                               + " total=" + juce::String (juce::Time::getMillisecondCounterHiRes() - requestStartMs, 1) + "ms");
                auto emitStartMs = juce::Time::getMillisecondCounterHiRes();
                browser->emitEventIfBrowserIsVisible ("panelOpened", juce::var (obj));
                emitPerfDebug ("openPanelFile after emit panelOpened " + perfFileLabel (filePath)
                               + " emitCall=" + juce::String (juce::Time::getMillisecondCounterHiRes() - emitStartMs, 1) + "ms");
            });
        })
        .withEventListener ("requestFileInfo", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto filePath = payloadObj->getProperty ("filePath").toString();
                juce::File file (filePath);

                if (! file.existsAsFile())
                    return;

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("filePath", filePath);
                obj->setProperty ("size", (juce::int64) file.getSize());
                obj->setProperty ("created", file.getCreationTime().toISO8601 (true));
                obj->setProperty ("modified", file.getLastModificationTime().toISO8601 (true));

                browser->emitEventIfBrowserIsVisible ("fileInfo", juce::var (obj));
            });
        })
        .withEventListener ("requestFileData", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();
                auto filePath = payloadObj->getProperty ("filePath").toString();

                juce::File file (filePath);
                if (! file.existsAsFile())
                {
                    emitPerfDebug ("requestFileData missing file " + filePath);
                    return;
                }

                auto requestStartMs = juce::Time::getMillisecondCounterHiRes();
                emitPerfDebug ("requestFileData start " + perfFileLabel (filePath));

                auto readStartMs = juce::Time::getMillisecondCounterHiRes();
                juce::MemoryBlock mb;
                file.loadFileAsData (mb);
                auto readDurationMs = juce::Time::getMillisecondCounterHiRes() - readStartMs;

                auto encodeStartMs = juce::Time::getMillisecondCounterHiRes();
                auto base64 = juce::Base64::toBase64 (mb.getData(), mb.getSize());
                auto encodeDurationMs = juce::Time::getMillisecondCounterHiRes() - encodeStartMs;

                auto ext = file.getFileExtension().toLowerCase();
                juce::String mimeType = "image/png";
                if (ext == ".jpg" || ext == ".jpeg") mimeType = "image/jpeg";
                else if (ext == ".gif") mimeType = "image/gif";
                else if (ext == ".bmp") mimeType = "image/bmp";
                else if (ext == ".svg") mimeType = "image/svg+xml";
                else if (ext == ".webp") mimeType = "image/webp";
                else if (ext == ".json" || ext == ".cepanel") mimeType = "application/json";
                else if (ext == ".ttf") mimeType = "font/ttf";
                else if (ext == ".otf") mimeType = "font/otf";
                else if (ext == ".woff") mimeType = "font/woff";
                else if (ext == ".woff2") mimeType = "font/woff2";

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("requestId", requestId);
                obj->setProperty ("data", "data:" + mimeType + ";base64," + base64);
                obj->setProperty ("mimeType", mimeType);
                obj->setProperty ("byteSize", (juce::int64) mb.getSize());
                obj->setProperty ("readMs", readDurationMs);
                obj->setProperty ("encodeMs", encodeDurationMs);

                emitPerfDebug ("requestFileData done " + perfFileLabel (filePath)
                               + " bytes=" + juce::String ((juce::int64) mb.getSize())
                               + " read=" + juce::String (readDurationMs, 1) + "ms"
                               + " encode=" + juce::String (encodeDurationMs, 1) + "ms"
                               + " total=" + juce::String (juce::Time::getMillisecondCounterHiRes() - requestStartMs, 1) + "ms");
                emitPerfDebug ("requestFileData before emit " + perfFileLabel (filePath));
                auto emitStartMs = juce::Time::getMillisecondCounterHiRes();
                browser->emitEventIfBrowserIsVisible ("fileData", juce::var (obj));
                emitPerfDebug ("requestFileData after emit " + perfFileLabel (filePath)
                               + " emitCall=" + juce::String (juce::Time::getMillisecondCounterHiRes() - emitStartMs, 1) + "ms");
            });
        })
        .withEventListener ("renderFontPreview", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();
                auto fontData = payloadObj->getProperty ("fontData").toString();
                auto familyName = payloadObj->getProperty ("familyName").toString();
                auto styleName = payloadObj->getProperty ("styleName").toString();
                auto text = payloadObj->getProperty ("text").toString();
                auto width = (int) payloadObj->getProperty ("width");
                auto height = (int) payloadObj->getProperty ("height");
                auto fontSize = (double) payloadObj->getProperty ("fontSize");
                auto colourHex = payloadObj->getProperty ("colour").toString();
                auto justification = payloadObj->getProperty ("justification").toString();
                auto paddingLeft = (int) payloadObj->getProperty ("paddingLeft");
                auto paddingRight = (int) payloadObj->getProperty ("paddingRight");
                auto paddingTop = (int) payloadObj->getProperty ("paddingTop");
                auto paddingBottom = (int) payloadObj->getProperty ("paddingBottom");
                auto offsetX = (int) payloadObj->getProperty ("offsetX");
                auto offsetY = (int) payloadObj->getProperty ("offsetY");
                auto letterSpacing = (double) payloadObj->getProperty ("letterSpacing");
                auto italic = (bool) payloadObj->getProperty ("italic");
                auto underline = (bool) payloadObj->getProperty ("underline");
                auto renderStartMs = juce::Time::getMillisecondCounterHiRes();
                emitPerfDebug ("renderFontPreview start " + requestId + " textChars=" + juce::String (text.length()));

                auto* response = new juce::DynamicObject();
                response->setProperty ("requestId", requestId);

                auto dataUrl = renderFontPreviewDataUrl (fontData,
                                                         familyName,
                                                         styleName,
                                                         text,
                                                         width,
                                                         height,
                                                         (float) fontSize,
                                                         colourHex,
                                                         justification,
                                                         paddingLeft,
                                                         paddingRight,
                                                         paddingTop,
                                                         paddingBottom,
                                                         offsetX,
                                                         offsetY,
                                                         (float) letterSpacing,
                                                         italic,
                                                         underline);

                if (dataUrl.isNotEmpty())
                    response->setProperty ("data", dataUrl);
                else
                    response->setProperty ("error", "Failed to render font preview");

                emitPerfDebug ("renderFontPreview done " + requestId
                               + " total=" + juce::String (juce::Time::getMillisecondCounterHiRes() - renderStartMs, 1) + "ms"
                               + (dataUrl.isNotEmpty() ? "" : " error=true"));
                browser->emitEventIfBrowserIsVisible ("fontPreviewRendered", juce::var (response));
            });
        })
        .withEventListener ("browseImage", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Select Image",
                    juce::File::getSpecialLocation (juce::File::userPicturesDirectory),
                    "*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.svg;*.webp");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this, requestId] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("requestId", requestId);
                        obj->setProperty ("filePath", result.getFullPathName());

                        browser->emitEventIfBrowserIsVisible ("imageBrowsed", juce::var (obj));
                    });
            });
        })
        .withEventListener ("loadOpenPanels", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr || appSettings == nullptr)
                    return;

                auto paths = appSettings->getOpenPanelPaths();
                juce::Array<juce::var> arr;

                for (const auto& path : paths)
                    arr.add (path);

                browser->emitEventIfBrowserIsVisible ("openPanelPaths", arr);
            });
        })
        .withEventListener ("updateOpenPanels", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (appSettings == nullptr)
                    return;

                juce::StringArray paths;

                if (auto* arr = payload.getArray())
                {
                    for (const auto& item : *arr)
                        paths.add (item.toString());
                }

                appSettings->setOpenPanelPaths (paths);
            });
        })
        .withEventListener ("loadAppSettings", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr || appSettings == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("appSettingsLoaded",
                                                      appSettings->getAppSettingsData());
            });
        })
        .withEventListener ("updateAppSettings", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (appSettings == nullptr)
                    return;

                appSettings->setAppSettingsData (payload);
            });
        })
        .withEventListener ("setPerfDebugEnabled", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                perfDebugEnabled = (bool) payload;
                emitPerfDebug (juce::String ("native perf logging ") + (perfDebugEnabled ? "enabled" : "disabled"));
            });
        })
        .withEventListener ("listDeviceProfiles", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("profiles", deviceProfileService.listProfiles());
                browser->emitEventIfBrowserIsVisible ("deviceProfilesListed", juce::var (obj));
            });
        })
        .withEventListener ("importDeviceProfile", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Import Device Profile",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.ceditor-device;*.ceditor-device.json;*.json");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this] (const juce::FileChooser& fc)
                    {
                        if (browser == nullptr)
                            return;

                        auto file = fc.getResult();
                        if (file == juce::File())
                            return;

                        auto result = deviceProfileService.loadProfileFromFile (file);
                        browser->emitEventIfBrowserIsVisible ("deviceProfileImported", result);

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("profiles", deviceProfileService.listProfiles());
                        browser->emitEventIfBrowserIsVisible ("deviceProfilesListed", juce::var (obj));
                        browser->emitEventIfBrowserIsVisible ("deviceDiagnostics",
                                                              deviceProfileService.getDiagnostics());
                    });
            });
        })
        .withEventListener ("getDeviceProfileSource", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("deviceProfileSource",
                                                      deviceProfileService.getProfileSource (payload));
            });
        })
        .withEventListener ("validateDeviceProfileSource", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("deviceProfileSourceValidated",
                                                      deviceProfileService.validateProfileSource (payload));
            });
        })
        .withEventListener ("saveDeviceProfileSource", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto result = deviceProfileService.saveProfileSource (payload);
                browser->emitEventIfBrowserIsVisible ("deviceProfileSourceSaved", result);

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("profiles", deviceProfileService.listProfiles());
                browser->emitEventIfBrowserIsVisible ("deviceProfilesListed", juce::var (obj));
                browser->emitEventIfBrowserIsVisible ("deviceDiagnostics",
                                                      deviceProfileService.getDiagnostics());
            });
        })
        .withEventListener ("setDeviceRoleMapping", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("deviceRoleMappingSet",
                                                      deviceProfileService.setDeviceRoleMapping (payload));
            });
        })
        .withEventListener ("listProfileParameters", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("profileParametersListed",
                                                       deviceProfileService.listProfileParameters (payload));
            });
        })
        .withEventListener ("getProfileParameterDetail", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("profileParameterDetail",
                                                      deviceProfileService.getProfileParameterDetail (payload));
            });
        })
        .withEventListener ("saveProfileParameterDetail", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("profileParameterDetailSaved",
                                                      deviceProfileService.saveProfileParameterDetail (payload));
            });
        })
        .withEventListener ("listMidiDestinations", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("destinations", deviceProfileService.listMidiDestinations());
                browser->emitEventIfBrowserIsVisible ("midiDestinationsListed", juce::var (obj));
            });
        })
        .withEventListener ("compileParameterMessage", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("midiPreview",
                                                      deviceProfileService.compileParameterMessage (payload, false));
            });
        })
        .withEventListener ("setDeviceParameter", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto result = deviceProfileService.compileParameterMessage (payload, true);
                browser->emitEventIfBrowserIsVisible ("deviceParameterSet", result);
                browser->emitEventIfBrowserIsVisible ("midiPreview", result);
                browser->emitEventIfBrowserIsVisible ("midiMonitorEvents", deviceProfileService.getMonitorEvents());
            });
        })
        .withEventListener ("compileRawMidiAction", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("rawMidiPreview",
                                                      deviceProfileService.compileRawMidiAction (payload, false));
            });
        })
        .withEventListener ("triggerRawMidiAction", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto result = deviceProfileService.compileRawMidiAction (payload, true);
                browser->emitEventIfBrowserIsVisible ("rawMidiActionTriggered", result);
                browser->emitEventIfBrowserIsVisible ("rawMidiPreview", result);
                browser->emitEventIfBrowserIsVisible ("midiMonitorEvents", deviceProfileService.getMonitorEvents());
            });
        })
        .withEventListener ("parseDumpMessage", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("dumpMessageParsed",
                                                      deviceProfileService.parseDumpMessage (payload, true));
                browser->emitEventIfBrowserIsVisible ("deviceRuntimeState",
                                                      deviceProfileService.getRuntimeState());
                browser->emitEventIfBrowserIsVisible ("midiMonitorEvents",
                                                      deviceProfileService.getMonitorEvents());
            });
        })
        .withEventListener ("runDeviceProfileTests", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("deviceProfileTestsFinished",
                                                      deviceProfileService.runProfileTests (payload));
            });
        })
        .withEventListener ("getDeviceRuntimeState", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("deviceRuntimeState",
                                                      deviceProfileService.getRuntimeState());
            });
        })
        .withEventListener ("getMidiMonitorEvents", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("midiMonitorEvents",
                                                      deviceProfileService.getMonitorEvents());
            });
        })
        .withEventListener ("getDeviceDiagnostics", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("deviceDiagnostics",
                                                      deviceProfileService.getDiagnostics());
            });
        })
        .withEventListener ("importFonts", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Import Fonts",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.ttf;*.otf;*.woff;*.woff2");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode
                        | juce::FileBrowserComponent::canSelectFiles
                        | juce::FileBrowserComponent::canSelectMultipleItems,
                    [this] (const juce::FileChooser& fc)
                    {
                        auto results = fc.getResults();
                        if (results.isEmpty())
                            return;

                        juce::Array<juce::var> importedFonts;

                        for (const auto& file : results)
                        {
                            if (! file.existsAsFile())
                                continue;

                            auto fileName = file.getFileName();
                            auto lowerName = fileName.toLowerCase();
                            auto supportsWeight = lowerName.contains ("variable")
                                || lowerName.contains ("wght")
                                || lowerName.contains ("vf");

                            auto* obj = new juce::DynamicObject();
                            obj->setProperty ("filePath", file.getFullPathName());
                            obj->setProperty ("fileName", fileName);
                            obj->setProperty ("family", file.getFileNameWithoutExtension());
                            obj->setProperty ("supportsWeight", supportsWeight);
                            importedFonts.add (juce::var (obj));
                        }

                        if (! importedFonts.isEmpty())
                            browser->emitEventIfBrowserIsVisible ("fontsImported",
                                                                  juce::var (importedFonts));
                    });
            });
        });

    return options;
}
