// export-panel-template.mjs — compiler-free panel export.
//
//   node tools/scripts/export-panel-template.mjs <panel.cepanel> <guid> [--templates <dir>] [--out <dir>]
//
// WHAT THIS IS INSTEAD OF. `export-panel-vst3.mjs` relinks the player for every panel, because the
// VST3 FUID is derived from PLUGIN_CODE + MANUFACTURER_CODE and those are #defines. That is the
// only reason a full export needed a C++ toolchain on the user's machine, and it is why "export
// runs from a source checkout" was a product limitation rather than a preference.
//
// A template player (cmake -DCEDITOR_TEMPLATE_PLAYER=ON) takes its identity AND its panel from the
// single .cepanel sitting beside it, so exporting is a copy: take a prebuilt binary, put the panel
// inside it, done. No compiler, no CMake, no source tree. Only VST3 currently adopts this identity;
// its ids match the relinking path -- see CE/src/Export/PanelIdentitySidecar.h, and
// CE/tests/PanelIdentitySidecarTests.cpp which asserts it against JUCE's own convertJucePluginId.
//
// The compiling exporter is untouched and stays the default. This is the path for a machine that
// has no build environment, which after this is most of them.

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateTemplateScripting } from './exportValidation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

function identityHelper(name) {
  const installed = path.join(HERE, 'shared', name);
  return existsSync(installed) ? installed : path.join(REPO, 'CE/web/src/CE_Application/utils', name);
}

/** The formats a template can produce, and where the panel goes inside each. */
export const TEMPLATE_FORMATS = [
  {
    id: 'vst3',
    // A Windows/Linux VST3 is a bundle directory. Contents/Resources is the SDK's own place for
    // things that are not the binary, and CE/src/Export/PanelIdentitySidecar.h searches it.
    ext: '.vst3',
    bundle: true,
    panelDir: (root) => path.join(root, 'Contents', 'Resources'),
  },
  {
    id: 'clap',
    // A Windows/Linux CLAP is one file, and the CLAP folder is shared by every CLAP installed, so a
    // panel loose beside it would be ambiguous. Each export gets a folder of its own —
    // <Name>/<Name>.clap beside panel.cepanel and the device profiles — which hosts find because
    // the CLAP spec has them search CLAP folders recursively. CE/src/Export/ClapSidecarIdentity.h
    // is the other end.
    ext: '.clap',
    bundle: false,
    folder: true,
    panelDir: (root) => path.dirname(root),
  },
  {
    id: 'lv2',
    // An .lv2 is a folder of its own with the binary at its top, so the panel sits beside the
    // binary. The bundle's Turtle files are not copied from the template: they are written again
    // per export by juce_lv2_helper, which loads the copied binary with the panel beside it and
    // calls the plug-in's own writers, so they carry the panel's URI and parameters
    // (CE/src/Export/Lv2SidecarIdentity.h, JUCE/VENDORED.md patch 4).
    ext: '.lv2',
    bundle: true,
    panelDir: (root) => root,
  },
];

/**
 * Read the identity the template will derive at load, using the SAME derivation the C++ does.
 *
 * Imported from the shared JS module rather than reimplemented, because the entire correctness
 * argument is that all three sides -- this script, the C++ in the plugin, and the compiling
 * exporter -- agree on the derivation. A fourth copy would be a fourth thing to drift.
 */
async function identityFor(panelDoc, guid, panelFile) {
  const [{ deriveIdentity }, { identityInputsFromPanel }] = await Promise.all([
    import(pathToFileURL(identityHelper('exportIdentity.js')).href),
    import(pathToFileURL(identityHelper('panelIdentityInputs.js')).href),
  ]);

  const inputs = identityInputsFromPanel(panelDoc, path.basename(panelFile));
  // The GUID argument wins: the caller knows which panel it asked to export, and a document that
  // has lost its panelGuid should still export as the thing the caller named.
  const identity = deriveIdentity(guid || inputs.guid, inputs.productName, inputs.vendor,
                                  inputs.manufacturerCode, inputs.version);
  return { identity, productName: inputs.productName };
}

/**
 * Drop the stale VST3 manifest, or regenerate it.
 *
 * THE TRAP, and it is the one that would have made this whole approach quietly wrong. JUCE runs
 * juce_vst3_helper after linking to write Contents/Resources/moduleinfo.json, and that file lists
 * the plugin's classes INCLUDING THEIR CIDs. The template was built with no panel beside it, so its
 * manifest records the fallback identity -- and a host that trusts the manifest would then see
 * every exported panel claiming the template's single FUID. That is precisely the Ctrlr collision
 * the compile-per-panel design existed to prevent, reintroduced through a cache file.
 *
 * Regenerating is the better fix and is still compiler-free: the helper is a prebuilt executable
 * that loads the module and asks its factory, and by this point the panel is already in place, so
 * the factory answers with the panel's identity. Where the helper is unavailable the manifest is
 * deleted instead -- it is a discovery optimisation a host can live without, and an absent manifest
 * is merely slower to scan whereas a wrong one loads the wrong plugin.
 */
