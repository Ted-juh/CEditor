/**
 * authoringLinks.mjs — the Route Builder, driven as a person builds a route with it.
 *
 * WHY THIS FILE EXISTS. `behaviourLinks.mjs` and `behaviourCombined.mjs` both prove that a panel
 * link CARRIES A VALUE from one custom component to another — and both build the link by calling
 * `createPanelCustomRouteLink` and patching the control, which is the one thing a user cannot do.
 * `panelCustomComponentLinks.test.js` covers the engine underneath. So routing was proven at both
 * ends and never in the middle: nothing had opened the editor a person actually routes with.
 *
 * That is gate B4's "scripting/routing" half, and the distinction it turns on: the engine working
 * and the editor reaching the engine are two claims, and only one of them had evidence.
 *
 * WHAT THE CHAIN IS:
 *
 *   reach     the Route Builder is in the React tab of a custom component's properties
 *   offer     it lists the routes that COULD be made, between two components that publish
 *   build     pressing Create route writes the link onto the source control's document
 *   carry     the link the editor built moves a value, through the same runtime the engine tests use
 *   refuse    a component that has switched external links off offers nothing to route to
 *
 * The last row is there because the two are new neighbours: the External switches were implemented
 * on 14 September and the picker is what an author sees them through, so "the switch is off" and
 * "the builder offers nothing" have to be the same fact rather than two that agree today.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('authoringLinks');
const R = 'RouteBuilder';

/** The links on a control, as the document holds them. */
const linksOn = (id) => kit.page.evaluate(async (id) => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const live = get(panels).find((p) => p.id === get(activePanelId));
  const control = (live?.controls ?? []).find((c) => c._children?.Core?.id === id);
  return Object.entries(control?._children?.Links?._children ?? {})
    .map(([name, link]) => ({ name, type: String(link?.type ?? ''), source: String(link?.source ?? ''),
      target: String(link?.target ?? '') }));
}, id);

/**
 * Select a control and open its React tab, where the Route Builder lives.
 *
 * THE REACT TAB ONLY EXISTS WHILE THE COMPONENT DESIGNER IS OPEN. Selecting a custom component on
 * the panel gives the ordinary eight tabs — Core, Transform, Background, Border, Mouse, Effects,
 * Device, Properties — and no React among them; launching the designer workspace is what adds
 * Interact, React and Assets to the properties panel. So the route to the Route Builder runs
 * through the Component Designer even though the builder is not drawn inside it, which is not
 * guessable from either file and cost a probe to find.
 */
async function openReactTab(id) {
  const box = await kit.box(id);
  assert.ok(box, 'the control needs a box on the canvas to be selected — is the designer covering it?');
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(700);
  if (!await kit.page.locator('.properties-panel .tab-icon[title="React"]').count()) {
    await kit.page.locator('[data-testid="component-designer-launch"]').click();
    await kit.settle(2200);
  }
  await kit.page.locator('.properties-panel .tab-icon[title="React"]').click();
  await kit.settle(1000);
}

