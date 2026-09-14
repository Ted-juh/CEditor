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

    // An unpublished channel left public, and one marked private — the two things the wider
    // policies are about. Written through the app's own `createValueChannel`, because a channel
    // patched in as a plain object is silently dropped: the patch layer wants `_type:
    // 'ValueChannel'` on it, and a default component carries only published, public channels, so
    // without these the three policies are indistinguishable on the fixture rather than in the
    // product. That is exactly how they came to be recorded inert.
    await kit.page.evaluate(async (id) => {
      const { createValueChannel } = await import('/src/CE_Application/utils/customComponentFactory.js');
      const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
      applyControlPatch(id, {
        'ValueChannels.gain': createValueChannel('gain', { label: 'Gain', min: 0, max: 2, defaultValue: 1 }),
        'ValueChannels.secret': createValueChannel('secret', { label: 'Secret', publicInput: false, publicOutput: false }),
      });
    }, a);
    await kit.settle(500);
    const offered = async () => kit.page.evaluate(async () => {
      const { listPanelCustomApiEndpoints } = await import('/src/CE_Application/utils/panelCustomComponentLinks.js');
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      return listPanelCustomApiEndpoints(live?.controls ?? [])
        .filter((e) => e.controlName === 'Alpha').map((e) => `${e.direction}:${e.channel}`);
    });

    const published = await offered();
    led.check(X, 'linkPolicy — publishedOnly', 'the default reaches only the properties the author published, so a component\'s internals stay its own',
      ['input:mainValue', 'input:mode', 'input:accentColour', 'output:mainValue', 'output:mode'],
      published);

    await kit.set(a, { 'ExternalAPI.linkPolicy': 'advancedOptIn' });
    await kit.settle(500);
    led.check(X, 'linkPolicy — advancedOptIn', 'widening it adds the value channels the author has NOT marked private — `gain` appears in both directions, `secret` in neither. The opt-in is the channel\'s own publicInput/publicOutput, which the Value Channels editor already shows as "private in"/"private out" and the export layer already honours, so the policy reads a marker that existed rather than inventing one',
      ['input:mainValue', 'input:mode', 'input:accentColour', 'input:gain',
       'output:mainValue', 'output:mode', 'output:gain'],
      await offered());

    await kit.set(a, { 'ExternalAPI.linkPolicy': 'allInternals' });
    await kit.settle(500);
    led.check(X, 'linkPolicy — allInternals', 'the widest setting reaches the private channel too, which is what its name says and why it is not the default',
      ['input:mainValue', 'input:mode', 'input:accentColour', 'input:gain', 'input:secret',
       'output:mainValue', 'output:mode', 'output:gain', 'output:secret'],
      await offered());

    await kit.set(a, { 'ExternalAPI.linkPolicy': 'publishedOnly', 'ExternalAPI.emitsExternalLinks': false });
    await kit.settle(500);
    led.check(X, 'emitsExternalLinks', 'switching it off takes away everything this component could drive others WITH — its outputs go, its inputs stay, so the component can still be driven while driving nothing',
      ['input:mainValue', 'input:mode', 'input:accentColour'], await offered());

    await kit.set(a, { 'ExternalAPI.emitsExternalLinks': true, 'ExternalAPI.acceptsExternalLinks': false });
    await kit.settle(500);
    led.check(X, 'acceptsExternalLinks', 'and the mirror of it: with inbound refused the component offers only what it can drive others with',
      ['output:mainValue', 'output:mode'], await offered());

    // THE HALF THAT MAKES THESE SWITCHES RATHER THAN PICKER FILTERS. The list above is what the
    // Links editor draws; this is the run time. A link made while the component accepted input has
    // to stop moving it once it does not — otherwise the setting says "do not let others drive
    // this" while others go on driving it, which is the shape of defect this whole pass is about.
    const carried = async () => kit.page.evaluate(async () => {
      const { applyPanelCustomLinkRoutes } = await import('/src/CE_Application/utils/panelCustomComponentLinks.js');
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const controls = live?.controls ?? [];
      const alpha = controls.find((c) => c?._children?.Core?.name === 'Alpha');
      const beta = controls.find((c) => c?._children?.Core?.name === 'Beta');
      const alphaId = alpha?._children?.Core?.id;
      const betaId = beta?._children?.Core?.id;
      alpha._children.Links = { _type: 'Links', enabled: true, _children: { route: {
        _type: 'Link', enabled: true, type: 'external-output', source: 'mainValue',
        target: `${betaId}.mainValue`, targetControlId: betaId, targetPort: 'mainValue' } } };
      const out = applyPanelCustomLinkRoutes(controls, {
        [alphaId]: { customValues: { mainValue: 0.73 } },
        [betaId]: { customValues: { mainValue: 0 } },
      });
      return out?.[betaId]?.customValues?.mainValue ?? null;
    });

    await kit.set(a, { 'ExternalAPI.acceptsExternalLinks': true });
    await kit.set(b, { 'ExternalAPI.acceptsExternalLinks': false });
    await kit.settle(500);
    const refused = await carried();
    await kit.set(b, { 'ExternalAPI.acceptsExternalLinks': true });
    await kit.settle(500);
    const allowed = await carried();
    led.check(X, 'acceptsExternalLinks (at run time, not only in the picker)',
      'a link already authored into this component stops carrying a value the moment the switch goes off, and carries it again when it comes back — one field changes between the two measurements, so this is the switch and not the fixture. A permission the editor enforces and the runtime ignores is a suggestion',
      { refused: 0, allowed: 0.73 }, { refused, allowed });

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

    // A LABEL IS NOT RENDERED THE WAY A BUTTON IS, and it is the type somebody most wants to
    // annotate. Label, Background, Image and TestBox are FOLDED: `SceneryGround` bakes them to
    // frozen markup once and reuses it, so they never go through the per-control preview props the
    // rest of the panel does. Both surfaces bake from the same controls and only one of them
    // annotates, so the flag is part of the bake's cache key as well as its props — without that,
    // whichever surface rendered first would decide what the other got. Measured here rather than
    // reasoned about, because the first implementation read the control directly instead of taking
    // a prop and gave the folded copy a role with no name on it.
    const scenery = await kit.make('Label', { 'Transform.x': 150, 'Transform.y': 230,
      'Transform.width': 180, 'Transform.height': 40, 'Core.name': 'Heading' });
    await kit.set(low, { 'Core.tooltip': 'Cutoff frequency', 'Core.screenReaderText': 'Filter cutoff' });
    await kit.set(scenery, { 'Core.tooltip': 'What this section does', 'Core.screenReaderText': 'Section heading' });
    await kit.settle(800);

    led.check(C, 'tooltip',
      'the hover text reaches the control as a `title`, which is what a hover text IS — on a Button that takes the pointer and on a folded Label that does not, the two rendering paths a panel actually has',
      { button: 'Cutoff frequency', label: 'What this section does' },
      { button: await attrOf(low, 'title'), label: await attrOf(scenery, 'title') });

    led.check(C, 'screenReaderText',
      'the author\'s label is what a screen reader is given, replacing the "<name> preview" the surface generates — the promise here is not that an attribute appears but that the AUTHOR\'S text wins, because the generated one was already there and was covering it',
      { button: 'Filter cutoff', label: 'Section heading' },
      { button: await attrOf(low, 'aria-label'), label: await attrOf(scenery, 'aria-label') });

    led.check(C, 'screenReaderText (a name needs a role to be announced at all)',
      'the folded Label is given `role="img"` so its name is actually spoken. `aria-label` on a plain div is ignored — a generic element has no name to give — so without this the text would be in the DOM, visible in the inspector, and reach nobody: the same failure one layer down. Only ever applied where the author wrote a label AND the surface has no role of its own, so it can never displace a Button\'s',
      { label: 'img', buttonKeepsItsOwn: 'button' },
      { label: await attrOf(scenery, 'role'), buttonKeepsItsOwn: await attrOf(low, 'role') });

    await kit.set(low, { 'Core.tooltip': '', 'Core.screenReaderText': '' });
    await kit.settle(700);
    led.check(C, 'tooltip + screenReaderText (empty means absent, not empty)',
      'clearing both writes no `title` at all rather than an empty one — an empty title is a tooltip that flashes a blank box — and hands the accessible name back to the surface\'s generated default rather than leaving the control nameless',
      { title: null, aria: 'Low preview' },
      { title: await attrOf(low, 'title'), aria: await attrOf(low, 'aria-label') });

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
