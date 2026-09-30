/**
 * textOutline.js — a text part's glyphs as one SVG outline, laid out as the part renderer lays them out.
 *
 * Knocking a legend out of a plate, or uniting a label with its badge, needs the text as geometry.
 * The glyphs come from the font file itself (utils/fontSources.js, parsed by fontkit, variable fonts
 * instanced at the weight asked for), shaped with the font's own kerning and ligatures, and placed
 * where InteractivePartRenderer's text box puts them. That box is plain CSS, so this is a small model
 * of exactly that CSS:
 *
 *   single line   white-space: pre; line-height: 1; padding 0 8px; flex-centred vertically;
 *                 justify-content from Position.justification; clipped to the box (overflow: hidden
 *                 on a flex container draws no ellipsis — the text is simply cut)
 *   multiline     (Multiline.maxLines > 1) white-space: normal; overflow-wrap: anywhere; padding 0 2px;
 *                 line-height from Multiline.lineHeight; lines centred (text-align: center) inside an
 *                 item as wide as its longest line, the item placed by justify-content
 *   spacing       letter-spacing after every character (the last included, as Chromium does), with
 *                 optional ligatures off whenever it is not zero; word-spacing on every space
 *   case          text-transform upper / lower
 *   baseline      the CSS line box: half-leading around the font's hhea ascent + descent
 *   synthesis     a static face asked for a bolder weight is emboldened, an upright one asked for
 *                 italic is slanted, the way the browser synthesises them (Skia's fake bold outset and
 *                 its 1/4 skew)
 *
 * Returns SVG path data in the part's own box, in px, y down, NONZERO winding (glyph contours overlap
 * in variable fonts), plus the box it must be clipped to.
 */
import { fontAtWeight, resolveFont } from './fontSources.js';

const numberOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function justification(value) {
  const key = String(value ?? '').toLowerCase();
  if (key.includes('left') || key === 'start' || key === 'flex-start') return 'start';
  if (key.includes('right') || key === 'end' || key === 'flex-end') return 'end';
  return 'center';
}

function applyCase(text, caseMode) {
  const mode = String(caseMode ?? 'normal').toLowerCase();
  if (mode === 'uppercase') return text.toUpperCase();
  if (mode === 'lowercase') return text.toLowerCase();
  return text;
}

/** Everything about the text box that decides where glyphs go; also the signature of a text operand. */
export function textLayoutSpec(part, width, height) {
  const text = part?._children?.Text;
  if (!text) return null;
  const font = text._children?.Font ?? {};
  const position = text._children?.Position ?? {};
  const multiline = numberOr(text._children?.Multiline?.maxLines, 1) > 1;
  return {
    content: applyCase(String(text.content ?? ''), font.caseMode),
    family: font.family ?? 'Arial',
    size: numberOr(font.size, 12),
    weight: numberOr(font.weightValue, 400),
    style: String(font.style ?? 'Normal').toLowerCase() === 'italic' ? 'italic' : 'normal',
    letterSpacing: numberOr(font.letterSpacing, 0),
    wordSpacing: numberOr(font.wordSpacing, 0),
    justify: justification(position.justification),
    multiline,
    lineHeight: multiline ? numberOr(text._children.Multiline.lineHeight, 1.1) : 1,
    padding: multiline ? 2 : 8,
    width,
    height,
  };
}

// Skia's fake-bold outset: a stroke of size × (1/24 at 9px … 1/32 at 36px), half of it outward.
export function fakeBoldOutset(size) {
  const t = Math.max(0, Math.min(1, (size - 9) / (36 - 9)));
  return (size * (1 / 24 + (1 / 32 - 1 / 24) * t)) / 2;
}

const FAKE_ITALIC_SKEW = -0.25;

/** Shape one run: glyphs with pen positions in px, and its advance (letter-spacing included). */
async function shapeRun(run, spec, fonts) {
  const glyphs = [];
  let x = 0;
  // Split by the face that covers each character (unicode-range subsets), keeping runs together.
  const pieces = [];
  for (const char of run) {
    const codePoint = char.codePointAt(0);
    const resolved = await resolveFont(spec.family, { weight: spec.weight, style: spec.style, codePoint });
    const last = pieces[pieces.length - 1];
    if (last && last.resolved.key === resolved.key) last.text += char;
    else pieces.push({ resolved, text: char });
    fonts.add(resolved.key);
  }
  for (const piece of pieces) {
    const font = fontAtWeight(piece.resolved, spec.weight);
    const scale = spec.size / font.unitsPerEm;
    const features = spec.letterSpacing !== 0 ? { liga: false, clig: false, dlig: false } : undefined;
    const layout = font.layout(piece.text, features);
    const chars = [...piece.text];
    let cursor = 0;
    layout.glyphs.forEach((glyph, index) => {
      const pos = layout.positions[index];
      glyphs.push({
        glyph,
        font,
        resolved: piece.resolved,
        x: x + pos.xOffset * scale,
        y: -pos.yOffset * scale,
        scale,
      });
      x += pos.xAdvance * scale;
      // One glyph per character is the norm; a ligature takes its characters' spacing with it.
      const covered = glyph.codePoints?.length || 1;
      for (let k = 0; k < covered; k += 1) {
        x += spec.letterSpacing;
        if (chars[cursor + k] === ' ') x += spec.wordSpacing;
      }
      cursor += covered;
    });
  }
  return { glyphs, advance: x };
}

