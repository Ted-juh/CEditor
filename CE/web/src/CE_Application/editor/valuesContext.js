// valuesContext.js — what the Values sidebar tells the core (scripting/scriptValues.js) besides the
// text: the fonts and images there are, read from the same catalogues the script runtime checks
// against (panelRuntime's textCatalogue and imageCatalogue), so a row says what the runtime would.
//
// The panel, its control set, the tempo and the attached control come from the script editor
// itself; this holds the two catalogues, which are app-wide.

import { derived } from 'svelte/store';
import { availableFonts, storedIcons } from '../stores/appSettings.js';
import { documentIcons } from '../utils/documentIcons.js';
import { currentDocumentFonts } from '../utils/fontSources.js';
import { fontCatalogue } from '../scripting/textStyle.js';
import { assetCatalogue } from '../utils/imageLayers.js';
import { familyOf, literalOf, matchBrackets, scanCalls, tokenize } from '../scripting/scriptValueScan.js';
import { parameterValueWidth } from '../stores/deviceProfileLocalEngine.js';

/**
 * The fonts and images a script can name, as readStatement takes them: every family by its stored
 * value and by the name the user sees (the runtime's findFont takes either), with its variation
 * axes (`faces`), and every image with its id, name and picture.
 */
export function valueCatalogues({ fonts = [], carriedFonts = [], icons = [], carriedIcons = [] } = {}) {
  const names = new Set();
  const catalogue = fontCatalogue(fonts, carriedFonts);
  for (const font of catalogue) {
    if (font.family) names.add(font.family);
    if (font.label) names.add(font.label);
  }
  // …and each family's variation axes, which ce.text.axis reads a tag and a value against.
  const faces = catalogue.map((f) => ({ family: f.family, label: f.label, axes: f.axes }));
  return { fonts: [...names], faces, images: assetCatalogue(icons, carriedIcons) };
}

/** The catalogues, kept current as fonts and icons are added. */
export const valueCatalogueStore = derived([availableFonts, storedIcons, documentIcons], ([$fonts, $icons, $carried]) => {
  let carriedFonts = [];
  try { carriedFonts = currentDocumentFonts() ?? []; } catch { carriedFonts = []; }
  return valueCatalogues({ fonts: $fonts, carriedFonts, icons: $icons, carriedIcons: $carried });
});

/**
 * What the core reads a device parameter's id, a role, a dump's kind and a preset slot against
 * (readDeviceParameter, readDeviceRole, readDumpKind, presetWords.js): each mapped role's profile,
 * by id and name, with its whole table of parameters (stores/deviceParameterTable.js), null while
 * the table loads, and the dumps, requests and preset model (`presets`, false for a document with
 * none) its document defines, null while the document loads, and the names the user's preset
 * library keeps for its slots (`library`, slot → name); `declared`, the parameters the scripts
 * declare with ce.device.defineParameter (declaredDeviceParameters), which no profile needs to
 * have, each as { id, role } (a bare id is declared for any role); and `declaredDumps`, the dumps
 * they declare with ce.device.defineDump, the same way. `mappings`, `profiles`, `tables`, `sources`
 * and `library` are the device stores' values.
 */
export function deviceValueContext({ mappings = {}, profiles = [], tables = {}, sources = {}, declared = [], declaredDumps = [], library = {} } = {}) {
  const roles = {};
  for (const [role, mapping] of Object.entries(mappings ?? {})) {
    const profileId = String(mapping?.profileId ?? '');
    if (!profileId) continue;
    const listed = (Array.isArray(profiles) ? profiles : []).find((p) => String(p?.id ?? '') === profileId);
    const table = tables?.[profileId];
    const facts = profileFactsOf(sources?.[profileId]?.source);
    roles[role] = {
      profileId, profileName: String(listed?.name ?? profileId), parameters: table?.complete ? table.parameters : null,
      dumps: facts?.dumps ?? null, requests: facts?.requests ?? null, presets: facts ? facts.presets : null,
      library: libraryNames(library?.[profileId]),
    };
  }
  const asDeclared = (list) => (Array.isArray(list) ? list : [])
    .map((d) => (typeof d === 'string' ? { id: d, role: null } : d))
    .filter((d) => typeof d?.id === 'string');
  return { roles, declared: asDeclared(declared), declaredDumps: asDeclared(declaredDumps) };
}

