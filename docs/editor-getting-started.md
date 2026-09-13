# Your first working CEditor panel

This walkthrough covers creating a control, connecting it to MIDI, testing it, saving it and
exporting a VST3. You can design and save a panel without connecting any hardware.

## Create a panel and control

Choose **File → New Panel** (Ctrl+N). Give it a name and choose **Blank**, or use **Synth basics**
for a starting layout. Panel width and height are canvas pixels. Create the panel.

Use **+** in the left rail to add a **Knob**. Select it to edit its properties. In edit mode,
dragging selects or arranges controls; it does not operate the instrument.

## Choose where MIDI goes

The bottom status bar shows **MIDI out**. **Preview Only** means that nothing is sent to hardware.
Click this status to open **Ports**, then choose the output connected to your instrument and an
input for receiving its changes. The same choices are available in **Settings → MIDI**.

Ports selects the device used by the panel's bindings. If the panel uses several devices, choose
one in **Device** before changing its ports or sending a message. A new blank panel starts with
`mainSynth`. A control's Role must match the device you configured; profile assignment and additional
device settings are available in Settings → MIDI.

## Bind the knob

With the knob selected, open **Device Bindings** in Properties. There are two ways to bind it:

- **Known device parameter:** choose the instrument's profile in the **Device** tab, then drag
  its parameter onto the knob. This uses the profile's message definition and compatible metadata.
- **Raw MIDI control:** click **Add** in Device Bindings and change **Kind** to **MIDI control**.
  Choose **CC**, enter the controller number from the instrument's MIDI implementation, and set
  its channel. For example, CC 74 is only a useful test if your instrument assigns it a function.
  Channel 0 listens on any channel and sends on channel 1; choose 1–16 for an exact channel.
  Raw bindings send the control's value directly. For a standard 7-bit CC, set the knob's
  **Behavior** minimum to **0**, maximum to **127**, and value type to **integer**.

The top toolbar also offers **Bind…** for the current profile. After choosing a parameter there,
the knob adopts its range and value type, with Dry Run off. Its **Properties** button opens
Device Bindings directly.

You can also click **MIDI learn**, move a control on your instrument, and drag its learned chip
onto the on-screen knob. **Last received** shows the latest controller number, channel and value
for the selected binding's device role. Clock and keep-alive bytes do not replace that readout.

**Binding status** explains the next missing step. A manually added device-parameter binding
starts with **Dry Run** enabled: turn it off to send. Keep Dry Run on when you only want to inspect
the generated message. Input-only bindings, such as note velocity, follow incoming messages;
moving them does not send MIDI.

## Operate and check it

Turn on **Preview** in the left rail, then move the knob. Open **MIDI** to inspect messages.
The binding needs to be enabled, assigned, and routed to an available output, with Dry Run off.
If the knob still does nothing, read Binding status and verify the instrument's MIDI channel
and controller assignment. Seeing an outgoing message proves that CEditor produced it; check
that the instrument actually responds too.

Turn Preview off to continue arranging and styling the panel. The Text, Effects and Screen
tools act on the selection; the editor canvas shows the result.

## Save, share and export

Choose **File → Save** (Ctrl+S) to save an editable `.cepanel`. Reopen it to check the result.
Use **File → Share Panel** when another person needs the panel with its supported referenced
images and fonts embedded. Missing assets are reported; resolve them before sharing or exporting.

Choose **Build → Export Plugin**. The Export properties show the action, identity choice and
build result. When copying an existing panel, choose whether this is an update of the same plugin
or a new plugin with its own identity. A DAW uses this identity when reopening projects.

The installed Windows exporter produces VST3 under **Documents/CEditor/Exports**, including
Lua/JavaScript support and prepared TypeScript. Older panels with CLAP/LV2 selected still produce
VST3; the build log explains the skipped formats. Other formats and additional native/Python
runtimes need the compiling exporter, subject to its supported combinations.

Add the exported VST3 to your DAW's plugin search path, rescan, load it and save/reopen a test
project. Route MIDI in and out in the DAW. Incoming host MIDI reaches the panel's main device
role; scripts process it on the message thread, so this is control scripting, not sample-accurate
MIDI processing. MIDI/SysEx availability also depends on the plugin format and DAW.
