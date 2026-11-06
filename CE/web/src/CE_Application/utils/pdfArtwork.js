// pdfArtwork.js — a PDF, or an Illustrator file saved with PDF compatibility (Illustrator's default,
// "Create PDF Compatible File"), as the SVG text the artwork importers read (utils/svgPanelImport.js,
// utils/svgComponentImport.js), so a panel, Update Panel and a component come in from it as from an SVG.
//
// pdf.js (Mozilla, Apache 2.0) parses the file into a list of drawing operations; operatorsToSvg turns
// them into SVG elements in the page's own units (a point is a pixel, as Illustrator's SVG export has
// it), y down. What becomes what:
//   - Each top-level Illustrator layer is a PDF layer (an optional content group) marked round its
//     content on the page: a <g> named after it (id and data-name, which objectName reads). A layer
//     switched off in the file is display:none, with data-ceditor-hidden for the component import.
//     Sublayers and object names are not in the PDF part (Illustrator keeps them in its own private
//     data, which is not read), so a moving part is named as a top-level layer.
//   - Paths with their fill, stroke, width, caps, joins, dashes and fill rule; the current transform
//     applied to their points.
//   - A shading painted inside a clip (how Illustrator writes a gradient fill: the shape as a clip, then
//     the gradient) becomes that shape filled with the gradient; a shading pattern as a fill likewise.
//     Linear and radial; their colour stops as pdf.js samples them.
//   - Other clips: clip paths round what they clip. Opacity and blend modes; a transparency group as a
//     <g> with its opacity and mode.
//   - Images: <image> with the pixels as a PNG.
//   - Text: <text> runs in the font the file names, its size and colour.
// What it cannot carry is listed in `notes` (a mesh gradient becomes its mean colour; an opacity mask
// and a tiling pattern are dropped), for the import to say.

import { pngDataUrl } from './pngEncode.js';

/** The file types it reads, for a file dialog. */
export const PDF_ARTWORK_EXTENSIONS = ['.pdf', '.ai'];

/**
 * What a file is, from its bytes: 'pdf' (a PDF, or an Illustrator file with a PDF part), 'ai' (an
 * Illustrator file with only Illustrator's own format, saved without PDF compatibility), or ''.
 */
export function artworkFileKind(bytes) {
  const head = latin1(bytes, 0, Math.min(bytes?.length ?? 0, 1024));
  if (head.includes('%PDF-')) return 'pdf';
  if (/^%!PS-Adobe/.test(head) && /%%Creator:\s*Adobe Illustrator/i.test(head)) return 'ai';
  return '';
}

const AI_WITHOUT_PDF = 'This Illustrator file was saved without PDF compatibility, so its artwork is only in '
  + 'Illustrator\'s own format, which CEditor cannot read. In Illustrator, choose File › Save As, tick '
  + 'Create PDF Compatible File, and open it again; or use File › Export As › SVG.';

/**
 * Reads page `page` (1-based) of a PDF or a PDF-compatible Illustrator file as SVG text.
 * `{ ok, svg, pages, page, width, height, layers: [{ name, visible }], notes: [{ kind, count }],
 * creator, illustrator }`, or `{ ok: false, reason, error }`. `pdfjs`: the library, for Node (its
 * legacy build); in a browser it is loaded when first needed.
 */
export async function readPdfArtwork(bytes, { page = 1, pdfjs = null, password = '' } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const kind = artworkFileKind(data);
  if (kind === 'ai') return { ok: false, reason: 'ai-without-pdf', error: AI_WITHOUT_PDF };
  if (kind !== 'pdf') return { ok: false, reason: 'not-pdf', error: 'This file is not a PDF or an Illustrator file.' };
  const lib = pdfjs ?? await loadPdfjs();
  let doc;
  try {
    // A copy: pdf.js takes the buffer over.
    doc = await lib.getDocument({
      data: data.slice(), password, isEvalSupported: false, isOffscreenCanvasSupported: false,
      fontExtraProperties: true, disableFontFace: true, verbosity: 0,
    }).promise;
  } catch (error) {
    if (error?.name === 'PasswordException') return { ok: false, reason: 'password', error: 'This PDF is protected by a password.' };
    return { ok: false, reason: 'unreadable', error: `This PDF could not be read: ${error?.message ?? error}` };
  }
  try {
    const pages = doc.numPages;
    const number = Math.min(Math.max(1, Math.round(page)), pages);
    const pdfPage = await doc.getPage(number);
    const ops = await pdfPage.getOperatorList();
    const config = await doc.getOptionalContentConfig();
    const layers = new Map();
    for (const [id, group] of config) layers.set(id, { name: String(group?.name ?? '').trim(), visible: group?.visible !== false });
    const info = (await doc.getMetadata().catch(() => null))?.info ?? {};
    const creator = String(info.Creator ?? '');
    const out = operatorsToSvg({
      fnArray: ops.fnArray, argsArray: ops.argsArray, OPS: lib.OPS,
      objs: pdfPage.objs, commonObjs: pdfPage.commonObjs, view: pdfPage.view, layers,
    });
    if (pdfPage.rotate) out.notes.push({ kind: 'rotated', count: 1 });
    return { ok: true, ...out, pages, page: number, creator, illustrator: /illustrator/i.test(creator) };
  } finally {
    doc.destroy?.();
  }
}

