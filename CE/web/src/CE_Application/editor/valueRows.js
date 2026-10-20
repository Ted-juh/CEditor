// valueRows.js — the Values sidebar's rows, laid out from what scripting/scriptValues.js returns.
// docs/design/script-editor-value-editors.md, "A row".
//
// Nothing here works out what a value means: the core has said that, in the runtime's own words,
// and this only puts it in rows (a call, its arguments in the call's order, an options table's keys
// under it, a call inside another indented under the one it sits in) and in a line of text under
// each value. Pure, so the layout is tested without a browser.

import { beatsText } from '../scripting/scriptValueKinds.js';

/**
 * The rows for a statement (readStatement) or a panel file object (readJsonValues), in order.
 *
 * @returns {{ key: string, type: 'call'|'arg'|'loose', depth: number, call?: object, arg?: object }[]}
 *   A 'call' row heads a call's arguments; an 'arg' row is one argument, option key or stop, `depth`
 *   deeper for each table or call it sits in; a 'loose' row heads the values outside any call.
 */
export function statementRows(statement) {
  const rows = [];
  if (!statement) return rows;
  const pushArg = (arg, depth, call) => {
    rows.push({ key: `a:${arg.range.start}:${arg.kind}:${arg.name ?? ''}`, type: 'arg', depth, call, arg });
    for (const option of arg.options ?? []) pushArg(option, depth + 1, call);
  };
  const pushCall = (call, depth) => {
    rows.push({ key: `c:${call.range.start}:${call.nameRange.end}:${call.path}`, type: 'call', depth, call });
    for (const arg of call.args ?? []) pushArg(arg, depth, call);
    for (const child of call.children ?? []) pushCall(child, depth + 1);
  };
  for (const call of statement.calls ?? []) pushCall(call, 0);
  const loose = statement.values ?? statement.rows ?? [];
  if (loose.length) {
    if (statement.values) rows.push({ key: 'loose', type: 'loose', depth: 0 });
    for (const arg of loose) pushArg(arg, 0, null);
  }
  return rows;
}

/** Every Arg of a statement, options and stops included, depth first. */
export function everyArg(statement) {
  return statementRows(statement).filter((row) => row.type === 'arg').map((row) => row.arg);
}

/** Whether a statement holds anything to list. */
export function hasRows(statement) {
  return statementRows(statement).some((row) => row.type === 'arg' || row.type === 'call');
}

/**
 * The value whose characters hold `offset`: the innermost one, so a caret in a gradient's stop
 * selects the stop's row, not the gradient's. An options table is a group, not a value, and is
 * passed over for what it holds.
 */
export function argAtOffset(statement, offset) {
  if (!Number.isFinite(offset)) return null;
  let best = null;
  for (const arg of everyArg(statement)) {
    if (arg.kind === 'options') continue;
    const { start, end } = arg.range;
    if (offset < start || offset > end) continue;
    if (!best || end - start <= best.range.end - best.range.start) best = arg;
  }
  return best;
}

/** The Arg starting at `start` (of `kind`, when given): the same value, read again after a write. */
export function findArg(statement, start, kind = null) {
  const all = everyArg(statement).filter((arg) => arg.range.start === start);
  return all.find((arg) => !kind || arg.kind === kind) ?? null;
}

/** "highlightColour" → "highlight colour". */
const words = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

/** A property path as a person says it: "Title.Text.Font.colour" → "Title text colour". */
export function spokenPath(path) {
  const parts = String(path ?? '').split('.').filter(Boolean);
  if (!parts.length) return '';
  const [control, ...rest] = parts;
  if (!rest.length) return control;
  const field = rest.pop();
  const section = rest.length ? `${words(rest[0])} ` : '';
  return `${control} ${section}${/^colou?r$/i.test(field) ? 'colour' : words(field)}`;
}

/**
 * What the display panel says it is editing ("Editing: Script · Title text colour, line 3"), from
 * the call and the argument: a value set() writes is named by its path, anything else by the call
 * and the parameter. `where` names a panel file row (its item and object) instead of a call.
 */
