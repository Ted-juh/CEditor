<script>
  /**
   * LicencePanel.svelte — what somebody bought, and what it does not take away (§19, §27).
   *
   * This panel is deliberately not a nag. §29.5 describes this audience as "unusually
   * sensitive to abandonment", and the baseline's whole licensing section is a list of things
   * not to do to them — no subscription, no launch-time check-in, no one-machine lock, no
   * feature removal when payments stop. A panel that pushed an upgrade at every opportunity
   * would undo in the interface what the mechanism was careful to avoid.
   *
   * So it states four things and asks for nothing: which edition is in force, what is included
   * at that edition and what is not, which machines the licence covers, and — in its own block,
   * because it is the promise that matters most — that this install keeps running whatever the
   * update entitlement says.
   */
  import {
    hostState, hostLicenceReceipt,
    installLicence, removeLicence, activateLicenceHere, deactivateLicenceHere,
  } from '../stores/instrumentHost.js';

  let licence = $derived($hostState.licence);
  let receipt = $derived($hostLicenceReceipt);

  let paste = $state('');
  let pasteOpen = $state(false);

  const featureLabel = {
    patternEngine: 'Patterns and clips',
    scenesAndSetlists: 'Scenes and setlists',
    advancedRouting: 'Return buses and extra outputs',
    advancedScripting: 'Script actions',
  };

  const stateLabel = {
    unlicensed: 'No licence installed',
    licensed: 'Licensed',
    updatesExpired: 'Licensed — updates lapsed',
    sunsetUnlocked: 'Unlocked by the published sunset key',
    wrongProduct: 'A genuine licence, for another product',
    tampered: 'This licence does not match its signature',
  };

  function submitPaste() {
    const text = paste.trim();
    if (!text) return;
    installLicence(text);
    paste = '';
    pasteOpen = false;
  }
</script>

