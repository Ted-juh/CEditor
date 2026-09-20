import { setAnatomy } from './controlAnatomy.js';
// Visual properties only. Musical values, routing, gestures and authored edits remain local.
// Each row is a design direction, not a new name for a palette.
export const STARTER_CONTROL_SETS = [
  { id: 'graphite', title: 'Flat / essential', detail: 'Flat discs, sliding tabs, broad action tiles and continuous bars.', pad: 'flat', radius: 6, handle: 'round', meter: 0, ribbon: 'strip', matrix: 'bar' },
  { id: 'blueprint', title: 'Technical / outline', detail: 'Exposed rotating pointers, crosshair keys, knife switches and ruler cursors.', pad: 'outline', radius: 0, handle: 'ring', meter: 12, ribbon: 'strip', matrix: 'dot' },
  { id: 'pop', title: 'Playful / print', detail: 'Rotating folded tabs, paper keys, sliding bookmarks and tally tickets.', pad: 'raised', radius: 24, handle: 'round', meter: 8, ribbon: 'strip', matrix: 'dot' },
  { id: 'soft', title: 'Soft / relief', detail: 'Moulded pebble dials, compressing cushions, oval rockers and capsule meters.', pad: 'raised', radius: 16, handle: 'round', meter: 0, ribbon: 'wheel', matrix: 'bar' },
  { id: 'frost', title: 'Frosted / translucent', detail: 'Open rotating rings, glass-disc keys, orbit switches and translucent columns.', pad: 'glass', radius: 18, handle: 'ring', meter: 0, ribbon: 'strip', matrix: 'dot' },
  { id: 'obsidian', title: 'Glass / illuminated', detail: 'Optical lenses, touch strips, split switches and mechanical digit windows.', pad: 'glass', radius: 7, handle: 'ring', meter: 24, ribbon: 'strip', matrix: 'dot' },
  { id: 'console', title: 'Studio / console', detail: 'Skirted pointer dials, piano keys, latching caps and live VU needles.', pad: 'inset', radius: 2, handle: 'blade', meter: 20, ribbon: 'wheel3d', matrix: 'bar' },
  { id: 'carbon', title: 'Performance / rubber', detail: 'Grooved rollers, recessed rubber pads, bending straps and raised meter blocks.', pad: 'inset', radius: 9, handle: 'blade', meter: 16, ribbon: 'wheel3d', matrix: 'bar' },
  { id: 'machined', title: 'Precision / metal', detail: 'Vernier scales, hexagonal plungers, sliding bolts and instrument needle dials.', pad: 'raised', radius: 3, handle: 'block', meter: 30, ribbon: 'wheel3d', matrix: 'bar' },
  { id: 'tolex', title: 'Vintage / bakelite', detail: 'Radio tuning windows, typewriter keys, Bakelite levers and arched needle meters.', pad: 'raised', radius: 10, handle: 'block', meter: 10, ribbon: 'wheel3d', matrix: 'dot' },
  { id: 'field', title: 'Field / instrument', detail: 'Scalloped selectors, guarded keys and toggles, and flag-style indicators.', pad: 'chamfer', radius: 8, handle: 'block', meter: 12, ribbon: 'wheel', matrix: 'bar' },
  { id: 'phosphor', title: 'Signal / LED', detail: 'Segment encoders, pixel keys, binary switch cells and dot-array meters.', pad: 'outline', radius: 3, handle: 'ring', meter: 32, ribbon: 'strip', matrix: 'dot' },
];

const DIRECTIONS = new Map(STARTER_CONTROL_SETS.map((entry) => [entry.id, entry]));
export function starterDirection(id) { return DIRECTIONS.get(id) ?? null; }

// The remaining catalogue reuses the nearest family grammar. The picker distinguishes the
// twelve starting points from these additional finishes rather than promising thirty forms.
const RELATED = {
  ivory: 'blueprint', atelier: 'blueprint', ember: 'carbon', neon: 'obsidian',
  backlit: 'carbon', eurorack: 'phosphor', chrome: 'console', rackmount: 'console',
  anodised: 'machined', aerospace: 'machined', laboratory: 'machined', ladder: 'field',
  walnut: 'tolex', valve: 'tolex', reel: 'tolex', 'saddle-brass': 'tolex',
  'ceramic-oak': 'soft', receiver: 'tolex',
};

