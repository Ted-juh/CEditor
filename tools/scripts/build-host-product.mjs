// build-host-product.mjs — assemble the generated instrument-host product (VIP-successor Stage 1).
//
//   node tools/scripts/build-host-product.mjs --project <host-project.json> [--build-dir <dir>]
//        [--config Release] [--out <dir>] [--iscc <ISCC.exe>]
//
// WHAT THIS DOES AND DOES NOT DO. The C++ targets (CEHostStandalone, CEHostVST3, the scanner
// worker) are already built by CMake; this script finds them, stages them into a product folder
// laid out the way the installer wants, and compiles tools/installer/HostProductTemplate.iss
// with the Host Project's manifest as /D switches. It does not compile C++ — per-product binary
// identity (CE_HOST_PRODUCT_NAME and friends) is CMake's job, and a rebuild with those cache
// vars is a separate, slower path than "wrap what exists in an installer".
//
// Without ISCC (any non-Windows machine, or Inno not installed) it stages everything, writes
// the exact ISCC command it would have run, and still exits 0 — the staging IS verifiable
// anywhere, and pretending the missing compiler is a failure would make every Linux run red
// for a reason nobody can fix there. The missing-installer case is called out in the summary
// so a run that skipped it cannot be read as one that produced it.
//
// Everything below `main` is a pure function over injected `exists`/`listDir`, which is what
// CE/web/test/hostProductBuild.test.js drives — the path arithmetic and the /D switch list are
// where the mistakes live, and neither needs a filesystem to prove.

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

// --- the manifest ------------------------------------------------------------------------------

/** Fills defaults and reports what makes the manifest unbuildable. Never throws: the CLI turns
    errors into a readable refusal, tests assert on them. */
export function normalizeProject(raw) {
  const project = {
    productName: String(raw?.productName ?? '').trim(),
    version: String(raw?.version ?? '').trim() || '1.0.0',
    publisher: String(raw?.publisher ?? '').trim(),
    appId: String(raw?.appId ?? '').trim(),
    includeStandalone: raw?.includeStandalone !== false,
    includeVst3: raw?.includeVst3 !== false,
  };

  const errors = [];
  if (!project.productName) errors.push('productName is empty');
  if (!/^\d+(\.\d+)*$/.test(project.version)) errors.push(`version "${project.version}" is not dotted numbers`);
  if (!/^[0-9A-Fa-f-]{36}$/.test(project.appId)) errors.push('appId is missing or not a GUID (the editor mints it — build from a saved Host Project)');
  if (!project.includeStandalone && !project.includeVst3) errors.push('no targets enabled');
  return { project, errors };
}

/** The installer's OutputBaseFilename half: the product name with everything hostile to a
    filename removed. "Super Rack!" -> "SuperRack". */
export function sanitizeBaseName(productName) {
  const cleaned = String(productName).replace(/[^0-9A-Za-z]+/g, '');
  return cleaned || 'HostProduct';
}

// --- finding what CMake built ------------------------------------------------------------------

/** Where each artifact can be, in preference order. Multi-config generators (Visual Studio)
    nest a config directory; single-config (Ninja) does not — both layouts are listed so the
    same script serves CI's tree and a local one. */
export function artifactCandidateDirs({ buildDir, config }) {
  const cfg = config || 'Release';
  return {
    standalone: [
      path.join(buildDir, 'CEHostStandalone_artefacts', cfg),
      path.join(buildDir, 'CEHostStandalone_artefacts'),
    ],
    vst3: [
      path.join(buildDir, 'CEHostVST3_artefacts', cfg, 'VST3'),
      path.join(buildDir, 'CEHostVST3_artefacts', 'VST3'),
    ],
    scanner: [
      path.join(buildDir, cfg),
      buildDir,
    ],
  };
}

/** Resolves the three artifacts through injected fs probes. `listDir` returns basenames or []
    for a missing directory. Missing artifacts come back null — the caller decides which ones
    the manifest actually needs. */
