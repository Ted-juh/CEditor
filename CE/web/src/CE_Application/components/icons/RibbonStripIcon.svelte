<script>
  /** Custom insert-catalog icon (touch strip), drawn on lucide's conventions —
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
  <rect x="8.5" y="3" width="7" height="18" rx="3.5" /><circle cx="12" cy="14.5" r="1" />
</svg>
