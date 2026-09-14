/**
 * behaviourLists.mjs — the `Listbox` appearance and navigation tail (8), the `Icon` section (7)
 * and the three `Value` fields the matrix found unreached.
 *
 * TWO SETUP FACTS, both of which make the difference between a row and a null result.
 *
 * A LISTBOX WITH NO ROWS DRAWS NOTHING BUT ITS EMPTY TEXT, and several of these properties are
 * per-row classes — zebra striping, card rows, the now-playing marker. So the fixture authors rows
 * first, and enough of them to overflow the box, because the scrollbar and the edge fade only exist
 * when there is something to scroll.
 *
 * AND AN ICON SECTION ONLY SELECTS AN ICON; it does not contain one. `hasIcon` needs a stored entry
 * with a `dataUrl` in the app's icon library AND a `ContentLayout.mode` that admits an icon — the
 * default mode is `text_only`, so a control with a perfectly good icon chosen draws none. Both are
 * arranged here, the same way behaviourLayout.mjs does it.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('lists');
const L = 'Listbox';
const I = 'Icon';
const V = 'Value';

const hasClass = (id, sel, cls) => kit.page.evaluate(({ id, sel, cls }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  const n = el?.querySelector(sel);
  return n ? n.classList.contains(cls) : null;
}, { id, sel, cls });
const countOf = (id, sel) => kit.page.evaluate(({ id, sel }) =>
  document.querySelector(`[data-control-id="${id}"]`)?.querySelectorAll(sel).length ?? null, { id, sel });
const boxOf = (id, sel, index = 0) => kit.page.evaluate(({ id, sel, index }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  const host = el?.getBoundingClientRect();
  const n = el?.querySelectorAll(sel)?.[index];
  if (!n || !host) return null;
  const b = n.getBoundingClientRect();
  const cs = getComputedStyle(n);
  return { x: Math.round(b.x - host.x), y: Math.round(b.y - host.y),
    w: Math.round(b.width), h: Math.round(b.height), transform: cs.transform };
}, { id, sel, index });

// THE ROWS ARE `Value.rows`, NOT `Listbox.rows`. The Listbox section holds only appearance and
// navigation; the data is the same value-row model the radio group, combobox and cyclic button all
// read through `getEnabledValueRows`. Writing `Listbox.rows` lands nowhere, and the list then shows
// its type template's own rows — which is why a row-count assertion still passes and everything
// that depends on OVERFLOWING the box quietly does not.
const ROWS = Array.from({ length: 16 }, (_, i) => ({
  id: `r${i}`, displayText: `Row ${i + 1}`, internalValue: `v${i}`,
  sendValue: i, receiveValue: i, selectedByDefault: false, enabled: true,
  visualOverrides: {}, icon: '', subtitle: '', badge: '', swatch: '', isHeader: false, parentValue: '',
}));

const installIcon = () => kit.page.evaluate(async () => {
  const { appSettings } = await import('/src/CE_Application/stores/appSettings.js');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">'
    + '<rect width="32" height="32" fill="#ff00ff"/></svg>';
  const entry = {
    id: 'icon_probe', name: 'Probe', sourceType: 'local', enabled: true,
    fileName: 'probe.svg', mimeType: 'image/svg+xml',
    dataUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    isVector: true, width: 32, height: 32,
  };
  appSettings.update((current) => ({
    ...current,
    icons: [...(current.icons ?? []).filter((i) => i.id !== entry.id), entry],
  }));
  return entry;
});

try {
  // =============================================================================================
  // Listbox — striping, card rows, the edge fade, the scrollbar, and how a selection arrives.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Listbox', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 150, 'Value.rows': ROWS });
    await kit.preview(true);
    await kit.settle(800);

    led.check(L, 'the fixture has rows to look at',
      'fourteen rows in a box that fits about six, which is what makes the scrollbar, the edge fade and the per-row styles exist at all',
      true, (await countOf(id, '.listbox-row')) > 0);

    led.check(L, 'zebra', 'alternating rows are striped, and the striping is a class on the list rather than a colour on each row — so it cannot get out of step',
      { off: false, on: true }, await (async () => {
        await kit.set(id, { 'Listbox.zebra': false });
        await kit.settle(500);
        const off = await hasClass(id, '.listbox', 'zebra');
        await kit.set(id, { 'Listbox.zebra': true });
        await kit.settle(500);
        return { off, on: await hasClass(id, '.listbox', 'zebra') };
      })());

    led.check(L, 'cardRows', 'card rows give every row its own rounded block with a gap around it, instead of a continuous list',
      { off: 0, on: true }, await (async () => {
        await kit.set(id, { 'Listbox.cardRows': false });
        await kit.settle(500);
        const off = await countOf(id, '.listbox-row.card');
        await kit.set(id, { 'Listbox.cardRows': true });
        await kit.settle(500);
        return { off, on: (await countOf(id, '.listbox-row.card')) > 0 };
      })());
    await kit.set(id, { 'Listbox.cardRows': false });
    await kit.settle(450);

    led.check(L, 'fadeEdges', 'the top and bottom fade is a hint that there is more list above and below, and it is another class on the list',
      { off: false, on: true }, await (async () => {
        await kit.set(id, { 'Listbox.fadeEdges': false });
        await kit.settle(500);
        const off = await hasClass(id, '.listbox', 'fade-edges');
        await kit.set(id, { 'Listbox.fadeEdges': true });
        await kit.settle(500);
        return { off, on: await hasClass(id, '.listbox', 'fade-edges') };
      })());

    led.check(L, 'scrollbar',
      'the scrollbar can be always there, hidden outright, or drawn thin — and "hidden" means no bar at all rather than a transparent one, because a list that cannot show its position should not pretend to',
      { auto: 1, hidden: 0, thin: true },
      await (async () => {
        await kit.set(id, { 'Listbox.scrollbar': 'auto' });
        await kit.settle(500);
        const auto = await countOf(id, '.listbox-scrollbar');
        await kit.set(id, { 'Listbox.scrollbar': 'hidden' });
        await kit.settle(500);
        const hidden = await countOf(id, '.listbox-scrollbar');
        await kit.set(id, { 'Listbox.scrollbar': 'thin' });
        await kit.settle(500);
        return { auto, hidden, thin: await hasClass(id, '.listbox-scrollbar', 'thin') };
      })());
    await kit.set(id, { 'Listbox.scrollbar': 'auto' });
    await kit.settle(450);

    const rowHeight = async () => (await boxOf(id, '.listbox-row'))?.h ?? null;
    await kit.set(id, { 'Listbox.density': 'comfortable', 'Listbox.rowHeight': 0 });
    await kit.settle(550);
    const comfortable = await rowHeight();
    await kit.set(id, { 'Listbox.density': 'compact' });
    await kit.settle(550);
    led.check(L, 'density',
      'a compact list packs its rows tighter than a comfortable one — four pixels a row, which over a long list is several more rows on screen',
      true, comfortable !== null && (await rowHeight()) === comfortable - 4);
    await kit.set(id, { 'Listbox.density': 'comfortable' });
    await kit.settle(450);

    led.check(L, 'selectionAnim',
      'with the animation on, the selection marker is one moving element rather than a class on the chosen row — which is what lets it slide from one to the next instead of blinking there',
      { still: true, animated: false },
      await (async () => {
        await kit.set(id, { 'Listbox.selectionAnim': false, 'Listbox.selectionStyle': 'bar' });
        await kit.settle(600);
        const box = await kit.box(id);
        await kit.click({ x: box.x + box.w * 0.5, y: box.y + 30 });
        await kit.settle(600);
        const still = (await countOf(id, '.listbox-row.sel-bar')) > 0;
        await kit.set(id, { 'Listbox.selectionAnim': true });
        await kit.settle(600);
        return { still, animated: (await countOf(id, '.listbox-row.sel-bar')) > 0 };
      })());

    led.check(L, 'nowPlaying',
      'the now-playing marker is separate from the selection: it says which row is actually loaded, which is not always the one the cursor is on',
      { off: 0, on: true },
      await (async () => {
        await kit.set(id, { 'Listbox.nowPlaying': false, 'Listbox.recallOnSelect': true,
          'Listbox.selectionAnim': false });
        await kit.settle(550);
        const rows = await kit.box(id);
        await kit.click({ x: rows.x + rows.w * 0.5, y: rows.y + 30 });
        await kit.settle(600);
        const off = await countOf(id, '.listbox-row.now-playing');
        await kit.set(id, { 'Listbox.nowPlaying': true });
        await kit.settle(550);
        await kit.click({ x: rows.x + rows.w * 0.5, y: rows.y + 55 });
        await kit.settle(650);
        return { off, on: (await countOf(id, '.listbox-row.now-playing')) > 0 };
      })());
  }
  await kit.preview(false);

  // A SEPARATE LIST FOR THE NEGATIVE. The now-playing value is session state, and switching the
  // recall off does not retract a row that has already been loaded — so a fixture that turns the
  // flag off on the same control measures the previous row's answer.
  await kit.fresh();
  {
    const recalls = await kit.make('Listbox', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 250, 'Transform.height': 130, 'Value.rows': ROWS,
      'Listbox.nowPlaying': true, 'Listbox.recallOnSelect': true });
    const doesNot = await kit.make('Listbox', { 'Transform.x': 70, 'Transform.y': 250,
      'Transform.width': 250, 'Transform.height': 130, 'Value.rows': ROWS,
      'Listbox.nowPlaying': true, 'Listbox.recallOnSelect': false });
    await kit.preview(true);
    await kit.settle(850);
    const pick = async (lid) => {
      const b = await kit.box(lid);
      await kit.click({ x: b.x + b.w * 0.5, y: b.y + 30 });
      await kit.settle(700);
      return await countOf(lid, '.listbox-row.now-playing');
    };
    led.check(L, 'recallOnSelect',
      'it is the recall that puts the marker there: choosing a row on a list that recalls marks it as playing, and choosing one on a list that does not selects it and loads nothing — same click, same marker setting, two different lists',
      { recalls: 1, doesNot: 0 },
      { recalls: await pick(recalls), doesNot: await pick(doesNot) });
  }
  await kit.preview(false);

  // =============================================================================================
  // Icon — which asset, how it fits its box, its tint, and the two flips.
  // =============================================================================================
  await kit.fresh();
  {
    const entry = await installIcon();
    await kit.settle(350);
    const id = await kit.make('Button', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 200, 'Transform.height': 120, 'Text.content': '',
      'ContentLayout.mode': 'icon_only', 'Icon.source': 'library',
      'Icon.assetId': entry.id, 'Icon.size': 48 });
    await kit.preview(true);
    await kit.settle(800);

    led.check(I, 'assetId',
      'the asset id picks the icon out of the library directly, which is the addressing a generated panel uses — the name is the other way in, and a panel that renamed its icons would break on that one',
      true, (await boxOf(id, '.icon-content')) !== null);
    led.check(I, 'assetId (an id that is not in the library)',
      'and an id nothing answers to draws no icon at all rather than a placeholder, so a missing asset is visible as missing',
      null, await (async () => {
        await kit.set(id, { 'Icon.assetId': 'icon_not_here', 'Icon.name': '' });
        await kit.settle(600);
        return await boxOf(id, '.icon-content');
      })());
    await kit.set(id, { 'Icon.assetId': entry.id });
    await kit.settle(550);

    const centrePixel = async () => (await kit.livePixels(id, [[0.5, 0.5]]))?.[0] ?? null;
    const nearColour = (pixel, expected, tolerance = 8) => pixel != null
      && expected.every((value, index) => Math.abs(pixel[index] - value) <= tolerance);
    const importedPixel = await centrePixel();
    await kit.set(id, { 'Icon.tint': 'FF22CC44' });
    await kit.settle(650);
    const tintedPixel = await centrePixel();
    led.check(I, 'tint',
      'opaque white keeps the imported magenta pixels, while a green tint replaces their colour through the icon alpha — measured from the browser compositor rather than from the stored field',
      { imported: true, tinted: true, changed: true },
      { imported: nearColour(importedPixel, [255, 0, 255, 255]),
        tinted: nearColour(tintedPixel, [34, 204, 68, 255]),
        changed: JSON.stringify(importedPixel) !== JSON.stringify(tintedPixel) });
    await kit.set(id, { 'Icon.tint': 'FFFFFFFF' });
    await kit.settle(500);

    // THE PROPERTIES ARE ON THE <img>, NOT ON ITS BOX. `.icon-content` positions and sizes the
    // icon's slot (that is where ContentLayout's offsets and z-index land); the fit and the two
    // flips are written onto the `.icon-image` inside it.
    const imageStyle = (prop) => kit.page.evaluate(({ id, prop }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      const n = el?.querySelector('.icon-image');
      return n ? getComputedStyle(n).getPropertyValue(prop).trim() : null;
    }, { id, prop });

    led.check(I, 'fit',
      'the fit decides what happens when the icon and its slot are different shapes — contain keeps the whole picture inside, cover fills the slot and crops what will not fit',
      { contain: 'contain', cover: 'cover' },
      await (async () => {
        await kit.set(id, { 'Icon.fit': 'contain' });
        await kit.settle(550);
        const contain = await imageStyle('object-fit');
        await kit.set(id, { 'Icon.fit': 'cover' });
        await kit.settle(550);
        return { contain, cover: await imageStyle('object-fit') };
      })());
    await kit.set(id, { 'Icon.fit': 'contain' });
    await kit.settle(500);

    const flipped = async (h, v) => {
      await kit.set(id, { 'Icon.flipH': h, 'Icon.flipV': v });
      await kit.settle(600);
      return await imageStyle('transform');
    };
    const plain = await flipped(false, false);
    const acrossX = await flipped(true, false);
    const acrossY = await flipped(false, true);
    const both = await flipped(true, true);
    led.check(I, 'flipH + flipV',
      'the two flips mirror the icon on one axis each, and they are separate transforms rather than one rotation — turning both on is a third matrix again, not a return to the first',
      { h: true, v: true, different: true, bothIsItsOwn: true },
      { h: acrossX !== plain, v: acrossY !== plain, different: acrossX !== acrossY,
        bothIsItsOwn: both !== plain && both !== acrossX && both !== acrossY });

    await kit.set(id, { 'Icon.tint': 'FF22CC44', 'Icon.opacity': 0.65,
      'Icon.rotation': 15, 'Icon.flipH': true, 'Icon.flipV': false,
      'Icon.Effects.glowEnabled': true, 'Icon.Effects.glowSize': 3 });
    await kit.settle(600);
    led.check(I, 'tint (the image transforms and effects path is retained)',
      'the tinted element keeps the same fit, opacity and transform declarations as the full-colour image; tint changes only how its pixels are supplied',
      { tintedElement: true, fit: 'contain', opacity: '0.65', transformed: true,
        filtered: true, masked: true },
      await kit.page.evaluate(({ id }) => {
        const n = document.querySelector(`[data-control-id="${id}"] .icon-image`);
        const cs = n ? getComputedStyle(n) : null;
        return { tintedElement: n?.classList.contains('icon-image-tinted') === true,
          fit: cs?.objectFit ?? null, opacity: cs?.opacity ?? null,
          transformed: !!cs && cs.transform !== 'none',
          filtered: !!cs && cs.filter !== 'none',
          masked: !!cs && cs.webkitMaskImage !== 'none' };
      }, { id }));
  }
  await kit.preview(false);

  // =============================================================================================
  // Value — the three fields the matrix found, and what they really are.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('RadioButtonGroup', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 50 });
    await kit.preview(true);
    await kit.settle(800);
    // `Value.segmentStyle` IS NOT A STYLE NAME. The radio/segmented/tab choice is
    // `Behavior.visualStyle`, verified in behaviourButtons.mjs; this is the per-segment override
    // store the Segments editor writes into — `{ shared, rows }`, each a patch shaped like
    // `{ whole: { fillColour }, label: { colour } }`.
    const segmentFills = () => kit.page.evaluate(({ id }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      return [...el.querySelectorAll('*')]
        .map((n) => getComputedStyle(n).backgroundColor)
        .filter((c) => c && c !== 'rgba(0, 0, 0, 0)');
    }, { id });

    await kit.set(id, { 'Value.rows': [
      { id: 'a', displayText: 'A', internalValue: 'a', enabled: true, visualOverrides: {} },
      { id: 'b', displayText: 'B', internalValue: 'b', enabled: true, visualOverrides: {} },
      { id: 'c', displayText: 'C', internalValue: 'c', enabled: true, visualOverrides: {} },
    ] });
    await kit.settle(650);
    await kit.set(id, { 'Value.segmentStyle': { shared: { whole: { fillColour: 'FFCC3300' } }, rows: {} } });
    await kit.settle(700);
    const shared = (await segmentFills()).filter((c) => c.includes('204, 51, 0')).length;
    await kit.set(id, { 'Value.segmentStyle': {
      shared: { whole: { fillColour: 'FFCC3300' } },
      rows: { b: { whole: { fillColour: 'FF00AA55' } } },
    } });
    await kit.settle(700);
    const after = await segmentFills();
    led.check(V, 'segmentStyle',
      'the shared patch paints the segments, and a row patch overrides one of them by id — which is what the Segments editor writes, and the reason the field is an object of patches rather than the name of a style',
      { sharedPainted: 2, oneOverridden: 1, restKeptShared: 1 },
      { sharedPainted: shared,
        oneOverridden: after.filter((c) => c.includes('0, 170, 85')).length,
        restKeptShared: after.filter((c) => c.includes('204, 51, 0')).length });
    led.check(V, 'segmentStyle (a state outranks it, and that is the order)',
      'the shared patch reaches TWO of the three segments, not all of them: the selected one keeps its own colour, because `resolveSegmentStyle` applies the active states last and a state is meant to beat a base style. A row that expected all three would be asserting the wrong precedence',
      { segmentsPainted: 2, selectedKeptItsOwn: true },
      { segmentsPainted: shared,
        selectedKeptItsOwn: after.some((c) => !c.includes('204, 51, 0') && !c.includes('0, 170, 85')) });
  }
  await kit.preview(false);

  led.inert(V, 'showMapping',
    'show the value-mapping table in the inspector',
    'an EDITOR-ONLY switch, and correctly so: its only reader is ValueEditor.svelte, where it opens and closes the mapping section of the Value tab. Nothing in a rendered panel could read it, because it is about the inspector rather than the control. Recorded here so the matrix row has an answer rather than looking like a gap.');
  led.inert(V, 'storeByValue',
    'save the chosen option by its value rather than by its row id',
    'read by exportParameters.js, which is the EXPORT path rather than the panel surface — so it shapes what a generated plugin parameter carries and changes nothing about how the control behaves in preview. It is verified where it belongs: the export suite owns that contract, and a row here that set the flag and looked at the panel would find nothing and mean nothing.');

  // =============================================================================================
  // save/reopen
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Listbox', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 150, 'Value.rows': ROWS,
      'Listbox.zebra': true, 'Listbox.cardRows': true, 'Listbox.density': 'compact',
      'Listbox.scrollbar': 'thin' });
    const again = await kit.reopen(id);
    await kit.preview(true);
    await kit.settle(800);
    led.check(L, 'save/reopen (the list’s look)',
      'a reopened list is striped, carded, compact and still has its thin scrollbar — four separate settings, all of them authored state',
      { zebra: true, cards: true, thin: true, rows: true },
      { zebra: await hasClass(again, '.listbox', 'zebra'),
        cards: (await countOf(again, '.listbox-row.card')) > 0,
        thin: await hasClass(again, '.listbox-scrollbar', 'thin'),
        rows: (await countOf(again, '.listbox-row')) > 0 });
  }
  await kit.preview(false);

  await kit.fresh();
  {
    const entry = await installIcon();
    const id = await kit.make('Button', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 180, 'Transform.height': 100, 'Text.content': '',
      'ContentLayout.mode': 'icon_only', 'Icon.assetId': entry.id, 'Icon.size': 48,
      'Icon.tint': 'FF22CC44' });
    const again = await kit.reopen(id);
    await installIcon();
    await kit.settle(650);
    const pixel = (await kit.livePixels(again, [[0.5, 0.5]]))?.[0] ?? null;
    led.check(I, 'save/reopen',
      'the authored tint survives a fresh runtime and recolours the re-resolved library icon again, rather than relying on a live DOM state',
      { stored: 'FF22CC44', green: true },
      { stored: await kit.read(again, 'Icon.tint'),
        green: pixel != null && Math.abs(pixel[0] - 34) <= 8
          && Math.abs(pixel[1] - 204) <= 8 && Math.abs(pixel[2] - 68) <= 8 });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
