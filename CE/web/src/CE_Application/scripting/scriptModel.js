// scriptModel.js — the new source-based script model (Option B).
//
// A script is REAL source code in one language, stored and run as-is — never converted.
//   { id, name, language, source, scope, event, target, enabled, description }
//
// This coexists with the legacy command-graph model (scriptDocumentModel.js `steps[]`):
// a script is "source-based" when it has a `source` string + `language`. New scripts use
// this shape; old documents keep working until they are migrated/retired.
//
// Spec: docs/design/panel-api-spec.md. Runtime: Model 2 (C++ host).

import {
  SCRIPT_LANGUAGES,
  SCRIPT_SCOPES,
  TIER1_LANGUAGES,
  RUNNABLE_LANGUAGES,
  LIFECYCLE_HOOKS,
  ALL_EVENTS,
} from './panelApi.js';

const LIFECYCLE_BY_ID = Object.fromEntries(LIFECYCLE_HOOKS.map((h) => [h.id, h]));
const EVENT_BY_FN = Object.fromEntries(ALL_EVENTS.map((e) => [e.fn, e]));

function stableId(prefix = 'script') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** True when a script is the new source-based shape (vs the legacy command-graph). */
export function isSourceScript(script) {
  return script != null && typeof script.source === 'string' && typeof script.language === 'string';
}

/** Generate a starter function skeleton for an event/hook name in a given language. */
export function defaultSource(eventName = 'onValueChanged', languageId = 'lua') {
  const isJs = languageId === 'javascript' || languageId === 'typescript';
  const isPy = languageId === 'python';
  const isCpp = languageId === 'cpp' || languageId === 'c++';
  const isCs = languageId === 'csharp' || languageId === 'cs';
  const isJava = languageId === 'java';
  // C++/C#/Java handlers use a fixed (ctx, event) signature; `param` is ignored.
  const open = (name, param) =>
    isCpp ? `void ${name}(CeContext& ctx, const CeEvent& event) {`
    : isCs || isJava ? `void ${name}(CeContext ctx, CeEvent e) {`
    : isPy ? `def ${name}(${param}):` : isJs ? `function ${name}(${param}) {` : `function ${name}(${param})`;
  const body = isPy ? '    pass' : '  ';
  const close = isPy ? '' : isJs || isCpp || isCs || isJava ? '}\n' : 'end\n';
  const skeleton = (name, param) => `${open(name, param)}\n${body}\n${close}`;

  // Lifecycle hooks — onPanelReady gets the firstTime guard.
  const hook = LIFECYCLE_BY_ID[eventName];
  if (hook) {
    const param = hook.params?.[0]?.name ?? '';
    if (eventName === 'onPanelReady') {
      if (isPy) return `def onPanelReady(info):\n    if info.firstTime:\n        pass\n`;
      if (isCpp) return `void onPanelReady(CeContext& ctx, const CeEvent& event) {\n  if (event.firstTime) {\n    \n  }\n}\n`;
      if (isCs || isJava) return `void onPanelReady(CeContext ctx, CeEvent e) {\n  if (e.firstTime) {\n    \n  }\n}\n`;
      return isJs
        ? `function onPanelReady(info) {\n  if (info.firstTime) {\n    \n  }\n}\n`
        : `function onPanelReady(info)\n  if info.firstTime then\n    \n  end\nend\n`;
    }
    return skeleton(eventName, param);
  }

  // Control / panel / device events — derive the handler name + payload.
  const ev = EVENT_BY_FN[eventName];
  if (ev) return skeleton(ev.fn, ev.payload ?? '');

  // Fallback — a bare handler.
  return skeleton(eventName || 'onEvent', '');
}

/** Build a fully-formed source-based script, filling sensible defaults. */
export function createScript(overrides = {}) {
  const language = RUNNABLE_LANGUAGES.includes(overrides.language) ? overrides.language : 'lua';
  const scope = SCRIPT_SCOPES.includes(overrides.scope) ? overrides.scope : 'component';
  const event = String(overrides.event ?? 'onValueChanged');
  const id = String(overrides.id ?? stableId('script')).trim();
  return {
    id,
    name: String(overrides.name ?? event),
    language,
    source: typeof overrides.source === 'string' ? overrides.source : defaultSource(event, language),
    scope,
    // 'self' for a control reacting to its own events; a control name / '*' otherwise.
    target: String(overrides.target ?? (scope === 'component' ? 'self' : '*')),
    event,
    enabled: overrides.enabled !== false,
    description: String(overrides.description ?? ''),
    group: String(overrides.group ?? ''), // optional manual folder label
    // TypeScript ships through the JS engine: the editor stores the transpiled JS here so the
    // C++ host (no TS compiler) can run it. Only meaningful for language === 'typescript'.
    compiledJs: language === 'typescript' && typeof overrides.compiledJs === 'string' ? overrides.compiledJs : undefined,
  };
}

/** Normalize an arbitrary object into a valid source-based script. */
export function normalizeSourceScript(script, index = 0) {
  const language = RUNNABLE_LANGUAGES.includes(script?.language) ? script.language : 'lua';
  const scope = SCRIPT_SCOPES.includes(script?.scope) ? script.scope : 'component';
  const event = String(script?.event ?? 'onValueChanged');
  const id = String(script?.id ?? stableId(`script_${index + 1}`)).trim();
  return {
    id,
    name: String(script?.name ?? event ?? `script ${index + 1}`),
    language,
    source: typeof script?.source === 'string' ? script.source : defaultSource(event, language),
    scope,
    target: String(script?.target ?? (scope === 'component' ? 'self' : '*')),
    event,
    enabled: script?.enabled !== false,
    description: String(script?.description ?? ''),
    group: String(script?.group ?? ''),
    compiledJs: language === 'typescript' && typeof script?.compiledJs === 'string' ? script.compiledJs : undefined,
  };
}

/** The Scripts section default shape attached to controls / panels (unchanged container). */
export function scriptsSectionDefault() {
  return { _type: 'Scripts', enabled: true, runInPreview: true, scripts: [] };
}

export { SCRIPT_LANGUAGES, SCRIPT_SCOPES };
