// showcaseInstall.test.js — the showcase collections are installed with the app: the CMake install
// rules and the Windows installer each name every collection's folder, so an installed CEditor has
// the panels File > Open is pointed at. A collection added to showcaseCollections.js and left out of
// either list would be in the repository and missing from every install.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COLLECTIONS } from '../scripts/showcaseCollections.js';

const ROOT = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('the CMake install puts every showcase collection beside the starters', () => {
  const cmake = read('CMakeLists.txt');
  const loop = /foreach \(showcase IN ITEMS ([^)]*)\)\s*install\(DIRECTORY "\$\{CE_ROOT\}\/panels\/\$\{showcase\}\/"\s*DESTINATION "CE\/panels\/\$\{showcase\}"/.exec(cmake);
  assert.ok(loop, 'one install rule over the showcase folders');
  const named = [...loop[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(named.sort(), Object.values(COLLECTIONS).map((c) => c.folder).sort());
});

test('the Windows installer copies every showcase collection from the staged install', () => {
  const iss = read('tools/installer/CEditor.iss');
  for (const { folder } of Object.values(COLLECTIONS)) {
    const source = `Source: "{#MySourceDir}\\CE\\panels\\${folder}\\*"; DestDir: "{app}\\CE\\panels\\${folder}"`;
    assert.ok(iss.includes(source), `CEditor.iss installs ${folder}`);
  }
});
