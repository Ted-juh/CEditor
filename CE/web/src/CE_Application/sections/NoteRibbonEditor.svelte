<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    RIBBON_MODES, RIBBON_MODE_LABELS, ribbonZones, ribbonRange,
  } from '../utils/noteRibbonLayout.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats, noteName } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let r = $derived(getSection(control, 'NoteRibbon'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `NoteRibbon.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let flats = $derived(useFlats(num(r?.key, 0), String(r?.scale ?? 'major')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let scaleKeys = $derived(Object.keys(SCALES));
  let isGlide = $derived(String(r?.mode ?? 'snap') === 'glide');

  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const al = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${al}${hex.replace('#', '').toUpperCase()}`); }

  let span = $derived.by(() => {
    try {
      const { lo, hi } = ribbonRange(control);
      const label = (m) => `${noteName(((m % 12) + 12) % 12, flats)}${Math.floor(m / 12) - 1}`;
      return `${label(lo)} → ${label(hi)} · ${ribbonZones(control).length} zones`;
    } catch { return ''; }
  });
</script>

{#if r}
  <PropertySection title="Ribbon Keyboard">
    <PropertyCell label="Mode" span={2} hint="Scale snap = only in-key notes, so you can't play a wrong one. Chromatic = every semitone. Glide = continuous pitch via MIDI pitch bend — the gesture a keyboard can't make.">
      <select class="val" value={r.mode ?? 'snap'} onchange={(e) => set('mode', e.target.value)}>
        {#each RIBBON_MODES as m (m)}<option value={m}>{RIBBON_MODE_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Orientation" span={2} hint="Vertical strips run low-at-the-bottom.">
      <select class="val" value={r.orientation ?? 'horizontal'} onchange={(e) => set('orientation', e.target.value)}>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Key" span={1} hint="Tonic. Roots are accented; in scale-snap mode only these notes are reachable.">
      <select class="val" value={String(num(r.key, 0))} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
        {#each keyNames as nm, i (i)}<option value={String(i)}>{nm}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Scale" span={1} hint="Which notes count as in key.">
      <select class="val" value={r.scale ?? 'major'} onchange={(e) => set('scale', e.target.value)}>
        {#each scaleKeys as k (k)}<option value={k}>{SCALE_LABELS[k] ?? k}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Lowest" span={1} hint="MIDI note at the low end of the strip (48 = C3, 60 = middle C).">
      <input class="val" type="number" min="0" max="127" step="1" value={num(r.baseNote, 48)} onchange={(e) => set('baseNote', clampInt(e.target.value, 0, 127, 48))} />
    </PropertyCell>
    <PropertyCell label="Octaves" span={1} hint="How far the strip reaches. Wider = more range, narrower = more precision per pixel.">
      <input class="val" type="number" min="1" max="5" step="1" value={num(r.octaves, 2)} onchange={(e) => set('octaves', clampInt(e.target.value, 1, 5, 2))} />
    </PropertyCell>
    <PropertyCell label="" span={4} hint="What the strip currently covers.">
      <div class="preview">{span}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Performance">
    {#if isGlide}
      <PropertyCell label="Bend range" span={2} hint="Semitones of pitch bend. This MUST match the synth's own bend range or the glide will be the wrong distance. 2 is the near-universal default; raise both if you want long slides without a retrigger.">
        <input class="val" type="number" min="1" max="48" step="1" value={num(r.bendRange, 2)} onchange={(e) => set('bendRange', clampInt(e.target.value, 1, 48, 2))} />
      </PropertyCell>
      <PropertyCell label="" span={2} hint="Bend only reaches ±the range, so past that the note retriggers on a new root.">
        <div class="note">Retriggers past ±{num(r.bendRange, 2)} semitones</div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Velocity" span={1} hint="Note-on velocity (1–127) when velocity is fixed.">
      <input class="val" type="number" min="1" max="127" step="1" value={num(r.velocity, 96)} onchange={(e) => set('velocity', clampInt(e.target.value, 1, 127, 96))} />
    </PropertyCell>
    <PropertyCell label="Vel. from" span={1} hint="Position takes velocity from where on the short axis you touched — the closest a mouse gets to dynamics.">
      <select class="val" value={r.velocityFrom ?? 'fixed'} onchange={(e) => set('velocityFrom', e.target.value)}>
        <option value="fixed">Fixed</option>
        <option value="position">Touch position</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Channel" span={1} hint="MIDI channel for notes, bend and the CC (1–16).">
      <input class="val" type="number" min="1" max="16" step="1" value={num(r.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Latch" span={1} hint="The note keeps sounding after release; touch again to silence it.">
      <PropertyToggle value={r.latch === true} onchange={() => set('latch', !(r.latch === true))} />
    </PropertyCell>
    <PropertyCell label="Cross axis" span={2} hint="The short axis as a second expression dimension — standing in for the pressure a real ribbon senses.">
      <select class="val" value={r.modAxis ?? 'none'} onchange={(e) => set('modAxis', e.target.value)}>
        <option value="none">Off</option>
        <option value="cc">Send a CC</option>
      </select>
    </PropertyCell>
    {#if String(r.modAxis ?? 'none') === 'cc'}
      <PropertyCell label="CC" span={2} hint="Which controller that axis sends (1 = mod wheel, 74 = filter cutoff on many synths).">
        <input class="val" type="number" min="0" max="127" step="1" value={num(r.modCc, 1)} onchange={(e) => set('modCc', clampInt(e.target.value, 0, 127, 1))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Echo MIDI in" span={1} hint="Light the matching zones from notes arriving on the hardware MIDI input, drawn as an outline so external play never looks like your own. Turns the strip into a pitch monitor for whatever is playing.">
      <PropertyToggle value={r.echo === true} onchange={() => set('echo', !(r.echo === true))} />
    </PropertyCell>
    {#if r.echo === true}
      <PropertyCell label="In channel" span={1} hint="Which MIDI channel to watch. 0 = omni (any channel), which is usually what you want.">
        <input class="val" type="number" min="0" max="16" step="1" value={num(r.echoChannel, 0)} onchange={(e) => set('echoChannel', clampInt(e.target.value, 0, 16, 0))} />
      </PropertyCell>
      <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline.">
        <input class="cswatch" type="color" value={colRgb(r.echoColour, 'FF39D98A')} onchange={(e) => setCol('echoColour', r.echoColour, e.target.value)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Playable" span={1} hint="Allow playing the strip in preview / the player.">
      <PropertyToggle value={r.editable !== false} onchange={() => set('editable', !(r.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="" span={3} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth.">
      <div class="note">Plays MIDI notes · ch {num(r.channel, 1)}{isGlide ? ' · + pitch bend' : ''}{String(r.modAxis ?? 'none') === 'cc' ? ` · + CC${num(r.modCc, 1)}` : ''}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Header" span={1} hint="Show the key / mode / current-note strip.">
      <PropertyToggle value={r.showHeader !== false} onchange={() => set('showHeader', !(r.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Note names" span={1} hint="Print note names on the zones (hidden automatically when they're too narrow).">
      <PropertyToggle value={r.showNames !== false} onchange={() => set('showNames', !(r.showNames !== false))} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Strip background colour.">
      <input class="cswatch" type="color" value={colRgb(r.fieldColour, 'FF101017')} onchange={(e) => setCol('fieldColour', r.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Zones" span={1} hint="Zone fill colour.">
      <input class="cswatch" type="color" value={colRgb(r.zoneColour, 'FF171720')} onchange={(e) => setCol('zoneColour', r.zoneColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="In key" span={1} hint="Accent for in-key zones.">
      <input class="cswatch" type="color" value={colRgb(r.inKeyColour, 'FF5B9BD5')} onchange={(e) => setCol('inKeyColour', r.inKeyColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Roots" span={1} hint="Accent for the tonic zones.">
      <input class="cswatch" type="color" value={colRgb(r.rootColour, 'FFF2C94C')} onchange={(e) => setCol('rootColour', r.rootColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Touch" span={1} hint="Colour of the played-position rail.">
      <input class="cswatch" type="color" value={colRgb(r.touchColour, 'FFF2C94C')} onchange={(e) => setCol('touchColour', r.touchColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(r.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', r.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