function fixVst3Manifest(bundleRoot, helperExe, log) {
  const manifest = path.join(bundleRoot, 'Contents', 'Resources', 'moduleinfo.json');

  if (helperExe && existsSync(helperExe)) {
    try {
      execFileSync(helperExe, ['-create', '-version', '1.0.0', '-path', bundleRoot, '-output', manifest],
        { stdio: 'pipe' });
      log(`  moduleinfo.json regenerated from the placed panel`);
      return;
    } catch (error) {
      log(`  moduleinfo.json could not be regenerated (${String(error.message).split('\n')[0]}) — removing it instead`);
    }
  }

  if (existsSync(manifest)) {
    rmSync(manifest);
    log('  moduleinfo.json removed (it recorded the template\'s identity, not this panel\'s)');
  }
}

/** Locate a prebuilt template for one format inside a templates directory. */
export function findTemplate(templatesDir, format) {
  if (!existsSync(templatesDir)) return null;
  const match = readdirSync(templatesDir).find((entry) => entry.toLowerCase().endsWith(format.ext));
  return match ? path.join(templatesDir, match) : null;
}

/**
 * The LV2 helper: JUCE's own, which loads a plug-in binary and has it write its Turtle files. An
 * installation ships the vendored Windows build in tools/bin; a source checkout has it in JUCE/bin
 * on Windows and builds a native one on Linux (any build tree). CEDITOR_LV2_HELPER names one by hand.
 */
