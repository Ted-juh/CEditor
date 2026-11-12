// The DPD models converted from the device profiles generated from the makers' documents
// (CE/dpd/converted/<id>.json, written by CE/dpd/tools/from-legacy.mjs), one lazy chunk each.
//
// Hundreds of models would be megabytes in the editor's bundle if imported the way the hand-made
// library is (generated/dpd/dpdLibrary.json); here Vite makes each its own chunk, fetched when its
// profile is opened in the Device Profile Designer. They are not under public/, whose files the
// player's embedded bundle takes in (scripts/embed-web.mjs). import.meta.glob is Vite's, so this
// module is only imported when a converted model is asked for, never under node --test.

const models = import.meta.glob('../../../../../dpd/converted/*.json', { import: 'default' });

/** The converted model for a DPD id (`arturia.microfreak`), or null when there is none. */
export async function loadConvertedModel(dpdId) {
  const load = models[`../../../../../dpd/converted/${dpdId}.json`];
  return load ? load() : null;
}

/** The DPD ids there are converted models for. */
export function convertedModelIds() {
  return Object.keys(models).map((path) => path.replace(/^.*\/([^/]+)\.json$/, '$1')).sort();
}
