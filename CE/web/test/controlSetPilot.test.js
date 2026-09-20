// controlSetPilot.test.js — control sets beyond colour: the pilot (docs/design/control-sets.md).
//
// Three sets, one per tier, and three mechanisms they prove:
//
//   Ivory     — a set is a FILE. The package envelope round-trips, an import lands in the library
//               and the document, and the document's copy wins over the reader's.
//   Tolex     — a set changes a family's PARTS. The patch applies only where the control still
//               holds its factory default, so an author's edit survives a set switch; the knob gets
//               a body and a chicken-head, the buttons get their corners.
//   Machined  — a set carries a LIT MATERIAL and a lamp. The Effects section knows the material,
//               the filter maths follows the recipe, the build bakes the family patch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import {
  BUILT_IN_CONTROL_SETS,
  CONTROL_SET_TOKEN_NAMES,
  controlSetForPanel,
  getControlSet,
  normalizeControlSetDefinition,
  normalizeControlSetList,
  resolveToken,
} from '../src/CE_Application/models/controlSets.js';
import {
  CONTROL_SET_PACKAGE_FORMAT,
  controlSetFileName,
  createControlSetEnvelope,
  fingerprintControlSet,
  normalizeControlSetEnvelope,
} from '../src/CE_Application/models/controlSetPackage.js';
import {
  familyPatchFor,
  pristineControlFor,
  readControlPath,
  resolveControlFamily,
  resolveControlForSet,
  writeControlPath,
} from '../src/CE_Application/models/controlSetFamilies.js';
import { DEFAULT_LAMP, MATERIAL_KINDS, materialActive, materialPrimitives, resolveMaterialLamp } from '../src/CE_Application/utils/materialFilter.js';
import { buttonFamily, knobFamily, lampFamily, mergeFamilies, sliderFamily, typeFamilies } from '../src/CE_Application/models/controlSetRecipes.js';
import { hasSurfaceEffects } from '../src/CE_Application/utils/surfaceEffects.js';
import { COMPONENT_GROUPS } from '../src/CE_Application/utils/effectStack.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createSliderSemanticParts, resolveSliderSemanticParts } from '../src/CE_Application/utils/sliderEntityFactory.js';
import { buildSolidStyle } from '../src/CE_Application/utils/backgroundCSS.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { activeControlSet, setActivePanelControlSet } from '../src/CE_Application/stores/controlSets.js';
import {
  adoptDocumentControlSets,
  availableControlSets,
  controlSetLibrary,
  exportControlSetEnvelope,
  importControlSetText,
  mergeControlSetLists,
} from '../src/CE_Application/stores/controlSetLibrary.js';
import { SETS_DIR, SHIPPED_SET_IDS, shippedSetFile } from '../scripts/export-control-sets.mjs';

const tolex = getControlSet('tolex');
const machined = getControlSet('machined');
const ivory = getControlSet('ivory');

function part(control, name) {
  return control?._children?.Parts?._children?.[name];
}

function openPanel(overrides = {}) {
  const panel = { ...createPanel(), id: 9100 + Math.floor(Math.random() * 800), ...overrides };
  panels.set([panel]);
  activePanelId.set(panel.id);
  return panel;
}

function currentPanel() {
  return get(panels).find((p) => p.id === get(activePanelId));
}

// ---------------------------------------------------------------------------------------------
// The sets themselves
// ---------------------------------------------------------------------------------------------

test('Tolex and Machined are built in, define every role, and carry what colour cannot', () => {
  for (const set of [tolex, machined]) {
    assert.ok(set, 'the pilot set is built in');
    for (const name of CONTROL_SET_TOKEN_NAMES) {
      assert.match(resolveToken(name, set) ?? '', /^[0-9A-F]{6,8}$/, `${set.id} defines ${name}`);
    }
    assert.deepEqual(set.lamp, { azimuth: 225, elevation: 48 });
    assert.ok(familyPatchFor(set, 'Knob'), `${set.id} says something about knobs`);
    assert.ok(familyPatchFor(set, 'Button'), `${set.id} says something about buttons`);
    assert.equal(set.panel.material.enabled, true);
  }
  // Graphite follows its board too now: a body under the pointer, no ticks, the value below.
  assert.equal(familyPatchFor(getControlSet('graphite'), 'Knob').parts.pointerCurrent.kind, 'capdot');
  assert.equal(BUILT_IN_CONTROL_SETS.filter((set) => ['tolex', 'machined'].includes(set.id)).length, 2);
});

test('the catalogue: sixty-six built-in sets, each id once, every family patch landing on a real control', () => {
  const ids = BUILT_IN_CONTROL_SETS.map((set) => set.id);
  assert.equal(ids.length, 66);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(ids[0], 'graphite', 'the default set comes first');
  for (const set of BUILT_IN_CONTROL_SETS) {
    for (const [type, family] of Object.entries(set.families ?? {})) {
      const control = createControl(type);
      const styled = resolveControlForSet(control, set);
      for (const path of Object.keys(family.component ?? {})) {
        assert.notEqual(readControlPath(styled, path), undefined, `${set.id}/${type}: ${path} lands`);
      }
      for (const [partName, patch] of Object.entries(family.parts ?? {})) {
        assert.ok(part(control, partName), `${set.id}/${type}: part ${partName} exists on a factory control`);
        for (const path of Object.keys(patch)) {
          assert.notEqual(readControlPath(part(styled, partName), path), undefined, `${set.id}/${type}/${partName}: ${path} lands`);
        }
      }
    }
    if (set.families?.Knob?.parts?.bodyCap) {
      assert.equal(part(resolveControlForSet(createControl('Knob'), set), 'bodyCap').visible, true, `${set.id}: the cap is on`);
    }
    if (set.panel?.material) assert.ok(MATERIAL_KINDS.includes(set.panel.material.kind), `${set.id}: a known panel finish`);
  }
  // Ember's board showed a chicken-head; Ivory's a black-bodied knob with a coloured pointer.
  assert.equal(getControlSet('ember').families.Knob.parts.pointerCurrent.kind, 'chicken');
  assert.equal(getControlSet('ivory').families.Knob.parts.bodyCap.visible, true);
  // And the sets actually differ where it shows.
  assert.equal(new Set(BUILT_IN_CONTROL_SETS.map((set) => resolveToken('control.cap', set))).size > 20, true);
});

