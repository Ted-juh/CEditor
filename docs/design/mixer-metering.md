# Mixer output metering

The Mixer reads stereo sample peaks after the existing GainPanProcessor on each part,
group bus, return, and master. These nodes already follow their insert chains. The master
meter covers output 1–2; it does not include parts routed directly to another output pair.
An external MIDI instrument only produces a reading for audio returned through Hostage.

StereoPeakMeter accumulates the largest absolute sample on each side until the UI-rate
drain. It uses lock-free float atomics and does not allocate, emit messages, or modify audio
on the audio thread. Auxiliary send and extra-output gain nodes do not measure separately.

InstrumentHostService's existing controlling-thread pump drains a dedicated
`instrumentHostMeters` event: `{channels: [{id, left, right}]}`. Values are linear and can
exceed unity. IDs identify parts, buses, returns, or `@master`; each packet is the complete
meter roster. This is transient display data, never a Performance mutation or full state
push. The native drain also clears intervals while the WebView is hidden or audio is stopped.

The web store applies instant attack, 24 dB/second release, a one-second peak hold, and a
numeric maximum with latched OVER at >= 0 dBFS. The scale ends at -60 dBFS. OVER means the
sample peak reached full scale; it does not assert that a floating-point internal bus was
clipped. Clear operations reset display memory only; fresh over-range audio re-latches.
Peak memory survives workspace navigation and resets when the Performance ID changes.
A Mixer-local timer lets bars and hold markers fall to silence if event delivery stops.

Validation is covered by `mixerMeters.test.js`, the dev-server browser check
`browser-checks/mixerMeters.mjs`, and native test cases in RackHostTests and
InstrumentHostServiceTests. Native cases cover transient capture, non-destructive reads,
post-insert/pan/gain routing through bus/return/master, mute, removal, and event delivery.
