import test from 'node:test';
import assert from 'node:assert/strict';

import { validateScript } from '../src/CE_Application/scripting/scriptValidate.js';

const hasHandlerWarning = (problems) =>
  problems.some((p) => /no function .*is defined/.test(p.message));

test('Python handler defined with `def` does not trigger the missing-handler warning', () => {
  const script = {
    id: 'p', name: 'Ready', event: 'onPanelReady', scope: 'panel', language: 'python',
    source: 'def onPanelReady(info):\n    if info.firstTime:\n        pass\n',
  };
  assert.equal(hasHandlerWarning(validateScript(script)), false);
});

test('Lua/JS handler defined with `function` still passes', () => {
  const lua = { id: 'l', event: 'onPanelReady', scope: 'panel', language: 'lua',
    source: 'function onPanelReady(info)\nend' };
  const js = { id: 'j', event: 'onPanelReady', scope: 'panel', language: 'javascript',
    source: 'function onPanelReady(info) {}' };
  assert.equal(hasHandlerWarning(validateScript(lua)), false);
  assert.equal(hasHandlerWarning(validateScript(js)), false);
});

test('missing handler still warns regardless of language', () => {
  const script = { id: 'm', event: 'onPanelReady', scope: 'panel', language: 'python',
    source: 'def somethingElse():\n    pass\n' };
  assert.equal(hasHandlerWarning(validateScript(script)), true);
});

/* -------------------------------------------------------- module opt-in (slice 3) */

test('a script reaching into a module the panel pinned off is an error, not a surprise', () => {
  const script = { source: 'function onX(){ sendCC(1, 74, 100) }', scope: 'panel', event: 'onX' };
  const panel = { scripting: { modules: ['ce.math'] }, scripts: [script] };

  const problems = validateScript(script, panel);
  const gate = problems.find((p) => p.message.includes('ce.midi'));
  assert.ok(gate, 'the missing module is reported');
  assert.equal(gate.severity, 'error', 'it will not work at runtime, so it is an error');
  assert.match(gate.message, /ce\.midi\.sendCC/, 'and names the member that needs it');
  assert.match(gate.message, /Scripting Modules/);
});

test('the same script is fine once the module is declared, and on auto', () => {
  const script = { source: 'function onX(){ sendCC(1, 74, 100) }', scope: 'panel', event: 'onX' };

  const declared = { scripting: { modules: ['ce.midi'] }, scripts: [script] };
  assert.deepEqual(validateScript(script, declared).filter((p) => p.message.includes('has not enabled')), []);

  // Auto never reports: the declaration follows the source, so there is nothing to act on.
  const auto = { scripts: [script] };
  assert.deepEqual(validateScript(script, auto).filter((p) => p.message.includes('has not enabled')), []);

  // …and with no panel passed at all, validation behaves exactly as it did before modules existed.
  assert.deepEqual(validateScript(script).filter((p) => p.message.includes('has not enabled')), []);
});

/* ------------------------------------------- component verbs aimed at the wrong control */
// The picker and autocomplete narrow to the target's type, so this is not reachable by browsing.
// It is trivially reachable by pasting code in, renaming a control, or retargeting the script —
// and until this check existed all three produced a script the editor called clean and the
// runtime quietly refused.

import { createControl } from '../src/CE_Application/models/componentTypes.js';

const named = (type, name) => {
  const c = createControl(type);
  c._children.Core.name = name;
  return c;
};
const panelWith = (...controls) => ({ id: 'p', controls, scripts: [] });

const wrongTarget = (problems) => problems.find((p) => /has no \w+ section/.test(p.message));

test('a component verb on a control that has no such section is an error', () => {
  const script = { source: 'function onX(){ arpRate("cutoffslider", 4) }', scope: 'panel', event: 'onX' };
  const p = wrongTarget(validateScript(script, panelWith(named('Slider', 'cutoffslider'))));

  assert.ok(p, 'the mistake is reported at edit time, not left to the runtime');
  assert.equal(p.severity, 'error', 'the call does nothing at all, so it is not a hint');
  assert.match(p.message, /ce\.components\.arp\.rate/, 'named the way the user would write it');
  assert.match(p.message, /is a Slider/, 'and says what the control actually is');
  assert.match(p.message, /no component verbs of its own/, 'and what it can be driven with instead');
});

test('the same verb on the right control is clean', () => {
  const script = { source: 'function onX(){ arpRate("myarp", 4) }', scope: 'panel', event: 'onX' };
  assert.equal(wrongTarget(validateScript(script, panelWith(named('Arp', 'myarp')))), undefined);
});

test('a control that has a DIFFERENT family is told which one it has', () => {
  const script = { source: 'function onX(){ arpRate("thelooper", 4) }', scope: 'panel', event: 'onX' };
  const p = wrongTarget(validateScript(script, panelWith(named('Looper', 'thelooper'))));
  assert.ok(p);
  assert.match(p.message, /Its own verbs are ce\.components\.looper/);
});

test('a control inside a Group is found, not reported as unknown', () => {
  // Most real panels group their controls. A check that stopped at the top level would miss the
  // majority of them — the same bug ce.panel.snapshot turned up in the runtime's name lookup.
  const group = createControl('Group');
  const inner = named('Slider', 'inner');
  group._children.Children._children[inner._children.Core.id] = inner;
  const script = { source: 'function onX(){ arpRate("inner", 4) }', scope: 'panel', event: 'onX' };
  assert.ok(wrongTarget(validateScript(script, panelWith(group))));
});

