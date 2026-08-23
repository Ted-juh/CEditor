<script>
  /**
   * The design surface dock's inspector: the Object, Display, Behavior and States tabs.
   *
   * The second cut into the dock, after SurfaceDockLayers. The dock as a whole needs 98 props and
   * comes out badly in one piece; its two tab groups are the seams, and this is the larger one.
   *
   * Fifty-seven props is a long signature, and it is still the right trade here: every one is
   * checked at compile time, so a prop the parent forgets to pass is a build error rather than an
   * undefined at runtime. That check is what makes moving 440 lines of a working inspector out of
   * an 8,000-line file a reasonable thing to attempt.
   */
  import Copy from 'lucide-svelte/icons/copy';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Lock from 'lucide-svelte/icons/lock';
  import Unlock from 'lucide-svelte/icons/lock-open';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { normalizeRotation } from '../utils/transformMath.js';
  import { numberOr } from '../utils/primitives.js';
  import { numericInputValue, swatchCss, valueControlStyleLabel } from '../utils/customDesignSurfaceHelpers.js';

  let {
    inspectorTab = 'object',
    // Selection
    activeSelectionKind = '',
    activeSelectionName = '',
    activeSelectionFrame = null,
    multiSelectionActive = false,
    selectedLayer = '',
    selectedPart = null,
    selectedAuthoredPart = null,
    selectedPartEditable = false,
    selectedZone = null,
    selectedZoneEditable = false,
    selectedKitEntry = null,
    selectedBackground = null,
    selectedFill = null,
    selectedBorder = null,
    selectedCorners = null,
    selectedText = null,
    selectedTextFill = null,
    selectedTextFont = null,
    selectedIsArc = false,
    selectedArcMeta = null,
    selectedArcPivotTarget = null,
    canPaintLayer = false,
    canManageLayer = false,
    // Document
    parts = null,
    states = null,
    behaviorEntries = [],
    valueChannelEntries = [],
    artboardWidth = 0,
    artboardHeight = 0,
    // Overlay flags
    showBounds = false,
    showGeneratedLabels = false,
    showHitZones = false,
    zoneDisplayMode = 'selected',
    // Actions
    setLayerProperty = () => {},
    setLayerLayoutProperty = () => {},
    setHitZoneProperty = () => {},
    setArcMetaProperty = () => {},
    setSelectedPivotToArcCenter = () => {},
    setSelectionFramePosition = () => {},
    setSelectionFrameSize = () => {},
    setArtboardSize = () => {},
    setPreviewFlag = () => {},
    setZoneDisplayMode = () => {},
    alignSelection = () => {},
    openLayerColour = () => {},
    openArcColour = () => {},
    renameSelectedLayer = () => {},
    duplicateSelectedLayer = () => {},
    moveSelectedLayerToExtreme = () => {},
    toggleSelectedLock = () => {},
    toggleSelectedVisibility = () => {},
    removeSelectedLayer = () => {},
    removeSelectedKit = () => {},
    convertSelectedValueControl = () => {},
    editKitParts = () => {},
    fitArtboardToView = () => {},
  } = $props();
</script>

