// psdEffects.js — a layer's styles read from its 'lfx2' or 'lmfx' block, where ag-psd cannot.
//
// ag-psd reads layer styles from the descriptor Photoshop writes ('lfx2', or 'lmfx' with several of
// one style), and refuses the whole block on an enum value it has no four-letter code for: a newer
// Photoshop writes some by name ('BlnM.multiply' where older ones wrote 'BlnM.Mltp'), and 31 of
// psd-tools' 316 test files lose every style that way, ag-psd keeping only the legacy 'lrFX' block,
// which has no strokes, overlays or gradients. This reads the descriptor itself, either spelling, into
// the shape ag-psd gives (`layer.effects`), for the styles CEditor draws.
//
// The descriptor format is Adobe's (Photoshop File Formats, "Descriptor structure").

const td = new TextDecoder('latin1');

/** A descriptor at `at` in `view` (a DataView): `{ value, end }`, value a plain object with `_class`. */
export function readDescriptor(view, at) {
  const r = { at };
  const u32 = () => { const v = view.getUint32(r.at); r.at += 4; return v; };
  const i32 = () => { const v = view.getInt32(r.at); r.at += 4; return v; };
  const f64 = () => { const v = view.getFloat64(r.at); r.at += 8; return v; };
  const chars = (n) => { const s = td.decode(new Uint8Array(view.buffer, view.byteOffset + r.at, n)); r.at += n; return s; };
  const id = () => { const n = u32(); return chars(n || 4).trim(); };
  const unicode = () => {
    const n = u32();
    let s = '';
    for (let i = 0; i < n; i += 1) { const c = view.getUint16(r.at); r.at += 2; if (c) s += String.fromCharCode(c); }
    return s;
  };
  const value = (type) => {
    switch (type) {
      case 'Objc': case 'GlbO': return object();
      case 'VlLs': { const n = u32(); const list = []; for (let i = 0; i < n; i += 1) list.push(value(chars(4))); return list; }
      case 'doub': return f64();
      case 'UntF': { const units = chars(4); return { units, value: f64() }; }
      case 'UnFl': { const units = chars(4); const n = u32(); const list = []; for (let i = 0; i < n; i += 1) list.push(f64()); return { units, values: list }; }
      case 'TEXT': return unicode();
      case 'enum': { const kind = id(); return { enum: kind, value: id() }; }
      case 'long': return i32();
      case 'comp': { const hi = i32(); const lo = u32(); return hi * 4294967296 + lo; }
      case 'bool': { const v = view.getUint8(r.at) !== 0; r.at += 1; return v; }
      case 'type': case 'GlbC': { const name = unicode(); return { class: id(), name }; }
      case 'alis': case 'tdta': case 'Pth ': { const n = u32(); r.at += n; return null; }
      case 'obj ': {
        const n = u32();
        for (let i = 0; i < n; i += 1) {
          const kind = chars(4);
          if (kind === 'prop') { unicode(); id(); id(); }
          else if (kind === 'Clss') { unicode(); id(); }
          else if (kind === 'Enmr') { unicode(); id(); id(); id(); }
          else if (kind === 'rele') { unicode(); id(); i32(); }
          else if (kind === 'Idnt' || kind === 'indx') i32();
          else if (kind === 'name') { unicode(); id(); unicode(); }
          else throw new Error(`reference ${kind}`);
        }
        return null;
      }
      default: throw new Error(`descriptor type ${type}`);
    }
  };
  const object = () => {
    unicode();
    const out = { _class: id() };
    const n = u32();
    for (let i = 0; i < n; i += 1) {
      const key = id();
      out[key] = value(chars(4));
    }
    return out;
  };
  const result = object();
  return { value: result, end: r.at };
}

