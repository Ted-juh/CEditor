// scriptSearch.js — cross-script search for the BehaviorDesigner.
//
// The script list is split across lifecycle screens (Setup / Behaviors / Teardown),
// so finding "where did I use sendCC" means hunting screen by screen. This searches
// EVERY script at once — name, event, attached control, folder, and source body —
// and returns lightweight match records the UI can render as a flat results list.

/** Where a query matched, in priority order (metadata before body). */
function matchField(script, q) {
  if (String(script.name ?? '').toLowerCase().includes(q)) return 'name';
  if (String(script.event ?? '').toLowerCase().includes(q)) return 'event';
  if (String(script.target ?? '').toLowerCase().includes(q)) return 'target';
  if (String(script.group ?? '').toLowerCase().includes(q)) return 'folder';
  if (String(script.source ?? '').toLowerCase().includes(q)) return 'source';
  return null;
}

// First source line containing the query → { line (1-based), text } for the snippet.
function firstSourceHit(source, q) {
  const lines = String(source ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(q)) return { line: i + 1, text: lines[i].trim() };
  }
  return null;
}

// Count total occurrences across the whole script (name + body), for ranking/feedback.
function countOccurrences(script, q) {
  if (!q) return 0;
  const hay = [script.name, script.event, script.target, script.group, script.source]
    .map((v) => String(v ?? '').toLowerCase())
    .join('\n');
  let n = 0, idx = 0;
  while ((idx = hay.indexOf(q, idx)) !== -1) { n++; idx += q.length; }
  return n;
}

/**
 * Search a flat list of scripts for `query` (case-insensitive substring).
 * Returns one record per matching script:
 *   { id, name, event, language, field, snippet, line, count }
 * `field` is where the match was found; `snippet`/`line` describe the first
 * source-body hit (null when the match was only in metadata).
 */
export function searchScripts(scripts, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q || !Array.isArray(scripts)) return [];
  const out = [];
  for (const s of scripts) {
    const field = matchField(s, q);
    if (!field) continue;
    const hit = firstSourceHit(s.source, q);
    out.push({
      id: s.id,
      name: s.name,
      event: s.event,
      language: s.language,
      field,
      snippet: hit ? hit.text : null,
      line: hit ? hit.line : null,
      count: countOccurrences(s, q),
    });
  }
  // Metadata matches first, then by occurrence count, then by name — stable + predictable.
  const rank = { name: 0, event: 1, target: 2, folder: 3, source: 4 };
  out.sort((a, b) =>
    rank[a.field] - rank[b.field] || b.count - a.count || String(a.name).localeCompare(String(b.name)));
  return out;
}
