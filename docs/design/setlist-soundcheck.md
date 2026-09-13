# Setlist Soundcheck

Soundcheck lives in Performance → Live setup → Setlist. Existing song recall, editing,
preloading and ordering controls remain visible. Every row adds a reference-status icon,
current loaded-processor indicator, peak/average readings, passage duration, Measure/Stop,
and an information button. Explanations appear only in tooltips or expanded row details.

Check setlist walks the entire ordered setlist without instantiating plug-ins, changing
the current song, opening MIDI ports or sending MIDI. Explicit Library rack captures are
parsed; following Current rig entries inherit the preceding capture. Before the first
capture, the current rack is the basis. A missing/unreadable capture also makes subsequent
implicit-rig entries unresolved until another valid capture supplies a basis.

Checks cover software instruments and inserts on parts, master, buses and returns against
the catalogue, module availability/file presence and safe-startup refusal. They also check
configured hardware MIDI output identifiers, part MIDI sources, bus destinations, the
song's scene/control page, and its scene's part, macro, parameter target/plugin identity,
clip and pattern references. Parameter IDs are not validated by loading processors.
The rack format does not declare required MIDI input devices per song; existing live MIDI
Health diagnostics remain the source for disconnected input warnings. A successful reference
check does not certify that a plug-in loads or a hardware device produces sound.

Measure starts only for the current song once processor loads and queued scene changes
have finished. It never recalls a song or changes a fader automatically. Stop finishes
the passage. Changing song/rig, leaving Setlist or opening Mixer stops the passage; a
two-minute native limit also protects against a detached WebView. Mixer opens the existing
workspace, and results remain when returning to Setlist.

The native SoundcheckMeter taps main stereo output 1/2 after the master inserts/fader.
Other host output pairs and external hardware audio that is not returned through this path
are not included. Peak is maximum absolute sample amplitude. Average is RMS over every
sample/channel in the passage, including silence, converted to dBFS in the UI. It is not
LUFS/perceived loudness. Use comparable rehearsal passages, adjust manually in Mixer, and
remeasure. No audio recording, automatic gain correction or new database is introduced.

Inactive metering costs one atomic read per main-output block. Active metering uses one
audio-thread accumulator with lock-free atomic cumulative snapshots; it does not allocate,
lock or alter audio. The UI receives updates at most every 200 ms. Stop uses the most
recent completed snapshot, so a block overlapping Stop may be excluded. New measurements
use a generation token to prevent a previous passage's samples leaking into a new one.

Checks and measurements are timestamped session snapshots, not persisted project data.
Recheck after reference/device changes and remeasure after level/sound changes. Unmeasured
rows show a dash; genuinely processed silence shows −∞. No received buffers or nonfinite
audio produces an explicit error and retains an earlier successful measurement if present.

Validation: `test/setlistSoundcheck.test.js` covers state normalization and dB/status semantics;
`browser-checks/soundcheck.mjs` exercises real Svelte components with bridge fixtures, including
command routing, details, gating, responsive layout and navigation. Native regression cases
in RackHostTests and InstrumentHostServiceTests cover reference traversal, read-only checking,
missing rig inheritance, real graph measurement, reset/stop, silence, unequal buffer weighting,
invalid samples and failed-attempt retention. Native tests must be compiled/run by the developer.
