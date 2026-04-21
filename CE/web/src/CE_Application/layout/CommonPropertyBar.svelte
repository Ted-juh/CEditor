<script>
  /**
   * Common Property Bar — quick-access properties for the selected component.
   * Shows the most frequently edited properties inline.
   */
  import { selectedControl, getSection } from '../stores/controls.js';
  import DisplayToolbar from '../components/DisplayToolbar.svelte';

  let control = $derived($selectedControl);
  let selectedStates = $derived(getSection(control, 'States'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let showStateToolbar = $derived(
    String(behavior?.buttonType ?? '').trim().length > 0
    && Object.keys(selectedStates?._children ?? {}).length > 0
  );
</script>

<div class="common-bar">
  <div class="prop-group">
    <div class="color-swatch" style="background: #3A3A3A;" title="Fill colour"></div>
    <span class="prop-value">3A3A3A</span>
  </div>

  <div class="divider"></div>

  <div class="prop-group">
    <span class="prop-label">Arial</span>
    <span class="prop-value">14</span>
  </div>

  <div class="divider"></div>

  <div class="prop-group toggle-group">
    <button class="toggle-btn" title="Bold">B</button>
    <button class="toggle-btn" title="Italic">I</button>
    <button class="toggle-btn" title="Underline">U</button>
  </div>

  <div class="divider"></div>

  <div class="prop-group toggle-group">
    <button class="toggle-btn" title="Align left">≡</button>
    <button class="toggle-btn active" title="Align center">☰</button>
    <button class="toggle-btn" title="Align right">≡</button>
  </div>

  {#if showStateToolbar}
    <div class="divider"></div>
    <div class="toolbar-slot">
      <DisplayToolbar />
    </div>
  {/if}

  <div class="spacer"></div>
</div>

<style>
  .common-bar {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 10px;
    gap: 8px;
    background: #272727;
    font-size: 11px;
  }

  .prop-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #555;
    cursor: pointer;
  }

  .prop-label {
    color: #BBB;
    font-size: 11px;
  }

  .prop-value {
    color: #DDD;
    font-size: 11px;
    background: #1E1E1E;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #3A3A3A;
    min-width: 32px;
    text-align: center;
  }

  .divider {
    width: 1px;
    height: 16px;
    background: #3A3A3A;
  }

  .toggle-group {
    gap: 1px;
  }

  .toggle-btn {
    background: #333;
    border: 1px solid #444;
    color: #999;
    width: 22px;
    height: 22px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
  }

  .toggle-btn:first-child { border-radius: 3px 0 0 3px; }
  .toggle-btn:last-child  { border-radius: 0 3px 3px 0; }

  .toggle-btn:hover {
    background: #444;
    color: #DDD;
  }

  .toggle-btn.active {
    background: #094771;
    color: #FFF;
    border-color: #0B6EB5;
  }

  .spacer { flex: 1; }

  .toolbar-slot {
    min-width: 0;
    display: flex;
    align-items: center;
  }
</style>
