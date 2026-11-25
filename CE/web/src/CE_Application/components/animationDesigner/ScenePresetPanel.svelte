<script>
  /**
   * Putting a scene preset on this panel (utils/scenePreset.js): a control for each of its slots, or —
   * for a preset of one control that nothing on a control starts — every control that fits, each a
   * little after the last. What it makes is an ordinary new scene.
   */
  import { canRepeat, candidatesFor, defaultMapping, repeatedScene, sceneFromPreset, REPEAT_STAGGER } from '../../utils/scenePreset.js';

  let { preset, controls = [], mine = false, onadd = () => {}, onremove = () => {}, oncancel = () => {} } = $props();

  const idOf = (control) => control?._children?.Core?.id ?? '';
  const nameOf = (control) => String(control?._children?.Core?.name || idOf(control));

  let repeatable = $derived(canRepeat(preset));
  let repeat = $state(true);
  let stagger = $state(REPEAT_STAGGER);
  let mapping = $state([]);
  let reason = $state('');
  let shownId = '';
  $effect(() => {
    if (preset?.id === shownId) return;
    shownId = preset?.id ?? '';
    mapping = defaultMapping(preset, controls);
    repeat = canRepeat(preset);
    reason = '';
  });
  let takers = $derived(repeatable ? candidatesFor(preset.slots[0], controls) : []);
  let what = $derived(preset?.slots?.[0]?.needs?.value ? 'knob, slider, Macro or meter' : preset?.slots?.[0]?.needs?.text ? 'control with words' : 'control');

  function setSlot(index, controlId) {
    mapping = mapping.map((entry, i) => (i === index ? controlId : entry));
    reason = '';
  }
  function add() {
    const result = repeatable && repeat ? repeatedScene(preset, controls, { stagger }) : sceneFromPreset(preset, mapping, controls);
    if (result.reason) { reason = result.reason; return; }
    onadd(result.scene);
  }
</script>

{#if preset}
  <div class="sp" data-scene-preset-apply={preset.id}>
    <div class="top">
      <b>{preset.name}</b>
      <span>{preset.clips.length} {preset.clips.length === 1 ? 'clip' : 'clips'}, {preset.slots.length} {preset.slots.length === 1 ? 'control' : 'controls'}</span>
    </div>
    {#if repeatable}
      <label class="opt"><input type="radio" name={`sp-${preset.id}`} checked={repeat} data-preset-repeat onchange={() => { repeat = true; reason = ''; }} />
        On every {what} that fits ({takers.length})</label>
      {#if repeat}
        <label class="row">Each
          <input class="num" type="number" min="0" max="2000" step="10" value={stagger} aria-label="Milliseconds between controls" data-preset-stagger
                 onchange={(event) => { stagger = Math.max(0, Math.min(2000, Math.round(Number(event.currentTarget.value) || 0))); }} />
          ms after the last, left to right</label>
      {/if}
      <label class="opt"><input type="radio" name={`sp-${preset.id}`} checked={!repeat} onchange={() => { repeat = false; reason = ''; }} /> On one I choose</label>
    {/if}
    {#if !repeatable || !repeat}
      {#each preset.slots as slot, index (index)}
        <label class="row slot">
          <span title={slot.type ? `It was a ${slot.type}` : ''}>{slot.label || `Control ${index + 1}`}</span>
          <select value={mapping[index] ?? ''} aria-label={`Control for ${slot.label || index + 1}`} data-preset-slot={index}
                  onchange={(event) => setSlot(index, event.currentTarget.value)}>
            <option value="">—</option>
            {#each candidatesFor(slot, controls) as control (idOf(control))}<option value={idOf(control)}>{nameOf(control)}</option>{/each}
          </select>
        </label>
      {/each}
    {/if}
    {#if reason}<p class="warn" data-preset-reason>{reason}</p>{/if}
    <div class="acts">
      <button type="button" class="tb go" data-preset-add onclick={add}>Add scene</button>
      <button type="button" class="tb" onclick={oncancel}>Cancel</button>
      {#if mine}<button type="button" class="tb quiet" onclick={() => onremove(preset.id)} title="Take it out of your library; scenes made from it stay">Remove</button>{/if}
    </div>
  </div>
{/if}

<style>
  .sp { display: flex; flex-direction: column; gap: 6px; margin: 0 10px 8px; padding: 8px; border: 1px solid #2B323A; border-radius: 6px; background: #12161A; font-size: 12px; color: #CCD3DA; }
  .top { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }
  .top b { color: #E8EEF3; font-size: 13px; }
  .top span { color: #8A96A3; }
  .opt, .row { display: flex; align-items: center; gap: 6px; }
  .slot { justify-content: space-between; }
  .slot span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  select, .num { height: 26px; box-sizing: border-box; padding: 0 6px; border: 1px solid #3A434D; border-radius: 5px; background: #0E1114; color: #E8EEF3; font: inherit; min-width: 0; }
  .num { width: 64px; }
  select { max-width: 60%; }
  .warn { margin: 0; color: #F6D58A; }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .tb { height: 26px; padding: 0 10px; border: 1px solid #3A434D; border-radius: 5px; background: #1E2328; color: #E8EEF3; font: inherit; cursor: pointer; }
  .tb.go { border-color: #3D6E94; background: #173A5A; }
  .tb.quiet { margin-left: auto; color: #AEB9C4; }
</style>
