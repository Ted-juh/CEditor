/**
 * Reading a file the backend sent over the bridge.
 *
 * requestFileData used to answer one way: base64, wrapped in a data: URL. That is the right shape
 * for a PNG or a font, and pure waste for text — which is what the two biggest things the app loads
 * actually are, a .cepanel and a device profile. The cost is not theoretical. A 43.6 MB panel became
 * a 58 MB base64 juce::String, concatenated again for the "data:...;base64," prefix, escaped again
 * into JSON, then copied into the WebView — about 250 MB of allocation and copying on the message
 * thread, which is the thread that answers Windows when it asks whether the window is alive. It
 * isn't, and the title bar says "(Not Responding)". On this side it then cost an atob and a
 * per-byte loop over 43.6 million bytes before a single control was drawn.
 *
 * So text now arrives as text, in a `text` field, and only bytes still take the data: URL. Both
 * shapes stay readable here because the C++ and the frontend ship separately: an older backend that
 * only sends `data` must keep working against a newer frontend, and vice versa.
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

  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
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
