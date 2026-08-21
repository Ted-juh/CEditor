<script>
  /** Custom insert-catalog icon (matrix with patch point), drawn on lucide's conventions —
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
  <rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16" /><path d="M4 12h16" /><circle cx="8" cy="16" r="1.5" />
</svg>
