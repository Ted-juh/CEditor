// The faces a panel may use, shipped with the app: what assets/fonts/panelFonts.css declares, as
// data the rest of the app can ask. A control set's `type` block names one of these; the font
// picker lists them beside the system families and the author's imports; test/panelFonts.test.js
// holds this list, the sheet and the files on disk to each other.
//
// `min`/`max` is the weight range on disk. A variable family covers every weight between; a
// static one (Barlow, Barlow Semi Condensed) has the cuts the boards use and the browser
// synthesises nothing in between — ask for 500, 600, 700 or 800 and you get that cut.

export const PANEL_FONTS = [
  { family: "DM Sans", min: 400, max: 800, variable: true },
  { family: "Space Grotesk", min: 400, max: 700, variable: true },
  { family: "Libre Franklin", min: 400, max: 800, variable: true },
  { family: "Nunito Sans", min: 400, max: 800, variable: true },
  { family: "Rubik", min: 400, max: 800, variable: true },
  { family: "Barlow", min: 500, max: 800, variable: false },
  { family: "Barlow Semi Condensed", min: 500, max: 700, variable: false },
  { family: "Allerta Stencil", min: 400, max: 400, variable: false },
  { family: "JetBrains Mono", min: 400, max: 600, variable: true },
];

export const PANEL_FONT_FAMILIES = PANEL_FONTS.map((font) => font.family);

export function isPanelFont(family) {
  return PANEL_FONT_FAMILIES.includes(String(family ?? '').trim());
}
