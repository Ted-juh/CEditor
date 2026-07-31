// manualReference.test.js — the parts of the manual that are DATA, checked against the contract.
//
// Two customer complaints turned into structure rather than prose, and structure is the kind of
// thing that rots without noticing:
//
//   • Every option field is a descriptor now — type, default, legal values, what it does — rather
//     than a bare name with the detail buried in a 955-character summary.
//   • The 41 modules are filed into a tree, because 28 of them were ce.components.* in one flat
//     run with a single nav link pointing at the lot.
//
// panelApi.js throws at load for the worst of both (a module in no group, a typographic feature
// with no description), so those failures announce themselves everywhere. What is asserted here is
// the part a throw cannot cover: that the descriptions are actually usable, that the values quoted
// match the tables the implementations read, and that a new module joins a group rather than
// quietly vanishing from the page.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODULES, ALL_MEMBERS, MODULE_GROUPS, COMPONENT_GROUPS, moduleTree, memberPath,
} from '../src/CE_Application/scripting/panelApi.js';
import {
  BACKGROUND_FITS, TEXT_FITS, IMAGE_BLENDS, IMAGE_CLIP_MODES, IMAGE_LAYER_IDS,
} from '../src/CE_Application/utils/imageLayers.js';
import { FEATURE_KEYS, CASE_MODES } from '../src/CE_Application/scripting/textStyle.js';

/** Every declared option field on the whole surface, with the member it belongs to. */
function everyOptionField() {
  const out = [];
  for (const member of ALL_MEMBERS) {
    for (const param of member.params ?? []) {
      for (const field of param.fields ?? []) out.push({ member, param, field });
    }
  }
  return out;
}

const fieldsOf = (memberId, paramName = 'opts') => {
  const member = ALL_MEMBERS.find((m) => m.id === memberId);
  assert.ok(member, `no member called ${memberId}`);
  const param = (member.params ?? []).find((p) => p.name === paramName);
  assert.ok(param, `${memberId} has no ${paramName} argument`);
  return param.fields ?? [];
};

const named = (fields, name) => {
  const field = fields.find((f) => f.name === name);
  assert.ok(field, `no option field called ${name} (has: ${fields.map((f) => f.name).join(', ')})`);
  return field;
};

/* ------------------------------------------------------------------ option fields */

