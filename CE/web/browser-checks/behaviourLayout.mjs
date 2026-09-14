/**
 * behaviourLayout.mjs — the three sections that decide where things sit rather than what they are:
 * `ContentLayout` (where a control's label and icon go inside it), `TabContainer` (the tab strip
 * and which page is showing) and `ScrollArea` (the scrollbar and where the view is parked).
 *
 * Twenty properties between them, none of which any check had named.
 *
 * TWO THINGS THE FIXTURES HAVE TO ARRANGE BEFORE ANY OF IT IS VISIBLE.
 *
 * A CONTROL WITH NO ICON HAS NO ICON LAYOUT. `hasIcon` needs a stored icon with a `dataUrl` — the
 * Icon section's `source` and `name` only select one out of the app's icon library, and an empty
 * library selects nothing. So the icon rows put an entry into `appSettings.icons` first, which is
 * what the Assets tab's import does. Without it, `iconOffsetX`, `iconOffsetY` and `iconZIndex`
 * measure an element that was never rendered and read as three dead properties.
 *
 * AND A SCROLL AREA WITH NOTHING IN IT DOES NOT SCROLL. The scrollbar is sized from the content's
 * overflow, so a bare ScrollArea draws no thumb at all; the fixture nests a child taller than the
 * viewport before asking where the thumb is.
 *
 * The tab strip is an `<svg class="tabs">`: one `<rect>` for the strip, one per tab, and a `<text>`
 * per label. So its rows read shapes and fills, and the active tab is told from the others by
 * having a different fill — which is the same thing a person sees.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('layout');
const C = 'ContentLayout';
const T = 'TabContainer';
const S = 'ScrollArea';

const boxOf = (id, sel) => kit.page.evaluate(({ id, sel }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  const host = el?.getBoundingClientRect();
  const n = el?.querySelector(sel);
  if (!n || !host) return null;
  const b = n.getBoundingClientRect();
  const cs = getComputedStyle(n);
  return { x: Math.round((b.x - host.x) * 10) / 10, y: Math.round((b.y - host.y) * 10) / 10,
    w: Math.round(b.width), h: Math.round(b.height), z: cs.zIndex };
}, { id, sel });

/** Put one icon into the app's icon library, the way the Assets tab's import does. */
const installIcon = async () => kit.page.evaluate(async () => {
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
  return entry.name;
});

