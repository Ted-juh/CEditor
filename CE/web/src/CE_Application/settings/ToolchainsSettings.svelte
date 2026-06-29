<script>
  // Scripting Toolchains — install/remove the build toolchains each scripting language needs at export,
  // so users only carry what they script in. Thin front-end over tools/toolchains/languages.mjs via the
  // C++ bridge (toolchainStatus / provisionToolchains / removeToolchains).
  import { onMount, onDestroy } from 'svelte';
  import {
    requestToolchainStatus, onToolchainStatus,
    provisionToolchains, removeToolchains, onToolchainProgress, onToolchainDone,
    isJuceAvailable,
  } from '../bridge/bridge.js';

  let languages = $state([]);     // [{ id, label, builtin, installed, toolchains, downloadMB }]
  let busyLang = $state(null);    // id currently provisioning/removing
  let log = $state([]);           // streamed progress lines
  let unsub = [];

  const fmtSize = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

  function refresh() { requestToolchainStatus(); }

  function install(lang) {
    if (busyLang) return;
    busyLang = lang.id; log = [`Installing ${lang.label} toolchain…`];
    provisionToolchains([lang.id]);
  }
  function remove(lang) {
    if (busyLang) return;
    busyLang = lang.id; log = [`Removing ${lang.label} toolchain…`];
    removeToolchains([lang.id]);
  }

  onMount(() => {
    unsub.push(onToolchainStatus((s) => { languages = (s && s.languages) || []; }));
    unsub.push(onToolchainProgress((p) => { if (p && p.line) log = [...log.slice(-200), p.line]; }));
    unsub.push(onToolchainDone(() => { busyLang = null; refresh(); }));
    refresh();
  });
  onDestroy(() => { for (const u of unsub) u?.(); });
</script>

<div class="toolchains">
  <header>
    <h2>Scripting Toolchains</h2>
    <p>
      Lua, JavaScript and TypeScript work out of the box. Python, C++, C# and Java compile at export and
      need a one-time toolchain. Install only the languages you script in — they’re also fetched
      automatically the first time you export a panel that uses them.
    </p>
  </header>

  {#if !isJuceAvailable()}
    <div class="note">Toolchain management is only available in the desktop app.</div>
  {/if}

  <ul class="lang-list">
    {#each languages as lang (lang.id)}
      <li class="lang" class:builtin={lang.builtin}>
        <div class="meta">
          <span class="name">{lang.label}</span>
          {#if lang.builtin}
            <span class="badge builtin">Built in</span>
          {:else if lang.installed}
            <span class="badge ok">Installed</span>
          {:else}
            <span class="badge missing">Not installed{#if lang.downloadMB} · {fmtSize(lang.downloadMB)}{/if}</span>
          {/if}
        </div>
        <div class="actions">
          {#if !lang.builtin}
            {#if lang.installed && lang.removable}
              <button class="btn ghost" disabled={!!busyLang} onclick={() => remove(lang)}>Remove</button>
            {:else if lang.installed}
              <span class="hint-sys">system</span>
            {:else}
              <button class="btn" disabled={!!busyLang} onclick={() => install(lang)}>
                {busyLang === lang.id ? 'Installing…' : 'Install'}
              </button>
            {/if}
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if log.length}
    <pre class="log">{log.join('\n')}</pre>
  {/if}
</div>

<style>
  .toolchains { padding: 18px 22px; max-width: 640px; }
  header h2 { margin: 0 0 6px; font-size: 16px; }
  header p { margin: 0 0 16px; color: #9aa0a6; font-size: 12.5px; line-height: 1.5; }
  .note { margin-bottom: 12px; color: #c9a227; font-size: 12px; }
  .lang-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .lang { display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; border: 1px solid #2c2f36; border-radius: 8px; background: #1b1d22; }
  .meta { display: flex; align-items: center; gap: 10px; }
  .name { font-size: 13px; font-weight: 600; }
  .badge { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; }
  .badge.ok { background: #16361f; color: #4ad07a; }
  .badge.missing { background: #2a2330; color: #c98bdb; }
  .badge.builtin { background: #20262e; color: #7fa6c9; }
  .btn { font-size: 12px; padding: 5px 12px; border-radius: 6px; border: 1px solid #3a6df0;
         background: #3a6df0; color: #fff; cursor: pointer; }
  .btn.ghost { background: transparent; border-color: #444; color: #cbd0d6; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .hint-sys { font-size: 10.5px; color: #7f8a99; font-style: italic; }
  .log { margin-top: 14px; max-height: 220px; overflow: auto; background: #0e0f12; color: #b7bdc6;
         font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace; padding: 10px 12px; border-radius: 8px;
         white-space: pre-wrap; }
</style>
