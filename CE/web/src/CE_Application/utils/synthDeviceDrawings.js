// synthDeviceDrawings.js — the 36 synth sets' buttons, switches and meters as their drawings draw
// them, written out as SVG markup for utils/svgDrawingItems.js to read into layers
// (utils/deviceDrawingLayers.js). The knobs are utils/synthKnobDrawings.js.
//
// Each is the device branch of its drawing, copied: editor/PhysicalAnatomy.svelte (the first twelve,
// by style), editor/SynthExpansionAnatomy.svelte (by key and meter style) and
// editor/SculptedSynthAnatomy.svelte (likewise). A button or switch is written twice, at rest and
// pressed or on, with the same shapes in the same order (a shape the drawing only shows in one is
// clear in the other): what differs between the two is what the press or the switch changes. A
// meter is written once, its reading marked: a needle's swing, a bar as long as the reading, cells
// each lit past their own point, the readout. Colours are the form's five as `$face`, `$housing`,
// `$ink`, `$legend`, `$accent`. browser-checks/knobLayers.mjs compares each with the drawing.

import { SYNTH_EXPANSION } from '../models/synthExpansionSets.js';
import { SYNTH_SCULPTED } from '../models/synthSculptedSets.js';
import { SERIES_1, SERIES_2, SERIES_3 } from './synthKnobDrawings.js';

const f = (n) => Number(Number(n).toFixed(3));
const MODERN = new Set(['flat', 'glass', 'future', 'digital']);

// --- series 1 (PhysicalAnatomy), by style --------------------------------------------------------

function meter1(style) {
  if (style === 'vintage' || style === 'console') {
    const dials = Array.from({ length: style === 'console' ? 2 : 1 }, (_, i) => {
      const wide = style === 'console' ? 68 : 138;
      const off = style === 'console' ? 9 + i * 74 : 11;
      const ticks = [0, 1, 2, 3, 4, 5].map((n) => `<path d="M${f(10 + (n * (wide - 20)) / 5)} ${f(22 - Math.sin((n * Math.PI) / 5) * 10)}v4" stroke="#706553"/>`).join('');
      return `<g transform="translate(${off} 17)"><rect width="${wide}" height="56" rx="1" fill="#ded6bd"/><path d="M8 29Q${wide / 2} -3 ${wide - 8} 29" fill="none" stroke="#706553"/>${ticks}`
        + `<g data-turn="${wide / 2} 50" data-turn-from="-47" data-turn-to="47"><path d="M${wide / 2} 50V6" stroke="#a5573e" stroke-width="1.8"/></g><rect width="${wide}" height="56" fill="url(#glass)"/></g>`;
    }).join('');
    return `<rect x="4" y="10" width="152" height="72" rx="3" fill="url(#edge)" stroke="#101719"/>${dials}`;
  }
  const modern = MODERN.has(style);
  let reading;
  if (style === 'flat' || style === 'glass') {
    reading = '<rect x="13" y="33" width="134" height="22" rx="2" fill="$face" opacity=".3"/><rect data-grow x="13" y="33" width="134" height="22" rx="2" fill="$accent"/>';
  } else {
    const rx = style === 'rubber' ? 1.5 : 0;
    reading = Array.from({ length: 18 }, (_, i) => `<rect x="${f(13 + i * 7.5)}" y="32" width="5" height="24" rx="${rx}" fill="$face" opacity=".22"/>`).join('')
      + Array.from({ length: 18 }, (_, i) => `<rect data-lit-above="${f(i / 18)}" x="${f(13 + i * 7.5)}" y="32" width="5" height="24" rx="${rx}" fill="$accent"/>`).join('');
  }
  const ticks = [0, 1, 2, 3, 4].map((n) => `<path d="M${f(13 + n * 33.5)} 72v4" stroke="$legend" opacity=".5"/>`).join('');
  return `<rect x="5" y="22" width="150" height="46" rx="${modern ? 3 : 5}" fill="url(#well)" stroke="$face"/>${reading}${ticks}`
    + (style === 'glass' ? '<rect x="7" y="24" width="146" height="42" rx="3" fill="url(#glass)"/>' : '');
}

