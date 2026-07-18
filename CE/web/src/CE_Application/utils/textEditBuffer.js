// Text-edit engine for on-screen editable fields (e.g. a preset name typed on
// the LCD, or a Text/Label parameter control). Pure + immutable so it can be
// unit-tested without a DOM and shared by BOTH interaction styles:
//   - PC style:       insert / backspace / delete / moveCaret  (keyboard)
//   - Hardware style: cycleChar / setChar  + moveCaret          (knob + buttons)
//
// A buffer is { text, caret }. `caret` is an insertion index in [0..text.length]
// (it may sit one past the last char). All ops clamp to a charset and maxLength
// and return a NEW buffer; they never mutate the input.

// Named character sets a field can be constrained to. Order matters: it's the
// cycle order for the knob (cycleChar walks this string).
export const CHARSETS = {
  // Classic synth patch-name set: space, A–Z, 0–9, a few symbols.
  upper: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./',
  // Upper + lower + digits + common punctuation.
  alnum: ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_./',
  // Printable ASCII 32..126.
  ascii: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  digits: '0123456789',
};

export function charsetString(charset) {
  if (typeof charset === 'string' && CHARSETS[charset]) return CHARSETS[charset];
  if (typeof charset === 'string' && charset.length > 0) return charset; // literal set
  return CHARSETS.ascii;
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Keep only charset-legal characters and cap to maxLength.
export function normalizeText(text, charset, maxLength) {
  const set = charsetString(charset);
  const max = Number.isFinite(Number(maxLength)) && Number(maxLength) > 0 ? Math.round(Number(maxLength)) : Infinity;
  let out = '';
  for (const ch of String(text ?? '')) {
    if (out.length >= max) break;
    if (set.includes(ch)) out += ch;
  }
  return out;
}

// Build a normalized buffer with a clamped caret.
export function makeBuffer(text, caret, { charset = 'ascii', maxLength = 0 } = {}) {
  const t = normalizeText(text, charset, maxLength);
  return { text: t, caret: clampInt(caret ?? t.length, 0, t.length) };
}

export function clampCaret(buffer) {
  const len = String(buffer?.text ?? '').length;
  return { text: String(buffer?.text ?? ''), caret: clampInt(buffer?.caret ?? len, 0, len) };
}

export function moveCaret(buffer, delta) {
  const { text, caret } = clampCaret(buffer);
  return { text, caret: clampInt(caret + Math.round(Number(delta) || 0), 0, text.length) };
}

export function caretHome(buffer) {
  return { text: String(buffer?.text ?? ''), caret: 0 };
}

export function caretEnd(buffer) {
  const text = String(buffer?.text ?? '');
  return { text, caret: text.length };
}

// PC style: insert a char at the caret (respecting charset + maxLength), advance.
export function insert(buffer, ch, { charset = 'ascii', maxLength = 0 } = {}) {
  const { text, caret } = clampCaret(buffer);
  const set = charsetString(charset);
  const s = String(ch ?? '');
  if (!s || !set.includes(s[0])) return { text, caret };
  const max = Number.isFinite(Number(maxLength)) && Number(maxLength) > 0 ? Math.round(Number(maxLength)) : Infinity;
  if (text.length >= max) return { text, caret };
  const next = text.slice(0, caret) + s[0] + text.slice(caret);
  return { text: next, caret: caret + 1 };
}

// PC style: delete the char BEFORE the caret (Backspace).
export function backspace(buffer) {
  const { text, caret } = clampCaret(buffer);
  if (caret <= 0) return { text, caret };
  return { text: text.slice(0, caret - 1) + text.slice(caret), caret: caret - 1 };
}

// PC style: delete the char AT the caret (Delete).
export function deleteForward(buffer) {
  const { text, caret } = clampCaret(buffer);
  if (caret >= text.length) return { text, caret };
  return { text: text.slice(0, caret) + text.slice(caret + 1), caret };
}

// Hardware style: overwrite the char at the caret (does not move the caret). If
// the caret is at the end, the char is appended (respecting maxLength).
export function setChar(buffer, ch, { charset = 'ascii', maxLength = 0 } = {}) {
  const { text, caret } = clampCaret(buffer);
  const set = charsetString(charset);
  const s = String(ch ?? '');
  if (!s || !set.includes(s[0])) return { text, caret };
  if (caret >= text.length) {
    const max = Number.isFinite(Number(maxLength)) && Number(maxLength) > 0 ? Math.round(Number(maxLength)) : Infinity;
    if (text.length >= max) return { text, caret };
    return { text: text + s[0], caret };
  }
  return { text: text.slice(0, caret) + s[0] + text.slice(caret + 1), caret };
}

// Hardware style: cycle the char at the caret forward/back through the charset
// (the knob). At the end position it appends starting from the first charset
// char. Wraps around the charset.
export function cycleChar(buffer, delta, { charset = 'ascii', maxLength = 0 } = {}) {
  const { text, caret } = clampCaret(buffer);
  const set = charsetString(charset);
  const step = Math.sign(Number(delta) || 1);
  if (caret >= text.length) {
    // Append: start from the first (or last) charset entry.
    const startIdx = step >= 0 ? 0 : set.length - 1;
    return setChar({ text, caret }, set[startIdx], { charset, maxLength });
  }
  const cur = text[caret];
  let idx = set.indexOf(cur);
  if (idx < 0) idx = 0;
  const nextIdx = ((idx + step) % set.length + set.length) % set.length;
  return setChar({ text, caret }, set[nextIdx], { charset, maxLength });
}
