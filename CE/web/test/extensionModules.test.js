// extensionModules.test.js — third-party scripting modules (ce.ext.*).
//
// The three things "installed into the app" costs, per design doc §8, are what this covers:
// the exporter must bundle a module, a missing one must be named rather than mysterious, and an
// install-time collision check has to stand in for the name authority a registry would provide.
//
// The WebView half is exercised end to end — a module's JavaScript is actually evaluated and its
// members actually called — because a manifest that validates but does not run is worth nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import {
  validateExtensionManifest, installExtension, uninstallExtension, installedExtensions,
  uninstallAllExtensions, extensionSource, missingExtensionsFor, extensionsToBundle,
  bundledExtensions,
} from '../src/CE_Application/scripting/extensionModules.js';
import {
  allModules, moduleById, memberPath, memberModule, resolveModules, panelModules,
  panelModuleCost, membersByModule, isExtensionModule, modulesUsedBy, MODULE_BY_ID,
} from '../src/CE_Application/scripting/panelApi.js';
import {
  scriptApiForTesting, setRuntimeHost, resetExtensionCache,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const here = dirname(fileURLToPath(import.meta.url));

/** A minimal, valid module. Overrides are merged shallowly. */
function manifest(over = {}) {
  return {
    id: 'ce.ext.test_mod',
    version: '1.0',
    runtime: 'any',
    requires: ['ce.core'],
    summary: 'A module for tests.',
    members: [{ id: 'testDouble', name: 'double', signature: 'testDouble(n)' }],
    prelude: { javascript: 'function testDouble(n){ return n * 2; }' },
    ...over,
  };
}

test.afterEach(() => { uninstallAllExtensions(); resetExtensionCache(); setRuntimeHost(null); });

/* ------------------------------------------------------------------------- the format */

test('a well-formed manifest validates and normalises', () => {
  const { ok, module, problems } = validateExtensionManifest(manifest());
  assert.deepEqual(problems, []);
  assert.ok(ok);
  assert.equal(module.id, 'ce.ext.test_mod');
  assert.equal(module.members[0].name, 'double');
  // A member with no explicit short name answers to its own id.
  const bare = validateExtensionManifest(manifest({
    members: [{ id: 'testThing' }],
    prelude: { javascript: 'function testThing(){ return 1; }' },
  }));
  assert.equal(bare.module.members[0].name, 'testThing');
});

test('a module must live under ce.ext.*', () => {
  for (const id of ['ce.midi', 'roland', 'ce.roland', '']) {
    const { ok, problems } = validateExtensionManifest(manifest({ id }));
    assert.equal(ok, false, `${id} should be refused`);
    assert.ok(problems.length);
  }
  // …and the tail has to be a usable identifier, or the namespace path would not parse.
  assert.equal(validateExtensionManifest(manifest({ id: 'ce.ext.Not-Valid' })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ id: 'ce.ext.roland_sysex' })).ok, true);
});

test('the install-time collision check is the name authority', () => {
  // This is the whole reason third-party modules are namespaced AND checked: without a registry
  // nobody arbitrates names, so two modules claiming sendCC would resolve as last-install-wins.
  const clash = validateExtensionManifest(manifest({
    members: [{ id: 'sendCC', name: 'cc' }],
    prelude: { javascript: 'function sendCC(){}' },
  }));
  assert.equal(clash.ok, false);
  assert.match(clash.problems.join(' '), /already provided by ce\.midi/);

  // Two extensions colliding with each OTHER is caught the same way.
  installExtension(manifest());
  const second = validateExtensionManifest(manifest({
    id: 'ce.ext.other',
    members: [{ id: 'testDouble', name: 'double' }],
    prelude: { javascript: 'function testDouble(){}' },
  }));
  assert.equal(second.ok, false);
  assert.match(second.problems.join(' '), /already provided by ce\.ext\.test_mod/);
});

test('a keyword in any scripting language is refused', () => {
  // `goto` parses in JS and Python and fails in Lua only — the worst place to find out.
  for (const name of ['goto', 'end', 'lambda', 'class']) {
    const bad = validateExtensionManifest(manifest({
      members: [{ id: 'okName', name }],
      prelude: { javascript: 'function okName(){}' },
    }));
    assert.equal(bad.ok, false, `${name} should be refused`);
  }
});

test('a module with no members, no prelude, or an unknown dependency is refused', () => {
  assert.equal(validateExtensionManifest(manifest({ members: [] })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ prelude: {} })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ prelude: { klingon: 'x' } })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ requires: ['ce.nope'] })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ runtime: 'somewhere' })).ok, false);
  assert.equal(validateExtensionManifest(null).ok, false);
});

