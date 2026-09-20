// Run from CE/web: node --import ./test/support/register-svelte.mjs scripts/export-control-set-starters.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { STARTER_CONTROL_SETS } from '../src/CE_Application/models/controlSetCoverage.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { serializePanel } from '../src/CE_Application/stores/panelModel.js';
const dir = new URL('../../panels/Control set starters/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const { id } of STARTER_CONTROL_SETS) {
  const panel = createControlSetStarter(id);
  // Stable identity for the distributed example; the gallery creates a fresh panel identity.
  const h = createHash('sha256').update(`ceditor-starter:${id}`).digest('hex');
  panel.panelGuid = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  panel.filePath = null;
  writeFileSync(new URL(`${id}.cepanel`, dir), serializePanel(panel) + '\n');
}
console.log(`Exported ${STARTER_CONTROL_SETS.length} editable starters to ${fileURLToPath(dir)}`);
