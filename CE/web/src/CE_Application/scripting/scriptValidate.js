// scriptValidate.js — edit-time validation for source-based scripts.
//
// Heuristic, language-agnostic checks driven by panelApi.js (the single source of truth):
//   • the script defines a handler matching the event/lifecycle it runs on,
//   • scope-limited commands (e.g. sendSysex) aren't used in the wrong scope,
//   • a component verb is aimed at a control whose type actually has that section,
//   • on(target,"event",…) references a real event name.
//
// Messages are GUIDANCE, not stack traces (spec: "a name should explain itself").
// This is a lightweight scan, not a parser — it may miss matches inside comments/strings.
// Native syntax checking comes from the code editor / the runtime later.

import {
  ALL_MEMBERS, EVENT_BY_ID, ALL_EVENTS, isValidInScope, WEBVIEW_ONLY_MEMBERS,
  MEMBER_MODULE, MODULE_BY_ID, modulesUsedBy, panelModules, memberPath,
} from './panelApi.js';
import { FAMILY_SECTIONS, memberAppliesToType, familiesForType, typeOfControl } from './componentSchema.js';
import { flatControls } from '../utils/containment.js';

const EVENT_FNS = new Set(ALL_EVENTS.map((e) => e.fn));
const EVENT_IDS = new Set(ALL_EVENTS.map((e) => e.id));
const SCOPE_LIMITED = ALL_MEMBERS.filter((m) => Array.isArray(m.scopes)); // members not valid in 'any'

