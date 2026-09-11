<script>
  /** Custom insert-catalog icon (pitch wheel), drawn on lucide's conventions —
   *  24x24 grid, stroke 2, round caps/joins — with the same size/strokeWidth
   *  prop contract as lucide-svelte icons.
   *
   *  Wider and squatter than RibbonStripIcon on purpose: at 14px a narrow
   *  vertical capsule is a touch strip, and these two sat next to each other in the
   *  same group looking the same. The line across the middle is the detent a pitch
   *  wheel springs back to — which is the whole difference from the mod wheel below
   *  it, whose line sits where you left it. */
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
  <rect x="6" y="5" width="12" height="14" rx="6" /><path d="M6.6 12h10.8" stroke-width="3" />
</svg>
