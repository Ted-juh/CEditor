// scriptDocumentModel.js — the .cescript.json workspace document: create, sanitize, and
// round-trip it to disk.
//
// This owns the DOCUMENT (identity, file metadata, raw-code policy, the script list). The
// individual scripts inside it are the source-based shape defined in scriptModel.js, which
// owns their normalization — there is one definition of "a script", not two.

import { normalizeSourceScript } from './scriptModel.js';

export const SCRIPT_WORKSPACE_FILE_VERSION = 1;
export const SCRIPT_WORKSPACE_EXTENSION = 'cescript.json';

const DEFAULT_RAW_LANGUAGES = ['javascript', 'typescript', 'lua', 'python', 'cpp'];

function stableId(prefix = 'script') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** A new, empty workspace. Scripts are added by the author — we do not seed samples. */
export function createScriptDocument(options = {}) {
  return {
    id: options.id ?? stableId('script_workspace'),
    name: options.name ?? 'Untitled Script Workspace',
    modified: true,
    activeScriptId: '',
    scripts: [],
  };
}

/** Normalize one script inside a document. Delegates to the source-script model. */
export function normalizeScript(script, index = 0) {
  return normalizeSourceScript(script, index);
}

// A script from the retired command-graph engine: `steps[]` and no source. Nothing can run
// these any more, and normalizing one would mint an empty handler stub wearing its old name —
// a script that looks authored and does nothing. Drop them on load instead.
function isRetiredCommandGraphScript(script) {
  return Array.isArray(script?.steps) && typeof script?.source !== 'string';
}

export function sanitizeScriptDocument(document) {
  if (!document || typeof document !== 'object') return null;
  const id = String(document.id ?? stableId('script_workspace')).trim();
  if (!id) return null;

  const scripts = asArray(document.scripts)
    .filter((script) => !isRetiredCommandGraphScript(script))
    .map(normalizeScript);
  const activeScriptId = String(document.activeScriptId ?? '').trim();

  return {
    id,
    name: String(document.name ?? document.title ?? 'Untitled Script Workspace'),
    panelId: String(document.panelId ?? ''), // the panel this script editor is bound to (for controls/Paths)
    filePath: String(document.filePath ?? '').trim(),
    modified: document.modified === true,
    activeScriptId: scripts.some((script) => script.id === activeScriptId)
      ? activeScriptId
      : (scripts[0]?.id ?? ''),
    recentFiles: asArray(document.recentFiles).map(String).filter(Boolean),
    rawCodePolicy: {
      defaultAllowRaw: document.rawCodePolicy?.defaultAllowRaw === true,
      requireExplicitScope: document.rawCodePolicy?.requireExplicitScope !== false,
      markNonPortable: document.rawCodePolicy?.markNonPortable !== false,
      allowedLanguages: asArray(document.rawCodePolicy?.allowedLanguages).length
        ? asArray(document.rawCodePolicy.allowedLanguages).map(String)
        : [...DEFAULT_RAW_LANGUAGES],
    },
    scripts,
  };
}

export function serializeScriptWorkspaceDocument(document) {
  const sanitized = sanitizeScriptDocument(document);
  if (!sanitized) throw new Error('Cannot serialize an empty script workspace.');
  return JSON.stringify({
    kind: 'ceditor.scriptWorkspace',
    version: SCRIPT_WORKSPACE_FILE_VERSION,
    name: sanitized.name,
    activeScriptId: sanitized.activeScriptId,
    rawCodePolicy: sanitized.rawCodePolicy,
    scripts: sanitized.scripts,
  }, null, 2);
}

export function deserializeScriptWorkspaceDocument(text, filePath = '', fallbackName = '') {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  const body = parsed?.kind === 'ceditor.scriptWorkspace' ? parsed : { scripts: parsed?.scripts ?? parsed };
  const name = body?.name || fallbackName || filePath.split(/[\\/]/).pop()?.replace(/\.cescript\.json$/i, '') || 'Untitled Script Workspace';
  const document = sanitizeScriptDocument({
    id: body.id ?? stableId('script_workspace'),
    name,
    filePath,
    modified: false,
    activeScriptId: body.activeScriptId,
    rawCodePolicy: body.rawCodePolicy,
    scripts: body.scripts,
  });
  return document;
}

export function scriptWorkspaceFilename(name = 'Untitled Script Workspace') {
  const safe = String(name || 'Untitled Script Workspace')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'script-workspace';
  return safe.toLowerCase().endsWith(`.${SCRIPT_WORKSPACE_EXTENSION}`)
    ? safe
    : `${safe}.${SCRIPT_WORKSPACE_EXTENSION}`;
}
