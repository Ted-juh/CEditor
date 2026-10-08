<script>
  /**
   * Which control page a scene or a song brings up on the controller, or Keep the one showing.
   *
   * Both used to offer the rack's first three pages and no more — a segmented control has room for
   * about that many — so a rack with Auto pages for two instruments could not call up most of them.
   * Up to three pages the buttons stay, since one click beats opening a list; past that it is a list
   * with every page in it.
   */
  import Segmented from '../../components/controls/Segmented.svelte';

  let { pages = [], value = '', keepTitle = '', label = '', testid = undefined, onchange = () => {} } = $props();

  const SEGMENTED_MAX = 3;
  let options = $derived([{ value: '', label: 'Keep', title: keepTitle },
    ...pages.map((page) => ({ value: page.pageId, label: page.name }))]);
</script>

{#if pages.length <= SEGMENTED_MAX}
  <Segmented {options} {value} {label} {testid} {onchange} />
{:else}
  <select class="page-pick" value={value ?? ''} aria-label={label} data-testid={testid}
          onchange={(e) => onchange(e.currentTarget.value)}>
    {#each options as option (option.value)}
      <option value={option.value} title={option.title}>{option.label}</option>
    {/each}
  </select>
{/if}

<style>
  .page-pick { max-width: 14em; }
</style>