// A profile document's dumps ({ id, name, layout }), requests ({ id, dump }, the dump each answers
// with) and preset model (its `presets` block, or false), read once per text: the context is rebuilt
// at every edit of the panel, and a document is large.
const factsByText = new Map();
function profileFactsOf(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (factsByText.has(text)) return factsByText.get(text);
  let doc = null;
  try { doc = JSON.parse(text); } catch { doc = null; }
  const list = (x) => (Array.isArray(x) ? x : []).filter((e) => e && typeof e.id === 'string' && e.id);
  const parameters = doc && typeof doc === 'object' ? new Map(list(doc.parameters).map((p) => [p.id, p])) : new Map();
  const facts = doc && typeof doc === 'object' ? {
    dumps: list(doc.dumpDefinitions).map((d) => ({ id: d.id, name: String(d.name ?? ''), layout: dumpLayout(d, parameters) })),
    requests: list(doc.requests).map((r) => ({ id: r.id, dump: String(r.response?.dump ?? r.expectedDump ?? '') })),
    presets: doc.presets && typeof doc.presets === 'object' ? doc.presets : false,
  } : null;
  factsByText.set(text, facts);
  if (factsByText.size > 8) factsByText.delete(factsByText.keys().next().value);
  return facts;
}

/**
 * Where a dump's values lie in the message it arrives as, counted from F0, as a script reading it
 * has the bytes (scripting/dumpOffsets.js): { payload, prefix, fields: [{ parameter, name, start,
 * width }], packed: { from, to, type } | null, checksum: { at, count } | null, length | null }, or
 * null for a dump with no payload offset. A field is at the payload's offset plus its mapping's, as the engine decodes it
 * (deviceProfileLocalEngine's dump decoder), and as wide as its parameter's encoding
 * (parameterValueWidth), or the codec its mapping gives instead (dumpFieldParameter).
 */
export function dumpLayout(dump, parameters) {
  const payload = Number(dump?.payload?.offset);
  if (!Number.isInteger(payload) || payload < 0) return null;
  const fields = [];
  // A packed payload's mappings count its bytes once unpacked, which are not the message's: no field
  // has a place in the message, only the packed run as a whole.
  const pack = dump?.payload?.pack;
  for (const mapping of pack ? [] : Array.isArray(dump?.mappings) ? dump.mappings : []) {
    const parameter = parameters.get(String(mapping?.parameter ?? ''));
    const offset = Number(mapping?.offset ?? 0);
    if (!parameter || !Number.isInteger(offset)) continue;
    fields.push({ parameter: parameter.id, name: String(parameter.name || parameter.id), start: payload + offset,
      width: Math.max(1, parameterValueWidth(dumpFieldParameter(parameter, mapping))) });
  }
  const length = Number(dump?.completion?.expectedBytes);
  const sum = dump?.checksum;
  const at = Number(sum?.byteOffset ?? (Number.isInteger(length) ? length - 2 : NaN));
  const checksum = sum && Number.isInteger(at) ? { at, count: Math.max(1, Number(sum.byteCount ?? 1) || 1) } : null;
  const whole = Number.isInteger(length) && length > 0 ? length : null;
  let packed = null;
  if (pack) {
    // Eight bytes go out as seven and a byte of high bits; any other packing, up to what the message's
    // end leaves.
    const size = Number(dump?.payload?.size);
    const last = String(pack?.type ?? '') === 'packed8to7' && Number.isInteger(size) && size > 0
      ? payload + size + Math.ceil(size / 7) - 1
      : whole ? whole - 2 - (checksum?.count ?? 0) : null;
    if (last !== null && last >= payload) packed = { from: payload, to: last, type: String(pack?.type ?? '') };
  }
  return {
    payload, prefix: Array.isArray(dump?.matcher?.prefix) ? dump.matcher.prefix.map(String) : [], fields,
    packed, checksum, length: whole,
  };
}

