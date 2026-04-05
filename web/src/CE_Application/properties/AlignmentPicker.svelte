<script>
  let { value = 'center', onchange = null } = $props();

  const positions = [
    'top-left', 'top', 'top-right',
    'left', 'center', 'right',
    'bottom-left', 'bottom', 'bottom-right',
  ];

  function handleClick(pos) {
    onchange?.(pos);
  }
</script>

<div class="alignment-picker">
  {#each positions as pos}
    <button
      class="align-cell"
      class:active={value === pos}
      title={pos}
      onclick={() => handleClick(pos)}
    >
      <span class="align-dot"></span>
    </button>
  {/each}
</div>

<style>
  .alignment-picker {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }

  .align-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0.5px solid #2A2A2A;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    min-height: 0;
  }

  .align-cell:hover {
    background: #252525;
  }

  .align-cell.active {
    background: #094771;
  }

  .align-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #444;
    flex-shrink: 0;
  }

  .align-cell:hover .align-dot {
    background: #888;
  }

  .align-cell.active .align-dot {
    background: #5B9BD5;
  }
</style>