test('every option field says what it holds and what it does', () => {
  const all = everyOptionField();
  assert.ok(all.length > 200, `only ${all.length} option fields — did a fields list go back to bare names?`);

  for (const { member, param, field } of all) {
    const where = `${memberPath(member.id)} ${param.name}.${field.name ?? '(unnamed)'}`;
    assert.equal(typeof field, 'object', `${where} is not a descriptor`);
    assert.ok(field.name, `${where} has no name`);
    assert.ok(field.type, `${where} does not say what it holds`);
    assert.ok(field.summary, `${where} does not say what it does`);
    // A summary that is only the field's own name back at you is the failure this replaced, in a
    // nicer box: "layer — the layer" tells a reader nothing they did not have from the name.
    // Length is the wrong bar for this — "The gap between rows." is short and complete — so what
    // is checked is that it is a sentence, and that it is not the name restated.
    const bare = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    assert.notEqual(bare(field.summary), bare(field.name),
      `${where}: "${field.summary}" is the field's own name back again`);
    assert.match(field.summary, /^[A-Z"`(]/, `${where}: "${field.summary}" does not start a sentence`);
    assert.match(field.summary, /[.?]$/, `${where}: "${field.summary}" does not end one`);
    assert.ok(field.summary.split(/\s+/).length >= 3,
      `${where}: "${field.summary}" is not a sentence`);
  }
});

test('an optional field says what happens when you leave it out', () => {
  // Not every field can — `beats` genuinely has no default, it is simply absent — but the ones
  // whose behaviour changes silently must, because "what if I omit this" is the question the old
  // bare-name list could never answer.
  const withDefault = everyOptionField().filter(({ field }) => field.default);
  assert.ok(withDefault.length > 120,
    `only ${withDefault.length} fields state a default; that was 144 when this was written`);
});

test('a field with a closed list of values lists them', () => {
  for (const { member, field } of everyOptionField()) {
    if (!field.values) continue;
    assert.ok(Array.isArray(field.values) && field.values.length > 1,
      `${memberPath(member.id)}.${field.name}: a "closed list" of ${field.values.length}`);
    // The default, when it names one, has to BE one of them. A default outside its own value list
    // is the shape of bug the component enums had: 24 of 28 offered values no component has.
    if (field.default && /^".*"$/.test(field.default)) {
      const bare = field.default.slice(1, -1);
      assert.ok(field.values.includes(bare),
        `${memberPath(member.id)}.${field.name}: defaults to ${field.default}, which is not in its own list`);
    }
  }
});

test('the values come from the tables the implementations read, not from a retyped list', () => {
  // The point of importing them rather than writing them out: these lists cannot drift from the
  // code that consumes them, and a test that retyped them would defeat that. So this checks
  // IDENTITY with the app's own tables.
  const image = fieldsOf('imageSet');
  assert.deepEqual(named(image, 'layer').values, IMAGE_LAYER_IDS);
  assert.deepEqual(named(image, 'blend').values, IMAGE_BLENDS);
  assert.deepEqual(named(image, 'clipMode').values, IMAGE_CLIP_MODES);

  // `fit` is the one option that means two different things under one name — cover on a
  // background, stretch on text — so it carries both vocabularies and says so.
  const fit = named(image, 'fit');
  for (const value of [...BACKGROUND_FITS, ...TEXT_FITS]) {
    assert.ok(fit.values.includes(value), `imageSet fit does not offer "${value}"`);
  }
  assert.match(fit.summary, /background/i);
  assert.match(fit.summary, /text/i);

  assert.deepEqual(named(fieldsOf('textStyle'), 'caseMode').values, CASE_MODES);
});

test('ce.text.style declares every option it actually accepts', () => {
  // It declared 17 while textStyle.js accepted 27: the four paddings and five of the six OpenType
  // switches were missing, so the only way to discover `tabularFigures` was to read the source.
  const declared = fieldsOf('textStyle').map((f) => f.name);
  for (const key of FEATURE_KEYS) {
    assert.ok(declared.includes(key), `ce.text.style does not declare the "${key}" feature switch`);
  }
  for (const pad of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
    assert.ok(declared.includes(pad), `ce.text.style does not declare ${pad}`);
  }
});

test('the animation verbs agree about the timing options they share', () => {
  // to/spring/envelope take the same nine timing options from one shared pool. Written out three
  // times they would disagree within a release; this is what the pool is for.
  const to = fieldsOf('animateTo');
  const spring = fieldsOf('animateSpring');
  for (const shared of ['beats', 'sync', 'delay', 'repeat', 'pingpong', 'done']) {
    assert.deepEqual(named(to, shared), named(spring, shared),
      `animateTo and animateSpring describe "${shared}" differently`);
  }
  // …and where they genuinely differ, they still differ: spring settles slower by default.
  assert.equal(named(to, 'duration').default, '300');
  assert.equal(named(spring, 'duration').default, '600');
});

/* -------------------------------------------------------------------- the tree */

test('every module is filed under exactly one group', () => {
  const filed = moduleTree().flatMap((g) => [...g.modules, ...g.subgroups.flatMap((s) => s.modules)]);
  const known = MODULES.map((m) => m.id);

  for (const id of known) {
    assert.ok(filed.includes(id), `${id} is in no group, so it would not appear on the page at all`);
  }
  for (const id of filed) {
    assert.ok(known.includes(id), `a group claims ${id}, which is not a module`);
  }
  assert.equal(filed.length, new Set(filed).size, 'a module is filed under two groups');
  assert.equal(filed.length, known.length);
});

test('every group and subgroup says what is in it', () => {
  for (const group of [...MODULE_GROUPS, ...COMPONENT_GROUPS]) {
    assert.ok(group.id && group.label, `a group has no id or label: ${JSON.stringify(group)}`);
    assert.ok(group.blurb && group.blurb.length > 20,
      `"${group.label}" has no useful description — a collapsed branch is only as good as its heading`);
  }
});

test('the components are subdivided rather than listed', () => {
  const components = moduleTree().find((g) => g.id === 'components');
  assert.ok(components, 'there is no Components group');
  assert.equal(components.modules.length, 0, 'Components holds modules directly as well as in subgroups');
  assert.ok(components.subgroups.length >= 4,
    `${components.subgroups.length} subgroups is barely a subdivision`);

  // The whole complaint was 28 modules in one run. No single branch should recreate it.
  for (const sub of components.subgroups) {
    assert.ok(sub.modules.length <= 8,
      `"${sub.label}" holds ${sub.modules.length} modules, which is the long list again`);
  }
  const total = components.subgroups.reduce((n, s) => n + s.modules.length, 0);
  assert.equal(total, MODULES.filter((m) => m.id.startsWith('ce.components.')).length);
});
