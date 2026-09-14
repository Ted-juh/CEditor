/**
 * authoringSurface.mjs — the custom component design surface, driven as a person draws on it.
 *
 * WHY THIS FILE EXISTS. `CustomDesignSurfaceEditor.svelte` is the largest file in the repository and
 * the one place a custom component is actually MADE — parts drawn, moved, named, given hit zones and
 * wired to value channels. Thirty-five suites in `CE/web/test/` cover what a custom component IS
 * once it exists: the factory, the materializer, the migrations, the package, the channels. None of
 * them draws one. So the model was proven and the drawing board was not, which is gate B4's
 * complaint in one sentence.
 *
 * WHAT THE CHAIN IS, each step reading the output of the one before it:
 *
 *   open    select a CustomComponent, press Component Designer — the route the launcher offers
 *   draw    a drag with the rectangle tool creates a PART in the document, at the size drawn
 *   see     that part is on the artboard, drawn by the component's own renderer
 *   edit    the inspector changes the selected part and the change reaches the document
 *   undo    the toolbar's Undo and Redo, per STEP: the resize comes back before the drawing does
 *   carry   the part survives a serialise, a page reload and the document being opened again
 *
 * WHAT IS DELIBERATELY NOT HERE. The palette's several hundred generators, states, filmstrips and
 * arpeggiator editors each have model coverage already, and driving all of them through a browser
 * would be a second test of the same code at fifty times the cost. This suite drives the SPINE —
 * the part of the surface with no other coverage at all and without which none of the rest can be
 * reached — and names what it is leaving to the suites that own it.
 *
 * ONE FIXTURE FACT. The designer is a workspace over the panel tab, not a separate document: it
 * opens when a CustomComponent is selected and the launcher is pressed, and leaving it is a matter
 * of selecting something else. So "reopen" here means exactly what it means to a user, and the
 * part's identity has to survive a remount rather than a file round trip.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('authoringSurface');
const D = 'Designer';

/** The component's parts, as the document holds them. */
const parts = (id) => kit.page.evaluate(async (id) => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const live = get(panels).find((p) => p.id === get(activePanelId));
  const control = (live?.controls ?? []).find((c) => c._children?.Core?.id === id);
  const kids = control?._children?.Parts?._children ?? {};
  // GEOMETRY IS IN THE PART'S Layout CHILD, not on the part itself. `part.width` reads undefined
  // and a size check built on it measures zero for every part ever drawn — which looks exactly like
  // a drawing tool that ignores the drag.
  return Object.entries(kids).map(([name, part]) => {
    const layout = part?._children?.Layout ?? {};
    return {
      name,
      kind: String(part?.kind ?? part?._type ?? ''),
      x: Number(layout.x ?? 0), y: Number(layout.y ?? 0),
      width: Number(layout.width ?? 0), height: Number(layout.height ?? 0),
      units: `${layout.widthUnit ?? ''}/${layout.heightUnit ?? ''}`,
    };
  });
}, id);

const openDesigner = async (id) => {
  const box = await kit.box(id);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(700);
  await kit.page.locator('[data-testid="component-designer-launch"]').waitFor({ state: 'visible', timeout: 15000 });
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
};

