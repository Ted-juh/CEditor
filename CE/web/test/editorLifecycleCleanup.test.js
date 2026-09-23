// editorLifecycleCleanup.test.js — cross-component contracts for delayed work and window drags.
//
// The Node suite has no browser DOM, so these assertions cover the component wiring that cannot
// be exercised through SSR: script edits must reach their owning document before tab close removes
// it, and every listener/timer installed outside the component must share a teardown path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(
  resolve(here, '..', 'src', 'CE_Application', 'editor', name), 'utf8',
);

test('script edits persist to the document that created the designer before close can remove it', () => {
  const designer = src('BehaviorDesigner.svelte');
  const canvas = src('EditorCanvas.svelte');

  assert.match(designer, /\bdocumentId = null\b/);
  assert.match(designer, /onChange\?\.\(snap, documentId\)/);

  const persistenceEffect = designer.slice(designer.indexOf('const snap = $state.snapshot(scripts)'));
  assert.ok(
    persistenceEffect.indexOf('onChange?.(snap, documentId)')
      < persistenceEffect.indexOf('saveTimer = setTimeout'),
    'the owning store must be current before a debounced callback can be overtaken by tab close',
  );
  assert.match(designer, /onDestroy\(\(\) => \{[\s\S]*?destroyed = true;[\s\S]*?flushPendingSave\(\);/,
    'pending saved-state/version work must be settled when the designer unmounts');
  assert.match(designer, /ensureTs\(\)\.then\(\(m\) => \{ if \(m && !destroyed\) tsLoadTick\+\+;/,
    'compiler completion must not update a designer that has already unmounted');
  assert.match(designer, /const fallbackLanguage = selected\?\.language \?\? 'lua';[\s\S]*?await file\.text\(\);[\s\S]*?if \(destroyed\) return;/,
    'file import must keep its original target and stop when the designer unmounts');

  assert.match(canvas, /documentId=\{\$activeEditorTab\.id\}/);
  assert.match(canvas, /onChange=\{\(scripts, documentId\) => \{[\s\S]*?updateScriptDocument\(documentId, \{ scripts \}\);[\s\S]*?if \(scriptPanel\) updatePanel\(scriptPanel\.id, \{ scripts \}\);/,
    'the owning workspace and bound panel both receive source edits');
  assert.doesNotMatch(canvas, /onChange=\{\(scripts\) => updateScriptDocument\(\$activeEditorTab\.id/,
    'a delayed callback must never look up whichever tab happens to be active later');
});

test('the canvas removes gesture and split-resize window listeners on blur and destroy', () => {
  const canvas = src('EditorCanvas.svelte');

  assert.match(canvas, /window\.addEventListener\('blur', endGesture\)/);
  assert.match(canvas, /window\.removeEventListener\('blur', endGesture\)/);
  assert.match(canvas, /window\.addEventListener\('blur', handleUp\)/);
  assert.match(canvas, /window\.removeEventListener\('blur', handleUp\)/);
  assert.match(canvas, /onDestroy\(\(\) => \{[\s\S]*?endGesture\(\);[\s\S]*?cancelSplitResize\?\.\(\);/);
});

test('the code editor cancels delayed analysis, hover, and minimap drag work', () => {
  const editor = src('CodeEditor.svelte');

  const analysisEffect = editor.slice(editor.indexOf('const v = value;'));
  assert.match(analysisEffect, /return \(\) => \{[\s\S]*?clearTimeout\(timer\)/,
    'a superseded large-file analysis must not run after the next value arrives');
  assert.match(editor, /window\.addEventListener\('pointercancel', up\)/);
  assert.match(editor, /window\.addEventListener\('blur', up\)/);
  assert.match(editor, /onDestroy\(\(\) => \{[\s\S]*?cancelMinimapDrag\?\.\(\);[\s\S]*?clearTimeout\(analyzeTimer\);[\s\S]*?clearHover\(\);/);
});
