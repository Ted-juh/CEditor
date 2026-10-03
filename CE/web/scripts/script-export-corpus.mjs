// script-export-corpus.mjs — the canonical panel script, written as REAL source in every
// language the product claims to run.
//
// This is the fixture behind `npm run test:script-exports`. It exists because CEditor stores
// and executes scripts AS-IS (no transpilation, see CLAUDE.md): what the author types is what
// the runtime runs and what the exported plugin ships. So the only validation that means
// anything is running the author's actual source through the real toolchain for that language.
//
// Every language below implements the SAME behaviour against the panel API (panelApi.js):
//
//   onValueChanged(value):
//     set("cutoff.value",    scale(value, 0, 1, 80, 12000))
//     set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
//     sendCC(1, 74, round(value * 127))
//
// With value = 0.5 that is exactly two set() calls (6040 and 0.475) and one CC of 64 —
// EXPECTED below. Every harness asserts that, so a language whose source drifts out of step
// with the API fails instead of quietly diverging.
//
// Two API shapes, matching panelRuntime.js:
//   • Lua / JavaScript / TypeScript / Python — the API is injected as globals: set(), sendCC(), …
//   • C++ / C# / Java — handlers take (ctx, event) and reach the same API through ctx.

export const EXPECTED = {
  patches: [
    { path: 'cutoff.value', value: 6040 },
    { path: 'resonance.value', value: 0.475 },
  ],
  cc: { channel: 1, cc: 74, value: 64 },
  eventValue: 0.5,
};

// The handler source, exactly as an author would type it into the editor. Nothing here is
// generated — these strings are the fixture.
export const SOURCES = {
  lua: `function onValueChanged(value)
  set("cutoff.value", scale(value, 0, 1, 80, 12000))
  set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
  sendCC(1, 74, round(value * 127))
end
`,

  javascript: `function onValueChanged(value) {
  set('cutoff.value', scale(value, 0, 1, 80, 12000));
  set('resonance.value', scale(value, 0, 1, 0.1, 0.85));
  sendCC(1, 74, round(value * 127));
}
`,

  // Typed exactly like the JS one — the point of the TS target is that the author gets types
  // over the same global API, and that it still transpiles to JS that the QuickJS host runs.
  typescript: `function onValueChanged(value: number): void {
  set('cutoff.value', scale(value, 0, 1, 80, 12000));
  set('resonance.value', scale(value, 0, 1, 0.1, 0.85));
  sendCC(1, 74, round(value * 127));
}
`,

  // `set` and `round` shadow the Python builtins here exactly as they do at runtime, where
  // panelRuntime seeds the script's globals with the panel API before exec.
  python: `def onValueChanged(value):
    set("cutoff.value", scale(value, 0, 1, 80, 12000))
    set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
    sendCC(1, 74, round(value * 127))
`,

  cpp: `void onValueChanged(CeContext& ctx, const CeEvent& event) {
  ctx.set("cutoff.value", ctx.scale(event.value, 0.0, 1.0, 80.0, 12000.0));
  ctx.set("resonance.value", ctx.scale(event.value, 0.0, 1.0, 0.1, 0.85));
  ctx.sendCC(1, 74, ctx.round(event.value * 127.0));
}
`,

  csharp: `void OnValueChanged(CeContext ctx, CeEvent e) {
  ctx.SetValue("cutoff.value", ctx.Scale(e.Value, 0, 1, 80, 12000));
  ctx.SetValue("resonance.value", ctx.Scale(e.Value, 0, 1, 0.1, 0.85));
  ctx.SendCC(1, 74, (int)ctx.Round(e.Value * 127));
}
`,

  java: `void onValueChanged(CeContext ctx, CeEvent e) {
  ctx.set("cutoff.value", ctx.scale(e.value, 0.0, 1.0, 80.0, 12000.0));
  ctx.set("resonance.value", ctx.scale(e.value, 0.0, 1.0, 0.1, 0.85));
  ctx.sendCC(1, 74, (int) ctx.round(e.value * 127.0));
}
`,
};

// Languages whose handlers take (ctx, event) rather than the injected globals.
export const CTX_LANGUAGES = ['cpp', 'csharp', 'java'];

