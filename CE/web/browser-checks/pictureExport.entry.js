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

/**
 * How far two pictures of the same size are apart, as the share of pixels with nothing like them in
 * the other picture: a pixel counts only when no pixel within one of it, there, is within 48 levels
 * in every channel. That forgives what differs between two drawings of the same text — where its
 * antialiasing lands, a pixel either way — and nothing that is missing, extra or recoloured, which
 * no neighbour can stand in for. Both ways round, so something the picture lacks counts as much as
 * something it adds. `cells` are the worst 40-pixel squares, to say where when it is not.
 */
function compare(a, b, width, height) {
  const near = (from, to, i, x, y) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        const j = (yy * width + xx) * 4;
        if (Math.abs(from[i] - to[j]) <= 48 && Math.abs(from[i + 1] - to[j + 1]) <= 48 && Math.abs(from[i + 2] - to[j + 2]) <= 48) return true;
      }
    }
    return false;
  };
  let far = 0; let sum = 0;
  const cells = new Map();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      sum += Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (near(a, b, i, x, y) && near(b, a, i, x, y)) continue;
      far += 1;
      const key = `${Math.floor(x / 40) * 40},${Math.floor(y / 40) * 40}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
  }
  const n = width * height;
  const worst = [...cells].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([at, count]) => `${at}:${count}`);
  return { far: far / n, mean: sum / n, cells: worst };
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
    return compare(pixels(canvas), shot.data, canvas.width, canvas.height);
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
