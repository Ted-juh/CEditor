/**
 * The Assets tab, in a real browser.
 *
 * The model is unit-tested and that covers the arithmetic. What it cannot cover is the thing the
 * tab is for: that a strip which does not divide evenly SAYS SO on screen, that the offered repair
 * actually writes the properties, and that the frames drawn are the frames the renderer would draw.
 * Those need a real image with a real natural size, so this harness bakes two strips and an image
 * on a canvas and puts them in the control.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import AssetsTab from '../src/CE_Application/components/AssetsTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { activateEditorTarget, editorTarget } from '../src/CE_Application/stores/editorTarget.js';

const CONTROL_ID = 'ctrl_as_1';

/**
 * A knob filmstrip the shape real ones are: `frames` square cells stacked, each a dial turned a
 * little further than the last. The fixture used to be 34x900 with seven-pixel frames, which is
 * nothing anybody exports and made the tab look far stranger in a screenshot than it does in use.
 */
function makeStrip({ size, frames, ink }) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * frames;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < frames; i += 1) {
    const angle = (-135 + (270 * i) / Math.max(1, frames - 1)) * (Math.PI / 180);
    const top = i * size;
    ctx.fillStyle = i % 2 ? '#16222A' : '#101A20';
    ctx.fillRect(0, top, size, size);
    const cx = size / 2;
    const cy = top + size / 2;
    const r = size / 2 - 6;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(angle) * r, cy - Math.cos(angle) * r);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

