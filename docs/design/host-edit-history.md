# Hostage Build edits

Build exposes Undo and Redo beside the transport. Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo.
Shortcuts only handle events inside Hostage and leave text fields and code editors alone.
Native history state supplies availability and the action named by each button's tooltip.

History covers synchronous Build document edits: rack parts and unloading, mixer/routing,
control-page assignments/options, MIDI modules, layers, modulation, patterns/steps, clips,
scenes, setlist and arrangement edits. It uses the existing session capture/restore path,
with a maximum of 20 checkpoints and 64 MiB across both directions. Continuous setters on
the same target/fields coalesce within 600 ms; discrete actions and new branches remain
separate. Refused commands and unchanged models add no checkpoint. Note traffic, parameter
gestures, meters and transport ticks never capture history snapshots.

Undo/redo requires stopped playback/recording and completed plug-in construction. Stage Lock
enforces the same restriction natively. Restoring can reconstruct the rack's processors;
this is an editing operation, not a seamless live-performance gesture. Surviving processors
keep their current vendor state. Deleted processors restore their checkpoint state, and
intentionally unloaded parts remain unloaded. History restoration does not transmit hardware
program changes or captured SysEx patches. Asynchronous restore completion re-enables history.

This is session-local Build history, not a file or plug-in editor undo system. Opening another
session or loading plug-ins/presets establishes a new boundary. Library records, folders,
controller profiles, external hardware changes and vendor-editor parameter history are not
undone. A model changed outside recorded Build commands cannot be overwritten by an obsolete
checkpoint: its history is invalidated before the next edit or undo.

Removal and bulk-clear buttons share inline confirmation: the first click arms Confirm, the
second performs the action, and Escape or five seconds cancels it. A changed target also
cancels the reusable confirmation button. Existing rack/page confirmations use the same
timing and Escape behaviour. Direct editing gestures inside graphs retain their keyboard
and pointer behaviour and participate in the corresponding Build edit history.

The visual consistency pass reuses Hostage's existing surface, border and text tokens in
the older Sounds details and browser styles. Layout, drag-and-drop and visible rack actions
remain in their approved positions.

Web verification uses the Sounds, Controller, Layers and Performance navigation browser
checks plus Hostage store/navigation/layout tests. `testBuildEditHistory` in the native
InstrumentHostService suite covers coalescing, no-ops, branching, part deletion, unload/redo,
vendor state, asynchronous reconstruction, transport and Stage Lock. Native tests require
the user's next build; no application build was run for this change.
