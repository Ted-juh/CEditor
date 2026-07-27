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