test('normalizeControlSetDefinition keeps a set, drops what is not one, and normalises the extras', () => {
  assert.equal(normalizeControlSetDefinition(null), null);
  assert.equal(normalizeControlSetDefinition({ name: 'no id', tokens: {} }), null);
  assert.equal(normalizeControlSetDefinition({ id: 'x' }), null, 'no tokens is not a set');
  const set = normalizeControlSetDefinition({ id: ' x ', tokens: { accent: ' ff112233 ' }, lamp: { azimuth: '10', elevation: 'nope' }, families: 'bad' });
  assert.deepEqual(set, { id: 'x', name: 'x', description: '', tokens: { accent: 'ff112233' } });
  const withLamp = normalizeControlSetDefinition({ id: 'y', name: 'Y', tokens: {}, lamp: { azimuth: 10, elevation: 20 }, families: { Knob: {} }, panel: { colour: 'FF000000' } });
  assert.deepEqual(withLamp.lamp, { azimuth: 10, elevation: 20 });
  assert.deepEqual(withLamp.families, { Knob: {} });
  assert.deepEqual(withLamp.panel, { colour: 'FF000000' });
  assert.deepEqual(normalizeControlSetList([withLamp, withLamp, null, { id: 'z', tokens: {} }]).map((s) => s.id), ['y', 'z']);
});

// ---------------------------------------------------------------------------------------------
// Tier one: the file
// ---------------------------------------------------------------------------------------------

test('a set round-trips through its file envelope, fingerprint and all', () => {
  const envelope = createControlSetEnvelope(ivory, { author: 'Someone', license: 'MIT' });
  assert.equal(envelope.format, CONTROL_SET_PACKAGE_FORMAT);
  assert.equal(envelope.metadata.author, 'Someone');
  assert.equal(controlSetFileName(ivory), 'ivory.ceditor-controlset.json');

  const back = normalizeControlSetEnvelope(JSON.stringify(envelope));
  assert.deepEqual(back.set, normalizeControlSetDefinition(ivory));
  assert.equal(back.fingerprint, envelope.fingerprint);
  assert.equal(back.declaredFingerprint, envelope.fingerprint);
  assert.equal(back.metadata.license, 'MIT');

  // The fingerprint covers the set, not the wrapping: same set, different author, same hash.
  assert.equal(createControlSetEnvelope(ivory, { author: 'Else' }).fingerprint, envelope.fingerprint);
  // And a changed set is a changed hash.
  assert.notEqual(fingerprintControlSet({ ...ivory, tokens: { ...ivory.tokens, accent: 'FF000000' } }), envelope.fingerprint);
});

test('the envelope reader refuses what it cannot read rather than half reading it', () => {
  assert.equal(normalizeControlSetEnvelope('not json'), null);
  assert.equal(normalizeControlSetEnvelope({ format: 'ceditor-component', set: ivory }), null);
  assert.equal(normalizeControlSetEnvelope({ format: CONTROL_SET_PACKAGE_FORMAT, formatVersion: 99, set: ivory }), null);
  assert.equal(normalizeControlSetEnvelope({ format: CONTROL_SET_PACKAGE_FORMAT, set: { id: 'x' } }), null);
  // A hand-written file with no metadata is still a set.
  const bare = normalizeControlSetEnvelope({ format: CONTROL_SET_PACKAGE_FORMAT, set: { id: 'bare', tokens: { accent: 'FF123456' } } });
  assert.equal(bare.set.id, 'bare');
  assert.equal(bare.metadata.version, '1.0.0');
});

test('the shipped set files in CE/sets are the built-ins, byte for byte, and read back as them', () => {
  for (const id of SHIPPED_SET_IDS) {
    const { path, text } = shippedSetFile(id);
    assert.ok(path.startsWith(SETS_DIR));
    const committed = readFileSync(path, 'utf8');
    assert.equal(committed, text, `${path} is up to date (run scripts/export-control-sets.mjs)`);
    const envelope = normalizeControlSetEnvelope(committed);
    assert.deepEqual(envelope.set, normalizeControlSetDefinition(getControlSet(id)));
  }
});

test('lookup order: the document\'s set, then the library, then the built-in of the same id', () => {
  const documentIvory = { ...ivory, name: 'Ivory (document)' };
  const libraryIvory = { ...ivory, name: 'Ivory (library)' };
  assert.equal(getControlSet('ivory').name, 'Ivory');
  assert.equal(getControlSet('ivory', { library: [libraryIvory] }).name, 'Ivory (library)');
  assert.equal(getControlSet('ivory', { document: [documentIvory], library: [libraryIvory] }).name, 'Ivory (document)');
  assert.equal(getControlSet('nobody', { document: [documentIvory] }), null);

  const panel = { controlSet: { id: 'ivory' }, controlSets: [documentIvory] };
  assert.equal(controlSetForPanel(panel).name, 'Ivory (document)');
  assert.equal(controlSetForPanel({ controlSet: { id: 'ivory' } }, [libraryIvory]).name, 'Ivory (library)');
  assert.deepEqual(mergeControlSetLists([documentIvory], [libraryIvory]).filter((s) => s.id === 'ivory').map((s) => s.origin), ['document']);
  assert.ok(mergeControlSetLists([], []).every((s) => s.origin === 'built-in'));
});

