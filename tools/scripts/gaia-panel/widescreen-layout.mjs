import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { addInstrumentBranding } from './status-display.mjs';
import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { tabGeometry } from '../../../CE/web/src/CE_Application/utils/tabContainerLayout.js';
import { applyEnvelopeViews } from './envelope-views.mjs';
import { refineToneSpacing } from './tone-spacing.mjs';

// Three horizontal voices on the left, four permanently visible processors on
// the right. This is document geometry, so 100% preview is exactly 1920 x 1000.
export function applyWidescreenLayout(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const rect = c => c._children.Transform;
  const bottom = named('bottom_pages');
  const oldBottom = { ...rect(bottom) };
  const oldEffectsY = rect(named('box_DISTORTION')).y;
  const leftWidth = 1568;
  const sx = leftWidth / oldBottom.width;
  const originals = new Map(panel.controls.map(c => [c, { ...rect(c) }]));

  function resize(c, width, height) {
    const s = c._children, t = rect(c);
    if (s.Core.controlType === 'CustomComponent' && !s.Designer?.arpeggiator?.enabled) {
      s.Designer.designWidth ??= t.width;
      s.Designer.designHeight ??= t.height;
      t.contentScaleMode = 'scaleInternals';
      // Keep tiny legends legible when the LED lists become more compact.
      const scale = Math.min(width / s.Designer.designWidth, height / s.Designer.designHeight);
      for (const part of Object.values(s.Parts?._children ?? {})) {
        const font = part._children?.Text?._children?.Font;
        if (font?.size && font.size * scale < 8.5) font.size = 8.5 / scale;
      }
    }
    Object.assign(t, { width, height });
  }

  for (const tone of [1, 2, 3]) {
    const oldY = originals.get(named(`tone${tone}.signalFlow`)).y;
    const top = 34 + (tone - 1) * 238;
    for (const c of panel.controls) {
      const o = originals.get(c), s = c._children, t = rect(c);
      if (o.y < oldY || o.y >= oldY + 356) continue;
      const y = o.y - oldY;
      t.x = 16 + (o.x - 16) * sx;
      let width = o.width * sx, height = o.height, dy = y;
      if (o.x < 120) {
        dy = 48 + (y - 30) * 36 / 46;
        height = s.Core.controlType === 'Label' ? 50 : 26;
      } else if (s.Core.name.startsWith('box_')) { dy = 18; height = 212; }
      else if (s.Core.name.startsWith('tab_')) { dy = 20; height = 18; }
      else if (s.Core.name.endsWith('.signalFlow')) { dy = 0; height = 16; }
      else if (s.Core.name.endsWith('.lamp')) { dy = 4; height = width = 7; }
      else if (s.Core.controlType === 'Envelope') { dy = 108; height = 30; }
      else if (s.Core.controlType === 'CustomComponent') {
        if (o.width === o.height) {
          dy = y > 200 ? 154 : 48;
          width = height = 42;
          t.x += (o.width * sx - width) / 2;
        } else if (o.height === 104 && o.width === 30) { dy = 142; height = 62; }
        else { dy = 48; height = Math.round(o.height * 0.66); }
        if (s.Core.name.endsWith('.modLfo.shape')) height = 54;
      } else if (s.Core.controlType === 'Combobox' || s.Core.controlType === 'ToggleButton') {
        dy = y === 64 ? 48 : y === 118 ? 90 : 116;
        height = 20;
      } else if (s.Core.controlType === 'Label') {
        if (y <= 2) { dy = 1; height = 14; }
        else if (y === 50) { dy = 34; height = 13; }
        else if (y === 105) { dy = 77; height = 12; }
        else if (y === 123) { dy = 91; height = 12; }
        else if (y === 164) { dy = 103; height = 12; }
        else if (y === 289) { dy = 197; height = 14; }
        else if (y === 320) { dy = 207; height = 22; }
      }
      t.y = top + dy;
      resize(c, width, height);
    }
  }
  for (const tone of [2, 3]) Object.assign(rect(named(`tone${tone}.divider`)), {
    x: 16, y: 30 + (tone - 1) * 238, width: leftWidth, height: 2,
  });

  // Effects stay top-level and visible regardless of which lower page is open.
  for (const [i, title] of ['DISTORTION', 'FLANGER', 'DELAY', 'REVERB'].entries()) {
    const box = named(`box_${title}`), o = originals.get(box);
    for (const c of panel.controls) {
      const source = originals.get(c);
      if (source.y < oldEffectsY || source.y >= oldBottom.y || source.x < o.x || source.x >= o.x + o.width) continue;
      const t = rect(c);
      t.x = 1594 + (source.x - o.x) * 314 / 250;
      t.y = 34 + i * 198 + source.y - o.y;
      if (c === box) t.width = 314;
    }
  }
  const output = named('box_EFFECTS / OUTPUT'), outputOld = originals.get(output);
  const outputControls = panel.controls.filter(c => {
    const o = originals.get(c);
    return o.y >= oldEffectsY && o.y < oldBottom.y && o.x >= outputOld.x;
  });
  for (const c of outputControls) {
    rect(c).x = 1594 + originals.get(c).x - outputOld.x;
    rect(c).y = 828 + originals.get(c).y - outputOld.y;
  }
  Object.assign(rect(output), {x:1594,y:828,width:314,height:160});
  for (const [i, name] of ['effectsDistortionSelect','effectsFlangerSelect','effectsDelaySelect','effectsReverbSelect','lowBoostSwitch','tempoSyncSwitch','effectsMasterSwitch'].entries()) {
    Object.assign(rect(named(`common.${name}`)), {x:1604+(i%2)*148,y:860+Math.floor(i/2)*28,width:140,height:22});
  }
  const volume = named('master.volume');
  Object.assign(rect(volume), {x:1830,y:940}); resize(volume,34,34);
  for (const c of outputControls.filter(c=>c._children.Core.controlType==='Label')) {
    if(c._children.Text?.content==='OUTPUT') Object.assign(rect(c),{x:1806,y:975,width:84,height:13});
    else Object.assign(rect(c),{x:1604,y:848,width:280,height:10});
  }

  // Retain the lower pages and their bindings, fitting their content into the
  // remaining left-hand workspace. Generated arpeggio geometry uses its new box.
  function compactChildren(parent, fx, fy) {
    for (const c of Object.values(parent._children.Children?._children ?? {})) {
      const t = rect(c), old = {...t};
      t.x *= fx; t.y *= fy;
      let w = old.width * fx, h = old.height * fy;
      if(c._children.Designer?.arpeggiator?.enabled) h=184;
      if(c._children.Core.controlType==='CustomComponent' && old.width===old.height) {
        w=h=Math.min(w,h); t.x+=(old.width*fx-w)/2;
      }
      resize(c,w,h);
      const tabs=c._children.TabContainer;
      if(tabs) tabs.stripSize*=fy;
      if(c._children.Designer?.arpeggiator?.enabled) {
        const field=c._children.Parts?._children?.field?._children?.Layout;
        if(field) Object.assign(field,{width:w,height:h});
      }
      compactChildren(c,fx,fy);
    }
  }
  compactChildren(bottom,sx,236/oldBottom.height);
  bottom._children.TabContainer.stripSize*=236/oldBottom.height;
  Object.assign(rect(bottom),{x:16,y:752,width:leftWidth,height:236});
  for (const c of panel.controls) {
    const o=originals.get(c);
    if(o.y>=oldBottom.y+oldBottom.height) {
      rect(c).y=4; rect(c).height=24;
      const font=c._children.Text?._children?.Font;
      if(font) font.size=Math.min(font.size,20);
    }
  }
  Object.assign(rect(named('plate')),{x:10,y:30,width:1900,height:960});
  panel.width=1920; panel.height=1000;
  return refineToneSpacing(applyEnvelopeViews(compactPanelRows(moveSyncRingIntoOsc(expandArpeggioWorkspace(compactPanelBranding(removeToneFlowStrips(panel)))))));
}

