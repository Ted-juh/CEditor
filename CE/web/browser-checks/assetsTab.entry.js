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

/** A vertical strip of `frames` cells, each one a dial rotated a little further than the last. */
function makeStrip({ width, height, frames }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const cell = height / frames;
  for (let i = 0; i < frames; i += 1) {
    const angle = (-135 + (270 * i) / Math.max(1, frames - 1)) * (Math.PI / 180);
    ctx.fillStyle = i % 2 ? '#16222A' : '#101A20';
    ctx.fillRect(0, i * cell, width, cell);
    ctx.strokeStyle = '#4E6272';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const cx = width / 2;
    const cy = i * cell + cell / 2;
    const r = Math.min(width, cell) / 2 - 2;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
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

// 900 does not divide by 128 — this is the defect the tab exists to show.
control._children.Assets.filmstrips.driftStrip = {
  _type: 'FilmstripAsset',
  name: 'driftStrip',
  source: makeStrip({ width: 34, height: 900, frames: 30 }),
  frameCount: 128,
  frameWidth: 34,
  frameHeight: 7,
  orientation: 'vertical',
  interpolation: 'nearest',
  valueSource: 'mainValue',
  package: true,
};

// 896 divides by 128 exactly.
control._children.Assets.filmstrips.cleanStrip = {
  _type: 'FilmstripAsset',
  name: 'cleanStrip',
  source: makeStrip({ width: 32, height: 896, frames: 28 }),
  frameCount: 128,
  frameWidth: 32,
  frameHeight: 7,
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
  tileInk: () => [...document.querySelectorAll('.tile .box')].map((box) => (getComputedStyle(box).backgroundImage || 'none').length),
  tilePositions: () => [...document.querySelectorAll('.tile .box')].map((box) => getComputedStyle(box).backgroundPosition),
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
