// tsService.js — TypeScript support: transpile-to-JS (it runs on the existing JS runtime) plus
// editor intelligence via the TypeScript compiler. The compiler is loaded lazily (a separate
// chunk, like wasmoon/Pyodide) so it never bloats the main bundle.

let tsMod = null, tsLoading = null;

/** Resolve the TypeScript compiler module (lazy). */
export async function ensureTs() {
  if (tsMod) return tsMod;
  if (!tsLoading) tsLoading = import('typescript').then((m) => (tsMod = m.default ?? m)).catch(() => null);
  return tsLoading;
}
function kickLoad() { if (!tsMod && !tsLoading) ensureTs(); }

/** Transpile TS → JS using the loaded compiler (null if not loaded yet). */
export function transpileTs(source) {
  if (!tsMod) return null;
  return tsMod.transpileModule(String(source ?? ''), {
    compilerOptions: { target: tsMod.ScriptTarget.ES2020, isolatedModules: true },
  }).outputText;
}

// Blank strings (incl. template literals) and comments so the brace matcher never trips on them.
function blankJsLike(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { out += '  '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      out += ' '; i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') { out += '  '; i += 2; continue; } out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += ' '; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Brace-based foldable regions (shared shape with the JS/Lua/C++ service). */
export function foldTs(source) {
  const blanked = blankJsLike(String(source ?? ''));
  const lineAt = (idx) => blanked.slice(0, idx).split('\n').length;
  const stack = [], byStart = new Map();
  for (let i = 0; i < blanked.length; i++) {
    if (blanked[i] === '{') stack.push(i);
    else if (blanked[i] === '}') {
      const s = stack.pop();
      if (s != null) { const sl = lineAt(s), el = lineAt(i); if (el > sl) { const p = byStart.get(sl); if (!p || el > p.endLine) byStart.set(sl, { startLine: sl, endLine: el }); } }
    }
  }
  return [...byStart.values()].sort((a, b) => a.startLine - b.startLine);
}

// Regex symbol fallback used until the compiler finishes loading (works on TS source directly).
function regexSymbols(src) {
  const syms = [], lines = src.split('\n'), offs = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') offs.push(i + 1);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]; let m;
    if ((m = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(line)))
      syms.push({ name: m[1], kind: 'function', detail: `${m[1]}(${m[2].trim()})`, line: li + 1, col: 0, index: (offs[li] ?? 0) + line.indexOf(m[1]) });
    else if ((m = /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line)))
      syms.push({ name: m[1], kind: 'class', detail: `class ${m[1]}`, line: li + 1, col: 0, index: (offs[li] ?? 0) + line.indexOf(m[1]) });
    else if ((m = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line)))
      syms.push({ name: m[1], kind: 'variable', detail: m[1], line: li + 1, col: 0, index: (offs[li] ?? 0) + line.indexOf(m[1]) });
  }
  return syms;
}

/** Editor analysis for TypeScript → { diagnostics, symbols }. Uses the compiler when loaded. */
export function analyzeTs(source) {
  const src = String(source ?? '');
  if (!src.trim()) return { diagnostics: [], symbols: [] };
  if (!tsMod) { kickLoad(); return { diagnostics: [], symbols: regexSymbols(src) }; }
  const ts = tsMod;
  const sf = ts.createSourceFile('s.ts', src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);

  const diagnostics = (sf.parseDiagnostics ?? []).map((dgn) => {
    const lc = sf.getLineAndCharacterOfPosition(dgn.start ?? 0);
    return { severity: 'error', message: ts.flattenDiagnosticMessageText(dgn.messageText, ' '), line: lc.line + 1, col: lc.character, index: dgn.start ?? 0 };
  });

  const symbols = [];
  const posOf = (node) => { const start = node.getStart(sf); const lc = sf.getLineAndCharacterOfPosition(start); return { line: lc.line + 1, col: lc.character, index: start }; };
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const params = node.parameters.map((p) => p.name.getText(sf)).join(', ');
      symbols.push({ name: node.name.text, kind: 'function', detail: `${node.name.text}(${params})`, ...posOf(node.name) });
    } else if (ts.isClassDeclaration(node) && node.name) {
      symbols.push({ name: node.name.text, kind: 'class', detail: `class ${node.name.text}`, ...posOf(node.name) });
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const isFn = d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer));
        symbols.push({ name: d.name.text, kind: isFn ? 'function' : 'variable', detail: d.name.text, ...posOf(d.name) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { diagnostics, symbols };
}
