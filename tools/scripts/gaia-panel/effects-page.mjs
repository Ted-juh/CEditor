import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// The effects belong to the whole patch. Put them in a lower page beside the
// arpeggiator and system pages, keeping every existing control and binding ID.
export function moveEffectsToPage(panel) {
  const all = flatControls(panel.controls);
  const named = name => all.find(control => control._children.Core.name === name);
  const bottom = named('bottom_pages');
  const firstEffect = named('box_DISTORTION');
  if (!bottom || !firstEffect || !named('box_EFFECTS / OUTPUT')) {
    throw new Error('GAIA effects page sources missing');
  }
  if (bottom._children.TabContainer.pages.some(page => page.id === 'effects')) return panel;

  const bottomRect = bottom._children.Transform;
  const effectsTop = firstEffect._children.Transform.y;
  const oldBottomY = bottomRect.y;
  const shift = oldBottomY - effectsTop;
  if (shift <= 0) throw new Error('GAIA effects must precede the lower pages');

  const effectControls = panel.controls.filter(control => {
    const y = control._children.Transform?.y;
    return y >= effectsTop && y < oldBottomY;
  });
  if (effectControls.length < 50) throw new Error('GAIA effects row is incomplete');
  const moving = new Set(effectControls);
  panel.controls = panel.controls.filter(control => !moving.has(control));
  for (const control of effectControls) {
    control._children.Core.tabPageId = 'effects';
    control._children.Transform.x -= bottomRect.x;
    control._children.Transform.y -= effectsTop - bottom._children.TabContainer.stripSize;
    bottom._children.Children._children[control._children.Core.id] = control;
  }

  bottom._children.TabContainer.pages.splice(3, 0, { id: 'effects', label: 'EFFECTS' });
  bottom._children.TabContainer.pageIndex = 2;
  bottomRect.y = effectsTop;
  for (const control of panel.controls) {
    if (control === bottom) continue;
    const rect = control._children.Transform;
    if (control._children.Core.name === 'plate') rect.height -= shift;
    else if (rect.y >= oldBottomY) rect.y -= shift;
  }
  panel.height -= shift;
  return panel;
}
