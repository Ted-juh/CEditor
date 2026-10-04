import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeJava, compileJava, invokeJava } from '../src/CE_Application/scripting/javaPreview.js';

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

// `true` was lexed as the number 1: `true == (x > 0.2)` came out false, println(true) printed 1,
// "on: " + true gave "on: 1", and the panel API got 1 for a literal and true for a comparison.
test('bool literals are booleans', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    boolean lit = true; boolean above = e.value > 0.2;
    ctx.setValue("lit", lit); ctx.setValue("same", lit == above); ctx.setValue("off", false);
    System.out.println(lit); System.out.println("on: " + lit);
  }`;
  const { values, out } = run(src, 'onValueChanged', { value: 0.5 });
  assert.equal(values.lit, true);
  assert.equal(values.same, true);
  assert.equal(values.off, false);
  assert.deepEqual(out.map((s) => s.trim()), ['true', 'on: true']);
});

// On two bools, & | and ^ are the logical operators, and give a bool; the preview used JS's bitwise
// ones and gave 1, so `both == true` was false again, while the export sends a bool.
test('& | and ^ on two bools give a bool', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    boolean flag = e.value > 0.2; boolean above = e.value > 0.4; boolean low = e.value > 0.9;
    boolean both = flag & above;
    ctx.setValue("both", both); ctx.setValue("eq", both == true);
    ctx.setValue("either", low | flag); ctx.setValue("differ", flag ^ low); ctx.setValue("same", flag ^ above);
    boolean any = false; any |= flag; ctx.setValue("orAssigned", any);
    boolean all = true; all &= low; ctx.setValue("andAssigned", all);
    boolean flip = true; flip ^= true; ctx.setValue("xorAssigned", flip);
    ctx.setValue("bits", 6 & 3);
  }`;
  const { values } = run(src, 'onValueChanged', { value: 0.5 });
  assert.equal(values.both, true);
  assert.equal(values.eq, true);
  assert.equal(values.either, true);
  assert.equal(values.differ, true);
  assert.equal(values.same, false);
  assert.equal(values.orAssigned, true);
  assert.equal(values.andAssigned, false);
  assert.equal(values.xorAssigned, false);
  assert.equal(values.bits, 2);
});

// In an exported handler ctx.get returns Object, so `double x = ctx.get(...)` previewed here and
// failed javac at export. The preview now says what javac will, with the cast that works in both,
// and does not run the handler, as it does not run one that fails to parse. validate-script-exports
// checks the same rules against javac itself (JAVA_READ_CASES).
test('a ctx read javac would reject is reported, with the cast to write, and does not run', () => {
  const src = `void onValueChanged(CeContext ctx, CeEvent e) {
    ctx.setValue("ran", 1);
    double cutoff = ctx.get("cutoff.value");
  }`;
  const { handlers, diagnostics } = compileJava(src);
  assert.equal(handlers.has('onValueChanged'), false);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0], /double cutoff = ctx\.get\(…\): it is an Object in Java, so javac rejects this\. Write double cutoff = ctx\.getDouble\(…\) \(line 3\)/);

  const { diagnostics: shown } = analyzeJava(src);
  assert.equal(shown[0].line, 3);
});

test('each kind of rejected read gets the advice that fits it', () => {
  const advice = (body) => compileJava(`void onValueChanged(CeContext ctx, CeEvent e) {\n  ${body}\n}`).diagnostics.join(' ');
  assert.match(advice('int n = ctx.get("step.value");'), /Write int n = ctx\.getInt\(…\)/);
  assert.match(advice('long n = ctx.get("step.value");'), /Write long n = \(long\) ctx\.getDouble\(…\)/);
  assert.match(advice('String s = ctx.get("label.text");'), /Write String s = ctx\.getString\(…\)/);
  assert.match(advice('double y = ctx.get("a") * 2;'), /write ctx\.getDouble\(…\) to use it as a number/);
  assert.match(advice('if (ctx.get("led.on")) { }'), /a condition must be a boolean.*write ctx\.getBoolean\(…\)/);
  assert.match(advice('int n = (int) ctx.get("a");'), /compiles, and throws when it runs.*Write ctx\.getInt\(…\)/);
  // A boxed cast throws as the primitive one does: the value is a Double, which is not an Integer.
  assert.match(advice('Integer i = (Integer) ctx.get("a");'), /\(Integer\) ctx\.get\(…\) compiles, and throws when it runs.*Write ctx\.getInt\(…\)/);
  assert.match(advice('Long l = (Long) ctx.get("a");'), /compiles, and throws when it runs.*Write \(long\) ctx\.getDouble\(…\)/);
  for (const boxed of ['Float', 'Short', 'Byte', 'Character']) {
    assert.match(advice(`Object o = (${boxed}) ctx.get("a");`), /compiles, and throws when it runs/, boxed);
  }
  // ! && and || take a boolean, and getDouble would fail javac again; shifts take an integer; & | ^
  // take either, and the report says so.
  for (const body of ['boolean b = !ctx.get("led.on");', 'boolean b = ctx.get("led.on") && true;', 'boolean b = false || ctx.get("led.on");']) {
    assert.match(advice(body), /takes a boolean.*write ctx\.getBoolean\(…\)/, body);
    assert.doesNotMatch(advice(body), /getDouble/, body);
  }
  assert.match(advice('int n = ctx.get("step.value") << 1;'), /takes an integer.*write ctx\.getInt\(…\)/);
  assert.match(advice('boolean b = ctx.get("led.on") & true;'), /write ctx\.getBoolean\(…\) for a flag or ctx\.getInt\(…\) for bits/);
  assert.match(advice('int n = 0; n |= ctx.get("step.value");'), /write ctx\.getBoolean\(…\) for a flag or ctx\.getInt\(…\) for bits/);
  assert.match(advice('double y = -ctx.get("a");'), /write ctx\.getDouble\(…\) to use it as a number/);
});

test('valid Java reads are left alone', () => {
  for (const body of [
    'double x = (double) ctx.get("a");', 'Object o = ctx.get("a");', 'var v = ctx.get("a");',
    'String s = "v=" + ctx.get("a");', 'ctx.set("b", ctx.get("a"));', 'int n = (int) (double) ctx.get("a");',
    'if (ctx.get("a") == null) { }', 'ctx.log("v", ctx.get("a"));', 'System.out.println(ctx.get("a"));',
    'double y = ctx.getDouble("a") * 2;', 'int n = ctx.getInt("a");', 'if (ctx.getBoolean("on")) { }',
    'Double d = (Double) ctx.get("a");', 'Number n = (Number) ctx.get("a");', 'Boolean b = (Boolean) ctx.get("on");',
    'Integer i = ctx.getInt("a");', 'boolean b = !ctx.getBoolean("on");', 'int m = ctx.getInt("a") & 1;',
  ]) {
    const { handlers, diagnostics } = compileJava(`void onValueChanged(CeContext ctx, CeEvent e) {\n  ${body}\n}`);
    assert.deepEqual(diagnostics, [], body);
    assert.ok(handlers.has('onValueChanged'), body);
  }
});
