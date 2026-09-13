import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertNativeHandlersBuilt, validateTemplateScripting, validateRuntimeFormats } from '../../../tools/scripts/exportValidation.mjs';
import { exportFromTemplate, TEMPLATE_FORMATS } from '../../../tools/scripts/export-panel-template.mjs';

const scripted = (language, extra = {}) => ({
  name: 'Validation', panelGuid: 'validation-guid', controls: [],
  scripts: [{ id: 'script', language, source: 'return 1;' }], ...extra,
});

test('an export fails when one required language fails, even when another built', () => {
  assert.throws(() => assertNativeHandlersBuilt({
    built: [{ lang: 'cpp', bytes: 123 }],
    failed: [{ lang: 'csharp', error: 'Compiler error CS1002' }],
  }), /csharp: Compiler error CS1002/);
  assert.doesNotThrow(() => assertNativeHandlersBuilt({ built: [], skipped: [], note: 'no handlers' }));
  assert.doesNotThrow(() => assertNativeHandlersBuilt({ built: [{ lang: 'cpp' }], failed: [] }));
});

test('compiler-free exports refuse unavailable runtimes and honor explicit off settings', () => {
  for (const language of ['cpp', 'csharp', 'java', 'python', 'py']) {
    assert.throws(() => validateTemplateScripting(scripted(language)), /compiler-free exporter cannot bundle/);
    assert.doesNotThrow(() => validateTemplateScripting(scripted(language, {
      exportSettings: { compileNativeHandlers: 'off', embedPython: 'off' },
    })));
  }
  for (const language of ['lua', 'javascript', 'typescript']) {
    assert.doesNotThrow(() => validateTemplateScripting(scripted(language)));
  }
  assert.doesNotThrow(() => validateTemplateScripting(scripted('cpp', {
    scripts: [{ language: 'cpp', source: 'return 1;', enabled: false }],
  })));
  assert.throws(() => validateTemplateScripting(scripted('lua', {
    exportSettings: { embedPython: 'on' },
  })), /python runtime support/);
});