let loading = null;
/** pdf.js for a browser, its worker run on the page itself (no worker file to serve: the editor runs from disk). */
function loadPdfjs() {
  loading ??= (async () => {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    await import('pdfjs-dist/build/pdf.worker.mjs');
    return pdfjs;
  })();
  return loading;
}

// --- The operations, as SVG ------------------------------------------------------------------------

const IDENTITY = [1, 0, 0, 1, 0, 0];
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const num = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
const matrixText = (m) => `matrix(${m.map(num).join(' ')})`;
const escapeXml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // Characters XML 1.0 does not allow.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const BLEND = new Set(['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
  'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);

function initialState() {
  return {
    ctm: IDENTITY, base: IDENTITY,
    fill: { kind: 'colour', value: '#000000' }, stroke: { kind: 'colour', value: '#000000' },
    fillAlpha: 1, strokeAlpha: 1, blend: 'normal', softMask: false,
    lineWidth: 1, cap: 0, join: 0, miter: 10, dash: null,
    clips: [],
    font: null, fontSize: 0, charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0, renderMode: 0,
  };
}

/**
 * pdf.js's operator list for a page as SVG text. `fnArray`/`argsArray`: the operator list; `OPS`:
 * pdf.js's operator numbers; `objs`/`commonObjs`: the page's resolved objects (`get(id)`); `view`: the
 * page box [x0, y0, x1, y1]; `layers`: optional content group id → { name, visible }.
 * `{ svg, width, height, layers: [{ name, visible }], notes: [{ kind, count }] }`.
 */
