#pragma once

#include <cstring>
#include <optional>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginInstantiator.h"
#include "BinaryData.h" // PlayerWebData — the embedded web bundle (host.html rides in it)

// HostRuntimeShared — the glue both generated Hostage targets share.
//
// The standalone (HostRuntimeShell) and the outer VST3's editor (HostPluginProcessor) each
// stand up the same three pieces: a WebView serving host.html out of the embedded bundle, one
// "instrumentHost" bridge listener feeding an InstrumentHostService, and an isolated VST3
// instantiator backed by the live plug-in worker. Duplicating that glue is how the two targets
// would drift apart — the editor's preview already went through every mistake this file now
// prevents (the callAsync marshal, the description-XML parse, the worker discovery), so both
// wrappers read it from here.
//
// Header-only and app-target-only on purpose: everything in it needs PlayerWebData or
// WebView2, which exist only under CEDITOR_BUILD_APP. The service itself stays testable
// without any of this — these helpers are exactly the part a test replaces with stubs.

namespace ceditor::host
{

// -- serving host.html from the embedded bundle -----------------------------------------------
// Mirror of PlayerHost's providePlayerResource with the entry swapped: Vite emits unique asset
// basenames, so a basename lookup over PlayerWebData is unambiguous and host-path-independent —
// it paints inside any DAW regardless of where the module was loaded from.

inline juce::String hostRuntimeMimeFor (const juce::File& file)
{
    auto ext = file.getFileExtension().toLowerCase();
    if (ext == ".html") return "text/html; charset=utf-8";
    if (ext == ".js" || ext == ".mjs") return "application/javascript; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".json" || ext == ".map") return "application/json; charset=utf-8";
    if (ext == ".svg") return "image/svg+xml";
    if (ext == ".png") return "image/png";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".woff2") return "font/woff2";
    if (ext == ".woff") return "font/woff";
    if (ext == ".ttf") return "font/ttf";
    if (ext == ".wasm") return "application/wasm";
    return "application/octet-stream";
}

inline juce::File hostRuntimeDistFolder()
{
    // Installed layout: web/dist next to the executable (or module).
    auto installed = juce::File::getSpecialLocation (juce::File::currentExecutableFile)
                         .getParentDirectory().getChildFile ("web").getChildFile ("dist");
    if (installed.getChildFile ("host.html").existsAsFile())
        return installed;

    // Build tree: walk up looking for CE/web/dist (or web/dist); the depth differs between
    // the standalone and the plugin bundle, so don't assume a fixed number of parents.
    auto dir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
    for (int i = 0; i < 8 && dir.getFullPathName().isNotEmpty(); ++i)
    {
        for (auto candidate : { dir.getChildFile ("CE").getChildFile ("web").getChildFile ("dist"),
                                dir.getChildFile ("web").getChildFile ("dist") })
            if (candidate.getChildFile ("host.html").existsAsFile())
                return candidate;

        auto parent = dir.getParentDirectory();
        if (parent == dir) break;
        dir = parent;
    }
    return installed;
}

inline std::optional<juce::WebBrowserComponent::Resource>
provideHostRuntimeResource (const juce::String& rawPath)
{
    auto path = rawPath.upToFirstOccurrenceOf ("?", false, false)
                       .upToFirstOccurrenceOf ("#", false, false);
    if (path.isEmpty() || path == "/") path = "/host.html";
    if (path.contains ("..")) return std::nullopt;
    auto basename = path.fromLastOccurrenceOf ("/", false, false);
    if (basename.isEmpty()) basename = "host.html";
    const auto mimeName = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile (basename);

    auto makeResource = [] (const void* data, size_t size, juce::String mime)
    {
        std::vector<std::byte> bytes (size);
        if (size > 0) std::memcpy (bytes.data(), data, size);
        return juce::WebBrowserComponent::Resource { std::move (bytes), std::move (mime) };
    };

    for (int i = 0; i < PlayerWebData::namedResourceListSize; ++i)
    {
        if (juce::String (PlayerWebData::originalFilenames[i]) == basename)
        {
            int size = 0;
            if (auto* data = PlayerWebData::getNamedResource (PlayerWebData::namedResourceList[i], size))
                return makeResource (data, (size_t) size, hostRuntimeMimeFor (mimeName));
        }
    }

    // Fallback: filesystem dist (dev / build tree) if the bundle wasn't embedded.
    auto file = hostRuntimeDistFolder().getChildFile (basename);
    if (file.existsAsFile())
    {
        juce::MemoryBlock blk;
        if (file.loadFileAsData (blk))
            return makeResource (blk.getData(), blk.getSize(), hostRuntimeMimeFor (file));
    }
    return std::nullopt;
}

