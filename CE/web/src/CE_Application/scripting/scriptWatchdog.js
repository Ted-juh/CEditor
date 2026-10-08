/**
 * The Python preview watchdog: a Python script that never returns stops after a time limit instead
 * of hanging the editor.
 *
 * Preview scripts run on the page's own thread, and nothing can interrupt a synchronous loop there
 * from outside, so one `while True: pass` froze the whole editor for good (release audit C-57,
 * reproduced in the running app). The other preview engines carry their own bound: JavaScript and
 * TypeScript run in QuickJS with an interrupt deadline (boundedJavascript.js), Lua in Wasmoon with a
 * function timeout (boundedLua.js), and the C++/C#/Java interpreters share a step and time budget
 * (previewBudget.js). Pyodide has none, so Python's loops call this guard.
 *
 * The source is compiled through Python's own ast with a guard call as the first statement of every
 * loop body, on the loop's own line so error line numbers do not move. The guard is a counter; every
 * 1,024th call it reads the clock. The clock window opens at the first check in a task and is closed
 * by a zero-delay timer, which can only run once the task has returned control: a script that keeps
 * the thread longer than the limit is, by definition, one that never let that timer run.
 */

/** The limit, matching the exported plug-in's native watchdog. */
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
