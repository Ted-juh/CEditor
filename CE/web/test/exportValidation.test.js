import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
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
    const templateLinuxBin = path.join(templatesDir, 'Player.vst3', 'Contents', 'x86_64-linux');
    mkdirSync(templateLinuxBin, { recursive: true });
    writeFileSync(path.join(templateLinuxBin, 'Player.so'), 'test shared object placeholder');
    writeFileSync(path.join(template, 'moduleinfo.json'), '{"stale":true}');
    mkdirSync(outDir);
    const previous = path.join(outDir, 'keep.txt');
    writeFileSync(previous, 'previous export');
    const options = { panelFile, templatesDir, outDir, formats: [TEMPLATE_FORMATS[0]], log: () => {} };
    writeFileSync(panelFile, JSON.stringify(scripted('cpp')));
    await assert.rejects(exportFromTemplate(options), /cpp runtime support/);
    assert.equal(readFileSync(previous, 'utf8'), 'previous export');
    assert.equal(existsSync(path.join(outDir, 'Validation.vst3')), false);

    // Every format asked for by name, with no CLAP template and no LV2 helper in this fixture:
    // refused before anything is written, naming the missing piece.
    writeFileSync(panelFile, JSON.stringify(scripted('javascript')));
    const noHelper = process.env.CEDITOR_LV2_HELPER;
    process.env.CEDITOR_LV2_HELPER = path.join(root, 'no-such-helper');
    try {
      await assert.rejects(exportFromTemplate({ ...options, formats: TEMPLATE_FORMATS }), /LV2 cannot be exported: juce_lv2_helper was not found|Missing player templates for clap/);
    } finally {
      if (noHelper === undefined) delete process.env.CEDITOR_LV2_HELPER; else process.env.CEDITOR_LV2_HELPER = noHelper;
    }
    assert.equal(existsSync(path.join(outDir, 'Validation.vst3')), false);

    const result = await exportFromTemplate(options);
    assert.equal(result.written.length, 1);
    // Named after the panel, not after the file it was saved in. Checked on every platform: the
    // Windows-only binary check below was the only thing that noticed when this broke.
    assert.equal(path.basename(result.written[0]), 'Validation.vst3');
    assert.equal(JSON.parse(readFileSync(path.join(result.written[0], 'Contents/CE/profiles/test/generic-cc-dpd.ceditor-device.json'), 'utf8')).id, 'generic-cc-dpd');
    const resources = path.join(result.written[0], 'Contents', 'Resources');
    // The module inside is renamed to match the bundle, on every architecture the bundle carries:
    // a VST3 host looks for Contents/<arch>/<bundle name>.vst3 (Windows) or .so (Linux).
    assert.equal(readFileSync(path.join(result.written[0], 'Contents/x86_64-win/Validation.vst3'), 'utf8'), 'test DLL placeholder');
    assert.equal(existsSync(path.join(result.written[0], 'Contents/x86_64-win/Player.vst3')), false);
    assert.equal(readFileSync(path.join(result.written[0], 'Contents/x86_64-linux/Validation.so'), 'utf8'), 'test shared object placeholder');
    assert.equal(existsSync(path.join(result.written[0], 'Contents/x86_64-linux/Player.so')), false);
    assert.equal(JSON.parse(readFileSync(path.join(resources, 'panel.cepanel'), 'utf8')).panelGuid, 'validation-guid');
    assert.equal(existsSync(path.join(resources, 'moduleinfo.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an LV2 is exported as its own bundle, binary renamed, panel beside it, manifests written by the helper', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ceditor-export-lv2-'));
  const helperWas = process.env.CEDITOR_LV2_HELPER;
  try {
    const templatesDir = path.join(root, 'templates');
    const template = path.join(templatesDir, 'Player.lv2');
    mkdirSync(template, { recursive: true });
    writeFileSync(path.join(template, 'libPlayer.so'), 'test shared object placeholder');
    writeFileSync(path.join(template, 'manifest.ttl'), '<urn:ceditor:default> a lv2:Plugin .');
    writeFileSync(path.join(template, 'dsp.ttl'), 'template dsp');

    // A stand-in for juce_lv2_helper: it writes the three files beside the binary it is given, and
    // records what it was given, so the test can see the renamed binary and the panel beside it.
    const helper = path.join(root, process.platform === 'win32' ? 'helper.cmd' : 'helper.sh');
    const record = path.join(root, 'helper-args.txt');
    if (process.platform === 'win32') {
      writeFileSync(helper, `@echo off\r\necho %1> "${record}"\r\nfor %%f in (manifest dsp ui) do echo written > "%~dp1%%f.ttl"\r\n`);
    } else {
      writeFileSync(helper, `#!/bin/sh\nprintf '%s' "$1" > "${record}"\nd=$(dirname "$1"); for f in manifest dsp ui; do echo written > "$d/$f.ttl"; done\n`, { mode: 0o755 });
    }
    process.env.CEDITOR_LV2_HELPER = helper;

    const panelFile = path.join(root, 'panel.cepanel');
    writeFileSync(panelFile, JSON.stringify(scripted('lua', { exportSettings: { exportClap: false, exportLv2: true } })));
    const outDir = path.join(root, 'output');
    const lines = [];
    const result = await exportFromTemplate({ panelFile, templatesDir, outDir, formats: [TEMPLATE_FORMATS.find((f) => f.id === 'lv2')], log: (line) => lines.push(line) });

    const bundle = path.join(outDir, 'Validation.lv2');
    assert.deepEqual(result.written, [bundle]);
    const helperBinary = readFileSync(record, 'utf8').trim().replace(/^"|"$/g, '');
    assert.equal(path.basename(helperBinary), 'libValidation.so', 'the helper ran over the renamed binary');
    assert.equal(path.basename(path.dirname(helperBinary)), 'Validation.lv2');
    assert.ok(path.relative(outDir, helperBinary).startsWith('.ceditor-export-'), 'validation completed in staging before replacement');
    assert.deepEqual(readdirSync(bundle).filter((f) => !f.startsWith('CE')).sort(), ['dsp.ttl', 'libValidation.so', 'manifest.ttl', 'panel.cepanel', 'ui.ttl']);
    assert.equal(readFileSync(path.join(bundle, 'manifest.ttl'), 'utf8').trim(), 'written', 'the template\'s own manifest did not survive');
    assert.equal(JSON.parse(readFileSync(path.join(bundle, 'panel.cepanel'), 'utf8')).panelGuid, 'validation-guid');
    assert.ok(existsSync(path.join(bundle, 'CE/profiles/test')), 'device profiles beside the binary');
    assert.ok(lines.some((line) => /lv2: dsp.ttl, manifest.ttl, ui.ttl written from the placed panel/.test(line)), lines.join('\n'));
  } finally {
    if (helperWas === undefined) delete process.env.CEDITOR_LV2_HELPER; else process.env.CEDITOR_LV2_HELPER = helperWas;
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

test('a CLAP is exported into a folder of its own, with its panel and device profiles beside it', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ceditor-export-clap-'));
  try {
    const templatesDir = path.join(root, 'templates');
    mkdirSync(path.join(templatesDir, 'Player.vst3', 'Contents', 'Resources'), { recursive: true });
    writeFileSync(path.join(templatesDir, 'Player.vst3', 'Contents', 'Resources', 'moduleinfo.json'), '{}');
    writeFileSync(path.join(templatesDir, 'Player.clap'), 'CLAP placeholder');
    const outDir = path.join(root, 'output');
    const panelFile = path.join(root, 'panel.cepanel');
    writeFileSync(panelFile, JSON.stringify(scripted('lua', { exportSettings: { exportClap: true, exportLv2: false } })));
    const lines = [];

    const result = await exportFromTemplate({ panelFile, templatesDir, outDir, log: (line) => lines.push(line) });
    const folder = path.join(outDir, 'Validation');
    assert.ok(result.written.includes(folder), 'the folder is what was written');
    assert.equal(readFileSync(path.join(folder, 'Validation.clap'), 'utf8'), 'CLAP placeholder', 'the template, renamed');
    assert.equal(JSON.parse(readFileSync(path.join(folder, 'panel.cepanel'), 'utf8')).panelGuid, 'validation-guid',
      'the one panel the plug-in reads its identity from, beside it');
    assert.ok(existsSync(path.join(folder, 'CE/profiles/test/generic-cc-dpd.ceditor-device.json')),
      'the device profiles where the plug-in looks for them');
    assert.ok(result.written.some((p) => p.endsWith('Validation.vst3')), 'and the VST3 as before');
    assert.ok(lines.some((line) => /install the whole "Validation" folder/.test(line)), 'the log says to keep the folder together');

    // Exporting again replaces the folder rather than leaving a second panel in it.
    writeFileSync(path.join(folder, 'stale.cepanel'), '{}');
    await exportFromTemplate({ panelFile, templatesDir, outDir, log: () => {} });
    assert.deepEqual(readdirSync(folder).filter((f) => f.endsWith('.cepanel')), ['panel.cepanel']);

    // A CLAP asked for by name, with no CLAP template installed, is refused rather than skipped.
    rmSync(path.join(templatesDir, 'Player.clap'));
    await assert.rejects(exportFromTemplate({ panelFile, templatesDir, outDir, formats: [TEMPLATE_FORMATS[1]], log: () => {} }),
      /Missing player templates for clap/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    // This install has no CLAP template and no LV2 template: both are skipped and said, VST3 exports.
    const log = run().toString();
    assert.match(log, /CLAP and LV2 skipped: no player template for it is installed|LV2 skipped: juce_lv2_helper was not found/);
    assert.equal(readFileSync(panelFile, 'utf8'), legacyPanel);
    assert.deepEqual(JSON.parse(readFileSync(exportedPanel)).exportSettings, {
      exportClap: true, exportLv2: true,
    });
    assert.equal(existsSync(path.join(root, 'exports/Validation.clap')), false);
    assert.equal(existsSync(path.join(root, 'exports/Validation')), false);
    assert.equal(existsSync(path.join(root, 'exports/Validation.lv2')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
