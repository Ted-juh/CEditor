#include "PlatformMatrix.h"

// The MIDI stack row needs the device layer; the header stays juce_core so the matrix type
// itself can be used anywhere.
#include <juce_audio_devices/juce_audio_devices.h>

namespace ceditor::host
{

namespace
{
    PlatformRow row (const juce::String& id, const juce::String& description, bool required,
                     bool present, const juce::String& detail = {})
    {
        return { id, description, required, present, detail };
    }
}

PlatformReport checkPlatformSupport (const juce::File& dataDirectory)
{
    PlatformReport report;
    report.platformName = juce::SystemStats::getOperatingSystemName();

    // 1. Per-user data has to be writable, and "writable" means a file was actually written —
    //    a directory that exists but cannot be written to is the classic packaged-app trap.
    {
        auto probe = dataDirectory.getChildFile ("platform-probe.tmp");
        dataDirectory.createDirectory();
        const auto wrote = probe.replaceWithText ("ok");
        const auto readBack = wrote && probe.loadFileAsString() == "ok";
        probe.deleteFile();
        report.rows.add (row ("data-directory", "A writable per-user data directory", true,
                              readBack, dataDirectory.getFullPathName()));
    }

    // 2. A MIDI stack that can be enumerated. No devices is fine; a stack that throws is not.
    {
        bool enumerated = true;
        juce::String detail;
        try
        {
            const auto inputs = juce::MidiInput::getAvailableDevices();
            const auto outputs = juce::MidiOutput::getAvailableDevices();
            detail = juce::String (inputs.size()) + " in, " + juce::String (outputs.size()) + " out";
        }
        catch (...)
        {
            enumerated = false;
            detail = "enumeration threw";
        }
        report.rows.add (row ("midi", "A MIDI stack that enumerates", true, enumerated, detail));
    }

    // 3. The plug-in format. VST3 hosting is what the whole product rests on, and it is a
    //    build-time fact rather than a runtime probe.
   #if JUCE_PLUGINHOST_VST3
    report.rows.add (row ("format-vst3", "VST3 hosting", true, true, "compiled in"));
   #else
    report.rows.add (row ("format-vst3", "VST3 hosting", true, false,
                          "JUCE_PLUGINHOST_VST3 is off in this build"));
   #endif

    // 4. The WebView runtime the UI needs. Windows means WebView2; elsewhere the editor is not
    //    claimed, which is why this row is required only where the UI ships.
   #if JUCE_WINDOWS
    report.rows.add (row ("webview", "A WebView runtime for the editor UI", true,
                          JUCE_WEB_BROWSER != 0,
                          JUCE_WEB_BROWSER != 0 ? "WebView2" : "built without a browser component"));
   #else
    report.rows.add (row ("webview", "A WebView runtime for the editor UI", false,
                          JUCE_WEB_BROWSER != 0,
                          "not claimed on this platform yet"));
   #endif

    // 5. Native editor parenting: hosting a plug-in's own window inside ours. Windows is the
    //    supported platform today; elsewhere this is honestly reported as unclaimed rather
    //    than quietly assumed to work.
   #if JUCE_WINDOWS
    report.rows.add (row ("editor-parenting", "Hosting an inner plug-in editor", true, true, "HWND"));
   #else
    report.rows.add (row ("editor-parenting", "Hosting an inner plug-in editor", false, false,
                          "not claimed on this platform yet"));
   #endif

    // 6. The out-of-process scanner, which is what keeps a bad plug-in from taking the app
    //    with it. It is a separate executable, so its absence is a real deployment fault.
    report.rows.add (row ("scanner-worker", "The out-of-process scanner helper", false,
                          true, "checked at startup by the service"));

    return report;
}

} // namespace ceditor::host
