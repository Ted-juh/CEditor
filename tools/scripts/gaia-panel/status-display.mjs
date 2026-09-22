import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { expandStatusDisplay } from './status-space.mjs';

export const DISPLAY_HEIGHT = 160;
export const SCREEN = 'gaia_status_screen';

export function addInstrumentBranding(display) {
  if (display.layouts.some(layout => layout.zones.some(zone => zone.id === 'instrument_brand'))) return;
  display.rows += 1;
  display.pixelHeight += 8;
  for (const layout of display.layouts) {
    for (const zone of layout.zones) zone.row += 1;
    layout.zones.unshift({ id: 'instrument_brand', row: 1, colStart: 1, colEnd: display.cols,
      show: 'static', text: 'ROLAND  GAIA  |  SYNTHESIZER SH-01', align: 'center' });
  }
}

/** Reuse the lower tab area instead of reserving a separate display header. */
export function moveStatusDisplayToBottom(panel) {
  const bottom = panel.controls.find(c => c._children.Core.name === 'bottom_pages');
  const screen = panel.controls.find(c => c._children.Core.name === SCREEN);
  if (!bottom || !screen) return panel;
  const names = new Set([SCREEN, 'gaia_display_brand', 'gaia_display_caption', 'gaia_display_help']);
  const moved = panel.controls.filter(c => names.has(c._children.Core.name));
  panel.controls = panel.controls.filter(c => !names.has(c._children.Core.name));
  const tabs = bottom._children.TabContainer;
  if (!tabs.pages.some(p => p.id === 'status')) tabs.pages.push({ id: 'status', label: 'STATUS DISPLAY' });
  for (const c of moved) {
    c._children.Core.tabPageId = 'status';
    c._children.Transform.y += 64;
    bottom._children.Children._children[c._children.Core.id] = c;
  }
  for (const c of panel.controls) {
    if (c._children.Core.name === 'plate') c._children.Transform.height -= DISPLAY_HEIGHT;
    else c._children.Transform.y -= DISPLAY_HEIGHT;
  }
  panel.height -= DISPLAY_HEIGHT;
  return panel;
}

// Also serialized into the bank-name script. Change only static text zones; native
// source bindings and the user's selected display page must remain untouched.
export function updateGaiaScreen(texts) {
  const layouts = get('gaia_status_screen.display.layouts');
  if (!Array.isArray(layouts)) return;
  let changed = false;
  const next = layouts.map(layout => ({ ...layout, zones: layout.zones.map(zone => {
    if (!(zone.id in texts) || zone.text === String(texts[zone.id])) return zone;
    changed = true;
    return { ...zone, text: String(texts[zone.id]) };
  }) }));
  if (changed) set('gaia_status_screen.display.layouts', next);
}

function displayRuntime() {
  let generation = 0;
  function onPanelLoad() {
    const token = ++generation;
    function refresh() {
      if (token !== generation) return;
      const profile = ce.device.profile('Roland GAIA SH-01');
      const route = !profile ? 'MIDI: NO PROFILE / ROUTE'
        : !profile.midiInput || !profile.midiDestination ? 'MIDI: INPUT / OUTPUT NOT MAPPED'
          : profile.connected ? 'MIDI SESSION READY - VALUES NEED READBACK'
            : 'MIDI ROUTE MAPPED - SESSION NOT CONFIRMED';
      updateGaiaScreen({ connection: route });
      after(1000, refresh);
    }
    refresh();
  }
  return { onPanelLoad };
}