export function operatorsToSvg({ fnArray, argsArray, OPS, objs, commonObjs, view, layers = new Map() }) {
  const [x0, y0, x1, y1] = view ?? [0, 0, 612, 792];
  const width = x1 - x0;
  const height = y1 - y0;
  // PDF space (y up) to the SVG's (y down, from the page's top left).
  const flip = [1, 0, 0, -1, -x0, y1];
  const op = Object.fromEntries(Object.entries(OPS).map(([name, code]) => [code, name]));
  const defs = [];
  const body = [];
  const noted = new Map();
  const note = (kind) => noted.set(kind, (noted.get(kind) ?? 0) + 1);
  const seenLayers = [];
  let ids = 0;
  const nextId = (prefix) => `${prefix}${++ids}`;
  const get = (id) => {
    try { return (String(id).startsWith('g_') ? commonObjs : objs)?.get(id) ?? null; } catch { return null; }
  };

  let state = initialState();
  const stack = [];
  // Groups that structure the drawing (a layer, a transparency group), and the clip groups open inside
  // the innermost of them; the clip groups are closed at every structural boundary and opened again
  // round what they clip.
  const structure = [];
  let openClips = [];
  const closeClips = () => {
    for (let i = 0; i < openClips.length; i += 1) body.push('</g>');
    openClips = [];
  };
  const emit = (element, clips = state.clips) => {
    let same = 0;
    while (same < openClips.length && same < clips.length && openClips[same] === clips[same]) same += 1;
    for (let i = same; i < openClips.length; i += 1) body.push('</g>');
    openClips = openClips.slice(0, same);
    for (let i = same; i < clips.length; i += 1) {
      body.push(`<g clip-path="url(#${clips[i].id})">`);
      openClips.push(clips[i]);
    }
    body.push(element);
  };

  // The path being built, in the SVG's coordinates, and what clip is pending for it.
  let pendingClip = null;
  const pathSegments = (data) => {
    const m = multiply(flip, state.ctm);
    const segments = [];
    for (let i = 0; i < data.length;) {
      const code = data[i];
      if (code === 0 || code === 1) {
        segments.push({ c: code === 0 ? 'M' : 'L', p: apply(m, data[i + 1], data[i + 2]) });
        i += 3;
      } else if (code === 2) {
        segments.push({ c: 'C', p: [...apply(m, data[i + 1], data[i + 2]), ...apply(m, data[i + 3], data[i + 4]), ...apply(m, data[i + 5], data[i + 6])] });
        i += 7;
      } else if (code === 3) {
        segments.push({ c: 'Q', p: [...apply(m, data[i + 1], data[i + 2]), ...apply(m, data[i + 3], data[i + 4])] });
        i += 5;
      } else if (code === 4) {
        segments.push({ c: 'Z', p: [] });
        i += 1;
      } else {
        break;
      }
    }
    return segments;
  };

  const blendStyle = () => (BLEND.has(state.blend) ? ` style="mix-blend-mode:${state.blend}"` : '');

  /** A gradient for a shading's IR, its coordinates mapped by `matrix` (shading space to the SVG's). */
  const gradient = (ir, matrix) => {
    if (!Array.isArray(ir)) return null;
    if (ir[0] === 'RadialAxial') {
      const [, type, , stops, p0, p1, r0, r1] = ir;
      const id = nextId('g');
      // pdf.js ends a gradient that does not extend with clear stops: the next colour, at no opacity.
      const list = stops ?? [];
      const stopText = list.map(([offset, colour], i) => {
        if (colour !== 'transparent') return `<stop offset="${num(offset)}" stop-color="${colour}"/>`;
        const near = list[i + 1]?.[1] !== 'transparent' && list[i + 1] ? list[i + 1][1] : list[i - 1]?.[1] ?? '#000000';
        return `<stop offset="${num(offset)}" stop-color="${near === 'transparent' ? '#000000' : near}" stop-opacity="0"/>`;
      }).join('');
      const transform = `gradientUnits="userSpaceOnUse" gradientTransform="${matrixText(matrix)}"`;
      if (type === 'radial') {
        defs.push(`<radialGradient id="${id}" ${transform} cx="${num(p1[0])}" cy="${num(p1[1])}" r="${num(r1)}" fx="${num(p0[0])}" fy="${num(p0[1])}" fr="${num(r0 ?? 0)}">${stopText}</radialGradient>`);
      } else {
        defs.push(`<linearGradient id="${id}" ${transform} x1="${num(p0[0])}" y1="${num(p0[1])}" x2="${num(p1[0])}" y2="${num(p1[1])}">${stopText}</linearGradient>`);
      }
      return `url(#${id})`;
    }
    if (ir[0] === 'Mesh') {
      note('mesh-gradient');
      return meanMeshColour(ir);
    }
    return null;
  };

  const paint = (paint, alpha, kind) => {
    if (paint.kind === 'colour') return { value: paint.value, alpha };
    if (paint.kind === 'shading') {
      const value = gradient(get(paint.id), multiply(flip, multiply(paint.base, paint.matrix ?? IDENTITY)));
      return value ? { value, alpha } : { value: '#808080', alpha };
    }
    note(kind === 'fill' ? 'pattern-fill' : 'pattern-stroke');
    return { value: paint.value ?? '#808080', alpha };
  };

  const strokeAttributes = () => {
    const scale = scaleOf(state.ctm);
    const out = [` stroke-width="${num(state.lineWidth * scale || scale * 0.5)}"`];
    if (state.cap === 1) out.push(' stroke-linecap="round"');
    else if (state.cap === 2) out.push(' stroke-linecap="square"');
    if (state.join === 1) out.push(' stroke-linejoin="round"');
    else if (state.join === 2) out.push(' stroke-linejoin="bevel"');
    else if (state.miter !== 4) out.push(` stroke-miterlimit="${num(state.miter)}"`);
    if (state.dash?.[0]?.length) {
      out.push(` stroke-dasharray="${state.dash[0].map((d) => num(d * scale)).join(' ')}"`);
      if (state.dash[1]) out.push(` stroke-dashoffset="${num(state.dash[1] * scale)}"`);
    }
    return out.join('');
  };

  const drawPath = (segments, { fill = false, stroke = false, evenOdd = false } = {}) => {
    if (!segments?.length || (!fill && !stroke)) return;
    if (state.softMask) note('opacity-mask');
    let attributes = '';
    if (fill) {
      const f = paint(state.fill, state.fillAlpha, 'fill');
      attributes += ` fill="${f.value}"`;
      if (f.alpha < 1) attributes += ` fill-opacity="${num(f.alpha)}"`;
      if (evenOdd) attributes += ' fill-rule="evenodd"';
    } else {
      attributes += ' fill="none"';
    }
    if (stroke) {
      const s = paint(state.stroke, state.strokeAlpha, 'stroke');
      attributes += ` stroke="${s.value}"${s.alpha < 1 ? ` stroke-opacity="${num(s.alpha)}"` : ''}${strokeAttributes()}`;
    }
    emit(`${shapeElement(segments)}${attributes}${blendStyle()}/>`);
  };

  const PAINT = {
    stroke: { stroke: true }, closeStroke: { stroke: true, close: true },
    fill: { fill: true }, eoFill: { fill: true, evenOdd: true },
    fillStroke: { fill: true, stroke: true }, eoFillStroke: { fill: true, stroke: true, evenOdd: true },
    closeFillStroke: { fill: true, stroke: true, close: true }, closeEOFillStroke: { fill: true, stroke: true, evenOdd: true, close: true },
    endPath: {},
  };

  const constructPath = (args) => {
    const [paintOp, paths] = args ?? [];
    const data = Array.isArray(paths) ? paths[0] : paths;
    const segments = data ? pathSegments(data) : [];
    const how = PAINT[op[paintOp]] ?? {};
    if (how.close && segments.length && segments[segments.length - 1].c !== 'Z') segments.push({ c: 'Z', p: [] });
    if (pendingClip) {
      if (segments.length) {
        const id = nextId('c');
        const evenOdd = pendingClip === 'evenodd';
        defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${segmentsText(segments)}"${evenOdd ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
        // Painted with what it had before; clips the rest.
        drawPath(segments, how);
        state.clips = [...state.clips, { id, segments, evenOdd }];
      }
      pendingClip = null;
      return;
    }
    drawPath(segments, how);
  };

  const shadingFill = (id) => {
    const ir = get(id);
    const matrix = multiply(flip, state.ctm);
    const value = gradient(ir, matrix) ?? '#808080';
    const alpha = state.fillAlpha < 1 ? ` fill-opacity="${num(state.fillAlpha)}"` : '';
    // Painted inside the innermost clip: the clip's shape, filled with it (Illustrator's gradient fill).
    const inner = state.clips[state.clips.length - 1];
    if (inner) {
      emit(`${shapeElement(inner.segments)} fill="${value}"${inner.evenOdd ? ' fill-rule="evenodd"' : ''}${alpha}${blendStyle()}/>`, state.clips.slice(0, -1));
    } else {
      emit(`<rect x="0" y="0" width="${num(width)}" height="${num(height)}" fill="${value}"${alpha}${blendStyle()}/>`);
    }
  };

  const image = (picture) => {
    if (!picture) { note('image'); return; }
    const rgba = imageRgba(picture);
    if (!rgba) { note('image'); return; }
    const href = pngDataUrl(picture.width, picture.height, rgba);
    // An image fills the unit square, its first row at the top.
    const m = multiply(multiply(flip, state.ctm), [1 / picture.width, 0, 0, -1 / picture.height, 0, 1]);
    const opacity = state.fillAlpha < 1 ? ` opacity="${num(state.fillAlpha)}"` : '';
    emit(`<image width="${picture.width}" height="${picture.height}" preserveAspectRatio="none" transform="${matrixText(m)}" href="${href}"${opacity}${blendStyle()}/>`);
  };

  // --- Text ---
  let textMatrix = IDENTITY;
  let lineMatrix = IDENTITY;
  const moveText = (tx, ty) => {
    lineMatrix = multiply(lineMatrix, [1, 0, 0, 1, tx, ty]);
    textMatrix = lineMatrix;
  };
  const showText = (glyphs) => {
    const font = state.font;
    const size = state.fontSize;
    const unit = font?.fontMatrix?.[0] ?? 0.001;
    let advance = 0;
    let text = '';
    for (const glyph of glyphs ?? []) {
      if (typeof glyph === 'number') {
        const shift = -glyph * 0.001 * size;
        advance += shift * state.hScale;
        if (glyph <= -200 && text && !text.endsWith(' ')) text += ' ';
        continue;
      }
      if (!glyph) continue;
      text += glyph.unicode ?? '';
      const spacing = state.charSpacing + (glyph.isSpace ? state.wordSpacing : 0);
      advance += ((glyph.width ?? 0) * unit * size + spacing) * state.hScale;
    }
    const visible = state.renderMode !== 3 && state.renderMode !== 7 && text.trim();
    if (visible) {
      // Glyph space (y up) to the SVG's; the font drawn at size 1 there, y down.
      const m = multiply(multiply(multiply(flip, state.ctm), textMatrix), [size * state.hScale, 0, 0, size, 0, state.rise]);
      const placed = multiply(m, [1, 0, 0, -1, 0, 0]);
      const s = scaleOf(placed);
      const unitMatrix = placed.slice(0, 4).map((v) => v / s);
      const plain = Math.abs(unitMatrix[0] - 1) < 1e-3 && Math.abs(unitMatrix[3] - 1) < 1e-3 && Math.abs(unitMatrix[1]) < 1e-3 && Math.abs(unitMatrix[2]) < 1e-3;
      const where = plain
        ? ` x="${num(placed[4])}" y="${num(placed[5])}"`
        : ` transform="${matrixText([...unitMatrix, placed[4], placed[5]])}"`;
      const fillMode = state.renderMode === 1 || state.renderMode === 5;
      const strokeMode = state.renderMode === 1 || state.renderMode === 2 || state.renderMode === 5 || state.renderMode === 6;
      const f = paint(state.fill, state.fillAlpha, 'fill');
      let attributes = fillMode ? ' fill="none"' : ` fill="${f.value}"${f.alpha < 1 ? ` fill-opacity="${num(f.alpha)}"` : ''}`;
      if (strokeMode) {
        const st = paint(state.stroke, state.strokeAlpha, 'stroke');
        attributes += ` stroke="${st.value}" stroke-width="${num(state.lineWidth * scaleOf(state.ctm))}"`;
      }
      const family = fontFamily(font);
      const weight = font?.bold || /bold|black|heavy|semibold|demi/i.test(font?.name ?? '') ? ' font-weight="bold"' : '';
      const italic = font?.italic || /italic|oblique/i.test(font?.name ?? '') ? ' font-style="italic"' : '';
      emit(`<text${where} font-family="${escapeXml(family)}" font-size="${num(s)}"${weight}${italic}${attributes}${blendStyle()} xml:space="preserve">${escapeXml(text)}</text>`);
    }
    textMatrix = multiply(textMatrix, [1, 0, 0, 1, advance, 0]);
  };

  const setGState = (pairs) => {
    for (const [key, value] of pairs ?? []) {
      switch (key) {
        case 'LW': state.lineWidth = value; break;
        case 'LC': state.cap = value; break;
        case 'LJ': state.join = value; break;
        case 'ML': state.miter = value; break;
        case 'D': state.dash = value; break;
        case 'ca': state.fillAlpha = value; break;
        case 'CA': state.strokeAlpha = value; break;
        case 'BM': state.blend = String(value ?? 'normal'); break;
        case 'SMask': state.softMask = !!value; break;
        case 'Font': state.font = get(value?.[0]); state.fontSize = value?.[1] ?? state.fontSize; break;
        default: break;
      }
    }
  };

  const openStructure = (element, kind) => {
    closeClips();
    body.push(element);
    structure.push(kind);
  };
  const closeStructure = (kind) => {
    const at = structure.lastIndexOf(kind);
    if (at < 0) return;
    closeClips();
    while (structure.length > at) {
      const closing = structure.pop();
      if (closing === 'layer' || closing === 'group') body.push('</g>');
    }
  };

  for (let i = 0; i < (fnArray?.length ?? 0); i += 1) {
    const name = op[fnArray[i]];
    const args = argsArray?.[i];
    switch (name) {
      case 'save': stack.push({ ...state, clips: [...state.clips] }); break;
      case 'restore': if (stack.length) state = stack.pop(); break;
      case 'transform': state.ctm = multiply(state.ctm, args); break;
      case 'setLineWidth': state.lineWidth = args[0]; break;
      case 'setLineCap': state.cap = args[0]; break;
      case 'setLineJoin': state.join = args[0]; break;
      case 'setMiterLimit': state.miter = args[0]; break;
      case 'setDash': state.dash = args; break;
      case 'setGState': setGState(args[0]); break;
      case 'setFillRGBColor': state.fill = { kind: 'colour', value: hexOf(args[0]) }; break;
      case 'setStrokeRGBColor': state.stroke = { kind: 'colour', value: hexOf(args[0]) }; break;
      case 'setFillTransparent': state.fill = { kind: 'colour', value: 'none' }; break;
      case 'setStrokeTransparent': state.stroke = { kind: 'colour', value: 'none' }; break;
      case 'setFillColorN': state.fill = patternPaint(args, state.base); break;
      case 'setStrokeColorN': state.stroke = patternPaint(args, state.base); break;
      case 'clip': pendingClip = 'nonzero'; break;
      case 'eoClip': pendingClip = 'evenodd'; break;
      case 'constructPath': constructPath(args); break;
      case 'shadingFill': shadingFill(args[0]); break;
      case 'paintImageXObject': image(get(args[0])); break;
      case 'paintInlineImageXObject': image(args[0]); break;
      case 'paintImageMaskXObject':
      case 'paintImageMaskXObjectGroup':
      case 'paintImageMaskXObjectRepeat':
      case 'paintSolidColorImageMask':
        note('image-mask');
        break;
      case 'paintFormXObjectBegin': {
        stack.push({ ...state, clips: [...state.clips] });
        const [matrix, bbox] = args ?? [];
        if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) state.ctm = multiply(state.ctm, Array.from(matrix));
        state.base = state.ctm;
        if (bbox && bbox.length === 4) {
          const segments = pathSegments([0, bbox[0], bbox[1], 1, bbox[2], bbox[1], 1, bbox[2], bbox[3], 1, bbox[0], bbox[3], 4]);
          const id = nextId('c');
          defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${segmentsText(segments)}"/></clipPath>`);
          state.clips = [...state.clips, { id, segments, evenOdd: false, box: true }];
        }
        break;
      }
      case 'paintFormXObjectEnd': if (stack.length) state = stack.pop(); break;
      case 'beginGroup': {
        const group = args?.[0] ?? {};
        if (group.smask || group.hasSoftMask) note('opacity-mask');
        const opacity = state.fillAlpha < 1 ? ` opacity="${num(state.fillAlpha)}"` : '';
        const mode = BLEND.has(state.blend) ? ` style="mix-blend-mode:${state.blend}"` : '';
        stack.push({ ...state, clips: [...state.clips] });
        openStructure(`<g${opacity}${mode}>`, 'group');
        // Inside a transparency group the alpha and blend mode start over (they apply to it whole).
        state.fillAlpha = 1;
        state.strokeAlpha = 1;
        state.blend = 'normal';
        state.softMask = false;
        break;
      }
      case 'endGroup':
        closeStructure('group');
        if (stack.length) state = stack.pop();
        break;
      case 'beginMarkedContentProps': {
        const [tag, props] = args ?? [];
        if (tag === 'OC' && props) {
          const ocgId = props.type === 'OCMD' ? props.ids?.[0] : props.id;
          const layer = layers.get(ocgId) ?? { name: '', visible: true };
          const layerName = layer.name || `Layer ${seenLayers.length + 1}`;
          if (!seenLayers.some((l) => l.name === layerName)) seenLayers.push({ name: layerName, visible: layer.visible });
          const hidden = layer.visible ? '' : ' display="none" data-ceditor-hidden="true"';
          openStructure(`<g id="${escapeXml(layerName)}" data-name="${escapeXml(layerName)}"${hidden}>`, 'layer');
        } else {
          structure.push('marked');
        }
        break;
      }
      case 'beginMarkedContent': structure.push('marked'); break;
      case 'endMarkedContent': {
        const kind = structure[structure.length - 1];
        if (kind === 'layer') closeStructure('layer');
        else if (kind === 'marked') structure.pop();
        break;
      }
      case 'beginText': textMatrix = IDENTITY; lineMatrix = IDENTITY; break;
      case 'endText': break;
      case 'setFont': state.font = get(args[0]); state.fontSize = args[1]; break;
      case 'setTextMatrix': textMatrix = Array.from(args[0] ?? args); lineMatrix = textMatrix; break;
      case 'moveText': moveText(args[0], args[1]); break;
      case 'setLeadingMoveText': state.leading = -args[1]; moveText(args[0], args[1]); break;
      case 'nextLine': moveText(0, -state.leading); break;
      case 'setLeading': state.leading = args[0]; break;
      case 'setCharSpacing': state.charSpacing = args[0]; break;
      case 'setWordSpacing': state.wordSpacing = args[0]; break;
      case 'setHScale': state.hScale = args[0] / 100; break;
      case 'setTextRise': state.rise = args[0]; break;
      case 'setTextRenderingMode': state.renderMode = args[0]; break;
      case 'showText': case 'showSpacedText': showText(args[0]); break;
      case 'nextLineShowText': moveText(0, -state.leading); showText(args[0]); break;
      case 'nextLineSetSpacingShowText':
        state.wordSpacing = args[0]; state.charSpacing = args[1]; moveText(0, -state.leading); showText(args[2]);
        break;
      default: break;
    }
  }
  closeClips();
  while (structure.length) {
    const closing = structure.pop();
    if (closing === 'layer' || closing === 'group') body.push('</g>');
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">`
    + (defs.length ? `<defs>${defs.join('')}</defs>` : '')
    + body.join('')
    + '</svg>';
  return { svg, width, height, layers: seenLayers, notes: [...noted].map(([kind, count]) => ({ kind, count })) };
}

