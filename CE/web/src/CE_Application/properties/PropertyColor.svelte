<script>
  import { tick } from 'svelte';

  let { value = '000000', onchange = null, onswatchclick = null } = $props();

  let valueGeneration = 0;

  // A caller may reject invalid text or normalize it back to the value it
  // already held. In both cases Svelte sees no prop change, so the browser's
  // edited value would otherwise remain visible while the swatch and model
  // still contain the canonical value.
  $effect(() => {
    value;
    valueGeneration += 1;
  });

  async function handleInput(e) {
    const input = e.currentTarget;
    const generation = ++valueGeneration;
    onchange?.(input.value);
    await tick();
    if (generation === valueGeneration && input.isConnected) {
      input.value = String(value ?? '');
    }
  }

  function selectAll(e) {
    e.target.select();
  }
</script>

<div class="property-color">
  <button
    class="mini-swatch"
    title="Pick colour"
    style="background:#{value.slice(-6)}"
    onclick={() => onswatchclick?.()}
  ></button>
  <input
    class="color-hex"
    type="text"
    {value}
    onfocus={selectAll}
    onchange={handleInput}
  />
</div>

<style>
  .property-color {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .mini-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #555;
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
  }

  .mini-swatch:hover {
    border-color: #5B9BD5;
  }

  .color-hex {
    flex: 1;
    min-width: 0;
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid #333;
    font-family: inherit;
    outline: none;
    height: 26px;
  }

  .color-hex:focus {
    border-color: #5B9BD5;
  }
</style>
