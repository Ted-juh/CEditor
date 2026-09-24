import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';

export const SHOW_GRAPH = 'GRAPH \u203a', SHOW_FADERS = 'FADERS \u203a';

// Use an ordinary panel button, so a saved panel never relies on a special tab
// renderer to turn two page tabs into one alternating control.
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
    const pagePath = `${s.Core.id}.TabContainer.pageIndex`;
    // The label names what a click SHOWS, not what is showing: a button reading "Fader" beside
    // faders reads as a caption, not as a way to reach the graph.
    const label = page => page === 1 ? SHOW_FADERS : SHOW_GRAPH;
    const tooltip = 'Switch between envelope faders and graph.';
    const source = `function onClick() { const next = Number(get('${pagePath}')) === 1 ? 0 : 1; set('${pagePath}', next); set('${id}.Text.content', next === 1 ? '${SHOW_FADERS}' : '${SHOW_GRAPH}'); }`;
    const existing = panel.controls.find(c => c._children.Core.id === id);
    if (existing) {
      // A saved panel: bring the wording up to date without moving or restyling the button.
      existing._children.Text.content = label(cfg.pageIndex);
      const click = panel.scripts.find(x => x.id === `${id}_click`);
      if (click) click.source = source;
      continue;
    }
    panel.controls.push(createControl('Button', {
      Core: { id, name, tooltip },
      Transform: { x: t.x + t.width - 62, y: t.y + 2, width: 58, height: 16 },
      Text: { content: label(cfg.pageIndex), _children: { Font: { size: 9 }, Fill: { colour: 'FFFFE1A0' } } },
      ContentLayout: { paddingLeft: 2, paddingRight: 2, paddingTop: 0, paddingBottom: 0 },
      Background: { _children: { Fill: { colour: 'FF39372B' }, Border: { colour: 'FFE2A52C', thickness: 1 }, Corners: { radius: 4 } } },
    }));
    panel.scripts.push(createScript({ id: `${id}_click`, name: `Tone ${tone} ${kind} view`, scope: 'panel', target: name,
      language: 'javascript', event: 'onClick', source,
    }));
  }
  return panel;
}
