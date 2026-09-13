<script>
  /** Custom insert-catalog icon (mod wheel), drawn on lucide's conventions —
   *  24x24 grid, stroke 2, round caps/joins — with the same size/strokeWidth
   *  prop contract as lucide-svelte icons.
   *
   *  The same wheel as PitchWheelIcon with the line low instead of centred: a
   *  mod wheel stays where it is left, a pitch wheel springs back. One difference,
   *  and it is the one that matters. */
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
  <rect x="6" y="5" width="12" height="14" rx="6" /><path d="M6.9 16h10.2" stroke-width="3" />
</svg>
