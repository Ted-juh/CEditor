<script>
  // Share & impact — publish the profile, and see what editing it would break.
  //
  // The screen sat in the nav as a "not built yet" stub, then as a dimmed badge. It is two
  // questions that turn out to be one:
  //
  //   SHARE  — what goes out when somebody else gets this profile, and what is stripped because it
  //            describes this machine rather than the instrument.
  //   IMPACT — who already depends on it. A binding names a parameter by STRING id: rename one and
  //            every control pointing at the old id keeps pointing at nothing. No error, no
  //            warning, the knob just stops moving the synth, and the fault looks like a cable.
  //
  // They are one screen because they are the same moment: before you publish a profile other people
  // will build panels on, and before you edit one your own panels already use, what you need to
  // know is what you are about to change out from under somebody.
  //
  // THE ANALYSIS IS NOT HERE. `utils/profileImpact.js` is pure and tested; this renders it.

  import { panels } from '../../stores/panels.js';
  import { deviceRoleMappings, profileSources } from '../../stores/deviceProfileStores.js';
  import {
    impactOfChange, collectBindings, profileConsumers, shareManifest, shareReadiness,
  } from '../../utils/profileImpact.js';

  let { model, merged, profileId = '' } = $props();

  // The published profile is what is stored in the engine; `model` is the working copy. The
  // difference between them IS the impact, which is why nothing else has to be diffed by hand.
  let saved = $derived.by(() => {
    const source = $profileSources?.[profileId]?.source;
    if (!source) return null;
    try { return JSON.parse(source); } catch { return null; }
  });

  let roleProfiles = $derived(Object.fromEntries(
    Object.entries($deviceRoleMappings ?? {}).map(([role, mapping]) => [role, String(mapping?.profileId ?? '')]),
  ));

  let consumers = $derived(profileConsumers(profileId, $panels, roleProfiles));
  let bindings = $derived(collectBindings($panels, roleProfiles).filter((b) => b.profileId === profileId));
  let impact = $derived(saved ? impactOfChange(saved, merged ?? model, bindings) : null);
  let manifest = $derived(shareManifest(merged ?? model));
  let readiness = $derived(shareReadiness(merged ?? model));

  const KIND_LABEL = {
    removed: 'Removed',
    renamed: 'Renamed',
    retyped: 'Type changed',
    narrowed: 'Range narrowed',
  };
</script>