function makeImage({ width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#243642';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#8FEDE3';
  ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
  return canvas.toDataURL('image/png');
}

const control = createControl('CustomComponent');
control._children.Core.id = CONTROL_ID;
control._children.Core.name = 'Big Knob';
control._children.Transform.width = 120;
control._children.Transform.height = 120;

// A real 32-frame strip with 30 typed in — the common way this goes wrong. 3072 does not divide by
// 30, so the renderer slices at 102.4px against frames drawn at 96px and is a frame and a half out
// by the end. The nearest divisor is 32, which is also the truth.
control._children.Assets.filmstrips.driftStrip = {
  _type: 'FilmstripAsset',
  name: 'driftStrip',
  source: makeStrip({ size: 96, frames: 32, ink: '#C08A4E' }),
  frameCount: 30,
  frameWidth: 96,
  frameHeight: 102,
  orientation: 'vertical',
  interpolation: 'nearest',
  valueSource: 'mainValue',
  package: true,
};

// The same strip with the count it really has.
control._children.Assets.filmstrips.cleanStrip = {
  _type: 'FilmstripAsset',
  name: 'cleanStrip',
  source: makeStrip({ size: 96, frames: 32, ink: '#4E6272' }),
  frameCount: 32,
  frameWidth: 96,
  frameHeight: 96,
  orientation: 'vertical',
  interpolation: 'nearest',
  valueSource: 'mainValue',
  package: true,
};

// Records 64x64 but is really 96x48 — the image half of the same check.
control._children.Assets.images.knobFace = {
  _type: 'ImageAsset',
  name: 'knobFace',
  source: makeImage({ width: 96, height: 48 }),
  width: 64,
  height: 64,
  package: true,
};

panels.set([{ id: 'p1', name: 'Check', width: 640, height: 360, bgColour: 'FF1E1E1E', controls: [control] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([CONTROL_ID]));
activateEditorTarget('assets', CONTROL_ID);

mount(AssetsTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const assets = () => get(panels)[0].controls[0]._children.Assets;

window.__as = {
  target: () => get(editorTarget),

  tiles: () => [...document.querySelectorAll('.tile')].map((tile) => textOf(tile.querySelector('.name'))),
  tileKinds: () => [...document.querySelectorAll('.tile')].map((tile) => (tile.querySelector('.badge')?.classList.contains('film') ? 'film' : 'img')),
  // A filmstrip tile paints one frame on an inner box of the frame's own shape; an image paints
  // straight on the tile. Look at whichever is carrying the picture.
  tilePainted: () => [...document.querySelectorAll('.tile .box')].map((box) => box.querySelector('.fr') ?? box),
  tileInk: () => window.__as.tilePainted().map((el) => (getComputedStyle(el).backgroundImage || 'none').length),
  tilePositions: () => window.__as.tilePainted().map((el) => getComputedStyle(el).backgroundPosition),
  tileAspects: () => window.__as.tilePainted().map((el) => {
    const box = el.getBoundingClientRect();
    return box.height > 0 ? Number((box.width / box.height).toFixed(2)) : 0;
  }),
  select: (name) => {
    const tile = [...document.querySelectorAll('.tile')].find((t) => textOf(t.querySelector('.name')) === name);
    tile?.click();
    return !!tile;
  },
  selected: () => textOf(document.querySelector('.tile.sel .name')),

  stageHeader: () => textOf(document.querySelector('.stagecol .colh')),
  frameCount: () => document.querySelectorAll('.stage .frame').length,
  framePositions: () => [...document.querySelectorAll('.stage .frame')].map((f) => f.style.backgroundPosition),
  frameSizes: () => [...document.querySelectorAll('.stage .frame')].map((f) => f.style.backgroundSize),
  readout: () => textOf(document.querySelector('.readout')),
  currentFrame: () => [...document.querySelectorAll('.stage .frame')].findIndex((f) => f.classList.contains('cur')),
  stepForward: () => { [...document.querySelectorAll('.stepper button')][1]?.click(); },
  stepBack: () => { [...document.querySelectorAll('.stepper button')][0]?.click(); },
  clickFrame: (index) => { [...document.querySelectorAll('.stage .frame')][index]?.click(); },

  check: () => textOf(document.querySelector('.check')),
  checkClass: () => (document.querySelector('.check')?.className ?? ''),
  fixes: () => [...document.querySelectorAll('.check .fixes button')].map(textOf),
  applyFix: (index) => { [...document.querySelectorAll('.check .fixes button')][index]?.click(); },

  settingLabels: () => [...document.querySelectorAll('.settings .r > label')].map(textOf),
  setSegment: (labelText, option) => {
    const row = [...document.querySelectorAll('.settings .r')].find((r) => textOf(r.querySelector('label')) === labelText);
    const button = [...(row?.querySelectorAll('button') ?? [])].find((b) => textOf(b) === option);
    button?.click();
    return !!button;
  },

  strip: (name) => {
    const entry = assets().filmstrips[name];
    return entry ? { frameCount: entry.frameCount, frameWidth: entry.frameWidth, frameHeight: entry.frameHeight, width: entry.width, height: entry.height, orientation: entry.orientation, package: entry.package } : null;
  },
  image: (name) => {
    const entry = assets().images[name];
    return entry ? { width: entry.width, height: entry.height } : null;
  },
  policy: () => ({ ...assets().packagePolicy }),
  names: () => ({ images: Object.keys(assets().images), filmstrips: Object.keys(assets().filmstrips) }),

  removeSelected: () => {
    [...document.querySelectorAll('.acts button')].find((b) => textOf(b) === 'Remove')?.click();
  },

  openBake: () => { [...document.querySelectorAll('.tools button')].find((b) => textOf(b) === 'Bake')?.click(); },
  bakeVisible: () => !!document.querySelector('.bake'),
  bakeEstimate: () => textOf(document.querySelector('.bake .est')),

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
};

/**
 * A probe for what the renderer's CSS ACTUALLY does with a frame count.
 *
 * This exists because the first version of the Assets tab shipped with the wrong explanation of its
 * own finding — it said the proportional background positioning drifts, and it does not: the
 * browser lands every frame exactly on the i-th of `frameCount` equal slices of the image, divisible
 * or not. What breaks is the assumption that the image is nothing but frames. The driver builds a
 * strip whose every frame is filled with its own index as a colour, gives an element exactly the CSS
 * InteractivePartRenderer emits, and reads back which frame appeared. No reasoning about percentage
 * semantics — the browser answers.
 */
window.__probe = {
  /** `tail` extra rows that belong to no frame, the way a badly exported strip carries them. */
  strip: (frames, pitch, tail) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = frames * pitch + tail;
    const ctx = canvas.getContext('2d');
    for (let f = 0; f < frames; f += 1) {
      ctx.fillStyle = `rgb(${f % 256}, ${Math.floor(f / 256)}, 128)`;
      ctx.fillRect(0, f * pitch, 8, pitch);
    }
    ctx.fillStyle = 'rgb(255,255,0)';
    ctx.fillRect(0, frames * pitch, 8, tail);
    return { source: canvas.toDataURL('image/png'), height: canvas.height };
  },

  mount: (source, frameCount, frameIndex, box) => {
    let el = document.getElementById('probe-box');
    if (!el) {
      el = document.createElement('div');
      el.id = 'probe-box';
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.bottom = '0';
      document.body.appendChild(el);
    }
    const offset = frameCount <= 1 ? 0 : (frameIndex / (frameCount - 1)) * 100;
    el.style.width = `${box}px`;
    el.style.height = `${box}px`;
    el.style.backgroundImage = `url("${source}")`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.imageRendering = 'pixelated';
    el.style.backgroundSize = `100% ${frameCount * 100}%`;
    el.style.backgroundPosition = `0% ${offset}%`;
  },

  /** Decode a screenshot of the probe box and say which frame its centre pixel came from. */
  read: (dataUrl, box) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const mid = Math.floor(box / 2);
      const px = ctx.getImageData(mid, mid, 1, 1).data;
      resolve(px[0] === 255 && px[1] === 255 && px[2] === 0 ? 'tail' : px[0] + px[1] * 256);
    };
    img.src = dataUrl;
  }),
};
