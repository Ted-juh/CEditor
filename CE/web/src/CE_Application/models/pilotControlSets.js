// The two pilot sets that go beyond colour. Data, mostly; the mechanisms they exercise are in
// models/controlSetFamilies.js (the family patch and its rule) and utils/materialFilter.js (the
// lit material). Graphite, Ember and Ivory stay in models/controlSets.js as colour-only sets.
//
// Both are written against the knob's semantic parts (utils/sliderEntityFactory.js): `bodyCap`
// is the disc under the pointer, `pointerCurrent.kind` is how the pointer is drawn, and the
// track and fill are the arc around the cap. Percent sizes are of the track's diameter (cap) or
// the cap's radius (pointer length), so one set fits a 60 px knob and a 140 px one alike.

import { lampSelectedState } from './controlSetRecipes.js';

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
    Slider: {
      component: { 'Behavior.showTicks': false, 'Behavior.showMinMaxLabels': false },
      parts: {
        pointerCurrent: { kind: 'bar', 'Layout.width': 12, 'Layout.height': 28, 'Background.Border.thickness': 1.5 },
        bodyTrackBase: { 'Layout.height': 6, 'Background.Corners.radius': 2 },
        bodyTrackFill: { 'Layout.height': 6, 'Background.Corners.radius': 2 },
      },
    },
    // Cream pushbuttons: squarer than Graphite's, a dark hairline, dark legends on the cream.
    Button: { component: { 'Background.Corners.radius': 5, 'Background.Border.thickness': 1.5, 'Text.Fill.colour': '{text.inverse}' } },
    MomentaryButton: { component: { 'Background.Corners.radius': 5, 'Background.Border.thickness': 1.5, 'Text.Fill.colour': '{text.inverse}' } },
    // The toggle carries a red jewel lamp: lit while it is on, a dark lens while it is not. The
    // lamp is the indicator, so the cream body stays cream when checked (lampSelectedState).
    ToggleButton: {
      component: {
        'Background.Corners.radius': 5, 'Background.Border.thickness': 1.5, 'Text.Fill.colour': '{text.inverse}',
        'ContentLayout.lamp': 'jewel', 'ContentLayout.lampSize': 12, 'ContentLayout.lampColour': '{accent.hot}', 'ContentLayout.lampOffColour': 'FF4A1210', 'ContentLayout.lampBezelColour': '{control.cap.edge}',
        'States.Selected': lampSelectedState(),
      },
    },
    Combobox: { component: { 'Background.Corners.radius': 5, 'Background.Border.thickness': 1.5, 'Text.Fill.colour': '{text.inverse}' } },
    // Paper value fields and cream steppers: the same dark ink.
    Number: { parts: { valueField: { 'Text.Fill.colour': '{text.inverse}' }, decrement: { 'Text.Fill.colour': '{text.inverse}' }, increment: { 'Text.Fill.colour': '{text.inverse}' } } },
    Range: { parts: { lowField: { 'Text.Fill.colour': '{text.inverse}' }, highField: { 'Text.Fill.colour': '{text.inverse}' }, decrement: { 'Text.Fill.colour': '{text.inverse}' }, increment: { 'Text.Fill.colour': '{text.inverse}' } } },
  },
  panel: {
    // Black tolex: leather grain, lit shallow so it reads as texture rather than relief.
    material: { enabled: true, kind: 'leather', strength: 55, shine: 30, grain: 130, lampFollowsSet: true },
    colour: 'FF1C1A17',
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
    'border': '66303338',
    'border.surface': 'AA3A3E43',
    'border.field': '66303338',
    'border.mixed': 'FFC9A227',
  },
  families: {
    Knob: {
      component: { 'Behavior.showMinMaxLabels': false, 'Behavior.labelReadoutPlacement': 'bottom', 'Behavior.majorTickCount': 11, 'Behavior.minorTickCount': 0, 'Behavior.majorTickLength': 5 },
      parts: {
        tickMajor: { 'Layout.width': 1.5, 'Layout.height': 5 },
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
    Button: {
      component: {
        'Background.Corners.radius': 4,
        'Background.Border.thickness': 1.5,
        'Background.Effects.Material.enabled': true,
        'Background.Effects.Material.kind': 'blast',
        'Background.Effects.Material.strength': 90,
        'Background.Effects.Material.shine': 60,
      },
    },
    MomentaryButton: {
      component: {
        'Background.Corners.radius': 4,
        'Background.Border.thickness': 1.5,
        'Background.Effects.Material.enabled': true,
        'Background.Effects.Material.kind': 'blast',
        'Background.Effects.Material.strength': 90,
        'Background.Effects.Material.shine': 60,
      },
    },
    // A machined fader cap, bead-blasted like the knobs, in a dark slot.
    Slider: {
      component: { 'Behavior.showTicks': false, 'Behavior.showMinMaxLabels': false },
      parts: {
        pointerCurrent: {
          kind: 'bar', 'Layout.width': 14, 'Layout.height': 30, 'Background.Border.thickness': 1.5,
          'Background.Effects.Material.enabled': true, 'Background.Effects.Material.kind': 'blast',
          'Background.Effects.Material.strength': 90, 'Background.Effects.Material.shine': 60,
        },
        bodyTrackBase: { 'Layout.height': 5, 'Background.Corners.radius': 2 },
        bodyTrackFill: { 'Layout.height': 5, 'Background.Corners.radius': 2 },
      },
    },
    // The toggle has an LED set into the plate beside its legend.
    ToggleButton: {
      component: {
        'Background.Corners.radius': 4,
        'Background.Border.thickness': 1.5,
        'Background.Effects.Material.enabled': true,
        'Background.Effects.Material.kind': 'blast',
        'Background.Effects.Material.strength': 90,
        'Background.Effects.Material.shine': 60,
        'ContentLayout.lamp': 'led',
        'ContentLayout.lampSize': 8,
        'ContentLayout.lampColour': '{accent.hot}',
        'States.Selected': lampSelectedState(),
      },
    },
    // Dark readout windows on a light plate: the digits take the light ink.
    Number: { parts: { valueField: { 'Text.Fill.colour': '{text.inverse}' } } },
    Range: { parts: { lowField: { 'Text.Fill.colour': '{text.inverse}' }, highField: { 'Text.Fill.colour': '{text.inverse}' } } },
    Combobox: {
      component: {
        'Background.Corners.radius': 4,
        'Background.Border.thickness': 1.5,
        'Background.Effects.Material.enabled': true,
        'Background.Effects.Material.kind': 'brushed',
        'Background.Effects.Material.strength': 80,
        'Background.Effects.Material.shine': 70,
      },
    },
  },
  panel: {
    material: { enabled: true, kind: 'blast', strength: 100, shine: 40, grain: 100, lampFollowsSet: true },
    colour: 'FF9A9FA6',
  },
};

export const PILOT_CONTROL_SETS = [TOLEX_CONTROL_SET, MACHINED_CONTROL_SET];
