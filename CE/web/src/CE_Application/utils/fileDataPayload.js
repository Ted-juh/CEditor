/**
 * Reading a file the backend sent over the bridge.
 *
 * Everything arrives base64-encoded, and the reason is worth knowing before anyone decides that is
 * silly for text. It was changed to send text as text — no encode, no decode, a third fewer bytes —
 * and the 790 KB GAIA profile then took 55,298 ms to cross the bridge, with the window unresponsive
 * for two minutes at a time.
 *
 * JUCE's emitEvent embeds the payload in a JavaScript source string and escapes it with
 * `String::replace`, which is O(occurrences x length). JSON::toString turns every quote in the text
 * into \", so that profile's 77,554 quotes made the escape run 77,554 times over 790 KB: 61.3
 * billion character operations. Base64 contains no backslash and no apostrophe, so the same escape
 * finds nothing and returns after one scan.
 *
 * So the encoding is not the transport being naive — it is the transport's constraint. The helpers
 * here still read a plain `text` field as well, because the C++ and the frontend ship separately and
 * a mismatched pair on someone's machine should not mean a panel that will not open.
 */

/** Bytes a payload carried, for logging. Prefers what C++ measured over anything inferred here. */
export function fileDataByteSize(payload) {
  const reported = Number(payload?.byteSize);
  if (Number.isFinite(reported) && reported > 0) return reported;

  if (typeof payload?.text === 'string') {
    // Bytes, not characters — a UTF-8 file with any accented character has more of the former.
    return typeof TextEncoder === 'undefined' ? payload.text.length : new TextEncoder().encode(payload.text).length;
  }

  const value = String(payload?.data ?? '');
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return value.length;

  const base64 = value.slice(commaIndex + 1);
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** UTF-8 text from base64. Decoded as UTF-8 rather than per-character, or every accent is mojibake. */
export function base64ToText(value) {
  const body = String(value ?? '');
  if (!body) return '';

  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** The text of a data: URL, base64 or not. Kept for payloads that still arrive the old way. */
export function dataUrlToText(dataUrl) {
  const value = String(dataUrl ?? '');
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return '';

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);

  if (!/;base64/i.test(header)) {
    try {
      return decodeURIComponent(body);
    } catch {
      return body;
    }
  }

  return base64ToText(body);
}

/**
 * A profile's source text, whichever shape the backend sent it in.
 *
 * `sourceBase64` is what a current backend sends, for the reason at the top of this file. `source`
 * is the plain-text field an older one sends, and reading both is what keeps a half-updated install
 * working rather than showing an empty editor with no explanation.
 */
export function profileSourceText(payload) {
  if (typeof payload?.sourceBase64 === 'string') return base64ToText(payload.sourceBase64);
  return String(payload?.source ?? '');
}

/**
 * The text of a fileData payload, whichever shape it came in.
 *
 * `text` is checked first and is checked for being a string rather than for being truthy: an empty
 * file is a legitimate answer, and falling through to the data: URL for it would report the file as
 * missing rather than as empty.
 */
export function fileDataText(payload) {
  if (typeof payload?.text === 'string') return payload.text;
  return dataUrlToText(payload?.data);
}
