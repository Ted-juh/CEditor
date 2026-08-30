#include "ValueTreeBridge.h"
#include "AppSettings.h"
#include "DeviceProfile/DeviceRuntimeBridge.h"
#include "InstrumentHost/InstrumentHostService.h"
#include "InstrumentHost/PluginInstantiator.h"
#include "InstrumentHost/PluginEditorHost.h"
#include "InstrumentHost/FloatingEditorWindows.h"
#include "ControlSurface/Ctrl49SurfaceBroker.h"
#include "ControlSurface/Ctrl49WindowsEndpoints.h"
#include "ControlSurface/Ctrl49EmbeddedAssets.h"
#include "UpdateCheck.h"

#include <juce_audio_processors/juce_audio_processors.h>
#include <cstdlib>

namespace
{
juce::String perfFileLabel (const juce::String& path)
{
    return juce::File (path).getFileName().isNotEmpty() ? juce::File (path).getFileName() : path;
}

// The per-user, writable toolchain root the Node scripts provision into at runtime. The bundled dir
// (tools/toolchains beside the exe) is under Program Files for an installed build and is not writable by
// the non-elevated app, so resolveToolchain.mjs / provision.mjs honour CEDITOR_TOOLCHAIN_DIR and we point
// it at a per-user path here. Lookups still also see the bundled dir, so install-time toolchains resolve.
// Idempotent — cheap to call before every node spawn.
void setToolchainDirEnv()
{
    const auto dir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                        .getChildFile ("CEditor").getChildFile ("toolchains");
    dir.createDirectory();
   #if JUCE_WINDOWS
    _wputenv_s (L"CEDITOR_TOOLCHAIN_DIR", dir.getFullPathName().toWideCharPointer());
   #else
    setenv ("CEDITOR_TOOLCHAIN_DIR", dir.getFullPathName().toRawUTF8(), 1);
   #endif
}

// Locate node.exe for the in-app VST3 build + toolchain management. Prefer a Node bundled beside the app
// (installed builds ship tools/node/node.exe so a clean machine needs no system Node); then a Node on the
// inherited PATH (source-checkout / dev case); then the default installer locations. Empty file = none.
juce::File findNodeExecutable()
{
    const auto exeDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
    for (const auto& base : { exeDir, exeDir.getParentDirectory() })
    {
        const auto bundled = base.getChildFile ("tools").getChildFile ("node").getChildFile ("node.exe");
        if (bundled.existsAsFile())
            return bundled;
    }

    const auto pathVar = juce::SystemStats::getEnvironmentVariable ("PATH", {});
    for (auto& dir : juce::StringArray::fromTokens (pathVar, ";", "\""))
    {
        const auto trimmed = dir.unquoted().trim();
        if (trimmed.isEmpty() || ! juce::File::isAbsolutePath (trimmed))
            continue;
        const auto candidate = juce::File (trimmed).getChildFile ("node.exe");
        if (candidate.existsAsFile())
            return candidate;
    }
    for (auto* p : { "C:\\Program Files\\nodejs\\node.exe",
                     "C:\\Program Files (x86)\\nodejs\\node.exe" })
        if (juce::File (p).existsAsFile())
            return juce::File (p);
    return {};
}
} // namespace

// Installed third-party scripting modules (ce.ext.*), one .cemodule file each. Per-user rather
// than beside the exe, for the same reason the toolchain dir is: an installed build lives under
// Program Files and a non-elevated app cannot write there.
juce::File ValueTreeBridge::scriptModulesDirectory()
{
    return juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
              .getChildFile ("CEditor").getChildFile ("modules");
}

// Hand the WebView every manifest we hold, with the file it came from. Deliberately unvalidated:
// whether a manifest is a legal module depends on the API contract (which names are already taken,
// which words are keywords in Lua), and that contract lives on the web side. A file that is not
// even JSON is reported as a null manifest rather than dropped, so a corrupt install is visible.
void ValueTreeBridge::emitScriptModules() const
{
    juce::Array<juce::var> out;
    const auto dir = scriptModulesDirectory();
    if (dir.isDirectory())
    {
        for (const auto& entry : juce::RangedDirectoryIterator (dir, false, "*.cemodule",
                                                                juce::File::findFiles))
        {
            auto* item = new juce::DynamicObject();
            item->setProperty ("path", entry.getFile().getFullPathName());
            item->setProperty ("manifest", juce::JSON::parse (entry.getFile().loadFileAsString()));
            out.add (juce::var (item));
        }
    }

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("modules", juce::var (out));
    payload->setProperty ("directory", dir.getFullPathName());
    if (browser != nullptr)
        browser->emitEventIfBrowserIsVisible ("scriptModulesListed", juce::var (payload));
}


/**
 * Is the message thread still answering?
 *
 * Every other timer in this file measures work we already suspected — a file read, a base64 encode,
 * a panel decode. That only ever finds the freeze if the freeze is somewhere we thought to look, and
 * twice now it has not been: a startup with no panels to load, seventy-seven milliseconds of logged
 * work, and then a window that stops responding when the user clicks a menu.
 *
 * So this measures the thread rather than the work. A timer that should fire four times a second
 * cannot fire while something else holds the message thread, and the gap it comes back to is exactly
 * how long that something held it. Nothing needs to be instrumented, or even suspected, to show up
 * here — and if the gaps never appear while the window is visibly frozen, that is the answer too:
 * the message thread was fine and the WebView renderer was not.
 *
 * Only alive while perf logging is on, so it costs nothing in normal use.
 */
class MessageThreadStallWatch final : public juce::Timer
{
public:
    explicit MessageThreadStallWatch (std::function<void (double)> reportStall)
        : report (std::move (reportStall))
    {
        lastTickMs = juce::Time::getMillisecondCounterHiRes();
        startTimerHz (4);
    }

private:
    void timerCallback() override
    {
        auto now = juce::Time::getMillisecondCounterHiRes();
        auto gap = now - lastTickMs;
        lastTickMs = now;

        // Well above the 250ms period and any ordinary scheduling jitter, so a report means a stall
        // a person would notice rather than a busy moment.
        if (gap > 1000.0 && report != nullptr)
            report (gap);
    }

