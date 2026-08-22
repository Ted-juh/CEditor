// sectionEditorKey.test.js — the section editor's `{#key}` is an identity, not a value (finding E5).
//
// SectionRenderer keyed the Text tab on the text CONTENT and the font family. Svelte destroys and
// rebuilds a component when its key changes, so every external change to a caption — an undo, a
// script write, the inline canvas text edit — remounted TextEditor.svelte: 2,455 lines and nine
// collapsible sections rebuilt to change one string, with every section snapped back to default.
//
// Content never needed it. TextEditor re-seeds its `textDraft` from `Text.content` whenever the
// document value moves away from the last one it committed, and re-keys its own Font Settings
// section on family/weight/style. This test pins the key so nobody puts a document value back in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sectionEditorInstanceKey } from '../src/CE_Application/panels/sectionEditorKey.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFileSync(join(here, '..', 'src', 'CE_Application', ...parts), 'utf8');

const textTab = { contextMode: 'component', tabId: 'text', controlId: 'ctrl_1', stateTargetKey: 'base' };

test('the text editor keeps its instance across a content change', () => {
  // Same control, same state target: whatever the caption now says, this is the same editor.
  assert.equal(sectionEditorInstanceKey(textTab), sectionEditorInstanceKey(textTab));
});

test('the key depends on the control and the state target, and nothing else', () => {
  const base = sectionEditorInstanceKey(textTab);

  assert.notEqual(sectionEditorInstanceKey({ ...textTab, controlId: 'ctrl_2' }), base,
    'a different control must get a different editor');
  assert.notEqual(sectionEditorInstanceKey({ ...textTab, stateTargetKey: 'hover' }), base,
    'a different state target is a different editing target');
  assert.notEqual(sectionEditorInstanceKey({ ...textTab, tabId: 'background' }), base);
  assert.notEqual(sectionEditorInstanceKey({ ...textTab, contextMode: 'panel' }), base);
});

test('only the tabs that need it are keyed on the state target', () => {
  // `segments` takes stateTargetKey as a prop and rebuilds from it; the rest receive an
  // already-scoped control and re-derive, so re-keying them would be a remount for nothing.
  const seg = { contextMode: 'component', tabId: 'segments', controlId: 'c', stateTargetKey: 'base' };
  assert.notEqual(sectionEditorInstanceKey({ ...seg, stateTargetKey: 'hover' }), sectionEditorInstanceKey(seg));

  const bg = { contextMode: 'component', tabId: 'background', controlId: 'c', stateTargetKey: 'base' };
  assert.equal(sectionEditorInstanceKey({ ...bg, stateTargetKey: 'hover' }), sectionEditorInstanceKey(bg));
});

test('SectionRenderer no longer puts document values in the key', () => {
  const source = read('panels', 'SectionRenderer.svelte');
  const keyBlock = source.slice(source.indexOf('let editorInstanceKey'), source.indexOf('let hasDedicatedEditor'));

  assert.ok(keyBlock.includes('sectionEditorInstanceKey'), 'the key is no longer built by the shared helper');
  for (const value of ['Text?.content', 'Font?.family', 'textEditorRenderKey']) {
    assert.ok(!source.includes(value), `${value} is back in SectionRenderer's key — every undo will remount TextEditor`);
  }
});

test('TextEditor still reconciles an external content change on its own', () => {
  // The remount was doing this job. If the effect that replaces it ever goes, the fix above
  // silently becomes a bug: the textarea would keep showing the pre-undo caption.
  const source = read('sections', 'TextEditor.svelte');
  assert.match(source, /let textDraftSource = \$state\(/);
  assert.match(
    source,
    /const current = String\(text\?\.content \?\? ''\);\s*\n\s*if \(current !== textDraftSource\)/,
    'TextEditor no longer re-seeds textDraft from Text.content — SectionRenderer must key on content again, or this must be restored',
  );
  assert.match(source, /let fontEditorRenderKey = \$derived\(/,
    'TextEditor no longer re-keys its own Font Settings section — the family was dropped from the outer key on the strength of this');
});
