// markdown.js — enough Markdown to read this project's own documentation, and no more.
//
// WHY NOT A LIBRARY. The app ships four runtime dependencies and each is there because it does
// something genuinely hard (a Lua VM, a JS parser, a Lua parser, icons). A Markdown renderer is not
// that: the subset actually used by `docs/*.md` is small, closed and checkable — and a library
// would arrive with an HTML passthrough that has to be turned off, which is the only
// security-relevant decision in the whole job. Writing the subset means the escaping is the first
// thing that happens rather than a configuration flag somebody can flip back.
//
// THE SAFETY MODEL, stated plainly because it is the part worth getting right. Everything is
// escaped FIRST, then a fixed set of tags is emitted. There is no path by which text from a
// document becomes markup: a document containing a script tag renders the characters of one. Link
// hrefs are additionally filtered to http(s) and in-page anchors, because this renders inside a
// WebView that has the bridge on `window`, where a `javascript:` href is a real hole rather than a
// theoretical one.
//
// WHAT IT SUPPORTS, which is exactly what the docs use: ATX headings, paragraphs, fenced code,
// blockquotes, `---` rules, ordered and unordered lists (one level), pipe tables, and inline
// code / bold / italic / strikethrough / links. Anything else falls through as a paragraph, which
// is the right failure: a construct nobody uses renders as its own source rather than vanishing.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * An href we are willing to emit.
 *
 * Relative links between documents are dropped to plain text rather than rendered as links: inside
 * the viewer there is no file to navigate to, and a link that does nothing when clicked is worse
 * than no link. In-page anchors work, because the outline uses the same slugs.
 */
export function safeHref(href) {
  const value = String(href ?? '').trim();
  if (value.startsWith('#')) return value;
  return /^https?:\/\//i.test(value) ? value : null;
}

/** The id an in-page anchor points at. GitHub's rule, so `#section-name` links carry over. */
export function headingSlug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// The placeholder a code span is parked under while inline formatting runs. A private-use
// codepoint, because it must not appear in any real document — and these documents are full of
// punctuation that a printable sentinel would collide with.
const CODE_MARK = '\uE000';

/**
 * Inline formatting, applied to ALREADY-ESCAPED text.
 *
 * Order matters and is not arbitrary: code spans come out first and go back last, so a backtick
 * span containing `**stars**` stays literal. Not a nicety here — the scripting manual is full of
 * code spans containing exactly this punctuation.
 */
export function renderInline(escaped) {
  const codeSpans = [];
  let text = String(escaped ?? '').replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `${CODE_MARK}${codeSpans.length - 1}${CODE_MARK}`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const safe = safeHref(href);
    return safe ? `<a href="${safe}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return text.replace(new RegExp(`${CODE_MARK}(\\d+)${CODE_MARK}`, 'g'),
    (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
}

const inline = (raw) => renderInline(escapeHtml(raw));

/** A pipe-table row split into cells, with the leading and trailing pipes discarded. */
function tableCells(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

const isTableDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/**
 * Render a document to HTML.
 *
 * Line-oriented and single pass. Block state is explicit rather than recursive because the subset
 * has no nesting worth the machinery — a list inside a blockquote does not appear in these docs,
 * and pretending to support it would be a claim the renderer could not keep.
 */
export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  let paragraph = [];
  let list = null;          // { ordered: boolean, items: string[] }
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
    }
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map((q) => `<p>${inline(q)}</p>`).join('')}</blockquote>`);
    quote = [];
  };
  const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Fenced code. The fence's info string becomes a class so a highlighter could use it one day;
    // nothing highlights today and the class is inert.
    const fence = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (fence) {
      flushAll();
      const language = fence[1] ?? '';
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { body.push(lines[i]); i += 1; }
      const cls = language ? ` class="language-${escapeHtml(language)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) { flushAll(); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const body = heading[2].replace(/\s+#+\s*$/, '');
      out.push(`<h${level} id="${escapeHtml(headingSlug(body))}">${inline(body)}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }

    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    flushQuote();

    // A table needs its divider row before the header means anything, so it is found by looking
    // ahead rather than by state — a header row on its own is a paragraph that contains pipes.
    if (line.includes('|') && isTableDivider(lines[i + 1] ?? '')) {
      flushAll();
      const header = tableCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(tableCells(lines[i]));
        i += 1;
      }
      i -= 1;
      const head = header.map((c) => `<th>${inline(c)}</th>`).join('');
      const body = rows
        .map((cells) => `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)[1]);
      continue;
    }

    // A continuation line inside a list item — indented, and not itself a bullet. Joined onto the
    // item rather than starting a paragraph, which is what the wrapped bullets in these docs need.
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();

    paragraph.push(line.trim());
  }

  flushAll();
  return out.join('\n');
}

/**
 * The headings, for a table of contents.
 *
 * Fenced code is skipped, because `# a comment` in a shell block is not a heading — and the
 * scripting manual has plenty of those.
 */
export function documentOutline(text, { maxLevel = 3 } = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const outline = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (!heading) continue;
    const level = heading[1].length;
    if (level > maxLevel) continue;
    const title = heading[2].replace(/\s+#+\s*$/, '').trim();
    outline.push({ level, title, slug: headingSlug(title) });
  }
  return outline;
}

/** The document's own title — its first H1, or null when it has none. */
export function documentTitle(text) {
  return documentOutline(text, { maxLevel: 1 })[0]?.title ?? null;
}
