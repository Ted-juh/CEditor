// scriptFileIo.js — pure helpers for loading/saving a single script as a file on disk.
//
// The DOM glue (download anchor, <input type=file>) lives in the component; everything
// decision-shaped is here so it can be unit-tested: extension <-> language mapping,
// safe filenames, and turning a loaded file into createScript() overrides.

const EXT_BY_LANG = { lua: 'lua', javascript: 'js', typescript: 'ts', python: 'py', cpp: 'cpp', csharp: 'cs', java: 'java' };
const LANG_BY_EXT = {
  lua: 'lua',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  py: 'python',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', h: 'cpp',
  cs: 'csharp',
  java: 'java',
};
const RUNNABLE = new Set(['lua', 'javascript', 'typescript', 'python', 'cpp', 'csharp', 'java']);

/** File extension (no dot) for a script's language. Defaults to lua. */
export function extensionForLanguage(languageId) {
  return EXT_BY_LANG[languageId] || 'lua';
}

/** Language id inferred from a filename's extension, or null when unknown. */
export function languageFromFilename(filename) {
  const m = String(filename ?? '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? (LANG_BY_EXT[m[1]] ?? null) : null;
}

/** Strip a path + extension to a bare, display-friendly script name. */
export function baseName(filename) {
  const file = String(filename ?? '').split(/[\\/]/).pop() ?? '';
  return file.replace(/\.[^.]+$/, '').trim();
}

// Turn an arbitrary string into a safe, readable filename stem (no path separators,
// no control/reserved chars, collapsed whitespace). Falls back to 'script'.
function safeStem(name) {
  const stem = String(name ?? '')
    .replace(/[\\/:*?"<>|]+/g, ' ')   // characters illegal on common filesystems
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '_');
  return stem || 'script';
}

/** Suggested download filename for a script, e.g. "Cutoff_follow.lua". */
export function filenameForScript(script) {
  return `${safeStem(script?.name)}.${extensionForLanguage(script?.language)}`;
}

/**
 * Build createScript() overrides from a loaded file. The language comes from the
 * extension when recognised, otherwise from `fallbackLanguage` (the current editor
 * language). The name comes from the filename. Source is the file text verbatim.
 */
export function scriptOverridesFromFile(filename, text, fallbackLanguage = 'lua') {
  const fromExt = languageFromFilename(filename);
  const language = RUNNABLE.has(fromExt) ? fromExt : (RUNNABLE.has(fallbackLanguage) ? fallbackLanguage : 'lua');
  const name = baseName(filename) || 'Imported script';
  return { name, language, source: typeof text === 'string' ? text : '' };
}

/**
 * Best-effort detection of which event a loaded script handles, by finding the first
 * `function <name>(…)` / `def <name>(…)` whose name is one of `knownNames`. Lets an
 * imported file open on the right lifecycle screen. Returns the matched name or null.
 */
export function inferEventFromSource(text, knownNames = []) {
  const src = String(text ?? '');
  let best = null;
  let bestAt = Infinity;
  for (const name of knownNames) {
    const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:function\\s+|def\\s+)${esc}\\s*\\(`);
    const m = re.exec(src);
    if (m && m.index < bestAt) { best = name; bestAt = m.index; }
  }
  return best;
}
