<script>
  import { controlSources } from '../utils/controlSources.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { ARP_PATTERNS, ARP_PATTERN_LABELS, ARP_SOURCES, ARP_SOURCE_LABELS, arpBaseNotes, arpSequence, midiNoteLabel, arpUseFlats, euclid } from '../utils/arpLayout.js';
  import { DIVISION_IDS, DIVISION_LABELS } from '../utils/transportLayout.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import PanelTop from 'lucide-svelte/icons/panel-top';
  import Tags from 'lucide-svelte/icons/tags';
  import Music from 'lucide-svelte/icons/music';
  import Clock from 'lucide-svelte/icons/clock';
  import VolumeX from 'lucide-svelte/icons/volume-x';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let a = $derived(getSection(control, 'Arp'));

  // The Chord Pads on this panel — the Arp can follow whichever one you pick.
  let chordPads = $derived(
    controlSources($activePanel?.controls, 'chordPad', core?.id)
  );

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Arp.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }
  function clampNum(v, lo, hi, f) { const n = num(v, f); return n < lo ? lo : n > hi ? hi : n; }

  let source = $derived(String(a?.source ?? 'chord'));
  let synced = $derived(a?.syncToTransport === true);
  // Syncing to a transport the panel doesn't have would leave the Arp silent,
  // which looks like a bug rather than a missing component. Say so instead.
  let hasTransport = $derived(
    ($activePanel?.controls ?? []).some((c) => String(c?._children?.Core?.controlType ?? '') === 'Transport')
  );
  let isLink = $derived(source === 'link');
  let isInput = $derived(source === 'input');
  let isExternal = $derived(isLink || isInput);
  let flats = $derived(useFlats(num(a?.key, 0), String(a?.scale ?? 'minor')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let scaleKeys = $derived(Object.keys(SCALES));
  let degreeCount = $derived((SCALES[String(a?.scale ?? 'minor')] ?? SCALES.minor).length);

  // A live preview of the walk (the design-time chord — link mode has no notes
  // until a pad is held, so it shows the shape it *would* play).
  let walk = $derived.by(() => {
    try {
      const seq = arpSequence(control, arpBaseNotes(control));
      if (!seq.length) return '';
      const f = arpUseFlats(control);
      return seq.map((s) => (s.length === 1 ? midiNoteLabel(s[0], f) : `[${s.map((m) => midiNoteLabel(m, f)).join(' ')}]`)).join('  ·  ');
    } catch { return ''; }
  });
  let euclidPreview = $derived.by(() => {
    if (a?.euclidEnabled !== true) return '';
    return euclid(num(a.euclidSteps, 8), num(a.euclidPulses, 5), num(a.euclidRotate, 0))
      .map((h) => (h ? '●' : '·')).join(' ');
  });
  let mutes = $derived(Array.isArray(a?.mutes) ? a.mutes : []);
</script>

{#if a}
  <PropertySection title="Arpeggiator" icon={Music}>
    <PropertyCell label="Run" span={1} hint="Start / stop the clock. Stopped, the lane still shows the walk.">
      <PropertyToggle value={a.running !== false} onchange={() => set('running', !(a.running !== false))} />
    </PropertyCell>
    <PropertyCell label="Pattern" span={3} hint="How the held notes are walked. Chord (block) restates them all together on every step.">
      <select class="val" value={a.pattern ?? 'up'} onchange={(e) => set('pattern', e.target.value)}>
        {#each ARP_PATTERNS as p (p)}<option value={p}>{ARP_PATTERN_LABELS[p] ?? p}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Notes from" span={2} hint="Chord = its own key/scale chord. Linked = a Chord Pad on this panel (that pad goes silent). Incoming = keys from the MIDI input.">
      <select class="val" value={a.source ?? 'chord'} onchange={(e) => set('source', e.target.value)}>
        {#each ARP_SOURCES as sc (sc)}<option value={sc}>{ARP_SOURCE_LABELS[sc] ?? sc}</option>{/each}
      </select>
    </PropertyCell>
    {#if isInput}
      <PropertyCell label="In channel" span={1} compact hint="Which MIDI channel to take notes from. 0 = omni (any channel).">
        <NumberCell label="Ch" min={0} max={16} step={1} value={num(a.inputChannel, 0)} defaultValue={0} onchange={(v) => set('inputChannel', clampInt(v, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="" span={2} hint="A hardware output must be selected on the 'mainSynth' device role for the arp's own notes to come back out." compact>
        <div class="note">Keyboard in → arp out</div>
      </PropertyCell>
    {/if}
    {#if isLink}
      <PropertyCell label="Chord Pad" span={2} hint="The pad whose held notes feed the arp.">
        <select class="val" value={a.linkId ?? ''} onchange={(e) => set('linkId', e.target.value)}>
          <option value="">— pick a Chord Pad —</option>
          {#each chordPads as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </PropertyCell>
      {#if !chordPads.length}
        <PropertyCell label="" span={4} hint="Drop a Chord Pad on this panel to link to." compact>
          <div class="note">No Chord Pad on this panel yet.</div>
        </PropertyCell>
      {/if}
    {/if}
    {#if !isExternal}
      <PropertyCell label="Key" span={1} hint="Tonic of the arp's own chord.">
        <select class="val" value={String(num(a.key, 0))} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
          {#each keyNames as nm, i (i)}<option value={String(i)}>{nm}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Scale" span={1} hint="Which chords are available.">
        <select class="val" value={a.scale ?? 'minor'} onchange={(e) => set('scale', e.target.value)}>
          {#each scaleKeys as k (k)}<option value={k}>{SCALE_LABELS[k] ?? k}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Degree" span={1} compact hint="Which scale degree the chord is built on (0 = tonic).">
        <NumberCell label="Deg" min={0} max={degreeCount - 1} step={1} value={num(a.degree, 0)} defaultValue={0} onchange={(v) => set('degree', clampInt(v, 0, degreeCount - 1, 0))} />
      </PropertyCell>
      <PropertyCell label="Chord" span={1} hint="Triad or four-note seventh.">
        <select class="val" value={a.chordType ?? 'triad'} onchange={(e) => set('chordType', e.target.value)}>
          <option value="triad">Triad</option>
          <option value="seventh">Seventh</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Octave" span={1} compact hint="Octave of the chord root (3 → C3).">
        <NumberCell label="Oct" min={-1} max={8} step={1} value={num(a.baseOctave, 3)} defaultValue={3} onchange={(v) => set('baseOctave', clampInt(v, -1, 8, 3))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="The step walk this produces, left to right." compact>
      <div class="preview">{walk || '—'}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Timing" icon={Clock}>
    <PropertyCell label="Sync to transport" span={1} hint="Take the step length from the panel's Transport instead of a free rate.">
      <PropertyToggle value={synced} onchange={(v) => set('syncToTransport', v === true)} />
    </PropertyCell>
    {#if synced}
      <PropertyCell label="Division" span={2} hint="Step length in musical time. Gate and swing stay fractions of the step, so they follow the tempo too.">
        <select class="val" value={String(a.division ?? '1/16')} onchange={(e) => set('division', e.target.value)}>
          {#each DIVISION_IDS as d}<option value={d}>{d} · {DIVISION_LABELS[d]}</option>{/each}
        </select>
      </PropertyCell>
      {#if !hasTransport}
        <PropertyCell label="" span={4} hint="" compact>
          <div class="warn">This panel has no Transport, so there is no clock to follow — the Arp will hold at step 1. Add one from the palette.</div>
        </PropertyCell>
      {/if}
    {:else}
      <PropertyCell label="Rate" span={1} compact hint="Steps per second.">
        <NumberCell label="Rate" min={0.1} max={40} step={0.5} value={num(a.rate, 6)} defaultValue={6} onchange={(v) => set('rate', clampNum(v, 0.1, 40, 6))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Octaves" span={1} compact hint="Repeat the note set upward this many octaves.">
      <NumberCell label="Oct" min={1} max={4} step={1} value={num(a.octaves, 1)} defaultValue={1} onchange={(v) => set('octaves', clampInt(v, 1, 4, 1))} />
    </PropertyCell>
    <PropertyCell label="Gate" span={1} compact hint="Note length as a fraction of the step (1 = legato).">
      <NumberCell label="Gate" min={0.05} max={1} step={0.05} value={num(a.gate, 0.6)} defaultValue={0.6} onchange={(v) => set('gate', clampNum(v, 0.05, 1, 0.6))} />
    </PropertyCell>
    <PropertyCell label="Swing from" span={1} hint="Transport = inherit the clock's swing. Own = this arp's own setting. Free-running always uses its own.">
      <select class="val" value={a.swingSource ?? 'transport'} onchange={(e) => set('swingSource', e.target.value)}>
        <option value="transport">The transport</option>
        <option value="own">Its own</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Swing" span={1} compact hint="Delay every odd step, up to half a step (0 = straight).">
      <NumberCell label="Swing" min={0} max={1} step={0.05} value={num(a.swing, 0)} defaultValue={0} onchange={(v) => set('swing', clampNum(v, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Latch" span={1} hint="External sources: keep arpeggiating the last chord after the pad (or the keyboard) is released.">
      <PropertyToggle value={a.latch === true} onchange={() => set('latch', !(a.latch === true))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} compact hint="Note-on velocity (1–127).">
      <NumberCell label="Vel" min={1} max={127} step={1} value={num(a.velocity, 96)} defaultValue={96} onchange={(v) => set('velocity', clampInt(v, 1, 127, 96))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} compact hint="MIDI channel the notes go out on (1–16).">
      <NumberCell label="Ch" min={1} max={16} step={1} value={num(a.channel, 1)} defaultValue={1} onchange={(v) => set('channel', clampInt(v, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Click a step in preview to mute / unmute it.">
      <PropertyToggle value={a.editable !== false} onchange={() => set('editable', !(a.editable !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Rests" icon={VolumeX}>
    <PropertyCell label="Euclidean" span={1} hint="Spread N pulses evenly over M steps.">
      <PropertyToggle value={a.euclidEnabled === true} onchange={() => set('euclidEnabled', !(a.euclidEnabled === true))} />
    </PropertyCell>
    {#if a.euclidEnabled === true}
      <PropertyCell label="Steps" span={1} compact hint="Length of the rest pattern.">
        <NumberCell label="Steps" min={1} max={32} step={1} value={num(a.euclidSteps, 8)} defaultValue={8} onchange={(v) => set('euclidSteps', clampInt(v, 1, 32, 8))} />
      </PropertyCell>
      <PropertyCell label="Pulses" span={1} compact hint="How many of those steps play.">
        <NumberCell label="Pulses" min={0} max={num(a.euclidSteps, 8)} step={1} value={num(a.euclidPulses, 5)} defaultValue={5} onchange={(v) => set('euclidPulses', clampInt(v, 0, num(a.euclidSteps, 8), 5))} />
      </PropertyCell>
      <PropertyCell label="Rotate" span={1} compact hint="Shift the pattern's starting point.">
        <NumberCell label="Rot" min={0} max={31} step={1} value={num(a.euclidRotate, 0)} defaultValue={0} onchange={(v) => set('euclidRotate', clampInt(v, 0, 31, 0))} />
      </PropertyCell>
      <PropertyCell label="" span={4} hint="● plays, · rests." compact>
        <div class="preview mono">{euclidPreview}</div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Muted" span={2} hint="Steps silenced by hand (click them in preview). A hand-mute wins over the Euclidean pattern.">
      <div class="note">{mutes.length ? mutes.join(', ') : 'none'}</div>
    </PropertyCell>
    {#if mutes.length}
      <PropertyCell label="" span={2} hint="Clear every hand-mute." compact>
        <button class="btn" type="button" onclick={() => set('mutes', [])}>Clear mutes</button>
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth." compact>
      <div class="note">Plays MIDI notes · ch {num(a.channel, 1)} · vel {num(a.velocity, 96)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Show" span={4} hint="Header strip and note names in the step cells. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'showHeader', title: 'Header — the pattern / source / rate strip', on: a.showHeader !== false, icon: PanelTop },
          { key: 'showNotes', title: 'Note names — print the note in each step cell', on: a.showNotes !== false, icon: Tags },
        ]}
        ontoggle={(key, next) => set(key, next)}
      />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Lane background, note blocks, playhead, rests, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: a.fieldColour ?? 'FF101017', target: { type: 'control', controlId: core?.id, path: 'Arp.fieldColour' } },
        { key: 'stepColour', label: 'Steps', value: a.stepColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'Arp.stepColour' } },
        { key: 'headColour', label: 'Playhd', value: a.headColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Arp.headColour' } },
        { key: 'restColour', label: 'Rests', value: a.restColour ?? 'FF2A2A34', target: { type: 'control', controlId: core?.id, path: 'Arp.restColour' } },
        { key: 'labelColour', label: 'Labels', value: a.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Arp.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .warn { font-size: 11px; color: #F2C94C; background: #241f10; border: 1px solid #4a3f18; border-radius: 5px; padding: 6px 8px; line-height: 1.5; }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; }
  .preview.mono { font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; }
  .note { font-size: 11px; color: #8a8a94; }
  .btn { width: 100%; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 4px 6px; font-size: 12px; cursor: pointer; }
  .btn:hover { border-color: #5B9BD5; }
</style>
