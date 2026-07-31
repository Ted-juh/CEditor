<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    PAD_MAPS, PAD_MAP_LABELS, PAD_MODES, PAD_MODE_LABELS, ROLL_MODES,
    PAD_CORNERS, PAD_CORNER_LABELS, PAD_ZONE_ACTIONS, PAD_ZONE_ACTION_LABELS, cornerField,
    drumPads, drumCount, drumNoteLabel, rollIntervalMs, cornerAction,
  } from '../utils/drumPadLayout.js';
  import { DIVISION_IDS, DIVISION_LABELS } from '../utils/transportLayout.js';
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
  let rolling = $derived(pads.filter((p) => p.roll).length);
  // A roll only happens while a pad is ON, so a one-shot — gone by its own gate — cannot have one.
  let rollUsable = $derived(ROLL_MODES.includes(String(d?.mode ?? 'momentary')));
  // A corner set to roll needs the roll settings visible even when no pad carries the flag.
  let cornerRolls = $derived(d?.zones === true
    && PAD_CORNERS.some((c) => cornerAction(d, c) === 'roll'));

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
    <PropertyCell label="Echo MIDI in" span={1} hint="Light the matching pads from notes arriving on the hardware MIDI input, drawn as an outline so external play never looks like your own. The grid becomes a monitor for whatever a sequencer or drum machine is playing.">
      <PropertyToggle value={d.echo === true} onchange={() => set('echo', !(d.echo === true))} />
    </PropertyCell>
    {#if d.echo === true}
      <PropertyCell label="In channel" span={1} hint="Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.">
        <input class="val" type="number" min="0" max="16" step="1" value={num(d.echoChannel, 0)} onchange={(e) => set('echoChannel', clampInt(e.target.value, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline.">
        <input class="cswatch" type="color" value={colRgb(d.echoColour, 'FF39D98A')} onchange={(e) => setCol('echoColour', d.echoColour, e.target.value)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth.">
      <div class="note">Plays MIDI notes · ch {num(d.channel, 10)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Corner zones">
    <PropertyCell label="Corners" span={2} hint="Give the four corners of every pad their own action, so the same sixteen triggers carry a second vocabulary — a roll under one thumb, a flam under the other. The map is the same on every pad on purpose: a corner is a gesture your hand learns once.">
      <PropertyToggle value={d.zones === true} onchange={() => set('zones', !(d.zones === true))} />
    </PropertyCell>
    {#if d.zones === true}
      <PropertyCell label="Corner size" span={2} hint="How much of each pad a corner claims, measured in from both edges. The rest of the pad is the face and always plays a plain hit.">
        <input class="val" type="number" min="0.05" max="0.45" step="0.01" value={num(d.cornerSize, 0.28)}
               onchange={(e) => set('cornerSize', Math.min(0.45, Math.max(0.05, num(e.target.value, 0.28))))} />
      </PropertyCell>
      {#each PAD_CORNERS as corner (corner)}
        <PropertyCell label={PAD_CORNER_LABELS[corner]} span={2} hint="What a strike in this corner of a pad does instead of a plain hit.">
          <select class="val" value={cornerAction(d, corner)} onchange={(e) => set(cornerField(corner), e.target.value)}>
            {#each PAD_ZONE_ACTIONS as a (a)}<option value={a}>{PAD_ZONE_ACTION_LABELS[a] ?? a}</option>{/each}
          </select>
        </PropertyCell>
      {/each}
      <PropertyCell label="Flam lead" span={1} hint="How far ahead of the main hit a flam's grace note lands, in milliseconds.">
        <input class="val" type="number" min="1" max="500" step="1" value={num(d.flamMs, 22)}
               onchange={(e) => set('flamMs', clampInt(e.target.value, 1, 500, 22))} />
      </PropertyCell>
      <PropertyCell label="Ghost level" span={1} hint="A ghost strike's velocity, as a fraction of the hit it replaces. Also the level a flam's grace note uses.">
        <input class="val" type="number" min="0" max="1" step="0.05" value={num(d.ghostVelocity, 0.35)}
               onchange={(e) => set('ghostVelocity', Math.min(1, Math.max(0, num(e.target.value, 0.35))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Pads">
    <PropertyCell label="" span={4} hint="Each row overrides one pad. Blank fields fall back to the generated map. Choke: pads sharing a non-zero number cut each other (the GM hi-hats are group 1).">
      <div class="table" role="table" aria-label="Pad overrides">
        <div class="thead" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Label</span>
          <span role="columnheader">Note</span>
          <span role="columnheader">Choke</span>
          <span role="columnheader">Roll</span>
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
            <input class="chk" role="cell" type="checkbox" checked={p.roll} aria-label={`Pad ${p.index + 1} roll`}
                   onchange={(e) => setPad(p.index, 'roll', e.target.checked)} />
            <input class="cswatch" role="cell" type="color" value={colRgb(p.colour, d.accentColour ?? 'FF5B9BD5')} aria-label={`Pad ${p.index + 1} colour`}
                   onchange={(e) => setPad(p.index, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} />
            <button class="x" type="button" title="Reset this pad" aria-label={`Reset pad ${p.index + 1}`}
                    onclick={() => clearPad(p.index)}>↺</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
    {#if rolling || cornerRolls}
      <PropertyCell label="Roll rate" span={2} hint="How fast a rolling pad restrikes, as a note value against the panel transport — so a roll stays in time when the tempo moves.">
        <select class="val" value={d.rollRate ?? '1/16'} onchange={(e) => set('rollRate', e.target.value)}>
          {#each DIVISION_IDS as id (id)}<option value={id}>{DIVISION_LABELS[id] ?? id}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Follow tempo" span={1} hint="Off runs the roll at a fixed speed instead, for a panel with no Transport to follow.">
        <PropertyToggle value={d.rollSync !== false} onchange={() => set('rollSync', !(d.rollSync !== false))} />
      </PropertyCell>
      {#if d.rollSync === false}
        <PropertyCell label="Strikes / sec" span={1} hint="The free-running roll speed.">
          <input class="val" type="number" min="0.5" max="50" step="0.5" value={num(d.rollHz, 8)} onchange={(e) => set('rollHz', Math.min(50, Math.max(0.5, num(e.target.value, 8))))} />
        </PropertyCell>
      {:else}
        <PropertyCell label="" span={1} hint="At the panel's current tempo.">
          <div class="note">≈ {rollIntervalMs(d, 120)} ms at 120 bpm</div>
        </PropertyCell>
      {/if}
      <PropertyCell label="Roll delay" span={1} hint="How long a pad is held before the roll begins, in milliseconds. 0 rolls from the first strike; a short delay lets you play single hits and roll only when you lean on it.">
        <input class="val" type="number" min="0" max="4000" step="10" value={num(d.rollDelay, 0)} onchange={(e) => set('rollDelay', clampInt(e.target.value, 0, 4000, 0))} />
      </PropertyCell>
      <PropertyCell label="Roll velocity" span={1} hint="Repeats strike at this fraction of the opening hit, so the first one reads as an accent and the roll sits under it.">
        <input class="val" type="number" min="0" max="1" step="0.05" value={num(d.rollVelocity, 0.75)} onchange={(e) => set('rollVelocity', Math.min(1, Math.max(0, num(e.target.value, 0.75))))} />
      </PropertyCell>
      {#if !rollUsable}
        <PropertyCell label="" span={4} hint="A roll runs for as long as the pad is on. A one-shot releases itself after its gate, so there is no 'while held' for it to fill.">
          <div class="note warn">The grid is a one-shot, so rolls are ignored — a one-shot releases itself and has no 'while held'.</div>
        </PropertyCell>
      {/if}
    {/if}
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
  .note.warn { color: #E0A030; }
  .chk { justify-self: center; width: 14px; height: 14px; accent-color: var(--accent, #5B9BD5); cursor: pointer; }
  .cswatch { width: 100%; height: 22px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .note { font-size: 11px; color: #8a8a94; }
  .table { display: flex; flex-direction: column; gap: 3px; }
  .thead, .trow { display: grid; grid-template-columns: 20px 1fr 52px 44px 30px 34px 24px; gap: 4px; align-items: center; }
  .thead span { font-size: 10px; color: #7a7a84; text-transform: uppercase; letter-spacing: 0.4px; }
  .idx { font-size: 11px; color: #7a7a84; text-align: right; }
  .btn { width: 100%; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 4px 6px; font-size: 12px; cursor: pointer; }
  .btn:hover { border-color: #5B9BD5; }
  .x { background: #1A1A1A; border: 1px solid #333; color: #9a9aa4; border-radius: 4px; padding: 2px 0; font-size: 12px; cursor: pointer; line-height: 1.2; }
  .x:hover { border-color: #5B9BD5; color: #DDD; }
</style>