    std::function<void (double)> report;
    double lastTickMs = 0.0;
};

/**
 * Runs the VST3 exporter (tools/scripts/export-panel-vst3.mjs) as a child process, polled on the
 * message thread so the UI stays responsive. Each stdout/stderr line is emitted to JS as
 * "buildProgress" { line }; a terminal "buildComplete" { ok, code, message, path } closes it out.
 * Owned by ValueTreeBridge (replaced per build), so `browser` outlives every emit.
 */
class VstBuildJob : public juce::Timer   // public base so unique_ptr<juce::Timer> can own it
{
public:
    VstBuildJob (juce::WebBrowserComponent* browserToUse,
                 const juce::StringArray& command,
                 juce::String exportPathOnSuccess)
        : browser (browserToUse), exportPath (std::move (exportPathOnSuccess))
    {
        emitLine ("$ " + command.joinIntoString (" "));
        if (! process.start (command, juce::ChildProcess::wantStdOut | juce::ChildProcess::wantStdErr))
        {
            emitComplete (false, -1, "Failed to launch node (the build process could not start).");
            return;   // never start the timer — isTimerRunning() stays false, so a retry is allowed
        }
        startTimerHz (8);
    }

private:
    void timerCallback() override
    {
        char buffer[1 << 14];
        for (;;)
        {
            const int n = process.readProcessOutput (buffer, (int) sizeof (buffer));
            if (n <= 0)
                break;
            pending += juce::String::fromUTF8 (buffer, n);
        }
        flushLines (false);

        if (! process.isRunning())
        {
            flushLines (true);
            stopTimer();
            const int code = process.getExitCode();
            emitComplete (code == 0, code,
                          code == 0 ? juce::String ("VST3 export complete.")
                                    : ("Build failed (exit code " + juce::String (code) + ")."));
        }
    }

    void flushLines (bool flushRemainder)
    {
        for (int nl; (nl = pending.indexOfChar ('\n')) >= 0; )
        {
            emitLine (pending.substring (0, nl).trimEnd());
            pending = pending.substring (nl + 1);
        }
        if (flushRemainder && pending.trim().isNotEmpty())
        {
            emitLine (pending.trimEnd());
            pending.clear();
        }
    }

    void emitLine (const juce::String& line)
    {
        if (browser == nullptr || line.isEmpty())
            return;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("line", line);
        browser->emitEventIfBrowserIsVisible ("buildProgress", juce::var (obj));
    }

    void emitComplete (bool ok, int code, const juce::String& message)
    {
        if (browser == nullptr)
            return;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("ok", ok);
        obj->setProperty ("code", code);
        obj->setProperty ("message", message);
        obj->setProperty ("path", ok ? exportPath : juce::String());
        browser->emitEventIfBrowserIsVisible ("buildComplete", juce::var (obj));
    }

    juce::WebBrowserComponent* browser = nullptr;
    juce::ChildProcess process;
    juce::String pending, exportPath;
};

/**
 * Streams a `node tools/toolchains/languages.mjs ensure|remove <lang...>` run (Settings → Scripting
 * Toolchains). Each line -> "toolchainProgress" { line }; terminal -> "toolchainDone" { ok, code }.
 * The JS side then re-requests "toolchainStatus" to refresh the panel. Mirrors VstBuildJob.
 */
class ToolchainJob : public juce::Timer
{
public:
    ToolchainJob (juce::WebBrowserComponent* browserToUse, const juce::StringArray& command)
        : browser (browserToUse)
    {
        emitLine ("$ " + command.joinIntoString (" "));
        if (! process.start (command, juce::ChildProcess::wantStdOut | juce::ChildProcess::wantStdErr))
        {
            emitDone (false, -1);
            return;
        }
        startTimerHz (8);
    }

private:
    void timerCallback() override
    {
        char buffer[1 << 14];
        for (;;)
        {
            const int n = process.readProcessOutput (buffer, (int) sizeof (buffer));
            if (n <= 0) break;
            pending += juce::String::fromUTF8 (buffer, n);
        }
        flushLines (false);
        if (! process.isRunning())
        {
            flushLines (true);
            stopTimer();
            const int code = process.getExitCode();
            emitDone (code == 0, code);
        }
    }

    void flushLines (bool flushRemainder)
    {
        for (int nl; (nl = pending.indexOfChar ('\n')) >= 0; )
        {
            emitLine (pending.substring (0, nl).trimEnd());
            pending = pending.substring (nl + 1);
        }
        if (flushRemainder && pending.trim().isNotEmpty()) { emitLine (pending.trimEnd()); pending.clear(); }
    }

    void emitLine (const juce::String& line)
    {
        if (browser == nullptr || line.isEmpty()) return;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("line", line);
        browser->emitEventIfBrowserIsVisible ("toolchainProgress", juce::var (obj));
    }

    void emitDone (bool ok, int code)
    {
        if (browser == nullptr) return;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("ok", ok);
        obj->setProperty ("code", code);
        browser->emitEventIfBrowserIsVisible ("toolchainDone", juce::var (obj));
    }

    juce::WebBrowserComponent* browser = nullptr;
    juce::ChildProcess process;
    juce::String pending;
};

/**
 * Streams a `node tools/scripts/build-host-product.mjs` run — the Host Project build
 * (VIP-successor Stage 1). Same shape as VstBuildJob/ToolchainJob above; the events ride the
 * instrument host's own channel: every line -> "instrumentHostBuildProgress" { line, done:false },
 * terminal -> { line: summary, done:true, ok }. One event stream, one UI listener, mirroring how
 * the scanner reports.
 */
