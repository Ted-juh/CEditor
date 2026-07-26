import { createScriptDocument } from './scriptSamples.js';

export const SCRIPT_WORKSPACE_FILE_VERSION = 1;
export const SCRIPT_WORKSPACE_EXTENSION = 'cescript.json';
export const LEGACY_SCRIPT_WORKSPACE_MODES = {
  diehard: 'expert',
};

function stableId(prefix = 'script') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeScriptWorkspaceMode(mode = 'command') {
  const value = String(mode ?? 'command').trim() || 'command';
  return LEGACY_SCRIPT_WORKSPACE_MODES[value] ?? value;
}

function normalizeStep(step, index = 0) {
  const command = String(step?.command ?? step?.cmd ?? 'setValue').trim() || 'setValue';
  return {
    id: String(step?.id ?? stableId(`step_${index + 1}`)),
    command,
    args: step?.args && typeof step.args === 'object' ? step.args : {},
    phase: step?.phase,
    disabled: step?.disabled === true,
  };
}

export function normalizeScript(script, index = 0) {
  const id = String(script?.id ?? stableId(`script_${index + 1}`)).trim();
  const steps = asArray(script?.steps).map(normalizeStep);
  return {
    id,
    name: String(script?.name ?? id ?? 'untitledScript'),
    scope: String(script?.scope ?? 'panel'),
    description: String(script?.description ?? ''),
    event: String(script?.event ?? 'onValueChanged'),
    target: String(script?.target ?? '*'),
    enabled: script?.enabled !== false,
    runPolicy: String(script?.runPolicy ?? 'During drag: Preview'),
    commitPolicy: String(script?.commitPolicy ?? 'Send MIDI'),
    condition: script?.condition ?? '',
    notes: script?.notes ?? '',
    rawLanguage: script?.rawLanguage,
    rawCode: script?.rawCode ?? '',
    rawPolicy: {
      allowInPreview: script?.rawPolicy?.allowInPreview === true,
      allowInExport: script?.rawPolicy?.allowInExport === true,
      portable: script?.rawPolicy?.portable === true,
    },
    graph: {
      positions: script?.graph?.positions && typeof script.graph.positions === 'object'
        ? script.graph.positions
        : {},
      connections: asArray(script?.graph?.connections),
      zoom: Number.isFinite(Number(script?.graph?.zoom)) ? Number(script.graph.zoom) : 1,
      pan: script?.graph?.pan && typeof script.graph.pan === 'object'
        ? { x: Number(script.graph.pan.x) || 0, y: Number(script.graph.pan.y) || 0 }
        : { x: 0, y: 0 },
    },
    debug: {
      breakpoints: asArray(script?.debug?.breakpoints).map(String),
      watchPaths: asArray(script?.debug?.watchPaths).map(String),
      selectedStepId: String(script?.debug?.selectedStepId ?? ''),
    },
    steps,
    // Source-based model fields (coexist with the legacy command-graph) — preserved so a
    // BehaviorDesigner script survives a round-trip through the document sanitizer on reload.
    language: script?.language,
    source: typeof script?.source === 'string' ? script.source : undefined,
    group: script?.group ?? '',
    // TypeScript ships as JS: the editor transpiles TS → JS on save and stores it here so the
    // C++ host (which has no TS compiler) runs it through its JS engine. Only kept for TS scripts.
    compiledJs: script?.language === 'typescript' && typeof script?.compiledJs === 'string'
      ? script.compiledJs
      : undefined,
  };
}

export function sanitizeScriptDocument(document) {
  if (!document || typeof document !== 'object') return null;
  const id = String(document.id ?? stableId('script_workspace')).trim();
  if (!id) return null;

  const fallback = createScriptDocument({ id });
  const scripts = asArray(document.scripts).length
    ? asArray(document.scripts).map(normalizeScript)
    : fallback.scripts.map(normalizeScript);
  const activeScriptId = String(document.activeScriptId ?? '').trim();

  return {
    id,
    name: String(document.name ?? document.title ?? fallback.name),
    panelId: String(document.panelId ?? ''), // the panel this script editor is bound to (for controls/Paths)
    filePath: String(document.filePath ?? '').trim(),
    modified: document.modified === true,
    activeScriptId: scripts.some((script) => script.id === activeScriptId)
      ? activeScriptId
      : (scripts[0]?.id ?? ''),
    mode: normalizeScriptWorkspaceMode(document.mode),
    recentFiles: asArray(document.recentFiles).map(String).filter(Boolean),
    rawCodePolicy: {
      defaultAllowRaw: document.rawCodePolicy?.defaultAllowRaw === true,
      requireExplicitScope: document.rawCodePolicy?.requireExplicitScope !== false,
      markNonPortable: document.rawCodePolicy?.markNonPortable !== false,
      allowedLanguages: asArray(document.rawCodePolicy?.allowedLanguages).length
        ? asArray(document.rawCodePolicy.allowedLanguages).map(String)
        : ['javascript', 'typescript', 'lua', 'python', 'cpp'],
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
    mode: sanitized.mode,
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
    mode: body.mode,
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
