<script>
  let { value = false, onchange = null } = $props();

  function toggle() {
    onchange?.(!value);
  }
</script>

<button class="property-toggle" class:on={value} onclick={toggle}>
  {value ? 'On' : 'Off'}
</button>

<style>
  .property-toggle {
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    text-align: center;
    width: 100%;
    height: 26px;
  }

  .property-toggle.on {
    background: #094771;
    border-color: #0B6EB5;
    color: #DDD;
  }

  .property-toggle:hover {
    border-color: #5B9BD5;
  }
</style>
