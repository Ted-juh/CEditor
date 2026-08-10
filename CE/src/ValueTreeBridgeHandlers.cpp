#include "ValueTreeBridge.h"
#include "AppSettings.h"
#include "DeviceProfile/DeviceRuntimeBridge.h"

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
                auto isText = false;
                if (ext == ".jpg" || ext == ".jpeg") mimeType = "image/jpeg";
                else if (ext == ".gif") mimeType = "image/gif";
                else if (ext == ".bmp") mimeType = "image/bmp";
                else if (ext == ".webp") mimeType = "image/webp";
                else if (ext == ".ttf") mimeType = "font/ttf";
                else if (ext == ".otf") mimeType = "font/otf";
                else if (ext == ".woff") mimeType = "font/woff";
                else if (ext == ".woff2") mimeType = "font/woff2";
                else if (ext == ".svg") mimeType = "image/svg+xml";   // text, but the frontend uses it as an <img> src
                else if (ext == ".json" || ext == ".cepanel") { mimeType = "application/json"; isText = true; }

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("requestId", requestId);
                obj->setProperty ("mimeType", mimeType);
                obj->setProperty ("byteSize", (juce::int64) mb.getSize());

                // Text goes over as text. Base64 is the right shape for a PNG or a font and pure
                // waste for the two biggest things this app loads — a .cepanel and a device profile,
                // both JSON. The waste is not small: a 43.6 MB panel became a 58 MB base64 String,
                // concatenated again for the "data:...;base64," prefix, then escaped again into the
                // JSON that carries it to the WebView. About 250 MB of allocation and copying, on
                // the message thread, which is the thread Windows asks whether the window is still
                // alive — and while this ran the answer was no, so the title bar read
                // "(Not Responding)". The frontend then spent an atob and a per-byte loop over 43.6
                // million bytes undoing it before a single control was drawn.
                //
                // `data` is still sent for bytes, and the frontend still reads it, so a mismatched
                // pair of halves keeps working in both directions.
                auto encodeStartMs = juce::Time::getMillisecondCounterHiRes();
                if (isText)
                    obj->setProperty ("text", mb.toString());
                else
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

                const auto script = sourceRoot.getChildFile ("tools")
                                              .getChildFile ("scripts")
                                              .getChildFile ("export-panel-vst3.mjs");
                if (! script.existsAsFile())
                {
                    emitFail ("Exporter not found: " + script.getFullPathName());
                    return;
                }

                // A full VST3 export AOT-compiles a unique-identity plugin, which needs the C++ build
                // environment (player source + CMake + a compiler). A GUI-only install ships the exporter
                // script + toolchains but not the source tree, so fail with a clear message instead of the
                // raw node module-resolution error from the exporter's source-tree imports.
                const bool hasBuildEnv = sourceRoot.getChildFile ("CMakeLists.txt").existsAsFile()
                                       && sourceRoot.getChildFile ("CE").getChildFile ("web")
                                                    .getChildFile ("src").isDirectory();
                if (! hasBuildEnv)
                {
                    emitFail ("Full VST3 export needs the C++ build environment (the player source, CMake "
                              "and a compiler), which isn't part of this install. Run exports from a source "
                              "checkout. This install can still design panels and manage scripting toolchains.");
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

                const juce::StringArray command { node.getFullPathName(),
                                                  script.getFullPathName(),
                                                  tempPanel.getFullPathName(),
                                                  guid,
                                                  productName };

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
        });

    options = ceditor::device::withDeviceRuntimeEvents (std::move (options), deviceProfileService,
        [this] (const juce::String& eventName, const juce::var& payload)
        {
            if (browser != nullptr)
                browser->emitEventIfBrowserIsVisible (eventName, payload);
        });

    return options;
}
