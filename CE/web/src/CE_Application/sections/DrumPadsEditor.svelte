<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    PAD_MAPS, PAD_MAP_LABELS, PAD_MODES, PAD_MODE_LABELS,
    drumPads, drumCount, drumNoteLabel,
  } from '../utils/drumPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let d = $derived(getSection(control, 'DrumPads'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `DrumPads.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let pads = $derived.by(() => { try { return drumPads(control); } catch { return []; } });
  let count = $derived(drumCount(control));
  let isOneShot = $derived(String(d?.mode ?? 'momentary') === 'oneShot');

  // Overrides are sparse and index-aligned; writing one pads the array out to it.
  function setPad(i, key, value) {
    const list = (Array.isArray(d?.pads) ? d.pads : []).slice();
    while (list.length <= i) list.push({});
    list[i] = { ...list[i], [key]: value };
    set('pads', list);
  }
  function clearPad(i) {
    const list = (Array.isArray(d?.pads) ? d.pads : []).slice();
    if (i >= list.length) return;
    list[i] = {};
    while (list.length && Object.keys(list[list.length - 1]).length === 0) list.pop();
    set('pads', list);
  }
  let overridden = $derived((Array.isArray(d?.pads) ? d.pads : []).filter((p) => p && Object.keys(p).length).length);

  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const al = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${al}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if d}
  <PropertySection title="Drum Pads">
    <PropertyCell label="Rows" span={1} hint="Grid height.">
      <input class="val" type="number" min="1" max="8" step="1" value={num(d.rows, 4)} onchange={(e) => set('rows', clampInt(e.target.value, 1, 8, 4))} />
    </PropertyCell>
    <PropertyCell label="Columns" span={1} hint="Grid width.">
      <input class="val" type="number" min="1" max="8" step="1" value={num(d.cols, 4)} onchange={(e) => set('cols', clampInt(e.target.value, 1, 8, 4))} />
    </PropertyCell>
    <PropertyCell label="Map" span={2} hint="GM names the pads from the General MIDI drum kit and sets up the hi-hat choke group. Chromatic labels them by pitch. Custom is the same note run, named entirely by you.">
      <select class="val" value={d.map ?? 'gm'} onchange={(e) => set('map', e.target.value)}>
        {#each PAD_MAPS as m (m)}<option value={m}>{PAD_MAP_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Pad 1 note" span={1} hint="The note the first pad sends; the rest run up chromatically from it. 36 = GM Bass Drum 1.">
      <input class="val" type="number" min="0" max="127" step="1" value={num(d.baseNote, 36)} onchange={(e) => set('baseNote', clampInt(e.target.value, 0, 127, 36))} />
    </PropertyCell>
    <PropertyCell label="Pad 1 at" span={1} hint="Hardware grids put pad 1 at the bottom-left, under your left thumb. Top-left is plain reading order.">
      <select class="val" value={d.origin ?? 'bottomLeft'} onchange={(e) => set('origin', e.target.value)}>
        <option value="bottomLeft">Bottom-left</option>
        <option value="topLeft">Top-left</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Channel" span={1} hint="MIDI channel (10 is the GM percussion channel).">
      <input class="val" type="number" min="1" max="16" step="1" value={num(d.channel, 10)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 10))} />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="What the grid covers.">
      <div class="note">{count} pads · {drumNoteLabel(num(d.baseNote, 36), true)}…</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Trigger">
    <PropertyCell label="Mode" span={2} hint="Momentary holds the note while you press. One-shot sends a short fixed gate, which is what a sampler wants. Toggle keeps it sounding until you hit the pad again.">
      <select class="val" value={d.mode ?? 'momentary'} onchange={(e) => set('mode', e.target.value)}>
        {#each PAD_MODES as m (m)}<option value={m}>{PAD_MODE_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>
    {#if isOneShot}
      <PropertyCell label="Gate" span={2} hint="Milliseconds the one-shot note is held before note-off.">
        <input class="val" type="number" min="5" max="2000" step="5" value={num(d.gateMs, 60)} onchange={(e) => set('gateMs', clampInt(e.target.value, 5, 2000, 60))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Velocity" span={1} hint="Note-on velocity (1–127) when velocity is fixed.">
      <input class="val" type="number" min="1" max="127" step="1" value={num(d.velocity, 100)} onchange={(e) => set('velocity', clampInt(e.target.value, 1, 127, 100))} />
    </PropertyCell>
    <PropertyCell label="Vel. from" span={1} hint="Position takes velocity from how high up the pad you strike — the top is hardest.">
      <select class="val" value={d.velocityFrom ?? 'fixed'} onchange={(e) => set('velocityFrom', e.target.value)}>
        <option value="fixed">Fixed</option>
        <option value="position">Strike height</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Playable" span={1} hint="Allow striking the pads in preview / the player. Dragging across the grid rolls through them.">
      <PropertyToggle value={d.editable !== false} onchange={() => set('editable', !(d.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth.">
      <div class="note">Plays MIDI notes · ch {num(d.channel, 10)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Pads">
    <PropertyCell label="" span={4} hint="Each row overrides one pad. Blank fields fall back to the generated map. Choke: pads sharing a non-zero number cut each other (the GM hi-hats are group 1).">
      <div class="table" role="table" aria-label="Pad overrides">
        <div class="thead" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Label</span>
          <span role="columnheader">Note</span>
          <span role="columnheader">Choke</span>
          <span role="columnheader">Colour</span>
          <span role="columnheader"></span>
        </div>
        {#each pads as p (p.id)}
          <div class="trow" role="row">
            <span class="idx" role="cell">{p.index + 1}</span>
            <input class="val" role="cell" type="text" value={p.label} aria-label={`Pad ${p.index + 1} label`}
                   onchange={(e) => setPad(p.index, 'label', e.target.value)} />
            <input class="val" role="cell" type="number" min="0" max="127" step="1" value={p.note} aria-label={`Pad ${p.index + 1} note`}
                   onchange={(e) => setPad(p.index, 'note', clampInt(e.target.value, 0, 127, p.note))} />
            <input class="val" role="cell" type="number" min="0" max="8" step="1" value={p.choke} aria-label={`Pad ${p.index + 1} choke group`}
                   onchange={(e) => setPad(p.index, 'choke', clampInt(e.target.value, 0, 8, 0))} />
            <input class="cswatch" role="cell" type="color" value={colRgb(p.colour, d.accentColour ?? 'FF5B9BD5')} aria-label={`Pad ${p.index + 1} colour`}
                   onchange={(e) => setPad(p.index, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} />
            <button class="x" type="button" title="Reset this pad" aria-label={`Reset pad ${p.index + 1}`}
                    onclick={() => clearPad(p.index)}>↺</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
    {#if overridden}
      <PropertyCell label="" span={4} hint="Drop every override and go back to the generated map.">
        <button class="btn" type="button" onclick={() => set('pads', [])}>Reset all {overridden} customised pad{overridden === 1 ? '' : 's'}</button>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Header" span={1} hint="Show the map / size / last-hit strip.">
      <PropertyToggle value={d.showHeader !== false} onchange={() => set('showHeader', !(d.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Drum names on the pads (hidden automatically on small pads).">
      <PropertyToggle value={d.showLabels !== false} onchange={() => set('showLabels', !(d.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Note nums" span={1} hint="The MIDI note number on each pad.">
      <PropertyToggle value={d.showNotes !== false} onchange={() => set('showNotes', !(d.showNotes !== false))} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Grid background colour.">
      <input class="cswatch" type="color" value={colRgb(d.fieldColour, 'FF101017')} onchange={(e) => setCol('fieldColour', d.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Pads" span={1} hint="Pad fill colour.">
      <input class="cswatch" type="color" value={colRgb(d.padColour, 'FF171720')} onchange={(e) => setCol('padColour', d.padColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Accent" span={1} hint="Default pad stripe, for pads with no colour of their own.">
      <input class="cswatch" type="color" value={colRgb(d.accentColour, 'FF5B9BD5')} onchange={(e) => setCol('accentColour', d.accentColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Hit" span={1} hint="Colour of a sounding pad.">
      <input class="cswatch" type="color" value={colRgb(d.hitColour, 'FFF2C94C')} onchange={(e) => setCol('hitColour', d.hitColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(d.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', d.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 22px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .note { font-size: 11px; color: #8a8a94; }
  .table { display: flex; flex-direction: column; gap: 3px; }
  .thead, .trow { display: grid; grid-template-columns: 20px 1fr 52px 44px 34px 24px; gap: 4px; align-items: center; }
  .thead span { font-size: 10px; color: #7a7a84; text-transform: uppercase; letter-spacing: 0.4px; }
  .idx { font-size: 11px; color: #7a7a84; text-align: right; }
  .btn { width: 100%; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 4px 6px; font-size: 12px; cursor: pointer; }
  .btn:hover { border-color: #5B9BD5; }
  .x { background: #1A1A1A; border: 1px solid #333; color: #9a9aa4; border-radius: 4px; padding: 2px 0; font-size: 12px; cursor: pointer; line-height: 1.2; }
  .x:hover { border-color: #5B9BD5; color: #DDD; }
</style>
