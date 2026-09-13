<script>
  import Unplug from 'lucide-svelte/icons/unplug';
  import Filter from 'lucide-svelte/icons/filter';
  import VolumeX from 'lucide-svelte/icons/volume-x';
  import Headphones from 'lucide-svelte/icons/headphones';
  let { issues = [], onInspect = () => {} } = $props();
  const icons = { plug: Unplug, filter: Filter, level: VolumeX, solo: Headphones };
  let visible = $derived(issues.filter(issue => !issue.existing));
  let focusedTip = $state(null);
  let tipAnchor;
  let tipIssue;
  function showTip(event, issue) {
    tipAnchor = event.currentTarget;
    tipIssue = issue;
    positionTip();
  }
  function positionTip() {
    if (!tipAnchor) return;
    const rect = tipAnchor.getBoundingClientRect();
    focusedTip = { id: tipIssue.id, left: Math.max(8, Math.min(rect.left, window.innerWidth - 256)),
      top: rect.bottom + 4 };
  }
  function hideTip() { tipAnchor = null; focusedTip = null; }
</script>

<svelte:window onresize={positionTip} />
<svelte:document onscrollcapture={positionTip} />

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
                style={`left:${focusedTip.left}px;top:${focusedTip.top}px`}>{issue.detail}</span>
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
