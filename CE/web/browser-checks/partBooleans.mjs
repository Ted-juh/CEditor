/**
 * partBooleans.mjs — live combined shapes, in the real component designer.
 *
 * test/booleanGroups.test.js and test/partOutlines.test.js hold the geometry. This drives the designer
 * the way a user does and reads the result off the screen:
 *
 *   combine   plate + hole selected, Subtract on the selection toolbar: a combined shape is made, the
 *             plate and hole are KEPT (a hit zone follows the hole, and that does not stop anything),
 *             the artboard shows through the hole, and one undo takes it all back
 *   live      the hole moved by a patch moves the cut; the hole hidden fills it; the shape's toolbar
 *             switches the operation
 *   paint     a gradient fill and a dashed border drawn on the outline, not a solid-colour stand-in
 *   gesture   the shape dragged on the artboard carries its operands
 *   text      outlined text lands on the browser's own glyphs (ink compared pixel for pixel)
 *   release / flatten / smooth
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/partBooleans.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const page = kit.page;
if (process.env.PB_DEBUG) page.on('pageerror', (error) => console.log('PAGEERROR', error.stack));
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const px = (x, y, width, height) => ({ _type: 'PartLayout', mode: 'absolute', x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0, rotation: 0, scale: 1, pivotX: 50, pivotY: 50 });

async function pixels(rect) {
  const png = await page.screenshot({ clip: rect });
  return page.evaluate(async (src) => {
    const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = src; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, data: [...x.getImageData(0, 0, img.width, img.height).data] };
  }, `data:image/png;base64,${png.toString('base64')}`);
}
const at = (shot, fx, fy) => {
  const x = Math.min(shot.width - 1, Math.floor(shot.width * fx));
  const y = Math.min(shot.height - 1, Math.floor(shot.height * fy));
  const i = (y * shot.width + x) * 4;
  return shot.data.slice(i, i + 3);
};
const red = ([r, g, b]) => r > 170 && g < 120 && b < 120;
const partRect = (name) => page.evaluate((name) => {
  const el = document.querySelector(`.artboard [data-part-name="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}, name);
const patch = (id, values) => page.evaluate(async ({ id, values }) => {
  const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
  applyControlPatch(id, values);
}, { id, values });
const history = (verb) => page.evaluate(async (verb) => { (await import('/src/CE_Application/stores/history.js'))[verb](); }, verb);

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 80, 'Transform.width': 220, 'Transform.height': 160 });
  await page.evaluate(async ({ id, box, dot, pen, label }) => {
    const { createPartNode } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    const fill = (colour) => ({ Background: { _type: 'Background', _children: {
      Fill: { _type: 'Fill', solidEnabled: true, colour },
      Border: { _type: 'Border', enabled: false, thickness: 0 },
      Corners: { _type: 'Corners', linked: true, radius: 0, style: 'rounded' },
    } } });
    const legend = createPartNode('legend', { kind: 'rectangle', zIndex: 4, layout: label });
    legend._children.Text = { _type: 'Text', content: 'Hg', _children: {
      Font: { _type: 'Font', family: 'Rubik', size: 34, weightValue: 700 },
      Fill: { _type: 'Fill', colour: 'FFF0F0F0' },
      Position: { _type: 'Position', justification: 'centred' },
    } };
    applyControlPatch(id, {
      'Parts._children': {
        plate: createPartNode('plate', { kind: 'rectangle', zIndex: 1, layout: box, sections: fill('FFE0443A') }),
        hole: createPartNode('hole', { kind: 'circle', zIndex: 2, layout: dot, sections: fill('FF3A8BE0') }),
        mark: createPartNode('mark', { kind: 'path', zIndex: 3, layout: pen, sections: fill('FFF0C040'), meta: { vectorPoints: [[0, 1], [0.5, 0], [1, 1]], closed: true } }),
        legend,
      },
      // Something that names the hole: combining must not be blocked by it, nor break it.
      'HitZones._children': { press: { _type: 'HitZone', name: 'press', source: 'part:hole', shape: 'rect', enabled: true } },
    });
  }, { id, box: px(10, 10, 120, 100), dot: px(40, 30, 60, 60), pen: px(160, 20, 45, 40), label: px(140, 100, 70, 50) });
  await kit.settle(300);

  const box = await kit.box(id);
  await page.mouse.click(box.x + 4, box.y + 4);
  await kit.settle(600);
  await page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  const zoom = await page.evaluate(() => {
    const el = document.querySelector('.surface-shell .artboard');
    return el.getBoundingClientRect().width / el.offsetWidth;
  });

  // --- Text lands where the browser draws it --------------------------------------------------------
  const legendRect = await partRect('legend');
  const ink = (shot, base) => {
    const mask = [];
    for (let i = 0; i < shot.data.length; i += 4) {
      const d = Math.abs(shot.data[i] - base.data[i]) + Math.abs(shot.data[i + 1] - base.data[i + 1]) + Math.abs(shot.data[i + 2] - base.data[i + 2]);
      mask.push(d > 60 ? 1 : 0);
    }
    return mask;
  };
  const textShot = await pixels(legendRect);
  await page.evaluate(() => { document.querySelector('.artboard [data-part-name="legend"] .interactive-part-text').style.visibility = 'hidden'; });
  const blankShot = await pixels(legendRect);
  await page.evaluate(async ({ zoom }) => {
    const host = document.querySelector('.artboard [data-part-name="legend"]');
    const { textOutline } = await import('/src/CE_Application/utils/textOutline.js');
    const { getSection } = await import('/src/CE_Application/stores/controls.js');
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const control = get(panels).find((p) => p.id === get(activePanelId)).controls.find((c) => c._children.Parts?._children?.legend);
    const part = getSection(control, 'Parts')._children.legend;
    const outline = await textOutline(part, host.offsetWidth, host.offsetHeight);
    host.insertAdjacentHTML('beforeend', `<svg data-outline-probe style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 ${host.offsetWidth} ${host.offsetHeight}"><path d="${outline.pathData}" fill="#F0F0F0"/></svg>`);
  }, { zoom });
  await kit.settle(200);
  const outlineShot = await pixels(legendRect);
  await page.evaluate(() => {
    document.querySelector('[data-outline-probe]')?.remove();
    document.querySelector('.artboard [data-part-name="legend"] .interactive-part-text').style.visibility = '';
  });
  const a = ink(textShot, blankShot);
  const b = ink(outlineShot, blankShot);
  const both = a.reduce((n, v, i) => n + (v && b[i] ? 1 : 0), 0);
  const either = a.reduce((n, v, i) => n + (v || b[i] ? 1 : 0), 0);
  const iou = either ? both / either : 0;
  // Where each ink sits: a systematic offset (a baseline off by a pixel) would show here first.
  const bbox = (mask) => {
    const w = textShot.width;
    let left = Infinity; let right = -1; let top = Infinity; let bottom = -1;
    mask.forEach((v, i) => { if (!v) return; const x = i % w; const y = Math.floor(i / w); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); });
    return { left, right, top, bottom };
  };
  const inkText = bbox(a);
  const inkOutline = bbox(b);
  const drift = Math.max(...['left', 'right', 'top', 'bottom'].map((edge) => Math.abs(inkText[edge] - inkOutline[edge])));
  check(`outlined text lands on the browser's glyphs (ink overlap ${(iou * 100).toFixed(1)}%, edges within ${drift}px)`, () => {
    assert.ok(either > 50, 'there is ink');
    assert.ok(iou > 0.8, `overlap ${iou}`);
    assert.ok(drift <= Math.ceil(zoom * 1.5), `ink box ${JSON.stringify(inkText)} against ${JSON.stringify(inkOutline)}`);
  });

  // --- Combine ------------------------------------------------------------------------------------
  const corner = await partRect('plate');
  await page.mouse.click(corner.x + 6, corner.y + 6);
  await kit.settle(300);
  await page.locator('[aria-label="Add hole to selection"]').first().click();
  await kit.settle(600);
  const subtract = page.locator('[data-boolean="subtract"]');
  const subtractShown = await subtract.count();
  check('with two shapes selected, Subtract is on the toolbar', () => assert.ok(subtractShown >= 1));
  await subtract.first().click();
  await kit.settle(1200);

  const parts = (await kit.read(id, 'Parts'))?._children ?? {};
  const groupName = Object.keys(parts).find((name) => parts[name].kind === 'boolean');
  check('a combined shape is made and the operands are kept, marked as its', () => {
    assert.ok(groupName, JSON.stringify(Object.keys(parts)));
    assert.deepEqual(Object.keys(parts).sort(), ['hole', 'legend', 'mark', 'plate', groupName].sort());
    assert.equal(parts.plate.meta.booleanGroup, groupName);
    assert.equal(parts.hole.meta.booleanGroup, groupName);
    assert.deepEqual(parts[groupName].meta.boolean.operands, ['plate', 'hole']);
  });
  const zone = await kit.read(id, 'HitZones.press');
  check('the hit zone on the hole still follows the hole', () => assert.equal(zone?.source, 'part:hole'));

  // Undo before anything else: a deselection is an undo step of its own.
  await history('undo');
  await kit.settle(700);
  const undone = (await kit.read(id, 'Parts'))?._children ?? {};
  check('one undo takes the shape away and leaves the parts as they were', () => {
    assert.deepEqual(Object.keys(undone).sort(), ['hole', 'legend', 'mark', 'plate']);
    assert.equal(undone.plate.meta?.booleanGroup, undefined);
  });
  await history('redo');
  await kit.settle(900);

  await page.keyboard.press('Escape');
  await kit.settle(500);
  const groupRect = await partRect(groupName);
  let shot = await pixels(groupRect);
  check('red at the edge, not in the hole', () => {
    assert.ok(red(at(shot, 0.06, 0.5)), `edge ${at(shot, 0.06, 0.5)}`);
    assert.ok(!red(at(shot, 0.5, 0.5)), `hole ${at(shot, 0.5, 0.5)}`);
  });
  const drawnOperands = await page.evaluate(() => document.querySelectorAll('.artboard > [data-part-name="plate"], .artboard > [data-part-name="hole"]').length);
  check('the operands do not draw as themselves', () => assert.equal(drawnOperands, 0));


  // --- Live ---------------------------------------------------------------------------------------
  await patch(id, { 'Parts.hole.Layout.x': 70 });
  await kit.settle(900);
  shot = await pixels(await partRect(groupName));
  check('moving the hole moves the cut', () => {
    assert.ok(red(at(shot, 0.4, 0.5)), `old centre is plate again: ${at(shot, 0.4, 0.5)}`);
    assert.ok(!red(at(shot, 0.8, 0.5)), `new centre is cut: ${at(shot, 0.8, 0.5)}`);
  });
  await patch(id, { 'Parts.hole.visible': false });
  await kit.settle(900);
  shot = await pixels(await partRect(groupName));
  check('hiding the hole fills it', () => assert.ok(red(at(shot, 0.8, 0.5)), `${at(shot, 0.8, 0.5)}`));
  await patch(id, { 'Parts.hole.visible': true, 'Parts.hole.Layout.x': 40 });
  await kit.settle(900);

  // Select the shape: its toolbar switches the operation.
  await page.locator(`.list-row button.row-main:has-text("${groupName}")`).first().click();
  await kit.settle(500);
  const operations = await page.locator('[data-group-operation]').count();
  await page.locator('[data-group-operation="unite"]').first().click().catch(() => {});
  await kit.settle(900);
  await page.keyboard.press('Escape');
  await kit.settle(400);
  shot = await pixels(await partRect(groupName));
  const blue = ([r, g, b]) => b > 170 && r < 120;
  check('the shape\'s toolbar switches the operation: unite fills the hole, painted like the front one', () => {
    assert.equal(operations, 4);
    assert.ok(blue(at(shot, 0.5, 0.5)), `centre ${at(shot, 0.5, 0.5)}`);
    assert.ok(blue(at(shot, 0.1, 0.5)), `edge ${at(shot, 0.1, 0.5)}`);
  });
  const united = await kit.read(id, `Parts.${groupName}.meta.boolean`);
  check('and the switch is written', () => {
    assert.equal(united.operation, 'unite');
    assert.equal(united.paintFrom, 'hole', 'unite paints like the front one');
  });
  await page.locator(`.list-row button.row-main:has-text("${groupName}")`).first().click();
  await kit.settle(400);
  await page.locator('[data-group-operation="subtract"]').first().click();
  await kit.settle(900);

  // --- Paint: gradient fill and dashed border on the outline ---------------------------------------
  await patch(id, {
    'Parts.plate.Background.Fill.gradientEnabled': true,
    'Parts.plate.Background.Fill.gradient': { type: 'linear', angle: 90, stops: [{ color: 'E0443A', position: 0 }, { color: '3AE044', position: 100 }] },
    'Parts.plate.Background.Border': { _type: 'Border', enabled: true, linked: true, thickness: 4, style: 'dashed', colour: 'FF101010' },
  });
  await kit.settle(900);
  const painted = await page.evaluate((name) => {
    const el = document.querySelector(`.artboard [data-part-name="${name}"]`);
    return {
      gradientClipped: [...el.querySelectorAll('.bg-fill-layer')].some((layer) => /linear-gradient/.test(layer.getAttribute('style')) && /clip-path: path\(evenodd/.test(layer.getAttribute('style'))),
      dashedBand: !!el.querySelector('mask path[stroke-dasharray]'),
    };
  }, groupName);
  await page.keyboard.press('Escape');
  await kit.settle(300);
  shot = await pixels(await partRect(groupName));
  check('a gradient fill and a dashed border are drawn on the outline', () => {
    assert.ok(painted.gradientClipped, 'gradient layer clipped to the outline');
    assert.ok(painted.dashedBand, 'dashed band');
    const left = at(shot, 0.12, 0.12);
    const right = at(shot, 0.88, 0.12);
    assert.ok(left[0] > left[1] + 60, `red at the left: ${left}`);
    assert.ok(right[1] > right[0] + 60, `green at the right: ${right}`);
  });

  // --- Gesture: drag the shape, the operands follow -------------------------------------------------
  const before = (await kit.read(id, 'Parts'))._children;
  await page.locator(`.list-row button.row-main:has-text("${groupName}")`).first().click();
  await kit.settle(400);
  const bound = await page.evaluate((name) => {
    const el = [...document.querySelectorAll('.part-bound')].find((b) => (b.getAttribute('title') ?? '').startsWith(`${name}:`));
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width * 0.15, y: r.top + r.height * 0.5 } : null;
  }, groupName);
  await page.mouse.move(bound.x, bound.y);
  await page.mouse.down();
  await page.mouse.move(bound.x + 20 * zoom, bound.y + 10 * zoom, { steps: 6 });
  await page.mouse.up();
  await kit.settle(1000);
  const moved = (await kit.read(id, 'Parts'))._children;
  check('dragging the shape carries its operands', () => {
    const dx = (name) => moved[name]._children.Layout.x - before[name]._children.Layout.x;
    const dy = (name) => moved[name]._children.Layout.y - before[name]._children.Layout.y;
    assert.ok(Math.abs(dx('plate') - dx('hole')) < 0.01 && Math.abs(dx('plate')) > 5, `plate ${dx('plate')}, hole ${dx('hole')}`);
    assert.ok(Math.abs(dy('plate') - dy('hole')) < 0.01 && Math.abs(dy('plate')) > 2, `plate ${dy('plate')}, hole ${dy('hole')}`);
  });
  await history('undo');
  await kit.settle(700);

  // --- Flatten is refused while the hit zone names the hole; Release gives the parts back ----------
  await page.locator(`.list-row button.row-main:has-text("${groupName}")`).first().click();
  await kit.settle(400);
  await page.locator('[data-group-flatten]').first().click();
  await kit.settle(800);
  const stillLive = await kit.read(id, `Parts.${groupName}.kind`);
  check('flatten is refused while a hit zone names an operand', () => assert.equal(stillLive, 'boolean'));

  await page.locator('[data-group-release]').first().click();
  await kit.settle(800);
  const released = (await kit.read(id, 'Parts'))._children;
  check('release gives the operands back, drawn as themselves', () => {
    assert.deepEqual(Object.keys(released).sort(), ['hole', 'legend', 'mark', 'plate']);
    assert.equal(released.plate.meta?.booleanGroup, undefined);
  });

  // Combine again without the hit zone, and flatten.
  await patch(id, { 'HitZones._children': {} });
  await kit.settle(300);
  await page.locator('.list-row button.row-main:has-text("plate")').first().click();
  await kit.settle(300);
  await page.locator('[aria-label="Add hole to selection"]').first().click();
  await kit.settle(500);
  await page.locator('[data-boolean="subtract"]').first().click();
  await kit.settle(1200);
  await page.locator('[data-group-flatten]').first().click();
  await kit.settle(1200);
  const flat = (await kit.read(id, 'Parts'))._children;
  const flatName = Object.keys(flat).find((name) => flat[name].kind === 'path' && name !== 'mark');
  check('flatten bakes one path and drops the operands', () => {
    assert.ok(flatName, JSON.stringify(Object.keys(flat)));
    assert.deepEqual(Object.keys(flat).sort(), ['legend', 'mark', flatName].sort());
    assert.equal((flat[flatName].meta.pathData.match(/M/gi) ?? []).length, 2);
  });

  // --- Smooth the Pen triangle ---------------------------------------------------------------------
  await page.locator('.list-row button.row-main:has-text("mark")').first().click();
  await kit.settle(600);
  const smooth = page.locator('[data-path-smooth]');
  const smoothShown = await smooth.count();
  if (smoothShown) await smooth.first().click();
  await kit.settle(900);
  const mark = await kit.read(id, 'Parts.mark');
  check('a Pen path smooths into a curve through its points', () => {
    assert.ok(smoothShown >= 1, 'no Smooth button for a selected Pen path');
    assert.match(mark?.meta?.pathData ?? '', /c/, 'curves');
    assert.equal(mark.meta.vectorPoints, undefined, 'no longer a point list');
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('part booleans: all checks passed');
