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
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import PanelTop from 'lucide-svelte/icons/panel-top';
  import Tags from 'lucide-svelte/icons/tags';
  import Hash from 'lucide-svelte/icons/hash';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import Zap from 'lucide-svelte/icons/zap';
  import SquareDashed from 'lucide-svelte/icons/square-dashed';
  import Table from 'lucide-svelte/icons/table';
  import Palette from 'lucide-svelte/icons/palette';

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
</script>

{#if d}
  <PropertySection title="Drum Pads" icon={LayoutGrid}>
    <PropertyCell label="Rows" span={1} compact hint="Grid height.">
      <NumberCell label="Rows" value={num(d.rows, 4)} step={1} min={1} max={8} defaultValue={4} onchange={(v) => set('rows', clampInt(v, 1, 8, 4))} />
    </PropertyCell>
    <PropertyCell label="Columns" span={1} compact hint="Grid width.">
      <NumberCell label="Cols" value={num(d.cols, 4)} step={1} min={1} max={8} defaultValue={4} onchange={(v) => set('cols', clampInt(v, 1, 8, 4))} />
    </PropertyCell>
    <PropertyCell label="Map" span={2} hint="GM = General MIDI kit names plus the hi-hat choke group. Chromatic = labelled by pitch. Custom = named by you.">
      <select class="val" value={d.map ?? 'gm'} onchange={(e) => set('map', e.target.value)}>
        {#each PAD_MAPS as m (m)}<option value={m}>{PAD_MAP_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Pad 1 note" span={1} compact hint="The note the first pad sends; the rest run up chromatically from it. 36 = GM Bass Drum 1.">
      <NumberCell label="Note" value={num(d.baseNote, 36)} step={1} min={0} max={127} defaultValue={36} onchange={(v) => set('baseNote', clampInt(v, 0, 127, 36))} />
    </PropertyCell>
    <PropertyCell label="Pad 1 at" span={1} hint="Hardware grids put pad 1 at the bottom-left, under your left thumb. Top-left is plain reading order.">
      <select class="val" value={d.origin ?? 'bottomLeft'} onchange={(e) => set('origin', e.target.value)}>
        <option value="bottomLeft">Bottom-left</option>
        <option value="topLeft">Top-left</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Channel" span={1} compact hint="MIDI channel (10 is the GM percussion channel).">
      <NumberCell label="Ch" value={num(d.channel, 10)} step={1} min={1} max={16} defaultValue={10} onchange={(v) => set('channel', clampInt(v, 1, 16, 10))} />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="What the grid covers." compact>
      <div class="note">{count} pads · {drumNoteLabel(num(d.baseNote, 36), true)}…</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Trigger" icon={Zap}>
    <PropertyCell label="Mode" span={2} hint="Momentary = held while pressed. One-shot = a short fixed gate. Toggle = on until you hit the pad again.">
      <select class="val" value={d.mode ?? 'momentary'} onchange={(e) => set('mode', e.target.value)}>
        {#each PAD_MODES as m (m)}<option value={m}>{PAD_MODE_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>
    {#if isOneShot}
      <PropertyCell label="Gate" span={1} compact hint="Milliseconds the one-shot note is held before note-off.">
        <NumberCell label="Gate" value={num(d.gateMs, 60)} step={5} min={5} max={2000} defaultValue={60} onchange={(v) => set('gateMs', clampInt(v, 5, 2000, 60))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Velocity" span={1} compact hint="Note-on velocity (1–127) when velocity is fixed.">
      <NumberCell label="Vel" value={num(d.velocity, 100)} step={1} min={1} max={127} defaultValue={100} onchange={(v) => set('velocity', clampInt(v, 1, 127, 100))} />
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
    <PropertyCell label="Echo MIDI in" span={1} hint="Outline the matching pads from notes arriving on the hardware MIDI input.">
      <PropertyToggle value={d.echo === true} onchange={() => set('echo', !(d.echo === true))} />
    </PropertyCell>
    {#if d.echo === true}
      <PropertyCell label="In channel" span={1} compact hint="Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.">
        <NumberCell label="Ch" value={num(d.echoChannel, 0)} step={1} min={0} max={16} defaultValue={0} onchange={(v) => set('echoChannel', clampInt(v, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline. Click the swatch to edit it in the Colors tab.">
        <SwatchCluster swatches={[
          { key: 'echoColour', label: 'Echo', value: d.echoColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'DrumPads.echoColour' } },
        ]} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth." compact>
      <div class="note">Plays MIDI notes · ch {num(d.channel, 10)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Corner zones" icon={SquareDashed}>
    {#snippet tools()}
      <HeaderPill value={d.zones === true}
                  title="Give the four corners of every pad their own action, so the same sixteen triggers carry a second vocabulary — a roll under one thumb, a flam under the other. The map is the same on every pad on purpose: a corner is a gesture your hand learns once."
                  onchange={() => set('zones', !(d.zones === true))} />
    {/snippet}
    {#if d.zones === true}
      <PropertyCell label="Corner size" span={1} compact hint="How much of each pad a corner claims, measured in from both edges. The rest of the pad is the face and always plays a plain hit.">
        <NumberCell label="Size" value={num(d.cornerSize, 0.28)} step={0.01} min={0.05} max={0.45} defaultValue={0.28}
                    onchange={(v) => set('cornerSize', Math.min(0.45, Math.max(0.05, num(v, 0.28))))} />
      </PropertyCell>
      {#each PAD_CORNERS as corner (corner)}
        <PropertyCell label={PAD_CORNER_LABELS[corner]} span={2} hint="What a strike in this corner of a pad does instead of a plain hit.">
          <select class="val" value={cornerAction(d, corner)} onchange={(e) => set(cornerField(corner), e.target.value)}>
            {#each PAD_ZONE_ACTIONS as a (a)}<option value={a}>{PAD_ZONE_ACTION_LABELS[a] ?? a}</option>{/each}
          </select>
        </PropertyCell>
      {/each}
      <PropertyCell label="Flam lead" span={1} compact hint="How far ahead of the main hit a flam's grace note lands, in milliseconds.">
        <NumberCell label="Ms" value={num(d.flamMs, 22)} step={1} min={1} max={500} defaultValue={22}
                    onchange={(v) => set('flamMs', clampInt(v, 1, 500, 22))} />
      </PropertyCell>
      <PropertyCell label="Ghost level" span={1} compact hint="A ghost strike's velocity, as a fraction of the hit it replaces. Also the level a flam's grace note uses.">
        <NumberCell label="Lvl" value={num(d.ghostVelocity, 0.35)} step={0.05} min={0} max={1} defaultValue={0.35}
                    onchange={(v) => set('ghostVelocity', Math.min(1, Math.max(0, num(v, 0.35))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Pads" icon={Table}>
    <PropertyCell label="" span={4} hint="Each row overrides one pad — blank fields use the generated map. Pads sharing a choke number cut each other." compact>
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
            <span class="nc-wrap" role="cell">
              <NumberCell value={p.note} step={1} min={0} max={127}
                          onchange={(v) => setPad(p.index, 'note', clampInt(v, 0, 127, p.note))} />
            </span>
            <span class="nc-wrap" role="cell">
              <NumberCell value={p.choke} step={1} min={0} max={8}
                          onchange={(v) => setPad(p.index, 'choke', clampInt(v, 0, 8, 0))} />
            </span>
            <span role="cell"><PropertyToggle compact label="Roll" value={p.roll === true}
                   ariaLabel={`Pad ${p.index + 1} roll`}
                   onchange={(next) => setPad(p.index, 'roll', next)} /></span>
            <span role="cell">
              <SwatchCluster swatches={[
                { key: `pad-${p.id}`, label: `P${p.index + 1}`, value: p.colour ?? d.accentColour ?? 'FF5B9BD5', target: { type: 'callback', apply: (hex) => setPad(p.index, 'colour', hex) } },
              ]} />
            </span>
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
        <PropertyCell label="Strikes / sec" span={1} compact hint="The free-running roll speed.">
          <NumberCell label="Hz" value={num(d.rollHz, 8)} step={0.5} min={0.5} max={50} defaultValue={8} onchange={(v) => set('rollHz', Math.min(50, Math.max(0.5, num(v, 8))))} />
        </PropertyCell>
      {:else}
        <PropertyCell label="" span={1} hint="At the panel's current tempo." compact>
          <div class="note">≈ {rollIntervalMs(d, 120)} ms at 120 bpm</div>
        </PropertyCell>
      {/if}
      <PropertyCell label="Roll delay" span={1} compact hint="How long a pad is held before the roll begins, in milliseconds. 0 rolls from the first strike; a short delay lets you play single hits and roll only when you lean on it.">
        <NumberCell label="Ms" value={num(d.rollDelay, 0)} step={10} min={0} max={4000} defaultValue={0} onchange={(v) => set('rollDelay', clampInt(v, 0, 4000, 0))} />
      </PropertyCell>
      <PropertyCell label="Roll velocity" span={1} compact hint="Repeats strike at this fraction of the opening hit, so the first one reads as an accent and the roll sits under it.">
        <NumberCell label="Vel" value={num(d.rollVelocity, 0.75)} step={0.05} min={0} max={1} defaultValue={0.75} onchange={(v) => set('rollVelocity', Math.min(1, Math.max(0, num(v, 0.75))))} />
      </PropertyCell>
      {#if !rollUsable}
        <PropertyCell label="" span={4} hint="A roll runs for as long as the pad is on. A one-shot releases itself after its gate, so there is no 'while held' for it to fill." compact>
          <div class="note warn">The grid is a one-shot, so rolls are ignored — a one-shot releases itself and has no 'while held'.</div>
        </PropertyCell>
      {/if}
    {/if}
    {#if overridden}
      <PropertyCell label="" span={4} hint="Drop every override and go back to the generated map." compact>
        <button class="btn" type="button" onclick={() => set('pads', [])}>Reset all {overridden} customised pad{overridden === 1 ? '' : 's'}</button>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Show" span={4} hint="Header strip, drum-name labels, note numbers. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'showHeader', title: 'Header — the map / size / last-hit strip', on: d.showHeader !== false, icon: PanelTop },
          { key: 'showLabels', title: 'Labels — drum names on the pads (hidden automatically on small pads)', on: d.showLabels !== false, icon: Tags },
          { key: 'showNotes', title: 'Note numbers — the MIDI note number on each pad', on: d.showNotes !== false, icon: Hash },
        ]}
        ontoggle={(key, next) => set(key, next)}
      />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Grid background, pad fill, accent stripe, hit, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: d.fieldColour ?? 'FF101017', target: { type: 'control', controlId: core?.id, path: 'DrumPads.fieldColour' } },
        { key: 'padColour', label: 'Pads', value: d.padColour ?? 'FF171720', target: { type: 'control', controlId: core?.id, path: 'DrumPads.padColour' } },
        { key: 'accentColour', label: 'Accent', value: d.accentColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'DrumPads.accentColour' } },
        { key: 'hitColour', label: 'Hit', value: d.hitColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'DrumPads.hitColour' } },
        { key: 'labelColour', label: 'Labels', value: d.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'DrumPads.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .note.warn { color: #E0A030; }
  .note { font-size: 11px; color: #8a8a94; }
  .table { display: flex; flex-direction: column; gap: 3px; }
  .thead, .trow { display: grid; grid-template-columns: 20px 1fr 52px 44px 30px 34px 24px; gap: 4px; align-items: center; }
  .thead span { font-size: 10px; color: #7a7a84; text-transform: uppercase; letter-spacing: 0.4px; }
  .idx { font-size: 11px; color: #7a7a84; text-align: right; }
  .nc-wrap { display: flex; min-width: 0; }
  .btn { width: 100%; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 4px 6px; font-size: 12px; cursor: pointer; }
  .btn:hover { border-color: #5B9BD5; }
  .x { background: #1A1A1A; border: 1px solid #333; color: #9a9aa4; border-radius: 4px; padding: 2px 0; font-size: 12px; cursor: pointer; line-height: 1.2; }
  .x:hover { border-color: #5B9BD5; color: #DDD; }
</style>
