// provision.mjs — download the pinned build toolchains (manifest.json) for THIS host platform into
// tools/toolchains/<id>/, so CEditor can export C++/C#/Java/Python with no Visual Studio / .NET SDK /
// GraalVM pre-installed. Idempotent (skips already-provisioned toolchains). The installer runs this
// (or bundles the same dirs); the exporter resolves compilers from here. Binaries are gitignored.
//
// Run:  node tools/toolchains/provision.mjs            (all toolchains for this platform)
//       node tools/toolchains/provision.mjs llvm-mingw (just one)
//       node tools/toolchains/provision.mjs --force    (re-download)
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(HERE, 'manifest.json'), 'utf8')).toolchains;

const args = process.argv.slice(2);
const force = args.includes('--force');
const want = args.filter((a) => !a.startsWith('--'));
const platform = `${process.platform}-${process.arch}`;
const altPlatform = process.platform === 'darwin' ? `darwin-${process.arch === 'arm64' ? 'x64' : 'arm64'}` : null;

function pick(tc) { return tc.platforms[platform] || (altPlatform && tc.platforms[altPlatform]) || null; }

function download(url, dest) {
  // curl ships on Windows 10+, macOS and Linux, and honours HTTPS_PROXY (Node's fetch does not).
  execFileSync('curl', ['-fSL', '--retry', '3', '-o', dest, url], { stdio: 'inherit' });
  return statSync(dest).size;
}

function hasCmd(c) {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'command', process.platform === 'win32' ? [c] : ['-v', c], { stdio: 'ignore', shell: process.platform !== 'win32' }); return true; }
  catch { return false; }
}
function extract(archive, outDir, strip) {
  mkdirSync(outDir, { recursive: true });
  // GNU tar (Linux) cannot read .zip; bsdtar (Win10+/macOS) can. Use `unzip` for zips with no strip
  // (Linux), and `tar` for tarballs + for strip>0 zips (bsdtar supports --strip-components).
  if (archive.toLowerCase().endsWith('.zip') && (strip ?? 0) === 0 && hasCmd('unzip')) {
    execFileSync('unzip', ['-o', '-q', archive, '-d', outDir], { stdio: 'inherit' });
    return;
  }
  const a = ['-xf', archive, '-C', outDir];
  if (strip > 0) a.push(`--strip-components=${strip}`);
  execFileSync('tar', a, { stdio: 'inherit' });
}

let provisioned = 0, skipped = 0, failed = 0;
for (const [id, tc] of Object.entries(manifest)) {
  if (want.length && !want.includes(id)) continue;
  const entry = pick(tc);
  const outDir = path.join(HERE, id);
  if (!entry) { console.log(`- ${id}: no build for ${platform} — skipped`); continue; }
  if (!force && existsSync(outDir) && readdirSync(outDir).length) { console.log(`= ${id}: already provisioned`); skipped++; continue; }

  console.log(`↓ ${id} ${tc.version} (~${entry.sizeMB} MB) for ${platform}...`);
  try {
    if (force) rmSync(outDir, { recursive: true, force: true });
    const tmp = path.join(tmpdir(), `ce-tc-${id}-${process.pid}${path.extname(new URL(entry.url).pathname) || '.bin'}`);
    const n = download(entry.url, tmp);
    extract(tmp, outDir, entry.strip ?? 0);
    rmSync(tmp, { force: true });
    console.log(`  ✓ ${id}: ${(n / 1048576).toFixed(1)} MB -> ${path.relative(process.cwd(), outDir)}`);
    provisioned++;
  } catch (e) {
    console.error(`  ✗ ${id}: ${e?.message ?? e}`);
    failed++;
  }
}
console.log(`\nProvisioned ${provisioned}, skipped ${skipped}, failed ${failed}.`);
process.exit(failed ? 1 : 0);
