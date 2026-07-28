// extensionModules.js — third-party scripting modules: the file format, the install rules, and
// the in-memory registry the editor and the exporter read.
//
// WHY THEY INSTALL INTO THE APP rather than ship inside a panel: a module extends what the
// APPLICATION can do, so every panel gets it (design doc §8). The cost of that decision is three
// things, and all three are handled here or by the exporter:
//
//   1. The exporter must BUNDLE it. A shipped plugin has no CEditor install to read from, so the
//      module's prelude is copied into the exported panel (`scripting.extensions`).
//   2. MISSING-MODULE handling. Opening a panel that wants ce.ext.roland_sysex without it
//      installed must name it, say where it came from, and keep the rest of the panel working.
//   3. An INSTALL-TIME COLLISION CHECK, because without a registry there is no name authority.
//
// A module is ONE JSON file, `<id>.cemodule`:
//
//   {
//     "id": "ce.ext.roland_sysex",       // must live under ce.ext.*
//     "version": "1.0",
//     "requires": ["ce.core", "ce.midi"],
//     "runtime": "any",                  // any | webview | player
//     "summary": "…",  "author": "…",  "homepage": "…",
//     "members": [
//       { "id": "rolandAddress", "name": "address",
//         "signature": "rolandAddress(a, b, c, d)", "summary": "…" }
//     ],
//     "prelude": {
//       "lua": "function rolandAddress(a,b,c,d) … end",
//       "javascript": "…", "python": "…",
//       "webview": "…"                    // optional; falls back to `javascript`
//     }
//   }
//
// `id` is the global name the prelude defines; `name` is what it answers to inside the namespace
// (`ce.ext.roland_sysex.address`). Both spellings exist for an extension exactly as they do for a
// built-in module, which is why an extension needs no new machinery anywhere — it registers into
// the same tables and is gated by the same `__ce_apply_modules`.
//
// A native-handler module (C++/C#/Java, compiled at export) is NOT extensible this way: it has no
// prelude to append to. That is recorded in NativeHandlerAbi.h rather than left to be discovered.

import {
  MODULE_EXT_ROOT, RUNTIME_ANY, RUNTIME_WEBVIEW, RUNTIME_PLAYER,
  isExtensionModule, moduleById, memberModule, allModules,
  registerExtension, unregisterExtension, registeredExtensions, clearExtensions,
} from './panelApi.js';

/** The languages a module may carry a prelude for. `webview` falls back to `javascript`. */
export const EXTENSION_LANGUAGES = ['lua', 'javascript', 'python', 'webview'];

/** The file extension an installed module is stored under. */
export const EXTENSION_FILE_SUFFIX = '.cemodule';

const ID_SEGMENT = /^[a-z][a-z0-9_]*$/;
const MEMBER_NAME = /^[A-Za-z_]\w*$/;

// Reserved in at least one of the languages a prelude is written in. Same list the generator
// polices for built-in modules — an extension that names a member `goto` would parse in JS and
// Python and fail in Lua only, which is the worst possible place to find out.
const RESERVED = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
  'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'enum', 'export',
  'extends', 'finally', 'import', 'instanceof', 'new', 'null', 'super', 'switch', 'this', 'throw',
  'try', 'typeof', 'var', 'void', 'with', 'yield',
  'None', 'True', 'False', 'as', 'assert', 'async', 'await', 'def', 'del', 'elif', 'except',
  'from', 'global', 'is', 'lambda', 'nonlocal', 'pass', 'raise',
]);

/**
 * Check a manifest before it is allowed anywhere near a runtime.
 *
 * Returns { ok, module, problems } — `problems` is a list of sentences, not codes, because every
 * one of them is shown to whoever is trying to install the thing.
 *
 * `against` lets the caller validate as if a particular set were already installed; it defaults to
 * what actually is. Replacing an install with a newer version of ITSELF is allowed — that is an
 * upgrade, not a collision.
 */
