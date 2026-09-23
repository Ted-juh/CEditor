<script>
  import BackgroundRenderer from '../../src/CE_Panel/components/BackgroundRenderer.svelte';

  let { background, width = 100, height = 60 } = $props();
</script>

<BackgroundRenderer {background} {width} {height} />
<BackgroundRenderer {background} {width} {height} />
