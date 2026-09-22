// Move the existing controls, retaining their IDs, values and MIDI bindings.
export function moveDBeamToSystem(panel) {
  const pages = panel.controls.find(c => c._children.Core.name === 'bottom_pages');
  const children = Object.values(pages._children.Children._children);
  const box = children.find(c => c._children.Core.name === 'box_D BEAM');
  if (box._children.Core.tabPageId === 'system') return panel;
  const b = box._children.Transform, oldX = b.x ?? 0, oldY = b.y ?? 0;
  const moved = children.filter(c => {
    const s = c._children, t = s.Transform;
    return s.Core.tabPageId === 'status' && (t.x ?? 0) >= oldX && (t.x ?? 0) < oldX + b.width
      && (t.y ?? 0) >= oldY && (t.y ?? 0) < oldY + b.height;
  });
  const system = children.filter(c => c._children.Core.tabPageId === 'system');
  const right = Math.max(...system.map(c => (c._children.Transform.x ?? 0) + c._children.Transform.width));
  const newX = pages._children.Transform.width - b.width;
  const scale = (newX - 10) / right;
  for (const c of system) {
    const t = c._children.Transform;
    t.x = (t.x ?? 0) * scale;
    t.width *= scale;
  }
  for (const c of moved) {
    const s = c._children, t = s.Transform;
    t.x = (t.x ?? 0) + newX - oldX;
    t.y = (t.y ?? 0) - oldY;
    s.Core.tabPageId = 'system';
  }
  b.height = system.find(c => c._children.Core.name === 'box_MASTER / CLOCK')._children.Transform.height;
  return panel;
}