test('a name the panel has not got is left alone', () => {
  // The panel may gain the control later, and this check is not the place to police spelling.
  const script = { source: 'function onX(){ arpRate("notyet", 4) }', scope: 'panel', event: 'onX' };
  assert.equal(wrongTarget(validateScript(script, panelWith(named('Slider', 'cutoffslider')))), undefined);
});

test('a computed target is left alone rather than guessed at', () => {
  // `arpRate(name, 4)` is unknowable without running the thing. A red mark on correct code is
  // much worse than silence.
  const script = { source: 'function onX(){ local n = "cutoffslider"\n arpRate(n, 4) }', scope: 'panel', event: 'onX' };
  assert.equal(wrongTarget(validateScript(script, panelWith(named('Slider', 'cutoffslider')))), undefined);
});

test('the cross-cutting verbs are never flagged, whatever the target is', () => {
  const script = {
    source: 'function onX(){ sendCC(1,74,100) set("cutoffslider.value", 1) drawArc("cutoffslider",0,0,4,0,1) }',
    scope: 'panel', event: 'onX',
  };
  assert.equal(wrongTarget(validateScript(script, panelWith(named('Slider', 'cutoffslider')))), undefined);
});

test('one message per verb per target, however many times it is called', () => {
  const script = {
    source: 'function onX(){ arpRate("s", 1) arpRate("s", 2) arpRate("s", 3) }', scope: 'panel', event: 'onX',
  };
  const hits = validateScript(script, panelWith(named('Slider', 's'))).filter((p) => /has no Arp section/.test(p.message));
  assert.equal(hits.length, 1, 'a wall of identical errors helps nobody');
});

test('with no panel there is nothing to check against, and nothing is claimed', () => {
  const script = { source: 'function onX(){ arpRate("cutoffslider", 4) }', scope: 'panel', event: 'onX' };
  assert.equal(wrongTarget(validateScript(script)), undefined);
});

// --- a ce.<module>.<name> the module does not have (unknownCalls.js) -----------------------------
// It fails the moment it runs, in every language, and nothing said so: ce.panel.on read to this
// check as on(), and Python's ce.midi.send_note as nothing at all.

const problemsOf = (language, source) => validateScript({ id: 'u', event: 'onValueChanged', scope: 'component', language, source })
  .map((p) => `${p.severity}: ${p.message}`);

test('a call the module does not have is an error, with the one meant', () => {
  assert.ok(problemsOf('lua', 'function onValueChanged(value)\n  ce.panel.on("Cutoff", "valueChanged", function() end)\nend').includes(
    'error: ce.panel.on is not a call ce.panel has, so the script stops with an error here when it runs. Did you mean ce.core.on?'));
  assert.ok(problemsOf('python', 'def onValueChanged(value):\n    ce.midi.send_note(1, 60, 100)\n').includes(
    'error: ce.midi.send_note is not a call ce.midi has, so the script stops with an error here when it runs. Did you mean ce.midi.sendNote?'));
  assert.ok(problemsOf('javascript', 'function onValueChanged(v) { ce.anim.too("X", 1); }').includes(
    'error: ce.anim.too is not a call ce.anim has, so the script stops with an error here when it runs. Did you mean ce.anim.to?'));
  // A Lua method call is the same name.
  assert.ok(problemsOf('lua', 'function onValueChanged(v)\n  ce.panel:on("A", "valueChanged", f)\nend').some((p) => p.startsWith('error: ce.panel.on is not')));
});

test('a call the module has, one in a comment, and anything not ce.<module>.<name> are left alone', () => {
  const quiet = (language, source) => problemsOf(language, source).filter((p) => / is not a call /.test(p));
  assert.deepEqual(quiet('lua', 'function onValueChanged(v)\n  ce.core.set("A", 1)\n  ce.math.fromARGB("#80123456")\n  -- ce.panel.gone(1)\n  --[[ ce.panel.gone(2) ]]\n  ce.components.drumpads.colour("Kit", 1, "red")\n  ce.has("ce.midi")\nend'), []);
  assert.deepEqual(quiet('python', 'def onValueChanged(v):\n    ce.core.log("x")  # ce.midi.nope()\n'), []);
  assert.deepEqual(quiet('javascript', 'function onValueChanged(v) { /* ce.ui.gone() */ ce.ui.notify("x"); // ce.ui.alsoGone()\n mine.ce.panel.on(1); }'), []);
  assert.equal(quiet('lua', 'function onValueChanged(v)\n  ce.panel.on(1)\n  ce.panel.on(2)\nend').length, 1, 'once per call, however often it is written');
});

test('on() is only the on() there is: ce.panel.on\'s argument is not read as an event', () => {
  const events = (language, source) => problemsOf(language, source).filter((p) => /isn't a known control\/panel\/device event/.test(p));
  assert.deepEqual(events('lua', 'function onValueChanged(v)\n  ce.panel.on("Cutoff", "onValueChangd", f)\nend'), []);
  assert.equal(events('lua', 'function onValueChanged(v)\n  ce.core.on("Cutoff", "valueChangd", f)\nend').length, 1);
  assert.equal(events('lua', 'function onValueChanged(v)\n  on("Cutoff", "valueChangd", f)\nend').length, 1);
  assert.equal(events('cpp', '[](CeContext& ctx, const CeEvent& e) {\n  ctx.on("Cutoff", "valueChangd", f);\n}').length, 1);
});
