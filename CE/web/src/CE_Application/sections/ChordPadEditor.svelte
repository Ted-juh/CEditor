<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats, chordPadPads } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

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

  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const a = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${a}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if cp}
  <PropertySection title="Chord Pad">
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
      <PropertyCell label="Inversion" span={1} hint="Rotate the chord tones upward.">
        <input class="val" type="number" min="0" max="3" step="1" value={num(cp.inversion, 0)} onchange={(e) => set('inversion', clampInt(e.target.value, 0, 3, 0))} />
      </PropertyCell>
    {:else}
      <PropertyCell label="Octaves" span={2} hint="How many octaves of scale notes to lay out.">
        <input class="val" type="number" min="1" max="3" step="1" value={num(cp.noteSpan, 2)} onchange={(e) => set('noteSpan', clampInt(e.target.value, 1, 3, 2))} />
      </PropertyCell>
    {/if}
    {#if String(cp.layout ?? 'wheel') === 'grid'}
      <PropertyCell label="Columns" span={2} hint="Grid width.">
        <input class="val" type="number" min="1" max="8" step="1" value={num(cp.gridCols, 4)} onchange={(e) => set('gridCols', clampInt(e.target.value, 1, 8, 4))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="What the pads currently spell.">
      <div class="preview">{padPreview}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Performance">
    <PropertyCell label="Octave" span={1} hint="Transpose the whole pad in octaves.">
      <input class="val" type="number" min="-3" max="3" step="1" value={num(cp.octave, 0)} onchange={(e) => set('octave', clampInt(e.target.value, -3, 3, 0))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} hint="Note-on velocity (1–127).">
      <input class="val" type="number" min="1" max="127" step="1" value={num(cp.velocity, 96)} onchange={(e) => set('velocity', clampInt(e.target.value, 1, 127, 96))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} hint="MIDI channel the notes go out on (1–16).">
      <input class="val" type="number" min="1" max="16" step="1" value={num(cp.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Strum" span={1} hint="Milliseconds between chord notes (0 = block chord).">
      <input class="val" type="number" min="0" max="200" step="2" value={num(cp.strumMs, 0)} onchange={(e) => set('strumMs', clampInt(e.target.value, 0, 200, 0))} />
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
      <PropertyCell label="In channel" span={1} hint="Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.">
        <input class="val" type="number" min="0" max="16" step="1" value={num(cp.echoChannel, 0)} onchange={(e) => set('echoChannel', clampInt(e.target.value, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline.">
        <input class="cswatch" type="color" value={colRgb(cp.echoColour, 'FF39D98A')} onchange={(e) => setCol('echoColour', cp.echoColour, e.target.value)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth.">
      <div class="note">Plays MIDI notes · ch {num(cp.channel, 1)} · vel {num(cp.velocity, 96)}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Pads" span={1} hint="Pad fill colour.">
      <input class="cswatch" type="color" value={colRgb(cp.padColour, 'FF171720')} onchange={(e) => setCol('padColour', cp.padColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="In key" span={1} hint="Accent for in-key chords / major ring.">
      <input class="cswatch" type="color" value={colRgb(cp.inKeyColour, 'FF5B9BD5')} onchange={(e) => setCol('inKeyColour', cp.inKeyColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Tonic" span={1} hint="Accent for the tonic + sounding notes.">
      <input class="cswatch" type="color" value={colRgb(cp.tonicColour, 'FFF2C94C')} onchange={(e) => setCol('tonicColour', cp.tonicColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Minors" span={1} hint="Accent for the inner (relative minor) ring.">
      <input class="cswatch" type="color" value={colRgb(cp.minorColour, 'FF9B8AFF')} onchange={(e) => setCol('minorColour', cp.minorColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={2} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(cp.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', cp.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
