<script>
  /** Custom insert-catalog icon (step sequencer), drawn on lucide's conventions —
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
  <rect x="2" y="8" width="4" height="8" rx="1" fill="currentColor" stroke="none" />
  <rect x="8" y="8" width="4" height="8" rx="1" />
  <rect x="14" y="8" width="4" height="8" rx="1" fill="currentColor" stroke="none" />
  <rect x="20" y="8" width="2" height="8" rx="1" />
</svg>
