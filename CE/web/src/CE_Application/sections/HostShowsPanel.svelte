<script>
  /**
   * HostShowsPanel.svelte — shows: a whole evening in one file (HostShow.h).
   *
   * A show is the rig with its control pages, scenes, songs and setlist, and every sound those
   * songs and morphs point at. It is how a rig travels from the editor to a player, and how a
   * player keeps the evenings it plays. A player switches between them like anyone else; Stage
   * Lock is what stops it, as it stops every change to the rig.
   *
   * The rig itself is the session, saved after every change as always. Whether a change also
   * goes into the open show is the user's choice: kept apart, the show stays what it was and
   * Back to the show returns to it; saved, the show follows the rig.
   */
  import { onMount } from 'svelte';
  import {
    hostState, saveShow, openShow, revertShow, deleteShow, importShow, exportShow,
    setShowChanges, refreshShows,
  } from '../stores/instrumentHost.js';
  import HostConfirmButton from './HostConfirmButton.svelte';

  let shows = $derived($hostState.shows);
  let current = $derived(shows.current);
  // Opening another show throws away changes that were kept apart; it asks first.
  let unsaved = $derived(shows.changed && shows.changes === 'keep');
  let newName = $state('');

  onMount(() => refreshShows());

  function saveAs(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    saveShow(name);
    newName = '';
  }

  const isCurrent = (row) => current && current.file === row.file && current.builtIn === row.builtIn;
  const savedOn = (ms) => (ms > 0 ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
</script>

<div class="shows-panel" data-testid="host-shows-panel">
  <div class="shows-grid">
    <section class="shows-block">
      <strong>This show</strong>
      {#if current}
        <div class="current">
          <span class="current-name" data-testid="show-current-name">{current.name}</span>
          {#if current.builtIn}<span class="tag" title="It came with this program. Saving it keeps a copy here, in its place.">built in</span>{/if}
          {#if shows.changed}<span class="tag changed" data-testid="show-changed">changed</span>{/if}
        </div>
        <div class="actions">
          <button type="button" data-testid="show-save" onclick={() => saveShow()}
                  title="Save the rig as it is now into this show">Save show</button>
          {#if shows.changes === 'keep'}
            <HostConfirmButton identity={`revert:${current.file}`} data-testid="show-revert" disabled={!shows.changed}
                               title="Throw away the changes since the show was saved"
                               onclick={() => revertShow()}>Back to the show</HostConfirmButton>
          {/if}
        </div>
      {:else}
        <p class="note">This rig is not a show yet. Name it below to keep it, with every sound its songs use.</p>
      {/if}
      {#if shows.missing.length > 0}
        <p class="missing" role="status" data-testid="show-missing">
          This show needs plug-ins this computer does not have: {shows.missing.join(', ')}. Install them and
          scan in the Library utility; until then the parts that use them stay silent.
        </p>
      {/if}

      <form class="save-as" onsubmit={saveAs}>
        <input type="text" placeholder="New show name" aria-label="New show name" data-testid="show-new-name"
               bind:value={newName} />
        <button type="submit" data-testid="show-save-as" disabled={!newName.trim()}>Save as new show</button>
      </form>
    </section>

    <section class="shows-block">
      <strong>Shows</strong>
      {#if shows.list.length === 0}
        <p class="note">No shows yet.</p>
      {:else}
        <ul class="show-list" data-testid="show-list">
          {#each shows.list as row (`${row.builtIn}:${row.file}`)}
            <li class:current={isCurrent(row)} data-testid="show-row">
              <span class="row-name">{row.name}</span>
              {#if row.builtIn}<span class="tag">built in</span>{/if}
              <span class="row-date">{savedOn(row.savedAtMs)}</span>
              {#if isCurrent(row)}
                <span class="open-now">open</span>
              {:else if unsaved}
                <HostConfirmButton identity={`open:${row.file}`} class="open" data-testid="show-open"
                                   title={`Open ${row.name}. The changes to ${current.name} are not saved and will be lost.`}
                                   onclick={() => openShow(row.file, row.builtIn)}>Open</HostConfirmButton>
              {:else}
                <button type="button" class="ghost open" data-testid="show-open"
                        onclick={() => openShow(row.file, row.builtIn)}>Open</button>
              {/if}
              {#if !row.builtIn}
                <HostConfirmButton identity={`delete:${row.file}`} data-testid="show-delete"
                                   title={`Delete the show ${row.name}`}
                                   onclick={() => deleteShow(row.file)}>Delete</HostConfirmButton>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="shows-block">
      <strong>Other computers</strong>
      <p class="note">
        A show carries the rig, its control pages and songs, and the sounds they use. Plug-ins are never
        in it: the other computer needs them installed.
      </p>
      <div class="actions">
        <button type="button" data-testid="show-import" disabled={!shows.canPick}
                title={shows.canPick ? 'Open a show file, from a stick or a download, and keep it here' : 'Not available in the browser preview'}
                onclick={() => importShow()}>Import a show…</button>
        <button type="button" data-testid="show-export" disabled={!shows.canPick}
                title={shows.canPick ? 'Write this rig as a show file somewhere else' : 'Not available in the browser preview'}
                onclick={() => exportShow()}>Export this show…</button>
      </div>

      <strong class="sub">When the rig changes</strong>
      <label class="choice">
        <input type="radio" name="show-changes" value="keep" data-testid="show-changes-keep"
               checked={shows.changes === 'keep'} onchange={() => setShowChanges('keep')} />
        <span>Keep the changes apart until I save. <em>Back to the show</em> undoes them.</span>
      </label>
      <label class="choice">
        <input type="radio" name="show-changes" value="save" data-testid="show-changes-save"
               checked={shows.changes === 'save'} onchange={() => setShowChanges('save')} />
        <span>Save them into the show as I go.</span>
      </label>
    </section>
  </div>
</div>

<style>
  .shows-panel {
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
  }
  .shows-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
  .shows-block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .sub { margin-top: 8px; }
  .note { margin: 0; color: #7d8894; font-size: 11px; line-height: 1.45; }
  .missing { margin: 0; padding: 6px 8px; border: 1px solid #7a4a4a; border-radius: 4px;
    background: #2a1d1d; color: #e4b3b3; font-size: 12px; line-height: 1.4; }

  .current { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .current-name { color: #d6dbe0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { flex: none; padding: 1px 6px; border: 1px solid #3b4652; border-radius: 3px; color: #9aa5b1; font-size: 10px; }
  .tag.changed { border-color: #8a7444; color: #e2c98f; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

  .save-as { display: flex; gap: 6px; margin-top: 4px; }
  .save-as input { flex: 1; min-width: 0; }

  .show-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .show-list li { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 3px; font-size: 12px; }
  .show-list li.current { background: #1c2630; }
  .row-name { flex: 1; min-width: 0; color: #d6dbe0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-date { flex: none; color: #66707b; font-size: 11px; }
  .open-now { flex: none; color: #9fd6a3; font-size: 11px; padding: 0 8px; }

  .choice { display: flex; align-items: flex-start; gap: 6px; color: #aab5be; font-size: 12px; line-height: 1.4; }
  .choice input { margin-top: 2px; }
</style>
