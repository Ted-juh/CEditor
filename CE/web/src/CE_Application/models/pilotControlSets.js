// The two pilot sets that go beyond colour. Data, mostly; the mechanisms they exercise are in
// models/controlSetFamilies.js (the family patch and its rule) and utils/materialFilter.js (the
// lit material). Graphite, Ember and Ivory stay in models/controlSets.js as colour-only sets.
//
// Both are written against the knob's semantic parts (utils/sliderEntityFactory.js): `bodyCap`
// is the disc under the pointer, `pointerCurrent.kind` is how the pointer is drawn, and the
// track and fill are the arc around the cap. Percent sizes are of the track's diameter (cap) or
// the cap's radius (pointer length), so one set fits a 60 px knob and a 140 px one alike.

import { lampSelectedState } from './controlSetRecipes.js';
import { BUTTON_DESIGNS, SLIDER_DESIGNS } from './controlSetDesigns.js';

// The lamp both sets share: upper left, fairly high — the light on every mockup board.
const LAMP = { azimuth: 225, elevation: 48 };

/**
 * Tolex — the guitar amp. Black tolex behind everything, cream chicken-head knobs on gold skirts,
 * cream pushbuttons with a hairline, a red jewel where a toggle is on.
 */
export const TOLEX_CONTROL_SET = {
  id: 'tolex',
  name: 'Tolex',
  description: 'The guitar amp: black tolex, cream chicken-head knobs on gold skirts, cream pushbuttons, a red jewel lamp.',
  lamp: LAMP,
  tokens: {
    'surface': 'FFEFE3C8',
    'surface.hover': 'FFF8EEDA',
    'surface.pressed': 'FFD9CBAE',
    'surface.checked': 'FFC8342B',
    'surface.mixed': 'FFC98A2A',
    'control.button': 'FFEFE3C8',
    'control.button.hover': 'FFF8EEDA',
    'control.button.pressed': 'FFD9CBAE',
    // Value fields are cream paper in a gold frame, so one dark text colour serves the buttons,
    // the fields and the combobox alike.
    'control.field': 'FFF7EEDA',
    'control.field.hover': 'FFFFF8E8',
    'control.field.active': 'FFFFF3D8',
    'control.select': 'FFEFE3C8',
    'control.select.hover': 'FFF8EEDA',
    'control.select.pressed': 'FFD9CBAE',
    'control.track': 'FFB8892E',
    'control.track.edge': 'AA5A3F10',
    'control.fill': 'FFE2B24A',
    'control.fill.hot': 'FFF2C85E',
    'control.range': 'FFE2B24A',
    'control.range.hot': 'FFF2C85E',
    'control.body': 'FFF1E6CC',
    'control.cap': 'FFF1E6CC',
    'control.cap.hot': 'FFFFF6E2',
    'control.cap.edge': 'CC6B5A34',
    'control.cap.start': 'FFC8342B',
    'control.cap.end': 'FF3F7A4C',
    'control.marker': 'FF1C1A17',
    'control.tick': 'FFEFE3C8',
    'control.tick.minor': '99EFE3C8',
    'accent': 'FFC8342B',
    'accent.hot': 'FFE85A4F',
    // `text.primary` is also every Label's colour, so it stays cream for the black panel; the
    // cream buttons and fields take `text.inverse` through the family patches below.
    'text.primary': 'FFF1E6CC',
    'text.label': 'FFF1E6CC',
    'text.muted': 'FFCDBF9E',
    'text.focus': 'FF8A1F18',
    'text.inverse': 'FF1C1A17',
    'display.lit': 'FFF2D07A',
    'display.unlit': '24F2D07A',
    'display.screen': 'FF1A1208',
    'display.backlight': 'FF2A1E10',
    'border': '88F1E6CC',
    'border.surface': 'AA1C1A17',
    'border.field': 'CCB8892E',
    'border.mixed': 'FFC98A2A',
  },
  families: {
    Knob: {
      component: { 'Behavior.showMinMaxLabels': false, 'Behavior.labelReadoutPlacement': 'bottom', 'Behavior.majorTickCount': 11, 'Behavior.minorTickCount': 0, 'Behavior.majorTickLength': 5 },
      parts: {
        tickMajor: { 'Layout.width': 1.5, 'Layout.height': 5 },
        // The gold skirt: a thick arc around the cap.
        bodyTrackBase: { 'Layout.height': 8, 'Background.Border.thickness': 1 },
        bodyTrackFill: { 'Layout.height': 8 },
        // The chicken-head sits on a cream disc that fills most of the skirt.
        bodyCap: {
          visible: true,
          'Layout.width': 74,
          'Layout.height': 74,
          'Background.Border.thickness': 2,
          'Background.Effects.Material.enabled': true,
          'Background.Effects.Material.kind': 'glass',
          'Background.Effects.Material.strength': 60,
          'Background.Effects.Material.shine': 45,
        },
        // A black chicken-head, 9 px across at its base, reaching past the cap's edge.
        pointerCurrent: {
          kind: 'chicken',
          'Layout.width': 9,
          'Layout.height': 118,
          'Background.Fill.colour': '{control.marker}',
          'Background.Border.enabled': false,
        },
      },
    },
    // A cream fader cap with a black stripe, on a gold track with square ends.
    // The fader and the keys are designs (models/controlSetDesigns.js): a bakelite cap on a
    // brass rail with a scale above it, and moulded cream keys with a dark hairline, the toggle
    // carrying its red jewel. Inks are the board's.
    ...SLIDER_DESIGNS.vintage({ rail: 'C9A24A', fill: 'D9A83A', cap: 'F1E6CF', groove: '3A2E1E', tick: 'F1E6CF' }),
    ...BUTTON_DESIGNS.bakelite({ face: 'F1E6CF', edge: '3A2E1E', text: '1C1A17', lampKind: 'jewel' }),
    Number: { parts: { valueField: { 'Text.Fill.colour': '{text.inverse}' }, decrement: { 'Text.Fill.colour': '{text.inverse}' }, increment: { 'Text.Fill.colour': '{text.inverse}' } } },
    Range: { parts: { lowField: { 'Text.Fill.colour': '{text.inverse}' }, highField: { 'Text.Fill.colour': '{text.inverse}' }, decrement: { 'Text.Fill.colour': '{text.inverse}' }, increment: { 'Text.Fill.colour': '{text.inverse}' } } },
  },
  panel: {
    // Black tolex: leather grain, lit shallow so it reads as texture rather than relief.
    material: { enabled: true, kind: 'leather', strength: 55, shine: 30, grain: 130, lampFollowsSet: true },
    colour: 'FF1C1A17',
  },
  // The board's silkscreen: Libre Franklin, bold and tracked; the readout in the mono.
  type: {
    label: { family: 'Libre Franklin', weight: 700, letterSpacing: 0.9 },
    legend: { family: 'Libre Franklin', weight: 700, letterSpacing: 0.7 },
    field: { family: 'JetBrains Mono', weight: 600, letterSpacing: 0 },
  },
};

