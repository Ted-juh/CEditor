<script>
  // AccessibilityTab — the dock's Access tool: can the panel be read, and what will a screen reader
  // call each control?
  //
  //   Names     every control somebody operates is announced by a name. Listed here: the ones whose
  //             name says nothing ("Knob 17", "tone1 lfo shape", a button still called "Button"),
  //             each with a field to type what it does into its Screen-reader text.
  //   Contrast  every text on the panel measured against what is behind it, as drawn (gradients and
  //             pictures included), against WCAG AA: 4.5:1, or 3:1 for large text.
  //
  // The rules are utils/accessibilityCheck.js and the measuring stores/accessibilityCheckRun.js; this
  // is the surface. Names follow the panel as it changes; contrast is measured on request, because
  // it draws the whole panel to do it.

  import { activePanel, selectComponent } from '../stores/panels.js';
  import { updateControlProperty } from '../stores/controls.js';
  import { nameFindings } from '../utils/accessibilityCheck.js';
  import { measureTextContrast } from '../stores/accessibilityCheckRun.js';

  let panel = $derived($activePanel);
  let names = $derived(panel ? nameFindings(panel.controls ?? []) : []);
  let weak = $derived(names.filter((finding) => finding.reason === 'says little'));
  // One row for every name several controls share, the biggest first.
  let shared = $derived.by(() => {
    const groups = new Map();
    for (const finding of names) {
      if (finding.reason !== 'shared') continue;
      const key = finding.spoken.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { spoken: finding.spoken, members: [] });
      groups.get(key).members.push(finding);
    }
    return [...groups.values()].sort((a, b) => b.members.length - a.members.length);
  });
  let drafts = $state({});

  let contrast = $state(null);
  let measuring = $state(false);
  let measuredFor = $state(null);

  function nameFor(id, value) {
    const text = String(value ?? '').trim();
    if (!text) return;
    updateControlProperty(id, 'Core.screenReaderText', text);
    drafts = { ...drafts, [id]: '' };
  }

  async function check() {
    measuring = true;
    try {
      contrast = await measureTextContrast();
      measuredFor = panel?.id ?? null;
    } finally {
      measuring = false;
    }
  }

  const ratioText = (value) => (value == null ? '—' : `${value.toFixed(value < 10 ? 1 : 0)}:1`);
  const SOURCE = { text: 'its own text', name: 'its name in the tree', caption: 'its caption', authored: 'its Screen-reader text' };
</script>

