/**
 * domPicture.js — a part of the page as a picture, drawn by the page's own renderer.
 *
 * WHY THIS WAY. A panel is drawn by the browser from markup and CSS: CanvasControl, BackgroundRenderer,
 * the effects, the text. A second renderer that redrew it on a canvas would be a second
 * implementation of all of that, free to disagree with the first, and it would disagree first and
 * worst on text — the reason SceneryGround freezes markup rather than rasterising it. So the picture
 * is the same markup, handed back to the same renderer: copied into an SVG `<foreignObject>`, which
 * Chromium (and so WebView2) draws exactly as it draws the page, and the SVG drawn onto a canvas at
 * the scale asked for. Text comes out as text, re-rendered at that scale, not a screenshot enlarged.
 *
 * WHAT HAS TO TRAVEL WITH IT. An SVG drawn as an image is a document of its own: it loads nothing
 * from anywhere and sees nothing of the page. Everything the copy needs is therefore put inside it —
 *
 *   - the CSS rules that apply to the copied elements (the page's stylesheets, filtered to what
 *     matches, so the picture does not carry the whole editor's CSS);
 *   - every image, background and mask the copy names, as a data URL;
 *   - the @font-face rules of the families it uses, their files as data URLs: an image document
 *     cannot see the faces the page registered (partsToSvg.js says the same about its own images);
 *   - the inherited context the copy loses by being lifted out of the page: font, colour and the
 *     custom properties its ancestors set;
 *   - SVG definitions (filters, masks, gradients) it refers to by `url(#id)` but that live
 *     elsewhere in the page;
 *   - live state that is not in the markup: a canvas's pixels, a field's value.
 *
 * Only as a `data:` URL: Chromium marks a canvas that drew an SVG with a foreignObject from a `blob:`
 * URL as tainted, and a tainted canvas cannot be read back (measured in Chromium; it is the case
 * the browser check `pictureExport` runs).
 *
 * WHAT IT CANNOT KEEP. A CSS animation restarts at its first frame in the copy; a scrolled list
 * shows its top. Neither is part of a design at rest.
 */

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

/** Properties that inherit, copied from the copy's parent so the copy starts where it was. */
const INHERITED = [
  'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant',
  'font-kerning', 'font-feature-settings', 'font-variation-settings', 'font-optical-sizing',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent', 'text-transform',
  'text-shadow', 'text-rendering', 'white-space', 'word-break', 'overflow-wrap', 'hyphens', 'tab-size',
  'direction', 'writing-mode', 'visibility', 'quotes', 'list-style-type', 'caret-color',
  '-webkit-font-smoothing', 'font-synthesis', 'paint-order', 'fill', 'stroke', 'stroke-width',
];

/** Pseudo-classes a static picture never shows, removed from a selector before it is matched. */
const DYNAMIC_PSEUDO = /:(hover|active|focus-visible|focus-within|focus|visited|target|checked|indeterminate|placeholder-shown|autofill|-webkit-autofill)\b/g;
/** Pseudo-elements: what they style hangs off the element the rest of the selector names. */
const PSEUDO_ELEMENT = /::?(before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button|-webkit-[a-z-]+|-moz-[a-z-]+)\b(\([^)]*\))?/g;

const URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/** The family names a computed `font-family` lists, unquoted, lower case. */
export function fontFamilies(value) {
  return String(value ?? '')
    .split(',')
    .map((name) => name.trim().replace(/^(['"])(.*)\1$/, '$2').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The selector with what a picture cannot be in removed, so it can be matched against the elements
 * that are there: `.knob:hover::after` matches the knobs, and is then kept whole (the rule itself
 * decides, in the picture, whether it applies — a hover never does).
 */
export function staticSelector(selector) {
  const stripped = String(selector ?? '')
    .replace(PSEUDO_ELEMENT, '')
    .replace(DYNAMIC_PSEUDO, '')
    .replace(/:not\(\s*\)/g, '')
    .trim();
  // `.a > ::before` leaves a dangling combinator, and a bare `:hover` leaves nothing.
  const cleaned = stripped.replace(/[>+~]\s*$/, '').trim();
  return cleaned || '*';
}

/** The class names the subject (last compound) of a selector requires: a fast way to rule it out. */
export function subjectClasses(selector) {
  const parts = String(selector ?? '').split(/[\s>+~]+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  // Classes inside :not(), :is() or :where() are not requirements of the subject.
  const plain = last.replace(/:(not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
  return [...plain.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((match) => match[1]);
}

/** Every `url(...)` in CSS text that names a file (not `#id`, and not already data). */
export function cssUrls(text) {
  const found = [];
  for (const match of String(text ?? '').matchAll(URL_PATTERN)) {
    const url = match[2].trim();
    if (!url || url.startsWith('#') || url.startsWith('data:')) continue;
    found.push(url);
  }
  return found;
}

/** CSS text with each url() that `map` knows replaced by what it maps to. */
export function replaceCssUrls(text, map) {
  return String(text ?? '').replace(URL_PATTERN, (whole, quote, url) => {
    const replaced = map.get(url.trim());
    return replaced ? `url("${replaced}")` : whole;
  });
}

/** Every `#id` a piece of SVG or CSS refers to: `url(#id)`, and `href="#id"`. */
export function referencedIds(text) {
  const ids = new Set();
  for (const match of String(text ?? '').matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g)) ids.add(match[1]);
  return ids;
}

function absoluteUrl(url, base) {
  try { return new URL(url, base || document.baseURI).href; } catch { return url; }
}

/** A URL's contents as a data URL, once per URL. */
function makeInliner(fetchImpl = (url) => fetch(url)) {
  const cache = new Map();
  const missing = new Set();
  async function toDataUrl(url) {
    if (!url || url.startsWith('data:')) return url;
    if (cache.has(url)) return cache.get(url);
    const job = (async () => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        missing.add(url);
        return null;
      }
    })();
    cache.set(url, job);
    return job;
  }
  return { toDataUrl, missing };
}

async function inlineCssText(text, base, inliner) {
  const urls = [...new Set(cssUrls(text))];
  if (!urls.length) return text;
  const map = new Map();
  await Promise.all(urls.map(async (url) => {
    const data = await inliner.toDataUrl(absoluteUrl(url, base));
    if (data) map.set(url, data);
  }));
  return replaceCssUrls(text, map);
}

// --- The copy ------------------------------------------------------------------------------------

function copyFormState(live, copy) {
  const tag = live.localName;
  if (tag === 'input') {
    if (live.type === 'checkbox' || live.type === 'radio') {
      if (live.checked) copy.setAttribute('checked', ''); else copy.removeAttribute('checked');
    } else {
      copy.setAttribute('value', live.value ?? '');
    }
  } else if (tag === 'textarea') {
    copy.textContent = live.value ?? '';
  } else if (tag === 'select') {
    [...copy.options].forEach((option, i) => {
      if (live.options[i]?.selected) option.setAttribute('selected', ''); else option.removeAttribute('selected');
    });
  }
}

function canvasAsImage(live, report) {
  const img = document.createElement('img');
  for (const name of ['class', 'style', 'width', 'height']) {
    const value = live.getAttribute(name);
    if (value != null) img.setAttribute(name, value);
  }
  // A canvas sized only by its attributes keeps that size as an image; one sized by CSS keeps the CSS.
  if (!img.style.width) img.style.width = `${live.offsetWidth || live.width}px`;
  if (!img.style.height) img.style.height = `${live.offsetHeight || live.height}px`;
  try {
    img.setAttribute('src', live.toDataURL('image/png'));
  } catch {
    report.unreadable.push('a canvas whose pixels the page may not read');
  }
  return img;
}

/**
 * The element's subtree, copied: what `skip` names left out, canvases as images, form values in
 * the markup. Returns the copy and the pairs (live, copy) for the later passes.
 */
function copyTree(live, skip, pairs, report, adjust = null) {
  if (live.nodeType === 3) return document.createTextNode(live.nodeValue ?? '');
  if (live.nodeType !== 1) return null;
  if (skip?.(live)) return null;
  const tag = live.localName;
  if (tag === 'script' || tag === 'iframe' || tag === 'noscript' || tag === 'template') return null;
  if (tag === 'canvas') {
    const img = canvasAsImage(live, report);
    pairs.push([live, img]);
    return img;
  }
  const copy = live.cloneNode(false);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') copyFormState(live, copy);
  adjust?.(copy, live);
  pairs.push([live, copy]);
  for (const child of live.childNodes) {
    const childCopy = copyTree(child, skip, pairs, report, adjust);
    if (childCopy) copy.appendChild(childCopy);
  }
  if (tag === 'select') copyFormState(live, copy);
  return copy;
}

async function inlineElementUrls(pairs, inliner) {
  const jobs = [];
  for (const [live, copy] of pairs) {
    const tag = copy.localName;
    if (tag === 'img') {
      const src = live.currentSrc || live.getAttribute?.('src') || copy.getAttribute('src');
      copy.removeAttribute('srcset');
      copy.removeAttribute('loading');
      if (src && !src.startsWith('data:')) {
        jobs.push(inliner.toDataUrl(absoluteUrl(src)).then((data) => { if (data) copy.setAttribute('src', data); }));
      }
    } else if (tag === 'image' && copy.namespaceURI === SVG_NS) {
      const href = copy.getAttribute('href') ?? copy.getAttributeNS(XLINK, 'href');
      if (href && !href.startsWith('data:') && !href.startsWith('#')) {
        jobs.push(inliner.toDataUrl(absoluteUrl(href)).then((data) => {
          if (!data) return;
          copy.setAttribute('href', data);
          if (copy.hasAttributeNS(XLINK, 'href')) copy.setAttributeNS(XLINK, 'xlink:href', data);
        }));
      }
    }
    const style = copy.getAttribute?.('style');
    if (style && style.includes('url(')) {
      jobs.push(inlineCssText(style, document.baseURI, inliner).then((text) => copy.setAttribute('style', text)));
    }
  }
  await Promise.all(jobs);
}

// --- The CSS -------------------------------------------------------------------------------------

function classesIn(pairs) {
  const set = new Set();
  for (const [, copy] of pairs) {
    const list = copy.classList;
    if (list) for (const name of list) set.add(name);
  }
  return set;
}

function makeMatcher(root, classes) {
  const memo = new Map();
  return (selectorText) => {
    if (memo.has(selectorText)) return memo.get(selectorText);
    let result = false;
    for (const selector of splitSelectorList(selectorText)) {
      const required = subjectClasses(selector);
      if (required.some((name) => !classes.has(name))) continue;
      const test = staticSelector(selector);
      try {
        if (root.matches(test) || root.querySelector(test)) { result = true; break; }
      } catch {
        // A selector this engine cannot parse once stripped: keep the rule rather than guess.
        result = true;
        break;
      }
    }
    memo.set(selectorText, result);
    return result;
  };
}

/** A selector list split at its top-level commas (not those inside :is(a, b)). */
export function splitSelectorList(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  const source = String(text ?? '');
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) { out.push(source.slice(start, i).trim()); start = i + 1; }
  }
  out.push(source.slice(start).trim());
  return out.filter(Boolean);
}

const RULE = { STYLE: 1, IMPORT: 3, MEDIA: 4, FONT_FACE: 5, KEYFRAMES: 7, SUPPORTS: 12 };

function collectRules(rules, base, keep, out) {
  for (const rule of rules) {
    switch (rule.type) {
      case RULE.STYLE:
        if (keep.style(rule.selectorText)) out.push({ text: rule.cssText, base });
        break;
      case RULE.FONT_FACE: {
        const families = fontFamilies(rule.style.getPropertyValue('font-family'));
        if (families.some((name) => keep.families.has(name))) out.push({ text: rule.cssText, base });
        break;
      }
      case RULE.KEYFRAMES:
        if (keep.animations.has(rule.name)) out.push({ text: rule.cssText, base });
        break;
      case RULE.MEDIA: {
        const condition = rule.conditionText ?? rule.media?.mediaText ?? '';
        let applies = true;
        try { applies = !condition || window.matchMedia(condition).matches; } catch { applies = true; }
        if (applies) collectRules(rule.cssRules, base, keep, out);
        break;
      }
      case RULE.SUPPORTS: {
        let applies = true;
        try { applies = CSS.supports(rule.conditionText); } catch { applies = true; }
        if (applies) collectRules(rule.cssRules, base, keep, out);
        break;
      }
      case RULE.IMPORT:
        try { if (rule.styleSheet) collectRules(rule.styleSheet.cssRules, rule.styleSheet.href ?? base, keep, out); } catch { /* cross-origin */ }
        break;
      default:
        // @layer, @container, @property and the rest: kept whole, as the page has them.
        if (rule.cssRules && typeof rule.cssText === 'string' && /^@(layer|container)/.test(rule.cssText)) {
          out.push({ text: rule.cssText, base });
        } else if (typeof rule.cssText === 'string' && /^@property/.test(rule.cssText)) {
          out.push({ text: rule.cssText, base });
        }
    }
  }
}

function usedFamiliesAndAnimations(pairs) {
  const families = new Set();
  const animations = new Set();
  for (const [live] of pairs) {
    const style = getComputedStyle(live);
    for (const name of fontFamilies(style.fontFamily)) families.add(name);
    const animation = style.animationName;
    if (animation && animation !== 'none') {
      for (const name of animation.split(',')) animations.add(name.trim());
    }
    // A pseudo-element can have a font and an animation of its own.
    for (const pseudo of ['::before', '::after']) {
      const p = getComputedStyle(live, pseudo);
      if (p.content && p.content !== 'none' && p.content !== 'normal') {
        for (const name of fontFamilies(p.fontFamily)) families.add(name);
      }
    }
  }
  return { families, animations };
}

async function pageCss(root, pairs, inliner) {
  const classes = classesIn(pairs);
  const { families, animations } = usedFamiliesAndAnimations(pairs);
  const keep = { style: makeMatcher(root, classes), families, animations };
  const collected = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    if (!rules) continue;
    collectRules(rules, sheet.href ?? document.baseURI, keep, collected);
  }
  const texts = await Promise.all(collected.map(({ text, base }) => inlineCssText(text, base, inliner)));
  return texts.join('\n');
}

// --- Context and references ------------------------------------------------------------------------

function inheritedContext(live) {
  const parent = live.parentElement;
  if (!parent) return '';
  const style = getComputedStyle(parent);
  const parts = [];
  for (const name of INHERITED) {
    const value = style.getPropertyValue(name);
    if (value) parts.push(`${name}:${value}`);
  }
  for (let i = 0; i < style.length; i += 1) {
    const name = style[i];
    if (name.startsWith('--')) parts.push(`${name}:${style.getPropertyValue(name)}`);
  }
  return parts.join(';');
}

/** The SVG definitions the copy refers to and does not contain, copied in (and theirs, in turn). */
function missingDefinitions(copyRoot, css, pairs, report) {
  const have = (id) => {
    try { return !!copyRoot.querySelector(`#${CSS.escape(id)}`); } catch { return false; }
  };
  const wanted = new Set(referencedIds(css));
  const scan = (text) => { for (const id of referencedIds(text)) wanted.add(id); };
  for (const [, copy] of pairs) {
    if (!copy.attributes) continue;
    for (const attribute of copy.attributes) {
      if (attribute.value.includes('url(#')) scan(attribute.value);
      if ((attribute.name === 'href' || attribute.name === 'xlink:href') && attribute.value.startsWith('#')) {
        wanted.add(attribute.value.slice(1));
      }
    }
  }
  const added = [];
  const seen = new Set();
  const queue = [...wanted];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    if (have(id)) continue;
    const source = document.getElementById(id);
    if (!source) { report.unresolved.push(`#${id}`); continue; }
    const innerPairs = [];
    const copy = copyTree(source, null, innerPairs, report);
    if (!copy) continue;
    added.push(copy);
    pairs.push(...innerPairs);
    for (const [, inner] of innerPairs) {
      if (!inner.attributes) continue;
      for (const attribute of inner.attributes) {
        for (const ref of referencedIds(attribute.value)) queue.push(ref);
        if ((attribute.name === 'href' || attribute.name === 'xlink:href') && attribute.value.startsWith('#')) queue.push(attribute.value.slice(1));
      }
    }
  }
  if (!added.length) return null;
  const holder = document.createElementNS(SVG_NS, 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  const defs = document.createElementNS(SVG_NS, 'defs');
  for (const node of added) defs.appendChild(node);
  holder.appendChild(defs);
  return holder;
}

// --- The picture ---------------------------------------------------------------------------------

/**
 * The SVG document for `element`: its subtree, the CSS, fonts and images it needs, with the region
 * `{ x, y, width, height }` (in the element's own CSS pixels) as the picture, `scale` times as many
 * device pixels across.
 *
 * Options:
 *   region      the part of the element to show (default: all of it, by its offset size)
 *   scale       device pixels per CSS pixel
 *   skip        (liveElement) => true to leave an element and its subtree out
 *   adjust      (copy, liveElement) => void, to change a copied element (its classes, say)
 *   rootStyle   CSS appended to the copy's own style (where the page has it scaled or framed)
 *   fetch       how files are read (tests)
 *
 * Resolves to { svg, width, height, missing, unreadable, unresolved }.
 */
export async function svgOfElement(element, options = {}) {
  const report = { unreadable: [], unresolved: [] };
  const inliner = makeInliner(options.fetch);
  const width = options.region?.width ?? element.offsetWidth;
  const height = options.region?.height ?? element.offsetHeight;
  const x = options.region?.x ?? 0;
  const y = options.region?.y ?? 0;
  const scale = Math.max(0.05, Number(options.scale) || 1);

  const pairs = [];
  const copy = copyTree(element, (node) => node !== element && !!options.skip?.(node), pairs, report, options.adjust ?? null);
  if (options.rootStyle) copy.setAttribute('style', `${copy.getAttribute('style') ?? ''};${options.rootStyle}`);

  const css = await pageCss(element, pairs, inliner);
  await inlineElementUrls(pairs, inliner);
  const defs = missingDefinitions(copy, css, pairs, report);
  if (defs) await inlineElementUrls(pairs, inliner);

  const wrapper = document.createElementNS(XHTML, 'div');
  // The copy's own box decides its size; the wrapper only carries what the page around it gave it.
  wrapper.setAttribute('style', `${inheritedContext(element)};position:relative;margin:0;padding:0;`
    + `width:${element.offsetWidth}px;height:${element.offsetHeight}px;overflow:hidden`);
  const styleNode = document.createElementNS(XHTML, 'style');
  styleNode.textContent = css;
  wrapper.appendChild(styleNode);
  if (defs) wrapper.appendChild(defs);
  wrapper.appendChild(copy);

  const body = new XMLSerializer().serializeToString(wrapper);
  const fullWidth = Math.max(element.offsetWidth, x + width);
  const fullHeight = Math.max(element.offsetHeight, y + height);
  const svg = `<svg xmlns="${SVG_NS}" width="${round(width * scale)}" height="${round(height * scale)}" `
    + `viewBox="${x} ${y} ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${fullWidth}" height="${fullHeight}">${body}</foreignObject></svg>`;
  return {
    svg, width, height, scale,
    missing: [...inliner.missing],
    unreadable: report.unreadable,
    unresolved: report.unresolved,
  };
}

const round = (value) => Math.max(1, Math.round(value));

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The picture could not be drawn.'));
    image.src = src;
  });
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * `element` drawn onto a canvas: svgOfElement, then drawn at its scale. `background` (a CSS colour)
 * is painted underneath; without it, what the element leaves uncovered stays transparent.
 *
 * Resolves to { canvas, width, height, missing, unreadable, unresolved }, the canvas `scale` times
 * the region in each direction.
 */
export async function pictureOfElement(element, options = {}) {
  const result = await svgOfElement(element, options);
  const pixelWidth = round(result.width * result.scale);
  const pixelHeight = round(result.height * result.scale);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`);
  // An image document loads its embedded fonts as it is drawn; the first draw can land before
  // they have. Drawing once and waiting a frame lets them arrive; the second draw is the picture.
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  await nextFrame();
  await nextFrame();
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  }
  ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  return { ...result, canvas, pixelWidth, pixelHeight };
}

/** A canvas's pixels as PNG bytes. */
export function canvasPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('The picture is too large to write.')); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}