class HostBuildJob : public juce::Timer
{
public:
    HostBuildJob (juce::WebBrowserComponent* browserToUse, const juce::StringArray& command)
        : browser (browserToUse)
    {
        emitLine ("$ " + command.joinIntoString (" "), false, false);
        if (! process.start (command, juce::ChildProcess::wantStdOut | juce::ChildProcess::wantStdErr))
        {
            emitLine ("Failed to launch node (the build process could not start).", true, false);
            return;   // timer never starts — isTimerRunning() stays false, so a retry is allowed
        }
        startTimerHz (8);
    }

private:
    void timerCallback() override
    {
        char buffer[1 << 14];
        for (;;)
        {
            const int n = process.readProcessOutput (buffer, (int) sizeof (buffer));
            if (n <= 0) break;
            pending += juce::String::fromUTF8 (buffer, n);
        }
        flushLines (false);
        if (! process.isRunning())
        {
            flushLines (true);
            stopTimer();
            const int code = process.getExitCode();
            emitLine (code == 0 ? juce::String ("Host product build finished.")
                                : ("Host product build failed (exit code " + juce::String (code) + ")."),
                      true, code == 0);
        }
    }

    void flushLines (bool flushRemainder)
    {
        for (int nl; (nl = pending.indexOfChar ('\n')) >= 0; )
        {
            emitLine (pending.substring (0, nl).trimEnd(), false, false);
            pending = pending.substring (nl + 1);
        }
        if (flushRemainder && pending.trim().isNotEmpty()) { emitLine (pending.trimEnd(), false, false); pending.clear(); }
    }

    void emitLine (const juce::String& line, bool done, bool ok)
    {
        if (browser == nullptr || (line.isEmpty() && ! done))
            return;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("line", line);
        obj->setProperty ("done", done);
        if (done)
            obj->setProperty ("ok", ok);
        browser->emitEventIfBrowserIsVisible ("instrumentHostBuildProgress", juce::var (obj));
    }

    juce::WebBrowserComponent* browser = nullptr;
    juce::ChildProcess process;
    juce::String pending;
};

// Resolve the root that holds the export pipeline (tools/scripts/export-panel-vst3.mjs). A dev build
// runs from a source checkout (CEDITOR_SOURCE_ROOT / cwd); an installed build has tools/ staged beside
// the executable. Try, in order: the compile-time source root, the executable's dir (and its parent),
// then the current working dir — returning the first that actually contains the exporter, so the same
// binary works in both layouts. Falls back to the compile-time root / cwd if none match.
static juce::File ceditorSourceRoot()
{
    const auto hasExporter = [] (const juce::File& d)
    {
        return d.getChildFile ("tools").getChildFile ("scripts")
                .getChildFile ("export-panel-vst3.mjs").existsAsFile();
    };

    juce::Array<juce::File> candidates;
   #if defined (CEDITOR_SOURCE_ROOT)
    candidates.add (juce::File (CEDITOR_SOURCE_ROOT));
   #endif
    const auto exeDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getParentDirectory();
    candidates.add (exeDir);
    candidates.add (exeDir.getParentDirectory());
    candidates.add (juce::File::getCurrentWorkingDirectory());

    for (const auto& c : candidates)
        if (c != juce::File() && hasExporter (c))
            return c;

   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT);
   #else
    return juce::File::getCurrentWorkingDirectory();
   #endif
}

// Start a languages.mjs `ensure`/`remove` run for the languages in payload.languages (an array of ids),
// streaming progress to the UI. Refuses if a toolchain job is already running.
void ValueTreeBridge::runToolchainJob (const juce::var& payload, const juce::String& subcommand)
{
    if (browser == nullptr) return;

    auto emitDone = [this] (bool ok, int code)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", ok);
        o->setProperty ("code", code);
        browser->emitEventIfBrowserIsVisible ("toolchainDone", juce::var (o));
    };

    if (toolchainJob != nullptr && toolchainJob->isTimerRunning()) { emitDone (false, -1); return; }

    juce::StringArray langs;
    if (auto* obj = payload.getDynamicObject())
        if (auto* arr = obj->getProperty ("languages").getArray())
            for (const auto& v : *arr) langs.add (v.toString());
    if (langs.isEmpty()) { emitDone (false, -1); return; }

    const auto node   = findNodeExecutable();
    const auto script = ceditorSourceRoot().getChildFile ("tools").getChildFile ("toolchains").getChildFile ("languages.mjs");
    if (node == juce::File() || ! script.existsAsFile()) { emitDone (false, -1); return; }

    juce::StringArray command { node.getFullPathName(), script.getFullPathName(), subcommand };
    command.addArray (langs);
    toolchainJob = std::make_unique<ToolchainJob> (browser, command);
}