export function validateExtensionManifest(manifest, { against = null } = {}) {
  const problems = [];
  const fail = (msg) => { problems.push(msg); return null; };

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, module: null, problems: ['Not a module: the file must contain a JSON object.'] };
  }

  const id = String(manifest.id ?? '').trim();
  if (!id) fail('The module has no "id".');
  else if (!isExtensionModule(id)) {
    fail(`"${id}" must live under ${MODULE_EXT_ROOT}.* — that is what keeps third-party modules `
      + 'distinguishable from the built-in ones, and stops two modules from claiming the same name '
      + 'inside ce.<module>.');
  } else {
    const tail = id.slice(MODULE_EXT_ROOT.length + 1);
    if (!tail || !tail.split('.').every((seg) => ID_SEGMENT.test(seg))) {
      fail(`"${id}" is not a usable id: each segment after ${MODULE_EXT_ROOT}. must start with a `
        + 'lowercase letter and contain only lowercase letters, digits and underscores.');
    }
  }

  const version = String(manifest.version ?? '').trim();
  if (!version) fail('The module has no "version".');

  const runtime = manifest.runtime ?? RUNTIME_ANY;
  if (![RUNTIME_ANY, RUNTIME_WEBVIEW, RUNTIME_PLAYER].includes(runtime)) {
    fail(`"runtime" is "${runtime}" — it must be "${RUNTIME_ANY}", "${RUNTIME_WEBVIEW}" or "${RUNTIME_PLAYER}".`);
  }

  const requires = Array.isArray(manifest.requires) ? manifest.requires.map(String) : [];
  const installed = against ?? allModules();
  const knownIds = new Set(installed.map((m) => m.id));
  for (const need of requires) {
    if (!knownIds.has(need) && need !== id) {
      fail(`It requires "${need}", which is not installed. Install that first, or ask its author `
        + 'which module provides it.');
    }
  }

  // --- members -----------------------------------------------------------------------------
  const members = Array.isArray(manifest.members) ? manifest.members : [];
  if (!members.length) fail('The module declares no members, so nothing would be added.');

  // The names already spoken for: every built-in member, and every member of every OTHER installed
  // extension. This is the "install-time collision check" — without a registry there is no name
  // authority, so the authority is local and it is enforced here.
  const taken = memberModule();
  const seenHere = new Set();
  const seenShort = new Set();

  for (const raw of members) {
    const memberId = String(raw?.id ?? '').trim();
    const shortName = String(raw?.name ?? memberId).trim();
    if (!memberId) { fail('A member has no "id".'); continue; }
    if (!MEMBER_NAME.test(memberId)) { fail(`"${memberId}" is not a usable member id.`); continue; }
    if (!MEMBER_NAME.test(shortName)) { fail(`"${shortName}" is not a usable member name.`); continue; }
    if (RESERVED.has(memberId)) fail(`"${memberId}" is a keyword in one of the scripting languages.`);
    if (RESERVED.has(shortName)) fail(`"${shortName}" is a keyword in one of the scripting languages.`);

    if (seenHere.has(memberId)) fail(`"${memberId}" is declared twice in this module.`);
    seenHere.add(memberId);
    if (seenShort.has(shortName)) fail(`Two members both answer to "${shortName}" inside ${id}.`);
    seenShort.add(shortName);

    const owner = taken[memberId]?.module;
    if (owner && owner !== id) {
      fail(`"${memberId}" is already provided by ${owner}. Two modules cannot define the same `
        + 'global — rename it in the module, or remove the other one.');
    }
  }

  // --- prelude -----------------------------------------------------------------------------
  const prelude = manifest.prelude;
  if (!prelude || typeof prelude !== 'object') fail('The module has no "prelude".');
  else {
    for (const [language, src] of Object.entries(prelude)) {
      if (!EXTENSION_LANGUAGES.includes(language)) {
        fail(`"prelude.${language}" is not a language a module can carry `
          + `(${EXTENSION_LANGUAGES.join(', ')}).`);
      } else if (typeof src !== 'string' || !src.trim()) {
        fail(`"prelude.${language}" is empty.`);
      }
    }
    const carried = EXTENSION_LANGUAGES.filter((l) => typeof prelude[l] === 'string' && prelude[l].trim());
    if (!carried.length) fail('The prelude carries no language, so the module could never run.');
  }

  if (problems.length) return { ok: false, module: null, problems };

  return {
    ok: true,
    problems: [],
    module: {
      id,
      version,
      runtime,
      requires,
      summary: String(manifest.summary ?? '').trim(),
      author: String(manifest.author ?? '').trim(),
      homepage: String(manifest.homepage ?? '').trim(),
      members: members.map((m) => ({
        id: String(m.id).trim(),
        name: String(m.name ?? m.id).trim(),
        signature: String(m.signature ?? `${m.id}()`).trim(),
        summary: String(m.summary ?? '').trim(),
        scopes: m.scopes ?? 'any',
      })),
      prelude: Object.fromEntries(
        EXTENSION_LANGUAGES
          .filter((l) => typeof manifest.prelude[l] === 'string' && manifest.prelude[l].trim())
          .map((l) => [l, manifest.prelude[l]]),
      ),
    },
  };
}

