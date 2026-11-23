// The Figma plugin (tools/figma-plugin): run here in a sandbox with a stand-in for Figma's `figma`
// object, its exports written as Figma writes them, and what it saves read by CEditor's SVG
// component import. It has not run in Figma itself here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { planSvgComponentImport } from '../src/CE_Application/utils/svgComponentImport.js';

const pluginUrl = (file) => new URL(`../../../tools/figma-plugin/${file}`, import.meta.url);
const source = readFileSync(pluginUrl('code.js'), 'utf8');
const bytes = (text) => new Uint8Array(Buffer.from(text, 'utf8'));
const base64Encode = (data) => Buffer.from(data).toString('base64');
/** What the sandbox hands back, as this realm's plain values (its arrays are another realm's). */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The plugin's functions, run in a sandbox; with `figma`, its main() runs too. */
function load(figma = undefined) {
  const context = vm.createContext({ console, setTimeout, __html__: '<html></html>', ...(figma ? { figma } : {}) });
  vm.runInContext(source, context);
  return context;
}

/** A Figma node as the plugin sees it. */
function node(name, { type = 'RECTANGLE', children, svg = '', png = [1, 2, 3], box = { x: 0, y: 0, width: 100, height: 100 }, render = null, effects = [], visible = true, isMask = false, variantProperties = null } = {}) {
  return {
    name, type, children, visible, isMask, effects, variantProperties,
    absoluteBoundingBox: box, absoluteRenderBounds: render ?? box,
    exportAsync: async (options) => (options.format === 'PNG' ? new Uint8Array(png) : bytes(svg)),
  };
}

