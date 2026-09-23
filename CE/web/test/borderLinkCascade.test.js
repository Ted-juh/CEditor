import test from 'node:test';
import assert from 'node:assert/strict';
import { linkTogglePatch } from '../src/CE_Application/utils/borderLinkCascade.js';

test('unlink patches preserve each selected control\'s own linked corners', () => {
  const pill = linkTogglePatch({ linked: true, thickness: 2 }, { linked: true, radius: 20 }, false);
  const toggle = linkTogglePatch({ linked: true, thickness: 1 }, { linked: true, radius: 8 }, false);

  for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
    assert.equal(pill[`Background.Corners.${key}.radius`], 20);
    assert.equal(toggle[`Background.Corners.${key}.radius`], 8);
  }
  assert.equal(pill['Background.Border.top.thickness'], 2);
  assert.equal(toggle['Background.Border.top.thickness'], 1);
  assert.equal(pill['Background.Corners.linked'], false);
  assert.equal(toggle['Background.Corners.linked'], false);
});
