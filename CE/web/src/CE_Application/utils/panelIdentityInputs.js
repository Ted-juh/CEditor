// panelIdentityInputs.js — the five values a panel document contributes to its plugin identity.
//
// `deriveIdentity` (exportIdentity.js, mirrored in C++ by PanelExportIdentity.h) turns a GUID, a
// product name, a vendor, a manufacturer code and a version into every host-facing identifier a
// panel has. This module answers the question one step earlier: given a panel document, what are
// those five values?
//
// WHY IT IS ITS OWN FILE. Because the answer is a chain of fallbacks — `exportSettings.pluginName`
// or the panel's name or a name built from the file, `vendor` or 'Tedjuh', a manufacturer code
// padded to four characters with 'x' — and every one of those defaults is load-bearing in a way
// that is invisible when it works. A different default is a different string into the hash, so a
// different pluginCode, so a different VST3 FUID. A host keys plugins by FUID, so the symptom of
// getting one wrong is not an error anywhere: it is a saved session, on somebody else's machine,
// weeks later, that no longer finds its plugin.
//
// There were briefly three implementations of this chain — the compiling exporter, the template
// exporter, and the C++ that a prebuilt player uses to identify itself at load. Three copies of a
// rule whose failure mode is silent is how the rule ends up broken. Two of those are now this file;
// the third is `identityFromPanelDocument` in CE/src/Export/PanelIdentitySidecar.h, which cannot
// import JavaScript and is instead pinned to the same expectations by test on both sides.

/** The defaults, named rather than inlined, so a test can assert them and the C++ can match them. */
export const IDENTITY_DEFAULTS = {
  vendor: 'Tedjuh',
  manufacturerCode: 'Tdjh',
  version: '1.0.0',
  /** JUCE requires exactly four characters; the exporter has always padded with 'x'. */
  padManufacturerCode: (code) => (code + 'xxxx').slice(0, 4),
};

const trimmed = (value) => String(value ?? '').trim();

/**
 * The identity inputs a panel document implies.
 *
 * @param panelDoc     the parsed .cepanel
 * @param panelFileName the document's file name, used only to build a last-resort product name
 * @param overrides    optional caller values that win over the document — the CLI's productName
 *                     argument is the only real one, and it never applies to a shipped export
 */
export function identityInputsFromPanel(panelDoc, panelFileName = '', overrides = {}) {
  const settings = panelDoc?.exportSettings ?? {};

  const productName = trimmed(settings.pluginName)
    || trimmed(overrides.productName)
    || trimmed(panelDoc?.name)
    || `CEditor ${String(panelFileName).replace(/\.[^.]+$/, '')}`.trim();

  return {
    guid: trimmed(panelDoc?.panelGuid),
    productName,
    vendor: trimmed(settings.vendor) || IDENTITY_DEFAULTS.vendor,
    version: trimmed(settings.version) || IDENTITY_DEFAULTS.version,
    manufacturerCode: IDENTITY_DEFAULTS.padManufacturerCode(
      trimmed(settings.manufacturerCode) || IDENTITY_DEFAULTS.manufacturerCode,
    ),
  };
}