test('importing a set file puts it in the library and the open document; choosing it points the panel at it', () => {
  controlSetLibrary.set([]);
  openPanel();
  const custom = { ...ivory, id: 'parchment', name: 'Parchment', tokens: { ...ivory.tokens, accent: 'FF7A3E9A' } };
  const text = JSON.stringify(createControlSetEnvelope(custom));

  const result = importControlSetText(text);
  assert.equal(result.ok, true);
  assert.equal(result.replacedBuiltIn, false);
  assert.equal(get(controlSetLibrary)[0].id, 'parchment');
  assert.equal(currentPanel().controlSets[0].id, 'parchment', 'the document carries it');
  assert.ok(get(availableControlSets).some((set) => set.id === 'parchment' && set.origin === 'document'));

  setActivePanelControlSet('parchment');
  assert.equal(currentPanel().controlSet.id, 'parchment');
  assert.equal(get(activeControlSet).name, 'Parchment');
  assert.equal(resolveToken('accent', get(activeControlSet)), 'FF7A3E9A');

  const bad = importControlSetText('{"format":"something-else"}');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /ceditor-controlset/);

  // Export gives the file back, with the library's copy of the set.
  const exported = exportControlSetEnvelope('parchment');
  assert.equal(exported.set.id, 'parchment');
  assert.equal(exported.set.origin, undefined, 'the provenance stamp is a view, not data');
});

test('choosing a library set copies it into the document; a built-in is not copied; the copy survives a save', () => {
  controlSetLibrary.set([{ ...ivory, id: 'vellum', name: 'Vellum' }]);
  openPanel();
  setActivePanelControlSet('vellum');
  assert.deepEqual(currentPanel().controlSets.map((s) => s.id), ['vellum']);

  setActivePanelControlSet('tolex');
  assert.equal(currentPanel().controlSet.id, 'tolex');
  assert.deepEqual(currentPanel().controlSets.map((s) => s.id), ['vellum'], 'a built-in is not copied, the carried set is kept');

  const saved = JSON.parse(serializePanel(currentPanel()));
  assert.equal(saved.controlSets.length, 1);
  assert.equal(saved.controlSets[0].name, 'Vellum');
  assert.equal(saved.controlSet.id, 'tolex');

  // A reader with an empty library still sees Vellum, because the file carries it.
  controlSetLibrary.set([]);
  const reopened = deserializePanel(JSON.stringify(saved), '/tmp/x.cepanel', 'x');
  assert.equal(controlSetForPanel({ ...reopened, controlSet: { id: 'vellum' } }).name, 'Vellum');

  // And "keep in library" is a deliberate step, not a side effect of opening.
  panels.set([reopened]);
  activePanelId.set(reopened.id);
  assert.equal(get(controlSetLibrary).length, 0);
  assert.deepEqual(adoptDocumentControlSets(reopened.id).map((s) => s.id), ['vellum']);
  assert.equal(get(controlSetLibrary)[0].id, 'vellum');
  assert.deepEqual(adoptDocumentControlSets(reopened.id), [], 'already kept');
});

test('a panel with no carried sets writes no controlSets key', () => {
  const saved = JSON.parse(serializePanel({ ...createPanel(), id: 1 }));
  assert.equal('controlSets' in saved, false);
  assert.deepEqual(deserializePanel(JSON.stringify(saved), '/tmp/y.cepanel', 'y').controlSets, []);
});

// ---------------------------------------------------------------------------------------------
// Tier two: the family patch
// ---------------------------------------------------------------------------------------------

test('every Knob gets a bodyCap it does not draw until something turns it on', () => {
  const knob = createControl('Knob');
  const cap = part(knob, 'bodyCap');
  assert.equal(cap.visible, false);
  assert.equal(cap._children.Layout.widthUnit, 'percent');
  assert.equal(cap._children.Background._children.Fill.colour, '{control.cap}');
  // An older document's parts are merged with the defaults, so the renderer always finds it.
  assert.ok(resolveSliderSemanticParts({ _type: 'Parts', _children: {} })._children.bodyCap);
  assert.equal(part(createSliderSemanticParts() && knob, 'pointerCurrent').kind, undefined, 'the pointer is a dot unless told otherwise');
});

test('Tolex turns a factory knob into a chicken-head on a cream cap, and leaves the document alone', () => {
  const knob = createControl('Knob');
  const before = JSON.stringify(knob);
  const styled = resolveControlForSet(knob, tolex);

  assert.equal(JSON.stringify(knob), before, 'the document is not written to');
  assert.equal(part(styled, 'bodyCap').visible, true);
  assert.equal(part(styled, 'bodyCap')._children.Layout.width, 74);
  assert.equal(part(styled, 'bodyCap')._children.Background._children.Fill.colour, 'FFF1E6CC', 'token references written by the patch resolve');
  assert.equal(part(styled, 'bodyCap')._children.Background._children.Effects._children.Material.kind, 'glass');
  assert.equal(part(styled, 'bodyCap')._children.Background._children.Effects._children.Shadows.items.length, 1, 'a created Effects section is a whole one');
  assert.equal(part(styled, 'pointerCurrent').kind, 'chicken');
  assert.equal(part(styled, 'pointerCurrent')._children.Background._children.Fill.colour, 'FF1C1A17');
  assert.equal(part(styled, 'bodyTrackBase')._children.Layout.height, 8);
  // Untouched parts keep their identity through the family patch (the token pass then copies
  // whatever still holds a reference). The labels are touched now — the set's type puts its face
  // on them — so the untouched part is one neither the family nor the type reaches.
  assert.equal(part(resolveControlFamily(knob, tolex), 'pointerEnd'), part(knob, 'pointerEnd'));
  assert.notEqual(part(resolveControlFamily(knob, tolex), 'labelTitle'), part(knob, 'labelTitle'), 'the type reaches the title');
});

