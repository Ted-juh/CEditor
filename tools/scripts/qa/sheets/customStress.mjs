// customStress.mjs — QA-09: adversarial custom-component package/runtime rig.

import {
  createCustomComponentStressPanel,
  createCustomComponentStressTest,
} from '../../../../CE/web/src/CE_Application/utils/customComponentStressTest.js';
import { createCustomComponentExportEnvelope }
  from '../../../../CE/web/src/CE_Application/utils/customComponentPackage.js';

export const STRESS_COMPONENT_COUNT = 14;

export function buildCustomStressSheet() {
  const stress = createCustomComponentStressTest();
  const entries = stress.definitions.map((definition) => ({
    ...definition,
    envelope: createCustomComponentExportEnvelope(definition.component, definition.metadata),
  }));
  const panel = createCustomComponentStressPanel(entries);
  // Package instantiation records an audit timestamp. QA sheets must be byte-for-byte stable, so
  // pin only that provenance field; component content and package fingerprints remain untouched.
  for (const control of panel.controls) {
    const designer = control?._children?.Designer;
    if (!designer) continue;
    designer.packageImportedAt = '2026-09-14T00:00:00.000Z';
    if (designer.sourcePackage) designer.sourcePackage.importedAt = designer.packageImportedAt;
  }
  return panel;
}
