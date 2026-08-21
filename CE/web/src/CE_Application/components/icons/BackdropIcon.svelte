<script>
  /** Custom insert-catalog icon (hatched backdrop), drawn on lucide's conventions —
   *  24x24 grid, stroke 2, round caps/joins — with the same size/strokeWidth
   *  prop contract as lucide-svelte icons. */
  let { size = 24, strokeWidth = 2, ...rest } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide"
  {...rest}
>
  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 13.5 12 5" /><path d="M6 17.5 18.5 5" /><path d="M10.5 19 21 8.5" />
</svg>
