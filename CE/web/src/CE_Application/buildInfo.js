// Build stamp injected at compile time by Vite (see vite.config.js `define`).
// `__APP_BUILD__` is replaced with a literal object at build/dev-serve time;
// the typeof guard keeps this safe in any plain-node context (e.g. unit tests).
const info =
  typeof __APP_BUILD__ !== 'undefined'
    ? __APP_BUILD__
    : { sha: 'dev', branch: 'dev', time: '' };

export const buildInfo = info;

/** Short one-line label, e.g. "a24fd20 · 2026-06-16 07:30 UTC". */
export const buildLabel = `${info.sha}${info.time ? ` · ${info.time}` : ''}`;