function button1(style, toggle, active) {
  if (toggle && ['vintage', 'poly', 'modular'].includes(style)) {
    return '<rect x="47" y="9" width="66" height="64" rx="4" fill="url(#edge)" stroke="#131819"/><rect x="54" y="15" width="52" height="51" rx="3" fill="#0c1216"/>'
      + `<path d="${active ? 'M58 26L102 18V57L58 63Z' : 'M58 18L102 26V63L58 57Z'}" fill="url(#cap)" stroke="$face"/><path d="M70 ${active ? 33 : 29}h20" stroke="${active ? '$accent' : '$ink'}" stroke-width="3"/>`;
  }
  const modern = MODERN.has(style);
  const down = active ? 3 : 0;
  const radius = ['rubber', 'compact'].includes(style) ? 10 : modern ? 3 : 4;
  return `<rect x="21" y="13" width="118" height="59" rx="${radius + 2}" fill="#0c1114" stroke="${modern ? '$face' : '#657073'}" stroke-width=".8"/>`
    + `<g transform="translate(0 ${down})"><rect x="25" y="14" width="110" height="51" rx="${radius}" fill="${modern ? '$face' : 'url(#cap)'}" stroke="${modern ? '#657987' : '#282e30'}" stroke-width=".8"/>`
    + (['console', 'precision', 'workstation'].includes(style) ? '<path d="M32 19h96M32 58h96" stroke="$ink" stroke-opacity=".18"/>' : '')
    + (style === 'glass' ? '<rect x="26" y="15" width="108" height="49" rx="3" fill="url(#glass)"/>' : '')
    + `<rect x="${toggle ? 49 : 67}" y="25" width="${toggle ? 62 : 26}" height="${modern ? 3 : 4}" rx="1" fill="${active ? '$accent' : '$housing'}"/><path d="M68 46h24" stroke="$ink" stroke-opacity=".7" stroke-width="2"/></g>`;
}

// --- series 2 (SynthExpansionAnatomy), by key and meter style -----------------------------------

function meter2(mode) {
  if (mode === 'needle') {
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${f(27 + i * 17.5)} ${f(43 - Math.sin((i * Math.PI) / 6) * 19)}v5" stroke="#736b56"/>`).join('');
    return `<rect x="8" y="12" width="144" height="69" rx="3" fill="url(#edge)" stroke="#111a20"/><rect x="15" y="19" width="130" height="54" rx="2" fill="#d8d3be"/><path d="M25 48Q80 5 135 48" fill="none" stroke="#736b56"/>${ticks}`
      + '<g data-turn="80 67" data-turn-from="-55" data-turn-to="55"><path d="M80 67V23" stroke="#9f573d" stroke-width="1.6"/></g><rect x="15" y="19" width="130" height="54" fill="url(#lens)"/>';
  }
  const two = mode === 'twin' || mode === 'split';
  let rows = '';
  for (let row = 0; row < (two ? 2 : 1); row += 1) {
    const y = two ? 29 + row * 20 : 32;
    const height = two ? 12 : 28;
    if (mode === 'bar' || mode === 'split') {
      rows += `<rect x="13" y="${y}" width="134" height="${height}" fill="$face" opacity=".2"/><rect data-grow x="13" y="${y}" width="134" height="${height}" fill="$accent"/><path data-move-x="134" d="M13 ${y - 2}v${height + 4}" stroke="$legend" stroke-width="1.2"/>`;
    } else {
      const dots = mode === 'dots';
      const cell = (i, extra) => `<rect${extra} x="${f(14 + i * 8.2)}" y="${y}" width="${dots ? 4 : 5.5}" height="${dots ? 4 : height}" rx="${dots ? 2 : 0}"${dots ? ' transform="translate(0 12)"' : ''}`;
      rows += Array.from({ length: 16 }, (_, i) => `${cell(i, '')} fill="$face" opacity=".25"/>`).join('')
        + Array.from({ length: 16 }, (_, i) => `${cell(i, ` data-lit-above="${f(i / 16)}"`)} fill="$accent"/>`).join('');
    }
  }
  return `<rect x="6" y="20" width="148" height="54" rx="${mode === 'dots' ? 6 : 2}" fill="url(#well)" stroke="$face"/>${rows}<path d="M14 79h134" stroke="$legend" stroke-opacity=".25"/>`;
}

