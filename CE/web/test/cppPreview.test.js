import test from 'node:test';
import assert from 'node:assert/strict';

import { compileCpp, invokeCpp } from '../src/CE_Application/scripting/cppPreview.js';

// A fake CeContext that records setValue calls and serves getValue from a map.
function makeCtx(initial = {}) {
  const values = { ...initial };
  const log = [];
  return {
    values, log,
    ctx: {
      setValue: (p, v) => { values[p] = v; },
      getValue: (p) => values[p],
      log: (m, v) => log.push(v !== undefined ? `${m} ${v}` : String(m)),
    },
  };
}

function run(src, handler, event, initial) {
  const { handlers, diagnostics } = compileCpp(src);
  const h = handlers.get(handler);
  assert.ok(h, `handler ${handler} not found; diagnostics: ${diagnostics.join('; ')}`);
  const { ctx, values, log } = makeCtx(initial);
  const ret = invokeCpp(h, [ctx, event]);
  return { ret, values, log, diagnostics };
}

test('reads event.value, does arithmetic, writes via ctx.setValue', () => {
  const src = `void onValueChanged(CeContext& ctx, const CeEvent& event) {
    double v = event.value;
    ctx.setValue("cutoff", v * 2 + 1);
  }`;
  const { values } = run(src, 'onValueChanged', { value: 10 });
  assert.equal(values.cutoff, 21);
});

test('if/else with firstTime guard', () => {
  const src = `void onPanelReady(CeContext& ctx, const CeEvent& event) {
    if (event.firstTime) { ctx.setValue("init", 1); } else { ctx.setValue("init", 0); }
  }`;
  assert.equal(run(src, 'onPanelReady', { firstTime: true }).values.init, 1);
  assert.equal(run(src, 'onPanelReady', { firstTime: false }).values.init, 0);
});

test('for loop accumulates', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    int sum = 0;
    for (int i = 1; i <= 5; i++) { sum += i; }
    ctx.setValue("sum", sum);
  }`;
  assert.equal(run(src, 'onClick', {}).values.sum, 15);
});

test('std::clamp / min / max / ternary', () => {
  const src = `void onValueChanged(CeContext& ctx, const CeEvent& event) {
    double v = event.value;
    double c = std::clamp(v, 0.0, 100.0);
    double m = v > 50 ? max(c, 60.0) : min(c, 40.0);
    ctx.setValue("out", m);
  }`;
  assert.equal(run(src, 'onValueChanged', { value: 200 }).values.out, 100); // clamped then max(100,60)
  assert.equal(run(src, 'onValueChanged', { value: 10 }).values.out, 10);   // min(10,40)
});

test('getValue round-trips and while loop works', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    double n = ctx.getValue("count");
    while (n > 0) { n -= 1; }
    ctx.setValue("count", n);
  }`;
  assert.equal(run(src, 'onClick', {}, { count: 3 }).values.count, 0);
});

test('ctx.log is callable', () => {
  const src = `void onPanelLoad(CeContext& ctx, const CeEvent& event) { ctx.log("hi", 42); }`;
  assert.deepEqual(run(src, 'onPanelLoad', {}).log, ['hi 42']);
});

test('unsupported construct yields a clear diagnostic, not a crash', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    switch (1) { case 1: break; }
  }`;
  const { handlers, diagnostics } = compileCpp(src);
  assert.equal(handlers.has('onClick'), false);
  assert.ok(diagnostics.some((d) => /not supported/.test(d)));
});

test('multiple handlers in one source are all found', () => {
  const src = `
    void onPanelLoad(CeContext& ctx, const CeEvent& event) { ctx.setValue("a", 1); }
    void onPanelClose(CeContext& ctx, const CeEvent& event) { ctx.setValue("b", 2); }`;
  const { handlers } = compileCpp(src);
  assert.deepEqual([...handlers.keys()].sort(), ['onPanelClose', 'onPanelLoad']);
});