juce::WebBrowserComponent::Options ValueTreeBridge::buildOptions (const juce::WebBrowserComponent::Options& base)
{
    // Point the Node toolchain scripts at a per-user, writable provisioning dir before any node spawn.
    setToolchainDirEnv();

    deviceProfileService.setEventCallback ([this] (const juce::String& eventName, const juce::var& payload)
    {
        juce::MessageManager::callAsync ([this, eventName, payload]()
        {
            if (browser != nullptr)
                browser->emitEventIfBrowserIsVisible (eventName, payload);
        });
    });

    auto options = base
        .withNativeIntegrationEnabled()
        .withEventListener ("setProperty", [this] (const juce::var& payload)
        {
            if (auto* obj = payload.getDynamicObject())
            {
                auto path = obj->getProperty ("path").toString();
                auto value = obj->getProperty ("value");
                auto requestId = obj->getProperty ("requestId");

                juce::MessageManager::callAsync ([this, path, value, requestId]()
                {
                    suppressOutgoing = true;
                    auto result = setPropertyFromPath (path, value);
                    suppressOutgoing = false;
                    if (result.failed() && browser != nullptr)
                    {
                        // Tell JS the write never landed so it can resync (bridge.js listens for
                        // this, logs it, and re-requests the full state).
                        auto* rejection = new juce::DynamicObject();
                        rejection->setProperty ("requestId", requestId);
                        rejection->setProperty ("path", path);
                        rejection->setProperty ("message", result.getErrorMessage());
                        browser->emitEventIfBrowserIsVisible ("setPropertyRejected", juce::var (rejection));
                    }
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
        // --- Panel packages (.cepanelpkg) ------------------------------------------------------
        // A .cepanel references its images by absolute path, so sending one to another person
        // sends a panel with no pictures. utils/panelPackage.js embeds them instead; these two
        // listeners are the only native support that format needs — a save dialog and an open
        // dialog. Reading is deliberately not here: the chooser emits a path and the web side
        // reads it back through requestFileData, which already base64-encodes for the reason
        // documented on that listener, and a package full of embedded images is exactly the
        // payload that makes the difference.
        .withEventListener ("savePanelPackageAs", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto suggestedName = payloadObj->getProperty ("suggestedName").toString();
                auto jsonData = payloadObj->getProperty ("data").toString();

                auto startIn = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
                if (suggestedName.isNotEmpty())
                    startIn = startIn.getChildFile (suggestedName);

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Share Panel As",
                    startIn,
                    "*.cepanelpkg");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::warnAboutOverwriting,
                    [this, jsonData] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File())
                            return;

                        auto file = result.withFileExtension ("cepanelpkg");

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("filePath", file.getFullPathName());
                        obj->setProperty ("name", file.getFileNameWithoutExtension());
                        // replaceWithText's return value is reported rather than dropped: a
                        // package is the thing you are about to send somebody, so "saved" has to
                        // mean it. A full disk or a read-only folder should say so here, not when
                        // the recipient opens nothing.
                        obj->setProperty ("ok", file.replaceWithText (jsonData));

                        browser->emitEventIfBrowserIsVisible ("panelPackageSaved", juce::var (obj));
                    });
            });
        })
        .withEventListener ("openPanelPackage", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Open Shared Panel",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanelpkg");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("filePath", result.getFullPathName());
                        obj->setProperty ("name", result.getFileNameWithoutExtension());
                        obj->setProperty ("byteSize", (juce::int64) result.getSize());

                        browser->emitEventIfBrowserIsVisible ("panelPackageOpened", juce::var (obj));
                    });
            });
        })
        // --- Update check ------------------------------------------------------------------------
        //
        // One HTTP GET, on a background thread, reported back as an event. The RULES — which
        // version is newer, what counts as a readable reply, and when a check is allowed at all —
        // are in CE/src/UpdateCheck.h with their own test; this is only the fetch.
        //
        // OFF BY DEFAULT, and the web side enforces that before it ever gets here. A check sends
        // this machine's IP address to GitHub: unremarkable, and still not something the program
        // should do on its own the first time somebody starts it. Help -> Check for Updates is the
        // always-available path, because choosing it IS the consent.
        .withEventListener ("checkForUpdates", [this] (const juce::var&)
        {
            // Not on the message thread: this blocks on a socket, and a five-second DNS timeout
            // with the UI frozen behind it is a worse experience than no update check at all.
            juce::Thread::launch ([this, stillAlive = alive]()
            {
                juce::String body, error;
                juce::URL url (ce::latestReleaseEndpoint());
                int status = 0;

                // GitHub requires a User-Agent and rejects requests without one. Asking for the
                // documented media type pins the reply shape this parses.
                auto options = juce::URL::InputStreamOptions (juce::URL::ParameterHandling::inAddress)
                                   .withExtraHeaders ("Accept: application/vnd.github+json\r\n"
                                                      "User-Agent: CEditor\r\n")
                                   .withConnectionTimeoutMs (8000)
                                   .withStatusCode (&status);

                if (auto stream = url.createInputStream (options))
                    body = stream->readEntireStreamAsString();

                if (body.isEmpty())
                    error = status > 0 ? "The update service answered " + juce::String (status) + "."
                                       : "Could not reach the update service. Check your connection.";

                const auto reply = error.isEmpty() ? juce::JSON::parse (body) : juce::var();

                juce::MessageManager::callAsync ([this, stillAlive, reply, error]()
                {
                    // Eight seconds is long enough to close a window in. Without this the callback
                    // would dereference a destroyed bridge — the one place here where a background
                    // thread can genuinely outlive the object that started it.
                    if (! stillAlive->load() || browser == nullptr)
                        return;

                    auto* obj = new juce::DynamicObject();
                    if (error.isNotEmpty())
                    {
                        obj->setProperty ("ok", false);
                        obj->setProperty ("error", error);
                    }
                    else
                    {
                        // The comparison happens on the web side, which knows the running version
                        // from the build stamp. Here we only forward what was published — one
                        // place decides "is this newer", and it is the one with the test.
                        obj->setProperty ("ok", true);
                        obj->setProperty ("release", reply);
                    }
                    browser->emitEventIfBrowserIsVisible ("updateCheckResult", juce::var (obj));
                });
            });
        })
        .withEventListener ("revealFile", [] (const juce::var& payload)
        {
            // "Show me where this actually is" — the tab strip's context menu (review finding D8).
            // No browser round-trip and no reply: the OS file manager is the whole answer, so
            // there is nothing for the web side to wait on. It still hops to the message thread,
            // because revealToUser() opens a shell window and the bridge callback is not the
            // place to do that.
            juce::MessageManager::callAsync ([payload]()
            {
                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                juce::File file (payloadObj->getProperty ("filePath").toString());

                // A path that no longer exists reveals nothing; fall back to the containing
                // folder so a moved-or-deleted file still gets the user somewhere useful rather
                // than opening a window on nothing.
                if (file.exists())
                    file.revealToUser();
                else if (file.getParentDirectory().isDirectory())
                    file.getParentDirectory().revealToUser();
            });
        })
        .withEventListener ("saveScriptWorkspaceAs", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto documentId = payloadObj->getProperty ("documentId").toString();
                auto jsonData = payloadObj->getProperty ("data").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Save Script Workspace As",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cescript.json");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::warnAboutOverwriting,
                    [this, documentId, jsonData] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File())
                            return;

                        auto file = result.withFileExtension ("cescript.json");
                        file.replaceWithText (jsonData);

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("documentId", documentId);
                        obj->setProperty ("filePath", file.getFullPathName());
                        obj->setProperty ("name", file.getFileNameWithoutExtension().replace (".cescript", ""));

                        browser->emitEventIfBrowserIsVisible ("scriptWorkspaceSaved", juce::var (obj));
                    });
            });
        })
        .withEventListener ("saveScriptWorkspace", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = payload.getDynamicObject();
                if (obj == nullptr)
                    return;

                auto documentId = obj->getProperty ("documentId").toString();
                auto filePath = obj->getProperty ("filePath").toString();
                auto jsonData = obj->getProperty ("data").toString();

                juce::File file (filePath);
                file.replaceWithText (jsonData);

                auto* resp = new juce::DynamicObject();
                resp->setProperty ("documentId", documentId);
                resp->setProperty ("filePath", filePath);
                resp->setProperty ("name", file.getFileNameWithoutExtension().replace (".cescript", ""));

                browser->emitEventIfBrowserIsVisible ("scriptWorkspaceSaved", juce::var (resp));
            });
        })
        .withEventListener ("openScriptWorkspace", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Open Script Workspace",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cescript.json;*.json");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("filePath", result.getFullPathName());
                        obj->setProperty ("name", result.getFileNameWithoutExtension().replace (".cescript", ""));
                        obj->setProperty ("byteSize", (juce::int64) result.getSize());
                        obj->setProperty ("data", result.loadFileAsString());

                        browser->emitEventIfBrowserIsVisible ("scriptWorkspaceOpened", juce::var (obj));
                    });
            });
        })
        .withEventListener ("openScriptWorkspaceFile", [this] (const juce::var& payload)
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
                obj->setProperty ("name", file.getFileNameWithoutExtension().replace (".cescript", ""));
                obj->setProperty ("byteSize", (juce::int64) file.getSize());
                obj->setProperty ("data", file.loadFileAsString());

                browser->emitEventIfBrowserIsVisible ("scriptWorkspaceOpened", juce::var (obj));
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

                auto ext = file.getFileExtension().toLowerCase();
                juce::String mimeType = "image/png";
                if (ext == ".jpg" || ext == ".jpeg") mimeType = "image/jpeg";
                else if (ext == ".gif") mimeType = "image/gif";
                else if (ext == ".bmp") mimeType = "image/bmp";
                else if (ext == ".webp") mimeType = "image/webp";
                else if (ext == ".ttf") mimeType = "font/ttf";
                else if (ext == ".otf") mimeType = "font/otf";
                else if (ext == ".woff") mimeType = "font/woff";
                else if (ext == ".woff2") mimeType = "font/woff2";
                else if (ext == ".svg") mimeType = "image/svg+xml";
                else if (ext == ".json" || ext == ".cepanel" || ext == ".cepanelpkg") mimeType = "application/json";

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("requestId", requestId);
                obj->setProperty ("mimeType", mimeType);
                obj->setProperty ("byteSize", (juce::int64) mb.getSize());

                // Base64 for everything, text included — and NOT because base64 is cheap.
                //
                // Sending text as text is the obvious improvement: no encode, no decode, a third
                // fewer bytes. It was measured on the 790 KB GAIA profile and cost 55,298 ms in the
                // emit below, with the window unresponsive for two minutes at a stretch.
                //
                // WebBrowserComponent::emitEvent embeds the payload in a JavaScript source string,
                // so it escapes the JSON with
                //     objectAsString.replace ("\\", "\\\\").replace ("'", "\\'")
                // and juce::String::replace is O(occurrences x length): it re-walks from the start
                // of the string and reallocates the whole thing for every hit. JSON::toString turns
                // each of that profile's 77,554 quotes into \", so the first replace runs 77,554
                // times over 790 KB — 61.3 billion character operations, which is the 55 seconds.
                //
                // Base64 contains no backslash and no apostrophe. Both replaces find nothing and
                // return after a single scan, so the encode buys back far more than it costs. The
                // real fix is upstream in that escape; until then this transport has a constraint —
                // a payload must not carry characters that need escaping — and base64 is what
                // satisfies it. Do not "optimise" this away again without re-measuring the emit.
                auto encodeStartMs = juce::Time::getMillisecondCounterHiRes();
                obj->setProperty ("data", "data:" + mimeType + ";base64,"
                                          + juce::Base64::toBase64 (mb.getData(), mb.getSize()));
                auto encodeDurationMs = juce::Time::getMillisecondCounterHiRes() - encodeStartMs;

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
        .withEventListener ("loadOpenScriptWorkspaces", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr || appSettings == nullptr)
                    return;

                auto paths = appSettings->getOpenScriptWorkspacePaths();
                juce::Array<juce::var> arr;

                for (const auto& path : paths)
                    arr.add (path);

                browser->emitEventIfBrowserIsVisible ("openScriptWorkspacePaths", arr);
            });
        })
        .withEventListener ("updateOpenScriptWorkspaces", [this] (const juce::var& payload)
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

                appSettings->setOpenScriptWorkspacePaths (paths);
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

                // The freeze this exists to find is invisible to every timer above: they all measure
                // work we already suspected. This measures the thread instead. Whatever is blocking
                // it does not have to be instrumented, or even known, to show up here.
                if (perfDebugEnabled)
                    stallWatch = std::make_unique<MessageThreadStallWatch> ([this] (double gapMs)
                    {
                        emitPerfDebug ("message thread stalled " + juce::String (gapMs, 0) + "ms");
                    });
                else
                    stallWatch.reset();
            });
        })
        /* --- third-party scripting modules (ce.ext.*) -------------------------------------
           A module extends what the APPLICATION can do, so it installs into the app rather than
           into a panel: one copy, every panel gets it (scripting-modules-design.md §8). They live
           as .cemodule files under the user data dir. The host owns that directory and does the
           file I/O; whether a manifest is a LEGAL module is decided on the web side, because the
           rules are about the API contract (which names are taken, which words are Lua keywords)
           and the contract lives there. So these handlers deliberately do not validate — they
           list, store and delete, and the editor refuses what it cannot accept. */
        .withEventListener ("listScriptModules", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]() { emitScriptModules(); });
        })
        .withEventListener ("installScriptModule", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* o = payload.getDynamicObject();
                const auto manifest = o != nullptr ? o->getProperty ("manifest") : juce::var();
                auto* m = manifest.getDynamicObject();
                const auto id = m != nullptr ? m->getProperty ("id").toString() : juce::String();
                if (id.isEmpty())
                    return;

                auto dir = scriptModulesDirectory();
                dir.createDirectory();
                auto file = dir.getChildFile (juce::File::createLegalFileName (id) + ".cemodule");
                file.replaceWithText (juce::JSON::toString (manifest, false));
                emitScriptModules();
            });
        })
        .withEventListener ("removeScriptModule", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                auto* o = payload.getDynamicObject();
                const auto id = o != nullptr ? o->getProperty ("id").toString() : juce::String();
                if (id.isEmpty())
                    return;

                scriptModulesDirectory()
                    .getChildFile (juce::File::createLegalFileName (id) + ".cemodule")
                    .deleteFile();
                emitScriptModules();
            });
        })
        .withEventListener ("importScriptModule", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Install Scripting Module",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cemodule;*.json");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this] (const juce::FileChooser& fc)
                    {
                        if (browser == nullptr)
                            return;

                        auto file = fc.getResult();
                        if (file == juce::File())
                            return;

                        // Copy it in under its declared id, so the filename can never disagree with
                        // the module it holds. A file that is not JSON, or has no id, is dropped
                        // here — the editor reports the rest.
                        const auto parsed = juce::JSON::parse (file.loadFileAsString());
                        auto* m = parsed.getDynamicObject();
                        const auto id = m != nullptr ? m->getProperty ("id").toString() : juce::String();
                        if (id.isNotEmpty())
                        {
                            auto dir = scriptModulesDirectory();
                            dir.createDirectory();
                            dir.getChildFile (juce::File::createLegalFileName (id) + ".cemodule")
                               .replaceWithText (file.loadFileAsString());
                        }
                        emitScriptModules();
                    });
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
        })
        .withEventListener ("buildVst3", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = payload.getDynamicObject();
                if (obj == nullptr)
                    return;

                const auto jsonData = obj->getProperty ("data").toString();
                const auto guid     = obj->getProperty ("guid").toString();
                auto productName    = obj->getProperty ("productName").toString().trim();
                if (productName.isEmpty())
                    productName = "CEditor Panel";

                auto emitFail = [this] (const juce::String& message)
                {
                    auto* o = new juce::DynamicObject();
                    o->setProperty ("ok", false);
                    o->setProperty ("code", -1);
                    o->setProperty ("message", message);
                    o->setProperty ("path", juce::String());
                    browser->emitEventIfBrowserIsVisible ("buildComplete", juce::var (o));
                };

                if (buildJob != nullptr && buildJob->isTimerRunning())
                {
                    emitFail ("A build is already running.");
                    return;
                }

                const auto sourceRoot = ceditorSourceRoot();   // dev checkout OR installed tools/ beside the exe

                // TWO EXPORT PATHS, and which one runs depends on what this install actually has.
                //
                // The compiling path relinks the player per panel and needs the C++ build environment.
                // The template path copies a prebuilt player and writes the panel inside it -- no
                // compiler, no CMake, no source tree -- and produces byte-identical plugin ids, so a
                // session saved against either keeps working. See CE/src/Export/PanelIdentitySidecar.h.
                //
                // The compiling path is preferred WHERE IT IS AVAILABLE, because it is the one with the
                // mileage on it and a source checkout is by definition a developer machine. An install
                // that ships templates and no source tree takes the other, which is what turns "export
                // runs from a source checkout" from a limitation into a preference.
                const bool hasBuildEnv = sourceRoot.getChildFile ("CMakeLists.txt").existsAsFile()
                                       && sourceRoot.getChildFile ("CE").getChildFile ("web")
                                                    .getChildFile ("src").isDirectory();

                const auto templatesDir = sourceRoot.getChildFile ("templates");
                const bool hasTemplates = templatesDir.isDirectory()
                                       && ! templatesDir.findChildFiles (juce::File::findFilesAndDirectories, false,
                                                                         "*.vst3").isEmpty();

                const auto scriptName = hasBuildEnv ? "export-panel-vst3.mjs" : "export-panel-template.mjs";
                const auto script = sourceRoot.getChildFile ("tools")
                                              .getChildFile ("scripts")
                                              .getChildFile (scriptName);

                if (! hasBuildEnv && ! hasTemplates)
                {
                    emitFail ("This install can't export yet: it has neither the C++ build environment "
                              "(player source, CMake and a compiler) nor a prebuilt player template in "
                              "templates/. Reinstall including the plugin templates, or run exports from a "
                              "source checkout. Designing panels and managing scripting toolchains still work.");
                    return;
                }

                if (! script.existsAsFile())
                {
                    emitFail ("Exporter not found: " + script.getFullPathName());
                    return;
                }

                const auto node = findNodeExecutable();
                if (node == juce::File())
                {
                    emitFail ("Node.js (node.exe) was not found. Reinstall CEditor (it bundles Node) or "
                              "install Node.js, then relaunch.");
                    return;
                }

                auto tempPanel = juce::File::getSpecialLocation (juce::File::tempDirectory)
                                    .getChildFile (juce::File::createLegalFileName (productName) + ".cepanel");
                if (! tempPanel.replaceWithText (jsonData))
                {
                    emitFail ("Could not write the temporary panel file: " + tempPanel.getFullPathName());
                    return;
                }

                const auto exportPath = sourceRoot.getChildFile ("export-out")
                                                  .getChildFile (productName + ".vst3").getFullPathName();

                // The two exporters take the same first two arguments deliberately. The third differs:
                // the compiling one accepts a product-name override on the command line, the template
                // one takes the directory to copy from.
                juce::StringArray command { node.getFullPathName(),
                                            script.getFullPathName(),
                                            tempPanel.getFullPathName(),
                                            guid };
                if (hasBuildEnv)
                    command.add (productName);
                else
                    command.addArray ({ "--templates", templatesDir.getFullPathName() });

                buildJob = std::make_unique<VstBuildJob> (browser, command, exportPath);
            });
        })
        // --- Scripting Toolchains (Settings panel): status / provision / remove, all via
        //     tools/toolchains/languages.mjs (the same engine the exporter's on-demand provisioning uses).
        .withEventListener ("toolchainStatus", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr) return;
                const auto node   = findNodeExecutable();
                const auto script = ceditorSourceRoot().getChildFile ("tools").getChildFile ("toolchains").getChildFile ("languages.mjs");
                if (node == juce::File() || ! script.existsAsFile())
                {
                    // Surface the cause instead of leaving the panel mysteriously empty. Installed builds
                    // bundle Node (tools/node), so this is mainly a bare source-checkout safeguard.
                    auto* o = new juce::DynamicObject();
                    o->setProperty ("nodeMissing", node == juce::File());
                    o->setProperty ("languages", juce::var (juce::Array<juce::var>{}));
                    browser->emitEventIfBrowserIsVisible ("toolchainStatus", juce::var (o));
                    return;
                }
                juce::ChildProcess proc;
                if (! proc.start (juce::StringArray { node.getFullPathName(), script.getFullPathName(), "status" }))
                    return;
                const auto out = proc.readAllProcessOutput();   // `status` is a fast dir scan; OK to block briefly
                const auto parsed = juce::JSON::parse (out);
                if (parsed.isObject())
                    browser->emitEventIfBrowserIsVisible ("toolchainStatus", parsed);
            });
        })
        .withEventListener ("provisionToolchains", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]() { runToolchainJob (payload, "ensure"); });
        })
        .withEventListener ("removeToolchains", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]() { runToolchainJob (payload, "remove"); });
        })
        .withEventListener ("instrumentHost", [this] (const juce::var& payload)
        {
            // One listener for the whole instrument host; the payload's `cmd` selects. The
            // command surface and its events are CE/src/InstrumentHost/InstrumentHostService.h.
            juce::MessageManager::callAsync ([this, payload]()
            {
                ensureInstrumentHost();
                instrumentHost->handleCommand (payload);
            });
        });

    options = ceditor::device::withDeviceRuntimeEvents (std::move (options), deviceProfileService,
        [this] (const juce::String& eventName, const juce::var& payload)
        {
            if (browser != nullptr)
                browser->emitEventIfBrowserIsVisible (eventName, payload);
        });

    return options;
}