test('a failed upgrade leaves the working copy installed', () => {
  assert.ok(installExtension(manifest()).ok);
  const bad = installExtension(manifest({ version: '2.0', members: [] }));
  assert.equal(bad.ok, false);
  assert.equal(moduleById('ce.ext.test_mod')?.version, '1.0',
    'a broken upgrade must not uninstall what worked');

  const good = installExtension(manifest({ version: '2.0' }));
  assert.ok(good.ok);
  assert.equal(good.replaced.version, '1.0', 'and a good one reports what it replaced');
  assert.equal(installedExtensions().length, 1, 'an upgrade replaces rather than accumulates');
});

/* ------------------------------------------------------ first-class in the contract */

test('an installed module is a module everywhere it matters', () => {
  installExtension(manifest());

  assert.ok(allModules().some((m) => m.id === 'ce.ext.test_mod'));
  assert.ok(isExtensionModule('ce.ext.test_mod'));
  assert.equal(memberPath('testDouble'), 'ce.ext.test_mod.double');
  assert.equal(memberModule().testDouble.module, 'ce.ext.test_mod');
  assert.ok(membersByModule().some((g) => g.module?.id === 'ce.ext.test_mod'));
  assert.deepEqual(modulesUsedBy('function f(){ testDouble(2) }'), ['ce.ext.test_mod']);
  assert.deepEqual(modulesUsedBy('function f(){ ce.ext.test_mod.double(2) }'), ['ce.ext.test_mod']);

  // The built-in constants are untouched: parity holds five runtimes to those, and an installed
  // module must not be able to weaken the contract they are held to.
  assert.equal(MODULE_BY_ID['ce.ext.test_mod'], undefined);
});

test('resolveModules closes over an extension\'s requires', () => {
  installExtension(manifest({ requires: ['ce.core', 'ce.midi'] }));
  const r = resolveModules(['ce.ext.test_mod']);
  assert.ok(r.enabled.includes('ce.midi'), 'a module can depend on a built-in one');
  assert.ok(r.added.includes('ce.midi'));
  assert.deepEqual(r.missing, []);
});

test('an uninstalled module is MISSING, not unknown — a different problem with a different fix', () => {
  const r = resolveModules(['ce.ext.absent', 'ce.nonsense']);
  assert.deepEqual(r.missing, ['ce.ext.absent']);
  assert.deepEqual(r.unknown, ['ce.nonsense']);
  assert.ok(!r.enabled.includes('ce.ext.absent'));
  assert.ok(r.enabled.includes('ce.core'), 'and the rest of the panel keeps working');
});

test('a panel names what it is missing, and can install it from its own bundled copy', () => {
  const copy = manifest();
  const panel = { scripting: { modules: ['ce.ext.test_mod'], extensions: [copy] } };

  const missing = missingExtensionsFor(panel);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].id, 'ce.ext.test_mod');
  assert.equal(missing[0].version, '1.0', 'it says which version the panel was built against');
  assert.equal(missing[0].installable, true, 'an exported panel carries the module that needs it');

  assert.ok(installExtension(missing[0].manifest).ok);
  assert.deepEqual(missingExtensionsFor(panel), [], 'and once installed, nothing is missing');

  // A panel that names a module but carries no copy is still named — just not installable.
  const bare = missingExtensionsFor({ scripting: { modules: ['ce.ext.nowhere'] } });
  assert.equal(bare[0].installable, false);
  assert.equal(bare[0].manifest, null);
});

/* -------------------------------------------------------------------- export bundling */

test('the exporter bundles only the modules the panel turned on', () => {
  installExtension(manifest());
  installExtension(manifest({ id: 'ce.ext.unused', members: [{ id: 'unusedThing', name: 'thing' }],
    prelude: { javascript: 'function unusedThing(){}' } }));

  const bundled = extensionsToBundle(['ce.core', 'ce.midi', 'ce.ext.test_mod']);
  assert.deepEqual(bundled.map((m) => m.id), ['ce.ext.test_mod'],
    'someone else\'s module must not ride along in an export that never calls it');
  assert.ok(bundled[0].prelude.javascript, 'and the copy carries its source, or it could not run');

  assert.deepEqual(bundledExtensions({ scripting: { extensions: bundled } }).map((m) => m.id),
    ['ce.ext.test_mod']);
  assert.deepEqual(bundledExtensions({}), []);
});

test('an installed module is billed for what its own prelude weighs', () => {
  installExtension(manifest());
  const cost = panelModuleCost({ scripting: { modules: ['ce.ext.test_mod'] } });
  const row = cost.modules.find((m) => m.key === 'ce.ext.test_mod');
  assert.ok(row, 'it appears in the cost table');
  assert.ok(row.bytes > 0, 'measured from the prelude it ships, not from the generated table');
  assert.equal(row.extension, true);
});

/* ------------------------------------------------------------ it actually runs (WebView) */

const gateNotices = () => get(scriptTrace).map((t) => String(t.message ?? ''));

