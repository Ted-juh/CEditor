<script>
  let zoom = $state(100);
</script>

<div class="zoom-bar">
  <div class="scrollbar-area">
    <!-- Horizontal scrollbar placeholder -->
  </div>

  <div class="zoom-controls">
    <button class="zoom-btn" onclick={() => zoom = Math.max(10, zoom - 10)} title="Zoom out">−</button>
    <span class="zoom-value">{zoom}%</span>
    <button class="zoom-btn" onclick={() => zoom = Math.min(400, zoom + 10)} title="Zoom in">+</button>
    <button class="zoom-btn fit" onclick={() => zoom = 100} title="Fit to view">⊡</button>
  </div>
</div>

<style>
  .zoom-bar {
    display: flex;
    align-items: center;
    height: 100%;
    background: #222;
    padding: 0 8px;
    gap: 8px;
  }

  .scrollbar-area {
    flex: 1;
    height: 6px;
    background: #1A1A1A;
    border-radius: 3px;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .zoom-btn {
    background: #333;
    border: 1px solid #444;
    color: #AAA;
    width: 20px;
    height: 18px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    padding: 0;
  }

  .zoom-btn:hover { background: #444; color: #FFF; }

  .zoom-btn.fit { width: auto; padding: 0 4px; font-size: 11px; }

  .zoom-value {
    color: #888;
    font-size: 10px;
    min-width: 36px;
    text-align: center;
  }
</style>
