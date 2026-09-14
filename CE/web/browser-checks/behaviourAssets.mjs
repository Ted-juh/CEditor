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
    // The PROBE'S OWN bytes, which is a sharper question than the line above: an envelope also
    // carries a generated thumbnail, and that is a data:image/ URL too — so `carriesBytes` cannot
    // tell "the artwork travelled" from "the package has a preview picture".
    carriesTheArtwork: json.includes(String(control?._children?.Assets?.images?.probeArt?.source ?? '\u0000').slice(0, 64)),
    // Both copies of the section: the envelope holds Assets on its own AND inside `component`, so
    // a strip that misses either leaves the bytes in the file by the other route.
    sourceInAssets: !!envelope?.assets?.images?.probeArt?.source,
    sourceInComponent: !!assets?.images?.probeArt?.source,
    assetsEmbedded: envelope?.assetsEmbedded,
    manifest: envelope?.assetManifest?.images?.[0] ?? null,
    fontManifest: envelope?.fontManifest ?? null,
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
    led.check(A, 'packagePolicy.embedAssets',
      'switching it off leaves the artwork OUT of the package — and out of both copies of the Assets section, because the envelope carries one on its own and another inside `component`, so a strip that missed either would leave the bytes in the file by the other route and the toggle would appear to do nothing for the one reason nobody checks',
      { carriesTheArtwork: false, sourceInAssets: false, sourceInComponent: false, assetsEmbedded: false, smaller: true },
      { carriesTheArtwork: refusing.carriesTheArtwork, sourceInAssets: refusing.sourceInAssets,
        sourceInComponent: refusing.sourceInComponent, assetsEmbedded: refusing.assetsEmbedded,
        smaller: refusing.bytes < embedding.bytes });
    led.check(A, 'packagePolicy.embedAssets (the reference survives the strip)',
      'the asset is still there by name and at its real size, and the manifest says plainly that the bytes are not — `linked`, not `embedded`, and `hasSource: false`. That is the difference between a package that deliberately omits its artwork and one that is simply broken, and it is said in the file rather than inferred from an absence',
      { named: ['probeArt'], sourceType: 'linked', width: 24, hasSource: false },
      { named: refusing.images, sourceType: refusing.manifest?.sourceType,
        width: refusing.manifest?.width, hasSource: refusing.manifest?.hasSource });

    await kit.set(id, { 'Assets.packagePolicy.embedAssets': true });
    await kit.settle(600);
    const embeddingAgain = await packaged(id);
    led.check(A, 'packagePolicy.embedAssets (and back on again)',
      'turning it back on restores the bytes, so the setting is a switch rather than a one-way door — and this is the measurement that says the row above is the toggle and not the fixture, since one field changes between the two',
      { carriesTheArtwork: true, assetsEmbedded: true },
      { carriesTheArtwork: embeddingAgain.carriesTheArtwork, assetsEmbedded: embeddingAgain.assetsEmbedded });

    // ---------------------------------------------------------------------------------------
    // The Fonts toggle. A font is the one asset a package cannot carry: images travel as bytes,
    // a typeface is a NAME, and whether it resolves depends on the machine it is opened on. So
    // the promise is a warning, and a warning needs two things this had neither of — a list of
    // what the component asks for, and something to compare it against.
    // ---------------------------------------------------------------------------------------
    await kit.page.evaluate(async (id) => {
      const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
      applyControlPatch(id, { 'Parts.caption': { _type: 'Part', name: 'caption',
        x: 10, y: 10, width: 60, height: 20,
        _children: { Text: { _type: 'Text', content: 'Hz',
          _children: { Font: { _type: 'Font', family: 'Nonexistent Sans', size: 12 } } } } } });
    }, id);
    await kit.settle(500);

    const fonts = await kit.page.evaluate(async ({ id }) => {
      const { listCustomComponentFontFamilies, missingCustomComponentFonts } =
        await import('/src/CE_Application/utils/customComponentPackage.js');
      const { availableFonts } = await import('/src/CE_Application/stores/appSettings.js');
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const control = (live?.controls ?? []).find((c) => c._children.Core.id === id);
      const installed = get(availableFonts) ?? [];
      return {
        asks: listCustomComponentFontFamilies(control),
        missing: missingCustomComponentFonts(control, installed),
        // Against a machine that HAS it, so the row proves a comparison rather than a constant.
        missingWhenInstalled: missingCustomComponentFonts(control, [...installed, { value: 'Nonexistent Sans' }]),
        installedCount: installed.length,
      };
    }, { id });

    led.check(A, 'packagePolicy.warnMissingFonts',
      'a component whose text names a font this machine does not have is reported as wanting it — collected from the parts as they will actually render, and compared against `availableFonts`, which is the built-in faces plus whatever the user has imported. Told to the user in the import preview, where it is still a decision, rather than after the package is already in the library',
      { asks: ['Nonexistent Sans'], missing: ['Nonexistent Sans'], missingWhenInstalled: [], hasFontsToCompareAgainst: true },
      { asks: fonts.asks, missing: fonts.missing, missingWhenInstalled: fonts.missingWhenInstalled,
        hasFontsToCompareAgainst: fonts.installedCount > 0 });

    const quieted = await kit.page.evaluate(async ({ id }) => {
      const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
      applyControlPatch(id, { 'Assets.packagePolicy.warnMissingFonts': false });
      const { missingCustomComponentFonts, listCustomComponentFontFamilies, createCustomComponentExportEnvelope } =
        await import('/src/CE_Application/utils/customComponentPackage.js');
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const control = (live?.controls ?? []).find((c) => c._children.Core.id === id);
      return {
        missing: missingCustomComponentFonts(control, []),
        stillAsks: listCustomComponentFontFamilies(control),
        manifest: createCustomComponentExportEnvelope(control, { name: 'Probe' }).fontManifest,
      };
    }, { id });

    led.check(A, 'packagePolicy.warnMissingFonts (off silences the warning without erasing the need)',
      'switched off, nothing is reported even against a machine with no fonts at all — and the component still DECLARES what it wants, in the package, so turning the warning off hides the message rather than the requirement. An author who knows their audience has the typeface should not be told twice; a recipient should still be able to find out',
      { missing: [], stillAsks: ['Nonexistent Sans'], manifest: { families: ['Nonexistent Sans'], warnMissing: false } },
      { missing: quieted.missing, stillAsks: quieted.stillAsks, manifest: quieted.manifest });

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
