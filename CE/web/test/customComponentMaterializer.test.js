import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractDetachedGeneratedHitZones,
  extractDetachedGeneratedParts,
  materializedCustomComponentSnapshot,
} from '../src/CE_Application/utils/customComponentMaterializer.js';

function makeCustomComponent(overrides = {}) {
  return {
    _children: {
      Core: { id: 'custom_materializer', controlType: 'CustomComponent', enabled: true },
      Parts: { _children: {} },
      HitZones: { _children: {} },
      Assets: { filmstrips: {} },
      Generators: { _children: {} },
      ...overrides,
    },
  };
}

test('materializedCustomComponentSnapshot creates major and minor linear ticks', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        ticks: {
          enabled: true,
          type: 'ticks',
          geometry: 'linear',
          count: 3,
          minorCount: 1,
          generatedPartPrefix: 'tick',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, {});
  const parts = resolved._children.Parts._children;

  assert.ok(parts.tick_major_1);
  assert.ok(parts.tick_major_3);
  assert.ok(parts.tick_minor_1_1);
  assert.equal(parts.tick_major_2.role, 'generatedTick');
  assert.equal(parts.tick_major_2._children.Layout.x, 50);
});

test('materializedCustomComponentSnapshot creates major and minor circular ticks', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        ticks: {
          enabled: true,
          type: 'ticks',
          geometry: 'circular',
          count: 3,
          minorCount: 2,
          radius: 40,
          startAngle: -90,
          endAngle: 90,
          generatedPartPrefix: 'dialTick',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, {});
  const parts = resolved._children.Parts._children;

  assert.ok(parts.dialTick_major_1);
  assert.ok(parts.dialTick_major_3);
  assert.ok(parts.dialTick_minor_1_1);
  assert.ok(parts.dialTick_minor_2_2);
  assert.equal(parts.dialTick_major_2.role, 'generatedTick');
  assert.equal(parts.dialTick_major_2._children.Layout.rotation, 0);
  assert.ok(Math.abs(parts.dialTick_major_1._children.Layout.x - 10) < 0.000001);
  assert.ok(Math.abs(parts.dialTick_major_2._children.Layout.y - 10) < 0.000001);
  assert.ok(Math.abs(parts.dialTick_major_3._children.Layout.x - 90) < 0.000001);
  assert.equal(parts.dialTick_minor_1_1._children.Layout.height, 8);
});

test('materializedCustomComponentSnapshot creates grid guide lines', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        grid: {
          enabled: true,
          type: 'grid',
          rows: 2,
          columns: 3,
          generatedPartPrefix: 'grid',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, {});
  const parts = resolved._children.Parts._children;

  assert.ok(parts.grid_v_0);
  assert.ok(parts.grid_v_3);
  assert.ok(parts.grid_h_2);
  assert.ok(Math.abs(parts.grid_v_1._children.Layout.x - (100 / 3)) < 0.000001);
  assert.equal(parts.grid_v_1.role, 'generatedGridLine');
  assert.equal(parts.grid_v_1._children.Layout.heightUnit, 'percent');
  assert.equal(parts.grid_h_1._children.Layout.widthUnit, 'percent');
  assert.equal(parts.grid_v_1._children.Layout.height, 100);
  assert.equal(parts.grid_h_1._children.Layout.width, 100);
});

test('materializedCustomComponentSnapshot creates generated grid hit zones', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        grid: {
          enabled: true,
          type: 'grid',
          rows: 2,
          columns: 2,
          generatedPartPrefix: 'grid',
          generatedHitZones: true,
          targetBehavior: 'xyPad',
          targetValueChannel: 'mainValue',
          targetValueChannelY: 'yValue',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, {});
  const zones = resolved._children.HitZones._children;

  assert.ok(zones.grid_cell_1_1);
  assert.equal(zones.grid_cell_2_2.targetBehavior, 'xyPad');
  assert.equal(zones.grid_cell_2_2.bounds.x, 50);
  assert.equal(zones.grid_cell_2_2.bounds.y, 50);
  assert.equal(zones.grid_cell_2_2.action, 'setValue');
  assert.equal(zones.grid_cell_2_2.targetValueChannelY, 'yValue');
  assert.equal(zones.grid_cell_2_2.payload.type, 'gridCell');
  assert.equal(zones.grid_cell_2_2.payload.rowIndex, 1);
  assert.equal(zones.grid_cell_2_2.payload.columnIndex, 1);
  assert.equal(zones.grid_cell_2_2.payload.cellIndex, 3);
  assert.equal(zones.grid_cell_2_2.payload.normalized, 1);
  assert.equal(zones.grid_cell_2_1.payload.xNormalized, 0);
  assert.equal(zones.grid_cell_2_1.payload.yNormalized, 1);
  assert.equal(zones.grid_cell_2_2.meta.generatedBy, 'grid');
});

test('materializedCustomComponentSnapshot creates value-driven circular LEDs', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        leds: {
          enabled: true,
          type: 'repeated-leds',
          geometry: 'circular',
          count: 4,
          radius: 25,
          startAngle: -90,
          endAngle: 90,
          ledSize: 10,
          activeColour: 'FF00FF00',
          inactiveColour: '33000000',
          generatedPartPrefix: 'led',
          targetValueChannel: 'mainValue',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, { valueNormalized: 0.5 });
  const parts = resolved._children.Parts._children;

  assert.equal(Object.keys(parts).length, 4);
  assert.equal(parts.led_1.role, 'generatedLed');
  assert.equal(parts.led_1.meta.active, true);
  assert.equal(parts.led_2.meta.active, true);
  assert.equal(parts.led_3.meta.active, false);
  assert.equal(parts.led_1._children.Background._children.Fill.colour, 'FF00FF00');
  assert.equal(parts.led_3._children.Background._children.Fill.colour, '33000000');
  assert.equal(parts.led_2._children.Layout.width, 10);
  assert.equal(parts.led_2.meta.threshold, 0.5);
});

