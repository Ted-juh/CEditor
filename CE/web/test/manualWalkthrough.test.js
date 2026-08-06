// manualWalkthrough.test.js — the two walkthrough lessons, executed.
//
// Lessons 11 and 12 are the longest code in the manual and the only ones a reader is likely to
// paste whole. Every other example is a few lines whose result the suite pins; these are complete
// scripts, and a complete script can rot in ways a snippet cannot — a verb renamed, an option
// silently ignored, a return value that used to be a name and is now nil.
//
// So they are RUN, not read. The Lua in the manual and the JavaScript beside it are both extracted
// from the generated page and executed against the real runtime, and the panels they build are
// compared to each other. That last part is the one worth having: the two listings are written by
// hand rather than machine-translated, so nothing but a test can promise they agree.
//
// What is asserted is the SHAPE the lesson claims — the controls, their geometry, the derived
// colours, the states, the repeat properties. Not the prose.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, deliverSysexForTesting, setRuntimeHost, clearDeviceRuntimeDefinitions,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { decodeDump } from '../src/CE_Application/scripting/deviceDefinitions.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { MODULES, moduleMemberMap } from '../src/CE_Application/scripting/panelApi.js';
import {
  drumPads, strikeVelocity, strikeAction, rollIntervalMs,
} from '../src/CE_Application/utils/drumPadLayout.js';
import { beatsPerStep } from '../src/CE_Application/utils/transportLayout.js';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, '..', '..', '..', 'docs', 'api-explorer.html'), 'utf8');

const UNESCAPE = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const unescapeHtml = (s) => s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (m) => UNESCAPE[m]);

/**
 * Every code listing inside one lesson, in order, for one language.
 *
 * Read out of the PUBLISHED page rather than the template, because the page is what a reader
 * copies from — if the generator ever mangled a listing, pinning the template would not notice.
 */
function listings(lessonId, lang) {
  const start = page.indexOf(`id="${lessonId}"`);
  assert.ok(start > 0, `the manual has no lesson "${lessonId}" — was it renamed?`);
  // Up to the NEXT lesson's number line. Two near-misses: `lesson-text` starts with the same
  // characters as `lesson`, and this lesson's own number line is the first one after `start`.
  const mine = page.indexOf('<p class="lesson-n">', start);
  const next = page.indexOf('<p class="lesson-n">', mine + 10);
  // …and by the end of the lessons section, because the LAST lesson has no next one and the
  // reference below it is nothing but code listings — it would swallow all 555 of them.
  const close = page.indexOf('</section>', mine);
  const end = Math.min(...[next, close].filter((i) => i > 0));
  const html = page.slice(start, Number.isFinite(end) ? end : undefined);

  const attr = lang === 'lua' ? 'data-lua' : 'data-js';
  const out = [];
  const re = new RegExp(`<pre ${attr}[^>]*><code>([\\s\\S]*?)</code></pre>`, 'g');
  for (const m of html.matchAll(re)) out.push(unescapeHtml(m[1]));
  assert.ok(out.length > 0, `lesson "${lessonId}" has no ${lang} listing`);
  return out;
}

/**
 * Run a lesson's JavaScript against a real (empty) panel and return what it built.
 *
 * The listing declares `onPanelBuild` and then registers handlers at top level, exactly as the
 * runtime loads it: evaluate the source with the api in scope, then call the hook.
 */