try {
  await kit.fresh();

  const alpha = await kit.make('CustomComponent', { 'Transform.x': 60, 'Transform.y': 110,
    'Transform.width': 150, 'Transform.height': 90, 'Core.name': 'Alpha' });
  const beta = await kit.make('CustomComponent', { 'Transform.x': 250, 'Transform.y': 110,
    'Transform.width': 150, 'Transform.height': 90, 'Core.name': 'Beta' });
  await kit.settle(800);

  // ===============================================================================================
  // REACH + OFFER
  // ===============================================================================================
  await openReactTab(alpha);
  const candidates = () => kit.page.evaluate(() =>
    [...document.querySelectorAll('.candidate-list button')].map((b) => (b.textContent ?? '').trim()));

  // THE REACT TAB HAS A SUB-NAV — Bindings, Links, States and Animations share one pane, and the
  // three that are not showing are `display:none` with their whole contents still in the DOM. So
  // `.route-builder` is present the entire time with a zero-by-zero box and six candidate buttons
  // inside it, and every `querySelectorAll` finds them. Only `isVisible` disagrees.
  //
  // Which makes this the exact shape of a row that passes for the fixture's reason: assert on
  // existence and it is green whether or not an author could ever see the thing. The sub-nav is
  // clicked the way an author clicks it, and the visibility check is kept rather than softened.
  // The pane is labelled "Value → Value", not "Links" — the sub-nav names what each pane DOES
  // rather than which section it edits ("Value → Part" is Bindings), which is better for a reader
  // and invisible to anybody addressing it by the section name.
  await kit.page.locator('.react-nav button[role="tab"]').filter({ hasText: 'Value → Value' }).first().click();
  await kit.settle(700);
  await kit.page.locator('.route-builder').scrollIntoViewIfNeeded();
  await kit.settle(400);
  const offered = await candidates();
  led.check(R, 'the builder is reachable and offers real routes',
    'the Route Builder is in the React tab of a custom component and lists the routes that could be made between this component and its neighbours — an empty list on a panel with two publishing components would mean an author has no way in at all, whatever the engine underneath can do',
    { reachable: true, offersRoutes: true },
    { reachable: await kit.page.locator('.route-builder').isVisible(), offersRoutes: offered.length > 0 });

  // ===============================================================================================
  // BUILD — through the buttons, which is the whole point of this suite.
  // ===============================================================================================
  const before = await linksOn(alpha);
  await kit.page.locator('.candidate-list button').first().click();
  await kit.settle(400);
  await kit.page.locator('.candidate-summary button.action-btn').click();
  await kit.settle(900);
  const after = await linksOn(alpha);

  led.check(R, 'Create route writes the link onto the document',
    'pressing the button adds a link to the SOURCE control, of the type the runtime acts on — measured on the document rather than on the list the builder redraws, because a builder that shows a route it did not save is exactly the failure a UI-less test cannot see',
    { added: 1, type: 'external-output', namesATarget: true },
    { added: after.length - before.length,
      type: after.at(-1)?.type,
      namesATarget: (after.at(-1)?.target ?? '').includes('.') });

  // ===============================================================================================
  // CARRY — the link the EDITOR made, through the runtime the engine tests use.
  // ===============================================================================================
  const carried = await kit.page.evaluate(async ({ a, b }) => {
    const { applyPanelCustomLinkRoutes } = await import('/src/CE_Application/utils/panelCustomComponentLinks.js');
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const live = get(panels).find((p) => p.id === get(activePanelId));
    const controls = live?.controls ?? [];
    const out = applyPanelCustomLinkRoutes(controls, {
      [a]: { customValues: { mainValue: 0.61 } },
      [b]: { customValues: { mainValue: 0 } },
    });
    return out?.[b]?.customValues?.mainValue ?? null;
  }, { a: alpha, b: beta });

  led.check(R, 'and the link it built actually carries a value',
    'the route the BUILDER wrote moves 0.61 from one component to the other through the same resolver the engine`s own tests use — which is the join this suite exists for: the engine was proven and the editor was proven to draw, and nothing had shown that what the editor writes is what the engine reads',
    0.61, carried);

  // ===============================================================================================
  // REFUSE — the new External switches, seen from the authoring end.
  // ===============================================================================================
  await kit.set(beta, { 'ExternalAPI.acceptsExternalLinks': false });
  await kit.set(alpha, { 'ExternalAPI.emitsExternalLinks': false });
  // No need to re-open anything: Alpha is still selected and the Links pane is still showing, and
  // the builder's list is derived, so it re-derives on the switch. Re-selecting would in fact FAIL
  // here — the Component Designer is covering the canvas, so the control has no box to click.
  await kit.settle(1200);
  const afterRefusing = await candidates();
  led.check(R, 'a component that refuses links offers none to build',
    'with Alpha emitting nothing and Beta accepting nothing, the builder has nothing to offer — the switches and the picker are the same fact rather than two that happen to agree, which is worth pinning because they were implemented on different days and the picker is where an author meets the switch',
    0, afterRefusing.length);

  led.closed(R, 'what a link does once it exists',
    'conversion between types and ranges, nested components, and the value arriving',
    'behaviourLinks.mjs (33 rows) and behaviourCombined.mjs for a link on a 139-control panel, plus panelCustomComponentLinks.test.js and panelCustomLinksNesting.test.js for the engine. This suite asks only whether an author can BUILD one, which is the half none of those touch.');

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
