import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  applyPanelCustomLinkRoutes,
  createPanelCustomRouteLink,
  listPanelCustomApiEndpoints,
  listPanelCustomRouteLinks,
} from '../src/CE_Application/utils/panelCustomComponentLinks.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { instantiateCustomComponentPackageControl } from '../src/CE_Application/utils/customComponentPackage.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

const OUTPUT_PANEL = 'C:/tmp/CEditor_Custom_Component_Showcase.cepanel';
const OUTPUT_REPORT = 'C:/tmp/CEditor_Custom_Component_Showcase.report.json';
const THREE_VALUE_PACKAGE = 'C:/tmp/circular-three-value-slider.ceditor-component.json';

function setAtPath(object, path, value) {
  const parts = String(path).split('.');
  let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (current?._children?.[key] !== undefined) {
      current = current._children[key];
    } else {
      current[key] ??= {};
      current = current[key];
    }
  }
  const finalKey = parts.at(-1);
  if (current?._children?.[finalKey] !== undefined) current._children[finalKey] = value;
  else current[finalKey] = value;
}

function setChannel(control, channelName, value) {
  const channel = control?._children?.ValueChannels?._children?.[channelName];
  if (!channel) return;
  channel.defaultValue = value;
  channel.currentValue = value;
}

function starter(starterId, options) {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch(starterId));
  applyPatchObject(control, {
    'Core.id': options.id,
    'Core.name': options.name,
    'Transform.x': options.x,
    'Transform.y': options.y,
    'Transform.width': options.width,
    'Transform.height': options.height,
  });
  for (const [channel, value] of Object.entries(options.values ?? {})) {
    setChannel(control, channel, value);
  }
  for (const [path, value] of Object.entries(options.tweaks ?? {})) {
    setAtPath(control, path, value);
  }
  return control;
}

function label(id, text, x, y, width, height, style = {}) {
  return createControl('Label', {
    Core: { id, name: id },
    Transform: { x, y, width, height },
    Text: {
      content: text,
      _children: {
        Fill: { colour: style.colour ?? 'FFD9E5EF' },
        Font: { size: style.size ?? 12, weight: style.weight ?? 'SemiBold', weightValue: style.weightValue ?? 600 },
        Position: { justification: style.justification ?? 'left' },
      },
    },
    Background: {
      _children: {
        Fill: { colour: style.background ?? '00000000', solidEnabled: style.background != null },
        Border: { enabled: style.borderEnabled ?? false, colour: style.borderColour ?? '22FFFFFF', thickness: 1 },
        Corners: { radius: style.radius ?? 5 },
      },
    },
    ContentLayout: {
      horizontalAlign: style.justification === 'centred' ? 'center' : 'left',
      verticalAlign: 'center',
      paddingLeft: style.paddingLeft ?? 4,
      paddingRight: style.paddingRight ?? 4,
    },
  });
}

function endpoint(endpoints, controlId, channel, direction) {
  return endpoints.find((item) =>
    item.controlId === controlId
    && item.channel === channel
    && item.direction === direction
  );
}

function addRoute(controls, sourceId, sourceChannel, targetId, targetChannel, name) {
  const endpoints = listPanelCustomApiEndpoints(controls);
  const source = endpoint(endpoints, sourceId, sourceChannel, 'output');
  const target = endpoint(endpoints, targetId, targetChannel, 'input');
  if (!source || !target) return false;
  const sourceControl = controls.find((control) => control?._children?.Core?.id === sourceId);
  const link = createPanelCustomRouteLink(source, target, { name });
  sourceControl._children.Links ??= { _type: 'Links', enabled: true, debug: false, _children: {} };
  sourceControl._children.Links._children[name] = link;
  return true;
}

async function loadThreeValueCircularControl() {
  if (!existsSync(THREE_VALUE_PACKAGE)) return null;
  const envelope = JSON.parse(await readFile(THREE_VALUE_PACKAGE, 'utf8'));
  return instantiateCustomComponentPackageControl(envelope, {
    id: 'custom_circular_three_value',
    name: 'Three Value Circular Slider',
    Transform: { x: 544, y: 86, width: 184, height: 184 },
  });
}

