/**
 * behaviourAssets.mjs — the `Assets` section: the images and filmstrips a custom component carries
 * with it, the two maps beside them, and the packaging policy that decides what travels.
 *
 * The last five properties of the editor-and-shared half, and the smallest suite here, because two
 * of them are already driven by `browser-checks/assetsTab.mjs` against the real Assets tab and the
 * real CSS. What is left is the question that tab does not ask: when the component is PACKAGED,
 * does the policy change what goes into the envelope?
 *
 * That is measured by calling the packager itself — `createCustomComponentExportEnvelope`, the same
 * function the Save-to-library path uses — rather than by reading the code, because the two toggles
 * make a specific promise in the tab: "Package images and filmstrips with saved components", and
 * "Warn when downloaded components reference missing fonts".
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('assets');
const A = 'Assets';

/** Package the control the way the library does, and report what the envelope carries. */
const packaged = (id) => kit.page.evaluate(async ({ id }) => {
  const { createCustomComponentExportEnvelope } =
    await import('/src/CE_Application/utils/customComponentPackage.js');
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const live = get(panels).find((p) => p.id === get(activePanelId));
  const control = (live?.controls ?? []).find((c) => c._children.Core.id === id);
  if (!control) return null;
  const envelope = createCustomComponentExportEnvelope(control, { name: 'Probe' });
  const assets = envelope?.component?._children?.Assets ?? null;
  const json = JSON.stringify(envelope ?? {});
  return {
    images: Object.keys(assets?.images ?? {}),
    filmstrips: Object.keys(assets?.filmstrips ?? {}),
    policy: assets?.packagePolicy ?? null,
    /** The data URL itself, which is what "embed" is about — bytes, not names. */
    carriesBytes: json.includes('data:image/'),
    bytes: json.length,
  };
}, { id });

try {
  await kit.fresh();
  {
    const id = await kit.make('CustomComponent', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 180, 'Transform.height': 120, 'Core.name': 'Probe' });
    await kit.settle(400);

    // An image built in the page rather than pasted in as a literal, so the fixture carries no
    // opaque blob and the "does it travel" question is about bytes we can recognise.
    const dataUrl = await kit.page.evaluate(() => {
      const cv = document.createElement('canvas');
      cv.width = 24; cv.height = 24;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ff00ff';
      cx.fillRect(0, 0, 24, 24);
      return cv.toDataURL('image/png');
    });
    await kit.set(id, { 'Assets.images.probeArt': {
      _type: 'ImageAsset', name: 'probeArt', source: dataUrl,
      mimeType: 'image/png', width: 24, height: 24,
    } });
    await kit.settle(500);

    const embedding = await packaged(id);
    led.check(A, 'images (the map the packager reads)',
      'an image added to the section is carried in the packaged component by name AND by its bytes — a name alone would be a reference to something the downloader does not have',
      { images: ['probeArt'], carriesBytes: true },
      { images: embedding.images, carriesBytes: embedding.carriesBytes });

    await kit.set(id, { 'Assets.packagePolicy.embedAssets': false });
    await kit.settle(600);
    const refusing = await packaged(id);
    led.inert(A, 'packagePolicy.embedAssets',
      'package images and filmstrips with saved components',
      `USER-VISIBLE AND NOT CONNECTED. It is a toggle in the Assets tab whose hint is "Package images and filmstrips with saved components", and the packager does not consult it: with it switched OFF, \`createCustomComponentExportEnvelope\` still returns the image by name (${JSON.stringify(refusing.images)}) and still carries its bytes (${refusing.carriesBytes}), in an envelope the same size to within a few characters (${embedding.bytes} on, ${refusing.bytes} off — the difference is the policy flag itself). \`customComponentPackage.js\` mentions \`Assets.images\` and \`Assets.filmstrips\` only to VALIDATE that a part's target exists, and never reads \`packagePolicy\`. What the switch does do is get written and saved, which assetsTab.mjs already checks — so the setting round-trips perfectly and means nothing. Smallest honest release treatment: the toggle promises a smaller package, so either implement the strip in the packager or take the cell out; leaving it is the one option that misleads.`);
    led.inert(A, 'packagePolicy.warnMissingFonts',
      'warn when a downloaded component references a font that is not installed',
      'the same, and with less behind it: no reader anywhere, and no font-checking step exists in the import path for it to gate. `Assets.fonts` — the map it would check against — is declared and read by nothing either, so the warning has neither a trigger nor a source. Smallest honest release treatment: take the cell out until the check exists.');

    led.unsupported(A, 'fonts',
      'the fonts this component carries with it',
      'not a property: an empty map that nothing writes and nothing reads. `assetsModel.js` states the shape of the section outright — `ASSET_MAP_BY_KIND = { image: "images", filmstrip: "filmstrips" }` — so the Assets tab has two kinds, and `fonts` is not one of them. The fonts a panel actually uses live in `appSettings.fonts`, which is the app-wide library the Assets tab imports into.');
    led.unsupported(A, 'thumbnails',
      'per-asset thumbnail pictures',
      'not a property, and easy to mistake for one that is. A packaged component DOES carry a thumbnail — `createCustomComponentThumbnail` builds it and the library card shows `envelope.thumbnail` — but that is a field on the envelope, not this map. `Assets.thumbnails` is an empty map with no reader and no writer anywhere in src/.');
  }

  led.closed(A, 'images + filmstrips (the tab, the library and the frame maths)',
    'the two asset maps, as the Assets tab drives them',
    'browser-checks/assetsTab.mjs. It builds a component with one image and two filmstrips, then asserts against the REAL tab and the real CSS: that both kinds share one library sorted by name, that every tile actually painted a picture, that a filmstrip tile shows its FIRST frame rather than the whole strip smeared across it, and at the frame shape the asset declares — so a round knob comes out round and a strip with a wrong frame count comes out visibly squashed rather than silently tidied. It also removes an asset and checks the component and the library both heal. That is a better test of the two maps than anything this suite could write from the model side, and the row above only adds what it does not ask: what the packager does with them.');

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
