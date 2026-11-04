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

- **The menu bar** along the top: File, Edit, View, Insert, Build, Window and Help, then the tabs
  (below). The [Menus](#menus) reference lists every item.
- **The icon rail** down the left edge. Its buttons insert new controls, switch **Preview** on and
  off (F5), and show or hide the dock, the component tree and the properties panel.
- **The context bar** across the top of the canvas. It shows the name and type of the selected
  control, quick settings for it (text, fill, border, position and size, effects, icon), the state
  your changes go to (**State**), and two buttons: **Device**, what the control is bound to, and
  **Scripts**, how many scripts it has. It is one row; on a narrow window it wraps onto a second or
  third, and only the open section keeps its name — the others show their icon, and their name when
  you point at them.
- **The tabs**, in the menu bar's row after **Help**. Every open document has a tab: panels,
  device profiles, custom components, script workspaces, the Settings page and the HoSTage host.
  **+ New** and **Open** at the right end of the row start or open documents.
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
them. CEditor remembers the sizes, and which parts were showing, for next time. The properties
panel opens 600 pixels wide and goes down to 420, which on a laptop screen gives the canvas about a
third more room; narrower than about 525, its tabs put two fields in a row instead of four, so
every value stays readable. **Ctrl+\\** (**Window → Canvas Only**) hides the tree, the properties
panel and the dock at once, and pressed again brings back the ones it hid. In a window narrower
than 920 pixels the tree, the dock and the properties panel are hidden to make room for the canvas.

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

**New Screen (CTRL49)** opens the Screen Builder, an early prototype for putting knob pages for a
hardware synth on the screen of an M-Audio CTRL49 keyboard. It cannot save, and it cannot send pages to
the keyboard itself. To put your own pages on a CTRL49, use the control pages in HoSTage
([chapter 13](#13-hostage-the-instrument-host)).

### The dock

The dock holds tools you use while you work: the colour picker, the text and effects editors,
layers, alignment, the device parameter browser, the MIDI monitor and more. Click a tab along its
top to switch tools. To use two at once — Text beside Effects, say — **Alt+click** or right-click a
second tab, or press the split button at the end of the tab strip. Colors, Gradient, Notepad,
Viewer and Preview can only be shown on their own.

The dock also opens by itself when it is needed: clicking a colour swatch anywhere opens it on
**Colors**, and clicking **MIDI out** in the status bar opens it on **Ports**.

### Help

**Help → Documentation** opens the manuals inside CEditor as a tab beside your panels, with a
search box (**Ctrl+F**). A link in a manual jumps to the section it names; **Back** (or
**Alt+Left**) returns to where you clicked it. **Own window** moves the manual into a window of its
own, which you can move, resize or put on a second screen; **Back to the editor** in that window
puts it in a tab again. CEditor remembers which of the two you used last. **F1** shows every
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

The arrow in front of a group opens or shuts it. To fold many at once, use the **Levels** buttons
at the top of the tree: **1** shows only the top rows, the last number opens everything, and the
ones between show that many levels with everything below them shut. **Alt+click** an arrow to open
or shut that group and every group inside it; **Expand All Inside** and **Collapse All Inside** on
the tree's right-click menu do the same for every selected group.

### Moving, resizing and turning

- **Drag** a control to move it. Hold **Shift** to keep to a straight line, **Alt** to leave a copy
  behind, and **Ctrl** to stop it snapping to things. **Esc** while dragging puts it back.
- The **arrow keys** move the selection by 1 pixel; **Shift+arrow** by 10 pixels (or by the grid size,
  if that is larger).
- Drag one of the eight **handles** to resize. **Shift** keeps the proportions; **Alt** resizes around the
  centre.
- To turn a control, drag just **outside a corner**. **Shift** turns it in steps of 15°.
- For exact numbers, use the **Box** section of the context bar (X, Y, W, H) or the **Transform** tab
  of the properties panel, which also has the rotation and the opacity.
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

The zoom keys zoom the canvas wherever you are, even while typing in a field, and the Component
Designer's surface while it is open. **Ctrl+scroll wheel** zooms only the canvas, the Viewer and the
Component Designer, whichever is under the pointer, also over a component in the designer's Preview,
where a plain scroll drives it; anywhere else it does nothing. The size of the whole window's contents, menus and panels included, is
**Settings → General → Interface Size**, and the canvas's zoom works on top of it.

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

A Tabbed Container's page can be bound like a value, on the **Device** tab with the port **Page**.
Bound to a synth's part or mode parameter, the pages follow it both ways: choosing a page sends its
number, and when the synth reports the parameter the page turns. Label the pages as the synth names
the choices (on the **Pages** tab: UPPER, LOWER) and a page is found by name; otherwise by its
number, which is the value a page sends. That is how a panel edits a
synth with several parts. Each part gets a page of its own controls, each control bound once, and
the strip is the part buttons.

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
left edge, each an icon with its name under it. Which tabs a control has depends on what it is; the
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

A knob, a button and a switch each have a tab for the parts they are drawn with: **Knob** (housing,
skirt, track and value arc, cap, insert, pointer), **Button** and, on a toggle, **Switch**. On the
Knob tab the **Housing**, **Skirt**, **Cap** and **Insert** are plates, one over the other: each has
an **Outline** (a circle, a polygon, a rounded square, a scallop, flutes, a **Gear**, the ribbed
grip of a synth knob, a **Chicken-head**, or a ring), a size, a fill and a border, a finish, and a
**Shadow** on the panel: its outline again, lower by **Shadow %** of its radius, its edge as soft as
**Softness %** (with no drop and a bright colour, a glow). **Height %** makes a plate an oval, a
round part seen at an angle, and **Offset Y %** moves it down or up: a side wall under a top, a cap
lifted off it. An oval that turns turns as a gimbal does. An insert with no fill and a border is a
ring engraved in the cap. A plate's **Look** is **Flat**, drawn from those fields, or **Rendered**:
drawn as a lit, three-dimensional object, lit from the set's **Lamp**. A rendered plate has its own
fields instead: **Size**, **Turns**, a **Profile** (smooth, knurled or fluted) with its **Ridges** and
their **Depth**, a **Taper**, a **Height**, a **Top** (flat, with an insert, or a dome), a
**Material** and a **Top Material** (spun or brushed metal, gloss or satin plastic, rubber), and a
**Body Colour** and **Top Colour**. Its ridges turn with the value while the light stays where the
lamp is. The images are made in the editor and stored in the plug-in when the panel is exported, so
the plug-in renders nothing itself; until an image is ready, or on a computer that cannot render it,
the plate shows its plain fill. The **Pointer** can be a **Bar**, a painted bar with square ends: **Taper
%** narrows its tip into a wedge (below 0 the tip is the wider end) and **Edge** draws a rim round
it, or two fine lines when the bar has no fill; a gradient on its fill makes it a brushed lever. Under
the ticks, **Scale Radius %** sets the scale on a radius of its own, outside a value arc that runs
close round the cap, and **Numbers** prints numbers round it, evenly **From** one value **To**
another: 6 from 0 to 10 is a synth panel's 0 2 4 6 8 10. The Button and Switch
tabs show one part at a time: pick **Housing**, **Guard**, **Actuator** (called **Key** on a button),
**Symbol**, **Indicator** or **Legend** in the row at the top (a green dot marks a part that is drawn),
then its **Shape** (outline, depth, corner, and a pattern that repeats it in lines or a grid),
**Position** (in % of the device, with its rotation and the pivot it turns about), **Appearance**
(fill, opacity, finish, border and shading, and a drop **Shadow** under it, with its **Softness** and
colour) and what it does **When On** or **When Pressed**: how far
it moves and swings, its opacity and colour then, and whether it follows the actuator, as the ball on
a lever does. The Legend part has its text as well. Choosing a form under **Core → Control design**
fills the parts in, to change from there. The Housing, Guard, Actuator and Indicator also have a
**Look** at the top of **Appearance**: **Rendered** draws the part as a lit object its box's size (a
turned body if it is a circle), with a **Top** (flat, with an insert, ridged, a dome or a dish), its
**Ridges**, **Depth**, **Height** and **Taper**, two materials and a **Body Colour** and **Top
Colour**, in place of the border, finish, shading and shadow; its corners are the Shape section's
**Corner**. A part that lights up when pressed or on is rendered in its lit colour then.

On a slider's tab, a fader cap of the bar, console, block, dot, lens or glass kind has a **Cap
Look** under **Cap** and **Cap Finish**: **Rendered** draws it as a lit block the cap's size (a turned
body for a round cap), with its own **Cap Top**, **Ridges** (across its travel), **Depth**,
**Height**, **Taper**, **Corner**, **Cap Material**, **Top Material** and **Top Colour**; the cap's
own colour is the Current Handle's fill under **Style**. The fields apply to all of a slider's
handles. Rendered caps and parts are made and exported as rendered plates are.

A meter's parts are on its **Meter** tab, below its value, **Colour Zones** and peak hold. Pick
**Housing**, **Face**, **Track**, **Scale**, **Indicator**, **Marker**, **Cover**, **Legend** or
**Clip Lamp**. **Reading** says how the part answers the meter's reading, or the peak it holds:
it **fills** from an edge (a bar, a glass column), **slides** (a ruler's cursor), **swings** from
its rest angle (a needle), **lights** its cells up to the reading from the left or the foot (a dot
array, an LED ladder), or, as a **Clip Lamp**, lights at its level and stays lit while the peak
holds. **Zone Colours** colours a part from the meter's colour zones: **By Position**, each part
of a bar, each lit cell and each tick in the zone it sits in, or **By Level**, all of it in the
reading's zone. The zones themselves are rows of a level in % and a colour, with **Steps** or
**Blend** between them. On the **Scale** part: marks **Along a Line** or **Round an Arc**, the
**Major Count** and **Minor / Gap**, each kind's length and width, the arc's sweep, a zone of
ticks in their own colour, and **Numerals** on the long ticks in the reading's units, dB or
percent. **Fill Type** makes any part a gradient, edited in the Gradient tab of the dock; a part can
cast a drop **Shadow**, as a button's can. A **Bow** is the curved line of a paper meter's scale.
The **Housing** and the **Clip Lamp** also have a **Look** at the top of **Appearance**, with the
same fields as a button's part: **Rendered** draws the housing as a low lit block (a bezel, the face
and scale drawn over it; its **Height** starts at 12) and a round lamp as a lit dome, in its **Body
Colour** when unlit and its **Lit Colour** (under **Reading**) when lit. A part coloured by **Zone
Colours** is drawn flat while they are on, since its colour changes with the reading; the tab says
so, and keeps its rendered fields for when they are off.
While
the parts draw the meter, the plain meter's own fill, arc and tick settings are hidden.

The **context bar** above the canvas holds the settings you change most often — text, fill, border,
size and position, effects and icon — so you can often work without the properties panel.

### Control sets

A **control set** is a complete visual style for the ready-made controls: the colours and, for many
sets, the shape of the knobs and the finish of the buttons and the panel. Every new panel starts with
**Graphite**. Choose another on the panel's **Background** tab under **Control set**; every control that
has not been given its own look follows the change. On a control's **Core** tab, **Control design**
pins that one control to a different design, form and size.

**Settings → Control Sets** has three columns. On the left, the **Library**: each set shown by one of its
controls, grouped (the panel's set, your own, the built-ins), searchable, with two rows of buttons above
it: which control the cards show (Knobs, Sliders, Buttons, Switches, Meters, Pads) and which style
(Modern, Metal, Vintage, Glow, Illustrated). In the middle, the chosen set itself: its colour roles in
groups (panel and borders, controls, buttons, fields and menus, text and accent, displays; the ten
worked out from those are shown and not edited), its **Lettering** (typeface, weight and letter
spacing for every family's text), its **Lamp** (where the light on finishes comes from), its surface
material and its control families. A swatch opens the **Colors** dock on that role. Each family takes
its design from one of the templates or is an **Own design**; **Reset** returns it to the set it was
copied from, and **Edit on Panel** places one of the family's controls on the open panel to style.
Built-in sets are read-only, and editing one creates a copy. On the right,
the live preview, **Apply to** the panel, the default for new panels, **Browse the 36 templates** and
**Import a set…**.

Two sets, **Iris** and **Satellite**, are **illustrated** and work differently from the others. Their
knobs, keys, switches and meters are drawn as whole illustrations: their colours, size and depth can be
changed in **Core → Control design**, but they cannot be edited part by part, the parts on the **Knob**,
**Button**, **Switch** and **Meter** tabs do not apply to them, and **Convert to Parts** is not
available. The value moves the mechanism (Iris's knob opens an aperture, Satellite's tilts a dish)
rather than a pointer over a scale. Their pads and Number steppers are ordinary parts. The Library
marks their cards **Illustration**, the set's page says what differs, and the set pickers and the
**Form** list name them "(illustrated)". To edit such a control part by part, choose one of the other
forms in **Core → Control design**.

Applying a set opens the **Apply Control Set** window: the background colour, the surface material,
each kind of control on the panel, or the selected controls only, and whether controls assigned to
another set are included. Items left unselected keep their current appearance. It is one undo step,
and the panel's own **Set** opens the same window.

A control **inherits** its appearance from its set. A property you change on the control is an
**override**: the properties panel marks it with a bar in the margin and a bold label, and **Revert**
beside it restores the set's value. A colour drawn from one of the set's colour roles shows the role's
name. **Core → Control design** shows the control's set and its number of overrides, with **Clear
Overrides**, which reverts them all, and **Detach from Set**, which stores the set's appearance on the
control so that set changes no longer affect it (with **Keep colour roles linked**, its colours still
follow the set). **Reattach to Set** makes it inherit again. All three apply to every selected control.

The card also lists the overrides, each with **Revert** and **Apply**. **Apply to Set…** works the other
way round: it writes the control's overrides into its set, so every control of its kind that follows the
set takes the look (as a prefab's overrides are applied in Unity, or a main component is updated in
Figma). The window lists the overrides, all ticked, and says how many other controls of the kind change
and how many keep a value of their own. A colour drawn from a role stays a role. A built-in set is never
changed: the window names a copy of it, the change goes into the copy, and the panel moves to the copy.
The control then inherits the applied values from the set again. It is one undo step.

**Edit on Panel**, in Settings → Control Sets, starts from the set instead: it places one of the family's
controls on the open panel, selected, with a banner above the status bar. Style it, then press **Apply
to Set** in the banner, or **Cancel** to take it away.

A family can also use a **library component** instead of a design. In Settings → Control Sets, the
family's design list has a **Library components** group with the components in your library that can
stand in for that kind of control: for knobs and sliders, one value that a drag moves, drawn from its
position rather than its number, so that each copy can keep its own range; for buttons, an on/off value
that a press holds; for switches, one that a click flips; for meters, one value and nothing that moves
it. When the set is applied, each control of the family becomes a linked copy of the component, in the
same place and at the same size, with the control's name, value, range, device bindings and plug-in
parameter. A script that sets `Cutoff.value` still reaches it, and the control's caption goes into the
component's caption text if it has one. Controls with a script of their own, with two handles or with
bindings that drive other controls stay as they are, and the Apply window names them. Each copy
remembers the control it replaced: applying a set that names no component (or another one) for the
family puts the controls back, and the Apply window lists these changes with a tick for each. The
set's live preview and its card in the Library show the component where applying the set would place
it. A copy keeps the component's proportions: it takes the largest box of the component's shape that
fits where the control was, centred there, and the control comes back at its own size. **Reset**
on the family's row removes the component from the set. The copies are ordinary library copies: their
**Component** tab offers newer versions, and an update keeps each copy's range. Exporting the set
includes the components it names, and importing it adds them to your library.

### Colours

Click any colour swatch — in the properties panel or the context bar — and the dock opens on **Colors**,
showing what you are editing. Choose a colour and press **Done**, or **Cancel** to go back. **Panel**
shows the colours this panel already uses and **Recent** the ones you used last.

For a colour of a control or of a component's layer, **Set colours** above them shows the colour roles
of the control set it is drawn with (the control's own set, or the panel's), in the groups Settings →
Control Sets uses. Click one to link the colour to that role: the bar above the picker shows the link
(🔗 Knob / fader cap), and the colour then follows the set, so a component placed on a panel with
another set takes that set's colours. A colour picked after that, or a Panel or Recent chip, unlinks it.
In the Component Designer the look bar marks a linked swatch and names its role. The swatch grid holds
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
down to the characters the panel shows, so the text looks the same everywhere. That includes a font
only a script applies, as long as the script names it in quotes, as in
`ce.text.style("Title", { family: "Inter" })`. Whoever opens the shared panel finds those fonts in
the font list as *"name (carried by the panel)"*, so they can use them on other controls of that
panel too. A plain `.cepanel` file opened on another computer shows a stand-in font instead.

**Icons** for buttons and labels are added in **Settings → Icons**, also in two ways:

- **From Google's icons.** **Add Google Icons** offers Google's free icon set, Material Symbols —
  more than 4,000 icons. Before you type, it shows a selection that suits a synth panel (play, stop,
  volume, piano, tune and so on); type in the search box to search them all, for example *volume* or
  *arrow*. Choose the look: **Outlined**, **Rounded** or **Sharp**, **Filled** or not, the **Weight**
  (thin 100 to bold 700) and the colour, **White** or **Black**. The previews show the result. Click
  the icons you want — they get a blue outline — and press **Add to library**. CEditor fetches them
  from Google and keeps them on your computer, so the internet is needed only now. To browse the
  whole set with pictures, visit [fonts.google.com/icons](https://fonts.google.com/icons) and type the
  name you find there; if the name is newer than CEditor's list, **Try "…" anyway** fetches it
  directly.
- **From a file.** Press **Import Icons**, or drop files onto the page; SVG, PNG, JPG, GIF, BMP and
  WebP all work, and an icon you already have is skipped.

Then choose an icon on a control's **Icon** tab or in the **Icon** section of the context bar. A
button or label starts out showing only its text; choosing an icon for it also changes its layout, so
the icon appears to the left of the text, or on its own if there is no text. To put it somewhere
else — above, below, to the right — change **Mode** on the control's **Content Layout** tab; a layout
you have chosen yourself is left alone when you change the icon. The **Library** on the Icons
page lists every icon, marked **Google** or **Local**, and lets you switch icons off or remove them.
Google's icons are stored white by default, because panels are usually dark; the **Tint** setting on
a control's Icon tab recolours any icon.

Icons travel the same way fonts do. Your icon library is kept on your computer, and a panel only
points at the icons in it — but when the panel leaves your computer, with **File → Share Panel...**
or as an exported plugin, CEditor packs in the icons the panel uses. Whoever opens the shared panel
sees them even though their own library does not have them; in the icon list they appear as
*"name (carried by the panel)"*, and stay with the panel when it is saved or shared again. An icon
that only a script switches to is packed too, as long as the script names it in quotes, as in
`ce.image.icon("Play", "pause")`. As with fonts, a plain `.cepanel` file copied to another computer
does not carry them.

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

### Importing a control you drew

A knob, a fader or a switch drawn in a drawing program can become a control of its own, with every
part of the drawing still a layer you can change.

1. Draw the control. Name the parts that move: **pointer** (or indicator, needle, rotor) turns with
   the value; **fader** (or thumb, handle) slides along the layer called **track**; **lamp** (or led,
   light, on) shows when the value is on, **off** when it is off, and **pressed** while it is held.
   A layer named **pivot** marks where a pointer turns; without one, it turns about the middle of
   the knob it sits on. A name counts inside a group's name too.
2. Choose **File → New Component from SVG Artwork...** or **New Component from Photoshop Artwork...**.

The control opens in the Component Designer, ready to use and to change:

- **From SVG** (Illustrator, Inkscape, Affinity Designer, Figma, Sketch), every shape is a vector
  layer, with its colours, gradient (on its fill and its outline), pattern, outline and opacity. Text
  stays text. A shape cut by a clip path is cut for good and stays a vector; a mask, or a clip on
  text, a picture or an outlined shape, becomes the layer's own mask. Pictures linked from the SVG
  are read from beside it.
- **From Photoshop** (and GIMP, Krita, Affinity Photo, Photopea, Procreate), every pixel layer is a
  picture layer with its opacity and blend mode, and every shape layer a vector layer, its paths,
  fill and stroke editable. Layer masks and vector masks stay masks, on or off as they were. Drop
  shadows and outer glows stay shadows you can change; a shape layer's other styles become its own
  fill, outline, inner shadows and bevel, and a picture's are drawn into it, close to Photoshop's.
  Adjustment layers are applied to the layers under them. Change a picture layer's colour with its
  tint. Text layers stay text where the file says their size and colour.

### Layer masks

A mask says how much of a layer shows: white shows it, black or clear hides it, grey shows it
partly. In the Component Designer's **Layers** list a masked layer shows its mask beside its own
thumbnail. Click the mask to edit it in the dock's **Mask** tab; Shift-click it to turn it off and
on (it is struck through while off). The link between the two says whether the mask moves with the
layer; click it to unlink, and the mask stays put while the layer moves under it, as a pointer
turning behind a fixed window does.

In the **Mask** tab:

- **Enabled** and **Invert** turn the mask off, or show the layer where the mask is clear instead.
- **Linked to Layer** is the same link. **X %**, **Y %**, **W %** and **H %** place the mask: in %
  of the layer while linked, in % of the component while not. **Fit to Layer** puts it back over
  the whole layer.
- **Add Mask** gives a layer a mask that shows all of it, to size from there. **Load Image...** uses
  a picture: its transparency, or for a picture without any, its brightness. **Mask With Layer**
  uses another layer's outline, as a clipping mask does; that layer stays as it is, so hide it when
  it should only mask. **Delete Mask** removes it.

What moves is wired: a dial, a fader, a switch or a button, with its value, the area that takes the
mouse, and the layers that follow the value. A drawing with nothing named to move comes in as
layers only. The Console says what each name made, and what was drawn close to rather than exactly:
Photoshop's Bevel, Satin and some adjustments.

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

Two kinds of output never leave CEditor, and they are listed after your computer's ports:

- **Simulated device** stands in for the synth when it is not connected. It answers from the device's
  profile: it keeps what your controls send, sends a patch back when the panel asks for one, and
  answers **Test**. It needs no input; its answers arrive on the device itself. It makes no sound,
  sends nothing unless asked, and knows only what the profile says. That makes it good for building
  and trying a panel, and no proof that the profile matches the real instrument. It does this for
  profiles that use Roland-style addresses, such as the GAIA SH-01 and SH-201. For other profiles it
  only answers **Test**, and only if the profile describes the synth's identity.
- **Internal cable 1** to **4** connect devices inside CEditor. What one device sends to a cable arrives
  on every device whose **Listen To** is that cable. Other programs cannot see these cables. To
  connect CEditor to another program on Windows, use a virtual MIDI port program such as loopMIDI;
  its ports then appear in the lists like any other.

### Binding a control

A control does nothing to the synth until it is bound. Select it and open the **Device** tab of the
properties panel (the cable icon). There are four ways to make a binding:

- **From the Device tool.** Open the dock's **Device** tool and choose the synth's profile. Select the
  control on the canvas, then click the parameter in the list. The control takes on the parameter's
  range and settings.
- **From the context bar.** For an unbound control, the context bar's **Device** button reads
  **Unbound**. Click it for a list of the device's parameters to choose from.
- **By MIDI learn.** Open the dock's **MIDI** tool. Turn a knob on the synth: it appears at the top as a
  chip. Drag the chip onto the control on the canvas.
- **By hand.** Press **Add** on the **Device** tab. Choose **Kind**: **Device parameter** (and enter the
  parameter's ID), or **MIDI control** for a plain MIDI message — CC, NRPN, RPN, aftertouch, program
  change — with its number and **Channel**. (Channel 0 listens on every channel and sends on 1.) For an
  ordinary 7-bit CC, set the control's **Behavior** range to 0–127, as whole numbers.

**Dry Run** prepares the message but does not send it — useful to check what would be sent. Bindings
made with **Add** or from the Device tool start with Dry Run **on**; switch it off to send. Bindings
made from the context bar or by MIDI learn start with it off.

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

### A synth's arpeggio pattern

A custom component with an arpeggiator grid can edit a synth's own user arpeggio pattern. The GAIA
panel's grid does this: its READ PATTERN and SEND PATTERN zones bring the pattern from the synth and
write it back. Choose whose pattern on the grid's **Device** tab, under **Arpeggio Pattern**:
**Roland GAIA SH-01** or **Roland SH-201**. Then bind the grid's **Loop End Step** port to that
synth's End Step parameter. The pattern is read from and sent to that binding's device. The choice
belongs to this copy of the grid, not to its library component.

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

Open it with **Designer** in the Device tool, **DPD** under the context bar's **Device** button, or **File → Open
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
   specific. A rule can compare the control's value: `value > 64` is active above 64, and
   `valueNormalized >= 0.5` in the top half of the range, whatever the range is.
4. **Overrides** lists what the state changes, with buttons to clear them.

The **State** list in the context bar does what **Edit <state>** and **Edit Base** do: it shows which
state your changes go to, and switches it. A dot after a name means that state changes something.

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
**Behavior Designer**, which opens in a **Script Workspace** tab: press the **Scripts** button in the
context bar, or choose **File → New Script Workspace**.

The [scripting manual](scripting-manual.md) explains scripting from the beginning; start with
[Scripting: getting started](scripting-getting-started.md).

The dock on the right of the code has four tabs, and opens on the one you used last: **Insert**
(the commands and your controls, to insert), **Library** (scripts you saved to reuse), **History**
(earlier versions of the script) and **Values**. **Values** lists the values in the statement the
caret is in, with what each means and any problem with it, and the code shows which: a faint band
over the statement, a light box around the value under the pointer, an outlined box around the one
you are editing. A colour's swatch opens the display panel's **Colors** tab, which shows in the
script workspace for this (and from the **Dock** button on the left, which has a setting of its own
here: a dock left open in the panel editor stays there, and one the swatch opened closes again when
you finish); the colour is written into the code when you let go, as one step of the editor's undo,
and **Cancel** puts back exactly what was there before. A gradient opens the **Gradient** tab the
same way, with the angle and the stops alone, since a drawing's gradient is always linear. A list of
choices is a dropdown in the row, a font family's of the fonts the panel can use, an image's of
the library's and the panel's images, and a device parameter's (`ce.device.write("cutoff", …)`) of
the parameters of the synth's device profile, each with its name; a number with a unit is a field; a
curve written as four numbers has the **Animation** tab's curve editor under its row, written when
you let go of a handle; and the points of an envelope (`ce.anim.envelope`) have its shape under
their row, with each point to drag, a double-click to add one and **Remove** to take one out,
written when you let go. A row that names one of the panel's controls, by its name or in a path,
has **Select**: the control is selected on the panel when you go back to its tab, and the code is
left as it is. A stroke's dash is drawn in its row as the line it makes.
The lists are in the code as well: with the caret inside a
value that has one, such as a curve's name, **Ctrl+Space** shows its choices with the one written
selected, and the one you choose replaces the whole value. A property path is completed one part
at a time: inside `"Cutoff."` the list is what Cutoff has, its value and its sections, and the part
you choose replaces only the part the caret is in.

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

Import one or start one, change it, choose what a panel may change about it, and export it:

1. Start from one of these:
   - **File → New Custom Component** opens an empty component in a tab of its own.
   - **File → Import Component...** (or a component file dropped on the window) brings in a
     `.ceditor-component.json` file, puts it in your library and opens it.
   - **File → Open Component from Library...** opens one you saved before.
   - On a panel: insert a **Custom Component** (Insert → Values & Sliders → Custom Component, or
     from the icon rail), select it and press **Component Designer** on the canvas (or **Open
     Component Designer** at the foot of the properties panel).
2. Draw the component with the tools along the bottom of the canvas: **Select** (V), **Shape**,
   **Text** (T), **Hit Zone** (H) for the parts that react to the mouse, and **Interactive** (I) for
   ready-wired knobs, sliders and buttons. **Starters** gives you a beginning to work from. Press
   **?** for the designer's shortcuts. The properties panel works for the component as it does for
   a control on a panel, in its own tab too.
3. On the properties panel's **Settings** tab, choose what a panel can change on each copy (see
   below).
4. Press **Export...** in the designer's header (or Ctrl+S in a component's own tab). Give it a
   **Name** and a **Version** (it suggests the next one after what your library holds under that
   name) and, if you like, a line on **What changed**. Under **Save to**, tick **My component
   library**, **A file** (a `.ceditor-component.json` to keep or give to someone), or both, and
   press **Export**. **Details** opens the description, category, tags, author and licence the
   library shows and searches; they are filled in from the last version you exported.
5. On a panel, press **Back to Panel**. A component exported from a panel stays there as a linked
   copy of what you saved.

The Export window checks three things: that the component draws something, that something on it (a
hit zone) changes its value, and that every setting a panel may change points at something that
still exists. A warning never stops the export; a display, for one, rightly has no hit zone. A
setting that points at nothing has a **Remove** button beside it. These are the only checks: the
designer does not grade a component while you draw it.

The **Settings** tab has two lists:

- **Values.** Every value the component has (made on the Interact tab) is the panel's: a panel can
  bind it to a synth parameter on the Device tab, link it to other components, and the exported
  plug-in automates it. Nothing has to be published. Switch **Panel can use it** off for a value
  only the component itself uses.
- **Settings the panel can change.** What each copy on a panel can set for itself, such as a label's
  text or a colour. **+ Add a setting** lists the component's own layers under **Texts**,
  **Colours**, **Images** and **Show / hide**. A setting shows the component's own value, and
  changing it here changes the component, so a copy starts as the component looks. Click a
  colour's swatch to colour it in the dock's **Colors** tool with its layer selected, or type its
  code. Click a setting's name to rename it (the name is what the panel's author sees), and ✕ to
  remove it.

The **Shapes** palette down the left is for drawing. It opens folded, two narrow columns of its
tools, so the artboard has the room; point at a tool for its name and key. The first of the three
buttons at its foot unfolds it with the group names, and it stays the way you leave it.

A selected layer is styled in the bar along the top of the designer (**Fill**, **Gradient**,
**Stroke** with its width beside it, **Corners** for the corner radius, **Opacity**, and for text
its colour, size and words) and in the dock's **Colors** and **Gradient** tools. The bar shows only
what draws on the selected layer: an ellipse, a ring or a capsule is always round, so it has no
**Corners**, and nor has a polygon (both take a **Gradient** over their fill); a line has only
**Stroke**; and an arc takes its colour and thickness from its own settings on the
inspector's **Display** tab, so the bar shows only its **Opacity**. Beside them are
the layer's own buttons (duplicate, copy, paste, order, make interactive, lock, delete). On a
narrower window those are under one **Layer** button, and on a laptop-sized one the style controls
have a row of their own, so all of them stay in sight.

The strip under the canvas has **Snap**, **Grid** and **Smart** for snapping, **View** and **?** for
the shortcuts. **View** lists what the canvas shows (**Measure**, **Bounds**, **Generated names**
when the component has generated layers, **Hit zones** and which of them are drawn when it has hit
zones, **Rulers**) and the **Zoom step**, how far the status
bar's **−** and **+** zoom. On a narrow window the strip takes a second row rather than hide
anything. **Starters** replaces the component with a ready-made one, and its first entry, **Blank
canvas**, clears it. Both ask first when there is a layer to lose, and undo takes either back.

The inspector in the dock has four tabs. **Object** holds the selection's name, position, size and
rotation, and **Rotate around arc centre** when the component has an arc to turn around. **Display**
holds the settings of an arc and of a hit zone, and **Behavior** what a hit zone does and which value
it drives; for anything else the two are greyed out, and pointing at one says why. **Preview** holds
what the canvas shows while you work.

While the designer is open, the dock's **Colors** tool colours the fill of the layer selected on its
surface (several selected layers take the colour together; with none selected it changes nothing),
and the status bar's grid, snap and zoom are the designer's. **Preview** on the icon rail switches the
designer between **Preview** and **Edit**, as the buttons in its header do. Selecting layers and
switching between **Preview** and **Edit** are not edits: they do not mark the panel as changed or add
a step to undo. **Simple** and **Advanced**, at the foot of the properties panel, decide how much of
the component's workings the properties panel shows. In the **Layers** list, five or more layers named
the same but for a number (tick0 to tick10) fold into one row; click it to open it. It opens by
itself when you select one of them on the canvas.

A behaviour is what turns the mouse, the keys or the wheel into a value. Each has four switches,
the **Input** chips beside it on the Interact tab (and under **Interaction** in **Advanced**,
**Behaviors (flat list)**): **Pointer** (drag and click), **Keyboard** (arrow keys, Home and End),
**Wheel** and **Snap** (values land on the channel's steps). They apply on the panel, in the designer's Preview and in an exported
plug-in. A new slider or dial starts with Wheel on, a button, toggle or pad with it off; turn it
off on a control that should leave the wheel to scrolling the page.

A grab area's **momentaryValue** action holds its channel on while it is pressed, by the pointer or
by Space or Enter, and turns it off again when it is let go, as a momentary button does;
**toggleValue** flips it on each click.

A channel's **Curve**, under **Formatting & Mapping**, maps how far the control is turned to the value
it gives, as a small graph beside it shows. **Linear** follows the travel. **Exponential** and
**Logarithmic** bend it, through the **Centre value**, the value at half travel: half way round an
Exponential 20 Hz to 20 kHz knob is 632 Hz by default. **S-Curve** is slow at both ends. **Stepped**
clicks into **Steps** positions, and **Hysteresis** holds a step until the control is that share of a
step past its edge. **Bipolar** rests at its centre (a double-click returns there) and offers bindings
**-1 to 1**, so artwork can grow both ways from the centre. **Dead Zone** holds the centre value over a
band around the middle; Bipolar takes a dead zone too. The drag, the wheel and the keys move by travel,
and so does artwork bound to the channel's **0 to 1**. An exported plug-in gives the parameter the same
curve, so a DAW's automation lane drawn half way sits where the knob is at half travel.

You can also turn existing artwork into a component: select some backgrounds, images, shapes,
labels, knobs, sliders, buttons, switches or meters and choose **Edit → Create Component from
Selection...**. A window asks for the component's name and, for knobs, sliders, buttons, switches and
meters, how they come in. **As layers** makes each part a
layer you can select, move, restyle and recolour (housing, track, value arc, cap, pointer, ticks,
readout; a slider's track, fill and fader cap), wired to the value by bindings the **React** tab
shows, with their colours still linked to the set's colour roles. **As one exact part** keeps the
knob as it was, drawn by the panel's own knob code. Every set's controls come in as layers, Iris and
Satellite aside (they are drawn whole): a plate in perspective, a skirt, an insert, a drop shadow
(a layer of its own under its part), grooves, a bar pointer, a second scale and the scale's numbers;
every fader cap, its sheen, glow and finish; a key's shadow, a switch's lamp, a meter's counter and
a fill drawn in a pattern. A plate that turns with the value turns its outline while its light and
shadow stay put, as on the panel. What a layer does not draw yet (a control form that is not made
of parts, a rendered look) comes in as one exact part, and the window names it and why. A counter's
digits are written by a **Counter Figures** binding on the **React** tab: one figure of the reading
to each window, and each count of figures its own windows. A button comes in
as its plate and its text, or, drawn as a device, as its housing, key, symbol, indicator and legend
with its caption; a switch flips its value on a click, a button holds it on while pressed, and the
parts move and light up as they did. A meter comes in as its track and its zones' colours covered past
the reading, its segments each lighting as the reading reaches them, or, drawn as a device, as its
housing, face, scale, needle or bar and readout, moving with its value; it takes no input, and its
value arrives as a knob's does. Buttons and meters come in as layers only. CEditor saves
the result as a component in your library and puts a linked copy in their place. Each label's text
becomes a setting, so every copy can have its own.

> **Not finished yet:** **Variants**, named looks a copy could pick, are hidden while custom
> components are being made simpler. A component made with variants keeps the look it shows.

### Using saved components

The dock's **Library** tool shows every saved component, drawn as it really looks. Double-click a
card, drag it onto the panel, or press **Place a copy**. **Open in Designer** opens it in a tab of
its own to change and export again, and **Save as file...** writes it as a `.ceditor-component.json`.
The icon rail and the insert search list your saved components too.

An **image strip** is a component drawn from pictures, one per position: an imported strip, a KnobMan
or Blender render, a vendor pack. Its card says **Image strip**, and when the library holds one, a row
above the cards shows **All**, **Made of parts** or **Image strips**. A strip's shapes and colours
cannot be edited part by part; it can be resized, and tinted per layer in **Effects › Filters** (hue
and brightness).

Select a placed copy and the properties panel opens on its **Component** tab (moving on to another
copy keeps the tab you are on):

- Its name and version, and where it came from: your library, or "made on this panel", with
  **Export...** to put it in the library.
- When the library has a newer version, a notice says so and quotes what changed (the line typed at
  Export). **Update this copy** takes it, and **Update all N on this panel** updates every copy
  that has no changes of its own. A copy's value and settings stay as you set them.
- **Value**: where each value starts on this panel, and whether it is bound to a synth parameter
  (click that to go to the **Device** tab).
- **Settings**: what this copy can change, each with a reset arrow. A colour's swatch opens the
  dock's **Colors** tool on it; an image has **Choose image...**.
- **More**: the differences from the library, **Save to library as <version>...** for a copy changed
  in its own designer, **Reset to library**, **Reset settings** and **Detach** (it stays as it is,
  without library updates). Each of these asks first and says what it changes.

The dock's **API** tool shows a placed component's inputs, outputs and properties as one table you
can edit.

### Sharing a component

Your library lives inside CEditor, not as files on disk. To give a component to someone else, export
it with **A file** ticked. On the other computer, use **File → Import Component...** or drop the file
on the window. To give all of them at once, press **Export all...** in the dock's **Library** tool;
**Import...** beside it (or File → Import Component...) adds every component in that file to the
library.

## 11. Saving and sharing

**File → Save** (Ctrl+S) saves the panel as a `.cepanel` file; **Save As...** (Ctrl+Shift+S) saves
it under a new name. A failed save is reported and the panel stays marked as unsaved.

A `.cepanel` file refers to its images, fonts and icons where they are on your computer. On another
computer they are missing. To give a panel to someone else, use **File → Share Panel...**: it writes
one `.cepanelpkg` file with the images, fonts and icons inside, and without your file paths and MIDI
port settings. If some files could not be found, it says how many and lists them in the Console. Open
a shared panel with **File → Open Shared Panel...**, then use **Save** to keep your own editable copy;
the fonts and icons it brought stay in that copy, so it can be shared on again. Files that scripts
read for themselves are not included. See [Fonts and icons](#fonts-and-icons) for which fonts and
icons go along.

Custom components placed from your library go along with their library package, the version each
copy was placed from. Opening the shared panel adds the packages your library does not have and says
which, so the copies are linked there as they were on the author's computer: their Source card can
update them, and the Library dock can place more. A package your library already has under the same
name and version, but with a different design, is kept as it is, and you are told.

**Open Recent** in the File menu lists your recent panels, components, device profiles and script
workspaces.

### Reading and editing the file as text

The script editor can show the panel's file as text, one item at a time, and you can edit it there.
Open the **Script Editor**, then **Tools → Panel file**. On the left is an outline: **Panel settings**,
then every control, with a container's controls under it. **Find a control...** searches them by name,
type or id. The screen opens on the control that was selected when you opened the Script Editor.

Each item is written the way the file writes it: only what differs from a new control of that type,
or from a new panel. So a short text means a control close to its defaults, and **deleting a line
puts that property back to its default**. Tick **Every field** to see all of the control's
properties with their defaults, to look up a property's name; that view is for reading only.

Change the text and press **Apply** (or Ctrl+Enter). **Revert** throws your changes away. An edit you
have not applied stays when you look at another item; the outline marks it with a dot. Before
anything is applied, CEditor checks:

- **The text has to be valid JSON.** A mistake is shown with its line; click it to jump there.
- **A control's type and id stay as they are.** Turning a knob into a slider is not an edit. The id
  is what ties the control's scripts, layers and snapshots to it. The panel's `panelGuid` stays too:
  it is the panel's identity to every plug-in exported from it.
- **A name another control already has** is given `_2`, as a rename in the properties panel is.
- **A property that no control in the panel uses** is kept as you wrote it, with a warning to check
  the spelling, because it does nothing.

Some things are not in the text and cannot be changed there, so no edit can lose them: a
container's controls (they are items of their own), scripts (the script screens), the notes (the
notepad), the panel's name (it is the file's name), the host parameter list (made from the controls
on every save), and an embedded image, which shows as a short placeholder and is kept as it is.

An applied edit is one step in the panel's undo history, named after what you edited, such as
"Edit cutoff as text". Go back to the panel and press **Undo** to take it back. **Show on the
panel** goes there with the control selected.

**Values**, above the text, shows the script editor's dock with its **Values** tab alone: the colours,
gradients and choices in the object the caret is in, a `Fill` say, read the way the panel reads them.
A colour's swatch, or a gradient's strip, opens the display panel; what you choose there is written
into the text as typing it would be, so it is an edit like any other, applied with **Apply**. In
**Every field** and in the whole file the values are listed, to read, and nothing is edited.

**Whole file**, at the top of the outline, shows the whole file instead, as **Save** would write it
now, laid out to read. A large panel's file is long (the Roland GAIA's is about 71,000 lines), so the
outline becomes its table of contents: click a control, or **Host parameters**, **Scripts**,
**Shared drawings** or **Notes**, to go to its lines. As you scroll or click, the header says which
line you are at and what it belongs to, and the outline marks that row. **Ctrl+F** finds text
anywhere in the file, starting from where you are; **Enter** goes to the next match. You can select
and copy what is on screen.

The whole file is for reading. To change something, click in it and press **Edit this item** (or
**One item**): it opens as an item, to edit as above. **Whole file** from an item takes you back to its
lines. Embedded images are shortened to a placeholder here, and an edit you have not applied yet is
not in it.

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

Before it builds, CEditor checks that the panel's scripts are approved, collects every image, font and
icon the panel uses (if one cannot be read, the export stops and says which), and works out which
settings the DAW will be able to automate.

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

- **Keys.** Keys the panel does not use go to the DAW, so the space bar starts and stops playback and
  the DAW's shortcuts work while the plugin window has focus. The panel keeps what it uses: what you
  type into a text field or a field on its screen, Tab to move between controls, the arrow keys on a
  knob you clicked or in a list it has open, and its panic key (Escape unless the panel sets
  another). Space and Enter go to the DAW even after you click a control; they press a control only
  when you reached it with Tab. In a field you are editing on the panel's screen they type a space
  and finish the edit.
  This is on Windows, where the plugin's window would otherwise take every key.

## 13. HoSTage, the instrument host

HoSTage is a plugin host for playing live, built into CEditor. HoSTage has its own manual — the
[HoSTage manual](hostage-manual.md), also in **Help** — which explains all of it. In short:

- You build a **rack** of parts, each holding a VST3 instrument or an external hardware synth, with
  its own key range, MIDI effects, audio effects and mixer channel, and play the whole rack from a
  keyboard. Splits and layers are part of it.
- Around the rack sit a **sound library** with instant auditioning; **performance tools** — patterns,
  a clip launcher, a looper, a modulation matrix and microtuning; **songs and setlists**; and a
  large-type **Stage** screen with a lock against accidental changes.
- **Control pages** put the parameters you want on the knobs, faders and pads of any MIDI controller,
  eight to a page. On an **M-Audio CTRL49**, each control page is shown on the keyboard's colour
  screen, with the name and value of every knob — that is how you build screens for the CTRL49. See
  the HoSTage manual's chapters on controllers and on the CTRL49.

Open it with **File → Hostage...**; it opens in a tab of its own. It saves the rack by itself after
every change.

> **Not finished yet:** loading plugins into HoSTage and driving the CTRL49 work on Windows only.

## 14. Settings

Open **File → Settings...** (Ctrl+,). Changes apply straight away. There are six pages:

- **General** — what happens at start-up (**Reopen Last Session**, **Restore Unsaved Work**, **Check for
  Updates on Startup**, off by default), autosave, the **Interface Size** (80% to 200%; the size of
  everything in the window, canvas included), the grid for new panels, what the canvas shows
  (rulers, guides, distances), and editing distances: how far a pasted or duplicated control is
  offset, and how far the arrow keys move a control (1 pixel, or 10 with Shift).
- **Control Sets** — the ready-made looks for controls: the default for new panels, the built-in sets,
  and your own. Built-in sets must be duplicated before you can change them.
- **Fonts** — add a font from Google Fonts by typing its name (this needs the internet once; the font
  is then kept on your computer), or import font files (.ttf, .otf, .woff, .woff2). See
  [Fonts and icons](#fonts-and-icons).
- **Icons** — add icons from Google's free icon set (Material Symbols) by searching for them, or
  import icon images (SVG, PNG, JPG, GIF, BMP, WebP). See [Fonts and icons](#fonts-and-icons).
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
  the Envelope and the Turing Modulator only. The CTRL49 Screen Builder cannot save: closing its tab
  asks first, then its pages are gone. It can only be opened from the start screen, with no documents
  open.

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
| **Import Component...** | | Brings in a `.ceditor-component.json` (or library) file and opens a single component. Dropping the file on the window does the same. |
| **New Component from SVG Artwork...** | | Makes a control from an SVG drawing, every shape a layer; see [Importing a control you drew](#importing-a-control-you-drew). |
| **New Component from Photoshop Artwork...** | | The same from a Photoshop file, every layer a layer. |
| **Open Component from Library...** | | Opens a component from your library in its own tab. |
| **New Device Profile** | | Starts a new device profile in the Device Profile Designer. |
| **Open Device Profile** | | Opens a loaded device profile in the designer. |
| **Import Device Profile...** | | Loads a device profile from a file. |
| **Discover Device (MIDI-CI)...** | | Starts a new profile by asking a connected MIDI 2.0 device to describe itself. |
| **New Script Workspace** | | Opens the scripts of the active panel in the Behavior Designer. |
| **Open Script Workspace** | | Opens a saved script workspace file. |
| **Save** | Ctrl+S | Saves the panel (or the script workspace in front); with a component's own tab in front, opens **Export**. |
| **Save As...** | Ctrl+Shift+S | Saves under a new name. |
| **Share Panel...** | | Saves a `.cepanelpkg` with images, fonts, icons and library components inside, for another computer. |
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
| **Canvas Only** | Ctrl+\ | Hides the tree, the properties panel and the dock at once; again brings back the ones it hid. |
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
| **Mask** | In the Component Designer only: the selected layer's mask; see [Layer masks](#layer-masks). |
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
