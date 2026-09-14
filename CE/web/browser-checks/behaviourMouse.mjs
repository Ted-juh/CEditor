/**
 * behaviourMouse.mjs — the Mouse section, which the coverage matrix found entirely unreached.
 *
 * Thirteen declared properties and not one of them named by a check. They decide what a finished
 * panel does under the pointer: which of two overlapping controls takes a click, whether a frame is
 * transparent, whether a click raises a control above its neighbours, where the keyboard can reach,
 * how far a drag moves a value and which way.
 *
 * FOUR THINGS SHAPE EVERY ROW HERE.
 *
 * The section applies in PREVIEW ONLY — `mouseAppliesToSurface` is `editorInteractionEnabled ===
 * false` — and the reason is written at its definition: in the editor these properties would fight
 * the tools you edit with. `interceptClicks: false` would make a control unselectable and an
 * ellipse hit shape would clip its own resize handles. So every fixture below enters preview, and a
 * row that checked the editor would be checking the wrong surface.
 *
 * The section exists on FIVE of the fifty-eight component types — Range, Number, Slider, Knob and
 * CustomComponent — and `createControl` builds only the sections a type declares. A write to
 * `Mouse.cursor` on a Label is silently dropped, because there is no section to write it into. The
 * first block below measures that rather than assuming it, and every other fixture here is one of
 * the five.
 *
 * The interesting pointer rows are only visible with a SECOND CONTROL to lose the click to. "Does
 * this control still respond" cannot distinguish a pointer that passed through from one that was
 * never sent; two overlapping sliders can, because exactly one of them moves.
 *
 * And the drag half reaches the surface THROUGH THE WHOLE SECTION, not by name. The surface passes
 * `dragMouse` into `createSliderTrackScrub`, and `mouseScrubOverrides` reads the keys off it — so a
 * search for `dragSensitivity` in the surface finds nothing and the matrix reports it unreached.
 * The properties are live; the reader is indirect. Same shape as the drum pads' corner fields,
 * which are built by concatenation.
 *
 * TWO FIXTURE TRAPS, both of which cost real time here:
 *
 * - `Transform.y` much beyond 240 puts a control's screen row under the editor chrome at this
 *   viewport, and a press there lands on the chrome instead. It reads as a dead property — this is
 *   the third suite it has caught. Every fixture below stays in the top band of the canvas.
 * - `Behavior.defaultValue` does NOT clear a preview session's `valueOverride` once a drag has
 *   written one. Re-authoring the default to "reset" a control between two drags measures the old
 *   value. Each drag comparison below therefore gets its OWN control, and they are compared by
 *   where they LAND rather than by how far they appear to have moved.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('mouse');
const M = 'Mouse';

/** The live value of a range control, as the preview session holds it. */
const valueOf = async (id) => (await kit.session(id))?.valueOverride ?? null;
/** One resolved CSS property of the control's own element. */
const styleOf = (id, prop) => kit.page.evaluate(({ id, prop }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;
}, { id, prop });
/** One attribute of the control's own element. */
const attrOf = (id, name) => kit.page.evaluate(({ id, name }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return el ? el.getAttribute(name) : null;
}, { id, name });
/** Whether the control's element carries a class. */
const hasClass = (id, cls) => kit.page.evaluate(({ id, cls }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return el ? el.classList.contains(cls) : null;
}, { id, cls });

/**
 * Press and release without moving, at a fraction along the control: what it does on contact alone.
 *
 * The fraction is what separates the two mappings. A press dead centre lands on a half either way —
 * an absolute track because the middle of the track IS a half, a relative one because that is where
 * an untouched slider already sits — so it proves nothing. A press at a fifth does: the absolute
 * track goes there and the relative one does not move.
 */
const tapAt = async (id, fx = 0.5) => {
  const before = await valueOf(id);
  const b = await kit.box(id);
  await kit.page.mouse.move(b.x + b.w * fx, b.y + b.h / 2);
  await kit.page.mouse.down();
  await kit.settle(120);
  await kit.page.mouse.up();
  await kit.settle(300);
  return { before, after: await valueOf(id) };
};

