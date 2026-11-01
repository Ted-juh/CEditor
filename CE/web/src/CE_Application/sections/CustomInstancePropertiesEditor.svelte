<script>
  // Instance "Properties" tab (restructure Stage A4): what a component *user*
  // configures on a placed instance — the published inputs / editable properties /
  // outputs. Authoring the contract itself happens in the Designer workspace
  // (author context).
  //
  // It also had a "Variant" picker for components with more than one. Variants are hidden now (the
  // owner's call, when custom components were simplified): a component with variants keeps the one
  // it shows, and they still apply.
  import CustomPublicPropertiesEditor from './CustomPublicPropertiesEditor.svelte';

  let { control = null } = $props();
</script>

<CustomPublicPropertiesEditor {control} />