export function editLabel({ call = null, arg, line, prefix = 'Script', where = '' }) {
  let what;
  const path = call?.args?.find((a) => a.kind === 'path' && typeof a.value === 'string' && a !== arg);
  if (where) what = `${where} ${arg?.name ?? ''}`.trim();
  else if (path && (arg?.name === 'value' || arg?.param?.at)) what = spokenPath(path.value);
  else if (call) what = `${call.path} ${arg?.name ?? ''}`.trim();
  else what = arg?.name ?? 'value';
  return `${prefix} · ${what}${Number.isFinite(line) ? `, line ${line}` : ''}`;
}

/** A contract summary as plain text: its `code` marks dropped, the words kept. */
export function plainSummary(text) {
  return String(text ?? '').replace(/`([^`]*)`/g, '$1');
}

/** A number as a row shows it: whole, or to three places. */
export function shownNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

const shownValue = (value) => (typeof value === 'number' ? shownNumber(value)
  : typeof value === 'string' ? `"${value}"` : typeof value === 'boolean' ? String(value) : '');

/** The unit a number field shows beside it; a range ("0 to 127") goes in the line under it instead. */
export function unitLabel(unit) {
  const short = { milliseconds: 'ms', pixels: 'px', degrees: 'degrees', beats: 'beats' };
  return short[unit] ?? (/ to /.test(String(unit ?? '')) ? '' : String(unit ?? ''));
}

/** AARRGGBB for a colour's swatch, as the display panel's chooser takes it. */
export function swatchHex(meaning) {
  const swatch = meaning?.swatch;
  if (!swatch || !/^[0-9A-F]{6}$/i.test(swatch.rgb)) return null;
  const a = Math.round(Math.max(0, Math.min(1, Number(swatch.alpha ?? 1))) * 255);
  return `${a.toString(16).toUpperCase().padStart(2, '0')}${swatch.rgb.toUpperCase()}`;
}

/** A CSS colour for AARRGGBB (a swatch previewing a colour not written yet). */
export function cssOfHex(hex) {
  const h = String(hex ?? '').replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`;
  if (!/^[0-9a-f]{8}$/i.test(h)) return null;
  const a = parseInt(h.slice(0, 2), 16);
  if (a >= 255) return `#${h.slice(2)}`;
  const ch = (i) => parseInt(h.slice(i, i + 2), 16);
  return `rgba(${ch(2)}, ${ch(4)}, ${ch(6)}, ${Number((a / 255).toFixed(3))})`;
}

