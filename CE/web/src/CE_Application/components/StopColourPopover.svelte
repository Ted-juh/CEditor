<script>
  /**
   * In-place colour editor for a gradient stop.
   *
   * WHY IT EXISTS. Editing a stop's colour used to mean leaving the gradient
   * editor entirely: chip → the dock swaps to the Colors tab → edit → "Back to
   * Gradient" → the dock swaps back. Two full-panel transitions per stop, on a
   * gradient whose whole point is how its stops look NEXT TO EACH OTHER. This
   * puts the chooser over the gradient instead, so the thing being edited stays
   * on screen while it is edited — Illustrator's answer, reached the way
   * Illustrator reaches it (double-click the stop).
   *
   * ABANDONMENT SEMANTICS, DELIBERATELY: edits are live and clicking away
   * COMMITS them. Cancel and Escape put the original colour back. The rule is
   * "what you can see is what you have got, unless you take it back", and it
   * matches what the dock's cross-tab stop edit already did on tab-away.
   *
   * Props:
   *   color   — the stop's RRGGBB
   *   label   — heading text, e.g. "Stop 2"
   *   oninput(hex6)  — live preview, fired on every chooser interaction
   *   oncommit(hex6) — keep it
   *   oncancel()     — put the original back
   */
  import { onMount, untrack } from 'svelte';
  import ColorChooser from './ColorChooser.svelte';

  let { color = 'FFFFFF', label = 'Stop', stepSize = 0, oninput, oncommit, oncancel } = $props();

  // `untrack`: the colour the stop had when the popover opened, captured once
  // on purpose — it is what Cancel and Escape restore. Following the prop would
  // defeat that, because `oninput` above drives the prop, so a live read would
  // make "the original" chase the edit and Cancel become a no-op.
  const original = untrack(() => String(color ?? 'FFFFFF').replace(/^#/, '').toUpperCase());
  let live = $state(original);
  let rootEl = $state(null);

  function handleChange(fullHex) {
    // The chooser speaks AARRGGBB; a gradient stop is RRGGBB — the gradient's
    // own opacity lives on the fill layer, not on individual stops, so the
    // alpha is dropped here rather than smuggled into the stop colour.
    live = String(fullHex).slice(-6).toUpperCase();
    oninput?.(live);
  }

  function commit() {
    oncommit?.(live);
  }

  function cancel() {
    oncancel?.(original);
  }

  onMount(() => {
    function onPointerDown(event) {
      if (rootEl && !rootEl.contains(event.target)) commit();
    }
    function onKeydown(event) {
      // A key pressed inside a field belongs to the field. The chooser's hex
      // input uses Escape to revert what was typed and Enter to apply it, and
      // stealing either here would throw away the whole edit when the user
      // only meant to undo a typo.
      if (event.target?.tagName === 'INPUT') return;
      if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
      else if (event.key === 'Enter') { commit(); }
    }
    // Capture phase: the gradient surface under this popover starts a drag on
    // mousedown, and a click meant to dismiss the popover must not also grab a
    // handle on the way out.
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeydown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeydown, true);
    };
  });
</script>

<div class="stop-popover" bind:this={rootEl} role="dialog" aria-label="{label} colour">
  <div class="popover-header">
    <span class="popover-title">{label}</span>
    <span class="popover-hex">#{live}</span>
  </div>
  <div class="popover-chooser">
    <ColorChooser color={live} alpha={1} {stepSize} onchange={handleChange} />
  </div>
  <div class="popover-actions">
    <button class="popover-btn" onclick={cancel} title="Restore the colour this stop had (Esc)">Cancel</button>
    <button class="popover-btn primary" onclick={commit} title="Keep this colour (Enter)">Done</button>
  </div>
</div>

<style>
  .stop-popover {
    /* The gradient editor floats this at a fixed width; the sidebar hands it
       100% because it is inline there. */
    width: var(--stop-popover-width, 230px);
    max-width: 100%;
    background: #1E1E1E;
    border: 1px solid #555;
    border-radius: 5px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 6px;
    border-bottom: 1px solid #333;
  }

  .popover-title {
    font-size: 9px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .popover-hex {
    font-family: monospace;
    font-size: 10px;
    color: #BBB;
  }

  .popover-chooser {
    height: 170px;
  }

  .popover-actions {
    display: flex;
    gap: 4px;
    padding: 4px 6px 6px;
  }

  .popover-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    font-family: inherit;
    font-size: 10px;
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
  }

  .popover-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .popover-btn.primary {
    background: #094771;
    border-color: #5B9BD5;
    color: #DDD;
  }
</style>
