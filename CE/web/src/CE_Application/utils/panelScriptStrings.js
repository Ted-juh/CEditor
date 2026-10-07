// panelScriptStrings.js — what a panel's scripts name, for the things a panel carries with it.
//
// A panel leaving the editor carries the imported fonts (utils/documentFonts.js) and library icons
// (utils/documentIcons.js) it uses. Its controls say which; a script can reach for one no control
// names yet — `ce.image.icon("Play", "pause")`, `ce.text.style("L", { family: "Inter" })` — and
// the exported player has no settings to find it in. A name a script writes as a plain string, in
// quotes, is found here; one it builds while it runs cannot be, and the manuals say so.

/** Whether `node`, reached under `key`, is a section of that type. A saved or shared document writes
 *  each control as a difference from its defaults, and `_type` is a default: there the section is
 *  known only by the key it sits under in `_children`. */
export const isSection = (node, key, type) => node._type === type || key === type;

/** Every string a panel's scripts hold — source text, compiled text, a visual script's arguments. */
export function panelScriptStrings(panel) {
  const strings = [];
  const collect = (node) => {
    if (typeof node === 'string') { strings.push(node); return; }
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (node && typeof node === 'object') Object.values(node).forEach(collect);
  };
  collect(panel?.scripts ?? []);
  const walk = (node, key = '') => {
    if (Array.isArray(node)) { node.forEach((item) => walk(item)); return; }
    if (!node || typeof node !== 'object') return;
    if (isSection(node, key, 'Scripts')) { collect(node.scripts ?? []); return; }
    for (const [childKey, value] of Object.entries(node)) {
      if (value && typeof value === 'object') walk(value, childKey);
    }
  };
  walk(panel?.controls ?? []);
  return strings;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the scripts name this text, ignoring case: as a whole string value, or in quotes inside
 *  source text. A word in a comment is not a name in quotes. */
export function scriptsName(strings, text) {
  const wanted = String(text ?? '').trim();
  if (!wanted) return false;
  const lower = wanted.toLowerCase();
  const quoted = new RegExp(`["'\`]${escapeRegExp(wanted)}["'\`]`, 'i');
  return strings.some((s) => s.trim().toLowerCase() === lower || quoted.test(s));
}
