// exportSizeReport.test.js — the export log says what the bytes are made of.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSizeReport, formatExportSizeReport } from '../../../tools/scripts/lib/exportSizeReport.mjs';

const PNG = `data:image/png;base64,${'A'.repeat(4000)}`;          // 3,000 bytes decoded
const WOFF = `data:font/woff2;base64,${'B'.repeat(800)}=`;         // 599 bytes decoded

function doc() {
  const part = (extra = {}) => ({ _children: { Background: { fill: 'x'.repeat(3000) }, Layout: { x: 1 }, ...extra } });
  return {
    formatVersion: 2,
    name: 'Report',
    controls: [
      { _children: { Core: { controlType: 'Button' }, Text: { content: 'hi' } } },
      {
        _children: {
          Core: { controlType: 'CustomComponent' },
          Parts: { _children: { a: part({ Image: { src: PNG } }), b: part(), c: part() } },
          Assets: { images: { logo: { source: PNG } } },
        },
      },
      {
        _children: {
          Core: { controlType: 'Container' },
          Children: { _children: { kid: { _children: { Core: { controlType: 'Label' }, Background: { imageSrc: `data:image/jpeg;base64,${'C'.repeat(400)}` } } } } },
        },
      },
    ],
    fonts: [{ family: 'Inter', weight: '400', data: WOFF }],
    scripts: [{ id: 's', source: 'return 1' }],
  };
}

test('the report counts controls through containers, parts by section, and every embedded data URL', () => {
  const report = exportSizeReport(doc(), { fileBytes: 0 });
  assert.equal(report.controls.count, 4, 'the label inside the container counts');
  assert.equal(report.controls.parts, 3);
  assert.deepEqual(report.controls.byType.map((t) => t.type).slice(0, 1), ['CustomComponent'], 'heaviest first');
  assert.equal(report.partSections[0].section, 'Background');
  assert.equal(report.media.count, 3);
  assert.deepEqual(report.media.byType.map((t) => [t.mime, t.count, t.bytes]), [['image/png', 2, 6000], ['image/jpeg', 1, 300]]);
  assert.equal(report.media.items[0].bytes, 3000);
  // The same PNG in a part and in the asset map is one picture carried twice.
  assert.equal(report.media.repeated.length, 1);
  assert.equal(report.media.repeated[0].carried, 2);
  assert.equal(report.media.repeated[0].wasted, 3000);
  assert.deepEqual(report.fonts, [{ family: 'Inter', weight: '400', bytes: 599 }]);
  assert.equal(report.scripts.count, 1);
  assert.equal(report.compactBytes, Buffer.byteLength(JSON.stringify(doc())));
});

test('the lines name indentation, the heaviest things and the repeats, and say "none" when there is no media', () => {
  const d = doc();
  const indented = Buffer.byteLength(JSON.stringify(d, null, 2));
  const lines = formatExportSizeReport(exportSizeReport(d, { fileBytes: indented }));
  assert.match(lines[0], /on disk, .* compact — \d+% is indentation/);
  assert.ok(lines.some((l) => /4 controls, 3 parts: 1 CustomComponent/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /embedded media: .* 2 image\/png .*1 image\/jpeg/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /repeated 2×: controls\.1\.Parts\.a\.Image\.src/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /carried fonts: 1, 1 KB after subsetting — Inter 400 1 KB/.test(l)), lines.join('\n'));

  const bare = formatExportSizeReport(exportSizeReport({ controls: [] }));
  assert.equal(bare[0], 'Panel document: 0 KB');
  assert.ok(bare.includes('  embedded media: none'));
});
