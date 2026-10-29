// helpLinks.js — a link from one shipped document to another, made to open in the viewer.
//
// The documents link to each other the way files in a repository do: `scripting-manual.md`,
// `./editor-manual.md#binding`, `../RELEASE-NOTES.md`. Inside the program there are no files to
// open, so these used to render as plain text. The viewer holds the documents by id; this maps a
// link's file name onto that id, and leaves alone anything it does not hold (a design record the
// app does not ship stays text, as before).

/** The file name a relative link points at, and its anchor. Null for anything that is not one. */
export function parseDocumentLink(href) {
  const value = String(href ?? '').trim();
  if (!value || value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const [path, anchor = ''] = value.split('#');
  const file = path.split('/').filter(Boolean).pop() ?? '';
  if (!/\.md$/i.test(file)) return null;
  return { file: file.toLowerCase(), anchor: decodeURIComponent(anchor) };
}

/**
 * A `resolveLink` for `renderMarkdown`: the shipped documents, matched by the name of their source
 * file. `docs` is the bundle's HELP_DOCS (each has `id` and `source`).
 */
export function helpLinkResolver(docs) {
  const byFile = new Map();
  for (const doc of docs ?? []) {
    const file = String(doc?.source ?? '').split('/').pop()?.toLowerCase();
    if (file && doc?.id) byFile.set(file, doc.id);
  }
  return (href) => {
    const link = parseDocumentLink(href);
    const doc = link ? byFile.get(link.file) : null;
    return doc ? { doc, anchor: link.anchor } : null;
  };
}
