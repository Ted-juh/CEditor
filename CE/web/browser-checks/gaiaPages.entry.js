import { mount } from 'svelte';
import { get } from 'svelte/store';
import GaiaPagesHarness from './GaiaPagesHarness.svelte';
import GaiaEnvelopeDesignHarness from './GaiaEnvelopeDesignHarness.svelte';
import { updateControlProperty } from '../src/CE_Application/stores/controls.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { panelPreviewSessions, createInteractionPreviewSession, setPreviewModeEnabled, updatePanelPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';
import * as runtime from '../src/CE_Application/scripting/panelRuntime.js';
import { deviceRoleMappings, profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import profile from '../../profiles/test/roland-gaia-sh01.ceditor-device.json';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';
import { deviceParameterValues } from '../src/CE_Application/stores/deviceParameterValues.js';
import { initDeviceProfileBridge } from '../src/CE_Application/stores/deviceProfileSession.js';
import { gaiaExpectedArpValues } from '../src/CE_Application/utils/gaiaSyncStatus.js';
import { sceneryMarkupStats } from '../src/CE_Application/utils/sceneryMarkupCache.js';
window.__JUCE__ = undefined;
window.__gaia = {
  preparationStats: sceneryMarkupStats,
  preview: setPreviewModeEnabled,
  mountEnvelopeDesignCheck() { mount(GaiaEnvelopeDesignHarness,{target:document.getElementById('host'),props:{panelId:window.__gaia.panel.id}}); },
  editModelChannel(name,value) { updateControlProperty(window.__gaia.id(name),'ValueChannels.value.currentValue',value); },
  async load(url, { fullApp = false, monitor = false, preview = true } = {}) {
    const panel=deserializePanel(await (await fetch(url)).text(),'gaia.cepanel','gaia');
    panels.set([]); addPanel(panel); setActivePanel(panel.id);
    const controls=flatControls(panel.controls);
    if (!fullApp) panelPreviewSessions.set(Object.fromEntries(controls.map(c=>[c._children.Core.id,createInteractionPreviewSession(c)])));
    document.body.style.background='#'+panel.bgColour.slice(2);
    if (fullApp) {
      const { default: App } = await import('../src/App.svelte');
      mount(App, { target: document.getElementById('host') });
      const { displayTabRequest } = await import('../src/CE_Application/stores/displayTab.js');
      const { showDisplayPanel } = await import('../src/CE_Application/stores/panelVisibility.js');
      showDisplayPanel.set(true);
      displayTabRequest.set({ tab: 'midi' });
    } else {
      mount(GaiaPagesHarness,{ target:document.getElementById('host'), props:{panelId:panel.id} });
      if (monitor) {
        const { default: MidiMonitor } = await import('../src/CE_Application/components/MidiMonitorTab.svelte');
        const target = document.createElement('div');
        target.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:300px';
        document.body.append(target);
        mount(MidiMonitor, { target });
      }
    }
    deviceRoleMappings.set({ 'Roland GAIA SH-01': { profileId: profile.id } });
    profileSources.set({ [profile.id]: { source: JSON.stringify(profile) } });
    runtime.initPanelRuntime();
    // Exercise ordinary editor preview, not the script-editor override or a manual Run.
    setPreviewModeEnabled(preview);
    window.__gaia.panel=panel;
    window.__gaia.controls=controls;
    return {width:panel.width,height:panel.height};
  },
  id(name) { return window.__gaia.controls.find(c=>c._children.Core.name===name)?._children.Core.id; },
  session(name) { return get(panelPreviewSessions)[window.__gaia.id(name)]; },
  receive(bytes) { runtime.deliverSysexForTesting({ hex: bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ') }); },
  actions() { return runtime.registeredActions(); },
  endStep(value) { syncDeviceParameterToPanelPreview('Roland GAIA SH-01', 'arp.endStep', value); },
  parameterValues() { return get(deviceParameterValues); },
  installFeedbackTestBackend() {
    const listeners = new Map(), sent = [];
    // Isolated browser fixture only. Nothing here connects to physical MIDI.
    window.__JUCE__ = { backend: {
      addEventListener(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); return { name, fn }; },
      removeEventListener(token) { listeners.set(token.name, (listeners.get(token.name) ?? []).filter(fn => fn !== token.fn)); },
      emitEvent(name, payload) { sent.push({ name, payload }); window.__gaia.onFeedbackSend?.(name, payload); },
    } };
    window.__gaia.feedbackEvent = (name, payload) => { for (const fn of listeners.get(name) ?? []) fn(payload); };
    window.__gaia.feedbackSent = () => sent;
  },
  feedbackConnect() {
    initDeviceProfileBridge();
    const output = { type: 'midiOutput', id: 'TEST-GAIA-OUT', name: 'Simulated GAIA output' };
    const input = { type: 'midiInput', id: 'TEST-GAIA-IN', name: 'Simulated GAIA input' };
    window.__gaia.feedbackPorts = { output, input };
    window.__gaia.feedbackEvent('midiDestinationsListed', { destinations: [output] });
    window.__gaia.feedbackEvent('midiInputsListed', { inputs: [input] });
    window.__gaia.feedbackEvent('deviceTransportCapabilities', { canSendSysex: true, canReceiveSysex: true });
    deviceRoleMappings.update(m => ({ ...m, 'Roland GAIA SH-01': { ...m['Roland GAIA SH-01'], midiDestination: output, midiInput: input } }));
  },
  expectedArp() {
    const grid = window.__gaia.controls.find(c => c._children.Core.name === 'arp_pattern_grid');
    return gaiaExpectedArpValues(grid, window.__gaia.session('arp_pattern_grid').customValues).expected;
  },
};