async function measure(text, spec, fonts) {
  return (await shapeRun(text, spec, fonts)).advance;
}

/** Greedy line breaking as white-space: normal + overflow-wrap: anywhere does it. */
async function breakLines(content, spec, available, fonts) {
  const words = content.replace(/\s+/g, ' ').trim().split(' ').filter((word) => word.length);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || await measure(candidate, spec, fonts) <= available) {
      if (!line && await measure(word, spec, fonts) > available) {
        // A word longer than the line breaks anywhere.
        let chunk = '';
        for (const char of word) {
          if (chunk && await measure(chunk + char, spec, fonts) > available) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = candidate;
      }
    } else {
      lines.push(line);
      line = '';
      if (await measure(word, spec, fonts) > available) {
        let chunk = '';
        for (const char of word) {
          if (chunk && await measure(chunk + char, spec, fonts) > available) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function glyphPathData(entry, originX, baseline, spec) {
  const { glyph, scale } = entry;
  const x0 = originX + entry.x;
  const y0 = baseline + entry.y;
  const skew = entry.resolved.synthesizedItalic ? FAKE_ITALIC_SKEW : 0;
  const commands = glyph.path.commands;
  const out = [];
  const pt = (x, y) => {
    // Font units, y up → px, y down, with the fake-italic skew about the baseline.
    const px = x * scale;
    const py = y * scale;
    return `${(x0 + px - skew * py).toFixed(3)} ${(y0 - py).toFixed(3)}`;
  };
  for (const { command, args } of commands) {
    if (command === 'moveTo') out.push(`M${pt(args[0], args[1])}`);
    else if (command === 'lineTo') out.push(`L${pt(args[0], args[1])}`);
    else if (command === 'quadraticCurveTo') out.push(`Q${pt(args[0], args[1])} ${pt(args[2], args[3])}`);
    else if (command === 'bezierCurveTo') out.push(`C${pt(args[0], args[1])} ${pt(args[2], args[3])} ${pt(args[4], args[5])}`);
    else if (command === 'closePath') out.push('Z');
  }
  return out.join('');
}

/**
 * The outline of a text part. Resolves to
 *   { pathData, clip: { x, y, width, height }, fakeBoldOutset, fonts: [keys] }
 * or `{ pathData: '' }` for empty text. Throws FontUnavailableError when the face has no readable file.
 */
export async function textOutline(part, width, height) {
  const spec = textLayoutSpec(part, width, height);
  if (!spec || !spec.content.trim()) return { pathData: '', clip: { x: 0, y: 0, width, height }, fakeBoldOutset: 0, fonts: [] };
  const fonts = new Set();
  const available = Math.max(0, width - 2 * spec.padding);
  const lines = spec.multiline
    ? await breakLines(spec.content, spec, available, fonts)
    : [spec.content];

  const shaped = [];
  for (const line of lines) shaped.push(await shapeRun(line, spec, fonts));
  const first = await resolveFont(spec.family, { weight: spec.weight, style: spec.style, codePoint: [...spec.content][0].codePointAt(0) });
  const metricsFont = fontAtWeight(first, spec.weight);
  const unit = spec.size / metricsFont.unitsPerEm;
  const ascent = metricsFont.ascent * unit;
  const descent = Math.abs(metricsFont.descent) * unit;
  const lineBox = spec.lineHeight * spec.size;
  const halfLeading = (lineBox - (ascent + descent)) / 2;

  const blockHeight = lineBox * shaped.length;
  const top = (height - blockHeight) / 2;
  const itemWidth = spec.multiline ? Math.min(available, Math.max(...shaped.map((run) => run.advance))) : shaped[0].advance;
  let itemLeft;
  if (spec.justify === 'start') itemLeft = spec.padding;
  else if (spec.justify === 'end') itemLeft = width - spec.padding - itemWidth;
  else itemLeft = spec.padding + (available - itemWidth) / 2;

  const parts = [];
  shaped.forEach((run, index) => {
    const baseline = top + index * lineBox + halfLeading + ascent;
    // text-align: center inside the item.
    const lineLeft = itemLeft + (itemWidth - run.advance) / 2;
    for (const entry of run.glyphs) {
      const data = glyphPathData(entry, lineLeft, baseline, spec);
      if (data) parts.push(data);
    }
  });

  const bold = [...fonts].length && shaped.some((run) => run.glyphs.some((entry) => entry.resolved.synthesizedBold));
  return {
    pathData: parts.join(''),
    clip: { x: 0, y: 0, width, height },
    fakeBoldOutset: bold ? fakeBoldOutset(spec.size) : 0,
    fonts: [...fonts],
  };
}