// Handlers that can fire with the panel window CLOSED, where the C++ runtime is the only engine
// and the panel components don't exist. A panel verb in one of these is the one API mistake that
// looks fine in the editor and then quietly does nothing in the shipped plugin, so it is worth
// saying out loud at edit time.
const WINDOW_CLOSED_HANDLERS = new Set([
  'onPanelLoad', 'onPanelClose', 'onPanelDestroy', 'onDawSaveState', 'onDawRestoreState',
  'onMidiIn', 'onCcIn', 'onSysexIn', 'onParameterReceived', 'onDumpReceived',
  'onDeviceConnected', 'onDeviceDisconnected', 'onTimer',
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The component verbs, by flat name — the only members whose validity depends on WHAT the target
// is rather than where the script runs. Everything else in the API applies to any control.
const COMPONENT_MEMBERS = ALL_MEMBERS.filter((m) => FAMILY_SECTIONS[MEMBER_MODULE[m.id]?.module]);

/** name (lower-cased) -> component type, over the whole tree. */
function controlTypes(panel) {
  const out = new Map();
  // flatControls, not panel.controls: most real panels group their controls, and a check that
  // stopped at the top level would report "no such control" for half of them — worse than the
  // silence it replaces.
  for (const control of flatControls(panel?.controls ?? [])) {
    const core = control?._children?.Core;
    const type = typeOfControl(control);
    for (const key of [core?.name, core?.id]) {
      if (key) out.set(String(key).toLowerCase(), type);
    }
  }
  return out;
}

/** Validate one source-based script → array of { severity, message }.
 *
 * `panel` is optional. Pass it and the script is also checked against the panel's declared
 * scripting modules, which is the only way to catch a gated call before it runs. Omit it and
 * every other check behaves exactly as before. */
export function validateScript(script, panel = null) {
  if (!script || typeof script.source !== 'string') return [];
  const problems = [];
  const src = script.source;
  const scope = script.scope || 'component';

  // 0) Modules the script reaches for that the panel has not declared. Only ever reported for a
  //    MANUAL list: on `auto` the declaration follows the source by construction, so there is
  //    nothing a user could act on.
  if (panel) {
    const { mode, enabled } = panelModules(panel);
    if (mode === 'manual') {
      const missing = modulesUsedBy(src).filter((id) => !enabled.includes(id));
      for (const moduleId of missing) {
        const used = Object.entries(MEMBER_MODULE)
          .filter(([, at]) => at.module === moduleId)
          .map(([memberId]) => memberId)
          .filter((memberId) => new RegExp(`\\b${escapeRe(memberId)}\\b`).test(src))
          .slice(0, 3);
        const examples = used.length ? ` (${used.map((id) => memberPath(id)).join(', ')})` : '';
        problems.push({
          severity: 'error',
          message: `Uses ${moduleId}${examples}, which this panel has not enabled. `
            + `Add "${moduleId}" under Scripting Modules on the Export tab, or clear the list to `
            + 'let it follow the scripts. Until then those calls log a notice instead of acting.',
        });
      }
    }
  }

  // 1) Handler presence — the script should define a function for the event it runs on.
  //    Matches Lua/JS (`function name(`), Python (`def name(`), and C++ (`void name(`).
  const handler = script.event;
  if (handler && /^[A-Za-z_]\w*$/.test(handler)) {
    const defined = new RegExp(`(?:function\\s+|def\\s+|void\\s+)${escapeRe(handler)}\\s*\\(`).test(src);
    if (!defined) {
      problems.push({
        severity: 'warn',
        message: `Runs on "${handler}" but no function ${handler}(…) is defined — it won't fire.`,
      });
    }
  }

  // 2) Scope-limited commands used in the wrong scope.
  for (const m of SCOPE_LIMITED) {
    const used = new RegExp(`\\b${escapeRe(m.id)}\\s*\\(`).test(src);
    if (used && !isValidInScope(m, scope)) {
      problems.push({
        severity: 'error',
        message: `${m.id}() only works in ${m.scopes.join(' / ')} scripts — this is a ${scope} script.`,
      });
    }
  }

  // 3) Panel-component verbs in a handler that also runs window-closed.
  if (WINDOW_CLOSED_HANDLERS.has(handler)) {
    const used = WEBVIEW_ONLY_MEMBERS.filter((id) => new RegExp(`\\b${escapeRe(id)}\\s*\\(`).test(src));
    if (used.length) {
      problems.push({
        severity: 'warn',
        message: `${used.join('(), ')}() only work while the panel window is open — "${handler}" also runs with it closed, `
          + 'where the component being addressed does not exist. The call logs a notice there instead of acting.',
      });
    }
  }

  // 4) Async handlers. The WebView runtime awaits a promise a handler returns; the C++ engines
  //    dispatch synchronously and discard it. So `await` runs to completion in preview and gets
  //    cut off at the first suspension point in the shipped plugin — the worst kind of difference,
  //    because the editor says it works.
  if (/\basync\s+(?:function\b|\()/.test(src) || /\bawait\s/.test(src)) {
    problems.push({
      severity: 'warn',
      message: 'async / await runs to completion only in the editor preview. The exported plugin '
        + 'dispatches handlers synchronously and drops the promise, so anything after the first '
        + 'await never happens there. Use onTimer for work that has to wait.',
    });
  }

  // 5) A component verb aimed at a control that has no such section.
  //
  //    The picker and autocomplete already narrow to the target's type, so this cannot be reached
  //    by browsing — but it is trivially reached by pasting code in, by renaming a control, or by
  //    changing what the script is attached to. Until this check existed those all produced a
  //    script the editor called clean and the runtime quietly refused, which is the exact failure
  //    the narrowing was meant to end.
  //
  //    Only a LITERAL first argument is checked. `arpRate(name, 4)` is unknowable without running
  //    the thing, and guessing would put a red mark on correct code — much worse than silence.
  if (panel) {
    const types = controlTypes(panel);
    for (const m of COMPONENT_MEMBERS) {
      const callRe = new RegExp(`\\b${escapeRe(m.id)}\\s*\\(\\s*["']([^"']+)["']`, 'g');
      const seen = new Set();
      let call;
      while ((call = callRe.exec(src)) !== null) {
        const name = call[1];
        if (seen.has(name.toLowerCase())) continue;   // one message per verb per target, not per call
        seen.add(name.toLowerCase());

        const type = types.get(name.toLowerCase());
        // An unknown name is somebody else's problem: the panel may gain the control later, and
        // this check is not the place to police spelling.
        if (type === undefined || memberAppliesToType(m.id, type)) continue;

        const own = familiesForType(type);
        const instead = own.length
          ? ` Its own verbs are ${own.join(', ')}.`
          : ` A ${type} has no component verbs of its own — ce.midi, ce.draw and ce.anim work on it.`;
        problems.push({
          severity: 'error',
          message: `${memberPath(m.id)}("${name}", …) — "${name}" is a ${type}, which has no `
            + `${FAMILY_SECTIONS[MEMBER_MODULE[m.id].module]} section, so the call does nothing.${instead}`,
        });
      }
    }
  }

  // 6) on(target, "event", …) — flag unknown event names.
  const onRe = /\bon\s*\(\s*[^,]+,\s*["']([^"']+)["']/g;
  let mtch;
  while ((mtch = onRe.exec(src)) !== null) {
    const ev = mtch[1];
    if (!EVENT_IDS.has(ev) && !EVENT_FNS.has(ev) && !EVENT_BY_ID[ev]) {
      // Custom emitted events are allowed, so this is a hint, not an error.
      problems.push({
        severity: 'warn',
        message: `on(…, "${ev}", …) — "${ev}" isn't a known control/panel/device event. (Fine if it's a custom emit.)`,
      });
    }
  }

  return problems;
}

/** Rollup for a list of scripts — counts by severity. */
export function validationSummary(scripts, panel = null) {
  let errors = 0;
  let warnings = 0;
  for (const s of scripts || []) {
    for (const p of validateScript(s, panel)) {
      if (p.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }
  return { errors, warnings, ok: errors === 0 && warnings === 0 };
}
