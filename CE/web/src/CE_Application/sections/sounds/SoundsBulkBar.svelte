<script>
  /**
   * What you can do to several sounds at once, shown while more than one is selected: favourite,
   * rate, tag, file into a collection, fold away, or compare two to four side by side. Each one
   * is the same edit the inspector makes to one sound, made to every selected sound.
   */
  import { hostLibrary, setLibraryUserMetadata, setLibraryRecordHidden } from '../../stores/instrumentHost.js';
  import { canonicalTag } from '../../utils/tagVocabulary.js';

  let { records = [], oncompare = () => {}, onclear = () => {} } = $props();

  const allFavourite = $derived(records.length > 0 && records.every((r) => r.favourite));
  let tagDraft = $state('');
  let collectionDraft = $state('');
  let menu = $state('');   // '' | 'rate' | 'tag' | 'collection'

  const each = (fields) => { for (const r of records) setLibraryUserMetadata(r.recordId, fields(r)); };
  function tagAll() {
    const tag = canonicalTag(tagDraft);
    if (!tag) return;
    each((r) => ({ tags: r.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? r.tags : [...r.tags, tag] }));
    tagDraft = '';
    menu = '';
  }
  function fileAll(name) {
    const text = String(name ?? '').trim();
    if (!text) return;
    each((r) => ({ collections: r.collections.includes(text) ? r.collections : [...r.collections, text] }));
    collectionDraft = '';
    menu = '';
  }
</script>

<div class="bulk" data-testid="sounds-bulk">
  <b>{records.length} selected</b>
  <button type="button" data-testid="bulk-favourite" onclick={() => each(() => ({ favourite: !allFavourite }))}>
    {allFavourite ? '☆ Unfavourite' : '★ Favourite'}</button>
  <button type="button" class:on={menu === 'rate'} data-testid="bulk-rate" onclick={() => (menu = menu === 'rate' ? '' : 'rate')}>Rate…</button>
  <button type="button" class:on={menu === 'tag'} data-testid="bulk-tag" onclick={() => (menu = menu === 'tag' ? '' : 'tag')}>Tag…</button>
  <button type="button" class:on={menu === 'collection'} data-testid="bulk-collection"
          onclick={() => (menu = menu === 'collection' ? '' : 'collection')}>Add to…</button>
  <button type="button" data-testid="bulk-fold" title="Fold them out of the browse. Nothing is deleted; Folded away brings them back."
          onclick={() => { for (const r of records) setLibraryRecordHidden(r.recordId, true); onclear(); }}>Fold away</button>
  <button type="button" data-testid="bulk-compare" disabled={records.length < 2 || records.length > 4}
          title={records.length > 4 ? 'Compare takes two to four' : 'Side by side, on the same phrase'}
          onclick={oncompare}>Compare {Math.min(records.length, 4)}</button>
  <span class="spacer"></span>
  <button type="button" class="ghost" data-testid="bulk-clear" onclick={onclear}>Clear</button>

  {#if menu === 'rate'}
    <div class="menu" role="group" aria-label="Rate the selected sounds">
      {#each [1, 2, 3, 4, 5] as star (star)}
        <button type="button" data-testid="bulk-rate-value" onclick={() => { each(() => ({ rating: star })); menu = ''; }}>{'★'.repeat(star)}</button>
      {/each}
      <button type="button" class="ghost" onclick={() => { each(() => ({ rating: 0 })); menu = ''; }}>No rating</button>
    </div>
  {:else if menu === 'tag'}
    <div class="menu">
      <input type="text" placeholder="Tag, then Enter" aria-label="Tag the selected sounds" data-testid="bulk-tag-name"
             bind:value={tagDraft} onkeydown={(e) => { if (e.key === 'Enter') tagAll(); if (e.key === 'Escape') menu = ''; }} />
    </div>
  {:else if menu === 'collection'}
    <div class="menu">
      {#each $hostLibrary.collections as collection (collection.name)}
        <button type="button" data-testid="bulk-collection-name" onclick={() => fileAll(collection.name)}>{collection.name}</button>
      {/each}
      <input type="text" placeholder="New collection, then Enter" aria-label="New collection for the selected sounds"
             data-testid="bulk-new-collection" bind:value={collectionDraft}
             onkeydown={(e) => { if (e.key === 'Enter') fileAll(collectionDraft); if (e.key === 'Escape') menu = ''; }} />
    </div>
  {/if}
</div>

<style>
  .bulk { position: relative; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: none;
          padding: 6px 10px; background: #1d2a36; border-bottom: 1px solid #36597a; font-size: 12px; }
  .bulk b { color: #79b9ee; margin-right: 4px; }
  .spacer { flex: 1; }
  .menu { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding-top: 4px; }
  .menu input { width: 220px; }
</style>
