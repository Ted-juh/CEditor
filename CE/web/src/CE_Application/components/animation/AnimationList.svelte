<script>
  /**
   * The animations on this control, as a list.
   *
   * The properties panel picks one from a dropdown, so you can only see the name of the one you
   * are editing. Each row here says how long the animation runs and what is wrong with it without
   * opening it: targets that do nothing, a trigger naming a state the control does not have, and a
   * clash it loses — another animation later in the list that answers the same change on the same
   * property, so this one never plays there.
   *
   * And which animation just fired: a lamp beside the name lights each time one catches a change,
   * on the stage or in Preview (stores/animationActivity.js), so hovering and pressing the control
   * shows which trigger caught what — the question nothing could answer while triggers were ignored.
   */
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Swords from 'lucide-svelte/icons/swords';
  import CircleHelp from 'lucide-svelte/icons/circle-question-mark';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { deadTargetCount, unknownTriggerStates, clashesFor } from '../../utils/animationModel.js';

  let {
    rows = [],
    partNames = [],
    stateNames = [],
    clashes = [],
    fired = null,
    selectedName = '',
    onselect = () => {},
    ontoggle = () => {},
    onrename = () => {},
    onremove = () => {},
  } = $props();
</script>

<div class="list" role="listbox" tabindex="-1" aria-label="Animations">
  {#each rows as row (row.name)}
    {@const dead = deadTargetCount(row, partNames)}
    {@const unknown = unknownTriggerStates(row, stateNames)}
    {@const loses = clashesFor(row.name, clashes).filter((clash) => clash.role === 'loses')}
    <div
      class="arow"
      class:sel={row.name === selectedName}
      class:off={!row.enabled}
      role="option"
      tabindex="0"
      aria-selected={row.name === selectedName}
      onclick={() => onselect(row.name)}
      onkeydown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.name); }
      }}
    >
      <button
        type="button"
        class="dot"
        class:on={row.enabled}
        title={row.enabled ? 'Switch this animation off' : 'Switch this animation on'}
        aria-label={`${row.name} ${row.enabled ? 'on' : 'off'}`}
        onclick={(event) => { event.stopPropagation(); ontoggle(row); }}
      ></button>

      <span class="nm">
        {#if fired?.names?.includes(row.name)}
          {#key fired.seq}<i class="lamp" title="Just fired" aria-hidden="true"></i>{/key}
        {/if}
        {row.name}
      </span>

      <span class="meta">
        {row.duration}ms{#if row.kind === 'keyframes'}&nbsp;keyframes{:else if row.kind === 'sequence'}&nbsp;sequence{/if}
        {#if dead}
          <i class="bad" title={`${dead} of this animation's targets do nothing`}>
            <TriangleAlert size={9} aria-hidden="true" /> {dead}
          </i>
        {/if}
        {#if unknown.length}
          <i class="bad unknown" title={`The trigger names ${unknown.map((name) => `"${name}"`).join(', ')}, which this control does not have`}>
            <CircleHelp size={9} aria-hidden="true" /> {unknown.length}
          </i>
        {/if}
        {#if loses.length && row.enabled}
          <i class="bad clash" title={loses.map((clash) => clash.text).join('\n')}>
            <Swords size={9} aria-hidden="true" /> {loses.length}
          </i>
        {/if}
      </span>

      <span class="rowtools">
        <button type="button" class="rt" title={`Rename ${row.name}`} aria-label={`Rename ${row.name}`}
                onclick={(event) => { event.stopPropagation(); onrename(row.name); }}>
          <Pencil size={9} />
        </button>
        <button type="button" class="rt del" title={`Delete ${row.name}`} aria-label={`Delete ${row.name}`}
                onclick={(event) => { event.stopPropagation(); onremove(row.name); }}>
          <Trash2 size={9} />
        </button>
      </span>
    </div>
  {/each}

  {#if !rows.length}
    <p class="none">No animations yet. Name one below and add it.</p>
  {/if}
</div>

<style>
  .list {
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    overflow: hidden auto;
    max-height: 300px;
    outline: none;
  }

  .arow {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-bottom: 1px solid #1E242A;
    cursor: pointer;
    outline: none;
  }
  .arow:last-child { border-bottom: 0; }
  .arow:hover { background: #1A2126; }
  .arow:focus-visible { box-shadow: inset 0 0 0 1px #5B9BD5; }
  .arow.sel { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }
  .arow.off { opacity: 0.45; }

  .dot {
    width: 9px;
    height: 9px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid #3A434A;
    background: #2A2F33;
    cursor: pointer;
  }
  .dot.on { background: #14B8A6; border-color: #0E7C70; }

  .nm {
    min-width: 0;
    font: 500 10px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    color: #C3D0DA;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arow.sel .nm { color: #EAF5FF; }
  .lamp {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 4px;
    border-radius: 50%;
    vertical-align: 1px;
    background: #F5C451;
    box-shadow: 0 0 6px #F5C451;
    animation: lamp-fade 1.2s ease-out forwards;
  }
  @keyframes lamp-fade {
    0% { opacity: 1; }
    60% { opacity: 0.8; }
    100% { opacity: 0.15; box-shadow: none; }
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font: 400 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
  }
  .meta .bad {
    display: flex;
    align-items: center;
    gap: 2px;
    font-style: normal;
    color: #E5A029;
  }

  .rowtools { display: flex; gap: 2px; opacity: 0; }
  .arow:hover .rowtools, .arow.sel .rowtools, .rowtools:focus-within { opacity: 1; }
  .rt {
    width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
    padding: 0; border: 1px solid transparent; border-radius: 3px; background: transparent;
    color: #4B545C; cursor: pointer;
  }
  .rt:hover { border-color: #4A555E; color: #E8EEF5; }
  .rt.del:hover { border-color: #5C3A3A; color: #D98C8C; }

  .none {
    margin: 0;
    padding: 14px 10px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