function segmentsText(segments) {
  return segments.map(({ c, p }) => `${c}${p.map(num).join(' ')}`).join('');
}

/**
 * The SVG element for a path, opened and with its geometry, its paint left to the caller: a rectangle
 * where the path is one closed run of four lines along the axes, an ellipse or a circle where it is one
 * closed run of four Béziers through the ends of the axes (as Illustrator writes them), else a path.
 * The panel import measures only rectangles, circles and ellipses, and a PDF has paths alone.
 */
function shapeElement(segments) {
  const rect = asRect(segments);
  if (rect) return `<rect x="${num(rect.x)}" y="${num(rect.y)}" width="${num(rect.width)}" height="${num(rect.height)}"`;
  const ellipse = asEllipse(segments);
  if (ellipse) {
    return Math.abs(ellipse.rx - ellipse.ry) <= Math.max(ellipse.rx, ellipse.ry) * 0.005
      ? `<circle cx="${num(ellipse.cx)}" cy="${num(ellipse.cy)}" r="${num((ellipse.rx + ellipse.ry) / 2)}"`
      : `<ellipse cx="${num(ellipse.cx)}" cy="${num(ellipse.cy)}" rx="${num(ellipse.rx)}" ry="${num(ellipse.ry)}"`;
  }
  return `<path d="${segmentsText(segments)}"`;
}