<div class="access" data-testid="access-tab">
  {#if !panel}
    <p class="muted">Open a panel to check it.</p>
  {:else}
    <section>
      <header>
        <h3>Names</h3>
        <span class="count" class:ok={!names.length}>{names.length ? `${weak.length + shared.length} to look at` : 'all told apart'}</span>
      </header>
      <p class="muted">What a screen reader says for each control in the player and the exported plug-in: its Screen-reader text, else the caption attached to it, else a button's own text, else its name in the tree.</p>
      {#if weak.length}
        <div class="sub">Only an id or a type</div>
        {#each weak as finding (finding.id)}
          <div class="row" data-testid="access-name">
            <button type="button" class="link" onclick={() => selectComponent(finding.id)} title="Select it on the canvas">{finding.controlName}</button>
            <span class="what">is read as “{finding.spoken}”, from {SOURCE[finding.source] ?? finding.source}</span>
            <input type="text" placeholder="What it does, e.g. Filter cutoff" aria-label={`Screen-reader text for ${finding.controlName}`}
                   value={drafts[finding.id] ?? ''}
                   oninput={(event) => { drafts = { ...drafts, [finding.id]: event.currentTarget.value }; }}
                   onkeydown={(event) => { if (event.key === 'Enter') nameFor(finding.id, event.currentTarget.value); }}
                   onblur={(event) => nameFor(finding.id, event.currentTarget.value)} />
          </div>
        {/each}
      {/if}
      {#if shared.length}
        <div class="sub">Read the same as others</div>
        <p class="muted">A listener cannot tell these apart. Give each its own Screen-reader text (Core tab), such as “Tone 1 fader view”.</p>
        {#each shared as group (group.spoken)}
          <div class="row group" data-testid="access-shared">
            <span class="what">“{group.spoken}” × {group.members.length}</span>
            <span class="chips">
              {#each group.members as member (member.id)}
                <button type="button" class="chip" onclick={() => selectComponent(member.id)} title="Select it on the canvas">{member.controlName}</button>
              {/each}
            </span>
          </div>
        {/each}
      {/if}
    </section>

    <section>
      <header>
        <h3>Text contrast</h3>
        <button type="button" class="btn" onclick={check} disabled={measuring} data-testid="access-check">{measuring ? 'Measuring…' : contrast ? 'Check again' : 'Check'}</button>
      </header>
      <p class="muted">Each text against what is drawn behind it, at WCAG AA: 4.5:1, or 3:1 for large text (24 px, or 19 px bold).</p>
      {#if contrast && !contrast.ok}
        <p class="warn">{contrast.reason}</p>
      {:else if contrast && measuredFor === panel.id}
        <p class="summary" data-testid="access-summary">
          {contrast.results.length} text{contrast.results.length === 1 ? '' : 's'} measured:
          {contrast.failing.length ? `${contrast.failing.length} too faint` : 'all readable'}{contrast.unmeasured.length ? `, ${contrast.unmeasured.length} painted with a gradient or picture (check by eye)` : ''}.
        </p>
        {#each contrast.failing as entry (entry.id)}
          <div class="row" data-testid="access-contrast">
            <button type="button" class="link" onclick={() => selectComponent(entry.id)} title="Select it on the canvas">{entry.controlName}</button>
            <span class="what">“{entry.text}”</span>
            <span class="ratio bad">{ratioText(entry.ratio)}</span>
            <span class="need">needs {entry.required}:1{entry.large ? ' (large)' : ''}</span>
          </div>
        {/each}
        {#each contrast.unmeasured as entry (entry.id)}
          <div class="row">
            <button type="button" class="link" onclick={() => selectComponent(entry.id)}>{entry.controlName}</button>
            <span class="what">“{entry.text}”: its colour is a gradient or picture</span>
          </div>
        {/each}
      {/if}
    </section>
  {/if}
</div>

<style>
  .access { display: flex; flex-direction: column; gap: 14px; padding: 10px 12px; color: #ccc; font-size: 12px; overflow-y: auto; height: 100%; box-sizing: border-box; }
  section { display: flex; flex-direction: column; gap: 6px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sub { margin-top: 4px; color: #aaa; font-size: 11px; font-weight: 600; }
  .row.group { align-items: flex-start; }
  .row.group .what { flex: 0 0 34%; white-space: normal; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 60%; min-width: 0; }
  .chip { border: 1px solid #3A3A3A; border-radius: 10px; background: #252526; color: #9FC8E4; font: inherit; font-size: 11px; padding: 1px 8px; cursor: pointer; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h3 { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #6FA8C7; }
  .count { font-size: 11px; color: #E8B95A; }
  .count.ok { color: #7CC18D; }
  .muted { margin: 0; color: #8F8F8F; font-size: 11px; line-height: 1.4; }
  .warn { margin: 0; color: #E8B95A; font-size: 11px; }
  .summary { margin: 0; color: #ccc; font-size: 11px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border: 1px solid #2E2E2E; border-radius: 4px; background: #1E1E1E; min-width: 0; }
  .link { background: none; border: 0; padding: 0; color: #9FC8E4; font: inherit; cursor: pointer; text-decoration: underline; flex: 0 0 auto; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what { flex: 1 1 auto; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .row input { flex: 0 1 220px; min-width: 120px; height: 22px; padding: 0 6px; border: 1px solid #3A3A3A; border-radius: 3px; background: #151515; color: #ddd; font: inherit; }
  .ratio { font-variant-numeric: tabular-nums; font-weight: 700; }
  .ratio.bad { color: #F08A7E; }
  .need { color: #8F8F8F; font-size: 11px; flex: 0 0 auto; }
  .btn { height: 24px; padding: 0 12px; border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>