// Blend modes by Photoshop's four-letter code or by name, as CEditor names them.
const BLEND = {
  Nrml: 'normal', Dslv: 'dissolve', Drkn: 'darken', Mltp: 'multiply', CBrn: 'color burn', linearBurn: 'linear burn',
  darkerColor: 'darker color', Lghn: 'lighten', Scrn: 'screen', CDdg: 'color dodge', linearDodge: 'linear dodge',
  lighterColor: 'lighter color', Ovrl: 'overlay', SftL: 'soft light', HrdL: 'hard light', vividLight: 'vivid light',
  linearLight: 'linear light', pinLight: 'pin light', hardMix: 'hard mix', Dfrn: 'difference', Xclu: 'exclusion',
  blendSubtraction: 'subtract', blendDivide: 'divide', H: 'hue', Strt: 'saturation', Clr: 'color', Lmns: 'luminosity',
  normal: 'normal', dissolve: 'dissolve', darken: 'darken', multiply: 'multiply', colorBurn: 'color burn', lighten: 'lighten',
  screen: 'screen', colorDodge: 'color dodge', overlay: 'overlay', softLight: 'soft light', hardLight: 'hard light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  subtract: 'subtract', divide: 'divide', passThrough: 'pass through',
};
const GRADIENT_STYLE = { Lnr: 'linear', Rdl: 'radial', Angl: 'angle', Rflc: 'reflected', Dmnd: 'diamond', linear: 'linear', radial: 'radial', angle: 'angle', reflected: 'reflected', diamond: 'diamond', shapeburst: 'shapeburst' };
const INTERPOLATION = { Gcls: 'classic', classic: 'classic', Perc: 'perceptual', perceptual: 'perceptual', Lnr: 'linear', linear: 'linear', Smoo: 'smooth', smooth: 'smooth' };
const STROKE_POSITION = { OutF: 'outside', InsF: 'inside', CtrF: 'center', outsetFrame: 'outside', insetFrame: 'inside', centeredFrame: 'center' };
const BEVEL_STYLE = { InrB: 'inner bevel', OtrB: 'outer bevel', Embs: 'emboss', PlEb: 'pillow emboss', strokeEmboss: 'stroke emboss' };
const BEVEL_TECHNIQUE = { SfBL: 'smooth', PrBL: 'chisel hard', Slmt: 'chisel soft' };
const GLOW_TECHNIQUE = { SfBL: 'softer', PrBL: 'precise' };
const STROKE_FILL = { SClr: 'color', GrFl: 'gradient', Ptrn: 'pattern', solidColor: 'color', gradientFill: 'gradient', pattern: 'pattern' };

const num = (v, fallback = undefined) => (v == null ? fallback : typeof v === 'number' ? v : Number.isFinite(v.value) ? v.value : fallback);
const percent = (v, fallback) => { const n = num(v); return n == null ? fallback : n / 100; };
const px = (v) => (v == null ? undefined : { units: 'Pixels', value: num(v, 0) });
const enumOf = (v, table) => (v?.value != null ? table[v.value] ?? v.value : undefined);

function colourOf(c) {
  if (!c || typeof c !== 'object') return undefined;
  switch (c._class) {
    case 'RGBC': return { r: num(c.Rd, 0), g: num(c.Grn, 0), b: num(c.Bl, 0) };
    case 'HSBC': return { h: num(c.H, 0), s: num(c.Strt, 0), b: num(c.Brgh, 0) };
    case 'CMYC': return { c: num(c.Cyn, 0), m: num(c.Mgnt, 0), y: num(c.Ylw, 0), k: num(c.Blck, 0) };
    case 'Grsc': return { k: num(c.Gry, 0) };
    case 'LbCl': return { l: num(c.Lmnc, 0), a: num(c.A, 0), b: num(c.B, 0) };
    default: return c.Rd != null ? { r: num(c.Rd, 0), g: num(c.Grn, 0), b: num(c.Bl, 0) } : undefined;
  }
}