/** Add an independent header without renumbering or replacing existing controls. */
export function applyStatusDisplay(panel, profile) {
  let controls = flatControls(panel.controls);
  const named = name => controls.find(c => c._children.Core.name === name);
  const id = name => {
    const c = named(name);
    if (!c) throw new Error(`Status display source missing: ${name}`);
    return c._children.Core.id;
  };
  const zone = (key, row, text, extra = {}) => ({ id: key, row, colStart: 1, colEnd: 56, show: 'static', text, ...extra });
  const source = (key, row, name, show, extra = {}) => zone(key, row, '', { show, sourceId: id(name), ...extra });
  const menu = current => ['PATCH', 'PARAM', 'ARP', 'SYSTEM'].map((name, i) => zone('menu_' + name, 6,
    name === current ? '[' + name + ']' : name, { colStart: i * 14 + 1, colEnd: (i + 1) * 14, align: 'center', press: { layout: name } }));
  const connection = () => zone('connection', 5, 'MIDI: NOT CHECKED');
  const layouts = [
    { id: 'PATCH', name: 'Patch / name provenance', zones: [
      zone('patch_selection', 1, 'PATCH: SELECTION UNKNOWN'),
      zone('patch_name', 2, 'NAME: NOT READ'),
      zone('patch_source', 3, 'Use PATCH BANKS to read names / check selection.'),
      zone('patch_message', 4, 'No automatic patch recall or hardware writes.', { scroll: true }),
      connection(), ...menu('PATCH'),
    ] },
    { id: 'PARAM', name: 'Last-touched parameter', zones: [
      zone('param_name', 1, 'Touch a synth control to inspect it.', { show: 'name', sourceId: '@active' }),
      zone('param_idle', 2, 'No parameter touched yet.'),
      zone('param_value', 2, '', { sourceId: '@active', show: 'value', priority: 1 }),
      zone('param_text', 2, '', { sourceId: '@active', show: 'text', priority: 2 }),
      zone('param_bar', 3, '', { sourceId: '@active#value', show: 'bar' }),
      zone('param_local', 4, 'PANEL VALUE - not proof of hardware readback'), connection(), ...menu('PARAM'),
    ] },
    { id: 'ARP', name: 'Arpeggio summary', zones: [
      source('arp_end', 1, 'arp_pattern_grid', 'value', { prefix: 'END STEP: ', colEnd: 24 }),
      source('arp_tempo', 1, 'common.patchTempo', 'value', { prefix: 'PATCH TEMPO: ', suffix: ' BPM', colStart: 27 }),
      source('arp_grid', 2, 'arp.grid', 'text', { prefix: 'GRID: ', colEnd: 30 }),
      source('arp_duration', 2, 'arp.duration', 'text', { prefix: 'GATE: ', colStart: 32 }),
      source('arp_motif', 3, 'arp.motif', 'text', { prefix: 'MOTIF: ' }),
      source('arp_feedback', 4, 'gaia_hardware_sync_status', 'text', { scroll: true }),
      zone('arp_staged', 5, 'NOTES + END STEP STAGED | SEND PATTERN TO APPLY'), ...menu('ARP'),
    ] },
    { id: 'SYSTEM', name: 'System overview', zones: [
      source('sys_clock', 1, 'system.clockSource', 'text', { prefix: 'CLOCK SOURCE: ' }),
      source('sys_tempo', 2, 'system.tempo', 'value', { prefix: 'SYSTEM TEMPO: ', suffix: ' BPM' }),
      source('sys_level', 3, 'system.masterLevel', 'value', { prefix: 'MASTER LEVEL: ', colEnd: 25 }),
      source('sys_pedal', 3, 'system.pedalAssign', 'text', { prefix: 'PEDAL: ', colStart: 27 }),
      zone('sys_local', 4, 'PANEL VALUES | Full controls on SYSTEM layer'), connection(), ...menu('SYSTEM'),
    ] },
  ];
  // Native LCD sources need metadata for the hardware-style custom knobs/LEDs.
  for (const c of controls) {
    const binding = c._children.DeviceBindings?.bindings?.find(b => b.parameterId);
    const parameter = profile.parameters.find(p => p.id === binding?.parameterId);
    if (!parameter) continue;
    c._children.Designer ??= {};
    c._children.Designer.lcdReadout = { channel: binding.port, label: (parameter.id.match(/^tone(\d)\./) ? 'TONE ' + parameter.id.match(/^tone(\d)\./)[1] + ' / ' : '') + (parameter.name ?? parameter.id),
      ...(parameter.choices ? { choices: parameter.choices.map(r => ({ value: r.value, label: r.label ?? r.name ?? r.id })) } : {}) };
    if (parameter.id === 'arp.velocity') c._children.Designer.lcdReadout.special = { 0: 'REAL (played velocity)' };
    if (Number.isFinite(parameter.display?.min) && Number.isFinite(parameter.display?.max)) {
      c._children.Designer.lcdReadout.display = { min: parameter.display.min, max: parameter.display.max,
        precision: parameter.display.precision ?? 0, unit: parameter.display.unit ?? '' };
    }
  }
  const screen = createControl('LcdDisplay', {
    Core: { id: SCREEN, name: SCREEN, tooltip: 'Click PATCH, PARAM, ARP or SYSTEM on the bottom display row. Read-only overview: menu navigation sends no MIDI.' },
    Transform: { x: 330, y: 20, width: 936, height: 148 },
    Background: { _children: { Fill: { colour: 'FF101415' }, Border: { enabled: true, colour: 'FF586068', thickness: 2 }, Corners: { radius: 6 } } },
    Display: { rows: 6, cols: 56, panelType: 'graphic', pixelWidth: 336, pixelHeight: 48, dotMatrix: true, dotShape: 'round', padding: 12,
      charSpacing: 1, lineSpacing: 4, palette: 'amber', litColour: 'FFE9CE91', unlitColour: '0AE9CE91',
      screenColour: 'FF151B19', backlightColour: 'FF202B23', showGhost: false, showGlass: false,
      layouts, pages: { defaultLayoutId: 'PATCH', selectorSourceId: '', selectorMap: [], overlays: [] },
      activeScope: controls.filter(c => c._children.DeviceBindings?.bindings?.length && c._children.Core.name !== 'arp_pattern_grid').map(c => c._children.Core.id),
    },
  });
  addInstrumentBranding(screen._children.Display);
  if (!named(SCREEN)) {
    for (const c of panel.controls) {
      if (c._children.Core.name === 'plate') c._children.Transform.height += DISPLAY_HEIGHT;
      else c._children.Transform.y += DISPLAY_HEIGHT;
    }
    panel.height += DISPLAY_HEIGHT;
    panel.controls.splice(1, 0, screen);
    const label = (name, text, x, y, width, height, size, colour) => createControl('Label', {
      Core: { id: name, name }, Transform: { x, y, width, height },
      Text: { content: text, _children: { Font: { size }, Fill: { colour }, Position: { justification: 'left' }, Multiline: { maxLines: 3, wrapMode: 'word', lineHeight: 1.3 } } },
      Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false } } },
    });
    panel.controls.push(label('gaia_display_brand', 'GAIA SH-01', 30, 38, 270, 36, 28, 'FFDCE2E5'),
      label('gaia_display_caption', 'EDITOR STATUS\nThree independent tones', 30, 85, 270, 55, 12, 'FF99A7B0'),
      label('gaia_display_help', 'TOUCH A MENU ON SCREEN\nPARAM follows your last control.\nReadouts do not change the sound.', 1290, 48, 268, 94, 12, 'FFAEBAC6'));
  } else {
    const old = named(SCREEN);
    const expanded = old._children.Display?.cols === 112 && old._children.Display?.rows === 12;
    const priorScope = old._children.Display?.activeScope;
    const nextScope = screen._children.Display.activeScope;
    if (priorScope?.length === nextScope.length && priorScope.every(id => nextScope.includes(id))) {
      screen._children.Display.activeScope = priorScope;
    }
    if (old._children.Core.tabPageId === 'status') {
      screen._children.Core.tabPageId = 'status';
      screen._children.Transform = old._children.Transform;
    }
    Object.assign(old, screen);
    if (expanded) expandStatusDisplay(panel);
  }
  const script = createScript({ id: 'gaia_status_display', name: 'GAIA dot-matrix status', language: 'javascript', scope: 'panel', event: 'onPanelLoad', target: '*',
    description: 'Read-only MIDI route status. LCD menu/source bindings handle patch, parameter, arp and system readouts.',
    source: `${updateGaiaScreen.toString()}\nconst display = (${displayRuntime.toString()})();\nfunction onPanelLoad() { display.onPanelLoad(); }\n` });
  const scriptIndex = panel.scripts.findIndex(s => s.id === script.id);
  if (scriptIndex < 0) panel.scripts.push(script);
  else panel.scripts[scriptIndex] = script;
  return panel;
}