/** A CSS linear-gradient for a gradient's stops, as a strip in its row. */
export function gradientStrip(meaning) {
  const stops = (meaning?.stops ?? []).filter((s) => s.css);
  if (stops.length < 2) return null;
  const parts = stops.map((s) => `${s.css} ${Number(((s.at ?? 0) * 100).toFixed(2))}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** "rgba(255, 170, 0, 0.502)" as the stored colours are said: "#FFAA00 at 50% opacity". */
function seeThrough(css) {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(String(css ?? ''));
  if (!m) return null;
  const hex = m.slice(1, 4).map((c) => Number(c).toString(16).toUpperCase().padStart(2, '0')).join('');
  return `#${hex} at ${Math.round(Number(m[4]) * 100)}% opacity`;
}

/** The line under a value: what its reader makes of it, from the core's `meaning`. '' for nothing. */
export function meaningLine(arg, { madeBelow = false } = {}) {
  const m = arg?.meaning ?? {};
  switch (arg?.kind) {
    case 'colour': {
      if (m.none) return 'no colour';
      const opacity = Number.isFinite(m.alpha) && m.alpha < 1 ? ` at ${Math.round(m.alpha * 100)}% opacity` : '';
      const form = m.claimedBy === 'form' ? ' · a colour by its form alone' : '';
      if (m.token) return `{${m.token}} from the control set${m.css ? `, now ${m.css}` : ''}`;
      if (!m.stored && !m.css) return '';
      if (m.reader === 'drawing') return `drawn as ${seeThrough(m.css) ?? m.css ?? m.stored}${form}`;
      if (m.reader === 'math') return `read as ${m.stored}${opacity}`;
      return `stored as ${m.stored}${opacity}${form}`;
    }
    case 'gradient': {
      const n = (m.stops ?? []).length;
      const angle = Number.isFinite(m.angle) ? `${m.angle}°` : `${m.defaultAngle}°, as it is when no angle is written`;
      const kind = m.stored ? (m.type ?? 'linear') : 'linear';
      const parts = [`${n} stop${n === 1 ? '' : 's'}`, `${kind}, ${angle}`];
      if (!m.complete || arg.editable !== 'gradient') parts.push('not all written out, so no editor');
      return parts.join(' · ');
    }
    case 'curve': {
      if (Array.isArray(arg.value) || (arg.value && typeof arg.value === 'object')) {
        return m.bezier ? `drawn: ${m.bezier.map(shownNumber).join(', ')}${m.name ? `, which is ${m.name}` : ''}` : '';
      }
      if (m.name && m.bezier) return `cubic-bezier ${m.bezier.map(shownNumber).join(', ')}`;
      return m.name ? `${m.name}` : '';
    }
    case 'envelope': {
      if (!m.count) return '';
      const parts = [`${m.count} point${m.count === 1 ? '' : 's'}`];
      if (Number.isFinite(m.low) && Number.isFinite(m.high)) parts.push(`levels ${shownNumber(m.low)} to ${shownNumber(m.high)}`);
      if (m.complete && !m.sorted) parts.push('played in order of x');
      // A level past 0 to 1 is read as it is: past `to` above 1, past `from` below 0.
      if (m.complete && (m.high > 1 || m.low < 0)) {
        parts.push(m.high > 1 && m.low < 0 ? 'past from and to' : m.high > 1 ? 'above 1 goes past to' : 'below 0 goes past from');
      }
      return parts.join(' · ');
    }
    case 'division': return m.label ? `${m.label}${Number.isFinite(m.beats) ? `, ${beatsText(m.beats)}` : ''}` : '';
    case 'scale': case 'chord': return m.notes ? m.notes.join(' ') : (m.label ?? '');
    case 'note': {
      if (!Number.isFinite(m.number)) return '';
      const hint = m.hint ? `, ${m.hint}` : '';
      return typeof arg.value === 'number' ? `${m.name}${hint}` : `MIDI note ${m.number}${hint}`;
    }
    case 'number': {
      const range = Number.isFinite(m.min) && Number.isFinite(m.max) ? `${shownNumber(m.min)} to ${shownNumber(m.max)}` : '';
      return m.hint ?? range;
    }
    case 'control': {
      if (m.any) return 'any control';
      if (m.panel) return 'the panel';
      if (!m.found) return '';
      return `${m.type ?? 'control'}${m.value !== undefined ? ` · now ${shownValue(m.value)}` : ''}`;
    }
    case 'path': {
      if (m.found === null || m.found === undefined) return '';
      if (!m.found) return '';
      const where = [m.control, m.type].filter(Boolean).join(' · ');
      // A control set's token ("{text.primary}") is named as the colour rows name one.
      const token = typeof m.value === 'string' && /^\{[^{}\s]+\}$/.test(m.value);
      const now = token ? ` · now ${m.value} from the control set`
        : m.value !== undefined && m.value !== null && typeof m.value !== 'object' ? ` · now ${shownValue(m.value)}` : '';
      const segs = m.segments?.length && !m.endsInValue ? ` › ${m.segments.join(' › ')}` : '';
      return `${where}${segs}${now}`;
    }
    case 'event': {
      if (m.custom) return m.emittedBy ? `a custom event, emitted in ${m.emittedBy.map((n) => `'${n}'`).join(', ')}` : 'a name of its own: the target is any control';
      if (!m.found) return '';
      return m.summary ? `${m.handler}: ${m.summary}` : m.handler;
    }
    case 'animation': return m.found ? `a keyframe animation of ${m.control}` : '';
    case 'componentIndex': case 'componentWord': case 'deviceRole': case 'dumpKind': case 'sharedName': return m.hint ?? '';
    case 'noteList': return m.names?.length ? m.names.join(' ') : '';
    case 'deviceParameter': {
      if (m.noProfile) return `no profile is chosen for ${m.role}`;
      if (m.declared) return 'declared by this panel\'s scripts';
      if (m.loading) return `${m.profile ?? m.role}: its parameters are loading`;
      if (!m.found || !m.parameter) return '';
      const p = m.parameter;
      const range = p.range ? `${shownNumber(p.range.min)} to ${shownNumber(p.range.max)}` : '';
      const choices = p.choices ? `${p.choices} choices` : '';
      return [p.name, p.group, choices || range].filter(Boolean).join(' · ');
    }
    case 'font': return m.found === true ? 'an available font' : '';
    case 'image': {
      if (m.dataUrl) return 'image data';
      return m.found === true ? 'in the library or the panel' : '';
    }
    case 'bytes': {
      if (m.template) {
        const at = (m.messages ?? []).map((msg) => `${msg.value}: ${msg.hex}`);
        return at.length ? `sent at ${at.join(' · ')}` : '';
      }
      if (!Number.isFinite(m.count)) return '';
      const parts = [`${m.count} byte${m.count === 1 ? '' : 's'}`];
      if (m.sent && m.sent !== m.hex) parts.push(`sent as ${m.sent}`);
      if (m.checksum) parts.push(`${m.checksum.type} checksum ${m.checksum.hex}`);
      return parts.join(' · ');
    }
    case 'dash': {
      // No list at all is the runtime's refusal, which the problem says.
      if (!m.lengths) return '';
      if (!m.lengths.length) return 'no lengths, so the line is solid';
      if (m.drawn + m.skipped === 0) return 'every length is 0, so the line is solid';
      if (m.skipped === 0) return 'nothing is skipped, so the line is solid';
      if (m.drawn === 0) {
        return m.cap === 'butt' ? 'nothing is drawn: a dash of 0 shows only with a round or square cap, as a dot'
          : `each dash is 0, so the ${m.cap} cap draws it as a dot`;
      }
      // An odd list is drawn twice over, so a length is drawn the first time and skipped the next.
      const steps = (m.odd ? [...m.lengths, ...m.lengths] : m.lengths)
        .map((n, i) => `${shownNumber(n)} ${i % 2 ? 'skipped' : 'drawn'}`);
      const shown = steps.length > 8 ? `${steps.slice(0, 8).join(', ')}, …` : steps.join(', ');
      return `in pixels${m.odd ? ', an odd list twice over' : ''}: ${shown}`;
    }
    case 'computed': {
      // "an envelope", "an image", "an event": the article the kind's name takes.
      const what = m.expects ? `: ${/^[aeiou]/i.test(m.expects) ? 'an' : 'a'} ${m.expects}` : '';
      if (madeBelow) return `made by the call below${what}`;
      return `worked out when the script runs${what}, so there is nothing to edit here`;
    }
    case 'enum': return '';
    default: return '';
  }
}

/**
 * The id of the control a row can select on the panel: a control's name, or the control a property
 * path names, when the panel has it. Null for anything else, for the panel itself and for `"*"`, any
 * control, which no one selection is.
 */
export function controlToSelect(arg) {
  if (arg?.kind !== 'control' && arg?.kind !== 'path') return null;
  const m = arg.meaning ?? {};
  if (m.any || m.panel || m.type === 'panel') return null;
  if (arg.kind === 'control' && m.found !== true) return null;
  return typeof m.id === 'string' && m.id ? m.id : null;
}

/** True when a computed argument is exactly a call listed under its own (it gets that call's rows). */
export function madeByChild(call, arg) {
  return arg?.kind === 'computed'
    && (call?.children ?? []).some((child) => child.range.start === arg.range.start && child.range.end === arg.range.end);
}
