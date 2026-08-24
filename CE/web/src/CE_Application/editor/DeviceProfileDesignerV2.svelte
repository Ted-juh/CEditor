<script>
  // Device Profile Designer V2 — the in-program GUI rebuilt to match dpd-mockup-v2.html.
  // Stage 1: shell (titlebar + nav rail + stage + footer) and the hero Parameters screen,
  // backed by the new-DPD data layer bundled into the app. Other screens are placeholders.
  import './dpd/dpdDesigner.css';
  import './dpd/dpdScreens.css';
  import DpdParametersScreen from './dpd/DpdParametersScreen.svelte';
  import DpdOverviewScreen from './dpd/DpdOverviewScreen.svelte';
  import DpdDeviceStructureScreen from './dpd/DpdDeviceStructureScreen.svelte';
  import DpdMessageShapesScreen from './dpd/DpdMessageShapesScreen.svelte';
  import DpdBulkDumpsScreen from './dpd/DpdBulkDumpsScreen.svelte';
  import DpdAdvancedScreen from './dpd/DpdAdvancedScreen.svelte';
  import DpdDiscoveryScreen from './dpd/DpdDiscoveryScreen.svelte';
  import DpdPresetsScreen from './dpd/DpdPresetsScreen.svelte';
  import DpdShareImpactScreen from './dpd/DpdShareImpactScreen.svelte';
  import DpdCaptureScreen from './dpd/DpdCaptureScreen.svelte';
  import dpdLibrary from '../generated/dpd/dpdLibrary.json';
  import dpdProfileMap from '../generated/dpdProfileMap.json';
  import { resolveParams, resolveModel } from '../generated/dpd/resolve.mjs';
  import { validateProfile } from '../generated/dpd/validate.mjs';
  import { buildLegacyProfile } from '../generated/dpd/emit-legacy-core.mjs';
  import { saveProfileSource, requestProfileSource, latestProfileSourceSave, profileSources } from '../stores/deviceProfiles.js';
  import { familyLabel as familyLabelOf } from './dpd/dpdLabels.js';
  import { createDeviceProfileHistory, designerOwnsUndo } from './dpd/dpdHistory.js';
  import { activeEditorTab } from '../stores/panels.js';
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';

  import { deepClone } from '../utils/deepClone.js';
  let { profileId = '' } = $props();

  // Map an engine profileId to a new-DPD model: direct id, or via the legacy->dpd backlink map.
  function resolveDpdId(pid) {
    if (!pid) return null;
    if (dpdLibrary[pid]) return pid;
    const backing = dpdProfileMap[pid];
    if (backing?.dpdSource && dpdLibrary[backing.dpdSource]) return backing.dpdSource;
    return null;
  }

  // Editable working copy of the model, reset whenever the target profile changes. Seeded from the
  // bundled library; if the engine's saved profile carries an embedded dpdModel (from a prior save),
  // that edited source is adopted instead (see the effect below).
  let model = $state(null);
  let loadedFor = '__none__';
  let appliedSavedFor = null;
  $effect(() => {
    const pid = profileId;
    if (pid === loadedFor) return;
    loadedFor = pid;
    appliedSavedFor = null;
    saveStatus = '';
    const id = resolveDpdId(pid);
    model = id ? deepClone(dpdLibrary[id]) : null;
    if (pid) requestProfileSource(pid); // ask the engine for the saved source (no-op without the bridge)
  });

  // When the engine returns a saved source that embeds a dpdModel, adopt it once (round-trips edits).
  $effect(() => {
    const pid = profileId;
    const entry = $profileSources?.[pid];
    if (!entry?.source || appliedSavedFor === pid) return;
    appliedSavedFor = pid;
    try {
      const parsed = JSON.parse(entry.source);
      if (parsed?.dpdModel?.scopes) {
        // A different document arriving late, not an edit — see startsNewDocument().
        untrack(() => designerHistory?.startsNewDocument());
        model = deepClone(parsed.dpdModel);
      }
    } catch { /* keep the bundled model */ }
  });

  // --- Undo/redo ------------------------------------------------------------
  // Two of the five workspaces could not undo anything, this being one of them:
  // the screens edit `model` in place and stores/history.js only knew about
  // panels and components. The designer registers itself as a history context
  // instead — the decisions behind that live in dpd/dpdHistory.js, because a
  // .svelte file is compiled to its SSR form in the test run and no $effect in
  // here would ever run under `node --test`.

  let rootEl = $state(null);
  // Is the user's pointer or keyboard focus inside the designer? Only
  // load-bearing in the split shape (a panel tab with a designer companion),
  // where the panel keeps Ctrl+Z until the user reaches over. Deliberately a
  // plain `let` and not `$state`: nothing renders from it, and history calls
  // `isActive()` from inside other components' effects, where a reactive read
  // would hang a stray dependency on them.
  let focusWithin = false;
  let dirty = $state(false);
  // A designer opened with no profile can still adopt a discovered device, so it
  // needs a stack too — and a key of its own, or it would share one with
  // whichever profile opens next.
  let historyId = $derived(profileId || '(unassigned)');
  // $state so the observing effect below re-runs the moment this exists: on the
  // very first flush the registration would otherwise land after the first model
  // and the opening state would never reach history, costing the user their
  // first edit.
  let designerHistory = $state(null);

  $effect(() => {
    const id = historyId;
    // untrack, and this matters: registering re-baselines, which calls straight
    // back into the snapshot callback and reads the model. Left tracked, this
    // effect would depend on every field of the profile and re-run on every
    // keystroke — and re-registering DROPS the context's undo stack, so each
    // edit would wipe the history it had just made.
    const history = untrack(() => createDeviceProfileHistory({
      id,
      isActive: () => designerOwnsUndo({ activeTab: get(activeEditorTab), profileId, focusWithin }),
      // History hands back the object it stored, and the screens edit what they
      // are given in place, so this has to be a copy or the next edit would
      // rewrite the undo entry it came from.
      applyModel: (snapshot) => { model = deepClone(snapshot); },
    }));
    designerHistory = history;
    return () => history.dispose();
  });

  $effect(() => {
    const history = designerHistory;
    // The deep read IS the subscription: walking every leaf is what makes this
    // effect run again when a screen edits one five levels down. It costs one
    // plain copy of the model per edit — the same walk `merged` above already
    // does, and the one history would have had to make anyway to compare two
    // states.
    const snapshot = model ? $state.snapshot(model) : null;
    if (!history) return;
    untrack(() => { dirty = history.observe(snapshot); });
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    // Capture phase, on the document: a click inside the designer has to be seen
    // even when the thing clicked stops the event, and a click anywhere else has
    // to hand undo back to the panel.
    const track = (event) => {
      const target = event.target;
      focusWithin = rootEl != null && target instanceof Node && rootEl.contains(target);
    };
    document.addEventListener('pointerdown', track, true);
    document.addEventListener('focusin', track, true);
    return () => {
      document.removeEventListener('pointerdown', track, true);
      document.removeEventListener('focusin', track, true);
    };
  });

  let resolved = $derived(model ? resolveParams(model) : []);
  let validation = $derived(model ? validateProfile(model) : { ok: true, errors: [] });
  // $state.snapshot before resolve — resolveModel's internal structuredClone can't process the $state proxy.
  let merged = $derived(model ? resolveModel($state.snapshot(model), dpdLibrary) : null);

  // --- Save: resolve the new-schema model -> legacy engine profile -> persist via the bridge. ---
  let saveStatus = $state('');
  function save() {
    if (!model || !profileId) return;
    saveStatus = 'saving';
    try {
      // $state.snapshot -> a plain (non-proxy) deep copy; the resolver/clone can't handle the $state proxy.
      const plain = $state.snapshot(model);
      const merged = resolveModel(plain, dpdLibrary);
      const legacy = buildLegacyProfile(merged, { legacyId: profileId, embedDpdModel: plain });
      saveProfileSource(profileId, JSON.stringify(legacy, null, 2));
    } catch (e) {
      saveStatus = 'error: ' + (e?.message ?? 'build failed');
    }
  }
  $effect(() => {
    const s = $latestProfileSourceSave;
    if (!s || s.profileId !== profileId) return;
    saveStatus = s.running ? 'saving…' : s.ok ? 'Saved ✓' : ('error: ' + (s.error ?? 'save failed'));
    // The engine confirmed it, so this state is the one on disk: undoing back to
    // it must stop claiming unsaved changes.
    if (!s.running && s.ok) {
      untrack(() => designerHistory?.noteSaved());
      dirty = false;
    }
  });

  let activeScreen = $state('params');

  // Export the new-DPD model as a portable JSON file.
  function exportProfile() {
    if (!model) return;
    const blob = new Blob([JSON.stringify($state.snapshot(model), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.id ?? 'profile'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  let paramCount = $derived(resolved.length);
  let dumpCount = $derived(model?.dumps?.length ?? 0);
  let familyLabel = $derived(familyLabelOf(model));

  let nav = $derived([
    { group: 'Profile', items: [
      { id: 'detect', icon: '◉', label: 'Detect devices' },
      { id: 'overview', icon: '◉', label: 'Overview' },
      { id: 'params', icon: '▦', label: 'Parameters', count: paramCount },
      { id: 'capture', icon: '◎', label: 'Capture' },
      { id: 'dumps', icon: '⬓', label: 'Bulk dumps', count: dumpCount || undefined },
      { id: 'device', icon: '⚙', label: 'Device structure' },
      { id: 'messages', icon: '⬡', label: 'Message shapes', count: merged?.messageShapes?.length || undefined },
      { id: 'packing', icon: '◆', label: 'Packing Studio' },
      { id: 'advanced', icon: '⌬', label: 'Advanced' },
    ] },
    { group: 'Library', items: [
      { id: 'share', icon: '↗', label: 'Share & impact' },
      { id: 'import', icon: '⇪', label: 'Import result' },
      { id: 'presets', icon: '◈', label: 'Presets' },
      { id: 'assign', icon: '⊞', label: 'Assignable list', count: paramCount },
    ] },
  ]);

  const realScreens = new Set(['detect', 'params', 'overview', 'device', 'messages', 'dumps', 'advanced', 'presets', 'share', 'capture']);

  // Adopt a model discovered via MIDI-CI (or any source) into the editable working copy.
  // Deliberately NOT flagged as a new document: this replaces the contents of the
  // profile already open rather than opening another one, so it stays undoable —
  // picking the wrong device off a scan is exactly the mistake Ctrl+Z is for.
  function adoptModel(m) {
    if (!m) return;
    model = m;
    appliedSavedFor = profileId; // don't let the saved-source effect clobber the adopted model
    activeScreen = 'params';
  }
</script>

<div class="dpd-app" bind:this={rootEl}>
  <!-- Plain header — this is a tab inside CEditor, not an app of its own.
       (The mockup's fake macOS traffic lights + wordmark shipped here once.) -->
  <div class="titlebar">
    <div class="crumb">Device Profile Designer · <b>{model?.label ?? profileId ?? 'No profile'}</b></div>
    <div class="spacer"></div>
    {#if model}
      <div class="device-chip"><span class="led"></span>{model.label} · <b>v{model.version}</b></div>
    {/if}
  </div>

  <div class="body">
    <div class="side">
      <div class="profilecard">
        <div class="pn"><span class="led"></span>{model?.label ?? 'No new-DPD profile'}</div>
        <div class="pm">{familyLabel} family · {paramCount} params · {dumpCount} dumps</div>
      </div>

      <!-- Only screens that exist are navigable — a nav item that answers
           "not built yet" is an advertisement for missing functionality. -->
      {#each nav as section (section.group)}
        <div class="treelbl">{section.group}</div>
        {#each section.items.filter((item) => realScreens.has(item.id)) as item (item.id)}
          <div
            class={['tnode', activeScreen === item.id && 'active']}
            role="button" tabindex="0"
            onclick={() => activeScreen = item.id}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (activeScreen = item.id)}
          >
            <span class="ti">{item.icon}</span> {item.label}
            {#if item.count != null}<span class="ct">{item.count}</span>{/if}
          </div>
        {/each}
      {/each}

      <div class="addprofile">Drag any parameter onto a component to auto-assign it — enums fill comboboxes, ranges set min/max.</div>
    </div>

    <div class="stage">
      {#if !model}
        <div class="screen active">
          <DpdDiscoveryScreen onPick={adoptModel} />
        </div>
      {:else}
        <!-- Real screens — always mounted; visibility via .active per project tab convention -->
        <div class={['screen', activeScreen === 'detect' && 'active']}>
          <DpdDiscoveryScreen onPick={adoptModel} />
        </div>
        <div class={['screen', activeScreen === 'params' && 'active']}>
          <DpdParametersScreen {model} {resolved} {validation} />
        </div>
        <div class={['screen', activeScreen === 'overview' && 'active']}>
          <DpdOverviewScreen {model} {merged} />
        </div>
        <div class={['screen', activeScreen === 'device' && 'active']}>
          <DpdDeviceStructureScreen {model} {merged} />
        </div>
        <div class={['screen', activeScreen === 'messages' && 'active']}>
          <DpdMessageShapesScreen {merged} />
        </div>
        <div class={['screen', activeScreen === 'dumps' && 'active']}>
          <DpdBulkDumpsScreen {model} {merged} />
        </div>
        <div class={['screen', activeScreen === 'advanced' && 'active']}>
          <DpdAdvancedScreen {model} {profileId} onApplyModel={(m) => { model = m; appliedSavedFor = profileId; }} />
        </div>
        <div class={['screen', activeScreen === 'presets' && 'active']}>
          <DpdPresetsScreen {model} {merged} {profileId} />
        </div>
        <div class={['screen', activeScreen === 'share' && 'active']}>
          <DpdShareImpactScreen {model} {merged} {profileId} />
        </div>
        <div class={['screen', activeScreen === 'capture' && 'active']}>
          <DpdCaptureScreen {model} {profileId} />
        </div>

      {/if}
    </div>
  </div>

  {#if model}
    <div class="stagefoot">
      <!-- The dirty mark is the visible half of the undo wiring: history knows
           which state was last saved, so undoing back to it clears this again
           instead of leaving it stuck on. -->
      <div class="ft">Editing the new-DPD model for <b>{model.id}</b>{#if dirty} · <b>unsaved changes</b>{/if}{#if saveStatus} · <b style="color:var(--accent)">{saveStatus}</b>{/if}</div>
      <button class="btn" onclick={() => save()}>Save to engine</button>
      <button class="btn primary" onclick={() => exportProfile()}>Export portable profile ⇩</button>
    </div>
  {/if}
</div>
