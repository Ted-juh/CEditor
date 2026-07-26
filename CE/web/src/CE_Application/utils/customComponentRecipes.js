// Assistant recipe + quick-shape patch builders (restructure Stage B4).
//
// Extracted verbatim from the dissolved Designer tab (CustomDesignerEditor)
// so the surface's Starters/Assistant flyouts and any future caller can apply
// recipes without a 3.5k-line dashboard. Pure: builds patch objects from the
// control tree; callers apply them via applyControlPatch.
import {
  createBackground,
  createBehaviorModule,
  createHitZone,
  createPartNode,
  createText,
  createValueChannel,
} from './customComponentFactory.js';

function nextPartName(base, partNames) {
  let index = 1;
  let name = base;
  const existing = new Set(partNames);
  while (existing.has(name)) {
    index += 1;
    name = `${base}_${index}`;
  }
  return name;
}

export function buildShapePartPatch(control, kind) {
  const partNames = Object.keys(control?._children?.Parts?._children ?? {});
  const baseName = kind === 'text' ? 'textLayer' : kind;
  const name = nextPartName(baseName, partNames);
  const common = {
    role: kind,
    kind,
    zIndex: partNames.length + 1,
    layout: { x: 50, y: 50, width: 84, height: 32, widthUnit: 'px', heightUnit: 'px' },
  };
  const part =
    kind === 'text'
      ? createPartNode(name, {
          ...common,
          sections: { Text: createText('Text', { size: 12, weight: 600 }) },
        })
      : createPartNode(name, {
          ...common,
          layout: {
            ...common.layout,
            width: ['circle', 'ring', 'arcTrack'].includes(kind) ? 42 : common.layout.width,
            height: ['circle', 'ring', 'arcTrack'].includes(kind) ? 42 : common.layout.height,
          },
          sections: {
            Background: createBackground(['ring', 'arcTrack'].includes(kind) ? '005B9BD5' : 'FF5B9BD5', {
              borderEnabled: true,
              borderColour: ['ring', 'arcTrack'].includes(kind) ? 'FF5B9BD5' : '55FFFFFF',
              borderThickness: ['ring', 'arcTrack'].includes(kind) ? 4 : 1,
              radius: ['circle', 'ring', 'arcTrack'].includes(kind) ? 999 : kind === 'capsule' ? 999 : 8,
            }),
          },
          meta:
            kind === 'arcTrack'
              ? {
                  renderer: 'arcTrack',
                  arcTrack: {
                    startAngle: -135,
                    sweepAngle: 270,
                    direction: 'cw',
                    thickness: 4,
                    colour: 'FF5B9BD5',
                  },
                }
              : {},
        });

  return {
    patch: {
      [`Parts.${name}`]: part,
      'Designer.selectedLayer': name,
    },
    partName: name,
  };
}

