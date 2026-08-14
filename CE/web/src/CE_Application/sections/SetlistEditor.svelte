<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { panels, resolvedActivePanelId } from '../stores/panels.js';
  import {
    setlistScenes, setlistCount, setlistIndex, sceneMessages, setlistChannel,
    sceneChangeCount, missingPaths, captureScene, FOOT_ACTIONS, FOOT_ACTION_LABELS,
    MAX_SCENES, normalizeSceneCcs, normalizeSysex, crossfadeMs, footswitchBackCc,
  } from '../utils/setlistLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Send from 'lucide-svelte/icons/send';
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
  import Gauge from 'lucide-svelte/icons/gauge';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let p = $derived(getSection(control, 'Setlist'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Setlist.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }
  function colRgb(v, fb) { const t = String(v ?? fb).replace(/^#/, ''); return `#${t.length >= 6 ? t.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) {
    const t = String(cur ?? '').replace(/^#/, '');
    const al = /^[0-9a-fA-F]{8}$/.test(t) ? t.slice(0, 2) : 'FF';
    set(prop, `${al}${hex.replace('#', '').toUpperCase()}`);
  }
  function optInt(v, lo, hi) {
    const t = String(v ?? '').trim();
    if (!t) return null;                       // empty means "don't send one"
    return clampInt(t, lo, hi, lo);
  }

  let scenes = $derived.by(() => { try { return setlistScenes(control); } catch { return []; } });
  let index = $derived.by(() => { try { return setlistIndex(control); } catch { return -1; } });

  // The controls on this panel and their current values, for capture and for
  // the "would change" count. Reading it here rather than in the engine keeps
  // the engine pure.
  let panelControls = $derived.by(() => {
    const panel = ($panels ?? []).find((x) => x.id === $resolvedActivePanelId) ?? null;
    return Array.isArray(panel?.controls) ? panel.controls : [];
  });
  function readPath(path) {
    const dot = String(path).indexOf('.');
    if (dot <= 0) return undefined;
    const name = String(path).slice(0, dot);
    const rest = String(path).slice(dot + 1).split('.');
    const target = panelControls.find((c) => String(c?._children?.Core?.name ?? '') === name);
    let node = target?._children;
    for (const seg of rest) {
      if (node == null) return undefined;
      node = node[seg] !== undefined ? node[seg] : node?._children?.[seg];
    }
    return node;
  }
  // Everything a scene could sensibly store: the value of every control that has
  // one, addressed by name. Names, not ids, so a scene survives a re-save.
  let candidatePaths = $derived.by(() => panelControls
    .filter((c) => String(c?._children?.Core?.controlType ?? '') !== 'Setlist')
    .map((c) => String(c?._children?.Core?.name ?? ''))
    .filter(Boolean)
    .map((n) => `${n}.Value.value`));

  let capturePaths = $derived(Array.isArray(p?.capturePaths) && p.capturePaths.length
    ? p.capturePaths.map(String) : candidatePaths);

  function updateScene(i, patch) {
    const next = scenes.map((s, k) => (k === i ? { ...s, ...patch } : s));
    set('scenes', next);
  }
  function addScene() {
    if (scenes.length >= MAX_SCENES) return;
    set('scenes', [...scenes, {
      id: `scene_${Date.now().toString(36)}`, name: `Scene ${scenes.length + 1}`, note: '',
      values: {}, program: null, bankMsb: null, bankLsb: null, bpm: null, enabled: true, colour: '',
    }]);
  }
  function removeScene(i) {
    set('scenes', scenes.filter((_, k) => k !== i));
    if (index >= scenes.length - 1) set('index', Math.max(0, scenes.length - 2));
  }
  function moveScene(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= scenes.length) return;
    const next = scenes.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set('scenes', next);
  }
  function capture(i) {
    updateScene(i, captureScene(scenes[i], capturePaths, readPath).values !== undefined
      ? { values: captureScene(scenes[i], capturePaths, readPath).values } : {});
  }
  function captureAllPathsFromPanel() { set('capturePaths', candidatePaths); }
  // Extra MIDI, typed rather than clicked: "91=0, 93=40" is faster than four
  // spinners, and a scene rarely has more than a couple.
  function ccText(scene) {
    return (scene.ccs ?? []).map((c) => `${c.cc}=${c.value}${c.channel ? `@${c.channel}` : ''}`).join(', ');
  }
  function setCcText(i, text) {
    const list = String(text ?? '').split(/[,;]+/).map((t) => t.trim()).filter(Boolean).map((t) => {
      const m = t.match(/^(\d+)\s*=\s*(\d+)(?:\s*@\s*(\d+))?$/);
      return m ? { cc: Number(m[1]), value: Number(m[2]), channel: m[3] ? Number(m[3]) : null } : null;
    }).filter(Boolean);
    updateScene(i, { ccs: normalizeSceneCcs(list) });
  }
  function sysexText(scene) {
    return (scene.sysex ?? []).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  }
  function setSysexText(i, text) {
    const bytes = String(text ?? '').trim().split(/[\s,]+/).filter(Boolean)
      .map((t) => parseInt(t, 16)).filter((n) => Number.isFinite(n));
    updateScene(i, { sysex: bytes.length ? normalizeSysex(bytes) : [] });
  }
</script>

{#if p}
  <PropertySection title="Setlist">
    <PropertyCell label="" span={4} hint="">
      <div class="note">
        {setlistCount(control)} {setlistCount(control) === 1 ? 'scene' : 'scenes'}{index >= 0 ? ` · on ${index + 1}` : ''}.
        Advancing skips disabled scenes, and the end of the list stays put unless you turn loop on —
        a setlist that jumps back to song one at the end of the night is a bad surprise.
      </div>
    </PropertyCell>

    <PropertyCell label="Loop" span={2} hint="Next at the end goes back to the first scene.">
      <PropertyToggle value={p.wrap === true} onchange={() => set('wrap', !(p.wrap === true))} />
    </PropertyCell>
    <PropertyCell label="Recall" span={2} hint="Send program, recall values, recall tempo. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'sendProgram', title: 'Send program — bank select then program change, in that order', on: p.sendProgram !== false, icon: Send },
          { key: 'recallValues', title: "Recall values — write each scene's captured panel values on recall", on: p.recallValues !== false, icon: SlidersHorizontal },
          { key: 'recallTempo', title: "Recall tempo — a scene's tempo drives the Transport", on: p.recallTempo !== false, icon: Gauge },
        ]}
        ontoggle={(key) => {
          if (key === 'sendProgram') set('sendProgram', !(p.sendProgram !== false));
          else if (key === 'recallValues') set('recallValues', !(p.recallValues !== false));
          else if (key === 'recallTempo') set('recallTempo', !(p.recallTempo !== false));
        }}
      />
    </PropertyCell>
    <PropertyCell label="Crossfade" span={1} hint="Milliseconds to slide panel values on a recall; 0 snaps. Only numbers interpolate; the rest switch at halfway.">
      <input class="val" type="number" min="0" max="10000" step="50" value={crossfadeMs(control)} onchange={(e) => set('crossfadeMs', clampInt(e.target.value, 0, 10000, 0))} />
    </PropertyCell>
    <PropertyCell label="PC channel" span={1} hint="Where program change is sent.">
      <input class="val" type="number" min="1" max="16" step="1" value={num(p.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Footswitch">
    <PropertyCell label="" span={4} hint="">
      <div class="note">
        Steps on the <b>rising edge only</b>, so one press is one step.
      </div>
    </PropertyCell>
    <PropertyCell label="Enabled" span={1} hint="">
      <PropertyToggle value={p.footEnabled !== false} onchange={() => set('footEnabled', !(p.footEnabled !== false))} />
    </PropertyCell>
    <PropertyCell label="CC" span={1} hint="Footswitch CC number. 64 is the sustain pedal, which most footswitches send.">
      <input class="val" type="number" min="0" max="127" step="1" value={num(p.footCc, 64)} onchange={(e) => set('footCc', clampInt(e.target.value, 0, 127, 64))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} hint="0 listens on every channel.">
      <input class="val" type="number" min="0" max="16" step="1" value={num(p.footChannel, 0)} onchange={(e) => set('footChannel', clampInt(e.target.value, 0, 16, 0))} />
    </PropertyCell>
    <PropertyCell label="Threshold" span={1} hint="Where 'pressed' starts. A sweeping expression pedal crosses it once on the way up, not thirty times.">
      <input class="val" type="number" min="1" max="127" step="1" value={num(p.footThreshold, 64)} onchange={(e) => set('footThreshold', clampInt(e.target.value, 1, 127, 64))} />
    </PropertyCell>
    <PropertyCell label="Does" span={2} hint="">
      <select class="val" value={p.footAction ?? 'next'} onchange={(e) => set('footAction', e.target.value)}>
        {#each FOOT_ACTIONS as a (a)}<option value={a}>{FOOT_ACTION_LABELS[a] ?? a}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Back pedal" span={1} hint="A second CC for 'previous'. Blank means no back pedal.">
      <input class="val" type="number" min="0" max="127" step="1" placeholder="none" value={footswitchBackCc(control) ?? ''} onchange={(e) => set('footBackCc', e.target.value === '' ? null : clampInt(e.target.value, 0, 127, 65))} />
    </PropertyCell>
    {#if String(p.footAction ?? 'next') === 'goto'}
      <PropertyCell label="Scene" span={1} hint="1-based, as the list shows it.">
        <input class="val" type="number" min="1" max={Math.max(1, scenes.length)} step="1" value={num(p.footGoto, 0) + 1} onchange={(e) => set('footGoto', clampInt(e.target.value, 1, Math.max(1, scenes.length), 1) - 1)} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Scenes">
    <PropertyCell label="" span={4} hint="Capture stores an explicit list of paths, not 'everything'.">
      <div class="rowhead">
        <button type="button" class="btn" onclick={addScene} disabled={scenes.length >= MAX_SCENES}>Add scene</button>
        <button type="button" class="btn" onclick={captureAllPathsFromPanel}>Capture every control</button>
        <span class="hintline">{capturePaths.length} path{capturePaths.length === 1 ? '' : 's'} per capture</span>
      </div>
    </PropertyCell>

    {#each scenes as s, i (s.id)}
      <PropertyCell label="" span={4} hint="">
        <div class="scene" class:current={i === index} class:off={s.enabled === false}>
          <div class="line">
            <span class="idx">{i + 1}</span>
            <input class="val name" type="text" value={s.name} onchange={(e) => updateScene(i, { name: e.target.value })} />
            <button type="button" class="mini" title="Move up" onclick={() => moveScene(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" class="mini" title="Move down" onclick={() => moveScene(i, 1)} disabled={i === scenes.length - 1}>↓</button>
            <button type="button" class="mini" title={s.enabled === false ? 'Play this one' : 'Skip tonight'} onclick={() => updateScene(i, { enabled: s.enabled === false })}>{s.enabled === false ? '○' : '●'}</button>
            <button type="button" class="mini danger" title="Remove" onclick={() => removeScene(i)}>×</button>
          </div>
          <div class="line">
            <label class="lbl">PC<input class="val tiny" type="number" min="0" max="127" placeholder="—" value={s.program ?? ''} onchange={(e) => updateScene(i, { program: optInt(e.target.value, 0, 127) })} /></label>
            <label class="lbl">Bank<input class="val tiny" type="number" min="0" max="127" placeholder="—" value={s.bankMsb ?? ''} onchange={(e) => updateScene(i, { bankMsb: optInt(e.target.value, 0, 127) })} /></label>
            <label class="lbl">/<input class="val tiny" type="number" min="0" max="127" placeholder="—" value={s.bankLsb ?? ''} onchange={(e) => updateScene(i, { bankLsb: optInt(e.target.value, 0, 127) })} /></label>
            <label class="lbl">BPM<input class="val tiny" type="number" min="20" max="300" placeholder="—" value={s.bpm ?? ''} onchange={(e) => updateScene(i, { bpm: e.target.value === '' ? null : clampInt(e.target.value, 20, 300, 120) })} /></label>
            <button type="button" class="mini wide" onclick={() => capture(i)}>Capture</button>
          </div>
          <div class="line">
            <input class="val note-in" type="text" placeholder="cue note" value={s.note} onchange={(e) => updateScene(i, { note: e.target.value })} />
          </div>
          <div class="line">
            <input class="val note-in" type="text" placeholder="extra CCs — 91=0, 74=90@2" value={ccText(s)} onchange={(e) => setCcText(i, e.target.value)} />
            <input class="val note-in" type="text" placeholder="sysex hex" value={sysexText(s)} onchange={(e) => setSysexText(i, e.target.value)} />
          </div>
          <div class="meta">
            {Object.keys(s.values).length} stored ·
            {sceneChangeCount(s, readPath)} would change
            {#if missingPaths(s, capturePaths).length}
              · <span class="warn">{missingPaths(s, capturePaths).length} not captured</span>
            {/if}
            {#if s.program !== null}· sends {sceneMessages(s, setlistChannel(control)).length} message{sceneMessages(s, setlistChannel(control)).length === 1 ? '' : 's'}{/if}
          </div>
        </div>
      </PropertyCell>
    {/each}
    {#if !scenes.length}
      <PropertyCell label="" span={4} hint=""><div class="note">No scenes yet.</div></PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Display">
    <PropertyCell label="Click a row" span={1} hint="Clicking a scene in preview jumps to it, through the same recall the pedal uses.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="Position, current scene name and the pedal CC.">
      <PropertyToggle value={p.showHeader !== false} onchange={() => set('showHeader', !(p.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Row height" span={1} hint="">
      <input class="val" type="number" min="12" max="40" step="1" value={num(p.rowHeight, 18)} onchange={(e) => set('rowHeight', clampInt(e.target.value, 12, 40, 18))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Face" span={1} hint=""><input class="col" type="color" value={colRgb(p.faceColour, 'FF141420')} oninput={(e) => setCol('faceColour', p.faceColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Row" span={1} hint=""><input class="col" type="color" value={colRgb(p.rowColour, 'FF20202C')} oninput={(e) => setCol('rowColour', p.rowColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Current" span={1} hint=""><input class="col" type="color" value={colRgb(p.currentColour, 'FF56CCF2')} oninput={(e) => setCol('currentColour', p.currentColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Text" span={1} hint=""><input class="col" type="color" value={colRgb(p.textColour, 'FFE8E8EE')} oninput={(e) => setCol('textColour', p.textColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Labels" span={1} hint=""><input class="col" type="color" value={colRgb(p.labelColour, 'FFB9B9B9')} oninput={(e) => setCol('labelColour', p.labelColour, e.target.value)} /></PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 12px; padding: 3px 6px; border-radius: 4px; }
  .val.tiny { width: 46px; }
  .val.name { flex: 1; }
  .val.note-in { font-size: 11px; color: #9a9aa4; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .rowhead { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .hintline { font-size: 10.5px; color: #7a7a84; }
  .btn { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
  .btn:hover:not(:disabled) { border-color: #4a4a58; color: #E8E8EE; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .scene { border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 6px; display: flex; flex-direction: column; gap: 4px; background: #12121a; }
  .scene.current { border-color: #56CCF2; }
  .scene.off { opacity: 0.55; }
  .line { display: flex; align-items: center; gap: 4px; }
  .idx { font-size: 10.5px; color: #7a7a84; width: 14px; text-align: right; }
  .lbl { display: flex; align-items: center; gap: 3px; font-size: 10.5px; color: #9a9aa4; }
  .mini { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; line-height: 1; padding: 3px 6px; border-radius: 3px; cursor: pointer; }
  .mini.wide { padding: 3px 9px; margin-left: auto; }
  .mini:hover:not(:disabled) { border-color: #4a4a58; }
  .mini:disabled { opacity: 0.35; cursor: default; }
  .mini.danger:hover { border-color: #EB5757; color: #EB5757; }
  .meta { font-size: 10.5px; color: #7a7a84; padding-left: 18px; }
  .warn { color: #F2C94C; }
  .col { width: 26px; height: 20px; padding: 0; border: 1px solid #2a2a36; background: #141420; border-radius: 3px; }
</style>
