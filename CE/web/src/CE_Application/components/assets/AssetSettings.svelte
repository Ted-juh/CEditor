<script>
  /**
   * The selected asset's own fields, and what you can do with it.
   *
   * NO SLIDERS, the same rule as the Effects and Typography tabs: numbers are `NumberCell` (its
   * label is a drag handle, its steppers are exact and the value is always typeable), and the two
   * two-way choices are `Segmented`. Nothing here has more than four options, so no select is
   * needed at all.
   *
   * The name is shown but not editable. The map key IS the name — `Generators.*.assetName` and
   * every part that copied the source refer to it — so a rename is a move with references to
   * follow, not a field. That is a separate job and pretending otherwise here would break links
   * silently.
   */
  import Download from 'lucide-svelte/icons/download';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Layers from 'lucide-svelte/icons/layers';
  import NumberCell from '../../properties/NumberCell.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import {
    assetFieldGroups,
    PACKAGE_POLICY_FIELDS,
    formatBytes,
    sourceLabel,
  } from '../../utils/assetsModel.js';

  let {
    entry = null,
    policy = null,
    layerName = '',
    onset = () => {},
    onpolicy = () => {},
    ondownload = () => {},
    onremove = () => {},
    onapply = () => {},
  } = $props();

  let groups = $derived(entry ? assetFieldGroups(entry.kind) : []);
  const titleCase = (value) => String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
</script>

<div class="settings">
  {#if entry}
    <div class="box">
      <div class="grp">Asset</div>
      <div class="r"><label for="asset-name">Name</label><div class="fixed" id="asset-name">{entry.name}</div></div>
      <div class="r"><label for="asset-src">Source</label><div class="fixed" id="asset-src" title={sourceLabel(entry)}>{sourceLabel(entry)}</div></div>
      <div class="r"><label for="asset-bytes">Size</label><div class="fixed" id="asset-bytes">{entry.hasSource ? formatBytes(entry.bytes) : 'empty'}</div></div>

      {#each groups as group (group.title)}
        <div class="grp">{group.title}</div>
        {#each group.fields as field (field.key)}
          <div class="r">
            <label for={`asset-${field.key}`}>{field.label}</label>
            {#if field.kind === 'number'}
              <div class="cell">
                <NumberCell
                  value={Number(entry[field.key] ?? 0)}
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  label={field.label}
                  onchange={(value) => onset(field.key, Math.round(value))}
                />
              </div>
            {:else if field.kind === 'choice'}
              <Segmented
                options={field.options.map((option) => ({ value: option, label: titleCase(option) }))}
                value={entry[field.key]}
                ariaLabel={field.label}
                onchange={(value) => onset(field.key, value)}
              />
            {:else if field.kind === 'toggle'}
              <Segmented
                options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]}
                value={entry[field.key] === true}
                ariaLabel={field.label}
                onchange={(value) => onset(field.key, value)}
              />
            {:else}
              <input
                class="txt"
                id={`asset-${field.key}`}
                type="text"
                value={String(entry[field.key] ?? '')}
                title={field.hint}
                onchange={(event) => onset(field.key, event.currentTarget.value)}
              />
            {/if}
          </div>
        {/each}
      {/each}

      <div class="acts">
        {#if entry.kind === 'image'}
          <button type="button" disabled={!entry.hasSource || !layerName} onclick={() => onapply('image')}
                  title={layerName ? `Use this image as ${layerName}'s fill` : 'No layer selected in the designer'}>
            <Layers size={11} /> Fill
          </button>
          <button type="button" disabled={!entry.hasSource || !layerName} onclick={() => onapply('overlay')}
                  title={layerName ? `Use this image as ${layerName}'s overlay` : 'No layer selected in the designer'}>
            <Layers size={11} /> Overlay
          </button>
        {/if}
        <button type="button" disabled={!entry.hasSource} onclick={ondownload} title="Save this asset to disk">
          <Download size={11} /> Save
        </button>
        <button type="button" class="danger" onclick={onremove} title={`Remove ${entry.name} from this component`}>
          <Trash2 size={11} /> Remove
        </button>
      </div>
    </div>
  {/if}

  <div class="box policy">
    <div class="grp">Packaging</div>
    {#each PACKAGE_POLICY_FIELDS as field (field.key)}
      <div class="r">
        <label for={`policy-${field.key}`}>{field.label}</label>
        <Segmented
          options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]}
          value={policy?.[field.key] !== false}
          ariaLabel={field.label}
          onchange={(value) => onpolicy(field.key, value)}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .settings { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

  .box {
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
    margin: 9px 0 2px;
    padding-bottom: 3px;
    border-bottom: 1px solid #262B30;
  }
  .grp:first-child { margin-top: 2px; }

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

  .fixed {
    min-width: 0;
    height: 24px;
    display: flex;
    align-items: center;
    padding: 0 6px;
    border: 1px solid #2A2F33;
    border-radius: 3px;
    background: #141719;
    font: 500 10px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #9AA6AE;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

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

  .acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
  .acts button {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 6px 6px;
    border-radius: 3px;
    cursor: pointer;
    min-width: 0;
  }
  .acts button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .acts button:disabled { opacity: 0.35; cursor: default; }
  .acts button.danger:hover:not(:disabled) { border-color: #D56B6B; color: #FFD9D9; }

  .policy .grp { margin-top: 2px; }
  /* The policy labels are sentences, not field names ("Warn on fonts"), so they get more room than
     the asset rows above them rather than wrapping to two lines in a 58px column. */
  .policy .r { grid-template-columns: 74px minmax(0, 1fr); }
</style>
