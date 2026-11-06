/**
 * A picture layer's colour, in the Component Designer (utils/pictureRecolour.js): a knob made in
 * Blender (test/fixtures/blender-knob.psd) imported as the menu imports it; its skirt selected, the
 * dock edits the skirt's colour, a colour picked changes the pixels inside the skirt and not the
 * artboard beside it; a light layer names the layer it lights, and the dial's Lamp is set by the panel.
 *
 *   node browser-checks/pictureColour.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from './behaviourKit.mjs';

const kit = await boot({ width: 1600, height: 1000 });
const { page } = kit;
const SIZE = 96;

/** The artboard's pixel at (x, y) of the component, as the screen shows it: [r, g, b]. */
async function pixelAt(x, y) {
  const box = await page.locator('.artboard').first().boundingBox();
  const shot = await page.screenshot({ clip: { x: box.x + (x / SIZE) * box.width - 1, y: box.y + (y / SIZE) * box.height - 1, width: 3, height: 3 } });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const at = context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data;
    return [at[0], at[1], at[2]];
  }, shot.toString('base64'));
}

const near = (a, b, tolerance) => a.every((value, i) => Math.abs(value - b[i]) <= tolerance);

try {
  await kit.fresh();
  const bytes = readFileSync(new URL('../test/fixtures/blender-knob.psd', import.meta.url)).toString('base64');

  // On the panel first, as the Player and an exported plug-in draw it (CanvasControl: the outline
  // mixed for the panel and the parts that never change baked, each after the colour).
  const id = await page.evaluate(async (data) => {
    const file = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { planPsdComponentImport } = await window.__ceImport('/src/CE_Application/utils/psdComponentImport.js');
    const { panels, resolvedActivePanelId } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const control = planPsdComponentImport(file, { fileName: 'blender-knob.psd' }).component;
    control._children.Core.id = 'knob_on_panel';
    Object.assign(control._children.Transform, { x: 100, y: 100, width: 96, height: 96 });
    const panelId = get(resolvedActivePanelId);
    panels.update((list) => list.map((p) => (p.id === panelId ? { ...p, controls: [...p.controls, control] } : p)));
    return control._children.Core.id;
  }, bytes);
  await kit.settle(1500);
  const points = [[16 / SIZE, 48 / SIZE], [3 / SIZE, 3 / SIZE]];
  const [panelSkirt, panelBeside] = await kit.livePixels(id, points);
  await kit.set(id, { 'Parts.skirt.Background.Fill.imageColour': 'FF285AAA' });
  let onPanel = await kit.livePixels(id, points);
  for (let tries = 0; tries < 20 && near(onPanel[0], panelSkirt, 6); tries += 1) {
    await kit.settle(250);
    onPanel = await kit.livePixels(id, points);
  }
  assert.ok(onPanel[0][2] > onPanel[0][0] + 60, `on the panel the skirt is blue: ${onPanel[0].slice(0, 3)} (was ${panelSkirt.slice(0, 3)})`);
  assert.ok(near(onPanel[1], panelBeside, 3), `and the panel beside it as it was: ${onPanel[1]} against ${panelBeside}`);
  console.log(`  ok  on the panel: the skirt ${onPanel[0].slice(0, 3)} where it was ${panelSkirt.slice(0, 3)}, nothing beside it painted`);

  // The pointer made blue: its reflection in the cap, a part of frames that follows the cap, worked out
  // again in the pointer's colour by the browser (decoded, pictureRecolour.js rethrownPixels, encoded).
  const thrown = await page.evaluate(async (data) => {
    const file = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { planPsdComponentImport } = await window.__ceImport('/src/CE_Application/utils/psdComponentImport.js');
    const { withColourFollows, pictureColourSources } = await window.__ceImport('/src/CE_Application/utils/pictureRecolour.js');
    const parts = planPsdComponentImport(file, { fileName: 'blender-knob.psd' }).component._children.Parts._children;
    parts.pointer._children.Image.colour = 'FF3985FF';
    const sources = await pictureColourSources(withColourFollows(Object.entries(parts)));
    const image = parts.pointer_reflection._children.Image;
    const made = sources.get('pointer_reflection');
    const pixelsOf = async (src) => {
      const picture = new Image();
      picture.src = src;
      await picture.decode();
      const canvas = document.createElement('canvas');
      canvas.width = picture.width;
      canvas.height = picture.height;
      const context = canvas.getContext('2d');
      context.drawImage(picture, 0, 0);
      return context.getImageData(0, 0, picture.width, picture.height).data;
    };
    if (!made) return null;
    const before = await pixelsOf(image.frames[image.frameIndex].source);
    const after = await pixelsOf(made.frames[image.frameIndex]);
    // What each adds, summed over the frame: colour times opacity.
    const sum = (pixels) => [0, 1, 2].map((c) => { let total = 0; for (let i = 0; i < pixels.length; i += 4) total += pixels[i + c] * pixels[i + 3] / 255; return Math.round(total); });
    return { before: sum(before), after: sum(after), frames: made.frames.filter(Boolean).length, pointer: Boolean(sources.get('pointer')) };
  }, bytes);
  assert.ok(thrown, 'the reflection is worked out again when the pointer changes colour');
  assert.ok(thrown.after[0] < thrown.before[0] && thrown.after[2] > thrown.before[2] + 50,
    `the pointer blue, its reflection in the cap less red and more blue: ${thrown.after} where it was ${thrown.before}`);
  assert.equal(thrown.frames, 11, 'at every angle');
  console.log(`  ok  the pointer blue: its reflection in the cap adds ${thrown.after} where it added ${thrown.before} (red, green, blue over the frame)`);

  await page.evaluate(async (data) => {
    const file = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { planPsdComponentImport } = await window.__ceImport('/src/CE_Application/utils/psdComponentImport.js');
    const { openArtworkComponent } = await window.__ceImport('/src/CE_Application/stores/artworkComponentActions.js');
    openArtworkComponent(planPsdComponentImport(file, { fileName: 'blender-knob.psd' }), 'pictureColour');
  }, bytes);
  await page.waitForSelector('.artboard', { timeout: 30000 });
  await kit.settle(1500);

  // The Interact card: the Lamp is set by the panel, and nothing is not wired up.
  const setByPanel = page.locator('[data-testid="set-by-panel"]');
  await setByPanel.waitFor({ timeout: 10000 });
  const lampText = await setByPanel.innerText();
  assert.match(lampText, /Lamp/);
  assert.match(lampText, /Shows lamp_glow, lamp_glow_shine and lamp_lit when on\.|Shows .*lamp_lit.* when on\./);
  assert.equal(await page.getByText('Not wired up', { exact: false }).count(), 0, 'nothing is listed as not wired up');
  // It can follow a knob or slider on the panel too, on once that is past half way.
  const lampFrom = setByPanel.locator('[data-value="lamp"] .value-from select');
  assert.equal(await lampFrom.count(), 1, 'the Lamp offers Value From');
  assert.equal(await lampFrom.inputValue(), '', 'its own value until it is told otherwise');
  console.log('  ok  Interact: the Lamp is set by the panel, nothing is not wired up');

  // The skirt: a picture layer, its colour in the look bar and the dock.
  const inSkirt = [16, 48];
  const beside = [3, 3];
  const skirtBefore = await pixelAt(...inSkirt);
  const besideBefore = await pixelAt(...beside);
  await page.locator('text=/^skirt$/ >> visible=true').first().click();
  await kit.settle(500);
  assert.equal(await page.locator('[data-testid="picture-colour-swatch"]').count(), 1, 'the look bar offers the picture\'s colour');
  assert.equal(await page.getByText('Corners', { exact: true }).count(), 0, 'and no corners, which a picture does not draw');
  assert.match(await page.locator('.context-label >> visible=true').first().innerText(), /skirt › Colour/);
  const strip = await page.locator('[data-testid="picture-colour"] >> visible=true').first().innerText();
  assert.match(strip, /Drawn/i);
  assert.match(strip, /#C[0-9A-F]C[0-9A-F]B[0-9A-F]/, `the skirt was drawn pale grey: ${strip}`);
  console.log('  ok  the skirt selected: the dock edits skirt › Colour, drawn a pale grey');

  // Red, as the picker gives it: the skirt is red where it was grey, its light kept; the artboard beside it is as it was.
  await page.evaluate(async () => {
    const { applyColorToTarget } = await window.__ceImport('/src/CE_Application/stores/colorTarget.js');
    applyColorToTarget('FFB22222');
  });
  await page.waitForFunction(() => true);
  let skirtAfter = await pixelAt(...inSkirt);
  for (let tries = 0; tries < 20 && near(skirtAfter, skirtBefore, 6); tries += 1) {
    await kit.settle(250);
    skirtAfter = await pixelAt(...inSkirt);
  }
  assert.ok(skirtAfter[0] > skirtAfter[1] + 60 && skirtAfter[0] > skirtAfter[2] + 60, `the skirt is red: ${skirtAfter} (was ${skirtBefore})`);
  // Its light kept: as dark against red as it was against grey (the shading multiplies either).
  const lightBefore = skirtBefore[0] / 193;
  const lightAfter = skirtAfter[0] / 178;
  assert.ok(Math.abs(lightBefore - lightAfter) < 0.12, `its shading kept: ${lightBefore.toFixed(2)} of its colour before, ${lightAfter.toFixed(2)} after`);
  // Beside it only the light the skirt throws changes, by a level or two: no wash over the layer's box,
  // and the panel's shadow, recoloured, still a multiply (drawn plain it turns the artboard pale).
  const besideAfter = await pixelAt(...beside);
  assert.ok(near(besideAfter, besideBefore, 3), `beside it, the artboard as it was but for the skirt's light: ${besideAfter} against ${besideBefore}`);
  assert.match(await page.locator('[data-testid="picture-colour"] >> visible=true').first().innerText(), /NOW\s*#B22222|Now\s*#B22222/i, 'the dock says what it is drawn in now');
  console.log(`  ok  red: the skirt ${skirtAfter} where it was ${skirtBefore}, its shading kept, nothing beside it painted`);

  // Back to as drawn.
  await page.locator('button:has-text("Back to as drawn") >> visible=true').first().click();
  let back = await pixelAt(...inSkirt);
  for (let tries = 0; tries < 20 && !near(back, skirtBefore, 6); tries += 1) {
    await kit.settle(250);
    back = await pixelAt(...inSkirt);
  }
  assert.ok(near(back, skirtBefore, 6), `as drawn again: ${back} against ${skirtBefore}`);
  console.log('  ok  Back to as drawn: the skirt as it was');

  // A light layer: no colour of its own; it names the layer it lights, and selects it.
  await page.locator('text=/^skirt_shading$/ >> visible=true').first().click();
  await kit.settle(500);
  const link = page.locator('[data-testid="light-layer-link"]');
  assert.equal(await link.innerText(), "Edit skirt's colour");
  assert.match(await page.locator('[data-testid="light-layer-note"] >> visible=true').first().innerText(), /skirt_shading is light/);
  assert.match(await page.locator('.context-label >> visible=true').first().innerText(), /skirt_shading › light/);
  await link.click();
  await kit.settle(500);
  assert.match(await page.locator('.context-label >> visible=true').first().innerText(), /skirt › Colour/);
  console.log('  ok  skirt_shading: light, naming the skirt, whose colour it opens');

  // Baked into a filmstrip (Assets › bake), at rest: as the canvas draws it, where the knob covers the
  // pixel whole (its shading multiplied, its light added; before, each went on as plain paint).
  const insideKnob = [[16, 48], [80, 48], [58, 40], [48, 20]];
  const baked = await page.evaluate(async ({ data, points, size }) => {
    const file = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { planPsdComponentImport } = await window.__ceImport('/src/CE_Application/utils/psdComponentImport.js');
    const { bakeCustomComponentFilmstrip } = await window.__ceImport('/src/CE_Application/utils/customComponentFilmstripBaker.js');
    const strip = await bakeCustomComponentFilmstrip(planPsdComponentImport(file, { fileName: 'blender-knob.psd' }).component, { frameCount: 3, valueSource: 'mainValue' });
    const image = new Image();
    image.src = strip.source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    // The middle frame: the dial at rest.
    return points.map(([x, y]) => [...context.getImageData(x, size + y, 1, 1).data]);
  }, { data: bytes, points: insideKnob, size: SIZE });
  for (const [i, [x, y]] of insideKnob.entries()) {
    const shown = await pixelAt(x, y);
    assert.equal(baked[i][3], 255, `baked at ${x}, ${y}: covered whole`);
    assert.ok(near(baked[i].slice(0, 3), shown, 10), `baked at ${x}, ${y}: ${baked[i].slice(0, 3)}, the canvas ${shown}`);
  }
  console.log('  ok  baked into a filmstrip, the knob is as the canvas draws it: its shading and light in their modes');

  assert.deepEqual(kit.failures, [], 'the page must not throw');
  console.log('pictureColour: a picture layer\'s colour changes with its light kept');
} finally {
  await kit.close();
}