{#if inspectorTab === 'object'}
  {#if activeSelectionKind === 'artboard'}
    <div class="dock-section">
      <div class="dock-section-title">Artboard</div>
      <div class="dock-number-grid">
        <label>
          <span>W</span>
          <NumberCell
            min={1}
            step={1}
            value={Math.round(artboardWidth)}
            onchange={(value) => setArtboardSize('width', value)}
          />
        </label>
        <label>
          <span>H</span>
          <NumberCell
            min={1}
            step={1}
            value={Math.round(artboardHeight)}
            onchange={(value) => setArtboardSize('height', value)}
          />
        </label>
      </div>
      <div class="dock-note">The saved custom component workspace size.</div>
      <div class="dock-button-grid">
        <button type="button" onclick={() => { setArtboardSize('width', 152); setArtboardSize('height', 92); }}>Button</button>
        <button type="button" onclick={() => { setArtboardSize('width', 260); setArtboardSize('height', 120); }}>Default</button>
        <button type="button" onclick={fitArtboardToView}>Fit view</button>
      </div>
    </div>
  {:else if !activeSelectionName && !multiSelectionActive}
    <div class="dock-empty">Select artwork, a text layer, or a hit zone to edit it here.</div>
  {:else}
    {#if activeSelectionKind === 'kit' && selectedKitEntry}
      <div class="dock-section">
        <div class="dock-section-title">Value Control</div>
        <div class="segmented">
          <button type="button" class:active={selectedKitEntry.control?.style === 'dial'} onclick={() => convertSelectedValueControl('dial')}>Dial</button>
          <button type="button" class:active={selectedKitEntry.control?.style === 'horizontal'} onclick={() => convertSelectedValueControl('horizontal')}>Horizontal</button>
          <button type="button" class:active={selectedKitEntry.control?.style === 'vertical'} onclick={() => convertSelectedValueControl('vertical')}>Vertical</button>
        </div>
        <div class="mini-list">
          <div>
            <strong>Style</strong>
            <span>{valueControlStyleLabel(selectedKitEntry.control?.style)}</span>
          </div>
          <div>
            <strong>Channel</strong>
            <span>{selectedKitEntry.control?.channelName ?? 'value'}</span>
          </div>
          <div>
            <strong>Range</strong>
            <span>{selectedKitEntry.control?.min ?? 0} to {selectedKitEntry.control?.max ?? 127}</span>
          </div>
          <div>
            <strong>Ticks</strong>
            <span>{selectedKitEntry.control?.tickCount ?? 0}</span>
          </div>
          <div>
            <strong>Parts</strong>
            <span>{selectedKitEntry.layerNames.length} layers</span>
          </div>
          <div>
            <strong>Hit Zones</strong>
            <span>{selectedKitEntry.zoneNames.length}</span>
          </div>
        </div>
        <div class="dock-note">One smart value control — ticks, track, pointer, readout and hit area stay grouped.</div>
        <div class="dock-button-grid">
          <button type="button" onclick={() => editKitParts(selectedKitEntry.id)}>Edit internal parts</button>
          <button type="button" class="danger" onclick={removeSelectedKit}>
            <Trash2 size={13} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    {/if}

    {#if activeSelectionKind === 'layer' && selectedPart}
      <div class="dock-section">
        <div class="dock-section-title">Layer</div>
        <label class="dock-field wide">
          <span>Name</span>
          <input
            type="text"
            value={selectedLayer}
            disabled={!canManageLayer || multiSelectionActive}
            onblur={renameSelectedLayer}
            onchange={renameSelectedLayer}
          />
        </label>
        <div class="dock-button-grid">
          <button type="button" onclick={duplicateSelectedLayer} disabled={!canManageLayer} title="Duplicate layer">
            <Copy size={13} aria-hidden="true" />
            <span>Duplicate</span>
          </button>
          <button type="button" onclick={() => moveSelectedLayerToExtreme('front')} disabled={!canManageLayer} title="Bring to front">Front</button>
          <button type="button" onclick={() => moveSelectedLayerToExtreme('back')} disabled={!canManageLayer} title="Send to back">Back</button>
          <button type="button" onclick={toggleSelectedVisibility} disabled={!canManageLayer} title={selectedAuthoredPart?.visible === false ? 'Show layer' : 'Hide layer'}>
            {#if selectedAuthoredPart?.visible === false}
              <Eye size={13} aria-hidden="true" />
              <span>Show</span>
            {:else}
              <EyeOff size={13} aria-hidden="true" />
              <span>Hide</span>
            {/if}
          </button>
          <button type="button" onclick={toggleSelectedLock} disabled={!canManageLayer} title={selectedAuthoredPart?.locked === true ? 'Unlock layer' : 'Lock layer'}>
            {#if selectedAuthoredPart?.locked === true}
              <Unlock size={13} aria-hidden="true" />
              <span>Unlock</span>
            {:else}
              <Lock size={13} aria-hidden="true" />
              <span>Lock</span>
            {/if}
          </button>
          <button type="button" class="danger" onclick={removeSelectedLayer} disabled={!canManageLayer} title="Delete layer">
            <Trash2 size={13} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    {/if}

    {#if activeSelectionKind === 'hitZone' && selectedZone}
      <div class="dock-section">
        <div class="dock-section-title">Hit Zone</div>
        <label class="dock-field">
          <span>Shape</span>
          <select value={selectedZone?.shape ?? 'rectangle'} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('shape', event.currentTarget.value)}>
            <option value="rectangle">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="ring">Ring</option>
          </select>
        </label>
        <label class="dock-field">
          <span>Action</span>
          <select value={selectedZone?.action ?? 'dragValue'} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('action', event.currentTarget.value)}>
            <option value="dragValue">Drag value</option>
            <option value="setValue">Set value</option>
            <option value="cycleValue">Cycle value</option>
            <option value="trigger">Trigger</option>
          </select>
        </label>
        <span class="dock-field">

          <span>Enabled</span>

          <PropertyToggle compact value={selectedZone?.enabled !== false} disabled={!selectedZoneEditable} onchange={(next) => setHitZoneProperty('enabled', next)} ariaLabel="Enabled" />

        </span>
      </div>
    {/if}

    {#if activeSelectionFrame && ((activeSelectionKind === 'layer' && selectedPart) || (activeSelectionKind === 'hitZone' && selectedZone))}
      <div class="dock-section">
        <div class="dock-section-title">Transform</div>
        <div class="dock-number-grid">
          <label>
            <span>X</span>
            <NumberCell
              value={Math.round(activeSelectionFrame.left)}
              disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
              onchange={(value) => setSelectionFramePosition('left', value)}
            />
          </label>
          <label>
            <span>Y</span>
            <NumberCell
              value={Math.round(activeSelectionFrame.top)}
              disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
              onchange={(value) => setSelectionFramePosition('top', value)}
            />
          </label>
          <label>
            <span>W</span>
            <NumberCell
              min={1}
              value={Math.round(activeSelectionFrame.width)}
              disabled={multiSelectionActive || (activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable)}
              title={multiSelectionActive ? 'Resize one layer at a time — a group width has no single meaning' : undefined}
              onchange={(value) => setSelectionFrameSize('width', value)}
            />
          </label>
          <label>
            <span>H</span>
            <NumberCell
              min={1}
              value={Math.round(activeSelectionFrame.height)}
              disabled={multiSelectionActive || (activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable)}
              title={multiSelectionActive ? 'Resize one layer at a time — a group width has no single meaning' : undefined}
              onchange={(value) => setSelectionFrameSize('height', value)}
            />
          </label>
          {#if activeSelectionKind === 'layer'}
            <label>
              <span>Rot</span>
              <NumberCell
                step={1}
                value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.rotation, 0))}
                defaultValue={0}
                disabled={!selectedPartEditable}
                onchange={(value) => setLayerLayoutProperty('rotation', normalizeRotation(value))}
              />
            </label>
            <label>
              <span>Pivot X</span>
              <NumberCell
                step={1}
                value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.pivotX, 50))}
                defaultValue={50}
                disabled={!selectedPartEditable}
                onchange={(value) => setLayerLayoutProperty('pivotX', value)}
              />
            </label>
            <label>
              <span>Pivot Y</span>
              <NumberCell
                step={1}
                value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.pivotY, 50))}
                defaultValue={50}
                disabled={!selectedPartEditable}
                onchange={(value) => setLayerLayoutProperty('pivotY', value)}
              />
            </label>
          {/if}
        </div>
        {#if activeSelectionKind === 'layer'}
          <span class="dock-field" title="Keep this part's authored size and font when instances scale">
            <span>Pin size</span>
            <PropertyToggle
              compact
              ariaLabel="Pin size"
              value={selectedAuthoredPart?._children?.Layout?.pinned === true}
              disabled={!selectedPartEditable}
              onchange={(next) => setLayerLayoutProperty('pinned', next)}
            />
          </span>
        {/if}
        {#if activeSelectionKind === 'layer'}
          <div class="dock-section-subtitle">Rotation Pivot</div>
          <div class="pivot-actions">
            <button
              type="button"
              disabled={!selectedPartEditable || !selectedArcPivotTarget}
              onclick={setSelectedPivotToArcCenter}
              title={selectedArcPivotTarget ? `Set pivot to ${selectedArcPivotTarget.name} center` : 'No arc/value arc layer available'}
            >
              Rotate around arc centre
            </button>
            <span>{selectedArcPivotTarget ? selectedArcPivotTarget.name : 'No arc found'}</span>
          </div>
        {/if}
        <div class="dock-section-subtitle">Quick Positioning</div>
        <div class="align-grid">
          <button type="button" onclick={() => alignSelection('left')}>Left</button>
          <button type="button" onclick={() => alignSelection('centerX')}>Center X</button>
          <button type="button" onclick={() => alignSelection('right')}>Right</button>
          <button type="button" onclick={() => alignSelection('top')}>Top</button>
          <button type="button" onclick={() => alignSelection('centerY')}>Center Y</button>
          <button type="button" onclick={() => alignSelection('bottom')}>Bottom</button>
        </div>
      </div>
    {/if}
  {/if}
{:else if inspectorTab === 'display'}
  {#if activeSelectionKind === 'layer' && selectedPart}
    <div class="dock-section">
      <div class="dock-section-title">Paint</div>
      {#if selectedBackground}
        <div class="paint-grid">
          <label>
            <span>Fill</span>
            <button type="button" class="mini-swatch-btn" disabled={!canPaintLayer} style={swatchCss(selectedFill?.colour)} onclick={() => openLayerColour('Background.Fill.colour', selectedFill?.colour)} title="Pick fill colour"></button>
          </label>
          <label>
            <span>Stroke</span>
            <button type="button" class="mini-swatch-btn" disabled={!canPaintLayer} style={swatchCss(selectedBorder?.colour, 'FFFFFF')} onclick={() => openLayerColour('Background.Border.colour', selectedBorder?.colour)} title="Pick stroke colour"></button>
          </label>
          <label>
            <span>Stroke W</span>
            <NumberCell min={0} max={32} step={1} value={numberOr(selectedBorder?.thickness, 0)} defaultValue={0} disabled={!canPaintLayer} onchange={(value) => setLayerProperty('Background.Border.thickness', value)} />
          </label>
          <label>
            <span>Radius</span>
            <NumberCell min={0} max={999} step={1} value={numberOr(selectedCorners?.radius, 0)} defaultValue={0} disabled={!canPaintLayer} onchange={(value) => setLayerProperty('Background.Corners.radius', value)} />
          </label>
        </div>
      {/if}
      {#if selectedText}
        <label class="dock-field wide">
          <span>Text</span>
          <input type="text" value={selectedText?.content ?? ''} disabled={!canPaintLayer} oninput={(event) => setLayerProperty('Text.content', event.currentTarget.value)} />
        </label>
        <div class="paint-grid">
          <label>
            <span>Text Color</span>
            <button type="button" class="mini-swatch-btn" disabled={!canPaintLayer} style={swatchCss(selectedTextFill?.colour, 'FFFFFF')} onclick={() => openLayerColour('Text.Fill.colour', selectedTextFill?.colour)} title="Pick text colour"></button>
          </label>
          <label>
            <span>Size</span>
            <NumberCell min={6} max={144} step={1} value={numberOr(selectedTextFont?.size, 12)} defaultValue={12} disabled={!canPaintLayer} onchange={(value) => setLayerProperty('Text.Font.size', value)} />
          </label>
        </div>
      {/if}
      <label class="dock-field wide">
        <span>Opacity</span>
        <input type="range" min="0" max="1" step="0.01" value={numberOr(selectedAuthoredPart?.opacity, 1)} disabled={!canPaintLayer} oninput={(event) => setLayerProperty('opacity', numericInputValue(event, 1))} />
        <strong>{Math.round(numberOr(selectedAuthoredPart?.opacity, 1) * 100)}%</strong>
      </label>
    </div>

    {#if selectedIsArc}
      <div class="dock-section">
        <div class="dock-section-title">Arc</div>
        <div class="dock-number-grid">
          <label>
            <span>Start</span>
            <NumberCell step={1} value={Math.round(numberOr(selectedArcMeta?.startAngle, -135))} defaultValue={-135} onchange={(value) => setArcMetaProperty('startAngle', normalizeRotation(value))} />
          </label>
          <label>
            <span>Sweep</span>
            <NumberCell min={1} max={360} step={1} value={Math.round(numberOr(selectedArcMeta?.sweepAngle, 270))} defaultValue={270} onchange={(value) => setArcMetaProperty('sweepAngle', Math.max(1, Math.min(360, value)))} />
          </label>
          <label>
            <span>Thick</span>
            <NumberCell
              min={1}
              max={48}
              step={1}
              value={Math.round(numberOr(selectedArcMeta?.thickness, 4))}
              defaultValue={4}
              onchange={(value) => {
                const thickness = Math.max(1, Math.min(48, value));
                setArcMetaProperty('thickness', thickness);
                setLayerProperty('Background.Border.thickness', thickness);
              }}
            />
          </label>
        </div>
        <label class="dock-field">
          <span>Colour</span>
          <button type="button" class="mini-swatch-btn"
            style={swatchCss(selectedArcMeta?.colour, '5B9BD5')}
            onclick={openArcColour}
            title="Pick arc colour"
          ></button>
        </label>
        <label class="dock-field">
          <span>Direction</span>
          <div class="dock-toggle-row">
            <button type="button" class:active={selectedArcMeta?.direction !== 'ccw'} onclick={() => setArcMetaProperty('direction', 'cw')}>CW</button>
            <button type="button" class:active={selectedArcMeta?.direction === 'ccw'} onclick={() => setArcMetaProperty('direction', 'ccw')}>CCW</button>
          </div>
        </label>
        <label class="dock-field">
          <span>Caps</span>
          <div class="dock-toggle-row">
            <button type="button" class:active={selectedArcMeta?.cap !== 'round'} onclick={() => setArcMetaProperty('cap', 'flat')}>Flat</button>
            <button type="button" class:active={selectedArcMeta?.cap === 'round'} onclick={() => setArcMetaProperty('cap', 'round')}>Round</button>
          </div>
        </label>
      </div>
    {/if}
  {:else if activeSelectionKind === 'hitZone' && selectedZone}
    <div class="dock-section">
      <div class="dock-section-title">Zone Display</div>
      <span class="dock-field">

        <span>Visible</span>

        <PropertyToggle compact value={selectedZone?.visibleInEditor !== false} disabled={!selectedZoneEditable} onchange={(next) => setHitZoneProperty('visibleInEditor', next)} ariaLabel="Visible" />

      </span>
      <label class="dock-field">
        <span>Priority</span>
        <NumberCell value={numberOr(selectedZone?.priority, 0)} defaultValue={0} disabled={!selectedZoneEditable} onchange={(value) => setHitZoneProperty('priority', value)} />
      </label>
    </div>
  {:else}
    <div class="dock-empty">Select a layer to edit its styling.</div>
  {/if}
{:else if inspectorTab === 'behavior'}
  <div class="dock-section">
    <div class="dock-section-title">Interaction</div>
    {#if activeSelectionKind === 'hitZone' && selectedZone}
      <label class="dock-field">
        <span>Behavior</span>
        <select value={selectedZone?.targetBehavior ?? ''} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('targetBehavior', event.currentTarget.value)}>
          {#each behaviorEntries as [name] (name)}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </label>
      <label class="dock-field">
        <span>Channel</span>
        <select value={selectedZone?.targetValueChannel ?? ''} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('targetValueChannel', event.currentTarget.value)}>
          {#each valueChannelEntries as [name] (name)}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <div class="dock-note">Use hit zones to make artwork interactive.</div>
    {/if}
  </div>
{:else if inspectorTab === 'states'}
  <div class="dock-section">
    <div class="dock-section-title">Preview</div>
    <span class="dock-field">

      <span>Bounds</span>

      <PropertyToggle compact value={showBounds} onchange={(next) => setPreviewFlag('showBounds', next)} ariaLabel="Bounds" />

    </span>
    <span class="dock-field">

      <span>Gen Names</span>

      <PropertyToggle compact value={showGeneratedLabels} onchange={(next) => setPreviewFlag('showGeneratedLabels', next)} ariaLabel="Gen Names" />

    </span>
    <span class="dock-field">

      <span>Zones</span>

      <PropertyToggle compact value={showHitZones} onchange={(next) => setPreviewFlag('showHitZones', next)} ariaLabel="Zones" />

    </span>
    <div class="segmented">
      <button type="button" class:active={zoneDisplayMode === 'selected'} onclick={() => setZoneDisplayMode('selected')}>Sel</button>
      <button type="button" class:active={zoneDisplayMode === 'dim'} onclick={() => setZoneDisplayMode('dim')}>Dim</button>
      <button type="button" class:active={zoneDisplayMode === 'all'} onclick={() => setZoneDisplayMode('all')}>All</button>
    </div>
  </div>
  <div class="dock-section">
    <div class="dock-section-title">States</div>
    <div class="dock-note">States are authored on the filmstrip below the canvas and in the panel's States tab.</div>
  </div>
{/if}

<style>

  .dock-section {
    padding: 9px;
    border: 1px solid #2D343A;
    border-radius: 5px;
    background: #1B2024;
  }

  .dock-section + .dock-section {
    margin-top: 8px;
  }

  .dock-section-title {
    margin-bottom: 8px;
    color: #8DBFE5;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dock-section-subtitle {
    margin: 9px 0 2px;
    color: #7F929F;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dock-empty,
  .dock-note {
    padding: 10px;
    border: 1px dashed #35404A;
    border-radius: 5px;
    color: #87939E;
    font-size: 11px;
    line-height: 1.35;
  }

  .dock-note {
    margin-bottom: 8px;
    border-style: solid;
    background: #171C20;
  }

  .dock-field,
  .dock-number-grid label,
  .paint-grid label {
    display: grid;
    gap: 4px;
    color: #AFC5D8;
    font-size: 10px;
    font-weight: 800;
  }

  .dock-field {
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    min-height: 29px;
    margin-top: 6px;
  }

  .dock-field.wide {
    grid-template-columns: 64px minmax(0, 1fr) auto;
  }

  .dock-field input,
  .dock-field select {
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--dk-field-border, #3B4650);
    border-radius: var(--dk-field-radius, 4px);
    background: var(--dk-field-bg, #101418);
    color: var(--dk-field-fg, #E8EEF5);
    font: inherit;
    font-size: var(--dk-field-font, 10px);
  }

  .dock-field input:not([type='range']),
  .dock-field select {
    width: 100%;
    height: var(--dk-field-height, 25px);
    padding: var(--dk-field-padding, 0 7px);
  }


  .dock-field input[type='range'] {
    width: 100%;
    accent-color: var(--surface-accent, #14B8A6);
  }

  .dock-field strong {
    color: #E8EEF5;
    font-size: 10px;
  }

  .dock-button-grid,
  .align-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    margin-top: 8px;
  }

  .pivot-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }

  .dock-button-grid button,
  .align-grid button,
  .pivot-actions button,
  .segmented button {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    height: 27px;
    padding: 0 7px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #B9C8D4;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-button-grid button:hover:not(:disabled),
  .align-grid button:hover,
  .pivot-actions button:hover:not(:disabled),
  .segmented button:hover,
  .segmented button.active {
    border-color: var(--surface-accent, #14B8A6);
    background: #173449;
    color: #EAF5FF;
  }

  .dock-button-grid button.danger:hover:not(:disabled) {
    border-color: #D65A5A;
    background: #4B2020;
    color: #FFE8E8;
  }

  .pivot-actions span {
    min-width: 0;
    max-width: 92px;
    overflow: hidden;
    color: #8394A0;
    font-size: 10px;
    font-weight: 700;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-button-grid button:disabled,
  .pivot-actions button:disabled,
  .dock-field input:disabled,
  .dock-field select:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .dock-number-grid,
  .paint-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    margin-top: 8px;
  }

  .mini-list {
    display: grid;
    gap: 4px;
  }

  .mini-list div {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-height: 27px;
    padding: 5px 7px;
    border: 1px solid #2A3036;
    border-radius: 4px;
    background: #15191D;
    color: #87939E;
    font-size: 10px;
  }

  .mini-list strong,
  .mini-list span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-list strong {
    color: #D4DEE7;
  }
  .dock-section-title,
  .dock-section-subtitle {
    color: #8FEDE3;
  }
  .dock-button-grid button,
  .align-grid button,
  .pivot-actions button,
  .segmented button {
    border-color: #303F49;
    background: #1B2730;
  }
  .dock-button-grid button:hover:not(:disabled),
  .align-grid button:hover,
  .pivot-actions button:hover:not(:disabled),
  .segmented button:hover,
  .segmented button.active {
    border-color: var(--surface-accent, #14B8A6);
    background: rgba(20, 184, 166, 0.17);
    color: #F0FFFC;
  }
  .dock-section {
    background: #141E25;
  }

  .dock-section {
    border-color: #2A3741;
    border-radius: 6px;
  }

  .dock-field input,
  .dock-field select {
    border-color: #33434E;
    background: #0D1419;
  }

  .dock-field input[type='range'] {
    accent-color: var(--surface-accent, #14B8A6);
  }
</style>
