<script>
  // SnapshotsTab — capture the panel, recall it, blend between two, compare, randomise.
  //
  // One tab rather than four, because they are one capability: a snapshot is the unit all of them
  // operate on. Capture makes one, recall writes one back, morph blends two, Compare diffs two (or
  // one against what is on screen), and the randomiser generates a value map whose undo is — of
  // course — a snapshot taken first.
  //
  // THE MATHS IS NOT HERE. `utils/snapshotModel.js` decides how a value blends and
  // `utils/randomizer.js` decides what a legal random value is; both are pure and tested. This is
  // the surface, and the one thing it owns is the morph slider's live drive, which is where the
  // send budget matters.

  import Camera from 'lucide-svelte/icons/camera';
  import Dices from 'lucide-svelte/icons/dices';
  import GitCompare from 'lucide-svelte/icons/git-compare';
  import Lock from 'lucide-svelte/icons/lock';
  import Trash2 from 'lucide-svelte/icons/trash-2';

  import { activePanel } from '../stores/panels.js';
  import {
    applyValues, captureSnapshot, compareSnapshots, compareWithLive, morphTo,
    panelSnapshots, readPanelValues, recallSnapshot, removeSnapshot, renameSnapshot,
    snapshotParameters,
  } from '../stores/snapshots.js';
  import { RANDOMIZE_MODE, randomizeValues, seededRandom } from '../utils/randomizer.js';
  import { cinfo, cwarn } from '../stores/console.js';

  let snapshots = $derived(panelSnapshots($activePanel));
  let parameters = $derived(snapshotParameters($activePanel));
  let groups = $derived([...new Set(parameters.map((p) => String(p.group ?? p.controlName ?? '')).filter(Boolean))].sort());

  let newName = $state('');
  let morphFrom = $state('');
  let morphTo_ = $state('');
  let morphPosition = $state(0);
  let morphDeferred = $state(0);
  let comparison = $state(null);

  let randomMode = $state(RANDOMIZE_MODE.humanize);
  let randomScope = $state('');
  let randomSeed = $state('');
  // Locks are per session rather than saved: they are "leave this alone while I roll the dice",
  // which is a state of mind for the next thirty seconds, not a property of the panel.
  let locked = $state(new Set());

  function doCapture() {
    const snapshot = captureSnapshot({ name: newName.trim() || `Snapshot ${snapshots.length + 1}` });
    if (snapshot) newName = '';
  }

  function driveMorph(position) {
    morphPosition = position;
    if (!morphFrom || !morphTo_) return;
    const result = morphTo(morphFrom, morphTo_, position);
    morphDeferred = result.deferred;
  }

  function toggleLock(id) {
    const next = new Set(locked);
    if (next.has(id)) next.delete(id); else next.add(id);
    locked = next;
  }

  /**
   * Roll the dice, having first taken the undo.
   *
   * The snapshot is captured BEFORE anything is written, and that ordering is the whole undo story:
   * a randomiser people are afraid of is one nobody uses.
   */
  function doRandomize() {
    const panel = $activePanel;
    if (!panel) return;

    const before = captureSnapshot({ name: 'Before randomise' });
    if (!before) cwarn('[random] Could not take an undo snapshot — nothing on this panel has a value yet.');

    const result = randomizeValues(parameters, {
      mode: randomMode,
      locked,
      groups: randomMode === RANDOMIZE_MODE.scoped && randomScope ? [randomScope] : null,
      current: readPanelValues(panel, parameters),
      random: randomSeed.trim() ? seededRandom(Number(randomSeed.trim())) : Math.random,
    });

    if (result.changed === 0) { cwarn('[random]', result.reason); return; }
    applyValues(result.values, { panel, parameters });
    cinfo(`[random] ${result.changed} parameter(s) changed`
      + `${result.skipped.locked.length ? `, ${result.skipped.locked.length} locked` : ''}`
      + `${randomSeed.trim() ? `, seed ${randomSeed.trim()}` : ''}.`);
  }

  function compare(mode) {
    comparison = mode === 'live' ? compareWithLive(morphFrom) : compareSnapshots(morphFrom, morphTo_);
    if (!comparison) cwarn('[compare] Pick a snapshot first.');
  }

  const shortValue = (value) => (typeof value === 'number' ? Number(value.toFixed(3)) : value);
