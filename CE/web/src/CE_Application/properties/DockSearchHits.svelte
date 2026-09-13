<script>
  /**
   * Search results for properties that live in a dock tab.
   *
   * The panel's search hides rows that do not match, so it can only ever find what the panel is
   * drawing. These eight tabs edit properties the panel may no longer draw — and, today, properties
   * the panel never drew at all, like a Step Sequencer's pattern. Without this, searching for one of
   * them returns nothing, which reads as "this application does not have that".
   *
   * One row per tab rather than one per label: eight buttons is a menu, ninety is a wall.
   */
  import Search from 'lucide-svelte/icons/search';
  import OpenInDock from './OpenInDock.svelte';
  import { propertyFilter } from '../stores/propertyFilter.js';
  import { findDockFields, describeHits } from '../utils/dockFieldIndex.js';

  let { control = null } = $props();

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let hits = $derived(findDockFields($propertyFilter, control));
</script>

{#if hits.length}
  <div class="dock-hits">
    <div class="dh-head">
      <Search size={10} aria-hidden="true" />
      <span>Also in the dock</span>
    </div>
    {#each hits as hit (hit.tab)}
      <div class="dh-row">
        <span class="dh-what">
          <b>{hit.label}</b>
          <i>{describeHits(hit)}</i>
        </span>
        <OpenInDock tab={hit.tab} {controlId} what={describeHits(hit)} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .dock-hits {
    border-bottom: 1px solid #2A2A2A;
    background: #17191C;
    padding: 6px 8px 8px;
  }
  .dh-head {
    display: flex;
    align-items: center;
    gap: 5px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 6px;
  }
  .dh-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
  }
  .dh-what {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: baseline;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
  }
  .dh-what b {
    font: 600 10px/1.3 'IBM Plex Sans', system-ui, sans-serif;
    color: #C3D0DA;
  }
  .dh-what i {
    font: 400 9.5px/1.3 'IBM Plex Sans', system-ui, sans-serif;
    font-style: normal;
    color: #69737B;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