<div class="dpd-screen">
  <h2>Share &amp; impact</h2>

  <!-- Impact first, deliberately. Somebody opening this screen is usually about to publish, and
       "who breaks" is the question they should answer before "what goes out". -->
  <section class="card">
    <div class="card-head">
      <h3>What this edit would change</h3>
      {#if impact}
        <span class="pill" class:good={impact.safe} class:bad={!impact.safe}>
          {impact.safe
            ? (impact.findings.length ? 'nothing of yours breaks' : 'nothing breaks')
            : `${impact.affectedBindings} binding${impact.affectedBindings === 1 ? '' : 's'} affected`}
        </span>
      {/if}
    </div>

    {#if !saved}
      <p class="note">This profile has not been saved to the engine yet, so there is no published
        version to compare against. Save it once and this becomes a running diff of what your edits
        would do to panels already using it.</p>
    {:else if impact.findings.length === 0}
      <p class="note">Every parameter a panel binds to is still here, with the same id, type and
        range. {#if impact.added > 0}{impact.added} new parameter{impact.added === 1 ? '' : 's'} added — new ones break nothing.{/if}</p>
    {:else}
      <table class="grid">
        <thead>
          <tr><th>Change</th><th>Parameter</th><th>What happens</th><th class="num">Bindings</th></tr>
        </thead>
        <tbody>
          {#each impact.findings as finding (finding.parameterId + finding.kind)}
            <tr class:severe={finding.bindings.length > 0}>
              <td><span class="kind {finding.kind}">{KIND_LABEL[finding.kind] ?? finding.kind}</span></td>
              <td><code>{finding.parameterId}</code><br /><span class="dim">{finding.label}</span></td>
              <td>{finding.detail}</td>
              <td class="num">
                {#if finding.bindings.length}
                  <b>{finding.bindings.length}</b>
                  <div class="dim small">
                    {[...new Set(finding.bindings.map((b) => b.controlName))].slice(0, 3).join(', ')}
                    {#if finding.bindings.length > 3}…{/if}
                  </div>
                {:else}—{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="note">A <b>rename</b> reads as harmless in a diff — the parameter is still there
        under a new name — and is exactly as broken as a removal, because a binding names the old id.
        A <b>narrowed range</b> only counts bound controls whose own travel still runs past the new
        limit; the rest were never going to send an out-of-range value.</p>
    {/if}
  </section>

  <section class="card">
    <div class="card-head">
      <h3>Who depends on this profile</h3>
      <span class="pill">{consumers.total} binding{consumers.total === 1 ? '' : 's'}</span>
    </div>

    {#if consumers.total === 0}
      <p class="note">No panel binds to this profile yet, so nothing here can break. That is the
        moment to make the parameter ids what you want them to be — after panels exist, renaming one
        costs somebody a broken control.</p>
    {:else}
      <p class="note">Across {consumers.panels.length} panel{consumers.panels.length === 1 ? '' : 's'}:
        {consumers.panels.join(', ')}. Sorted by how many controls point at each parameter — the ones
        at the top are the ones to leave alone.</p>
      <table class="grid">
        <thead><tr><th>Parameter</th><th class="num">Controls</th><th>Where</th></tr></thead>
        <tbody>
          {#each consumers.parameters.slice(0, 40) as row (row.parameterId)}
            <tr>
              <td><code>{row.parameterId}</code></td>
              <td class="num"><b>{row.count}</b></td>
              <td class="dim">{row.bindings.slice(0, 4).map((b) => b.controlName).join(', ')}{#if row.count > 4}…{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if consumers.parameters.length > 40}
        <p class="note">{consumers.parameters.length - 40} more parameters have bindings — not listed,
          rather than quietly cut off at forty with no sign of it.</p>
      {/if}
    {/if}
  </section>

  <section class="card">
    <div class="card-head">
      <h3>What goes out when you share it</h3>
      <span class="pill" class:good={readiness.ready} class:bad={!readiness.ready}>
        {readiness.ready ? 'ready to share' : 'incomplete'}
      </span>
    </div>

    <div class="stats">
      <div><b>{manifest.parameters}</b><span>parameters</span></div>
      <div><b>{manifest.messageShapes}</b><span>message shapes</span></div>
      <div><b>{manifest.dumps}</b><span>bulk dumps</span></div>
      <div><b>{manifest.presets}</b><span>preset slots</span></div>
    </div>

    {#if readiness.missing.length}
      <p class="note warn">Missing: {readiness.missing.join(' · ')}. A profile can be valid and still
        be no use to anybody else — that is a softer question than the validator's and this is where
        it gets asked.</p>
    {/if}

    {#if manifest.stripped.length}
      <p class="note">Stripped before sharing: <code>{manifest.stripped.join('</code>, <code>')}</code>.
        A profile describes an <b>instrument</b>; anything in it that describes <b>this machine</b> —
        the ports a synth happened to be plugged into, a device id set for one rig — is noise to the
        next person and says more about the author's setup than they meant to send.</p>
    {:else}
      <p class="note">Nothing machine-specific to strip — this profile is already only about the
        instrument.</p>
    {/if}

    <p class="note">Use <b>Export portable profile</b> in the footer to write the file. It is the
      same profile this page describes, with the keys above removed.</p>
  </section>
</div>

<style>
  .dpd-screen { padding: 16px 18px; overflow-y: auto; height: 100%; }
  h2 { font-size: 15px; margin: 0 0 14px; font-weight: 600; }
  h3 { font-size: 12px; margin: 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

  .card {
    border: 1px solid var(--line, #333); border-radius: 7px; padding: 12px 14px;
    margin-bottom: 12px; background: var(--panel2, #232323);
  }
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
  .card-head h3 { flex: 1; }

  .pill {
    border: 1px solid #3A3A44; border-radius: 10px; background: #1D1D22;
    color: #999; font-size: 10px; padding: 2px 8px; white-space: nowrap;
  }
  .pill.good { color: #39D98A; border-color: #2A5A44; }
  .pill.bad { color: #F2C94C; border-color: #6A5A24; }

  .note { color: #888; font-size: 11px; line-height: 1.55; margin: 8px 0 0; }
  .note.warn { color: #F2C94C; }
  .note code { color: #AAA; }

  .grid { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
  .grid th {
    text-align: left; color: #777; font-weight: 500; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.4px; padding: 4px 6px;
    border-bottom: 1px solid #333;
  }
  .grid td { padding: 5px 6px; border-bottom: 1px solid #2A2A2A; vertical-align: top; }
  .grid .num { text-align: right; white-space: nowrap; }
  .grid tr.severe td { background: rgba(242, 201, 76, 0.05); }
  .dim { color: #777; }
  .small { font-size: 10px; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px; }

  .kind {
    border-radius: 3px; font-size: 9px; padding: 1px 5px; white-space: nowrap;
    text-transform: uppercase; letter-spacing: 0.4px;
    border: 1px solid #4A3A24; color: #F2C94C; background: #2A2418;
  }
  .kind.removed { border-color: #5A2A2A; color: #E57373; background: #2A1A1A; }

  .stats { display: flex; gap: 18px; flex-wrap: wrap; margin: 6px 0 2px; }
  .stats div { display: flex; flex-direction: column; }
  .stats b { font-size: 17px; font-weight: 600; }
  .stats span { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
</style>
