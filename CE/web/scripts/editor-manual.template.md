# CEditor Manual

CEditor builds the control panel for a piece of hardware. You draw the knobs, sliders and buttons,
tell each one which setting of your synth it changes, try it out, and export the result as a
plugin you can open in your DAW next to the track it controls.

This manual explains the program in two parts. **Part 1** walks through CEditor in the order you
will use it: finding your way around, building a panel, connecting it to a synth, testing it,
saving it and exporting it. **Part 2** is the reference: every menu, every tool in the dock, every
component and every keyboard shortcut.

CEditor is still being built. This manual describes the program as it is today, and where
something is unfinished or does not work yet, it says so in a note marked **Not finished yet**.
Scripting has its own manual: see the [scripting manual](scripting-manual.md).

## Contents

**Part 1: Using CEditor**

1. [What CEditor does](#1-what-ceditor-does)
2. [The window](#2-the-window)
3. [Building a panel](#3-building-a-panel)
4. [Making it look right](#4-making-it-look-right)
5. [Connecting to your synth](#5-connecting-to-your-synth)
6. [Describing a synth: device profiles](#6-describing-a-synth-device-profiles)
7. [Testing your panel](#7-testing-your-panel)
8. [States and animations](#8-states-and-animations)
9. [Scripts](#9-scripts)
10. [Custom components](#10-custom-components)
11. [Saving and sharing](#11-saving-and-sharing)
12. [Exporting a plugin](#12-exporting-a-plugin)
13. [HoSTage, the instrument host](#13-hostage-the-instrument-host)
14. [Settings](#14-settings)
15. [Known limits](#15-known-limits)

**Part 2: Reference**

- [Menus](#menus)
- [The dock tools](#the-dock-tools)
- [Components](#components)
- [Keyboard shortcuts and mouse](#keyboard-shortcuts-and-mouse)

---

# Part 1: Using CEditor

## 1. What CEditor does

A few words come up again and again in this manual:

- A **panel** is what you build: one screen of controls for one synth (or a few). It is saved as a
  `.cepanel` file.
- A **control** — also called a **component** — is one thing on the panel: a knob, a slider, a
  button, a label, a keyboard. Part 2 lists all of them.
- A **device profile** describes a synth: its parameters, the MIDI messages that change them, and
  how it sends and receives whole sounds. You choose one, import one or make one in the Device
  Profile Designer.
- A **binding** connects a control to a parameter, so that moving the control sends the right MIDI
  message to the synth, and a change on the synth moves the control.
- **Preview** is the mode in which you use the panel as the finished product, instead of editing it.
- **Exporting** turns the panel into a plugin (VST3, and optionally CLAP and LV2) for your DAW.

The usual way through is: create a panel, put controls on it, make it look the way you want, bind
the controls to your synth, preview it to check that it works, save it, and export it. You can
design and save a panel without any hardware connected; you only need the synth to test the MIDI.

If you would rather follow along step by step for a first panel, read
[Your first working panel](editor-getting-started.md) first, then come back here.

## 2. The window

The CEditor window has these parts:

- **The menu bar** along the top: File, Edit, View, Insert, Build, Window and Help. The
  [Menus](#menus) reference lists every item.
- **The icon rail** down the left edge. Its buttons insert new controls, switch **Preview** on and
  off (F5), and show or hide the dock, the component tree and the properties panel.
- **The context bar** across the top of the canvas. It shows the name of the selected control and
  quick settings for it: text, fill, border, size and position, effects, icon. On the right it shows
  what the control is bound to (**Device**) and how many scripts it has (**Scripts**).
- **The tab bar** under the context bar. Every open document has a tab: panels, device profiles,
  custom components, script workspaces, the Settings page and the HoSTage host. **+ New** and
  **Open** at its right end start or open documents.
- **The canvas** in the middle, where you build the panel. Rulers run along the top and left edge.
- **The component tree** to the right of the canvas: every control on the panel as a list, with
  buttons to hide and lock controls.
- **The properties panel** on the far right: every setting of the selected control, or of the
  panel itself when nothing is selected.
- **The dock** under the canvas: a strip of tools such as Colors, Text, Effects, Layers, Align,
  Device and MIDI. It is hidden when you first start CEditor; press **Ctrl+J** or **Dock** in the
  icon rail to show it. [The dock tools](#the-dock-tools) in Part 2 describes each one.
- **The status bar** along the bottom: messages, the MIDI output in use, the size and position of
  the selection, the panel size, grid and snap, ruler and guide toggles, and the zoom.

You can drag the borders between the canvas, the tree, the properties panel and the dock to resize
them. CEditor remembers the sizes, and which parts were showing, for next time. In a window
narrower than 920 pixels the tree, the dock and the properties panel are hidden to make room for
the canvas.

### Documents and workspaces

Each kind of document opens in its own tab. A panel tab shows the canvas with everything around
it. Device profiles, custom components, script workspaces, the CTRL49 screen builder and HoSTage
each take over the whole window while their tab is in front: the context bar, tree, dock and
properties panel step aside (the custom component workspace keeps the properties panel).

Click a tab to switch to it, or use **Ctrl+Tab**, **Ctrl+Shift+Tab** and **Ctrl+1** to **Ctrl+9**.
Drag tabs to reorder them. Close one with its **×**, a middle click or **Ctrl+W**; if it has unsaved
changes you are asked first. Right-click a tab for **Close Others**, **Close to the Right**, **Copy
Path** and **Reveal in File Browser**. A blue dot on a tab means it has unsaved changes.

One split view exists: a panel and a device profile side by side. With a panel in front, press the
small **Side** button on a device profile's tab. **Swap** and the orientation button on the tab bar
rearrange the two; closing the device profile tab ends the split.

With nothing open, the canvas offers buttons to start: **New Panel**, **Open Panel**, **New Custom
Component**, **New Device Profile**, **New Script Workspace**, **New Screen (CTRL49)** and **Import
Device Profile**.

### The dock

The dock holds tools you use while you work: the colour picker, the text and effects editors,
layers, alignment, the device parameter browser, the MIDI monitor and more. Click a tab along its
top to switch tools. To use two at once — Text beside Effects, say — **Alt+click** or right-click a
second tab, or press the split button at the end of the tab strip. Colors, Gradient, Notepad,
Viewer and Preview can only be shown on their own.

The dock also opens by itself when it is needed: clicking a colour swatch anywhere opens it on
**Colors**, and clicking **MIDI out** in the status bar opens it on **Ports**.

### Help

**Help → Documentation** opens the manuals inside CEditor, with a search box. **F1** shows every
keyboard shortcut. When you hover over a setting in the properties panel, the **Info** bar at its
bottom explains what the setting does.

## 3. Building a panel

### Starting a panel

Choose **File → New Panel** (Ctrl+N). The **New Panel** dialog asks for:

- **Name** — leave it empty for "Untitled Panel".
- **Start from** — **Blank**, or one of three starting layouts: **Synth basics** (filter and envelope
  knobs, volume sliders and an Init Patch button), **Performance pads** (drum pads, transport and two
  macro knobs) or **Mixer strip** (four channels with a gain knob over a fader).
- **Size** — a ready size (**Default** 600 × 400, **Wide editor**, **Mixer strip**, **Control bar**,
  **Large**) or your own width and height in pixels.

Press **Create Panel**. You can change the size later on the panel's **Core** tab.

There are other ways to start. **File → New Panel from Device Profile** makes a panel with one
control for every parameter of a synth, already bound. **New Panel from SVG Artwork...** and **New
Panel from Photoshop Artwork...** build a panel from a drawing (see
[Importing artwork](#importing-artwork)).

### The panel's own settings

Click an empty part of the canvas (or press Esc) so that nothing is selected. The properties panel
then shows the panel itself, on four tabs:

- **Core** — the name and other details, **Locked** (to stop accidental editing), the **Width** and
  **Height**, and under **Constraints** whether the plugin window can be resized and which key is the
  **Panic key**.
- **Background** — the panel's **Control set** (see [Control sets](#control-sets)) and its background:
  a solid colour, a gradient, an image and a texture, each of which can be switched on and off.
- **Grid** — whether the grid shows, whether controls snap to it, its size, style and colour.
- **Export** — how the plugin is built (see [chapter 12](#12-exporting-a-plugin)).

### Adding controls

The icon rail on the left has a button for each group of components: **Layout & Display**, **Buttons
& Choices**, **Values & Sliders**, **Modulation & Routing** and **Music & Performance**. Point at one
and its list opens. Then either:

- **click** a component to place it in the middle of the view, or
- **drag** it onto the canvas to place it exactly where you drop it.

The **+** button at the top of the rail searches every component by name, and lists the ones you used
recently. The **Insert** menu offers the same components. [Components](#components) in Part 2 says what
each one is for.

A new control is selected straight away, ready to be set up. If one container is selected when you
click a component, the new control goes inside it. (Dragging from the rail always places the control
on the panel itself, even over a container; drag it into the container afterwards.)

### Selecting

- **Click** a control to select it.
- **Ctrl+click** adds a control to the selection, or takes it out again. (Shift+click does the same.)
- **Drag** across an empty part of the canvas to select everything the rectangle touches; hold **Shift**
  to add to the selection.
- **Ctrl+A** selects everything. **Esc** clears the selection.
- **Tab** and **Shift+Tab** move the selection to the next or previous control.

When several controls are selected, the one you clicked last is the **key object**: its handles are
orange, the properties panel shows its settings, and alignment can line the others up with it.

The component tree on the right is often the easiest way to select a control that is hidden under
others. Click a row to select it; **Ctrl+click** adds; **Shift+click** selects a range.

### Moving, resizing and turning

- **Drag** a control to move it. Hold **Shift** to keep to a straight line, **Alt** to leave a copy
  behind, and **Ctrl** to stop it snapping to things. **Esc** while dragging puts it back.
- The **arrow keys** move the selection by 1 pixel; **Shift+arrow** by 10 pixels (or by the grid size,
  if that is larger).
- Drag one of the eight **handles** to resize. **Shift** keeps the proportions; **Alt** resizes around the
  centre.
- To turn a control, drag just **outside a corner**. **Shift** turns it in steps of 15°.
- For exact numbers, use the **Box** section of the context bar or the **Transform** tab of the
  properties panel.
- **Double-click** a control with text to type the text straight onto the canvas. **Enter** finishes,
  **Esc** cancels.
- Hold **Alt** and point at another control to see the distance to it.

While you drag, controls snap to the grid (when **Snap** is on), to the edges and centres of other
controls, to the panel's edges and centre, and to guides.

### Guides, rulers, grid and zoom

Drag from a **ruler** onto the canvas to make a **guide**: a line that controls snap to. Drag it to
move it; right-click it to remove it. Guides are saved with the panel. The buttons in the status bar
show or hide the rulers, the guides and the distance labels.

**View → Grid** shows the grid and **View → Snap to Grid** makes controls snap to it; the panel's
**Grid** tab sets its size and look.

Zoom with **Ctrl++** and **Ctrl+-**, or **Ctrl+scroll wheel** to zoom where the pointer is. **Ctrl+0**
fits the whole panel in the window. The scroll wheel scrolls; **Shift+wheel** scrolls sideways. Hold
**Space** and drag, or drag with the middle mouse button, to move around.

### Copying, duplicating and deleting

**Ctrl+C**, **Ctrl+X** and **Ctrl+V** copy, cut and paste within CEditor (not to other programs).
**Ctrl+Shift+V** pastes in exactly the same place; right-click → **Paste Here** pastes where you
clicked. **Ctrl+D** duplicates the selection, a little offset. **Delete** removes it.

**Copy Style** (Ctrl+Alt+C) and **Paste Style** (Ctrl+Alt+V) copy the look of one control — its
background, border, text styling, icon and effects — onto others, without changing what they do.

### Containers and grouping

A **container** holds other controls, so that they move together. **Ctrl+G** (Edit → Group into
Container) puts the selected controls into a new container; **Ctrl+Shift+G** takes them out again.
Dragging a control onto a container puts it inside; dragging it out takes it out. Hold **Space** while
dragging to stop that happening.

**Double-click** a container to reach the control inside it that you clicked on; **Esc** goes back up to
the container. **Alt+click** reaches the innermost control at once.

There are four kinds of container: **Container** (invisible), **Group / Frame** (with a frame and a
title), **Tabbed Container** (pages with tabs; set them up on its **Pages** tab — a control belongs to
the page that was showing when you put it in) and **Scroll Area** (contents larger than the box,
scrolled into view).

### Arranging

The dock's **Align** tool lines up the selected controls by their edges or centres, spaces them out
evenly, makes them the same size, arranges them in a grid or a circle, and flips their positions.
**Align To** decides what they line up with: each other (**Selection**), the **Key Object**, a point
(**Region**) or the **Guides**.

When controls overlap, their order decides which is on top. **Bring to Front** (Ctrl+Shift+]), **Bring Forward**
(Ctrl+]), **Send Backward** (Ctrl+[) and **Send to Back** (Ctrl+Shift+[) change that.

**Ctrl+L** locks the selected controls so they cannot be moved or resized by accident; the padlock in
the component tree does the same. The eye in the tree hides a control while you work.

### Layers

The dock's **Layers** tool divides the panel into layers, like sheets of glass on top of each other.
**Add layer** makes a new one. Each layer can be hidden (Alt+click the eye to show only that one),
locked, given a colour, renamed and moved forward or back. The dot at the left chooses the layer new
controls land on; with controls selected, click a layer's name to move them there.

### Undo and History

**Ctrl+Z** undoes and **Ctrl+Y** redoes; the Edit menu says what the step was ("Undo Move Cutoff").
**Edit → History...** lists the steps — click one to go straight back to it. CEditor keeps the last 50
steps of each document. Changing the panel's background image cannot be undone.

> **Not finished yet:** container controls show a **Grid** tab that is still empty.

## 4. Making it look right

### The properties panel

Every setting of the selected control is in the properties panel on the right. Its tabs run down its
left edge as icons — point at one to see its name. Which tabs a control has depends on what it is; the
common ones are **Core** (name, look, visible, enabled), **Transform** (position and size),
**Background**, **Border**, **Text**, **Effects**, **Icon**, **Behavior** (range and value), **States**
and **Device** (what it is bound to).

- Click a tab to show it. **Ctrl+click** a second tab to show several at once, stacked.
- The magnifier in the toolbar searches the settings by name. If a match is in the dock rather than
  here, it says so, with a button to open it.
- Point at any setting and the **Info** bar at the bottom explains it.
- With several controls selected, changes on the Core, Transform, Background, Border, Text, Effects,
  Icon, Behavior and Content Layout tabs apply to all of them.
- In number fields you can type a value and press Enter, use the arrow keys, turn the mouse wheel, or
  drag sideways on the label. Double-click the label to go back to the default.
- Many tabs have **Presets** at the bottom, to save a look and apply it again.

The **context bar** above the canvas holds the settings you change most often — text, fill, border,
size and position, effects and icon — so you can often work without the properties panel.

### Control sets

A **control set** is a complete visual style for the ready-made controls: the colours and, for many
sets, the shape of the knobs and the finish of the buttons and the panel. Every new panel starts with
**Graphite**. Choose another on the panel's **Background** tab under **Control set**; every control that
has not been given its own look follows the change. On a control's **Core** tab, **Control design**
pins that one control to a different design, form and size.

**Settings → Control Sets** lists the built-in sets and your own, and lets you choose the default for
new panels. **Browse 36 templates** shows a gallery of synthesizer designs to apply or start from. To
change a built-in set, **Duplicate** it first.

### Colours

Click any colour swatch — in the properties panel or the context bar — and the dock opens on **Colors**,
showing what you are editing. Choose a colour and press **Done**, or **Cancel** to go back. **Panel**
shows the colours this panel already uses and **Recent** the ones you used last. The swatch grid holds
your own palettes: click an empty square to store the current colour, click a filled one to use it,
right-click for more.

The **Gradient** tool edits gradient fills: linear, radial, conical and several multi-point kinds.
Click the bar to add a colour stop, drag a stop to move it, double-click it to change its colour and
right-click to remove it.

### Text

The dock's **Text** tool has every text setting of the selected control: font, size, weight, spacing,
alignment, how text wraps, its colour or fill, and effects. **Follow selection** switches to whichever
control you select; **Pinned** keeps it on one.

### Fonts and icons

CEditor has a set of fonts built in. You can add your own in **Settings → Fonts**, in two ways:

- **From Google Fonts.** Under **Add Google Font**, type the name of the font exactly as it appears
  on [fonts.google.com](https://fonts.google.com) — for example *JetBrains Mono* — and press **Add**
  (or Enter). CEditor checks the name with Google, downloads the regular, bold and italic styles and
  keeps them on your computer, so you need the internet only this once. If the name is not quite
  right, it says "Google could not find that family"; copy the name from the Google Fonts page.
- **From a file.** Press **Import Local Fonts**, which opens a file browser for .ttf, .otf, .woff and
  .woff2 files, or drop the files anywhere onto the page.

The **Library** below lists every font you added, marked **Google** or **Local**; you can switch one
off or remove it. Added fonts then appear in the font list wherever you choose a font.

Your fonts are kept on your computer, not in the panel file. When the panel leaves your computer —
with **File → Share Panel...**, or as an exported plugin — CEditor puts the fonts it uses inside, cut
down to the characters the panel shows, so the text looks the same everywhere. A plain `.cepanel`
file opened on another computer shows a stand-in font instead.

**Icons** for buttons and labels are added in **Settings → Icons**. Press **Import Icons**, or drop
files onto the page; SVG, PNG, JPG, GIF, BMP and WebP all work, and an icon you already have is
skipped. Then choose an icon on a control's **Icon** tab or in the **Icon** section of the context
bar. The **Library** on the same page lets you switch icons off or remove them.

CEditor cannot fetch icons from Google directly, the way it fetches fonts. To use Google's icons
(Material Symbols), download the ones you want from
[fonts.google.com/icons](https://fonts.google.com/icons) — choose **SVG**, which stays sharp at any
size — and import the downloaded files in **Settings → Icons**.

> **Not finished yet:** icons are kept in CEditor's settings on your computer, and a panel only refers
> to them, so they are not packed into a shared panel or an exported plugin the way fonts and images
> are.

### Effects

The dock's **Effects** tool adds effects to the selected control: shadows, glows, outlines, bevels,
blur and more for the control and its text, and backlight and dot-matrix effects for screens. Choose
what an effect applies to (**Apply to**) and in which state, and stack several; the list runs from
front to back.

### Images

To show a picture, insert an **Image**, or switch on the **Image** layer on any control's
**Background** tab, and choose the file with the **...** button. The panel's own background can have an
image too.

A saved panel remembers where each image is on your computer; it does not contain the image. On
another computer the image is missing — to take a panel elsewhere, use **File → Share Panel...**, which
puts the images inside.

The dock's **Assets** tool manages the images of custom components, including **filmstrips**: one
image holding every frame of a knob or switch, one after another.

### Shapes

A **Shape** draws a rectangle, ellipse, line, triangle, star, arrow and more; choose the **Kind** on its
**Shape** tab, and resize the control to resize the shape. Drawing your own shapes with the pen tool is
possible inside the Component Designer (see [chapter 10](#10-custom-components)).

### Displays

An **LCD Display** looks like the character display of a synth — or a segment display, or a graphic
one — and a **Pixel Display** is a dot-matrix screen. Edit them in the dock's **Screen** tool. A display
holds no values of its own: each line or element shows the value of another control, as text, a
number, a bar, a needle or a small graph.

### Importing artwork

If you design your panel in a drawing program, CEditor can build it from the drawing.

1. In the drawing, put a layer (or group) called **components**. In it, draw a rectangle, circle or
   ellipse wherever a control should go. Name each one after what it should become — knob, slider,
   button, toggle, led, label, display, meter or menu — or give it a colour that stands for one.
2. Everything else in the drawing becomes the panel's background picture.
3. Choose **File → New Panel from SVG Artwork...** (or **from Photoshop Artwork...**).

The Console lists what CEditor guessed and what it skipped. When the drawing changes, **Update Panel
from SVG Artwork...** moves the controls whose placeholders moved and adds new ones; it never removes
controls, and it shows you what will change first. Photoshop layer styles, masks and adjustment layers
are not drawn.

## 5. Connecting to your synth

### Devices and ports

CEditor talks to each synth through a **device**: a name, such as **mainSynth**, with a MIDI output
to send to, a MIDI input to listen to, and the device profile that describes the synth. Every binding
on the panel names the device it belongs to. A new panel uses **mainSynth**.

Set up the ports in either of two places:

- **Settings → MIDI** has a card for each device: **Send To** (the MIDI output), **Listen To** (the MIDI
  input) and **Device Profile**. **Test** asks the instrument to say who it is, and reports **Instrument
  answered**, **Wrong instrument** or **No answer**. **Add A Device** adds another one, for a panel that
  controls several synths. Ports are read when the page opens; if you plug something in later, press
  **Rescan**.
- The **MIDI out** item in the status bar opens the dock's **Ports** tool, which has the same choices
  for the device you pick.

**Preview Only** means the messages are prepared but not sent anywhere; **No MIDI Input** means nothing
is received. The port choices are saved with the panel and with CEditor's settings. MIDI only works in
the desktop app.

### Binding a control

A control does nothing to the synth until it is bound. Select it and open the **Device** tab of the
properties panel (the cable icon). There are four ways to make a binding:

- **From the Device tool.** Open the dock's **Device** tool and choose the synth's profile. Select the
  control on the canvas, then click the parameter in the list. The control takes on the parameter's
  range and settings.
- **With Bind….** For an unbound control, the **Device** zone of the context bar shows **Bind…**, which
  lists the parameters of the device to choose from.
- **By MIDI learn.** Open the dock's **MIDI** tool. Turn a knob on the synth: it appears at the top as a
  chip. Drag the chip onto the control on the canvas.
- **By hand.** Press **Add** on the **Device** tab. Choose **Kind**: **Device parameter** (and enter the
  parameter's ID), or **MIDI control** for a plain MIDI message — CC, NRPN, RPN, aftertouch, program
  change — with its number and **Channel**. (Channel 0 listens on every channel and sends on 1.) For an
  ordinary 7-bit CC, set the control's **Behavior** range to 0–127, as whole numbers.

**Dry Run** prepares the message but does not send it — useful to check what would be sent. Bindings
made with **Add** or from the Device tool start with Dry Run **on**; switch it off to send. Bindings
made with **Bind…** or MIDI learn start with it off.

**Binding status**, at the top of the Device tab, always says the next thing to do — "Dry Run is on",
"Output is Preview Only", "Edit mode. Turn on Preview…" — until it says **Ready to send**. **Last
received** shows the last message that came in from the synth.

### What happens when a control moves

In Preview, moving a bound control sends its message to the synth. When the synth sends a change back
— you turn its knob, or it sends a whole sound — the bound control moves to match, as long as the
binding's **Feedback** is on. Values that arrive
from the synth are not sent back to it.

When a panel opens and its device is connected, CEditor offers once to **Read the current patch** from
the synth, so the controls start at the synth's real settings. Reading changes nothing on the synth.

### Several synths in one panel

Each binding has a **Role** — the name of its device. Give the bindings for a second synth a different
role, say **drums**, add that device in **Settings → MIDI** and give it its own ports.

> **Not finished yet:** several tools work only with the device called **mainSynth**: the dock's
> Device tool, **Detect devices** and **Presets** in the Device Profile Designer. A panel made with
> **New Panel from Device Profile** uses a device called **primary**; give it ports in Settings → MIDI.
> Note buttons and Panic only send when the panel uses exactly one device.

### Linking controls to each other

The dock's **Routes** tool links one control to another: moving the source moves the target, by a
chosen amount and curve. A route that ends at a parameter of the synth does not send anything yet —
bind the target control instead.

## 6. Describing a synth: device profiles

A **device profile** is the description of one synth: its parameters, with their names, ranges and
choices; the MIDI message that changes each one (CC, NRPN or SysEx); how the synth sends and receives a
whole sound in one go (a **dump**); and its banks of presets. With a profile, you bind controls by
choosing a parameter by name, and CEditor builds the right message.

CEditor comes with a few profiles, among them a generic MIDI CC profile, the Roland GAIA SH-01 and
SH-201, and the Yamaha AN1x. All of them are marked experimental. **File → Import Device Profile...**
loads a profile from a file.

### The Device tool

The dock's **Device** tool shows the parameters of a profile. Choose the profile and the MIDI ports at
the top, search with **Search parameters**, and bind by selecting a control and clicking a parameter.
**Pull**, **Push** and **Live** set which way **Sync** copies values: from the synth to the panel, from
the panel to the synth, or both, all the time. **Scan presets** asks the synth for its preset names, and
**Designer** opens the profile beside the panel.

### The Device Profile Designer

Open it with **Designer** in the Device tool, **DPD** in the context bar's Device zone, or **File → Open
Device Profile**. Its screens are listed on the left:

- **Overview** — what the profile is based on, and how complete it is.
- **Parameters** — every parameter, its message and its range. **+ Add parameter** adds one; the lists
  of choices of a parameter can be edited in the drawer on the right.
- **Bulk dumps** — the dumps the synth sends, with a map of which byte holds which parameter.
- **Device structure** and **Message shapes** — how the synth's SysEx messages are built.
- **Advanced** — the whole profile as text, to edit anything the other screens cannot, with
  **Validate** and **Apply**.
- **Share & impact** — what a change would break in panels that already use the profile.
- **Presets** — the synth's banks and presets: how to recall them, their names, and your own preset
  library, which can be exported as JSON or a `.syx` file.
- **Detect devices** — finds synths that can describe themselves over MIDI 2.0 (MIDI-CI).

**Save to engine** saves your changes to the profile; **Export portable profile** saves a copy.

> **Not finished yet:** the Device Profile Designer can only show and edit the three profiles it was
> built with — Generic MIDI CC, Roland GAIA SH-01 and Yamaha AN1x — and profiles found over MIDI-CI. A
> new profile (**File → New Device Profile**) opens on **Detect devices** only, and saving a new profile
> does not work yet. Apart from lists of choices, a parameter can only be edited as text on the
> **Advanced** screen. The **Capture** screen, meant to learn a parameter by moving it on the synth,
> does not work yet. The preset library is kept on this computer only.

## 7. Testing your panel

### Preview

Press **Preview** at the bottom of the icon rail, or **F5**. Now the panel works as it will in the
plugin: knobs turn, buttons press, and bound controls send MIDI. Press **Stop** (or F5 again) to go back
to editing. Bindings only send in Preview.

Preview is a rehearsal: when you stop it, every value you changed is put back, so testing never changes
the panel you are building.

### Watching the MIDI

The dock's **MIDI** tool is a monitor of the last 500 messages: when, which way (→ sent, ← received),
which device, what kind, what it means, the bytes, and whether it got out. Filter it by direction,
device, type or text, and tick **Failures only** to see what went wrong. When nothing was sent, a banner
says why.

The dock's **Ports** tool shows the connection, who answered the last identity request, lets you send
raw bytes (for example `B0 4A 64`), and decodes a dump you paste or capture.

Seeing a message go out proves that CEditor sent it. If the synth does not react, check its MIDI
channel and what that controller number does on it.

### Panic

In Preview, **Esc** is the panic key: it silences every note on all 16 channels and resets the
controllers. Change the key on the panel's **Core** tab, under **Constraints → Panic key**. A **Panic**
button component does the same on a click.

### Snapshots

The dock's **Snapshots** tool saves the values of the whole panel under a name, and recalls them. With
two or more snapshots you can **Morph** smoothly from one to the other, **Compare** two, and **Roll** new
random values — gently (**Humanize**), completely (**Full**) or only for some controls. Snapshots are
saved in the panel file. Capture them in Preview.

### Trying one control on its own

The dock's **Preview** tool tests one selected control on its own — its look in every state and its
value — without sending MIDI.

## 8. States and animations

### States

A **state** is a situation a control can be in — hovered, pressed, switched on, disabled — together
with how it looks in that situation. Buttons, sliders, knobs and most other controls you can touch
have states. Edit them on the **States** tab of the properties panel (one control at a time):

1. The **States** row shows **Base** — the normal look — and a chip for each state. A dot on a chip
   means that state changes something.
2. Pick a state and press **Edit <state>**. Now every change you make on the visual tabs
   (Background, Text, Border…) applies to that state only. Press **Edit Base** to go back to
   changing the normal look.
3. **When** says when the state is active: seven switches — **Hover**, **Pressed**, **Focused**,
   **Dragging**, **Disabled**, **Checked**, **Mixed** — and an optional **Rule** for anything more
   specific.
4. **Overrides** lists what the state changes, with buttons to clear them.

Add your own state by typing a name in **New** and pressing **Add**. When several states are active
at once, the stronger one wins: pressed beats hover, and disabled beats everything.

### Animations

An animation makes a change happen smoothly instead of at once — a button that grows a little when
you hover over it, a light that pulses with the beat. Animations are edited in the dock's
**Animation** tool. Select a control and press **Edit the selected control's animations**; the tool
stays on that control until you choose another.

There are three kinds:

- **Transition** — eases from one state to another, for example from normal to hover. Choose
  **From** and **To**, the **Duration**, and under **What it eases** which property changes: scale,
  rotation, position, size, opacity, or a fill, text or border colour.
- **Keyframes** — a little loop of poses, played all the time, in a state, when the value changes,
  on the beat, or when a script asks for it.
- **Sequence** — a timeline of keyframes on several tracks, which you can scrub with a playhead.

Below the editor, **Easing** sets the feel of the movement (linear, smooth in and out, overshooting
"back" curves, a custom curve, or a spring), and **Presets** add ready-made animations: **Hover
lift**, **Press squish**, **Fade when disabled**, **Blink while on**, **Beat pulse** and **Value
glide**. Shift+click a preset to add it to every selected control at once.

The **Preview** side of the tool is a small stage where you can hover, press and drag the control
and watch the animation, with **0.25×** slow motion. Animations also play in Preview mode and in the
exported plugin. The tool warns when an animation changes something that is not there ("does
nothing"), or when two animations fight over the same property ("clashes").

A new transition changes nothing until you add something under **What it eases**.

## 9. Scripts

When the ordinary settings are not enough — one knob moving three others, a display showing the
name of the patch, a light blinking on a timer — you can attach a script. Scripts are written in the
**Behavior Designer**, which opens in a **Script Workspace** tab: press **Script Editor** in the
**Scripts** zone of the context bar, or choose **File → New Script Workspace**.

The [scripting manual](scripting-manual.md) explains scripting from the beginning; start with
[Scripting: getting started](scripting-getting-started.md).

Two things to know from the editor's side:

- **Scripts are paused until you approve them.** When a panel has scripts, a bar appears: "Scripts
  are paused in <panel>." Press **Enable scripts for this session** to run them. CEditor asks again
  after every change to the code, and never remembers the approval in the panel file. Scripts in
  Python, C++, C# or Java need an extra tick, because that code is not sandboxed.
- **Export needs the approval too.** A panel with scripts cannot be exported until its scripts are
  approved.

## 10. Custom components

When none of the ready-made components looks or behaves the way you want, design your own. A
custom component is built from parts — shapes, text, images, hit zones — and can have its own
inputs, outputs and settings, so that every copy on a panel can carry, say, its own label.

### Making one

The way that works today is:

1. Insert a **Custom Component** (Insert → Values & Sliders → Custom Component, or from the icon
   rail).
2. Select it and press **Component Designer** on the canvas (or **Open Component Designer** at the
   foot of the properties panel). The canvas turns into the designer for that component.
3. Draw the component with the tools on the left: **Select** (V), **Shape**, **Text** (T), **Hit Zone**
   (H) for the parts that react to the mouse, and **Interactive** (I) for ready-wired knobs, sliders
   and buttons. **Starters** gives you a beginning to work from. Press **?** for the designer's
   shortcuts.
4. On the properties panel's **Publish** tab, **Contract** sets what the component offers to the
   panel: its inputs, outputs and editable properties. **Variants** are named looks a copy can pick.
5. Still on **Publish**, open **Package & Library**, fill in **Name** and **Version**, and press **Save
   local package**. The component is now in your library.
6. Press **Back to Panel**.

You can also turn existing artwork into a component: select some backgrounds, images, shapes,
labels, knobs or sliders and choose **Edit → Create Component from Selection...**. CEditor saves
them as a component in your library and puts a linked copy in their place. Each label's text becomes
a setting, so every copy can have its own.

> **Not finished yet:** **File → New Custom Component** and **File → Open Saved Custom Component**
> open a component in a tab of its own, but from that tab there is currently no way to save it to
> the library. Use the route above.

### Using saved components

The dock's **Library** tool shows every saved component, drawn as it really looks. Double-click a
card, drag it onto the panel, or press **Place a copy**. The icon rail and the insert search list your
saved components too.

A placed copy stays linked to its package in the library. Its **Source** card offers **Update to
<version>** when a newer version exists, **Reset to library**, **Update N copies on panel**, and
**Detach** to cut the link.

The dock's **API** tool shows a placed component's inputs, outputs and properties as one table you
can edit.

### Sharing a component

Your library lives inside CEditor, not as files on disk. To give a component to someone else, use
**Package file** (one component) or **Library file** (all of them) under **Package & Library**; on the
other computer, paste or load that file in the **Import** box of the same section.

## 11. Saving and sharing

**File → Save** (Ctrl+S) saves the panel as a `.cepanel` file; **Save As...** (Ctrl+Shift+S) saves
it under a new name. A failed save is reported and the panel stays marked as unsaved.

A `.cepanel` file refers to its images and fonts where they are on your computer. On another
computer they are missing. To give a panel to someone else, use **File → Share Panel...**: it writes
one `.cepanelpkg` file with the images and fonts inside, and without your file paths and MIDI port
settings. If some files could not be found, it says how many and lists them in the Console. Open a
shared panel with **File → Open Shared Panel...**, then use **Save** to keep your own editable copy.
Files that scripts read for themselves are not included.

**Open Recent** in the File menu lists your recent panels, components, device profiles and script
workspaces.

### Autosave and recovery

CEditor's autosave does **not** save your file. It keeps a recovery copy of panels with unsaved
changes, every 20 seconds by default, so that after a crash CEditor can offer to restore your work.
Save to a file when you want your work kept. The options are in **Settings → General**: **Enable
Autosave**, **Autosave Delay**, **Restore Unsaved Work** and **Reopen Last Session**.

> **Not finished yet:** closing a single tab asks about unsaved changes, but **File → Close Program**
> (Alt+F4) quits without asking. Only the recovery copy is kept. Device profile tabs also close without
> asking.

## 12. Exporting a plugin

Choose **Build → Export Plugin**. CEditor deselects everything, opens the panel's **Export** tab in the
properties panel and starts building. The same **Export Plugin** button sits at the top of the Export
tab.

Before it builds, CEditor checks that the panel's scripts are approved, collects every image and font
the panel uses (if one cannot be read, the export stops and says which), and works out which settings
the DAW will be able to automate.

### The Export tab

- **Build** — the **Export Plugin** button, the build log, **Reveal in folder** when it is done, and a
  **History** of recent exports.
- **Plugin** — **Plugin Name** (also the file name; blank means the panel's name), **Version**,
  **Vendor** and **Mfr Code** (a four-letter maker code with at least one capital letter).
- **Identity** — the plugin's unique ID, which a DAW uses to find the plugin again when it reopens a
  project. **Regenerate** gives the plugin a new ID — and then old projects no longer find it. When you
  export a copy of a panel that has already been exported, CEditor asks whether you are making an
  **update** of that plugin or a **new plugin**.
- **Scripting Modules** — leave it on **Auto**; see the [scripting manual](scripting-manual.md).
- **Hardware Restore** — what the plugin does when a DAW project is reopened: **Ask**, **Always** send
  the saved sound to the synth, or **Never**.
- **Scripting Runtime** — **Python: Auto / On / Off**. Auto includes Python only when a script needs it.
- **Formats** — **VST3** is always built. Tick **CLAP** and **LV2** to build those too.
- **Programs** — for a panel that uses a device profile, a bank of presets can become the plugin's
  program list in the DAW.

### Where the plugin goes

The installed CEditor puts the result in `Documents\CEditor\Exports`:

- `<Name>.vst3` — copy it into your VST3 folder.
- `<Name>\<Name>.clap` — a folder; copy the whole folder into your CLAP folder.
- `<Name>.lv2` — a bundle; copy the whole bundle into your LV2 folder.

Exporting again replaces the previous export of the same name.

The installed CEditor exports panels whose scripts are written in Lua, JavaScript and TypeScript. A
panel with Python, C++, C# or Java scripts needs the developer version of the exporter (a source
checkout with a C++ build setup), and then only as VST3. There is no standalone app, AU, AAX or VST2
export.

> **Not finished yet:** some texts on the Export tab are out of date. The **Formats** note says CLAP
> and LV2 need a source checkout — the installed CEditor does build them. The **Build** note says the
> plugin goes into `export-out/` — it goes into `Documents\CEditor\Exports`. The **History** list labels
> every export "VST3". The **Export Defaults** in Settings → General are not used yet.

### The plugin in your DAW

Add the export folder to your DAW's plugin paths, rescan, and load the plugin. Its window opens at
800 × 480 and can be resized; the panel is scaled to fit. It looks and behaves like the panel in
Preview, without the editor around it.

- **MIDI.** The plugin has no MIDI port setting of its own. It uses the port saved in the DAW project,
  or else picks the first hardware MIDI output. MIDI from scripts also leaves through the plugin's MIDI
  output, for the DAW to route. MIDI the DAW sends into the plugin reaches the panel's main device.
- **Automation.** Every control that holds a value becomes a parameter the DAW can automate, named
  after the control. Use clear control names. Meters, displays, note pads and some others do not
  become parameters.
- **Projects.** The DAW project stores every value, the port, and the last sound received from the
  synth. When a project is reopened, **Hardware Restore** decides whether that sound is sent back to
  the synth.

On Windows, while the plugin window has keyboard focus, the DAW does not receive key presses — the
space bar will not start playback. Click outside the plugin first.

## 13. HoSTage, the instrument host

HoSTage is a plugin host for playing live, built into CEditor. You build a **rack** of parts, each
holding a VST3 instrument or an external hardware synth, give each part its own key range, MIDI
effects, insert effects and mixer channel, and play the whole rack from a keyboard. Around the rack
sit a sound library with instant auditioning, songs and setlists, and a large-type **Stage** screen
for playing a set. Open it with **File → Hostage...**; it opens in a tab of its own.

> **Not finished yet:** loading plugins into parts works on Windows only. HoSTage has no manual of
> its own yet; this chapter covers the essentials.

### Build and Stage

The header has a **Build** / **Stage** switch. **Build** is for setting things up. **Stage** shows the
stage screen and turns on **Stage Lock**, which stops accidental changes; to go back, **hold Build for
one second**. The header also has the transport (play, stop, tempo, tap tempo, time signature, and
**EXT** to follow an external MIDI clock) and a **Panic** button.

In Build mode, the workspaces are **Rack**, **Sounds**, **Performance**, **Mixer**, **Layers** and
**Controller**. The **Utilities** open in a drawer on the right: **Library**, **Audio & MIDI**,
**Project**, **Product**, **Health** and **Edition**.

### Plugins

HoSTage only knows about plugins it has scanned, and it never scans by itself. Open the **Library**
utility and press **Scan plug-ins**. On Windows it searches the standard VST3 folders plus any
**Extra scan folders** you add; elsewhere, only the folders you add. Only VST3 plugins are scanned.

Each plugin is examined by a separate helper program. If a plugin crashes or hangs during the scan,
only that plugin is set aside ("quarantined") and the scan carries on. **Health → What could not be
offered** lists the plugins that were set aside, with a **Retry** button.

### Building a rack

1. Press **+ Add part** in the Rack and click the part to select it.
2. Press **Plug-ins** in the rack's header to show the instrument list, and press **Load** next to an
   instrument. (Clicking a plugin's picture does not load it — it lets you choose a different picture.)
   Or pick a sound from **Sounds** and double-click it.
3. Use the tabs at the bottom: **Zone** (key and velocity range, channel, transpose), **MIDI** (MIDI
   effects such as arpeggiator, chords and echo), **Inserts** (audio effects), **Routing** (sends and
   outputs) and **Params** (the plugin's parameters).

Every plugin runs in a process of its own. If one crashes, only that plugin falls silent, and HoSTage
can restore it automatically (**Health → Live plug-in failover**). After a crash, **Safe startup** keeps
the plugin that was playing from loading again until you allow it.

For an external synth, choose **Use external hardware...** on an empty part, then its **MIDI output**,
**Channel** and **Audio return**. **Capture patch...** records a patch dump from the synth so HoSTage
can send the sound back later.

There is no Save command for the rack: HoSTage saves it by itself after every change. **Save rack**
puts a copy in the library.

### Sounds

The **Sounds** tab (or the Sounds workspace, for the whole screen) is a library of every preset,
chain and rack, with search, favourites, ratings, tags and collections. Selecting a sound does not
load it: double-click it, or press **Enter**, to load it into the selected part. The **audition bar**
plays the selected sound — at once, if a preview has been recorded — with a note, chord, scale, riff
or what you last played.

### Songs, setlists and the stage

**Performance → Songs** holds the set: the list of songs, and for each song its tempo, length,
sections, notes for the stage and the rack it uses. **Before the show** checks the setlist without
loading anything, and **Preload** gets the next song ready.

The **Stage** screen shows the clock, the set and song timers, the current and next song, notes in
large type, and the controls. Keys: **→** or **Page Down** next song, **←** or **Page Up** previous,
**1–9** pick a song, **Space** play or stop, **hold P** for half a second to panic, **Esc** to cancel.

### Editions

Without a licence, HoSTage runs as the **Free** edition: one plugin at a time, and no patterns or
clips, scenes, songs and setlists, return buses or extra outputs. The **Edition** utility shows what
each edition includes and lets you install a licence.

### Where HoSTage keeps its data

In `%APPDATA%\CEditor\instrument-host\` on Windows (`~/.config/CEditor/instrument-host/` on Linux):
the rack, the plugin catalogue, the scan folders, the sound library and previews, and the logs.

## 14. Settings

Open **File → Settings...** (Ctrl+,). Changes apply straight away. There are six pages:

- **General** — what happens at start-up (**Reopen Last Session**, **Restore Unsaved Work**, **Check for
  Updates on Startup**, off by default), autosave, the grid for new panels, what the canvas shows
  (rulers, guides, distances), and editing distances: how far a pasted or duplicated control is
  offset, and how far the arrow keys move a control (1 pixel, or 10 with Shift).
- **Control Sets** — the ready-made looks for controls: the default for new panels, the built-in sets,
  and your own. Built-in sets must be duplicated before you can change them.
- **Fonts** — add a font from Google Fonts by typing its name (this needs the internet once; the font
  is then kept on your computer), or import font files (.ttf, .otf, .woff, .woff2). See
  [Fonts and icons](#fonts-and-icons).
- **Icons** — import icon images (SVG, PNG, JPG, GIF, BMP, WebP) for buttons and labels. Google's
  icons can be used by downloading them from Google as SVG files and importing those; there is no
  direct link to Google for icons.
- **MIDI** — the devices your panels talk to, and their MIDI ports (see
  [chapter 5](#5-connecting-to-your-synth)).
- **Scripting Toolchains** — Lua, JavaScript and TypeScript are built in; Python, C++, C# and Java
  need a one-time download, which you can start here.

**Help → Check for Updates** checks whether a newer CEditor exists and tells you; it never downloads or
installs anything. The automatic check at start-up is off by default, because it tells GitHub your
computer's address.

## 15. Known limits

CEditor is a beta. Things to know before you rely on it:

- **Windows first.** The release is built and tested for Windows. Loading plugins in HoSTage and the
  CTRL49 keyboard work only there.
- **Untested on real hardware.** The MIDI has been checked in software, not yet against real synths.
- **Unsigned.** There is no code-signing certificate yet, so Windows SmartScreen warns about the
  installer and about every plugin you export. Choose **More info → Run anyway**.
- **Licence.** CEditor is AGPL-3.0, and exported plugins include JUCE, so they carry the AGPL too: if
  you give an exported plugin to others, you must offer its source. Your `.cepanel` designs are your
  own.
- **Quitting does not ask.** **Close Program** (Alt+F4) does not ask about unsaved work. Save first.
- **The Device Profile Designer is partly built.** It edits only the profiles it was built with, new
  profiles cannot be saved yet, and Capture does not work. See [chapter 6](#6-describing-a-synth-device-profiles).
- **One device for some tools.** The Device tool, Detect devices and Presets work only with the device
  called **mainSynth**.
- **Some tools are partly built.** The dock's **Designer** draws the contents of the Step Sequencer,
  the Envelope and the Turing Modulator only. A **Screen** (CTRL49) tab cannot be closed with its **×**;
  use **Ctrl+W**. The CTRL49 screen builder can only be opened from the start screen, with no documents
  open.
- **The DAW and the keyboard.** On Windows, the DAW gets no key presses while the plugin window has
  focus.

[Known issues](known-issues.md) lists the open problems in detail, and the
[release notes](../RELEASE-NOTES.md) say what this version is.

---

# Part 2: Reference

## Menus

### File

| Item | Shortcut | What it does |
|---|---|---|
| **New Panel** | Ctrl+N | Opens the New Panel dialog: name, starting template and size. |
| **Open Panel** | Ctrl+O | Opens a `.cepanel` file. |
| **New Panel from Device Profile** | | Creates a panel with a control for each parameter of a loaded device profile. |
| **New Panel from SVG Artwork...** | | Builds a panel from an SVG drawing; see [Importing artwork](#importing-artwork). |
| **Update Panel from SVG Artwork...** | | Applies a revised SVG to the open panel, after showing what will change. |
| **New Panel from Photoshop Artwork...** | | The same from a Photoshop file. |
| **Update Panel from Photoshop Artwork...** | | The same update from a Photoshop file. |
| **Open Recent** | | Recently used panels, components, device profiles and script workspaces. |
| **New Custom Component** | | Opens an empty custom component in its own tab. |
| **Open Saved Custom Component** | | Opens a component from your library in its own tab. |
| **New Device Profile** | | Starts a new device profile in the Device Profile Designer. |
| **Open Device Profile** | | Opens a loaded device profile in the designer. |
| **Import Device Profile...** | | Loads a device profile from a file. |
| **Discover Device (MIDI-CI)...** | | Starts a new profile by asking a connected MIDI 2.0 device to describe itself. |
| **New Script Workspace** | | Opens the scripts of the active panel in the Behavior Designer. |
| **Open Script Workspace** | | Opens a saved script workspace file. |
| **Save** | Ctrl+S | Saves the panel (or the script workspace in front). |
| **Save As...** | Ctrl+Shift+S | Saves under a new name. |
| **Share Panel...** | | Saves a `.cepanelpkg` with images and fonts inside, for another computer. |
| **Open Shared Panel...** | | Opens a `.cepanelpkg`. |
| **Close Tab** | Ctrl+W | Closes the tab in front, asking first if it has unsaved changes. |
| **Hostage...** | | Opens HoSTage, the instrument host. |
| **Settings...** | Ctrl+, | Opens the Settings page. |
| **Close Program** | Alt+F4 | Quits CEditor — without asking about unsaved work. |

### Edit

| Item | Shortcut | What it does |
|---|---|---|
| **Undo** / **Redo** | Ctrl+Z / Ctrl+Y | Undoes or redoes the last change; the menu names it. |
| **History...** | | Shows every undo step of the document; click one to go back to it. |
| **Cut**, **Copy**, **Paste** | Ctrl+X, Ctrl+C, Ctrl+V | The usual. **Ctrl+Shift+V** pastes in the same place. |
| **Duplicate** | Ctrl+D | Copies the selection beside itself. |
| **Delete** | Del | Removes the selection. |
| **Group into Container** | Ctrl+G | Puts the selected controls in a new container. |
| **Create Component from Selection...** | | Turns the selection into a custom component. |
| **Ungroup** | Ctrl+Shift+G | Takes the controls out of a container. |
| **Bring to Front**, **Bring Forward** | Ctrl+Shift+], Ctrl+] | Moves the selection on top of other controls. |
| **Send Backward**, **Send to Back** | Ctrl+[, Ctrl+Shift+[ | Moves the selection underneath. |
| **Tidy Grid**, **Arrange in Circle** | | Arranges several selected controls in a grid or a circle. |
| **Select All** | Ctrl+A | Selects every control. |
| **Copy Style** / **Paste Style** | Ctrl+Alt+C / Ctrl+Alt+V | Copies the look of one control onto others. |

### View

| Item | Shortcut | What it does |
|---|---|---|
| **Zoom In** / **Zoom Out** | Ctrl++ / Ctrl+- | Zooms the canvas, from 10% to 400%. |
| **Reset Zoom** | | Back to 100%. |
| **Fit to Window** | Ctrl+0 | Shows the whole panel. |
| **Zoom to Selection** | Ctrl+Shift+P | Zooms to the selected controls. |
| **Grid** | | Shows or hides the grid. |
| **Snap to Grid** | | Makes moved and resized controls line up with the grid. |

### Insert

Every component, in five groups. [Components](#components) below says what each one is for. Without
an open panel the items are greyed out.

### Build

| Item | What it does |
|---|---|
| **Export Plugin** | Builds the plugin; see [chapter 12](#12-exporting-a-plugin). |

### Window

| Item | Shortcut | What it does |
|---|---|---|
| **Component Tree** | Ctrl+Shift+E | Shows or hides the component tree. |
| **Properties Panel** | Ctrl+Shift+D | Shows or hides the properties panel. |
| **Display Panel** | Ctrl+J | Shows or hides the dock. |
| **Close Tab** | Ctrl+W | Closes the tab in front. |

### Help

| Item | Shortcut | What it does |
|---|---|---|
| **Documentation** | | Opens the manuals, with search. |
| **Keyboard Shortcuts** | F1 | Lists every shortcut. |
| **Check for Updates** | | Checks for a newer version and shows the result in About. |
| **About CEditor** | | The version, the licence notices and the last update check. |

## The dock tools

| Tool | What it is for |
|---|---|
| **Colors** | The colour picker. When you clicked a colour swatch elsewhere, it shows what you are editing, with **Cancel** and **Done**. |
| **Gradient** | Edits a gradient fill. |
| **Effects** | The selected control's effects: shadows, glows, blur and more, and saved looks. |
| **Text** | Every text setting of the selected control: font, size, spacing, alignment and more. |
| **Assets** | A control's images, including filmstrips (one image holding every frame of a knob). |
| **Screen** | Editors for LCD and pixel display controls. |
| **API** | A placed custom component's inputs, outputs and properties. |
| **Library** | Your saved custom components, ready to place. |
| **Animation** | A control's animations; see [chapter 8](#8-states-and-animations). |
| **Designer** | Draws the contents of a Step Sequencer, Envelope or Turing Modulator. |
| **Notepad** | Notes kept with the panel. |
| **Viewer** | Reference pictures for the panel, with an eyedropper that saves colours to your swatches. |
| **Layers** | The panel's layers: add, rename, reorder, hide, lock and choose where new controls go. |
| **Align** | Aligns, spaces out, matches sizes, arranges and flips the selected controls. |
| **Device** | The parameters of a device profile, ready to drag onto controls. |
| **MIDI** | The MIDI monitor: the last 500 messages in and out, with their meaning. |
| **Ports** | MIDI connections and diagnostics: which ports, which instrument answered, send raw bytes. |
| **Routes** | Links between controls, as a list or as patch cords. |
| **Snapshots** | Saves the values of the whole panel, and recalls, compares, blends and randomises them. |
| **Preview** | Tries out one selected control on its own. |
| **Console** | Messages from the program: build output, update checks, MIDI errors. |

## Components

These are the components you can insert, in the groups the icon rail and the Insert menu use.

{{COMPONENT_CATALOGUE}}

## Keyboard shortcuts and mouse

The same list as **Help → Keyboard Shortcuts** (F1). Undo, redo and the panel toggles do nothing
while you are typing in a text field; the File and tab shortcuts, F1 and F5 work everywhere.

{{SHORTCUTS}}

---

*This manual is generated: the prose comes from `CE/web/scripts/editor-manual.template.md`, and the
component and shortcut tables from the program itself. To change it, edit the template and run
`npm run docs:editor` in `CE/web`.*
