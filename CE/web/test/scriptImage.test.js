// scriptImage.test.js — ce.image (design doc §50).
//
// The fields were always writable by path, so nothing here tests reach. What it pins is the three
// things a bare set() gets wrong, each of which I only found by reading the code that consumes them:
//
//  1. TWO ACTIVATION MODELS. Background.Fill composites — `layerOrder` decides stacking and each
//     layer has its own Enabled/Muted. Text.Fill is EXCLUSIVE: the renderer switches on `mode`, and
//     `imageEnabled` is bookkeeping the editor keeps for the filmstrip baker. So "turn it on" is two
//     different writes, and a layer enabled but missing from layerOrder is set up and invisible.
//  2. TWO `fit` VOCABULARIES UNDER ONE NAME — background fill/fit/stretch/tile/original against text
//     cover/contain/fill, where `fill` does not even mean the same thing. A shared list would be
//     wrong for one of them.
//  3. THREE SOURCE MODELS with different portability: a data URL travels, a file path does not, and
//     an icon-library reference does not either.
//
// Every vocabulary is asserted against the module the renderer reads it from, never against a list
// retyped here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get as storeGet } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { appSettings } from '../src/CE_Application/stores/appSettings.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { MODULES, MEMBER_BY_ID, moduleMemberMap } from '../src/CE_Application/scripting/panelApi.js';
import {
  BACKGROUND_ALIGNS, BACKGROUND_FITS, IMAGE_LAYERS, IMAGE_LAYER_IDS, TEXT_FITS,
  imageLayer, isPortableSource, sourceKind,
} from '../src/CE_Application/utils/imageLayers.js';
import { fitToCSS } from '../src/CE_Application/utils/backgroundCSS.js';
import { normalizeFillMode } from '../src/CE_Application/editor/canvasControlStyles.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function withControls(fn) {
  const label = createControl('Label', { name: 'L' });
  const knob = createControl('Knob', { name: 'K' });
  panels.set([{
    id: 'p', name: 'P', controls: [label, knob],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  try { return fn(scriptApiForTesting('', 'image-script'), label); } finally { panels.set([]); }
}

/** Install icons in the settings the catalogue derives from. */
function withIcons(entries, fn) {
  const before = storeGet(appSettings);
  appSettings.set({ ...before, icons: entries });
  try { return fn(); } finally { appSettings.set(before); }
}

const traced = () => storeGet(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* ------------------------------------------------------------------ the contract */

test('every member is declared, and the flat names keep the prefix', () => {
  const map = moduleMemberMap('ce.image');
  assert.deepEqual(Object.keys(map).sort(),
    ['asset', 'assets', 'clear', 'embed', 'icon', 'load', 'read', 'set'].sort());
  for (const [short, flat] of Object.entries(map)) {
    // §1: `set`, `read`, `clear` and `load` as bare globals would collide with ce.core's own verbs.
    assert.ok(flat.startsWith('image'), `${short} -> ${flat} must keep the image prefix`);
    assert.ok(MEMBER_BY_ID[flat], `${flat} is mapped but not declared`);
  }
  withControls((api) => {
    for (const flat of Object.values(map)) {
      assert.equal(typeof api[flat], 'function', `${flat} missing from the runtime`);
    }
  });
});

test('the declared layer values are exactly the layers that exist', () => {
  for (const id of ['imageClear', 'imageRead', 'imageEmbed']) {
    const declared = MEMBER_BY_ID[id].params.find((p) => p.name === 'layer').values;
    assert.deepEqual([...declared].sort(), [...IMAGE_LAYER_IDS].sort(), id);
  }
});

/* ------------------------------------------------------------------ the vocabularies are the app's */

test('the background fit vocabulary is the one fitToCSS honours', () => {
  // fitToCSS falls through to `cover` for anything it does not recognise, so a value it handles is
  // one whose CSS differs from the fallback. That is the only way to check this without retyping the
  // switch — and it is what makes the list right rather than merely plausible.
  const fallback = fitToCSS('nonsense-value', 'center', 0, 0, false, false, 1, 0, 100, 50);
  const handled = BACKGROUND_FITS.filter((f) =>
    fitToCSS(f, 'center', 0, 0, false, false, 1, 0, 100, 50) !== fallback);
  assert.deepEqual(handled.sort(), [...BACKGROUND_FITS].sort(),
    'every declared fit must produce CSS the unrecognised-value fallback does not');
  // …and the fallback really is the unrecognised branch: it omits background-position, which every
  // handled fit except `stretch` sets. That is what makes the comparison above meaningful.
  assert.ok(!fallback.includes('background-position'));
});

test('the background align vocabulary is fitToCSS\'s own posMap', () => {
  const fallback = fitToCSS('fit', 'nonsense', 0, 0, false, false, 1, 0, 100, 50);
  for (const align of BACKGROUND_ALIGNS) {
    const css = fitToCSS('fit', align, 0, 0, false, false, 1, 0, 100, 50);
    if (align === 'center') { assert.equal(css, fallback, 'center IS the fallback'); continue; }
    assert.notEqual(css, fallback, `${align} must be recognised by posMap`);
  }
});

test('the text fit vocabulary is separate, and `fill` means something different', () => {
  // Not a shared list: the background's `fill` is cover, the text's is 100% 100%. Asserting they
  // differ is what stops someone "tidying" them into one.
  assert.deepEqual(TEXT_FITS, ['cover', 'contain', 'fill']);
  assert.ok(!TEXT_FITS.includes('tile'), 'text has no tile fit');
  assert.ok(BACKGROUND_FITS.includes('tile'), 'the background does');
  assert.notDeepEqual([...TEXT_FITS].sort(), [...BACKGROUND_FITS].sort());
});

test('the text layers name modes the renderer recognises', () => {
  for (const layer of IMAGE_LAYERS.filter((l) => l.activation === 'mode')) {
    assert.equal(normalizeFillMode(layer.mode), layer.mode,
      `${layer.id} declares mode "${layer.mode}", which normalizeFillMode must accept`);
  }
});

/* ------------------------------------------------------------------ activation */

test('a background layer is enabled AND put into layerOrder', () => {
  withControls((api) => {
    api.set('L.Background.Fill.layerOrder', ['solid', 'gradient']);
    assert.equal(api.imageSet('L', PNG), true);
    assert.equal(api.get('L.Background.Fill.imageSrc'), PNG);
    assert.equal(api.get('L.Background.Fill.imageEnabled'), true);
    // The invariant a bare set() misses: the layers COMPOSITE in this order, so one that is enabled
    // but absent from it never paints.
    assert.ok(api.get('L.Background.Fill.layerOrder').includes('image'),
      'an enabled layer missing from layerOrder is set up and invisible');
  });
});

test('a text layer sets the mode, because the renderer reads mode and not Enabled', () => {
  withControls((api) => {
    assert.equal(api.imageSet('L', PNG, { layer: 'textImage' }), true);
    assert.equal(api.get('L.Text.Fill.mode'), 'image', 'the renderer switches on this');
    assert.equal(api.get('L.Text.Fill.imageEnabled'), true, 'and the baker reads this');
    // Exclusive: selecting the texture layer must move the mode, not stack it.
    assert.equal(api.imageSet('L', PNG, { layer: 'textTexture' }), true);
    assert.equal(api.get('L.Text.Fill.mode'), 'texture');
  });
});

test('read reports whether a layer will actually paint, not merely whether it is enabled', () => {
  withControls((api) => {
    api.imageSet('L', PNG, { layer: 'textImage' });
    assert.equal(api.imageRead('L', 'textImage').active, true);
    // Move the mode away by hand: Enabled is still true, but nothing will paint. `active` is the
    // honest answer and the field is not.
    api.set('L.Text.Fill.mode', 'solid');
    assert.equal(api.get('L.Text.Fill.imageEnabled'), true);
    assert.equal(api.imageRead('L', 'textImage').active, false);
  });
});

test('muting a background layer makes it inactive without disabling it', () => {
  withControls((api) => {
    api.imageSet('L', PNG);
    assert.equal(api.imageRead('L').active, true);
    api.imageSet('L', PNG, { muted: true });
    assert.equal(api.imageRead('L').active, false);
    assert.equal(api.get('L.Background.Fill.imageEnabled'), true, 'still enabled, just muted');
  });
});

/* ------------------------------------------------------------------ the src/enabled invariant */

test('src and enabled are written together, so a layer is never enabled and blank', () => {
  withControls((api) => {
    api.imageSet('L', PNG);
    assert.equal(api.imageSet('L', ''), true, 'clearing through set() is legitimate');
    assert.equal(api.get('L.Background.Fill.imageSrc'), '');
    assert.equal(api.get('L.Background.Fill.imageEnabled'), false,
      'blanking the source must switch the layer off too');
  });
});

test('clear switches a layer off and returns an exclusive one to solid', () => {
  withControls((api) => {
    api.imageSet('L', PNG, { layer: 'textImage' });
    assert.equal(api.imageClear('L', 'textImage'), true);
    assert.equal(api.get('L.Text.Fill.imageSrc'), '');
    assert.equal(api.get('L.Text.Fill.mode'), 'solid',
      'a selected mode with no source paints nothing and looks broken');
  });
});

/* ------------------------------------------------------------------ refusals */

test('a field the layer does not have is refused rather than written as a dead key', () => {
  withControls((api) => {
    clearScriptTrace();
    // The text texture layer always tiles and reads no fit — writing one would be a key nothing reads.
    assert.equal(api.imageSet('L', PNG, { layer: 'textTexture', fit: 'cover' }), false);
    assert.match(traced(), /has no fit/);
    assert.equal(api.get('L.Text.Fill.textureFit'), undefined);
  });
});

test('align is refused on a text layer, and the message points at what does work', () => {
  withControls((api) => {
    clearScriptTrace();
    assert.equal(api.imageSet('L', PNG, { layer: 'textImage', align: 'top' }), false);
    assert.match(traced(), /does not read align/);
    assert.match(traced(), /offsetX/);
  });
});

test('each layer refuses values from the other layer\'s fit vocabulary', () => {
  withControls((api) => {
    clearScriptTrace();
    // "tile" is a real background fit and not a text one; "contain" is the reverse.
    assert.equal(api.imageSet('L', PNG, { layer: 'textImage', fit: 'tile' }), false);
    assert.equal(api.imageSet('L', PNG, { fit: 'contain' }), false);
    // …and each accepts its own.
    assert.equal(api.imageSet('L', PNG, { layer: 'textImage', fit: 'contain' }), true);
    assert.equal(api.imageSet('L', PNG, { fit: 'tile' }), true);
  });
});

test('every declared fit and align value is actually accepted', () => {
  withControls((api) => {
    for (const fit of BACKGROUND_FITS) {
      assert.equal(api.imageSet('L', PNG, { fit }), true, `background fit ${fit}`);
    }
    for (const align of BACKGROUND_ALIGNS) {
      assert.equal(api.imageSet('L', PNG, { align }), true, `background align ${align}`);
    }
    for (const fit of TEXT_FITS) {
      assert.equal(api.imageSet('L', PNG, { layer: 'textImage', fit }), true, `text fit ${fit}`);
    }
  });
});

test('an unknown layer or option is reported', () => {
  withControls((api) => {
    clearScriptTrace();
    assert.equal(api.imageSet('L', PNG, { layer: 'nope' }), false);
    assert.match(traced(), /no such layer/);
    clearScriptTrace();
    assert.equal(api.imageSet('L', PNG, { nonsense: 1 }), false);
    assert.match(traced(), /not an image option/);
  });
});

test('opacity is clamped to the panel\'s own 0..100 range', () => {
  withControls((api) => {
    api.imageSet('L', PNG, { opacity: 500 });
    assert.equal(api.get('L.Background.Fill.imageOpacity'), 100);
    api.imageSet('L', PNG, { opacity: -20 });
    assert.equal(api.get('L.Background.Fill.imageOpacity'), 0);
  });
});

test('a control without the section reports rather than throwing', () => {
  withControls((api) => {
    // A Knob has no Text section at all.
    assert.equal(api.imageSet('K', PNG, { layer: 'textImage' }), false);
    assert.equal(api.imageRead('K', 'textImage'), undefined);
    assert.equal(api.imageClear('K', 'textImage'), false);
  });
});

/* ------------------------------------------------------------------ sources and portability */

test('sourceKind and portability tell the three models apart', () => {
  assert.equal(sourceKind(PNG), 'data');
  assert.equal(sourceKind('/home/me/logo.png'), 'file');
  assert.equal(sourceKind(''), 'none');
  assert.equal(isPortableSource(PNG), true);
  // A path is not in the document, so it does not travel — and neither does an http URL, which is
  // why both are "file" rather than one of them being treated as portable.
  assert.equal(isPortableSource('/home/me/logo.png'), false);
  assert.equal(isPortableSource('https://example.com/logo.png'), false);
});

test('read reports the source kind and whether it survives an export', () => {
  withControls((api) => {
    api.imageSet('L', PNG);
    assert.equal(api.imageRead('L').source, 'data');
    assert.equal(api.imageRead('L').portable, true);
    api.imageSet('L', '/tmp/logo.png');
    assert.equal(api.imageRead('L').source, 'file');
    assert.equal(api.imageRead('L').portable, false);
  });
});

test('embed is a no-op on an already-portable source', () => {
  withControls((api) => {
    api.imageSet('L', PNG);
    assert.equal(api.imageEmbed('L'), true, 'already a data URL — nothing to do, not a failure');
    assert.equal(api.get('L.Background.Fill.imageSrc'), PNG);
  });
});

test('embed reports rather than blocking when the host has not read the file yet', () => {
  withControls((api) => {
    api.imageSet('L', '/tmp/not-loaded.png');
    clearScriptTrace();
    assert.equal(api.imageEmbed('L'), false);
    // The honest answer: the read is asynchronous, it has been requested, try again. Blocking is not
    // available and pretending it worked would leave a panel that breaks on export.
    assert.match(traced(), /not loaded yet/);
    assert.match(traced(), /asynchronous/);
  });
});

test('embed on a layer with no source reports', () => {
  withControls((api) => {
    clearScriptTrace();
    assert.equal(api.imageEmbed('L'), false);
    assert.match(traced(), /has no source/);
  });
});

/* ------------------------------------------------------------------ the icon library */

test('assets reports the library, marking everything non-portable', () => {
  withIcons([
    { id: 'i1', name: 'waveform', enabled: true, sourceType: 'local', mimeType: 'image/svg+xml',
      isVector: true, dataUrl: PNG, width: 24, height: 24 },
    { id: 'i2', name: 'knob', enabled: true, sourceType: 'local', mimeType: 'image/png',
      dataUrl: '', width: 32, height: 32 },
    { id: 'i3', name: 'hidden', enabled: false, sourceType: 'local', dataUrl: PNG },
  ], () => withControls((api) => {
    const all = api.imageAssets();
    assert.equal(all.length, 2, 'a disabled icon is one the panel will not render');
    for (const a of all) assert.equal(a.portable, false, 'a library reference never travels');
    // embeddable is the useful distinction: it says whether embed() can fix that.
    assert.deepEqual(api.imageAssets({ embeddable: true }).map((a) => a.name), ['waveform']);
    assert.deepEqual(api.imageAssets({ vector: true }).map((a) => a.name), ['waveform']);
  }));
});

test('asset resolves by id then by name, the way the renderer does', () => {
  withIcons([
    { id: 'i1', name: 'waveform', enabled: true, dataUrl: PNG },
  ], () => withControls((api) => {
    assert.equal(api.imageAsset('i1').name, 'waveform');
    assert.equal(api.imageAsset('waveform').id, 'i1');
    assert.equal(api.imageAsset('WAVEFORM').id, 'i1', 'names match case-insensitively');
    assert.equal(api.imageAsset('nope'), undefined);
  }));
});

test('icon writes the id AND the name, so the fallback is not left deciding', () => {
  withIcons([
    { id: 'i1', name: 'waveform', enabled: true, dataUrl: PNG },
  ], () => withControls((api) => {
    const button = createControl('Button', { name: 'B' });
    panels.update((all) => [{ ...all[0], controls: [...all[0].controls, button] }]);
    assert.equal(api.imageIcon('B', 'waveform', { size: 20, tint: '#5B9BD5' }), true);
    assert.equal(api.get('B.Icon.assetId'), 'i1');
    // The renderer resolves by id first and falls back to matching `name` — writing only the id
    // leaves a stale name behind, and a coincidental match then looks like success.
    assert.equal(api.get('B.Icon.name'), 'waveform');
    assert.equal(api.get('B.Icon.source'), 'library');
    assert.equal(api.get('B.Icon.size'), 20);
    assert.equal(api.get('B.Icon.tint'), '5B9BD5', 'a leading # is stripped');
  }));
});

test('icon refuses an asset the library does not have', () => {
  withIcons([], () => withControls((api) => {
    const button = createControl('Button', { name: 'B' });
    panels.update((all) => [{ ...all[0], controls: [...all[0].controls, button] }]);
    clearScriptTrace();
    assert.equal(api.imageIcon('B', 'ghost'), false);
    assert.match(traced(), /no such asset/);
    assert.equal(api.get('B.Icon.assetId'), '', 'and stores nothing');
  }));
});

test('icon reports on a control with no Icon section', () => {
  // A Knob has none; a Label and a Button both do, which is worth knowing before assuming.
  withIcons([{ id: 'i1', name: 'waveform', enabled: true, dataUrl: PNG }], () => withControls((api) => {
    clearScriptTrace();
    assert.equal(api.imageIcon('K', 'waveform'), false);
    assert.match(traced(), /no Icon section/);
  }));
});

/* ------------------------------------------------------------------ load */

test('load is immediate for a data URL and pending for a path', () => {
  withControls((api) => {
    assert.equal(api.imageLoad(PNG), true, 'a data URL needs no loading');
    assert.equal(api.imageLoad(''), false);
    // Without a host the cache cannot fill, so this stays false — reported rather than hidden.
    assert.equal(api.imageLoad('/tmp/absent.png'), false);
  });
});

/* ------------------------------------------------------------------ the layer table itself */

test('every layer names a node and prefix that a real control has', () => {
  withControls((api, label) => {
    for (const layer of IMAGE_LAYERS) {
      const [section, child] = layer.node.split('.');
      const node = label._children[section]?._children?.[child];
      assert.ok(node, `${layer.id}: no ${layer.node} on a Label`);
      for (const field of layer.fields) {
        assert.ok(`${layer.prefix}${field}` in node,
          `${layer.id}: ${layer.prefix}${field} is not a field of ${layer.node}`);
      }
    }
    void api;
  });
});

test('imageLayer defaults to the background image layer', () => {
  assert.equal(imageLayer(undefined).id, 'image');
  assert.equal(imageLayer('OVERLAY').id, 'overlay');
  assert.equal(imageLayer('nope'), null);
});
