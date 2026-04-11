<script>
  let { value = 'normal', onchange = null } = $props();

  const BLEND_MODES = [
    ['normal',      'Normal'],
    ['multiply',    'Multiply'],
    ['screen',      'Screen'],
    ['overlay',     'Overlay'],
    ['darken',      'Darken'],
    ['lighten',     'Lighten'],
    ['color-dodge', 'Dodge'],
    ['color-burn',  'Burn'],
    ['soft-light',  'Soft Light'],
    ['hard-light',  'Hard Light'],
    ['difference',  'Difference'],
    ['exclusion',   'Exclusion'],
    ['hue',         'Hue'],
    ['saturation',  'Saturation'],
    ['color',       'Color'],
    ['luminosity',  'Luminosity'],
  ];
</script>

<select class="val" {value} onchange={(e) => onchange?.(e.target.value)}>
  {#each BLEND_MODES as [v, label] (v)}
    <option value={v}>{label}</option>
  {/each}
</select>

<style>
  .val {
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid #333;
    flex: 1;
    min-width: 0;
    font-family: inherit;
    outline: none;
    height: 26px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    padding-right: 20px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }
  .val:focus { border-color: #5B9BD5; }
</style>
