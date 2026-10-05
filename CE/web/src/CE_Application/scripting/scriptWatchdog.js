/**
 * The preview watchdog: a script that never returns stops after a time limit instead of hanging the
 * editor.
 *
 * Preview scripts run on the page's own thread — JavaScript and TypeScript through `new Function`,
 * Lua in wasmoon, Python in Pyodide, C++/C#/Java in this folder's interpreters. Nothing can interrupt
 * a synchronous loop on that thread from outside, so one `while (true) {}` froze the whole editor for
 * good, with the edits since the last recovery snapshot lost (release audit C-57, reproduced in the
 * running app). The exported plug-in's native engines already stop a stuck script after two seconds;
 * the preview had nothing.
 *
 * So the check goes INSIDE the loops. Each language's source is instrumented before it runs — one
 * guard call at the top of every loop body, inserted on the same line so error line numbers do not
 * move — and the three interpreters call the guard from their statement loop. The guard is a counter;
 * every 1,024th call it reads the clock. The clock window opens at the first check in a task and is
 * closed by a zero-delay timer, which can only run once the task has returned control: a script that
 * keeps the thread longer than the limit is, by definition, one that never let that timer run.
 */

import { parse as parseJs } from 'acorn';
import luaparse from 'luaparse';

/** The limit, matching the exported plug-in's QuickJS watchdog. */
export const SCRIPT_TIME_LIMIT_MS = 2000;

/** The name the instrumented source calls. Seeded into every engine's globals. */
export const GUARD_NAME = '__ceGuard';

export class ScriptTimeLimitError extends Error {
  constructor(limitMs = SCRIPT_TIME_LIMIT_MS) {
    super(`script stopped: it ran for more than ${limitMs / 1000} s without returning, so it was stopped`
      + ' (an endless loop?). Edit the script to run it again.');
    this.name = 'ScriptTimeLimitError';
  }
}

/** True for the guard's error however an engine has wrapped it on the way out. */
export function isScriptTimeLimit(error) {
  if (error instanceof ScriptTimeLimitError) return true;
  const text = String(error?.message ?? error ?? '');
  return text.includes('script stopped: it ran for more than');
}

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

let calls = 0;
let windowStart = 0;
let closeScheduled = false;
let limitMs = SCRIPT_TIME_LIMIT_MS;

function scheduleClose() {
  if (closeScheduled) return;
  closeScheduled = true;
  setTimeout(() => {
    windowStart = 0;
    closeScheduled = false;
  }, 0);
}

/** Called from inside every loop. Cheap: a counter, and the clock only every 1,024th time. */
export function scriptLoopGuard() {
  calls += 1;
  if ((calls & 1023) !== 0) return;
  const t = now();
  if (windowStart === 0) {
    windowStart = t;
    scheduleClose();
    return;
  }
  if (t - windowStart > limitMs) throw new ScriptTimeLimitError(limitMs);
}

/** For tests: a shorter limit, and a fresh window. Returns a function that restores the default. */
export function setScriptTimeLimitForTests(ms) {
  limitMs = ms;
  windowStart = 0;
  calls = 0;
  return () => { limitMs = SCRIPT_TIME_LIMIT_MS; windowStart = 0; calls = 0; };
}

/* ---------------------------------------------------------------------------------------------- */

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return; }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue;
    const value = node[key];
    if (value && typeof value === 'object') walk(value, visit);
  }
}

/** Apply [position, text] insertions to a string, last first so earlier positions stay valid. */
function applyInsertions(source, insertions) {
  let out = source;
  for (const [at, text] of [...insertions].sort((a, b) => b[0] - a[0])) out = out.slice(0, at) + text + out.slice(at);
  return out;
}

const JS_LOOPS = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);

/**
 * JavaScript source with a guard call at the top of every loop body. A body that is not a block is
 * wrapped in one. If the source does not parse it is returned unchanged, so the engine reports the
 * real syntax error.
 */
export function instrumentJs(source) {
  const text = String(source ?? '');
  let ast;
  try {
    ast = parseJs(text, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  } catch {
    return text;
  }
  const insertions = [];
  walk(ast, (node) => {
    if (!JS_LOOPS.has(node.type) || !node.body) return;
    if (node.body.type === 'BlockStatement') insertions.push([node.body.start + 1, `${GUARD_NAME}();`]);
    else {
      insertions.push([node.body.start, `{${GUARD_NAME}();`]);
      insertions.push([node.body.end, '}']);
    }
  });
  return insertions.length ? applyInsertions(text, insertions) : text;
}

const LUA_LOOPS = new Set(['WhileStatement', 'RepeatStatement', 'ForNumericStatement', 'ForGenericStatement']);

/**
 * Lua source with a guard call at the top of every loop body. `__ceGuard();` with the semicolon, so
 * a body that starts with a parenthesis is not read as a call on the guard's result. Unparseable
 * source is returned unchanged.
 */
export function instrumentLua(source) {
  const text = String(source ?? '');
  let ast;
  try {
    ast = luaparse.parse(text, { ranges: true, comments: false, luaVersion: '5.3' });
  } catch {
    return text;
  }
  const call = `${GUARD_NAME}(); `;
  const insertions = [];
  walk(ast, (node) => {
    if (!LUA_LOOPS.has(node.type) || !Array.isArray(node.body)) return;
    if (node.body.length) insertions.push([node.body[0].range[0], call]);
    else if (node.type === 'RepeatStatement') insertions.push([node.range[0] + 'repeat'.length, ` ${call}`]);
    else insertions.push([node.range[1] - 'end'.length, call]);
  });
  return insertions.length ? applyInsertions(text, insertions) : text;
}

/**
 * Python, defined once per Pyodide engine: `__ce_exec(source, globals)` compiles the source with a
 * guard call as the first statement of every while/for body, then runs it. Done through Python's own
 * ast so indentation never has to be reasoned about in JavaScript; the inserted call takes the loop's
 * own line number. A syntax error is raised from the original source, unchanged.
 */
export const PYTHON_WATCHDOG_PRELUDE = `
import ast as _ce_ast

class _CeGuardLoops(_ce_ast.NodeTransformer):
    # Single underscores: a double-underscore name inside a class body is name-mangled.
    def _guard(self, node):
        self.generic_visit(node)
        call = _ce_ast.Expr(_ce_ast.Call(_ce_ast.Name('${GUARD_NAME}', _ce_ast.Load()), [], []))
        _ce_ast.copy_location(call, node)
        node.body.insert(0, call)
        return node
    visit_While = _guard
    visit_For = _guard
    visit_AsyncFor = _guard

def __ce_exec(source, scope):
    tree = _ce_ast.parse(source, '<script>', 'exec')
    tree = _ce_ast.fix_missing_locations(_CeGuardLoops().visit(tree))
    exec(compile(tree, '<script>', 'exec'), scope)
`;
