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
  const out = [];
  const ret = invokeCpp(h, [ctx, event], { print: (s) => out.push(s) });
  return { ret, values, log, out, diagnostics };
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
    goto done;
    done: ;
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

test('user-defined helper functions are callable (incl. recursion)', () => {
  const src = `
    int factorial(int n) { if (n <= 1) return 1; return n * factorial(n - 1); }
    void onClick(CeContext& ctx, const CeEvent& event) { ctx.setValue("fac", factorial(5)); }`;
  assert.equal(run(src, 'onClick', {}).values.fac, 120);
});

test('std::vector with push_back, size, and range-based for', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    std::vector<int> xs;
    for (int i = 0; i < 4; i++) { xs.push_back(i * 10); }
    int total = 0;
    for (auto x : xs) { total += x; }
    ctx.setValue("count", xs.size());
    ctx.setValue("total", total);
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.count, 4);
  assert.equal(values.total, 60);
});

test('C-style array with initializer list and indexing', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    double gains[3] = {1.5, 2.5, 4.0};
    ctx.setValue("g", gains[0] + gains[2]);
  }`;
  assert.equal(run(src, 'onClick', {}).values.g, 5.5);
});

test('switch / case with fallthrough and break', () => {
  const src = `void onValueChanged(CeContext& ctx, const CeEvent& event) {
    int mode = (int)event.value;
    int r = 0;
    switch (mode) {
      case 0: r = 1; break;
      case 1: r += 10;
      case 2: r += 100; break;
      default: r = -1;
    }
    ctx.setValue("r", r);
  }`;
  assert.equal(run(src, 'onValueChanged', { value: 0 }).values.r, 1);
  assert.equal(run(src, 'onValueChanged', { value: 1 }).values.r, 110); // fallthrough 1 -> 2
  assert.equal(run(src, 'onValueChanged', { value: 9 }).values.r, -1);  // default
});

test('std::cout and printf route to the print sink', () => {
  const src = `void onPanelLoad(CeContext& ctx, const CeEvent& event) {
    int n = 3;
    std::cout << "n=" << n << std::endl;
    printf("val %d done", n);
  }`;
  const { out } = run(src, 'onPanelLoad', {});
  assert.equal(out.join(''), 'n=3\nval 3 done');
});

test('std::string methods (size, substr)', () => {
  const src = `void onPanelLoad(CeContext& ctx, const CeEvent& event) {
    std::string s = "hello";
    ctx.setValue("len", s.size());
    ctx.setValue("head", s.substr(0, 2));
  }`;
  const { values } = run(src, 'onPanelLoad', {});
  assert.equal(values.len, 5);
  assert.equal(values.head, 'he');
});

test('structs: default fields, member init, member access/assignment', () => {
  const src = `
    struct Point { double x; double y = 2.5; };
    void onClick(CeContext& ctx, const CeEvent& event) {
      Point p;
      p.x = 4.0;
      ctx.setValue("sum", p.x + p.y);
    }`;
  assert.equal(run(src, 'onClick', {}).values.sum, 6.5);
});

test('std::map: operator[], count, at, size', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    std::map<std::string, int> m;
    m["a"] = 10;
    m["b"] = 20;
    m["a"] += 5;
    ctx.setValue("a", m["a"]);
    ctx.setValue("has_b", m.count("b"));
    ctx.setValue("n", m.size());
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.a, 15);
  assert.equal(values.has_b, 1);
  assert.equal(values.n, 2);
});

test('enum and enum class enumerators resolve as constants', () => {
  const src = `
    enum Waveform { Sine, Saw, Square };
    enum class Mode { Off = 0, On = 4, Auto };
    void onValueChanged(CeContext& ctx, const CeEvent& event) {
      ctx.setValue("saw", Saw);
      ctx.setValue("auto", Mode::Auto);
    }`;
  const { values } = run(src, 'onValueChanged', {});
  assert.equal(values.saw, 1);     // 0,1,2
  assert.equal(values.auto, 5);    // Off=0, On=4, Auto=5
});

test('nullptr is usable and falsy', () => {
  const src = `void onPanelLoad(CeContext& ctx, const CeEvent& event) {
    int x = nullptr;
    if (!x) { ctx.setValue("nil", 1); }
  }`;
  assert.equal(run(src, 'onPanelLoad', {}).values.nil, 1);
});

test('helper using a struct returns it; nested field math', () => {
  const src = `
    struct Range { double lo = 0; double hi = 1; };
    double span(Range r) { return r.hi - r.lo; }
    void onClick(CeContext& ctx, const CeEvent& event) {
      Range r;
      r.lo = 2; r.hi = 9;
      ctx.setValue("span", span(r));
    }`;
  assert.equal(run(src, 'onClick', {}).values.span, 7);
});

test('struct methods with implicit-this field access', () => {
  const src = `
    struct Counter {
      int n = 0;
      void bump() { n += 1; }
      int doubled() { return n * 2; }
    };
    void onClick(CeContext& ctx, const CeEvent& event) {
      Counter c;
      c.bump(); c.bump(); c.bump();
      ctx.setValue("n", c.n);
      ctx.setValue("d", c.doubled());
    }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.n, 3);
  assert.equal(values.d, 6);
});

test('lambdas: definition, capture, and call', () => {
  const src = `void onValueChanged(CeContext& ctx, const CeEvent& event) {
    double gain = 3.0;
    auto scale = [&](double x) { return x * gain; };
    auto add = [](int a, int b) { return a + b; };
    ctx.setValue("scaled", scale(event.value));
    ctx.setValue("sum", add(4, 5));
  }`;
  const { values } = run(src, 'onValueChanged', { value: 10 });
  assert.equal(values.scaled, 30);
  assert.equal(values.sum, 9);
});

test('do-while loop runs at least once', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    int i = 0; int n = 0;
    do { n += i; i++; } while (i < 4);
    ctx.setValue("n", n);
  }`;
  assert.equal(run(src, 'onClick', {}).values.n, 6); // 0+1+2+3
});

test('for loop with comma init and update', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    int hits = 0;
    for (int i = 0, j = 6; i < j; i++, j--) { hits++; }
    ctx.setValue("hits", hits);
  }`;
  assert.equal(run(src, 'onClick', {}).values.hits, 3); // (0,6)(1,5)(2,4) then 3<3 false
});

test('bitwise operators and string::npos', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    int flags = 6;
    ctx.setValue("and", flags & 2);
    ctx.setValue("or", flags | 1);
    ctx.setValue("xor", flags ^ 3);
    std::string s = "hello";
    ctx.setValue("missing", s.find("z") == std::string::npos ? 1 : 0);
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.and, 2);
  assert.equal(values.or, 7);
  assert.equal(values.xor, 5);
  assert.equal(values.missing, 1);
});

test('std::pair via make_pair and brace-init', () => {
  const src = `void onClick(CeContext& ctx, const CeEvent& event) {
    std::pair<int, int> p = {3, 7};
    auto q = std::make_pair(10, 20);
    ctx.setValue("a", p.first + p.second);
    ctx.setValue("b", q.second - q.first);
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.a, 10);
  assert.equal(values.b, 10);
});
