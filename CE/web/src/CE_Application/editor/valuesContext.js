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

/**
 * The fonts and images a script can name, as readStatement takes them: every family by its stored
 * value and by the name the user sees (the runtime's findFont takes either), and every image with
 * its id, name and picture.
 */
export function valueCatalogues({ fonts = [], carriedFonts = [], icons = [], carriedIcons = [] } = {}) {
  const names = new Set();
  for (const font of fontCatalogue(fonts, carriedFonts)) {
    if (font.family) names.add(font.family);
    if (font.label) names.add(font.label);
  }
  return { fonts: [...names], images: assetCatalogue(icons, carriedIcons) };
}

/** The catalogues, kept current as fonts and icons are added. */
export const valueCatalogueStore = derived([availableFonts, storedIcons, documentIcons], ([$fonts, $icons, $carried]) => {
  let carriedFonts = [];
  try { carriedFonts = currentDocumentFonts() ?? []; } catch { carriedFonts = []; }
  return valueCatalogues({ fonts: $fonts, carriedFonts, icons: $icons, carriedIcons: $carried });
});

/**
 * What the core reads a device parameter's id against (readDeviceParameter): each mapped role's
 * profile, by id and name, with its whole table of parameters (stores/deviceParameterTable.js), null
 * while the table loads; and `declared`, the parameters the scripts declare with
 * ce.device.defineParameter (declaredDeviceParameters), which no profile needs to have, each as
 * { id, role } (a bare id is declared for any role). `mappings`, `profiles` and `tables` are the
 * device stores' values.
 */
export function deviceValueContext({ mappings = {}, profiles = [], tables = {}, declared = [] } = {}) {
  const roles = {};
  for (const [role, mapping] of Object.entries(mappings ?? {})) {
    const profileId = String(mapping?.profileId ?? '');
    if (!profileId) continue;
    const listed = (Array.isArray(profiles) ? profiles : []).find((p) => String(p?.id ?? '') === profileId);
    const table = tables?.[profileId];
    roles[role] = { profileId, profileName: String(listed?.name ?? profileId), parameters: table?.complete ? table.parameters : null };
  }
  const list = (Array.isArray(declared) ? declared : [])
    .map((d) => (typeof d === 'string' ? { id: d, role: null } : d))
    .filter((d) => typeof d?.id === 'string');
  return { roles, declared: list };
}

// defineParameter(id, spec [, role]) however it is reached (ce.device.defineParameter,
// deviceDefineParameter, a C# DefineParameter): each spelling ends in the word, in some case.
const DECLARES = new Set(['defineparameter', 'devicedefineparameter']);
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
  const out = new Map();
  for (const script of Array.isArray(scripts) ? scripts : []) {
    const source = String(script?.source ?? '');
    if (!/defineparameter/i.test(source)) continue;
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
        if (!DECLARES.has(String(call.callee.split('.').pop()).toLowerCase())) continue;
        const positional = call.args.filter((a) => !a.keyword);
        const id = textOf(call.args.find((a) => a.keyword === 'id') ?? positional[0]);
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
