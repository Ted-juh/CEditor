/**
 * Inline SVG preview strings for border line types and corner shapes.
 * All use stroke/fill="currentColor" so the parent button controls color via CSS.
 */

// ============ SIDE STYLES (viewBox 0 0 40 18) ============

const noneSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="12" y1="3" x2="28" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  <line x1="28" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
</svg>`;

const solidSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="9" x2="36" y2="9" stroke="currentColor" stroke-width="2"/>
</svg>`;

const dashedSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="9" x2="36" y2="9" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3"/>
</svg>`;

const dottedSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="7"  cy="9" r="1.5" fill="currentColor"/>
  <circle cx="14" cy="9" r="1.5" fill="currentColor"/>
  <circle cx="21" cy="9" r="1.5" fill="currentColor"/>
  <circle cx="28" cy="9" r="1.5" fill="currentColor"/>
  <circle cx="35" cy="9" r="1.5" fill="currentColor"/>
</svg>`;

const doubleSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="36" y2="6" stroke="currentColor" stroke-width="1.5"/>
  <line x1="4" y1="12" x2="36" y2="12" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

const grooveSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 6 L13 6 L17 12 L23 12 L27 6 L36 6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`;

const ridgeSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 12 L13 12 L17 6 L23 6 L27 12 L36 12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`;

const insetSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 7 L18 7 L18 11 L36 11" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`;

const outsetSvg = `<svg viewBox="0 0 40 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 11 L18 11 L18 7 L36 7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`;

// ============ CORNER SHAPES (viewBox 0 0 20 20) ============

const straightSvg = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 3 L3 3 L3 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const roundOutSvg = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 3 A14 14 0 0 0 3 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;

const roundInSvg = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 3 A14 14 0 0 1 3 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;

const chamferSvg = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 3 L3 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const notchSvg = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 3 L10 3 L10 10 L3 10 L3 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ============ OPTION ARRAYS ============

export const sideStyleOptions = [
  { value: 'solid',  label: 'Solid',  svg: solidSvg },
  { value: 'dashed', label: 'Dashed', svg: dashedSvg },
  { value: 'dotted', label: 'Dotted', svg: dottedSvg },
  { value: 'double', label: 'Double', svg: doubleSvg },
  { value: 'groove', label: 'Groove', svg: grooveSvg },
  { value: 'ridge',  label: 'Ridge',  svg: ridgeSvg },
  { value: 'inset',  label: 'Inset',  svg: insetSvg },
  { value: 'outset', label: 'Outset', svg: outsetSvg },
  { value: 'none',   label: 'None',   svg: noneSvg },
];

export const cornerShapeOptions = [
  { value: 'straight',  label: 'Straight',    svg: straightSvg },
  { value: 'round-out', label: 'Rounded Out',  svg: roundOutSvg },
  { value: 'round-in',  label: 'Rounded In',   svg: roundInSvg },
  { value: 'chamfer',   label: 'Chamfer',      svg: chamferSvg },
  { value: 'notch',     label: 'Notch',        svg: notchSvg },
];