try {
  // =============================================================================================
  // ContentLayout — where the label and the icon sit inside the control.
  // =============================================================================================
  await kit.fresh();
  {
    const iconName = await installIcon();
    await kit.settle(300);
    const id = await kit.make('Button', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 220, 'Transform.height': 100, 'Text.content': 'HELLO',
      'Icon.source': 'library', 'Icon.name': iconName, 'Icon.size': 24,
      // `mode` DEFAULTS TO text_only, and `hasIcon` checks it — so a control with a perfectly good
      // icon selected draws none until the mode admits one. `overlay_centered` puts both in the
      // same place, which is what makes the two z-index rows below a real question.
      'ContentLayout.mode': 'overlay_centered' });
    await kit.preview(true);
    await kit.settle(800);

    led.check(C, 'the fixture draws both halves',
      'the control has a label AND an icon, which is what makes the four offsets and the two depths separable at all — without the icon, three of them would measure an element that was never rendered',
      { text: true, icon: true },
      { text: (await boxOf(id, '.text-content')) !== null, icon: (await boxOf(id, '.icon-content')) !== null });

    const textAt = () => boxOf(id, '.text-span');
    const iconAt = () => boxOf(id, '.icon-content');

    const baseText = await textAt();
    await kit.set(id, { 'ContentLayout.textOffsetX': 18, 'ContentLayout.textOffsetY': -9 });
    await kit.settle(500);
    const movedText = await textAt();
    led.check(C, 'textOffsetX + textOffsetY',
      'the label moves by the two offsets, one axis each, from wherever the alignment left it',
      { dx: 18, dy: -9 },
      { dx: Math.round(movedText.x - baseText.x), dy: Math.round(movedText.y - baseText.y) });

    const baseIcon = await iconAt();
    await kit.set(id, { 'ContentLayout.iconOffsetX': -14, 'ContentLayout.iconOffsetY': 11 });
    await kit.settle(500);
    const movedIcon = await iconAt();
    led.check(C, 'iconOffsetX + iconOffsetY',
      'and the icon has its own pair, which move it and leave the label where it was — four numbers, two things',
      { dx: -14, dy: 11, textUnmoved: true },
      { dx: Math.round(movedIcon.x - baseIcon.x), dy: Math.round(movedIcon.y - baseIcon.y),
        textUnmoved: Math.abs((await textAt()).x - movedText.x) < 0.5 });
    await kit.set(id, { 'ContentLayout.textOffsetX': 0, 'ContentLayout.textOffsetY': 0,
      'ContentLayout.iconOffsetX': 0, 'ContentLayout.iconOffsetY': 0 });
    await kit.settle(450);

    const alignedTo = async (value) => {
      await kit.set(id, { 'ContentLayout.verticalAlign': value });
      await kit.settle(450);
      return (await iconAt()).y;
    };
    const top = await alignedTo('top');
    const middle = await alignedTo('center');
    const bottom = await alignedTo('bottom');
    led.check(C, 'verticalAlign',
      'the vertical alignment puts the content at the top of the control, in the middle of it or at the bottom — three positions in order, not three names for one',
      true, top < middle && middle < bottom);
    await kit.set(id, { 'ContentLayout.verticalAlign': 'center' });
    await kit.settle(400);

    led.check(C, 'textZIndex + iconZIndex',
      'the two depths decide which of the label and the icon is in front when they overlap, and they are independent numbers rather than a single swap',
      { textOver: true, iconOver: true },
      await (async () => {
        await kit.set(id, { 'ContentLayout.textZIndex': 5, 'ContentLayout.iconZIndex': 1 });
        await kit.settle(500);
        const textOver = Number((await boxOf(id, '.text-content')).z) > Number((await iconAt()).z);
        await kit.set(id, { 'ContentLayout.textZIndex': 1, 'ContentLayout.iconZIndex': 5 });
        await kit.settle(500);
        return { textOver, iconOver: Number((await iconAt()).z) > Number((await boxOf(id, '.text-content')).z) };
      })());
  }
  await kit.preview(false);

  led.unsupported(C, 'textAboveIcon',
    'stack the label above the icon',
    'not a property: its only mention outside the model defaults is a fixture in tools/scripts/qa/sheets/properties.mjs. Nothing in src/ reads it and no editor offers a cell for it — and the thing it names is already spelled TWICE in the same section: `ContentLayout.mode` has `text_above_icon_below` as one of its seven values (the dropdown in ContentLayoutEditor.svelte), and the stacking order it would otherwise mean is `textZIndex`/`iconZIndex`, both verified above. A third spelling, not a missing feature. Smallest honest release treatment: leave the key, since a defaulted field cannot be removed without rewriting every panel on disk, and add nothing to the UI that would promise it.');

  // =============================================================================================
  // TabContainer — the strip, its colours, which page is showing and which edge it lives on.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('TabContainer', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 320, 'Transform.height': 150 });
    await kit.preview(true);
    await kit.settle(800);
    const rects = () => kit.shapes(id, 'rect');
    const labels = () => kit.shapes(id, 'text');

    await kit.set(id, { 'TabContainer.stripColour': 'FF102030', 'TabContainer.tabColour': 'FF204060',
      'TabContainer.activeTabColour': 'FFCC3300', 'TabContainer.labelColour': 'FF888888',
      'TabContainer.activeLabelColour': 'FFFFFF00' });
    await kit.settle(550);
    const painted = await rects();
    led.check(T, 'stripColour + tabColour + activeTabColour',
      'the strip behind the tabs, the tabs themselves and the one that is current each take their own colour — which is what makes the current page findable at a glance',
      { strip: 1, inactive: 1, active: 1 },
      { strip: painted.filter((r) => String(r.fill).includes('16,32,48')).length,
        inactive: painted.filter((r) => String(r.fill).includes('32,64,96')).length,
        active: painted.filter((r) => String(r.fill).includes('204,51,0')).length });
    const painted2 = await labels();
    led.check(T, 'labelColour + activeLabelColour',
      'and the labels follow the same split: the current page’s name is written in its own colour and the rest in another',
      { plain: 1, current: 1 },
      { plain: painted2.filter((t) => String(t.fill).includes('136,136,136')).length,
        current: painted2.filter((t) => String(t.fill).includes('255,255,0')).length });

    led.check(T, 'pageIndex', 'the page index says which tab is current, and moving it moves the highlight rather than redrawing the strip',
      { first: 0, second: 1 },
      await (async () => {
        // THE TABS ARE THE RECTS WEARING A TAB COLOUR — told apart by fill, not by size. The strip
        // behind them is also short and wide, so a size filter counts it as a tab and reports every
        // index one too high.
        const tabOrder = async () => {
          const all = (await rects())
            .filter((r) => String(r.fill).includes('32,64,96') || String(r.fill).includes('204,51,0'))
            .sort((a, b) => Number(a.x) - Number(b.x));
          return all.findIndex((r) => String(r.fill).includes('204,51,0'));
        };
        await kit.set(id, { 'TabContainer.pageIndex': 0 });
        await kit.settle(500);
        const first = await tabOrder();
        await kit.set(id, { 'TabContainer.pageIndex': 1 });
        await kit.settle(500);
        return { first, second: await tabOrder() };
      })());

    const stripBox = async () => {
      const hit = (await rects()).filter((r) => String(r.fill).includes('16,32,48'));
      return hit.length === 1 ? { x: Number(hit[0].x), y: Number(hit[0].y),
        w: Number(hit[0].width), h: Number(hit[0].height) } : null;
    };
    const atTop = await (async () => { await kit.set(id, { 'TabContainer.edge': 'top' });
      await kit.settle(500); return await stripBox(); })();
    const atBottom = await (async () => { await kit.set(id, { 'TabContainer.edge': 'bottom' });
      await kit.settle(500); return await stripBox(); })();
    const atLeft = await (async () => { await kit.set(id, { 'TabContainer.edge': 'left' });
      await kit.settle(500); return await stripBox(); })();
    led.check(T, 'edge',
      'the strip goes along whichever edge the author names — across the top, across the bottom, or turned on its side down the left, where it is tall and narrow rather than wide and short',
      { top: true, bottom: true, left: true },
      { top: atTop.y === 0 && atTop.w > atTop.h,
        bottom: atBottom.y > 0 && atBottom.w > atBottom.h,
        left: atLeft.x === 0 && atLeft.h > atLeft.w });
    await kit.set(id, { 'TabContainer.edge': 'top' });
    await kit.settle(450);

    led.check(T, 'showStrip',
      'and the whole strip can be taken away, which is what a panel does when its pages are driven by something else — no strip, no tabs, no labels',
      { on: true, off: 0 },
      await (async () => {
        const on = (await rects()).length > 0;
        await kit.set(id, { 'TabContainer.showStrip': false });
        await kit.settle(550);
        return { on, off: (await rects()).length };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // ScrollArea — the scrollbar, and where the view is parked.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('ScrollArea', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 260, 'Transform.height': 140,
      'ScrollArea.direction': 'both', 'ScrollArea.thumbColour': 'FFCC3300' });
    // A scroll area with nothing in it has nothing to scroll, and draws no thumb.
    const tall = await kit.make('Button', { 'Transform.width': 400, 'Transform.height': 400,
      'Text.content': 'TALL' });
    await kit.page.evaluate(async ({ childId, parentId }) => {
      const { reparentControls } = await import('/src/CE_Application/stores/controls.js');
      reparentControls([{ id: childId, x: 0, y: 0 }], parentId);
    }, { childId: tall, parentId: id });
    await kit.settle(400);
    await kit.preview(true);
    await kit.settle(800);

    const thumbs = async () => (await kit.shapes(id, 'rect'))
      .filter((r) => String(r.fill).includes('204,51,0'));
    const drawn = await thumbs();
    led.check(S, 'thumbColour', 'the thumb takes the colour it was given, and there is one of it per scrolling axis',
      { painted: true, twoAxes: 2 }, { painted: drawn.length > 0, twoAxes: drawn.length });

    const sizes = drawn.map((r) => Math.min(Number(r.width), Number(r.height)));
    await kit.set(id, { 'ScrollArea.scrollbarSize': 22 });
    await kit.settle(550);
    const fatter = (await thumbs()).map((r) => Math.min(Number(r.width), Number(r.height)));
    led.check(S, 'scrollbarSize', 'and the bar is as thick as it was told to be, on both axes at once',
      true, sizes.length === 2 && fatter.length === 2
        && fatter.every((v, i) => v > sizes[i] + 4));

    const thumbAt = async () => {
      const hit = await thumbs();
      const vertical = hit.find((r) => Number(r.height) > Number(r.width));
      const horizontal = hit.find((r) => Number(r.width) > Number(r.height));
      return { y: vertical ? Number(vertical.y) : null, x: horizontal ? Number(horizontal.x) : null };
    };
    const parked = await thumbAt();
    await kit.set(id, { 'ScrollArea.scrollY': 120 });
    await kit.settle(550);
    const scrolledDown = await thumbAt();
    led.check(S, 'scrollY', 'scrolling the view down carries the thumb down the bar with it, which is the whole point of a scrollbar',
      true, parked.y !== null && scrolledDown.y > parked.y + 3);
    await kit.set(id, { 'ScrollArea.scrollX': 120 });
    await kit.settle(550);
    led.check(S, 'scrollX', 'and the other axis has its own position and its own thumb',
      true, parked.x !== null && (await thumbAt()).x > parked.x + 3);
  }
  await kit.preview(false);

  // =============================================================================================
  // save/reopen — all three sections are authored state.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('TabContainer', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 320, 'Transform.height': 150,
      'TabContainer.pageIndex': 1, 'TabContainer.edge': 'bottom',
      'TabContainer.activeTabColour': 'FF00AA55' });
    const again = await kit.reopen(id);
    await kit.preview(true);
    await kit.settle(800);
    const rects = await kit.shapes(again, 'rect');
    const active = rects.filter((r) => String(r.fill).includes('0,170,85'));
    const strip = rects.find((r) => Number(r.height) < 30 && Number(r.width) > 200);
    led.check(T, 'save/reopen (the strip)',
      'a reopened tab container keeps the edge it was authored on, the page it was left showing and the colour that marks it',
      { atBottom: true, oneActive: 1, onTheSecond: true },
      { atBottom: strip ? Number(strip.y) > 0 : false, oneActive: active.length,
        onTheSecond: active.length === 1 && Number(active[0].x) > 100 });
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
