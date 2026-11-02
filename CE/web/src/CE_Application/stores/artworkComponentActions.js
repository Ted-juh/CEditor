// artworkComponentActions.js — File › New Component from SVG Artwork / from Photoshop Artwork.
//
//   utils/svgComponentImport.js   an SVG's shapes as vector layers. Pure, tested in node.
//   utils/psdComponentImport.js   a Photoshop file's layers as picture layers. Pure, tested in node.
//   utils/artworkComponent.js     what the names make move, and the wiring for it.
//   here                          the commands: choose a file, read it, open the component, report.
//
// The component opens in the Component Designer as a new, unsaved component, every layer there to
// change; saving or exporting it is as for any component. The file choosers are the panel
// importers' (stores/svgPanelImportActions.js, stores/psdPanelImportActions.js).

import { chooseSvg } from './svgPanelImportActions.js';
import { choosePsd } from './psdPanelImportActions.js';
import { createComponentDocument } from './componentWorkspace.js';
import { setActiveEditorTab } from './panels.js';
import { cerror, cinfo, cwarn } from './console.js';
import { notify } from './scriptUi.js';
import { describeArtworkComponent } from '../utils/artworkComponent.js';

const baseName = (path, fallback) => String(path ?? '').split(/[\\/]/).pop() || fallback;

/** Open a planned component in the Component Designer, and say what it is. Returns the document. */
export function openArtworkComponent(plan, tag) {
  if (!plan?.ok) {
    cerror(`[${tag}]`, plan?.error ?? 'nothing to import');
    notify(plan?.error ?? 'Nothing to import.', { kind: 'error', duration: 0 });
    return null;
  }
  const document = createComponentDocument({ control: plan.component, name: plan.name });
  if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  const summary = describeArtworkComponent(plan, plan.layers);
  cinfo(`[${tag}] ✓ ${summary} Save or export it to keep it.`);
  for (const line of plan.warnings) cwarn(`[${tag}] ${line}`);
  notify(plan.warnings.length ? `${summary} Some of it is drawn differently: the Console says what.` : summary,
    { kind: plan.warnings.length ? 'warn' : 'info', duration: plan.warnings.length ? 0 : 6000 });
  return document;
}

/** Build and open a component from an SVG file's text. */
export async function importSvgComponentText(text, filePath = '') {
  const { planSvgComponentImport } = await import('../utils/svgComponentImport.js');
  return openArtworkComponent(planSvgComponentImport(text, { fileName: baseName(filePath, 'Artwork.svg') }), 'svg component');
}

/** Build and open a component from a Photoshop file's bytes. ag-psd loads on first use. */
export async function importPsdComponentBytes(bytes, filePath = '') {
  const { planPsdComponentImport } = await import('../utils/psdComponentImport.js');
  return openArtworkComponent(planPsdComponentImport(bytes, { fileName: baseName(filePath, 'Artwork.psd') }), 'psd component');
}

/** File › New Component from SVG Artwork. */
export function newComponentFromSvgArtwork() {
  chooseSvg((text, filePath) => importSvgComponentText(text, filePath));
}

/** File › New Component from Photoshop Artwork. */
export function newComponentFromPsdArtwork() {
  choosePsd((bytes, filePath) => importPsdComponentBytes(bytes, filePath));
}
