<script>
  /**
   * HostRuntime.svelte — the generated Hostage product's whole page.
   *
   * One full-viewport Hostage workspace over the same bridge events the editor's
   * preview uses. No tabs, no menus, no authoring chrome: the runtime interface is what the
   * Host Project enables, and in Stage 1 that is the rack.
   */
  import InstrumentHostView from './CE_Application/sections/InstrumentHostView.svelte';
</script>

<div class="host-runtime">
  <InstrumentHostView />
</div>

<style>
  .host-runtime {
    width: 100vw;
    height: 100vh;
    background: #1e1e1e;
    user-select: none;
  }
</style>
