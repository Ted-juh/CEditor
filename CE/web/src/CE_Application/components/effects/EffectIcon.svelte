<script>
  // Fixed pictograms stay legible at toolbar sizes, independent of the edited component.
  // Related stack effects and presets deliberately share the same visual vocabulary.
  let { name = '', size = 22 } = $props();
  const aliases = { outlined: 'outline', softdrop: 'shadow', drop: 'shadow', inner: 'innerShadow',
    'outer-glow': 'glow', 'inner-glow': 'innerGlow', flat: 'fill' };
  let icon = $derived(aliases[name] ?? name);
</script>

<svg class="effect-icon" data-effect-icon={name} width={size} height={size} viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if icon === 'reflection'}
    <path d="M7 9 12 2 17 9Z" />
    <path d="M3 12h18" stroke-dasharray="2 3" opacity=".55" />
    <path d="m7 15 5 7 5-7Z" fill="currentColor" opacity=".35" />
  {:else if icon === 'outline'}
    <path d="m3 21 7-18h4l7 18h-4l-1.5-4h-7L7 21ZM10 13h4l-2-6Z" />
  {:else if icon === 'stroke2'}
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  {:else if icon === 'fill'}
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".3" />
  {:else if icon === 'shadow'}
    <rect x="9" y="9" width="12" height="12" rx="2" fill="currentColor" opacity=".4" />
    <rect x="3" y="3" width="12" height="12" rx="2" />
  {:else if icon === 'longshadow'}
    <path d="m4 12 8 9h9v-9l-9-8v8Z" fill="currentColor" opacity=".35" />
    <rect x="3" y="3" width="10" height="10" rx="1" /><path d="m13 13 8 8" />
  {:else if icon === 'innerShadow'}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M5 18V5h13" stroke-width="4" opacity=".4" />
  {:else if icon === 'glow' || icon === 'halo'}
    {#if icon === 'halo'}<circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="9" opacity=".35" />
    {:else}<rect x="7" y="7" width="10" height="10" rx="2" /><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" opacity=".65" />{/if}
  {:else if icon === 'innerGlow'}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="7" y="7" width="10" height="10" rx="2" stroke-dasharray="1 3" opacity=".65" />
  {:else if icon === 'blur'}
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <circle cx="12" cy="12" r="6" opacity=".5" />
    <circle cx="12" cy="12" r="9" stroke-dasharray="1 3" opacity=".3" />
  {:else if icon === 'motion'}
    <path d="M2 6h9M1 12h7m-6 6h9" opacity=".65" />
    <path d="m15 4 7 8-7 8Z" fill="currentColor" fill-opacity=".25" />
  {:else if icon === 'copy'}
    <rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 5V3H3v13h2" />
  {:else if icon === 'bevel' || icon === 'raised'}
    <path d="M3 3h18v18H3Z M7 7h10v10H7Z M3 3l4 4m10 10 4 4M3 21l4-4M21 3l-4 4" />
    <path d="M3 3h18l-4 4H7v10l-4 4Z" fill="currentColor" opacity=".3" />
    {#if icon === 'raised'}<path d="m9 13 3-3 3 3" />{/if}
  {:else if icon === 'sunken'}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M5 19V5h14" stroke-width="3" opacity=".4" /><path d="M13 8v9m-3-3 3 3 3-3" />
  {:else if icon === 'engraved' || icon === 'letterpress'}
    <rect x="2" y="2" width="20" height="20" rx="2" opacity=".45" />
    <path d="m7 18 5-12 5 12m-8-4h6" stroke-width="2" />
    {#if icon === 'engraved'}<path d="m5 6 2 2 2-2m6 0 2 2 2-2" opacity=".6" />
    {:else}<path d="m5 8 2-2 2 2m6 0 2-2 2 2" opacity=".6" />{/if}
  {:else if icon === 'neon'}
    <path d="m7 18 5-12 5 12m-8-4h6" stroke-width="5" opacity=".22" />
    <path d="m7 18 5-12 5 12m-8-4h6M2 5l2 2m16 0 2-2M1 13h2m18 0h2" />
  {:else if icon === 'chrome'}
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M4 12h16v5H4Z" fill="currentColor" opacity=".5" />
    <path d="M5 9h14M8 5 5 8m14 8-3 3" />
  {:else if icon === 'ghost'}
    <path d="m4 21 7-18h2l7 18M8 15h8" stroke-dasharray="2 3" />
    <path d="m8 21 4-11 4 11" opacity=".3" />
  {:else if icon === 'filters'}
    <path d="M3 5h18M3 12h18M3 19h18" opacity=".5" />
    <path d="M8 2v6m8 1v6M10 16v6" stroke-width="3" />
  {:else if icon === 'blend'}
    <circle cx="9" cy="12" r="7" /><circle cx="15" cy="12" r="7" />
    <path d="M12 5.7a7 7 0 0 1 0 12.6 7 7 0 0 1 0-12.6Z" fill="currentColor" opacity=".35" />
  {:else if icon === 'backlight'}
    <rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" />
    <path d="M12 7v1m0 8v1M7 12h1m8 0h1" />
  {:else if icon === 'dotmatrix'}
    {#each [5, 12, 19] as x}{#each [5, 12, 19] as y}<circle cx={x} cy={y} r="1.6" fill="currentColor" />{/each}{/each}
  {:else if icon === 'mono' || icon === 'dimmed'}
    <circle cx="12" cy="12" r={icon === 'mono' ? 9 : 6} />
    {#if icon === 'mono'}<path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" />
    {:else}<path d="M12 6a6 6 0 0 0 0 12Z" fill="currentColor" opacity=".4" /><path d="M12 1v1m0 20v1M1 12h1m20 0h1M4 4l1 1m14 14 1 1M4 20l1-1M19 5l1-1" opacity=".35" />{/if}
  {:else if icon === 'none'}
    <circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" />
  {:else}
    <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
  {/if}
</svg>

<style>
  .effect-icon { display: block; flex: 0 0 auto; color: inherit; }
</style>