function button2(type, toggle, active) {
  const dy = active ? 3 : 0;
  const lit = (on, off) => (active ? on : off);
  if (toggle && type === 'rocker') {
    return '<rect x="40" y="12" width="80" height="61" rx="4" fill="url(#well)" stroke="$face"/>'
      + `<path d="${lit('M46 27L114 18V57L46 66Z', 'M46 18L114 27V66L46 57Z')}" fill="url(#cap)" stroke="#889398" stroke-width=".7"/><path d="M65 ${lit(33, 29)}h30" stroke="${lit('$accent', '$ink')}" stroke-width="3"/>`;
  }
  if (type === 'piano') {
    return `<rect x="25" y="12" width="110" height="61" rx="2" fill="#0b151a"/><g transform="translate(0 ${dy})"><path d="M29 14h102v39l-6 15H35l-6-15Z" fill="url(#cap)" stroke="$face"/><path d="M40 57h80" stroke="${lit('$accent', '$ink')}" stroke-width="3"/></g>`;
  }
  if (type === 'status') {
    return `<rect x="22" y="13" width="87" height="59" rx="3" fill="url(#well)" stroke="$face"/><rect x="27" y="${16 + dy}" width="77" height="47" rx="2" fill="url(#cap)" stroke="$ink" stroke-opacity=".4"/>`
      + `<rect x="121" y="22" width="13" height="39" rx="2" fill="#111b22" stroke="$face"/><rect x="124" y="${lit(26, 48)}" width="7" height="9" fill="${lit('$accent', '$face')}"/>`;
  }
  if (type === 'slim') {
    return `<rect x="49" y="8" width="62" height="68" rx="4" fill="url(#well)" stroke="$face"/><rect x="55" y="${12 + dy}" width="50" height="55" rx="3" fill="url(#cap)"/><path d="M66 30h28" stroke="${lit('$accent', '$ink')}" stroke-width="3"/>`;
  }
  const flat = ['touch', 'membrane', 'edge'].includes(type);
  let inner;
  if (type === 'membrane') inner = `<rect x="32" y="24" width="96" height="34" fill="none" stroke="$ink" stroke-opacity=".45" stroke-width=".7"/><rect x="39" y="30" width="5" height="5" fill="${lit('$accent', '$housing')}"/>`;
  else if (type === 'edge') inner = `<path d="M33 23h94M33 60h94" stroke="${lit('$accent', '$ink')}" stroke-width="1.5"/>`;
  else if (type === 'touch') inner = `<path d="M51 55h58" stroke="${lit('$accent', '$housing')}" stroke-width="3"/>`;
  else inner = `<path d="M38 23h84" stroke="$ink" stroke-opacity=".2"/><rect x="66" y="28" width="28" height="4" rx="1" fill="${lit('$accent', '$housing')}"/>`;
  return `<rect x="20" y="14" width="120" height="60" rx="${type === 'inset' ? 9 : 2}" fill="url(#well)" stroke="${type === 'edge' && active ? '$accent' : '$face'}" stroke-width="${type === 'edge' ? 2 : 1}"/>`
    + `<g transform="translate(0 ${flat ? dy * 0.4 : dy})"><rect x="26" y="18" width="108" height="47" rx="${type === 'inset' ? 6 : 1}" fill="${flat ? '$face' : 'url(#cap)'}"/>${inner}</g>`;
}

// --- series 3 (SculptedSynthAnatomy), by key and meter style ------------------------------------

function meter3(mode, depth) {
  const needle = mode === 'needle';
  let reading;
  if (needle) {
    reading = '<path d="M24 49Q80 5 136 49" fill="none" stroke="#736b56"/><g data-turn="80 67" data-turn-from="-55" data-turn-to="55"><path d="M80 67V23" stroke="$accent" stroke-width="2"/></g>';
  } else {
    const cell = (i, extra) => `<rect${extra} x="${f(18 + i * 7.7)}" y="${mode === 'split' && i % 2 ? 43 : 29}" width="5" height="${mode === 'dots' ? 5 : 24}" rx="${mode === 'dots' ? 2.5 : 1}"`;
    reading = Array.from({ length: 16 }, (_, i) => `${cell(i, '')} fill="$face" opacity=".2"/>`).join('')
      + Array.from({ length: 16 }, (_, i) => `${cell(i, ` data-lit-above="${f(i / 16)}"`)} fill="$accent"/>`).join('');
  }
  return `<g filter="shadow"><rect data-cast x="7" y="11" width="146" height="70" rx="${needle ? 5 : 10}" fill="url(#side)" stroke="$face"/><rect x="14" y="17" width="132" height="54" rx="4" fill="${needle ? '#d9d2b8' : '$housing'}"/>`
    + `${reading}<path d="M18 20h124" stroke="white" stroke-opacity="${f(0.16 * depth)}"/></g>`;
}

