<script>
  // Test fixture: one labelled cell and one compact cell, as they would sit
  // side by side in a section grid. Used by propertyCell.test.js.
  import PropertyCell from '../../src/CE_Application/properties/PropertyCell.svelte';
  import NumberCell from '../../src/CE_Application/properties/NumberCell.svelte';
</script>

<PropertyCell label="Speed" span={2} hint="Labelled cell">
  <input class="plain" value="4" />
</PropertyCell>
<PropertyCell label="Offset X" span={1} compact hint="Compact cell">
  <NumberCell label="X" value={12} />
</PropertyCell>
