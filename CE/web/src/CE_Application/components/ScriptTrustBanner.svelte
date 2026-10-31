<script>
  import { scriptExecutionStatus } from '../scripting/scriptTrust.js';
  import { approveCurrentPanelScripts } from '../scripting/panelRuntime.js';
  let allowNative = false;
  $: if (!$scriptExecutionStatus.blocked) allowNative = false;
</script>

{#if $scriptExecutionStatus.blocked}
  <aside class="script-trust" role="status">
    <strong>Scripts are paused in {$scriptExecutionStatus.name || 'this panel'}.</strong>
    <span>Only enable code from an author you trust. Scripts can control MIDI. Changes to code require approval again.
      {#if $scriptExecutionStatus.hasNative}
        <label><input type="checkbox" bind:checked={allowNative} /> Also allow Python and native-code exports for this session. This code can access files and run programs; it is not sandboxed.</label>
      {/if}
    </span>
    <button disabled={$scriptExecutionStatus.nativeRequired && !allowNative}
      onclick={() => approveCurrentPanelScripts(undefined, { allowNative })}>Enable scripts for this session</button>
  </aside>
{/if}

<style>
  /* A row of the window's layout (App.svelte's `trust` row, above the status bar), not a layer over
     it. Floating over the bottom of the window it covered whatever was there: the Behavior
     Designer's footer, with Save file, so typed code could not be saved until it was trusted. */
  .script-trust { display: flex; align-items: center; gap: 14px; padding: 8px 16px;
    border-top: 1px solid #d4ac55; background: #30291d; color: #fff2d2; font: 13px/1.4 sans-serif; }
  span { flex: 1; } button { flex-shrink: 0; padding: 8px 12px; cursor: pointer; }
  label { display: block; margin-top: 6px; } button:disabled { opacity: 0.5; cursor: default; }
</style>
