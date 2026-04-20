import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPanelUpdates, mutatePanelControlsByIdsInList } from '../src/CE_Application/stores/panelDocumentHelpers.js';

test('applyPanelUpdates keeps aspect ratio when only width changes', () => {
  const panel = {
    id: 1,
    width: 200,
    height: 100,
    lockAspectRatio: true,
    modified: false,
  };

  const next = applyPanelUpdates(panel, { width: 300 });

  assert.equal(next.width, 300);
  assert.equal(next.height, 150);
  assert.equal(next.modified, true);
});

test('mutatePanelControlsByIdsInList batches only targeted controls', () => {
  const list = [{
    id: 1,
    modified: false,
    controls: [
      { _children: { Core: { id: 'a' }, Transform: { x: 10 } } },
      { _children: { Core: { id: 'b' }, Transform: { x: 20 } } },
    ],
  }];

  const nextList = mutatePanelControlsByIdsInList(list, 1, new Set(['b']), (draft) => {
    draft._children.Transform.x = 99;
    return true;
  });

  assert.equal(nextList[0].controls[0]._children.Transform.x, 10);
  assert.equal(nextList[0].controls[1]._children.Transform.x, 99);
  assert.equal(nextList[0].modified, true);
});
