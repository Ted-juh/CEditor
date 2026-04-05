<script>
  let { value = '000000', onchange = null, onswatchclick = null } = $props();

  function handleInput(e) {
    onchange?.(e.target.value);
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
