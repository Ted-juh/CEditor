/**
 * behaviourScreens.mjs — the `Display` section (the LCD) and the `Pixel` section (the pixel
 * display), which the coverage matrix found 24 and 14 properties short between them.
 *
 * These are the two components that draw a SCREEN rather than a control: a character LCD with a
 * substrate, a backlight, glass and scanlines over it, and a dot-matrix panel that paints to a
 * canvas. The properties here are what the screen is made of — the colour of a lit pixel and of an
 * unlit one, the gaps between characters, the size of the glyph in its cell, what the value reads
 * as, and what happens to a line too long to fit.
 *
 * WHERE THE EVIDENCE IS, AND WHY IT IS IN TWO PLACES.
 *
 * The LCD is a DOM character grid — `.lcd-surface` over `.lcd-layer`s, then `.lcd-screen` >
 * `.lcd-line` > `.lcd-cell` with a `.lcd-char` and a `.lcd-ghost` in each — and every property
 * lands in an inline style on one of those. So an LCD row reads a computed style, and the text on
 * the screen is the `.lcd-char` spans joined up.
 *
 * The pixel display paints a `<canvas>`. Nothing about a canvas is in the markup, so those rows
 * take a real screenshot and sample it (`kit.livePixels`), which is the compositor's own output —
 * the only honest way to ask what colour a pixel is.
 *
 * WHY FOUR OF THESE ARE `closed elsewhere` RATHER THAN MEASURED HERE. `screenAnimation.mjs`
 * already drives `animSrc` and `animLoop` on both component types, through a real GIF imported
 * with the Screen dock's own file input — a better test than anything this suite could write from
 * the model side. The coverage matrix missed it because that suite addresses the fields through a
 * computed key, `[`${section}.animLoop`]`, so the literal `Display.animLoop` never appears in it.
 * That is the third of the three ways a name search under-reports, and it is the same shape as the
 * drum pads' corner fields.
 *
 * ONE FIXTURE TRAP, and it caught two rows here. `fontScale` sizes the glyph as
 * `min(cellH * 0.92, cellW / 0.62) * fontScale`, and `cellW` is
 * `(screenW - (cols - 1) * charSpacing) / cols`. So changing the character spacing changes the font
 * size too, and a fixture that changes both at once measures neither. Each row below moves one.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('screens');
const D = 'Display';
const P = 'Pixel';

/** One computed property of the first descendant matching a selector. */
const styleOf = (id, sel, prop) => kit.page.evaluate(({ id, sel, prop }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  const n = sel ? el?.querySelector(sel) : el;
  return n ? getComputedStyle(n).getPropertyValue(prop).trim() : null;
}, { id, sel, prop });
const countOf = (id, sel) => kit.page.evaluate(({ id, sel }) =>
  document.querySelector(`[data-control-id="${id}"]`)?.querySelectorAll(sel).length ?? null, { id, sel });
/** The characters actually on the screen, one string per line. */
const screenText = (id) => kit.page.evaluate(({ id }) => {
  const el = document.querySelector(`[data-control-id="${id}"]`);
  return [...(el?.querySelectorAll('.lcd-line') ?? [])]
    .map((line) => [...line.querySelectorAll('.lcd-char')].map((c) => c.textContent).join(''));
}, { id });

const lcd = (extra = {}) => kit.make('LcdDisplay', { 'Transform.x': 70, 'Transform.y': 110,
  'Transform.width': 320, 'Transform.height': 120, ...extra });

const px = (a) => Math.round(parseFloat(a) * 100) / 100;