function gradientOf(g) {
  if (!g) return undefined;
  return {
    type: 'solid',
    name: g.Nm ?? '',
    smoothness: num(g.Intr, 4096) / 4096,
    colorStops: (g.Clrs ?? []).map((s) => ({ color: colourOf(s.Clr) ?? { r: 0, g: 0, b: 0 }, location: num(s.Lctn, 0) / 4096, midpoint: num(s.Mdpn, 50) / 100 })),
    opacityStops: (g.Trns ?? []).map((s) => ({ opacity: percent(s.Opct, 1), location: num(s.Lctn, 0) / 4096, midpoint: num(s.Mdpn, 50) / 100 })),
    ...(g.gradientsInterpolationMethod ? { interpolationMethod: INTERPOLATION[g.gradientsInterpolationMethod.value] ?? 'classic' } : {}),
  };
}

/** A contour ('TrnS', 'MpgS') as ag-psd gives one: its points on 0..255. */
const contourOf = (c) => (c?.Crv ? { name: c.Nm ?? '', curve: c.Crv.map((p) => ({ x: num(p.Hrzn, 0), y: num(p.Vrtc, 0) })) } : undefined);

// Fields every style has.
const common = (d) => ({ enabled: d.enab !== false, present: d.present !== false, blendMode: enumOf(d['Md'], BLEND) ?? 'normal', opacity: percent(d.Opct, 1) });
// And those of the shadows and glows: their contour, its antialiasing, and noise.
const shaped = (d) => ({ contour: contourOf(d.TrnS), antialiased: d.AntA, noise: percent(d.Nose, 0) });

