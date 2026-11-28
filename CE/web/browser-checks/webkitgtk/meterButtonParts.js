// meterButtonParts.js — run in the editor's page by meterButtonParts.py, in WebKitGTK. A classic
// script, not a module: it reaches the app through window.__ceImport and the panels through
// window.__PANELS, both put there before the page ran. What it holds, as meterShowcase.mjs and
// buttonShowcase.mjs hold it in Chromium:
//
//   - Every lamp: Cascade's lamps one after another and Sparkle's scattered, on a meter drawn with
//     parts (Gimbal Ring) and on the plain look's LED segments (Graphite), a bar's, a column's, an
//     arc's: a staggered delay is a calc() over a custom property, per lamp.
//   - A legend a letter at a time: each letter where WebKit set it in the word drawn whole
//     (getStartPositionOfChar), on a meter (Reel's SIGNAL) and on a key (Neon's MUTE).
//   - The words' colour: a legend typed under its part's colour frames takes them; a shimmer's light
//     plays on the letters' fill.
//   - Reel on SVG letters: each letter a column of glyphs rolling in a window of its own, in lines
//     (`lh`) of the line-height the piece sets.
//   - Thrown words: a key's "+1" rises and fades; Count counts; a clipping meter throws "OVER".
//
// Each part takes a picture (CMD:{"shot"}), so what WebKit drew can be looked at.
(async () => {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cmd = (c) => new Promise((resolve) => { window.__cmdDone = resolve; document.title = `CMD:${JSON.stringify(c)}`; });
  const imp = window.__ceImport;
  let error = '';
  try {
    for (let i = 0; i < 240 && !document.querySelector('.app'); i += 1) await wait(500);
    const { deserializePanel, serializePanel } = await imp('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await imp('/src/CE_Application/stores/panels.js');
    const { setPreviewModeEnabled } = await imp('/src/CE_Application/stores/interactionPreview.js');
    const { panelMaker } = await imp('/scripts/festivalKit.js');
    const { words, keyframes } = await imp('/src/CE_Application/utils/componentPresetKit.js');
    const { METER_PRESETS } = await imp('/src/CE_Application/utils/meterPresets.js');
    const { applyPresetPatch } = await imp('/src/CE_Application/utils/animationPresetModel.js');
    const { getControlSet } = await imp('/src/CE_Application/models/controlSets.js');
    const { resolveControlForSet } = await imp('/src/CE_Application/models/controlSetFamilies.js');
    const { setNestedValue } = await imp('/src/CE_Application/stores/controlTreeUtils.js');

    const idsOf = (panel) => Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
    const show = async (panel, settle = 600) => {
      setPreviewModeEnabled(false);
      await wait(400);
      addPanel(panel);
      await wait(1500);
      setPreviewModeEnabled(true);
      await wait(settle);
      return idsOf(panel);
    };
    const open = (key, settle) => show(deserializePanel(window.__PANELS[key], `/tmp/${key}.cepanel`, null), settle);
    const built = (maker, settle) => show(deserializePanel(serializePanel(maker.scenes([])), '/tmp/built.cepanel', null), settle);
    const inPreview = (id) => `.preview-surface [data-control-id="${id}"]`;
    const q = (id, sel) => [...document.querySelectorAll(`${inPreview(id)} ${sel}`)];
    const delays = (id) => q(id, '[data-lamp]')
      .map((g) => [Number(g.dataset.lamp), parseFloat(getComputedStyle(g).animationDelay) || 0])
      .sort((a, b) => a[0] - b[0]).map(([, d]) => d);
    const increasing = (list) => list.length > 1 && list.every((d, i) => i === 0 || d > list[i - 1]);
    const scattered = (list) => list.length > 1 && new Set(list).size === list.length && list.some((d, i) => i > 0 && d < list[i - 1]);
    const pieces = (id) => q(id, '[data-word-piece]').map((t) => {
      const box = t.getBBox();
      return {
        text: t.textContent, x: Number(t.getAttribute('x')), left: box.x, right: box.x + box.width,
        fill: getComputedStyle(t).fill, transform: getComputedStyle(t).transform, name: getComputedStyle(t).animationName,
        lines: t.querySelectorAll('tspan').length, clipped: !!t.closest('[clip-path]'),
      };
    });
    const hiddenWord = (id) => {
      const t = q(id, 'text[visibility="hidden"]')[0];
      if (!t) return null;
      const box = t.getBBox();
      return { left: box.x, right: box.x + box.width };
    };
    const samples = async (id, times = 20, every = 60) => {
      const out = [];
      for (let k = 0; k < times; k += 1) { out.push(pieces(id)); await wait(every); }
      return out;
    };
    const rgb = (fill) => (/rgb\((\d+), (\d+), (\d+)/.exec(fill) ?? []).slice(1).map(Number);
    const box = (id) => document.querySelector(inPreview(id)).getBoundingClientRect();
    const thrown = (id) => q(id, '.key-word').map((w) => ({ text: w.textContent.trim(), y: w.getBoundingClientRect().y, opacity: Number(getComputedStyle(w).opacity) }));
    const preset = (id) => METER_PRESETS.find((p) => p.id === `ce:meter:${id}`).preset;
    const wear = (control, setId, ...presets) => {
      for (const id of presets) {
        const { patch, reason } = applyPresetPatch(control, preset(id), { drawn: resolveControlForSet(control, getControlSet(setId)) });
        if (!patch) throw new Error(`${id}: ${reason}`);
        for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
      }
    };
    const forever = { iterations: 'infinite' };

    // --- Every lamp, on a meter drawn with parts -------------------------------------------------
    let ids = await open('segments', 300);
    const cascade = delays(ids.Cascade);
    const sparkle = delays(ids.Sparkle);
    check('Every lamp (Gimbal Ring): Cascade reaches each lamp after the last', cascade.length >= 8 && increasing(cascade), cascade.join(' '));
    check('Every lamp (Gimbal Ring): Sparkle reaches them in a scattered order', scattered(sparkle), sparkle.join(' '));
    await cmd({ shot: '1-segments' });

    // --- Every lamp, on the plain look's segments -------------------------------------------------
    {
      const f = panelMaker('plain-lamps', 'Plain lamps', { set: 'graphite', bg: 'FF202326', width: 900, height: 320, fields: { gridEnabled: false } });
      const meter = (name, x, y, w, h, settings, id) => {
        const c = f.add('Meter', name, x, y, w, h);
        Object.assign(c._children.Meter, { value: 0.6, ...settings });
        wear(c, 'graphite', id);
      };
      meter('Bar', 40, 40, 360, 40, { segments: 12, orientation: 'horizontal' }, 'cascade');
      meter('Column', 440, 30, 50, 240, { segments: 10, orientation: 'vertical' }, 'cascade');
      meter('Arc', 540, 40, 200, 200, { segments: 16, orientation: 'arc' }, 'cascade');
      meter('Twinkle', 40, 140, 360, 40, { segments: 12, orientation: 'horizontal' }, 'sparkle');
      ids = await built(f, 200);
      const lists = ['Bar', 'Column', 'Arc'].map((name) => [name, delays(ids[name])]);
      check('Every lamp (plain look): Cascade reaches a bar\'s, a column\'s and an arc\'s segments in turn',
        lists.every(([, list]) => list.length >= 10 && increasing(list)), JSON.stringify(lists));
      check('Every lamp (plain look): Sparkle twinkles a bar\'s segments in a scattered order', scattered(delays(ids.Twinkle)), delays(ids.Twinkle).join(' '));
      await wait(250);
      await cmd({ shot: '2-plain-lamps-cascading' });
      await wait(2500);
      await cmd({ shot: '3-plain-lamps-after' });
    }

    // --- A meter's legend a letter at a time (Reel's SIGNAL) ---------------------------------------
    ids = await open('words', 900);
    const typed = pieces(ids.TypeOn);
    const word = hiddenWord(ids.TypeOn);
    check('Words (Reel): Type on cuts SIGNAL into its letters, each further along than the last',
      typed.map((p) => p.text).join('') === 'SIGNAL' && increasing(typed.map((p) => p.x)), JSON.stringify(typed.map((p) => [p.text, p.x])));
    check('Words (Reel): the letters stand where WebKit set the word whole, end to end',
      word && typed.length === 6 && Math.abs(typed[0].left - word.left) < 1.5 && Math.abs(typed[5].right - word.right) < 1.5
        && typed.every((p, i) => i === 0 || p.left >= typed[i - 1].right - 1.2),
      JSON.stringify({ word, letters: typed.map((p) => [p.text, +p.left.toFixed(2), +p.right.toFixed(2)]) }));
    const numbers = pieces(ids.NumbersInTurn);
    check('Words (Reel): Numbers in turn writes the scale\'s numbers a number at a time', numbers.length >= 5 && numbers[0].text === '-60', JSON.stringify(numbers.map((p) => p.text)));
    await cmd({ shot: '4-meter-words' });

    // --- A meter's words keep their part's colour; a shimmer on the fill; Reel on SVG letters --------
    {
      const f = panelMaker('meter-word-colour', 'Meter word colour', { set: 'reel', bg: 'FF5E6A5E', width: 900, height: 260, fields: { gridEnabled: false } });
      const meter = (name, x, animations) => {
        const c = f.add('Meter', name, x, 40, 260, 160);
        c._children.Meter.value = 0.4;
        c._children.Animations = { _type: 'Animations', enabled: true, _children: animations };
      };
      meter('Painted', 20, {
        colour: keyframes('colour', { type: 'always' }, 'legend', [{ at: 0, fill: 'FFFF0000' }, { at: 0.5, fill: 'FF0000FF' }, { at: 1, fill: 'FFFF0000' }], 1000, { easing: 'linear', ...forever }),
        typed: words('typed', { type: 'always' }, 'legend', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 80, duration: 300, ...forever }),
      });
      meter('Shine', 310, { shine: words('shine', { type: 'always' }, 'legend', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 500, colour: 'FFFF2D2D', ...forever }) });
      meter('Spin', 600, { spin: words('spin', { type: 'always' }, 'legend', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 60, duration: 700, ...forever }) });
      ids = await built(f, 600);
      const painted = await samples(ids.Painted);
      const fills = painted.map((list) => rgb(list[0]?.fill ?? ''));
      check('Words: a legend typed under its colour frames takes them, red and blue',
        fills.some(([r, , b]) => r > 200 && b < 60) && fills.some(([r, , b]) => b > 200 && r < 60), painted.map((l) => l[0]?.fill).join(' | '));
      const shine = await samples(ids.Shine);
      check('Words: a shimmer\'s light runs along a meter\'s letters, on their fill',
        shine.flat().some((p) => { const [r, g, b] = rgb(p.fill); return r > 240 && g < 80 && b < 80; }), [...new Set(shine.flat().map((p) => p.fill))].join(' | '));
      const spin = await samples(ids.Spin);
      check('Words: Reel spins a meter\'s letters, each a column of seven in a window of its own',
        spin.every((list) => list.length === 6 && list.every((p) => p.lines === 7 && p.clipped)) && new Set(spin.map((list) => list[2].transform)).size > 3,
        JSON.stringify(spin[0]));
      await cmd({ shot: '5-word-colour-a' });
      await wait(230);
      await cmd({ shot: '5-word-colour-b' });
    }

    // --- A key's legend: a letter at a time, Reel, a shimmer -------------------------------------
    {
      const f = panelMaker('key-words', 'Key words', { set: 'neon', bg: 'FF101218', width: 700, height: 320, fields: { gridEnabled: false } });
      const key = (name, x, y, legend, animation) => {
        const c = f.add('ToggleButton', name, x, y, 200, 120);
        Object.assign(c._children.Parts._children.legend, { offText: legend, onText: legend, fontSize: 16 });
        c._children.Animations = { _type: 'Animations', enabled: true, _children: animation };
      };
      key('Typed', 40, 40, 'MUTE', { typed: words('typed', { type: 'always' }, 'legend', 'typewriter', 'in', { split: 'letter', order: 'forward', stagger: 120, duration: 300, ...forever }) });
      key('SpinKey', 270, 40, 'MUTE', { spin: words('spin', { type: 'always' }, 'legend', 'reel', 'in', { split: 'letter', order: 'forward', stagger: 60, duration: 700, ...forever }) });
      key('ShineKey', 500, 40, 'SOLO', { shine: words('shine', { type: 'always' }, 'legend', 'shimmer', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 500, colour: 'FFFF2D2D', ...forever }) });
      ids = await built(f, 700);
      const keyTyped = pieces(ids.Typed);
      check('Keys: a key\'s legend cut into its letters, each further along than the last',
        keyTyped.map((p) => p.text).join('') === 'MUTE' && increasing(keyTyped.map((p) => p.x)), JSON.stringify(keyTyped.map((p) => [p.text, p.x])));
      const keySpin = await samples(ids.SpinKey);
      check('Keys: Reel spins a key\'s letters, each a column in a window of its own',
        keySpin.every((list) => list.length === 4 && list.every((p) => p.lines === 7 && p.clipped)) && new Set(keySpin.map((list) => list[0].transform)).size > 3,
        JSON.stringify(keySpin[0]));
      const keyShine = await samples(ids.ShineKey);
      check('Keys: a shimmer\'s light shows on a key\'s letters',
        keyShine.flat().some((p) => { const [r, g, b] = rgb(p.fill); return r > 240 && g < 80 && b < 80; }), [...new Set(keyShine.flat().map((p) => p.fill))].join(' | '));
      await cmd({ shot: '6-key-words' });
    }

    // --- Thrown words: a key's, and a clipping meter's -----------------------------------------
    ids = await open('thrown', 900);
    await cmd({ move: [5, 5] });
    const plus = box(ids.PlusOne);
    await cmd({ click: [plus.x + plus.width / 2, plus.y + plus.height / 2 - plus.height * 0.15] });
    await wait(60);
    const early = thrown(ids.PlusOne);
    await cmd({ shot: '7-thrown-rising' });
    await wait(500);
    const late = thrown(ids.PlusOne);
    check('Thrown: a click throws "+1" up from the key, fading as it rises',
      early.map((w) => w.text).join() === '+1' && late.length === 1 && late[0].y < early[0].y - 10 && late[0].opacity < early[0].opacity,
      JSON.stringify({ early, late }));
    const tally = box(ids.Count);
    for (let k = 0; k < 3; k += 1) {
      await cmd({ click: [tally.x + tally.width / 2, tally.y + tally.height / 2 - tally.height * 0.15] });
      await wait(120);
    }
    const counted = thrown(ids.Count).map((w) => w.text);
    check('Thrown: Count throws 1, 2, 3', counted.join() === '1,2,3', JSON.stringify(counted));
    await cmd({ shot: '8-thrown-count' });

    ids = await open('level', 300);
    let over = [];
    for (let k = 0; k < 90 && !over.length; k += 1) { await wait(100); over = thrown(ids.OverThrown); }
    const overAt = over[0]?.y;
    await cmd({ shot: '9-over-thrown' });
    await wait(300);
    const overLater = thrown(ids.OverThrown);
    check('Thrown: a clipping meter throws "OVER", and it rises', over.length && over[0].text === 'OVER' && overLater.length && overLater[0].y < overAt,
      JSON.stringify({ over, overLater }));
  } catch (e) {
    error = String(e && e.stack || e);
  }
  window.__report = { checks, error };
  document.title = 'DONE';
})();
