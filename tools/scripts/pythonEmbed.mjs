// pythonEmbed.mjs — pure helpers deciding whether a panel export must bundle the native CPython
// runtime. Kept separate from export-panel-vst3.mjs (which runs immediately on import) so it can be
// unit-tested. The rule must mirror what the SHIPPED C++ host actually runs: PanelValueModel.h's
// isSourceScript admits a script only when BOTH source and language are non-empty — an empty Python
// stub is skipped by the runtime, so it must NOT trigger the ~tens-of-MB libpython+stdlib embed.

const PY_ALIASES = new Set(['python', 'py']);

/** Normalize a language id, folding the 'py' alias onto 'python'. */
export function normalizeLanguage(lang) {
  const s = String(lang ?? '').trim().toLowerCase();
  return PY_ALIASES.has(s) ? 'python' : s;
}

/** True when a script is a real source script the host would run (non-empty source + language). */
export function isRunnableSource(s) {
  return !!s
    && typeof s.source === 'string' && s.source.trim() !== ''
    && typeof s.language === 'string' && s.language.trim() !== '';
}

/** The set of (normalized) languages a panel actually ships runnable scripts in — panel-level and
 *  per-control — honoring the same enabled/source filters as the shipped runtime. */
export function panelScriptLanguages(doc) {
  const langs = new Set();
  const add = (s) => { if (s?.enabled !== false && isRunnableSource(s)) langs.add(normalizeLanguage(s.language)); };
  for (const s of doc?.scripts ?? []) add(s);
  for (const c of doc?.controls ?? []) {
    const sec = c?._children?.Scripts;
    if (sec?.enabled === false) continue;
    for (const s of sec?.scripts ?? []) add(s);
  }
  return langs;
}

/** Whether the export should embed CPython: 'on' forces it, 'off' forbids it, 'auto' embeds only
 *  when the panel has at least one runnable Python script. */
export function shouldEmbedPython(doc, mode = 'auto') {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return panelScriptLanguages(doc).has('python');
}
