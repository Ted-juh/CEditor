import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// Keep the original fader IDs as the graph's authoritative parameter sources.
// The view container sits behind the section's other controls, so the header
// switches share its existing title band without reserving another control row.
export function applyEnvelopeViews(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  for (const tone of [1, 2, 3]) for (const [kind, title] of [['osc.pitchEnv', 'OSC'], ['filter.env', 'FILTER'], ['amp.env', 'AMP']]) {
    const name = `tone${tone}.${kind}.view`;
    if (named(name)) continue;
    const graph = named(`tone${tone}_${kind.replace(/\W/g, '_')}_graph`);
    const sources = Object.values(graph._children.Envelope.stageSources).map(link => all.find(c => c._children.Core.id === link.controlId));
    const oldGraph = { ...graph._children.Transform };
    const box = panel.controls.find(c => c._children.Core.name === `box_${title}`
      && oldGraph.y >= c._children.Transform.y && oldGraph.y < c._children.Transform.y + c._children.Transform.height);
    const captions = sources.map(source => panel.controls.find(c => c._children.Core.controlType === 'Label'
      && Math.abs(c._children.Transform.x + c._children.Transform.width / 2 - source._children.Transform.x - source._children.Transform.width / 2) < 2
      && c._children.Transform.y >= source._children.Transform.y + source._children.Transform.height
      && c._children.Transform.y < source._children.Transform.y + source._children.Transform.height + 8));
    if (captions.some(c => !c)) throw new Error(`Missing envelope caption: ${name}`);
    const x = Math.min(oldGraph.x, ...captions.map(c => c._children.Transform.x));
    const right = Math.max(oldGraph.x + oldGraph.width, ...captions.map(c => c._children.Transform.x + c._children.Transform.width));
    const y = box._children.Transform.y;
    const width = kind === 'osc.pitchEnv' ? Math.max(164, right - x) : right - x;
    const height = box._children.Transform.height - 1;
    const strip = 18;
    const view = createControl('TabContainer', {
      Core: { id: name.replaceAll('.', '_'), name },
      Transform: { x, y, width, height },
      TabContainer: { pages: [{ id: 'fader', label: 'Fader' }, { id: 'graph', label: 'Graph' }], pageIndex: 0,
        appearance: 'buttons', stripSize: strip, buttonGroupWidth: 112, buttonHeight: 14, buttonGap: 4, labelSize: 9,
        stripColour: '00000000', tabColour: 'FF252D32', activeTabColour: 'FF39372B',
        labelColour: 'FFB8C3CA', activeLabelColour: 'FFFFE1A0', accentColour: 'FFE2A52C' },
      Children: { padding: 0, clipChildren: true },
      Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false } } },
    });
    const moved = new Set([graph, ...sources, ...captions]);
    for (const source of sources) {
      const t = source._children.Transform, bottom = t.y + t.height;
      t.y = oldGraph.y; t.height = bottom - oldGraph.y;
    }
    Object.assign(graph._children.Transform, { x: x + 8, y: oldGraph.y, width: width - 16, height: y + height - oldGraph.y - 4 });
    view._children.Children._children = {};
    for (const c of moved) {
      c._children.Core.tabPageId = c === graph ? 'graph' : 'fader';
      c._children.Transform.x -= x;
      c._children.Transform.y -= y + strip;
      view._children.Children._children[c._children.Core.id] = c;
    }
    panel.controls = panel.controls.filter(c => !moved.has(c));
    panel.controls.splice(panel.controls.indexOf(box) + 1, 0, view);
  }
  return panel;
}

/**
 * Centre the OSC pitch-envelope graph in the gap it shares with the faders around it.
 *
 * The pitch envelope has two stages, so its view is sized by a floor (164px) rather than by what
 * sits beside it, and its graph ended 9px short of ENV DEPTH while starting 70px after PW — plainly
 * off-centre, and narrower than the FILTER and AMP graphs. The graph now spans from PW to ENV DEPTH
 * with the row's own fader gap on both sides (PWM to PW), and the view is widened to hold it. The
 * A and D faders keep their panel positions. Derived from the neighbours every time, so a second
 * run changes nothing.
 */
export function alignPitchEnvelopeGraphs(panel) {
  const all = flatControls(panel.controls);
  const named = (name) => all.find((c) => c._children.Core.name === name);
  for (const tone of [1, 2, 3]) {
    const view = named(`tone${tone}.osc.pitchEnv.view`);
    const pwm = named(`tone${tone}.osc.pulseWidthModDepth`)?._children.Transform;
    const pw = named(`tone${tone}.osc.pulseWidth`)?._children.Transform;
    const depth = named(`tone${tone}.osc.pitchEnvDepth`)?._children.Transform;
    if (!view || !pwm || !pw || !depth) throw new Error(`alignPitchEnvelopeGraphs: tone ${tone} OSC row is incomplete`);
    const kids = Object.values(view._children.Children._children);
    const graph = kids.find((c) => c._children.Envelope);
    const gap = pw.x - (pwm.x + pwm.width);
    const left = pw.x + pw.width + gap;
    const right = depth.x - gap;
    const inset = 8;                                   // the view's own margin round its graph
    const v = view._children.Transform;
    const newX = left - inset;
    for (const child of kids) child._children.Transform.x += v.x - newX;   // same place on the panel
    v.x = newX;
    v.width = right - left + inset * 2;
    Object.assign(graph._children.Transform, { x: inset, width: right - left });
  }
  return panel;
}
