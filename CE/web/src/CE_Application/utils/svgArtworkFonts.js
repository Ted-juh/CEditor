/**
 * svgArtworkFonts.js — the fonts an SVG's text names, carried inside the SVG.
 *
 * A browser draws an SVG used as an image (a panel background, an image part) in isolation: it does
 * not see the page's fonts. Artwork drawn with a panel font or an imported one therefore showed its
 * text in a fallback face on the panel — measured in Chromium: "WIDE FILTER" in Allerta Stencil drew
 * 246 px of ink, the same as the fallback serif, with the font loaded on the page.
 *
 * An SVG image may carry its own fonts as `data:` URLs in an @font-face rule, and those it does use.
 * So this finds the families the artwork's text names, resolves each the way the outline code does
 * (utils/fontSources.js: the panel faces, the imported fonts, the metric twins), cuts each face down
 * to the characters the artwork uses (utils/fontSubset.js, in the font worker), and writes the faces
 * into a <style> at the top of the SVG. The artwork stays vector.
 *
 * resvg was the other candidate: render the SVG to pixels with the fonts supplied. It fixes the same
 * thing by throwing the vector away, and a panel background scales with the plug-in window.
 *
 * A family nothing resolves stays as it was and is reported, with the fix: import the font, or turn
 * the text into outlines in the drawing program.
 */
import { parseXml } from '../../../../../tools/ctrlr-import/xml.mjs';
import { fontFileBytes, resolveFont } from './fontSources.js';

function styleValue(style, property) {
  const match = String(style ?? '').match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : '';
}

/** `.cls-1 { font-family: … }` rules, by class name (Illustrator writes its fonts this way). */
function classFonts(root) {
  const fonts = new Map();
  const visit = (node) => {
    if (node.name === 'style') {
      for (const [, selectors, body] of String(node.text ?? '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const family = styleValue(body, 'font-family');
        const weight = styleValue(body, 'font-weight');
        const style = styleValue(body, 'font-style');
        for (const selector of selectors.split(',')) {
          const name = selector.trim().match(/^\.([A-Za-z0-9_-]+)$/);
          if (name) fonts.set(name[1], { family, weight, style });
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return fonts;
}

const unquote = (name) => name.trim().replace(/^['"]|['"]$/g, '');

/**
 * What the artwork's text asks for: `[{ family, candidates, weight, style, characters }]`, one per
 * family × weight × style, `candidates` being the font-family list in order.
 */
export function svgFontUsage(svgText) {
  let root;
  try {
    root = parseXml(String(svgText ?? '').replace(/^\uFEFF/, ''), { doctypeSubset: 'skip' });
  } catch {
    return [];
  }
  const classes = classFonts(root);
  const usage = new Map();
  const visit = (node, inherited) => {
    const own = { ...inherited };
    for (const name of String(node.attributes?.class ?? '').split(/\s+/)) {
      const rule = classes.get(name);
      if (rule?.family) own.family = rule.family;
      if (rule?.weight) own.weight = rule.weight;
      if (rule?.style) own.style = rule.style;
    }
    own.family = styleValue(node.attributes?.style, 'font-family') || node.attributes?.['font-family'] || own.family;
    own.weight = styleValue(node.attributes?.style, 'font-weight') || node.attributes?.['font-weight'] || own.weight;
    own.style = styleValue(node.attributes?.style, 'font-style') || node.attributes?.['font-style'] || own.style;
    if ((node.name === 'text' || node.name === 'tspan') && node.text && own.family) {
      const weight = own.weight === 'bold' ? 700 : Number(own.weight) || 400;
      const style = /italic|oblique/i.test(own.style ?? '') ? 'italic' : 'normal';
      const candidates = String(own.family).split(',').map(unquote).filter(Boolean);
      const key = `${candidates.join(',')}|${weight}|${style}`;
      if (!usage.has(key)) usage.set(key, { family: own.family, candidates, weight, style, characters: new Set() });
      for (const char of node.text) usage.get(key).characters.add(char.codePointAt(0));
    }
    for (const child of node.children ?? []) visit(child, own);
  };
  visit(root, {});
  return [...usage.values()].map((entry) => ({ ...entry, characters: [...entry.characters].filter((cp) => cp >= 0x20) }));
}

function base64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

const cssString = (text) => `"${String(text).replace(/["\\]/g, '\\$&')}"`;

/**
 * The SVG with a <style> of @font-face rules for every family its text uses that CEditor can
 * resolve. `{ svg, embedded: [family], missing: [family] }`; the SVG is unchanged when nothing needed
 * embedding. Each face is declared under every name in its font-family list, so the artwork's own
 * rule matches it whichever name comes first.
 */
export async function embedSvgFonts(svgText, { subset } = {}) {
  const usage = svgFontUsage(svgText);
  if (!usage.length) return { svg: svgText, embedded: [], missing: [] };
  const cut = subset ?? (await import('./fontWorkerClient.js')).subsetFontInWorker;
  const rules = [];
  const embedded = [];
  const missing = [];
  const generic = (name) => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(name);
  for (const entry of usage) {
    // Only generic families named: the browser's to choose, inside an image as anywhere else.
    if (entry.candidates.every(generic)) continue;
    let found = null;
    for (const candidate of entry.candidates) {
      if (generic(candidate)) continue;
      try {
        const resolved = await resolveFont(candidate, { weight: entry.weight, style: entry.style });
        const bytes = fontFileBytes(resolved);
        if (bytes) { found = { candidate, bytes }; break; }
      } catch { /* try the next name in the list */ }
    }
    if (!found) { missing.push(entry.candidates[0] ?? entry.family); continue; }
    const whole = `data:font/ttf;base64,${base64(found.bytes)}`;
    const data = await cut(whole, entry.characters);
    const format = data.startsWith('data:font/woff2') ? 'woff2' : 'truetype';
    for (const name of entry.candidates) {
      rules.push(`@font-face{font-family:${cssString(name)};font-weight:${entry.weight};font-style:${entry.style};src:url(${data}) format("${format}")}`);
    }
    embedded.push(found.candidate);
  }
  if (!rules.length) return { svg: svgText, embedded, missing };
  const open = String(svgText).match(/<svg\b[^>]*>/i);
  if (!open) return { svg: svgText, embedded: [], missing: usage.map((u) => u.family) };
  const at = open.index + open[0].length;
  // CDATA, so nothing in a family name can be read as markup.
  const svg = `${svgText.slice(0, at)}<style><![CDATA[${rules.join('')}]]></style>${svgText.slice(at)}`;
  return { svg, embedded: [...new Set(embedded)], missing: [...new Set(missing)] };
}