export function findLv2Helper() {
  if (process.env.CEDITOR_LV2_HELPER && existsSync(process.env.CEDITOR_LV2_HELPER)) return process.env.CEDITOR_LV2_HELPER;
  // The vendored helper is a Windows build; off Windows only a native one can load a native binary.
  const name = process.platform === 'win32' ? 'juce_lv2_helper.exe' : 'juce_lv2_helper';
  const candidates = [path.join(REPO, 'tools/bin', name), path.join(REPO, 'JUCE/bin/JUCE-8.0.7', name)];
  const buildRoot = path.join(REPO, 'build');
  if (process.platform !== 'win32' && existsSync(buildRoot)) {
    for (const dir of readdirSync(buildRoot)) candidates.push(path.join(buildRoot, dir, 'juce_lv2_helper'));
  }
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Write an LV2 bundle's manifest.ttl, dsp.ttl and ui.ttl by running the helper over its binary.
 * The panel is already beside the binary, so the plug-in reports the panel's URI and parameters.
 * The helper initialises JUCE's GUI, so off Windows it needs a display (DISPLAY, or Xvfb).
 */
function writeLv2Manifests(bundle, lv2Helper, log) {
  const binary = readdirSync(bundle).find((name) => /\.(so|dll)$/i.test(name));
  try {
    execFileSync(lv2Helper, [path.join(bundle, binary)], { stdio: 'pipe', env: process.env });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim().split('\n').filter(Boolean).pop() ?? '';
    for (const stale of readdirSync(bundle).filter((f) => f.toLowerCase().endsWith('.ttl'))) rmSync(path.join(bundle, stale));
    throw new Error(`LV2 manifests could not be written for ${path.basename(bundle)}: ${detail || 'juce_lv2_helper failed'}`);
  }
  const written = readdirSync(bundle).filter((f) => f.toLowerCase().endsWith('.ttl')).sort();
  if (!written.includes('manifest.ttl') || !written.includes('dsp.ttl')) {
    throw new Error(`juce_lv2_helper wrote ${written.join(', ') || 'nothing'} for ${path.basename(bundle)}; manifest.ttl and dsp.ttl are needed.`);
  }
  log(`  lv2: ${written.join(', ')} written from the placed panel`);
}

export async function exportFromTemplate({ panelFile, guid, templatesDir, outDir, formats, log = console.log }) {
  let panelDoc = JSON.parse(readFileSync(panelFile, 'utf8'));
  // A saved .cepanel passed by hand from a source checkout is completed as the app would complete it
  // (lib/exportDocument.mjs). An installation has no editor source to do that with, and needs none:
  // the app always hands this script the complete document it prepared.
  if (existsSync(path.join(REPO, 'CE/web/src/CE_Application/stores/documentShape.js'))) {
    const { completeExportDocument } = await import(pathToFileURL(path.join(HERE, 'lib/exportDocument.mjs')).href);
    panelDoc = await completeExportDocument(panelDoc, path.resolve(panelFile));
  }
  // What the bytes are, before anything is written: the one number an export used to give was the
  // bundle's, and on GAIA it was taken to be artwork when there was none (lib/exportSizeReport.mjs).
  {
    const { exportSizeReport, formatExportSizeReport } = await import(pathToFileURL(path.join(HERE, 'lib/exportSizeReport.mjs')).href);
    for (const line of formatExportSizeReport(exportSizeReport(panelDoc))) log(line);
  }
  const explicitFormats = formats !== undefined;
  // VST3 always; CLAP unless turned off (it was a factory default); LV2 only when turned on, as the
  // compiling exporter reads it.
  formats ??= TEMPLATE_FORMATS.filter((format) =>
    format.id === 'vst3' || (format.id === 'clap'
      ? panelDoc.exportSettings?.exportClap !== false
      : panelDoc.exportSettings?.exportLv2 === true));
  validateTemplateScripting(panelDoc);
  if (panelDoc.controls?.length && !Array.isArray(panelDoc.exportParameters)) {
    throw new Error('This panel has not been prepared for plugin export. Open it in CEditor and use Build → Export Plugin to prepare its automation parameters and embedded assets.');
  }
  const scripts = [...(panelDoc.scripts ?? []), ...(panelDoc.controls ?? []).flatMap((control) => control?._children?.Scripts?.scripts ?? [])];
  if (scripts.some((script) => script.enabled !== false && script.language === 'typescript' && script.source?.trim() && !script.compiledJs?.trim())) {
    throw new Error('TypeScript needs compiled JavaScript before template export. Open this panel in CEditor and use Build → Export Plugin.');
  }
  const { identity, productName } = await identityFor(panelDoc, guid, panelFile);

  // The plugin file name is the product name, sanitized the way a file name has to be. The IDENTITY
  // does not come from it -- that is derived from the GUID inside the document -- so renaming an
  // exported plugin cannot change what a host thinks it is.
  const safeName = productName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'CEditor Panel';

  log(`Template export: ${safeName}`);
  log(`  identity: pluginCode=${identity.pluginCode} auSubtype=${identity.auSubtype}`);
  log(`  clapId:   ${identity.clapId}`);

  // Refuse an incomplete format set before replacing any previous export. A format the panel's
  // settings ask for, with no template installed for it (an install from before CLAP templates
  // shipped), is skipped and said; one the caller asked for by name is not.
  let missingFormats = formats.filter((format) => !findTemplate(templatesDir, format));
  if (missingFormats.length && !explicitFormats && missingFormats.length < formats.length) {
    log(`Warning: ${missingFormats.map((format) => format.id.toUpperCase()).join(' and ')} skipped: no player template for it is installed in ${templatesDir}.`);
    formats = formats.filter((format) => !missingFormats.includes(format));
    missingFormats = [];
  }
  if (missingFormats.length) {
    throw new Error(`Missing player templates for ${missingFormats.map((format) => format.id).join(', ')} in ${templatesDir}. Install those templates or disable those export formats.`);
  }
  // An LV2 bundle's Turtle files are written by juce_lv2_helper over the copied binary. Without the
  // helper the bundle would be a binary with no manifest, which a host does not see, so the format
  // is refused by name and skipped when it was only implied.
  const lv2Helper = findLv2Helper();
  if (!lv2Helper && formats.some((format) => format.id === 'lv2')) {
    const message = 'juce_lv2_helper was not found (it writes the bundle\'s manifest, dsp and ui Turtle files)';
    if (explicitFormats) throw new Error(`LV2 cannot be exported: ${message}.`);
    log(`Warning: LV2 skipped: ${message}.`);
    formats = formats.filter((format) => format.id !== 'lv2');
  }
  mkdirSync(outDir, { recursive: true });
  const helperExe = ['juce_vst3_helper.exe', 'juce_vst3_helper']
    .flatMap((n) => [path.join(REPO, 'tools/bin', n), path.join(REPO, 'JUCE/bin/JUCE-8.0.7', n)])
    .find((p) => existsSync(p));

  const written = [];
  for (const format of formats) {
    const template = findTemplate(templatesDir, format);
    if (!template) {
      log(`  ${format.id}: no template in ${templatesDir} — skipped`);
      continue;
    }

    // What the export is: the bundle itself, or for CLAP the folder that holds the plugin.
    const root = format.folder ? path.join(outDir, safeName) : path.join(outDir, safeName + format.ext);
    const dest = format.folder ? path.join(root, safeName + format.ext) : root;
    rmSync(root, { recursive: true, force: true });
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(template, dest, { recursive: format.bundle });

    // A VST3 loader derives the module's name from its enclosing bundle's: Contents/<arch>-win/<Name>.vst3
    // on Windows, Contents/<arch>-linux/<Name>.so on Linux. Renaming only the outer directory makes an
    // otherwise valid template unloadable. Keyed on the architecture folders, not on the platform this
    // runs on, so a Linux template exported anywhere loads too.
    if (format.id === 'vst3') {
      const contents = path.join(dest, 'Contents');
      const moduleExt = { '-win': '.vst3', '-linux': '.so' };
      for (const architecture of readdirSync(contents)) {
        const suffix = Object.keys(moduleExt).find((s) => architecture.endsWith(s));
        if (!suffix) continue;
        const binDir = path.join(contents, architecture);
        const binaries = readdirSync(binDir).filter((name) => name.toLowerCase().endsWith(moduleExt[suffix]));
        if (binaries.length !== 1) throw new Error(`Expected one VST3 binary in ${binDir}. Reinstall the player template.`);
        const target = path.join(binDir, safeName + moduleExt[suffix]);
        if (path.join(binDir, binaries[0]) !== target) renameSync(path.join(binDir, binaries[0]), target);
      }
    }

    // An LV2's binary is named for the bundle too (libName.so, Name.dll); the manifests the helper
    // writes name it, so it is renamed before they are. The template's own manifests go: they
    // describe the template, and a stale one beside a fresh one is two plug-ins in one bundle.
    if (format.id === 'lv2') {
      for (const stale of readdirSync(dest).filter((f) => f.toLowerCase().endsWith('.ttl'))) rmSync(path.join(dest, stale));
      const binaries = readdirSync(dest).filter((name) => /\.(so|dll)$/i.test(name));
      if (binaries.length !== 1) throw new Error(`Expected one LV2 binary in ${dest}. Reinstall the player template.`);
      const extension = path.extname(binaries[0]).toLowerCase();
      const target = path.join(dest, extension === '.so' ? `lib${safeName}.so` : `${safeName}${extension}`);
      if (path.join(dest, binaries[0]) !== target) renameSync(path.join(dest, binaries[0]), target);
    }

    const panelDir = format.panelDir(dest);
    mkdirSync(panelDir, { recursive: true });

    // Exactly one .cepanel where the plugin looks, always. A template shipped with a sample panel
    // inside it, or an earlier export copied over, would leave two — and the loader refuses two
    // rather than guessing, so the plugin would silently fall back to its built-in identity.
    for (const stale of readdirSync(panelDir).filter((f) => f.toLowerCase().endsWith('.cepanel'))) {
      rmSync(path.join(panelDir, stale));
    }
    // Compact: the plug-in parses it in full at load and nobody reads it. GAIA's indented panel was
    // 94 MB where the compact one is 28 MB, and the load parses it three times.
    writeFileSync(path.join(panelDir, 'panel.cepanel'), JSON.stringify(panelDoc));

    // The native MIDI service needs its codecs on a machine without CEditor's checkout. It looks
    // in the module's directory and the one above (DeviceProfileServiceInternal.h, sourceRoot):
    // Contents for a VST3, whose module sits in Contents/<arch>; the export's folder for a CLAP.
    const profiles = path.join(REPO, 'CE/profiles/test');
    if (existsSync(profiles)) {
      if (format.id === 'vst3') cpSync(profiles, path.join(dest, 'Contents/CE/profiles/test'), { recursive: true });
      if (format.id === 'clap' || format.id === 'lv2') cpSync(profiles, path.join(root, 'CE/profiles/test'), { recursive: true });
    }

    if (format.id === 'vst3') fixVst3Manifest(dest, helperExe, log);
    if (format.id === 'lv2') writeLv2Manifests(dest, lv2Helper, log);

    const size = format.bundle || format.folder ? dirSize(root) : statSync(root).size;
    log(`  ${format.id}: ${path.relative(REPO, root)} (${(size / 1048576).toFixed(1)} MB)`);
    if (format.folder) log(`  ${format.id}: install the whole "${safeName}" folder into your CLAP folder; the plugin needs the panel beside it.`);
    if (format.id === 'lv2') log(`  ${format.id}: install the whole "${safeName}.lv2" folder into your LV2 path; the plugin needs the panel beside it.`);
    written.push(root);
  }

  if (written.length === 0) {
    throw new Error(`No templates found in ${templatesDir}. Build one with:\n`
      + '  cmake -B build/template -DCEDITOR_BUILD_APP=ON -DCEDITOR_TEMPLATE_PLAYER=ON -DCE_VST_GENERIC_PLAYER=ON');
  }
  return { written, identity, productName: safeName };
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const [panelFile, guid] = positional;

  if (!panelFile || !guid) {
    console.log('Usage: node tools/scripts/export-panel-template.mjs <panel.cepanel> <guid> [--templates <dir>] [--out <dir>]');
    process.exitCode = 1;
    return;
  }

  await exportFromTemplate({
    panelFile: path.resolve(panelFile),
    guid,
    templatesDir: path.resolve(flag('templates', path.join(REPO, 'templates'))),
    outDir: path.resolve(flag('out', path.join(REPO, 'export-out'))),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
