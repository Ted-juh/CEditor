/**
 * knobLayers.mjs — a knob made into layers draws as the knob did (docs/design/changeable-control-sets.md,
 * piece D2; utils/valueControlLayers.js).
 *
 * Create Component from Selection, asked for layers, replaces each knob with layers the designer edits:
 * housing, track, value arc, ticks, cap, pointer, readout. It replaces what was selected, so the layers
 * have to draw the knob that was there. For one knob of each kind the built-in sets make (each pointer,
 * tick and outline they use), at four values, this draws the knob on a panel, converts it, and compares
 * the two pictures pixel by pixel. A knob whose layers would differ must not convert as layers: its
 * row fails here, and valueLayersRefusal has to name what it uses. Sliders, buttons, switches and
 * meters are checked the same way (CE_KNOB_LAYERS_TYPE below); a row whose control is refused as layers
 * passes, its reason shown.
 *
 * CE_KNOB_LAYERS_SETS="graphite,tolex" checks those sets only; CE_KNOB_LAYERS_ALL=1 checks every set.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from './behaviourKit.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery/knob-layers');
await mkdir(OUT, { recursive: true });
// Knobs by default. CE_KNOB_LAYERS_TYPE=Slider checks sliders (CE_KNOB_LAYERS_ORIENTATION=vertical the
// upright ones); =Button or =ToggleButton buttons and switches, off and on (a toggle's on is its default),
// in a box the device frame fits (CE_KNOB_LAYERS_SIZE=small: a strip, where the caption goes beside);
// =Meter meters at the same four readings.
const TYPE = ['Slider', 'Button', 'ToggleButton', 'Meter'].includes(process.env.CE_KNOB_LAYERS_TYPE) ? process.env.CE_KNOB_LAYERS_TYPE : 'Knob';
const METER = TYPE === 'Meter';
const BUTTON = TYPE === 'Button' || TYPE === 'ToggleButton';
const VALUES = BUTTON ? (TYPE === 'ToggleButton' ? [0, 1] : [0]) : [0, 0.25, 0.62, 1];
const ORIENTATION = process.env.CE_KNOB_LAYERS_ORIENTATION === 'vertical' ? 'vertical' : 'horizontal';
const SMALL = process.env.CE_KNOB_LAYERS_SIZE === 'small';
const SIZE = TYPE === 'Knob'
  ? { 'Transform.width': 120, 'Transform.height': 140 }
  : METER ? { 'Transform.width': 200, 'Transform.height': 125 }
  : (BUTTON
    ? (SMALL ? { 'Transform.width': 120, 'Transform.height': 36 } : { 'Transform.width': 160, 'Transform.height': 100 })
    : (ORIENTATION === 'vertical' ? { 'Transform.width': 70, 'Transform.height': 200 } : { 'Transform.width': 240, 'Transform.height': 70 }));
// A share of the knob's pixels that may differ, after forgiving a one-pixel shift (compare): a
// sub-pixel edge drawn a whole pixel, as Pop's ticks are, half a pixel long and drawn one long as a
// layer (1.9 to 2 %). A part missing or misplaced is far more: a turning cap's light turned with it
// was 12 %, a ring outline read as points 6 %.
const MAX_SHARE = Number(process.env.CE_KNOB_LAYERS_MAX ?? 0.025);

const kit = await boot({ width: 1400, height: 1000 });
const page = kit.page;
const failures = [];
const rows = [];

const sets = await page.evaluate(async ({ only, all, type }) => {
  const { BUILT_IN_CONTROL_SETS } = await window.__ceImport('/src/CE_Application/models/controlSets.js');
  const { createControl } = await window.__ceImport('/src/CE_Application/models/componentTypes.js');
  const { resolveControlForSet } = await window.__ceImport('/src/CE_Application/models/controlSetFamilies.js');
  const { resolveSliderSemanticParts } = await window.__ceImport('/src/CE_Application/utils/sliderEntityFactory.js');
  if (only.length) return only;
  const seen = new Map();
  for (const set of BUILT_IN_CONTROL_SETS) {
    const knob = resolveControlForSet(createControl(type), set);
    if (type === 'Meter') {
      const p = knob._children.Parts?._children ?? {};
      const sig = ['housing', 'face', 'track', 'scale', 'indicator', 'marker', 'cover', 'legend', 'lamp'].map((n) => (p[n]?.visible === true ? `${n}:${p[n].motion ?? ''}:${p[n].pattern ?? ''}` : '-')).join('/') + String(knob._children.Core.controlForm ?? '');
      if (all || !seen.has(sig)) seen.set(all ? set.id : sig, set.id);
      continue;
    }
    if (type === 'Button' || type === 'ToggleButton') {
      const p = knob._children.Parts?._children ?? {};
      const sig = ['housing', 'guard', 'key', 'symbol', 'indicator', 'legend'].map((n) => (p[n]?.visible === true ? `${n}:${p[n].shape ?? ''}:${p[n].pattern ?? ''}:${p[n].follows ?? ''}` : '-')).join('/') + String(knob._children.Core.controlForm ?? '');
      if (all || !seen.has(sig)) seen.set(all ? set.id : sig, set.id);
      continue;
    }
    const parts = resolveSliderSemanticParts(knob._children.Parts)._children;
    const b = knob._children.Behavior;
    const signature = [
      parts.pointerCurrent?.kind ?? 'dot', b.showTicks !== false ? parts.tickMajor?.kind ?? 'line' : 'none',
      parts.bodyCap?.visible === true ? parts.bodyCap?.outline ?? 'circle' : 'nocap',
      parts.bodyHousing?.visible === true ? parts.bodyHousing?.outline ?? 'circle' : 'nohousing', b.fillOrigin ?? 'min',
    ].join('/');
    if (all || !seen.has(signature)) seen.set(all ? set.id : signature, set.id);
  }
  return [...seen.values()];
}, { only: (process.env.CE_KNOB_LAYERS_SETS ?? '').split(',').map((s) => s.trim()).filter(Boolean), all: process.env.CE_KNOB_LAYERS_ALL === '1', type: TYPE });

async function compare(a, b) {
  return page.evaluate(async ([pa, pb]) => {
    const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = src; });
    const [ia, ib] = await Promise.all([load(pa), load(pb)]);
    const w = Math.min(ia.width, ib.width);
    const h = Math.min(ia.height, ib.height);
    const pixels = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = pixels(ia);
    const db = pixels(ib);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d'); const img = ctx.createImageData(w, h);
    let bad = 0;
    // A pixel differs when it lies outside what the other picture has within one pixel of it, each
    // channel between that neighbourhood's darkest and lightest (24 either side). An edge drawn half a
    // pixel over, or anti-aliased where the other is crisp, falls between the two sides it blends; a
    // part missing, moved or recoloured does not.
    const matched = (i) => {
      const p = i / 4;
      const x = p % w;
      const y = (p - x) / w;
      for (let c = 0; c < 3; c += 1) {
        let lo = 255;
        let hi = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const v = db[(yy * w + xx) * 4 + c];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        if (da[i + c] < lo - 24 || da[i + c] > hi + 24) return false;
      }
      return true;
    };
    for (let i = 0; i < da.length; i += 4) {
      const off = !matched(i);
      if (off) bad += 1;
      img.data[i] = off ? 255 : da[i] / 3; img.data[i + 1] = off ? 0 : da[i + 1] / 3; img.data[i + 2] = off ? 0 : da[i + 2] / 3; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { bad, total: w * h, png: out.toDataURL('image/png') };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
}

const deselect = () => page.evaluate(async () => {
  const { selectedComponentIds } = await window.__ceImport('/src/CE_Application/stores/panels.js');
  selectedComponentIds.set(new Set());
});
const hideBadges = () => page.evaluate(() => { for (const el of document.querySelectorAll('.editor-state-badge')) el.style.visibility = 'hidden'; });

try {
  for (const setId of sets) {
    for (const value of VALUES) {
      await kit.fresh();
      await page.evaluate(async (id) => {
        const { setPanelControlSet } = await window.__ceImport('/src/CE_Application/stores/controlSets.js');
        const { activePanelId } = await window.__ceImport('/src/CE_Application/stores/panels.js');
        let pid; activePanelId.subscribe((v) => { pid = v; })();
        setPanelControlSet(pid, id);
      }, setId);
      const knob = await kit.make(TYPE, BUTTON
        ? { 'Core.name': 'Play', 'Transform.x': 80, 'Transform.y': 80, ...SIZE, 'Text.content': 'PLAY', 'Behavior.defaultValue': value === 1 }
        : METER ? { 'Core.name': 'Level', 'Transform.x': 80, 'Transform.y': 80, ...SIZE, 'Meter.value': value, 'Meter.valueMin': 0, 'Meter.valueMax': 1 }
        : {
          'Core.name': 'Cutoff', 'Transform.x': 80, 'Transform.y': 80, ...SIZE, ...(TYPE === 'Slider' ? { 'Behavior.orientation': ORIENTATION } : {}),
          'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.step': 1, 'Behavior.defaultValue': value * 100, 'Behavior.defaultCurrentValue': value * 100,
        });
      // Buttons in Preview: the edit canvas draws a switch off whatever its value, a component its value.
      if (BUTTON) { await kit.preview(true); await kit.settle(500); }
      await deselect(); await hideBadges(); await kit.settle(400);
      const box = await kit.box(knob);
      // Inside the box by 3 px: the editor draws a placed component's dashed outline on its edge.
      const clip = { x: Math.round(box.x) + 3, y: Math.round(box.y) + 3, width: Math.round(box.w) - 6, height: Math.round(box.h) - 6 };
      const before = await page.screenshot({ clip });
      if (BUTTON) { await kit.preview(false); await kit.settle(300); }
      const result = await page.evaluate(async (id) => {
        const { selectedComponentIds } = await window.__ceImport('/src/CE_Application/stores/panels.js');
        const { createComponentFromSelection } = await window.__ceImport('/src/CE_Application/stores/componentFromSelectionActions.js');
        selectedComponentIds.set(new Set([id]));
        const made = createComponentFromSelection('Knob layers', { valueControlsAs: 'layers' });
        return {
          ok: made.ok, asParts: made.plan?.asParts ?? [], parts: Object.keys(made.plan?.component?._children?.Parts?._children ?? {}).length,
          refused: made.ok ? '' : (made.refused?.[0]?.reason ?? 'refused'),
        };
      }, knob);
      if (BUTTON) { await kit.preview(true); await kit.settle(500); }
      await deselect(); await hideBadges(); await kit.settle(700);
      const after = await page.screenshot({ clip });
      if (BUTTON) { await kit.preview(false); await kit.settle(200); }
      const diff = await compare(before, after);
      const share = diff.bad / diff.total;
      const label = `${TYPE === 'Slider' ? `slider-${ORIENTATION}-` : (BUTTON ? `${TYPE}${SMALL ? '-small' : ''}-` : (METER ? 'meter-' : ''))}${setId}-${Math.round(value * 100)}`;
      // A knob a layer cannot draw yet comes in as one exact part, by design: it must still match. A
      // button a layer cannot draw is refused, named, and left as it was.
      const ok = (result.ok || Boolean(result.refused)) && share <= MAX_SHARE;
      rows.push({ label, layers: result.parts, share: Math.round(share * 10000) / 100, ok, asPart: result.asParts[0]?.reason ?? '' });
      if (!ok) {
        failures.push(label);
        await writeFile(join(OUT, `${label}-panel.png`), before);
        await writeFile(join(OUT, `${label}-layers.png`), after);
        await writeFile(join(OUT, `${label}-diff.png`), Buffer.from(diff.png.split(',')[1], 'base64'));
      }
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(26)} ${String(result.parts).padStart(3)} layers  ${(share * 100).toFixed(2)}% differ${result.asParts.length ? `  (one part: ${result.asParts[0].reason})` : ''}${result.refused ? `  (refused: ${result.refused})` : ''}`);
    }
  }
} finally {
  await kit.close?.();
}
console.log(failures.length ? `knob layers: ${failures.length} of ${rows.length} differ (pictures in dist-scenery/knob-layers)` : `knob layers: all ${rows.length} match`);
process.exit(failures.length ? 1 : 0);
