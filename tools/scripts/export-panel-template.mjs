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
// inside it, done. No compiler, no CMake, no source tree. The ids it reports are byte-identical to
// the ones the relinking path produced -- see CE/src/Export/PanelIdentitySidecar.h, and
// CE/tests/PanelIdentitySidecarTests.cpp which asserts it against JUCE's own convertJucePluginId.
//
// The compiling exporter is untouched and stays the default. This is the path for a machine that
// has no build environment, which after this is most of them.

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

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
    // A .clap is a single file, so the panel sits beside it rather than inside it. CLAP has no
    // fixed-id contract at all -- its id is a freeform string -- so this format never needed the
    // compiler in the first place.
    ext: '.clap',
    bundle: false,
    panelDir: (root) => path.dirname(root),
  },
  {
    id: 'lv2',
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
    import(pathToFileURL(path.join(REPO, 'CE/web/src/CE_Application/utils/exportIdentity.js')).href),
    import(pathToFileURL(path.join(REPO, 'CE/web/src/CE_Application/utils/panelIdentityInputs.js')).href),
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

export async function exportFromTemplate({ panelFile, guid, templatesDir, outDir, formats, log = console.log }) {
  const panelDoc = JSON.parse(readFileSync(panelFile, 'utf8'));
  const { identity, productName } = await identityFor(panelDoc, guid, panelFile);

  // The plugin file name is the product name, sanitized the way a file name has to be. The IDENTITY
  // does not come from it -- that is derived from the GUID inside the document -- so renaming an
  // exported plugin cannot change what a host thinks it is.
  const safeName = productName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'CEditor Panel';

  log(`Template export: ${safeName}`);
  log(`  identity: pluginCode=${identity.pluginCode} auSubtype=${identity.auSubtype}`);
  log(`  clapId:   ${identity.clapId}`);

  mkdirSync(outDir, { recursive: true });
  const helperExe = ['juce_vst3_helper.exe', 'juce_vst3_helper']
    .map((n) => path.join(REPO, 'JUCE/bin/JUCE-8.0.7', n))
    .find((p) => existsSync(p));

  const written = [];
  for (const format of formats) {
    const template = findTemplate(templatesDir, format);
    if (!template) {
      log(`  ${format.id}: no template in ${templatesDir} — skipped`);
      continue;
    }

    const dest = path.join(outDir, safeName + format.ext);
    rmSync(dest, { recursive: true, force: true });
    cpSync(template, dest, { recursive: format.bundle });

    const panelDir = format.panelDir(dest);
    mkdirSync(panelDir, { recursive: true });

    // Exactly one .cepanel where the plugin looks, always. A template shipped with a sample panel
    // inside it, or an earlier export copied over, would leave two — and the loader refuses two
    // rather than guessing, so the plugin would silently fall back to its built-in identity.
    for (const stale of readdirSync(panelDir).filter((f) => f.toLowerCase().endsWith('.cepanel'))) {
      rmSync(path.join(panelDir, stale));
    }
    writeFileSync(path.join(panelDir, 'panel.cepanel'), JSON.stringify(panelDoc, null, 2));

    if (format.id === 'vst3') fixVst3Manifest(dest, helperExe, log);

    const size = format.bundle ? dirSize(dest) : statSync(dest).size;
    log(`  ${format.id}: ${path.relative(REPO, dest)} (${(size / 1048576).toFixed(1)} MB)`);
    written.push(dest);
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
    formats: TEMPLATE_FORMATS,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
