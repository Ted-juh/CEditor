<script>
  /**
   * One MIDI LFO: the wave drawn as it runs (two cycles, squeezed into its range, shifted by its
   * phase), shapes as pictures, the rate free or synced, and the range dragged on the wave
   * itself. Hardware outputs sit below: CC, NRPN or SysEx to a hardware part.
   */
  import {
    setMidiLfo, resetMidiLfo, removeMidiLfo, addMidiLfoOutput, setMidiLfoOutput, removeMidiLfoOutput,
  } from '../../stores/instrumentHost.js';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import Segmented from '../../components/controls/Segmented.svelte';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import ModulatorCard from './ModulatorCard.svelte';
  import ModulatorScope from './ModulatorScope.svelte';
  import RateControl from './RateControl.svelte';
  import { LFO_SHAPES, lfoIconPath, lfoPath } from '../../utils/modulatorShapes.js';

  let { lfo, hardwareParts = [], onroute = () => {} } = $props();

  const W = 360, H = 96, PAD = 4, CYCLES = 2;
  const SHAPES = LFO_SHAPES.map((shape) => ({ ...shape, path: lfoIconPath(shape.value), iconOnly: true }));
  const PROTOCOLS = [
    { value: 'cc', label: 'CC', title: 'Control change, 0-127' },
    { value: 'nrpn', label: 'NRPN', title: 'NRPN, 14-bit' },
    { value: 'sysex', label: 'SysEx', title: 'A SysEx message built from a template' },
  ];
  const CHANNELS = Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)]);

  let draft = $state(null);
  const shown = $derived({ ...lfo, ...(draft ?? {}) });
  const path = $derived(lfoPath(shown, W, H, { cycles: CYCLES, pad: PAD }));
  // The live phase includes the offset; the picture's time axis does not.
  const dot = $derived({
    x: ((((lfo.phase - lfo.phaseOffset) % 1) + 1) % 1) * (W / CYCLES),
    y: PAD + (1 - lfo.value) * (H - PAD * 2),
  });
  const set = (fields) => setMidiLfo(lfo.lfoId, fields);

  function addHardwareOutput() {
    const target = hardwareParts[0];
    if (!target) return;
    addMidiLfoOutput(lfo.lfoId, { type: 'cc', targetPartId: target.partId, channel: target.midiOutChannel || 1, number: 1 });
  }
</script>

