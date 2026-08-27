// hostProductBuild.test.js — the generated product's assembly pipeline (VIP-successor Stage 1).
//
// Drives the pure half of tools/scripts/build-host-product.mjs: manifest validation, artifact
// resolution over a faked directory listing, the staging plan, and the ISCC switch list. The
// path arithmetic and the /D switches are where this pipeline can silently rot — a wrong
// artefacts directory stages nothing and a missing #ifndef guard makes a hand compile disagree
// with a pipeline compile — so both live under test, and the template itself is held to the
// switch list by the drift check at the bottom.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  normalizeProject, sanitizeBaseName, artifactCandidateDirs, resolveArtifacts,
  stagePlan, isccArgs, TEMPLATE_DEFINES,
} from '../../../tools/scripts/build-host-product.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const goodProject = {
  productName: 'Super Rack',
  version: '2.1.0',
  publisher: 'Tedjuh-inc',
  appId: '9B2C4E86-1D2E-4F30-8A4B-000000000001',
  includeStandalone: true,
  includeVst3: true,
};

// --- the manifest --------------------------------------------------------------------------------

test('a complete manifest normalizes without errors', () => {
  const { project, errors } = normalizeProject(goodProject);
  assert.deepEqual(errors, []);
  assert.equal(project.productName, 'Super Rack');
});

test('the manifest refusals name their field', () => {
  assert.match(normalizeProject({ ...goodProject, productName: '  ' }).errors.join(), /productName/);
  assert.match(normalizeProject({ ...goodProject, version: 'two' }).errors.join(), /version/);
  assert.match(normalizeProject({ ...goodProject, appId: 'not-a-guid' }).errors.join(), /appId/);
  assert.match(
    normalizeProject({ ...goodProject, includeStandalone: false, includeVst3: false }).errors.join(),
    /no targets/);
});

test('absent target flags default to on — a fresh manifest builds everything', () => {
  const { project } = normalizeProject({ productName: 'X', appId: goodProject.appId });
  assert.equal(project.includeStandalone, true);
  assert.equal(project.includeVst3, true);
});

test('the setup base name survives hostile product names', () => {
  assert.equal(sanitizeBaseName('Super Rack!'), 'SuperRack');
  assert.equal(sanitizeBaseName('...'), 'HostProduct');
});

// --- finding artifacts ---------------------------------------------------------------------------

const fakeTree = (entries) => (dir) => entries[dir] ?? [];

test('artifact resolution prefers the config directory and falls back beside it', () => {
  const dirs = artifactCandidateDirs({ buildDir: '/b', config: 'Release' });
  const artifacts = resolveArtifacts({
    candidateDirs: dirs,
    listDir: fakeTree({
      [path.join('/b', 'CEHostStandalone_artefacts', 'Release')]: ['CE Instrument Host.exe'],
      [path.join('/b', 'CEHostVST3_artefacts', 'VST3')]: ['CE Instrument Host.vst3'],
      [path.join('/b', 'Release')]: ['CEditorPluginScanner.exe'],
    }),
  });
  assert.equal(artifacts.standaloneExe,
    path.join('/b', 'CEHostStandalone_artefacts', 'Release', 'CE Instrument Host.exe'));
  // The VST3 came from the single-config layout — the fallback, not the preferred dir.
  assert.equal(artifacts.vst3Bundle,
    path.join('/b', 'CEHostVST3_artefacts', 'VST3', 'CE Instrument Host.vst3'));
  assert.equal(artifacts.scannerExe, path.join('/b', 'Release', 'CEditorPluginScanner.exe'));
});

test('a staged scanner is never mistaken for the standalone', () => {
  const dirs = artifactCandidateDirs({ buildDir: '/b', config: 'Release' });
  const artifacts = resolveArtifacts({
    candidateDirs: dirs,
    listDir: fakeTree({
      [path.join('/b', 'CEHostStandalone_artefacts', 'Release')]:
        ['CEditorPluginScanner.exe', 'CE Instrument Host.exe'],
    }),
  });
  assert.equal(path.basename(artifacts.standaloneExe), 'CE Instrument Host.exe');
});

// --- the staging plan ----------------------------------------------------------------------------

const foundArtifacts = {
  standaloneExe: path.join('/b', 'exe', 'CE Instrument Host.exe'),
  vst3Bundle: path.join('/b', 'vst3', 'CE Instrument Host.vst3'),
  scannerExe: path.join('/b', 'scan', 'CEditorPluginScanner.exe'),
};

