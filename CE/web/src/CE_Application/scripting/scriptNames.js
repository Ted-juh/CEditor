// scriptNames.js — the names a panel's scripts share with each other, written out: the timers they
// start and stop, the settings they save and read, the custom events they emit and listen for, and
// the actions they define and run. A name one script uses and no other answers is the commonest slip
// there is, and nothing at run time can see it: stopping a timer that is not running, reading a
// setting nobody has saved and emitting an event nobody hears are each a thing a script may mean to
// do. The script editor's Values tab reads a call against these (scriptValueKinds.js), and says
// when a name is used on one side only.
//
// Only names written out count. One built from parts is not known until the script runs, and a
// call whose name is computed is left out of every list rather than guessed at.

import { familyOf, literalOf, matchBrackets, scanCalls, tokenize } from './scriptValueScan.js';
import { resolveCallee } from './scriptValues.js';

// The calls that name something another script may name too: which argument holds the name, and
// for a setting, which holds its options (whose `scope` decides who shares it).
const NAMING = {
  startTimer: { list: 'starts', at: 0 }, syncTimer: { list: 'starts', at: 0 }, stopTimer: { list: 'stops', at: 0 },
  saveSetting: { list: 'saves', at: 0, opts: 2 }, loadSetting: { list: 'loads', at: 0, opts: 2 },
  forgetSetting: { list: 'forgets', at: 0, opts: 1 },
  emit: { list: 'emits', at: 0 }, on: { list: 'hears', at: 1 },
  defineAction: { list: 'defines', at: 0 }, run: { list: 'runs', at: 0 },
};

// A function a script defines by name, which run() reaches too (panelRuntime's runAction looks
// through every loaded script's handlers).
const FUNCTION_DEFS = {
  lua: /\bfunction\s+([A-Za-z_][\w]*)\s*\(|\b([A-Za-z_][\w]*)\s*=\s*function\b/g,
  python: /^\s*def\s+([A-Za-z_]\w*)\s*\(/gm,
  default: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
};

/** A setting's scope as written: "panel" unless the options name another, null when computed. */
function scopeOf(node) {
  if (!node || node.type === 'computed' && node.empty) return 'panel';
  if (node.type === 'string') return node.value;
  if (node.type !== 'table') return node.type === 'null' ? 'panel' : null;
  const entry = (node.entries ?? []).find((e) => e.key === 'scope');
  if (!entry) return 'panel';
  return entry.node?.type === 'string' ? entry.node.value : null;
}

/**
 * Every name the scripts write out, by what each call does with it:
 * { starts, stops, saves, loads, forgets, emits, hears, defines, runs, functions }, each a list of
 * { name, scriptId, scope? }; `runsOn`, each script's own event (a script answers its Runs on event,
 * an emitted one included, without an on()); `computed`, the lists a call added a name built from
 * parts to; and `scripts`, each script's name and target by id.
 */
export function scriptNames(scripts) {
  const out = {
    starts: [], stops: [], saves: [], loads: [], forgets: [], emits: [], hears: [], defines: [], runs: [], functions: [], runsOn: [],
    computed: [], scripts: {},
  };
  for (const script of Array.isArray(scripts) ? scripts : []) {
    const scriptId = String(script?.id ?? '');
    out.scripts[scriptId] = { name: String(script?.name ?? script?.target ?? scriptId), target: String(script?.target ?? '') };
    if (script?.event) out.runsOn.push({ name: String(script.event), scriptId });
    const source = String(script?.source ?? '');
    if (!source.trim()) continue;
    const fam = familyOf(script?.language);
    const defs = FUNCTION_DEFS[fam] ?? FUNCTION_DEFS.default;
    for (const m of source.matchAll(defs)) out.functions.push({ name: m[1] ?? m[2], scriptId });
    const tokens = tokenize(source, script?.language);
    const match = matchBrackets(tokens);
    const visit = (calls) => {
      for (const call of calls) {
        visit(call.calls);
        const spec = NAMING[resolveCallee(call.callee)?.memberId];
        if (!spec) continue;
        const positional = call.args.filter((a) => !a.keyword);
        const arg = positional[spec.at];
        const node = arg ? literalOf(tokens, arg.a, arg.b, fam, match) : null;
        if (node?.type !== 'string' || !node.value) {
          // A name built from parts may be any name, so nothing is said of the other side's.
          if (arg && !out.computed.includes(spec.list)) out.computed.push(spec.list);
          continue;
        }
        const entry = { name: node.value, scriptId };
        if (spec.opts !== undefined) {
          const opts = positional[spec.opts];
          entry.scope = scopeOf(opts ? literalOf(tokens, opts.a, opts.b, fam, match) : null);
        }
        out[spec.list].push(entry);
      }
    };
    visit(scanCalls(tokens, 0, tokens.length, fam, match));
  }
  return out;
}
