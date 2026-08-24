<script>
  // Capture — learn a synth from the synth.
  //
  // One guided surface, not a table. The session is a conversation with three states and this shows
  // exactly one of them at a time: Setup (which mode is available and why, and the volatile
  // baseline), Capture (one prompt, the live diff, the hypothesis in plain language) and Confirm
  // (name it, and the Test button whose answer is the ground truth).
  //
  // THE INFERENCE IS NOT HERE. `utils/captureInference.js` reads the bytes and
  // `utils/captureSession.js` is the state machine; both are pure and both are tested against a
  // simulated synth with a known map, a checksum over a range that excludes the header, a
  // deliberate bit-field and a volatile counter. This file is the conversation.
  //
  // THE PANEL SENDS NOTHING WHILE A CAPTURE IS RUNNING except an explicit dump request. The panel
  // sends, the device echoes, the session learns its own transmission and is delighted with itself
  // — that is the likeliest way to ship something that demos beautifully and is wrong.

  import Radio from 'lucide-svelte/icons/radio';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  import {
    CAPTURE_MODE, CAPTURE_STATE, SENDS_DURING_CAPTURE, acceptHypothesis, addBaseline, beginCapture,
    chooseMode, discardHypothesis, newSession, readyToCapture, recordDump, sessionHarvest,
    sessionSummary, toConfirm, undoLast, BASELINE_COUNT, ECHO_WINDOW_MS,
    applyPastedNames, namesFromPaste, sessionReport,
    baselineAgeHours, normalizeCaptureSession, touchCaptureSession,
  } from '../../utils/captureSession.js';
  import { activePanel, updatePanel } from '../../stores/panels.js';
  import { CONFIDENCE } from '../../utils/captureInference.js';
  import { cinfo, cwarn } from '../../stores/console.js';

  let { model, profileId = '', requestDump = null, deviceTransmits = false, deviceDumps = true } = $props();

  // SAVE AND RESUME (S5), and the panel document is where a session lives — beside `deviceSession`,
  // so it survives whatever the panel survives and travels between machines with the file.
  //
  // Adopted once per panel rather than on every change to `$activePanel`: the panel object is
  // rewritten every time this screen writes back, and re-adopting from it would fight whatever the
  // author is doing right now.
  let session = $state(null);
  let adoptedFrom = $state(null);
  // Set when this session came off disk rather than being started here. Drives the banner, and
  // cleared the moment the baselines are retaken.
  let resumed = $state(false);

  $effect(() => {
    const panel = $activePanel;
    if (!panel || adoptedFrom === panel.id) return;
    adoptedFrom = panel.id;
    const stored = normalizeCaptureSession(panel.captureSession);
    session = stored;
    resumed = !!stored;
  });

  /** Write the session back to the panel. Stamped here so the state machine stays pure. */
  function persist(next) {
    session = next;
    const panel = $activePanel;
    if (!panel) return;
    updatePanel(panel.id, {
      captureSession: next ? touchCaptureSession(next, new Date().toISOString()) : null,
    });
  }

  /**
   * Throw away the restored baselines and take three fresh ones.
   *
   * What the banner is FOR. `recordDump` diffs every dump against `baselines.at(-1)` through the
   * stored `mask`, so a session resumed after a power-cycle, a patch change, or a different unit on
   * the same port is measuring against a description of the device that no longer holds. A big
   * change surfaces honestly as `packed` or `inconsistent`; a small one looks like a parameter and
   * is wrong. What is learned is kept — it is the hour of work — and only the perishable half goes.
   */
  function retakeBaselines() {
    resumed = false;
    persist({
      ...session,
      state: CAPTURE_STATE.setup,
      baselines: [],
      mask: [],
      checksum: null,
      observations: [],
      messages: [],
      hypothesis: null,
    });
  }

  let name = $state('');
  let group = $state('');
  let verified = $state(false);

  let modeChoice = $derived(chooseMode({
    transmitsOnEdit: deviceTransmits,
    answersDumpRequest: deviceDumps,
    hasProfile: (model?.parameters?.length ?? 0) > 0,
  }));

  let harvest = $derived(session ? sessionHarvest(session) : null);
  let baselineAge = $derived(session ? baselineAgeHours(session, new Date().toISOString()) : null);
  let baselineAgeLabel = $derived(
    baselineAge === null ? ''
      : baselineAge < 1 ? 'less than an hour ago'
        : baselineAge < 24 ? `${baselineAge} hour${baselineAge === 1 ? '' : 's'} ago`
          : `${Math.floor(baselineAge / 24)} day${Math.floor(baselineAge / 24) === 1 ? '' : 's'} ago`,
  );

  // Bulk naming and the report — the two pieces of S5 that are pure functions over what the session
  // already holds. Save/resume is the third and is not built; it needs somewhere to put a session.
  let pasting = $state(false);
  let pasteText = $state('');
  let reportCopied = $state(false);
  let pastePlan = $derived(session && pasteText.trim() ? namesFromPaste(pasteText, session) : null);

  function applyPaste() {
    if (!pastePlan) return;
    persist(applyPastedNames(session, pastePlan.pairs));
    pasteText = '';
    pasting = false;
  }
  async function copyReport() {
    if (!session) return;
    const text = sessionReport(session);
    try {
      await navigator.clipboard?.writeText(text);
      reportCopied = true;
      setTimeout(() => { reportCopied = false; }, 1500);
    } catch {
      // No clipboard (a locked-down webview, a denied permission). The report is still worth
      // producing, so it goes to the console rather than nowhere.
      cinfo(text);
    }
  }

  /**
   * A dump, from the device or — with no device attached — refused rather than faked.
   *
   * A capture screen that invents a payload would produce a profile with high confidence and no
   * relationship to any instrument, which is worse than one that says it cannot run.
   */
  async function takeDump() {
    if (typeof requestDump !== 'function') {
      cwarn('[capture] No dump source. Connect the device on the MIDI tab first.');
      return null;
    }
    const payload = await requestDump();
    if (!Array.isArray(payload) || payload.length === 0) {
      cwarn('[capture] The device did not answer the dump request.');
      return null;
    }
    return payload;
  }

  function start() {
    resumed = false;
    persist(newSession({ mode: modeChoice.mode, profileId, now: new Date().toISOString() }));
    cinfo(`[capture] ${modeChoice.why}`);
  }

  async function baseline() {
    const payload = await takeDump();
    if (payload) persist(addBaseline(session, payload));
  }

  function go() {
    persist(beginCapture(session));
  }

  async function captured() {
    const payload = await takeDump();
    if (payload) session = recordDump(session, payload);
  }

  function keep() {
    persist(acceptHypothesis(session, { id: name.trim(), label: name.trim(), group: group.trim(), verified, now: new Date().toISOString() }));
    name = '';
    group = '';
    verified = false;
  }

  const CONFIDENCE_LABEL = {
    [CONFIDENCE.confirmed]: 'confirmed',
    [CONFIDENCE.probable]: 'probable',
    [CONFIDENCE.candidate]: 'a guess',
    [CONFIDENCE.conflict]: 'in conflict',
  };
