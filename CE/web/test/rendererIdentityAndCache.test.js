import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import TwoBackgroundRenderers from './fixtures/TwoBackgroundRenderers.svelte';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import {
  lcdAnimationCacheKey,
  pruneLcdAnimationCaches,
} from '../src/CE_Application/editor/lcdAnimationCache.js';

test('each BackgroundRenderer owns its SVG defs and every paint reference resolves locally', () => {
  const background = structuredClone(SECTION_DEFAULTS.Background);
  Object.assign(background._children.Border, {
    fillSolid: false,
    fillGradient: true,
    fillImage: true,
    fillOverlay: true,
    imageSrc: 'data:image/svg+xml,%3Csvg/%3E',
    overlaySrc: 'data:image/svg+xml,%3Csvg/%3E',
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { color: 'FF0000', position: 0 },
        { color: '0000FF', position: 100 },
      ],
    },
  });

  const html = render(TwoBackgroundRenderers, { props: { background } }).body;
  const ids = [...html.matchAll(/<(?:linearGradient|radialGradient|pattern) id="([^"]+)"/g)]
    .map((match) => match[1]);
  const refs = [...html.matchAll(/stroke="url\(#([^\)]+)\)"/g)].map((match) => match[1]);

  assert.ok(ids.length >= 2, 'both renderer instances emit gradient definitions');
  assert.equal(new Set(ids).size, ids.length, 'no definition id is shared across instances');
  assert.ok(refs.length >= 2, 'both renderer instances use their definitions');
  assert.deepEqual([...new Set(refs.filter((id) => !ids.includes(id)))], [],
    'every url(#…) points at a definition emitted in the same rendered document');
});

test('LCD animation cache identity includes the complete source', () => {
  const suffix = 'same-final-24-characters';
  assert.equal(suffix.length, 24);
  const common = { id: 'anim', w: 16, h: 8, frames: 4, spriteCols: 2, fps: 12 };
  const first = { ...common, src: `data:image/a-${suffix}` };
  const second = { ...common, src: `data:image/b-${suffix}` };

  assert.equal(first.src.length, second.src.length, 'this is the collision shape of the old key');
  assert.notEqual(lcdAnimationCacheKey(first, true), lcdAnimationCacheKey(second, true));
  assert.equal(lcdAnimationCacheKey(first, true), lcdAnimationCacheKey({ ...first }, true),
    'an unchanged decode request keeps its cache entry');
});

test('LCD animation caches drop entries whose element ids were removed', () => {
  const caches = {
    keep: { key: 'a', cache: {} },
    removed: { key: 'b', cache: {} },
  };
  const pruned = pruneLcdAnimationCaches(caches, [{ id: 'keep' }]);

  assert.deepEqual(Object.keys(pruned), ['keep']);
  assert.equal(pruned.keep, caches.keep, 'live decoded frames are retained');
  assert.notEqual(pruned, caches, 'pruning publishes a new object for Svelte reactivity');
  assert.equal(pruneLcdAnimationCaches(pruned, [{ id: 'keep' }]), pruned,
    'a stable list preserves identity and cannot retrigger the effect');
});

test('LCD animation caches retain authored elements while rendering hides them', () => {
  const caches = { blink: { key: 'decoded', cache: { frames: [1] } } };
  const pruned = pruneLcdAnimationCaches(caches, [{ id: 'blink', visibleNow: false }]);

  assert.equal(pruned, caches,
    'temporary blink visibility must not be interpreted as removal from the authored animation list');
});