// Reuse the decorative header's 18px for the controls: the upper controls move
// up and the faders get longer, while each tone keeps its existing bottom edge.
// This also applies to a saved panel without resetting its values or scripts.
export function removeToneFlowStrips(panel) {
  const removed = new Set();
  for (const tone of [1, 2, 3]) {
    const rail = panel.controls.find(c => c._children.Core.name === `tone${tone}.signalFlow`);
    if (!rail) continue;
    const top = rail._children.Transform.y;
    for (const control of panel.controls) {
      const s = control._children, t = s.Transform;
      if (t.y < top || t.y >= top + 230 || t.x >= rail._children.Transform.x + rail._children.Transform.width) continue;
      if (t.y < top + 18 && t.x >= rail._children.Transform.x) {
        removed.add(control);
      } else if (s.Core.name.startsWith('box_')) {
        t.y -= 18; t.height += 18;
      } else if (s.Core.controlType === 'CustomComponent' && t.width < 40 && t.height > t.width * 1.5) {
        t.y -= 18; t.height += 18;
      } else if (s.Core.name.endsWith('.filter.cutoffKeyfollow') || s.Text?.content === 'KEY FOLLOW') {
        t.y -= 9;
      } else if (t.y < top + 207) {
        t.y -= 18;
      }
    }
  }
  panel.controls = panel.controls.filter(c => !removed.has(c));
  return panel;
}