const READERS = {
  DrSh: ['dropShadow', true, (d) => ({ ...common(d), ...shaped(d), color: colourOf(d.Clr), useGlobalLight: d.uglg, angle: num(d.lagl), distance: px(d.Dstn), choke: px(d.Ckmt), size: px(d.blur), layerConceals: d.layerConceals })],
  IrSh: ['innerShadow', true, (d) => ({ ...common(d), ...shaped(d), color: colourOf(d.Clr), useGlobalLight: d.uglg, angle: num(d.lagl), distance: px(d.Dstn), choke: px(d.Ckmt), size: px(d.blur) })],
  OrGl: ['outerGlow', false, (d) => ({ ...common(d), ...shaped(d), technique: enumOf(d.GlwT, GLOW_TECHNIQUE), jitter: percent(d.ShdN, 0), color: colourOf(d.Clr), gradient: gradientOf(d.Grad), choke: px(d.Ckmt), size: px(d.blur), range: percent(d.Inpr) })],
  IrGl: ['innerGlow', false, (d) => ({ ...common(d), ...shaped(d), technique: enumOf(d.GlwT, GLOW_TECHNIQUE), jitter: percent(d.ShdN, 0), range: percent(d.Inpr), color: colourOf(d.Clr), gradient: gradientOf(d.Grad), choke: px(d.Ckmt), size: px(d.blur), source: d.glwS?.value === 'SrcC' ? 'center' : 'edge' })],
  ChFX: ['satin', false, (d) => ({ ...common(d), contour: contourOf(d.MpgS), antialiased: d.AntA, color: colourOf(d.Clr), invert: d.Invr, angle: num(d.lagl), distance: px(d.Dstn), size: px(d.blur) })],
  SoFi: ['solidFill', true, (d) => ({ ...common(d), color: colourOf(d.Clr) })],
  GrFl: ['gradientOverlay', true, (d) => ({ ...common(d), gradient: gradientOf(d.Grad), type: enumOf(d.Type, GRADIENT_STYLE) ?? 'linear', angle: num(d.Angl), reverse: d.Rvrs, dither: d.Dthr, align: d.Algn, scale: percent(d['Scl'], 1), offset: d.Ofst ? { x: percent(d.Ofst.Hrzn, 0), y: percent(d.Ofst.Vrtc, 0) } : undefined })],
  patternFill: ['patternOverlay', false, (d) => ({ ...common(d), pattern: d.Ptrn ? { name: d.Ptrn.Nm ?? '', id: d.Ptrn.Idnt ?? '' } : undefined, scale: percent(d['Scl'], 1), align: d.Algn, phase: d.phase ? { x: num(d.phase.Hrzn, 0), y: num(d.phase.Vrtc, 0) } : undefined })],
  FrFX: ['stroke', true, (d) => {
    const g = d.Grad ? { ...gradientOf(d.Grad), style: enumOf(d.Type, GRADIENT_STYLE) ?? 'linear', angle: num(d.Angl), reverse: d.Rvrs, align: d.Algn, scale: percent(d['Scl'], 1), offset: d.Ofst ? { x: percent(d.Ofst.Hrzn, 0), y: percent(d.Ofst.Vrtc, 0) } : undefined } : undefined;
    const pattern = d.Ptrn ? { name: d.Ptrn.Nm ?? '', id: d.Ptrn.Idnt ?? '', linked: d.Lnkd, phase: d.phase ? { x: num(d.phase.Hrzn, 0), y: num(d.phase.Vrtc, 0) } : undefined } : undefined;
    return { ...common(d), position: enumOf(d.Styl, STROKE_POSITION) ?? 'outside', fillType: enumOf(d.PntT, STROKE_FILL) ?? 'color', size: px(d['Sz']), color: colourOf(d.Clr), gradient: g, pattern, scale: d['Scl'] ? percent(d['Scl'], 1) : undefined };
  }],
  ebbl: ['bevel', false, (d) => ({
    enabled: d.enab !== false, present: d.present !== false,
    highlightBlendMode: enumOf(d.hglM, BLEND), highlightColor: colourOf(d.hglC), highlightOpacity: percent(d.hglO, 0.75),
    shadowBlendMode: enumOf(d.sdwM, BLEND), shadowColor: colourOf(d.sdwC), shadowOpacity: percent(d.sdwO, 0.75),
    angle: num(d.lagl), altitude: num(d.Lald), strength: percent(d.srgR, 1), size: px(d.blur), soften: px(d.Sftn),
    style: enumOf(d.bvlS, BEVEL_STYLE) ?? 'inner bevel', technique: enumOf(d.bvlT, BEVEL_TECHNIQUE) ?? 'smooth', contour: contourOf(d.TrnS), antialiasGloss: d.antialiasGloss,
    useShape: d.useShape, shapeContour: contourOf(d.MpgS), direction: d.bvlD?.value === 'Out' || d.bvlD?.value === 'stampOut' ? 'down' : 'up',
  })],
};
const MULTI = { dropShadowMulti: 'DrSh', innerShadowMulti: 'IrSh', solidFillMulti: 'SoFi', gradientFillMulti: 'GrFl', frameFXMulti: 'FrFX' };

/** A layer-style descriptor (the 'lfx2' or 'lmfx' block's) as ag-psd's `effects`. */
export function effectsFromDescriptor(desc) {
  const effects = { scale: percent(desc['Scl'], 1) };
  if (desc.masterFXSwitch === false) effects.disabled = true;
  for (const [key, [name, list, read]] of Object.entries(READERS)) {
    const multiKey = Object.keys(MULTI).find((k) => MULTI[k] === key);
    const items = multiKey && Array.isArray(desc[multiKey]) ? desc[multiKey] : desc[key] ? [desc[key]] : [];
    if (!items.length) continue;
    const read_ = items.filter(Boolean).map(read);
    effects[name] = list ? read_ : read_[0];
  }
  return effects;
}

/** The 'lfx2' or 'lmfx' block whose body starts at `body` (version, then descriptor version and descriptor). */
export function readEffectsBlock(view, body) {
  try {
    const { value } = readDescriptor(view, body + 8);
    return effectsFromDescriptor(value);
  } catch {
    return null;
  }
}
