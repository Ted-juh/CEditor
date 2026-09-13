# Rack issue icons

Rack List and Canvas show compact icons for native-reported MIDI output errors,
disconnected inputs affecting that part, instrument recovery, suppression by another
part's Solo, and a part audio fader at zero. Missing, Off, Mute and Solo keep their
existing indicators; no duplicate icon is added for those states.

Hover gives a native tooltip. Keyboard focus displays the same detail, and Escape
hides it. Clicking opens the existing Mixer, Zone, Routing, Audio & MIDI, or Health
surface without changing parameters or opening the vendor editor. Health's Rack
diagnostics section contains the longer explanations and navigation buttons, and
is absent when there are no entries.

The selected part can also show one neutral filtering icon for 2.5 seconds after a
new monitored note is outside its channel, key or velocity zone. It describes the
last monitored input, not a diagnosis of all MIDI reaching the instrument. Routed
parts are excluded because their incoming notes may differ from the global monitor.
Notes accepted by the zone, note-offs and unrelated monitor events clear the icon.
Cached events are ignored when subscribing, and a note is associated with the part
selected when it arrived. There are no added icons based on meter silence, an
unrequested device list, or missing hardware audio returns.

All information comes from the existing host state and MIDI activity events. No
audio-engine changes, scanning, polling or persistent settings were added.

Validation: `hostPartIssues.test.js` covers classification, false positives and
event lifetime; `browser-checks/partIssues.mjs` checks the real Svelte views, direct
navigation, keyboard tooltips, expiry, Canvas and responsive sizing. The existing
target-context browser check also passes. The application was not built.
