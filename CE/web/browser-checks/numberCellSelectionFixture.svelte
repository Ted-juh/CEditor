<script>
  import NumberCell from '../src/CE_Application/properties/NumberCell.svelte';

  let selected = $state('first');
  let values = $state({ first: 10, second: 20 });

  function commit(value) {
    values[selected] = value;
  }

  globalThis.__numberCellSelection = {
    selected: () => selected,
    values: () => $state.snapshot(values),
  };
</script>

<button type="button" data-row="first" onmousedown={() => { selected = 'first'; }}>First</button>
<button type="button" data-row="second" onmousedown={() => { selected = 'second'; }}>Second</button>
<NumberCell ariaLabel="Selected value" value={values[selected]} onchange={commit} />