const knobSvg = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Knob / Vintage">
<circle id="skirt" cx="50" cy="50" r="40" fill="#4D4D4D"/>
<circle id="cap" cx="50" cy="50" r="28" fill="url(#paint0_linear_1_4)"/>
<rect id="pointer" x="48" y="18" width="4" height="22" fill="#FF8000"/>
<circle id="Ellipse 12" cx="80" cy="80" r="3" fill="white"/>
</g>
<defs>
<linearGradient id="paint0_linear_1_4" x1="22" y1="50" x2="78" y2="50" gradientUnits="userSpaceOnUse">
<stop stop-color="#E6E6E6"/>
<stop offset="1" stop-color="#808080"/>
</linearGradient>
</defs>
</svg>`;

const knob = () => node('Knob / Vintage', {
  type: 'FRAME', svg: knobSvg,
  children: [
    node('skirt', { type: 'ELLIPSE' }),
    node('cap', { type: 'ELLIPSE' }),
    node('shadow', { type: 'ELLIPSE', effects: [{ type: 'DROP_SHADOW', visible: true }] }),
    node('pointer'),
    node('Ellipse 12', { type: 'ELLIPSE' }),
  ],
});

test('the plugin reads names with CEditor\'s words, in CEditor\'s order, and the installer ships it', () => {
  const importer = readFileSync(new URL('../src/CE_Application/utils/artworkComponent.js', import.meta.url), 'utf8');
  const table = (text) => {
    const from = text.indexOf('const ROLE_WORDS = [');
    const block = text.slice(from, text.indexOf('\n]', from));
    return [...block.matchAll(/\['(\w+)', \[([^\]]*)\]\]/g)].map(([, role, words]) => [role, [...words.matchAll(/'(\w+)'/g)].map((m) => m[1])]);
  };
  assert.equal(table(importer).length, 7);
  assert.deepEqual(table(source), table(importer));
  const installer = readFileSync(new URL('../../../tools/scripts/package-installer.ps1', import.meta.url), 'utf8');
  for (const file of ['manifest.json', 'code.js', 'ui.html']) {
    assert.ok(existsSync(pluginUrl(file)), file);
    assert.match(installer, new RegExp(`figma-plugin\\\\${file.replace('.', '\\.')}`), `the installer copies ${file}`);
  }
});

test('the manifest asks for no network and pages loaded as needed', () => {
  const manifest = JSON.parse(readFileSync(pluginUrl('manifest.json'), 'utf8'));
  assert.equal(manifest.main, 'code.js');
  assert.equal(manifest.ui, 'ui.html');
  assert.deepEqual(manifest.editorType, ['figma']);
  assert.equal(manifest.documentAccess, 'dynamic-page');
  assert.deepEqual(manifest.networkAccess, { allowedDomains: ['none'] });
});

test('the window lists what each layer will do, and warns where a name or an effect will not come across', () => {
  const { describeSelection } = load();
  const described = plain(describeSelection([knob()], { text: true, variants: true, flatten: false }));
  assert.equal(described.ok, true);
  assert.equal(described.name, 'Knob / Vintage');
  assert.deepEqual(described.rows.map((r) => [r.name, r.does, r.warn]), [
    ['skirt', 'stays put', false],
    ['cap', 'stays put', false],
    ['shadow', 'stays put, its effect not drawn', false],
    ['pointer', 'turns with the value', false],
    ['Ellipse 12', 'no name: comes in as a layer that stays put', true],
  ]);
  assert.match(described.notes.join(' '), /Flatten effects into pictures/);
  assert.equal(describeSelection([knob()], { flatten: true }).rows[2].does, 'stays put, effect drawn into its picture');
  assert.match(describeSelection([], {}).message, /^Select one frame/);
  assert.match(describeSelection([node('Vector 3', { type: 'VECTOR' })], {}).message, /not one of its layers/);
});

test('a frame is saved as Figma writes it, its layers named, and CEditor makes a dial of it', async () => {
  const { exportSelection } = load();
  const result = await exportSelection([knob()], { text: true, variants: true, flatten: false }, { base64Encode });
  assert.equal(result.ok, true);
  assert.equal(result.fileName, 'Knob - Vintage.svg');
  const plan = planSvgComponentImport(result.svg, { fileName: result.fileName });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'dial');
  assert.deepEqual(plan.report.turns, ['pointer']);
});

test('a component set\'s on and off variants become the on and off looks of a switch', async () => {
  const variant = (state, lamp) => node(`State=${state}`, {
    type: 'COMPONENT', variantProperties: { State: state }, children: [node('body'), node('lamp', { type: 'ELLIPSE' })],
    svg: `<svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="State=${state}"><rect id="body" width="60" height="60" rx="8" fill="url(#paint0_linear_9_${state})"/><circle id="lamp" cx="30" cy="30" r="8" fill="${lamp}"/></g><defs><linearGradient id="paint0_linear_9_${state}" x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#555"/><stop offset="1" stop-color="#222"/></linearGradient></defs></svg>`,
  });
  const off = variant('Off', '#330000');
  const set = node('Switch', { type: 'COMPONENT_SET', children: [off, variant('On', '#FF2200')] });
  set.defaultVariant = off;
  const { describeSelection, exportSelection } = load();
  const described = plain(describeSelection([set], { variants: true }));
  assert.equal(described.kind, 'component set, 2 variants');
  assert.deepEqual(described.rows.map((r) => [r.name, r.does]), [['State=On', 'shown when on (the whole variant)'], ['body', 'stays put'], ['lamp', 'shown when on']]);
  const result = await exportSelection([set], { text: true, variants: true }, { base64Encode });
  assert.match(result.svg, /^<svg [^>]*width="60" height="60"/);
  assert.match(result.svg, /<g id="off">.*<g id="on">/s);
  assert.doesNotMatch(result.svg, /id="lamp"|id="State=/, 'a state named inside a state\'s look would win over it');
  assert.match(result.svg, /<linearGradient id="v1_paint0_linear_9_Off"/, 'definitions kept apart, and kept whatever their ids say');
  assert.match(result.svg, /<linearGradient id="v2_paint0_linear_9_On"/);
  const plan = planSvgComponentImport(result.svg, { fileName: result.fileName });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.kind, 'switch');
  // Everything in each look takes its state from the look, under its own name where it has one.
  assert.deepEqual([plan.report.on.length, plan.report.off.length], [2, 2], JSON.stringify(plan.report));
});