// ------------------------------------------------------------------ the instrument host (Stage 1)

// Where the scanner helper lives. Installed builds ship CEditorPluginScanner beside the app;
// a dev build's exe sits in build/native/CEditor_artefacts/<Config>/ while the helper lands in
// build/native/<Config>/, so the fallback climbs to the sibling config directory. A path that
// resolves to nothing is fine to hand over — the coordinator pre-checks existence and reports
// "scanner worker not found" instead of blaming a module.
static juce::File findScannerWorker()
{
   #if JUCE_WINDOWS
    const juce::String workerName ("CEditorPluginScanner.exe");
   #else
    const juce::String workerName ("CEditorPluginScanner");
   #endif

    const auto exeDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile)
                            .getParentDirectory();

    const auto installed = exeDir.getChildFile (workerName);
    if (installed.existsAsFile())
        return installed;

    return exeDir.getParentDirectory().getParentDirectory()
                 .getChildFile (exeDir.getFileName())
                 .getChildFile (workerName);
}

void ValueTreeBridge::ensureInstrumentHost()
{
    if (instrumentHost != nullptr)
        return;

    // The UI-capable registration path, as the audit requires — editor creation stays possible.
    pluginFormatManager = std::make_unique<juce::AudioPluginFormatManager>();
    pluginFormatManager->addFormat (new juce::VST3PluginFormat());

    ceditor::host::InstrumentHostService::Options options;

    options.dataDirectory = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                .getChildFile ("CEditor").getChildFile ("instrument-host");
    options.workerExecutable = findScannerWorker();

    // May fire from the scan thread; callAsync is the marshal. `this` raw is this file's
    // documented lifetime pattern (ValueTreeBridge.h) — same as every listener above.
    options.emit = [this] (const juce::String& eventName, const juce::var& payload)
    {
        juce::MessageManager::callAsync ([this, eventName, payload]()
        {
            if (browser != nullptr)
                browser->emitEventIfBrowserIsVisible (eventName, payload);
        });
    };

    // The editor the user asked for shows in WebViewHost's native pane. The guards matter:
    // the pane pointer clears nothing here at teardown, but member order in WebViewHost means
    // the pane (and any editor in it) is destroyed before this bridge — these hooks are only
    // ever called while both are alive, on the message thread.
    options.editorPane.show = [this] (const juce::String&, juce::AudioProcessor& processor,
                                      const juce::String& title)
    {
        if (editorPane != nullptr)
            editorPane->show (processor, title);
    };
    options.editorPane.hide = [this]
    {
        if (editorPane != nullptr)
            editorPane->hide();
    };

    // Floating windows beside the pane. Built here so the hooks below capture a live
    // manager; declared AFTER the service member, so every window — and the editor inside
    // it — is destroyed before the rack destroys the processors they watch.
    instrumentEditorWindows = std::make_unique<ceditor::host::FloatingEditorWindows>();
    options.editorWindows.show = [this] (const juce::String& partId,
                                         juce::AudioProcessor& processor,
                                         const juce::String& title)
    {
        instrumentEditorWindows->show (partId, processor, title);
    };
    options.editorWindows.close = [this] (const juce::String& partId)
    {
        instrumentEditorWindows->close (partId);
    };
    options.editorWindows.closeAll = [this]
    {
        instrumentEditorWindows->closeAll();
    };

    options.enableAudio = true;

    // The scan-folder browse dialog. Reuses the bridge's chooser member the way every other
    // file dialog in this file does; the service's callback guards its own lifetime.
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

    // The same instantiator the generated wrappers use (PluginInstantiator.h); the manager
    // member outlives the service that holds this function.
    options.instantiate = ceditor::host::makePluginInstantiator (*pluginFormatManager);
    options.applyVstPreset = ceditor::host::applyVstPresetFile;

    // The Host Project build: the node pipeline as a streamed child process, one at a time.
    // The service already validated the manifest; the persisted file is what the script reads,
    // and every manifest mutation saves before this can run.
    options.runBuild = [this, dataDir = options.dataDirectory]
                       (const juce::var&, const juce::String& outputDirectory)
    {
        const auto emitHostError = [this] (const juce::String& message)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("message", message);
            if (browser != nullptr)
                browser->emitEventIfBrowserIsVisible ("instrumentHostError", juce::var (obj));
        };

        if (hostBuildJob != nullptr && hostBuildJob->isTimerRunning())
        {
            emitHostError ("A host product build is already running.");
            return;
        }

        const auto node = findNodeExecutable();
        if (node == juce::File())
        {
            emitHostError ("Node.js is required to build the host product and was not found.");
            return;
        }

        const auto root = ceditorSourceRoot();
        const auto out = outputDirectory.isNotEmpty() ? juce::File (outputDirectory)
                                                      : dataDir.getChildFile ("build-output");
        const juce::StringArray command {
            node.getFullPathName(),
            root.getChildFile ("tools").getChildFile ("scripts")
                .getChildFile ("build-host-product.mjs").getFullPathName(),
            "--project",     dataDir.getChildFile ("host-project.json").getFullPathName(),
            // The editor's preview session IS the authored rack; it ships as the product's
            // factory Performance (the script skips it gracefully when none exists yet).
            "--performance", dataDir.getChildFile ("session-performance.json").getFullPathName(),
            "--build-dir",   root.getChildFile ("build").getChildFile ("native").getFullPathName(),
            "--config",      "Release",
            "--out",         out.getFullPathName(),
        };
        hostBuildJob = std::make_unique<HostBuildJob> (browser, command);
    };

    instrumentHost = std::make_unique<ceditor::host::InstrumentHostService> (std::move (options));

    // The window's X goes through the service, exactly like the pane's close button — the
    // WebView's toggles stay the truth about what is open.
    instrumentEditorWindows->onCloseRequested = [this] (const juce::String& partId)
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "closeEditorWindow");
        payload->setProperty ("partId", partId);
        instrumentHost->handleCommand (juce::var (payload));
    };

    // The CTRL49 comes alive with the service: discovery and the paced startup sequence run
    // on the broker's own worker, every service touch happens in tick() below. On a machine
    // without the hardware (or off Windows) the discover hook returns null forever and the
    // broker idles in `searching` — no cost beyond one poll every two seconds.
    {
        namespace surface = ceditor::ctrl49;
        surface::Ctrl49SurfaceBroker::Options surfaceOptions;
        surfaceOptions.discover = &surface::discoverCtrl49WindowsEndpoints;
        // Same marshal-and-guard as the service's emit above, same documented raw `this`.
        surfaceOptions.emit = [this] (const juce::String& eventName, const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, eventName, payload]()
            {
                if (browser != nullptr)
                    browser->emitEventIfBrowserIsVisible (eventName, payload);
            });
        };
        surfaceOptions.pageLua.assign (surface::assets::kKnobPageLua,
                                       surface::assets::kKnobPageLua + surface::assets::kKnobPageLuaSize);
        surfaceOptions.pngAssets.push_back ({ 0x0200,
            surface::Bytes (surface::assets::kKnobStripPng,
                            surface::assets::kKnobStripPng + surface::assets::kKnobStripPngSize) });
        instrumentSurfaceBroker = std::make_unique<surface::Ctrl49SurfaceBroker> (*instrumentHost,
                                                                                  std::move (surfaceOptions));
    }

    // Vendor-editor edits land on audio-thread listeners inside the service; this drains the
    // coalesced marks to the WebView at UI rate, and gives the surface broker its controlling-
    // thread tick in the same breath. Cheap when idle (an empty drain is a few atomic reads
    // per loaded part; an idle broker tick is a clock read), so it simply runs for the
    // service's lifetime.
    struct ParamPump final : juce::Timer
    {
        ParamPump (ceditor::host::InstrumentHostService& serviceToPump,
                   ceditor::ctrl49::Ctrl49SurfaceBroker& brokerToTick)
            : service (serviceToPump), broker (brokerToTick) { startTimerHz (30); }
        void timerCallback() override { service.drainParameterEvents(); broker.tick(); }
        ceditor::host::InstrumentHostService& service;
        ceditor::ctrl49::Ctrl49SurfaceBroker& broker;
    };
    instrumentParamPump = std::make_unique<ParamPump> (*instrumentHost, *instrumentSurfaceBroker);
}

void ValueTreeBridge::requestInstrumentEditorClose()
{
    if (instrumentHost == nullptr)
        return;

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("cmd", "closeEditor");
    instrumentHost->handleCommand (juce::var (payload));
}
