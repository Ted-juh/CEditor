<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    TRANSPORT_SOURCES, TRANSPORT_SOURCE_LABELS, MIN_BPM, MAX_BPM, transportIsFollowing,
    MIN_BARS, MAX_BARS, MAX_LOOP_BAR, MAX_COUNT_IN_BARS,
  } from '../utils/transportLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let t = $derived(getSection(control, 'Transport'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Transport.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }
  function clampNum(v, lo, hi, f) { const n = num(v, f); return n < lo ? lo : n > hi ? hi : n; }

  let src = $derived(String(t?.source ?? 'internal'));
  let isHost = $derived(src === 'host');
  // Both non-internal sources make the tempo read-only and the tap pointless.
  let external = $derived(transportIsFollowing(src));

  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const al = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${al}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if t}
  <PropertySection title="Transport">
    <PropertyCell label="Source" span={2} hint="Internal = this is the master clock. MIDI clock in = follow an incoming clock. Host/DAW = follow the DAW playhead. Followers ignore the tempo box.">
      <select class="val" value={t.source ?? 'internal'} onchange={(e) => set('source', e.target.value)}>
        {#each TRANSPORT_SOURCES as s (s)}<option value={s}>{TRANSPORT_SOURCE_LABELS[s] ?? s}</option>{/each}
      </select>
    </PropertyCell>
    {#if isHost}
      <PropertyCell label="" span={4} hint="">
        <div class="note">Only live in an exported plugin; elsewhere the face reads &ldquo;HOST · no DAW&rdquo;.</div>
      </PropertyCell>
    {/if}

    <PropertyCell label="Tempo" span={2} hint="Beats per minute ({MIN_BPM}–{MAX_BPM}). Changing it never jumps the position — only the rate ahead of the current beat." disabled={external}>
      <input class="val" type="number" min={MIN_BPM} max={MAX_BPM} step="0.1" disabled={external}
             value={num(t.bpm, 120)} onchange={(e) => set('bpm', clampNum(e.target.value, MIN_BPM, MAX_BPM, 120))} />
    </PropertyCell>
    <PropertyCell label="Beats/bar" span={1} hint="Time signature numerator — drives the bar.beat readout and the downbeat accent.">
      <input class="val" type="number" min="1" max="32" step="1" value={num(t.beatsPerBar, 4)} onchange={(e) => set('beatsPerBar', clampInt(e.target.value, 1, 32, 4))} />
    </PropertyCell>
    <PropertyCell label="Beat unit" span={1} hint="Time signature denominator (4 = quarter notes).">
      <input class="val" type="number" min="1" max="32" step="1" value={num(t.beatUnit, 4)} onchange={(e) => set('beatUnit', clampInt(e.target.value, 1, 32, 4))} />
    </PropertyCell>
    <PropertyCell label="Run on load" span={1} hint="Start the clock as soon as the panel opens, so an exported Player is already running.">
      <PropertyToggle value={t.runOnLoad === true} onchange={() => set('runOnLoad', !(t.runOnLoad === true))} />
    </PropertyCell>
    <PropertyCell label="Count-in" span={1} hint="Bars of silence before the first step fires when you press play; 0 = off. Synced components hold and stay quiet.">
      <input class="val" type="number" min="0" max={MAX_COUNT_IN_BARS} step="1" value={num(t.countInBars, 0)} onchange={(e) => set('countInBars', clampInt(e.target.value, 0, MAX_COUNT_IN_BARS, 0))} />
    </PropertyCell>
    <PropertyCell label="Clock out" span={1} hint="Send MIDI clock so hardware follows this panel — 24 messages per quarter note.">
      <PropertyToggle value={t.clockOut === true} onchange={() => set('clockOut', !(t.clockOut === true))} />
    </PropertyCell>
    <PropertyCell label="" span={4} hint="Every synced component follows this one clock.">
      <div class="note">{isHost ? 'Following the DAW playhead' : external ? 'Following MIDI clock in' : 'Master clock'}{t.clockOut === true && !external ? ' · sending clock' : ''}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Loop">
    <PropertyCell label="Loop" span={1} hint="Fold the position into a bar range, so the clock comes back round instead of running on forever.">
      <PropertyToggle value={t.loopEnabled === true} onchange={() => set('loopEnabled', !(t.loopEnabled === true))} />
    </PropertyCell>
    {#if t.loopEnabled === true}
      <PropertyCell label="From bar" span={1} hint="The first bar of the loop, counting from 1.">
        <input class="val" type="number" min="1" max={MAX_LOOP_BAR} step="1" value={num(t.loopStartBar, 1)} onchange={(e) => set('loopStartBar', clampInt(e.target.value, 1, MAX_LOOP_BAR, 1))} />
      </PropertyCell>
      <PropertyCell label="Length (bars)" span={1} hint="How long the loop is. 0.25 = one beat in 4/4.">
        <input class="val" type="number" min={MIN_BARS} max={MAX_BARS} step="0.25" value={num(t.loopLengthBars, 4)} onchange={(e) => set('loopLengthBars', clampNum(e.target.value, MIN_BARS, MAX_BARS, 4))} />
      </PropertyCell>
      <PropertyCell label="" span={1} hint="">
        <div class="note">bars {num(t.loopStartBar, 1)}–{num(t.loopStartBar, 1) + num(t.loopLengthBars, 4)}</div>
      </PropertyCell>
      {#if external}
        <PropertyCell label="" span={4} hint="">
          <div class="note">Inactive while following {isHost ? 'the DAW' : 'MIDI clock in'} — the master owns the position, and folding it into a loop of ours would put the panel somewhere the master isn't. Use the host's own loop.</div>
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Playable" span={1} hint="Allow play/stop and tap tempo in preview / the player.">
      <PropertyToggle value={t.editable !== false} onchange={() => set('editable', !(t.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Position" span={1} hint="Show the bar.beat.tick readout and the beat pulse.">
      <PropertyToggle value={t.showPosition !== false} onchange={() => set('showPosition', !(t.showPosition !== false))} />
    </PropertyCell>
    <PropertyCell label="Swing" span={1} hint="Shuffle for every follower on this clock — delays every odd step by up to half a step.">
      <input class="val" type="number" min="0" max="1" step="0.05" value={num(t.swing, 0)} onchange={(e) => set('swing', clampNum(e.target.value, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Tap tempo" span={1} hint="Tapping the face sets the tempo. Inactive while following an external clock or the DAW.">
      <PropertyToggle value={t.showTap !== false} onchange={() => set('showTap', !(t.showTap !== false))} />
    </PropertyCell>
    <PropertyCell label="Face" span={1} hint="Background colour.">
      <input class="cswatch" type="color" value={colRgb(t.faceColour, 'FF141420')} onchange={(e) => setCol('faceColour', t.faceColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Accent" span={1} hint="Play button / running colour.">
      <input class="cswatch" type="color" value={colRgb(t.accentColour, 'FF39D98A')} onchange={(e) => setCol('accentColour', t.accentColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Beat" span={1} hint="Beat-pulse colour.">
      <input class="cswatch" type="color" value={colRgb(t.beatColour, 'FFF2C94C')} onchange={(e) => setCol('beatColour', t.beatColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={2} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(t.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', t.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .val:disabled { opacity: 0.5; cursor: not-allowed; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