test('the plan stages both targets with the scanner beside each binary', () => {
  const { project } = normalizeProject(goodProject);
  const { ops, missing } = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.deepEqual(missing, []);

  const targets = ops.map((op) => op.to);
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'CE Instrument Host.exe')));
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'CEditorPluginScanner.exe')));
  assert.ok(targets.includes(path.join('/s', 'VST3', 'CE Instrument Host.vst3')));
  // Inside the bundle, beside the module — where the plug-in's worker search starts.
  assert.ok(targets.includes(path.join('/s', 'VST3', 'CE Instrument Host.vst3',
    'Contents', 'x86_64-win', 'CEditorPluginScanner.exe')));
});

test('a disabled target stages nothing of itself', () => {
  const { project } = normalizeProject({ ...goodProject, includeVst3: false });
  const { ops, missing } = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.deepEqual(missing, []);
  assert.ok(ops.every((op) => !op.to.includes('VST3')));
});

test('missing artifacts refuse by name instead of staging half a product', () => {
  const { project } = normalizeProject(goodProject);
  const { missing } = stagePlan({
    project,
    artifacts: { standaloneExe: null, vst3Bundle: foundArtifacts.vst3Bundle, scannerExe: null },
    stageDir: '/s',
  });
  assert.match(missing.join('\n'), /CEHostStandalone/);
  assert.match(missing.join('\n'), /CEditorPluginScanner/);
});

// --- the installer compile -----------------------------------------------------------------------

test('the ISCC switches carry the whole manifest and the discovered names', () => {
  const { project } = normalizeProject(goodProject);
  const args = isccArgs({
    project, stageDir: '/s', outDir: '/o', artifacts: foundArtifacts, templatePath: '/t.iss',
  });
  assert.ok(args.includes('/DMyAppName=Super Rack'));
  assert.ok(args.includes('/DMyAppId=9B2C4E86-1D2E-4F30-8A4B-000000000001'));
  assert.ok(args.includes('/DMySetupBase=SuperRack'));
  assert.ok(args.includes('/DIncludeStandalone=1'));
  assert.ok(args.includes('/DMyAppExeName=CE Instrument Host.exe'));
  assert.ok(args.includes('/DMyVst3BundleName=CE Instrument Host.vst3'));
  assert.equal(args.at(-1), '/t.iss', 'the template is the trailing positional');
});

test('every /D the script can pass has an #ifndef guard in the template', () => {
  // The drift check: a define without a guard makes a hand compile of the template disagree
  // with a pipeline compile — the CEditor.iss convention, enforced instead of remembered.
  const template = readFileSync(
    path.join(repoRoot, 'tools', 'installer', 'HostProductTemplate.iss'), 'utf8');
  for (const name of TEMPLATE_DEFINES)
    assert.match(template, new RegExp(`#ifndef ${name}\\b`), `${name} needs an #ifndef default`);
});

test('the template pins identity to the manifest appId, braces escaped for Inno', () => {
  const template = readFileSync(
    path.join(repoRoot, 'tools', 'installer', 'HostProductTemplate.iss'), 'utf8');
  assert.match(template, /AppId=\{\{\{#MyAppId\}\}/,
    'AppId must render {GUID} — {{ is the literal brace, {#MyAppId} the preprocessor value');
});

test('a factory performance stages beside the exe and into the bundle resources', () => {
  const { project } = normalizeProject(goodProject);
  const { ops } = stagePlan({
    project, artifacts: foundArtifacts, stageDir: '/s', performanceFile: '/author/session-performance.json',
  });
  const targets = ops.map((op) => op.to);
  assert.ok(targets.includes(path.join('/s', 'Standalone', 'factory-performance.json')));
  assert.ok(targets.includes(path.join('/s', 'VST3', 'CE Instrument Host.vst3',
    'Contents', 'Resources', 'factory-performance.json')));
});

test('no factory performance stages none — the product starts empty, not broken', () => {
  const { project } = normalizeProject(goodProject);
  const { ops, missing } = stagePlan({ project, artifacts: foundArtifacts, stageDir: '/s' });
  assert.deepEqual(missing, []);
  assert.ok(ops.every((op) => !op.to.includes('factory-performance')));
});