test('the family patch stops where the author has been: an edited property keeps its edit', () => {
  const knob = createControl('Knob');
  // The author made the track thick and turned the cap on in their own colour.
  part(knob, 'bodyTrackBase')._children.Layout.height = 20;
  part(knob, 'bodyCap').visible = true;
  part(knob, 'bodyCap')._children.Background._children.Fill.colour = 'FF00FF00';

  const styled = resolveControlForSet(knob, tolex);
  assert.equal(part(styled, 'bodyTrackBase')._children.Layout.height, 20, 'the author\'s thickness');
  assert.equal(part(styled, 'bodyCap')._children.Background._children.Fill.colour, 'FF00FF00', 'the author\'s colour');
  assert.equal(part(styled, 'bodyCap')._children.Layout.width, 74, 'but the size, untouched, follows the set');
  assert.equal(part(styled, 'pointerCurrent').kind, 'chicken');

  // Switching to a set with no knob opinion gives the author's knob back, edits and all.
  const plain = resolveControlForSet(knob, { ...getControlSet('graphite'), families: {} });
  assert.equal(part(plain, 'bodyCap').visible, true);
  assert.equal(part(plain, 'pointerCurrent').kind, undefined);
});

test('a set with nothing to say returns the same object; a family patch copies only along its paths', () => {
  const literal = createControl('Button');
  literal._children.Background._children.Fill.colour = 'FF123456';
  literal._children.Background._children.Border.colour = 'FF123456';
  literal._children.Text._children.Fill.colour = 'FF123456';
  const states = literal._children.States;
  // Graphite's button patch is the factory radius, and this button has no references left to
  // resolve — same object, once Graphite's type (DM Sans on the legend) is taken out of it.
  const tokensOnly = resolveControlFamily(literal, { ...getControlSet('graphite'), type: undefined });
  assert.equal(tokensOnly, literal);
  // Tolex: the corners and the legend's face change; the States subtree and the text's fill do not.
  const styled = resolveControlFamily(literal, tolex);
  assert.notEqual(styled, literal);
  assert.equal(styled._children.Background._children.Corners.radius, 5);
  assert.equal(styled._children.States, states);
  assert.equal(styled._children.Text._children.Font.family, 'Libre Franklin');
  assert.equal(styled._children.Text._children.Fill, literal._children.Text._children.Fill);
});

test('readControlPath / writeControlPath walk _children first and create missing sections whole', () => {
  const button = createControl('Button');
  assert.equal(readControlPath(button, 'Background.Corners.radius'), 8);
  assert.equal(readControlPath(button, 'Background.Effects.Material.kind'), undefined);
  const written = writeControlPath(button, 'Background.Effects.Material.kind', 'brushed');
  assert.equal(readControlPath(written, 'Background.Effects.Material.kind'), 'brushed');
  assert.equal(readControlPath(written, 'Background.Effects.Bevel.enabled'), false, 'the rest of Effects came along');
  assert.equal(readControlPath(button, 'Background.Effects'), undefined, 'the source is untouched');
  assert.equal(written._children.Text, button._children.Text, 'siblings keep their identity');
  assert.equal(pristineControlFor('Knob'), pristineControlFor('Knob'), 'one pristine per type');
  assert.equal(pristineControlFor('NoSuchType'), null);
});

test('addParts adds a part the control lacks and skips one it has', () => {
  const set = { ...ivory, id: 'jewelled', type: undefined, families: { Knob: { addParts: { jewel: { _type: 'Part', role: 'custom', visible: true, _children: {} } } } } };
  const knob = createControl('Knob');
  const styled = resolveControlFamily(knob, set);
  assert.equal(part(styled, 'jewel').name, 'jewel');
  knob._children.Parts._children.jewel = { _type: 'Part', name: 'jewel', role: 'custom', visible: false, _children: {} };
  assert.equal(resolveControlFamily(knob, set), knob, 'nothing to add, nothing copied');
});

// ---------------------------------------------------------------------------------------------
// Tier three: the material and the lamp
// ---------------------------------------------------------------------------------------------

test('Effects has a Material, off by default, and the Effects tab knows it', () => {
  const material = SECTION_DEFAULTS.Effects._children.Material;
  assert.equal(material.enabled, false);
  assert.ok(MATERIAL_KINDS.includes(material.kind));
  assert.equal(hasSurfaceEffects({ _children: { Material: { enabled: true, kind: 'blast' } } }), true);
  assert.equal(hasSurfaceEffects({ _children: { Material: { enabled: false, kind: 'blast' } } }), false);
  const group = COMPONENT_GROUPS.find((g) => g.key === 'material');
  assert.equal(group.root, 'Effects.Material');
  assert.deepEqual(group.fields.find((f) => f.key === 'kind').options, MATERIAL_KINDS);
});

