<script>
  import { controlTree, bridgeConnected, getNestedValue, updateProperty } from '../bridge/valueTree.js';
  import { undo, redo } from '../bridge/bridge.js';
  import CeButton from '../../CE_Panel/components/CeButton.svelte';

  // Reactive derived values from the tree
  let tree = $derived($controlTree);
  let connected = $derived($bridgeConnected);

  // Helper to get values from the nested tree
  function tv(path) {
    return getNestedValue(tree, path);
  }

  // Input handler — update property on change
  function handleInput(path, event) {
    let value = event.target.value;
    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && value !== '') value = num;
    updateProperty(path, value);
  }
</script>

<div class="bridge-test">
  <header>
    <h2>CEditor Bridge Test</h2>
    <span class="status" class:connected>
      {connected ? '● Connected to JUCE' : '○ Standalone (mock data)'}
    </span>
  </header>

  <!-- Live component preview -->
  <section class="preview">
    <h3>Live Preview</h3>
    <div class="preview-area">
      <CeButton
        text={tv('Text.content') ?? 'Button'}
        bgColour={tv('Background.Fill.colour') ?? '333333'}
        textColour={tv('Text.Fill.colour') ?? 'FFFFFF'}
        fontSize={tv('Text.Font.size') ?? 14}
        cornerRadius={tv('Border.Corners.radius') ?? 4}
        width={tv('Identity.width') ?? 120}
        height={tv('Identity.height') ?? 40}
        borderColour={tv('Border.Fill.colour') ?? '888888'}
        borderEnabled={tv('Border.enabled') ?? true}
      />
    </div>
  </section>

  <!-- Property editors -->
  <section class="editors">
    <h3>Properties</h3>

    <div class="prop-group">
      <h4>Identity</h4>
      <label>
        <span>X</span>
        <input type="number" value={tv('Identity.x') ?? 0}
               oninput={(e) => handleInput('Identity.x', e)} />
      </label>
      <label>
        <span>Y</span>
        <input type="number" value={tv('Identity.y') ?? 0}
               oninput={(e) => handleInput('Identity.y', e)} />
      </label>
      <label>
        <span>Width</span>
        <input type="number" value={tv('Identity.width') ?? 100}
               oninput={(e) => handleInput('Identity.width', e)} />
      </label>
      <label>
        <span>Height</span>
        <input type="number" value={tv('Identity.height') ?? 40}
               oninput={(e) => handleInput('Identity.height', e)} />
      </label>
    </div>

    <div class="prop-group">
      <h4>Text</h4>
      <label>
        <span>Content</span>
        <input type="text" value={tv('Text.content') ?? ''}
               oninput={(e) => handleInput('Text.content', e)} />
      </label>
      <label>
        <span>Colour</span>
        <input type="text" value={tv('Text.Fill.colour') ?? 'FFFFFF'}
               oninput={(e) => handleInput('Text.Fill.colour', e)} />
      </label>
      <label>
        <span>Font Size</span>
        <input type="number" value={tv('Text.Font.size') ?? 14}
               oninput={(e) => handleInput('Text.Font.size', e)} />
      </label>
      <label>
        <span>Font Family</span>
        <input type="text" value={tv('Text.Font.family') ?? 'Arial'}
               oninput={(e) => handleInput('Text.Font.family', e)} />
      </label>
    </div>

    <div class="prop-group">
      <h4>Background</h4>
      <label>
        <span>Colour</span>
        <input type="text" value={tv('Background.Fill.colour') ?? '333333'}
               oninput={(e) => handleInput('Background.Fill.colour', e)} />
      </label>
    </div>

    <div class="prop-group">
      <h4>Border</h4>
      <label>
        <span>Colour</span>
        <input type="text" value={tv('Border.Fill.colour') ?? '888888'}
               oninput={(e) => handleInput('Border.Fill.colour', e)} />
      </label>
      <label>
        <span>Radius</span>
        <input type="number" value={tv('Border.Corners.radius') ?? 4}
               oninput={(e) => handleInput('Border.Corners.radius', e)} />
      </label>
    </div>
  </section>

  <!-- Undo / Redo -->
  <section class="actions">
    <button onclick={undo}>Undo</button>
    <button onclick={redo}>Redo</button>
  </section>

  <!-- Raw tree dump -->
  <section class="debug">
    <h3>ValueTree (raw JSON)</h3>
    <pre>{JSON.stringify(tree, null, 2)}</pre>
  </section>
</div>

<style>
  .bridge-test {
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 { font-size: 18px; font-weight: 600; }
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #AAA; }
  h4 { font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }

  .status {
    font-size: 12px;
    color: #F44;
    font-weight: 500;
  }
  .status.connected {
    color: #4F4;
  }

  .preview-area {
    background: #2A2A2A;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
  }

  .editors {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .prop-group {
    background: #252525;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  label span {
    min-width: 80px;
    color: #999;
  }

  input {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #444;
    border-radius: 4px;
    color: #E0E0E0;
    padding: 4px 8px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }
  input:focus {
    border-color: #5B9BD5;
  }

  .actions {
    display: flex;
    gap: 8px;
  }
  .actions button {
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #E0E0E0;
    padding: 6px 16px;
    font-size: 12px;
    cursor: pointer;
  }
  .actions button:hover {
    background: #444;
  }

  .debug pre {
    background: #111;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 12px;
    font-size: 11px;
    color: #888;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }
</style>