/** A dump field's parameter as the engine decodes it: a mapping's codec, when it gives one as an
 *  encoding (an object), in place of the parameter's own; a codec given as a bare word is not read. */
export function dumpFieldParameter(parameter, mapping) {
  const codec = mapping?.codec ?? mapping?.nameCodec ?? null;
  return codec && typeof codec === 'object' ? { ...parameter, encoding: codec } : parameter;
}

/** The names a profile's preset library keeps, slot → name, the first of its banks to name a slot. */
function libraryNames(kept) {
  const out = {};
  for (const bank of Array.isArray(kept?.banks) ? kept.banks : []) {
    for (const entry of Array.isArray(bank?.entries) ? bank.entries : []) {
      const slot = Number(entry?.slot);
      if (Number.isInteger(slot) && entry?.name && !(slot in out)) out[slot] = String(entry.name);
    }
  }
  return out;
}

// defineParameter(id, spec [, role]) and defineDump(kind, spec [, role]) however they are reached
// (ce.device.defineParameter, deviceDefineParameter, a C# DefineParameter): each spelling ends in
// the word, in some case.
const DECLARES_PARAMETER = new Set(['defineparameter', 'devicedefineparameter']);
const DECLARES_DUMP = new Set(['definedump', 'devicedefinedump']);
const DEFAULT_ROLE = 'mainSynth';

/**
 * The parameters the scripts declare, written out, each with the role it is declared for:
 * [{ id, role }]. The runtime keeps a declaration per role (panelRuntime's hasDefinedParameter), so
 * one for "drums" is no declaration for the main synth; they were one list of ids, and a row for a
 * write to the main synth said nothing of an id only drums declared. A role left out is the main
 * synth's, as it is when the call runs; one built from parts is any role (`role: null`), as an id
 * built from parts is not known until it runs and is left out.
 */
export function declaredDeviceParameters(scripts) {
  return declaredBy(scripts, DECLARES_PARAMETER, 'id');
}

/** …and the dumps they declare with defineDump, the same way: [{ id: kind, role }]. */
export function declaredDeviceDumps(scripts) {
  return declaredBy(scripts, DECLARES_DUMP, 'kind');
}

function declaredBy(scripts, verbs, idName) {
  const out = new Map();
  for (const script of Array.isArray(scripts) ? scripts : []) {
    const source = String(script?.source ?? '');
    if (!/define(parameter|dump)/i.test(source)) continue;
    const fam = familyOf(script?.language);
    const tokens = tokenize(source, script?.language);
    const match = matchBrackets(tokens);
    const textOf = (arg) => {
      if (!arg) return undefined;
      const node = literalOf(tokens, arg.a, arg.b, fam, match);
      return node.type === 'string' ? node.value : node.type === 'null' ? null : NaN;
    };
    const visit = (calls) => {
      for (const call of calls) {
        visit(call.calls);
        if (!verbs.has(String(call.callee.split('.').pop()).toLowerCase())) continue;
        const positional = call.args.filter((a) => !a.keyword);
        const id = textOf(call.args.find((a) => a.keyword === idName) ?? positional[0]);
        if (typeof id !== 'string' || !id) continue;
        const written = textOf(call.args.find((a) => a.keyword === 'role') ?? positional[2]);
        const role = written === undefined || written === null || written === '' ? DEFAULT_ROLE
          : typeof written === 'string' ? written : null;
        out.set(`${role ?? '*'}\u0000${id}`, { id, role });
      }
    };
    visit(scanCalls(tokens, 0, tokens.length, fam, match));
  }
  return [...out.values()];
}
