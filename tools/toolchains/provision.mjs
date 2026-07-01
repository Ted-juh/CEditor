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
import { writableToolchainsRoot } from './resolveToolchain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(HERE, 'manifest.json'), 'utf8')).toolchains;
// Where to WRITE provisioned toolchains: the per-user dir (CEDITOR_TOOLCHAIN_DIR) when the app set it
// at runtime, else the bundled tools/toolchains dir (HERE) — used by the elevated installer + source
// checkout. Lookups still also see the bundled dir, so install-time toolchains are never re-downloaded.
const OUT_ROOT = writableToolchainsRoot();

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
// Resolve a tar that can read BOTH tarballs AND .zip with --strip-components. On Windows that means
// bsdtar (libarchive), shipped at %SystemRoot%\System32\tar.exe — NOT whatever `tar` happens to be first
// on PATH. Git for Windows / MSYS2 / Cygwin put a GNU tar ahead of System32; GNU tar cannot open a .zip
// at all and aborts the extract, so the strip>0 .zip toolchains (llvm-mingw, jdk) would silently fail to
// provision. Pinning System32 makes extraction deterministic regardless of PATH ordering.
function resolveTar() {
  if (process.platform === 'win32') {
    const sys32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (existsSync(sys32)) return sys32;
  }
  return 'tar';
}

function extract(archive, outDir, strip) {
  mkdirSync(outDir, { recursive: true });
  // GNU tar (Linux) cannot read .zip; bsdtar (Win10+/macOS) can. Use `unzip` for zips with no strip
  // (Linux), and bsdtar/tar for tarballs + for strip>0 zips (libarchive tar supports --strip-components).
  if (archive.toLowerCase().endsWith('.zip') && (strip ?? 0) === 0 && hasCmd('unzip')) {
    execFileSync('unzip', ['-o', '-q', archive, '-d', outDir], { stdio: 'inherit' });
  } else {
    const a = ['-xf', archive, '-C', outDir];
    if (strip > 0) a.push(`--strip-components=${strip}`);
    execFileSync(resolveTar(), a, { stdio: 'inherit' });
  }
  // Fail loudly if the extract produced nothing (e.g. a tar that opened the archive but mis-stripped):
  // otherwise provision.mjs reports success and the resolvers later report the toolchain "not installed"
  // for no visible reason.
  if (!readdirSync(outDir).length)
    throw new Error(`extraction produced no files in ${outDir} (archive: ${path.basename(archive)})`);
}

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

// .NET SDK is installed via Microsoft's dotnet-install script (auto-resolves the latest patch of a
// channel into a folder — no admin, no Visual Studio), not a single pinned archive. The script itself
// downloads the SDK from Microsoft's CDN; honours $HTTPS_PROXY via curl, same as everything else here.
function provisionDotnet(tc, entry, outDir) {
  const scriptPath = path.join(tmpdir(), `ce-dotnet-install-${process.pid}${process.platform === 'win32' ? '.ps1' : '.sh'}`);
  download(entry.script, scriptPath);
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      '-Channel', tc.channel, '-InstallDir', outDir, '-Architecture', arch, '-NoPath'], { stdio: 'inherit' });
  } else {
    execFileSync('bash', [scriptPath, '--channel', tc.channel, '--install-dir', outDir,
      '--architecture', arch, '--no-path'], { stdio: 'inherit' });
  }
  rmSync(scriptPath, { force: true });
}

let provisioned = 0, skipped = 0, failed = 0;
for (const [id, tc] of Object.entries(manifest)) {
  if (want.length && !want.includes(id)) continue;
  const entry = pick(tc);
  const outDir = path.join(OUT_ROOT, id);
  const bundledDir = path.join(HERE, id);
  if (!entry) { console.log(`- ${id}: no build for ${platform} — skipped`); continue; }
  const present = (d) => { try { return existsSync(d) && readdirSync(d).length > 0; } catch { return false; } };
  // Already provisioned in EITHER the per-user dir or the bundled (installer) dir.
  if (!force && (present(outDir) || present(bundledDir))) { console.log(`= ${id}: already provisioned`); skipped++; continue; }

  console.log(`↓ ${id} ${tc.version} (~${entry.sizeMB} MB) for ${platform}...`);
  try {
    if (force) rmSync(outDir, { recursive: true, force: true });
    if (tc.install === 'dotnet-install') {
      mkdirSync(outDir, { recursive: true });
      provisionDotnet(tc, entry, outDir);
      console.log(`  ✓ ${id}: SDK ${tc.channel} -> ${path.relative(process.cwd(), outDir)}`);
      provisioned++;
      continue;
    }
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
