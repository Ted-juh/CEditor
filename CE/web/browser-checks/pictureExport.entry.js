/**
 * File → Export Picture, held to the screen (browser-checks/pictureExport.mjs).
 *
 * The editor's own surface (PanelSurface, as the canvas mounts it) draws a real panel; the export's
 * own code (stores/pictureExport.js) takes its picture; the check compares that, pixel by pixel,
 * with Chromium's screenshot of the same surface. The panel fonts are loaded as the app loads them,
 * so the picture has to carry them to come out right.
 */
import { mount, tick } from 'svelte';
import '../src/assets/fonts/panelFonts.css';
import PanelSurface from '../src/CE_Application/editor/PanelSurface.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { buildSolidStyle, buildGradientStyle } from '../src/CE_Application/utils/backgroundCSS.js';
import { pictureSurface, renderFilmstrip, renderPanelPicture } from '../src/CE_Application/stores/pictureExport.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';

window.__JUCE__ = undefined;

function pixels(canvas) {
  const ctx = canvas.getContext('2d');
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

async function imageData(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return { width: canvas.width, height: canvas.height, data: pixels(canvas) };
}

/** How far two pictures of the same size are apart: share of pixels off by more than 48 levels, and the mean. */
function compare(a, b) {
  let far = 0; let sum = 0;
  const n = a.data.length / 4;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    sum += d;
    if (d > 48) far += 1;
  }
  return { far: far / n, mean: sum / n };
}

let panel = null;
let surface = null;
const lastPicture = { canvas: null };

window.__picture = {
  async load(url) {
    panel = deserializePanel(await (await fetch(url)).text(), 'picture.cepanel', 'picture');
    panels.set([panel]);
    activePanelId.set(panel.id);
    mount(PanelSurface, {
      target: document.getElementById('host'),
      props: {
        panel,
        scale: 1,
        bgLayers: { solid: buildSolidStyle(panel), gradient: buildGradientStyle(panel) },
        gridStyle: '',
        marquee: { isActive: false },
        marqueeRect: { x: 0, y: 0, w: 0, h: 0 },
      },
    });
    await tick();
    surface = document.querySelector('.panel-surface');
    pictureSurface.set({ element: surface, panelId: panel.id });
    return { width: panel.width, height: panel.height, controls: flatControls(panel.controls).length };
  },
  /** The surface's inside (its padding box) on the page, for the screenshot. */
  box() {
    const rect = surface.getBoundingClientRect();
    return { x: rect.left + surface.clientLeft, y: rect.top + surface.clientTop, width: surface.clientWidth, height: surface.clientHeight };
  },
  select(ids) { selectedComponentIds.set(new Set(ids)); return tick(); },
  /** The first component with a number for its value: a knob or a fader. */
  firstComponentWithRange() {
    const control = flatControls(panel.controls).find((c) => {
      if (c._children?.Core?.controlType !== 'CustomComponent') return false;
      const channels = c._children?.ValueChannels?._children ?? {};
      const main = channels.mainValue ?? Object.values(channels)[0];
      return !!main && !['enum', 'array', 'bool'].includes(String(main.type ?? 'float'));
    });
    return control ? { id: control._children.Core.id, name: control._children.Core.name, w: control._children.Transform?.width, h: control._children.Transform?.height } : null;
  },
  firstOfType(type) {
    const control = flatControls(panel.controls).find((c) => c._children?.Core?.controlType === type);
    return control?._children?.Core?.id ?? null;
  },
  async picture(options) {
    const started = performance.now();
    const result = await renderPanelPicture({ panelId: panel.id, ...options });
    if (!result.ok) return { ok: false, reason: result.reason };
    lastPicture.canvas = result.canvas;
    return {
      ok: true, width: result.canvas.width, height: result.canvas.height, ms: Math.round(performance.now() - started),
      missing: result.missing, unreadable: result.unreadable, unresolved: result.unresolved, svgBytes: result.svg.length,
    };
  },
  /** The last picture against a screenshot (a PNG data URL) of the same region. */
  async compareWith(screenshotUrl) {
    const shot = await imageData(screenshotUrl);
    const canvas = lastPicture.canvas;
    if (shot.width !== canvas.width || shot.height !== canvas.height) {
      return { sizeMismatch: [shot.width, shot.height, canvas.width, canvas.height] };
    }
    return compare({ data: pixels(canvas) }, shot);
  },
  /** Share of the last picture's pixels that are fully transparent, and that are opaque. */
  coverage() {
    const data = pixels(lastPicture.canvas);
    let clear = 0; let solid = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) clear += 1; else if (data[i] === 255) solid += 1; }
    const n = data.length / 4;
    return { clear: clear / n, solid: solid / n };
  },
  lastPictureUrl() { return lastPicture.canvas.toDataURL('image/png'); },
  async filmstrip(id, options) {
    const control = flatControls(panel.controls).find((c) => c._children?.Core?.id === id);
    const result = await renderFilmstrip(control, options);
    if (!result.ok) return result;
    const data = pixels(result.canvas);
    const { frameWidth: w, frameHeight: h, frameCount: count } = result;
    // How many pixels differ between each frame and the next.
    const changes = [];
    for (let f = 1; f < count; f += 1) {
      let changed = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const at = (frame) => (((result.orientation === 'horizontal' ? y : frame * h + y) * result.canvas.width) + (result.orientation === 'horizontal' ? frame * w + x : x)) * 4;
          const a = at(f - 1); const b = at(f);
          if (Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) + Math.abs(data[a + 3] - data[b + 3]) > 24) changed += 1;
        }
      }
      changes.push(changed);
    }
    let drawn = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) drawn += 1;
    lastPicture.canvas = result.canvas;
    return { ok: true, width: result.canvas.width, height: result.canvas.height, count, frameWidth: w, frameHeight: h, kind: result.kind, changes, drawn };
  },
};
