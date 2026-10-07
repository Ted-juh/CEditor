/**
 * An exported panel's icons, in the player, with no icon library anywhere.
 *
 * The author's panel names an icon in their library. The export path (stores/panelExportPreparation.js)
 * packs it into the document; the plug-in's player has no settings and only that document. The unit
 * tests check the document; this checks the other half, which only runs in a browser: the Player
 * mounting that document and drawing the icon from it.
 *
 * The bridge is faked only as far as the Player uses it, as in playerInbound.entry.js.
 */
import { mount } from 'svelte';
import Player from '../src/Player.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { appSettings } from '../src/CE_Application/stores/appSettings.js';
import { preparePanelForExport } from '../src/CE_Application/stores/panelExportPreparation.js';

const listeners = new Map();
let nextToken = 1;
window.__JUCE__ = {
  backend: {
    emitEvent() {},
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Map());
      const token = nextToken++;
      listeners.get(name).set(token, fn);
      return token;
    },
    removeEventListener(token) {
      for (const map of listeners.values()) map.delete(token);
    },
  },
};
const fire = (name, payload) => {
  for (const fn of [...(listeners.get(name)?.values() ?? [])]) fn(payload);
};

// A play arrow, drawn white, as Settings → Icons stores a Google icon.
const svg = '<svg fill="#FFFFFF" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M320-200v-560l440 280-440 280Z"/></svg>';
const PLAY = `data:image/svg+xml;base64,${btoa(svg)}`;
const library = [{
  id: 'gicon_play', name: 'play_arrow', enabled: true, sourceType: 'google', fileName: '', filePath: '',
  mimeType: 'image/svg+xml', dataUrl: PLAY, isVector: true, width: 24, height: 24,
}];

function button(id, x, iconFields) {
  const control = createControl('ToggleButton', {
    Core: { id, name: id },
    Transform: { x, y: 40, width: 140, height: 44 },
  });
  Object.assign(control._children.Icon, iconFields, { size: 20 });
  control._children.ContentLayout.mode = 'icon_left_text_right';
  return control;
}

window.__player = {
  async exportAndLoad() {
    appSettings.update((current) => ({ ...current, icons: library }));
    const prepared = await preparePanelForExport(JSON.stringify({
      panelGuid: 'player-icons', name: 'player icons', width: 400, height: 140,
      controls: [
        button('withIcon', 20, { source: 'library', assetId: 'gicon_play', name: 'play_arrow' }),
        button('noIcon', 200, { source: 'none', assetId: '', name: '' }),
      ],
    }));
    // The player has no library: whatever it draws comes from the document.
    appSettings.update((current) => ({ ...current, icons: [] }));
    fire('loadPanel', { panel: prepared });
    return JSON.parse(prepared).icons ?? [];
  },
  play: PLAY,
};

mount(Player, { target: document.getElementById('host') });
