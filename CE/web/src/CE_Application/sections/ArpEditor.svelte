<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { ARP_PATTERNS, ARP_PATTERN_LABELS, ARP_SOURCES, ARP_SOURCE_LABELS, arpBaseNotes, arpSequence, midiNoteLabel, arpUseFlats, euclid } from '../utils/arpLayout.js';
  import { DIVISION_IDS, DIVISION_LABELS } from '../utils/transportLayout.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let a = $derived(getSection(control, 'Arp'));

  // The Chord Pads on this panel — the Arp can follow whichever one you pick.
  let chordPads = $derived(
    ($activePanel?.controls ?? [])
      .filter((c) => String(c?._children?.Core?.controlType ?? '') === 'ChordPad')
      .map((c) => ({ id: String(c._children.Core.id), name: String(c._children.Core.name ?? c._children.Core.id) }))
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

  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const al = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${al}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if a}
  <PropertySection title="Arpeggiator">
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
      <PropertyCell label="In channel" span={2} hint="Which MIDI channel to take notes from. 0 = omni (any channel).">
        <input class="val" type="number" min="0" max="16" step="1" value={num(a.inputChannel, 0)} onchange={(e) => set('inputChannel', clampInt(e.target.value, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="" span={2} hint="A hardware output must be selected on the 'mainSynth' device role for the arp's own notes to come back out.">
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
        <PropertyCell label="" span={4} hint="Drop a Chord Pad on this panel to link to.">
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
      <PropertyCell label="Degree" span={1} hint="Which scale degree the chord is built on (0 = tonic).">
        <input class="val" type="number" min="0" max={degreeCount - 1} step="1" value={num(a.degree, 0)} onchange={(e) => set('degree', clampInt(e.target.value, 0, degreeCount - 1, 0))} />
      </PropertyCell>
      <PropertyCell label="Chord" span={1} hint="Triad or four-note seventh.">
        <select class="val" value={a.chordType ?? 'triad'} onchange={(e) => set('chordType', e.target.value)}>
          <option value="triad">Triad</option>
          <option value="seventh">Seventh</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Octave" span={1} hint="Octave of the chord root (3 → C3).">
        <input class="val" type="number" min="-1" max="8" step="1" value={num(a.baseOctave, 3)} onchange={(e) => set('baseOctave', clampInt(e.target.value, -1, 8, 3))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="The step walk this produces, left to right.">
      <div class="preview">{walk || '—'}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Timing">
    <PropertyCell label="Sync to transport" span={2} hint="Take the step length from the panel's Transport instead of a free rate.">
      <PropertyToggle value={synced} onchange={(v) => set('syncToTransport', v === true)} />
    </PropertyCell>
    {#if synced}
      <PropertyCell label="Division" span={2} hint="Step length in musical time. Gate and swing stay fractions of the step, so they follow the tempo too.">
        <select class="val" value={String(a.division ?? '1/16')} onchange={(e) => set('division', e.target.value)}>
          {#each DIVISION_IDS as d}<option value={d}>{d} · {DIVISION_LABELS[d]}</option>{/each}
        </select>
      </PropertyCell>
      {#if !hasTransport}
        <PropertyCell label="" span={4} hint="">
          <div class="warn">This panel has no Transport, so there is no clock to follow — the Arp will hold at step 1. Add one from the palette.</div>
        </PropertyCell>
      {/if}
    {:else}
      <PropertyCell label="Rate" span={1} hint="Steps per second.">
        <input class="val" type="number" min="0.1" max="40" step="0.5" value={num(a.rate, 6)} onchange={(e) => set('rate', clampNum(e.target.value, 0.1, 40, 6))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Octaves" span={1} hint="Repeat the note set upward this many octaves.">
      <input class="val" type="number" min="1" max="4" step="1" value={num(a.octaves, 1)} onchange={(e) => set('octaves', clampInt(e.target.value, 1, 4, 1))} />
    </PropertyCell>
    <PropertyCell label="Gate" span={1} hint="Note length as a fraction of the step (1 = legato).">
      <input class="val" type="number" min="0.05" max="1" step="0.05" value={num(a.gate, 0.6)} onchange={(e) => set('gate', clampNum(e.target.value, 0.05, 1, 0.6))} />
    </PropertyCell>
    <PropertyCell label="Swing from" span={1} hint="Transport = inherit the clock's swing. Own = this arp's own setting. Free-running always uses its own.">
      <select class="val" value={a.swingSource ?? 'transport'} onchange={(e) => set('swingSource', e.target.value)}>
        <option value="transport">The transport</option>
        <option value="own">Its own</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Swing" span={1} hint="Delay every odd step, up to half a step (0 = straight).">
      <input class="val" type="number" min="0" max="1" step="0.05" value={num(a.swing, 0)} onchange={(e) => set('swing', clampNum(e.target.value, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Latch" span={1} hint="External sources: keep arpeggiating the last chord after the pad (or the keyboard) is released.">
      <PropertyToggle value={a.latch === true} onchange={() => set('latch', !(a.latch === true))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} hint="Note-on velocity (1–127).">
      <input class="val" type="number" min="1" max="127" step="1" value={num(a.velocity, 96)} onchange={(e) => set('velocity', clampInt(e.target.value, 1, 127, 96))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} hint="MIDI channel the notes go out on (1–16).">
      <input class="val" type="number" min="1" max="16" step="1" value={num(a.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Click a step in preview to mute / unmute it.">
      <PropertyToggle value={a.editable !== false} onchange={() => set('editable', !(a.editable !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Rests">
    <PropertyCell label="Euclidean" span={1} hint="Spread N pulses evenly over M steps.">
      <PropertyToggle value={a.euclidEnabled === true} onchange={() => set('euclidEnabled', !(a.euclidEnabled === true))} />
    </PropertyCell>
    {#if a.euclidEnabled === true}
      <PropertyCell label="Steps" span={1} hint="Length of the rest pattern.">
        <input class="val" type="number" min="1" max="32" step="1" value={num(a.euclidSteps, 8)} onchange={(e) => set('euclidSteps', clampInt(e.target.value, 1, 32, 8))} />
      </PropertyCell>
      <PropertyCell label="Pulses" span={1} hint="How many of those steps play.">
        <input class="val" type="number" min="0" max={num(a.euclidSteps, 8)} step="1" value={num(a.euclidPulses, 5)} onchange={(e) => set('euclidPulses', clampInt(e.target.value, 0, num(a.euclidSteps, 8), 5))} />
      </PropertyCell>
      <PropertyCell label="Rotate" span={1} hint="Shift the pattern's starting point.">
        <input class="val" type="number" min="0" max="31" step="1" value={num(a.euclidRotate, 0)} onchange={(e) => set('euclidRotate', clampInt(e.target.value, 0, 31, 0))} />
      </PropertyCell>
      <PropertyCell label="" span={4} hint="● plays, · rests.">
        <div class="preview mono">{euclidPreview}</div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Muted" span={2} hint="Steps silenced by hand (click them in preview). A hand-mute wins over the Euclidean pattern.">
      <div class="note">{mutes.length ? mutes.join(', ') : 'none'}</div>
    </PropertyCell>
    {#if mutes.length}
      <PropertyCell label="" span={2} hint="Clear every hand-mute.">
        <button class="btn" type="button" onclick={() => set('mutes', [])}>Clear mutes</button>
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth.">
      <div class="note">Plays MIDI notes · ch {num(a.channel, 1)} · vel {num(a.velocity, 96)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Header" span={1} hint="Show the pattern / source / rate strip.">
      <PropertyToggle value={a.showHeader !== false} onchange={() => set('showHeader', !(a.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Note names" span={1} hint="Print the note in each step cell.">
      <PropertyToggle value={a.showNotes !== false} onchange={() => set('showNotes', !(a.showNotes !== false))} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Lane background colour.">
      <input class="cswatch" type="color" value={colRgb(a.fieldColour, 'FF101017')} onchange={(e) => setCol('fieldColour', a.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Steps" span={1} hint="Colour of the note blocks.">
      <input class="cswatch" type="color" value={colRgb(a.stepColour, 'FF5B9BD5')} onchange={(e) => setCol('stepColour', a.stepColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Playhead" span={1} hint="Colour of the step currently sounding.">
      <input class="cswatch" type="color" value={colRgb(a.headColour, 'FFF2C94C')} onchange={(e) => setCol('headColour', a.headColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Rests" span={1} hint="Fill for muted / rested steps.">
      <input class="cswatch" type="color" value={colRgb(a.restColour, 'FF2A2A34')} onchange={(e) => setCol('restColour', a.restColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={2} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(a.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', a.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .warn { font-size: 11px; color: #F2C94C; background: #241f10; border: 1px solid #4a3f18; border-radius: 5px; padding: 6px 8px; line-height: 1.5; }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; }
  .preview.mono { font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; }
  .note { font-size: 11px; color: #8a8a94; }
  .btn { width: 100%; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 4px 6px; font-size: 12px; cursor: pointer; }
  .btn:hover { border-color: #5B9BD5; }
</style>
