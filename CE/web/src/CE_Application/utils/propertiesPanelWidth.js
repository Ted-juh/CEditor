// propertiesPanelWidth.js — how narrow the properties panel may be dragged, and where its tabs
// change their layout to fit.
//
// The splitter used to stop at 600 pixels, and the panel clamped itself to 600 in script and in CSS
// besides, so the panel could only be made wider. In a 1366 x 768 window with the component tree
// open that left the canvas column 502 pixels: less than the panel beside it. At 420 the canvas
// column is 682 and a whole 600 x 400 panel fits at 100%.
//
// Every tab was measured at 600, 560, 520, 480, 420 and 360 for the panel itself, a knob, a label,
// a button, a slider, a custom component and the Component Designer's eleven tabs. Narrowed as it
// was, the panel cut the values of the four-to-a-row number fields ("OUTMIN -" for -135), pushed
// Test Bench's Reset and Edit past its edge and cut every entry of Publish's contract table. So the
// tabs change their layout when their content is narrower than NARROW_PROPERTIES_CONTENT: property
// grids two columns instead of four, and the rows with fixed column minimums stacked. With that, at
// 420 nothing is cut that is not cut at 600. At 360 Publish and Test Bench break again, which is
// why the floor is 420 and not lower.

/** The narrowest the splitter goes. PropertiesPanel's CSS min-width says the same number. */
export const MIN_PROPERTIES_PANEL_WIDTH = 420;

/** What the panel opens at before anyone has dragged it, as it always has. */
export const DEFAULT_PROPERTIES_PANEL_WIDTH = 600;

/**
 * Below this content width (the tab's scroll area: the panel less its 64-pixel tab rail and
 * border) the tabs take their narrow layout. A panel of 600 has 535; 520 has 455. The CSS
 * container queries say `(max-width: 460px)`; propertiesPanelWidth.test.js holds them to this.
 */
export const NARROW_PROPERTIES_CONTENT = 460;

/** A stored or dragged width brought within the floor, so a value from before cannot undercut it. */
export function clampPropertiesPanelWidth(value, fallback = DEFAULT_PROPERTIES_PANEL_WIDTH) {
  const width = Number(value);
  return Math.max(MIN_PROPERTIES_PANEL_WIDTH, Number.isFinite(width) ? width : fallback);
}
