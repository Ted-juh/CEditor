<script>
  /**
   * The looks shelf — the fourth column.
   *
   * Each thumbnail is the look applied to the control you are actually editing, drawn by the real
   * renderer, so it shows your own text in your own font rather than a stock word. Clicking one
   * applies the whole patch, which switches off everything the look does not use — see the header
   * of `effectLooks.js` for why a preset that only adds is a preset you cannot get out of.
   */
  import EffectPreview from './EffectPreview.svelte';
  import { looksFor, previewLook } from '../../utils/effectLooks.js';

  let {
    control = null,
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
        onclick={() => onapply(look)}
      >
        <span class="lookbox">
          <EffectPreview control={previewLook(control, look)} boxWidth={132} boxHeight={40} padding={3} maxScale={0.9} />
        </span>
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
  .looks { display: flex; flex-direction: column; gap: 6px; }

  .look {
    border: 1px solid #2E3540;
    border-radius: 3px;
    background: #0C0F12;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    font: inherit;
  }
  .look:hover { border-color: #45525C; }
  .look.on { border-color: #0E7C70; box-shadow: 0 0 0 1px #0B2320; }

  .lookbox {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    overflow: hidden;
  }

  .lookl {
    display: block;
    font: 500 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    text-align: center;
    padding: 0 0 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .look.on .lookl { color: #8FEDE3; }

  .none {
    margin: 0;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }
</style>
