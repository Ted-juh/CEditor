<script>
  let { children } = $props();
</script>

<div class="property-grid">
  {@render children()}
</div>

<style>
  .property-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 4px;
    padding: 4px 8px 8px 8px;
  }
</style>