try {
  await kit.fresh();

  // ===============================================================================================
  // OPEN
  // ===============================================================================================
  const dial = await kit.make('CustomComponent', { 'Transform.x': 70, 'Transform.y': 110,
    'Transform.width': 200, 'Transform.height': 140, 'Core.name': 'Dial' });
  await kit.settle(700);
  await openDesigner(dial);

  led.check(D, 'the way in', 'selecting a custom component offers the Component Designer, and pressing it puts the artboard, the palette and the inspector on screen — the three panes the surface is, so a mount that produced any two of them would fail here',
    { artboard: true, palette: true, inspector: true },
    await kit.page.evaluate(() => ({
      artboard: !!document.querySelector('.artboard'),
      palette: !!document.querySelector('.palette-panel'),
      inspector: !!document.querySelector('.inspector-content'),
    })));

  // ===============================================================================================
  // DRAW — the thing this surface exists for.
  // ===============================================================================================
  const startingParts = await parts(dial);
  await kit.page.locator('button[title="Rectangle (R)"]').click();
  await kit.settle(400);
  const art = await kit.page.locator('.artboard').boundingBox();
  await kit.page.mouse.move(art.x + 40, art.y + 40);
  await kit.page.mouse.down();
  await kit.page.mouse.move(art.x + 140, art.y + 110, { steps: 12 });
  await kit.page.mouse.up();
  await kit.settle(900);
  const drawn = await parts(dial);

  led.check(D, 'drawing makes a part',
    'a drag with the rectangle tool adds a part to the component`s DOCUMENT — not a shape the canvas is holding for itself. The document is what renders, packages and exports, so a drawing the surface can see and the document cannot is a drawing that vanishes on the next save',
    true, drawn.length === startingParts.length + 1);

  const fresh = drawn.find((p) => !startingParts.some((q) => q.name === p.name));
  led.check(D, 'and at exactly the size and place it was drawn',
    'the drag ran from (40, 40) to (140, 110) on the artboard and the part is 100 x 70 at (40, 40), in pixels — the exact numbers rather than "bigger than a default", because a tool that adds a fixed box and a tool that records the drag are indistinguishable under a loose assertion, and only one of them is a drawing tool',
    { x: 40, y: 40, width: 100, height: 70, units: 'px/px' },
    { x: fresh.x, y: fresh.y, width: fresh.width, height: fresh.height, units: fresh.units });

  led.check(D, 'and it is drawn on the artboard at that size',
    'the part is painted by `.interactive-part` — the component`s OWN renderer, the same one the finished component ships with rather than a preview drawn for the dock — and its rendered box is the 100 x 70 that was dragged. Both halves matter: the same renderer is what keeps what you draw and what ships one picture, and the measured box is what says the document and the canvas agree',
    { rendered: 1, width: 100, height: 70 },
    await kit.page.evaluate(() => {
      const nodes = document.querySelectorAll('.artboard .interactive-part');
      const r = nodes[nodes.length - 1]?.getBoundingClientRect();
      return { rendered: nodes.length, width: Math.round(r?.width ?? 0), height: Math.round(r?.height ?? 0) };
    }));

  // ===============================================================================================
  // EDIT — the inspector, which is the other half of the surface and the only way to be exact.
  // ===============================================================================================
  // The part is already selected (drawing selects what it drew), and the inspector's geometry row
  // is plain text inputs — so the width field is found by the value it is showing rather than by a
  // position in a list that a layout change would silently shift.
  // Found by the value it is SHOWING — the geometry row is seven identically-shaped text inputs
  // (x, y, w, h, rotation, pivotX, pivotY) all labelled "Value", so an nth() index is a guess that
  // a layout change would silently move onto the wrong field and still pass some other assertion.
  const widthIndex = await kit.page.evaluate(() =>
    [...document.querySelectorAll('.inspector-content input[type="text"]')]
      .findIndex((el) => el.value === '100'));
  assert.ok(widthIndex >= 0, 'the inspector should be showing the drawn width');
  const widthField = kit.page.locator('.inspector-content input[type="text"]').nth(widthIndex);
  await widthField.click();
  await kit.page.keyboard.press('Control+A');
  await kit.page.keyboard.type('150');
  await kit.page.keyboard.press('Tab');
  await kit.settle(900);
  const edited = (await parts(dial)).find((p) => p.name === fresh.name);
  const renderedAfterEdit = await kit.page.evaluate(() => {
    const nodes = document.querySelectorAll('.artboard .interactive-part');
    return Math.round(nodes[nodes.length - 1]?.getBoundingClientRect().width ?? 0);
  });
  led.check(D, 'the inspector edits the part it has selected',
    'typing a width into the inspector reaches the DOCUMENT and the ARTBOARD together — 150 in the field, 150 in the part, 150 painted. Drawing is how a part gets roughly right and the inspector is how it gets exactly right, so a surface where the second does not follow the first is one an author cannot finish anything on',
    { inTheDocument: 150, onTheArtboard: 150, heightUntouched: 70 },
    { inTheDocument: edited.width, onTheArtboard: renderedAfterEdit, heightUntouched: edited.height });

  // ===============================================================================================
  // UNDO / REDO — what an author leans on hardest, and the first thing a drawing tool gets wrong.
  // ===============================================================================================
  // THE TOOLBAR BUTTONS, not the keystroke. A Ctrl+Z sent to the page goes wherever focus happens to
  // be, and with the rectangle tool still armed a click on the artboard to "focus it" first draws
  // another part instead — so the keystroke route tests the fixture's aim as much as the feature.
  // The buttons are the affordance the surface actually offers, and they carry the shortcut in
  // their own titles.
  // THE TOOLBAR BUTTONS, not the keystroke. A Ctrl+Z sent to the page goes wherever focus happens to
  // be, and with the rectangle tool still armed a click on the artboard to "focus it" first draws
  // another part instead — so the keystroke route tests the fixture's aim as much as the feature.
  // The buttons are the affordance the surface offers, and they carry the shortcut in their titles.
  //
  // TWO EDITS HAVE HAPPENED — the drawing and the resize — so this asks whether undo is per-STEP
  // rather than per-session. One undo should give back the 100 and keep the part; only the second
  // should take the part away. An undo stack that collapsed both into one entry would pass a
  // single-undo assertion and lose an author's drawing every time they corrected a number.
  const undo = () => kit.page.locator('button[title="Undo (Ctrl+Z)"]').click();
  const redo = () => kit.page.locator('button[title="Redo (Ctrl+Y)"]').click();

  await undo();
  await kit.settle(900);
  const afterOneUndo = (await parts(dial)).find((p) => p.name === fresh.name);
  await undo();
  await kit.settle(900);
  const undone = await parts(dial);
  await redo();
  await redo();
  await kit.settle(900);
  const redone = await parts(dial);
  const redoneWidth = redone.find((p) => p.name === fresh.name)?.width ?? 0;

  led.check(D, 'undo is per step, and redo puts both back',
    'the first undo returns the width to 100 and LEAVES the part; the second takes the part away; two redos restore the drawing and then the 150. So correcting a number and regretting it costs the number, not the drawing — measured on the document`s parts rather than on the canvas, because an undo that restores the picture and leaves the document ahead of it is the version of this bug that survives a screenshot',
    { widthAfterOneUndo: 100, partsAfterTwo: startingParts.length,
      partsAfterRedo: startingParts.length + 1, widthAfterRedo: 150 },
    { widthAfterOneUndo: afterOneUndo?.width ?? 0, partsAfterTwo: undone.length,
      partsAfterRedo: redone.length, widthAfterRedo: redoneWidth });

  // ===============================================================================================
  // CARRY — the part survives leaving the surface.
  // ===============================================================================================
  const beforeLeaving = (await parts(dial)).length;
  await kit.page.keyboard.press('Escape');
  await kit.settle(500);
  await kit.reopen(dial);
  await kit.settle(1200);
  const reopened = await parts(dial);
  led.check(D, 'the drawing survives a reopen in a fresh runtime',
    'the part is still in the component after the panel is serialised, the page reloaded and the document opened again — the end of the chain, and the only row that fails if the drawing lived anywhere but in the saved document',
    beforeLeaving, reopened.length);

  led.closed(D, 'the palette`s generators, states, filmstrips and arpeggiator editors',
    'the several hundred authoring controls in the palette and inspector',
    'each has model coverage of its own in CE/web/test/ — customComponentGeneratorBank, customComponentStateRules, customComponentFilmstripBaker, customComponentClusters and their neighbours — and behaviourCustom.mjs drives the rendered result in a browser. This suite drives the SPINE the palette hangs off: without drawing, selection and undo there is nothing for any of them to act on, and those three had no browser coverage at all.');
  led.closed(D, 'the component`s behaviour once it is drawn',
    'hit zones, value channels, bindings and what the finished component does under the pointer',
    'behaviourCustom.mjs and behaviourCombined.mjs, which operate finished custom components on a real panel, and the fourteen starters built through `createCustomComponentStarterPatch`. The question here is whether the DRAWING BOARD works, not whether a component does.');

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
