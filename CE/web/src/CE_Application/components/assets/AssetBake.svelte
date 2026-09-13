<script>
  /**
   * Bake the component itself into a filmstrip.
   *
   * The same operation as the properties panel's "Generate Filmstrip" section, in the column beside
   * the picture it produces. The size guard is not restated here: `estimateFilmstripBake` already
   * knows the pixel and dimension limits and why they are what they are, so this form reads it and
   * shows what it says.
   *
   * The bake itself is not run here. The form hands normalised options up so the writing of the
   * asset and its generator stays in one place with every other write this tab makes.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import { estimateFilmstripBake, normalizeFilmstripBakeOptions } from '../../utils/customComponentFilmstripBaker.js';
  import { formatBytes } from '../../utils/assetsModel.js';

  let {
    control = null,
    channels = [],
    existingNames = [],
    busy = false,
    status = '',
    onbake = () => {},
    oncancel = () => {},
  } = $props();

  let name = $state('bakedFilmstrip');
  let valueSource = $state('mainValue');
  let frameCount = $state(64);
  let frameWidth = $state(0);
  let frameHeight = $state(0);
  let outputScale = $state(1);
  let orientation = $state('vertical');
  let interpolation = $state('nearest');

  let options = $derived({ name, valueSource, frameCount, frameWidth, frameHeight, outputScale, orientation, interpolation });
  let estimate = $derived(estimateFilmstripBake(control, options));
  let replaces = $derived(existingNames.includes(estimate.name));
</script>

<div class="bake">
  <div class="grp">Bake a filmstrip</div>

  <div class="r"><label for="bake-name">Name</label>
    <input class="txt" id="bake-name" type="text" bind:value={name} placeholder="bakedFilmstrip" />
  </div>

  <div class="r"><label for="bake-value">Value</label>
    <input class="txt" id="bake-value" type="text" list="assets-bake-channels" bind:value={valueSource} />
    <datalist id="assets-bake-channels">
      {#each channels as channel (channel)}<option value={channel}></option>{/each}
    </datalist>
  </div>

  <div class="r"><label for="bake-frames">Frames</label>
    <div class="cell"><NumberCell value={frameCount} min={1} step={1} label="Frames"
      onchange={(value) => frameCount = Math.max(1, Math.round(value))} /></div>
  </div>

  <div class="r"><label for="bake-w">Frame W</label>
    <div class="cell"><NumberCell value={frameWidth} min={0} step={1} label="W"
      onchange={(value) => frameWidth = Math.max(0, Math.round(value))} /></div>
  </div>

  <div class="r"><label for="bake-h">Frame H</label>
    <div class="cell"><NumberCell value={frameHeight} min={0} step={1} label="H"
      onchange={(value) => frameHeight = Math.max(0, Math.round(value))} /></div>
  </div>

  <div class="r"><label for="bake-scale">Scale</label>
    <div class="cell"><NumberCell value={outputScale} min={1} max={4} step={0.5} label="Scale"
      onchange={(value) => outputScale = Math.max(1, Math.min(4, value))} /></div>
  </div>

  <div class="r"><label for="bake-axis">Axis</label>
    <Segmented options={[{ value: 'vertical', label: 'Vert' }, { value: 'horizontal', label: 'Horz' }]}
               value={orientation} ariaLabel="Bake axis" onchange={(value) => orientation = value} />
  </div>

  <div class="r"><label for="bake-interp">Interp</label>
    <Segmented options={[{ value: 'nearest', label: 'Nearest' }, { value: 'linear', label: 'Linear' }]}
               value={interpolation} ariaLabel="Interpolation" onchange={(value) => interpolation = value} />
  </div>

  <p class="est" class:warn={estimate.warning} class:bad={estimate.blocked}>
    {estimate.canvasWidth}×{estimate.canvasHeight} · {formatBytes(estimate.estimatedMemoryBytes)}
    {#if estimate.blockReason}· {estimate.blockReason}{/if}
    {#if replaces}<b>replaces {estimate.name}</b>{/if}
  </p>

  {#if status}<p class="status">{status}</p>{/if}

  <div class="acts">
    <button type="button" class="go" disabled={busy || estimate.blocked || !control}
            onclick={() => onbake(normalizeFilmstripBakeOptions(control, options))}>
      {busy ? 'Baking…' : (replaces ? 'Rebake' : 'Generate')}
    </button>
    <button type="button" onclick={oncancel} disabled={busy}>Close</button>
  </div>
</div>

<style>
  .bake {
    border: 1px solid #333;
    border-radius: 4px;
    background: #1A1D20;
    padding: 6px 8px 9px;
  }

  .grp {
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #4B545C;
    margin: 2px 0 2px;
    padding-bottom: 3px;
    border-bottom: 1px solid #262B30;
  }

  .r {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 7px;
    align-items: center;
    margin-top: 6px;
  }
  .r > label {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

  .cell { min-width: 0; display: flex; }

  .txt {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 26px;
    padding: 0 6px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font: 400 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    outline: none;
  }
  .txt:focus { border-color: #5B9BD5; }

  .est {
    margin: 9px 0 0;
    font: 400 9px/1.5 'IBM Plex Mono', ui-monospace, monospace;
    color: #69737B;
  }
  .est b { display: block; color: #E5A029; font-weight: 600; }
  .est.warn { color: #D9BE8A; }
  .est.bad { color: #E0A0A0; }

  .status {
    margin: 5px 0 0;
    font: 400 9.5px/1.4 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
  }

  .acts { display: flex; gap: 4px; margin-top: 9px; }
  .acts button {
    flex: 1;
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 6px 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  .acts button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .acts button:disabled { opacity: 0.35; cursor: default; }
  .acts .go { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .acts .go:hover:not(:disabled) { border-color: #14B8A6; color: #C9FFF8; }
</style>
