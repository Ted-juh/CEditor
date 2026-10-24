// popupTheme.test.js — the code editor's portaled popups are drawn in the editor's colours: every
// custom property their CSS reads is carried to them, since at <body> the host's and the editor's
// own do not reach them (popupTheme.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { POPUP_VARS, carryPopupTheme } from '../src/CE_Application/editor/popupTheme.js';

const EDITOR = readFileSync(fileURLToPath(new URL('../src/CE_Application/editor/CodeEditor.svelte', import.meta.url)), 'utf8');

test('every custom property a portaled popup\'s CSS reads is one carried to it', () => {
  const css = EDITOR.slice(EDITOR.indexOf('<style>'), EDITOR.indexOf('</style>'));
  const read = new Set();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.ce-(sig|hover|ac|so|rename)\b/.test(selector)) continue;
    for (const [, name] of body.matchAll(/var\((--[\w-]+)/g)) read.add(name);
  }
  assert.ok(read.has('--panel-2') && read.has('--line-2'), 'the popups\' background and border are among them');
  const missing = [...read].filter((name) => !POPUP_VARS.includes(name));
  assert.deepEqual(missing, [], 'a popup reads these and they are not carried');
  // And every popup is moved by the portal that carries them.
  for (const cls of ['ce-sig', 'ce-hover', 'ce-ac', 'ce-so', 'ce-rename']) {
    assert.match(EDITOR, new RegExp(`class=[^>]*${cls}[^>]*use:portal`), `${cls} is portaled`);
  }
});

test('the values are read where the editor is and set on the popup', () => {
  const values = { '--panel-2': ' #1c2129', '--line-2': '#333b48', '--txt': '' };
  const set = {};
  globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => values[name] ?? '' });
  try {
    carryPopupTheme({ style: { setProperty: (name, value) => { set[name] = value; } } }, {});
  } finally {
    delete globalThis.getComputedStyle;
  }
  assert.deepEqual(set, { '--panel-2': '#1c2129', '--line-2': '#333b48' }, 'trimmed, and one with no value left alone');
});