</script>

<div class="snapshots-tab">
  {#if !$activePanel}
    <p class="empty">No panel open.</p>
  {:else}
    <section class="block">
      <div class="block-head"><Camera size={13} /><span>Capture</span></div>
      <div class="row">
        <input class="field" placeholder="Snapshot name" bind:value={newName}
               onkeydown={(e) => { if (e.key === 'Enter') doCapture(); }} />
        <button class="btn primary" onclick={doCapture}>Capture</button>
      </div>
      <p class="note">
        Records every parameter that has a value. A control nobody has touched is left out — a
        snapshot full of zeroes would recall the panel to zero rather than to where it was.
      </p>
    </section>

    <section class="block">
      <div class="block-head"><span>Snapshots ({snapshots.length})</span></div>
      {#if snapshots.length === 0}
        <p class="empty">None yet.</p>
      {:else}
        <ul class="list">
          {#each snapshots as snapshot (snapshot.id)}
            <li class="item">
              <input class="field name" value={snapshot.name}
                     onchange={(e) => renameSnapshot(snapshot.id, e.currentTarget.value)} />
              <span class="count">{Object.keys(snapshot.values).length} params</span>
              <button class="btn" onclick={() => recallSnapshot(snapshot.id)}>Recall</button>
              <button class="btn icon" title="Delete" onclick={() => removeSnapshot(snapshot.id)}>
                <Trash2 size={12} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if snapshots.length >= 2}
      <section class="block">
        <div class="block-head"><span>Morph</span></div>
        <div class="row">
          <select class="field" bind:value={morphFrom}>
            <option value="">from…</option>
            {#each snapshots as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
          <select class="field" bind:value={morphTo_}>
            <option value="">to…</option>
            {#each snapshots as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </div>
        <input class="slider" type="range" min="0" max="1" step="0.005" value={morphPosition}
               oninput={(e) => driveMorph(Number(e.currentTarget.value))} />
        <p class="note">
          {(morphPosition * 100).toFixed(0)}%.
          <!-- Said rather than hidden: a rate-limited morph looks steppy, and the user should know
               it is the cable rather than the program. -->
          {#if morphDeferred > 0}
            <strong>{morphDeferred}</strong> parameter(s) held back this tick to stay inside the MIDI
            send budget — a morph this wide will sweep more slowly than the slider.
          {:else}
            Continuous parameters blend; selectors and toggles snap at the halfway point, because
            there is no value between two waveforms.
          {/if}
        </p>
        <div class="row">
          <button class="btn" onclick={() => compare('pair')}><GitCompare size={12} /> Compare A/B</button>
          <button class="btn" onclick={() => compare('live')}><GitCompare size={12} /> Compare A with live</button>
        </div>
      </section>
    {/if}

    {#if comparison}
      <section class="block">
        <div class="block-head">
          <span>{comparison.a.name} → {comparison.b.name}</span>
          <button class="btn icon" onclick={() => (comparison = null)}>×</button>
        </div>
        <p class="note">
          {comparison.changed.length} changed, {comparison.same} identical,
          {comparison.onlyInA.length + comparison.onlyInB.length} in only one side.
        </p>
        {#if comparison.changed.length}
          <table class="diff">
            <thead><tr><th>Parameter</th><th>From</th><th>To</th><th>Δ</th></tr></thead>
            <tbody>
              {#each comparison.changed.slice(0, 40) as row (row.id)}
                <tr>
                  <td>{row.parameter?.label ?? row.id}</td>
                  <td>{shortValue(row.from)}</td>
                  <td>{shortValue(row.to)}</td>
                  <td class="delta">{(row.magnitude * 100).toFixed(0)}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if comparison.changed.length > 40}
            <p class="note">…and {comparison.changed.length - 40} more, smaller changes.</p>
          {/if}
        {/if}
      </section>
    {/if}

    <section class="block">
      <div class="block-head"><Dices size={13} /><span>Randomise</span></div>
      <div class="row">
        <div class="seg">
          {#each [[RANDOMIZE_MODE.humanize, 'Humanize'], [RANDOMIZE_MODE.full, 'Full'], [RANDOMIZE_MODE.scoped, 'Scoped']] as [mode, label] (mode)}
            <button class={['seg-btn', randomMode === mode && 'seg-active']}
                    onclick={() => (randomMode = mode)}>{label}</button>
          {/each}
        </div>
        {#if randomMode === RANDOMIZE_MODE.scoped}
          <select class="field" bind:value={randomScope}>
            <option value="">pick a group…</option>
            {#each groups as group (group)}<option value={group}>{group}</option>{/each}
          </select>
        {/if}
        <input class="field seed" placeholder="seed (optional)" bind:value={randomSeed} />
        <button class="btn primary" onclick={doRandomize}>Roll</button>
      </div>
      <p class="note">
        Only ever writes values the profile says are legal, and takes an undo snapshot first.
        A seed makes the same roll repeatable — write it down and somebody else gets your patch.
      </p>

      {#if parameters.length}
        <div class="locks">
          <span class="locks-head"><Lock size={11} /> {locked.size} locked</span>
          {#each parameters.slice(0, 60) as parameter (parameter.id)}
            <button class={['lock-chip', locked.has(parameter.id) && 'lock-on']}
                    onclick={() => toggleLock(parameter.id)}>{parameter.label ?? parameter.id}</button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .snapshots-tab { padding: 10px; overflow-y: auto; height: 100%; color: #C8C8C8; font-size: 12px; }
  .empty { color: #777; font-size: 12px; }

  .block { border: 1px solid #333; border-radius: 6px; padding: 9px 10px; margin-bottom: 10px; background: #262626; }
  .block-head {
    display: flex; align-items: center; gap: 6px; color: #5B9BD5; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 7px;
  }
  .block-head span:first-of-type { flex: 1; }

  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .field {
    background: #1A1A1A; border: 1px solid #3A3A3A; border-radius: 4px; color: #DDD;
    font-family: inherit; font-size: 12px; padding: 3px 6px; min-width: 0; flex: 1;
  }
  .field:focus { outline: none; border-color: #5B9BD5; }
  .field.name { flex: 2; }
  .field.seed { flex: 0 0 96px; }

  .btn {
    display: inline-flex; align-items: center; gap: 4px;
    background: #383F47; border: 1px solid #4C555E; border-radius: 4px; color: #DDD;
    font-family: inherit; font-size: 11px; padding: 3px 9px; cursor: pointer; white-space: nowrap;
  }
  .btn:hover { background: #454E57; color: #FFF; }
  .btn.primary { background: #3A5A80; border-color: #4A72A0; color: #FFF; }
  .btn.icon { padding: 3px 6px; }

  .seg { display: inline-flex; border: 1px solid #3A3A3A; border-radius: 4px; overflow: hidden; }
  .seg-btn {
    background: #1A1A1A; border: none; color: #AAA; font-family: inherit; font-size: 11px;
    padding: 3px 9px; cursor: pointer;
  }
  .seg-btn:hover { color: #FFF; }
  .seg-active { background: #3A5A80; color: #FFF; }

  .list { list-style: none; margin: 0; padding: 0; }
  .item { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
  .count { color: #777; font-size: 10px; white-space: nowrap; }

  .slider { width: 100%; margin: 4px 0; }

  .note { color: #8A8A8A; font-size: 11px; line-height: 1.45; margin: 4px 0 0; }
  .note strong { color: #D8A657; }

  .diff { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  .diff th, .diff td { border-bottom: 1px solid #333; padding: 3px 5px; text-align: left; }
  .diff th { color: #999; font-weight: 600; }
  .delta { color: #D8A657; text-align: right; }

  .locks { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; align-items: center; }
  .locks-head { display: inline-flex; align-items: center; gap: 3px; color: #777; font-size: 10px; margin-right: 4px; }
  .lock-chip {
    background: #1E1E1E; border: 1px solid #3A3A3A; border-radius: 3px; color: #999;
    font-family: inherit; font-size: 10px; padding: 2px 6px; cursor: pointer;
  }
  .lock-chip:hover { color: #DDD; }
  .lock-on { background: #4A3A2A; border-color: #7A5A3A; color: #E8C08A; }
</style>