test('materialPrimitives follows the recipe, scales with the sliders, and takes the set\'s lamp unless pinned', () => {
  assert.equal(materialPrimitives({ enabled: false, kind: 'blast' }), null);
  assert.equal(materialActive(null), false);
  const blast = materialPrimitives({ enabled: true, kind: 'blast', strength: 100, shine: 100, grain: 100, lampFollowsSet: true }, { azimuth: 90, elevation: 30 });
  assert.equal(blast.baseFrequency, '0.95 0.95');
  assert.equal(blast.surfaceScale, 0.55);
  assert.equal(blast.specularConstant, 0.2);
  assert.deepEqual([blast.azimuth, blast.elevation], [90, 30]);

  const half = materialPrimitives({ enabled: true, kind: 'brushed', strength: 50, shine: 0, grain: 200 });
  assert.equal(half.baseFrequency, '0.008 1.9', 'brushed is anisotropic and grain scales both');
  assert.equal(half.surfaceScale, 0.175);
  assert.equal(half.specularConstant, 0, 'shine 0 is matte');
  assert.deepEqual([half.azimuth, half.elevation], [DEFAULT_LAMP.azimuth, DEFAULT_LAMP.elevation], 'no set lamp: the default');

  const pinned = resolveMaterialLamp({ lampFollowsSet: false, lampAzimuth: 10, lampElevation: 80 }, { azimuth: 90, elevation: 30 });
  assert.deepEqual(pinned, { azimuth: 10, elevation: 80 });
  assert.equal(materialPrimitives({ enabled: true, kind: 'nonsense' }).kind, 'nonsense', 'an unknown kind falls back to the blast recipe rather than nothing');
});

test('Machined lights the knob cap and the button face, and the build bakes both the family patch and the tokens', () => {
  const knob = createControl('Knob');
  const styled = resolveControlForSet(knob, machined);
  assert.equal(part(styled, 'bodyCap')._children.Background._children.Effects._children.Material.enabled, true);
  assert.equal(part(styled, 'bodyCap')._children.Background._children.Effects._children.Material.kind, 'blast');
  assert.equal(part(styled, 'pointerCurrent').kind, 'line');

  const panel = { ...createPanel(), id: 2, controlSet: { id: 'machined' }, controls: [knob, createControl('Button')] };
  const built = JSON.parse(serializePanel(panel, { bakeControlSet: controlSetForPanel(panel), elide: false }));
  const [builtKnob, builtButton] = built.controls;
  assert.equal(part(builtKnob, 'bodyCap').visible, true);
  assert.equal(part(builtKnob, 'bodyCap')._children.Background._children.Fill.colour, 'FFA2A7AE', 'a literal, not a reference');
  // The button is the aluminium design: a turned face (a gradient), a bevelled edge, baked as
  // literals like everything else.
  assert.equal(builtButton._children.Background._children.Fill.gradientEnabled, true);
  assert.equal(builtButton._children.Background._children.Fill.gradient.stops.length, 3);
  assert.equal(builtButton._children.Effects._children.Bevel.enabled, true);
  assert.equal(builtButton._children.Background._children.Fill.colour, 'FFB4B9BF');

  // A saved document, by contrast, keeps the factory knob: the set is applied at draw time.
  const saved = JSON.parse(serializePanel(panel));
  assert.equal(saved.controls[0]._children?.Parts?._children?.bodyCap, undefined, 'nothing the set did is in the file');
});

test('the recipes: a fader cap, a toggle lamp that keeps the body, and inks per surface', () => {
  const slider = sliderFamily({ cap: 'bar', capAlong: 12, capAcross: 28, track: 6, trackRadius: 2, capMaterial: ['blast', 80, 60] });
  assert.equal(slider.Slider.parts.pointerCurrent.kind, 'bar');
  assert.equal(slider.Slider.parts.pointerCurrent['Layout.width'], 12);
  assert.equal(slider.Slider.parts.pointerCurrent['Background.Effects.Material.kind'], 'blast');
  assert.equal(slider.Slider.parts.bodyTrackBase['Background.Corners.radius'], 2);
  assert.equal(sliderFamily({ cap: 'dot' }).Slider.parts.pointerCurrent.kind, undefined, 'the dot is the default and says nothing');

  const lamp = lampFamily({ lamp: 'jewel', size: 12 });
  assert.equal(lamp.ToggleButton.component['ContentLayout.lamp'], 'jewel');
  assert.equal(lamp.ToggleButton.component['ContentLayout.lampColour'], '{accent.hot}');
  assert.equal(lamp.ToggleButton.component['States.Selected'].when.checked, true);
  assert.equal(lamp.ToggleButton.component['States.Selected'].patches.component['Background.Fill.colour'], undefined, 'the body keeps its colour: the lamp is the indicator');

  // Applied to a factory toggle: the lamp lands, and the Selected state is replaced whole.
  const toggle = createControl('ToggleButton');
  const set = { ...tolex, id: 'lamped', families: mergeFamilies(lamp, buttonFamily({ radius: 3, text: '{text.inverse}', comboText: 'FF112233' })) };
  const styled = resolveControlForSet(toggle, set);
  assert.equal(readControlPath(styled, 'ContentLayout.lamp'), 'jewel');
  assert.equal(readControlPath(styled, 'States.Selected').patches.component['Background.Border.colour'], resolveToken('accent.hot', tolex));
  assert.equal(readControlPath(styled, 'ContentLayout.lampColour'), resolveToken('accent.hot', tolex), 'the lamp colour is a token, resolved like any other');
  // An author who edited the Selected state keeps it.
  toggle._children.States._children.Selected.patches.component['Background.Fill.colour'] = 'FF00FF00';
  assert.equal(readControlPath(resolveControlForSet(toggle, set), 'States.Selected').patches.component['Background.Fill.colour'], 'FF00FF00');
  // The combobox takes its own ink; the buttons theirs.
  const combo = resolveControlForSet(createControl('Combobox'), set);
  assert.equal(readControlPath(combo, 'Text.Fill.colour'), 'FF112233');
  assert.equal(readControlPath(resolveControlForSet(createControl('Button'), set), 'Text.Fill.colour'), resolveToken('text.inverse', tolex));

  // Every control with a ContentLayout starts with no lamp, so nothing that exists changes.
  assert.equal(SECTION_DEFAULTS.ContentLayout.lamp, 'none');
  assert.equal(createControl('Button')._children.ContentLayout.lamp, 'none');
});

