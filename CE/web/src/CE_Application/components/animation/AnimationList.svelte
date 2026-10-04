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
  import { deadTargetCount, unknownTriggerStates, clashesFor, triggerSummary } from '../../utils/animationModel.js';

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
        <span class="sum" title={`${row.duration} ms ${row.kind}, ${triggerSummary(row)}`}>{row.duration}ms{row.kind === 'keyframes' ? ' keyframes' : row.kind === 'sequence' ? ' sequence' : ''}, {triggerSummary(row)}</span>
        {#if dead}
          <i class="bad" title={`${dead} of this animation's targets do nothing`}>
            <TriangleAlert size={12} aria-hidden="true" /> {dead}
          </i>
        {/if}
        {#if unknown.length}
          <i class="bad unknown" title={`The trigger names ${unknown.map((name) => `"${name}"`).join(', ')}, which this control does not have`}>
            <CircleHelp size={12} aria-hidden="true" /> {unknown.length}
          </i>
        {/if}
        {#if loses.length && row.enabled}
          <i class="bad clash" title={loses.map((clash) => clash.text).join('\n')}>
            <Swords size={12} aria-hidden="true" /> {loses.length}
          </i>
        {/if}
      </span>

      <span class="rowtools">
        <button type="button" class="rt" title={`Rename ${row.name}`} aria-label={`Rename ${row.name}`}
                onclick={(event) => { event.stopPropagation(); onrename(row.name); }}>
          <Pencil size={13} />
        </button>
        <button type="button" class="rt del" title={`Delete ${row.name}`} aria-label={`Delete ${row.name}`}
                onclick={(event) => { event.stopPropagation(); onremove(row.name); }}>
          <Trash2 size={13} />
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
    flex: 1;
    min-height: 0;
    border: 1px solid #2B323A;
    border-radius: 8px;
    background: #12161A;
    overflow: hidden auto;
    outline: none;
    scrollbar-color: #4A5560 #12161A;
  }

  /* Two lines a row: the name, and under it how long, which kind and what starts it. */
  .arow {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr) auto;
    grid-template-areas: "dot nm tools" "dot meta tools";
    align-items: center;
    column-gap: 9px;
    row-gap: 1px;
    padding: 5px 6px 5px 10px;
    border-bottom: 1px solid #232A31;
    cursor: pointer;
    outline: none;
  }
  .arow:last-child { border-bottom: 0; }
  .arow:hover { background: #1A2026; }
  .arow:focus-visible { box-shadow: inset 0 0 0 2px #7CC4FF; }
  .arow.sel { background: #173A5A; box-shadow: inset 3px 0 0 #5AA9E6; }
  .arow.off .nm, .arow.off .meta { opacity: 0.55; }

  .dot {
    grid-area: dot;
    width: 12px;
    height: 12px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid #5B6670;
    background: #2A3038;
    cursor: pointer;
  }
  .dot.on { background: #3DDBB4; border-color: #2E7D6B; }

  .nm {
    grid-area: nm;
    min-width: 0;
    font: 500 14px/1.25 'IBM Plex Sans', system-ui, sans-serif;
    color: #E8EEF3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lamp {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 5px;
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
    grid-area: meta;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font: 400 12px/1.25 'IBM Plex Sans', system-ui, sans-serif;
    color: #AEB9C4;
    white-space: nowrap;
  }
  .meta .sum { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .meta .bad {
    display: flex;
    align-items: center;
    gap: 3px;
    flex: none;
    font-style: normal;
    font-weight: 600;
    color: #F6D58A;
  }

  .rowtools { grid-area: tools; display: flex; gap: 2px; opacity: 0; }
  .arow:hover .rowtools, .arow.sel .rowtools, .rowtools:focus-within { opacity: 1; }
  .rt {
    width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    padding: 0; border: 1px solid transparent; border-radius: 5px; background: transparent;
    color: #AEB9C4; cursor: pointer;
  }
  .rt:hover { border-color: #5B6670; color: #E8EEF3; }
  .rt.del:hover { border-color: #8A3B3B; color: #FFC9C9; }

  .none {
    margin: 0;
    padding: 12px;
    font: 400 13px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #AEB9C4;
  }
</style>