export function extendControlSet(set) {
  // Graphite remains the compatibility baseline for existing documents.
  if (set.id === 'graphite') return set;
  const d = starterDirection(set.id) ?? starterDirection(RELATED[set.id]);
  if (!d) return set;
  const families = { ...set.families };
  const face = set.families?.Button?.component ?? {};
  function inkOn(value) {
    for (let i = 0; i < 8 && /^\{.+\}$/.test(value ?? ''); i++) value = set.tokens[value.slice(1, -1)];
    const raw = String(value ?? '202020');
    const hex = raw.slice(-6), panelHex = String(set.panel?.colour ?? '202020').slice(-6);
    const alpha = raw.length === 8 ? parseInt(raw.slice(0, 2), 16) / 255 : 1;
    const brightness = [0, 2, 4].reduce((sum, offset, index) => {
      const front = parseInt(hex.slice(offset, offset + 2), 16) || 0;
      const back = parseInt(panelHex.slice(offset, offset + 2), 16) || 0;
      return sum + (front * alpha + back * (1 - alpha)) * [.2126, .7152, .0722][index];
    }, 0);
    return brightness > 145 ? 'FF202020' : 'FFF2F2F2';
  }
  const fieldInk = inkOn(set.tokens['control.field']);
  const surfaceInk = inkOn(face['Background.Fill.colour'] ?? set.tokens.surface);
  const text = { 'Text.Fill.colour': '{text.primary}', 'Text.Font.family': set.type?.legend?.family ?? 'Arial' };
  const frame = Object.fromEntries(Object.entries(face).filter(([path]) => /^(Background|Effects)\./.test(path)));
  const put = (type, component) => { families[type] = { ...families[type], component: { ...component, ...(families[type]?.component ?? {}) } }; };
  for (const type of ['CyclicButton', 'TimedButton', 'OneShotButton', 'RadioButtonGroup']) put(type, face);
  for (const type of ['TextInput', 'Listbox']) put(type, { ...frame, ...text, 'Background.Fill.colour': '{control.field}' });
  put('Listbox', { ...families.Listbox.component, 'Listbox.cardRows': d.radius > 8, 'Listbox.rowHeight': d.radius > 8 ? 32 : 24, 'Listbox.selectionStyle': d.pad === 'outline' ? 'outline' : 'bar', 'Listbox.zebra': d.pad === 'inset', 'Listbox.accentColour': '{accent}' });
  for (const type of ['Group', 'Container', 'TabContainer', 'ScrollArea']) put(type, { ...frame, ...text, 'Background.Fill.gradientEnabled': false, 'Background.Fill.colour': '{control.field}', 'Background.Corners.radius': d.radius });
  put('TabContainer', { ...families.TabContainer.component, 'TabContainer.appearance': ['raised', 'inset', 'chamfer'].includes(d.pad) ? 'hardware' : 'flat', 'TabContainer.accentColour': '{accent}', 'TabContainer.stripColour': '{control.field}', 'TabContainer.tabColour': '{surface}', 'TabContainer.activeTabColour': '{surface.checked}', 'TabContainer.labelColour': '{text.primary}', 'TabContainer.activeLabelColour': '{text.inverse}' });
  put('ScrollArea', { ...families.ScrollArea.component, 'ScrollArea.scrollbarSize': d.pad === 'outline' ? 5 : 10, 'ScrollArea.trackColour': '{control.track}', 'ScrollArea.thumbColour': '{control.cap}' });
  for (const type of ['Meter', 'ProgressBar']) put(type, {
    ...text, 'Meter.segments': d.meter, 'Meter.segmentGap': d.meter > 20 ? 1 : 3,
    'Meter.rounded': d.radius > 6, 'Meter.thickness': d.pad === 'outline' ? 6 : (d.pad === 'raised' ? 16 : 10),
    'Meter.showTicks': d.meter > 0, 'Meter.trackColour': '{control.track}', 'Meter.fillColour': '{control.fill}', 'Meter.peakColour': '{accent.hot}',
  });
  for (const type of ['Ribbon', 'PitchWheel', 'ModWheel']) put(type, {
    ...text, 'Ribbon.style': d.ribbon, 'Ribbon.showGlow': ['glass', 'outline'].includes(d.pad), 'Ribbon.indicatorSize': d.handle === 'ring' ? 3 : 8,
    'Ribbon.trackColour': '{control.track}', 'Ribbon.fillColour': '{control.fill}', 'Ribbon.indicatorColour': '{control.cap}', 'Ribbon.glowColour': '{accent}', 'Ribbon.wheelColour': '{control.body}', 'Ribbon.labelColour': '{text.primary}',
  });
  put('Crossfader', { ...text, 'Crossfader.handleStyle': d.handle, 'Crossfader.trackSize': d.pad === 'outline' ? 2 : 8, 'Crossfader.handleSize': d.handle === 'blade' ? 34 : 22, 'Crossfader.showGains': d.pad === 'inset', 'Crossfader.trackColour': '{control.track}', 'Crossfader.fillAColour': '{control.fill}', 'Crossfader.fillBColour': '{control.range}', 'Crossfader.handleColour': '{control.cap}', 'Crossfader.labelColour': '{text.primary}' });
  put('DrumPads', { ...text, 'DrumPads.padAppearance': d.pad, 'DrumPads.padRadius': d.radius, 'DrumPads.fieldColour': '{control.field}', 'DrumPads.padColour': '{surface}', 'DrumPads.accentColour': '{accent}', 'DrumPads.hitColour': '{accent.hot}', 'DrumPads.labelColour': '{text.primary}' });
  put('Numpad', { ...frame, ...text, 'Numpad.gap': d.radius > 8 ? 8 : 3, 'Numpad.keyColour': '{surface}', 'Numpad.keyDownColour': '{surface.pressed}', 'Numpad.keyLabelColour': '{text.primary}', 'Numpad.actionColour': '{accent}', 'Numpad.displayColour': '{control.field}', 'Numpad.displayTextColour': '{text.primary}', 'Numpad.borderColour': '{border}' });
  put('Matrix', { ...text, 'Matrix.cellStyle': d.matrix, 'Matrix.rowHeaderW': d.pad === 'outline' ? 60 : 42, 'Matrix.gridColour': '{border}', 'Matrix.posColour': '{accent}', 'Matrix.negColour': '{control.range}', 'Matrix.labelColour': '{text.primary}', 'Matrix.activeColour': '{accent.hot}' });
  put('Envelope', { 'Envelope.fillUnder': d.pad !== 'outline', 'Envelope.lineWidth': d.pad === 'outline' ? 1 : 3, 'Envelope.nodeRadius': d.radius > 8 ? 6 : 3, 'Envelope.lineColour': '{accent}', 'Envelope.fillColour': '{control.field}', 'Envelope.nodeColour': '{control.cap}', 'Envelope.gridColour': '{border}', 'Envelope.sustainColour': '{control.range}', 'Envelope.playheadColour': '{accent.hot}' });
  put('VectorJoystick', { ...text, 'Joystick.puckRadius': d.radius > 8 ? 14 : 7, 'Joystick.showGrid': d.pad !== 'glass', 'Joystick.gridDiv': d.pad === 'outline' ? 8 : 4, 'Joystick.padColour': '{control.field}', 'Joystick.gridColour': '{border}', 'Joystick.crosshairColour': '{accent}', 'Joystick.puckColour': '{control.cap}', 'Joystick.cornerColour': '{text.muted}', 'Joystick.labelColour': '{text.primary}' });
  // Specialized renderers have an outer control face as well as their own drawing. A pale
  // design must not leave black factory slabs behind its otherwise themed labels and scales.
  for (const type of ['Crossfader', 'DrumPads', 'Ribbon', 'PitchWheel', 'ModWheel', 'Meter', 'ProgressBar', 'Matrix', 'Envelope', 'VectorJoystick']) {
    const patch = families[type].component;
    families[type] = { component: { ...frame, 'Background.Fill.gradientEnabled': false, 'Background.Fill.colour': '{control.field}', ...patch, 'Background.Corners.radius': Math.min(d.radius, 14) } };
  }
  for (const [type, section] of [['Crossfader', 'Crossfader'], ['Matrix', 'Matrix'], ['Ribbon', 'Ribbon'], ['PitchWheel', 'Ribbon'], ['ModWheel', 'Ribbon'], ['VectorJoystick', 'Joystick']]) families[type].component[`${section}.labelColour`] = fieldInk;
  for (const type of ['Meter', 'ProgressBar']) families[type].component['Text.Fill.colour'] = fieldInk;
  families.Matrix.component['Matrix.cellBg'] = '{control.field}';
  families.DrumPads.component['DrumPads.labelColour'] = inkOn(set.tokens.surface);
  families.Envelope.component['Envelope.fillColour'] = '20000000';
  // Selected cycle/radio states otherwise paint white lettering over a pale metal cap.
  for (const type of ['CyclicButton', 'RadioButtonGroup']) families[type].component['States.Selected'] = {
    _type: 'State', name: 'Selected', group: 'interaction', description: '', enabled: true,
    when: { checked: true }, patches: { component: { 'Background.Border.colour': '{accent.hot}', 'Text.Fill.colour': surfaceInk }, parts: {} },
  };
  // Translucent and light surfaces need an ink chosen against the composited face.
  for (const type of ['Button', 'MomentaryButton', 'ToggleButton', 'CyclicButton', 'TimedButton', 'OneShotButton', 'RadioButtonGroup', 'Combobox']) {
    families[type] = { ...families[type], component: { ...families[type]?.component, 'Text.Fill.colour': surfaceInk } };
  }
  for (const type of ['Knob', 'Button', 'MomentaryButton', 'ToggleButton', 'TimedButton', 'OneShotButton', 'Meter', 'ProgressBar']) {
    families[type] = { ...families[type], component: { ...families[type]?.component,
      'Core.controlForm': setAnatomy(type, d.id),
      'Core.formFaceColour': '{surface}', 'Core.formInkColour': inkOn(set.tokens.surface), 'Core.formLabelColour': '{text.primary}', 'Core.formAccentColour': '{accent}',
      'Core.formHousingColour': '{control.track}',
      'Core.formDivisions': ['blueprint', 'machined', 'phosphor'].includes(d.id) ? 24 : 12,
    } };
  }
  return { ...set, families };
}