function cleanPresentationControl(control) {
  if (!control?._children) return control;
  if (control._children.Designer?.preview) {
    control._children.Designer.preview.showHitZones = false;
    control._children.Designer.preview.showBounds = false;
    control._children.Designer.preview.showValues = true;
  }
  for (const zone of Object.values(control._children.HitZones?._children ?? {})) {
    zone.visibleInEditor = false;
  }
  return control;
}

function hideParts(control, partNames = []) {
  for (const partName of partNames) {
    const part = control?._children?.Parts?._children?.[partName];
    if (part) part.visible = false;
  }
  return control;
}

function setArcTrackPart(part, { startAngle = -135, sweepAngle = 270, direction = 'cw' } = {}) {
  if (!part) return;
  const border = part._children?.Background?._children?.Border ?? {};
  part.kind = 'arcTrack';
  part.meta = {
    ...(part.meta ?? {}),
    renderer: 'arcTrack',
    arcTrack: {
      startAngle,
      sweepAngle,
      direction,
      thickness: Number(border.thickness ?? part.meta?.arcTrack?.thickness ?? 6),
      colour: border.colour ?? part.meta?.arcTrack?.colour ?? 'FF2B3742',
    },
  };
}

function tuneImportedThreeValueControl(control) {
  if (!control) return null;
  applyPatchObject(control, {
    'Transform.x': 652,
    'Transform.y': 112,
    'Transform.width': 190,
    'Transform.height': 190,
  });
  for (const behavior of Object.values(control._children?.Behaviors?._children ?? {})) {
    if (String(behavior?.geometry ?? '').toLowerCase() === 'circular') {
      behavior.startAngle = -135;
      behavior.endAngle = 135;
      behavior.sweepAngle = 270;
      behavior.direction = 'cw';
      behavior.centerX = 50;
      behavior.centerY = 52;
    }
  }
  const parts = control._children?.Parts?._children ?? {};
  setArcTrackPart(parts.outerTrack);
  setArcTrackPart(parts.middleTrack);
  setArcTrackPart(parts.innerTrack);
  if (parts.minValueArc) parts.minValueArc.zIndex = 8;
  if (parts.mainValueArc) parts.mainValueArc.zIndex = 9;
  if (parts.maxValueArc) parts.maxValueArc.zIndex = 10;
  const zones = control._children?.HitZones?._children ?? {};
  if (zones.minRingZone) {
    zones.minRingZone.startAngle = -135;
    zones.minRingZone.endAngle = 135;
    zones.minRingZone.sweepAngle = 270;
    zones.minRingZone.direction = 'cw';
    zones.minRingZone.innerRadius = 0.86;
    zones.minRingZone.outerRadius = 1;
  }
  if (zones.mainRingZone) {
    zones.mainRingZone.startAngle = -135;
    zones.mainRingZone.endAngle = 135;
    zones.mainRingZone.sweepAngle = 270;
    zones.mainRingZone.direction = 'cw';
    zones.mainRingZone.innerRadius = 0.82;
    zones.mainRingZone.outerRadius = 1;
  }
  if (zones.maxRingZone) {
    zones.maxRingZone.startAngle = -135;
    zones.maxRingZone.endAngle = 135;
    zones.maxRingZone.sweepAngle = 270;
    zones.maxRingZone.direction = 'cw';
    zones.maxRingZone.innerRadius = 0.78;
    zones.maxRingZone.outerRadius = 1;
  }
  for (const generator of Object.values(control._children?.Generators?._children ?? {})) {
    if (String(generator?.type ?? '').toLowerCase().includes('tick')) {
      generator.count = Math.min(Number(generator.count ?? 11), 11);
      generator.minorCount = 0;
    }
  }
  hideParts(control, ['minNeedle', 'mainNeedle', 'maxNeedle']);
  return cleanPresentationControl(control);
}

function cleanStarter(starterId, options) {
  const control = cleanPresentationControl(starter(starterId, options));
  hideParts(control, options.hideParts ?? []);
  return control;
}