/* ------------------------------------------------------------------ the compiled core */
// SOURCES above is the example the manual shows, and it makes three calls. A compiled C++, C# or
// Java handler can make more than that: the export's context accepts every spelling the preview's
// `ctx` accepts for set/get, log, sendCC/sendNRPN/sendSysex and the six arithmetic helpers (C#'s
// PascalCase names too). CORE_SOURCES calls every one of them, so the validator can run each sample
// through the preview and through the real export generators and compare every call it makes.
//
// What the preview `ctx` has beyond this core — the rest of the panel API — previews and does not
// compile: see "What the C++/C#/Java preview subset covers" in the scripting manual.
//
// The helper calls are written once, here, and spliced into each sample, so the three languages are
// asked exactly the same questions. Every argument is source text that means the same double in all
// three, and the edges are the ones a straight translation gets wrong: JS Math.round's half-up and
// its -0, Math.max(0, NaN) being NaN, 2^52 - 0.5, the largest double below 0.5.
export const HELPER_CASES = [
  ['round', '2.5'], ['round', '-2.5'], ['round', '-0.5'], ['round', '-0.4'],
  ['round', '0.49999999999999994'], ['round', '4503599627370495.5'], ['round', '-0.0'],
  ['round', '1e300'], ['round', '1.0 / zero'],
  ['clamp', '5.0, 0.0, 3.0'], ['clamp', '-1.0, 0.0, 3.0'], ['clamp', '2.0, 0.0, 3.0'],
  ['clamp', '-0.0, 0.0, 1.0'], ['clamp', 'zero / zero, 0.0, 1.0'],
  ['scale', '64.0, 0.0, 127.0, 0.0, 1000.0'], ['scale', '5.0, 0.0, 0.0, 9.0, 10.0'],
  ['scale', '0.3, 0.0, 1.0, 80.0, 12000.0'], ['scale', '0.1, 0.0, 1.0, 0.1, 0.85'],
  ['scale', '0.7, 1.0, 0.0, -1.0, 1.0'],
  ['snap', '7.0, 5.0'], ['snap', '7.0, 0.0'], ['snap', '0.35, 0.1'], ['snap', '-0.25, 0.5'],
  ['snap', '0.3, 0.1'],
  ['lerp', '0.0, 10.0, 0.25'], ['lerp', '0.1, 0.7, 0.3'], ['lerp', '1e16, 1.0, 0.1'],
  ['lerp', '-3.3, 7.7, 0.9'],
  // The same lerp as the second one, from values the compiler cannot see: `half` is the event's 0.5,
  // and 0.5 * 0.2, 0.5 * 1.4 and 0.5 * 0.6 are exactly 0.1, 0.7 and 0.3. With constants the compiler
  // folds the call away; here it runs, and a fused multiply-add gives 0.27999999999999997 for JS's
  // 0.28000000000000003.
  ['lerp', 'half * 0.2, half * 1.4, half * 0.6'],
  ['curve', '0.3, "exp"'], ['curve', '0.3, "log"'], ['curve', '-0.2, "log"'],
  ['curve', 'zero / zero, "log"'], ['curve', '0.3, "s"'], ['curve', '0.7, "s"'],
  ['curve', '0.123456789, "s"'], ['curve', '0.3, "linear"'], ['curve', '0.3'],
  ['curve', '0.3, "bogus"'],
];

/** What the recording host answers for a get(). Anything else reads as null. */
export const CORE_GET = { path: 'cutoff.value', value: 42.5 };

const pascal = (name) => name.charAt(0).toUpperCase() + name.slice(1);
// C# asks half the questions in each spelling, so both are compiled and both are run.
const helperCalls = (setter, name) => HELPER_CASES
  .map(([fn, args], i) => `  ctx.${setter(i)}("h.${i}", ctx.${name(fn, i)}(${args}));`)
  .join('\n');