test('a button\'s pressed variant is its pressed look over the one at rest, whose own name says nothing', async () => {
  const variant = (pressed, fill) => node(`Pressed=${pressed}`, {
    type: 'COMPONENT', variantProperties: { Pressed: pressed }, children: [node('key')],
    svg: `<svg width="40" height="20" viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="Pressed=${pressed}"><rect id="key" width="40" height="20" rx="4" fill="${fill}"/></g></svg>`,
  });
  const rest = variant('false', '#444444');
  const set = node('Play button', { type: 'COMPONENT_SET', children: [rest, variant('true', '#222222')] });
  set.defaultVariant = rest;
  const { exportSelection } = load();
  const result = await exportSelection([set], { variants: true }, { base64Encode });
  assert.match(result.svg, /<g id="Play button"><g><rect id="key"[^>]*fill="#444444"\/><\/g><\/g><g id="pressed">/);
  const plan = planSvgComponentImport(result.svg, { fileName: result.fileName });
  assert.equal(plan.kind, 'button');
  assert.deepEqual(plan.report.pressed.length, 1);
});

test('Flatten effects into pictures: each layer on its own, one with a shadow as a picture of it, where Figma draws it', async () => {
  const frame = node('Knob', {
    type: 'FRAME', box: { x: 100, y: 200, width: 100, height: 100 },
    children: [
      node('skirt', { type: 'ELLIPSE', box: { x: 110, y: 210, width: 80, height: 80 }, svg: '<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle id="skirt" cx="40" cy="40" r="40" fill="#4D4D4D"/></svg>' }),
      node('shadow', { type: 'ELLIPSE', box: { x: 110, y: 210, width: 80, height: 80 }, render: { x: 105, y: 208, width: 90, height: 90 }, effects: [{ type: 'DROP_SHADOW', visible: true }] }),
      node('pointer', { box: { x: 148, y: 218, width: 4, height: 22 }, svg: '<svg width="4" height="22" viewBox="0 0 4 22" fill="none" xmlns="http://www.w3.org/2000/svg"><rect id="pointer" width="4" height="22" fill="#FF8000"/></svg>' }),
    ],
  });
  const { exportSelection } = load();
  const { svg } = await exportSelection([frame], { text: true, variants: true, flatten: true }, { base64Encode });
  assert.match(svg, /<image id="shadow" x="5" y="8" width="90" height="90" preserveAspectRatio="none" href="data:image\/png;base64,AQID"\/>/);
  assert.match(svg, /<g id="pointer" transform="translate\(48 18\)">/);
  const plan = planSvgComponentImport(svg, { fileName: 'Knob.svg' });
  assert.equal(plan.ok, true, plan.error);
  assert.deepEqual(plan.report.turns, ['pointer']);
  assert.ok(plan.component._children.Parts._children.shadow, 'the shadow a picture layer');
});

test('in Figma: the window is told the selection, Save hands it the file, names in any script intact', async () => {
  const posted = [];
  const figma = {
    currentPage: { selection: [knob()] },
    showUI(html, options) { this.shown = { html, options }; },
    ui: { postMessage: (message) => posted.push(message), onmessage: null },
    on(event, fn) { this.listeners = { ...(this.listeners ?? {}), [event]: fn }; },
    notify(message) { this.notices = [...(this.notices ?? []), message]; },
    closePlugin() { this.closed = true; },
    base64Encode,
  };
  const { utf8Decode, utf8Encode } = load(figma);
  assert.equal(figma.shown.html, '<html></html>');
  assert.equal(typeof figma.listeners.selectionchange, 'function');
  assert.equal(posted[0].type, 'selection');
  assert.equal(posted[0].ok, true);
  await figma.ui.onmessage({ type: 'export' });
  const saved = posted.find((message) => message.type === 'save');
  assert.equal(saved.fileName, 'Knob - Vintage.svg');
  assert.match(Buffer.from(saved.bytes).toString('utf8'), /<circle id="skirt"/);
  await figma.ui.onmessage({ type: 'saved', fileName: saved.fileName });
  assert.match(figma.notices.at(-1), /New Component from Vector Artwork/);
  const words = 'Lautstärke ✓ 𝄞';
  assert.equal(utf8Decode(utf8Encode(words)), words);
  assert.deepEqual(Array.from(utf8Encode(words)), Array.from(Buffer.from(words, 'utf8')));
});
