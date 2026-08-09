<script>
  // Renders the MIDI settings page twice: as a browser build sees it (no backend), and as the
  // desktop app sees it (a fake bridge that answers with two ports).
  import MidiSettings from '../src/CE_Application/settings/MidiSettings.svelte';
  let { withPorts = false } = $props();
</script>
<div class="pane"><MidiSettings /></div>
<style>.pane { width: 720px; background: #151515; }</style>
