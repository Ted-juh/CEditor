// fontOutlineSources.js — the editor's fonts, handed to the code that turns text into outlines, and the
// fonts open panels carry, handed to the page.
//
// utils/fontSources.js is deliberately free of stores and the bridge, so it runs the same in the
// player and in the tests; the editor wires its side in here, once, at start-up (main.js):
//
//   storedFonts  the fonts imported in Settings, live, so a font imported a moment ago outlines at once
//   readFile     a font the settings keep by path, read through the same file cache the images use
//
// and it keeps the faces every open panel carries (utils/documentFonts.js) registered: a panel shared
// by someone who imported a font this user never did still draws, and outlines, in it.
//
// This file was described in fontSources.js before it existed. Until it did, the editor refused to
// outline text in any imported font — "not available to outline" — although the font was right there.

import { get } from 'svelte/store';

import { setFontSources } from '../utils/fontSources.js';
import { registerDocumentFonts } from '../utils/documentFonts.js';
import { appSettings } from './appSettings.js';
import { readFontData } from './fontFileData.js';
import { panels } from './panels.js';

function dataUrlBytes(dataUrl) {
  const text = String(dataUrl ?? '');
  const comma = text.indexOf(',');
  if (comma < 0) return null;
  const binary = atob(text.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let wired = false;
export function wireFontOutlineSources() {
  if (wired) return;
  wired = true;
  setFontSources({
    storedFonts: () => get(appSettings)?.fonts ?? [],
    readFile: async (filePath) => dataUrlBytes(await readFontData(filePath)),
  });
  panels.subscribe((list) => {
    registerDocumentFonts((list ?? []).flatMap((panel) => (Array.isArray(panel?.fonts) ? panel.fonts : [])));
  });
}
