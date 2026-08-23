<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    TRANSPORT_SOURCES, TRANSPORT_SOURCE_LABELS, MIN_BPM, MAX_BPM, transportIsFollowing,
    MIN_BARS, MAX_BARS, MAX_LOOP_BAR, MAX_COUNT_IN_BARS,
  } from '../utils/transportLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { activePanel } from '../stores/panels.js';
  import { countRolesInPanels, resolveClockDevice } from '../utils/deviceRoles.js';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import Clock from 'lucide-svelte/icons/clock';
  import Repeat from 'lucide-svelte/icons/repeat';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let t = $derived(getSection(control, 'Transport'));

  // The devices this panel's controls actually name — the only sensible things to clock.
  let panelDevices = $derived([...countRolesInPanels([$activePanel]).keys()].sort());
  let autoTarget = $derived(resolveClockDevice('', panelDevices));
  let resolvedTarget = $derived(resolveClockDevice(t?.clockDevice, panelDevices));

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

</script>

{#if t}
  <PropertySection title="Transport" icon={Clock}>
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

    <PropertyCell label="Tempo" span={2} compact hint="Beats per minute ({MIN_BPM}–{MAX_BPM}). Changing it never jumps the position — only the rate ahead of the current beat." disabled={external}>
      <NumberCell label="BPM" min={MIN_BPM} max={MAX_BPM} step={0.1} disabled={external}
             value={num(t.bpm, 120)} defaultValue={120} onchange={(v) => set('bpm', clampNum(v, MIN_BPM, MAX_BPM, 120))} />
    </PropertyCell>
    <PropertyCell label="Beats/bar" span={1} compact hint="Time signature numerator — drives the bar.beat readout and the downbeat accent.">
      <NumberCell label="Beats" min={1} max={32} step={1} value={num(t.beatsPerBar, 4)} defaultValue={4} onchange={(v) => set('beatsPerBar', clampInt(v, 1, 32, 4))} />
    </PropertyCell>
    <PropertyCell label="Beat unit" span={1} compact hint="Time signature denominator (4 = quarter notes).">
      <NumberCell label="Unit" min={1} max={32} step={1} value={num(t.beatUnit, 4)} defaultValue={4} onchange={(v) => set('beatUnit', clampInt(v, 1, 32, 4))} />
    </PropertyCell>
    <PropertyCell label="Run on load" span={1} hint="Start the clock as soon as the panel opens, so an exported Player is already running.">
      <PropertyToggle value={t.runOnLoad === true} onchange={() => set('runOnLoad', !(t.runOnLoad === true))} />
    </PropertyCell>
    <PropertyCell label="Count-in" span={1} compact hint="Bars of silence before the first step fires when you press play; 0 = off. Synced components hold and stay quiet.">
      <NumberCell label="Bars" min={0} max={MAX_COUNT_IN_BARS} step={1} value={num(t.countInBars, 0)} defaultValue={0} onchange={(v) => set('countInBars', clampInt(v, 0, MAX_COUNT_IN_BARS, 0))} />
    </PropertyCell>
    <PropertyCell label="Clock out" span={1} hint="Send MIDI clock so hardware follows this panel — 24 messages per quarter note.">
      <PropertyToggle value={t.clockOut === true} onchange={() => set('clockOut', !(t.clockOut === true))} />
    </PropertyCell>
    <PropertyCell label="Clock to" span={3} hint="Which device receives the clock, start, stop and song position. Auto uses the panel's own device when it names exactly one.">
      <select class="val" value={t.clockDevice ?? ''} onchange={(e) => set('clockDevice', e.target.value)}>
        <option value="">Auto{autoTarget ? ` — ${autoTarget}` : ''}</option>
        {#each panelDevices as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="Every synced component follows this one clock.">
      <div class="note">{isHost ? 'Following the DAW playhead' : external ? 'Following MIDI clock in' : 'Master clock'}{t.clockOut === true && !external ? ' · sending clock' : ''}</div>
      <!--
        Clock used to go to a hardcoded device name whatever the panel called its own, so a panel like
        the GAIA's had every transport message dropped without a word. Nothing is guessed now, which
        means the one case with no answer — several devices and no choice made — has to say so.
      -->
      {#if t.clockOut === true && !external && !resolvedTarget}
        <div class="note warn">
          {panelDevices.length === 0
            ? 'Nothing to clock: no control on this panel names a device.'
            : `Pick a device — this panel names ${panelDevices.length} (${panelDevices.join(', ')}), so Auto cannot choose.`}
        </div>
      {/if}
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Loop" icon={Repeat}>
    {#snippet tools()}
      <HeaderPill value={t.loopEnabled === true}
                  title="Fold the position into a bar range, so the clock comes back round instead of running on forever."
                  onchange={() => set('loopEnabled', !(t.loopEnabled === true))} />
    {/snippet}
    {#if t.loopEnabled === true}
      <PropertyCell label="From bar" span={1} compact hint="The first bar of the loop, counting from 1.">
        <NumberCell label="Bar" min={1} max={MAX_LOOP_BAR} step={1} value={num(t.loopStartBar, 1)} defaultValue={1} onchange={(v) => set('loopStartBar', clampInt(v, 1, MAX_LOOP_BAR, 1))} />
      </PropertyCell>
      <PropertyCell label="Length (bars)" span={1} compact hint="How long the loop is. 0.25 = one beat in 4/4.">
        <NumberCell label="Len" min={MIN_BARS} max={MAX_BARS} step={0.25} value={num(t.loopLengthBars, 4)} defaultValue={4} onchange={(v) => set('loopLengthBars', clampNum(v, MIN_BARS, MAX_BARS, 4))} />
      </PropertyCell>
      <PropertyCell label="" span={2} hint="">
        <div class="note">bars {num(t.loopStartBar, 1)}–{num(t.loopStartBar, 1) + num(t.loopLengthBars, 4)}</div>
      </PropertyCell>
      {#if external}
        <PropertyCell label="" span={4} hint="">
          <div class="note">Inactive while following {isHost ? 'the DAW' : 'MIDI clock in'} — the master owns the position, and folding it into a loop of ours would put the panel somewhere the master isn't. Use the host's own loop.</div>
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Playable" span={1} hint="Allow play/stop and tap tempo in preview / the player.">
      <PropertyToggle value={t.editable !== false} onchange={() => set('editable', !(t.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Position" span={1} hint="Show the bar.beat.tick readout and the beat pulse.">
      <PropertyToggle value={t.showPosition !== false} onchange={() => set('showPosition', !(t.showPosition !== false))} />
    </PropertyCell>
    <PropertyCell label="Swing" span={1} compact hint="Shuffle for every follower on this clock — delays every odd step by up to half a step.">
      <NumberCell label="Swing" min={0} max={1} step={0.05} value={num(t.swing, 0)} defaultValue={0} onchange={(v) => set('swing', clampNum(v, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Tap tempo" span={1} hint="Tapping the face sets the tempo. Inactive while following an external clock or the DAW.">
      <PropertyToggle value={t.showTap !== false} onchange={() => set('showTap', !(t.showTap !== false))} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Face background, play/running accent, beat pulse, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: t.faceColour ?? 'FF141420', target: { type: 'control', controlId: core?.id, path: 'Transport.faceColour' } },
        { key: 'accentColour', label: 'Accent', value: t.accentColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'Transport.accentColour' } },
        { key: 'beatColour', label: 'Beat', value: t.beatColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Transport.beatColour' } },
        { key: 'labelColour', label: 'Labels', value: t.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Transport.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .val:disabled { opacity: 0.5; cursor: not-allowed; }
  .note { font-size: 11px; color: #8a8a94; }
  .note.warn { color: #d8a657; margin-top: 3px; }
</style>