test('template validation protects a previous export, then a supported panel exports normally', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ceditor-export-test-'));
  try {
    const templatesDir = path.join(root, 'templates');
    const outDir = path.join(root, 'output');
    const panelFile = path.join(root, 'panel.cepanel');
    const template = path.join(templatesDir, 'Player.vst3', 'Contents', 'Resources');
    mkdirSync(template, { recursive: true });
    const templateBin = path.join(templatesDir, 'Player.vst3', 'Contents', 'x86_64-win');
    mkdirSync(templateBin, { recursive: true });
    writeFileSync(path.join(templateBin, 'Player.vst3'), 'test DLL placeholder');
    writeFileSync(path.join(template, 'moduleinfo.json'), '{"stale":true}');
    mkdirSync(outDir);
    const previous = path.join(outDir, 'keep.txt');
    writeFileSync(previous, 'previous export');
    const options = { panelFile, templatesDir, outDir, formats: [TEMPLATE_FORMATS[0]], log: () => {} };
    writeFileSync(panelFile, JSON.stringify(scripted('cpp')));
    await assert.rejects(exportFromTemplate(options), /cpp runtime support/);
    assert.equal(readFileSync(previous, 'utf8'), 'previous export');
    assert.equal(existsSync(path.join(outDir, 'Validation.vst3')), false);

    writeFileSync(panelFile, JSON.stringify(scripted('javascript')));
    await assert.rejects(exportFromTemplate({ ...options, formats: TEMPLATE_FORMATS }), /Compiler-free export currently supports VST3 only/);
    assert.equal(existsSync(path.join(outDir, 'Validation.vst3')), false);

    const result = await exportFromTemplate(options);
    assert.equal(result.written.length, 1);
    assert.equal(JSON.parse(readFileSync(path.join(result.written[0], 'Contents/CE/profiles/test/generic-cc-dpd.ceditor-device.json'), 'utf8')).id, 'generic-cc-dpd');
    const resources = path.join(result.written[0], 'Contents', 'Resources');
    if (process.platform === 'win32') {
      assert.equal(readFileSync(path.join(result.written[0], 'Contents/x86_64-win/Validation.vst3'), 'utf8'), 'test DLL placeholder');
      assert.equal(existsSync(path.join(result.written[0], 'Contents/x86_64-win/Player.vst3')), false);
    }
    assert.equal(JSON.parse(readFileSync(path.join(resources, 'panel.cepanel'), 'utf8')).panelGuid, 'validation-guid');
    assert.equal(existsSync(path.join(resources, 'moduleinfo.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('formats without runtime bundling cannot silently omit required script support', () => {
  for (const language of ['cpp', 'csharp', 'java', 'python']) {
    assert.throws(() => validateRuntimeFormats(scripted(language)), /Disable CLAP and LV2/);
    assert.doesNotThrow(() => validateRuntimeFormats(scripted(language, {
      exportSettings: { exportClap: false, exportLv2: false },
    })));
  }
  assert.doesNotThrow(() => validateRuntimeFormats(scripted('lua')));
  assert.doesNotThrow(() => validateRuntimeFormats(scripted('cpp', {
    exportSettings: { compileNativeHandlers: 'off' },
  })));
});

test('the staged Windows exporter works away from the checkout with bundled Node', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ceditor-installed-export-'));
  try {
    const repo = fileURLToPath(new URL('../../../', import.meta.url));
    const packageScript = path.join(repo, 'tools/scripts/package-installer.ps1');
    // Exercise the actual staging functions, without rebuilding the whole application.
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `
      $ErrorActionPreference = 'Stop'
      $ast = [System.Management.Automation.Language.Parser]::ParseFile($env:CEDITOR_TEST_PACKAGER, [ref]$null, [ref]$null)
      $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in @('Stage-ExportPipeline', 'Stage-NodeRuntime') }, $false) | ForEach-Object { Invoke-Expression $_.Extent.Text }
      Stage-ExportPipeline -RepoRoot $env:CEDITOR_TEST_REPO -StageDir $env:CEDITOR_TEST_STAGE
      Stage-NodeRuntime -StageDir $env:CEDITOR_TEST_STAGE
    `], { env: { ...process.env, CEDITOR_TEST_PACKAGER: packageScript, CEDITOR_TEST_REPO: repo, CEDITOR_TEST_STAGE: root }, stdio: 'pipe' });
    assert.equal(existsSync(path.join(root, 'CE')), false);
    const panelFile = path.join(root, 'input.cepanel');
    writeFileSync(panelFile, JSON.stringify(scripted('lua', {
      exportSettings: { exportClap: false, exportLv2: false },
    })));
    const template = path.join(root, 'templates/Player.vst3/Contents/Resources');
    mkdirSync(template, { recursive: true });
    writeFileSync(path.join(template, 'moduleinfo.json'), '{}');
    const run = () => execFileSync(path.join(root, 'tools/node/node.exe'), [
      path.join(root, 'tools/scripts/export-panel-template.mjs'), panelFile, 'validation-guid',
      '--out', path.join(root, 'exports'),
    ], { cwd: root, stdio: 'pipe' });
    run();
    const exportedPanel = path.join(root, 'exports/Validation.vst3/Contents/Resources/panel.cepanel');
    assert.equal(JSON.parse(readFileSync(exportedPanel)).panelGuid, 'validation-guid');
    const previous = readFileSync(exportedPanel, 'utf8');
    writeFileSync(panelFile, JSON.stringify(scripted('cpp', {
      exportSettings: { exportClap: true, exportLv2: true },
    })));
    assert.throws(run, /cpp runtime support/);
    assert.equal(readFileSync(exportedPanel, 'utf8'), previous);

    // Panels saved by the previous factory have both flags on without a user choosing them.
    const legacyPanel = JSON.stringify(scripted('lua', {
      exportSettings: { exportClap: true, exportLv2: true },
    }));
    writeFileSync(panelFile, legacyPanel);
    assert.match(run().toString(), /CLAP and LV2 skipped.*Exporting VST3/);
    assert.equal(readFileSync(panelFile, 'utf8'), legacyPanel);
    assert.deepEqual(JSON.parse(readFileSync(exportedPanel)).exportSettings, {
      exportClap: true, exportLv2: true,
    });
    assert.equal(existsSync(path.join(root, 'exports/Validation.clap')), false);
    assert.equal(existsSync(path.join(root, 'exports/Validation.lv2')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