function buildCleanPanel(threeValueControl = null) {
  const panel = createPanel('Custom Component Showcase');
  panel.width = 1600;
  panel.height = 920;
  panel.resizable = true;
  panel.minWidth = 1100;
  panel.minHeight = 700;
  panel.author = 'CEditor / Codex';
  panel.description = 'Clean gallery panel for custom components: LED rings, circular sliders, grids, piano bars, filmstrips, multi-value controls, and public API routes.';
  panel.bgColour = 'FF15191D';
  panel.gridEnabled = false;

  const controls = [
    label('title', 'Custom Component Showcase', 40, 24, 460, 34, { size: 22, weightValue: 800, colour: 'FFFFFFFF' }),
    label('subtitle', 'Clean gallery version: generated parts are real runtime visuals; editor hit-zone/bounds helpers are hidden.', 42, 60, 860, 24, { size: 12, colour: 'FF9FB2C2' }),

    cleanStarter('starter.circularLedRing', {
      id: 'custom_led_cumulative',
      name: 'LED Ring - Cumulative',
      x: 48,
      y: 112,
      width: 190,
      height: 190,
      hideParts: ['outerGuide', 'innerGuide'],
      tweaks: {
        'Parts.label._children.Text.content': 'LED RING',
        'Generators._children.ledRing.startAngle': -135,
        'Generators._children.ledRing.endAngle': 135,
        'Generators._children.ledRing.activeColour': 'FFFF3B30',
        'Generators._children.ledRing.inactiveColour': '55241116',
      },
    }),
    label('caption_led_cumulative', 'default cumulative LED ring, 0-127', 50, 314, 250, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.circularLedRing', {
      id: 'custom_led_single_dot',
      name: 'LED Ring - Single Dot',
      x: 350,
      y: 112,
      width: 190,
      height: 190,
      values: { mainValue: 39 },
      hideParts: ['outerGuide', 'innerGuide'],
      tweaks: {
        'Parts.label._children.Text.content': 'SCAN RING',
        'Generators._children.ledRing.count': 20,
        'Generators._children.ledRing.ledSize': 7,
        'Generators._children.ledRing.activationMode': 'single',
        'Generators._children.ledRing.activeColour': 'FFFF3B30',
        'Generators._children.ledRing.inactiveColour': '55241116',
        'Generators._children.ledRing.radius': 39,
        'Generators._children.ledRing.startAngle': -160,
        'Generators._children.ledRing.endAngle': 160,
      },
    }),
    label('caption_led_single', 'single active LED scan/select style', 350, 314, 250, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.circularTickSlider', {
      id: 'custom_tick_slider',
      name: 'Circular Tick Slider',
      x: 956,
      y: 112,
      width: 184,
      height: 184,
      values: { mainValue: 0.72 },
      hideParts: ['pointer'],
      tweaks: {
        'Parts.label._children.Text.content': 'TICK DIAL',
        'Generators._children.majorTicks.count': 7,
        'Generators._children.majorTicks.minorCount': 0,
      },
    }),
    label('caption_tick', 'circular slider with visible value arc and ticks', 948, 314, 300, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.macroRings', {
      id: 'custom_macro_rings',
      name: 'Three Ring Macro',
      x: 1250,
      y: 112,
      width: 190,
      height: 190,
      values: { outerValue: 0.82, middleValue: 0.44, innerValue: 0.18 },
      hideParts: ['outerPointer', 'middlePointer', 'innerPointer'],
      tweaks: { 'Parts.label._children.Text.content': 'MACRO 3' },
    }),
    label('caption_macro', 'three independent ring values', 1250, 314, 260, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.xyGridPad', {
      id: 'custom_xy_grid',
      name: 'XY Grid Pad',
      x: 52,
      y: 396,
      width: 230,
      height: 230,
      values: { xValue: 0.66, yValue: 0.32, pressure: 0.75 },
      tweaks: {
        'Parts.label._children.Text.content': 'ROUTED XY',
        'Generators._children.xyGrid.rows': 6,
        'Generators._children.xyGrid.columns': 6,
        'Generators._children.xyGrid.colour': '335DD7B7',
      },
    }),
    label('caption_xy', 'generated 6 x 6 grid with X/Y public values', 52, 640, 310, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.tripleValueSlider', {
      id: 'custom_triple_slider',
      name: 'Triple Value Slider',
      x: 372,
      y: 418,
      width: 330,
      height: 136,
      values: { minValue: 0.18, mainValue: 0.52, maxValue: 0.87 },
      tweaks: { 'Parts.label._children.Text.content': 'MIN / VALUE / MAX' },
    }),
    label('caption_triple', 'three handles: min, current, max', 374, 568, 260, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.dualSliderSwitch', {
      id: 'custom_dual_switch',
      name: 'Dual Slider Switch',
      x: 760,
      y: 420,
      width: 300,
      height: 126,
      values: { mainValue: 0.25, valueA: 0.26, valueB: 0.78, mode: 'B' },
      tweaks: { 'Parts.label._children.Text.content': 'A / B SWITCH' },
    }),
    label('caption_dual', 'two sliders and a button sharing one output', 760, 568, 320, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.filmstripKnob', {
      id: 'custom_filmstrip_knob',
      name: 'Filmstrip Knob',
      x: 1130,
      y: 390,
      width: 176,
      height: 176,
      values: { mainValue: 0.64 },
      hideParts: ['pointer'],
      tweaks: { 'Parts.label._children.Text.content': 'FILMSTRIP' },
    }),
    label('caption_filmstrip', 'embedded filmstrip frame plus pointer fallback', 1106, 580, 320, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.scrollPianoBar', {
      id: 'custom_piano_bar',
      name: 'Scrollable Piano Bar',
      x: 50,
      y: 718,
      width: 420,
      height: 126,
      values: { note: 67, scroll: 0.45, velocity: 0.82 },
      tweaks: {
        'Parts.label._children.Text.content': 'PIANO SCROLLER',
        'Generators._children.pianoKeys.count': 24,
        'Generators._children.pianoKeys.baseNote': 48,
      },
    }),
    label('caption_piano', 'generated piano keybed with note, scroll and velocity', 52, 852, 420, 22, { size: 11, colour: 'FFB7C9D8' }),

    cleanStarter('starter.circularLedRing', {
      id: 'custom_led_ladder',
      name: 'Vertical LED Ladder',
      x: 540,
      y: 704,
      width: 150,
      height: 170,
      values: { mainValue: 110 },
      hideParts: ['outerGuide', 'innerGuide'],
      tweaks: {
        'Parts.label._children.Text.content': 'LADDER',
        'Generators._children.ledRing.geometry': 'vertical',
        'Generators._children.ledRing.count': 12,
        'Generators._children.ledRing.ledSize': 10,
        'Generators._children.ledRing.activeColour': 'FFFF3B30',
        'Generators._children.ledRing.inactiveColour': '55241116',
      },
    }),
    label('caption_ladder', 'LED generator in vertical geometry', 520, 852, 250, 22, { size: 11, colour: 'FFB7C9D8' }),

    label('routes_title', 'Public API Routes', 790, 704, 260, 26, { size: 16, weightValue: 800, colour: 'FFFFFFFF' }),
    label('routes_body',
      'Saved routes: LED ring -> tick dial -> filmstrip; macro rings -> XY grid; triple slider -> scan ring; dual switch -> three-value circular slider.',
      790,
      742,
      650,
      86,
      { size: 12, colour: 'FFD6E0EA', background: '33182028', borderEnabled: true, paddingLeft: 12 }),
  ];

  const tunedThreeValueControl = tuneImportedThreeValueControl(threeValueControl);
  if (tunedThreeValueControl) {
    controls.splice(7, 0,
      tunedThreeValueControl,
      label('caption_three_circle', 'imported package: min/current/max circular slider', 638, 314, 320, 22, { size: 11, colour: 'FFB7C9D8' }),
    );
  }

  addRoute(controls, 'custom_led_cumulative', 'mainValue', 'custom_tick_slider', 'mainValue', 'route_led_to_tick');
  addRoute(controls, 'custom_tick_slider', 'mainValue', 'custom_filmstrip_knob', 'mainValue', 'route_tick_to_filmstrip');
  addRoute(controls, 'custom_macro_rings', 'outerValue', 'custom_xy_grid', 'xValue', 'route_macro_outer_to_xy_x');
  addRoute(controls, 'custom_macro_rings', 'innerValue', 'custom_xy_grid', 'yValue', 'route_macro_inner_to_xy_y');
  addRoute(controls, 'custom_triple_slider', 'mainValue', 'custom_led_single_dot', 'mainValue', 'route_triple_to_single_led');
  if (tunedThreeValueControl) {
    addRoute(controls, 'custom_dual_switch', 'mainValue', 'custom_circular_three_value', 'mainValue', 'route_dual_to_three_circle');
  }

  panel.controls = controls;
  return panel;
}

