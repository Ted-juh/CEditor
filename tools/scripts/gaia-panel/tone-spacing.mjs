import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// Apply absolute section-relative geometry so saved panels can be updated without
// changing their values, bindings, selected pages or other user settings.
export function refineToneSpacing(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const rect = c => c._children.Transform;
  const section = (title, tone) => panel.controls.filter(c => c._children.Core.name === `box_${title}`)
    .sort((a, b) => rect(a).y - rect(b).y)[tone - 1];
  function caption(box, text) {
    const b = rect(box);
    return panel.controls.find(c => c._children.Core.controlType === 'Label' && c._children.Text?.content === text
      && rect(c).x >= b.x && rect(c).x < b.x + b.width && rect(c).y >= b.y && rect(c).y < b.y + b.height);
  }
  function placeCaption(box, text, bounds) {
    const label = caption(box, text);
    if (label) Object.assign(rect(label), bounds);
  }
  function selector(name, height) {
    const c = named(name), t = rect(c);
    t.height = height;
    const d = c._children.Designer;
    const scale = Math.min(t.width / d.designWidth, height / d.designHeight);
    for (const p of Object.values(c._children.Parts?._children ?? {})) {
      const font = p._children.Text?._children?.Font;
      if (font) font.size = 9 / scale;
    }
  }
  for (const tone of [1, 2, 3]) {
    const baseline = rect(named(`tone${tone}.lfo.fadeTime`));
    for (const [kind, title] of [['osc.pitchEnv', 'OSC'], ['filter.env', 'FILTER'], ['amp.env', 'AMP']]) {
      const view = named(`tone${tone}.${kind}.view`), v = rect(view), b = rect(section(title, tone));
      const children = Object.values(view._children.Children._children);
      // Keep the transparent live container on the envelope itself. Widening it across the
      // section overlaps the captions and prevents the scenery compiler from baking them.
      Object.assign(view._children.TabContainer, { appearance: 'buttons',
        buttonGroupWidth: 66, buttonGap: 8, buttonHeight: 16, labelSize: 9 });
      for (const c of children) {
        if (c._children.Core.controlType === 'Label') continue;
        Object.assign(rect(c), { y: baseline.y - v.y - (view._children.TabContainer.showStrip === false ? 0 : view._children.TabContainer.stripSize), height: baseline.height });
      }
    }
    for (const [kind, title] of [['lfo', 'LFO'], ['modLfo', 'MOD LFO']]) {
      const box = section(title, tone), b = rect(box), mod = kind === 'modLfo';
      const columnX = b.x + b.width - 78, columnWidth = 68;
      const rate = named(`tone${tone}.${kind}.rate`);
      const rateCenter = mod ? columnX + columnWidth / 2
        : rect(named(`tone${tone}.lfo.filterDepth`)).x + baseline.width / 2;
      Object.assign(rect(rate), { x: rateCenter - 17, y: b.y + 22, width: 34, height: 34 });
      placeCaption(box, 'RATE', { x: rateCenter - 30, y: b.y + 57, width: 60, height: 10 });
      selector(`tone${tone}.${kind}.shape`, 78);
      const sync = named(`tone${tone}.${kind}.tempoSyncSwitch`), note = named(`tone${tone}.${kind}.tempoSyncNote`);
      Object.assign(rect(sync), { x: columnX, y: b.y + (mod ? 70 : 28), width: columnWidth, height: 18 });
      sync._children.Text._children.Font.size = mod ? 9 : 8;
      Object.assign(sync._children.ContentLayout ??= {}, { paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 });
      Object.assign(rect(note), { x: columnX, y: b.y + (mod ? 100 : 68), width: columnWidth, height: 18 });
      placeCaption(box, 'NOTE', { x: columnX, y: b.y + (mod ? 89 : 57), width: columnWidth, height: 10 });
      if (mod) {
        // SYNC is self-explanatory on its own, so its TEMPO caption goes. Removed rather than
        // hidden: its box sits over the lower shape choices, and a hidden control still paints a
        // dashed placeholder in the editor preview — a stray frame around RND on every MOD LFO.
        const tempo = caption(box, 'TEMPO')
          ?? panel.controls.find(c => c._children.Core.controlType === 'Label' && c._children.Core.visible === false
            && !String(c._children.Text?.content ?? '').trim() && rect(c).x >= b.x && rect(c).x < b.x + b.width
            && rect(c).y >= b.y && rect(c).y < b.y + b.height);
        if (tempo) panel.controls.splice(panel.controls.indexOf(tempo), 1);
      } else {
        Object.assign(rect(named(`tone${tone}.lfo.keyTrigger`)), { x: columnX, y: b.y + 96, width: columnWidth, height: 18 });
      }
    }
    selector(`tone${tone}.osc.wave`, 78);
    selector(`tone${tone}.osc.waveVariation`, 42);
    selector(`tone${tone}.filter.mode`, 72);
    selector(`tone${tone}.filter.slope`, 32);
    // Captions belong below the 18px section title band, with breathing room.
    // Keep the selectors clear of both their captions and the faders below.
    for (const [title, labels] of [
      ['LFO', [['SHAPE', 'lfo.shape']]],
      ['OSC', [['WAVE', 'osc.wave'], ['VARIATION', 'osc.waveVariation']]],
      ['FILTER', [['MODE', 'filter.mode'], ['SLOPE', 'filter.slope']]],
      ['MOD LFO', [['SHAPE', 'modLfo.shape']]],
    ]) {
      const box = section(title, tone), top = rect(box).y;
      for (const [text, name] of labels) {
        placeCaption(box, text, { y: top + 24, height: 12 });
        rect(named(`tone${tone}.${name}`)).y = top + 38;
      }
    }
  }
  function alignHeaders(controls) {
    for (const c of controls) {
      const name = c._children.Core.name;
      if (name.startsWith('tab_')) {
        const box = controls.find(b => b._children.Core.name === `box_${name.slice(4)}`
          && Math.abs(rect(b).y - rect(c).y) <= 3);
        if (box) rect(c).x = rect(box).x;
      }
      alignHeaders(Object.values(c._children.Children?._children ?? {}));
    }
  }
  alignHeaders(panel.controls);
  return panel;
}
