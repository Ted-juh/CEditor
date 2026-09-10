<script>
  /**
   * The selected package: what it is, what it publishes, and the two ways to use it.
   *
   * The two ways matter, because the application has only ever offered one of them from this data
   * and it is the destructive one. `CustomPackageLibrary`'s single use action is
   * `applyLibraryEntryToCurrent` — it overwrites every section of the component you have selected.
   * Useful, and not what "use a saved component" usually means. Placing a copy on the panel goes
   * through `addCustomComponentPackage`, which the library section has never called.
   *
   * So both are here, named for what they do, with the destructive one saying whose sections it is
   * about to replace.
   */
  import Plus from 'lucide-svelte/icons/plus';
  import Replace from 'lucide-svelte/icons/replace';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { relativeTime, thumbnailLoss } from '../../utils/componentLibraryModel.js';

  let {
    row = null,
    targetName = '',
    canPlace = true,
    canReplace = false,
    onplace = () => {},
    onreplace = () => {},
    onremove = () => {},
  } = $props();

  let loss = $derived(row ? thumbnailLoss(row) : null);
</script>

{#if row}
  <div class="setbox">
    <div class="grp">Package</div>
    <div class="r"><label for="lib-name">Name</label><div class="f" id="lib-name">{row.name}</div></div>
    <div class="r"><label for="lib-version">Version</label><div class="f" id="lib-version">{row.version}</div></div>
    <div class="r"><label for="lib-author">Author</label><div class="f" id="lib-author">{row.author || 'unknown'}</div></div>
    <div class="r"><label for="lib-saved">Saved</label><div class="f" id="lib-saved">{relativeTime(row.savedAt) || '—'}</div></div>
    {#if row.tags.length}
      <div class="tags">{#each row.tags as tag (tag)}<em>{tag}</em>{/each}</div>
    {/if}

    <div class="grp">Publishes</div>
    <div class="metrics">
      <span><b>{row.parts}</b> parts</span>
      <span><b>{row.valueChannels}</b> values</span>
      <span><b>{row.publicInputs}</b> in</span>
      <span><b>{row.publicOutputs}</b> out</span>
      <span><b>{row.editableProperties}</b> props</span>
      <span><b>{row.readiness}%</b> ready</span>
    </div>

    {#if !row.valid}
      <div class="bad">
        <b>{row.issues.length} {row.issues.length === 1 ? 'issue' : 'issues'} in this package.</b>
        {#each row.issues.slice(0, 3) as issue (issue)}<span>{issue}</span>{/each}
        {#if row.issues.length > 3}<span>…and {row.issues.length - 3} more.</span>{/if}
      </div>
    {/if}

    {#if loss}
      <div class="note">
        The properties panel's own thumbnail of this package draws <b>{loss.message}</b> —
        {loss.lostFromBottom} missing from the bottom of the layer stack and {loss.lostFromTop} from
        the top. The picture above is the real renderer.
      </div>
    {/if}

    <div class="grp">Use it</div>
    <div class="acts">
      <button type="button" class="go" disabled={!canPlace} onclick={() => onplace(row)}
              title={canPlace ? 'Add a copy to the current panel' : 'Open a panel first'}>
        <Plus size={11} /> Place a copy
      </button>
      <button type="button" disabled={!canReplace} onclick={() => onreplace(row)}
              title={canReplace ? `Overwrite every section of ${targetName} with this package` : 'Select a custom component to replace'}>
        <Replace size={11} /> Replace {targetName || 'selection'}
      </button>
      <button type="button" class="danger" onclick={() => onremove(row)} title={`Remove ${row.name} from the library`}>
        <Trash2 size={11} /> Forget
      </button>
    </div>
    {#if canReplace}
      <p class="caution">Replacing swaps every section of <b>{targetName}</b> for this package's. Its position stays.</p>
    {/if}
  </div>
{:else}
  <p class="none">Pick a saved component to see what it publishes.</p>
{/if}

<style>
  .setbox { border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 6px 8px 9px; }

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
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }
  .r > label {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

  .f {
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

  .tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
  .tags em {
    font: 500 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    font-style: normal;
    color: #8FA4B0;
    border: 1px solid #2E3540;
    border-radius: 2px;
    padding: 3px 5px;
  }

  .metrics { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 7px; }
  .metrics span { font: 400 9px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }
  .metrics b { color: #C3D0DA; font-weight: 600; }

  .bad {
    margin-top: 8px;
    border: 1px solid #5C3A3A;
    background: #241616;
    border-radius: 4px;
    padding: 6px 8px;
    font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #D98C8C;
  }
  .bad b { display: block; color: #F0B0A8; font-weight: 600; }
  .bad span { display: block; }

  .note {
    margin-top: 8px;
    border: 1px solid #333B42;
    background: #12171A;
    border-radius: 4px;
    padding: 6px 8px;
    font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
  }
  .note b { color: #C3D0DA; font-weight: 600; }

  .acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
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
    padding: 6px;
    border-radius: 3px;
    cursor: pointer;
    min-width: 0;
  }
  .acts button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .acts button:disabled { opacity: 0.35; cursor: default; }
  .acts .go { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; flex-basis: 100%; }
  .acts .go:hover:not(:disabled) { border-color: #14B8A6; color: #C9FFF8; }
  .acts .danger:hover:not(:disabled) { border-color: #D56B6B; color: #FFD9D9; }

  .caution {
    margin: 6px 0 0;
    font: 400 8.5px/1.45 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A7340;
  }
  .caution b { color: #D9BE8A; font-weight: 600; }

  .none {
    margin: 0;
    padding: 16px 10px;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
