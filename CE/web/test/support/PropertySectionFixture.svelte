<script>
  // Test fixture: a PropertySection with the W6 header extras — an icon anchor
  // and a HeaderPill in the tools slot — plus one body cell gated on the pill,
  // as an editor would use it. Used by propertySection.test.js.
  import PropertySection from '../../src/CE_Application/properties/PropertySection.svelte';
  import PropertyCell from '../../src/CE_Application/properties/PropertyCell.svelte';
  import HeaderPill from '../../src/CE_Application/properties/HeaderPill.svelte';
  import Magnet from 'lucide-svelte/icons/magnet';

  let { enabled = false } = $props();
</script>

<PropertySection title="Shadow" icon={Magnet}>
  {#snippet tools()}
    <HeaderPill value={enabled} title="Master enable" />
  {/snippet}
  {#if enabled}
    <PropertyCell label="Blur" span={2} hint="Only shown when enabled.">
      <input value="8" />
    </PropertyCell>
  {/if}
</PropertySection>
