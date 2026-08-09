// webFonts.js — fetch the editor's two web faces WITHOUT holding up the first paint.
//
// They used to arrive through a plain CSS `@import` at the top of dpd/dpdDesigner.css. Two things
// made that expensive out of all proportion to what it bought:
//
//   - A stylesheet `@import` is RENDER-BLOCKING. Nothing paints until it resolves, and "resolves"
//     includes failing. On a machine with no route to fonts.googleapis.com — a studio box that is
//     never online, a firewalled office, a dropped connection — the editor showed a blank window
//     for as long as the network took to give up. Measured here: 12.5 seconds to
//     ERR_CONNECTION_RESET, during which the app ran 187 ms of script and painted nothing. Every
//     local asset had finished loading after 143 ms.
//
//   - Vite hoists a CSS @import to the top of the bundle it lands in, so a stylesheet needed by ONE
//     screen (the device profile designer) gated the whole application's startup.
//
// So it is loaded from here instead, after mount, and deliberately not as a render-blocking sheet.
// `media="print"` is the trick: the browser fetches it but does not consider it relevant to the
// screen, so it never blocks painting; when it arrives the media is switched to `all` and the
// faces apply. The URL already carries `display=swap`, so text is drawn in the fallback face
// immediately and re-drawn when the real one lands.
//
// EVERY USE SITE ALREADY HAS A FALLBACK — `'Archivo', system-ui, sans-serif` and
// `'JetBrains Mono', monospace` — which is what makes this safe: with no network the editor looks
// slightly different and works perfectly, instead of not appearing.
//
// Better still would be to ship the two faces with the app and stop asking the network at all: a
// desktop plugin reaching out to a font CDN on every launch is a reliability and privacy cost for
// something that could be a file on disk. That needs the font files, which is a packaging change
// rather than a code one.

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2'
  + '?family=Archivo:wght@400;500;600;700;800'
  + '&family=JetBrains+Mono:wght@400;500;600'
  + '&display=swap';

let requested = false;

/** Start loading the web faces. Safe to call more than once; only the first call does anything. */
export function loadWebFonts(url = FONT_CSS_URL) {
  if (requested || typeof document === 'undefined') return null;
  requested = true;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // Not `all` yet — see the header. This is what keeps it off the critical path.
  link.media = 'print';
  link.href = url;
  link.crossOrigin = 'anonymous';
  const apply = () => { link.media = 'all'; };
  link.addEventListener('load', apply, { once: true });
  // A failure needs no handling beyond not applying it: the fallback faces are already in use.
  document.head.appendChild(link);
  return link;
}

/** Exposed for tests. */
export const webFontCssUrl = FONT_CSS_URL;
export const resetWebFontsForTest = () => { requested = false; };