export function resolveArtifacts({ candidateDirs, listDir }) {
  const firstMatch = (dirs, pick) => {
    for (const dir of dirs) {
      const name = listDir(dir).find(pick);
      if (name) return path.join(dir, name);
    }
    return null;
  };

  return {
    standaloneExe: firstMatch(candidateDirs.standalone, (n) => n.toLowerCase().endsWith('.exe') && !n.toLowerCase().includes('scanner')),
    vst3Bundle: firstMatch(candidateDirs.vst3, (n) => n.toLowerCase().endsWith('.vst3')),
    scannerExe: firstMatch(candidateDirs.scanner, (n) => n.toLowerCase() === 'ceditorpluginscanner.exe'),
  };
}

// --- staging -----------------------------------------------------------------------------------

/** The copy operations that turn built artifacts into the installer's source tree:

      <stageDir>/Standalone/<exe> + CEditorPluginScanner.exe
      <stageDir>/VST3/<bundle>.vst3/** (+ the scanner inside the bundle, beside the module)

    Pure: returns operations, executes nothing. Only the targets the manifest enables appear,
    and each op names the artifact it needs so a missing one refuses with its own name. */
export function stagePlan({ project, artifacts, stageDir }) {
  const ops = [];
  const missing = [];

  if (project.includeStandalone) {
    if (!artifacts.standaloneExe) missing.push('CEHostStandalone (no .exe under its artefacts directory)');
    else {
      ops.push({ kind: 'copyFile', from: artifacts.standaloneExe, to: path.join(stageDir, 'Standalone', path.basename(artifacts.standaloneExe)) });
      if (artifacts.scannerExe)
        ops.push({ kind: 'copyFile', from: artifacts.scannerExe, to: path.join(stageDir, 'Standalone', 'CEditorPluginScanner.exe') });
    }
  }

  if (project.includeVst3) {
    if (!artifacts.vst3Bundle) missing.push('CEHostVST3 (no .vst3 bundle under its artefacts directory)');
    else {
      const bundleName = path.basename(artifacts.vst3Bundle);
      ops.push({ kind: 'copyDir', from: artifacts.vst3Bundle, to: path.join(stageDir, 'VST3', bundleName) });
      if (artifacts.scannerExe)
        ops.push({
          kind: 'copyFile',
          from: artifacts.scannerExe,
          // Beside the module: <bundle>/Contents/x86_64-win/ is where the plug-in's own binary
          // lives, and the runtime's worker search starts beside the loaded binary.
          to: path.join(stageDir, 'VST3', bundleName, 'Contents', 'x86_64-win', 'CEditorPluginScanner.exe'),
        });
    }
  }

  // The scanner is how the product finds instruments; a product without it would install and
  // then scan nothing, which is worse than refusing here.
  if ((project.includeStandalone || project.includeVst3) && !artifacts.scannerExe)
    missing.push('CEditorPluginScanner.exe (the out-of-process scanner ships with every target)');

  return { ops, missing };
}

// --- the installer compile ---------------------------------------------------------------------

/** The ISCC argument list (no shell, execFile-style — spaces in values need no quoting). Every
    /D here has an #ifndef default in HostProductTemplate.iss; the drift test holds the two
    files together. */
export function isccArgs({ project, stageDir, outDir, artifacts, templatePath }) {
  const args = [
    `/DMyAppName=${project.productName}`,
    `/DMyAppVersion=${project.version}`,
    `/DMyAppPublisher=${project.publisher}`,
    `/DMyAppId=${project.appId}`,
    `/DMySetupBase=${sanitizeBaseName(project.productName)}`,
    `/DMySourceDir=${stageDir}`,
    `/DMyOutputDir=${outDir}`,
    `/DIncludeStandalone=${project.includeStandalone ? '1' : '0'}`,
    `/DIncludeVst3=${project.includeVst3 ? '1' : '0'}`,
  ];
  if (artifacts.standaloneExe) args.push(`/DMyAppExeName=${path.basename(artifacts.standaloneExe)}`);
  if (artifacts.vst3Bundle) args.push(`/DMyVst3BundleName=${path.basename(artifacts.vst3Bundle)}`);
  args.push(templatePath);
  return args;
}