/**
 * Machined — billet aluminium, bead-blasted. Lathe-turned caps with a painted line, a dark slot
 * for the arc, buttons that sit proud of the plate, one cyan accent where something is live.
 */
export const MACHINED_CONTROL_SET = {
  id: 'machined',
  name: 'Machined',
  description: 'Bead-blasted aluminium: turned caps with a painted pointer line, dark slots, buttons proud of the plate, a cyan accent.',
  lamp: LAMP,
  tokens: {
    'surface': 'FF8E939A',
    'surface.hover': 'FF9DA2A9',
    'surface.pressed': 'FF6E737A',
    'surface.checked': 'FF2C8DA8',
    'surface.mixed': 'FF9A7A2C',
    'control.button': 'FF8E939A',
    'control.button.hover': 'FF9DA2A9',
    'control.button.pressed': 'FF6E737A',
    'control.field': 'FF1A1C1F',
    'control.field.hover': 'FF202327',
    'control.field.active': 'FF1E3238',
    'control.select': 'FF8E939A',
    'control.select.hover': 'FF9DA2A9',
    'control.select.pressed': 'FF6E737A',
    'control.track': 'FF2A2D31',
    'control.track.edge': 'AA111214',
    'control.fill': '{accent}',
    'control.fill.hot': 'FF8FE9FF',
    'control.range': 'FF5FD3F0',
    'control.range.hot': 'FF8FE9FF',
    'control.body': 'FFA2A7AE',
    'control.cap': 'FFA2A7AE',
    'control.cap.hot': 'FFB4B9C0',
    'control.cap.edge': 'CC3A3E43',
    'control.cap.start': 'FFE0A43A',
    'control.cap.end': 'FF5CC492',
    'control.marker': 'FFF4F6F8',
    'control.tick': 'CC1B1D20',
    'control.tick.minor': '881B1D20',
    'accent': 'FF2CB8DA',
    'accent.hot': 'FF8FE9FF',
    'text.primary': 'FF1B1D20',
    'text.label': 'FF1B1D20',
    'text.muted': 'FF3E4247',
    'text.focus': 'FF0F5C70',
    'text.inverse': 'FFF4F6F8',
    'display.lit': 'FF7DE3FF',
    'display.unlit': '247DE3FF',
    'display.screen': 'FF0A0C0E',
    'display.backlight': 'FF121A20',
    'border': '66303338',
    'border.surface': 'AA3A3E43',
    'border.field': '66303338',
    'border.mixed': 'FFC9A227',
  },
  families: {
    Knob: {
      component: { 'Behavior.showMinMaxLabels': false, 'Behavior.labelReadoutPlacement': 'bottom', 'Behavior.majorTickCount': 11, 'Behavior.minorTickCount': 0, 'Behavior.majorTickLength': 5 },
      parts: {
        // Eleven marks cut into the plate: a dark line over its own light edge.
        tickMajor: { kind: 'engraved', 'Layout.width': 1.5, 'Layout.height': 5 },
        tickMinor: { kind: 'engraved' },
        // The slot the arc runs in: thin and dark, with a hairline.
        bodyTrackBase: { 'Layout.height': 5 },
        bodyTrackFill: { 'Layout.height': 5 },
        // A turned aluminium cap, bead-blasted, a fine dark chamfer at its edge.
        bodyCap: {
          visible: true,
          'Layout.width': 70,
          'Layout.height': 70,
          'Background.Border.thickness': 1.5,
          'Background.Effects.Material.enabled': true,
          'Background.Effects.Material.kind': 'blast',
          'Background.Effects.Material.strength': 100,
          'Background.Effects.Material.shine': 100,
        },
        // A painted white line from a third of the way out to just short of the chamfer.
        pointerCurrent: {
          kind: 'line',
          'Layout.width': 2,
          'Layout.height': 88,
          'Background.Fill.colour': '{control.marker}',
          'Background.Border.enabled': false,
        },
      },
    },
    // Buttons milled from the same billet: tight radius, a dark chamfer, the blast finish.
    // The fader and the keys are designs (models/controlSetDesigns.js): a billet block riding
    // a slot cut in the plate with a light in it, engraved marks either side; machined keys with
    // a bevelled edge and an engraved legend, the toggle throwing a bat switch.
    ...SLIDER_DESIGNS.billet({ slot: '0A0C0E', fill: '7DE3FF', cap: 'B4B9BF', plate: 'C9CED3', groove: '1B1D20', tick: '1B1D20' }),
    ...BUTTON_DESIGNS.aluminium({ face: 'B4B9BF', edge: '4A4F55', text: '1B1D20', lampKind: 'bat', lampColour: '{control.cap}' }),
    Number: { parts: { valueField: { 'Text.Fill.colour': '{text.inverse}' } } },
    Range: { parts: { lowField: { 'Text.Fill.colour': '{text.inverse}' }, highField: { 'Text.Fill.colour': '{text.inverse}' } } },
  },
  panel: {
    material: { enabled: true, kind: 'blast', strength: 100, shine: 40, grain: 100, lampFollowsSet: true },
    colour: 'FF9A9FA6',
  },
  // Engraved Barlow on the plate; the OLED's digits in the mono.
  type: {
    label: { family: 'Barlow', weight: 700, letterSpacing: 0.9 },
    legend: { family: 'Barlow', weight: 700, letterSpacing: 0.7 },
    field: { family: 'JetBrains Mono', weight: 600, letterSpacing: 0 },
  },
};

export const PILOT_CONTROL_SETS = [TOLEX_CONTROL_SET, MACHINED_CONTROL_SET];
