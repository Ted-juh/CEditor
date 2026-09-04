<svg
  class="hostage-logo"
  viewBox="0 0 348 72"
  role="img"
  aria-labelledby="hostage-logo-title"
  xmlns="http://www.w3.org/2000/svg"
>
  <title id="hostage-logo-title">Hostage</title>

  <g class="device">
    <rect class="device-shell" x="2" y="2" width="70" height="68" rx="8" />
    <path class="device-rails" d="M14 18v36M29 18v36M44 18v36M59 18v36M10 36h53" />
    {#each [14, 29, 44, 59] as x, index}
      <circle class="device-control" cx={x} cy="17" r="7" />
      <line class="device-indicator" x1={x} y1="17" x2={x + [0, 4, -4, 5][index]} y2={17 + [-5, -4, -4, 0][index]} />
      <circle class="device-control" cx={x} cy="55" r="7" />
      <line class="device-indicator" x1={x} y1="55" x2={x + [-5, 0, 0, 5][index]} y2={55 + [0, 5, 5, 0][index]} />
    {/each}
    <rect class="device-fader" x="25" y="32" width="12" height="8" rx="2" />
  </g>

  <text class="wordmark" x="82" y="54" textLength="258" lengthAdjust="spacingAndGlyphs">
    <tspan class="wordmark-outline">HO</tspan><tspan class="wordmark-accent">ST</tspan><tspan class="wordmark-outline">AGE</tspan>
  </text>
</svg>

<style>
  .hostage-logo {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    shape-rendering: geometricPrecision;
  }

  .device-shell,
  .device-control,
  .wordmark-outline {
    fill: #11191f;
    stroke: #ff7a00;
  }

  .device-shell {
    stroke-width: 4;
  }

  .device-control {
    stroke-width: 2.5;
  }

  .device-rails {
    fill: none;
    stroke: #ff7a00;
    stroke-width: 2;
    stroke-linecap: square;
    opacity: 0.82;
  }

  .device-indicator {
    stroke: #ff7a00;
    stroke-width: 3;
    stroke-linecap: square;
  }

  .device-fader,
  .wordmark-accent {
    fill: #ff7a00;
  }

  .device-fader {
    stroke: #11191f;
    stroke-width: 1.5;
  }

  .wordmark {
    font-family: "Arial Black", "Segoe UI Black", "Segoe UI", sans-serif;
    font-size: 51px;
    font-weight: 900;
    letter-spacing: -1px;
  }

  .wordmark-outline {
    stroke-width: 2.8;
    paint-order: stroke fill;
  }

  .wordmark-accent {
    stroke: #ff7a00;
    stroke-width: 2.8;
    paint-order: stroke fill;
  }
</style>
