<script>
  let {
    value = 0,
    step = 1,
    min = undefined,
    max = undefined,
    disabled = false,
    onchange = null,
  } = $props();

  function clamp(v) {
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }

  function fire(v) {
    const clamped = clamp(v);
    onchange?.(clamped);
  }

  function decrement() {
    if (disabled) return;
    fire((value ?? 0) - step);
  }

  function increment() {
    if (disabled) return;
    fire((value ?? 0) + step);
  }

  function handleInput(e) {
    if (disabled) return;
    const v = Number(e.target.value);
    if (!isNaN(v)) fire(v);
  }

  function selectAll(e) {
    e.target.select();
  }
</script>

<div class="num-input" class:disabled>
  <button class="num-btn" title="Decrease" onclick={decrement} {disabled}>&minus;</button>
  <input
    class="num-field"
    type="number"
    {value}
    {step}
    {min}
    {max}
    {disabled}
    onfocus={selectAll}
    onchange={handleInput}
  />
  <button class="num-btn" title="Increase" onclick={increment} {disabled}>+</button>
</div>

<style>
  .num-input {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    overflow: hidden;
  }

  .num-input:focus-within {
    border-color: #5B9BD5;
  }

  .num-input.disabled {
    opacity: 0.5;
  }

  .num-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 22px;
    background: #252525;
    border: none;
    color: #777;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    line-height: 1;
  }

  .num-btn:hover {
    background: #333;
    color: #DDD;
  }

  .num-btn:active {
    background: #094771;
    color: #FFF;
  }

  .num-btn:disabled {
    cursor: default;
    color: #666;
    background: #1F1F1F;
  }

  .num-field {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    padding: 3px 4px;
    text-align: center;
    outline: none;
    -moz-appearance: textfield;
  }

  .num-field:disabled {
    cursor: default;
  }

  .num-field::-webkit-inner-spin-button,
  .num-field::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
</style>