/** One closed subpath: its start, and the segments after it (a closing line back to the start dropped). */
function closedRun(segments, kind) {
  if (segments.length < 3 || segments[0].c !== 'M') return null;
  const rest = segments.slice(1);
  if (rest[rest.length - 1]?.c !== 'Z') return null;
  const body = rest.slice(0, -1);
  if (body.some((s) => s.c === 'M' || s.c === 'Z')) return null;
  const start = segments[0].p;
  const end = (s) => s.p.slice(-2);
  const last = body[body.length - 1];
  if (last && last.c === 'L' && Math.hypot(end(last)[0] - start[0], end(last)[1] - start[1]) < 1e-3 && body.length > 4) body.pop();
  if (body.some((s) => s.c !== kind)) return null;
  return { start, body };
}

function asRect(segments) {
  const run = closedRun(segments, 'L');
  if (!run || (run.body.length !== 3 && run.body.length !== 4)) return null;
  const points = [run.start, ...run.body.map((s) => s.p)];
  if (run.body.length === 4) {
    const [lx, ly] = points[4];
    if (Math.hypot(lx - points[0][0], ly - points[0][1]) > 1e-3) return null;
    points.pop();
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs); const y = Math.min(...ys);
  const width = Math.max(...xs) - x; const height = Math.max(...ys) - y;
  if (width <= 0 || height <= 0) return null;
  const tolerance = Math.max(width, height) * 1e-4 + 1e-3;
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % 4];
    if (Math.abs(ax - bx) > tolerance && Math.abs(ay - by) > tolerance) return null;
    const onCorner = (Math.abs(ax - x) < tolerance || Math.abs(ax - x - width) < tolerance) && (Math.abs(ay - y) < tolerance || Math.abs(ay - y - height) < tolerance);
    if (!onCorner) return null;
  }
  return { x, y, width, height };
}