</script>

<div class="dpd-screen">
  <h2>Capture</h2>

  <!-- RESUMED, with the age of the baseline in it. The baselines were restored along with
       everything else, which is the fast path and the one where a stale baseline can still produce
       a plausible wrong parameter — so the banner has to be actionable rather than decorative. The
       age is what makes it so: "four minutes ago" is fine, "nine days ago" is a different synth. -->
  {#if session && resumed}
    <div class="notice resumed">
      <TriangleAlert size={12} />
      <div>
        <b>Resumed from this panel</b> — {session.learned?.length ?? 0} parameter{(session.learned?.length ?? 0) === 1 ? '' : 's'} already learned{#if baselineAge !== null}, baseline taken <b>{baselineAgeLabel}</b>{/if}.
        <p>Every new dump is measured against that baseline. If the synth has been power-cycled,
          had a different patch loaded, or is a different unit on the same port, the comparison is
          against a device that no longer exists — and a small difference reads as a parameter
          rather than as a mismatch.</p>
      </div>
      <button class="btn small" onclick={retakeBaselines}>Retake baselines</button>
    </div>
  {/if}

  {#if !session}
    <section class="card">
      <div class="card-head"><h3>Before you start</h3></div>
      <p class="lead">Put the device in the room, press Learn, and turn a knob <b>on the hardware</b>.
        A synth already describes itself — it just does so in bytes rather than in prose.</p>

      <div class="mode" class:bad={modeChoice.mode === CAPTURE_MODE.none}>
        <b>{modeChoice.mode === CAPTURE_MODE.none ? 'This device cannot be learned' : `Mode: ${modeChoice.mode}`}</b>
        <span>{modeChoice.why}</span>
      </div>

      <!-- The sentence reads the constant rather than restating it. It used to say "nothing" and
           then evaluate `SENDS_DURING_CAPTURE ? '' : ''`, which renders the same either way — a
           reference that looks like a check and is not one, so flipping the rule would have left
           this screen confidently describing the opposite behaviour. That is precisely the failure
           the constant was made a constant to prevent. -->
      {#if SENDS_DURING_CAPTURE}
        <p class="note">While a capture is running this panel <b>does</b> send. Anything inbound
          within {ECHO_WINDOW_MS}ms of one of our own messages is treated as its echo and dropped —
          without that the session learns its own transmission, which looks exactly like success.</p>
      {:else}
        <p class="note">While a capture is running this panel sends <b>nothing</b> except explicit
          dump requests. Otherwise the device echoes what we sent and the session learns its own
          transmission, which looks exactly like success.</p>
      {/if}

      <button class="btn primary" disabled={modeChoice.mode === CAPTURE_MODE.none} onclick={start}>
        <Radio size={12} /> Start a session
      </button>
    </section>

  {:else if session.state === CAPTURE_STATE.setup}
    <section class="card">
      <div class="card-head">
        <h3>Setup — the baseline</h3>
        <span class="pill">{session.baselines.length}/{BASELINE_COUNT}</span>
      </div>
      <p class="lead">Take a few dumps with <b>nothing changed in between</b>. Anything that moves on
        its own — a counter, a live LFO value — goes on a mask and is excluded from every later
        attribution. Do it once and the whole rest of the session gets quieter.</p>

      <button class="btn" onclick={baseline}>Take a baseline dump</button>

      {#if session.mask.length}
        <p class="note">Masked: {session.mask.length} offset{session.mask.length === 1 ? '' : 's'}
          ({session.mask.join(', ')}) move without being asked to.</p>
      {/if}

      {#if readyToCapture(session)}
        <button class="btn primary" onclick={go}>Start capturing</button>
      {/if}
    </section>

  {:else if session.state === CAPTURE_STATE.capture}
    <section class="card">
      <div class="card-head">
        <h3>Change one thing on the synth</h3>
        {#if session.checksum}
          <span class="pill">checksum: {session.checksum.algorithm} @ {session.checksum.offset}</span>
        {/if}
      </div>
      <p class="lead">Move one control, then press Captured. Do it three times at different positions
        — one observation is a guess, three is a reading.</p>

      <div class="row">
        <button class="btn primary" onclick={captured}>Captured</button>
        <span class="note inline">{session.observations.length} observation{session.observations.length === 1 ? '' : 's'}</span>
        {#if session.observations.length}
          <button class="btn" onclick={() => (session = discardHypothesis(session))}>Start this one again</button>
        {/if}
      </div>

      {#if session.hypothesis}
        <div class="hypothesis" class:weak={session.hypothesis.confidence === CONFIDENCE.candidate}>
          <b>{session.hypothesis.kind}</b>
          <span class="pill">{CONFIDENCE_LABEL[session.hypothesis.confidence] ?? session.hypothesis.confidence}</span>
          <p>{session.hypothesis.why}</p>
          {#if session.hypothesis.freeBits}
            <p class="note">Bits {session.hypothesis.freeBits.join(', ')} of that byte are still
              free — something else lives there, and only you can say what.</p>
          {/if}
        </div>
        {#if session.hypothesis.kind !== 'none'}
          <button class="btn primary" onclick={() => (session = toConfirm(session))}>Name it</button>
        {/if}
      {/if}
    </section>

  {:else}
    <section class="card">
      <div class="card-head"><h3>Confirm</h3></div>
      <p class="lead">{session.hypothesis?.why}</p>

      <div class="row">
        <input class="field" placeholder="Name — e.g. Filter Cutoff" bind:value={name} />
        <input class="field short" placeholder="Group" bind:value={group} />
      </div>

      <label class="check">
        <input type="checkbox" bind:checked={verified} />
        <span>I wrote the value back and the synth did the thing.
          <b>This is the ground truth</b> — no amount of byte analysis substitutes for it, and it is
          the only thing that promotes a guess to confirmed.</span>
      </label>

      <div class="row">
        <button class="btn primary" disabled={!name.trim()} onclick={keep}>
          <CircleCheck size={12} /> Keep it
        </button>
        <button class="btn" onclick={() => { session = discardHypothesis({ ...session, state: CAPTURE_STATE.capture }); }}>
          Discard
        </button>
      </div>
    </section>
  {/if}

  {#if session && harvest.total > 0}
    <section class="card">
      <div class="card-head">
        <h3>Learned</h3>
        <span class="pill">{sessionSummary(session)}</span>
        <button class="btn small" onclick={() => persist(undoLast(session))}><Undo2 size={11} /> Undo last</button>
        <button class="btn small" onclick={() => (pasting = !pasting)}>Name from a list</button>
        <button class="btn small" onclick={copyReport}>{reportCopied ? 'Copied' : 'Copy report'}</button>
      </div>
      <ul class="learned">
        {#each session.learned as entry, index (entry.id + index)}
          <li class:weak={entry.confidence === CONFIDENCE.candidate}>
            <span class="mark">{entry.confidence === CONFIDENCE.confirmed ? '✓' : '·'}</span>
            <b>{entry.label}</b>
            <code>{entry.kind}{entry.offsets?.length ? ` @ ${entry.offsets.join(',')}` : ''}</code>
            <span class="pill">{CONFIDENCE_LABEL[entry.confidence] ?? entry.confidence}</span>
          </li>
        {/each}
      </ul>
      {#if pasting}
        <!-- POSITIONAL, and it says so before it lands. The manual is right about names and wrong
             about bytes, so this takes the names — but matching them by similarity would pair
             "Cutoff" with "Cutoff Env Amount" on a page that has both, and a paste that starts one
             line too high would rename everything below it. So the pairing is shown first. -->
        <div class="paste">
          <p class="note">One name per line, in the order you captured them. The manual's parameter
            list pastes straight in — it is reliable about names, which is all this uses.</p>
          <textarea rows="5" bind:value={pasteText} placeholder={'Filter Cutoff\nFilter Resonance\n…'}></textarea>
          {#if pastePlan}
            <ul class="pairs">
              {#each pastePlan.pairs as pair (pair.index)}
                <li><span class="was">{pair.was || 'Unnamed'}</span> → <b>{pair.label}</b></li>
              {/each}
            </ul>
            {#if pastePlan.unnamed}
              <p class="note warn"><TriangleAlert size={11} />
                {pastePlan.unnamed} captured parameter{pastePlan.unnamed === 1 ? '' : 's'} past the
                end of the list would keep their current names.</p>
            {/if}
            {#if pastePlan.extra}
              <p class="note warn"><TriangleAlert size={11} />
                {pastePlan.extra} more name{pastePlan.extra === 1 ? '' : 's'} than parameters — the
                list usually starts a line too high when that happens, which would shift every name
                below it.</p>
            {/if}
            <button class="btn small primary" onclick={applyPaste}>Apply {pastePlan.pairs.length} name{pastePlan.pairs.length === 1 ? '' : 's'}</button>
          {/if}
        </div>
      {/if}
      {#if harvest.candidates.length}
        <p class="note warn"><TriangleAlert size={11} />
          {harvest.candidates.length} of these are still guesses. They land as draft rows, not as
          parameters — a profile that is 95% right and does not say which 5% is worse than no
          profile, because you debug your <i>synth</i> for an evening before suspecting the tool.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .dpd-screen { padding: 16px 18px; overflow-y: auto; height: 100%; }
  .notice.resumed { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px;
    padding: 8px 10px; border: 1px solid #4A3F1E; background: rgba(242, 201, 76, 0.08);
    border-radius: 5px; font-size: 11px; line-height: 1.45; }
  .notice.resumed > div { flex: 1; min-width: 0; }
  .notice.resumed p { margin: 3px 0 0; color: #9A9A9A; }
  .paste { margin-top: 8px; display: grid; gap: 6px; }
  .paste textarea { width: 100%; resize: vertical; font: inherit; font-size: 11px;
    background: #1A1A1A; color: #C8C8C8; border: 1px solid #2E2E2E; border-radius: 4px; padding: 6px; }
  .pairs { list-style: none; margin: 0; padding: 0; font-size: 11px; display: grid; gap: 2px; }
  .pairs .was { color: #777; }
  h2 { font-size: 15px; margin: 0 0 14px; font-weight: 600; }
  h3 { font-size: 12px; margin: 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

  .card {
    border: 1px solid var(--line, #333); border-radius: 7px; padding: 12px 14px;
    margin-bottom: 12px; background: var(--panel2, #232323);
  }
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
  .card-head h3 { flex: 1; }

  .lead { color: #BBB; font-size: 12px; line-height: 1.6; margin: 0 0 10px; }
  .note { color: #888; font-size: 11px; line-height: 1.55; margin: 8px 0; }
  .note.inline { margin: 0; }
  .note.warn { color: #F2C94C; display: flex; align-items: flex-start; gap: 5px; }

  .mode {
    border: 1px solid #2A4A38; border-radius: 6px; background: #17211B; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 3px; font-size: 11px; margin-bottom: 8px;
  }
  .mode.bad { border-color: #4A2A2A; background: #211717; }
  .mode span { color: #999; line-height: 1.5; }

  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; }

  .field {
    background: #1A1A1A; border: 1px solid #3A3A3A; border-radius: 4px; color: #DDD;
    font-family: inherit; font-size: 12px; padding: 4px 8px; flex: 1; min-width: 0;
  }
  .field.short { flex: 0 0 120px; }
  .field:focus { outline: none; border-color: #5B9BD5; }

  .btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: #383F47; border: 1px solid #4C555E; border-radius: 4px; color: #DDD;
    font-family: inherit; font-size: 11px; padding: 4px 10px; cursor: pointer; white-space: nowrap;
  }
  .btn:hover { background: #454E57; color: #FFF; }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primary { background: #3A5A80; border-color: #4A72A0; color: #FFF; }
  .btn.small { font-size: 10px; padding: 2px 7px; }

  .pill {
    border: 1px solid #3A3A44; border-radius: 10px; background: #1D1D22;
    color: #999; font-size: 10px; padding: 2px 8px; white-space: nowrap;
  }

  .hypothesis {
    border: 1px solid #2E3A46; border-radius: 6px; background: #191E23; padding: 9px 11px;
    display: flex; flex-direction: column; gap: 5px; margin: 8px 0;
  }
  .hypothesis.weak { border-color: #4A3A24; background: #201C14; }
  .hypothesis b { font-size: 13px; color: #7BB3E5; }
  .hypothesis p { margin: 0; font-size: 11px; line-height: 1.55; color: #AAA; }

  .check { display: flex; gap: 7px; align-items: flex-start; font-size: 11px; line-height: 1.55; color: #AAA; margin: 6px 0; }
  .check input { margin-top: 2px; }

  .learned { list-style: none; margin: 0; padding: 0; font-size: 11px; }
  .learned li { display: flex; align-items: center; gap: 7px; padding: 3px 0; }
  .learned li.weak { color: #A89A78; }
  .mark { color: #39D98A; width: 10px; }
  .learned li.weak .mark { color: #F2C94C; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px; color: #888; }
</style>
