<script>
  // Step Sequencer — steps, tempo, direction, and the track list.
  //
  // The tempo note is load-bearing and is written into the UI rather than left in a design doc:
  // this clock is WALL-CLOCK, so a sequence at 120 BPM runs at 120 BPM on its own and drifts
  // against a DAW's transport. Somebody will otherwise discover it during a take.
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { componentListWithElement } from '../utils/componentElements.js';
  import { STEP_DIRECTION, STEP_DIVISIONS } from '../utils/stepSequencerLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Grid3x3 from 'lucide-svelte/icons/grid-3x3';
  import Rows3 from 'lucide-svelte/icons/rows-3';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let q = $derived(getSection(control, 'StepSequencer'));
  let tracks = $derived(Array.isArray(q?.tracks) ? q.tracks : []);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `StepSequencer.${prop}`, value);
  }
  function setTracks(next) { set('tracks', next); }
  function addTrack() { setTracks(componentListWithElement('StepSequencer', 'tracks', tracks, q)); }
  function updateTrack(index, key, value) {
    setTracks(tracks.map((t, i) => (i === index ? { ...t, [key]: value } : t)));
  }
  function removeTrack(index) {
    const next = [...tracks];
    next.splice(index, 1);
    // Never down to nothing: a sequencer with no tracks is a grid with no rows, and there is no
    // control left on screen to add one back with.
    setTracks(next.length ? next : tracks);
  }
</script>

{#if q}
  <PropertySection title="Sequence" icon={Grid3x3}>
    <NumberCell label="Steps" min={1} max={64} step={1} value={q.steps ?? 16} onchange={(v) => set('steps', v)} />
    <NumberCell label="Tempo (BPM)" min={20} max={300} step={1} value={q.bpm ?? 120} onchange={(v) => set('bpm', v)} />
    <PropertyCell label="Division" span={2} hint="How many steps fill a beat.">
      <select class="val" value={q.division ?? '1/16'} onchange={(event) => set('division', event.target.value)}>
        {#each Object.keys(STEP_DIVISIONS) as division}<option value={division}>{division}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Direction" span={2} hint="Ping-pong turns at the ends without repeating them — repeating makes a 16-step pattern sound 30 steps long with two stutters in it.">
      <select class="val" value={q.direction ?? 'forward'} onchange={(event) => set('direction', event.target.value)}>
        {#each Object.values(STEP_DIRECTION) as direction}<option value={direction}>{direction}</option>{/each}
      </select>
    </PropertyCell>
    <NumberCell label="Gate %" min={1} max={99} step={1} value={q.gate ?? 60} onchange={(v) => set('gate', v)} />
    <NumberCell label="Beat line every" min={1} max={16} step={1} value={q.beatEvery ?? 4} onchange={(v) => set('beatEvery', v)} />
    <PropertyCell label="Running" span={2} hint="Starts the playhead in preview and in the exported plugin.">
      <PropertyToggle value={q.running === true} onchange={(next) => set('running', next)} />
    </PropertyCell>
    <PropertyCell label="" span={4} compact>
      <p class="tempo-note">The clock is wall-clock. This sequence runs at its own tempo and will
        drift against a DAW's transport — tempo-sync needs MIDI clock in, which does not exist yet.</p>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Tracks" icon={Rows3}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add track" onclick={addTrack}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="One row per track. The note is what the row sends; the colour is how its lit cells read." compact>
      <div class="tracks">
        {#each tracks as track, index (track.id ?? index)}
          <div class="track-row">
            <input
              class="val name" type="text" value={track.label ?? `Track ${index + 1}`}
              onchange={(event) => updateTrack(index, 'label', event.target.value)}
            />
            <input
              class="val num" type="number" min="0" max="127" value={track.note ?? 36}
              title="Note"
              onchange={(event) => updateTrack(index, 'note', Number(event.target.value))}
            />
            <input
              class="val num" type="number" min="1" max="16" value={track.channel ?? 10}
              title="Channel"
              onchange={(event) => updateTrack(index, 'channel', Number(event.target.value))}
            />
            <button
              type="button" class="mute" class:on={track.muted === true} title="Mute"
              onclick={() => updateTrack(index, 'muted', !(track.muted === true))}
            >M</button>
            <button type="button" class="remove" title="Remove" onclick={() => removeTrack(index)}>×</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Colours" icon={Palette}>
    <PropertyCell label="" span={4} compact>
      <SwatchCluster swatches={[
        { key: 'cellColour', label: 'Cell', value: q.cellColour ?? 'FF1E1E24', target: { type: 'control', controlId: core?.id, path: 'StepSequencer.cellColour' } },
        { key: 'cellOnColour', label: 'On', value: q.cellOnColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'StepSequencer.cellOnColour' } },
        { key: 'playheadColour', label: 'Playhead', value: q.playheadColour ?? '885B9BD5', target: { type: 'control', controlId: core?.id, path: 'StepSequencer.playheadColour' } },
        { key: 'gridColour', label: 'Beat lines', value: q.gridColour ?? 'FF2E2E36', target: { type: 'control', controlId: core?.id, path: 'StepSequencer.gridColour' } },
        { key: 'labelColour', label: 'Labels', value: q.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'StepSequencer.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .tempo-note { color: #F2C94C; font-size: 10.5px; line-height: 1.5; margin: 0; }
  .tracks { display: flex; flex-direction: column; gap: 4px; }
  .track-row { display: flex; align-items: center; gap: 4px; }
  .track-row .name { flex: 1; min-width: 0; }
  .track-row .num { flex: 0 0 54px; text-align: right; }
  .mute, .remove {
    background: #262630; border: 1px solid #3A3A44; border-radius: 3px; color: #999;
    font-family: inherit; font-size: 10px; padding: 2px 6px; cursor: pointer;
  }
  .mute.on { background: #6A3A3A; border-color: #8A4A4A; color: #FFD; }
  .remove:hover { color: #E57373; }
</style>