<ModulatorCard name={lfo.name} enabled={lfo.enabled} kind="LFO" identity={JSON.stringify([lfo.lfoId])}
               readout={`${Math.round(lfo.value * 100)}%`} testid="lfo-card"
               onenable={(on) => set({ enabled: on })} onrename={(name) => set({ name })}
               onrestart={() => resetMidiLfo(lfo.lfoId)} onremove={() => removeMidiLfo(lfo.lfoId)}>
  <ModulatorScope {path} width={W} height={H} pad={PAD} minimum={lfo.minimum} maximum={lfo.maximum} bind:draft
                  {dot} label={`${lfo.name}: the wave over two cycles; drag the dashed lines to set its range`}
                  testid="lfo-scope" onrange={(fields) => set(fields)} />

  <div class="controls">
    <div class="field"><span class="lbl">Shape</span>
      <Segmented options={SHAPES} value={lfo.shape} label="LFO shape" testid="lfo-shape" onchange={(shape) => set({ shape })} />
    </div>
    <RateControl sync={lfo.sync} rateHz={lfo.rateHz} syncBeats={lfo.syncBeats} testid="lfo-rate" onchange={set} />
    <div class="field"><span class="lbl">Phase</span>
      <ScrubValue value={Math.round(lfo.phaseOffset * 360)} min={0} max={355} step={5} fineStep={1} unit="°"
                  label="Phase offset" testid="lfo-phase" onchange={(deg) => set({ phaseOffset: deg / 360 })} />
    </div>
    <span class="spacer"></span>
    <button type="button" class="route" onclick={onroute}>Route in matrix →</button>
  </div>

  <div class="midi-head">
    <div><strong>Hardware MIDI</strong><span>Outputs are added muted and must be switched on.</span></div>
    <button type="button" class="ghost" disabled={hardwareParts.length === 0}
            title={hardwareParts.length === 0 ? 'Add a hardware part first' : 'Add a MIDI output'}
            onclick={addHardwareOutput}>+ Output</button>
  </div>
  {#if lfo.outputs.length === 0}
    <div class="empty">
      {hardwareParts.length === 0
        ? 'Add a hardware part to make CC, NRPN or SysEx destinations available.'
        : 'No direct hardware output. Matrix routes still work.'}
    </div>
  {:else}
    <div class="outputs">
      {#each lfo.outputs as output (output.outputId)}
        {@const setOut = (fields) => setMidiLfoOutput(lfo.lfoId, output.outputId, fields)}
        <div class="output" class:unresolved={!output.resolved} data-testid="lfo-output">
          <button type="button" class="ctl power" class:on={output.enabled} aria-pressed={output.enabled}
                  title={output.enabled ? 'Mute output' : 'Switch output on'}
                  onclick={() => setOut({ enabled: !output.enabled })}>{output.enabled ? '●' : '○'}</button>
          <Segmented options={PROTOCOLS} value={output.type} label="Protocol" onchange={(type) => setOut({ type })} />
          <select class="target" value={output.targetPartId} aria-label="Hardware part"
                  onchange={(e) => setOut({ targetPartId: e.currentTarget.value })}>
            {#each hardwareParts as part (part.partId)}
              <option value={part.partId}>{part.midiOutputName || part.pluginName || 'Hardware part'}</option>
            {/each}
          </select>
          {#if output.type !== 'sysex'}
            <span class="pair"><span class="lbl">Ch</span>
              <ScrubValue value={output.channel} choices={CHANNELS} label="MIDI channel" pixelsPerStep={8}
                          onchange={(channel) => setOut({ channel })} /></span>
            <span class="pair"><span class="lbl">{output.type === 'nrpn' ? 'NRPN' : 'CC'}</span>
              <ScrubValue value={output.number} min={0} max={output.type === 'nrpn' ? 16383 : 127}
                          label={output.type === 'nrpn' ? 'NRPN number' : 'CC number'}
                          onchange={(number) => setOut({ number })} /></span>
          {:else}
            <input class="sysex" value={output.sysexTemplate} spellcheck="false"
                   aria-label="SysEx template" title="Use {'{value7}'}, {'{valueMSB}'} and {'{valueLSB}'} where the value goes"
                   onchange={(e) => setOut({ sysexTemplate: e.currentTarget.value })} />
          {/if}
          {#if !output.resolved}<span class="missing">Unresolved</span>{/if}
          <HostConfirmButton identity={JSON.stringify([lfo.lfoId, output.outputId])} aria-label="Remove MIDI LFO output"
                             title="Remove output" onclick={() => removeMidiLfoOutput(lfo.lfoId, output.outputId)}>×</HostConfirmButton>
        </div>
      {/each}
    </div>
  {/if}
</ModulatorCard>

<style>
  .controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: #8d969e; }
  .spacer { flex: 1; }
  .route { border-color: #9b5e31; color: #f0b47d; white-space: nowrap; }
  .midi-head { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid #2d343a; }
  .midi-head > div { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .midi-head span { color: #737f89; font-size: 11px; }
  .empty { color: #717c86; font-size: 11px; }
  .outputs { display: flex; flex-direction: column; gap: 6px; }
  .output { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px; border: 1px solid #30373d; background: #14181b; }
  .output.unresolved { border-color: #744d42; }
  .power { min-width: 28px; min-height: 26px; padding: 2px 6px; border-radius: 3px; cursor: pointer;
           color: #737e87; background: transparent; border: 1px solid #3b434a; }
  .power.on { color: #efad70; border-color: #8f5a35; }
  .target { width: auto; min-width: 130px; flex: 1; }
  .pair { display: inline-flex; align-items: center; gap: 5px; }
  .sysex { flex: 1; min-width: 220px; font: 11px var(--host-font-mono, monospace); }
  .missing { color: #da8d78; font-size: 10px; text-transform: uppercase; }
</style>
