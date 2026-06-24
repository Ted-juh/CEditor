// scriptValidate.js — edit-time validation for source-based scripts.
//
// Heuristic, language-agnostic checks driven by panelApi.js (the single source of truth):
//   • the script defines a handler matching the event/lifecycle it runs on,
//   • scope-limited commands (e.g. sendSysex) aren't used in the wrong scope,
//   • on(target,"event",…) references a real event name.
//
// Messages are GUIDANCE, not stack traces (spec: "a name should explain itself").
// This is a lightweight scan, not a parser — it may miss matches inside comments/strings.
// Native syntax checking comes from the code editor / the runtime later.

import { ALL_MEMBERS, EVENT_BY_ID, ALL_EVENTS, isValidInScope } from './panelApi.js';

const EVENT_FNS = new Set(ALL_EVENTS.map((e) => e.fn));
const EVENT_IDS = new Set(ALL_EVENTS.map((e) => e.id));
const SCOPE_LIMITED = ALL_MEMBERS.filter((m) => Array.isArray(m.scopes)); // members not valid in 'any'

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Validate one source-based script → array of { severity, message }. */
export function validateScript(script) {
  if (!script || typeof script.source !== 'string') return [];
  const problems = [];
  const src = script.source;
  const scope = script.scope || 'component';

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

  // 3) on(target, "event", …) — flag unknown event names.
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
export function validationSummary(scripts) {
  let errors = 0;
  let warnings = 0;
  for (const s of scripts || []) {
    for (const p of validateScript(s)) {
      if (p.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }
  return { errors, warnings, ok: errors === 0 && warnings === 0 };
}
