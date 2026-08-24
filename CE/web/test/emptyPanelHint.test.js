// emptyPanelHint.test.js — a brand-new panel says where components come from.
//
// Review finding E6, first clause: "New-panel onboarding is a bare grey 600×400 rectangle: no
// hint pointing at the icon rail... (The no-document empty state, by contrast, is genuinely
// good.)" The canvas already knew how to say "here is what to do next" when nothing was open;
// one step later, with a document open and nothing on it, it said nothing at all — and an empty
// panel looks exactly like a broken one.
//
// Three properties matter as much as the hint existing: it must vanish the moment the panel has
// content, it must not reach a preview or an export render, and it must not take the pointer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '..', 'src', 'CE_Application', 'editor', 'EditorCanvas.svelte');
const source = readFileSync(path, 'utf8');
const styles = source.slice(source.lastIndexOf('<style'));

/** The annotation snippet's body — everything the canvas draws over the panel. */
const snippet = source.match(/\{#snippet canvasAnnotations\(\)\}[\s\S]*?\n\{\/snippet\}/)?.[0] ?? '';

test('the component still compiles with the hint in it', () => {
  const { warnings } = compile(source, { filename: 'EditorCanvas.svelte' });
  const real = warnings.filter((w) => !w.code.startsWith('a11y'));
  assert.deepEqual(real.map((w) => w.code), [], real.map((w) => w.message).join('\n'));
});

test('the hint exists and points at where components come from', () => {
  assert.ok(snippet, 'the annotation layer exists');
  assert.match(snippet, /class="empty-panel-hint"/);
  assert.match(snippet, /Insert/, 'names the Insert panel');
  assert.match(snippet, /left rail/, 'and says where to find it');
});

test('it is gated on the panel being empty, so it can never print over content', () => {
  const guard = snippet.match(/\{#if \(canvasPanel\?\.controls\?\.length \?\? 0\) === 0\}[\s\S]*?\{\/if\}/);
  assert.ok(guard, 'the hint is inside a controls.length === 0 guard');
  assert.match(guard[0], /class="empty-panel-hint"/);
});

test('it is editor-only: preview and export build their own surface and never see it', () => {
  assert.match(snippet, /\{#if !\$previewModeEnabled\}/, 'the whole layer is skipped in preview');
  const previewBranch = source.match(/<PanelPreviewSurface[\s\S]*?\/>/g) ?? [];
  assert.ok(previewBranch.length > 0);
  for (const branch of previewBranch) {
    assert.ok(!/empty-panel-hint/.test(branch));
  }
  // The hint lives in EditorCanvas, which is the editor chrome — nothing that renders a panel
  // for export or playback mounts it.
  assert.ok(!/empty-panel-hint/.test(readFileSync(
    join(here, '..', 'src', 'CE_Application', 'editor', 'PanelSurface.svelte'), 'utf8')));
});

test('it is unobtrusive and inert', () => {
  const annotations = styles.match(/\.canvas-annotations \{[^}]*\}/)?.[0] ?? '';
  assert.match(annotations, /pointer-events: none;/, 'a hint that ate a drop would be worse than none');
  const hint = styles.match(/\.empty-panel-hint \{[^}]*\}/)?.[0] ?? '';
  assert.match(hint, /color: #7C8B99;/, 'muted, not a banner');
  assert.match(hint, /font-size: 12px;/);
});

test('the annotation layer is rendered on both canvases — split view is not a second-class editor', () => {
  const renders = source.match(/\{@render canvasAnnotations\(\)\}/g) ?? [];
  assert.equal(renders.length, 2, 'the plain canvas and the device-split canvas');
});
