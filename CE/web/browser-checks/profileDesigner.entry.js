/**
 * The Device Profile Designer opened on the profile the page's query names (`?profile=<engine id>`),
 * in a real browser: a profile generated from its maker's document opens the DPD model converted
 * from it (CE/dpd/converted, fetched as a chunk of its own), and a hand-made DPD profile still opens
 * from the bundled library.
 */
import { mount } from 'svelte';
import DeviceProfileDesignerV2 from '../src/CE_Application/editor/DeviceProfileDesignerV2.svelte';

const profileId = new URLSearchParams(location.search).get('profile') ?? '';
mount(DeviceProfileDesignerV2, { target: document.getElementById('host'), props: { profileId } });
window.__designerMounted = true;
