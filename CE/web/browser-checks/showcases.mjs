/**
 * The showcase panels in the editor (CE/panels/Film Festival, Song Book, Mechanisms, Gallery; written
 * by scripts/export-showcases.mjs). Each is opened as File > Open opens a .cepanel and played in
 * Preview, and each kind of clock they show is held to what it does there:
 *
 *   - a film, a song, a mechanism and a gallery panel open and their opening scenes run, no error
 *   - Every Breath You Take: the pointer across the panel moves the eyes' scene
 *   - Blue Monday: the sequencer's bar plays while the transport runs, and not before
 *   - Gear Train: a drag on the Drive knob turns the gears' scene
 *   - Domino Run: its script waits behind the trust banner, and the marker that needs it says so;
 *     once enabled, the dominoes' marker plays the ball and the ball's the bell
 *   - Clockwork: once its script is enabled, each hand's scene is held at the time of day
 *
 *   node browser-checks/showcases.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boot } from './behaviourKit.mjs';

const PANELS = join(import.meta.dirname, '../../panels');
const kit = await boot({ width: 1600, height: 1000 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

/** Open a showcase file as File > Open does, in Preview; its controls by name. */
async function open(folder, file) {
  await kit.preview(false);
  const text = readFileSync(join(PANELS, folder, `${file}.cepanel`), 'utf8');
  const ids = await page.evaluate(async ({ text, path }) => {
    const { deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const { scriptTrace } = await window.__ceImport('/src/CE_Application/stores/scriptConsole.js');
    scriptTrace.set([]);
    const panel = deserializePanel(text, path, null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  }, { text, path: join(PANELS, folder, `${file}.cepanel`) });
  await kit.settle(500);
  await kit.preview(true);
  await kit.settle(1200);
  return ids;
}
/** The animations on a control's box: name, delay in seconds, state. */
const anims = (id) => page.evaluate((id) => {
  const el = document.querySelector(`.panel-surface .canvas-control[data-control-id="${id}"]`);
  return el ? el.getAnimations().map((a) => ({ name: a.animationName, delay: a.effect?.getTiming?.().delay ?? 0, state: a.playState, time: a.currentTime })) : null;
}, id);
/** What the script console holds of a kind: 'error' unless told. */
const consoleSays = (kind = 'error') => page.evaluate(async (kind) => {
  const { scriptTrace } = await window.__ceImport('/src/CE_Application/stores/scriptConsole.js');
  let trace; scriptTrace.subscribe((v) => { trace = v; })();
  return (trace ?? []).filter((t) => t.kind === kind).map((t) => String(t.message ?? ''));
}, kind);
const errorsInConsole = () => consoleSays('error');
const surfaceRect = () => page.evaluate(() => {
  const r = document.querySelector('.panel-surface.preview-surface')?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, scale: r.width / 720 } : null;
});
const transport = (run) => page.evaluate(async (run) => {
  const { setTransportBpm, startTransport, stopTransport } = await window.__ceImport('/src/CE_Application/stores/transport.js');
  if (run) { setTransportBpm(120); startTransport(); } else stopTransport();
}, run);

try {
  // One of each collection opens and plays.
  for (const [folder, file, name] of [['Film Festival', 'The Shining', 'LeftDoor'], ['Song Book', 'Paint It Black', 'Pad1'], ['Mechanisms', 'Music Box', 'Key'], ['Gallery', 'Op Art', 'RingsMoving']]) {
    const before = kit.failures.length;
    const ids = await open(folder, file);
    const moving = await anims(ids[name]);
    const errors = await errorsInConsole();
    check(`${folder}: ${file} opens and its opening scene plays in Preview`, () => {
      assert.deepEqual(kit.failures.slice(before), []);
      assert.deepEqual(errors, []);
      assert.ok(moving?.some((a) => a.state === 'running'), `${name}: ${JSON.stringify(moving)}`);
    });
  }

  // The pointer across the panel moves the eyes.
  {
    const ids = await open('Song Book', 'Every Breath You Take');
    const at = await surfaceRect();
    await page.mouse.move(at.x + 40 * at.scale, at.y + 200 * at.scale, { steps: 4 });
    await kit.settle(500);
    const left = (await anims(ids.Iris1))?.[0]?.delay;
    await page.mouse.move(at.x + 680 * at.scale, at.y + 200 * at.scale, { steps: 8 });
    await kit.settle(700);
    const right = (await anims(ids.Iris1))?.[0]?.delay;
    check('Every Breath You Take: the eyes follow the pointer across the panel', () => {
      assert.ok(Number.isFinite(left) && Number.isFinite(right), `${left} ${right}`);
      assert.ok(-right > -left + 400, `the pointer to the right is further into the scene: ${left} -> ${right} ms`);
    });
    await page.mouse.move(5, 5);
  }

  // The sequencer plays with the transport.
  {
    const ids = await open('Song Book', 'Blue Monday');
    const lamp = ids.Lamp1_1;
    const still = await anims(lamp);
    await transport(true);
    await kit.settle(2600);
    const playing = await anims(lamp);
    await transport(false);
    check('Blue Monday: the bar plays while the transport runs, and not before', () => {
      assert.ok(!still?.length, `nothing on the first kick before Play: ${JSON.stringify(still)}`);
      assert.ok(playing?.length, `the first kick's lamp is played: ${JSON.stringify(playing)}`);
    });
  }

  // A hand on the Drive knob turns the train.
  {
    const ids = await open('Mechanisms', 'Gear Train');
    const before = (await anims(ids.Gear1))?.[0]?.delay;
    const at = await surfaceRect();
    const [x, y] = [at.x + 88 * at.scale, at.y + 342 * at.scale];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 40 * at.scale, { steps: 8 });
    await page.mouse.up();
    await kit.settle(700);
    const after = (await anims(ids.Gear1))?.[0]?.delay;
    check('Gear Train: dragging the Drive knob turns the gears\' scene', () => {
      assert.ok(Number.isFinite(before) && Number.isFinite(after), `${before} ${after}`);
      assert.ok(-after > -before + 50, `turned up, further into the scene: ${before} -> ${after} ms`);
    });
  }

  // The domino run's script waits for the trust banner, and then chains the scenes.
  {
    const ids = await open('Mechanisms', 'Domino Run');
    await kit.settle(2200);
    const banner = await page.locator('.script-trust').count();
    const waiting = await consoleSays('warn');
    const waitingErrors = await errorsInConsole();
    await page.getByRole('button', { name: 'Enable scripts for this session' }).click();
    await kit.settle(2600);
    const ball = await anims(ids.Ball);
    await kit.settle(1400);
    const ding = await anims(ids.Ding);
    const errors = await errorsInConsole();
    check('Domino Run: its script waits behind the trust banner, and the marker that needs it says so', () => {
      assert.equal(banner, 1);
      assert.deepEqual(waiting.filter((m) => /scripts are paused/.test(m) && m.includes('"roll"')).length, 1, `said once: ${JSON.stringify(waiting)}`);
      assert.deepEqual(waitingErrors, [], 'no error: not "no script defines" for a script that is only waiting');
    });
    check('Domino Run: once enabled, the dominoes\' marker plays the ball, and the ball\'s the bell', () => {
      assert.ok(ball?.some((a) => a.state === 'running' || a.time > 0), `the ball rolls: ${JSON.stringify(ball)}`);
      assert.ok(ding?.length, `the bell rings: ${JSON.stringify(ding)}`);
      assert.deepEqual(errors, []);
    });
  }

  // The clock's script holds each hand at the time.
  {
    const ids = await open('Mechanisms', 'Clockwork');
    if (await page.locator('.script-trust').count()) await page.getByRole('button', { name: 'Enable scripts for this session' }).click();
    await kit.settle(1600);
    const seconds = await page.evaluate(() => new Date().getSeconds());
    const hand = (await anims(ids.SecondHand))?.[0];
    const minute = (await anims(ids.MinuteHand))?.[0];
    check('Clockwork: once its script is enabled, each hand\'s scene is held at the time of day', () => {
      assert.equal(hand?.state, 'paused', JSON.stringify(hand));
      const at = (-hand.delay / 1000) * 60;
      assert.ok(Math.abs(at - seconds) <= 2 || Math.abs(at - seconds) >= 58, `the second hand at ${at.toFixed(1)} s, the clock at ${seconds} s`);
      assert.equal(minute?.state, 'paused', JSON.stringify(minute));
    });
  }
  if (kit.failures.length) throw new Error(`page errors: ${kit.failures.join('; ')}`);
  console.log('showcases: all checks passed');
} finally {
  await kit.close();
}