// Match the top rim to the bottom and give the recovered space to the lower
// pages. Accept saved panels too, preserving their values and display state.
export function compactPanelBranding(panel) {
  const brandText = new Set(['Roland', 'GAIA', 'SYNTHESIZER  SH-01']);
  const branding = panel.controls.filter(c => c._children.Core.controlType === 'Label'
    && brandText.has(c._children.Text?.content) && c._children.Transform.y < 30);
  if (!branding.length) return panel;
  panel.controls = panel.controls.filter(c => !branding.includes(c));
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const plate = named('plate')._children.Transform;
  const recovered = plate.y - (panel.height - plate.y - plate.height);
  for (const c of panel.controls) c._children.Transform.y -= recovered;
  plate.height += recovered;
  named('bottom_pages')._children.Transform.height += recovered;
  named('box_EFFECTS / OUTPUT')._children.Transform.height += recovered;

  const screen = named('gaia_status_screen');
  screen._children.Transform.height += recovered;
  named('gaia_display_help')._children.Transform.y += recovered;
  addInstrumentBranding(screen._children.Display);
  // The instrument name now lives on the matrix, so remove its separate label.
  const children = named('bottom_pages')._children.Children._children;
  for (const [id, c] of Object.entries(children)) {
    if (c._children.Core.name === 'gaia_display_brand') delete children[id];
  }
  return panel;
}

export function expandArpeggioWorkspace(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const bottom = named('bottom_pages'), t = bottom._children.Transform;
  const page = tabGeometry(t.width, t.height, bottom).page;
  const children = bottom._children.Children._children;
  const box = named('box_ARPEGGIO PATTERN')._children.Transform;
  Object.assign(box, { x: 178, width: page.w - 178 });
  box.height = page.h;
  Object.assign(named('box_ARPEGGIO')._children.Transform, { width: 168, height: page.h });
  Object.assign(named('tab_ARPEGGIO')._children.Transform, { width: 90 });
  Object.assign(named('common.switch')._children.Transform, { x: 104, width: 56 });
  for (const name of ['arp.grid', 'arp.duration', 'arp.motif']) {
    Object.assign(named(name)._children.Transform, { x: 8, width: 152 });
    Object.assign(named(name + '.caption')._children.Transform, { x: 8, width: 152 });
  }
  for (const [i, name] of ['arp.accentRate', 'arp.velocity', 'arp.octaveRange'].entries()) {
    Object.assign(named(name)._children.Transform, { x: 10 + i * 56, width: 36, height: 36 });
    Object.assign(named(name + '.caption')._children.Transform, { x: i * 56, width: 56 });
  }
  const tab = named('tab_ARPEGGIO PATTERN');
  children[tab._children.Core.id] = createControl('Label', {
    Core: { ...tab._children.Core, controlType: 'Label' },
    Transform: { x: box.x + 2, y: 2, width: 22, height: page.h - 4 },
    Text: { content: 'ARPEGGIO PATTERN', _children: {
      Font: { size: 11, bold: true }, Fill: { colour: 'FF15212A' },
      Position: { justification: 'centred', flowMode: 'rotate', flowAngle: -90 },
    } },
    Background: { _children: { Fill: { colour: 'FF98A4AE' }, Border: { enabled: false }, Corners: { radius: 3 } } },
  });
  const guide = named('arp_gesture_guide');
  if (guide) delete children[guide._children.Core.id];
  const grid = named('arp_pattern_grid')._children;
  Object.assign(grid.Transform, { x: box.x + 30, y: 4, width: box.width - 38, height: page.h - 8 });
  Object.assign(grid.Parts._children.field._children.Layout, { width: grid.Transform.width, height: grid.Transform.height });
  const status = named('gaia_hardware_sync_status')._children;
  Object.assign(status.Transform, { x: grid.Transform.x + grid.Transform.width - 128, y: grid.Transform.y + 136, width: 120, height: 60 });
  Object.assign(status.Designer, { designWidth: 120, designHeight: 60 });
  const feedback = status.Parts._children.feedback._children;
  Object.assign(feedback.Layout, { x: 0, y: 0, width: 120, height: 60 });
  feedback.Text._children.Font.size = 8.5;
  feedback.Text._children.Multiline ??= { _type: 'Multiline' };
  Object.assign(feedback.Text._children.Multiline, { maxLines: 6, wrapMode: 'word', lineHeight: 1.1 });
  const output = named('box_EFFECTS / OUTPUT')._children.Transform;
  output.height = t.y + t.height - output.y;
  return panel;
}