export function buildRecipePatch(control, recipe) {
  if (!control || !recipe) return null;
  const designer = control?._children?.Designer ?? {};
  const selectedLayer = designer?.selectedLayer || 'handle';
  const selectedChannel = designer?.selectedValueChannel || 'mainValue';
  const normalizedSource =
    selectedChannel === 'mainValue' ? 'value.normalized' : `channel.${selectedChannel}.normalized`;

  if (recipe.id === 'shape.roundedPanel') {
    return buildShapePartPatch(control, 'roundedRectangle').patch;
  }
  if (recipe.id === 'shape.ring') {
    return buildShapePartPatch(control, 'ring').patch;
  }
  if (recipe.id === 'state.pressBounce') {
    return {
      'States.PressBounce': {
        _type: 'State',
        name: 'PressBounce',
        group: 'interaction',
        description: 'Scale the selected part while pressed.',
        enabled: true,
        when: { pressed: true },
        patches: {
          component: {},
          parts: {
            [selectedLayer]: { 'Layout.scale': 0.94 },
          },
        },
      },
      'Animations.pressBounce': {
        _type: 'Animation',
        name: 'pressBounce',
        enabled: true,
        kind: 'transition',
        trigger: { type: 'stateChange', from: ['*'], to: ['pressed'] },
        targets: [{ path: `Parts.${selectedLayer}.Layout.scale`, properties: ['transform'] }],
        duration: 90,
        delay: 0,
        easing: 'outQuad',
      },
    };
  }
  if (recipe.id === 'move.rotateValue') {
    const target = selectedLayer;
    return {
      [`Bindings.${target}Rotation`]: {
        _type: 'Binding',
        name: `${target}Rotation`,
        enabled: true,
        source: normalizedSource,
        mapMode: 'range',
        target: `Parts.${target}.Layout.rotation`,
        outputUnit: 'deg',
        inputMin: 0,
        inputMax: 1,
        outputMin: -135,
        outputMax: 135,
        falseValue: -135,
        trueValue: 135,
        enumMap: {},
        clamp: true,
        round: false,
        invert: false,
      },
    };
  }
  if (recipe.id === 'move.trackValue') {
    const target = selectedLayer;
    return {
      [`Bindings.${target}TrackX`]: {
        _type: 'Binding',
        name: `${target}TrackX`,
        enabled: true,
        source: normalizedSource,
        mapMode: 'range',
        target: `Parts.${target}.Layout.x`,
        outputUnit: 'percent',
        inputMin: 0,
        inputMax: 1,
        outputMin: 14,
        outputMax: 86,
        falseValue: 14,
        trueValue: 86,
        enumMap: {},
        clamp: true,
        round: false,
        invert: false,
      },
      'HitZones.mainDragArea': createHitZone('mainDragArea', {
        targetBehavior: 'mainSlider',
        targetValueChannel: selectedChannel,
        action: 'dragValue',
      }),
      'Designer.preview.showHitZones': true,
    };
  }
  if (recipe.id === 'generator.ticks') {
    return {
      'Generators.majorTicks': {
        _type: 'Generator',
        name: 'majorTicks',
        type: 'ticks',
        enabled: true,
        targetBehavior: 'mainSlider',
        geometry: 'linear',
        count: 11,
        minorCount: 3,
        placement: 'outside',
        generatedPartPrefix: 'tick',
        generatedHitZones: false,
        detachable: true,
      },
      'Designer.selectedGenerator': 'majorTicks',
    };
  }
  if (recipe.id === 'generator.xyGrid') {
    return {
      'ValueChannels.xValue': createValueChannel('xValue', { label: 'X Value', defaultValue: 0.5 }),
      'ValueChannels.yValue': createValueChannel('yValue', { label: 'Y Value', defaultValue: 0.5 }),
      'Behaviors.xyPad': {
        ...createBehaviorModule('xyPad', { type: 'xy-pad', role: 'xy-pad', valueChannel: 'xValue', geometry: 'grid' }),
        valueChannels: ['xValue', 'yValue'],
      },
      'Generators.xyGrid': {
        _type: 'Generator',
        name: 'xyGrid',
        type: 'grid',
        enabled: true,
        targetBehavior: 'xyPad',
        targetValueChannel: 'xValue',
        targetValueChannelY: 'yValue',
        geometry: 'grid',
        rows: 4,
        columns: 4,
        generatedPartPrefix: 'xyGrid',
        generatedHitZones: true,
        hitZoneAction: 'setValue',
        detachable: true,
      },
      'PublishedProperties.inputs.xValue': { channel: 'xValue', label: 'X Value', type: 'float', enabled: true },
      'PublishedProperties.inputs.yValue': { channel: 'yValue', label: 'Y Value', type: 'float', enabled: true },
      'PublishedProperties.outputs.xValue': { channel: 'xValue', label: 'X Value', type: 'float', enabled: true },
      'PublishedProperties.outputs.yValue': { channel: 'yValue', label: 'Y Value', type: 'float', enabled: true },
      'Designer.selectedValueChannel': 'xValue',
      'Designer.selectedBehavior': 'xyPad',
      'Designer.selectedGenerator': 'xyGrid',
      'Designer.preview.showHitZones': true,
    };
  }
  if (recipe.id === 'generator.pianoBar') {
    return {
      'ValueChannels.note': createValueChannel('note', {
        label: 'Note',
        type: 'int',
        min: 0,
        max: 127,
        step: 1,
        defaultValue: 60,
        format: { precision: 0, unit: 'midi' },
      }),
      'Behaviors.pianoBar': createBehaviorModule('pianoBar', {
        type: 'piano-bar',
        role: 'piano',
        valueChannel: 'note',
        geometry: 'piano',
      }),
      'Generators.pianoKeys': {
        _type: 'Generator',
        name: 'pianoKeys',
        type: 'piano-keys',
        enabled: true,
        targetBehavior: 'pianoBar',
        targetValueChannel: 'note',
        geometry: 'piano',
        count: 24,
        baseNote: 48,
        generatedPartPrefix: 'piano',
        generatedHitZones: true,
        hitZoneAction: 'noteValue',
        detachable: true,
      },
      'PublishedProperties.inputs.note': { channel: 'note', label: 'Note', type: 'int', enabled: true },
      'PublishedProperties.outputs.note': { channel: 'note', label: 'Note', type: 'int', enabled: true },
      'Designer.selectedValueChannel': 'note',
      'Designer.selectedBehavior': 'pianoBar',
      'Designer.selectedGenerator': 'pianoKeys',
      'Designer.preview.showHitZones': true,
    };
  }
  if (recipe.id === 'asset.filmstrip') {
    return {
      'Assets.filmstrips.knobFilmstrip': {
        source: '',
        frameCount: 31,
        frameWidth: 0,
        frameHeight: 0,
        orientation: 'vertical',
        interpolation: 'nearest',
        valueSource: selectedChannel,
      },
      'Generators.filmstripKnob': {
        _type: 'Generator',
        name: 'filmstripKnob',
        type: 'filmstrip-frames',
        enabled: true,
        generatedPartPrefix: 'filmstrip',
        assetName: 'knobFilmstrip',
        zIndex: 12,
      },
      'Designer.selectedAsset': 'knobFilmstrip',
      'Designer.selectedGenerator': 'filmstripKnob',
    };
  }
  if (recipe.id === 'logic.twoSlidersSwitch') {
    return {
      'ValueChannels.valueA': createValueChannel('valueA', { label: 'Value A', defaultValue: 0.25 }),
      'ValueChannels.valueB': createValueChannel('valueB', { label: 'Value B', defaultValue: 0.75 }),
      'ValueChannels.mode': createValueChannel('mode', {
        label: 'Mode',
        type: 'enum',
        defaultValue: 'A',
        format: { precision: 0 },
      }),
      'ValueChannels.mode.values': ['A', 'B'],
      'Behaviors.sliderA': createBehaviorModule('sliderA', {
        type: 'slider',
        role: 'slider',
        valueChannel: 'valueA',
        geometry: 'linear',
      }),
      'Behaviors.sliderB': createBehaviorModule('sliderB', {
        type: 'slider',
        role: 'slider',
        valueChannel: 'valueB',
        geometry: 'linear',
      }),
      'Behaviors.switchMode': createBehaviorModule('switchMode', {
        type: 'cycle',
        role: 'button',
        valueChannel: 'mode',
        geometry: 'none',
      }),
      'HitZones.sliderAZone': createHitZone('sliderAZone', {
        targetBehavior: 'sliderA',
        targetValueChannel: 'valueA',
        action: 'dragValue',
        bounds: { x: 0, y: 0, width: 78, height: 50, unit: 'percent' },
      }),
      'HitZones.sliderBZone': createHitZone('sliderBZone', {
        targetBehavior: 'sliderB',
        targetValueChannel: 'valueB',
        action: 'dragValue',
        bounds: { x: 0, y: 50, width: 78, height: 50, unit: 'percent' },
      }),
      'HitZones.switchModeZone': createHitZone('switchModeZone', {
        shape: 'circle',
        targetBehavior: 'switchMode',
        targetValueChannel: 'mode',
        action: 'cycleValue',
        bounds: { x: 80, y: 20, width: 18, height: 60, unit: 'percent' },
      }),
      'Links.activeValueRoute': {
        _type: 'Link',
        name: 'activeValueRoute',
        enabled: true,
        type: 'switch',
        source: 'mode',
        target: 'mainValue',
        condition: '',
        expression: 'mode === "A" ? valueA : valueB',
        notes: 'Routes the active slider value into mainValue for combined controls.',
      },
      'Designer.selectedValueChannel': 'valueA',
      'Designer.selectedBehavior': 'sliderA',
      'Designer.preview.showHitZones': true,
    };
  }
  return null;
}
