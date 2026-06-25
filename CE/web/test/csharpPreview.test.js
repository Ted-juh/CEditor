import test from 'node:test';
import assert from 'node:assert/strict';

import { compileCsharp, invokeCsharp } from '../src/CE_Application/scripting/csharpPreview.js';

function makeCtx(initial = {}) {
  const values = { ...initial };
  return { values, ctx: { SetValue: (p, v) => { values[p] = v; }, GetValue: (p) => values[p], setValue: (p, v) => { values[p] = v; }, getValue: (p) => values[p] } };
}
function run(src, handler, event, initial) {
  const { handlers, diagnostics } = compileCsharp(src);
  const h = handlers.get(handler);
  assert.ok(h, `handler ${handler} not found; diagnostics: ${diagnostics.join('; ')}`);
  const { ctx, values } = makeCtx(initial);
  const out = [];
  invokeCsharp(h, [ctx, event], { print: (s) => out.push(s) });
  return { values, out, diagnostics };
}

test('var, typed locals, arithmetic, ctx.SetValue', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    var v = e.value;
    double scaled = v * 2 + 1;
    ctx.SetValue("out", scaled);
  }`;
  assert.equal(run(src, 'onValueChanged', { value: 10 }).values.out, 21);
});

test('List<int> with Add, Count, indexer, and foreach', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) {
    var xs = new List<int>();
    for (int i = 0; i < 4; i++) { xs.Add(i * 10); }
    int total = 0;
    foreach (var x in xs) { total += x; }
    ctx.SetValue("count", xs.Count);
    ctx.SetValue("total", total);
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.count, 4);
  assert.equal(values.total, 60);
});

test('Dictionary<string,int> with indexer, ContainsKey, Count', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) {
    var m = new Dictionary<string, int>();
    m["a"] = 10; m["b"] = 20; m["a"] += 5;
    ctx.SetValue("a", m["a"]);
    ctx.SetValue("has", m.ContainsKey("b"));
    ctx.SetValue("n", m.Count);
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.a, 15);
  assert.equal(values.has, true);
  assert.equal(values.n, 2);
});

test('lambdas and List.Sort with comparator', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) {
    var xs = new List<int>();
    xs.Add(3); xs.Add(1); xs.Add(2);
    xs.Sort((a, b) => b - a);
    var dbl = (int x) => x * 2;
    ctx.SetValue("first", xs[0]);
    ctx.SetValue("dbl", dbl(21));
  }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.first, 3); // descending
  assert.equal(values.dbl, 42);
});

test('string interpolation and Console.WriteLine to the sink', () => {
  const src = `void onPanelLoad(CeContext ctx, CeEvent e) {
    int n = 3;
    string s = $"n={n} done";
    Console.WriteLine(s);
    ctx.SetValue("len", s.Length);
  }`;
  const { values, out } = run(src, 'onPanelLoad', {});
  assert.equal(out.join(''), 'n=3 done');
  assert.equal(values.len, 8);
});

test('Math.* and ternary / null-coalescing', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    double v = e.value;
    double c = Math.Clamp(v, 0, 100);
    double r = v > 50 ? Math.Max(c, 60) : Math.Min(c, 40);
    ctx.SetValue("out", r);
  }`;
  assert.equal(run(src, 'onValueChanged', { value: 200 }).values.out, 100);
  assert.equal(run(src, 'onValueChanged', { value: 10 }).values.out, 10);
});

test('classes with fields, methods and new', () => {
  const src = `
    class Counter {
      int n = 0;
      public void Bump() { n += 1; }
      public int Doubled() { return n * 2; }
    }
    void onClick(CeContext ctx, CeEvent e) {
      var c = new Counter();
      c.Bump(); c.Bump(); c.Bump();
      ctx.SetValue("n", c.n);
      ctx.SetValue("d", c.Doubled());
    }`;
  const { values } = run(src, 'onClick', {});
  assert.equal(values.n, 3);
  assert.equal(values.d, 6);
});

test('enum, switch, try/catch/throw', () => {
  const src = `
    enum Mode { Off, On, Auto }
    void onValueChanged(CeContext ctx, CeEvent e) {
      int code = 0;
      try {
        if (e.value < 0) { throw new Exception("neg"); }
        switch ((int)e.value) {
          case 0: code = 10; break;
          case 1: code = 20; break;
          default: code = 99; break;
        }
        ctx.SetValue("auto", Auto);
      } catch (Exception ex) {
        ctx.SetValue("msg", ex.Message);
        code = -1;
      }
      ctx.SetValue("code", code);
    }`;
  assert.equal(run(src, 'onValueChanged', { value: -1 }).values.code, -1);
  const ok = run(src, 'onValueChanged', { value: 1 });
  assert.equal(ok.values.code, 20);
  assert.equal(ok.values.auto, 2);
});

test('unsupported construct → clear diagnostic, no crash', () => {
  const src = `void onClick(CeContext ctx, CeEvent e) { lock (x) { } }`;
  const { handlers, diagnostics } = compileCsharp(src);
  assert.equal(handlers.has('onClick'), false);
  assert.ok(diagnostics.some((d) => /not supported/.test(d)));
});

import { analyze, getFoldRegions, getDefinition } from '../src/CE_Application/scripting/languageService.js';

const CS = `int Helper(int x) { return x * 2; }
void onValueChanged(CeContext ctx, CeEvent e) {
  ctx.SetValue("out", Helper((int)e.value));
}`;

test('languageService analyzes C#: symbols, diagnostics, folding, go-to-def', () => {
  const { symbols, diagnostics } = analyze(CS, 'csharp');
  assert.equal(diagnostics.length, 0);
  assert.ok(symbols.some((s) => s.name === 'Helper' && s.kind === 'function'));
  assert.ok(symbols.some((s) => s.name === 'onValueChanged'));

  const bad = analyze('void onClick(CeContext ctx, CeEvent e) { int x = ; }', 'csharp');
  assert.ok(bad.diagnostics.length >= 1);

  const folds = getFoldRegions(CS, 'csharp');
  assert.ok(folds.length >= 1 && folds.every((f) => f.endLine > f.startLine));

  const def = getDefinition(CS, 'csharp', CS.indexOf('Helper((int)'));
  assert.ok(def && def.line === 1);
});
