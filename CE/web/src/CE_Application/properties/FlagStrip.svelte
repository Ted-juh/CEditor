<script>
  // A group of related booleans as icon chips in one shared well — the panel's
  // W3 widget. Each chip lights blue when on; the tooltip and aria-label carry
  // the full name, so the strip states several facts in the height of one row.
  //
  //   flags: [{ key, title, on, icon, disabled?, active? }]  — icon is a
  //   lucide-svelte component (e.g. import Eye from 'lucide-svelte/icons/eye').
  //   ontoggle(key, next) fires with the flag's key and its next state.
  //   `active` marks a chip whose secondary editor is currently open (ring);
  //   oncontextmenu(key, event) lets a chip open one on right-click.
  let { flags = [], ontoggle = null, oncontextmenu = null } = $props();
</script>

<div class="flagstrip" role="group">
  {#each flags as f (f.key)}
    <button type="button"
            class="flag"
            class:on={f.on}
            class:active={f.active === true}
            title={f.title}
            aria-label={f.title}
            aria-pressed={f.on}
            disabled={f.disabled === true}
            onclick={() => ontoggle?.(f.key, !f.on)}
            oncontextmenu={(e) => oncontextmenu?.(f.key, e)}>
      <f.icon size={13} strokeWidth={2} />
    </button>
  {/each}
</div>

<style>
  .flagstrip {
    display: flex;
    height: 26px;
    flex: 1;
    min-width: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    overflow: hidden;
  }

  .flag {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-right: 1px solid #262626;
    color: #5A5A5A;
    cursor: pointer;
    padding: 0;
  }

  .flag:last-child {
    border-right: none;
  }

  .flag:hover {
    color: #999;
  }

  .flag.on {
    color: #5B9BD5;
    background: #0D2A3E;
  }

  .flag:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .flag:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: -2px;
  }

  .flag.active {
    box-shadow: inset 0 0 0 1px #5B9BD5;
  }
</style>