export const CORE_SOURCES = {
  cpp: `void onValueChanged(CeContext& ctx, const CeEvent& event) {
  double zero = 0.0;
  double half = event.value;
  ctx.set("a.value", event.value);
  ctx.setValue("b.value", 0.25);
  ctx.set("c.text", "hello");
  ctx.set("e.value", 3);
  std::string path = "d.value";
  ctx.set(path, ctx.get("${CORE_GET.path}"));
  ctx.setValue(path, ctx.getValue("${CORE_GET.path}", "value"));
  ctx.log("plain");
  ctx.log("with a number", 42.5);
  ctx.log("with text", "abc");
  std::string message = "from a string";
  ctx.log(message);
  ctx.sendCC(1, 74, 64);
  ctx.sendNRPN(2, 1, 8, 1000);
  ctx.sendSysex({0xF0, 0x41, 0x10, 0x7F, 0xF7});
  std::vector<int> bytes = {0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7};
  ctx.sendSysex(bytes);
  ctx.sendSysex("F0 41 10 42 F7");
${helperCalls((i) => (i % 2 ? 'set' : 'setValue'), (fn) => fn)}
}
`,

  csharp: `void OnValueChanged(CeContext ctx, CeEvent e) {
  double zero = 0.0;
  double half = e.Value;
  ctx.SetValue("a.value", e.Value);
  ctx.set("a2.value", e.value);
  ctx.setValue("b.value", 0.25);
  ctx.set("c.text", "hello");
  ctx.SetValue("e.value", 3);
  string path = "d.value";
  ctx.set(path, ctx.get("${CORE_GET.path}"));
  ctx.SetValue(path, ctx.GetValue("${CORE_GET.path}", "value"));
  double cutoff = ctx.getValue("${CORE_GET.path}");
  ctx.setValue("f.value", cutoff + 1);
  ctx.Log("plain");
  ctx.log("with a number", 42.5);
  ctx.Log("with text", "abc");
  ctx.SendCC(1, 74, 64);
  ctx.sendCC(1, 75, 65);
  ctx.SendNRPN(2, 1, 8, 1000);
  ctx.sendNRPN(2, 1, 9, 1001);
  ctx.SendSysex(new[] { 0xF0, 0x41, 0x10, 0x7F, 0xF7 });
  ctx.sendSysex(new List<int> { 0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7 });
  ctx.SendSysex(new byte[] { 0xF0, 0x43, 0xF7 });
  ctx.SendSysex("F0 41 10 42 F7");
${helperCalls((i) => (i % 2 ? 'set' : 'SetValue'), (fn, i) => (i % 2 ? fn : pascal(fn)))}
}
`,

  java: `void onValueChanged(CeContext ctx, CeEvent e) {
  double zero = 0.0;
  double half = e.value;
  ctx.set("a.value", e.value);
  ctx.setValue("b.value", 0.25);
  ctx.set("c.text", "hello");
  ctx.set("e.value", 3);
  String path = "d.value";
  ctx.set(path, ctx.get("${CORE_GET.path}"));
  ctx.setValue(path, ctx.getValue("${CORE_GET.path}", "value"));
  double cutoff = (double) ctx.get("${CORE_GET.path}");
  ctx.set("f.value", cutoff + 1);
  ctx.log("plain");
  ctx.log("with a number", 42.5);
  ctx.log("with text", "abc");
  ctx.sendCC(1, 74, 64);
  ctx.sendNRPN(2, 1, 8, 1000);
  ctx.sendSysex(new int[] { 0xF0, 0x41, 0x10, 0x7F, 0xF7 });
  ArrayList<Integer> bytes = new ArrayList<>();
  bytes.add(0xF0); bytes.add(0x7E); bytes.add(0x7F); bytes.add(0xF7);
  ctx.sendSysex(bytes);
  ctx.sendSysex("F0 41 10 42 F7");
${helperCalls((i) => (i % 2 ? 'set' : 'setValue'), (fn) => fn)}
}
`,
};

/** The panel API as plain JS — the reference the interpreter cross-check runs against. */
export function createRecordingApi() {
  const patches = [];
  const midi = [];
  const api = {
    set: (path, value) => { patches.push({ path, value }); },
    get: () => 0,
    log: () => {},
    sendCC: (channel, cc, value) => { midi.push({ channel, cc, value }); },
    sendNRPN: () => {},
    sendSysex: () => {},
    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
    round: (v) => Math.round(v),
    scale: (v, inLo, inHi, outLo, outHi) => (inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)),
    snap: (v, step) => (step === 0 ? v : Math.round(v / step) * step),
    lerp: (a, b, t) => a + (b - a) * t,
  };
  return { patches, midi, api };
}

/** Assert a run produced exactly the canonical effects. Returns an error string, or ''. */
export function checkEffects(patches, midi) {
  if (patches.length !== EXPECTED.patches.length) {
    return `expected ${EXPECTED.patches.length} set() calls, got ${patches.length}`;
  }
  for (const [i, want] of EXPECTED.patches.entries()) {
    const got = patches[i];
    if (got.path !== want.path) return `set()[${i}] path: expected ${want.path}, got ${got.path}`;
    if (Math.abs(Number(got.value) - want.value) > 1e-9) {
      return `set()[${i}] value: expected ${want.value}, got ${got.value}`;
    }
  }
  if (midi.length !== 1) return `expected 1 CC, got ${midi.length}`;
  const cc = midi[0];
  if (cc.channel !== EXPECTED.cc.channel || cc.cc !== EXPECTED.cc.cc || Number(cc.value) !== EXPECTED.cc.value) {
    return `CC: expected ${JSON.stringify(EXPECTED.cc)}, got ${JSON.stringify(cc)}`;
  }
  return '';
}