test('an installed module\'s members are callable, flat and namespaced', () => {
  installExtension(manifest({
    members: [
      { id: 'testDouble', name: 'double' },
      { id: 'testUsesBuiltin', name: 'clampish' },
    ],
    prelude: {
      javascript: 'function testDouble(n){ return n * 2; }\n'
        // Calling a BUILT-IN from a module is the point of `requires` — this proves the module's
        // code really does run with the panel API in scope.
        + 'function testUsesBuiltin(n){ return clamp(n, 0, 10); }',
    },
  }));

  const api = scriptApiForTesting('', 'ext-1');
  assert.equal(typeof api.testDouble, 'function');
  assert.equal(api.testDouble(21), 42, 'the flat spelling works');
  assert.equal(api.ce.ext.test_mod.double(21), 42, 'and so does ce.ext.<id>.<name>');
  assert.equal(api.ce.ext.test_mod.double, api.testDouble, 'they are the same function');
  assert.equal(api.testUsesBuiltin(50), 10, 'a module can call the built-in API');
});

test('ce.has reports an installed module', () => {
  installExtension(manifest());
  const { ce } = scriptApiForTesting('', 'ext-2');
  assert.equal(ce.has('ce.ext.test_mod'), true);
  assert.equal(ce.has('ce.ext.absent'), false);
  assert.ok(ce.modules.some((m) => m.id === 'ce.ext.test_mod'));
});

test('a third-party module is gated exactly like a built-in one', () => {
  installExtension(manifest());
  setRuntimeHost({ panel: { id: 'p', scripting: { modules: ['ce.math'] }, controls: [] } });
  clearScriptTrace();

  const api = scriptApiForTesting('', 'ext-3');
  api.testDouble(21);
  assert.ok(gateNotices().some((m) => /testDouble\(\) needs the ce\.ext\.test_mod module/.test(m)),
    'a module the panel did not enable explains itself, whoever wrote it');
  assert.equal(api.ce.has('ce.ext.test_mod'), false);
});

test('a module that will not parse is reported and skipped, never fatal', () => {
  // Validation cannot catch this — the manifest is well-formed and the source is only syntax at
  // install time. So the runtime has to survive it, and say so.
  installExtension(manifest({ prelude: { javascript: 'function testDouble(n){ return n * ; }' } }));
  clearScriptTrace();

  const api = scriptApiForTesting('', 'ext-4');
  assert.ok(gateNotices().some((m) => /will not parse/.test(m)), 'the failure is reported');
  assert.equal(typeof api.clamp, 'function', 'and the rest of the API is untouched');
  assert.equal(api.testDouble, undefined, 'the member it promised simply is not there');
});

test('a module that promises a member and does not define it is reported', () => {
  installExtension(manifest({
    members: [{ id: 'testDouble', name: 'double' }, { id: 'testMissing', name: 'missing' }],
    prelude: { javascript: 'function testDouble(n){ return n * 2; }' },
  }));
  clearScriptTrace();

  const api = scriptApiForTesting('', 'ext-5');
  assert.equal(api.testDouble(2), 4, 'what it did define still works');
  assert.ok(gateNotices().some((m) => /declares testMissing but does not define it/.test(m)));
});

test('a module that throws while loading does not take the panel down', () => {
  installExtension(manifest({ prelude: { javascript: 'throw new Error("boom");' } }));
  clearScriptTrace();

  const api = scriptApiForTesting('', 'ext-6');
  assert.ok(gateNotices().some((m) => /load error: boom/.test(m)));
  assert.equal(typeof api.sendCC, 'function', 'the built-in surface is unaffected');
});

/* --------------------------------------------------------------- the reference module */

test('the shipped ce.ext.roland_sysex example is a valid module and computes real bytes', () => {
  const file = join(here, '..', '..', 'profiles', 'modules', 'ce.ext.roland_sysex.cemodule');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));

  const { ok, problems, module } = validateExtensionManifest(parsed);
  assert.deepEqual(problems, [], 'the documented example must pass the documented rules');
  assert.ok(ok);
  for (const language of ['lua', 'javascript', 'python']) {
    assert.ok(extensionSource(module, language), `it ships ${language}`);
  }

  installExtension(parsed);
  const api = scriptApiForTesting('', 'roland');
  const addr = api.ce.ext.roland_sysex.address(0x19, 0x01, 0x00, 0x00);
  assert.deepEqual(addr, [0x19, 1, 0, 0]);

  const body = api.ce.ext.roland_sysex.pack(addr, [0x40]);
  // 0x19 + 0x01 + 0x40 = 0x5A = 90; the Roland checksum is (128 - 90) % 128 = 38.
  assert.deepEqual(body, [0x19, 1, 0, 0, 0x40, 38],
    'the same bytes the C++ engines produce from the same module (ScriptRuntimeTests)');

  const back = api.ce.ext.roland_sysex.unpack(body);
  assert.equal(back.valid, true);
  assert.deepEqual(back.address, [0x19, 1, 0, 0]);
  assert.deepEqual(back.data, [0x40]);

  // A corrupted checksum is reported rather than trusted.
  assert.equal(api.ce.ext.roland_sysex.unpack([0x19, 1, 0, 0, 0x40, 39]).valid, false);
});
