// hostageCreator.test.js — Build product in the creator (docs/design/hostage-creator-editor-player.md,
// step 5).
//
// The host builds a product itself (ProductBuilder.h; testProductBuilder, testBuildProductCommand
// and testCreatorLicence in CE/tests/InstrumentHostServiceTests.cpp). This file holds the page to
// what the host reports, the creator's installer to the developer's (build-host-product.mjs: the
// same switches, in the same order, for the same script), and CEditor and its own installer to the
// parts that let it build with nothing else installed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import {
  emptyCreator, normalizeCreator, creatorCanBuild, normalizeHostState,
  buildHostProduct, hostBuild, installCreatorLicence, hostLastError,
} from '../src/CE_Application/stores/instrumentHost.js';
import { editorOnlyCommand } from '../src/CE_Application/utils/hostageRole.js';
import { stageCommandAllowed } from '../src/CE_Application/utils/stageLock.js';
import {
  normalizeProject, isccArgs, TEMPLATE_DEFINES,
} from '../../../tools/scripts/build-host-product.mjs';

const repo = (...parts) => readFileSync(new URL(`../../../${parts.join('/')}`, import.meta.url), 'utf8');
const source = (file) => readFileSync(new URL(`../src/CE_Application/${file}`, import.meta.url), 'utf8');

test('the page is told what the creator can build, and whether it may', () => {
  assert.deepEqual(normalizeCreator(undefined), emptyCreator());
  const ready = normalizeCreator({
    available: true, standalone: true, vst3: true, helpers: true, installer: true, licence: { required: false },
  });
  assert.equal(creatorCanBuild(ready), true);
  assert.equal(creatorCanBuild({ ...ready, busy: true }), false, 'one build at a time');
  assert.equal(creatorCanBuild({ ...ready, helpers: false }), false, 'every product needs the scanner and the worker');
  assert.equal(creatorCanBuild({ ...ready, standalone: false, vst3: false }), false, 'nothing to build from');
  assert.equal(creatorCanBuild({ ...ready, installer: false }), true, 'without Inno Setup it builds the folder');

  const gated = { ...ready, licence: { required: true, licensed: false, licensee: '', detail: '' } };
  assert.equal(creatorCanBuild(gated), false, 'a build with the vendor\'s key waits for a Creator licence');
  assert.equal(creatorCanBuild({ ...gated, licence: { ...gated.licence, licensed: true } }), true);
  assert.equal(creatorCanBuild(emptyCreator()), false, 'a HoSTage program is not the creator');

  const last = normalizeCreator({ last: { ok: true, folder: '/out/Night Rack 2.0.0', installer: '' } }).last;
  assert.deepEqual(last, { ok: true, name: '', folder: '/out/Night Rack 2.0.0', installer: '', message: '' });
  assert.equal(normalizeHostState({ creator: { available: true } }).creator.available, true);
});

test('only the editor builds, or holds a Creator licence, and not under Stage Lock', () => {
  for (const cmd of ['buildHostProduct', 'installCreatorLicence', 'removeCreatorLicence']) {
    assert.equal(editorOnlyCommand({ cmd }), true, `${cmd} is the editor's`);
    assert.equal(stageCommandAllowed(true, cmd), false, `${cmd} waits for Stage Lock to come off`);
  }
});

test('in the preview, a build ends as one without Inno Setup does, and asks for no licence', () => {
  buildHostProduct();
  const build = get(hostBuild);
  assert.equal(build.done, true);
  assert.equal(build.ok, true);
  assert.match(build.lines.at(-1), /Built as a folder, without an installer: Inno Setup 6 was not found/);

  hostLastError.set('');
  installCreatorLicence('{}');
  assert.match(get(hostLastError), /does not ask for a Creator licence/);
});

