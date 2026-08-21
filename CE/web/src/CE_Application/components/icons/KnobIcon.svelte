<script>
  /** Custom insert-catalog icon (knob), drawn on lucide's conventions —
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
  <circle cx="12" cy="13" r="7" /><path d="M12 13 7.9 8.9" /><path d="M12 2.5v2" /><path d="M4.6 5.1l1.4 1.4" /><path d="M19.4 5.1 18 6.5" />
</svg>
