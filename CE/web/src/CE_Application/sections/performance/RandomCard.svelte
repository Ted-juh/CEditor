<script>
  /**
   * One seeded random modulator. The preview is the real sequence for its seed (the same rolls
   * the engine makes), its range is dragged on the preview, and the character is four toggles.
   * Each character's own amount (glide, chaos, step size) appears only for that character.
   */
  import {
    setRandomModulator, resetRandomModulator, removeRandomModulator, deterministicRandomUnit,
  } from '../../stores/instrumentHost.js';
  import Segmented from '../../components/controls/Segmented.svelte';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import ModulatorCard from './ModulatorCard.svelte';
  import ModulatorScope from './ModulatorScope.svelte';
  import RateControl from './RateControl.svelte';

  let { random, onroute = () => {} } = $props();

  const W = 360, H = 96, PAD = 4, COUNT = 24;
  const CHARACTERS = [
    { value: 'sampleHold', label: 'Hold', title: 'Sample and hold: jump to a new value, hold it' },
    { value: 'smoothRandom', label: 'Glide', title: 'Smooth random: glide to each new value' },
    { value: 'chaos', label: 'Chaos', title: 'A logistic map: patterns that nearly repeat' },
    { value: 'randomWalk', label: 'Walk', title: 'A bounded walk: small steps up or down' },
  ];
  const AMOUNT = {
    smoothRandom: { key: 'smoothing', label: 'Glide' },
    chaos: { key: 'chaos', label: 'Chaos' },
    randomWalk: { key: 'stepSize', label: 'Step size' },
  };
  const modeLabel = (mode) => ({ sampleHold: 'Sample & hold', smoothRandom: 'Smooth random', chaos: 'Chaos', randomWalk: 'Bounded walk' })[mode] ?? 'Sample & hold';

  let draft = $state(null);
  const shown = $derived({ ...random, ...(draft ?? {}) });
  const set = (fields) => setRandomModulator(random.randomId, fields);

  // The engine's own rolls, from the seed: what you see is the sequence it will play.
  function previewValues(r) {
    let target = 0.5;
    let chaosValue = 0.05 + 0.9 * deterministicRandomUnit(r.seed, 0, 0x68bc21eb);
    let walkValue = 0.5;
    const values = [];
    for (let step = 0; step < COUNT; step += 1) {
      const changes = r.probability >= 1 || deterministicRandomUnit(r.seed, step, 0xa341316c) < r.probability;
      if (r.mode === 'chaos' && changes) {
        chaosValue = Math.max(0.0001, Math.min(0.9999, (3.57 + 0.43 * r.chaos) * chaosValue * (1 - chaosValue)));
        target = chaosValue;
      } else if (r.mode === 'randomWalk' && changes) {
        let walked = walkValue + (deterministicRandomUnit(r.seed, step, 0xad90777d) * 2 - 1) * r.stepSize;
        if (walked < 0) walked = -walked;
        if (walked > 1) walked = 2 - walked;
        walkValue = Math.max(0, Math.min(1, walked));
        target = walkValue;
      } else if (!['chaos', 'randomWalk'].includes(r.mode) && changes) {
        target = deterministicRandomUnit(r.seed, step, 0xc8013ea4);
      }
      values.push(r.minimum + target * (r.maximum - r.minimum));
    }
    return values;
  }
  const values = $derived(previewValues(shown));
  const y = (v) => PAD + (1 - v) * (H - PAD * 2);
  const x = (i) => (i * W) / (COUNT - 1);
  const path = $derived(values.map((v, i) => {
    const hold = i > 0 && shown.mode === 'sampleHold' ? `L${x(i)},${y(values[i - 1])} ` : '';
    return `${hold}${i ? 'L' : 'M'}${x(i)},${y(v)}`;
  }).join(' '));
  const liveStep = $derived(((Math.max(0, random.step) % COUNT) + COUNT) % COUNT);
  const playX = $derived(((liveStep + random.phase) * W) / COUNT);

  function reseed() {
    set({ seed: (Math.floor(Date.now() + Math.random() * 0x3fffffff) % 0x7ffffffe) + 1 });
  }
</script>

<ModulatorCard name={random.name} enabled={random.enabled} kind="random modulator" identity={JSON.stringify([random.randomId])}
               readout={`${modeLabel(random.mode)} · ${Math.round(random.value * 100)}%`} testid="random-card"
               onenable={(on) => set({ enabled: on })} onrename={(name) => set({ name })}
               onrestart={() => resetRandomModulator(random.randomId)} onremove={() => removeRandomModulator(random.randomId)}>
  <ModulatorScope {path} width={W} height={H} pad={PAD} minimum={random.minimum} maximum={random.maximum} bind:draft
                  playhead={playX} dot={{ x: playX, y: y(random.value) }}
                  label={`${random.name}: the sequence for seed ${random.seed}; drag the dashed lines to set its range`}
                  testid="random-scope" onrange={(fields) => set(fields)} />

  <div class="controls">
    <div class="field"><span class="lbl">Character</span>
      <Segmented options={CHARACTERS} value={random.mode} label="Character" testid="random-mode" onchange={(mode) => set({ mode })} /></div>
    <RateControl sync={random.sync} rateHz={random.rateHz} syncBeats={random.syncBeats} label="Decisions" testid="random-rate" onchange={set} />
    <div class="field"><span class="lbl">Chance</span>
      <ScrubValue value={Math.round(random.probability * 100)} min={0} max={100} unit="%" label="Chance each step changes"
                  testid="random-chance" onchange={(v) => set({ probability: v / 100 })} /></div>
    {#if AMOUNT[random.mode]}
      {@const amount = AMOUNT[random.mode]}
      <div class="field"><span class="lbl">{amount.label}</span>
        <ScrubValue value={Math.round(random[amount.key] * 100)} min={0} max={100} unit="%" label={amount.label}
                    testid="random-amount" onchange={(v) => set({ [amount.key]: v / 100 })} /></div>
    {/if}
  </div>
  <div class="controls">
    <div class="field"><span class="lbl">Seed</span>
      <span class="pair">
        <input class="seed" type="number" min="1" max="2147483647" step="1" value={random.seed} aria-label="Seed"
               onchange={(e) => set({ seed: Number(e.currentTarget.value) })} />
        <button type="button" class="ghost" onclick={reseed}>New seed</button>
      </span></div>
    <span class="step">step {Math.max(0, random.step) + 1}</span>
    <span class="spacer"></span>
    <button type="button" class="route" onclick={onroute}>Route in matrix →</button>
  </div>
</ModulatorCard>

<style>
  .controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: #8d969e; }
  .pair { display: inline-flex; align-items: center; gap: 6px; }
  .seed { width: 112px; font: 11px var(--host-font-mono, monospace); }
  .step { font: 11px var(--host-font-mono, monospace); color: #77838d; padding-bottom: 6px; }
  .spacer { flex: 1; }
  .route { border-color: #9b5e31; color: #f0b47d; white-space: nowrap; }
</style>
