import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';
import { gaiaCornerTab } from './components.mjs';

const TAB_HEIGHT = 20;
const TAB_WIDTH = 64;

/** The section box a view sits in: the smallest `box_*` whose rectangle contains it. */
function boxAround(panel, view) {
  const v = view._children.Transform;
  return panel.controls
    .filter((c) => String(c._children.Core.name ?? '').startsWith('box_'))
    .filter((c) => {
      const b = c._children.Transform;
      return v.x >= b.x && v.y >= b.y && v.x + v.width <= b.x + b.width + 1 && v.y + v.height <= b.y + b.height + 1;
    })
    .sort((a, b) => a._children.Transform.width * a._children.Transform.height
      - b._children.Transform.width * b._children.Transform.height)[0] ?? null;
}

// Use an ordinary panel button, so a saved panel never relies on a special tab
// renderer to turn two page tabs into one alternating control.
//
// It sits in the section's top-RIGHT corner, in the section name's tab mirrored (gaiaCornerTab),
// so the two ends of the section's top edge read as a pair: what the section is on the left,
// which view it is showing on the right. The Button stays the click target and keeps its script;
// it is transparent, drawn over the tab shape, with the section title's dark capitals.
export function applyEnvelopeButtons(panel) {
  for (const tone of [1, 2, 3]) for (const kind of ['osc.pitchEnv', 'filter.env', 'amp.env']) {
    const view = panel.controls.find(c => c._children.Core.name === `tone${tone}.${kind}.view`);
    const s = view._children, cfg = s.TabContainer, t = s.Transform;
    if (cfg.showStrip !== false) {
      for (const c of Object.values(s.Children._children)) c._children.Transform.y += cfg.stripSize;
    }
    cfg.showStrip = false;
    delete cfg.cycleButton;
    const name = `${s.Core.name}Button`, id = `${s.Core.id}_button`;
    if (panel.controls.some(c => c._children.Core.id === id)) continue;

    const box = boxAround(panel, view);
    if (!box) throw new Error(`envelope-buttons: no section box around ${s.Core.name}`);
    const b = box._children.Transform;
    const tint = box._children.Background?._children?.Border?.colour ?? 'FFE2A52C';
    // The same 2px inset from the box edge the section name's tab keeps on the left.
    const at = { x: b.x + b.width - 2 - TAB_WIDTH, y: b.y + 2, width: TAB_WIDTH, height: TAB_HEIGHT };

    const shape = gaiaCornerTab({ width: TAB_WIDTH, height: TAB_HEIGHT, tint });
    Object.assign(shape._children.Core, { id: `${s.Core.id}_button_tab`, name: `${s.Core.name}ButtonTab` });
    Object.assign(shape._children.Transform, at);
    panel.controls.push(shape);

    panel.controls.push(createControl('Button', {
      Core: { id, name, tooltip: 'Switch between envelope faders and graph.' },
      Transform: { ...at },
      Text: {
        content: cfg.pageIndex === 1 ? 'GRAPH' : 'FADER',
        _children: { Font: { size: 10, bold: true, weight: 'Bold', weightValue: 700, letterSpacing: 1 }, Fill: { colour: 'FF13161A' } },
      },
      // Text centred on the tab's body, clear of the slant at its left end.
      ContentLayout: { paddingLeft: Math.round(TAB_HEIGHT * 0.6), paddingRight: 2, paddingTop: 0, paddingBottom: 0 },
      Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 }, Corners: { radius: 0 } } },
    }));
    const pagePath = `${s.Core.id}.TabContainer.pageIndex`;
    panel.scripts.push(createScript({ id: `${id}_click`, name: `Tone ${tone} ${kind} view`, scope: 'panel', target: name,
      language: 'javascript', event: 'onClick',
      source: `function onClick() { const next = Number(get('${pagePath}')) === 1 ? 0 : 1; set('${pagePath}', next); set('${id}.Text.content', next ? 'GRAPH' : 'FADER'); }`,
    }));
  }
  return panel;
}
