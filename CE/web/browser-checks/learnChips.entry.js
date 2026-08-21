/**
 * The learn chips as a drag SOURCE, which is the half that only exists in a browser.
 *
 * The reducer is unit-tested. What is not, and cannot be under server rendering, is the thing this
 * feature is actually for: a chip that carries `application/x-ceditor-device-parameter` on a real
 * dragstart, so the drop handler in CanvasControl — which has never had a source in this app —
 * receives what it has always been waiting for.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import MidiLearnChips from '../src/CE_Application/components/MidiLearnChips.svelte';
import {
  deviceRoleMappings,
  latestMidiInputMessage,
  latestSysexInputMessage,
  profileSources,
  selectedDeviceProfileId,
} from '../src/CE_Application/stores/deviceProfiles.js';
import { deviceParameterDrag } from '../src/CE_Application/stores/deviceParameterDrag.js';
import gaiaProfile from '../../profiles/test/roland-gaia-sh01.ceditor-device.json';

const PROFILE_ID = 'roland-gaia-sh01';

selectedDeviceProfileId.set(PROFILE_ID);
profileSources.set({ [PROFILE_ID]: { profileId: PROFILE_ID, source: JSON.stringify(gaiaProfile), native: true } });
// A user-named device pointed at this profile, so the chip's binding names the right one.
deviceRoleMappings.set({ 'Roland GAIA SH-01': { role: 'Roland GAIA SH-01', profileId: PROFILE_ID } });

mount(MidiLearnChips, { target: document.getElementById('host') });

window.__chips = {
  cc: (hex) => latestMidiInputMessage.set({ messageType: 'cc', hex }),
  sysex: (hex) => latestSysexInputMessage.set({ messageType: 'sysex', hex }),
  rendered: () => [...document.querySelectorAll('.learn li')].map((li) => ({
    label: li.querySelector('.name')?.textContent ?? '',
    detail: li.querySelector('.meta')?.textContent ?? '',
    value: li.querySelector('.value')?.textContent ?? null,
    draggable: li.getAttribute('draggable') === 'true',
    title: li.getAttribute('title') ?? '',
  })),
  // A real dragstart with a real DataTransfer, so what is asserted is what a drop would receive.
  drag: (labelText) => {
    const li = [...document.querySelectorAll('.learn li')]
      .find((node) => node.querySelector('.name')?.textContent === labelText);
    if (!li) return { error: `no chip labelled ${labelText}` };
    const dataTransfer = new DataTransfer();
    const started = li.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));
    return {
      started,
      types: [...dataTransfer.types],
      payload: dataTransfer.getData('application/x-ceditor-device-parameter'),
      store: get(deviceParameterDrag),
    };
  },
  dragEnd: (labelText) => {
    const li = [...document.querySelectorAll('.learn li')]
      .find((node) => node.querySelector('.name')?.textContent === labelText);
    li?.dispatchEvent(new DragEvent('dragend', { dataTransfer: new DataTransfer(), bubbles: true }));
    return get(deviceParameterDrag);
  },
};
