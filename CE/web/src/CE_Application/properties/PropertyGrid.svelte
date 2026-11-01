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

  /* A narrow properties panel: two columns, so a field with its name inside keeps room for its
     value ("OUTMIN -135" read "OUTMIN -" four to a row at 420). utils/propertiesPanelWidth.js. */
  @container properties-tab (max-width: 460px) {
    .property-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
