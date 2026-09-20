# Twelve physical constructions

The starter gallery now contains 36 design directions. The catalogue contains 54 sets,
including the existing related finishes. These twelve add layered physical constructions:

| Set | Main actuator | Performance surface |
| --- | --- | --- |
| Brassworks | Three-spoke valve wheel and sprung piston | Bolted brass drum heads |
| Bakelite | Moulded chicken-head selector | Fluted resin caps |
| Hi-Fi | Coaxial turned-metal dial | Bevelled receiver keys |
| Porcelain | Ribbed ceramic selector and enamel rocker | Glazed scalloped pads |
| Flightdeck | Twin-rail throttle and guarded switch | Chamfered instrument keys |
| Stompbox | Ratchet dial and sprung footswitch | Recessed rubber tread pads |
| Switchboard | Telephone finger plate and hook lever | Saucer contact pads |
| Chronograph | Fluted watch bezel and crown pusher | Milled radial caps |
| Cassette Deck | Exposed thumbwheel and latching transport keys | Slotted mechanical pads |
| Diesel | Cast T-handle and bolted switch block | Heavy tread plates |
| Gemstone | Faceted crystal dial and prism key | Diamond glass pads |
| Leatherbound | Stitched strap dial and cushioned keys | Saddle-shaped leather pads |

The drawings use layered SVG housings, cast shadows, edge highlights, recessed wells,
reflections and material detail. Knobs, keys, switches and meters have dedicated constructions;
the remaining controls inherit compatible existing families with matching finishes. They are
parametric renderers, not individually editable vector drawings. Core exposes form, colours,
scale, relief and scale divisions. Original Parts remains available for the legacy renderer.

Drum pad shapes and sequencer cell shapes use the same normalized outlines as their hit tests.
The twelve physical finishes add a fixed mount and a cap that travels on press. Musical mappings,
velocity, note identity and sequencer track/step order remain standard. Four-corner pad zones
retain the rectangular grid so all zones remain reachable. Number steppers have twelve additional
editable Parts arrangements with matching material, gradients and inset number windows.

Open **Panel properties → Control set → Browse 36 starter designs**, select a set and create
its starter. Each contains ordinary controls with portable design pins. Individual controls can
be copied into another panel, and saved starters are in `CE/panels/Control set starters`.

Validation covers all 36 starters in the real browser renderer: keyboard values, button presses,
toggle state, fader drag, moved number steppers, pad press/release, empty corners, sequencer
pattern retention, gallery selection, save/load and copying across sets. Screenshots are also
reviewed in colour and grayscale. Native and template-player builds use the same web assets.
