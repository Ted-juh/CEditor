import test from 'node:test';
import assert from 'node:assert/strict';

import { compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';

function run(src, handler, event, initial) {
  const { handlers, diagnostics } = compileJava(src);
  const h = handlers.get(handler);
  assert.ok(h, `handler ${handler} not found; diagnostics: ${diagnostics.join('; ')}`);
  const values = { ...(initial || {}) };
  const ctx = { setValue: (p, v) => { values[p] = v; }, getValue: (p) => values[p] };
  const out = [];
  invokeJava(h, [ctx, event], { print: (s) => out.push(s) });
  return { values, out, diagnostics };
}

test('var, typed locals, arithmetic, ctx.setValue', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    var v = e.value;
    double scaled = v * 2 + 1;
    ctx.setValue("out", scaled);
  }`;
  assert.equal(run(src, 'onValueChanged', { value: 10 }).values.out, 21);
});

test('ArrayList: add, size, get, enhanced for', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) {
    List<Integer> xs = new ArrayList<>();
    for (int i = 0; i < 4; i++) { xs.add(i * 10); }
    int total = 0;
    for (int x : xs) { total += x; }
    ctx.setValue("count", xs.size());
    ctx.setValue("first", xs.get(0));
    ctx.setValue("total", total);
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.count, 4);
  assert.equal(values.first, 0);
  assert.equal(values.total, 60);
});

test('HashMap: put, get, containsKey, getOrDefault', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) {
    Map<String, Integer> m = new HashMap<>();
    m.put("a", 10); m.put("b", 20);
    m.put("a", m.get("a") + 5);
    ctx.setValue("a", m.get("a"));
    ctx.setValue("has", m.containsKey("b"));
    ctx.setValue("def", m.getOrDefault("z", -1));
    ctx.setValue("n", m.size());
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.a, 15);
  assert.equal(values.has, true);
  assert.equal(values.def, -1);
  assert.equal(values.n, 2);
});

test('lambdas (->) and Math.*', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    var dbl = (int x) -> x * 2;
    int hi = Math.max(3, 8);
    ctx.setValue("dbl", dbl(21));
    ctx.setValue("hi", hi);
  }`;
  const { values } = run(src, 'onValueChanged', { value: 5 });
  assert.equal(values.dbl, 42);
  assert.equal(values.hi, 8);
});

test('String methods and System.out.println', () => {
  const src = `void onPanelLoad(CeContext ctx, CeEvent e) {
    String s = "Hello";
    System.out.println("len=" + s.length());
    ctx.setValue("len", s.length());
    ctx.setValue("up", s.toUpperCase());
    ctx.setValue("sub", s.substring(0, 2));
  }`;
  const { values, out } = run(src, 'onPanelLoad', {});
  assert.equal(out.join(''), 'len=5');
  assert.equal(values.len, 5);
  assert.equal(values.up, 'HELLO');
  assert.equal(values.sub, 'He');
});

test('StringBuilder append chaining', () => {
  const src = `void onPanelLoad(CeContext ctx, CeEvent e) {
    StringBuilder sb = new StringBuilder();
    sb.append("a").append(1).append("b");
    ctx.setValue("s", sb.toString());
  }`;
  assert.equal(run(src, 'onPanelLoad', {}).values.s, 'a1b');
});

test('classes with fields and methods, new', () => {
  const src = `
    class Counter {
      int n = 0;
      void bump() { n += 1; }
      int doubled() { return n * 2; }
    }
    void onClick(CeContext ctx, CeEvent e) {
      Counter c = new Counter();
      c.bump(); c.bump(); c.bump();
      ctx.setValue("n", c.n);
      ctx.setValue("d", c.doubled());
    }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.n, 3);
  assert.equal(values.d, 6);
});

test('enum, switch, try/catch/throw with getMessage', () => {
  const src = `
    enum Mode { OFF, ON, AUTO }
    void onValueChanged(CeContext ctx, CeEvent e) {
      int code = 0;
      try {
        if (e.value < 0) { throw new RuntimeException("neg"); }
        switch ((int) e.value) {
          case 0: code = 10; break;
          case 1: code = 20; break;
          default: code = 99; break;
        }
        ctx.setValue("auto", AUTO);
      } catch (Exception ex) {
        ctx.setValue("msg", ex.getMessage());
        code = -1;
      }
      ctx.setValue("code", code);
    }`;
  assert.equal(run(src, 'onValueChanged', { value: -1 }).values.code, -1);
  const ok = run(src, 'onValueChanged', { value: 1 });
  assert.equal(ok.values.code, 20);
  assert.equal(ok.values.auto, 2);
});

test('helper methods and recursion', () => {
  const src = `
    int fib(int n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }
    void onClick(CeContext ctx, CeEvent e) { ctx.setValue("f", fib(10)); }`;
  assert.equal(run(src, 'onClick', {}).values.f, 55);
});

test('unsupported construct → clear diagnostic, no crash', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) { synchronized (x) { } }`;
  const { handlers, diagnostics } = compileJava(src);
  assert.equal(handlers.has('onClick'), false);
  assert.ok(diagnostics.some((d) => /not supported/.test(d)));
});

import { analyze, getFoldRegions, getDefinition } from '../src/CE_Application/scripting/languageService.js';

const JV = `int helper(int x) { return x * 2; }
void onValueChanged(CeContext ctx, CeEvent e) {
  ctx.setValue("out", helper((int) e.value));
}`;

test('languageService analyzes Java: symbols, diagnostics, folding, go-to-def', () => {
  const { symbols, diagnostics } = analyze(JV, 'java');
  assert.equal(diagnostics.length, 0);
  assert.ok(symbols.some((s) => s.name === 'helper' && s.kind === 'function'));
  assert.ok(symbols.some((s) => s.name === 'onValueChanged'));

  const bad = analyze('void onClick(CeContext ctx, CeEvent e) { int x = ; }', 'java');
  assert.ok(bad.diagnostics.length >= 1);

  const folds = getFoldRegions(JV, 'java');
  assert.ok(folds.length >= 1 && folds.every((f) => f.endLine > f.startLine));

  const def = getDefinition(JV, 'java', JV.indexOf('helper((int)'));
  assert.ok(def && def.line === 1);
});
