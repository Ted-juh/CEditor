import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDomains, buildLightingRows, withEffectsOff } from '../src/CE_Application/utils/effectStack.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

for (const root of ['Display', 'Pixel']) {
  test(`${root} screen effects use the renderer's real fields`, () => {
    const control = { _children: { [root]: structuredClone(SECTION_DEFAULTS[root]) } };
    assert.ok(availableDomains(control).includes('lighting'));
    const { unordered: rows } = buildLightingRows(control);
    const light = rows.find(r => r.key === 'backlight');
    assert.equal(light.enabledPath, `${root}.backlightOn`);
    assert.equal(light.enabled, true);
    assert.equal(withEffectsOff(control, 'lighting')._children[root].backlightOn, false);
    assert.equal(control._children[root].backlightOn, true);
    for (const row of rows) {
      assert.equal(row.root, root);
      for (const field of row.fields) assert.ok(field.key in SECTION_DEFAULTS[root], `${root}.${field.key} is a real screen property`);
    }
    const matrix = rows.find(r => r.key === 'dotmatrix');
    assert.equal(matrix.enabledPath, root === 'Display' ? 'Display.dotMatrix' : null);
    assert.equal(matrix.alwaysOn, root === 'Pixel');
    assert.equal(matrix.fields.some(f => f.key === 'dotPitch'), root === 'Display');
  });
}
