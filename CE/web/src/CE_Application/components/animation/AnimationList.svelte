<script>
  /**
   * The animations on this control, as a list.
   *
   * The properties panel picks one from a dropdown, so you can only see the name of the one you
   * are editing. Each row here says how many things the animation changes and how many of those do
   * nothing.
   */
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { deadTargetCount } from '../../utils/animationModel.js';

  let {
    rows = [],
    partNames = [],
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
    <div
      class="arow"
      class:sel={row.name === selectedName}
      class:off={!row.enabled}
      role="option"
      tabindex="0"
      aria-selected={row.name === selectedName}
      onclick={() => onselect(row.name)}
      onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.name); } }}
    >
      <button
        type="button"
        class="dot"
        class:on={row.enabled}
        title={row.enabled ? 'Switch this animation off' : 'Switch this animation on'}
        aria-label={`${row.name} ${row.enabled ? 'on' : 'off'}`}
        onclick={(event) => { event.stopPropagation(); ontoggle(row); }}
      ></button>

      <span class="nm">{row.name}</span>

      <span class="meta">
        {row.duration}ms
        {#if dead}
          <i class="bad" title={`${dead} of this animation's targets do nothing`}>
            <TriangleAlert size={9} aria-hidden="true" /> {dead}
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
