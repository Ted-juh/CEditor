<script>
  /** Custom insert-catalog icon (pendulum), drawn on lucide's conventions —
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
  <circle cx="12" cy="4" r="1" /><path d="M11.5 5 8.2 14.7" /><circle cx="7.5" cy="17" r="2.5" /><path d="M16.5 16.5a9 9 0 0 0-2.7-9.6" />
</svg>
