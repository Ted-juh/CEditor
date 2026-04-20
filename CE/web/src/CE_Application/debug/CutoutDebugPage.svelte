<script>
  let text = $state('Envelope');
  let fontFamily = $state('Arial');
  let fontSize = $state(68);
  let fontWeight = $state(400);
  let italic = $state(false);
  let letterSpacing = $state(0);
  let lineKind = $state('strikethrough');
  let lineY = $state(0);
  let lineThickness = $state(6);
  let lineGap = $state(2);
  let lineInsetLeft = $state(40);
  let lineInsetRight = $state(40);
  let showGuides = $state(true);
  let surfaceWidth = $state(920);
  let surfaceHeight = $state(260);
  let bgColour = $state('#2e0030');
  let textColour = $state('#ffffff');
  let lineColour = $state('#d7c8da');

  let visibleTextElement = $state(null);
  let textBBox = $state({ x: 0, y: 0, width: 0, height: 0 });
  const maskId = 'cutout-debug-mask';

  const kinds = [
    { value: 'underline', label: 'Underline' },
    { value: 'strikethrough', label: 'Strikethrough' },
    { value: 'overline', label: 'Overline' },
  ];

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  let textCenterX = $derived(surfaceWidth / 2);
  let textCenterY = $derived(surfaceHeight / 2);
  let textMidY = $derived(textBBox.y + (textBBox.height / 2));
  let sharedCenterY = $derived(textBBox.height > 0 ? textMidY : textCenterY);

  let lineGeometry = $derived.by(() => {
    const halfFont = fontSize / 2;
    let centerY = sharedCenterY - lineY;
    if (lineKind === 'underline') centerY += halfFont;
    if (lineKind === 'overline') centerY -= halfFont;

    const left = numberOr(lineInsetLeft, 0);
    const right = Math.max(left, surfaceWidth - numberOr(lineInsetRight, 0));
    const thickness = Math.max(1, numberOr(lineThickness, 1));

    return {
      left,
      right,
      width: Math.max(0, right - left),
      top: centerY - (thickness / 2),
      thickness,
      gap: Math.max(0, numberOr(lineGap, 0)),
    };
  });

  let maskStrokeWidth = $derived(Math.max(0, lineGeometry.gap * 2));

  $effect(() => {
    text;
    fontFamily;
    fontSize;
    fontWeight;
    italic;
    letterSpacing;
    surfaceWidth;
    surfaceHeight;
    visibleTextElement;

    if (!visibleTextElement) return;

    const frame = requestAnimationFrame(() => {
      try {
        const bbox = visibleTextElement.getBBox();
        textBBox = {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
        };
      } catch {
        textBBox = { x: 0, y: 0, width: 0, height: 0 };
      }
    });

    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="debug-page">
  <aside class="controls">
    <h1>Cutout Debug</h1>
    <p>Isolated page for testing the text-line cutout technique without the full label editor.</p>

    <label>
      <span>Text</span>
      <input bind:value={text} />
    </label>

    <div class="row two">
      <label>
        <span>Font</span>
        <input bind:value={fontFamily} />
      </label>
      <label>
        <span>Size</span>
        <input type="number" bind:value={fontSize} min="8" step="1" />
      </label>
    </div>

    <div class="row three">
      <label>
        <span>Weight</span>
        <input type="number" bind:value={fontWeight} min="100" max="900" step="100" />
      </label>
      <label class="checkbox">
        <span>Italic</span>
        <input type="checkbox" bind:checked={italic} />
      </label>
      <label>
        <span>Tracking</span>
        <input type="number" bind:value={letterSpacing} step="0.5" />
      </label>
    </div>

    <div class="row three">
      <label>
        <span>Line</span>
        <select bind:value={lineKind}>
          {#each kinds as kind}
            <option value={kind.value}>{kind.label}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Y</span>
        <input type="number" bind:value={lineY} step="0.5" />
      </label>
      <label>
        <span>Gap</span>
        <input type="number" bind:value={lineGap} min="0" step="0.5" />
      </label>
    </div>

    <div class="row three">
      <label>
        <span>Thickness</span>
        <input type="number" bind:value={lineThickness} min="1" step="0.5" />
      </label>
      <label>
        <span>Left</span>
        <input type="number" bind:value={lineInsetLeft} step="1" />
      </label>
      <label>
        <span>Right</span>
        <input type="number" bind:value={lineInsetRight} step="1" />
      </label>
    </div>

    <div class="row two">
      <label>
        <span>Width</span>
        <input type="number" bind:value={surfaceWidth} min="240" step="10" />
      </label>
      <label>
        <span>Height</span>
        <input type="number" bind:value={surfaceHeight} min="120" step="10" />
      </label>
    </div>

    <div class="row three">
      <label>
        <span>BG</span>
        <input type="color" bind:value={bgColour} />
      </label>
      <label>
        <span>Text</span>
        <input type="color" bind:value={textColour} />
      </label>
      <label>
        <span>Line</span>
        <input type="color" bind:value={lineColour} />
      </label>
    </div>

    <label class="checkbox">
      <span>Guides</span>
      <input type="checkbox" bind:checked={showGuides} />
    </label>

    <div class="notes">
      <strong>Open:</strong> <code>/?debug=cutout</code>
    </div>
  </aside>

  <main class="stage-wrap">
    <div class="surface" style={`width:${surfaceWidth}px; height:${surfaceHeight}px; background:${bgColour};`}>
      <svg
        class="surface-svg"
        viewBox={`0 0 ${surfaceWidth} ${surfaceHeight}`}
        width={surfaceWidth}
        height={surfaceHeight}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={surfaceWidth} height={surfaceHeight}>
            <rect x="0" y="0" width={surfaceWidth} height={surfaceHeight} fill="#fff"></rect>
            <text
              x={textCenterX}
              y={textCenterY}
              text-anchor="middle"
              dominant-baseline="middle"
              fill="#000"
              stroke="#000"
              stroke-width={maskStrokeWidth}
              paint-order="stroke fill"
              style={`font-family:'${fontFamily}'; font-size:${fontSize}px; font-weight:${fontWeight}; font-style:${italic ? 'italic' : 'normal'}; letter-spacing:${letterSpacing}px;`}
            >{text}</text>
          </mask>
        </defs>

        {#if showGuides}
          <line
            x1="0"
            y1={sharedCenterY}
            x2={surfaceWidth}
            y2={sharedCenterY}
            stroke="rgba(255,255,255,0.18)"
            stroke-width="1"
          ></line>
          <rect
            x={textBBox.x}
            y={textBBox.y}
            width={textBBox.width}
            height={textBBox.height}
            fill="none"
            stroke="rgba(255,0,140,0.35)"
            stroke-width="1"
          ></rect>
        {/if}

        <rect
          x={lineGeometry.left}
          y={lineGeometry.top}
          width={lineGeometry.width}
          height={lineGeometry.thickness}
          fill={lineColour}
          mask={`url(#${maskId})`}
        ></rect>

        <text
          bind:this={visibleTextElement}
          x={textCenterX}
          y={textCenterY}
          text-anchor="middle"
          dominant-baseline="middle"
          fill={textColour}
          style={`font-family:'${fontFamily}'; font-size:${fontSize}px; font-weight:${fontWeight}; font-style:${italic ? 'italic' : 'normal'}; letter-spacing:${letterSpacing}px;`}
        >{text}</text>
      </svg>
    </div>
  </main>
</div>

<style>
  .debug-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 360px 1fr;
    background:
      linear-gradient(180deg, #121212 0%, #1c1c1c 100%);
    color: #e8e8e8;
  }

  .controls {
    padding: 24px;
    border-right: 1px solid #2f2f2f;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: rgba(10, 10, 10, 0.75);
    backdrop-filter: blur(8px);
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
  }

  p {
    margin: 0;
    color: #aaaaaa;
    font-size: 13px;
    line-height: 1.4;
  }

  .row {
    display: grid;
    gap: 10px;
  }

  .row.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .row.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: #c9c9c9;
  }

  label.checkbox {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #1b1b1b;
    border: 1px solid #303030;
    border-radius: 8px;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    height: 34px;
    border: 1px solid #383838;
    border-radius: 8px;
    background: #171717;
    color: #f0f0f0;
    padding: 0 10px;
    font: inherit;
    outline: none;
    box-sizing: border-box;
  }

  input:focus,
  select:focus {
    border-color: #67a4ff;
  }

  input[type="color"] {
    padding: 4px;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
  }

  .notes {
    margin-top: auto;
    padding: 12px;
    border: 1px solid #303030;
    border-radius: 10px;
    background: #161616;
    font-size: 12px;
    color: #b7b7b7;
  }

  .stage-wrap {
    display: grid;
    place-items: center;
    padding: 32px;
    background:
      linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / 28px 28px,
      linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / 28px 28px,
      radial-gradient(circle at 50% 30%, rgba(162, 41, 121, 0.16), transparent 45%),
      #202020;
  }

  .surface {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow:
      0 30px 80px rgba(0,0,0,0.45),
      inset 0 0 0 1px rgba(255,255,255,0.05);
  }

  .surface-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  @media (max-width: 980px) {
    .debug-page {
      grid-template-columns: 1fr;
    }

    .controls {
      border-right: none;
      border-bottom: 1px solid #2f2f2f;
    }
  }
</style>
