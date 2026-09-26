<script>
  /**
   * Velocity & Expression: the curve is the control. One picture per message, the notes you
   * play travelling through it as dots, and "learn my touch" to set the used range from your
   * own playing. A calibration can be saved as a profile for the keyboard it belongs to; a new
   * Velocity module starts from the profile of the keyboard that is connected (the host picks
   * it, see InstrumentHostService addMidiSlot).
   */
  import { untrack } from 'svelte';
  import ResponseCurvePicture from './ResponseCurvePicture.svelte';
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import { RESPONSE_PROFILE_FIELDS } from '../../stores/instrumentHost.js';

  let {
    fx, set, identity = '', profiles = [], portProfile = '', activity = { touch: [], seq: 0 },
    onsaveprofile = () => {}, onremoveprofile = () => {},
  } = $props();

  let which = $state('velocity');
  const SHAPES = [
    { value: 'linear', label: 'linear' }, { value: 'soft', label: 'soft', title: 'Soft touch: quiet playing comes out louder' },
    { value: 'hard', label: 'hard', title: 'Hard touch: you have to play harder to get loud' },
    { value: 's curve', label: 'S', title: 'Gentle at both ends, quick in the middle' },
    { value: 'custom', label: 'custom', title: 'Your own nine points' },
  ];
  const SOURCES = [
    { value: 'cc', label: 'CC' }, { value: 'channel pressure', label: 'channel AT', title: 'Channel aftertouch' },
    { value: 'poly aftertouch', label: 'poly AT', title: 'Polyphonic aftertouch' },
  ];

  // --- live dots and learning, from the touch readout ------------------------------------------
  let dots = $state([]);
  let now = $state(0);
  let learn = $state(null);   // { which, lo, hi, n } while listening
  let nextId = 0;
  const matches = (t, kind) => {
    if (kind === 'velocity') return t[0] === 0;
    if (fx.expressionSource === 'cc') return t[0] === 1 && t[1] === fx.expressionCc;
    return fx.expressionSource === 'channel pressure' ? t[0] === 2 : t[0] === 3;
  };
  let lastSeq = -1;
  $effect(() => {
    const seq = activity?.seq ?? 0;
    const touch = activity?.touch ?? [];
    untrack(() => {
      if (seq === lastSeq) return;
      lastSeq = seq;
      const at = performance.now();
      const fresh = [];
      for (const t of touch) {
        if (!matches(t, which)) continue;
        fresh.push({ id: nextId++, v: t[2], at });
        if (learn && learn.which === which && (which !== 'velocity' || t[2] > 0)) {
          learn = { ...learn, lo: Math.min(learn.lo, t[2]), hi: Math.max(learn.hi, t[2]), n: learn.n + 1 };
        }
      }
      if (fresh.length) {
        dots = [...dots.filter((d) => at - d.at < 2500), ...fresh].slice(-40);
        now = at;
        tick();
      }
    });
  });
  let raf = 0;
  function tick() {
    if (raf || typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      now = performance.now();
      raf = dots.some((d) => now - d.at < 2500) ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  }

  const keys = (w) => (w === 'velocity'
    ? { curve: 'velocityCurve', points: 'velocityCurveValues', inputMin: 'velocityInputMin', inputMax: 'velocityInputMax',
        outputMin: 'velocityOutputMin', outputMax: 'velocityOutputMax' }
    : { curve: 'expressionCurve', points: 'expressionCurveValues', inputMin: 'expressionInputMin', inputMax: 'expressionInputMax',
        outputMin: 'expressionOutputMin', outputMax: 'expressionOutputMax' });
  const write = (w, shape) => {
    const k = keys(w);
    set(Object.fromEntries(Object.entries(shape).map(([name, value]) => [k[name], value])));
  };

  function toggleLearn() {
    if (!learn) { learn = { which, lo: 127, hi: 0, n: 0 }; return; }
    const done = learn;
    learn = null;
    // A range needs a few notes and some spread; a single stray hit is not your touch.
    if (done.n >= 3 && done.hi - done.lo >= 8) {
      const k = keys(done.which);
      const floor = done.which === 'velocity' ? 1 : 0;
      set({ [k.inputMin]: Math.max(floor, done.lo), [k.inputMax]: done.hi });
      learned = `Set from ${done.n} ${done.which === 'velocity' ? 'notes' : 'moves'}: ${done.lo}–${done.hi}.`;
    } else {
      learned = 'Not enough to go on: play at least three notes, soft to hard.';
    }
  }
  let learned = $state('');

  // --- profiles --------------------------------------------------------------------------------
  let saving = $state(null);   // { name, portHint } while the save form is open
  const applyProfile = (p) => set({
    ...Object.fromEntries(RESPONSE_PROFILE_FIELDS.map((key) => [key, p[key]])), responseProfileName: p.name,
  });
  function saveProfile() {
    const name = saving.name.trim();
    if (!name) return;
    onsaveprofile(name, saving.portHint.trim(), fx);
    set({ responseProfileName: name });
    saving = null;
  }
  const focusSelect = (node) => { node.focus(); node.select(); };
</script>

<div class="editor" data-testid="response-editor">
  <div class="row">
    <Segmented options={[{ value: 'velocity', label: 'Velocity' }, { value: 'expression', label: 'Expression' }]}
               value={which} label="Which response" testid="response-which" onchange={(v) => { which = v; learn = null; }} />
    <span class="sub">{which === 'velocity' ? 'how hard each note arrives' : 'aftertouch or a controller, reshaped'}</span>
  </div>

  <div class="panel" style:display={which === 'velocity' ? 'flex' : 'none'} data-testid="response-velocity">
    <div class="row">
      <div class="mf"><span class="lbl">Shape</span>
        <Segmented options={SHAPES} value={fx.velocityCurve} label="Velocity shape" testid="velocity-shape"
                   onchange={(v) => set({ velocityCurve: v })} />
      </div>
    </div>
    <ResponseCurvePicture label="Velocity" floor={1} testid="velocity-curve" {now}
                          curve={fx.velocityCurve} points={fx.velocityCurveValues}
                          inputMin={fx.velocityInputMin} inputMax={fx.velocityInputMax}
                          outputMin={fx.velocityOutputMin} outputMax={fx.velocityOutputMax}
                          dots={which === 'velocity' ? dots : []} onchange={(shape) => write('velocity', shape)} />
    <div class="row">
      <div class="mf"><span class="lbl">Fixed</span>
        <ScrubValue value={fx.velocityFixed} min={0} max={127} label="Fixed velocity" testid="velocity-fixed"
                    format={(v) => (v === 0 ? 'off' : String(v))} title="Every note at this velocity; off plays the curve"
                    onchange={(v) => set({ velocityFixed: v })} />
      </div>
      <div class="mf"><span class="lbl">Scale</span>
        <ScrubValue value={Math.round(fx.velocityScale * 100)} min={10} max={200} step={5} unit="%" label="Velocity scale"
                    testid="velocity-scale" onchange={(v) => set({ velocityScale: v / 100 })} />
      </div>
    </div>
  </div>

  <div class="panel" style:display={which === 'expression' ? 'flex' : 'none'} data-testid="response-expression">
    <div class="row">
      <div class="mf"><span class="lbl">Reshape</span>
        <PropertyToggle compact label={fx.expressionEnabled ? 'On' : 'Off'} value={fx.expressionEnabled}
                        ariaLabel="Expression response mapping" onchange={(on) => set({ expressionEnabled: on })} />
      </div>
      <div class="mf"><span class="lbl">Message</span>
        <Segmented options={SOURCES} value={fx.expressionSource} label="Expression message" testid="expression-source"
                   onchange={(v) => set({ expressionSource: v })} />
      </div>
      {#if fx.expressionSource === 'cc'}
        <div class="mf"><span class="lbl">CC</span>
          <ScrubValue value={fx.expressionCc} min={0} max={127} label="Expression CC" testid="expression-cc"
                      onchange={(v) => set({ expressionCc: v })} />
        </div>
      {/if}
      <div class="mf"><span class="lbl">Shape</span>
        <Segmented options={SHAPES} value={fx.expressionCurve} label="Expression shape" testid="expression-shape"
                   onchange={(v) => set({ expressionCurve: v })} />
      </div>
    </div>
    <ResponseCurvePicture label="Expression" floor={0} testid="expression-curve" {now}
                          curve={fx.expressionCurve} points={fx.expressionCurveValues}
                          inputMin={fx.expressionInputMin} inputMax={fx.expressionInputMax}
                          outputMin={fx.expressionOutputMin} outputMax={fx.expressionOutputMax}
                          dots={which === 'expression' ? dots : []} onchange={(shape) => write('expression', shape)} />
    <span class="sub">Only this message is reshaped. Put the MPE Transformer before or after this module when the format has to change too.</span>
  </div>

  <div class="row">
    <button type="button" class="ctl pill" class:armed={learn} data-testid="response-learn" onclick={toggleLearn}>
      {learn ? '■ done' : '● learn my touch'}</button>
    <span class="sub" data-testid="response-learn-text">
      {#if learn}Listening… {learn.n ? `softest ${learn.lo}, hardest ${learn.hi} (${learn.n})` : 'play from your softest to your hardest'}
      {:else if learned}{learned}
      {:else}Drag the points and the band edges. Orange dots are what you play.{/if}
    </span>
  </div>

  <div class="mf"><span class="lbl">Keyboard profile</span>
    <div class="profiles" data-testid="response-profiles">
      {#each profiles as p (p.name)}
        <span class="profile" class:current={fx.responseProfileName === p.name}>
          <button type="button" class="ctl chip" class:connected={portProfile === p.name} data-name={p.name}
                  title={`Use this calibration${p.portHint ? ` (for ports named “${p.portHint}”)` : ''}`}
                  onclick={() => applyProfile(p)}>{p.name}{#if portProfile === p.name}<small> · connected</small>{/if}</button>
          <HostConfirmButton title={`Remove the profile “${p.name}”`} identity={JSON.stringify([identity, p.name])}
                             type="button" class="ctl x" onclick={() => onremoveprofile(p.name)}>×</HostConfirmButton>
        </span>
      {/each}
      {#if saving}
        <span class="save" data-testid="response-save-form">
          <input type="text" aria-label="Profile name" placeholder="Name" bind:value={saving.name} use:focusSelect
                 onkeydown={(e) => { if (e.key === 'Enter') saveProfile(); if (e.key === 'Escape') saving = null; }} />
          <input type="text" aria-label="Keyboard port name" placeholder="Port name contains… e.g. CTRL49"
                 bind:value={saving.portHint} onfocus={(e) => e.currentTarget.select()}
                 onkeydown={(e) => { if (e.key === 'Enter') saveProfile(); if (e.key === 'Escape') saving = null; }} />
          <button type="button" class="ctl pill" onclick={saveProfile} disabled={!saving.name.trim()}>Save</button>
          <button type="button" class="ctl pill" onclick={() => (saving = null)}>Cancel</button>
        </span>
      {:else}
        <button type="button" class="ctl chip add" data-testid="response-save"
                onclick={() => (saving = { name: fx.responseProfileName || '', portHint: '' })}>+ save as profile</button>
      {/if}
    </div>
    <span class="sub">A profile holds the curves and ranges for one keyboard. With a port name, a new Velocity module starts from it whenever that keyboard is connected.</span>
  </div>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 12px; width: 100%; }
  .panel { flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub { font-size: 11px; color: var(--host-text-faint, #65717c); max-width: 620px; }
  .pill, .chip { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
                 background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; }
  .pill:hover, .chip:hover { border-color: var(--host-accent, #5b9bd5); }
  .pill:disabled { opacity: .45; cursor: default; }
  .pill.armed { color: #d9a13c; border-color: #d9a13c; }
  .chip.add { border-style: dashed; }
  .chip small { color: #ff9408; }
  .chip.connected { border-color: #6b4a1c; }
  .profiles { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .profile { display: inline-flex; align-items: center; }
  .profile.current .chip { color: var(--host-accent-strong, #79b9ee); border-color: var(--host-accent, #5b9bd5); background: var(--host-accent-surface, #243746); }
  :global(.profile .x.ctl) { background: none; border: 0; color: var(--host-text-dim, #7f8b96); cursor: pointer; padding: 0 4px; font-size: 13px; }
  .save { display: inline-flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .save input { font: 12px var(--host-font, sans-serif); color: var(--host-text, #d9e0e6); background: var(--host-bg-deep, #101418);
                border: 1px solid var(--host-line, #3b4652); border-radius: 3px; padding: 4px 7px; width: 170px; }
  .save input + input { width: 230px; }
</style>
