<script>
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import NumberCell from '../properties/NumberCell.svelte';

  let {
    title = 'Underline',
    yLabel = 'Y',
    thicknessLabel = 'Thickness',
    colorLabel = 'Color',
    leftLabel = 'Left',
    rightLabel = 'Right',
    colorValue = 'FFFFFFFF',
    displayedY = 0,
    thickness = 1,
    displayedLeft = 0,
    displayedRight = 0,
    gap = 0,
    layerValue = 'back',
    onChangeY = () => {},
    onChangeThickness = () => {},
    onChangeColor = () => {},
    onColorSwatch = () => {},
    onChangeLeft = () => {},
    onFitLeft = () => {},
    onFitWord = () => {},
    onFitRight = () => {},
    onChangeRight = () => {},
    onSetLayer = () => {},
    onChangeGap = () => {},
  } = $props();
</script>

<PropertyCell label={title} span={4} hint={`${title} controls.`}>
  <div class="effect-divider"></div>
</PropertyCell>
<PropertyCell label={yLabel} span={1} hint={`Offset for the ${title.toLowerCase()} line. Positive moves up, negative moves down.`}>
  <NumberCell value={displayedY} step={0.5} onchange={onChangeY} />
</PropertyCell>
<PropertyCell label={thicknessLabel} span={1} hint={`${title} line thickness in pixels.`}>
  <NumberCell value={thickness} min={1} step={0.5} onchange={onChangeThickness} />
</PropertyCell>
<PropertyCell label={colorLabel} span={2} hint={`AARRGGBB colour for the ${title.toLowerCase()} line.`}>
  <PropertyColor value={colorValue} onchange={onChangeColor} onswatchclick={onColorSwatch} />
</PropertyCell>
<PropertyCell label={leftLabel} span={1} hint={`Left inset for the ${title.toLowerCase()} line.`}>
  <NumberCell value={displayedLeft} step={0.5} onchange={onChangeLeft} />
</PropertyCell>
<PropertyCell label="Width" span={2} hint={`Snap the ${title.toLowerCase()} line to the border, or fit it to the word width.`}>
  <div class="mini-action-row">
    <button class="mini-action-btn" onclick={onFitLeft}>&lt;--F</button>
    <button class="mini-action-btn" onclick={onFitWord}>Fit</button>
    <button class="mini-action-btn" onclick={onFitRight}>F--&gt;</button>
  </div>
</PropertyCell>
<PropertyCell label={rightLabel} span={1} hint={`Right inset for the ${title.toLowerCase()} line.`}>
  <NumberCell value={displayedRight} step={0.5} onchange={onChangeRight} />
</PropertyCell>
<PropertyCell label="Layer" span={2} hint={`Choose whether the ${title.toLowerCase()} line is drawn behind or in front of the text.`}>
  <div class="style-row">
    <button class="style-btn" class:active={layerValue === 'back'} onclick={() => onSetLayer('back')}>Back</button>
    <button class="style-btn" class:active={layerValue === 'front'} onclick={() => onSetLayer('front')}>Front</button>
  </div>
</PropertyCell>
<PropertyCell label="Gap" span={2} compact hint={`Clearance around letters when the ${title.toLowerCase()} line overlaps the text.`}>
  <NumberCell label="Gap" value={gap} min={0} step={0.5} onchange={onChangeGap} />
</PropertyCell>

<style>
  .mini-action-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 3px;
    width: 100%;
  }

  .mini-action-btn {
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    border-radius: 3px;
    cursor: pointer;
    padding: 0 6px;
    font: inherit;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
    width: 100%;
    min-width: 0;
  }

  .mini-action-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .style-row {
    display: flex;
    gap: 4px;
  }

  .style-btn {
    width: auto;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    border-radius: 3px;
    cursor: pointer;
    padding: 0;
    flex: 1 1 0;
    min-width: 0;
  }

  .style-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .style-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .effect-divider {
    width: 100%;
    height: 1px;
    background: #2a2a2a;
    margin-top: 4px;
  }
</style>
