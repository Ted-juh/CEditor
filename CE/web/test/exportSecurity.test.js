import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { exportFileName, assertExportChild, runCmake, validateBuildIdentity } from '../../../tools/scripts/lib/exportSecurity.mjs';
import { exportFromTemplate, TEMPLATE_FORMATS } from '../../../tools/scripts/export-panel-template.mjs';

test('reserved and ambiguous names cannot select an export directory', () => {
  for (const name of ['', '.', '..', ' .. ', 'Synth.', 'CON', 'nul.txt', 'LPT1', 'C:/x', '../x', 'x\\y'])
    assert.throws(() => exportFileName(name), undefined, name);
  assert.equal(exportFileName('Bass & Drums'), 'Bass & Drums');
});

test('template export refuses dot paths before deletion and still exports ordinary CLAP panels', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ceditor-security-'));
  const templates = path.join(base, 'templates');
  const out = path.join(base, 'exports');
  const sentinel = path.join(base, 'keep.txt');
  fs.mkdirSync(templates); fs.mkdirSync(out);
  fs.writeFileSync(sentinel, 'keep');
  fs.writeFileSync(path.join(templates, 'Template.clap'), 'inert test template');
  const file = path.join(base, 'panel.cepanel');
  const args = { panelFile: file, guid: 'security-guid', templatesDir: templates, outDir: out,
    formats: [TEMPLATE_FORMATS.find(f => f.id === 'clap')], log() {} };
  for (const name of ['.', '..', 'Good Panel']) {
    fs.writeFileSync(file, JSON.stringify({ documentForm: 'complete', name, controls: [], scripts: [],
      exportSettings: { pluginName: name } }));
    if (name === 'Good Panel') {
      await exportFromTemplate(args);
      assert.ok(fs.existsSync(path.join(out, name, `${name}.clap`)));
    } else await assert.rejects(exportFromTemplate(args), /Invalid plugin name/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
  }
  assert.throws(() => assertExportChild(out, out));
  assert.throws(() => assertExportChild(out, base));
  const link = path.join(out, 'link');
  fs.symlinkSync(templates, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertExportChild(out, path.join(link, 'Template.clap')), /link|junction/);
  const existing = path.join(out, 'Good Panel.vst3');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'keep.txt'), 'previous export');
  fs.mkdirSync(path.join(templates, 'Broken.vst3'));
  await assert.rejects(exportFromTemplate({ ...args,
    formats: [TEMPLATE_FORMATS.find(f => f.id === 'vst3')] }));
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'previous export');
  const clapMarker = path.join(out, 'Good Panel', 'old.txt');
  fs.writeFileSync(clapMarker, 'obsolete');
  await exportFromTemplate(args);
  assert.equal(fs.existsSync(clapMarker), false);
  assert.equal(fs.readdirSync(out).some(name => name.startsWith('.ceditor-export-')), false);
  // All cleanup targets are checked against this test's known temporary root.
  assertExportChild(os.tmpdir(), base);
  fs.rmSync(base, { recursive: true, force: true });
});

test('CMake receives literal argument values with no shell, and generated-code hazards are rejected', () => {
  const original = childProcess.execFileSync;
  let seen;
  childProcess.execFileSync = (...args) => { seen = args; return ''; };
  syncBuiltinESMExports();
  try {
    const args = ['-S', 'C:/path with spaces', '-DNAME=A & echo marker', '-DNAME2=%TEMP% "quoted"'];
    runCmake(args);
    assert.equal(seen[0], 'cmake'); assert.deepEqual(seen[1], args); assert.equal(seen[2].shell, false);
  } finally { childProcess.execFileSync = original; syncBuiltinESMExports(); }
  const good = { productName: 'Bass & Drums', vendor: 'Tedjuh', version: '1.0.0', manufacturerCode: 'Tdjh' };
  validateBuildIdentity(good);
  for (const vendor of ['x" & echo marker', 'x${value}', 'x;set(X ON)', 'x\nnewline'])
    assert.throws(() => validateBuildIdentity({ ...good, vendor }));
});
