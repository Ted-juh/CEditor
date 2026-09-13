<script>
  /**
   * The specimen, and the state strip under it.
   *
   * The strip is the part that is specific to this application rather than borrowed from a
   * graphics editor: effects here are state-scoped, so a shadow can exist on `base` and vanish on
   * `pressed`, and until now the only way to discover that was to hover the real control. Each
   * state is resolved through `resolveStateScopedControl` — the same function the canvas preview
   * uses — so a thumbnail showing an effect gone is the truth, not an approximation.
   */
  import EffectPreview from './EffectPreview.svelte';
  import { getSection } from '../../stores/controls.js';
  import { resolveStateScopedControl } from '../../utils/interactionRuntime.js';
  import { withEffectsOff, withSoloAndMute } from '../../utils/effectStack.js';

  let {
    control = null,
    domain = 'text',
    rows = [],
    soloed = [],
    muted = [],
    activeState = 'base',
    onstate = () => {},
  } = $props();

  let comparing = $state(false);

  /** base plus whatever states the control actually defines — no invented hover on a control that
   *  has none. */
  let states = $derived.by(() => {
    const defined = Object.keys(getSection(control, 'States')?._children ?? {});
    return ['base', ...defined];
  });

  let heard = $derived(withSoloAndMute(control, domain, { soloed, muted }));
  let shown = $derived(comparing ? withEffectsOff(control, domain) : heard);

  function forState(name) {
    const scoped = name === 'base' ? heard : resolveStateScopedControl(heard, name);
    return scoped ?? heard;
  }

  /** True when this state switches every effect off, which is worth a badge — it is the case an
   *  author is most likely to have created by accident. */
  function stateHasNoEffects(name) {
    const scoped = forState(name);
    return rows.some((row) => row.enabled && !row.alwaysOn)
      && !rows.some((row) => {
        if (!row.enabledPath || row.alwaysOn) return false;
        const parts = row.enabledPath.split('.');
        let node = scoped;
        for (const part of parts.slice(0, -1)) node = node?._children?.[part];
        return node?.[parts.at(-1)] === true;
      });
  }
</script>

<div class="specimen-col">
  <div class="spec">
    <EffectPreview control={shown} boxWidth={396} boxHeight={168} padding={14} maxScale={3} label="Effect specimen" />
    <button
      type="button"
      class="compare"
      class:held={comparing}
      title="Hold to see the control with every effect off"
      onpointerdown={() => { comparing = true; }}
      onpointerup={() => { comparing = false; }}
      onpointerleave={() => { comparing = false; }}
      onkeydown={(event) => { if (event.key === ' ' || event.key === 'Enter') comparing = true; }}
      onkeyup={() => { comparing = false; }}
    >{comparing ? 'holding — effects off' : 'hold to compare'}</button>

    {#if soloed.length}
      <span class="solobadge">solo: {soloed.length}</span>
    {/if}
  </div>

  {#if states.length > 1}
    <div class="states" role="tablist" aria-label="Preview state">
      {#each states as name (name)}
        <button
          type="button"
          class="st"
          class:cur={name === activeState}
          role="tab"
          aria-selected={name === activeState}
          title={`Show the effect as it appears on ${name}`}
          onclick={() => onstate(name)}
        >
          <span class="stbox">
            {#if stateHasNoEffects(name)}<span class="stflag">no fx</span>{/if}
            <EffectPreview control={forState(name)} boxWidth={92} boxHeight={52} padding={5} maxScale={1.4} />
          </span>
          <span class="stl">{name}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="nostates">
      This control has no states. Add one in the States tab and it appears here.
    </p>
  {/if}
</div>

<style>
  .specimen-col { display: flex; flex-direction: column; min-width: 0; }

  .spec {
    background: #0C0F12;
    border: 1px solid #333;
    border-radius: 4px;
    height: 172px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .compare {
    position: absolute;
    right: 7px;
    top: 7px;
    border: 1px solid #333B42;
    background: #12171A;
    border-radius: 3px;
    padding: 4px 7px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #9AA6AE;
    cursor: pointer;
    user-select: none;
  }
  .compare:hover { border-color: #4A555E; color: #C8D2DA; }
  .compare.held { border-color: #E5A029; color: #F1D8A1; background: #241d10; }

  .solobadge {
    position: absolute;
    left: 7px;
    top: 7px;
    border: 1px solid #0E7C70;
    background: #0B2320;
    border-radius: 3px;
    padding: 3px 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #8FEDE3;
  }

  .states { display: flex; gap: 6px; margin-top: 8px; }

  .st {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    font: inherit;
  }

  .stbox {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 52px;
    border: 1px solid #2E3540;
    border-radius: 3px;
    background: #0C0F12;
    overflow: hidden;
    position: relative;
  }
  .st:hover .stbox { border-color: #45525C; }
  .st.cur .stbox { border-color: #5B9BD5; box-shadow: 0 0 0 1px #173449; }

  .stflag {
    position: absolute;
    right: 3px;
    top: 3px;
    z-index: 2;
    font: 600 7px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #E5A029;
    background: #241d10;
    border: 1px solid #4A3A1C;
    border-radius: 2px;
    padding: 2px 3px;
  }

  .stl {
    display: block;
    font: 500 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    text-align: center;
    margin-top: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st.cur .stl { color: #5B9BD5; }

  .nostates {
    margin: 8px 0 0;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }
</style>