test('ticks: a set can switch them off, count them, shape them and choose which stops draw', () => {
  const off = sliderFamily({ ticks: false }).Slider.component;
  assert.equal(off['Behavior.showTicks'], false);
  const dial = knobFamily({ cap: 77, ticks: { count: 11, length: 6, width: 1, kind: 'numeral', stops: 'all' } }).Knob;
  assert.equal(dial.component['Behavior.majorTickCount'], 11);
  assert.equal(dial.parts.tickMajor.kind, 'numeral');
  assert.equal(dial.parts.tickMinor.kind, 'line', 'numerals are for the majors; the minors between them stay lines');
  const cut = knobFamily({ cap: 77, ticks: { kind: 'engraved', stops: 'endsCentre' } }).Knob;
  assert.equal(cut.parts.tickMajor.kind, 'engraved');
  assert.equal(cut.parts.tickMinor.kind, 'engraved');
  assert.equal(cut.component['Behavior.tickStops'], 'endsCentre');
  // Applied: the kind lands on the factory tick parts, and the default stays a plain line.
  const knob = createControl('Knob');
  assert.equal(part(knob, 'tickMajor').kind, undefined);
  assert.equal(SECTION_DEFAULTS.Behavior.tickStops, 'all');
  const styled = resolveControlForSet(knob, { ...tolex, id: 't', families: { Knob: cut } });
  assert.equal(part(styled, 'tickMajor').kind, 'engraved');
  assert.equal(readControlPath(styled, 'Behavior.tickStops'), 'endsCentre');
  // The boards: Machined cuts its marks, Reel prints its dial, Phosphor's ring is LEDs.
  assert.equal(machined.families.Knob.parts.tickMajor.kind, 'engraved');
  assert.equal(getControlSet('reel').families.Knob.parts.tickMajor.kind, 'numeral');
  assert.equal(getControlSet('phosphor').families.Knob.parts.tickMajor.kind, 'dot');
});

test('the still-short four: numerals by value, the row above the track, the bat switch, the glass', () => {
  // 1. A numeral tick can print the value at the stop, not the stop's index.
  const dial = knobFamily({ cap: 90, ticks: { count: 11, kind: 'numeral', numerals: 'value' } }).Knob;
  assert.equal(dial.component['Behavior.tickNumerals'], 'value');
  assert.equal(SECTION_DEFAULTS.Behavior.tickNumerals, 'index', 'every existing numeral prints what it printed');
  assert.equal(getControlSet('reel').families.Knob.component['Behavior.tickNumerals'], 'value', 'the Reel dial is worth what it says');

  // 2. A slider's board labels: the title at the left end of the row above the track, the value
  //    at the right end — not both centred on top of each other.
  const board = sliderFamily({ cap: 'bar' }).Slider.component;
  assert.equal(board['Behavior.labelTitlePlacement'], 'topLeft');
  assert.equal(board['Behavior.labelReadoutPlacement'], 'topRight');
  assert.equal(SECTION_DEFAULTS.Behavior.labelTitlePlacement, 'auto');
  const styledSlider = resolveControlForSet(createControl('Slider'), getControlSet('graphite'));
  assert.equal(readControlPath(styledSlider, 'Behavior.labelTitlePlacement'), 'topLeft', 'the default set draws its board');

  // 3. A bat switch is a lamp kind: the lever takes the lamp colour, and the pilot's Machined
  //    toggle is one, as its board drew.
  const bat = lampFamily({ lamp: 'bat', size: 10, colour: '{control.cap}', offColour: '{control.cap}' }).ToggleButton.component;
  assert.equal(bat['ContentLayout.lamp'], 'bat');
  assert.equal(readControlPath(resolveControlForSet(createControl('ToggleButton'), machined), 'ContentLayout.lamp'), 'bat');
  for (const id of ['reel', 'ladder', 'aerospace', 'field']) {
    assert.equal(getControlSet(id).families.ToggleButton.component['ContentLayout.lamp'], 'bat', `${id}'s board had bat switches`);
  }
  assert.equal(getControlSet('valve').families.ToggleButton.component['ContentLayout.lamp'], 'jewel');

  // 4. Displays follow the set: the Display defaults are tokens, every set defines them, and the
  //    base set resolves to exactly the green STN the literals used to be.
  for (const role of ['display.lit', 'display.unlit', 'display.screen', 'display.backlight']) {
    assert.ok(CONTROL_SET_TOKEN_NAMES.includes(role), role);
  }
  assert.equal(SECTION_DEFAULTS.Display.litColour, '{display.lit}');
  assert.equal(resolveToken('display.lit', getControlSet('graphite')), 'FF2BE86A');
  assert.equal(resolveToken('display.screen', getControlSet('graphite')), 'FF06371C');
  assert.equal(resolveToken('display.lit', machined), 'FF7DE3FF', 'Machined\'s OLED is ice blue');
  assert.equal(resolveToken('display.screen', getControlSet('reel')), 'FFF3E9C8', 'Reel\'s readout is a cream meter face');
  assert.notEqual(resolveToken('display.lit', getControlSet('valve')), resolveToken('display.lit', getControlSet('graphite')));
});