<div class="licence-panel" data-testid="host-licence-panel">
  <div class="licence-grid">
    <section class="block">
      <strong>Edition</strong>
      <div class="edition-row">
        <span class="badge" class:paid={licence.edition !== 'free'}
              data-testid="licence-edition">{licence.editionLabel}</span>
        <span class="value" class:warn={licence.state === 'tampered'
                                        || licence.state === 'wrongProduct'}>
          {stateLabel[licence.state] ?? stateLabel.unlicensed}
        </span>
      </div>
      {#if licence.detail}
        <p class="note" data-testid="licence-detail">{licence.detail}</p>
      {/if}

      {#if licence.licensee}
        <div class="readout"><span class="label">Licensed to</span>
          <span class="value">{licence.licensee}</span></div>
      {/if}
      {#if licence.orderId}
        <div class="readout"><span class="label">Order</span>
          <span class="value">{licence.orderId}</span></div>
      {/if}

      <div class="actions">
        {#if pasteOpen}
          <textarea bind:value={paste} rows="4" spellcheck="false"
                    aria-label="Licence file contents"
                    placeholder="Paste the contents of your .celicence file"></textarea>
          <div class="actions">
            <button type="button" onclick={submitPaste} data-testid="licence-install">Install</button>
            <button type="button" class="ghost" onclick={() => (pasteOpen = false)}>Cancel</button>
          </div>
        {:else}
          <button type="button" onclick={() => (pasteOpen = true)}
                  data-testid="licence-open-paste">Install a licence…</button>
          {#if licence.state !== 'unlicensed'}
            <button type="button" class="ghost" onclick={() => removeLicence()}
                    data-testid="licence-remove">Remove it from this machine</button>
          {/if}
        {/if}
      </div>
    </section>

    <section class="block">
      <strong>What this edition includes</strong>
      <div class="matrix" data-testid="licence-features">
        {#each licence.features as entry (entry.feature)}
          <div class="matrix-row" class:absent={!entry.allowed}>
            <span class="tick">{entry.allowed ? '✓' : '·'}</span>
            <span class="label">{featureLabel[entry.feature] ?? entry.feature}</span>
            {#if !entry.allowed}<span class="detail">Pro</span>{/if}
          </div>
        {/each}
        <div class="matrix-row" class:absent={licence.maxLoadedParts <= 1}>
          <span class="tick">{licence.maxLoadedParts > 1 ? '✓' : '·'}</span>
          <span class="label">More than one plug-in at a time</span>
          {#if licence.maxLoadedParts <= 1}
            <span class="detail">{licence.loadedParts} of 1 loaded</span>
          {/if}
        </div>
      </div>

      <strong class="sub">Included at every edition</strong>
      <p class="note">
        None of these is ever withheld, whatever licence is installed or missing.
      </p>
      <ul class="never" data-testid="licence-never-gated">
        {#each licence.neverGated as capability (capability)}
          <li>{capability}</li>
        {/each}
      </ul>
    </section>

    <section class="block">
      <strong>Machines</strong>
      {#if licence.state === 'sunsetUnlocked'}
        <p class="note">
          The sunset key licenses every machine. There is no seat count to manage.
        </p>
      {:else if licence.seatsAllowed === 0}
        <p class="note">Install a licence to see the machines it covers.</p>
      {:else}
        <div class="readout"><span class="label">Seats</span>
          <span class="value" data-testid="licence-seats">
            {licence.seatsUsed} of {licence.seatsAllowed} recorded by this install
          </span></div>
        <p class="note">
          Recorded here, not on a server — there is no server. Two installs on two machines
          cannot see each other's records, so this is what your purchase covers rather than a
          count anybody is policing.
        </p>

        <div class="matrix" data-testid="licence-machines">
          {#each licence.seats as seat (seat.fingerprint)}
            <div class="matrix-row">
              <span class="tick">{seat.isThisMachine ? '●' : '○'}</span>
              <span class="label">
                {seat.machineName || seat.fingerprint}{seat.isThisMachine ? ' — this machine' : ''}
              </span>
              <span class="detail">{seat.firstSeen.replace('T', ' ').slice(0, 10)}</span>
            </div>
          {/each}
        </div>

        {#if licence.activatedHere}
          <button type="button" class="ghost" onclick={() => deactivateLicenceHere()}
                  data-testid="licence-release">Release this machine</button>
        {:else}
          <button type="button" onclick={() => activateLicenceHere()}
                  data-testid="licence-claim">Use a seat on this machine</button>
        {/if}

        {#if receipt}
          <p class="note receipt" data-testid="licence-receipt">{receipt}</p>
        {/if}
      {/if}
    </section>

    <section class="block">
      <strong>Updates</strong>
      {#if licence.updatesUntil}
        <div class="readout"><span class="label">Included until</span>
          <span class="value">{licence.updatesUntil.replace('T', ' ').slice(0, 10)}</span></div>
      {/if}
      <div class="readout"><span class="label">Newer builds</span>
        <span class="value" data-testid="licence-updates">
          {licence.updatesIncluded ? 'included in what you bought' : 'a paid upgrade'}
        </span></div>

      <!-- Its own block, and stated rather than implied. The whole of §27 rests on this
           sentence, and somebody looking at a lapsed licence should read it rather than have
           to work it out from the absence of an error. -->
      <div class="promise" data-testid="licence-promise">
        <p class="line">This version keeps working for good.</p>
        <p class="note">
          An update entitlement that runs out never disables what is installed and never
          removes a feature. There is no check at launch, no subscription, and nothing to
          renew to keep using what you have.
        </p>
      </div>
    </section>
  </div>
</div>

<style>
  .licence-panel {
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
    max-height: 420px;
    overflow-y: auto;
  }

  .licence-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .sub { margin-top: 6px; }
  .note { margin: 0; color: #7d8894; font-size: 11px; line-height: 1.45; }
  .note.receipt { color: #9fd6a3; word-break: break-word; }
  .line { margin: 0; color: #d6dbe0; font-size: 12px; }

  .edition-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge {
    border: 1px solid var(--host-line);
    border-radius: 3px;
    padding: 1px 7px;
    color: var(--host-text-soft);
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .badge.paid { border-color: var(--host-active); color: #afe0c0; background: var(--host-active-surface); }

  .readout { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .label { flex: 0 0 auto; color: #9aa5b1; font-size: 11px; }
  .value { color: #d6dbe0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .value.warn { color: #e4b3b3; }

  .matrix { display: flex; flex-direction: column; gap: 3px; }
  .matrix-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; min-width: 0; }
  .matrix-row .label { flex: 1; color: #d6dbe0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .matrix-row.absent .label { color: #7d8894; }
  .tick { flex: 0 0 12px; color: #9fd6a3; }
  .matrix-row.absent .tick { color: #66707b; }
  .detail { flex: 0 0 auto; color: #7d8894; font-size: 11px; }

  .never { margin: 0; padding-left: 16px; color: #7d8894; font-size: 11px; line-height: 1.5; }

  .promise {
    border: 1px solid #3f5a44;
    border-radius: 4px;
    background: #1a231c;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-start; }

  textarea {
    width: 100%;
    font-size: 11px;
    font-family: var(--host-font-mono);
    resize: vertical;
  }
</style>
