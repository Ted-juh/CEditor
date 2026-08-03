<script>
  import { dragScrub } from '../scrub/dragScrubAction';
  import { presets } from '../scrub/dragScrub';

  let { value = 100, min = 0, max = 200, step = 1, label = '', defaultValue = undefined, onchange = null } = $props();

  function pctFromValue(v) {
    return ((v - min) / (max - min)) * 100;
  }

  const scrubParams = $derived({
    ...presets.linearHorizontal,
    min,
    max,
    step,
    value,
    defaultValue,
    manageCursor: false,
    onChange: (v) => {
      if (v !== value) onchange?.(v);
    },
  });

  function selectAll(e) {
    e.target.select();
  }

  function handleInput(e) {
    let v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    v = Math.max(min, Math.min(max, v));
    onchange?.(v);
  }
</script>

<div class="property-scrub">
  <span class="scrub-label">{label}</span>
  <div class="scrub-track"
       role="slider"
       tabindex="0"
       aria-label={label || 'Value'}
       aria-valuemin={min}
       aria-valuemax={max}
       aria-valuenow={value}
       use:dragScrub={scrubParams}>
    <div class="scrub-fill" style="width:{pctFromValue(value)}%"></div>
    <div class="scrub-thumb" style="left:{pctFromValue(value)}%"></div>
  </div>
  <input class="scrub-value"
         type="text"
         value={Math.round(value)}
         onfocus={selectAll}
         onchange={handleInput} />
</div>

<style>
  .property-scrub {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 20px;
  }

  .scrub-label {
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    min-width: 24px;
    user-select: none;
  }

  .scrub-track {
    flex: 1;
    height: 14px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    position: relative;
    cursor: pointer;
    overflow: hidden;
    touch-action: none;
  }

  .scrub-track:hover {
    border-color: #555;
  }

  .scrub-track:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .scrub-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: #094771;
    pointer-events: none;
  }

  .scrub-thumb {
    position: absolute;
    top: 0;
    width: 3px;
    height: 100%;
    background: #5B9BD5;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .scrub-value {
    width: 32px;
    flex-shrink: 0;
    font-size: 10px;
    color: #DDD;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 1px 3px;
    text-align: center;
    font-family: inherit;
    outline: none;
    height: 18px;
  }

  .scrub-value:focus {
    border-color: #5B9BD5;
  }
</style>