test('a set\'s type: the board\'s face on the labels, the legends and the fields, beneath its families', () => {
  // The block normalises: three roles, family / weight / letterSpacing, nothing else kept.
  const set = normalizeControlSetDefinition({ ...tolex, id: 'typed', families: undefined, type: {
    label: { family: ' Libre Franklin ', weight: '700', letterSpacing: 0.9, colour: 'nope' },
    legend: { family: 'Allerta Stencil', weight: 400 },
    field: { family: 'JetBrains Mono' },
    readout: { family: 'Comic Sans' },
  } });
  assert.deepEqual(set.type, {
    label: { family: 'Libre Franklin', weight: 700, letterSpacing: 0.9 },
    legend: { family: 'Allerta Stencil', weight: 400 },
    field: { family: 'JetBrains Mono' },
  });
  assert.equal(normalizeControlSetDefinition({ ...tolex, type: { readout: {} } }).type, undefined, 'a block with no role is no block');

  // As families: the label role lands on the title with its weight, on the value without it, on
  // the Label control; the legend on the buttons and the combobox; the field on the digits.
  const fam = typeFamilies(set.type);
  assert.equal(fam.Knob.parts.labelTitle['Text.Font.family'], 'Libre Franklin');
  assert.equal(fam.Knob.parts.labelTitle['Text.Font.weightValue'], 700);
  assert.equal(fam.Knob.parts.labelTitle['Text.Font.weight'], 'Bold');
  assert.equal(fam.Slider.parts.labelValue['Text.Font.family'], 'Libre Franklin');
  assert.equal(fam.Slider.parts.labelValue['Text.Font.weightValue'], undefined, 'the value keeps the factory weight');
  assert.equal(fam.Slider.parts.labelValue['Text.Font.letterSpacing'], 0.9);
  assert.equal(fam.Label.component['Text.Font.weightValue'], 700);
  assert.equal(fam.Button.component['Text.Font.family'], 'Allerta Stencil');
  assert.equal(fam.ToggleButton.component['Text.Font.weight'], 'Regular');
  assert.equal(fam.Combobox.component['Text.Font.family'], 'Allerta Stencil');
  assert.equal(fam.Number.parts.valueField['Text.Font.family'], 'JetBrains Mono');
  assert.equal(fam.Range.parts.highField['Text.Font.family'], 'JetBrains Mono');
  assert.deepEqual(typeFamilies(null), {});

  // Applied to factory controls, under the pristine rule.
  const knob = resolveControlForSet(createControl('Knob'), set);
  assert.equal(readControlPath(knob, 'Parts.labelTitle.Text.Font.family'), 'Libre Franklin');
  assert.equal(readControlPath(knob, 'Parts.labelValue.Text.Font.family'), 'Libre Franklin');
  assert.equal(readControlPath(resolveControlForSet(createControl('Button'), set), 'Text.Font.family'), 'Allerta Stencil');
  assert.equal(readControlPath(resolveControlForSet(createControl('Number'), set), 'Parts.valueField.Text.Font.family'), 'JetBrains Mono');
  const authored = createControl('Button');
  authored._children.Text._children.Font.family = 'Georgia';
  assert.equal(readControlPath(resolveControlForSet(authored, set), 'Text.Font.family'), 'Georgia', 'an author\'s face is theirs');

  // The set's own families sit over its type: a family that names a font for one part wins,
  // and the type still reaches the parts the family says nothing about.
  const over = { ...set, families: { Knob: { parts: { labelTitle: { 'Text.Font.family': 'Rubik' }, labelMin: { 'Text.Fill.colour': 'FF00FF00' } } } } };
  const styled = resolveControlForSet(createControl('Knob'), over);
  assert.equal(readControlPath(styled, 'Parts.labelTitle.Text.Font.family'), 'Rubik');
  assert.equal(readControlPath(styled, 'Parts.labelTitle.Text.Font.weightValue'), 700, 'the type\'s weight still lands beside the family\'s face');
  assert.equal(readControlPath(styled, 'Parts.labelMin.Text.Font.family'), 'Libre Franklin');
  assert.equal(readControlPath(styled, 'Parts.labelMin.Text.Fill.colour'), 'FF00FF00');
  assert.equal(readControlPath(styled, 'Parts.labelValue.Text.Font.family'), 'Libre Franklin');

  // The boards: Graphite is DM Sans, Machined is Barlow, Field's legends are stencilled, and the
  // default set's face reaches a factory slider.
  assert.equal(getControlSet('graphite').type.label.family, 'DM Sans');
  assert.equal(machined.type.legend.family, 'Barlow');
  assert.equal(getControlSet('field').type.legend.family, 'Allerta Stencil');
  assert.equal(getControlSet('field').type.label.family, 'Barlow');
  assert.equal(readControlPath(resolveControlForSet(createControl('Slider'), getControlSet('graphite')), 'Parts.labelTitle.Text.Font.family'), 'DM Sans');
  // A set with no type says nothing about fonts.
  assert.equal(readControlPath(resolveControlForSet(createControl('Slider'), { ...tolex, id: 'mute', type: undefined, families: undefined }), 'Parts.labelTitle.Text.Font.family'), 'Arial');
});

