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
 * while the table loads; and `declared`, the ids the scripts declare with ce.device.defineParameter
 * (declaredDeviceParameters), which no profile needs to have. `mappings`, `profiles` and `tables` are
 * the device stores' values.
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
  return { roles, declared: Array.isArray(declared) ? declared : [] };
}

// defineParameter("id", …) however it is reached (ce.device.defineParameter, deviceDefineParameter,
// a C# DefineParameter): each spelling holds the word, in some case.
const DECLARED = /defineparameter\s*\(\s*["'`]([^"'`\n]+)["'`]/gi;

/** The ids the scripts declare, written out; one built from parts is not known until it runs. */
export function declaredDeviceParameters(scripts) {
  const ids = new Set();
  for (const script of Array.isArray(scripts) ? scripts : []) {
    for (const match of String(script?.source ?? '').matchAll(DECLARED)) ids.add(match[1]);
  }
  return [...ids];
}
