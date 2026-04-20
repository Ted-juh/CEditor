<script>
  let {
    value = 'center',
    onchange = null,
    options = [
      { value: 'top-left', label: 'Top Left' },
      { value: 'top', label: 'Top' },
      { value: 'top-right', label: 'Top Right' },
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
      { value: 'bottom-left', label: 'Bottom Left' },
      { value: 'bottom', label: 'Bottom' },
      { value: 'bottom-right', label: 'Bottom Right' },
    ],
  } = $props();

  const positions = [
    { value: 'top-left', row: 'start', col: 'start' },
    { value: 'top', row: 'start', col: 'center' },
    { value: 'top-right', row: 'start', col: 'end' },
    { value: 'left', row: 'center', col: 'start' },
    { value: 'center', row: 'center', col: 'center' },
    { value: 'right', row: 'center', col: 'end' },
    { value: 'bottom-left', row: 'end', col: 'start' },
    { value: 'bottom', row: 'end', col: 'center' },
    { value: 'bottom-right', row: 'end', col: 'end' },
  ];

  const fallbackLabels = {
    'top-left': 'Top Left',
    top: 'Top',
    'top-right': 'Top Right',
    left: 'Left',
    center: 'Center',
    right: 'Right',
    'bottom-left': 'Bottom Left',
    bottom: 'Bottom',
    'bottom-right': 'Bottom Right',
  };

  let slots = $derived(
    positions.map((pos, index) => ({
      ...pos,
      option: options[index] ?? {
        value: pos.value,
        label: fallbackLabels[pos.value] ?? pos.value,
      },
    }))
  );

  function handleClick(pos) {
    onchange?.(pos);
  }
</script>

<div class="alignment-picker">
  {#each slots as pos}
    <button
      class="align-cell"
      class:active={value === pos.option.value}
      title={pos.option.label ?? fallbackLabels[pos.value] ?? pos.option.value}
      onclick={() => handleClick(pos.option.value)}
    >
      <span class="align-dot row-{pos.row} col-{pos.col}"></span>
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

  .align-dot.row-start { align-self: flex-start; }
  .align-dot.row-center { align-self: center; }
  .align-dot.row-end { align-self: flex-end; }

  .align-dot.col-start {
    margin-right: auto;
    margin-left: 6px;
  }

  .align-dot.col-center {
    margin-left: auto;
    margin-right: auto;
  }

  .align-dot.col-end {
    margin-left: auto;
    margin-right: 6px;
  }

  .align-cell:hover .align-dot {
    background: #888;
  }

  .align-cell.active .align-dot {
    background: #5B9BD5;
  }
</style>