test('the boards\' faders: cap kinds with a groove, a plate, a sheen, a shadow, a glow; a slot with a light in it', () => {
  const block = sliderFamily({ cap: 'block', capAlong: 22, capAcross: 44, groove: '{control.marker}', plate: '{control.cap.hot}', sheen: true, shadow: true, track: 10, trackRadius: 2, slot: true, fillInset: 3, fillGlow: true }).Slider.parts;
  assert.equal(block.pointerCurrent.kind, 'block');
  assert.equal(block.pointerCurrent.grooveColour, '{control.marker}');
  assert.equal(block.pointerCurrent.plateColour, '{control.cap.hot}');
  assert.equal(block.pointerCurrent.sheen, true);
  assert.equal(block.pointerCurrent.shadow, true);
  assert.equal(block.pointerCurrent.glow, undefined);
  // A range slider's ends are the same cap in the start and end colours, not two circles.
  assert.equal(block.pointerStart.kind, 'block');
  assert.equal(block.pointerStart['Background.Fill.colour'], '{control.cap.start}');
  assert.equal(block.pointerEnd['Background.Fill.colour'], '{control.cap.end}');
  assert.equal(block.bodyTrackBase.slot, true);
  assert.equal(block.bodyTrackBase['Background.Corners.radius'], 2);
  assert.equal(block.bodyTrackFill.inset, 3);
  assert.equal(block.bodyTrackFill.glow, true);
  const lens = sliderFamily({ cap: 'lens', groove: '{accent}', glow: true }).Slider.parts;
  assert.equal(lens.pointerCurrent.kind, 'lens');
  assert.equal(lens.pointerCurrent.glow, true);
  assert.equal(lens.pointerCurrent.shadow, undefined, 'a flag not asked for is not written');
  assert.equal(sliderFamily({ cap: 'dot' }).Slider.parts.bodyTrackBase, undefined, 'a plain track says nothing about itself');

  // Applied: the flags are plain part keys and land on the factory parts; the groove ink is a
  // token and resolves like any other colour.
  const styled = resolveControlForSet(createControl('Slider'), machined);
  assert.equal(part(styled, 'pointerCurrent').kind, 'block');
  assert.equal(part(styled, 'pointerCurrent').grooveColour, 'FF1B1D20', 'the design names its inks as literals');
  assert.equal(part(styled, 'pointerCurrent').shadow, true);
  assert.equal(part(styled, 'bodyTrackBase').slot, true);
  assert.equal(part(styled, 'bodyTrackFill').inset, 3);
  assert.equal(part(styled, 'pointerStart').kind, 'block');
  // Nothing about a factory slider changed: no flags, no slot, no inset.
  const factory = createControl('Slider');
  assert.equal(part(factory, 'pointerCurrent').kind, undefined);
  assert.equal(part(factory, 'bodyTrackBase').slot, undefined);
  assert.equal(part(factory, 'bodyTrackFill').inset, undefined);

  // The boards, by design (models/controlSetDesigns.js): a lit lens on Backlit and Obsidian, an
  // LED ladder with a ring on Eurorack, a billet block in a lit slot on Anodised and the machined
  // boards, a turned console cap on Console, a bar with a groove on Ember, a brass rail under
  // Tolex, and the default set's plain dot.
  const capOf = (id) => getControlSet(id).families.Slider.parts;
  assert.equal(capOf('backlit').pointerCurrent.kind, 'lens');
  assert.equal(capOf('backlit').bodyTrackFill.glow, true);
  assert.equal(capOf('eurorack').pointerCurrent.kind, 'ring');
  assert.equal(capOf('eurorack').tickMajor.kind, 'dot');
  assert.equal(capOf('anodised').pointerCurrent.kind, 'block');
  for (const id of ['machined', 'anodised', 'ladder', 'laboratory', 'aerospace', 'ceramic', 'field']) {
    assert.equal(capOf(id).bodyTrackBase.slot, true, `${id} rides a slot`);
    assert.equal(capOf(id).bodyTrackFill.inset, 3, `${id} has the 4 px light in the 10 px slot`);
  }
  assert.equal(capOf('obsidian').pointerCurrent.kind, 'lens');
  assert.equal(capOf('console').pointerCurrent.kind, 'console');
  assert.equal(capOf('console').pointerCurrent['Background.Fill.gradient'].type, 'linear', 'turned from one piece');
  assert.equal(capOf('ember').pointerCurrent.kind, 'bar');
  assert.equal(capOf('ember').pointerCurrent.grooveColour, 'FF3B2A1E');
  assert.equal(capOf('neon').bodyTrackFill.glow, true);
  assert.equal(capOf('carbon').pointerCurrent['Background.Fill.colour'], 'FF111214', 'Carbon\'s board: a dark cap with the orange line');
  assert.equal(capOf('tolex').bodyTrackBase['Background.Fill.gradient'].stops.length, 3);
  assert.equal(capOf('graphite')?.pointerCurrent?.kind, undefined, 'the default set says nothing about the cap');
});

test('the panel follows the set\'s colour only while it wears the default one', () => {
  const fresh = { ...createPanel(), controlSet: { id: 'tolex' } };
  assert.match(buildSolidStyle(fresh), /#1C1A17/);
  const authored = { ...fresh, bgColour: 'FF0000FF' };
  assert.match(buildSolidStyle(authored), /#0000FF/);
  assert.match(buildSolidStyle({ ...createPanel(), controlSet: { id: 'graphite' } }), /#333333/, 'a colour-only set leaves the panel alone');
});
