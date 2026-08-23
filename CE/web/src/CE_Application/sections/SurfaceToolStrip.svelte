<script>
  /**
   * The bottom tool strip of the custom-component design surface: Select, the Shape flyout, Text,
   * Hit Zone, Make Interactive, Starters and the Assistant.
   *
   * First step of the decomposition the 2026-07-12 workspace review asked for in §5, and its
   * argument is the reason this file exists: every regression that review found — a dead Make
   * Interactive tool among them — happened because the surface editor is too large to edit
   * without rewriting a region. This strip is one of those regions.
   *
   * Explicit props rather than a context object: nineteen is a readable number, and the compiler
   * checks every one. A prop the parent forgets to pass is a build error, which is the check that
   * makes an extraction of this size safe to do at all.
   *
   * `.tool-icon` is not styled here. It is the shared glyph vocabulary of the whole surface — the
   * palette draws the same icons — so it lives once in the parent as `.surface-shell :global(...)`
   * rather than being copied into every component that draws a tool button.
   */
  import { CUSTOM_COMPONENT_STARTERS, CUSTOM_ASSISTANT_RECIPES } from '../utils/customComponentFactory.js';

  let {
    activeTool = 'select',
    activeShapeTool = { id: 'rectangle', label: 'Rectangle', key: 'R' },
    shapeToolActive = false,
    activeInteractiveMeta = { id: 'dial', label: 'Dial' },
    interactiveArchetype = 'dial',
    // Flyout state stays with the parent: a click anywhere on the surface closes them all.
    shapeFlyoutOpen = false,
    interactiveFlyoutOpen = false,
    starterFlyoutOpen = false,
    assistantFlyoutOpen = false,
    shapeTools = [],
    interactiveArchetypes = [],
    setActiveTool = () => {},
    toggleShapeFlyout = () => {},
    toggleInteractiveFlyout = () => {},
    selectInteractiveArchetype = () => {},
    toggleStarterFlyout = () => {},
    applyStarterFromFlyout = () => {},
    toggleAssistantFlyout = () => {},
    applyRecipeFromFlyout = () => {},
  } = $props();
