// codeHighlight.js — tiny, dependency-free tokenizer used by CodeEditor.svelte.
// Produces an HTML string of <span class="tok-…"> for the highlight overlay that sits
// behind the editable <textarea>. Deliberately lightweight: regex token scanning, no AST.
// Two languages mirror the script engines the panel runs (JavaScript + Lua 5.4 via wasmoon).

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'default', 'break', 'continue', 'new', 'typeof', 'instanceof',
  'in', 'of', 'this', 'class', 'extends', 'super', 'try', 'catch', 'finally', 'throw',
  'async', 'await', 'yield', 'void', 'delete', 'import', 'export', 'from', 'as',
]);
const JS_LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const JS_BUILTINS = new Set([
  'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'Map', 'Set', 'Promise', 'parseInt', 'parseFloat', 'isNaN',
  // panel scripting host surface (see scripting/panelApi.js)
  'panel', 'control', 'midi', 'device', 'log', 'self',
]);

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'for', 'function', 'goto', 'if',
  'in', 'local', 'not', 'or', 'repeat', 'return', 'then', 'until', 'while',
]);
const LUA_LITERALS = new Set(['true', 'false', 'nil']);
const LUA_BUILTINS = new Set([
  'print', 'pairs', 'ipairs', 'tostring', 'tonumber', 'type', 'select', 'pcall',
  'error', 'assert', 'setmetatable', 'getmetatable', 'rawget', 'rawset', 'next',
  'math', 'string', 'table', 'os',
  // panel scripting host surface
  'panel', 'control', 'midi', 'device', 'log', 'self',
]);

// Each language regex shares the SAME capture-group semantics so one scan loop handles both:
//   g1 = comment   g2 = multiline string (template/long)   g3 = "double"   g4 = 'single'
//   g5 = number    g6 = word (keyword / literal / builtin / identifier)
// Order matters: comments and strings must win over words and numbers.
const LANGS = {
  javascript: {
    re: /((?:\/\/[^\n]*)|(?:\/\*[\s\S]*?\*\/))|(`(?:\\[\s\S]|[^`\\])*`?)|("(?:\\[\s\S]|[^"\\\n])*"?)|('(?:\\[\s\S]|[^'\\\n])*'?)|(\b\d[\w.]*\b)|([A-Za-z_$][\w$]*)/g,
    keywords: JS_KEYWORDS, literals: JS_LITERALS, builtins: JS_BUILTINS,
  },
  lua: {
    re: /((?:--\[\[[\s\S]*?\]\])|(?:--[^\n]*))|(\[\[[\s\S]*?\]\])|("(?:\\[\s\S]|[^"\\\n])*"?)|('(?:\\[\s\S]|[^'\\\n])*'?)|(\b\d[\w.]*\b)|([A-Za-z_][\w]*)/g,
    keywords: LUA_KEYWORDS, literals: LUA_LITERALS, builtins: LUA_BUILTINS,
  },
};

export function languageKey(id) {
  return id === 'javascript' ? 'javascript' : 'lua';
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function span(cls, text) {
  return '<span class="' + cls + '">' + esc(text) + '</span>';
}

// Highlight `source` for the given language id. Returns an HTML string with newlines
// preserved (the caller renders it inside a <pre>). Always HTML-escapes plain text.
export function highlight(source, langId) {
  if (!source) return '';
  const lang = LANGS[languageKey(langId)];
  const re = lang.re;
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (m.index > last) out += esc(source.slice(last, m.index));
    const [whole, comment, mlString, dqString, sqString, num, word] = m;
    if (comment != null) out += span('tok-com', comment);
    else if (mlString != null) out += span('tok-str', mlString);
    else if (dqString != null) out += span('tok-str', dqString);
    else if (sqString != null) out += span('tok-str', sqString);
    else if (num != null) out += span('tok-num', num);
    else if (word != null) {
      if (lang.keywords.has(word)) out += span('tok-kw', word);
      else if (lang.literals.has(word)) out += span('tok-lit', word);
      else if (lang.builtins.has(word)) out += span('tok-bi', word);
      else out += esc(word);
    } else {
      out += esc(whole);
    }
    last = m.index + whole.length;
    if (whole.length === 0) re.lastIndex++; // guard against zero-width matches
  }
  if (last < source.length) out += esc(source.slice(last));
  return out;
}

// Language-aware single-line comment prefix, used by the comment-toggle command.
export function lineCommentToken(langId) {
  return languageKey(langId) === 'javascript' ? '//' : '--';
}
