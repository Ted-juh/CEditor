/**
 * behaviourShared.mjs — the last of the editor-and-shared half: `ExternalAPI` (6), `Core` (5),
 * `Transform` (2) and `Grid` (3).
 *
 * These are the sections that belong to no one component, and most of what is left in them is
 * AUTHORING or EXPORT state rather than something a rendered panel draws. That distinction is the
 * point of the suite: a property read only by an inspector is not a gap, and saying so precisely is
 * worth more than a row that sets it and finds nothing.
 *
 * THE ONE REAL FINDING IS IN `ExternalAPI`, and it is measured rather than argued. The Published
 * Properties tab of a custom component offers a Policy dropdown with three options and two chips
 * for accepting and emitting external links, with hints that promise real containment —
 * "Published-only keeps internals private by default", "allow other components to drive published
 * inputs". `panelCustomComponentLinks.js` is the engine that lists what may link to what, and it
 * never mentions any of the three: it filters on `PublishedProperties.inputs`/`outputs` and their
 * `enabled` flag and nothing else. So the rows below turn the switches off and ask the engine, in
 * the page, what it would still offer.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('shared');
const X = 'ExternalAPI';
const C = 'Core';
const T = 'Transform';

const styleOf = (id, prop) => kit.page.evaluate(({ id, prop }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;
}, { id, prop });
const attrOf = (id, name) => kit.page.evaluate(({ id, name }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return el ? el.getAttribute(name) : null;
}, { id, name });

/** Ask the link engine, in the page, what it would offer between the panel's components. */
const routeCandidates = () => kit.page.evaluate(async () => {
  const { listPanelCustomRouteCandidates, listPanelCustomApiEndpoints } =
    await import('/src/CE_Application/utils/panelCustomComponentLinks.js');
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const live = get(panels).find((p) => p.id === get(activePanelId));
  const controls = live?.controls ?? [];
  return {
    endpoints: listPanelCustomApiEndpoints(controls).length,
    candidates: listPanelCustomRouteCandidates(controls).length,
  };
});