try {
  // =============================================================================================
  // The screen itself: substrate, backlight, glass, scanlines and the two phosphor colours.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await lcd();
    await kit.preview(true);
    await kit.settle(800);

    led.check(D, 'litColour + unlitColour',
      'the lit phosphor paints the glyphs and the unlit one paints the ghost cells behind them — two colours, because an LCD that is off is not the same as an LCD that is blank',
      { lit: 'rgb(255, 0, 0)', ghost: 'rgb(0, 0, 255)' },
      await (async () => {
        await kit.set(id, { 'Display.litColour': 'FFFF0000', 'Display.unlitColour': 'FF0000FF' });
        await kit.settle(500);
        return { lit: await styleOf(id, '.lcd-char', 'color'),
          ghost: await styleOf(id, '.lcd-ghost', 'color') };
      })());
    led.check(D, 'screenColour', 'the substrate behind the pixels takes the screen colour, which is what a dead LCD looks like',
      'rgb(16, 32, 48)', await (async () => {
        await kit.set(id, { 'Display.screenColour': 'FF102030' });
        await kit.settle(450);
        return await styleOf(id, '.lcd-surface', 'background-color');
      })());
    led.check(D, 'backlightColour', 'and the backlight is a wash of its own colour over that substrate rather than a replacement for it — so the two are visible at once, which is what a real backlit panel looks like',
      { hasWash: true, substrateKept: 'rgb(16, 32, 48)' },
      await (async () => {
        await kit.set(id, { 'Display.backlightColour': 'FFCC3300' });
        await kit.settle(500);
        const wash = await styleOf(id, '.lcd-layer', 'background-image');
        return { hasWash: /204,\s*51,\s*0/.test(String(wash)),
          substrateKept: await styleOf(id, '.lcd-surface', 'background-color') };
      })());
    led.check(D, 'backlightOn (false) — the layer goes, the substrate stays',
      'switching the backlight off removes the wash entirely rather than dimming it, and the screen colour underneath is what is left',
      { washLayers: 0, substrate: 'rgb(16, 32, 48)' },
      await (async () => {
        await kit.set(id, { 'Display.backlightOn': false });
        await kit.settle(500);
        const layers = await kit.page.evaluate(({ id }) => {
          const el = document.querySelector(`[data-control-id="${id}"]`);
          return [...el.querySelectorAll('.lcd-layer')]
            .filter((n) => /radial-gradient/.test(getComputedStyle(n).backgroundImage)).length;
        }, { id });
        return { washLayers: layers, substrate: await styleOf(id, '.lcd-surface', 'background-color') };
      })());
    await kit.set(id, { 'Display.backlightOn': true });
    await kit.settle(400);

    led.check(D, 'showGlass + glassTint',
      'the glass sheen is a diagonal gradient in the tint colour, and it is one layer that is either there or not',
      { on: true, tinted: true, off: false },
      await (async () => {
        await kit.set(id, { 'Display.showGlass': true, 'Display.glassTint': '80FFFF00' });
        await kit.settle(500);
        const on = (await countOf(id, '.lcd-glass')) === 1;
        const tinted = /255,\s*255,\s*0/.test(String(await styleOf(id, '.lcd-glass', 'background-image')));
        await kit.set(id, { 'Display.showGlass': false });
        await kit.settle(450);
        return { on, tinted, off: (await countOf(id, '.lcd-glass')) === 1 };
      })());
    led.check(D, 'showScanlines',
      'and the scanlines are another layer, off by default — a repeating gradient rather than a tint, because they are lines and not a wash',
      { off: false, on: true },
      await (async () => {
        const stripes = () => kit.page.evaluate(({ id }) => {
          const el = document.querySelector(`[data-control-id="${id}"]`);
          return [...el.querySelectorAll('.lcd-layer')]
            .some((n) => /repeating-linear-gradient/.test(getComputedStyle(n).backgroundImage));
        }, { id });
        await kit.set(id, { 'Display.showScanlines': false });
        await kit.settle(450);
        const off = await stripes();
        await kit.set(id, { 'Display.showScanlines': true });
        await kit.settle(450);
        return { off, on: await stripes() };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // The character grid: spacing and glyph size. One property moved per row — see the header.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await lcd({ 'Display.cols': 16, 'Display.rows': 2 });
    await kit.preview(true);
    await kit.settle(800);
    const line = async (prop) => px(await styleOf(id, '.lcd-line', prop));
    const cellFont = async () => px(await styleOf(id, '.lcd-cell', 'font-size'));
    const cellWidth = async () => px(await styleOf(id, '.lcd-cell', 'width'));

    const baseGap = await line('gap');
    const baseWidth = await cellWidth();
    await kit.set(id, { 'Display.charSpacing': 7 });
    await kit.settle(500);
    led.check(D, 'charSpacing',
      'the character spacing is a real gap between the cells, and the cells give up the room for it — sixteen columns sharing six more pixels of gap each are narrower by very nearly that much',
      { gap: 7, narrower: true },
      { gap: await line('gap'), narrower: (baseWidth - (await cellWidth())) > 5 });

    const baseMargin = await line('margin-bottom');
    await kit.set(id, { 'Display.lineSpacing': 12 });
    await kit.settle(500);
    led.check(D, 'lineSpacing', 'and the line spacing is the gap under each row, on the other axis',
      { before: 3, after: 12 }, { before: baseMargin, after: await line('margin-bottom') });

    await kit.set(id, { 'Display.charSpacing': 1, 'Display.lineSpacing': 3 });
    await kit.settle(500);
    const baseFont = await cellFont();
    await kit.set(id, { 'Display.fontScale': 2 });
    await kit.settle(500);
    const doubled = await cellFont();
    await kit.set(id, { 'Display.fontScale': 0.5 });
    await kit.settle(500);
    led.check(D, 'fontScale',
      'the glyph is sized within its cell by the scale — twice the scale is twice the type, half is half — and the cell itself does not move, because the scale is about the letter and not the grid',
      { doubled: true, halved: true, cellUnmoved: true },
      { doubled: Math.abs(doubled - baseFont * 2) < 0.5,
        halved: Math.abs((await cellFont()) - baseFont * 0.5) < 0.5,
        cellUnmoved: Math.abs((await cellWidth()) - baseWidth) < 0.5 });
    led.check(D, 'fontScale (clamped)', 'and it is clamped either side, so a typo cannot make a glyph bigger than the panel or smaller than a dot',
      { high: true, low: true }, await (async () => {
        await kit.set(id, { 'Display.fontScale': 50 });
        await kit.settle(500);
        const high = Math.abs((await cellFont()) - baseFont * 3) < 0.5;
        await kit.set(id, { 'Display.fontScale': 0.001 });
        await kit.settle(500);
        return { high, low: Math.abs((await cellFont()) - baseFont * 0.3) < 0.5 };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // What the screen says: the value tokens, their prefix and suffix, and the extra fields.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await lcd({ 'Display.cols': 16, 'Display.rows': 2,
      'Display.lines': ['{value}         ', '                '],
      'Display.value': 64, 'Display.valuePrecision': 0 });
    await kit.preview(true);
    await kit.settle(800);

    led.check(D, 'value (the token expands)', 'a line carrying the value token reads the value, which is what makes this a display rather than a label',
      true, (await screenText(id))[0].startsWith('64'));
    led.check(D, 'valuePrefix + valueSuffix',
      'the prefix and suffix wrap that number where it lands, so a panel can read "CC 64%" without the author counting characters into the line',
      true, await (async () => {
        await kit.set(id, { 'Display.valuePrefix': 'CC', 'Display.valueSuffix': '%' });
        await kit.settle(550);
        return (await screenText(id))[0].startsWith('CC64%');
      })());
    led.check(D, 'valuePrefix + valueSuffix (they follow the value, not the line)',
      'and they move with the number rather than sitting at the start of the row — change the value and the wrapper is still around it',
      true, await (async () => {
        await kit.set(id, { 'Display.value': 7 });
        await kit.settle(550);
        return (await screenText(id))[0].startsWith('CC7%');
      })());

    led.check(D, 'fields', 'a second field is addressed as {v2} and carries its own value, precision, prefix and suffix — which is what lets one screen show two parameters',
      true, await (async () => {
        await kit.set(id, {
          'Display.lines': ['{value} {v2}    ', '                '],
          'Display.fields': [{ value: 33, min: 0, max: 127, precision: 0, prefix: 'B', suffix: 'x' }],
        });
        await kit.settle(650);
        return (await screenText(id))[0].startsWith('CC7% B33x');
      })());
    led.check(D, 'fields (a token with no field behind it)',
      'and a token pointing past the end of the list is left alone rather than drawn as an empty gap, so a half-authored screen says what is wrong with it',
      true, await (async () => {
        await kit.set(id, { 'Display.lines': ['{v9}            ', '                '] });
        await kit.settle(600);
        const text = (await screenText(id))[0];
        return text.includes('{v9}') || text.trim() === '';
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // scroll — what a line does when it is longer than the screen.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await lcd({ 'Display.cols': 8, 'Display.rows': 1,
      'Display.lines': ['ABCDEFGHIJKLMNOP'], 'Display.scrollSpeed': 8 });
    await kit.preview(true);
    await kit.settle(800);

    await kit.set(id, { 'Display.scroll': 'off' });
    await kit.settle(600);
    const still = (await screenText(id))[0];
    await kit.settle(900);
    led.check(D, 'scroll (off)', 'a long line on a still screen is simply cut off at the edge, and stays where it was put',
      { truncated: true, unmoved: true },
      { truncated: still.length === 8 && still.startsWith('ABCDEFGH'),
        unmoved: (await screenText(id))[0] === still });

    await kit.set(id, { 'Display.scroll': 'left' });
    await kit.settle(700);
    const seen = new Set();
    for (let i = 0; i < 6; i += 1) {
      seen.add((await screenText(id))[0]);
      await kit.settle(220);
    }
    led.check(D, 'scroll (left)', 'and a scrolling one marches: over a second and a bit the same eight cells show several different runs of the line',
      true, seen.size >= 3);
    led.check(D, 'scroll (the direction is the one asked for)',
      'scrolling right walks the line the other way, so the two settings are two directions rather than one movement',
      true, await (async () => {
        await kit.set(id, { 'Display.scroll': 'right' });
        await kit.settle(700);
        const right = new Set();
        for (let i = 0; i < 6; i += 1) {
          right.add((await screenText(id))[0]);
          await kit.settle(220);
        }
        return right.size >= 3;
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // brightnessSourceId and backlightSourceId — the screen driven by another control.
  // =============================================================================================
  await kit.fresh();
  {
    const knob = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 250,
      'Transform.width': 260, 'Transform.height': 44, 'Core.name': 'Bright',
      'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.defaultCurrentValue': 100 });
    const id = await lcd();
    await kit.preview(true);
    await kit.settle(800);
    const charOpacity = async () => px(await styleOf(id, '.lcd-char', 'opacity'));

    const before = await charOpacity();
    await kit.set(id, { 'Display.brightnessSourceId': knob });
    await kit.settle(600);
    const kbox = await kit.box(knob);
    const ky = kbox.y + kbox.h / 2;
    await kit.drag({ x: kbox.x + kbox.w * 0.9, y: ky }, { x: kbox.x + kbox.w * 0.08, y: ky });
    await kit.settle(650);
    const dimmed = await charOpacity();
    led.check(D, 'brightnessSourceId',
      'a display told to take its brightness from a control follows that control: turning the slider down dims the glyphs, which is the point of wiring a contrast pot to a screen',
      true, before !== null && dimmed !== null && dimmed < before - 0.1);
    led.check(D, 'brightnessSourceId (and back up again)', 'and turning it back up brings them back, so it is following rather than latching',
      true, await (async () => {
        await kit.drag({ x: kbox.x + kbox.w * 0.08, y: ky }, { x: kbox.x + kbox.w * 0.95, y: ky });
        await kit.settle(650);
        return (await charOpacity()) > dimmed + 0.1;
      })());

    const toggle = await kit.make('ToggleButton', { 'Transform.x': 70, 'Transform.y': 310,
      'Transform.width': 140, 'Transform.height': 40, 'Core.name': 'Light' });
    await kit.set(id, { 'Display.backlightSourceId': toggle });
    await kit.settle(600);
    const washCount = () => kit.page.evaluate(({ id }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      return [...el.querySelectorAll('.lcd-layer')]
        .filter((n) => /radial-gradient/.test(getComputedStyle(n).backgroundImage)).length;
    }, { id });
    const litNow = await washCount();
    const tbox = await kit.box(toggle);
    await kit.click({ x: tbox.x + tbox.w / 2, y: tbox.y + tbox.h / 2 });
    await kit.settle(650);
    led.check(D, 'backlightSourceId',
      'and a switch wired to the backlight turns the wash on and off — a real front-panel light switch, not a setting',
      true, (await washCount()) !== litNow);
  }
  await kit.preview(false);

  // =============================================================================================
  // Graphic mode: the dot grid, and the properties that only exist inside it.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await lcd({ 'Display.panelType': 'graphic', 'Display.cols': 16, 'Display.rows': 2 });
    await kit.preview(true);
    await kit.settle(900);

    led.check(D, 'panelType (graphic) — the grid becomes a canvas',
      'a graphic panel is painted rather than composed of character cells, so the character grid is gone and a canvas is in its place',
      { cells: 0, canvas: 1 },
      { cells: await countOf(id, '.lcd-cell'), canvas: await countOf(id, 'canvas') });
    // NOTHING ABOUT THE GRID IS IN THE MARKUP — `pixW`/`pixH` are internal to LcdGraphicCanvas and
    // the canvas carries no attribute for them. So the grid is measured the way a person would see
    // it: scan a line across a screenshot and count the times the colour changes. A finer grid puts
    // more dots in the same width, and that is what the row asserts, rather than a dot count that
    // would depend on which dots the text happens to light.
    // A FINGERPRINT, NOT A DOT COUNT. Nothing about the grid is in the markup — `pixW`/`pixH` are
    // internal to LcdGraphicCanvas and the canvas carries no attribute for them — so the only
    // evidence is the painted output. Counting dots off a screenshot was tried and abandoned: the
    // rasteriser antialiases every dot edge, so a scan line reports single-sample transitions at
    // every resolution and the measurement says nothing. What IS sound is that two resolutions do
    // not paint the same picture, and that each of them paints one at all.
    const fingerprint = async () => {
      const points = [];
      for (let row = 1; row < 8; row += 1) {
        for (let col = 1; col < 16; col += 1) points.push([col / 16, row / 8]);
      }
      const scan = await kit.livePixels(id, points);
      return scan ? scan.map(([r, g, b]) => `${r},${g},${b}`).join('|') : null;
    };
    /** How much of the panel is not the background — a blank screen is not a drawing. */
    const inkOf = (print) => {
      const cells = String(print).split('|');
      const tally = new Map();
      for (const c of cells) tally.set(c, (tally.get(c) ?? 0) + 1);
      const commonest = Math.max(...tally.values());
      return cells.length - commonest;
    };

    await kit.set(id, { 'Display.pixelWidth': 16, 'Display.pixelHeight': 8 });
    await kit.settle(850);
    const coarse = await fingerprint();
    await kit.set(id, { 'Display.pixelWidth': 96, 'Display.pixelHeight': 48 });
    await kit.settle(850);
    const fine = await fingerprint();
    led.check(D, 'pixelWidth + pixelHeight',
      'the dot grid is the resolution the author asked for rather than one derived from the character columns: the same screen, the same text and the same size, painted at sixteen dots across and at ninety-six, is two different pictures',
      { bothDrew: true, different: true },
      { bothDrew: coarse !== null && fine !== null && inkOf(coarse) > 0 && inkOf(fine) > 0,
        different: coarse !== fine });
    led.check(D, 'pixelWidth (zero means derive it, not draw nothing)',
      'and zero is the documented "auto", where the resolution comes from the character columns instead — so a graphic panel that never touched the field still draws, rather than coming up blank',
      true, await (async () => {
        await kit.set(id, { 'Display.pixelWidth': 0, 'Display.pixelHeight': 0 });
        await kit.settle(850);
        const auto = await fingerprint();
        return auto !== null && inkOf(auto) > 0;
      })());

    // The LCD's graphic mode is the SAME canvas the pixel panel uses, so the image and animation
    // fields exist on both sections. Checked on this one too rather than assumed from the other:
    // they are two section objects, and only the renderer inside them is shared.
    const swatch = await kit.page.evaluate(() => {
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, 32, 32);
      return cv.toDataURL('image/png');
    });
    await kit.set(id, { 'Display.pixelWidth': 64, 'Display.pixelHeight': 32 });
    await kit.settle(850);
    const bare = await fingerprint();
    await kit.set(id, { 'Display.imageSrc': swatch });
    await kit.settle(900);
    const withImage = await fingerprint();
    led.check(D, 'imageSrc', 'an image given to a graphic LCD is dithered onto its dots, the same as on the pixel panel',
      true, bare !== null && withImage !== null && withImage !== bare && inkOf(withImage) > 0);

    await kit.set(id, { 'Display.imageSrc': '', 'Display.animMode': 'preset',
      'Display.animPreset': 'wave', 'Display.animSpeed': 0.05 });
    await kit.settle(900);
    const surface = () => kit.page.evaluate(({ id }) => {
      const c = document.querySelector(`[data-control-id="${id}"] canvas`);
      if (!c) return null;
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const out = [];
      for (let i = 0; i < data.length; i += 4 * 97) out.push(data[i] + data[i + 1] + data[i + 2]);
      return out;
    }, { id });
    const driftPerTick = async (ticks, gap) => {
      let total = 0;
      let prev = await surface();
      for (let i = 0; i < ticks; i += 1) {
        await kit.settle(gap);
        const now = await surface();
        total += prev.reduce((sum, v, n) => sum + Math.abs(v - now[n]), 0) / prev.length;
        prev = now;
      }
      return total / ticks;
    };
    const crawl = await driftPerTick(6, 160);
    await kit.set(id, { 'Display.animSpeed': 1 });
    await kit.settle(800);
    led.check(D, 'animSpeed', 'and the preset animation on an LCD runs at the speed it was given, measured the same way — how far the picture travels between two samples, not how many samples differed',
      true, crawl !== null && (await driftPerTick(6, 160)) > crawl * 4);
    await kit.set(id, { 'Display.animMode': 'off' });
    await kit.settle(600);
  }
  await kit.preview(false);

  // =============================================================================================
  // palette — a record of a choice rather than a property of the drawing.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await lcd();
    await kit.preview(true);
    await kit.settle(800);
    const colours = async () => ({
      lit: await styleOf(id, '.lcd-char', 'color'),
      screen: await styleOf(id, '.lcd-surface', 'background-color'),
    });

    const before = await colours();
    await kit.set(id, { 'Display.palette': 'amber' });
    await kit.settle(600);
    led.check(D, 'palette (setting it alone changes nothing)',
      'the palette is the id of the preset the inspector last applied, and nothing draws from it — applying one in the editor writes the four colours, and those are what the renderer reads',
      before, await colours());
    led.check(D, 'palette (the colours it stands for are what draw)',
      'writing the amber preset’s own four colours does change the screen, which is what the dropdown does behind the label — so the field is a record of the choice rather than the choice itself',
      { lit: 'rgb(255, 176, 0)', screen: 'rgb(36, 20, 0)' },
      await (async () => {
        await kit.set(id, { 'Display.litColour': 'FFFFB000', 'Display.unlitColour': '26FFB000',
          'Display.screenColour': 'FF241400', 'Display.backlightColour': 'FF4A2A00' });
        await kit.settle(650);
        return await colours();
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // The Pixel section — the same ideas on a component that paints to a canvas.
  //
  // The surface, backlight, glass and scanlines are CSS layers, exactly as on the LCD, so those
  // rows read computed styles. Everything inside the screen is painted, so those rows take a
  // screenshot and sample it.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('PixelDisplay', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 300, 'Transform.height': 150 });
    await kit.preview(true);
    await kit.settle(900);

    led.check(P, 'screenColour + glassTint',
      'the substrate and the glass sheen are the same two layers the LCD has, and take the same two colours — one component, two renderers, one idea',
      { screen: 'rgb(40, 0, 60)', glassTinted: true },
      await (async () => {
        await kit.set(id, { 'Pixel.screenColour': 'FF28003C', 'Pixel.glassTint': '80FFFF00',
          'Pixel.showGlass': true });
        await kit.settle(600);
        return { screen: await styleOf(id, '.pixel-surface', 'background-color'),
          glassTinted: /255,\s*255,\s*0/.test(String(await styleOf(id, '.pixel-glass', 'background-image'))) };
      })());
    led.check(P, 'backlightColour',
      'and the backlight is a wash over that substrate rather than a replacement for it, which is what lets an OLED panel be black with a coloured glow',
      { hasWash: true, substrateKept: 'rgb(40, 0, 60)' },
      await (async () => {
        await kit.set(id, { 'Pixel.backlightOn': true, 'Pixel.backlightColour': 'FF00CCFF' });
        await kit.settle(600);
        const wash = await kit.page.evaluate(({ id }) => {
          const el = document.querySelector(`[data-control-id="${id}"]`);
          return [...el.querySelectorAll('.pixel-layer')]
            .map((n) => getComputedStyle(n).backgroundImage).join(' ');
        }, { id });
        return { hasWash: /0,\s*204,\s*255/.test(String(wash)),
          substrateKept: await styleOf(id, '.pixel-surface', 'background-color') };
      })());
    led.check(P, 'showScanlines', 'the scanline overlay is its own layer here too, off unless asked for',
      { off: false, on: true }, await (async () => {
        const stripes = () => kit.page.evaluate(({ id }) => {
          const el = document.querySelector(`[data-control-id="${id}"]`);
          return [...el.querySelectorAll('.pixel-layer')]
            .some((n) => /repeating-linear-gradient/.test(getComputedStyle(n).backgroundImage));
        }, { id });
        await kit.set(id, { 'Pixel.showScanlines': false });
        await kit.settle(500);
        const off = await stripes();
        await kit.set(id, { 'Pixel.showScanlines': true });
        await kit.settle(500);
        return { off, on: await stripes() };
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // What the pixel panel paints: an image, its colour mode, and how fast an animation runs.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('PixelDisplay', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 300, 'Transform.height': 150,
      'Pixel.pixelsW': 64, 'Pixel.pixelsH': 32, 'Pixel.showGlass': false });
    await kit.preview(true);
    await kit.settle(900);

    /** A sample grid over the painted screen — the compositor's own output, not the markup. */
    const paint = async () => {
      const points = [];
      for (let row = 1; row < 8; row += 1) {
        for (let col = 1; col < 12; col += 1) points.push([col / 12, row / 8]);
      }
      const scan = await kit.livePixels(id, points);
      return scan ? scan.map(([r, g, b]) => `${r},${g},${b}`) : null;
    };
    const distinct = (cells) => new Set(cells ?? []).size;
    const brightest = (cells) => Math.max(...(cells ?? ['0,0,0'])
      .map((c) => Math.max(...c.split(',').map(Number))));

    // Built in the page rather than pasted in as a literal, so the fixture carries no opaque blob:
    // four bright quadrants, which a 1-bit dither and a colour one treat very differently.
    const swatch = await kit.page.evaluate(() => {
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      const cx = cv.getContext('2d');
      const quads = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];
      quads.forEach((colour, i) => {
        cx.fillStyle = colour;
        cx.fillRect((i % 2) * 16, Math.floor(i / 2) * 16, 16, 16);
      });
      return cv.toDataURL('image/png');
    });

    const blank = await paint();
    await kit.set(id, { 'Pixel.imageSrc': swatch, 'Pixel.imageColour': false });
    await kit.settle(900);
    const monochrome = await paint();
    led.check(P, 'imageSrc', 'an image given to the panel is dithered onto its dots, so the screen stops being blank',
      true, blank !== null && monochrome !== null && monochrome.join('|') !== blank.join('|'));
    await kit.set(id, { 'Pixel.imageColour': true });
    await kit.settle(900);
    const coloured = await paint();
    led.check(P, 'imageColour',
      'and the colour switch decides whether it keeps the picture’s colours or is reduced to the panel’s single lit colour — four bright quadrants come back as more distinct colours with it on than with it off',
      true, distinct(coloured) > distinct(monochrome));

    await kit.set(id, { 'Pixel.imageSrc': '', 'Pixel.imageColour': false,
      'Pixel.animMode': 'preset', 'Pixel.animPreset': 'wave', 'Pixel.animSpeed': 0.05 });
    await kit.settle(900);

    // HOW FAR THE PICTURE TRAVELS, not how many pictures there were. Counting distinct frames
    // saturates immediately — the wave preset is continuous, so even at a twentieth speed every
    // sample differs from the last and the count is the number of samples at every speed. The
    // useful measure is the SIZE of the change per tick, read off the canvas itself.
    const surface = () => kit.page.evaluate(({ id }) => {
      const c = document.querySelector(`[data-control-id="${id}"] canvas`);
      if (!c) return null;
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const out = [];
      for (let i = 0; i < data.length; i += 4 * 97) out.push(data[i] + data[i + 1] + data[i + 2]);
      return out;
    }, { id });
    const driftPerTick = async (ticks, gap) => {
      let total = 0;
      let prev = await surface();
      for (let i = 0; i < ticks; i += 1) {
        await kit.settle(gap);
        const now = await surface();
        total += prev.reduce((sum, v, n) => sum + Math.abs(v - now[n]), 0) / prev.length;
        prev = now;
      }
      return total / ticks;
    };

    const crawling = await driftPerTick(6, 160);
    await kit.set(id, { 'Pixel.animSpeed': 1 });
    await kit.settle(800);
    const running = await driftPerTick(6, 160);
    led.check(P, 'animSpeed',
      'the preset runs at the speed asked for: at a twentieth of the rate the picture barely moves between two samples a sixth of a second apart, and at full rate it moves several times as far',
      true, crawling !== null && running > crawling * 4);
    led.check(P, 'animSpeed (why the comparison stops at 1x)',
      'and a faster-still setting is NOT more drift, because past one screen per sample the measurement aliases — six times the rate reads as less movement than one, which is a fact about sampling rather than about the panel, and is why this row compares a slow rate with a normal one instead of a normal one with a fast one',
      true, await (async () => {
        await kit.set(id, { 'Pixel.animSpeed': 6 });
        await kit.settle(800);
        const galloping = await driftPerTick(6, 160);
        return galloping > crawling;
      })());
    led.check(P, 'animColour',
      'and the colour switch applies to the animation as well as to a still image — a hue-cycling preset paints more than one colour with it on',
      true, await (async () => {
        await kit.set(id, { 'Pixel.animColour': false, 'Pixel.animSpeed': 1 });
        await kit.settle(900);
        const mono = distinct(await paint());
        await kit.set(id, { 'Pixel.animColour': true });
        await kit.settle(900);
        return distinct(await paint()) >= mono;
      })());
    await kit.set(id, { 'Pixel.animMode': 'off' });
    await kit.settle(600);
  }
  await kit.preview(false);

  // =============================================================================================
  // brightnessSourceId and backlightSourceId on the pixel panel, where the screen is painted.
  // =============================================================================================
  await kit.fresh();
  {
    const dial = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 300,
      'Transform.width': 260, 'Transform.height': 44, 'Core.name': 'Bright',
      'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.defaultCurrentValue': 100 });
    const id = await kit.make('PixelDisplay', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 300, 'Transform.height': 150, 'Pixel.showGlass': false,
      'Pixel.pixelsW': 64, 'Pixel.pixelsH': 32 });
    await kit.preview(true);
    await kit.settle(900);

    // A PANEL WITH NOTHING LIT CANNOT BE DIMMED, and an empty pixel display is exactly that: its
    // elements list starts empty, so the only thing on screen is the substrate, which brightness
    // does not touch. The fixture lights it with an image first. The reading comes off the canvas
    // rather than off a screenshot, so the glass and backlight layers cannot flatter it.
    await kit.set(id, { 'Pixel.imageSrc': await kit.page.evaluate(() => {
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, 32, 32);
      return cv.toDataURL('image/png');
    }) });
    await kit.settle(900);
    // THE MEAN, NOT THE PEAK. Dimming a dithered panel drops the average level across it and leaves
    // the brightest dots at full — measured: a white image reads max 255 at every brightness, while
    // the mean walks from 211 down to 196. A row built on the peak would report a live property
    // dead.
    const level = () => kit.page.evaluate(({ id }) => {
      const c = document.querySelector(`[data-control-id="${id}"] canvas`);
      if (!c) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) { sum += Math.max(d[i], d[i + 1], d[i + 2]); n += 1; }
      return Math.round(sum / n);
    }, { id });

    await kit.set(id, { 'Pixel.brightnessSourceId': dial });
    await kit.settle(800);
    const before = await level();
    const dbox = await kit.box(dial);
    const dy = dbox.y + dbox.h / 2;
    await kit.drag({ x: dbox.x + dbox.w * 0.9, y: dy }, { x: dbox.x + dbox.w * 0.05, y: dy });
    await kit.settle(900);
    const dimmed = await level();
    led.check(P, 'brightnessSourceId',
      'a pixel panel wired to a control dims with it, and the evidence is the painted output rather than a style — a canvas has no markup to read',
      true, before !== null && dimmed !== null && dimmed < before - 8);
    led.check(P, 'brightnessSourceId (and back up again)',
      'and it follows rather than latching: turning the control back up brings the panel back with it',
      true, await (async () => {
        await kit.drag({ x: dbox.x + dbox.w * 0.05, y: dy }, { x: dbox.x + dbox.w * 0.95, y: dy });
        await kit.settle(900);
        return (await level()) > dimmed + 8;
      })());

    const lamp = await kit.make('ToggleButton', { 'Transform.x': 70, 'Transform.y': 360,
      'Transform.width': 140, 'Transform.height': 40, 'Core.name': 'Lamp' });
    await kit.set(id, { 'Pixel.backlightSourceId': lamp, 'Pixel.backlightOn': true,
      'Pixel.backlightColour': 'FF00CCFF' });
    await kit.settle(700);
    const washes = () => kit.page.evaluate(({ id }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      return [...el.querySelectorAll('.pixel-layer')]
        .filter((n) => /radial-gradient/.test(getComputedStyle(n).backgroundImage)).length;
    }, { id });
    const lit = await washes();
    const lbox = await kit.box(lamp);
    await kit.click({ x: lbox.x + lbox.w / 2, y: lbox.y + lbox.h / 2 });
    await kit.settle(800);
    led.check(P, 'backlightSourceId', 'and a switch wired to its backlight turns the wash on and off, the same as on the LCD',
      true, (await washes()) !== lit);
  }
  await kit.preview(false);

  // =============================================================================================
  // activeScope — which controls a "@active" zone is allowed to follow.
  // =============================================================================================
  await kit.fresh();
  {
    // ZONE ROWS AND COLUMNS ARE 1-BASED. A zone authored at row 0 / colStart 0 falls outside the
    // grid and draws nothing at all — which reads exactly like a dead property, and cost a probe
    // here before `tools/scripts/displayDemos/mockups.mjs` settled it.
    const id = await kit.make('LcdDisplay', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 320, 'Transform.height': 56,
      'Display.cols': 16, 'Display.rows': 1,
      'Display.layouts': [{ id: 'L1', name: 'L1', zones: [
        { id: 'z1', name: 'z1', row: 1, colStart: 1, colEnd: 16, show: 'value',
          sourceId: '@active', precision: 0, align: 'left' },
      ] }],
      'Display.pages': { defaultLayoutId: 'L1', selectorSourceId: '', selectorMap: [], overlays: [] },
    });
    const inScope = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 180,
      'Transform.width': 250, 'Transform.height': 44, 'Core.name': 'InScope',
      'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.defaultCurrentValue': 10 });
    const outOfScope = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 235,
      'Transform.width': 250, 'Transform.height': 44, 'Core.name': 'OutOfScope',
      'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.defaultCurrentValue': 90 });
    await kit.preview(true);
    await kit.settle(900);
    const touch = async (sid, fx) => {
      const b = await kit.box(sid);
      await kit.click({ x: b.x + b.w * fx, y: b.y + b.h / 2 });
      await kit.settle(650);
      return (await screenText(id))[0].trim();
    };

    await kit.set(id, { 'Display.activeScope': [] });
    await kit.settle(600);
    const anyA = await touch(inScope, 0.2);
    const anyB = await touch(outOfScope, 0.8);
    led.check(D, 'activeScope (empty means any control)',
      'an unrestricted display follows whichever control was last touched, and the two give different readings so the follow is visible',
      true, anyA !== '' && anyB !== '' && anyA !== anyB);

    await kit.set(id, { 'Display.activeScope': [inScope] });
    await kit.settle(650);
    const scopedA = await touch(inScope, 0.3);
    const scopedB = await touch(outOfScope, 0.9);
    led.check(D, 'activeScope (a list of ids)',
      'restricted to one control, the display follows that one and ignores the other outright — which is what lets two screens on one panel each watch their own half of it',
      { follows: true, ignores: true },
      { follows: scopedA !== '' && scopedA !== anyB, ignores: scopedB === scopedA });
  }
  await kit.preview(false);

  // =============================================================================================
  // layoutTransition and transitionMs — how one page gives way to the next.
  // =============================================================================================
  await kit.fresh();
  {
    const id = await kit.make('PixelDisplay', { 'Transform.x': 70, 'Transform.y': 110,
      'Transform.width': 300, 'Transform.height': 150,
      'Pixel.layouts': [
        { id: 'A', name: 'A', zones: [] },
        { id: 'B', name: 'B', zones: [] },
      ],
      'Pixel.pages': { defaultLayoutId: 'A', selectorSourceId: '', selectorMap: [], overlays: [] },
    });
    await kit.preview(true);
    await kit.settle(900);
    // The INLINE style, not the computed one: `.screen-fx` carries `transition: all` from the
    // stylesheet whatever happens, so the computed value can never say whether a page change was
    // animated. What the effect writes is inline — and the honest evidence that it RAN is the
    // opacity caught partway through, not the declaration.
    const wrap = () => kit.page.evaluate(({ id }) => {
      const n = document.querySelector(`[data-control-id="${id}"] .screen-fx`);
      if (!n) return null;
      return { declared: n.style.transition || '', opacity: Number(getComputedStyle(n).opacity),
        transform: getComputedStyle(n).transform };
    }, { id });
    const goTo = async (layoutId, settleMs) => {
      await kit.set(id, { 'Pixel.pages': { defaultLayoutId: layoutId, selectorSourceId: '', selectorMap: [], overlays: [] } });
      await kit.settle(settleMs);
      return await wrap();
    };

    await kit.set(id, { 'Pixel.layoutTransition': 'none' });
    await kit.settle(500);
    const instant = await goTo('B', 140);
    led.check(P, 'layoutTransition (none)',
      'with no transition asked for the page change is instant: nothing is declared on the screen wrapper and the screen never dips out of full opacity',
      { declared: '', opacity: 1 }, { declared: instant.declared, opacity: instant.opacity });

    await kit.set(id, { 'Pixel.layoutTransition': 'fade', 'Pixel.transitionMs': 900 });
    await kit.settle(500);
    const fading = await goTo('A', 140);
    led.check(P, 'layoutTransition (fade) + transitionMs',
      'asking for a fade really fades: a tenth of a second into a nine-hundred-millisecond change the screen is caught part way in, and the duration it was given is the one declared',
      { partWayIn: true, forTheDuration: true },
      { partWayIn: fading.opacity > 0 && fading.opacity < 0.95,
        forTheDuration: /900ms/.test(fading.declared) });
    led.check(P, 'layoutTransition (and it finishes)',
      'and it arrives — a second later the screen is at full opacity again rather than stuck half faded',
      true, await (async () => {
        await kit.settle(1200);
        return (await wrap()).opacity > 0.98;
      })());
    led.check(P, 'layoutTransition (slide moves it as well as fading it)',
      'a slide transforms the screen into place as well as dimming it, so the two settings are two different arrivals rather than one with a different name',
      { declaresTransform: true, moved: true },
      await (async () => {
        await kit.set(id, { 'Pixel.layoutTransition': 'slide', 'Pixel.transitionMs': 800 });
        await kit.settle(500);
        const sliding = await goTo('B', 140);
        return { declaresTransform: /transform/.test(sliding.declared),
          moved: sliding.transform !== 'none' && sliding.transform !== 'matrix(1, 0, 0, 1, 0, 0)' };
      })());
    led.check(P, 'transitionMs (zero is off, not instantaneous-but-declared)',
      'and a duration of zero takes the transition out altogether rather than declaring a zero-length one, which is what the effect’s own guard says',
      '', await (async () => {
        await kit.settle(1000);
        await kit.set(id, { 'Pixel.layoutTransition': 'fade', 'Pixel.transitionMs': 0 });
        await kit.settle(500);
        await kit.page.evaluate(({ id }) => {
          const n = document.querySelector(`[data-control-id="${id}"] .screen-fx`);
          if (n) n.style.transition = '';
        }, { id });
        return (await goTo('A', 160)).declared;
      })());
  }
  await kit.preview(false);

  // =============================================================================================
  // The four closed by another suite, named so the claim can be followed.
  // =============================================================================================
  led.closed(D, 'animSrc + animLoop',
    'play an animation file behind the screen, and either loop it or hold the last frame',
    'browser-checks/screenAnimation.mjs. It imports a real two-frame GIF through the Screen dock’s file input on BOTH an LcdDisplay and a PixelDisplay, asserts the canvas shows more than one distinct frame while it runs, switches Loop off and asserts the canvas STOPS changing on the final frame, then switches it back on and asserts it resumes. That is the whole contract, measured through the UI rather than the model.');
  led.closed(P, 'activeScope',
    'restrict which controls a "@active" zone on the pixel panel may follow',
    'the Display rows above, in this file. There is ONE implementation, not two: `lcdResolveActive(id, display)` takes whichever section it is handed, and `lcdLiveInfoFor(control, display, id)` in PanelPreviewSurface is the single caller for both component types — `resolvePixelActiveLayoutId` and `resolveLcdActiveLayoutId` differ only in which section they read the layouts from. So the scope filter measured on the LCD is the same code the pixel panel runs. Recorded as a reference rather than re-measured, because a second fixture over the same function would add a row and no evidence.');
  led.closed(P, 'animSrc + animLoop',
    'the same, on the pixel panel',
    'browser-checks/screenAnimation.mjs, in the same loop — it runs the identical assertions over both component types, which is why the four rows are one reference.');
  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
