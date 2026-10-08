# HoSTage manual

HoSTage is the instrument host built into CEditor: a rack of instruments for playing live. This
manual explains it in plain language, from building a rack to playing a set, and how to put your
own pages of knobs on a MIDI controller — including the screen of an M-Audio CTRL49 keyboard.

It is written for the beta. Where something is unfinished or works differently from what you would
expect, it says so in a note marked **Not finished yet**. The CEditor manual covers the rest of the
program: building panels, binding them to synths and exporting plugins.

> **Windows first.** Loading plugins into HoSTage, showing their windows, and driving the CTRL49 work
> on Windows only. On other systems HoSTage opens and you can look around, but plugins do not load.

## Contents

1. [What HoSTage is](#1-what-hostage-is)
2. [Getting around](#2-getting-around)
3. [Plugins](#3-plugins)
4. [The rack](#4-the-rack)
5. [Sounds](#5-sounds)
6. [Mixer](#6-mixer)
7. [Layers](#7-layers)
8. [Performance](#8-performance)
9. [Controllers and control pages](#9-controllers-and-control-pages)
10. [The CTRL49 and its screen](#10-the-ctrl49-and-its-screen)
11. [On stage](#11-on-stage)
12. [Utilities](#12-utilities)
13. [Editions](#13-editions)
14. [Where HoSTage keeps its data](#14-where-hostage-keeps-its-data)
15. [Known limits](#15-known-limits)

## 1. What HoSTage is

You build a **rack** of **parts**. A part holds one instrument — a VST3 plugin, or an external
hardware synth — with its own key range, MIDI effects, audio effects and mixer channel. You play the
whole rack from your keyboard: split it, layer it, send different keys to different parts.

Around the rack sit the things you need to play live:

- a **sound library** of every preset you own, with instant auditioning;
- **performance tools**: patterns, a clip launcher, a looper, modulation and tuning;
- **songs and setlists**, each song recalling its own rack, scenes and notes;
- **control pages**: your own pages of knobs and pads for any MIDI controller, shown on the
  CTRL49's screen if you have one;
- a large-type **Stage** screen for playing the set, with a lock against accidental changes.

Every plugin runs in a process of its own, so a plugin that crashes takes only itself down.

## 2. Getting around

Open HoSTage with **File → Hostage...** in CEditor. It opens in a tab of its own and takes over the
whole window. Close the tab when you are done; that also hands the CTRL49 back (see
[chapter 10](#10-the-ctrl49-and-its-screen)).

**Build and Stage.** The header has a **Build** / **Stage** switch. **Build** is for setting things up.
**Stage** shows the stage screen and turns on **Stage Lock**; to go back, **hold Build for one second**.
See [chapter 11](#11-on-stage).

**The header** also holds:

- **Undo** and **Redo** (**Ctrl+Z**, and **Ctrl+Shift+Z** or **Ctrl+Y**), for Build edits — up to 20
  steps. Undo waits while anything is playing or recording ("Stop playback and recording to undo
  Build edits.") and under Stage Lock. Some actions start the history afresh, so nothing before them
  can be undone: loading a plugin, an effect or a sound, stepping through presets, learning a control,
  changing the tuning or a hardware synth's settings, and finishing a recording or a capture. Undo
  does not cover the sound library, a plugin's own window or your hardware.
- The **transport**: play, **▷** continue from where it stopped, stop, **↤** back to the beginning, the
  position in bars and beats, the tempo, **tap tempo**, the time signature, and **EXT** to follow an
  external MIDI clock.
- **Panic**, which silences every note on every part.
- A status line for the audio: the device, sample rate, buffer, CPU load and dropouts ("xruns"), or
  "No audio device".

**Workspaces.** In Build mode there are six: **Rack**, **Sounds**, **Performance**, **Mixer**, **Layers**
and **Controller**, each described in its own chapter below. The **Utilities** open in a drawer on the
right: **Shows**, **Library**, **Audio & MIDI**, **Project**, **Product**, **Health** and **Edition**
([chapter 12](#12-utilities)).

**Editor and player.** HoSTage has two roles. The **editor** — the HoSTage in CEditor — makes
everything, including control pages and CTRL49 screens. A **player** plays a finished show. In a
player you can still add and replace instruments and effects, browse and load sounds, mix, edit
songs and setlists, and switch between [shows](#shows). Stage Lock restricts those, as it always
does. What a player does not have:

- making, renaming or removing control pages;
- assigning parameters to controls, **Auto pages** and the **⚡** quick-learn;
- **Describe controller**;
- the **Project** utility.

On the Controller workspace a player keeps the page menu, the knobs, **Learn hardware**, the **MIDI
mode** and **Pickup**. A show made on one keyboard can then be played from another.

**Try as player**, at the right end of the row of workspaces, shows your show as a player will run
it. The line under the logo then reads **PLAYER · LIVE STAGE**, and **Back to editor** brings
everything back. You cannot switch while Stage Lock is on.

HoSTage itself refuses what a player cannot do, so a script cannot do it either. It says why:
"Screens and control pages are made in the HoSTage editor; a player shows them and cannot change
them (…)".

**Make a player** in the [Shows](#make-a-player) utility makes one. A player shows **PLAYER** where
**Try as player** would be, and has no editor to go back to.

**Removing things.** Removing a part, a plugin, a pattern and most other things asks for a second
click within five seconds before it happens; many buttons say **Confirm** while they wait.

**Saving.** There is no Save command. HoSTage saves the rack, its pages, scenes and songs by itself
after every change. To keep a copy, use **Save rack** (see [Saving and presets](#saving-and-presets)).

## 3. Plugins

HoSTage only knows the plugins it has scanned, and it never scans by itself. Open the **Library**
utility and press **Scan plug-ins**. Only VST3 plugins are scanned.

- On Windows it searches the standard VST3 folders, plus any **Extra scan folders** you add. That list
  is at the bottom of the Rack's right-hand column (see [The right-hand column](#the-right-hand-column)):
  press **Browse…**, or type a folder and press **Add**.
- On other systems it searches only the folders you add.

Each plugin is examined by a separate helper program. If a plugin crashes or hangs during the scan,
only that plugin is set aside ("quarantined") and the scan carries on. **Health → What could not be
offered** lists the plugins that were set aside, with a **Retry** button.

Each plugin shows as a tile with a picture. Click the picture to choose a different one; **↺** puts
the original back. (Clicking the picture never loads the plugin.)

## 4. The rack

### Parts

1. Press **+ Add part** in the Rack and click the part to select it.
2. Load an instrument: press **Load** next to it in the **Instruments** list in the right-hand column
   (press **Plug-ins** in the rack's header if the column is hidden — see below). In **Canvas** view you
   can also drag an instrument onto a part. Or pick a sound in **Sounds** and double-click it.
3. Set the part up with the tabs of the dock at the bottom (see [The dock](#the-dock)).

### The right-hand column

Beside the rack is a column with the **Instruments** list (search, **Load**), the **Effects** list
(**Insert**), **Control pages** with the CTRL49 screen card ([chapter 9](#9-controllers-and-control-pages)),
and **Extra scan folders** ([chapter 3](#3-plugins)).

While the dock's **Sounds** tab is open — as it is when HoSTage starts — the sound list takes its
place and the column is hidden. Press **Plug-ins** in the rack's header to show it, or open another
tab of the dock.

### The part rows

Each part's row shows:

- its name, coloured stripe and state: **Missing** (its plugin cannot be found), **Off**, **Muted** or
  **Solo**. A problem icon appears when something is wrong; click it to go straight to the fix;
- buttons to move it up or down, show the plugin's window in the pane or pop it out into a window of
  its own, **Unload** the plugin, or **Remove** the part (both ask to confirm);
- the preset walker **‹ name ›**, to step through the plugin's presets;
- the key-range button, which opens the keyboard's range view (below);
- **Active** (off silences the part and releases its notes), **Mute** (audio only — its notes keep
  running, so it comes back in time), **Solo**, **Vol** (−∞ to +6 dB) and **Pan**.

Parts are coloured by their place in the rack, and the colour follows them to the keyboard, the
layers and the mixer.

### The keyboard

A keyboard sits above the Rack, Mixer, Layers and Sounds workspaces.

- **Playing.** Click the keys, or use your computer keyboard: **A W S E D F T G Y H U J K** play an
  octave, **Z** and **X** shift it down and up. Click lower on a key to play it harder. The octave
  buttons and **Octaves** (1 up to Full) set what is shown.
- **Ranges.** The key-range button on a part switches to range view: all 128 keys, with each part's
  range as a coloured band. Drag the tabs at the ends to set a part's lowest and highest key, drag the
  band to move it, click another part's band to switch to that part. **Play**, or **Esc**, goes back.

### List and Canvas

The rack can be shown as a **List** or as a **Canvas**. The canvas draws the signal flow: parts on the
left, then buses, then the master, with returns in a band of their own.

- Drag a part or bus onto another box to route it there.
- Drop an instrument on a part to replace it, or on empty space for a new part.
- Drop an effect on a part, a bus, a return or the master to add it there.
- **Reset layout** forgets the places you dragged boxes to.

### The dock

The dock along the bottom has the tabs **Sounds**, **Zone**, **MIDI**, **Inserts**, **Routing**, **Params**
and **Rack**. Zone, MIDI, Inserts, Routing and Params appear when a part is selected. Click the open tab again to fold the dock away; drag its top edge to resize it
(double-click it to fit), and use **↗** to enlarge it. The part picker in the dock chooses which part
you are editing.

- **Zone** — the part's key range and velocity range, its MIDI **Channel** (Omni or 1–16) and
  **Transpose** (up to 60 semitones either way). **● learn range by playing** sets the range from the
  lowest and highest key you play; **every key** opens it up again.
- **MIDI** — the MIDI effects in front of the instrument. **MIDI from** chooses where the part's notes
  come from: your keyboard, or the output of another part's MIDI chain (choices that would make a loop
  are greyed out). **+ Add module…** adds one of: **Arpeggiator**, **Key** (scale and transpose),
  **Chords**, **Velocity / Expression**, **Note shaping**, **Echo**, **Strum**, **Humanize**, **Chance**,
  **Note length**, **Latch**, **MPE Transformer** and **Articulation Manager** — up to eight per part.
  Drag modules by their grip or use **▲▼** to reorder them; **Byp** bypasses one; each has its own
  presets.
- **Inserts** — the audio effects after the instrument. HoSTage has no built-in effects: **+ Add
  effect…** lists every VST3 effect you have scanned. Each effect can be reordered, bypassed (**Byp**),
  opened in its window (**Editor**), its parameters shown (**P**), or removed.
- **Routing** — the part's sends to the return buses (once there are returns) and, for instruments
  with several outputs, where each output goes. For a hardware synth this tab holds its settings
  (see [External synths](#external-synths)).
- **Params** — every parameter of the part's plugin, with a search box, **assigned** to show only the
  ones on a control, **ID** to show each parameter's own number, and your **Pinned** and **Recent**
  ones. On each row: **↺**
  resets it, **→** puts it on a control page, **M+** adds it to a macro, **⚡** learns it to a knob on
  your controller ("click, then move a control on your MIDI keyboard"), **☆** pins it.
- **Rack** — what belongs to the rack as a whole: **Master effects**; **Returns** (**+ Return**, each
  with its level and its own effects); **Buses**, once there are any, each with its own effects to
  add, reorder, bypass or remove; and **Macros** (**+ Macro**): one knob that moves several
  parameters, each over its own range.

### External synths

A part can play a hardware synth instead of a plugin. Select an empty part, open **Routing** and press
**Use external hardware…**, then choose its **MIDI output**, **Channel** and **Audio return** (the input
its audio comes back on).

- **Bank** / **Program** and **Send program** choose the synth's sound.
- **Capture patch…** records a patch dump from the synth, so HoSTage can send the same sound back
  later with **Send patch**. **Forget** throws the captured patch away. **Compare with** compares the
  captured patch with a patch saved in the library.
- **On session open** decides what happens to the captured patch when you open the rack again:
  **Ask first**, **Send it** or **Do nothing**. With **Ask first** HoSTage asks "Restore a captured
  patch to your hardware?" — **Send it** or **Not now**.
- **Make software part** turns the part back into a plugin part.

### Saving and presets

The rack saves itself after every change. To keep things in the library, use **Save preset** (or
**Save patch** for a hardware part), **Save chain** (the part with its MIDI and audio effects) and
**Save rack** (everything). They then appear in [Sounds](#5-sounds).

### When a plugin crashes

Every plugin runs in a process of its own. If one crashes, hangs or stops keeping up with the audio,
HoSTage takes just that one out: an instrument falls silent, an effect lets the sound through
untouched, and every other part keeps playing. With **Health → Live plug-in failover** switched on,
HoSTage then starts a fresh copy with its last saved settings. After a crash, **Safe startup** keeps
the plugin that crashed from loading again when you reopen, until you allow it ([Health](#health)).

## 5. Sounds

The **Sounds** tab of the dock — or the **Sounds** workspace, for the whole window — is a library of
every preset, chain and rack you have: your plugins' own presets and the ones you saved. It has
search, favourites, ratings, tags and collections.

Selecting a sound does not load it. Double-click it, or press **Enter**, to load it into the selected
part. The **audition bar** plays the selected sound — at once, if a preview has been recorded — with a
note, a chord, a scale, a riff, or what you last played.

**⌘ Browse on controller** shows the sound browser on the CTRL49's screen too
([chapter 10](#10-the-ctrl49-and-its-screen)).

Where the library comes from, and the previews, are set in the **Library** utility:

- **More folders to search** / **Add folder…** — folders of preset *files* (.vstpreset, NKS, FXP and
  the formats of Spire and Zebra). This is for presets; plugin folders go under Extra scan folders
  ([chapter 3](#3-plugins)).
- **Update library** reads them, with a report per plugin of what was found (**Test these files**,
  **Another folder…**, **Remove folder**).
- **The auditioner** plays each sound once, records a short preview and measures its level, so
  auditioning later is instant: **Listen to N sounds**, **Stop listening**, and **MEASURE EVERYTHING
  AGAIN**. Sounds that could not be heard are listed with the reason. Each sound plays in a separate
  helper process, so a preset that crashes its plugin is noted and skipped.
- **Housekeeping** finds sets of duplicates and lets you **Fold** them into one.

## 6. Mixer

One strip per part: a pan knob, a send knob for each return, a fader with a meter (double-click it for
0 dB), its gain and peak level, and **M** (mute), **S** (solo) and **On**. When there are buses, a menu
on each strip chooses where it goes; when the product has more than one pair of outputs
([Product](#product)), another chooses which.

After the parts come the buses (each with its name, effects count, latency, level and destination),
the returns, and the **Master** strip with its latency, output and CPU load. A bus's effects are
listed in the dock's **Rack** tab. **+ Bus** adds a bus
— a group that several parts can be routed into. **Clear peaks** resets the peak readings.

## 7. Layers

A **layer** plays several instruments from the same keys and decides which of them sound, or how much
of each. **+ New layer** makes one from two parts that are not in a layer yet (and do not take their
MIDI from another part). A layer can hold up to eight instruments; there can be 32 layers.

For each layer:

- switch it on or off, name it, or **Remove group**;
- **Voice mode**: **Layer all** (every instrument plays), **Round-robin** (each new note goes to the
  next one) or **Least busy**;
- **Source** — what chooses between the instruments: **Velocity**, **Key position**, a **MIDI CC**,
  **Expression (CC 11)** or a **Macro**. Each instrument gets a range of that source: drag its range
  and crossfade handles, or type **Minimum**, **Maximum** and **Crossfade**.
- **Add instrument** / **Remove instrument**.

With velocity or key position, each note is sent to the instruments whose range it falls in. With a
CC, expression or a macro, the sound crossfades smoothly between them as you move the control.

## 8. Performance

The **Performance** workspace holds everything you play *with* rather than *on*. A rail on the left
groups its tools:

- **Show**: **Songs**, **Launcher**
- **Patterns**: **Patterns**
- **Capture**: **Looper**, **Gestures**, **Recorder**
- **Modulation**: **Matrix**, **MIDI LFOs**, **Envelopes**, **MSEG**, **Random**
- **Setup**: **Tuning**

Patterns, clips, the looper and gestures, scenes, songs and setlists belong to the **Pro** edition
([chapter 13](#13-editions)).

**↶ Capture last** at the top turns what you just played — the last 10 seconds, 30 seconds, 1 minute
or 2 minutes — into a pattern and a clip you can edit, even if the transport was not running. Play
first, decide afterwards.

### Patterns

**+ Pattern** adds a pattern; **+ Clip** on its row makes a clip from it, for the launcher.

A pattern is made of **lanes**. **+ Add lane…** adds a note, chord, drum, CC or parameter lane. Note
and chord lanes are a piano roll, drum lanes a step grid, CC and parameter lanes a row of bars. For
each lane you set the number of **Steps** (1–64), **Steps per beat**, the **Part** it plays, its **Note**
or **CC**, **Glide**, a **Euclid** rhythm, and **Clear**; **Mute** silences it. Once the pattern has a
clip (**+ Clip**), **● Capture** records into a lane from your keyboard.

Right-click a step for its own settings: the note or value, **Tie** (the previous step holds on
through this one), **Plays** only
every few loops, and **Parameter locks** — a parameter or CC set to its own value on that step only
(**+ Lock**, **+ CC lock**).

The pattern itself has a name, **Swing**, a **Seed** for its random parts (**NEW** picks another), and
**Variations**: **Create B/C/D** makes three variations, **Subtle**, **Balanced** or **Bold**. The
**groove** bar puts the feel of a groove on the pattern — choose one, its **Strength** and whether it
shapes the **Velocity accents** too, and press **Apply**. **Steal this feel** keeps this pattern's own
feel as a groove for other patterns; **Import JSON…** loads one.

### Launcher

A grid of **scenes** (rows) and **clips** (columns). Click a cell to make that scene start that clip;
start a scene to start all of its clips at once. **+ Scene from the rig** makes a scene of the rack as
it is now, and **■ Stop all** stops every clip.

- Each clip has its launch quantize (from immediately to 4 bars), **Loop**, and a **follow action**
  for what happens after a number of loops: nothing, stop, the next clip, a random clip, or a chosen
  one.
- Each scene has its quantize, a **Morph** time (from a cut to 16 beats) for gliding the sound from
  the previous scene, **Controls** (which control page to show on your controller, or **Keep**),
  **Capture** (store the rig as it is now in the scene), **B/C/D** variations and **+ Song** (add a
  song to the setlist that recalls this scene).
- **Fill**: a fill pattern that plays while you hold a pedal (choose its **Pedal CC** and **Channel**)
  or the **Hold Fill** button, and lets the clip carry on where it was when you let go.
- **Freeze MIDI** plays the clip through the part's MIDI effects — the arpeggiator, chords and the
  rest — for 1, 2, 4 or 8 cycles, and keeps what comes out as a new clip you can edit.

### Looper, Gestures and Recorder

- **Looper** — **● Record new layer**, then **Close and loop**; **+ Overdub** records on top.
- **Gestures** — records the movement of controls, not notes — HoSTage's own, plugin knobs and the
  CTRL49's — as automation you can edit: **● Record new gesture**,
  **+ Overdub**, **Replace**, **Clear**. The **Gesture library** keeps movements you like (**Keep this
  movement**) to put back on a lane later (**Put on lane**), at **Full**, **Gentle** or **Barely** depth.
- **Recorder** — **● Record everything** you play, and **▶ Instant Replay**, which first puts the rig
  back the way it was when you played it.

### Modulation

The **Matrix** connects sources to destinations: **+ Route**, choose a source — **Note velocity**, **Mod
wheel**, **Expression**, **Channel aftertouch**, **Poly aftertouch**, **Pitch bend**, a **MIDI CC**, or
any of your LFOs, envelopes, MSEGs, random sources and macros — then the destination parameter and a
**Depth** from −100% to +100%. Up to 128 routes.

**MIDI LFOs**, **Envelopes**, **MSEG** (a curve you draw) and **Random** each make up to 32 sources,
which you route in the Matrix. A MIDI LFO can also go straight to a hardware synth, as a CC, NRPN or
SysEx message: **+ Output** on the LFO (there must be a hardware part).

### Tuning

The **Microtuning Manager** retunes the instruments: **Import Scala .scl** for a scale, the root note
and reference pitch, and **Reset 12-TET** for normal tuning. For each part, **Tuned** or **Off**, and
**Send now**. It uses MIDI Tuning Standard messages, so only instruments that understand them are
retuned; the MTS device ID and program are set here.

### Songs and setlists

**Songs** holds the set: the list of songs, and for each one:

- its **tempo**, planned length and notes for the stage (words in CAPITALS are shown as cues);
- its **Rig**: the rack as it is now, or a saved rack to load;
- its **Controller page**: the control page to show when the song starts, or **Keep**;
- its **sections** on a timeline — drag a block to move it, drag its edge to change its length,
  **+ Section from a scene…** adds one, and **Loop** starts the song again from its first section
  when it reaches the end;
- **▶ Play from the top**.

**Before the show** prepares the set:

- **Check setlist** checks every song's saved rig without loading plugins or sending MIDI, and marks
  the songs with a problem.
- **Preload** (**Off**, **Next song** or **Next 2**) loads the coming song's rig before you need it, so
  changing songs is instant.
- **Measure**, on each song: select the song, press **Measure**, play a passage and press **Stop**
  (it stops by itself after two minutes). The row then shows the song's peak and average level and
  how long its rig took to load — useful for evening out the levels of a set.
- **Mixer** opens the mixer.

## 9. Controllers and control pages

### Any MIDI controller works

HoSTage works with any MIDI controller without setting anything up: **MIDI learn** binds whatever you
move, whatever sent it. The quickest way is the **⚡** button next to a parameter in the dock's
**Params** tab: click it, then move a knob on your keyboard.

The **Controller** workspace is where you do it properly. Its title is **MIDI learn**: "Drag a
parameter onto a control, then learn its hardware binding."

- **A picture of your controller.** For the CTRL49 it is built in ("M-Audio CTRL49", with
  "● plugged in" when it is connected). For any other controller, press **Describe controller**, give it
  a **Name** and the number of **Knobs**, **Faders** and **Pads** — or press **Count them for me**, move
  each control once and press **Heard N — finish** — and **Use this**. **Forget it** removes your description.
- **The parameters**, on the left: choose the **INSTRUMENT** (the part), search, or show only
  **Favourites** or **Recently touched**. Your **Macros** are listed too.
- **Assigning.** Drag a parameter onto a control in the picture — or select both and press **Assign
  selected**. Then press **Learn hardware** and move the real control ("Listening for MIDI…"), so
  HoSTage knows which MIDI message it sends.
- **The inspector** for the selected control shows its state (**EMPTY**, **MAPPED**, **UNRESOLVED** or
  **UNAVAILABLE**) and how it behaves: a response curve, **Steps**, **Direction** (**Normal** or
  **Inverted**), **Momentary** or **Latching** for pads and buttons, the **MIDI mode** for endless knobs
  (**Absolute**, **1 / 127**, **64 centre**, **Sign bit**) and **Pickup** (the parameter does not jump
  when the knob is somewhere else; it waits until the knob reaches it). **Clear MIDI binding** forgets
  the learned control; **Clear assignment** empties it.
- **Layers.** Faders and pads can have several layers (**Fader layers**, pad **Layers**), each with its
  own assignment, and pads a **Pad colour**.

Besides plugin parameters, a control can move a part's gain, pan, morph and sends, the amount of a
MIDI module, or a macro.

### Control pages

Assignments are organised in **control pages**. A page has a name, like "Filter" or "Lead", and says
what the eight encoders do — and the faders, pads and buttons too. This is how you build screens for
the CTRL49 — each control page *is* a screen on its display, showing its eight encoders ([chapter 10](#10-the-ctrl49-and-its-screen)). On another controller, a page is a set
of assignments: switch pages in the page menu, or let a scene, a song or a sound bring one up.

The page tools are at the top of the Controller workspace (and under **Control pages** in the Rack's
right-hand column):

- **+ Page** adds an empty page of eight controls. The first parameter you drop with no page yet
  makes one called "Surface".
- **Auto pages** builds pages from the selected part's plugin: its parameters, grouped the way the
  plugin groups them, eight to a page, each page named after its group — "Filter", or "Filter 1", "Filter 2" and so
  on when a group needs more than one page.
  Pressing it again replaces the pages it made before, not the ones you made yourself.
- The page menu (**CONTROL PAGE n / m**) switches pages; the pencil renames one; the trash button
  removes it.
- The link button ties a page to the sound loaded in the selected part — "Show this page whenever
  "…" is loaded" — so the right knobs come up when you change sounds.

Scenes and songs can bring up a page too: a scene's **Controls** and a song's **Controller page**
setting ([chapter 8](#8-performance)).

Pages are saved with the rack, like everything else, and travel with its scenes and songs. With up
to three pages, a scene's **Controls** and a song's **Controller page** show them as buttons; with
more, as a list.

In a player, and under **Try as player**, pages can be played and switched but not made or changed.
See [Editor and player](#2-getting-around).

## 10. The CTRL49 and its screen

The **M-Audio CTRL49** is a 49-key controller keyboard with a colour screen (480 × 272 pixels), eight
endless encoders and a data dial, nine faders, eight pads in four banks, and a row of buttons.
HoSTage drives its screen: it shows your control pages, with the name and value of every knob, and the
encoders and pads play whatever is on the page.

### Connecting it

1. Install the **M-Audio CTRL49 driver** (Windows).
2. Close **VIP** and your DAW, or at least make sure they do not have the port called "CTRL49 USB"
   open — only one program can drive the screen.
3. Plug the keyboard in and open HoSTage. It finds the keyboard by itself within a couple of seconds,
   shows a start-up splash on it, and then your pages.

HoSTage drives the keyboard only while its tab is open; close the tab and the keyboard gets its own
screen back ("CTRL49 released (HoSTage is closed)"). Only one HoSTage window can drive it at a time.

The connection's state is shown in the Controller workspace, in **Audio & MIDI → Control surface** and
on the CTRL49 screen card (the Stage screen shows a shorter "Hardware display · Connected"). The
messages:

| Message | What to do |
|---|---|
| CTRL49 USB connected | Nothing — it works. |
| CTRL49 found, starting its display… | Wait a moment. |
| No CTRL49 connected — plug it in and it connects by itself | Plug it in. |
| CTRL49 plugged in, but its driver is missing | Install the M-Audio driver. |
| CTRL49 is in use by another program | Close VIP or your DAW. |
| CTRL49's display port would not open | Another program (probably VIP) is holding it. |
| CTRL49 is in use by another HoSTage window | Close the other one. |
| CTRL49 could not be opened, or The CTRL49 did not start | The reason is shown with it. |

### What the screen shows

The screen shows one page at a time. In order:

1. **Your control pages.** The page's name at the top, the eight encoders as knobs with the name of
   what each controls and its value as the plugin writes it (for example "2.40 kHz"), and
   **PAGE n / m**. If the keyboard connects to a rack with no pages, and the selected part has an
   instrument, HoSTage makes **Auto pages** for it — once each time the keyboard connects, and not
   under Stage Lock.
2. **Performance** — the transport, the position, tempo, song and scene. The pads launch clips (bank
   A) or scenes (bank B); the encoders set tempo, swing, rate, length, gate, velocity, probability and
   the master level.
3. **Stage pages**, only those you switch on (see below).
4. **The sound browser**, when **⌘ Browse on controller** is on in Sounds.

### What the controls do

- **Encoders 1–8** turn the eight knobs on the page; the **data dial** turns the selected one.
- **Pads 1–8** do what is assigned to them on the current layer; a pad with nothing assigned plays
  chords. Pads light up in their layer's colour. **Hold** the small button above a pad for half a
  second to step that pad to its next layer.
- **Page ◀ / ▶** go to the previous or next page; **Main**, **Browse**, **Control** and **Multi** jump
  to pages 1 to 4.
- **Shift + Page ◀ / ▶** step to the previous or next song in the setlist, from any page.
- **Shift + Pad Bank A–D** chooses the pad bank.
- The **faders**, the buttons below them, **Bank ◀ ▶** and the transport buttons work through the
  keyboard's Mackie section, as long as **HoSTage uses the Mackie section** is on in **Audio & MIDI**
  (it is by default).

### Building screens for the CTRL49

A CTRL49 screen in HoSTage is a control page. To make one:

1. Open HoSTage and go to **Build → Controller**.
2. Press **+ Page** for an empty page, or select a part and press **Auto pages** to start from the
   plugin's own groups of parameters.
3. Rename the page with the pencil — the name is the title on the screen.
4. Drag parameters or macros onto the eight encoders in the picture. Set **Steps**, **Direction** and
   the rest in the inspector, and give the pads their assignments and colours.
5. If the page belongs to one sound, tie it to that sound with the link button.

The screen updates as you go: there is nothing to upload or send. HoSTage redraws the page about ten
times a second, with only what changed. Every page has the same layout — a title and eight labelled
knobs with their values; you choose what is on it, not how it looks.

### The CTRL49 screen card

At the bottom of the Controller workspace (and under **Control pages** in the Rack), the **CTRL49
screen** card shows exactly what the keyboard shows — whether a keyboard is connected or not. It says
"Showing on the keyboard too" when one is, and "… — shown here only" when not. It has **Page Left** /
**Page Right**, the eight encoders (drag them, scroll on them, or click a value and type one), the
eight **Pads**, and the arrow keys change page. It is how you check your pages without the keyboard.

**After Performance** on the card switches the stage pages on and off:

| Page | What it shows | What the encoders and pads do |
|---|---|---|
| **Cue** | The setlist. | Encoder 1 picks a song; pad 1 goes to it. |
| **Live** | The keys as you play them, every part's zone, and the focused part's arpeggiator. | Encoder 1 picks a step; 2–5 set its velocity, octave, ratchets and chance; 6–8 the gate, rate and mode. Pad N turns a step on or off. |
| **Layers** | Every part's zone over the keys, and the notes you hold. | Encoder 1 picks the part; 2–6 set its lowest and highest key, transpose and velocity range. |
| **Meters** | Every part's level and fader, and the master's. | Encoders 1–5 are the faders of the parts shown, 6 the master; 7 shows more parts. |
| **Soundcheck** | The set, checked song by song. | Encoder 1 walks the set; encoder 8 checks it again. |
| **Discover** | Sounds you own and have never opened, nearest to the ones you load most. | Encoder 1 picks, 2 reaches further, 3 keeps to one kind, 4 keeps a sound as a favourite. Pad N plays row N. |
| **Changes** | The selected part's sound against its saves: what moved. | Encoder 1 listens between the save and now, 2 picks a change, 3 puts it back, 4 walks back through the saves. |

The switches are remembered: a page you switch on is on again the next time you start HoSTage.
**Browse on controller** is not — it is a mode for a moment, so the keyboard always starts on your
pages.

> **Not finished yet:**
> - **Cue** and **Soundcheck** need the scenes and setlists of the **Pro** edition.
> - Under Stage Lock, most stage-page changes are refused (zone edits on Layers, arpeggiator edits
>   on Live, Discover, Soundcheck); the knobs of your control pages and the Meters faders still work.
>   Switch stage pages on in Build.
> - The Stage screen's own copy of the controls shows only your control pages and Performance, not
>   the stage pages.
> - The stage pages have run in software only; they have not yet been tried on a real CTRL49.

### The editor's "New Screen (CTRL49)"

CEditor's start screen has a button **New Screen (CTRL49)**. That opens a different, older tool: the
**Screen Builder**, an early prototype of the same idea for hardware synths edited with CEditor.

It has pages of eight slots, each a **LABEL** and a parameter name (**param.id**) from a device
profile, a live preview of the page as the CTRL49 would draw it, and **Export**, which shows the page
set as text ("Assignment JSON", with a **Copy** button). It cannot save — closing its tab asks first,
then the screen is gone — and it cannot send anything to the keyboard: the only program that reads its
JSON is a developer tool that is not part of the installed CEditor. HoSTage does not use it.

To put your own screens on a CTRL49, use HoSTage's control pages, described above.

## 11. On stage

Switch the header to **Stage**. HoSTage shows the stage screen and turns on **Stage Lock**.

### The stage screen

- **The status bar**: the clock; the **set** timer (click it to restart the set and song clocks) and
  the **song** timer, each against its planned length, early or late; the audio device with its CPU
  load and dropouts; the MIDI and display status; the layout — **Full**, **Minimal** (now, next and the
  time) or **Controls** — remembered on this computer; **☀** for daylight contrast; **⤢** for full
  screen; **STAGE LOCKED**; and **PANIC**, which acts at once and shows "ALL OFF".
- **The songs.** Tap a song once to choose it, and again within four seconds to go to it.
- **Now**: the song, the scene, the tempo and clock source (**INTERNAL**, **EXT CLOCK** or **NO CLOCK**),
  the time left, and the sections ahead ("4 bars to Chorus").
- **Next**: the next song, whether its rig is "Rig preloaded", "Loads on selection" or "Needs
  attention"; **◀ PREV** and **START** / **NEXT ▶**.
- **Notes** in large type, with **A−** / **A+** for the size; words in CAPITALS are highlighted as cues.
- **Controls**: the knobs of the current control page (they move when you turn the hardware), the
  scene buttons, the parts and the macros.
- When something goes wrong while you play — a plugin that stopped or is restarting, a stuck note, a
  MIDI input that disappeared — a banner says what, with a button to fix it where there is one.

### Keys

| Key | What it does |
|---|---|
| **→** or **Page Down** | Next song |
| **←** or **Page Up** | Previous song |
| **1–9** | Choose that song; press it again, or **Enter**, to go |
| **Shift + 1–8** | Launch that scene |
| **Space** | Play or stop |
| **Hold P** for half a second | Panic |
| **N** / **Shift + N** | Larger / smaller notes |
| **Esc** | Cancel a chosen song |

### Stage Lock

Stage Lock stops accidental changes to the rig while you play. HoSTage itself refuses anything that
would change the set-up ("Stage Lock blocked '…'. Hold Build for one second before changing the
rig."). What you need to play still works: the transport and tempo, songs and scenes, clips, part
levels, mute and solo, macros and parameters, stepping through presets, bypassing effects, send and
return levels, the looper and recording, and panic. Plugin windows in the pane are hidden; windows you
popped out stay open.

To unlock, **hold Build for one second** (or hold Enter or Space on it). Let go too early and the lock
stays on.

## 12. Utilities

The **Utilities** drawer on the right holds seven pages. A player has six: it has no **Project**.

### Shows

A **show** is a whole evening in one file. It holds:

- the rig, with its control pages and CTRL49 screens;
- scenes, songs and the setlist;
- captured hardware patches;
- the controller description, and which CTRL49 stage pages are on;
- every sound from the library that a song, a morph or a page points at. A song that loads its own
  rack ("Save rack") takes that rack with it.

Plug-ins are never in a show. It names the ones it needs.

- **Save as new show** keeps the rig as a show under the name you type. **Save show** saves the open
  show again.
- The list shows every show this HoSTage knows. **Open** switches to one. If the open show has
  changes that are not saved, **Open** asks for a second click, because those changes are lost.
- **Delete** removes a show, after a second click. Shows that came with the program are marked
  **built in** and cannot be deleted. Saving one keeps your own copy in its place.
- After you open a show whose plug-ins are not installed here, HoSTage says so: "This show needs
  plug-ins this computer does not have: …". Install them and scan in the [Library](#library)
  utility. Until then the parts that use them stay silent.
- **Import a show…** opens a show file from a USB stick, a download or an email, and keeps a copy in
  this HoSTage's list. **Export this show…** writes the rig as a show file wherever you choose.

**When the rig changes**, you choose where the changes go:

- **Keep the changes apart until I save** (the default). The show stays as you saved it, and shows
  **changed**. The rig keeps your changes, after a restart too. **Back to the show** throws them
  away, after a second click.
- **Save them into the show as I go.** Each change goes into the show's file a moment later.

Shows open and switch outside Stage mode only; under Stage Lock HoSTage refuses. A player opens and
switches shows just as the editor does.

### Make a player

At the bottom of the **Shows** utility, the editor makes players. A player is this HoSTage copied
into a folder, together with the shows you tick. It plays them, and any show you import into it,
but makes no screens or control pages.

1. Type the **Player name**.
2. Tick the shows to put in it. The open show is ticked to begin with; the first ticked show is the
   one the player opens first. The open show goes in as it was last saved, so save it first if it
   has changes.
3. Choose **Standalone**, **VST3** or both.
4. Leave **For a USB stick** ticked (the default) to have the standalone keep its rig, shows and
   settings in a `Data` folder beside it, so they go wherever the folder goes. Untick it to keep
   them on each computer instead.
5. Press **Make the player…** and choose a folder. A folder named after the player is made in it,
   and HoSTage says where: "Made "Friday Rig" in …".

The folder holds:

- **Standalone** — the player program, under the player's name, with its helpers. This folder can
  go anywhere, a USB stick included. Start the program in it. A player made for a USB stick makes
  its `Data` folder here the first time it starts. On a computer it has not been on, scan for
  plugins once in its Library utility. If it cannot write beside itself (a stick with its lock
  switch on, or a folder like `Program Files`), it still starts, and keeps its data on that
  computer.
- **VST3** — the player as a plugin. Copy it into your VST3 folder (on Windows,
  `C:\Program Files\Common Files\VST3`).
- **Read me.txt**, which says the same.

The plugins the shows use are not in the folder. Install them on the computer that plays, and scan
for them in the player's Library utility.

> **Not finished yet:**
>
> - Every player is the same plugin to a DAW, so install one player's VST3 at a time.
> - A player has no licence of its own yet, so it runs as the Free edition: one instrument at a
>   time.
> - It makes a folder, not an installer.

### Library

Scanning plugins (**Scan plug-ins**) and the sound library's folders, preview recording and
housekeeping — see [chapter 3](#3-plugins) and [chapter 5](#5-sounds). In the Rack workspace it opens
beside the rack rather than in the drawer.

### Audio & MIDI

- **Output** — the audio device. HoSTage uses the device's own sample rate and buffer size, and two
  output channels.
- **MIDI inputs** — switch each input on or off. The last message received, from any input, is shown
  with the name of the device it came from.
- **Control surface** — the CTRL49's status, and **HoSTage uses the Mackie section**
  ([chapter 10](#10-the-ctrl49-and-its-screen)).

### Project

**Build product** turns your rack into a product of its own: a standalone program and a VST3
plugin under your product's name, and an installer for them. Products are built in CEditor's
HoSTage tab; a HoSTage program has no Project utility, because it makes [players](#make-a-player)
instead. CEditor has everything it needs for the build. Only the installer needs one more thing,
Inno Setup (below).

1. Fill in the **Product name**, the **Version** (numbers with dots, such as `1.0.0`) and the
   **Publisher**. A name or publisher cannot contain `"`, `{` or `}`.
2. Choose **Standalone**, **VST3** and **Stage notes**.
3. Press **Build product…** and choose a folder.

A folder named after the product and its version is made in it, for example `Night Rack 2.0.0`.
Building the same version again makes `Night Rack 2.0.0 2` rather than writing over the first. The
folder holds:

- **Standalone**: the program under the product's name, with its helpers and its show. It runs from
  this folder as it is.
- **VST3**: the product as a plugin.
- **Read me.txt**, which says what the folder is.
- **NightRack-Setup-2.0.0.exe**: the installer (the name without spaces or punctuation, then the
  version). It installs the program, adds it to the Start menu and puts the plugin in the
  computer's VST3 folder.

The build is shown underneath as it happens, and HoSTage says where the product is when it has
finished: "Built "Night Rack": …".

The product starts with the show you are running: the rig and every sound its songs use. It lists
that show among its [shows](#shows) as **built in**. Stage notes go with it only when **Stage notes**
is ticked.

**The installer needs Inno Setup 6**, which is free, from jrsoftware.org. Without it, the build makes
the folder and says that the installer is the part it skipped. The folder works as it is, and
building again after installing Inno Setup adds the installer. The utility says before you press
the button whether Inno Setup was found.

**The Creator licence.** A CEditor built to require one asks for a **Creator licence** before it
builds. Paste the contents of your `.celicence` file into the box, and press **Install licence**.
**Remove licence** takes it off this computer. The beta does not ask for one.

> **Not finished yet:**
>
> - Products are built on Windows. On other systems HoSTage has no live plugin worker, which every
>   product needs, so the build says the worker is missing.
> - Every product is the same plugin to a DAW, as every player is, so install one product's VST3 at
>   a time.

### Product

How the built product behaves:

- **In a DAW** — clock, latency, tail, **Master level**, and **Output pairs** (1–8 stereo outputs).
- **Automation the host sees** — the 16 macro slots, a scene selector and the master level that a DAW
  can automate.
- **This machine** — what this computer supports, and **Claim** / **Release** for the hardware surface.
- **Project health** and **Crash evidence**, with **Clear the log**.

### Health

The tab turns to a warning colour when something needs attention.

- **Rack diagnostics** — what is wrong with the rack now, with fixes.
- **Since the last run** — what happened last time; **Go back to the last rig that booted** if the
  last change left you with a rack that will not start.
- **MIDI, right now** — stuck notes, jittery controllers, inputs that disappeared, with **Panic** for
  one part or **Everything**.
- **Live plug-in failover** — **Restore failed plug-ins automatically**, how many **Attempts** (1–5),
  the **First retry** delay, and **Retry now**.
- **Safe startup** — what loads when HoSTage opens: **Loading everything**, **Skipping plug-ins that
  crashed**, or **No third-party plug-ins at all**. **Load it again** and **Vouch for all of them**
  allow crashed plugins back on the next start.
- **What could not be offered** — plugins the scan set aside, with **Retry**.
- **Support bundle** — **See what would be in it**, then **Export…** a file to send when reporting a
  problem.

### Edition

Which edition is running and what it includes ([chapter 13](#13-editions)). **Install a licence…**
takes the contents of a .celicence file; **Remove it from this machine** takes it off. **Machines**
lists the seats in use (recorded on this computer only): **Use a seat on this machine** / **Release
this machine**.

## 13. Editions

| Edition | What it adds |
|---|---|
| **Free** (no licence) | One instrument plugin loaded at a time — effects do not count, and you can always replace the loaded instrument. |
| **Core** and **Founder** | Any number of plugins. |
| **Pro** | Patterns and clips (with the looper, gestures, Capture last and Freeze MIDI), scenes and setlists (songs, sections, the Cue and Soundcheck pages), buses, returns and extra outputs, and script actions. |

Free, Core and Founder have none of the Pro features. Never withheld, whatever the edition: VST3 hosting, the CTRL49's screen and normal control pages,
mappings, preset browsing, splits, layers and multis, saving and recalling complete set-ups, basic MIDI
routing, hardware detection, and the diagnostic export for support. The **Edition** utility lists what
the current edition includes.

## 14. Where HoSTage keeps its data

**In CEditor**, HoSTage keeps its data in `%APPDATA%\CEditor\instrument-host\` on Windows
(`~/.config/CEditor/instrument-host/` on Linux). That covers the rack, the plugin catalogue, the
scan folders, the sound library and its previews, and the logs. The CTRL49's connection log is
`%APPDATA%\CEditor\ctrl49-trace.log`.

**A product made with Build product** has a folder of its own:
`%APPDATA%\CEditorInstrumentHost\products\<id>\` (`~/.config/CEditorInstrumentHost/products/<id>/` on
Linux). The id is the product's **Installer identity** from the [Project](#project) utility, so
renaming a product keeps its rig. A file in the folder, `product.json`, names the product. The
Product utility shows the folder under **This machine**. Two products on one computer keep
separate rigs, plugin lists, sound libraries and licences.

**The Creator licence** is kept in `creator\` inside CEditor's HoSTage folder, apart from the
HoSTage tab's own licence.

**A player made for a USB stick** keeps everything in a `Data` folder beside its program instead,
so it travels with it. The claim on the CTRL49 stays on each computer.

**Shows** are kept in a `shows` folder inside the data folder. The shows a product came with sit in a
`shows` folder beside the program (inside a VST3, in `Contents/Resources/shows`).

**Products built before that** all shared `%APPDATA%\CEditorInstrumentHost\` itself. When a newer
build of a product starts in its own folder and finds data in the shared one, it asks once:

- **Bring it over** copies the rack, plugin list, sound library, licence and settings into the
  product's own folder the next time it starts. They replace what the product has. Restart it to
  finish.
- **Start fresh** leaves them where they are.

HoSTage asks because nothing records which product the shared data belonged to. An upgraded
product wants its rig back; a new product installed beside an old one must not take that one's.

**One keyboard, one owner.** Every HoSTage on the computer — in CEditor, a product, or a product
inside a DAW — claims the CTRL49 in the same place. Whichever takes it first keeps it until it lets
go, and the others leave it alone.

## 15. Known limits

- **Windows only**: loading plugins, showing their windows, crash reports from plugins, the standard
  VST3 folders, and the CTRL49.
- **VST3 only.** Other plugin formats are not scanned.
- **Audio**: only the output device is chosen; the sample rate and buffer are the device's own, and
  the output is stereo.
- **Limits**: 8 MIDI modules per part, 128 modulation routes, 32 of each modulation source, 32 layers
  of 8 instruments, 20 undo steps.
- **Tuning** works only with instruments that support MIDI Tuning Standard messages.
- **Build product** makes an installer only where Inno Setup 6 is installed, and builds only on
  Windows (see [Project](#project)).
- **Shows** carry the sounds you saved yourself and every captured rack. A vendor's preset file is
  not copied: the other computer needs the same preset, scanned into its library.
- **Players** share one plugin identity in a DAW, and run as the Free edition until players get
  licences (see [Make a player](#make-a-player)). A player's VST3 keeps its data on the computer
  even when the standalone is made for a USB stick.
- **Not yet tested on real hardware**: the MIDI and the CTRL49 stage pages have been checked in
  software.