</script>

  <div class="tool-strip" aria-label="Surface tools">
    <button
      type="button"
      class:active={activeTool === 'select'}
      title="Select (V)"
      onclick={() => setActiveTool('select')}
    >
      <span class="tool-icon select"></span>
      <strong>Select</strong>
    </button>

    <div class="tool-flyout-host">
      <button
        type="button"
        class:active={shapeToolActive}
        title={`Shape: ${activeShapeTool.label} (${activeShapeTool.key})`}
        aria-haspopup="menu"
        aria-expanded={shapeFlyoutOpen}
        onclick={toggleShapeFlyout}
      >
        <span class={`tool-icon ${activeShapeTool.id}`}></span>
        <strong>Shape: {activeShapeTool.label}</strong>
      </button>
      {#if shapeFlyoutOpen}
        <div class="tool-flyout" role="menu" aria-label="Shape tools">
          {#each shapeTools as tool (tool.id)}
            <button
              type="button"
              role="menuitem"
              class:active={activeTool === tool.id}
              title={`${tool.label} (${tool.key})`}
              onclick={(event) => { event.stopPropagation(); setActiveTool(tool.id); }}
            >
              <span class={`tool-icon ${tool.id}`}></span>
              <span>{tool.label}</span>
              <kbd>{tool.key}</kbd>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      type="button"
      class:active={activeTool === 'text'}
      title="Text (T)"
      onclick={() => setActiveTool('text')}
    >
      <span class="tool-icon text"></span>
      <strong>Text</strong>
    </button>

    <button
      type="button"
      class:active={activeTool === 'hitZone'}
      title="Hit Zone (H)"
      onclick={() => setActiveTool('hitZone')}
    >
      <span class="tool-icon hitZone"></span>
      <strong>Hit Zone</strong>
    </button>

    <div class="tool-flyout-host">
      <button
        type="button"
        class:active={activeTool === 'interactive'}
        title={`Make Interactive: ${activeInteractiveMeta.label} (I) — draw a pre-wired control`}
        aria-haspopup="menu"
        aria-expanded={interactiveFlyoutOpen}
        onclick={toggleInteractiveFlyout}
      >
        <span class="tool-icon interactive"></span>
        <strong>Interactive: {activeInteractiveMeta.label}</strong>
      </button>
      {#if interactiveFlyoutOpen}
        <div class="tool-flyout" role="menu" aria-label="Interactive archetypes">
          {#each interactiveArchetypes as archetype (archetype.id)}
            <button
              type="button"
              role="menuitem"
              class:active={activeTool === 'interactive' && interactiveArchetype === archetype.id}
              title={`Draw a ${archetype.label}`}
              onclick={(event) => selectInteractiveArchetype(event, archetype.id)}
            >
              <span class="tool-icon interactive"></span>
              <span>{archetype.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="tool-flyout-host">
      <button
        type="button"
        title="Starters — load an editable archetype into this component"
        aria-haspopup="menu"
        aria-expanded={starterFlyoutOpen}
        onclick={toggleStarterFlyout}
      >
        <span class="tool-icon rectangle"></span>
        <strong>Starters</strong>
      </button>
      {#if starterFlyoutOpen}
        <div class="tool-flyout rich" role="menu" aria-label="Starter components">
          {#each CUSTOM_COMPONENT_STARTERS as starter (starter.id)}
            <button type="button" role="menuitem" title={starter.summary} onclick={(event) => applyStarterFromFlyout(event, starter)}>
              <span class="rich-copy">
                <span>{starter.label}</span>
                <small>{starter.creates.join(' + ')}</small>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="tool-flyout-host">
      <button
        type="button"
        title="Assistant — apply a setup recipe"
        aria-haspopup="menu"
        aria-expanded={assistantFlyoutOpen}
        onclick={toggleAssistantFlyout}
      >
        <span class="tool-icon hitZone"></span>
        <strong>Assistant</strong>
      </button>
      {#if assistantFlyoutOpen}
        <div class="tool-flyout rich" role="menu" aria-label="Assistant recipes">
          {#each CUSTOM_ASSISTANT_RECIPES as recipe (recipe.id)}
            <button type="button" role="menuitem" title={recipe.summary} onclick={(event) => applyRecipeFromFlyout(event, recipe)}>
              <span class="rich-copy">
                <span>{recipe.label}</span>
                <small>{recipe.group} · {recipe.creates.join(' + ')}</small>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

<style>
  /* The floating tool-strip overlaps the bottom of the canvas cell. */
  .tool-strip { grid-area: canvas; align-self: end; }

  .tool-strip {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    overflow-x: auto;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    min-height: 0;
    padding: 8px 6px;
    background: #171B1F;
    border-top: 1px solid #2A2A2A;
    overflow: visible;
    z-index: 5;
  }

  .tool-strip button {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    justify-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #B9C8D4;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
  }

  .tool-strip button:hover,
  .tool-strip button.active {
    border-color: #5B9BD5;
    background: #173449;
    color: #EAF5FF;
  }

  .tool-strip strong {
    position: absolute;
    bottom: 100%;
    left: 50%;
    top: auto;
    z-index: 10;
    max-width: 140px;
    transform: translateX(-50%);
    margin-bottom: 4px;
    padding: 5px 7px;
    border: 1px solid #3B4652;
    border-radius: 4px;
    background: #12181E;
    color: #EAF5FF;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32);
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms ease;
    font-weight: 700;
    white-space: nowrap;
  }

  .tool-strip button:hover strong,
  .tool-strip button:focus-visible strong {
    opacity: 1;
  }

  .tool-flyout-host {
    position: relative;
  }

  .tool-flyout-host {
    display: flex;
    align-items: center;
  }

  /* No divider line: it used to stack above the button, pushing flyout-tool
     icons ~11px lower than the plain buttons and breaking the row alignment. */
  .tool-flyout-host::before {
    display: none;
  }

  .tool-flyout {
    position: absolute;
    bottom: 100%;
    left: 0;
    top: auto;
    z-index: 30;
    width: 154px;
    padding: 6px;
    border: 1px solid #3B4652;
    border-radius: 5px;
    background: #151B21;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.42);
  }

  /* Starters/Assistant flyouts: two-line entries, scroll when long. */
  .tool-flyout.rich {
    width: 236px;
    max-height: 340px;
    overflow-y: auto;
  }

  .tool-flyout.rich button {
    height: auto;
    min-height: 36px;
    grid-template-columns: minmax(0, 1fr);
    padding: 5px 7px;
  }

  .rich-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    text-align: left;
  }

  .rich-copy small {
    color: #7E8B98;
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .tool-flyout button {
    width: 100%;
    height: 30px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    justify-items: start;
    gap: 7px;
    margin: 0;
    padding: 0 7px;
    border-color: transparent;
    background: transparent;
    color: #CBD7E0;
    text-align: left;
  }

  .tool-flyout button:hover,
  .tool-flyout button.active {
    border-color: #3F6C92;
    background: #173449;
    color: #EAF5FF;
  }

  .tool-flyout span:not(.tool-icon) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  .tool-flyout kbd {
    min-width: 16px;
    height: 17px;
    border: 1px solid #3B4652;
    border-radius: 3px;
    background: #0F1419;
    color: #8DBFE5;
    font: inherit;
    font-size: 9px;
    font-weight: 800;
    line-height: 15px;
    text-align: center;
  }

  .tool-strip {
    gap: 8px;
    padding: 7px 12px;
    /* Sits at the bottom of the canvas grid cell (align-self:end above) and
       floats over the artboard rather than taking its own row. */
    background: transparent;
    border-top: none;
    position: relative;
    z-index: 6;
    pointer-events: none;
  }

  /* Only the buttons should catch clicks — the empty strip lets them fall
     through to the canvas underneath. */
  .tool-strip > * {
    pointer-events: auto;
  }

  .tool-strip button {
    width: 38px;
    height: 38px;
    border-color: #32414B;
    background: #172229;
    color: #D8E6EE;
  }

  .tool-strip button:hover,
  .tool-strip button.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.18);
    box-shadow:
      0 0 0 1px rgba(20, 184, 166, 0.22),
      0 8px 18px rgba(20, 184, 166, 0.08);
  }

  .tool-flyout {
    border-color: #31434F;
    background: #111A21;
  }
</style>
