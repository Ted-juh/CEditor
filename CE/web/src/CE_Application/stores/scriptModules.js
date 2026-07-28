// scriptModules.js — the installed third-party scripting modules (ce.ext.*), as a store.
//
// The host owns the directory they live in (userApplicationData/CEditor/modules/*.cemodule) and is
// the only thing that touches the filesystem. This module is the editor side: it asks for the list,
// validates every manifest before letting it near a runtime, registers what passes, and reports
// what does not.
//
// Validation happens HERE and not only in the host, because the rules are about the API contract —
// which names are taken, which words are keywords in Lua — and the contract lives in JavaScript.
// The host's job is to store bytes; deciding whether those bytes are a legal module is this side's.

import { writable, get } from 'svelte/store';
import {
  listScriptModules, importScriptModule, installScriptModule, removeScriptModule,
  onScriptModulesListed, onScriptModuleChanged, isJuceAvailable,
} from '../bridge/bridge.js';
import {
  installExtension, uninstallExtension, installedExtensions, validateExtensionManifest,
} from '../scripting/extensionModules.js';
import { resetExtensionCache } from '../scripting/panelRuntime.js';

/** The modules currently registered and usable. */
export const scriptModules = writable([]);

/** Manifests the host holds that we refused, with the reasons — surfaced, never swallowed. */
export const scriptModuleProblems = writable([]);   // [{ id, source, problems: [...] }]

function republish() {
  scriptModules.set(installedExtensions());
  // Anything already compiled against the old set has to go: a module that just changed version
  // must not keep running its previous code because a cache said it had seen that id before.
  resetExtensionCache();
}

/**
 * Take a batch of manifests from the host and register the ones that pass. Returns the rejects so
 * a caller can report them; they are also published on scriptModuleProblems.
 */
export function adoptScriptModules(manifests) {
  const rejected = [];
  for (const entry of manifests ?? []) {
    const manifest = entry?.manifest ?? entry;
    const result = installExtension(manifest);
    if (!result.ok) {
      rejected.push({
        id: manifest?.id ?? '(no id)',
        source: entry?.path ?? null,
        problems: result.problems,
      });
    }
  }
  scriptModuleProblems.set(rejected);
  republish();
  return rejected;
}

/**
 * Install one manifest we already hold — the copy an exported panel carries, or a file the user
 * picked. Validated before it is sent to the host, so a rejected module never reaches disk.
 */
export function installScriptModuleManifest(manifest) {
  const check = validateExtensionManifest(manifest);
  if (!check.ok) return { ok: false, problems: check.problems };

  const result = installExtension(manifest);
  if (!result.ok) return { ok: false, problems: result.problems };

  republish();
  if (isJuceAvailable()) installScriptModule(check.module);
  return { ok: true, problems: [], module: result.module, replaced: result.replaced };
}

export function removeScriptModuleById(moduleId) {
  uninstallExtension(moduleId);
  republish();
  if (isJuceAvailable()) removeScriptModule(moduleId);
}

/** Ask the host to open a file picker. The result comes back through onScriptModulesListed. */
export function browseForScriptModule() {
  if (isJuceAvailable()) importScriptModule();
}

/** Wire the host's events and ask for the current list. Call once at startup. */
export function initScriptModules() {
  const stop = [
    onScriptModulesListed((payload) => adoptScriptModules(payload?.modules ?? [])),
    // A single install/remove the host performed (a file dropped in, say) — re-ask rather than
    // trying to reconcile one event against the set, which is how two sources of truth start.
    onScriptModuleChanged(() => listScriptModules()),
  ];
  listScriptModules();
  return () => { for (const off of stop) off?.(); };
}

/** What is installed right now, without subscribing. */
export function currentScriptModules() { return get(scriptModules); }
