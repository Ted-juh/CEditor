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
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import Send from 'lucide-svelte/icons/send';
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
  import Gauge from 'lucide-svelte/icons/gauge';
  import ListMusic from 'lucide-svelte/icons/list-music';
  import Footprints from 'lucide-svelte/icons/footprints';
  import Clapperboard from 'lucide-svelte/icons/clapperboard';
  import Monitor from 'lucide-svelte/icons/monitor';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let p = $derived(getSection(control, 'Setlist'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Setlist.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }
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
  <PropertySection title="Setlist" icon={ListMusic}>
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
    <PropertyCell label="Crossfade" span={1} compact hint="Milliseconds to slide panel values on a recall; 0 snaps. Only numbers interpolate; the rest switch at halfway.">
      <NumberCell label="Fade" value={crossfadeMs(control)} step={50} min={0} max={10000} onchange={(value) => set('crossfadeMs', clampInt(value, 0, 10000, 0))} />
    </PropertyCell>
    <PropertyCell label="PC channel" span={1} compact hint="Where program change is sent.">
      <NumberCell label="Ch" value={num(p.channel, 1)} step={1} min={1} max={16} onchange={(value) => set('channel', clampInt(value, 1, 16, 1))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Footswitch" icon={Footprints}>
    {#snippet tools()}
      <HeaderPill value={p.footEnabled !== false}
                  onchange={() => set('footEnabled', !(p.footEnabled !== false))} />
    {/snippet}
    {#if p.footEnabled !== false}
      <PropertyCell label="" span={4} hint="">
        <div class="note">
          Steps on the <b>rising edge only</b>, so one press is one step.
        </div>
      </PropertyCell>
      <PropertyCell label="CC" span={1} compact hint="Footswitch CC number. 64 is the sustain pedal, which most footswitches send.">
        <NumberCell label="CC" value={num(p.footCc, 64)} step={1} min={0} max={127} onchange={(value) => set('footCc', clampInt(value, 0, 127, 64))} />
      </PropertyCell>
      <PropertyCell label="Channel" span={1} compact hint="0 listens on every channel.">
        <NumberCell label="Ch" value={num(p.footChannel, 0)} step={1} min={0} max={16} onchange={(value) => set('footChannel', clampInt(value, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="Threshold" span={2} compact hint="Where 'pressed' starts. A sweeping expression pedal crosses it once on the way up, not thirty times.">
        <NumberCell label="Thr" value={num(p.footThreshold, 64)} step={1} min={1} max={127} onchange={(value) => set('footThreshold', clampInt(value, 1, 127, 64))} />
      </PropertyCell>
      <PropertyCell label="Does" span={2} hint="">
        <select class="val" value={p.footAction ?? 'next'} onchange={(e) => set('footAction', e.target.value)}>
          {#each FOOT_ACTIONS as a (a)}<option value={a}>{FOOT_ACTION_LABELS[a] ?? a}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Back pedal" span={1} compact hint="A second CC for 'previous'. Blank means no back pedal.">
        <NumberCell label="Back" value={footswitchBackCc(control) ?? ''} step={1} min={0} max={127} onchange={(value) => set('footBackCc', value === '' ? null : clampInt(value, 0, 127, 65))} />
      </PropertyCell>
      {#if String(p.footAction ?? 'next') === 'goto'}
        <PropertyCell label="Scene" span={1} compact hint="1-based, as the list shows it.">
          <NumberCell label="Scene" value={num(p.footGoto, 0) + 1} step={1} min={1} max={Math.max(1, scenes.length)} onchange={(value) => set('footGoto', clampInt(value, 1, Math.max(1, scenes.length), 1) - 1)} />
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Scenes" icon={Clapperboard}>
    {#snippet tools()}
      <button type="button" class="header-add-btn" onclick={addScene} disabled={scenes.length >= MAX_SCENES}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Capture stores an explicit list of paths, not 'everything'.">
      <div class="rowhead">
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
            <label class="lbl">PC<span class="tiny nc-wrap"><NumberCell value={s.program ?? ''} step={1} min={0} max={127} onchange={(value) => updateScene(i, { program: optInt(value, 0, 127) })} /></span></label>
            <label class="lbl">Bank<span class="tiny nc-wrap"><NumberCell value={s.bankMsb ?? ''} step={1} min={0} max={127} onchange={(value) => updateScene(i, { bankMsb: optInt(value, 0, 127) })} /></span></label>
            <label class="lbl">/<span class="tiny nc-wrap"><NumberCell value={s.bankLsb ?? ''} step={1} min={0} max={127} onchange={(value) => updateScene(i, { bankLsb: optInt(value, 0, 127) })} /></span></label>
            <label class="lbl">BPM<span class="tiny nc-wrap"><NumberCell value={s.bpm ?? ''} step={1} min={20} max={300} onchange={(value) => updateScene(i, { bpm: value === '' ? null : clampInt(value, 20, 300, 120) })} /></span></label>
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

  <PropertySection title="Display" icon={Monitor}>
    <PropertyCell label="Click a row" span={1} hint="Clicking a scene in preview jumps to it, through the same recall the pedal uses.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="Position, current scene name and the pedal CC.">
      <PropertyToggle value={p.showHeader !== false} onchange={() => set('showHeader', !(p.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Row height" span={1} compact hint="">
      <NumberCell label="Height" value={num(p.rowHeight, 18)} step={1} min={12} max={40} onchange={(value) => set('rowHeight', clampInt(value, 12, 40, 18))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Face, row, current scene, text, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: p.faceColour ?? 'FF141420', target: { type: 'control', controlId: core?.id, path: 'Setlist.faceColour' } },
        { key: 'rowColour', label: 'Row', value: p.rowColour ?? 'FF20202C', target: { type: 'control', controlId: core?.id, path: 'Setlist.rowColour' } },
        { key: 'currentColour', label: 'Current', value: p.currentColour ?? 'FF56CCF2', target: { type: 'control', controlId: core?.id, path: 'Setlist.currentColour' } },
        { key: 'textColour', label: 'Text', value: p.textColour ?? 'FFE8E8EE', target: { type: 'control', controlId: core?.id, path: 'Setlist.textColour' } },
        { key: 'labelColour', label: 'Labels', value: p.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Setlist.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 12px; padding: 3px 6px; border-radius: 4px; }
  /* Fixed-width shell around a NumberCell in a scene row: the cell fills the
     span instead of flexing the row open. */
  .nc-wrap { display: flex; }
  .nc-wrap.tiny { width: 46px; flex: 0 0 auto; }
  .val.name { flex: 1; }
  .val.note-in { font-size: 11px; color: #9a9aa4; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .rowhead { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .hintline { font-size: 10.5px; color: #7a7a84; }
  .btn { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
  .header-add-btn { height: 16px; font-size: 9px; padding: 0 8px; border-radius: 8px; background: #252525; border: 1px solid #333; color: #777; font-family: inherit; cursor: pointer; line-height: 1; }
  .header-add-btn:hover:not(:disabled) { border-color: #4A6E8C; color: #CCC; }
  .header-add-btn:disabled { opacity: 0.4; cursor: default; }
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
</style>