/** A drag of a fixed pixel distance from the control's centre. */
const nudge = async (id, dx, dy = 0) => {
  const b = await kit.box(id);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  await kit.page.mouse.move(cx, cy);
  await kit.page.mouse.down();
  await kit.settle(80);
  await kit.page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await kit.settle(80);
  await kit.page.mouse.up();
  await kit.settle(300);
  return await valueOf(id);
};

const near = (a, b, tol = 0.04) => a !== null && b !== null && Math.abs(a - b) <= tol;

try {
  // =============================================================================================
  // WHICH CONTROLS HAVE THE SECTION AT ALL. Measured first, because every other row depends on it
  // and because a fixture built on a type without the section reports every property dead.
  // =============================================================================================
  {
    const reach = await kit.page.evaluate(async () => {
      const { COMPONENT_TYPES } = await import('/src/CE_Application/models/componentTypes.js');
      const has = (name) => (COMPONENT_TYPES[name].sections ?? []).includes('Mouse');
      const names = Object.keys(COMPONENT_TYPES);
      return {
        total: names.length,
        withMouse: names.filter(has),
        containers: names.filter((n) => (COMPONENT_TYPES[n].sections ?? []).includes('Children')),
        containersWithMouse: names.filter((n) => has(n)
          && (COMPONENT_TYPES[n].sections ?? []).includes('Children')),
      };
    });
    led.check(M, 'the section’s reach', 'the Mouse tab is offered on the controls a pointer operates — the four range widgets and the custom component — and not on the fifty-three that it does not',
      { total: 58, withMouse: ['Range', 'Number', 'Slider', 'Knob', 'CustomComponent'] },
      { total: reach.total, withMouse: reach.withMouse });

    await kit.fresh();
    const label = await kit.make('Label', { 'Transform.x': 60, 'Transform.y': 120,
      'Transform.width': 180, 'Transform.height': 40 });
    await kit.set(label, { 'Mouse.cursor': 'crosshair', 'Mouse.focusable': true });
    led.check(M, 'a type without the section drops the write',
      'and a property written onto a type that has no Mouse section does not quietly appear there — `createControl` builds only the sections a type declares, so the write lands nowhere rather than half-creating one',
      null, await kit.read(label, 'Mouse'));
  }

  // =============================================================================================
  // interceptClicks — the click either lands here or falls through to what is behind.
  // =============================================================================================
  await kit.fresh();
  {
    const back = await kit.make('Slider', { 'Transform.x': 80, 'Transform.y': 120,
      'Transform.width': 260, 'Transform.height': 60, 'Core.name': 'Back' });
    const front = await kit.make('Slider', { 'Transform.x': 80, 'Transform.y': 120,
      'Transform.width': 260, 'Transform.height': 60, 'Core.name': 'Front' });
    await kit.preview(true);
    await kit.settle(400);
    const box = await kit.box(front);
    const y = box.y + box.h / 2;
    /** Drag to a fraction of the shared track and report what each slider now holds. */
    const dragTo = async (fx) => {
      await kit.drag({ x: box.x + box.w * 0.5, y }, { x: box.x + box.w * fx, y });
      await kit.settle(300);
      return { back: await valueOf(back), front: await valueOf(front) };
    };

    const on = await dragTo(0.8);
    led.check(M, 'interceptClicks (true)', 'the control on top takes the click and the one underneath never sees it',
      { front: 0.8, back: 0 }, { front: on.front, back: on.back });

    await kit.set(front, { 'Mouse.interceptClicks': false });
    await kit.settle(300);
    const off = await dragTo(0.2);
    led.check(M, 'interceptClicks (false)',
      'switched off, the pointer passes straight through: the one underneath moves and the transparent one stays exactly where it was',
      { back: 0.2, frontUnmoved: true }, { back: off.back, frontUnmoved: off.front === on.front });
    led.check(M, 'interceptClicks (it is the pointer, not the value)',
      'and the transparent control is still a control — the panel can still drive it, it simply cannot be touched',
      0.55, await (async () => {
        await kit.set(front, { 'Behavior.defaultValue': 0.55 });
        await kit.settle(260);
        return Number(await kit.read(front, 'Behavior.defaultValue'));
      })());
    await kit.set(front, { 'Mouse.interceptClicks': true });
    await kit.settle(250);
  }
  await kit.preview(false);

  // =============================================================================================
  // bringToFrontOnClick — a click reorders the stack for as long as the preview lasts.
  // =============================================================================================
  await kit.fresh();
  {
    // Authored first, so it sits UNDER the second; its left end sticks out where it can be hit.
    const low = await kit.make('Slider', { 'Transform.x': 60, 'Transform.y': 120,
      'Transform.width': 200, 'Transform.height': 60, 'Core.name': 'Low' });
    await kit.make('Slider', { 'Transform.x': 180, 'Transform.y': 120,
      'Transform.width': 200, 'Transform.height': 60, 'Core.name': 'High' });
    await kit.preview(true);
    await kit.settle(400);
    const exposed = async () => {
      const b = await kit.box(low);
      return { x: b.x + b.w * 0.08, y: b.y + b.h / 2 };
    };
    const level = async (id) => ['auto', ''].includes(String(await styleOf(id, 'z-index')));

    await kit.click(await exposed());
    await kit.settle(300);
    led.check(M, 'bringToFrontOnClick (false)', 'an ordinary control stays where the author stacked it however often it is clicked',
      true, await level(low));

    await kit.set(low, { 'Mouse.bringToFrontOnClick': true });
    await kit.settle(300);
    led.check(M, 'bringToFrontOnClick (before the click)', 'turning it on is not itself a raise — nothing moves until the control is touched',
      true, await level(low));
    await kit.click(await exposed());
    await kit.settle(350);
    const raised = Number(await styleOf(low, 'z-index'));
    led.check(M, 'bringToFrontOnClick (true)', 'and one that asked for it comes to the front the moment it is touched',
      true, Number.isFinite(raised) && raised > 1000);

    await kit.preview(false);
    await kit.settle(350);
    await kit.preview(true);
    await kit.settle(500);
    led.check(M, 'bringToFrontOnClick (the raise is rehearsal, not a document change)',
      'leaving preview puts the stack back as it was authored, so a raise never becomes the panel’s saved order',
      true, await level(low));
  }
  await kit.preview(false);

  // =============================================================================================
  // cursor and hitTestShape — what the pointer looks like, and where the control ends.
  // =============================================================================================
  await kit.fresh();
  {
    const cid = await kit.make('Slider', { 'Transform.x': 80, 'Transform.y': 120,
      'Transform.width': 200, 'Transform.height': 120 });
    await kit.preview(true);
    await kit.settle(400);
    led.check(M, 'cursor (as a slider ships)', 'a range widget asks for the pointer cursor out of the box, which is what its type template says',
      'pointer', await styleOf(cid, 'cursor'));
    await kit.set(cid, { 'Mouse.cursor': 'crosshair' });
    await kit.settle(300);
    led.check(M, 'cursor', 'and the one the author chose is the one the element asks for',
      'crosshair', await styleOf(cid, 'cursor'));
    await kit.set(cid, { 'Mouse.cursor': 'default' });
    await kit.settle(300);
    led.check(M, 'cursor (`default` means "no opinion", not "the arrow")',
      'choosing default writes no cursor declaration at all, and what shows through is the surface’s own affordance — here the slider’s resize arrows, saying which way its handle travels. Writing `cursor:default` would have overridden them with a plain arrow, which is why the resolver returns an empty string for this one value rather than the word',
      { declared: false, surfaceOwn: 'ns-resize' },
      await (async () => {
        const seen = await kit.page.evaluate(({ id }) => {
          const el = document.querySelector(`[data-control-id="${id}"]`);
          return { declared: (el.getAttribute('style') || '').includes('cursor'),
            surfaceOwn: getComputedStyle(el).cursor };
        }, { id: cid });
        return seen;
      })());

    // hitTestShape trims the control to an ellipse with a clip-path, so the square corners of its
    // box stop being part of it. Read as the clip rather than by clicking a corner, because a
    // corner click that lands on nothing is indistinguishable from a click that missed the window.
    led.check(M, 'hitTestShape (rectangle)', 'a rectangular control is clipped by nothing — its whole box is the control',
      true, ['', 'none'].includes(await styleOf(cid, 'clip-path')));
    await kit.set(cid, { 'Mouse.hitTestShape': 'ellipse' });
    await kit.settle(300);
    led.check(M, 'hitTestShape (ellipse)', 'and an elliptical one is clipped to an ellipse, so the corners of its box are no longer part of it',
      true, /ellipse/i.test(String(await styleOf(cid, 'clip-path'))));
  }
  await kit.preview(false);

  // =============================================================================================
  // focusable, tabIndex, focusOutline — where the keyboard can reach.
  // =============================================================================================
  await kit.fresh();
  {
    const shipped = await kit.make('Slider', { 'Transform.x': 60, 'Transform.y': 110,
      'Transform.width': 180, 'Transform.height': 44, 'Core.name': 'Shipped' });
    const ringed = await kit.make('Knob', { 'Transform.x': 260, 'Transform.y': 110,
      'Transform.width': 90, 'Transform.height': 90, 'Core.name': 'Ringed',
      'Mouse.focusOutline': true });
    // A CUSTOM COMPONENT for the ordering rows, and the reason is the Tab Index cell's own hint:
    // "controls with a role of their own keep the order the surface assigns". A slider is given
    // role="slider" and tab index 0 by the preview surface, which knows about roles and handle
    // counts and outranks the section for everything except -1. A custom component has no such
    // role, so the author's number is the one that reaches the element.
    const ordered = await kit.make('CustomComponent', { 'Transform.x': 60, 'Transform.y': 180,
      'Transform.width': 170, 'Transform.height': 80, 'Core.name': 'Ordered',
      'Mouse.tabIndex': 7 });
    const roled = await kit.make('Slider', { 'Transform.x': 260, 'Transform.y': 220,
      'Transform.width': 180, 'Transform.height': 44, 'Core.name': 'Roled',
      'Mouse.tabIndex': 7 });
    await kit.preview(true);
    await kit.settle(450);

    led.check(M, 'focusable (as a range widget ships)', 'a control a pointer operates is a tab stop out of the box, at index zero',
      '0', await attrOf(shipped, 'tabindex'));
    led.check(M, 'focusable (D-18: false used to leave it in the tab order anyway)',
      'switched off it leaves the tab order, so the keyboard passes over it on its way to the next real control. The switch used to do nothing at all here: the index won over it, and all five types that offer this tab ship an index of zero in their template, so every control had an "author-set" order before the author had set anything',
      '-1', await (async () => {
        await kit.set(shipped, { 'Mouse.focusable': false });
        await kit.settle(300);
        return await attrOf(shipped, 'tabindex');
      })());
    led.check(M, 'tabIndex', 'an explicit index is honoured as authored, so a panel can declare its own order rather than taking the DOM’s',
      '7', await attrOf(ordered, 'tabindex'));
    led.check(M, 'tabIndex (a control with a role of its own keeps the surface’s order)',
      'a slider is handed role="slider" and index zero by the surface, which knows about roles and handle counts — so an authored seven does not reach it, exactly as the cell’s hint says',
      { tabindex: '0', role: 'slider' },
      { tabindex: await attrOf(roled, 'tabindex'), role: await attrOf(roled, 'role') });
    led.check(M, 'tabIndex (-1 is the one the section always wins)',
      'and minus one reaches it even so, because "keep this out of the tab order" is checked before the surface’s own index is consulted — reachable by click, skipped by Tab',
      '-1', await (async () => {
        await kit.set(roled, { 'Mouse.tabIndex': -1 });
        await kit.settle(300);
        return await attrOf(roled, 'tabindex');
      })());
    led.check(M, 'tabIndex (overruled by focus off, not forgotten)',
      'turning focus off takes the control out of the tab order whatever its index says, and turning it back on brings the authored order back with it — the number is the author’s statement about order and is kept, but it cannot put an unfocusable control back in the queue',
      { off: '-1', on: '7', stored: 7 }, await (async () => {
        await kit.set(ordered, { 'Mouse.focusable': false });
        await kit.settle(280);
        const off = await attrOf(ordered, 'tabindex');
        const stored = await kit.read(ordered, 'Mouse.tabIndex');
        await kit.set(ordered, { 'Mouse.focusable': true });
        await kit.settle(280);
        return { off, on: await attrOf(ordered, 'tabindex'), stored };
      })());

    const ringOf = async (id) => {
      await kit.page.evaluate(({ id }) => {
        document.querySelector(`[data-control-id="${id}"]`)?.focus?.();
      }, { id });
      await kit.settle(240);
      return await kit.page.evaluate(({ id }) => {
        const el = document.querySelector(`[data-control-id="${id}"]`);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { focused: document.activeElement === el, width: cs.outlineWidth, style: cs.outlineStyle };
      }, { id });
    };
    const ring = await ringOf(ringed);
    led.check(M, 'focusOutline (true)', 'a control that asked for a focus ring gets a real one when the focus lands on it',
      { focused: true, ringed: true },
      { focused: ring?.focused === true, ringed: ring?.style === 'solid' && parseFloat(ring?.width) > 0 });
    await kit.set(ringed, { 'Mouse.focusOutline': false });
    await kit.settle(320);
    const bare = await ringOf(ringed);
    led.check(M, 'focusOutline (false)', 'and one that did not stays unmarked while focused, which is what an unadorned plugin UI wants',
      { focused: true, ringed: false },
      { focused: bare?.focused === true, ringed: bare?.style === 'solid' && parseFloat(bare?.width) > 0 });

    // The value flow overrules the Mouse tab: a read-only control cannot be operated, so putting a
    // focus ring on it would swallow the Tab press heading for the next real control.
    await kit.set(ringed, { 'Mouse.focusable': true, 'Behavior.valueFlow': 'display' });
    await kit.settle(400);
    led.check(M, 'focusable (a display overrules it)',
      'a read-only control is never a tab stop however the Mouse tab is set, because focusing something that cannot be operated swallows the Tab press meant for the next control',
      '-1', await attrOf(ringed, 'tabindex'));
    led.check(M, 'interceptClicks (a display overrules it too)',
      'and it is transparent to the pointer for the same reason — it has no hover and nothing to click, which makes overlapping it a layout decision rather than a cosmetic one',
      true, await hasClass(ringed, 'mouse-transparent'));
  }
  await kit.preview(false);

  // =============================================================================================
  // dragMode — absolute track, relative accumulation, or an axis the control did not choose.
  //
  // ONE CONTROL PER CASE. `Behavior.defaultValue` does not clear a session's valueOverride, so a
  // control reused between two cases carries the first case's answer into the second.
  // =============================================================================================
  await kit.fresh();
  {
    const mk = (y, extra) => kit.make('Slider', { 'Transform.x': 70, 'Transform.y': y,
      'Transform.width': 300, 'Transform.height': 44, ...extra });
    const auto = await mk(110, {});
    const relative = await mk(165, { 'Mouse.dragMode': 'relative' });
    const vertical = await mk(220, { 'Mouse.dragMode': 'vertical' });
    await kit.preview(true);
    await kit.settle(550);

    led.check(M, 'dragMode (auto — the track is an absolute mapping)',
      'left alone, a slider is where you put the pointer: a press a fifth along the track is a fifth, wherever the handle happened to be',
      true, near((await tapAt(auto, 0.2)).after, 0.2));
    led.check(M, 'dragMode (auto — and the drag follows the pointer, not the distance)',
      'thirty pixels along a three-hundred pixel track lands a tenth past the middle',
      true, near(await nudge(auto, 30), 0.6));

    led.check(M, 'dragMode (relative — the press alone changes nothing)',
      'a relative drag accumulates from where the control already stood, so the same press a fifth along leaves an untouched slider on the half it was authored at',
      true, near((await tapAt(relative, 0.2)).after, 0.5));
    led.check(M, 'dragMode (relative — the pixels are the value)',
      'and thirty pixels of travel is thirty pixels’ worth of value added to where it was, not a position on a track: two hundred pixels cover the whole range',
      true, near(await nudge(relative, 30), 0.65));

    const sideways = await nudge(vertical, 60, 0);
    led.check(M, 'dragMode (vertical — the axis the author named wins)',
      'a horizontal slider told to take a vertical drag ignores a sideways one entirely',
      true, sideways === null || near(sideways, 0.5));
    const upward = await nudge(vertical, 0, -40);
    led.check(M, 'dragMode (vertical — and the axis it did not choose is the one that drives it)',
      'while a drag straight up moves it, which is the whole point of overriding the axis',
      true, upward !== null && upward > 0.55);
  }
  await kit.preview(false);

  // =============================================================================================
  // dragSensitivity on a knob — the plain case, where the control's own preset carries one.
  //
  // The DEFAULT circular mode is 'absolute' — jump to the angle under the pointer — and builds no
  // scrub at all, which is why a drag straight up from the centre of an untouched knob measures
  // nothing and looks like a dead property. 'knob' is the plugin-standard relative vertical drag,
  // whose preset carries a sensitivity of 1/250 for the section to multiply.
  // =============================================================================================
  await kit.fresh();
  {
    const knobAt = (x, sens, extra = {}) => kit.make('Knob', { 'Transform.x': x, 'Transform.y': 110,
      'Transform.width': 100, 'Transform.height': 100,
      'Behavior.geometry': 'circular', 'Behavior.circularDragMode': 'knob',
      'Mouse.dragSensitivity': sens, ...extra });
    const slow = await knobAt(70, 1);
    const fast = await knobAt(210, 2);
    const inverted = await knobAt(350, 1, { 'Mouse.invertY': true });
    await kit.preview(true);
    await kit.settle(550);

    led.check(M, 'dragSensitivity', 'the same twenty pixels of travel moves the value twice as far at twice the sensitivity',
      { plain: true, doubled: true },
      { plain: near(await nudge(slow, 0, -20), 0.58), doubled: near(await nudge(fast, 0, -20), 0.66) });
    led.check(M, 'invertY', 'and a knob with the vertical axis inverted takes the same upward drag the other way',
      true, near(await nudge(inverted, 0, -20), 0.42));
  }
  await kit.preview(false);

  // =============================================================================================
  // dragSensitivity on a linear track — where it means nothing, and where it used to mean nothing
  // by mistake.
  // =============================================================================================
  await kit.fresh();
  {
    const mk = (y, extra) => kit.make('Slider', { 'Transform.x': 70, 'Transform.y': y,
      'Transform.width': 300, 'Transform.height': 44, ...extra });
    const trackPlain = await mk(110, {});
    const trackFast = await mk(165, { 'Mouse.dragSensitivity': 3 });
    const relFast = await mk(220, { 'Mouse.dragMode': 'relative', 'Mouse.dragSensitivity': 3 });
    await kit.preview(true);
    await kit.settle(550);

    const a = await nudge(trackPlain, 30);
    const b = await nudge(trackFast, 30);
    led.check(M, 'dragSensitivity (an absolute track has nothing to scale)',
      'a plain slider ignores it, and is right to: the value IS the pointer’s position along the track, so there is no distance to multiply and both sliders land on the same tenth',
      { plain: true, same: true },
      { plain: near(a, 0.6), same: near(a, b, 0.01) });

    led.check(M, 'dragSensitivity (D-16: a relative track used to ignore it too)',
      'but a slider the author switched to a relative drag scales like anything else — three times the sensitivity, three times the travel. The mode and the sensitivity sit in the same tab, and the second used to do nothing on a control the first had just made it meaningful for',
      true, near(await nudge(relFast, 30), 0.95, 0.06));
  }
  await kit.preview(false);

  // =============================================================================================
  // invertX, and D-17 — the defect the relative mode was hiding.
  // =============================================================================================
  await kit.fresh();
  {
    const mk = (y, extra) => kit.make('Slider', { 'Transform.x': 70, 'Transform.y': y,
      'Transform.width': 300, 'Transform.height': 44, 'Mouse.dragMode': 'relative', ...extra });
    const straight = await mk(110, {});
    const flipped = await mk(165, { 'Mouse.invertX': true });
    const kept = await mk(220, {});
    await kit.preview(true);
    await kit.settle(550);

    const s = await nudge(straight, 30);
    const f = await nudge(flipped, 30);
    led.check(M, 'invertX', 'the same rightward drag opens one slider and closes the other, by the same amount either way',
      { right: true, left: true, symmetric: true },
      { right: near(s, 0.65), left: near(f, 0.35),
        symmetric: near(Math.abs(s - 0.5), Math.abs(f - 0.5), 0.02) });

    const moved = await nudge(kept, 60);
    const after = await tapAt(kept, 0.2);
    led.check(M, 'dragMode (D-17: a relative press used to throw the value away)',
      'a relative drag starts from where the control stands — pressing one that is more than three quarters open leaves it there, where it used to snap to its minimum before the pointer had moved at all, on every press',
      { moved: true, kept: true },
      { moved: moved !== null && moved > 0.7, kept: after.after === after.before });
  }
  await kit.preview(false);

  // =============================================================================================
  // The two fields with nothing behind them.
  // =============================================================================================
  led.unsupported(M, 'draggable',
    'move this control with the pointer at runtime',
    'the Mouse tab offers no cell for it and nothing in src/ reads it. Deliberate, and the reason is written at MouseEditor.svelte:13 — moving a control with the pointer at runtime is a feature rather than a setting, and there is no runtime behind it. It is in the model defaults only because the whole section shipped there before anything read any of it, and the four range types then set it to true in their templates, which reads as a promise and is not one. Smallest honest release treatment: leave the key (removing a defaulted field rewrites every panel on disk for no gain) and drop `draggable: true` from the four type templates, so nothing in a saved document claims a behaviour that does not exist.');

  led.inert(M, 'interceptChildClicks',
    'let the parts inside this control take the pointer themselves',
    'READ, AND UNREACHABLE. CanvasControl consumes it (`children-interactive` on `.children-clip`, re-enabling pointer events the clip layer otherwise refuses) and the CSS comment beside it describes the case exactly: "a decorative frame can stop taking clicks without disabling the controls it contains". But the children layer only renders for a control that HAS children, and no type has both sections: Children belongs to Container, Group, TabContainer and ScrollArea, and Mouse to Range, Number, Slider, Knob and CustomComponent. The intersection is empty, so the cell is in the tab for every control that can never use it. Smallest honest release treatment is a decision for the owner, not a fix to make here: either hide the cell (it is one `{#if}`) or add `Mouse` to the four container types, which is what the CSS was written for and would also give a container `interceptClicks` and `cursor`. Recorded rather than done because adding a section to a type changes the shape of every newly created control of it.');

  // =============================================================================================
  // save/reopen — the section is authored state, so a fresh runtime has to carry all of it.
  // =============================================================================================
  await kit.fresh();
  {
    const sid = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 120,
      'Transform.width': 300, 'Transform.height': 50,
      'Mouse.cursor': 'grab', 'Mouse.hitTestShape': 'ellipse', 'Mouse.tabIndex': 4,
      'Mouse.dragMode': 'relative', 'Mouse.dragSensitivity': 2, 'Mouse.invertX': true });
    const again = await kit.reopen(sid);
    await kit.preview(true);
    await kit.settle(650);
    led.check(M, 'save/reopen (the pointer half)',
      'a reopened control asks for the same cursor and is clipped to the same shape, and still carries the order it was authored with — a slider renders the surface’s own index rather than that four, as it did before the file was written, so what the reopen has to preserve is the number in the document',
      { cursor: 'grab', clipped: true, stored: 4, rendered: '0' },
      { cursor: await styleOf(again, 'cursor'),
        clipped: /ellipse/i.test(String(await styleOf(again, 'clip-path'))),
        stored: await kit.read(again, 'Mouse.tabIndex'),
        rendered: await attrOf(again, 'tabindex') });
    led.check(M, 'save/reopen (the drag half)',
      'and drags the way it was authored to — relative, inverted, at twice the feel — so thirty pixels to the right take it three tenths DOWN from the middle',
      true, near(await nudge(again, 30), 0.2, 0.05));
  }
  await kit.preview(false);

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