export function compactPanelRows(panel) {
  const dividers = panel.controls.filter(c => /^tone[23]\.divider$/.test(c._children.Core.name));
  if (dividers.length) {
    panel.controls = panel.controls.filter(c => !dividers.includes(c));
    const rows = panel.controls.filter(c => c._children.Core.name === 'box_OSC')
      .map(c => ({ ...c._children.Transform })).sort((a, b) => a.y - b.y);
    for (const [index, row] of rows.entries()) {
      for (const c of panel.controls) {
        const t = c._children.Transform;
        if (t.x < 1594 && t.y >= row.y && t.y < row.y + row.height) t.y -= index * 4;
      }
    }
  }
  const bottom = panel.controls.find(c => c._children.Core.name === 'bottom_pages');
  const t = bottom._children.Transform, end = t.y + t.height;
  t.y = Math.max(...panel.controls.filter(c => c._children.Core.name === 'box_OSC')
    .map(c => c._children.Transform.y + c._children.Transform.height));
  t.height = end - t.y;
  Object.assign(bottom._children.TabContainer, { appearance: 'buttons', stripSize: 32, stripColour: '00000000' });
  return expandArpeggioWorkspace(panel);
}

// The profile exposes one patch-common selector, not three tone parameters.
// Keep its ID, values and bindings while making it visible beside the oscillator.
export function moveSyncRingIntoOsc(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const bottom = named('bottom_pages')._children.Children._children;
  const sync = named('common.syncRingSelect');
  if (!sync._children.Core.tabPageId) return panel;
  for (const [id, c] of Object.entries(bottom)) {
    if (['box_SYNC / RING', 'tab_SYNC / RING', 'common.syncRingSelect'].includes(c._children.Core.name)) delete bottom[id];
  }
  delete sync._children.Core.tabPageId;
  const box = named('box_OSC')._children.Transform;
  for (const tone of [1, 2, 3]) {
    for (const [key, offset, caption] of [['pitch', 208, 'PITCH'], ['detune', 264, 'DETUNE']]) {
      const knob = named(`tone${tone}.osc.${key}`)._children.Transform;
      const delta = box.x + offset - knob.x;
      const label = panel.controls.find(c => c._children.Core.controlType === 'Label'
        && c._children.Text?.content === caption && c._children.Transform.y > knob.y
        && c._children.Transform.y < knob.y + 65
        && Math.abs(c._children.Transform.x + c._children.Transform.width / 2 - knob.x - knob.width / 2) < 2);
      knob.x += delta;
      if (label) label._children.Transform.x += delta;
    }
  }
  Object.assign(sync._children.Transform, { x: box.x + 314, y: box.y + 30, width: 66, height: 53 });
  Object.assign(sync._children.Designer, { designWidth: 66, designHeight: 53 });
  for (const part of Object.values(sync._children.Parts._children)) {
    if (!part._children.Text) continue;
    part._children.Layout.width = 51;
    part._children.Text._children.Font.size = 9;
  }
  for (const zone of Object.values(sync._children.HitZones._children)) {
    if (typeof zone.payload === 'number') zone.payload = { value: zone.payload };
  }
  panel.controls.push(sync);
  return panel;
}
