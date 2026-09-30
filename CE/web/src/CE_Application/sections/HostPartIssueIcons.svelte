<script>
  import Unplug from 'lucide-svelte/icons/unplug';
  import Filter from 'lucide-svelte/icons/filter';
  import VolumeX from 'lucide-svelte/icons/volume-x';
  import Headphones from 'lucide-svelte/icons/headphones';
  import { floating } from '../utils/floatingUi.js';
  let { issues = [], onInspect = () => {} } = $props();
  const icons = { plug: Unplug, filter: Filter, level: VolumeX, solo: Headphones };
  let visible = $derived(issues.filter(issue => !issue.existing));
  // Below its icon, above it near the bottom, kept in the window and following it on scroll and resize
  // (utils/floatingUi.js) — it used to clamp only sideways, so a low icon's tip went off the bottom.
  let focusedTip = $state(null);
  function showTip(event, issue) {
    focusedTip = { id: issue.id, anchor: event.currentTarget };
  }
  function hideTip() { focusedTip = null; }
</script>

{#if visible.length}
  <span class="part-issue-icons" aria-label="Part diagnostics">
    {#each visible as issue (issue.id)}
      {@const Icon = icons[issue.icon]}
      <span class="issue-wrap">
        <button type="button" class="part-issue-icon" class:notice={issue.icon !== 'plug'}
                data-testid={`part-issue-${issue.id}`} title={issue.detail} aria-label={issue.detail}
                onfocus={(event) => showTip(event, issue)} onblur={hideTip}
                onkeydown={(event) => { event.stopPropagation(); if (event.key === 'Escape') hideTip(); }}
                onclick={(event) => { event.stopPropagation(); onInspect(issue); }}>
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {#if focusedTip?.id === issue.id}
          <span class="issue-tip" aria-hidden="true"
                use:floating={{ anchor: focusedTip.anchor, placement: 'bottom-start', offset: 4, padding: 8, fallbackPlacements: ['top-start', 'bottom-end', 'top-end'] }}>{issue.detail}</span>
        {/if}
      </span>
    {/each}
  </span>
{/if}

<style>
  .part-issue-icons { display: inline-flex; flex: none; align-items: center; gap: 2px; }
  .issue-wrap { position: relative; display: inline-flex; }
  :global(.host-workspace.host-workspace) .part-issue-icons .issue-wrap button.part-issue-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; min-height: 24px; padding: 2px;
    color: var(--host-pending); background: transparent; border-color: transparent;
  }
  :global(.host-workspace.host-workspace) .part-issue-icons .issue-wrap button.part-issue-icon.notice { color: var(--host-text-soft); }
  :global(.host-workspace.host-workspace) .part-issue-icons .issue-wrap button.part-issue-icon:hover,
  :global(.host-workspace.host-workspace) .part-issue-icons .issue-wrap button.part-issue-icon:focus-visible {
    background: var(--host-surface-hover); border-color: var(--host-line-strong);
  }
  .issue-tip { position: fixed; z-index: 200;
    width: max-content; max-width: 240px; padding: 6px 8px; border: 1px solid var(--host-line-strong);
    border-radius: 3px; background: var(--host-bg-deep); color: var(--host-text);
    font-size: 12px; font-weight: 400; line-height: 1.4; white-space: normal; pointer-events: none;
  }
</style>
