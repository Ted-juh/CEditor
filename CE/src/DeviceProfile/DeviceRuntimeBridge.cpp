#include "DeviceRuntimeBridge.h"
#include "DeviceProfileService.h"

namespace ceditor::device
{
juce::WebBrowserComponent::Options withDeviceRuntimeEvents (
    juce::WebBrowserComponent::Options options,
    DeviceProfileService& service,
    DeviceEmitFn emit)
{
    auto* svc = &service;

    // Run a handler on the message thread, then emit. Mirrors the editor bridge's
    // callAsync pattern so service access stays on a single thread.
    auto on = [svc, emit] (auto handler)
    {
        return [svc, emit, handler] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([svc, emit, handler, payload]()
            {
                handler (*svc, emit, payload);
            });
        };
    };

    using S = DeviceProfileService;
    using E = const DeviceEmitFn&;

    return options
        .withEventListener ("listDeviceProfiles", on ([] (S& s, E e, const juce::var&)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("profiles", s.listProfiles());
            e ("deviceProfilesListed", juce::var (obj));
        }))
        .withEventListener ("setDeviceRoleMapping", on ([] (S& s, E e, const juce::var& p)
        {
            e ("deviceRoleMappingSet", s.setDeviceRoleMapping (p));
            e ("deviceSessionState", s.getSessionState());
            e ("deviceTransportCapabilities", s.getTransportCapabilities());
            e ("deviceDiagnostics", s.getDiagnostics());
        }))
        .withEventListener ("listProfileParameters", on ([] (S& s, E e, const juce::var& p)
        {
            e ("profileParametersListed", s.listProfileParameters (p));
        }))
        .withEventListener ("getProfileParameterDetail", on ([] (S& s, E e, const juce::var& p)
        {
            e ("profileParameterDetail", s.getProfileParameterDetail (p));
        }))
        .withEventListener ("listMidiDestinations", on ([] (S& s, E e, const juce::var&)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("destinations", s.listMidiDestinations());
            e ("midiDestinationsListed", juce::var (obj));
        }))
        .withEventListener ("listMidiInputs", on ([] (S& s, E e, const juce::var&)
        {
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("inputs", s.listMidiInputs());
            e ("midiInputsListed", juce::var (obj));
        }))
        .withEventListener ("getDeviceTransportCapabilities", on ([] (S& s, E e, const juce::var&)
        {
            e ("deviceTransportCapabilities", s.getTransportCapabilities());
        }))
        .withEventListener ("getDeviceSessionState", on ([] (S& s, E e, const juce::var&)
        {
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("overrideDeviceIdentityMismatch", on ([] (S& s, E e, const juce::var& p)
        {
            e ("deviceIdentityOverride", s.overrideDeviceIdentityMismatch (p));
            e ("deviceSessionState", s.getSessionState());
            e ("midiMonitorEvents", s.getMonitorEvents());
        }))
        .withEventListener ("startDeviceSync", on ([] (S& s, E e, const juce::var& p)
        {
            e ("deviceSyncStarted", s.startDeviceSync (p));
            e ("deviceSessionState", s.getSessionState());
            e ("midiMonitorEvents", s.getMonitorEvents());
        }))
        .withEventListener ("startPresetListScan", on ([] (S& s, E e, const juce::var& p)
        {
            e ("presetListScanStarted", s.startPresetListScan (p));
            e ("deviceSessionState", s.getSessionState());
            e ("midiMonitorEvents", s.getMonitorEvents());
        }))
        .withEventListener ("cancelPresetListScan", on ([] (S& s, E e, const juce::var& p)
        {
            e ("presetListScanUpdated", s.cancelPresetListScan (p));
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("getPresetListScans", on ([] (S& s, E e, const juce::var&)
        {
            e ("presetListScans", s.getPresetListScans());
        }))
        .withEventListener ("startBulkDumpSend", on ([] (S& s, E e, const juce::var& p)
        {
            e ("bulkDumpSendStarted", s.startBulkDumpSend (p));
            e ("deviceSessionState", s.getSessionState());
            e ("midiMonitorEvents", s.getMonitorEvents());
        }))
        .withEventListener ("cancelBulkDumpSend", on ([] (S& s, E e, const juce::var& p)
        {
            e ("bulkDumpSendUpdated", s.cancelBulkDumpSend (p));
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("getBulkDumpSends", on ([] (S& s, E e, const juce::var&)
        {
            e ("bulkDumpSends", s.getBulkDumpSends());
        }))
        .withEventListener ("compileParameterMessage", on ([] (S& s, E e, const juce::var& p)
        {
            e ("midiPreview", s.compileParameterMessage (p, false));
        }))
        .withEventListener ("setDeviceParameter", on ([] (S& s, E e, const juce::var& p)
        {
            auto result = s.compileParameterMessage (p, true);
            e ("deviceParameterSet", result);
            e ("midiPreview", result);
            e ("midiMonitorEvents", s.getMonitorEvents());
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("compileRawMidiAction", on ([] (S& s, E e, const juce::var& p)
        {
            e ("rawMidiPreview", s.compileRawMidiAction (p, false));
        }))
        .withEventListener ("triggerRawMidiAction", on ([] (S& s, E e, const juce::var& p)
        {
            auto result = s.compileRawMidiAction (p, true);
            e ("rawMidiActionTriggered", result);
            e ("rawMidiPreview", result);
            e ("midiMonitorEvents", s.getMonitorEvents());
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("parseDumpMessage", on ([] (S& s, E e, const juce::var& p)
        {
            e ("dumpMessageParsed", s.parseDumpMessage (p, true));
            e ("deviceRuntimeState", s.getRuntimeState());
            e ("midiMonitorEvents", s.getMonitorEvents());
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("ingestIncomingMidiMessage", on ([] (S& s, E e, const juce::var& p)
        {
            e ("incomingMidiIngested", s.ingestIncomingMidiMessage (p));
            e ("deviceRuntimeState", s.getRuntimeState());
            e ("midiMonitorEvents", s.getMonitorEvents());
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("requestMidiCiDiscovery", on ([] (S& s, E e, const juce::var& p)
        {
            e ("midiCiDiscoveryStarted", s.startMidiCiDiscovery (p));
            e ("midiMonitorEvents", s.getMonitorEvents());
            e ("deviceSessionState", s.getSessionState());
        }))
        .withEventListener ("runDeviceProfileTests", on ([] (S& s, E e, const juce::var& p)
        {
            e ("deviceProfileTestsFinished", s.runProfileTests (p));
        }))
        .withEventListener ("getDeviceRuntimeState", on ([] (S& s, E e, const juce::var&)
        {
            e ("deviceRuntimeState", s.getRuntimeState());
        }))
        .withEventListener ("getMidiMonitorEvents", on ([] (S& s, E e, const juce::var&)
        {
            e ("midiMonitorEvents", s.getMonitorEvents());
        }))
        .withEventListener ("getDeviceDiagnostics", on ([] (S& s, E e, const juce::var&)
        {
            e ("deviceDiagnostics", s.getDiagnostics());
        }));
}
}