test('the Project utility is the creator\'s, says what it needs, and asks for a licence when the build does', () => {
  const view = source('sections/InstrumentHostView.svelte');
  assert.match(view, /hostUtilities\.filter\(\(u\) => !\(u\.id === 'project' && \(player \|\| !creator\.available\)\)\)/,
    'a HoSTage program has no Project utility: it makes players');
  assert.match(view, /data-testid="host-build-elsewhere">\s*Products are built in CEditor/,
    'and says where products are made if it is reached anyway');
  assert.match(view, /data-testid="host-build"\s+disabled=\{!creatorCanBuild\(creator\)\}/);
  assert.match(view, /\{#if creator\.licence\.required\}/, 'the licence box is there only when the build asks');
  assert.match(view, /onclick=\{\(\) => \{ installCreatorLicence\(creatorLicenceText\); creatorLicenceText = ''; \}\}/);
});

test('the creator compiles the installer the developer\'s script does: the same switches, in order', () => {
  const builder = repo('CE', 'src', 'InstrumentHost', 'ProductBuilder.h');
  const body = builder.match(/inline juce::StringArray isccArgs[\s\S]*?\n}\n/)?.[0] ?? '';
  const native = [...body.matchAll(/"\/D([A-Za-z0-9]+)=/g)].map((m) => m[1]);
  const { project } = normalizeProject({
    productName: 'Super Rack', version: '1.0.0', appId: '9B2C4E86-1D2E-4F30-8A4B-000000000001',
  });
  const script = isccArgs({
    project, stageDir: '/s', outDir: '/o', templatePath: '/t.iss',
    artifacts: { standaloneExe: '/b/Hostage.exe', vst3Bundle: '/b/Hostage.vst3' },
  }).filter((arg) => arg.startsWith('/D')).map((arg) => arg.slice(2, arg.indexOf('=')));
  assert.ok(native.length >= 11, `read ${native.length} switches from ProductBuilder.h`);
  assert.deepEqual(native, script);
  assert.deepEqual([...native].sort(), [...TEMPLATE_DEFINES].sort(),
    'and every one has its #ifndef default in HostProductTemplate.iss (hostProductBuild.test.js)');

  // The same product, too: the editor's manifest, its show, the installer's file name.
  assert.match(builder, /root->setProperty \("role", "editor"\)/);
  assert.match(builder, /return setupBaseName \(project\) \+ "-Setup-" \+ project\.version \+ "\.exe"/,
    'the setup file is named as HostProductTemplate.iss names it');
  assert.match(repo('tools', 'installer', 'HostProductTemplate.iss'),
    /OutputBaseFilename=\{#MySetupBase\}-Setup-\{#MyAppVersion\}/);
});

test('an installed CEditor has what it builds from, and Node.js is not in the way', () => {
  const handlers = repo('CE', 'src', 'ValueTreeBridgeHandlers.cpp');
  assert.match(handlers, /options\.creator = true;/);
  assert.match(handlers, /findInstalledTemplate \(root\.getChildFile \("templates"\)\.getChildFile \("hostage"\), exeDir\)/);
  assert.match(handlers, /getChildFile \("HostProductTemplate\.iss"\)/);
  assert.doesNotMatch(handlers, /build-host-product\.mjs/, 'no Node.js between the button and the product');

  const packaging = repo('tools', 'scripts', 'package-installer.ps1');
  assert.match(packaging, /\nBuild-And-Stage-Templates [^\n]*\nStage-HostTemplate /,
    'the HoSTage programs are staged after the templates folder is emptied, not before');
  assert.match(packaging, /Join-Path \$StageDir "templates\\hostage"/);
  assert.match(packaging, /installer\\HostProductTemplate\.iss/, 'and the installer\'s script beside the tools');
  assert.match(repo('tools', 'installer', 'CEditor.iss'),
    /Source: "\{#MySourceDir\}\\templates\\\*";[^\n]*recursesubdirs/, 'which CEditor\'s installer ships');
  assert.match(repo('tools', 'scripts', 'export-panel-template.mjs'),
    /readdirSync\(templatesDir\)\.find\(\(entry\) => entry\.toLowerCase\(\)\.endsWith\(format\.ext\)\)/,
    'the panel exporter looks no deeper than templates/, so templates/hostage is never a panel template');
});

test('the Creator licence is a licence for one fixed id, and a build asks for it only when given the key', () => {
  const builder = repo('CE', 'src', 'InstrumentHost', 'ProductBuilder.h');
  const id = builder.match(/creatorProductId = "([0-9A-F-]{36})"/)?.[1];
  assert.ok(id, 'the id is a GUID');
  assert.ok(builder.includes(`--product ${id}`), 'and the header says how to issue a licence for it');
  assert.ok(repo('docs', 'design', 'hostage-creator-editor-player.md').includes(id), 'as the design note does, for the owner');

  const cmake = repo('CMakeLists.txt');
  assert.match(cmake, /set\(CEDITOR_CREATOR_PUBLIC_KEY_FILE "" CACHE FILEPATH/, 'no key unless one is given');
  assert.match(cmake, /target_compile_definitions\(CEditor PRIVATE CEDITOR_CREATOR_PUBLIC_KEY=/);
  assert.match(cmake, /message\(FATAL_ERROR "CEDITOR_CREATOR_PUBLIC_KEY_FILE names/,
    'a key asked for and not there stops the configure, rather than shipping the check open');
  assert.match(repo('CE', 'src', 'ValueTreeBridgeHandlers.cpp'),
    /#if defined \(CEDITOR_CREATOR_PUBLIC_KEY\)\s*\/\/[^\n]*\n[^\n]*\n\s*options\.creatorPublicKey = CEDITOR_CREATOR_PUBLIC_KEY;/);
});