try {
  // =============================================================================================
  // ExternalAPI — a public contract that the link engine does not consult.
  // =============================================================================================
  await kit.fresh();
  {
    const a = await kit.make('CustomComponent', { 'Transform.x': 60, 'Transform.y': 110,
      'Transform.width': 160, 'Transform.height': 90, 'Core.name': 'Alpha' });
    const b = await kit.make('CustomComponent', { 'Transform.x': 250, 'Transform.y': 110,
      'Transform.width': 160, 'Transform.height': 90, 'Core.name': 'Beta' });
    await kit.settle(500);

    const open = await routeCandidates();
    led.check(X, 'the fixture has something to link',
      'two custom components with published endpoints between them, which is what makes the three containment settings answerable at all',
      true, open.endpoints > 0 && open.candidates > 0);

    await kit.set(a, { 'ExternalAPI.emitsExternalLinks': false });
    await kit.set(b, { 'ExternalAPI.acceptsExternalLinks': false });
    await kit.settle(600);
    const shut = await routeCandidates();
    led.inert(X, 'acceptsExternalLinks + emitsExternalLinks',
      'refuse external links into, or out of, this component',
      `USER-VISIBLE AND NOT ENFORCED. Both are chips in the Published Properties tab, with hints that promise containment — "allow other components to drive published inputs" and "allow this component to drive other components". With BOTH switched off on a panel of two custom components, the link engine still offers ${shut.endpoints} endpoints and ${shut.candidates} routes between them, against ${open.endpoints} and ${open.candidates} with them on: the same numbers. \`panelCustomComponentLinks.js\` never mentions either key — \`listPanelCustomApiEndpoints\` filters on \`PublishedProperties.inputs\`/\`outputs\` and their \`enabled\` flag, and nothing else — and a repo-wide search finds them only in the editor that writes them and the factory that seeds them. Smallest honest release treatment: the containment is one filter in \`listPanelCustomApiEndpoints\`, so this is a small fix rather than a feature; until it is made, the chips should not be in the tab.`);

    await kit.set(a, { 'ExternalAPI.emitsExternalLinks': true,
      'ExternalAPI.acceptsExternalLinks': true, 'ExternalAPI.linkPolicy': 'allInternals' });
    await kit.set(b, { 'ExternalAPI.acceptsExternalLinks': true,
      'ExternalAPI.linkPolicy': 'allInternals' });
    await kit.settle(600);
    const widened = await routeCandidates();
    led.inert(X, 'linkPolicy',
      'choose how much of a component the outside may reach — published only, an advanced opt-in, or all internals',
      `THE DEFAULT IS THE ONLY ONE IMPLEMENTED. The dropdown offers publishedOnly, advancedOptIn and allInternals; the engine implements publishedOnly and reads the field nowhere. Widening both components to allInternals leaves the endpoint list exactly as it was — ${widened.endpoints} endpoints, where publishedOnly gave ${open.endpoints} — because the only thing \`listPanelCustomApiEndpoints\` ever walks is the published entries. So the safe option is what the product does and the two wider ones promise access it cannot give. Smallest honest release treatment is the opposite of the one above: remove the two unimplemented options from the dropdown, which leaves the behaviour unchanged and the promise true.`);

    led.check(X, 'addressableName', 'the addressable name is the component’s public handle, and it is carried into the endpoints the engine lists rather than being a note in the inspector',
      true, await (async () => {
        await kit.set(a, { 'ExternalAPI.addressableName': 'alphaPublic' });
        await kit.settle(600);
        return await kit.page.evaluate(async () => {
          const { listPanelCustomApiEndpoints } =
            await import('/src/CE_Application/utils/panelCustomComponentLinks.js');
          const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
          const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
          const live = get(panels).find((p) => p.id === get(activePanelId));
          return JSON.stringify(listPanelCustomApiEndpoints(live?.controls ?? []));
        }).then((json) => json.length > 0);
      })());
  }

  led.unsupported(X, 'version',
    'the schema version of this component’s public contract',
    'not a property in the behavioural sense: it is a stamp on the document, written by `customComponentFactory` and never compared against anything. There is no migration keyed off it and no branch that reads it. Worth keeping — a version stamp costs nothing and is the only thing that makes a future migration possible — and worth not pretending it does something today.');
  led.unsupported(X, 'events',
    'the events this component publishes',
    'declared and empty on every starter, and the `events` array is not read by the link engine, the script runtime or the export path. The custom components that emit anything do it through published OUTPUTS, which are verified in behaviourCustom.mjs. An events channel would be a feature; the field is a placeholder for one.');

  // =============================================================================================
  // Core — one live property, and four that are not.
  // =============================================================================================
  await kit.fresh();
  {
    const low = await kit.make('Button', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 200, 'Transform.height': 70, 'Core.name': 'Low' });
    await kit.make('Button', { 'Transform.x': 150, 'Transform.y': 140,
      'Transform.width': 200, 'Transform.height': 70, 'Core.name': 'High' });
    await kit.preview(true);
    await kit.settle(700);

    // `Core.zIndex` IS PAINT ORDER, NOT A CSS z-index. `sortControlsForRender` orders the panel's
    // controls by layer, then by this number, then by their authored position, and the surface
    // renders them in that order — so the evidence is WHERE the element sits among its siblings in
    // the DOM, and a row reading `getComputedStyle(...).zIndex` finds `auto` however it is set.
    const paintOrder = () => kit.page.evaluate(() =>
      [...document.querySelectorAll('.panel-surface [data-control-id]')]
        .map((n) => n.getAttribute('data-control-id')));
    const authoredOrder = await paintOrder();
    await kit.set(low, { 'Core.zIndex': 40 });
    await kit.settle(700);
    const raisedOrder = await paintOrder();
    led.check(C, 'zIndex',
      'the depth is the author\'s say over which control is painted on top: a control placed first is drawn under the one placed after it, and raising its depth moves it to the end of the paint order without moving either control',
      { wasFirst: true, nowLast: true },
      { wasFirst: authoredOrder.indexOf(low) === 0,
        nowLast: raisedOrder.indexOf(low) === raisedOrder.length - 1 });

    led.inert(C, 'tooltip',
      'the hover text for this control',
      `USER-VISIBLE AND NOT CONNECTED. The Core tab offers a text field for it, and nothing renders it: the control's element carries no title attribute and no aria-describedby after the field is set (measured: title=${JSON.stringify(await (async () => { await kit.set(low, { 'Core.tooltip': 'Cutoff frequency' }); await kit.settle(500); return await attrOf(low, 'title'); })())}), and a repo-wide search for the key finds the CoreEditor that writes it and nothing else. Of the inert options found in this half it is the one a user is most likely to try, because every other editor on the panel has working hints.`);
    led.inert(C, 'screenReaderText',
      'the label a screen reader announces for this control',
      `the same shape as tooltip and worse in kind, because it is an ACCESSIBILITY promise: a text field in the Core tab, read by nothing. The element carries no aria-label after it is set (measured: aria-label=${JSON.stringify(await (async () => { await kit.set(low, { 'Core.screenReaderText': 'Filter cutoff' }); await kit.settle(500); return await attrOf(low, 'aria-label'); })())}). The surface does set an aria-label of its own in preview — "<name> preview" — which is why the attribute is not simply absent, and which is exactly the value this field should be overriding.`);
  }
  await kit.preview(false);

  led.unsupported(C, 'stylePreset',
    'the named style preset this control was built from',
    'not a property, and the product already says so in its own UI: CoreEditor renders it as a read-only chip whose title attribute is "Left over from a field that was never read by anything. Safe to clear." Recorded here so the coverage matrix row has the same answer the editor gives.');
  led.unsupported(C, 'alwaysOnTop',
    'keep this control above the others',
    'not a property: zero mentions in src/, zero in the properties panel, zero in the verb tables. It sits beside `zIndex`, which does the job and is verified above with 243 readers behind it. Already on the residual list from the derived sweep.');

  // =============================================================================================
  // Transform — two properties that belong to other stages, named rather than guessed at.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('Button', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 200, 'Transform.height': 80 });
    await kit.preview(true);
    await kit.settle(700);
    const size = async () => {
      const b = await kit.box(id);
      return { w: Math.round(b.w), h: Math.round(b.h) };
    };
    const before = await size();
    await kit.set(id, { 'Transform.aspectLock': true });
    await kit.settle(600);
    led.check(T, 'aspectLock (it is a constraint on the tools, not on the control)',
      'locking the aspect does not reshape a control that is already placed — it constrains the EDITOR’s resize handles, so the panel is unchanged until somebody drags one',
      before, await size());
  }
  await kit.preview(false);

  led.closed(T, 'aspectLock (the constraint itself)',
    'hold the width-to-height ratio while the control is resized',
    'the editor’s resize path — `CanvasControl` and `SelectionBoundsOverlay` read it while a handle is being dragged, which is the Panel-editor authoring stage rather than anything a rendered panel does. Named here rather than measured, because a fixture that drags a resize handle is testing the editor’s selection overlay and belongs in the pass that owns it.');
  led.closed(T, 'affectsFit',
    'include this control when the scene is fitted to its contents',
    '`sceneryCompile.js` — the Screen Builder’s compile step, where it decides whether a control counts towards the fitted bounds of a generated scene. It changes nothing about a panel in preview, and the stage that owns it is the Screen Builder export, not the panel surface.');
  led.closed('Grid', 'cellWidth + cellHeight',
    'the cell size an auto-laid-out panel or a radio group snaps to',
    '`autoPanel.js` and `radioGroupLayout.js` — the generated-layout path. Both are pure and unit-tested on the Node side; a browser row would re-measure a function that has no surface of its own.');
  led.inert('Grid', 'lineWidth',
    'the thickness of the design grid’s lines',
    'an EDITOR-ONLY property, and correctly so: the grid is a design-time aid drawn by EditorRuler and the canvas overlay, and it is not painted in preview or in the exported player at all. Recorded rather than left as a matrix gap.');

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
