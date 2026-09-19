// panelFonts.test.js — the faces a panel may use are shipped, declared, loaded, and are the ones
// the control sets name.
//
// A control set's `type` block names a typeface. That name is only worth anything if the face is
// on disk, declared in assets/fonts/panelFonts.css, and loaded by BOTH the editor and the player —
// a panel that renders in DM Sans in the editor and in Arial inside the exported plugin is a
// regression nobody sees until a customer does. So the list (models/panelFonts.js), the sheet,
// the files and the entry points are held to each other here, and every built-in set's fonts are
// checked against the list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PANEL_FONTS, PANEL_FONT_FAMILIES, isPanelFont } from '../src/CE_Application/models/panelFonts.js';
import { BUILT_IN_CONTROL_SETS, CONTROL_SET_TYPE_ROLES } from '../src/CE_Application/models/controlSets.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = path.join(WEB, 'src', 'assets', 'fonts');
const sheet = () => readFileSync(path.join(FONT_DIR, 'panelFonts.css'), 'utf8');
const faces = () => sheet().split('@font-face').slice(1).map((block) => ({
  family: block.match(/font-family:\s*'([^']+)'/)?.[1],
  weight: block.match(/font-weight:\s*([\d ]+);/)?.[1]?.trim(),
  file: block.match(/url\('\.\/([^']+)'\)/)?.[1],
  range: block.match(/unicode-range:\s*([^;]+);/)?.[1],
  display: block.match(/font-display:\s*(\w+)/)?.[1],
}));

test('every face the panel sheet declares is on disk, local, swapped and subset-scoped', () => {
  const declared = faces();
  assert.ok(declared.length >= 20, `only ${declared.length} faces declared`);
  for (const face of declared) {
    assert.ok(face.family && face.file, `a face without a family or a file: ${JSON.stringify(face)}`);
    assert.ok(existsSync(path.join(FONT_DIR, face.file)), `${face.family}: ${face.file} is not on disk`);
    assert.equal(face.display, 'swap', `${face.family} does not swap`);
    assert.ok(face.range, `${face.family} has no unicode-range`);
  }
  assert.doesNotMatch(sheet(), /url\(\s*['"]?https?:/, 'the panel sheet asks the network for a font');
});

test('the list, the sheet and the licences agree', () => {
  const declared = faces();
  for (const font of PANEL_FONTS) {
    const own = declared.filter((face) => face.family === font.family);
    assert.ok(own.length, `${font.family} is listed but not declared`);
    // The range on disk is what the list promises: a variable face covers min..max in one rule,
    // a static family has a cut at each end.
    const weights = own.map((face) => face.weight.split(' ').map(Number));
    const lo = Math.min(...weights.map((w) => w[0]));
    const hi = Math.max(...weights.map((w) => w[w.length - 1]));
    assert.equal(lo, font.min, `${font.family} min`);
    assert.equal(hi, font.max, `${font.family} max`);
    assert.equal(weights.some((w) => w.length === 2), font.variable, `${font.family} variable`);
  }
  for (const face of declared) assert.ok(isPanelFont(face.family), `${face.family} is declared but not listed`);
  // Every family ships its OFL beside it (JetBrains Mono's is webFonts.css's).
  for (const font of PANEL_FONTS) {
    const slug = font.family.toLowerCase().replace(/\s+/g, '-');
    const licence = font.family === 'JetBrains Mono' ? 'OFL-JetBrainsMono.txt' : `OFL-${slug}.txt`;
    assert.ok(existsSync(path.join(FONT_DIR, licence)), `${font.family}: no ${licence}`);
    assert.match(readFileSync(path.join(FONT_DIR, licence), 'utf8'), /SIL Open Font License/i);
  }
});

test('the editor, the player and the control-set harness all load the panel sheet', () => {
  for (const entry of ['src/main.js', 'src/player.js', 'browser-checks/controlSetShot.entry.js']) {
    assert.match(readFileSync(path.join(WEB, entry), 'utf8'), /assets\/fonts\/panelFonts\.css/, `${entry} does not import panelFonts.css`);
  }
});

test('every built-in set names a type in every role, and only faces that ship', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    assert.ok(set.type, `${set.id} has no type block`);
    for (const role of CONTROL_SET_TYPE_ROLES) {
      const spec = set.type[role];
      assert.ok(spec?.family, `${set.id}: no ${role} family`);
      assert.ok(isPanelFont(spec.family), `${set.id}: ${role} names ${spec.family}, which does not ship`);
      const font = PANEL_FONTS.find((f) => f.family === spec.family);
      assert.ok(spec.weight >= font.min && spec.weight <= font.max, `${set.id}: ${role} asks ${spec.family} for ${spec.weight}, which ships ${font.min}-${font.max}`);
    }
    assert.equal(set.type.field.family, 'JetBrains Mono', `${set.id}: every board's readout was the mono`);
  }
  assert.equal(PANEL_FONT_FAMILIES.length, PANEL_FONTS.length);
});
