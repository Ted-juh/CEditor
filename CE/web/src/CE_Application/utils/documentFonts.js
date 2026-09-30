/**
 * documentFonts.js — the fonts a panel carries, so its text draws in them wherever it is opened.
 *
 * A font imported in Settings lives in the author's settings, not in the panel. The editor draws it;
 * nothing else can: the exported plug-in's player loads the bundled panel faces and nothing more,
 * and a panel shared with someone who never imported that font opens in their fallback face. Either
 * way the text silently changes shape — and a combined shape whose text is re-outlined at run time
 * could not be re-outlined at all.
 *
 * So a panel leaving the editor (packaged to share, or prepared for export — the same path,
 * stores/panelSharing.js) carries the imported faces it names, as `panel.fonts`:
 *
 *   [{ family, weight, style, unicodeRange?, data }]
 *
 * `family` is the name exactly as the document writes it: a control may name the font by the family
 * the user sees or by the CSS name the editor registered it under, and the player has no settings to
 * map one to the other, so each face is registered under the name the document asks for. `weight`
 * is a CSS descriptor ('400', or '100 900' for a variable face); `data` is the font file as a data URL.
 *
 * Wherever a panel is opened, `registerDocumentFonts` adds those faces to the page (CSS text) and
 * hands them to utils/fontSources.js (text turned into outlines). Only faces the author imported are
 * carried: the bundled panel faces ship with every build, and a system font is not the author's to
 * redistribute.
 */
import { primaryFamily, setDocumentFonts } from './fontSources.js';

const FAMILY_KEY = /(^|\.)(family|fontFamily)$/;

/** Every font name a panel document asks for: text sections, parts, state patches, anything named `family`. */
export function panelFontNames(panel) {
  const names = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (FAMILY_KEY.test(key) && value.trim()) names.add(primaryFamily(value));
      } else if (value && typeof value === 'object') {
        walk(value);
      }
    }
  };
  walk(panel?.controls ?? []);
  names.delete('');
  return [...names];
}

/** The imported font a name refers to, by the family the user sees or the CSS name it is loaded as. */
function importedFontFor(name, storedFonts) {
  const key = String(name).toLowerCase();
  return (storedFonts ?? []).filter((font) => font?.enabled !== false
    && (String(font.family ?? '').toLowerCase() === key || String(font.cssFamily ?? '').toLowerCase() === key));
}

function weightDescriptor(font) {
  const axis = font?.weightAxis;
  if (axis && Number.isFinite(Number(axis.min)) && Number.isFinite(Number(axis.max)) && Number(axis.max) > Number(axis.min)) {
    return `${Number(axis.min)} ${Number(axis.max)}`;
  }
  return String(font?.staticWeight ?? 400);
}

/**
 * The faces to carry for a panel: `{ fonts, missing }`. `readData(filePath)` resolves a font file to a
 * data URL (or null) for fonts the settings keep by path. A name no imported font answers to is not
 * the author's to carry and is skipped — unless the panel already carries it, from whoever shared it;
 * an imported font whose file cannot be read is `missing`.
 */
export async function embedPanelFonts(panel, storedFonts, readData = async () => null) {
  const fonts = [];
  const missing = [];
  const alreadyCarried = (Array.isArray(panel?.fonts) ? panel.fonts : []).filter(validFace);
  for (const name of panelFontNames(panel)) {
    const matches = importedFontFor(name, storedFonts);
    if (!matches.length) {
      // A panel that arrived carrying a font this user never imported passes it on unchanged.
      fonts.push(...alreadyCarried.filter((face) => face.family.toLowerCase() === name.toLowerCase()));
      continue;
    }
    let carried = 0;
    for (const font of matches) {
      if (Array.isArray(font.cachedFaces) && font.cachedFaces.length) {
        for (const face of font.cachedFaces) {
          if (!face?.dataUrl) continue;
          fonts.push({
            family: name,
            weight: String(face.weight ?? '400'),
            style: face.style === 'italic' ? 'italic' : 'normal',
            ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
            data: face.dataUrl,
          });
          carried += 1;
        }
        continue;
      }
      const data = font.localDataUrl || (font.filePath ? await readData(font.filePath) : null);
      if (!data) continue;
      fonts.push({ family: name, weight: weightDescriptor(font), style: font.fontStyle === 'italic' ? 'italic' : 'normal', data });
      carried += 1;
    }
    if (!carried) missing.push(name);
  }
  return { fonts, missing };
}

/** A panel with the faces it names carried in it (a copy; `fonts` replaced). */
export async function withEmbeddedFonts(panel, storedFonts, readData) {
  const { fonts, missing } = await embedPanelFonts(panel, storedFonts, readData);
  const next = { ...panel };
  if (fonts.length) next.fonts = fonts;
  else delete next.fonts;
  return { panel: next, missing };
}

// --- Opening a panel that carries fonts ------------------------------------------------------------

const registered = new Set();
const faceKey = (face) => `${face.family}|${face.weight}|${face.style}|${face.unicodeRange ?? ''}|${String(face.data).length}`;

function validFace(face) {
  return face && typeof face.family === 'string' && face.family.trim()
    && typeof face.data === 'string' && face.data.startsWith('data:');
}

/**
 * Make a document's carried faces available: to CSS (FontFace, once per face) and to the outline
 * code. `fonts` is every carried face of every open document; the outline code's list is replaced
 * with it, so a closed panel's faces stop answering for outlines.
 */
export async function registerDocumentFonts(fonts) {
  const faces = (Array.isArray(fonts) ? fonts : []).filter(validFace);
  setDocumentFonts(faces);
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  for (const face of faces) {
    const key = faceKey(face);
    if (registered.has(key)) continue;
    registered.add(key);
    try {
      const descriptors = { weight: face.weight || '400', style: face.style || 'normal' };
      if (face.unicodeRange) descriptors.unicodeRange = face.unicodeRange;
      const loaded = await new FontFace(face.family, `url(${face.data})`, descriptors).load();
      document.fonts.add(loaded);
    } catch (error) {
      registered.delete(key);
      console.warn(`[documentFonts] ${face.family} could not be loaded`, error);
    }
  }
}
