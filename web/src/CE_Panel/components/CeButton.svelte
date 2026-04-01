<script>
  /** @type {string} */
  let {
    text = 'Button',
    bgColour = '333333',
    textColour = 'FFFFFF',
    fontSize = 14,
    cornerRadius = 4,
    width = 100,
    height = 40,
    borderColour = '888888',
    borderEnabled = true,
  } = $props();
</script>

<button
  class="ce-button"
  style="
    background: #{bgColour};
    color: #{textColour};
    font-size: {fontSize}px;
    border-radius: {cornerRadius}px;
    width: {width}px;
    height: {height}px;
    border: {borderEnabled ? `1px solid #${borderColour}` : 'none'};
  "
>
  {text}
</button>

<style>
  .ce-button {
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: filter 0.1s ease;
    outline: none;
    padding: 0;
  }
  .ce-button:hover {
    filter: brightness(1.15);
  }
  .ce-button:active {
    filter: brightness(0.9);
  }
</style>