function button3(type, active) {
  const dy = active ? 4 : 0;
  let key;
  if (type === 'piano') key = '<path d="M27 15H133V52L126 68H34L27 52Z" fill="url(#dome)" stroke="#171b1b"/>';
  else if (type === 'rocker') key = `<path d="${active ? 'M27 29L133 17V57L27 68Z' : 'M27 17L133 29V68L27 57Z'}" fill="url(#dome)" stroke="#283033"/>`;
  else if (type === 'guard') key = '<rect x="27" y="18" width="106" height="49" rx="2" fill="url(#metal)"/><path d="M35 63L45 22M125 63L115 22" stroke="$accent" stroke-width="3"/>';
  else if (type === 'frame') key = '<rect x="28" y="19" width="104" height="47" rx="8" fill="none" stroke="url(#metal)" stroke-width="7"/><rect x="43" y="26" width="74" height="33" rx="4" fill="$face"/>';
  else if (type === 'edge') key = `<rect x="27" y="19" width="106" height="47" rx="5" fill="url(#glass)" stroke="${active ? '$accent' : '$face'}" stroke-width="3"/>`;
  else if (type === 'lens') key = '<rect x="27" y="19" width="106" height="47" rx="12" fill="url(#glass)" stroke="white" stroke-opacity=".4"/><path d="M38 26Q80 15 122 26" fill="none" stroke="white" stroke-opacity=".35"/>';
  else key = `<rect x="27" y="18" width="106" height="49" rx="${type === 'inset' ? 8 : 3}" fill="url(#dome)" stroke="#172023"/>`;
  return `<g filter="shadow"><rect data-cast x="20" y="13" width="120" height="62" rx="${type === 'lens' ? 12 : 5}" fill="url(#side)" stroke="$face"/><g transform="translate(0 ${dy})">`
    + `${key}<path d="M55 55h50" stroke="${active ? '$accent' : '$ink'}" stroke-width="3"/></g></g>`;
}

/**
 * The drawing of a synth set's button, switch or meter (`new-<set id>`), or null: its markup (at
 * rest or, with `active`, pressed or on), gradients and shadow, and where its readout and caption
 * sit. `kind` is 'button', 'toggle' or 'meter'.
 */
export function synthDeviceDrawing({ id, series, style }, { kind, active = false, depth = 0.6 }) {
  const d = Math.max(0, Math.min(1, Number(depth)));
  const toggle = kind === 'toggle';
  if (series === 3) {
    const cfg = SYNTH_SCULPTED.find((entry) => entry.id === id);
    if (!cfg) return null;
    return {
      markup: kind === 'meter' ? meter3(cfg.meterStyle, d) : button3(cfg.key, active),
      gradients: SERIES_3(d),
      shadow: { dy: 5 + d * 6, blur: 2 + d * 3, colour: 'FF000000', opacity: 0.55 + 0.3 * d },
      readout: { y: 98, size: 10 },
      caption: { y: 96, family: '' },
    };
  }
  if (series === 2) {
    const cfg = SYNTH_EXPANSION.find((entry) => entry.id === id);
    if (!cfg) return null;
    return {
      markup: kind === 'meter' ? meter2(cfg.meterStyle) : button2(cfg.key, toggle, active),
      gradients: SERIES_2(d),
      readout: { y: 98, size: 10 },
      caption: { y: 95, family: '' },
    };
  }
  if (!style) return null;
  return {
    markup: kind === 'meter' ? meter1(style) : button1(style, toggle, active),
    gradients: SERIES_1(d),
    readout: { y: 98, size: 10 },
    caption: { y: 95, family: 'sans-serif' },
  };
}
