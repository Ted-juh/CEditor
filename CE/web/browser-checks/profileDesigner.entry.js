/**
 * The Device Profile Designer opened on the profile the page's query names (`?profile=<engine id>`),
 * in a real browser. Without the engine, the page stands in for it: it reads the profile's file and
 * hands its source over as the engine would (profileSources), and the Designer converts it into the
 * profile's DPD model. A hand-made DPD profile opens from the bundled library as it always has.
 */
import { mount } from 'svelte';
import DeviceProfileDesignerV2 from '../src/CE_Application/editor/DeviceProfileDesignerV2.svelte';
import { profileSources } from '../src/CE_Application/stores/deviceProfiles.js';

const profileId = new URLSearchParams(location.search).get('profile') ?? '';
mount(DeviceProfileDesignerV2, { target: document.getElementById('host'), props: { profileId } });
fetch(`./profiles/${profileId}.ceditor-device.json`)
  .then((response) => (response.ok ? response.text() : null))
  .then((source) => {
    if (source) profileSources.update((sources) => ({ ...sources, [profileId]: { profileId, source } }));
  })
  .finally(() => { window.__designerMounted = true; });
