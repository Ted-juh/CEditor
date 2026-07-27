import test from 'node:test';
import assert from 'node:assert/strict';

import { listPanelCustomApiEndpoints } from '../src/CE_Application/utils/panelCustomComponentLinks.js';

function customComponent(id) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'CustomComponent' },
      PublishedProperties: { inputs: { mainValue: { channel: 'mainValue', label: 'Main', type: 'float', enabled: true } }, outputs: {} },
      ValueChannels: { _children: { mainValue: { type: 'float', min: 0, max: 1 } } },
    },
  };
}
function container(id, children = []) {
  const map = {};
  for (const c of children) map[c._children.Core.id] = c;
  return { _children: { Core: { id, name: id, controlType: 'Container' }, Children: { _type: 'Children', _children: map } } };
}

test('panel endpoint scan discovers a custom component nested in a container', () => {
  const tree = [container('C', [customComponent('CC')])];
  const eps = listPanelCustomApiEndpoints(tree);
  assert.ok(eps.some(e => e.controlId === 'CC'), 'nested custom component must be linkable');
});

test('nested endpoint is listed exactly once (no double-flatten)', () => {
  const tree = [container('C', [customComponent('CC')])];
  const eps = listPanelCustomApiEndpoints(tree).filter(e => e.controlId === 'CC');
  assert.equal(eps.length, 1);
});

test('top-level custom components still discovered (flat unchanged)', () => {
  const eps = listPanelCustomApiEndpoints([customComponent('A'), customComponent('B')]);
  assert.deepEqual(eps.map(e => e.controlId).sort(), ['A', 'B']);
});

test('deeply nested (container in container) is discovered', () => {
  const tree = [container('OUTER', [container('INNER', [customComponent('DEEP')])])];
  const eps = listPanelCustomApiEndpoints(tree);
  assert.ok(eps.some(e => e.controlId === 'DEEP'));
});