function buildPanel(threeValueControl = null) {
  const panel = createPanel('Custom Component Showcase');
  panel.width = 1240;
  panel.height = 760;
  panel.resizable = true;
  panel.minWidth = 980;
  panel.minHeight = 620;
  panel.author = 'CEditor / Codex';
  panel.description = 'A stress-test panel for generated custom components, public value channels, generators, hit zones, filmstrips, and component-to-component routes.';
  panel.bgColour = 'FF15191D';
  panel.gridEnabled = false;

  const controls = [
    label('title', 'Custom Component Showcase', 24, 18, 420, 30, { size: 20, weightValue: 800, colour: 'FFFFFFFF' }),
    label('subtitle', 'Generated controls: LED rings, circular sliders, grids, piano bars, filmstrip frames, multi-value controls, and routed custom APIs.', 26, 48, 860, 24, { size: 12, colour: 'FF9FB2C2' }),

    starter('starter.circularLedRing', {
      id: 'custom_led_cumulative',
      name: 'LED Ring - Cumulative',
      x: 32,
      y: 86,
      width: 168,
      height: 168,
      values: { mainValue: 94 },
      tweaks: {
        'Parts.label._children.Text.content': 'LED RING',
        'Generators._children.ledRing.count': 32,
        'Generators._children.ledRing.activeColour': 'FFFFC84A',
        'Generators._children.ledRing.inactiveColour': '662A333D',
        'Generators._children.ledRing.radius': 39,
      },
    }),
    label('caption_led_cumulative', '32-step circular LED ring, 0-127 value', 34, 258, 188, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.circularLedRing', {
      id: 'custom_led_single_dot',
      name: 'LED Ring - Single Dot',
      x: 232,
      y: 86,
      width: 168,
      height: 168,
      values: { mainValue: 39 },
      tweaks: {
        'Parts.label._children.Text.content': 'SCAN RING',
        'Generators._children.ledRing.count': 28,
        'Generators._children.ledRing.activationMode': 'single',
        'Generators._children.ledRing.activeColour': 'FF64D98A',
        'Generators._children.ledRing.inactiveColour': '55334445',
        'Generators._children.ledRing.radius': 41,
        'Generators._children.ledRing.startAngle': -180,
        'Generators._children.ledRing.endAngle': 180,
      },
    }),
    label('caption_led_single', 'single active LED mode for scan/select style controls', 232, 258, 214, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.circularTickSlider', {
      id: 'custom_tick_slider',
      name: 'Circular Tick Slider',
      x: 432,
      y: 92,
      width: 156,
      height: 156,
      values: { mainValue: 0.72 },
      tweaks: {
        'Parts.label._children.Text.content': 'TICK DIAL',
        'Generators._children.majorTicks.count': 17,
        'Generators._children.majorTicks.minorCount': 2,
      },
    }),
    label('caption_tick', 'circular slider with generated ticks and animated pointer', 424, 258, 246, 24, { size: 11, colour: 'FFB7C9D8' }),
  ];

  if (threeValueControl) {
    controls.push(
      threeValueControl,
      label('caption_three_circle', 'imported saved custom package: min/current/max circular slider', 526, 276, 300, 24, { size: 11, colour: 'FFB7C9D8' }),
    );
  }

  controls.push(
    starter('starter.macroRings', {
      id: 'custom_macro_rings',
      name: 'Three Ring Macro',
      x: 750,
      y: 86,
      width: 178,
      height: 178,
      values: { outerValue: 0.82, midValue: 0.44, innerValue: 0.18 },
      tweaks: { 'Parts.label._children.Text.content': 'MACRO 3' },
    }),
    label('caption_macro', 'three independent ring values and nested hit zones', 746, 276, 260, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.xyGridPad', {
      id: 'custom_xy_grid',
      name: 'XY Grid Pad',
      x: 968,
      y: 86,
      width: 184,
      height: 184,
      values: { xValue: 0.66, yValue: 0.32, pressure: 0.75 },
      tweaks: {
        'Parts.label._children.Text.content': 'ROUTED XY',
        'Generators._children.xyGrid.rows': 10,
        'Generators._children.xyGrid.columns': 12,
        'Generators._children.xyGrid.colour': '445DD7B7',
      },
    }),
    label('caption_xy', 'generated 12 x 10 grid; X/Y can be routed from other controls', 948, 276, 278, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.tripleValueSlider', {
      id: 'custom_triple_slider',
      name: 'Triple Value Slider',
      x: 42,
      y: 338,
      width: 300,
      height: 128,
      values: { minValue: 0.18, mainValue: 0.52, maxValue: 0.87 },
      tweaks: { 'Parts.label._children.Text.content': 'MIN / VALUE / MAX' },
    }),
    label('caption_triple', 'three handles: min, current, max', 44, 470, 240, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.dualSliderSwitch', {
      id: 'custom_dual_switch',
      name: 'Dual Slider Switch',
      x: 374,
      y: 350,
      width: 260,
      height: 110,
      values: { mainValue: 0.25, valueA: 0.26, valueB: 0.78, mode: 'B' },
      tweaks: { 'Parts.label._children.Text.content': 'A / B SWITCH' },
    }),
    label('caption_dual', 'two sliders and a mode button sharing one public output', 370, 470, 300, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.filmstripKnob', {
      id: 'custom_filmstrip_knob',
      name: 'Filmstrip Knob',
      x: 686,
      y: 330,
      width: 152,
      height: 152,
      values: { mainValue: 0.64 },
      tweaks: { 'Parts.label._children.Text.content': 'FILMSTRIP' },
    }),
    label('caption_filmstrip', 'embedded placeholder filmstrip plus fallback pointer', 660, 486, 270, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.scrollPianoBar', {
      id: 'custom_piano_bar',
      name: 'Scrollable Piano Bar',
      x: 876,
      y: 354,
      width: 326,
      height: 112,
      values: { note: 67, scroll: 0.45, velocity: 0.82 },
      tweaks: {
        'Parts.label._children.Text.content': 'PIANO SCROLLER',
        'Generators._children.pianoKeys.count': 42,
        'Generators._children.pianoKeys.baseNote': 36,
      },
    }),
    label('caption_piano', 'generated piano keybed with note, scroll and velocity channels', 874, 470, 326, 24, { size: 11, colour: 'FFB7C9D8' }),

    starter('starter.circularLedRing', {
      id: 'custom_led_ladder',
      name: 'Vertical LED Ladder',
      x: 48,
      y: 548,
      width: 130,
      height: 170,
      values: { mainValue: 110 },
      tweaks: {
        'Parts.label._children.Text.content': 'LADDER',
        'Generators._children.ledRing.geometry': 'vertical',
        'Generators._children.ledRing.count': 16,
        'Generators._children.ledRing.ledSize': 10,
        'Generators._children.ledRing.activeColour': 'FFFF5B6A',
        'Generators._children.ledRing.inactiveColour': '552C3138',
      },
    }),
    label('caption_ladder', 'same LED generator in vertical geometry', 38, 720, 220, 24, { size: 11, colour: 'FFB7C9D8' }),

    label('routes_title', 'Public API Routes', 238, 548, 220, 24, { size: 15, weightValue: 800, colour: 'FFFFFFFF' }),
    label('routes_body',
      'Routes are saved inside the source custom components: cumulative LED -> tick dial -> filmstrip; macro outer/inner -> XY grid; triple current -> second LED ring.',
      238,
      580,
      760,
      72,
      { size: 12, colour: 'FFD6E0EA', background: '33182028', borderEnabled: true, paddingLeft: 12 }),
    label('release_note',
      'Open this .cepanel in the release app, switch to preview/run mode, then drag the controls. The generator layers and links are part of the saved panel.',
      238,
      664,
      820,
      44,
      { size: 12, colour: 'FFAAC0D1', background: '22182028', borderEnabled: true, paddingLeft: 12 }),
  );

  addRoute(controls, 'custom_led_cumulative', 'mainValue', 'custom_tick_slider', 'mainValue', 'route_led_to_tick');
  addRoute(controls, 'custom_tick_slider', 'mainValue', 'custom_filmstrip_knob', 'mainValue', 'route_tick_to_filmstrip');
  addRoute(controls, 'custom_macro_rings', 'outerValue', 'custom_xy_grid', 'xValue', 'route_macro_outer_to_xy_x');
  addRoute(controls, 'custom_macro_rings', 'innerValue', 'custom_xy_grid', 'yValue', 'route_macro_inner_to_xy_y');
  addRoute(controls, 'custom_triple_slider', 'mainValue', 'custom_led_single_dot', 'mainValue', 'route_triple_to_single_led');
  if (threeValueControl) {
    addRoute(controls, 'custom_dual_switch', 'mainValue', 'custom_circular_three_value', 'mainValue', 'route_dual_to_three_circle');
  }

  panel.controls = controls;
  return panel;
}

