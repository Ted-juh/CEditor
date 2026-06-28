// languages.mjs — the single source of truth mapping each SCRIPTING LANGUAGE to the build toolchains it
// needs at export, plus status + on-demand provisioning. Reused by:
//   • the exporter preflight (on-demand: "this panel needs the C# toolchain — install it?")
//   • the in-app "Scripting Toolchains" settings panel (Installed / Install / Remove per language)
//   • the installer's optional language-component page
// so all three agree on what each language costs. See docs/scripting-language-options-and-shippable-export.md.
//
// CLI:
//   node tools/toolchains/languages.mjs status              # JSON: per-language installed/size
//   node tools/toolchains/languages.mjs preflight <panel>   # JSON: languages used + missing toolchains
//   node tools/toolchains/languages.mjs ensure <lang...>    # provision the toolchains those languages need
//   node tools/toolchains/languages.mjs remove <lang...>    # delete those languages' (exclusive) toolchains

import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cppCompiler, dotnetExe, jdkTools, pythonEmbedDir, ninjaExe, toolchainDir,
} from './resolveToolchain.mjs';
import { panelScriptLanguages } from '../scripts/pythonEmbed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(HERE, 'manifest.json'), 'utf8')).toolchains;

// The download size (this platform) of a manifest toolchain, or 0.
function tcSizeMB(id) {
  const tc = manifest[id];
  if (!tc) return 0;
  const platform = `${process.platform}-${process.arch}`;
  const e = tc.platforms?.[platform] || Object.values(tc.platforms ?? {})[0];
  return e?.sizeMB ?? 0;
}

// Per-language definition. `toolchains` are the manifest ids needed at export; `exclusive` are the ones
// that ONLY this language needs (safe to remove when the language is removed — shared ones like
// llvm-mingw/ninja are never auto-removed). `installed()` answers "can this language export now?" using
// the resolvers (bundled-first, system fallback).
export const LANGUAGES = [
  { id: 'lua',        label: 'Lua',        builtin: true,  toolchains: [],                          exclusive: [],            installed: () => true },
  { id: 'javascript', label: 'JavaScript', builtin: true,  toolchains: [],                          exclusive: [],            installed: () => true },
  { id: 'typescript', label: 'TypeScript', builtin: true,  toolchains: [],                          exclusive: [],            installed: () => true },
  { id: 'python',     label: 'Python',     builtin: false, toolchains: ['python-embed'],            exclusive: ['python-embed'],
    installed: () => !!pythonEmbedDir() },
  { id: 'cpp',        label: 'C++',        builtin: false, toolchains: ['llvm-mingw', 'ninja'],     exclusive: [],
    installed: () => !!cppCompiler() },
  { id: 'csharp',     label: 'C#',         builtin: false, toolchains: ['dotnet', 'llvm-mingw', 'ninja'], exclusive: ['dotnet'],
    installed: () => !!dotnetExe() && !!cppCompiler() },
  { id: 'java',       label: 'Java',       builtin: false, toolchains: ['jdk', 'llvm-mingw', 'ninja'],    exclusive: ['jdk'],
    installed: () => { const j = jdkTools(); return !!(j && j.jniIncludeDir) && !!cppCompiler(); } },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

/** A language id from any alias (py -> python). */
export function normLang(lang) {
  const s = String(lang ?? '').trim().toLowerCase();
  return s === 'py' ? 'python' : s;
}

/** The set of toolchain ids a set/array of languages needs at export. */
export function requiredToolchains(langs) {
  const ids = new Set();
  for (const l of langs) BY_ID.get(normLang(l))?.toolchains.forEach((t) => ids.add(t));
  return ids;
}

/** Is a single bundled toolchain provisioned (dir exists + non-empty)? */
export function toolchainProvisioned(id) {
  const d = toolchainDir(id);
  try { return !!d && readdirSync(d).length > 0; } catch { return false; }
}

/** Status of every selectable language: installed?, what it needs, and its incremental download size
 *  (sum of its toolchains NOT already provisioned + not satisfied by a system tool). */
export function languageStatus() {
  return LANGUAGES.map((l) => {
    const installed = !!l.installed();
    const missing = l.toolchains.filter((t) => !toolchainProvisioned(t));
    const downloadMB = installed ? 0 : missing.reduce((s, t) => s + tcSizeMB(t), 0);
    return {
      id: l.id, label: l.label, builtin: l.builtin, installed,
      toolchains: l.toolchains, missingToolchains: missing, downloadMB,
    };
  });
}

/** Languages a panel actually ships runnable scripts in (mirrors the shipped runtime's filter). */
export function panelLanguages(panelDoc) {
  return [...panelScriptLanguages(panelDoc)].map(normLang);
}

/** Preflight a panel: which languages it uses, and which toolchains are missing to export it. */
export function preflightPanel(panelDoc) {
  const langs = panelLanguages(panelDoc);
  const needed = [...requiredToolchains(langs)];
  const missing = needed.filter((t) => !toolchainProvisioned(t));
  // A language is "blocked" if it's used but can't export now (resolver says no).
  const blocked = langs.filter((l) => { const def = BY_ID.get(l); return def && !def.builtin && !def.installed(); });
  return { languages: langs, neededToolchains: needed, missingToolchains: missing, blockedLanguages: blocked };
}

/** Provision the toolchains needed by `langs` (delegates to provision.mjs, which streams progress). */
export function provisionForLanguages(langs, { force = false } = {}) {
  const ids = [...requiredToolchains(langs)];
  if (!ids.length) return { provisioned: [], note: 'no toolchains needed' };
  const args = [path.join(HERE, 'provision.mjs'), ...ids];
  if (force) args.push('--force');
  execFileSync(process.execPath, args, { stdio: 'inherit' });
  return { provisioned: ids };
}

/** Remove a language's EXCLUSIVE toolchains (never the shared llvm-mingw/ninja). Returns removed ids. */
export function removeLanguages(langs) {
  const removed = [];
  for (const l of langs) {
    const def = BY_ID.get(normLang(l));
    if (!def) continue;
    for (const t of def.exclusive) {
      const d = toolchainDir(t);
      if (d && existsSync(d)) { rmSync(d, { recursive: true, force: true }); removed.push(t); }
    }
  }
  return removed;
}

// --------------------------------------------------------------------------- CLI
if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  const [cmd, ...rest] = process.argv.slice(2);
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');
  try {
    if (cmd === 'status') {
      out({ languages: languageStatus() });
    } else if (cmd === 'preflight') {
      const doc = JSON.parse(readFileSync(rest[0], 'utf8'));
      out(preflightPanel(doc));
    } else if (cmd === 'ensure') {
      const langs = rest.filter((a) => !a.startsWith('--'));
      const r = provisionForLanguages(langs, { force: rest.includes('--force') });
      out(r);
    } else if (cmd === 'remove') {
      out({ removed: removeLanguages(rest) });
    } else {
      process.stderr.write('usage: languages.mjs status | preflight <panel> | ensure <lang...> | remove <lang...>\n');
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`languages.mjs ${cmd}: ${e?.message ?? e}\n`);
    process.exit(1);
  }
}