test('materializedCustomComponentSnapshot creates piano hit-zone note payloads', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        piano: {
          enabled: true,
          type: 'piano-keys',
          count: 3,
          baseNote: 60,
          generatedPartPrefix: 'piano',
          generatedHitZones: true,
          targetValueChannel: 'note',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, {});
  const parts = resolved._children.Parts._children;
  const zones = resolved._children.HitZones._children;

  assert.equal(parts.piano_key_1.role, 'generatedWhiteKey');
  assert.equal(parts.piano_key_2.role, 'generatedBlackKey');
  assert.equal(parts.piano_key_3.role, 'generatedWhiteKey');
  assert.equal(parts.piano_key_1._children.Layout.x, 25);
  assert.equal(parts.piano_key_2._children.Layout.x, 50);
  assert.equal(parts.piano_key_3._children.Layout.x, 75);
  assert.equal(zones.piano_keyZone_1.payload.noteNumber, 60);
  assert.equal(zones.piano_keyZone_1.payload.noteName, 'C4');
  assert.equal(zones.piano_keyZone_3.payload.noteNumber, 62);
  assert.equal(zones.piano_keyZone_3.payload.normalized, 1);
  assert.equal(zones.piano_keyZone_3.action, 'setValue');
});

test('materializedCustomComponentSnapshot creates arpeggiator runtime parts', () => {
  const control = makeCustomComponent({
    Core: {
      id: 'arp_runtime',
      controlType: 'CustomComponent',
      enabled: true,
    },
    Transform: {
      x: 0,
      y: 0,
      width: 640,
      height: 220,
      rotation: 0,
    },
    Designer: {
      arpeggiator: {
        enabled: true,
        stepCount: 16,
        viewNote: 60,
        blocks: [
          { id: 'bass', note: 60, step: 0, length: 2, velocity: 96 },
          { id: 'lead', note: 67, step: 8, length: 4, velocity: 118 },
        ],
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, {
    customChannels: {
      'channel.arpCurrentStep.raw': 8,
    },
  });
  const parts = resolved._children.Parts._children;
  const zones = resolved._children.HitZones._children;

  assert.ok(parts.arp_runtime_ruler);
  assert.ok(parts.arp_row_1);
  assert.ok(parts.arp_step_16);
  assert.ok(parts.arp_note_label_60);
  assert.ok(parts.arp_playhead);
  assert.ok(parts.arp_block_bass);
  assert.ok(parts.arp_block_lead);
  assert.equal(parts.arp_block_bass.role, 'arpeggiatorBlock');
  assert.equal(parts.arp_block_bass._children.Layout.width, 71.5);
  assert.equal(parts.arp_playhead._children.Layout.x, 338);
  assert.equal(parts.arp_block_lead._children.Text.content, 'G4 118');
  assert.equal(zones.arp_grid_draw.action, 'arpeggiatorDraw');
  assert.equal(zones.arp_block_bass_move.action, 'arpeggiatorMove');
  assert.equal(zones.arp_block_bass_resize.action, 'arpeggiatorResize');
});

test('extractDetachedGeneratedParts returns editable generated parts for a generator', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        ticks: {
          enabled: true,
          type: 'ticks',
          geometry: 'linear',
          count: 2,
          generatedPartPrefix: 'tick',
        },
        grid: {
          enabled: true,
          type: 'grid',
          rows: 1,
          columns: 1,
          generatedPartPrefix: 'grid',
        },
      },
    },
  });

  const detached = extractDetachedGeneratedParts(control, 'ticks');

  assert.ok(detached.tick_major_1);
  assert.equal(detached.tick_major_1.generated, false);
  assert.equal(detached.tick_major_1.detachedFromGenerator, 'ticks');
  assert.equal(detached.grid_v_0, undefined);
});

test('extractDetachedGeneratedHitZones returns editable generated hit zones for a generator', () => {
  const control = makeCustomComponent({
    Generators: {
      _children: {
        grid: {
          enabled: true,
          type: 'grid',
          rows: 2,
          columns: 2,
          generatedPartPrefix: 'grid',
          generatedHitZones: true,
          targetBehavior: 'xyPad',
          targetValueChannel: 'xValue',
          targetValueChannelY: 'yValue',
        },
      },
    },
  });

  const detached = extractDetachedGeneratedHitZones(control, 'grid');

  assert.ok(detached.grid_cell_1_1);
  assert.equal(detached.grid_cell_1_1.generated, false);
  assert.equal(detached.grid_cell_1_1.detachedFromGenerator, 'grid');
  assert.equal(detached.grid_cell_2_2.payload.xNormalized, 1);
  assert.equal(detached.grid_cell_2_2.targetValueChannelY, 'yValue');
});

test('materializedCustomComponentSnapshot maps filmstrip frame from value signals', () => {
  const control = makeCustomComponent({
    Assets: {
      filmstrips: {
        knob: {
          source: 'data:image/png;base64,abc',
          frameCount: 5,
          orientation: 'vertical',
          valueSource: 'mainValue',
        },
      },
    },
    Generators: {
      _children: {
        filmstrip: {
          enabled: true,
          type: 'filmstrip-frames',
          generatedPartPrefix: 'film',
          assetName: 'knob',
        },
      },
    },
  });

  const resolved = materializedCustomComponentSnapshot(control, { valueNormalized: 0.5 });
  const image = resolved._children.Parts._children.film_knob._children.Image;

  assert.equal(image.frameIndex, 2);
  assert.equal(image.frameCount, 5);
  assert.equal(image.source, 'data:image/png;base64,abc');
});
