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

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
