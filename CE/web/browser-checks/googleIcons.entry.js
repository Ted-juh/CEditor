/**
 * Settings → Icons, mounted on its own for browser-checks/googleIcons.mjs: the real page, the real
 * store, and Google's real server — the fetch is the thing being checked.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import IconsSettings from '../src/CE_Application/settings/IconsSettings.svelte';
import { appSettings } from '../src/CE_Application/stores/appSettings.js';

mount(IconsSettings, { target: document.getElementById('host') });
window.__icons = () => (get(appSettings).icons ?? []).map((icon) => ({
  name: icon.name, sourceType: icon.sourceType, google: icon.google, dataUrl: icon.dataUrl,
}));