/** The source an extension runs in a given runtime. `webview` falls back to `javascript`. */
export function extensionSource(ext, language) {
  const prelude = ext?.prelude ?? {};
  if (typeof prelude[language] === 'string') return prelude[language];
  if (language === 'webview' && typeof prelude.javascript === 'string') return prelude.javascript;
  return null;
}

/* ------------------------------------------------------------------------------- registry */
// The installed set, held in memory and mirrored to disk by the host (see the bridge calls in
// stores/scriptModules.js). Registration is what makes an extension visible to panelApi's
// resolution helpers, the picker, the runtime and the exporter — all of which read allModules().

/**
 * Validate and register. Returns { ok, problems } — a rejected module is not registered at all,
 * because a half-installed module is worse than an absent one.
 */
export function installExtension(manifest) {
  // Validate against everything EXCEPT a previous copy of this same module, so re-installing a
  // newer version is an upgrade rather than a collision with itself.
  const id = String(manifest?.id ?? '').trim();
  const previous = id ? moduleById(id) : null;
  if (previous) unregisterExtension(id);

  const result = validateExtensionManifest(manifest);
  if (!result.ok) {
    if (previous) registerExtension(previous);   // a bad upgrade must not uninstall what worked
    return { ok: false, problems: result.problems, module: null };
  }
  registerExtension(result.module);
  return { ok: true, problems: [], module: result.module, replaced: previous ?? null };
}

export function uninstallExtension(id) { unregisterExtension(id); }
export function installedExtensions() { return registeredExtensions(); }
export function uninstallAllExtensions() { clearExtensions(); }

/**
 * What a panel needs that this install does not have.
 *
 * Missing is not fatal and must not be: the rest of the panel keeps working, and the modules that
 * ARE present keep working. This just names the gap so it can be reported and, when the panel
 * carries a bundled copy (every exported panel does), offered as an install.
 */
export function missingExtensionsFor(panel) {
  const declared = Array.isArray(panel?.scripting?.modules) ? panel.scripting.modules : [];
  const bundled = new Map(bundledExtensions(panel).map((e) => [e.id, e]));
  const out = [];
  for (const id of declared) {
    if (!isExtensionModule(id) || moduleById(id)) continue;
    const copy = bundled.get(id);
    out.push({
      id,
      version: copy?.version ?? null,
      author: copy?.author ?? null,
      // An exported panel bundles the module, so it can be installed straight from the file that
      // needs it — which is the only offline answer, there being no registry to fetch from.
      installable: copy != null,
      manifest: copy ?? null,
    });
  }
  return out;
}

/** The extension copies an exported panel carries. */
export function bundledExtensions(panel) {
  const list = panel?.scripting?.extensions;
  return Array.isArray(list) ? list : [];
}

/**
 * The extensions a panel's enabled modules need, as full manifests, for the exporter to bake in.
 * Only what the panel actually turned on — bundling the whole install would put someone else's
 * module in an export that never calls it.
 */
export function extensionsToBundle(enabledIds) {
  return (enabledIds ?? [])
    .filter((id) => isExtensionModule(id))
    .map((id) => moduleById(id))
    .filter(Boolean);
}
