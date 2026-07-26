import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTs, transpileTs } from '../src/CE_Application/scripting/tsService.js';
import { createScript, normalizeSourceScript } from '../src/CE_Application/scripting/scriptModel.js';
import {
  normalizeScript,
  serializeScriptWorkspaceDocument,
  deserializeScriptWorkspaceDocument,
} from '../src/CE_Application/scripting/scriptDocumentModel.js';

// The shipped C++ host has no TypeScript compiler: it runs the JS the editor transpiled and stored
// on `compiledJs`. These tests pin the persistence contract that carries that field end to end.

test('transpileTs strips type annotations to runnable JS (real compiler)', async () => {
  const ts = await ensureTs();
  assert.ok(ts, 'typescript compiler should load as a dev dependency');
  const js = transpileTs('function onValueChanged(e: { value: number }): void { set("out", e.value); }');
  assert.ok(js && !/:\s*number|:\s*void/.test(js), `annotations should be gone: ${js}`);
  assert.match(js, /function onValueChanged/);
});

test('normalizeScript keeps compiledJs for TypeScript only', () => {
  const ts = normalizeScript({ id: 's1', language: 'typescript', source: 'const x: number = 1;', compiledJs: 'const x = 1;' });
  assert.equal(ts.compiledJs, 'const x = 1;');

  // A JS script (or any non-TS) must never carry a stale compiledJs into persistence.
  const js = normalizeScript({ id: 's2', language: 'javascript', source: 'const x = 1;', compiledJs: 'const x = 1;' });
  assert.equal(js.compiledJs, undefined);
});

test('createScript / normalizeSourceScript preserve compiledJs for TS', () => {
  const made = createScript({ language: 'typescript', source: 'let n: number = 2;', compiledJs: 'let n = 2;' });
  assert.equal(made.compiledJs, 'let n = 2;');
  const made2 = createScript({ language: 'lua', source: 'print(1)', compiledJs: 'nope' });
  assert.equal(made2.compiledJs, undefined);

  const norm = normalizeSourceScript({ id: 'x', language: 'typescript', source: 'let n: number = 2;', compiledJs: 'let n = 2;' });
  assert.equal(norm.compiledJs, 'let n = 2;');
});

test('compiledJs survives a workspace serialize → deserialize round-trip', () => {
  const json = serializeScriptWorkspaceDocument({
    id: 'ws',
    scripts: [{ id: 's1', name: 'TS', language: 'typescript', source: 'const x: number = 1;', compiledJs: 'const x = 1;', event: 'onValueChanged' }],
  });
  assert.match(json, /"compiledJs": "const x = 1;"/);
  const doc = deserializeScriptWorkspaceDocument(json);
  const s = doc.scripts.find((x) => x.id === 's1');
  assert.equal(s.compiledJs, 'const x = 1;');
  // and the raw TS source is still there (so gatherPanelScripts' non-empty-source filter passes)
  assert.equal(s.source, 'const x: number = 1;');
});

test('typescript is an allowed raw-code language by default', () => {
  const doc = deserializeScriptWorkspaceDocument(JSON.stringify({ kind: 'ceditor.scriptWorkspace', scripts: [] }));
  assert.ok(doc.rawCodePolicy.allowedLanguages.includes('typescript'));
});