function verificationFor(control) {
  if (control?._children?.Core?.controlType !== 'CustomComponent') return null;
  const values = seedCustomValues(control);
  const snapshot = materializedCustomComponentSnapshot(control, {
    valueNormalized: 0.5,
    customValues: values,
  });
  const snapshotParts = Object.values(snapshot?._children?.Parts?._children ?? {});
  const resolved = resolveInteractiveControl(control, {
    customValues: values,
    animationsEnabled: true,
  });
  return {
    id: control._children.Core.id,
    name: control._children.Core.name,
    valueChannels: Object.keys(control._children.ValueChannels?._children ?? {}),
    parts: Object.keys(resolved.control?._children?.Parts?._children ?? {}).length,
    generatedParts: snapshotParts.filter((part) => part?.generated === true).length,
    hitZones: Object.keys(resolved.control?._children?.HitZones?._children ?? {}).length,
    activeStates: resolved.runtime?.activeStates ?? [],
  };
}

async function main() {
  const threeValueControl = await loadThreeValueCircularControl();
  const panel = buildCleanPanel(threeValueControl);
  const routeLinks = listPanelCustomRouteLinks(panel.controls);
  const sessions = Object.fromEntries(
    panel.controls
      .filter((control) => control?._children?.Core?.controlType === 'CustomComponent')
      .map((control) => [control._children.Core.id, { customValues: seedCustomValues(control) }]),
  );
  const routedSessions = applyPanelCustomLinkRoutes(panel.controls, sessions);

  const report = {
    panelPath: OUTPUT_PANEL,
    width: panel.width,
    height: panel.height,
    controlCount: panel.controls.length,
    customControlCount: panel.controls.filter((control) => control?._children?.Core?.controlType === 'CustomComponent').length,
    routeCount: routeLinks.length,
    routes: routeLinks.map((route) => ({
      name: route.name,
      source: `${route.source.controlName}.${route.source.channel}`,
      target: `${route.target?.controlName ?? 'missing'}.${route.target?.channel ?? 'missing'}`,
      compatibility: route.compatibility.status,
      warning: route.compatibility.warning,
      broken: route.broken,
    })),
    importedThreeValuePackage: threeValueControl != null,
    routedSessionChanged: routedSessions !== sessions,
    customComponents: panel.controls.map(verificationFor).filter(Boolean),
  };

  await writeFile(OUTPUT_PANEL, serializePanel(panel), 'utf8');
  await writeFile(OUTPUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