// -- the WebView, slimmed to one listener ------------------------------------------------------
// The runtime page speaks the same protocol the editor's preview does: one "instrumentHost"
// event in, the instrumentHost* events out. `onCommand` receives the payload already marshalled
// to the message thread; the caller guards its own lifetime (SafePointer or an owned service).

inline juce::WebBrowserComponent::Options
makeHostWebViewOptions (const juce::String& userDataFolderName,
                        std::function<void (const juce::var& payload)> onCommand)
{
    static std::atomic<int> instanceCounter { 0 };

    const auto userDataFolder = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile (userDataFolderName)
        .getChildFile (juce::String::toHexString (juce::Time::getHighResolutionTicks())
                       + "_" + juce::String (++instanceCounter));

    auto webview2Options = juce::WebBrowserComponent::Options::WinWebView2()
        .withBackgroundColour (juce::Colour (0xFF1E1E1E))
        .withStatusBarDisabled()
        .withUserDataFolder (userDataFolder);

    auto options = juce::WebBrowserComponent::Options()
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withWinWebView2Options (webview2Options)
        .withNativeIntegrationEnabled()
        .withEventListener ("instrumentHost", [handler = std::move (onCommand)] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([handler, payload] { handler (payload); });
        });

   #if defined(CEDITOR_DEV_MODE) && CEDITOR_DEV_MODE
    return options.withResourceProvider ([] (const auto& p) { return provideHostRuntimeResource (p); },
                                         juce::String ("http://localhost:5173"));
   #else
    return options.withResourceProvider ([] (const auto& p) { return provideHostRuntimeResource (p); });
   #endif
}

inline juce::String hostRuntimeStartUrl()
{
   #if defined(CEDITOR_DEV_MODE) && CEDITOR_DEV_MODE
    return "http://localhost:5173/host.html";
   #else
    return juce::WebBrowserComponent::getResourceProviderRoot();
   #endif
}

// -- finding the factory rack ------------------------------------------------------------------
// The Host Project's authored Performance ships as factory-performance.json: beside the
// standalone's exe, and in the VST3 bundle's Contents/Resources (the SDK's own place for
// things that are not the binary — the same convention the panel sidecar uses). Missing is
// fine: a product built without a saved rack starts empty.

inline juce::File findFactoryPerformance()
{
    const auto moduleDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile)
                               .getParentDirectory();

    for (const auto& candidate : { moduleDir.getChildFile ("factory-performance.json"),
                                   moduleDir.getParentDirectory().getChildFile ("Resources")
                                            .getChildFile ("factory-performance.json") })
        if (candidate.existsAsFile())
            return candidate;

    return {};
}

// -- finding the scanner worker ----------------------------------------------------------------
// The generated product ships CEditorPluginScanner beside its binaries, same as the editor
// does; a dev build finds it in the build tree. A path that resolves to nothing is fine to
// hand over — the coordinator pre-checks existence and reports "scanner worker not found"
// instead of blaming a module.

inline juce::File findHostWorkerNamed (const juce::String& workerName,
                                       const juce::Array<juce::File>& extraDirectories = {})
{
    // For the standalone this is the exe's directory; for a plug-in JUCE resolves it to the
    // loaded module, so "beside the binary" covers both installs.
    const auto moduleDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile)
                               .getParentDirectory();

    juce::Array<juce::File> candidates;
    candidates.add (moduleDir.getChildFile (workerName));
    for (const auto& dir : extraDirectories)
        candidates.add (dir.getChildFile (workerName));

    // Build tree: the helper lands in build/native/<Config>/ while target artefacts nest in
    // <Target>_artefacts/<Config>/ (plug-ins one level deeper again), so walk up a few levels
    // looking for a sibling of the same config name.
    auto dir = moduleDir;
    for (int i = 0; i < 4; ++i)
    {
        auto parent = dir.getParentDirectory();
        if (parent == dir) break;
        candidates.add (parent.getChildFile (moduleDir.getFileName()).getChildFile (workerName));
        dir = parent;
    }

    for (const auto& candidate : candidates)
        if (candidate.existsAsFile())
            return candidate;

    return candidates.getFirst();
}

inline juce::File findHostScannerWorker (const juce::Array<juce::File>& extraDirectories = {})
{
   #if JUCE_WINDOWS
    return findHostWorkerNamed ("CEditorPluginScanner.exe", extraDirectories);
   #else
    return findHostWorkerNamed ("CEditorPluginScanner", extraDirectories);
   #endif
}

inline juce::File findHostLiveWorker (const juce::Array<juce::File>& extraDirectories = {})
{
   #if JUCE_WINDOWS
    return findHostWorkerNamed ("CEditorPluginWorker.exe", extraDirectories);
   #else
    return findHostWorkerNamed ("CEditorPluginWorker", extraDirectories);
   #endif
}

} // namespace ceditor::host
