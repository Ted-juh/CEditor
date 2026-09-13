<script>
  /**
   * Quick selections use fixed effect pictograms. Clicking one
   * applies the whole patch, which switches off everything the look does not use — see the header
   * of `effectLooks.js` for why a preset that only adds is a preset you cannot get out of.
   */
  import EffectIcon from './EffectIcon.svelte';
  import { looksFor } from '../../utils/effectLooks.js';

  let {
    domain = 'text',
    current = '',
    onapply = () => {},
  } = $props();

  let looks = $derived(looksFor(domain));
</script>

<!--
  A radiogroup, not a list. These are mutually exclusive — applying one replaces the whole stack, and
  `current` marks the one in force — so `role="radio"` with `aria-checked` says what the buttons
  actually do. It was `role="list"` with `role="listitem"` buttons, which Svelte rejects outright
  (`a11y_no_interactive_element_to_noninteractive_role`): a button is interactive and a list item is
  not. The warning was the right complaint about the wrong markup rather than a rule to silence.
-->
{#if looks.length}
  <div class="looks" role="radiogroup" aria-label={`${domain} looks`}>
    {#each looks as look (look.id)}
      <button
        type="button"
        class="look"
        class:on={look.id === current}
        role="radio"
        aria-checked={look.id === current}
        title={`Apply the ${look.label} look — replaces the whole stack`}
        aria-label={look.label}
        onclick={() => onapply(look)}
      >
        <EffectIcon name={look.id} size={24} />
        <span class="lookl">{look.label}{#if look.id === current} ✓{/if}</span>
      </button>
    {/each}
  </div>
{:else}
  <p class="none">
    No presets here. Backlight and dot pitch describe one physical screen, so a preset would only
    be a second name for two numbers.
  </p>
{/if}

<style>
  .looks { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }

  .look {
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 5px 8px;
    color: #AABAC7;
    overflow: hidden;
    cursor: pointer;
    font: inherit;
  }
  .look:hover { border-color: #5B9BD5; }
  .look.on { border-color: #0B6EB5; background: #094771; color: #FFF; }

  .lookl {
    display: block;
    font: inherit;
    font-size: 10px;
    color: #AAA;
    text-align: left;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .look.on .lookl { color: #FFF; }

  .none {
    margin: 0;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }
</style>