function build(source) {
  const seed = createControl('Label', { name: 'Seed' });
  panels.set([{
    id: 'p', name: 'P', controls: [seed],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'manual');
    // The globals a script sees. `on` is captured so the top-level handler registrations in the
    // listing do not need a live panel to attach to yet.
    const names = ['ce', 'set', 'get', 'log', 'logWarn', 'logError', 'on', 'sendNote', 'state'];
    const values = names.map((n) => api[n]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `${source}\nreturn typeof onPanelBuild === 'function' ? onPanelBuild : null;`);
    const onPanelBuild = fn(...values);
    assert.ok(onPanelBuild, 'the listing no longer declares onPanelBuild');
    onPanelBuild();

    return flatControls(get(panels)[0].controls)
      .filter((c) => c._children.Core.name !== 'Seed')
      .map((c) => {
        const core = c._children.Core;
        const tr = c._children.Transform;
        const fill = c._children.Background?._children?.Fill ?? null;
        const beh = c._children.Behavior ?? null;
        return {
          name: core.name,
          type: core.controlType,
          box: `${tr.x},${tr.y} ${tr.width}x${tr.height}`,
          text: c._children.Text?.content ?? null,
          solid: fill?.colour ?? null,
          stops: (fill?.gradient?.stops ?? []).map((s) => `${s.color}@${s.position}`).join('>'),
          states: Object.keys(c._children.States?._children ?? {}),
          repeat: beh?.repeatEnabled === true
            ? `${beh.subtype}:${beh.repeatDelay}/${beh.repeatInterval}` : null,
        };
      });
  } finally { panels.set([]); }
}

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* --------------------------------------------------------- 11 · a button, from nothing */

test('lesson 11 runs, and builds the button it describes', () => {
  const [source] = listings('walkthrough', 'js');
  const built = build(source);

  assert.deepEqual(built.map((c) => c.name), ['Bay', 'Engage']);
  const [bay, engage] = built;
  assert.equal(bay.type, 'Group');
  assert.equal(engage.type, 'Button');
  assert.equal(engage.text, 'ENGAGE');

  // The lesson's comment says measure() reports 49.8 and the width becomes that + 48, floored to
  // at least 96. If the text layout ever changes, the comment is wrong and this says so.
  assert.equal(engage.box, '40,52 98x44', 'the width is sized from ce.text.measure');

  assert.equal(engage.solid, 'FF1B2233');
  assert.equal(engage.stops, '2B3550@0>161E33@100', 'the gradient stops must use `color`');
  assert.deepEqual(engage.states.sort(), ['Disabled', 'Focused', 'Hover', 'Pressed']);
});

test('lesson 11 reports the two guards it is written to demonstrate', () => {
  const [source] = listings('walkthrough', 'js');
  build(source);
  const said = traced();
  // Neither an icon library nor a device profile exists here, which is the case the guards are for.
  assert.match(said, /no 'power' icon/, 'the icon guard did not fire');
  assert.match(said, /no filter\.cutoff/, 'the device guard did not fire');
});

/* ------------------------------------------------------------ 12 · eight, from a table */

test('lesson 12 runs, and builds all eight pads with their derived colours', () => {
  const built = build(listings('from-data', 'js').join('\n'));

  assert.equal(built.length, 9, 'a group and eight pads');
  const [group, ...pads] = built;
  assert.equal(group.name, 'Pads');
  // The group is sized BY the grid — 4 cols x 84 + 3 gaps + 2 padding, 2 rows x 44 + 1 gap + 2.
  assert.equal(group.box, '24,24 398x130', 'the box no longer fits the grid it is computed from');

  assert.deepEqual(pads.map((p) => p.name),
    ['pad36', 'pad38', 'pad42', 'pad46', 'pad45', 'pad50', 'pad39', 'pad51']);
  // Reading order, wrapping at COLS.
  assert.equal(pads[0].box, '16,16 84x44');
  assert.equal(pads[3].box, '298,16 84x44', 'the last of the first row');
  assert.equal(pads[4].box, '16,70 84x44', 'the first of the second');

  // shade() derives the dark stop. Typing these by hand is exactly what the function replaces.
  assert.equal(pads[0].stops, '3B5BA5@0>1D2D52@100');
  assert.equal(pads[1].stops, 'A5563B@0>522B1D@100');
});

test('lesson 12 gives a roll only to the rows that asked for one', () => {
  const built = build(listings('from-data', 'js').join('\n'));
  const pads = built.slice(1);

  // 1/16 at 120 BPM is 125 ms; 1/32 is 62 (the floor of 62.5). Derived from the tempo, which is
  // the whole claim the lesson makes about doing this from a script.
  assert.equal(pads[1].repeat, 'repeating:0/125', 'Snare rolls at 1/16');
  assert.equal(pads[2].repeat, 'repeating:0/62', 'Hat C rolls at 1/32');
  assert.deepEqual(
    pads.filter((p) => p.repeat).map((p) => p.name), ['pad38', 'pad42'],
    'exactly the two rows carrying a `roll` flag, and no others',
  );

  // …and says so on its face, from the same row.
  assert.equal(pads[1].text, 'SNARE  1/16');
  assert.equal(pads[0].text, 'KICK', 'a pad with no roll must not claim one');
});

/* ---------------------------------------------------------- the counts the prose states */

test('the manual states the size of the surface it documents', () => {
  // Lesson 5 says the number out loud. The page's own script overwrites it on load, so a wrong
  // number in the file is invisible in a browser — which is how it sat two phases stale, claiming
  // 536 members across 40 modules. Asserted against the contract, not against a copied figure.
  const members = MODULES.reduce((n, m) => n + Object.keys(moduleMemberMap(m.id)).length, 0);
  const said = (id) => {
    const m = page.match(new RegExp(`<b id="${id}">([^<]*)</b>`));
    assert.ok(m, `the manual no longer has a <b id="${id}"> to state a count in`);
    return Number(m[1].replace(/,/g, ''));
  };
  assert.equal(said('i-mem'), members, 'the stated member count is stale');
  assert.equal(said('i-mod'), MODULES.length, 'the stated module count is stale');
});

/* ------------------------------------------------------------------- the two languages */

test('the Lua and the JavaScript in the manual describe the same panel', () => {
  // Hand-written twins, not a machine translation, so only a test can promise they agree. The Lua
  // is checked by TRANSLITERATION rather than by running a Lua engine here: what can drift is the
  // data and the arithmetic, and both are visible in the source.
  for (const lesson of ['walkthrough', 'from-data', 'drumkit', 'wiring', 'sequencer', 'ghost']) {
    const lua = listings(lesson, 'lua').join('\n');
    const js = listings(lesson, 'js').join('\n');

    // Every literal the panel is built from has to appear in both.
    const literals = js.match(/"[A-Za-z0-9./ ]{2,}"|\b\d+(\.\d+)?\b/g) ?? [];
    const missing = [...new Set(literals)]
      .filter((lit) => !lua.includes(lit))
      // Template-literal and JS-only spellings that have no business in Lua.
      .filter((lit) => !['16', '2'].includes(lit));
    assert.deepEqual(missing, [],
      `${lesson}: the JavaScript uses values the Lua does not — the two listings have drifted`);

    // And every ce.* verb.
    const verbs = [...new Set(js.match(/ce\.[a-z]+\.[a-zA-Z]+/g) ?? [])];
    assert.deepEqual(verbs.filter((v) => !lua.includes(v)), [],
      `${lesson}: the JavaScript calls verbs the Lua does not`);
  }
});

/* ------------------------------------------------------- 13 · asking the instrument */

/** Run a lesson's JavaScript and hand back the Drum Pads control it built. */
function buildKit(source) {
  panels.set([{
    id: 'p', name: 'P', controls: [],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'manual');
    const names = ['ce', 'set', 'get', 'log', 'logWarn', 'logError', 'on', 'sendNote', 'state'];
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `${source}\nreturn onPanelBuild;`);
    fn(...names.map((n) => api[n]))();
    const kit = flatControls(get(panels)[0].controls)[0];
    assert.ok(kit, 'the listing built no control');
    return kit;
  } finally { panels.set([]); }
}

test('lesson 13 runs, and derives the kit rather than typing it', () => {
  const kit = buildKit(listings('drumkit', 'js').join('\n'));
  const cfg = kit._children.DrumPads;
  const pads = drumPads(kit);

  assert.equal(pads.length, 8, 'a 2 x 4 grid');
  assert.deepEqual(pads.map((p) => p.note), [36, 38, 42, 46, 45, 50, 39, 51]);

  // The claim the lesson is built on: the choke groups are never set, and are right anyway.
  const source = listings('drumkit', 'js').join('\n');
  assert.ok(!/\.choke\s*\(/.test(source), 'the listing must not set a choke group');
  assert.deepEqual(pads.filter((p) => p.choke > 0).map((p) => p.label), ['CH Hat', 'OP Hat']);

  // …and the rolls landed on exactly those, from a loop that names no index.
  assert.ok(!/roll\(KIT,\s*\d/.test(source), 'the listing must not roll a numbered pad');
  assert.deepEqual(pads.filter((p) => p.roll).map((p) => p.label), ['CH Hat', 'OP Hat']);
  assert.match(traced(), /rolling: CH Hat, OP Hat/, 'and says so from the same read');

  // The prose points at pad 1 storing nothing, because 36 is what it already played.
  assert.deepEqual(cfg.pads[0], {}, 'the lesson says pad 1 holds an empty entry');
});

test('lesson 13 sets up the strike the way it describes it', () => {
  const kit = buildKit(listings('drumkit', 'js').join('\n'));
  const cfg = kit._children.DrumPads;

  // "the middle is full; the rim is softer"
  assert.equal(strikeVelocity(kit, 0.5, 0.5), 110);
  assert.ok(strikeVelocity(kit, 1, 0.5) < 110);

  // "a 1/32 roll is a 1/32 against the panel tempo"
  assert.equal(rollIntervalMs(cfg, 120), Math.round(beatsPerStep('1/32') * 500));

  // The four corners the lesson lists, at the four corners of a pad.
  assert.equal(strikeAction(cfg, 0.05, 0.95).action, 'accent');
  assert.equal(strikeAction(cfg, 0.95, 0.95).action, 'roll');
  assert.equal(strikeAction(cfg, 0.05, 0.05).action, 'ghost');
  assert.equal(strikeAction(cfg, 0.95, 0.05).action, 'flam');
  assert.equal(strikeAction(cfg, 0.5, 0.5).action, 'none', 'the face is still a plain hit');
});

/* ------------------------------------------------------------ 14 · a panel is a graph */

test('lesson 14 runs, wires what it can, and refuses what it cannot', () => {
  const kit = buildKit(listings('wiring', 'js').join('\n'));   // returns the first control
  assert.ok(kit, 'the listing built nothing');
  const said = traced();

  // The contrast the lesson is built on: one Label, accepted by one field and refused by another.
  assert.match(said, /could not wire Title -> Level\.source/, 'a Label cannot drive a Meter');
  assert.match(said, /not a knob, slider or other range control/, 'and the verb says why');
  assert.match(said, /wired 3 of 4/, 'the other three took');

  // …and the same Label IS the LCD's backlight source, which is the whole point of the pairing.
  assert.match(said, /Title {2}-> {2}Screen\.backlightSource/);
});

test('lesson 14 reads the graph back by name, not by id', () => {
  buildKit(listings('wiring', 'js').join('\n'));
  const said = traced();
  for (const edge of ['Cutoff  ->  Level.source', 'Reso  ->  Screen.valueSource',
                      'Title  ->  Screen.backlightSource']) {
    assert.ok(said.includes(edge), `the walk did not report "${edge}"`);
  }
  // A raw control id must never reach a script, and the walk is where one would show up.
  assert.ok(!/ctl[_-]?[0-9a-f]{6,}/i.test(said), 'an id leaked into what the script printed');
  // The refused link left nothing behind: the Meter is driven by the knob and by nothing else.
  assert.equal((said.match(/-> {2}Level\.source/g) ?? []).length, 1);
});

/* --------------------------------------------------------------- 15 · a step sequencer */

/** Run a lesson's listings and hand back the api plus its top-level handlers. */
function runLesson(lessonId, { sendNote } = {}) {
  panels.set([{
    id: 'p', name: 'P', controls: [],
    scripting: { modules: MODULES.map((m) => m.id) },
  }]);
  activePanelId.set('p');
  clearScriptTrace();
  const api = scriptApiForTesting('', 'manual');
  const names = ['ce', 'set', 'get', 'log', 'logWarn', 'logError', 'on', 'sendNote', 'state'];
  const values = names.map((n) => (n === 'sendNote' && sendNote ? sendNote : api[n]));
  const source = listings(lessonId, 'js').join('\n');
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${source}
    return {
      onPanelBuild: typeof onPanelBuild === 'function' ? onPanelBuild : null,
      onTimer: typeof onTimer === 'function' ? onTimer : null,
    };`);
  const handlers = fn(...values);
  assert.ok(handlers.onPanelBuild, `lesson "${lessonId}" no longer declares onPanelBuild`);
  return { api, handlers };
}

test('the sequencer builds its row, and a seeded pattern with five hits in the scale', () => {
  try {
    const { api, handlers } = runLesson('sequencer');
    handlers.onPanelBuild();

    const names = flatControls(get(panels)[0].controls).map((c) => c._children.Core.name);
    for (let i = 1; i <= 8; i += 1) assert.ok(names.includes(`step${i}`), `step${i} missing`);
    for (const n of ['play', 'gen', 'pos']) assert.ok(names.includes(n), `${n} missing`);

    // euclid(8, 5) puts exactly five hits on the row, whatever the seed picks as notes.
    let on = 0;
    for (let i = 1; i <= 8; i += 1) if (api.get(`step${i}.value`) > 0) on += 1;
    assert.equal(on, 5, 'five of the eight steps are on');

    // Every chosen note is from the scale the lesson names — the "never sour" claim.
    const scale = api.ce.music.scale(48, 'pentatonicMin');
    for (let i = 1; i <= 8; i += 1) {
      assert.ok(scale.includes(api.state.notes[i]), `note ${i} (${api.state.notes[i]}) is in the scale`);
    }
  } finally { panels.set([]); }
});

test('the sequencer advances, wraps, and plays only the steps that are on', () => {
  try {
    const sent = [];
    const { api, handlers } = runLesson('sequencer', { sendNote: (...a) => sent.push(a) });
    handlers.onPanelBuild();
    assert.ok(handlers.onTimer, 'the lesson no longer declares onTimer');

    for (let i = 1; i <= 8; i += 1) api.set(`step${i}.value`, i === 3 ? 1 : 0);
    api.state.step = 0;
    for (let t = 0; t < 8; t += 1) handlers.onTimer({ id: 'beat' });

    assert.equal(api.state.step, 8, 'eight ticks from zero end on step 8');
    assert.equal(api.get('pos.Text.content'), 'step 8');
    assert.equal(sent.length, 1, 'exactly one live step, so exactly one note');
    assert.equal(sent[0][0], 1, 'channel 1');
    assert.equal(sent[0][1], api.state.notes[3], "step 3's own note");
    assert.equal(sent[0][3], 120, 'released after 120 ms');
    // A ninth tick wraps back to step 1.
    handlers.onTimer({ id: 'beat' });
    assert.equal(api.state.step, 1, 'the row wraps after step 8');
  } finally { panels.set([]); }
});

/* ------------------------------------------------------- 16 · a synth that does not exist */

test('the ghost synth is taught: dump decodes, bindings write, bound knobs send', () => {
  // Host mode, as deviceStructure.test.js runs it. Headless there is no preview session for the
  // decoded values to move knobs through, so the two halves of that journey are asserted
  // separately: the declared layout decodes the fed bytes, and the bindings really send.
  const panel = {
    id: 'p', name: 'FS1', width: 800, height: 400, controls: [],
    scripting: { modules: MODULES.map((m) => m.id) },
  };
  setRuntimeHost({
    panel,
    scripts: [],
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => (String(path).toLowerCase() === 'value.value'
      ? (setNestedValue(control, path, value), true)
      : setNestedValue(control, path, value)),
  });
  clearDeviceRuntimeDefinitions();
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'manual');
    const names = ['ce', 'set', 'get', 'log', 'logWarn', 'logError', 'on', 'sendNote', 'state'];
    const values = names.map((n) => api[n]);
    const source = listings('ghost', 'js').join('\n');
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `${source}
      return typeof onPanelBuild === 'function' ? onPanelBuild : null;`);
    const onPanelBuild = fn(...values);
    assert.ok(onPanelBuild, 'the lesson no longer declares onPanelBuild');
    onPanelBuild();

    const built = panel.controls.map((c) => c._children.Core.name);
    for (const n of ['Cutoff', 'Reso', 'recv', 'status']) assert.ok(built.includes(n), `${n} missing`);

    // The declarations were accepted — a refusal would have said so in the trace.
    assert.doesNotMatch(traced(), /refused|not a defined parameter/i);

    // The declared layout reads 96 and 40 out of the exact bytes the RECEIVE button feeds.
    assert.deepEqual(decodeDump('mainSynth', 'F0 7D 01 20 60 28 F7'), {
      ok: true, kind: 'patch', name: 'patch', values: { cutoff: 96, resonance: 40 },
    });
    // bind() wrote real bindings…
    const bindingsOf = (name) => panel.controls
      .find((c) => c._children.Core.name === name)._children.DeviceBindings.bindings;
    assert.equal(bindingsOf('Cutoff')[0].parameterId, 'cutoff');
    assert.equal(bindingsOf('Reso')[0].parameterId, 'resonance');

    // …and a bound knob really SENDS: the CC parameter as B0 4A (CC 74), the SysEx parameter
    // through its template — maker byte 7D, address 42, the value, a checksum, all framed.
    const midiLines = () => get(scriptTrace)
      .filter((t) => t.kind === 'midi').map((t) => String(t.message ?? ''));
    clearScriptTrace();
    api.set('Cutoff.value', 100);
    assert.ok(midiLines().some((l) => l.includes('B0 4A 64')), `no CC 74 send in:\n${traced()}`);
    clearScriptTrace();
    api.set('Reso.value', 40);
    assert.ok(midiLines().some((l) => l.includes('F0 7D 01 42 28')), `no templated sysex in:\n${traced()}`);

    // Last, because arriving sysex opens the inbound-silence window the lesson's note describes —
    // after it, writes stop echoing out, which would silence the send assertions above.
    clearScriptTrace();
    deliverSysexForTesting({ deviceRole: 'mainSynth', hex: 'F0 7D 09 20 60 28 F7' });
    assert.match(traced(), /dump:/, 'a non-matching sysex is reported');
  } finally {
    setRuntimeHost(null);
    clearDeviceRuntimeDefinitions();
  }
});
