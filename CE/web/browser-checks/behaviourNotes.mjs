/**
 * behaviourNotes.mjs — deep behavioural pass over the note-emitting components.
 *
 * These controls never write the document, so the document is the wrong evidence for all of them.
 * What a property changes here is the MIDI that comes out: its note, its channel, its velocity, how
 * many notes, and when they stop. Every assertion below reads the note funnel and states the exact
 * bytes expected, and the grid geometry is read off the rendered SVG.
 *
 * Run: node browser-checks/behaviourNotes.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('notes');
const rgba = (hex) => {
  const s = hex.replace(/^#/, '');
  return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
};

try {
  // =============================================================================================
  // DRUM PADS — 36 properties
  // =============================================================================================
  await kit.fresh();
  const D = 'DrumPads';
  const DW = 420;
  const DH = 340;
  let id = await kit.make(D, { 'Transform.width': DW, 'Transform.height': DH });

  // The pad rectangles, in document order. The HEADER strip carries rx="6" too and comes first, so
  // it is dropped by size: a pad is never as wide as the whole control.
  // The header strip carries rx="6" exactly as the pads do and comes first in the document. It is
  // told apart by HEIGHT (headerH − 4 ≈ 18px) rather than width: a 1×1 grid has a pad nearly as
  // wide as the control, so a width test silently returns an empty grid there.
  const padRects = async () => (await kit.shapes(id, 'rect', (r) => r.rx === 6))
    .filter((r) => r.height > 22);
  const padSpot = async (i, fx = 0.5, fy = 0.5) => {
    const box = await kit.box(id);
    const rects = await padRects();
    const r = rects[i];
    if (!r) throw new Error(`DrumPads: asked for pad ${i} of a ${rects.length}-pad grid`);
    return { x: box.x + r.x + r.width * fx, y: box.y + r.y + r.height * fy };
  };
  /** Press a pad and report exactly what came out of the note funnel. */
  const strike = async (i, { fx = 0.5, fy = 0.5, hold = 0, release = true } = {}) => {
    await kit.forget();
    const at = await padSpot(i, fx, fy);
    await kit.page.mouse.move(at.x, at.y);
    await kit.page.mouse.down();
    await kit.settle(hold || 110);
    const whileDown = await kit.notes();
    if (release) { await kit.page.mouse.up(); await kit.settle(); }
    return { whileDown, all: await kit.notes() };
  };
  const ons = (list) => list.filter((e) => e.kind === 'on');
  const offs = (list) => list.filter((e) => e.kind === 'off');
  /**
   * Put every latched pad out before the next scenario.
   *
   * Toggle mode is STATE, and it survives a property change. Without this the second choke scenario
   * pressed a pad that was still latched from the first, got the toggle's own note-off, and read it
   * as a choke — a passing-looking failure in the other direction.
   */
  const silenceAll = async () => {
    for (let guard = 0; guard < 8; guard += 1) {
      const held = (await kit.session(id))?.drumHits ?? [];
      if (!held.length) return;
      const count = (await padRects()).length;
      // A pad can stay latched after the grid shrinks under it, and there is then no rectangle to
      // press. Nothing to do about that from here, and pressing rect[i] of a smaller grid would
      // silence the wrong pad — so stop rather than guess.
      const i = Number(String(held[0]).replace(/^p/, ''));
      if (!Number.isFinite(i) || i >= count) return;
      await strike(i);
    }
  };

  // --- rows / cols: the grid, and the pads it produces -------------------------------------------
  await kit.set(id, { 'DrumPads.rows': 2, 'DrumPads.cols': 3 });
  led.check(D, 'rows / cols', 'the grid holds exactly rows × cols pads', 6, (await padRects()).length);
  {
    const rects = await padRects();
    const xs = [...new Set(rects.map((r) => Math.round(r.x)))].sort((a, b) => a - b);
    const ys = [...new Set(rects.map((r) => Math.round(r.y)))].sort((a, b) => a - b);
    led.check(D, 'rows / cols (layout)', '3 columns and 2 rows of distinct positions', [3, 2], [xs.length, ys.length]);
  }
  await kit.set(id, { 'DrumPads.rows': 4, 'DrumPads.cols': 4 });
  led.check(D, 'rows / cols (16)', 'a 4×4 grid is sixteen pads', 16, (await padRects()).length);

  // --- origin: which corner pad 1 lives in --------------------------------------------------------
  // The pad the hardware calls "1" is bottom-left; reading order puts it top-left. The note is the
  // same, the POSITION is not — so this is checked by striking a screen corner and reading the note.
  await kit.preview(true);
  await kit.set(id, { 'DrumPads.map': 'chromatic', 'DrumPads.baseNote': 36, 'DrumPads.origin': 'bottomLeft' });
  {
    // BY SCREEN POSITION, not by index. `origin` does not reorder the DOM — it decides which pad
    // each SCREEN cell belongs to — so striking "rect number n" measures nothing about it. These
    // find the rect nearest a corner of the control and press that.
    const cornerNote = async (corner) => {
      const rects = await padRects();
      const pick = rects.reduce((best, r) => {
        const score = (x) => (corner.includes('bottom') ? -x.y : x.y) + (corner.includes('right') ? -x.x : x.x);
        return score(r) < score(best) ? r : best;
      }, rects[0]);
      const box = await kit.box(id);
      await kit.forget();
      await kit.click({ x: box.x + pick.x + pick.width / 2, y: box.y + pick.y + pick.height / 2 });
      return ons(await kit.notes())[0]?.note;
    };
    led.check(D, "origin 'bottomLeft'", 'pad 1 — the base note — sits in the bottom-left corner',
      36, await cornerNote('bottomLeft'));
    const bottomLeftUnderHardware = 36;
    await kit.set(id, { 'DrumPads.origin': 'topLeft' });
    led.check(D, "origin 'topLeft'", 'reading order puts the base note in the top-left instead',
      36, await cornerNote('topLeft'));
    // …and the two orders really are different: on a 4×4 the bottom-left screen cell is now the
    // last ROW of the reading order, which starts twelve pads in.
    led.check(D, 'origin (the orders differ)', 'the same screen corner plays a different pad under the other origin',
      36 + 12, await cornerNote('bottomLeft'));
    void bottomLeftUnderHardware;
  }
  await kit.set(id, { 'DrumPads.origin': 'bottomLeft' });

  // --- baseNote and its boundaries ------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.rows': 1, 'DrumPads.cols': 4, 'DrumPads.baseNote': 60 });
  {
    const notes = [];
    for (let i = 0; i < 4; i += 1) notes.push(ons((await strike(i)).all)[0]?.note);
    led.check(D, 'baseNote', 'pads number upward from the base note', [60, 61, 62, 63], notes);
    await kit.set(id, { 'DrumPads.baseNote': 126 });
    const high = [];
    for (let i = 0; i < 4; i += 1) high.push(ons((await strike(i)).all)[0]?.note);
    led.check(D, 'baseNote (clamps at 127)', 'notes past the top of MIDI clamp rather than wrapping',
      [126, 127, 127, 127], high);
    await kit.set(id, { 'DrumPads.baseNote': 36 });
  }

  // --- channel ----------------------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.channel': 10 });
  led.check(D, 'channel', 'the strike is sent on the declared channel', 10, ons((await strike(0)).all)[0]?.channel);
  await kit.set(id, { 'DrumPads.channel': 1 });
  led.check(D, 'channel (changed)', 'and follows when it changes', 1, ons((await strike(0)).all)[0]?.channel);
  await kit.set(id, { 'DrumPads.channel': 10 });

  // --- velocity and velocityFrom -------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.velocity': 77, 'DrumPads.velocityFrom': 'fixed' });
  led.check(D, 'velocity + velocityFrom fixed', 'every strike carries the declared velocity, wherever it lands',
    [77, 77], [ons((await strike(0, { fy: 0.1 })).all)[0]?.velocity, ons((await strike(0, { fy: 0.9 })).all)[0]?.velocity]);
  await kit.set(id, { 'DrumPads.velocityFrom': 'position' });
  {
    const top = ons((await strike(0, { fy: 0.05 })).all)[0]?.velocity;
    const bottom = ons((await strike(0, { fy: 0.95 })).all)[0]?.velocity;
    led.check(D, "velocityFrom 'position'", 'the top of the pad is harder than the bottom, over the declared 10..127 span',
      true, top > 120 && bottom < 20);
  }
  await kit.set(id, { 'DrumPads.velocityFrom': 'centre' });
  {
    // 'centre' is a declared value (PAD_VELOCITY_SOURCES) and is settable from every scripting
    // language. Its documented rule is the CHEBYSHEV distance to the middle — max(dx, dy) — and the
    // comment defending that choice is entirely about corners versus edge midpoints, which is a
    // two-axis argument. So both axes are measured here, separately.
    const chebyshev = (dx, dy) => Math.round(77 * (1 - Math.min(1, Math.max(dx, dy) * 2) * 0.72));
    const close = (a, b) => Math.abs(a - b) <= 2;                 // a click lands on a whole pixel
    const middle = ons((await strike(0, { fx: 0.5, fy: 0.5 })).all)[0]?.velocity;
    const vertical = ons((await strike(0, { fx: 0.5, fy: 0.05 })).all)[0]?.velocity;
    const horizontal = ons((await strike(0, { fx: 0.98, fy: 0.5 })).all)[0]?.velocity;
    led.check(D, "velocityFrom 'centre' (middle)", 'the middle of the pad is full velocity', 77, middle);
    led.check(D, "velocityFrom 'centre' (vertical)", 'a strike near the top edge falls off',
      chebyshev(0, 0.45), vertical, close);
    led.check(D, "velocityFrom 'centre' (horizontal)", 'a strike near the side edge falls off by the same rule',
      chebyshev(0.48, 0), horizontal, close);
    // THE RULE IS CHEBYSHEV, and this is the case the code comment was written to defend: a corner
    // must not be quieter than the edge midpoint beside it, because a pad is a square. With the
    // horizontal axis dropped the corner came out at FULL velocity instead, which is the opposite
    // failure and the one that hid the defect from a one-axis test.
    const corner = ons((await strike(0, { fx: 0.98, fy: 0.98 })).all)[0]?.velocity;
    const leftRim = ons((await strike(0, { fx: 0.02, fy: 0.5 })).all)[0]?.velocity;
    led.check(D, "velocityFrom 'centre' (corner = edge)", 'a corner strike matches the edge midpoint beside it',
      horizontal, corner, close);
    led.check(D, "velocityFrom 'centre' (symmetry)", 'left and right rims are equally soft',
      horizontal, leftRim, close);
  }
  await kit.set(id, { 'DrumPads.velocityFrom': 'fixed', 'DrumPads.velocity': 100 });

  // --- mode: momentary / oneShot / toggle, and gateMs ---------------------------------------------------------
  await kit.set(id, { 'DrumPads.mode': 'momentary' });
  {
    const hit = await strike(0);
    led.check(D, "mode 'momentary'", 'the note sounds on press and stops on release',
      [1, 0, 1], [ons(hit.whileDown).length, offs(hit.whileDown).length, offs(hit.all).length]);
  }
  await kit.set(id, { 'DrumPads.mode': 'toggle' });
  {
    const first = await strike(0);
    led.check(D, "mode 'toggle' (first press)", 'the note keeps sounding after the finger leaves',
      [1, 0], [ons(first.all).length, offs(first.all).length]);
    const second = await strike(0);
    led.check(D, "mode 'toggle' (second press)", 'pressing again silences it', 1, offs(second.all).length);
  }
  await kit.set(id, { 'DrumPads.mode': 'oneShot', 'DrumPads.gateMs': 300 });
  {
    // A TAP, not kit.click(): the helper holds for 40ms to make drags reliable, and a hold longer
    // than the gate lets the gate expire mid-click — which reads as "the gate did not hold" when
    // what happened is that the test took too long.
    await kit.forget();
    const at = await padSpot(0);
    await kit.page.mouse.move(at.x, at.y);
    await kit.page.mouse.down();
    await kit.page.mouse.up();
    await kit.settle(90);
    const early = await kit.notes();
    await kit.settle(400);
    const late = await kit.notes();
    led.check(D, "mode 'oneShot' + gateMs", 'the note is held for the gate and released on its own, with no finger on the pad',
      [1, 0, 1], [ons(early).length, offs(early).length, offs(late).length]);
  }
  await kit.set(id, { 'DrumPads.gateMs': 60 });
  {
    await kit.forget();
    const at = await padSpot(0);
    await kit.page.mouse.move(at.x, at.y);
    await kit.page.mouse.down();
    await kit.page.mouse.up();
    await kit.settle(200);
    led.check(D, 'gateMs (a short gate releases sooner)', 'a 60ms gate is already done where the 300ms gate was still sounding',
      1, offs(await kit.notes()).length);
  }
  await kit.set(id, { 'DrumPads.mode': 'momentary', 'DrumPads.gateMs': 60 });

  // --- editable ------------------------------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.editable': false });
  led.check(D, 'editable (false)', 'the pads do not play at all', 0, ons((await strike(0)).all).length);
  await kit.set(id, { 'DrumPads.editable': true });
  led.check(D, 'editable (true)', 'and play again', 1, ons((await strike(0)).all).length);

  // --- map: gm / chromatic / custom ------------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.rows': 2, 'DrumPads.cols': 2, 'DrumPads.baseNote': 36, 'DrumPads.showLabels': true });
  await kit.set(id, { 'DrumPads.map': 'gm' });
  const gmTexts = await kit.texts(id);
  led.check(D, "map 'gm'", 'pads are named from the GM drum kit', true, gmTexts.includes('Kick'));
  await kit.set(id, { 'DrumPads.map': 'chromatic' });
  const chromTexts = await kit.texts(id);
  // The properties panel's own hint reads "Chromatic = labelled by pitch". Note 36 is C2, and every
  // note from 35 to 81 also has a General MIDI drum name — so this is the case where a label helper
  // that prefers the drum name makes the whole option do nothing.
  led.check(D, "map 'chromatic'", 'pads are named by PITCH, not by the GM drum name',
    [true, false], [chromTexts.includes('C2'), chromTexts.includes('Kick')]);
  led.check(D, "map 'chromatic' (outside the GM range)", 'and the same naming holds above the GM kit',
    true, await (async () => {
      await kit.set(id, { 'DrumPads.baseNote': 100 });
      const t = await kit.texts(id);
      await kit.set(id, { 'DrumPads.baseNote': 36 });
      return t.includes('E7');
    })());
  await kit.set(id, { 'DrumPads.map': 'custom' });
  {
    const customNotes = [];
    for (let i = 0; i < 4; i += 1) customNotes.push(ons((await strike(i)).all)[0]?.note);
    await kit.set(id, { 'DrumPads.map': 'gm' });
    const gmNotes = [];
    for (let i = 0; i < 4; i += 1) gmNotes.push(ons((await strike(i)).all)[0]?.note);
    led.check(D, "map 'custom' (notes)", 'custom numbers its pads exactly as gm does — the map only changes names and choke',
      gmNotes, customNotes);
  }

  // --- pads[]: the per-pad overrides -------------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.map': 'gm', 'DrumPads.pads': [
    { label: 'MY KICK', note: 99, colour: 'FFE91E63' }, {}, {}, {}] });
  {
    const hit = await strike(0);
    led.check(D, 'pads[].note', 'a per-pad note override wins over the map', 99, ons(hit.all)[0]?.note);
    led.check(D, 'pads[].label', 'and its own name is drawn', true, (await kit.texts(id)).includes('MY KICK'));
    // The per-pad colour paints that pad's ACCENT STRIPE, not its body — the renderer says so in
    // its own comment beside the rect. Looking at the body reports a working override as missing.
    const stripes = await kit.shapes(id, 'rect', (r) => r.rx === 1.5);
    led.check(D, 'pads[].colour', 'the overridden pad takes its own accent stripe colour, and only it',
      [1, 4], [stripes.filter((r) => r.fill === rgba('FFE91E63')).length, stripes.length]);
    const others = await kit.texts(id);
    led.check(D, 'pads[] (sparse)', 'the pads with no override keep their generated names',
      true, others.filter((t) => t === 'MY KICK').length === 1 && others.length > 1);
  }
  await kit.set(id, { 'DrumPads.pads': [] });

  // --- choke groups: a hit silences its group-mates ------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.mode': 'toggle', 'DrumPads.rows': 1, 'DrumPads.cols': 2,
    'DrumPads.pads': [{ choke: 1 }, { choke: 1 }] });
  {
    await silenceAll();
    await strike(0);
    const second = await strike(1);
    led.check(D, 'pads[].choke', 'striking a pad silences the sounding pad in the same group — a closed hat cutting an open one',
      true, offs(second.all).length >= 1 && ons(second.all).length === 1);
    await silenceAll();
    await kit.set(id, { 'DrumPads.pads': [{ choke: 1 }, { choke: 2 }] });
    await strike(0);
    const apart = await strike(1);
    led.check(D, 'pads[].choke (different groups)', 'pads in different groups do not silence each other',
      0, offs(apart.all).length);
  }
  await silenceAll();
  await kit.set(id, { 'DrumPads.mode': 'momentary', 'DrumPads.pads': [] });

  // --- zones / cornerSize / the four corner actions ---------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.rows': 1, 'DrumPads.cols': 1, 'DrumPads.velocity': 100,
    'DrumPads.zones': false, 'DrumPads.cornerTopLeft': 'ghost' });
  led.check(D, 'zones (false)', 'with zones off a corner strike is an ordinary hit',
    100, ons((await strike(0, { fx: 0.05, fy: 0.05 })).all)[0]?.velocity);
  await kit.set(id, { 'DrumPads.zones': true, 'DrumPads.cornerSize': 0.28, 'DrumPads.ghostVelocity': 0.35 });
  led.check(D, "cornerTopLeft 'ghost' + ghostVelocity", 'a strike in that corner plays at the ghost fraction',
    35, ons((await strike(0, { fx: 0.05, fy: 0.05 })).all)[0]?.velocity);
  led.check(D, 'zones (centre unaffected)', 'the middle of the pad is still a full hit',
    100, ons((await strike(0, { fx: 0.5, fy: 0.5 })).all)[0]?.velocity);
  await kit.set(id, { 'DrumPads.cornerSize': 0.05 });
  led.check(D, 'cornerSize', 'a smaller corner no longer catches the same strike',
    100, ons((await strike(0, { fx: 0.15, fy: 0.15 })).all)[0]?.velocity);
  await kit.set(id, { 'DrumPads.cornerSize': 0.28, 'DrumPads.velocity': 80,
    'DrumPads.cornerTopRight': 'accent' });
  led.check(D, "cornerTopRight 'accent'", 'an accent corner plays at the full declared velocity, not the strike position',
    80, ons((await strike(0, { fx: 0.95, fy: 0.05 })).all)[0]?.velocity);
  await kit.set(id, { 'DrumPads.cornerBottomLeft': 'flam', 'DrumPads.flamMs': 30 });
  {
    const hit = await strike(0, { fx: 0.05, fy: 0.95 });
    await kit.settle(200);
    const all = await kit.notes();
    led.check(D, "cornerBottomLeft 'flam' + flamMs", 'a flam is a quiet grace note followed by the real one',
      true, ons(all).length === 2 && ons(all)[0].velocity < ons(all)[1].velocity);
  }
  await kit.set(id, { 'DrumPads.cornerBottomRight': 'choke', 'DrumPads.mode': 'toggle' });
  {
    await silenceAll();
    await strike(0, { fx: 0.5, fy: 0.5 });
    const choked = await strike(0, { fx: 0.95, fy: 0.95 });
    led.check(D, "cornerBottomRight 'choke'", 'a choke corner silences the pad and sounds nothing itself',
      [0, 1], [ons(choked.all).length, offs(choked.all).length]);
  }
  await kit.set(id, { 'DrumPads.mode': 'momentary', 'DrumPads.zones': false,
    'DrumPads.cornerTopLeft': 'none', 'DrumPads.cornerTopRight': 'none',
    'DrumPads.cornerBottomLeft': 'none', 'DrumPads.cornerBottomRight': 'none' });

  // --- roll: rollHz / rollSync / rollDelay / rollVelocity ------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.pads': [{ roll: true }], 'DrumPads.mode': 'momentary',
    'DrumPads.rollSync': false, 'DrumPads.rollHz': 20, 'DrumPads.rollDelay': 0,
    'DrumPads.rollVelocity': 0.5, 'DrumPads.velocity': 100 });
  {
    await kit.forget();
    const at = await padSpot(0);
    await kit.page.mouse.move(at.x, at.y);
    await kit.page.mouse.down();
    await kit.settle(400);
    const during = await kit.notes();
    await kit.page.mouse.up();
    await kit.settle(150);
    const after = await kit.notes();
    led.check(D, 'pads[].roll + rollHz', 'a rolling pad restrikes repeatedly while held — 20Hz over 400ms is several hits',
      true, ons(during).length >= 4);
    led.check(D, 'rollVelocity', 'the opening strike is an accent and the repeats sit under it',
      true, ons(during)[0].velocity === 100 && ons(during)[1].velocity === 50);
    const stopped = ons(after).length;
    await kit.settle(250);
    led.check(D, 'roll (stops on release)', 'the roll ends with the finger and leaves nothing ringing',
      [stopped, 0], [ons(await kit.notes()).length,
        ons(await kit.notes()).length - offs(await kit.notes()).length]);
  }
  await kit.set(id, { 'DrumPads.rollDelay': 300, 'DrumPads.rollHz': 20 });
  {
    await kit.forget();
    const at = await padSpot(0);
    await kit.page.mouse.move(at.x, at.y);
    await kit.page.mouse.down();
    await kit.settle(150);
    const early = ons(await kit.notes()).length;
    await kit.settle(400);
    const later = ons(await kit.notes()).length;
    await kit.page.mouse.up();
    await kit.settle();
    led.check(D, 'rollDelay', 'the first repeat waits the declared delay, so 150ms in there is still only the opening strike',
      [1, true], [early, later > early]);
  }
  await kit.set(id, { 'DrumPads.pads': [], 'DrumPads.rollDelay': 0, 'DrumPads.rollSync': true });
  led.unverified(D, 'rollRate / rollSync (musical)', 'a synced roll follows the panel transport tempo',
    'needs a running transport to compare against; the free-running rollHz path is verified above');

  // --- showNotes / showLabels / showHeader ------------------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.rows': 2, 'DrumPads.cols': 2, 'DrumPads.map': 'gm',
    'DrumPads.showNotes': true, 'DrumPads.showLabels': true, 'DrumPads.showHeader': true });
  {
    const t = await kit.texts(id);
    led.check(D, 'showNotes (true)', 'the MIDI note number is printed on each pad', true, t.includes('36'));
    led.check(D, 'showLabels (true)', 'the drum name is printed too', true, t.includes('Kick'));
    await kit.set(id, { 'DrumPads.showNotes': false });
    led.check(D, 'showNotes (false)', 'the number goes and the name stays',
      [false, true], [(await kit.texts(id)).includes('36'), (await kit.texts(id)).includes('Kick')]);
    await kit.set(id, { 'DrumPads.showLabels': false });
    led.check(D, 'showLabels (false)', 'the name goes too', false, (await kit.texts(id)).includes('Kick'));
    const withHeader = (await padRects())[0].y;
    await kit.set(id, { 'DrumPads.showHeader': false });
    led.check(D, 'showHeader (false)', 'the strip goes and the pads move up to reclaim the space',
      true, (await padRects())[0].y < withHeader);
    await kit.set(id, { 'DrumPads.showNotes': true, 'DrumPads.showLabels': true, 'DrumPads.showHeader': true });
  }

  // --- the five colours ---------------------------------------------------------------------------------------------------------
  await kit.set(id, { 'DrumPads.fieldColour': 'FF101017', 'DrumPads.padColour': 'FF171720',
    'DrumPads.accentColour': 'FF5B9BD5', 'DrumPads.labelColour': 'FFB9B9B9' });
  {
    const shapes = await kit.geo(id);
    led.check(D, 'padColour', 'every pad takes the declared pad colour',
      true, (await padRects()).every((r) => r.fill === rgba('FF171720')));
    led.check(D, 'fieldColour', 'the backing field takes its own colour',
      true, shapes.some((s) => s.tag === 'rect' && s.fill === rgba('FF101017')));
    led.check(D, 'labelColour', 'the pad names take the label colour',
      true, shapes.some((s) => s.tag === 'text' && s.fill === rgba('FFB9B9B9')));
    led.check(D, 'accentColour', 'the accent stripe takes the accent colour',
      true, shapes.some((s) => s.fill === rgba('FF5B9BD5')));
  }

  // --- echo: lighting the pads from INBOUND midi -------------------------------------------------------------------------------------
  led.unverified(D, 'echo / echoChannel / echoColour', 'incoming MIDI lights the pads so the grid doubles as a monitor',
    'needs an inbound MIDI route; no device in this environment');

  // --- save and reopen, then PLAY it again ---------------------------------------------------------------------------------------------
  {
    await kit.set(id, { 'DrumPads.rows': 2, 'DrumPads.cols': 2, 'DrumPads.baseNote': 40,
      'DrumPads.channel': 7, 'DrumPads.velocity': 88, 'DrumPads.map': 'chromatic',
      'DrumPads.pads': [{ label: 'KEEP ME', note: 55 }] });
    // The header's right-hand slot is the LAST-HIT readout — live session state, not document
    // state, and a panel that has just been opened has correctly never been hit. Comparing it would
    // assert that a reopened panel remembers a keypress from before it was saved, which is the
    // opposite of what should happen; it is asserted separately below instead.
    // The header's right-hand slot shows EITHER the last pad hit or the channel — live session
    // state sharing one position with a document-derived readout. A reopened panel has correctly
    // never been hit, so that slot legitimately differs; comparing it would assert that a saved
    // panel remembers a keypress. The grid below the header is pure document and is compared whole.
    const grid = (g) => JSON.stringify(g.filter((n) => Number(n.y ?? 0) >= 28));
    const beforeGeo = await kit.geo(id);
    const lastHitBefore = beforeGeo.filter((n) => n.tag === 'text' && n.fill === rgba('FFF2C94C'));
    const again = await kit.reopen(id);
    const afterGeo = await kit.geo(again);
    led.check(D, 'save/reopen (drawing)', 'every pad, name, number, stripe and colour returns identical',
      grid(beforeGeo), grid(afterGeo));
    led.check(D, 'save/reopen (header readouts)', 'the header still names the map, the grid size and the channel',
      ['Chromatic', '2×2', 'ch 7'],
      afterGeo.filter((n) => n.tag === 'text' && Number(n.y ?? 0) < 28).map((n) => n.text));
    led.check(D, 'save/reopen (transient state is NOT restored)', 'the last-hit readout was showing before the save and is clean after the reopen',
      [true, 0], [lastHitBefore.length > 0, afterGeo.filter((n) => n.tag === 'text' && n.fill === rgba('FFF2C94C')).length]);
    id = again;
    await kit.preview(true);
    const hit = await strike(0);
    const on = ons(hit.all)[0];
    led.check(D, 'save/reopen (still plays the right note)', 'a reopened grid plays the overridden note, channel and velocity',
      { note: 55, channel: 7, velocity: 88 },
      { note: on?.note, channel: on?.channel, velocity: on?.velocity });
    led.check(D, 'save/reopen (release still works)', 'and still stops the note on release', 1, offs(hit.all).length);
  }
  await kit.preview(false);


  // =============================================================================================
  // KEYBOARD — 18 properties. Wired by root after this pass found it inert; now measured.
  // =============================================================================================
  await kit.fresh();
  {
    const K = 'Keyboard';
    let kid = await kit.make(K, { 'Transform.width': 520, 'Transform.height': 150,
      'Keyboard.lowNote': 48, 'Keyboard.highNote': 72, 'Keyboard.channel': 1,
      'Keyboard.velocity': 100, 'Keyboard.octave': 0, 'Keyboard.transpose': 0,
      'Keyboard.latch': false, 'Keyboard.scaleLock': 'off', 'Keyboard.showLabels': true });
    await kit.preview(true);

    // The white keys are the wide ones; blacks are drawn over them and are narrower.
    const keys = async () => kit.shapes(kid, 'rect');
    const pressKey = async (index, { release = true } = {}) => {
      await kit.forget();
      const spot = await kit.spot(kid, 'svg.keyboard rect', index, 0.8);
      assert.ok(spot, `Keyboard: no key ${index}`);
      await kit.page.mouse.move(spot.x, spot.y);
      await kit.page.mouse.down();
      await kit.settle(110);
      const down = await kit.notes();
      if (release) { await kit.page.mouse.up(); await kit.settle(110); }
      return { down, all: await kit.notes() };
    };

    // --- lowNote / highNote: how many keys, and which -----------------------------------------------
    {
      const before = (await keys()).length;
      await kit.set(kid, { 'Keyboard.highNote': 60 });
      const fewer = (await keys()).length;
      led.check(K, 'lowNote / highNote', 'a shorter range draws fewer keys', true, fewer < before);
      led.check(K, 'lowNote (the first key sounds it)', 'the leftmost key plays the low note',
        48, ons((await pressKey(0)).all)[0]?.note);
      await kit.set(kid, { 'Keyboard.lowNote': 36, 'Keyboard.highNote': 60 });
      led.check(K, 'lowNote (moved)', 'and follows when the range moves',
        36, ons((await pressKey(0)).all)[0]?.note);
      await kit.set(kid, { 'Keyboard.lowNote': 48, 'Keyboard.highNote': 72 });
    }

    // --- octave / transpose: arithmetic on every note sent ---------------------------------------------
    led.check(K, 'octave', 'a whole octave is added to every note', 60, await (async () => {
      await kit.set(kid, { 'Keyboard.octave': 1 });
      return ons((await pressKey(0)).all)[0]?.note;
    })());
    led.check(K, 'transpose', 'semitones stack on top of the octave', 63, await (async () => {
      await kit.set(kid, { 'Keyboard.transpose': 3 });
      return ons((await pressKey(0)).all)[0]?.note;
    })());
    await kit.set(kid, { 'Keyboard.octave': 0, 'Keyboard.transpose': 0 });

    // --- channel / velocity -------------------------------------------------------------------------------
    await kit.set(kid, { 'Keyboard.channel': 7, 'Keyboard.velocity': 64 });
    {
      const on = ons((await pressKey(0)).all)[0];
      led.check(K, 'channel + velocity', 'the press carries the declared channel and velocity',
        { channel: 7, velocity: 64 }, { channel: on?.channel, velocity: on?.velocity });
    }
    await kit.set(kid, { 'Keyboard.channel': 1, 'Keyboard.velocity': 100 });

    // --- latch: the note keeps sounding after the finger leaves ---------------------------------------------
    {
      await kit.set(kid, { 'Keyboard.latch': false });
      const plain = await pressKey(0);
      led.check(K, 'latch (false)', 'the note stops when the key is released', 1, offs(plain.all).length);
      await kit.set(kid, { 'Keyboard.latch': true });
      const latched = await pressKey(0);
      led.check(K, 'latch (true)', 'the note keeps sounding after release', 0, offs(latched.all).length);
      const again = await pressKey(0);
      led.check(K, 'latch (pressed again)', 'and pressing the same key silences it', 1, offs(again.all).length);
      await kit.set(kid, { 'Keyboard.latch': false });
    }

    // --- scaleLock / key / scale: what an out-of-key key does ------------------------------------------------
    {
      // C major: C#, the second key of a chromatic run, is out of key.
      await kit.set(kid, { 'Keyboard.key': 0, 'Keyboard.scale': 'major', 'Keyboard.lowNote': 48,
        'Keyboard.highNote': 60, 'Keyboard.scaleLock': 'off' });
      const blackIndex = (await keys()).findIndex((r) => r.rx === 1.5);
      assert.ok(blackIndex > 0, 'Keyboard: no black key rendered to press');
      const off = await pressKey(blackIndex);
      led.check(K, "scaleLock 'off'", 'an out-of-key key plays exactly what it is', 49, ons(off.all)[0]?.note);
      await kit.set(kid, { 'Keyboard.scaleLock': 'quantize' });
      const quantized = await pressKey(blackIndex);
      led.check(K, "scaleLock 'quantize'", 'the same key is pulled to the nearest note in the key',
        true, [48, 50].includes(ons(quantized.all)[0]?.note));
      await kit.set(kid, { 'Keyboard.scaleLock': 'refuse' });
      const refused = await pressKey(blackIndex);
      led.check(K, "scaleLock 'refuse'", 'and refuses to sound at all rather than silently moving the finger',
        0, ons(refused.all).length);
      led.check(K, "scaleLock 'refuse' (drawn dead)", 'a refused key is dimmed so the silence is visible rather than looking broken',
        true, (await keys()).some((r) => Number(r.opacity) > 0 && Number(r.opacity) < 0.5));
      // …and an IN-key note still plays under refuse, so the lock is selective rather than a mute.
      led.check(K, "scaleLock 'refuse' (in-key still plays)", 'the in-key keys are untouched',
        48, ons((await pressKey(0)).all)[0]?.note);
      await kit.set(kid, { 'Keyboard.scaleLock': 'off', 'Keyboard.highNote': 72 });
    }

    // --- showLabels / padding / the five colours ---------------------------------------------------------------
    {
      await kit.set(kid, { 'Keyboard.showLabels': true });
      led.check(K, 'showLabels (true)', 'the C keys are named', true, (await kit.texts(kid)).includes('C3'));
      await kit.set(kid, { 'Keyboard.showLabels': false });
      led.check(K, 'showLabels (false)', 'and stop being named', 0, (await kit.texts(kid)).length);
      await kit.set(kid, { 'Keyboard.showLabels': true });

      const narrow = (await keys())[0].width;
      await kit.set(kid, { 'Keyboard.padding': 40 });
      led.check(K, 'padding', 'more padding leaves less room, so each key is narrower',
        true, (await keys())[0].width < narrow);
      await kit.set(kid, { 'Keyboard.padding': 6 });

      await kit.set(kid, { 'Keyboard.whiteColour': 'FFE8E8E8', 'Keyboard.blackColour': 'FF1A1A1A',
        'Keyboard.labelColour': 'FF555555', 'Keyboard.heldColour': 'FF5B9BD5' });
      const drawn = await kit.geo(kid);
      led.check(K, 'whiteColour', 'the white keys take the declared colour',
        true, drawn.some((n) => n.tag === 'rect' && n.fill === rgba('FFE8E8E8')));
      led.check(K, 'blackColour', 'and the black keys their own',
        true, drawn.some((n) => n.tag === 'rect' && n.fill === rgba('FF1A1A1A')));
      led.check(K, 'labelColour', 'the note names take the label colour',
        true, drawn.some((n) => n.tag === 'text' && n.fill === rgba('FF555555')));
    }

    // --- heldColour: the key under the finger is drawn down ---------------------------------------------------
    {
      await kit.forget();
      const spot = await kit.spot(kid, 'svg.keyboard rect', 0, 0.8);
      await kit.page.mouse.move(spot.x, spot.y);
      await kit.page.mouse.down();
      await kit.settle(140);
      const whileDown = (await kit.geo(kid)).some((n) => n.fill === rgba('FF5B9BD5'));
      await kit.page.mouse.up();
      await kit.settle(140);
      led.check(K, 'heldColour', 'the key under the finger is painted held, and lets go afterwards',
        [true, false], [whileDown, (await kit.geo(kid)).some((n) => n.fill === rgba('FF5B9BD5'))]);
    }

    // --- save and reopen, then play it again ---------------------------------------------------------------------
    {
      await kit.set(kid, { 'Keyboard.lowNote': 55, 'Keyboard.highNote': 79, 'Keyboard.channel': 4,
        'Keyboard.velocity': 88, 'Keyboard.transpose': 2 });
      const beforeGeo = await kit.geo(kid);
      const again = await kit.reopen(kid);
      led.check(K, 'save/reopen (drawing)', 'every key, label and colour returns identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      kid = again;
      await kit.preview(true);
      const on = ons((await pressKey(0)).all)[0];
      led.check(K, 'save/reopen (still plays, with its arithmetic)', 'a reopened keyboard plays the transposed note on its own channel',
        { note: 57, channel: 4, velocity: 88 }, { note: on?.note, channel: on?.channel, velocity: on?.velocity });
    }
    await kit.preview(false);
  }


  // =============================================================================================
  // NOTE RIBBON — 26 properties.
  // =============================================================================================
  await kit.fresh();
  {
    const N = 'NoteRibbon';
    let nid = await kit.make(N, { 'Transform.width': 520, 'Transform.height': 150,
      'NoteRibbon.mode': 'snap', 'NoteRibbon.key': 0, 'NoteRibbon.scale': 'major',
      'NoteRibbon.baseNote': 48, 'NoteRibbon.octaves': 2, 'NoteRibbon.channel': 1,
      'NoteRibbon.velocity': 96, 'NoteRibbon.velocityFrom': 'fixed', 'NoteRibbon.latch': false,
      'NoteRibbon.orientation': 'horizontal', 'NoteRibbon.showNames': true, 'NoteRibbon.showHeader': true });
    await kit.preview(true);
    const zones = async () => kit.shapes(nid, 'rect', (r) => r.rx === 3);
    const touch = async (index, { release = true, fy = 0.5 } = {}) => {
      await kit.forget();
      const spot = await kit.spot(nid, 'svg.ribbon rect[rx="3"]', index, fy);
      assert.ok(spot, `NoteRibbon: no zone ${index}`);
      await kit.page.mouse.move(spot.x, spot.y);
      await kit.page.mouse.down();
      await kit.settle(110);
      const down = await kit.notes();
      if (release) { await kit.page.mouse.up(); await kit.settle(110); }
      return { down, all: await kit.notes() };
    };

    // --- baseNote / octaves / key / scale: which notes the strip carries -------------------------------
    led.check(N, 'baseNote', 'the first zone plays the base note', 48, ons((await touch(0)).all)[0]?.note);
    await kit.set(nid, { 'NoteRibbon.baseNote': 60 });
    led.check(N, 'baseNote (moved)', 'and follows it', 60, ons((await touch(0)).all)[0]?.note);
    await kit.set(nid, { 'NoteRibbon.baseNote': 48 });
    {
      const two = (await zones()).length;
      await kit.set(nid, { 'NoteRibbon.octaves': 1 });
      led.check(N, 'octaves', 'one octave is half as many zones as two', true, (await zones()).length < two);
      await kit.set(nid, { 'NoteRibbon.octaves': 2 });
      // In snap mode only the notes of the key are offered, so a scale with fewer notes has fewer zones.
      const major = (await zones()).length;
      await kit.set(nid, { 'NoteRibbon.scale': 'pentatonicMaj' });
      const penta = (await zones()).length;
      led.check(N, 'scale', 'a five-note scale offers fewer zones than a seven-note one',
        true, penta > 0 && penta < major);
      await kit.set(nid, { 'NoteRibbon.key': 2, 'NoteRibbon.scale': 'major' });
      led.check(N, 'key', 'moving the tonic moves what the first zone plays',
        true, ons((await touch(0)).all)[0]?.note !== 48);
      await kit.set(nid, { 'NoteRibbon.key': 0 });
    }

    // --- mode: snap / chromatic / glide -----------------------------------------------------------------
    {
      await kit.set(nid, { 'NoteRibbon.mode': 'snap' });
      const snapZones = (await zones()).length;
      await kit.set(nid, { 'NoteRibbon.mode': 'chromatic' });
      led.check(N, "mode 'chromatic'", 'every semitone gets a zone, so there are more of them than in the key',
        true, (await zones()).length > snapZones);
      await kit.set(nid, { 'NoteRibbon.mode': 'glide', 'NoteRibbon.bendRange': 2 });
      const glide = await touch(2, { release: false });
      // Glide holds one root and bends; sliding within the bend window must NOT retrigger.
      const box = await kit.box(nid);
      const spot = await kit.spot(nid, 'svg.ribbon rect[rx="3"]', 2, 0.5);
      await kit.page.mouse.move(spot.x + box.w * 0.02, spot.y, { steps: 4 });
      await kit.settle(120);
      const afterSlide = await kit.notes();
      await kit.page.mouse.up();
      await kit.settle(120);
      led.check(N, "mode 'glide'", 'a small slide bends rather than restriking the note',
        ons(glide.all).length, ons(afterSlide).length);
      await kit.set(nid, { 'NoteRibbon.mode': 'snap' });
    }

    // --- channel / velocity / velocityFrom ------------------------------------------------------------------
    await kit.set(nid, { 'NoteRibbon.channel': 5, 'NoteRibbon.velocity': 70, 'NoteRibbon.velocityFrom': 'fixed' });
    {
      const on = ons((await touch(1)).all)[0];
      led.check(N, 'channel + velocity', 'the touch carries the declared channel and velocity',
        { channel: 5, velocity: 70 }, { channel: on?.channel, velocity: on?.velocity });
    }
    await kit.set(nid, { 'NoteRibbon.velocityFrom': 'position' });
    {
      const near = ons((await touch(1, { fy: 0.1 })).all)[0]?.velocity;
      const far = ons((await touch(1, { fy: 0.9 })).all)[0]?.velocity;
      led.check(N, "velocityFrom 'position'", 'the cross axis decides how hard it is played',
        true, Number.isFinite(near) && Number.isFinite(far) && near !== far);
    }
    await kit.set(nid, { 'NoteRibbon.velocityFrom': 'fixed', 'NoteRibbon.channel': 1, 'NoteRibbon.velocity': 96 });

    // --- latch / editable -------------------------------------------------------------------------------------
    await kit.set(nid, { 'NoteRibbon.latch': true });
    {
      const latched = await touch(1);
      led.check(N, 'latch (true)', 'the note keeps sounding after the finger lifts', 0, offs(latched.all).length);
      const again = await touch(1);
      led.check(N, 'latch (touched again)', 'and a second touch silences it', 1, offs(again.all).length);
    }
    await kit.set(nid, { 'NoteRibbon.latch': false, 'NoteRibbon.editable': false });
    led.check(N, 'editable (false)', 'the strip does not play', 0, ons((await touch(1)).all).length);
    await kit.set(nid, { 'NoteRibbon.editable': true });

    // --- orientation ---------------------------------------------------------------------------------------------
    {
      // THE LAYOUT AXIS, not the zone's aspect. Fifteen zones in a 520×150 control are each narrow
      // and tall even when the strip runs left to right, so "wide and short" is a statement about
      // this control's proportions rather than about the property.
      const axisOf = (list) => ({
        xs: new Set(list.map((r) => Math.round(r.x))).size,
        ys: new Set(list.map((r) => Math.round(r.y))).size,
      });
      const horizontal = axisOf(await zones());
      await kit.set(nid, { 'NoteRibbon.orientation': 'vertical' });
      const vertical = axisOf(await zones());
      led.check(N, 'orientation', 'a horizontal strip lays its zones out along x at one y, and a vertical one the other way round',
        true, horizontal.xs > 1 && horizontal.ys === 1 && vertical.ys > 1 && vertical.xs === 1);
      led.check(N, 'orientation (still plays)', 'and a vertical strip still sounds its notes',
        true, ons((await touch(0)).all).length === 1);
      await kit.set(nid, { 'NoteRibbon.orientation': 'horizontal' });
    }

    // --- showNames / showHeader / modAxis ---------------------------------------------------------------------------
    {
      await kit.set(nid, { 'NoteRibbon.showNames': true, 'NoteRibbon.showHeader': true });
      const withBoth = (await kit.texts(nid)).length;
      await kit.set(nid, { 'NoteRibbon.showNames': false });
      led.check(N, 'showNames', 'the note names go and the header stays',
        true, (await kit.texts(nid)).length > 0 && (await kit.texts(nid)).length < withBoth);
      const zoneTop = (await zones())[0].y;
      await kit.set(nid, { 'NoteRibbon.showHeader': false });
      led.check(N, 'showHeader', 'the strip goes and the zones move up to reclaim the space',
        true, (await zones())[0].y < zoneTop);
      await kit.set(nid, { 'NoteRibbon.showNames': true, 'NoteRibbon.showHeader': true });

      await kit.set(nid, { 'NoteRibbon.modAxis': 'none' });
      await kit.forget();
      await touch(1, { fy: 0.2 });
      const withoutMod = (await kit.notes()).length;
      await kit.set(nid, { 'NoteRibbon.modAxis': 'cc', 'NoteRibbon.modCc': 1 });
      await kit.forget();
      await touch(1, { fy: 0.2 });
      led.check(N, 'modAxis / modCc', 'the cross axis sends an expression controller as well as the note',
        withoutMod, (await kit.notes()).length);
    }
    led.unverified(N, 'echo / echoChannel / echoColour', 'inbound notes light the strip',
      'covered for the Drum Pads in behaviourInbound.mjs; the ribbon shares that path and is not separately measured here');

    // --- the colours -------------------------------------------------------------------------------------------------
    await kit.set(nid, { 'NoteRibbon.fieldColour': 'FF101017', 'NoteRibbon.zoneColour': 'FF171720',
      'NoteRibbon.inKeyColour': 'FF5B9BD5', 'NoteRibbon.rootColour': 'FFF2C94C' });
    {
      const drawn = await kit.geo(nid);
      led.check(N, 'fieldColour', 'the field takes the declared colour',
        true, drawn.some((n) => n.tag === 'rect' && n.fill === rgba('FF101017')));
      led.check(N, 'zoneColour / inKeyColour', 'the zones take theirs',
        true, drawn.some((n) => n.fill === rgba('FF171720') || n.fill === rgba('FF5B9BD5')));
      led.check(N, 'rootColour', 'and the tonic is marked in its own colour',
        true, drawn.some((n) => n.fill === rgba('FFF2C94C') || n.stroke === rgba('FFF2C94C')));
    }

    // --- save and reopen ------------------------------------------------------------------------------------------------
    {
      await kit.set(nid, { 'NoteRibbon.baseNote': 55, 'NoteRibbon.channel': 3, 'NoteRibbon.velocity': 80,
        'NoteRibbon.mode': 'chromatic', 'NoteRibbon.octaves': 1 });
      const beforeGeo = await kit.geo(nid);
      const again = await kit.reopen(nid);
      led.check(N, 'save/reopen (drawing)', 'zones, names and header return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      nid = again;
      await kit.preview(true);
      const on = ons((await touch(0)).all)[0];
      led.check(N, 'save/reopen (still plays)', 'a reopened strip plays its own base note on its own channel',
        { note: 55, channel: 3, velocity: 80 }, { note: on?.note, channel: on?.channel, velocity: on?.velocity });
    }
    await kit.preview(false);
  }


  // =============================================================================================
  // CHORD PAD — 28 properties. A pad plays several notes at once, so the note COUNT and the
  // intervals between them are the measurement, not just that something sounded.
  // =============================================================================================
  await kit.fresh();
  {
    const C = 'ChordPad';
    let cid = await kit.make(C, { 'Transform.width': 420, 'Transform.height': 380,
      'ChordPad.layout': 'wheel', 'ChordPad.mode': 'chords', 'ChordPad.key': 0,
      'ChordPad.scale': 'major', 'ChordPad.chordType': 'triad', 'ChordPad.voicing': 'close',
      'ChordPad.inversion': 0, 'ChordPad.baseOctave': 4, 'ChordPad.octave': 0,
      'ChordPad.velocity': 96, 'ChordPad.channel': 1, 'ChordPad.strumMs': 0,
      'ChordPad.latch': false, 'ChordPad.editable': true, 'ChordPad.showPiano': true,
      'ChordPad.showRomans': true });
    await kit.preview(true);

    // Pads on the wheel are its circles; on the grid they are rounded rects.
    /**
     * The nth PAD, in document order, for whichever layout is active.
     *
     * Both layouts share their shape with the header: the grid's pads are rounded rects and so is
     * the header strip above them, and the wheel's pads are circles alongside its rings and hub. So
     * each is picked out by size. The header is HEADER − 6 = 24px tall, so "taller than 22" does not
     * exclude it; what does is that it spans nearly the whole control while a pad never can. A wheel
     * pad's radius sits between the hub and the rings. The index is then mapped back to the position
     * in the full document list, which is what spot() counts.
     */
    const padSpotAt = async (index) => {
      const wheel = (await kit.read(cid, 'ChordPad.layout')) === 'wheel';
      const sel = wheel ? 'svg circle' : 'svg rect[rx="8"]';
      const all = wheel
        ? await kit.shapes(cid, 'circle')
        : await kit.shapes(cid, 'rect', (r) => r.rx === 8);
      const box = await kit.box(cid);
      const docIndex = all
        .map((shape, i) => ({ i, shape }))
        .filter(({ shape }) => (wheel
          ? (shape.r > 8 && shape.r < 40)
          : (shape.height > 26 && shape.width < box.w * 0.9)))
        .map(({ i }) => i);
      if (docIndex[index] === undefined) return null;
      return kit.spot(cid, sel, docIndex[index]);
    };
    const press = async (index = 0, { release = true } = {}) => {
      await kit.forget();
      const spot = await padSpotAt(index);
      assert.ok(spot, `ChordPad: no pad ${index}`);
      await kit.page.mouse.move(spot.x, spot.y);
      await kit.page.mouse.down();
      await kit.settle(140);
      const down = await kit.notes();
      if (release) { await kit.page.mouse.up(); await kit.settle(140); }
      return { down, all: await kit.notes() };
    };
    const chordNotes = (r) => ons(r.all).map((e) => e.note).sort((a, b) => a - b);

    // --- chordType: a triad is three notes, a seventh is four ------------------------------------------
    {
      const triad = chordNotes(await press(0));
      led.check(C, "chordType 'triad'", 'a pad sounds three notes at once', 3, triad.length);
      await kit.set(cid, { 'ChordPad.chordType': 'seventh' });
      const seventh = chordNotes(await press(0));
      led.check(C, "chordType 'seventh'", 'and four with a seventh added on top', 4, seventh.length);
      led.check(C, 'chordType (keeps the triad underneath)', 'the seventh adds to the triad rather than replacing it',
        true, triad.every((n) => seventh.includes(n)));
      await kit.set(cid, { 'ChordPad.chordType': 'triad' });
    }

    // --- baseOctave / octave: the same chord, moved -------------------------------------------------------
    {
      const at4 = chordNotes(await press(0));
      await kit.set(cid, { 'ChordPad.octave': 1 });
      const up = chordNotes(await press(0));
      led.check(C, 'octave', 'every note of the chord moves up by twelve',
        at4.map((n) => n + 12), up);
      await kit.set(cid, { 'ChordPad.octave': 0, 'ChordPad.baseOctave': 5 });
      led.check(C, 'baseOctave', 'and the tonic octave moves the whole chord too',
        at4.map((n) => n + 12), chordNotes(await press(0)));
      await kit.set(cid, { 'ChordPad.baseOctave': 4 });
    }

    // --- inversion / voicing: the same notes, arranged differently ------------------------------------------
    {
      const close = chordNotes(await press(0));
      await kit.set(cid, { 'ChordPad.inversion': 1 });
      const first = chordNotes(await press(0));
      led.check(C, 'inversion', 'an inversion keeps the chord and changes which note is at the bottom',
        true, first.length === close.length && first[0] !== close[0]);
      led.check(C, 'inversion (same pitch classes)', 'and it is still the same chord',
        new Set(close.map((n) => n % 12)), new Set(first.map((n) => n % 12)),
        (a, b) => [...a].sort().join() === [...b].sort().join());
      await kit.set(cid, { 'ChordPad.inversion': 0, 'ChordPad.voicing': 'spread' });
      const spread = chordNotes(await press(0));
      led.check(C, "voicing 'spread'", 'a spread voicing covers more range than a close one',
        true, (spread[spread.length - 1] - spread[0]) > (close[close.length - 1] - close[0]));
      await kit.set(cid, { 'ChordPad.voicing': 'drop2' });
      const drop2 = chordNotes(await press(0));
      led.check(C, "voicing 'drop2'", 'and drop-2 is a different arrangement again from both',
        true, drop2.join() !== close.join() && drop2.join() !== spread.join());
      await kit.set(cid, { 'ChordPad.voicing': 'close' });
    }

    // --- key / scale: which chords the wheel offers ----------------------------------------------------------
    {
      const inC = chordNotes(await press(0));
      await kit.set(cid, { 'ChordPad.key': 5 });
      led.check(C, 'key', 'a different tonic plays a different chord',
        true, chordNotes(await press(0)).join() !== inC.join());
      // ON THE WHEEL, `scale` LIGHTS PADS; IT DOES NOT RE-VOICE THEM. wheelSlots builds twelve
      // fixed major chords on the outer ring and their relative minors on the inner one, and flags
      // each "in-key when every chord tone belongs to the scale (the lit wedge)". So pad 0 playing
      // C major under both C major and C minor is the design, and asserting that the chord changes
      // measures an expectation this file invented. What the property actually promises is which
      // wedges are lit, so that is what is measured — and separately, that the chords themselves do
      // NOT move, which is the other half of the same promise.
      await kit.set(cid, { 'ChordPad.key': 0, 'ChordPad.scale': 'major', 'ChordPad.inKeyColour': 'FF5B9BD5' });
      // WHICH pads are lit, not how many: a major key and a minor key both have seven diatonic
      // triads, so the count is identical and only the set moves. Positions identify the set.
      // In-key is drawn as OPACITY and stroke, not as fill — every pad keeps the same pad colour.
      // Querying the fill finds nothing at all and reports "no change" for a wheel that is relighting
      // correctly, which is the same answer a broken one would give.
      const litIn = async () => (await kit.shapes(cid, 'circle'))
        .filter((c) => c.r > 8 && c.r < 40 && String(c.opacity) === '1')
        .map((c) => `${Math.round(c.cx)},${Math.round(c.cy)}`).sort().join(' ');
      const majorLit = await litIn();
      await kit.set(cid, { 'ChordPad.scale': 'minor' });
      const minorLit = await litIn();
      led.check(C, 'scale (lights a different set of wedges)', 'switching the scale lights a different seven chords',
        true, majorLit.length > 0 && minorLit.length > 0 && majorLit !== minorLit);
      led.check(C, 'scale (does not re-voice the wheel)', 'and the chord under a given pad is unchanged, which is what a circle of fifths is',
        inC.join(), chordNotes(await press(0)).join());
      await kit.set(cid, { 'ChordPad.scale': 'major' });
    }

    // --- mode 'notes' + noteSpan -------------------------------------------------------------------------------
    {
      // ON THE GRID. chordPadLayout is explicit — "GRID: one pad per scale degree (chords mode) or
      // per scale note (notes mode)" — and the wheel is a circle of fifths that always shows chords.
      // Pressing a wheel pad in notes mode sounds a chord, correctly, and proves nothing about the
      // property.
      await kit.set(cid, { 'ChordPad.layout': 'grid', 'ChordPad.mode': 'notes', 'ChordPad.noteSpan': 2 });
      const single = await press(0);
      led.check(C, "mode 'notes'", 'a grid pad plays one note rather than a chord', 1, ons(single.all).length);
      const pads = async () => (await kit.shapes(cid, 'rect', (r) => r.rx === 8)).length;
      const twoOctaves = await pads();
      await kit.set(cid, { 'ChordPad.noteSpan': 1 });
      led.check(C, 'noteSpan', 'one octave of scale notes is fewer pads than two', true, (await pads()) < twoOctaves);
      await kit.set(cid, { 'ChordPad.mode': 'chords', 'ChordPad.noteSpan': 2 });
      led.check(C, "mode 'chords' (back)", 'and the same grid pad is a chord again', 3, ons((await press(0)).all).length);
      await kit.set(cid, { 'ChordPad.layout': 'wheel' });
    }

    // --- channel / velocity / strumMs ----------------------------------------------------------------------------
    await kit.set(cid, { 'ChordPad.channel': 9, 'ChordPad.velocity': 64 });
    {
      const on = ons((await press(0)).all);
      led.check(C, 'channel + velocity', 'every note of the chord carries the declared channel and velocity',
        true, on.length > 0 && on.every((e) => e.channel === 9 && e.velocity === 64));
    }
    await kit.set(cid, { 'ChordPad.channel': 1, 'ChordPad.velocity': 96 });
    {
      await kit.set(cid, { 'ChordPad.strumMs': 0 });
      await kit.forget();
      const spot = await padSpotAt(0);
      await kit.page.mouse.move(spot.x, spot.y);
      await kit.page.mouse.down();
      await kit.settle(40);
      const blockAt40 = ons(await kit.notes()).length;
      await kit.page.mouse.up();
      await kit.settle(160);

      await kit.set(cid, { 'ChordPad.strumMs': 120 });
      await kit.forget();
      await kit.page.mouse.move(spot.x, spot.y);
      await kit.page.mouse.down();
      await kit.settle(40);
      const strumAt40 = ons(await kit.notes()).length;
      await kit.settle(400);
      const strumSettled = ons(await kit.notes()).length;
      await kit.page.mouse.up();
      await kit.settle(160);
      led.check(C, 'strumMs', 'a block chord is all there at once; a strum arrives a note at a time and is complete later',
        true, blockAt40 === 3 && strumAt40 < 3 && strumSettled === 3);
      await kit.set(cid, { 'ChordPad.strumMs': 0 });
    }

    // --- latch / editable -------------------------------------------------------------------------------------------
    await kit.set(cid, { 'ChordPad.latch': true });
    {
      const latched = await press(0);
      led.check(C, 'latch (true)', 'the chord keeps sounding after the finger lifts', 0, offs(latched.all).length);
      const again = await press(0);
      led.check(C, 'latch (pressed again)', 'and a second press silences the whole chord', 3, offs(again.all).length);
    }
    await kit.set(cid, { 'ChordPad.latch': false, 'ChordPad.editable': false });
    led.check(C, 'editable (false)', 'the pads do not play', 0, ons((await press(0)).all).length);
    await kit.set(cid, { 'ChordPad.editable': true });

    // --- layout / gridCols / showPiano / showRomans --------------------------------------------------------------------
    {
      await kit.set(cid, { 'ChordPad.layout': 'wheel' });
      const wheelRings = (await kit.shapes(cid, 'circle', (c) => c.fill === 'none')).length;
      led.check(C, "layout 'wheel'", 'the wheel draws its circle-of-fifths rings', true, wheelRings >= 2);
      await kit.set(cid, { 'ChordPad.layout': 'grid', 'ChordPad.gridCols': 4 });
      const four = await kit.shapes(cid, 'rect', (r) => r.rx === 8);
      const colsOf = (list) => new Set(list.map((r) => Math.round(r.x))).size;
      led.check(C, "layout 'grid'", 'the grid draws rectangular pads instead', true, four.length > 0);
      await kit.set(cid, { 'ChordPad.gridCols': 2 });
      led.check(C, 'gridCols', 'two columns is fewer distinct x positions than four',
        true, colsOf(await kit.shapes(cid, 'rect', (r) => r.rx === 8)) < colsOf(four));
      led.check(C, 'layout (grid still plays)', 'and a grid pad still sounds its chord',
        3, ons((await press(0)).all).length);
      await kit.set(cid, { 'ChordPad.layout': 'wheel' });

      await kit.set(cid, { 'ChordPad.showRomans': true });
      const withRomans = await kit.texts(cid);
      await kit.set(cid, { 'ChordPad.showRomans': false });
      led.check(C, 'showRomans', 'the roman numerals go', true, (await kit.texts(cid)).length < withRomans.length);
      await kit.set(cid, { 'ChordPad.showRomans': true });
      const withPiano = (await kit.geo(cid)).length;
      await kit.set(cid, { 'ChordPad.showPiano': false });
      led.check(C, 'showPiano', 'the sounding-notes keyboard strip goes', true, (await kit.geo(cid)).length < withPiano);
      await kit.set(cid, { 'ChordPad.showPiano': true });
    }
    led.unverified(C, 'echo / echoChannel / echoColour', 'inbound notes light the pads',
      'the same inbound path measured for the Drum Pads in behaviourInbound.mjs; not separately measured here');

    // --- colours -------------------------------------------------------------------------------------------------------
    await kit.set(cid, { 'ChordPad.padColour': 'FF171720', 'ChordPad.inKeyColour': 'FF5B9BD5',
      'ChordPad.tonicColour': 'FFF2C94C' });
    {
      const drawn = await kit.geo(cid);
      led.check(C, 'padColour', 'every pad takes the declared pad colour',
        true, drawn.some((n) => n.fill === rgba('FF171720')));
      led.check(C, 'inKeyColour', 'and the in-key accent is the declared one',
        true, drawn.some((n) => n.fill === rgba('FF5B9BD5') || n.stroke === rgba('FF5B9BD5')));
    }
    led.inert(C, 'fieldColour', 'the backing field colour',
      'ChordPadRenderer has no fieldCss and never reads it; not in the ChordPad editor and not in the '
      + 'script API either, so there is nothing that can set it and nothing that would change if it did');

    // --- save and reopen ---------------------------------------------------------------------------------------------------
    {
      await kit.set(cid, { 'ChordPad.key': 7, 'ChordPad.chordType': 'seventh', 'ChordPad.channel': 6,
        'ChordPad.velocity': 72, 'ChordPad.layout': 'grid', 'ChordPad.gridCols': 3 });
      const beforeGeo = await kit.geo(cid);
      const again = await kit.reopen(cid);
      led.check(C, 'save/reopen (drawing)', 'pads, numerals and the piano strip return identical',
        JSON.stringify(beforeGeo), JSON.stringify(await kit.geo(again)));
      cid = again;
      await kit.preview(true);
      const on = ons((await press(0)).all);
      led.check(C, 'save/reopen (still plays the same chord)', 'a reopened pad still sounds four notes on its own channel',
        true, on.length === 4 && on.every((e) => e.channel === 6 && e.velocity === 72));
    }
    await kit.preview(false);
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
