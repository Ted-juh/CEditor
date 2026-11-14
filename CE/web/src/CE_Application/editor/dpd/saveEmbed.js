/**
 * The DPD model a save writes into the profile (`dpdModel`), so the designer opens that next time.
 *
 * Not for a profile converted on opening and saved unedited: converting a generated profile is exact
 * (CE/web/test/dpdConvertedModels.test.js), so its model is the profile itself, and embedding it
 * stored the profile twice. An unedited KRONOS drum kit saved as an 18.4 MB profile carrying a 7.2 MB
 * copy of its model.
 */
export function modelToEmbed({ converted, openingJson, model }) {
  if (converted && model != null && JSON.stringify(model) === openingJson) return undefined;
  return model;
}
