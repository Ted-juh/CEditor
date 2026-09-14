/**
 * behaviourCustomStress.mjs — pointer-driven acceptance pass over the hidden custom-component rig.
 *
 * This is deliberately not a schema test. Fourteen saved packages are instantiated through the
 * library path, painted together, driven through real hit zones, routed across components, passed
 * through JavaScript and Lua, serialized, reopened, and driven again. Assertions read pixels,
 * computed boxes/text and live preview values — a successful property write alone proves nothing.
 *
 * Run: node browser-checks/behaviourCustomStress.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot({ width: 1900, height: 1200 });
const led = new Ledger('custom-stress');
const ids = Object.fromEntries([
  'dial', 'range', 'gain', 'balance', 'meter', 'ladder', 'xy', 'button', 'transport',
  'arp', 'envelope', 'waveform', 'keyboard', 'matrix',
].map((name, index) => [name, `stress_instance_${index + 1}`]));
const r3 = (value) => typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;

const sessionValues = async (id) => (await kit.session(id))?.customValues ?? {};
const visual = (id, probe) => kit.page.evaluate(({ id, probe }) => {
  const root = document.querySelector(`[data-control-id="${id}"]`);
  const nodes = [...(root?.querySelectorAll('.interactive-part') ?? [])];
  const node = nodes.find((candidate) => {
    const leafText = [...candidate.querySelectorAll('.interactive-part-text')]
      .map((child) => (child.textContent ?? '').trim()).join(' ');
    const bg = candidate.querySelector('.interactive-simple-background');
    const colour = bg ? getComputedStyle(bg).backgroundColor : '';
    if (probe.text && new RegExp(probe.text).test(leafText)) return true;
    if (probe.background && colour === probe.background) return true;
    return false;
  });
  if (!node) return null;
  const box = node.getBoundingClientRect();
  const host = root.getBoundingClientRect();
  const style = getComputedStyle(node);
  return {
    x: Math.round((box.x - host.x) * 10) / 10,
    y: Math.round((box.y - host.y) * 10) / 10,
    w: Math.round(box.width * 10) / 10,
    h: Math.round(box.height * 10) / 10,
    opacity: style.opacity,
    transform: style.transform,
    text: (node.textContent ?? '').trim(),
  };
}, { id, probe });

async function zonePoint(id, wanted) {
  const box = await kit.box(id);
  const normalized = await kit.page.evaluate(async ({ id, wanted }) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const { panelPreviewSessions } = await import('/src/CE_Application/stores/interactionPreview.js');
    const { resolveCustomHitZoneAtPoint } = await import('/src/CE_Application/utils/customComponentInteraction.js');
    const { resolveInteractiveControl } = await import('/src/CE_Application/utils/interactionRuntime.js');
    const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
    const panel = get(panels).find((candidate) => candidate.id === get(activePanelId));
    const control = panel.controls.find((candidate) => candidate._children.Core.id === id);
    const session = get(panelPreviewSessions)[id] ?? {};
    const values = session.customValues ?? {};
    const resolved = resolveInteractiveControl(control, session).control;
    const rect = { left: 0, top: 0, width: 1000, height: 1000 };
    for (let iy = 1; iy < 36; iy += 1) {
      for (let ix = 1; ix < 44; ix += 1) {
        const zone = resolveCustomHitZoneAtPoint(resolved, rect, (1000 * ix) / 44, (1000 * iy) / 36, values);
        if (zone?.name === wanted) return { x: ix / 44, y: iy / 36 };
      }
    }
    return null;
  }, { id, wanted });
  if (!normalized) throw new Error(`${id}: could not locate hit zone ${wanted}`);
  return { x: box.x + box.w * normalized.x, y: box.y + box.h * normalized.y };
}

async function clickZone(id, name) {
  const at = await zonePoint(id, name);
  await kit.click(at);
  await kit.settle(260);
  return at;
}

async function colourComplexity(id) {
  const points = [];
  for (const y of [0.12, 0.3, 0.5, 0.7, 0.88]) {
    for (const x of [0.12, 0.3, 0.5, 0.7, 0.88]) points.push([x, y]);
  }
  const pixels = await kit.livePixels(id, points);
  return new Set(pixels.map(([r, g, b, a]) =>
    `${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)},${Math.round(a / 32)}`)).size;
}

async function runtimeSnapshot() {
  return kit.page.evaluate(async () => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const { scriptTrace } = await import('/src/CE_Application/stores/scriptConsole.js');
    const { listPanelCustomApiEndpoints, listPanelCustomRouteLinks }
      = await import('/src/CE_Application/utils/panelCustomComponentLinks.js');
    const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
    const panel = get(panels).find((candidate) => candidate.id === get(activePanelId));
    const routes = listPanelCustomRouteLinks(panel?.controls ?? []);
    return {
      panelName: panel?.name,
      controlCount: panel?.controls?.length ?? 0,
      scripts: (panel?.scripts ?? []).map((script) => `${script.language}:${script.event}`).sort(),
      endpoints: listPanelCustomApiEndpoints(panel?.controls ?? []).length,
      routes: routes.map((route) => ({ name: route.name, broken: route.broken, blocked: route.blocked })),
      trace: get(scriptTrace).map((entry) => ({ level: entry.level, scriptId: entry.scriptId, message: entry.message })),
    };
  });
}

async function clearTrace() {
  await kit.page.evaluate(async () => {
    const { clearScriptTrace } = await import('/src/CE_Application/stores/scriptConsole.js');
    clearScriptTrace();
  });
}

async function activateFixtureScripts() {
  await kit.page.evaluate(async () => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const { setLiveScripts } = await import('/src/CE_Application/scripting/panelRuntime.js');
    const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
    const panel = get(panels).find((candidate) => candidate.id === get(activePanelId));
    setLiveScripts(panel?.scripts ?? [], panel?.id ?? null);
  });
}

async function driveXy(targetXFraction) {
  const box = await kit.box(ids.xy);
  const start = await zonePoint(ids.xy, 'padZone');
  await kit.drag(start, {
    x: box.x + box.w * targetXFraction,
    y: box.y + box.h * (targetXFraction > 0.5 ? 0.25 : 0.75),
  });
  await kit.settle(900);
}

try {
  const url = new URL(kit.page.url());
  url.searchParams.set('custom_component_stress', `browser-${Date.now()}`);
  await kit.page.goto(url.href, { waitUntil: 'networkidle' });
  await kit.page.waitForFunction(() => window.__ceCustomComponentStressTest?.componentCount === 14,
    null, { timeout: 60000 });
  await kit.page.evaluate(async () => {
    const { requestFitToWindow } = await import('/src/CE_Application/stores/editorCommands.js');
    requestFitToWindow();
  });
  await kit.settle(700);
  await activateFixtureScripts();
  await kit.preview(true);
  await kit.settle(900);

  const fixture = await runtimeSnapshot();
  led.check('Fixture', 'package instantiation', 'all fourteen demanding definitions arrive through saved package envelopes',
    { panelName: 'Custom Component Stress Rig', controls: 14 },
    { panelName: fixture.panelName, controls: fixture.controlCount });
  led.check('Fixture', 'two-language scripts', 'the live panel carries the JavaScript and Lua legs of the chain',
    ['javascript:onValueChanged', 'lua:onValueChanged'], fixture.scripts);
  led.check('Fixture', 'public route', 'XY.x has one intact, permitted route to the meter',
    [{ name: 'stress_xy_x_to_meter_level', broken: false, blocked: false }], fixture.routes);
  led.check('Fixture', 'public API breadth', 'the fourteen components expose a substantial public endpoint surface',
    true, fixture.endpoints >= 40);

  const sparse = [];
  const blank = [];
  for (const [name, id] of Object.entries(ids)) {
    const pieces = await kit.dom(id, '.interactive-part');
    if (!pieces?.some((piece) => piece.w > 2 && piece.h > 2)) blank.push(name);
    const colours = await colourComplexity(id);
    if (colours < 2) sparse.push(`${name}:${colours}`);
  }
  led.check('Visuals', 'all components paint real parts', 'every package has at least one visible, sized custom part', [], blank);
  led.check('Visuals', 'compositor complexity', 'each rendered package produces at least two materially distinct sampled colours rather than a blank slab', [], sparse);

  // Circular arc + pointer binding: a vertical gesture must increase the actual Hz channel and
  // move both the pointer and numeric readout.
  const dialBefore = { values: await sessionValues(ids.dial),
    pointer: await visual(ids.dial, { background: 'rgb(243, 249, 255)' }),
    readout: await visual(ids.dial, { text: '\\d+ Hz' }) };
  const dialAt = await zonePoint(ids.dial, 'dialZone');
  await kit.drag(dialAt, { x: dialAt.x, y: dialAt.y - 55 });
  const dialAfter = { values: await sessionValues(ids.dial),
    pointer: await visual(ids.dial, { background: 'rgb(243, 249, 255)' }),
    readout: await visual(ids.dial, { text: '\\d+ Hz' }) };
  led.check('Neon Dial', 'circular art / vertical behavior', 'one real drag increases cutoff and visibly rotates the pointer and changes the readout',
    { valueIncreased: true, pointerMoved: true, readoutChanged: true },
    { valueIncreased: dialAfter.values.cutoff > dialBefore.values.cutoff,
      pointerMoved: dialAfter.pointer.transform !== dialBefore.pointer.transform,
      readoutChanged: dialAfter.readout.text !== dialBefore.readout.text });

  // Range macro: toggle state changes the actual glyph and causes the conditioned min zone to
  // disappear while the central lock zone remains usable.
  await clickZone(ids.range, 'lockZone');
  const locked = await sessionValues(ids.range);
  const lockText = await visual(ids.range, { text: '^(EDIT|LOCK)$' });
  const lockedZoneResult = await kit.page.evaluate(async ({ id }) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const { panelPreviewSessions } = await import('/src/CE_Application/stores/interactionPreview.js');
    const { resolveCustomHitZoneAtPoint } = await import('/src/CE_Application/utils/customComponentInteraction.js');
    const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
    const panel = get(panels).find((candidate) => candidate.id === get(activePanelId));
    const control = panel.controls.find((candidate) => candidate._children.Core.id === id);
    const values = get(panelPreviewSessions)[id]?.customValues ?? {};
    return resolveCustomHitZoneAtPoint(control, { left: 0, top: 0, width: 178, height: 178 }, 30, 90, values)?.name ?? null;
  }, { id: ids.range });
  led.check('Range Macro', 'locked state and condition', 'locking changes the visible glyph and removes the minimum handle hit zone',
    { locked: true, text: 'LOCK', minZone: null },
    { locked: locked.rangeLocked, text: lockText.text, minZone: lockedZoneResult });

  // Exact enumerated actions: these must select the named payload, not merely change something.
  await clickZone(ids.button, 'buttonZone');
  await clickZone(ids.transport, 'recZone');
  await clickZone(ids.waveform, 'noiseZone');
  led.check('Selectors', 'authored enum payloads', 'button, transport and waveform zones land on their exact authored values',
    { mode: 'B', transport: 'record', waveform: 'noise' },
    { mode: (await sessionValues(ids.button)).mode,
      transport: (await sessionValues(ids.transport)).transport,
      waveform: (await sessionValues(ids.waveform)).waveform });

  // Generated selectors: one piano zone per key and one matrix zone per cell must be materially
  // present, and pointer input must land on numeric channel values inside the authored ranges.
  const generated = await kit.page.evaluate(async ({ keyboard, matrix }) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const { getCustomHitZones } = await import('/src/CE_Application/utils/customComponentInteraction.js');
    const { resolveInteractiveControl } = await import('/src/CE_Application/utils/interactionRuntime.js');
    const { panelPreviewSessions } = await import('/src/CE_Application/stores/interactionPreview.js');
    const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
    const panel = get(panels).find((candidate) => candidate.id === get(activePanelId));
    const byId = new Map(panel.controls.map((control) => [control._children.Core.id, control]));
    const sessions = get(panelPreviewSessions);
    const generated = (id) => Object.entries(getCustomHitZones(
      resolveInteractiveControl(byId.get(id), sessions[id] ?? {}).control))
      .filter(([, zone]) => zone?.generated === true).map(([name]) => name);
    return { keyboard: generated(keyboard), matrix: generated(matrix) };
  }, { keyboard: ids.keyboard, matrix: ids.matrix });
  await clickZone(ids.keyboard, generated.keyboard.at(-1));
  const matrixBox = await kit.box(ids.matrix);
  await kit.click({ x: matrixBox.x + matrixBox.w * 0.78, y: matrixBox.y + matrixBox.h * 0.75 });
  const keyboardValues = await sessionValues(ids.keyboard);
  const matrixValues = await sessionValues(ids.matrix);
  led.check('Generators', 'piano and grid hit zones', '25 generated keys and 16 generated matrix cells survive package instantiation and drive bounded values',
    { keys: 25, cells: 16, noteBounded: true, slotBounded: true },
    { keys: generated.keyboard.length, cells: generated.matrix.length,
      noteBounded: keyboardValues.note >= 48 && keyboardValues.note <= 72,
      slotBounded: matrixValues.slot >= 0 && matrixValues.slot <= 15 });

  // The hardest path: a real XY drag changes two channels, the public route repaints the meter,
  // JavaScript changes the waveform, and Lua repaints the ladder. No direct store writes here.
  await clearTrace();
  const dotBefore = JSON.stringify(await kit.dom(ids.xy, '.interactive-part'));
  await driveXy(0.78);
  const xyHigh = await sessionValues(ids.xy);
  const meterHigh = await sessionValues(ids.meter);
  const ladderHigh = await sessionValues(ids.ladder);
  const waveHigh = await sessionValues(ids.waveform);
  const dotHigh = JSON.stringify(await kit.dom(ids.xy, '.interactive-part'));
  const meterText = await visual(ids.meter, { text: '\\d+%' });
  const highRuntime = await runtimeSnapshot();
  const logs = highRuntime.trace.filter((entry) => entry.level !== 'error').map((entry) => entry.message ?? '');
  led.check('Runtime chain', 'XY interaction', 'the drag moves both XY channels and the cursor on screen',
    true, xyHigh.x > 0.65 && xyHigh.y > 0.6 && dotHigh !== dotBefore);
  led.check('Runtime chain', 'public route', 'the same X value reaches the meter and its visible numeric readout',
    true, Math.abs(meterHigh.level - xyHigh.x) < 0.02 && meterText.text.includes(String(Math.round(xyHigh.x * 100))));
  led.check('Runtime chain', 'JavaScript effect', 'the XY handler selects the square waveform and records an execution trace',
    { waveform: 'square', logged: true },
    { waveform: waveHigh.waveform, logged: logs.some((message) => message.includes('stress-js:')) });
  led.check('Runtime chain', 'Lua effect', 'the meter handler mirrors the routed value into the LED ladder and records an execution trace',
    { mirrored: true, logged: true },
    { mirrored: Math.abs(ladderHigh.amount - meterHigh.level) < 0.02,
      logged: logs.some((message) => message.includes('stress-lua:')) });
  led.check('Runtime chain', 'no script errors', 'the cross-language cascade completes without a runtime error',
    [], highRuntime.trace.filter((entry) => entry.level === 'error'));

  // Save/open fidelity: kit.reopen serializes the full panel, reloads the app, deserializes it as a
  // new active panel and restores Preview. A second opposite drag must run the same visible chain.
  await kit.reopen(ids.xy);
  await activateFixtureScripts();
  await clearTrace();
  await driveXy(0.24);
  const reopened = await runtimeSnapshot();
  const xyLow = await sessionValues(ids.xy);
  const meterLow = await sessionValues(ids.meter);
  const ladderLow = await sessionValues(ids.ladder);
  const waveLow = await sessionValues(ids.waveform);
  led.check('Persistence', 'document structure', 'save/reopen retains all packages, both scripts and the public route',
    { controls: 14, scripts: ['javascript:onValueChanged', 'lua:onValueChanged'], routeOkay: true },
    { controls: reopened.controlCount, scripts: reopened.scripts,
      routeOkay: reopened.routes.length === 1 && !reopened.routes[0].broken && !reopened.routes[0].blocked });
  led.check('Persistence', 'runtime still live', 'after reopen an opposite pointer drag reruns routing, JavaScript and Lua with visible low-state results',
    true, xyLow.x < 0.4 && Math.abs(meterLow.level - xyLow.x) < 0.02
      && Math.abs(ladderLow.amount - meterLow.level) < 0.02 && waveLow.waveform === 'sine'
      && reopened.trace.some((entry) => String(entry.message).includes('stress-js:'))
      && reopened.trace.some((entry) => String(entry.message).includes('stress-lua:'))
      && !reopened.trace.some((entry) => entry.level === 'error'));

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