function asEllipse(segments) {
  const run = closedRun(segments, 'C');
  if (!run || run.body.length !== 4) return null;
  const ends = [run.start, ...run.body.map((s) => s.p.slice(4, 6))];
  if (Math.hypot(ends[4][0] - ends[0][0], ends[4][1] - ends[0][1]) > 1e-2) return null;
  const xs = ends.slice(0, 4).map((p) => p[0]);
  const ys = ends.slice(0, 4).map((p) => p[1]);
  const left = Math.min(...xs); const right = Math.max(...xs);
  const top = Math.min(...ys); const bottom = Math.max(...ys);
  const cx = (left + right) / 2; const cy = (top + bottom) / 2;
  const rx = (right - left) / 2; const ry = (bottom - top) / 2;
  if (rx <= 0 || ry <= 0) return null;
  const tolerance = Math.max(rx, ry) * 0.01 + 1e-3;
  // Each end on one end of an axis, each control point on the tangent there, at about 0.552 of the radius.
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = ends[i];
    const onX = Math.abs(ay - cy) < tolerance && (Math.abs(ax - left) < tolerance || Math.abs(ax - right) < tolerance);
    const onY = Math.abs(ax - cx) < tolerance && (Math.abs(ay - top) < tolerance || Math.abs(ay - bottom) < tolerance);
    if (!onX && !onY) return null;
    const [c1x, c1y, c2x, c2y] = run.body[i].p;
    const [bx, by] = ends[i + 1];
    const handle = (px, py, qx, qy, r) => Math.abs(Math.hypot(px - qx, py - qy) / r - 0.5523) < 0.06;
    if (onX) {
      if (Math.abs(c1x - ax) > tolerance || !handle(c1x, c1y, ax, ay, ry)) return null;
      if (Math.abs(c2y - by) > tolerance || !handle(c2x, c2y, bx, by, rx)) return null;
    } else {
      if (Math.abs(c1y - ay) > tolerance || !handle(c1x, c1y, ax, ay, rx)) return null;
      if (Math.abs(c2x - bx) > tolerance || !handle(c2x, c2y, bx, by, ry)) return null;
    }
  }
  return { cx, cy, rx, ry };
}