/** Every /DName this script can pass. Exported for the drift test: each one must have an
    #ifndef guard in the template, or a hand compile and a pipeline compile diverge. */
export const TEMPLATE_DEFINES = [
  'MyAppName', 'MyAppVersion', 'MyAppPublisher', 'MyAppId', 'MySetupBase',
  'MySourceDir', 'MyOutputDir', 'IncludeStandalone', 'IncludeVst3',
  'MyAppExeName', 'MyVst3BundleName',
];

export function findIscc(explicit) {
  const candidates = [
    explicit,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) ?? null;
}

// --- CLI ---------------------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { config: 'Release' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => argv[++i];
    if (flag === '--project') out.project = next();
    else if (flag === '--build-dir') out.buildDir = next();
    else if (flag === '--config') out.config = next();
    else if (flag === '--out') out.out = next();
    else if (flag === '--iscc') out.iscc = next();
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!out.project) throw new Error('--project <host-project.json> is required');
  out.buildDir ??= path.join(REPO, 'build', 'native');
  out.out ??= path.join(REPO, 'build', 'host-product');
  return out;
}

const realListDir = (dir) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { project, errors } = normalizeProject(JSON.parse(readFileSync(args.project, 'utf8')));
  if (errors.length > 0) {
    for (const e of errors) console.error(`REFUSED: ${e}`);
    process.exit(2);
  }
  console.log(`Building "${project.productName}" ${project.version} — targets:`
    + `${project.includeStandalone ? ' standalone' : ''}${project.includeVst3 ? ' vst3' : ''}`);

  const candidateDirs = artifactCandidateDirs({ buildDir: args.buildDir, config: args.config });
  const artifacts = resolveArtifacts({ candidateDirs, listDir: realListDir });
  for (const [kind, found] of Object.entries(artifacts))
    console.log(`  ${kind}: ${found ?? '(not found)'}`);

  const stageDir = path.join(args.out, 'stage');
  const { ops, missing } = stagePlan({ project, artifacts, stageDir });
  if (missing.length > 0) {
    for (const m of missing) console.error(`MISSING: ${m}`);
    console.error('Build the C++ targets first (cmake --build build/native --target CEHostStandalone CEHostVST3 CEditorPluginScanner).');
    process.exit(3);
  }

  rmSync(stageDir, { recursive: true, force: true });
  for (const op of ops) {
    mkdirSync(path.dirname(op.to), { recursive: true });
    if (op.kind === 'copyDir') cpSync(op.from, op.to, { recursive: true });
    else cpSync(op.from, op.to);
    console.log(`  staged ${path.relative(args.out, op.to)}`);
  }

  const installerDir = path.join(args.out, 'installer');
  mkdirSync(installerDir, { recursive: true });
  const templatePath = path.join(REPO, 'tools', 'installer', 'HostProductTemplate.iss');
  const compileArgs = isccArgs({ project, stageDir, outDir: installerDir, artifacts, templatePath });

  const iscc = findIscc(args.iscc);
  if (iscc == null) {
    console.log('ISCC not found — staged the product folder, skipped the installer compile.');
    console.log(`  would run: ISCC ${compileArgs.join(' ')}`);
    console.log(`DONE (no installer): ${stageDir}`);
    return;
  }

  console.log(`  ISCC ${compileArgs.join(' ')}`);
  execFileSync(iscc, compileArgs, { stdio: 'inherit' });
  const setupName = `${sanitizeBaseName(project.productName)}-Setup-${project.version}.exe`;
  console.log(`DONE: ${path.join(installerDir, setupName)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
