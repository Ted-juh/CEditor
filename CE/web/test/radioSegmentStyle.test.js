import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRadioWholeBackground, resolveRadioSegmentStyle } from '../src/CE_Application/utils/radioSegmentStyle.js';

function makeSections() {
  return {
    behavior: {
      buttonType: 'radio',
      visualStyle: 'radio',
      selectionMode: 'single',
      defaultValue: 'off',
    },
    background: {
      _children: {
        Fill: { colour: 'FF3A3A3A' },
        Border: { enabled: true, thickness: 1, colour: '66FFFFFF' },
      },
    },
    text: {
      _children: {
        Fill: { colour: 'FFEEEEEE' },
        Font: { size: 11, weightValue: 600, style: 'Normal', letterSpacing: 0 },
      },
    },
    valueSection: {
      rows: [
        { id: 'off', displayText: 'Off', internalValue: 'off', enabled: true, selectedByDefault: true, visualOverrides: {} },
        { id: 'bpf', displayText: 'BPF', internalValue: 'bpf', enabled: true, visualOverrides: {} },
      ],
      segmentStyle: {
        shared: {},
        rows: {},
      },
    },
    statesSection: {
      _children: {
        Selected: {
          enabled: true,
          when: { checked: true },
          patches: {
            component: {
              'Background.Fill.colour': 'FF2D6F9C',
              'Text.Fill.colour': 'FFFFFFFF',
            },
            parts: {},
            segments: {
              shared: {},
              rows: {
                bpf: {
                  indicatorInner: {
                    shape: 'square',
                    width: 10,
                    height: 10,
                  },
                },
              },
            },
          },
        },
        Hover: {
          enabled: true,
          when: { hover: true },
          patches: {
            component: {},
            parts: {},
            segments: {
              shared: {
                label: {
                  colour: 'FFFFAA00',
                },
              },
              rows: {
                bpf: {
                  label: {
                    colour: 'FF123456',
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

test('selected root state colours apply to selected rows even without an active runtime state list', () => {
  const sections = makeSections();

  const style = resolveRadioSegmentStyle({
    row: sections.valueSection.rows[0],
    behavior: sections.behavior,
    background: sections.background,
    text: sections.text,
    valueSection: sections.valueSection,
    statesSection: sections.statesSection,
    selected: true,
    activeStateNames: [],
  });

  assert.equal(style.whole.fillColour, 'FF2D6F9C');
  assert.equal(style.label.colour, 'FFFFFFFF');
});

test('selected segment state patches only apply to the selected row', () => {
  const sections = makeSections();

  const selectedStyle = resolveRadioSegmentStyle({
    row: sections.valueSection.rows[1],
    behavior: sections.behavior,
    background: sections.background,
    text: sections.text,
    valueSection: sections.valueSection,
    statesSection: sections.statesSection,
    selected: true,
    activeStateNames: ['Selected'],
  });

  const unselectedStyle = resolveRadioSegmentStyle({
    row: sections.valueSection.rows[0],
    behavior: sections.behavior,
    background: sections.background,
    text: sections.text,
    valueSection: sections.valueSection,
    statesSection: sections.statesSection,
    selected: false,
    activeStateNames: ['Selected'],
  });

  assert.equal(selectedStyle.indicatorInner.shape, 'square');
  assert.equal(selectedStyle.indicatorInner.width, 10);
  assert.equal(unselectedStyle.indicatorInner.shape, 'circle');
  assert.equal(unselectedStyle.whole.fillColour, 'FF3A3A3A');
});

test('shared and per-row hover segment patches layer in the expected order', () => {
  const sections = makeSections();

  sections.valueSection.segmentStyle.shared.label = { colour: 'FFBBBBBB' };
  sections.valueSection.segmentStyle.rows.bpf = {
    label: {
      colour: 'FF00FF00',
    },
  };

  const offStyle = resolveRadioSegmentStyle({
    row: sections.valueSection.rows[0],
    behavior: sections.behavior,
    background: sections.background,
    text: sections.text,
    valueSection: sections.valueSection,
    statesSection: sections.statesSection,
    selected: false,
    activeStateNames: ['Hover'],
  });

  const bpfStyle = resolveRadioSegmentStyle({
    row: sections.valueSection.rows[1],
    behavior: sections.behavior,
    background: sections.background,
    text: sections.text,
    valueSection: sections.valueSection,
    statesSection: sections.statesSection,
    selected: false,
    activeStateNames: ['Hover'],
  });

  assert.equal(offStyle.label.colour, 'FFFFAA00');
  assert.equal(bpfStyle.label.colour, 'FF123456');
});

test('whole item segment patches can override the full shell border and corner model', () => {
  const sections = makeSections();

  sections.valueSection.segmentStyle.rows.bpf = {
    whole: {
      border: {
        thickness: 3,
        colour: 'FFFF4400',
      },
      corners: {
        style: 'chamfer',
        radius: 14,
      },
    },
  };

  const style = resolveRadioSegmentStyle({
    row: sections.valueSection.rows[1],
    behavior: sections.behavior,
    background: sections.background,
    text: sections.text,
    valueSection: sections.valueSection,
    statesSection: sections.statesSection,
    selected: false,
    activeStateNames: [],
  });

  assert.equal(style.whole.border.thickness, 3);
  assert.equal(style.whole.border.colour, 'FFFF4400');
  assert.equal(style.whole.corners.style, 'chamfer');
  assert.equal(style.whole.corners.radius, 14);
});

test('buildRadioWholeBackground reflects nested whole-item border and corner settings', () => {
  const background = buildRadioWholeBackground({
    fillColour: 'FF101820',
    border: {
      thickness: 4,
      colour: 'FF00AAFF',
    },
    corners: {
      style: 'straight',
      radius: 0,
    },
  });

  assert.equal(background._children.Fill.colour, 'FF101820');
  assert.equal(background._children.Border.thickness, 4);
  assert.equal(background._children.Border.colour, 'FF00AAFF');
  assert.equal(background._children.Corners.style, 'straight');
  assert.equal(background._children.Corners.radius, 0);
});