function patternPaint(args, base) {
  const [type, id, matrix] = args ?? [];
  if (type === 'Shading') return { kind: 'shading', id, matrix: matrix ? Array.from(matrix) : null, base };
  // A tiling pattern: its colour when it is an uncoloured one, else grey.
  return { kind: 'pattern', value: typeof args?.[1] === 'string' && args[1].startsWith('#') ? args[1] : '#808080' };
}

function hexOf(value) {
  if (typeof value === 'string') return value.startsWith('#') ? value.toLowerCase() : `#${value}`;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return `#${Array.from(value).slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  }
  return '#000000';
}

/** A mesh gradient's mean colour, which is what can be drawn of it without a mesh. */
function meanMeshColour(ir) {
  const colours = ir?.[3];
  if (!colours?.length) return '#808080';
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i + 2 < colours.length; i += 3) { r += colours[i]; g += colours[i + 1]; b += colours[i + 2]; n += 1; }
  return n ? hexOf([r / n, g / n, b / n]) : '#808080';
}

/** An image object from pdf.js as straight RGBA, or null. Kinds: 1 one bit grey, 2 RGB, 3 RGBA. */
function imageRgba(picture) {
  const { width, height, data, kind } = picture ?? {};
  if (!width || !height || !data) return null;
  const pixels = width * height;
  const out = new Uint8ClampedArray(pixels * 4);
  if (kind === 3 || data.length === pixels * 4) {
    out.set(data.subarray ? data.subarray(0, pixels * 4) : data.slice(0, pixels * 4));
    return out;
  }
  if (kind === 2 || data.length === pixels * 3) {
    for (let i = 0; i < pixels; i += 1) {
      out[i * 4] = data[i * 3]; out[i * 4 + 1] = data[i * 3 + 1]; out[i * 4 + 2] = data[i * 3 + 2]; out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (kind === 1) {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      const v = bit ? 255 : 0;
      const i = (y * width + x) * 4;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    }
    return out;
  }
  return null;
}

/** The family a font's PostScript name gives: "ABCDEF+MyriadPro-Bold" → "Myriad Pro", then a generic fallback. */
function fontFamily(font) {
  const raw = String(font?.name ?? font?.loadedName ?? '').replace(/^[A-Z]{6}\+/, '');
  const base = raw.split(/[-,]/)[0].replace(/(MT|PS|Std|Pro)$/i, (suffix) => ` ${suffix}`).replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const fallback = font?.fallbackName || 'sans-serif';
  return base && !/^g_/.test(base) ? `${base}, ${fallback}` : fallback;
}

function latin1(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}
