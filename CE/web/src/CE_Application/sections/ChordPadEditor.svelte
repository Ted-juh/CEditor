<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats, chordPadPads } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PanelKeyCell from '../properties/PanelKeyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Music from 'lucide-svelte/icons/music';
  import Activity from 'lucide-svelte/icons/activity';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let cp = $derived(getSection(control, 'ChordPad'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `ChordPad.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let flats = $derived(useFlats(num(cp?.key, 0), String(cp?.scale ?? 'major')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let scaleKeys = $derived(Object.keys(SCALES));
  // A live preview of what the pads will spell.
  let padPreview = $derived.by(() => {
    try { return chordPadPads(control).map((p) => p.name).join('  ·  '); } catch { return ''; }
  });

</script>

{#if cp}
  <PropertySection title="Chord Pad" icon={Music}>
    <PropertyCell label="Layout" span={2} hint="Wheel = circle of fifths, with relative minors inside their majors. Grid = compact, in-key only.">
      <select class="val" value={cp.layout ?? 'wheel'} onchange={(e) => set('layout', e.target.value)}>
        <option value="wheel">Wheel (circle of fifths)</option>
        <option value="grid">Grid</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Mode" span={2} hint="Chords = one chord per pad. Notes = one scale note per pad (isomorphic).">
      <select class="val" value={cp.mode ?? 'chords'} onchange={(e) => set('mode', e.target.value)}>
        <option value="chords">Chords</option>
        <option value="notes">Notes</option>
      </select>
    </PropertyCell>
    <PanelKeyCell {control} section="ChordPad" />
    <PropertyCell label="Key" span={2} hint="The tonic. Pads and the wheel's lit wedge follow it.">
      <select class="val" value={String(num(cp.key, 0))} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
        {#each keyNames as nm, i (i)}<option value={String(i)}>{nm}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Scale" span={2} hint="Determines which chords are in key.">
      <select class="val" value={cp.scale ?? 'major'} onchange={(e) => set('scale', e.target.value)}>
        {#each scaleKeys as k (k)}<option value={k}>{SCALE_LABELS[k] ?? k}</option>{/each}
      </select>
    </PropertyCell>
    {#if String(cp.mode ?? 'chords') === 'chords'}
      <PropertyCell label="Chords" span={2} hint="Triads or four-note sevenths.">
        <select class="val" value={cp.chordType ?? 'triad'} onchange={(e) => set('chordType', e.target.value)}>
          <option value="triad">Triads</option>
          <option value="seventh">Sevenths</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Voicing" span={1} hint="Close = tight stack. Spread = alternate notes up an octave. Drop-2 = the 2nd-from-top drops an octave.">
        <select class="val" value={cp.voicing ?? 'close'} onchange={(e) => set('voicing', e.target.value)}>
          <option value="close">Close</option>
          <option value="spread">Spread</option>
          <option value="drop2">Drop 2</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Inversion" span={1} compact hint="Rotate the chord tones upward.">
        <NumberCell label="Inv" min={0} max={3} step={1} value={num(cp.inversion, 0)} defaultValue={0} onchange={(v) => set('inversion', clampInt(v, 0, 3, 0))} />
      </PropertyCell>
    {:else}
      <PropertyCell label="Octaves" span={1} compact hint="How many octaves of scale notes to lay out.">
        <NumberCell label="Oct" min={1} max={3} step={1} value={num(cp.noteSpan, 2)} defaultValue={2} onchange={(v) => set('noteSpan', clampInt(v, 1, 3, 2))} />
      </PropertyCell>
    {/if}
    {#if String(cp.layout ?? 'wheel') === 'grid'}
      <PropertyCell label="Columns" span={1} compact hint="Grid width.">
        <NumberCell label="Cols" min={1} max={8} step={1} value={num(cp.gridCols, 4)} defaultValue={4} onchange={(v) => set('gridCols', clampInt(v, 1, 8, 4))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="What the pads currently spell." compact>
      <div class="preview">{padPreview}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Performance" icon={Activity}>
    <PropertyCell label="Octave" span={1} compact hint="Transpose the whole pad in octaves.">
      <NumberCell label="Oct" min={-3} max={3} step={1} value={num(cp.octave, 0)} defaultValue={0} onchange={(v) => set('octave', clampInt(v, -3, 3, 0))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} compact hint="Note-on velocity (1–127).">
      <NumberCell label="Vel" min={1} max={127} step={1} value={num(cp.velocity, 96)} defaultValue={96} onchange={(v) => set('velocity', clampInt(v, 1, 127, 96))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} compact hint="MIDI channel the notes go out on (1–16).">
      <NumberCell label="Ch" min={1} max={16} step={1} value={num(cp.channel, 1)} defaultValue={1} onchange={(v) => set('channel', clampInt(v, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Strum" span={1} compact hint="Milliseconds between chord notes (0 = block chord).">
      <NumberCell label="Strum" min={0} max={200} step={2} value={num(cp.strumMs, 0)} defaultValue={0} onchange={(v) => set('strumMs', clampInt(v, 0, 200, 0))} />
    </PropertyCell>
    <PropertyCell label="Latch" span={1} hint="Pads keep sounding until tapped again (hands-free auditioning).">
      <PropertyToggle value={cp.latch === true} onchange={() => set('latch', !(cp.latch === true))} />
    </PropertyCell>
    <PropertyCell label="Playable" span={1} hint="Allow playing the pads in preview / the player.">
      <PropertyToggle value={cp.editable !== false} onchange={() => set('editable', !(cp.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Piano" span={1} hint="Show the sounding-notes keyboard strip.">
      <PropertyToggle value={cp.showPiano !== false} onchange={() => set('showPiano', !(cp.showPiano !== false))} />
    </PropertyCell>
    <PropertyCell label="Numerals" span={1} hint="Show roman numerals (I, ii, ♭VII…) on the pads.">
      <PropertyToggle value={cp.showRomans !== false} onchange={() => set('showRomans', !(cp.showRomans !== false))} />
    </PropertyCell>
    <PropertyCell label="Echo MIDI in" span={1} hint="Outline the pads and piano strip from notes arriving on the hardware MIDI input.">
      <PropertyToggle value={cp.echo === true} onchange={() => set('echo', !(cp.echo === true))} />
    </PropertyCell>
    {#if cp.echo === true}
      <PropertyCell label="In channel" span={1} compact hint="Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.">
        <NumberCell label="Ch" min={0} max={16} step={1} value={num(cp.echoChannel, 0)} defaultValue={0} onchange={(v) => set('echoChannel', clampInt(v, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline. Click the swatch to edit it in the Colors tab.">
        <SwatchCluster swatches={[
          { key: 'echo', label: 'Echo', value: cp.echoColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'ChordPad.echoColour' } },
        ]} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth." compact>
      <div class="note">Plays MIDI notes · ch {num(cp.channel, 1)} · vel {num(cp.velocity, 96)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Pad colours" span={4} hint="Pad fill, in-key accent, tonic accent, minor ring, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'padColour', label: 'Pads', value: cp.padColour ?? 'FF171720', target: { type: 'control', controlId: core?.id, path: 'ChordPad.padColour' } },
        { key: 'inKeyColour', label: 'In key', value: cp.inKeyColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'ChordPad.inKeyColour' } },
        { key: 'tonicColour', label: 'Tonic', value: cp.tonicColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'ChordPad.tonicColour' } },
        { key: 'minorColour', label: 'Minors', value: cp.minorColour ?? 'FF9B8AFF', target: { type: 'control', controlId: core?.id, path: 'ChordPad.minorColour' } },
        { key: 'labelColour', label: 'Labels', value: cp.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'ChordPad.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
