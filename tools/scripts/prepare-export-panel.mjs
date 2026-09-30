// prepare-export-panel.mjs — write the complete document a plug-in is built from.
//
//   node tools/scripts/prepare-export-panel.mjs <saved.cepanel> <out.cepanel>
//
// For building the player by hand with -DCE_VST_PANEL_PATH (CLAUDE.md, "Validating the plug-in"):
// a saved .cepanel stores controls as differences from their defaults, which the plug-in cannot
// read (tools/scripts/lib/exportDocument.mjs). The exporters do this themselves.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { completeExportDocument } from './lib/exportDocument.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node tools/scripts/prepare-export-panel.mjs <saved.cepanel> <out.cepanel>');
  process.exit(2);
}
const doc = await completeExportDocument(JSON.parse(readFileSync(input, 'utf8')), path.resolve(input));
writeFileSync(output, JSON.stringify(doc, null, 2));
console.log(`wrote ${output}: ${doc.controls?.length ?? 0} controls, ${doc.exportParameters?.length ?? 0} export parameters`);
