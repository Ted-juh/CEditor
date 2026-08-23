// xml.mjs — enough XML to read a Ctrlr panel, and no more.
//
// WHY NOT A DEPENDENCY. Same reasoning as the Markdown renderer in the app: the subset is small,
// closed and checkable, and this runs over files somebody downloaded from a forum — so the one
// property that matters is that a hostile or malformed document produces a parse error rather than
// anything else. A general XML parser brings entity expansion and DOCTYPE handling with it, and
// both are attack surface this job has no use for. Entities here are the five predefined ones and
// numeric character references; a DOCTYPE is skipped, and an external one is refused.
//
// WHAT A CTRLR PANEL ACTUALLY IS: an attribute bag. `<uiComponent componentRectangle="10 10 60 60"
// uiSliderStyle="rotary" .../>` — no mixed content, no namespaces, text only inside a few Lua and
// resource nodes. So the model is nodes with a name, a flat attribute map, children, and text.

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The five predefined entities and numeric references. Nothing else — see the header. */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;   // an unknown entity stays literal rather than vanishing
  });
}

class Reader {
  constructor(text) {
    this.text = text;
    this.at = 0;
  }

  error(message) {
    // The line number is worth the scan: these files are tens of thousands of lines and "unexpected
    // character" without one is useless to whoever has to look.
    const line = this.text.slice(0, this.at).split('\n').length;
    return new Error(`${message} (line ${line})`);
  }

  skipSpace() {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) this.at += 1;
  }

  /** Comments, processing instructions, CDATA and DOCTYPE — everything that is not an element. */
  skipProlog() {
    for (;;) {
      this.skipSpace();
      if (this.text.startsWith('<!--', this.at)) {
        const end = this.text.indexOf('-->', this.at + 4);
        if (end < 0) throw this.error('Unterminated comment');
        this.at = end + 3;
      } else if (this.text.startsWith('<?', this.at)) {
        const end = this.text.indexOf('?>', this.at + 2);
        if (end < 0) throw this.error('Unterminated processing instruction');
        this.at = end + 2;
      } else if (this.text.startsWith('<!DOCTYPE', this.at)) {
        // An external or internal subset is where entity-expansion attacks live. A Ctrlr panel has
        // no use for either, so a DOCTYPE with a body is refused rather than parsed carefully.
        const end = this.text.indexOf('>', this.at);
        if (end < 0) throw this.error('Unterminated DOCTYPE');
        const doctype = this.text.slice(this.at, end);
        if (doctype.includes('[') || /SYSTEM|PUBLIC|ENTITY/i.test(doctype)) {
          throw this.error('DOCTYPE with a subset or external reference is refused');
        }
        this.at = end + 1;
      } else {
        return;
      }
    }
  }

  readName() {
    NAME.lastIndex = this.at;
    const match = NAME.exec(this.text);
    if (!match) throw this.error('Expected a name');
    this.at = NAME.lastIndex;
    return match[0];
  }

  readAttributes() {
    const attributes = {};
    for (;;) {
      this.skipSpace();
      const c = this.text[this.at];
      if (c === undefined) throw this.error('Unterminated tag');
      if (c === '>' || c === '/') return attributes;

      const name = this.readName();
      this.skipSpace();
      if (this.text[this.at] !== '=') throw this.error(`Attribute "${name}" has no value`);
      this.at += 1;
      this.skipSpace();

      const quote = this.text[this.at];
      if (quote !== '"' && quote !== "'") throw this.error(`Attribute "${name}" is not quoted`);
      this.at += 1;
      const end = this.text.indexOf(quote, this.at);
      if (end < 0) throw this.error(`Attribute "${name}" is not terminated`);
      attributes[name] = decodeEntities(this.text.slice(this.at, end));
      this.at = end + 1;
    }
  }

  readElement() {
    if (this.text[this.at] !== '<') throw this.error('Expected an element');
    this.at += 1;
    const name = this.readName();
    const attributes = this.readAttributes();

    if (this.text[this.at] === '/') {
      this.at += 2;   // "/>"
      return { name, attributes, children: [], text: '' };
    }
    this.at += 1;     // ">"

    const children = [];
    let text = '';

    for (;;) {
      if (this.at >= this.text.length) throw this.error(`<${name}> is never closed`);

      if (this.text.startsWith('</', this.at)) {
        this.at += 2;
        const closing = this.readName();
        if (closing !== name) throw this.error(`</${closing}> closes <${name}>`);
        this.skipSpace();
        if (this.text[this.at] !== '>') throw this.error(`</${closing}> is malformed`);
        this.at += 1;
        return { name, attributes, children, text: text.trim() };
      }

      if (this.text.startsWith('<!--', this.at)) {
        const end = this.text.indexOf('-->', this.at + 4);
        if (end < 0) throw this.error('Unterminated comment');
        this.at = end + 3;
        continue;
      }

      if (this.text.startsWith('<![CDATA[', this.at)) {
        const end = this.text.indexOf(']]>', this.at + 9);
        if (end < 0) throw this.error('Unterminated CDATA');
        // NOT entity-decoded: CDATA is literal by definition, and Lua bodies live in it.
        text += this.text.slice(this.at + 9, end);
        this.at = end + 3;
        continue;
      }

      if (this.text[this.at] === '<') {
        children.push(this.readElement());
        continue;
      }

      const next = this.text.indexOf('<', this.at);
      const stop = next < 0 ? this.text.length : next;
      text += decodeEntities(this.text.slice(this.at, stop));
      this.at = stop;
    }
  }
}

/** Parse a document. Throws with a line number on anything malformed. */
export function parseXml(source) {
  const text = String(source ?? '').replace(/^﻿/, '');
  if (!text.trim()) throw new Error('The file is empty');

  const reader = new Reader(text);
  reader.skipProlog();
  if (reader.text[reader.at] !== '<') throw reader.error('No root element');
  const root = reader.readElement();
  reader.skipProlog();
  if (reader.at < reader.text.length) throw reader.error('Content after the root element');
  return root;
}

/** Every descendant with this tag name, in document order. */
export function findAll(node, name, out = []) {
  for (const child of node?.children ?? []) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

/** The first descendant with this tag name, or null. */
export function findFirst(node, name) {
  for (const child of node?.children ?? []) {
    if (child.name === name) return child;
    const deeper = findFirst(child, name);
    if (deeper) return deeper;
  }
  return null;
}

export const attr = (node, name, fallback = '') => node?.attributes?.[name] ?? fallback;

export function attrNumber(node, name, fallback = 0) {
  const value = Number(attr(node, name, ''));
  return Number.isFinite(value) ? value : fallback;
}

/** Ctrlr writes booleans as "1"/"0" and occasionally "true"/"false". */
export function attrBool(node, name, fallback = false) {
  const value = String(attr(node, name, '')).trim().toLowerCase();
  if (value === '') return fallback;
  return value === '1' || value === 'true' || value === 'yes';
}
