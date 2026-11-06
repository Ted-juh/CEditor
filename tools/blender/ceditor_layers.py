# CEditor Layers — a Blender add-on that writes a knob, fader or switch as a layered Photoshop file
# for CEditor's File > New Component from Photoshop Artwork.
#
# Install once: Blender > Edit > Preferences > Add-ons > Install... > this file. Then File > Export >
# CEditor Layers (.psd), or the CEditor tab in the 3D Viewport's sidebar.
#
# What it writes. Each object is rendered by Cycles on its own, from straight above, and written as
# the layers its look adds up from, in CEditor's blend modes:
#
#   <name>             its own colour, unlit (normal)
#   <name> lighting    hidden: the light on it, without its colour, and
#   <name> gloss       hidden: its gloss, the light it reflects whatever its colour: both in linear
#                      light (see light_code), for CEditor to work its look out in another colour
#   <name> lighting from <part>, <name> gloss from <part>
#                      hidden: the light another part throws on it by way of its colour, and what
#                      that adds to its gloss (see colourless), for CEditor to change with that
#                      part's colour
#   <name> shading     what the lights and the room do to that colour (multiply)
#   <name> highlights  its reflections, and light brighter than its colour (linear dodge)
#   <name> lit         a lamp's own glow (linear dodge); shown when the lamp is on
#   shadow             the knob's shadow on the panel (black, its darkness as opacity)
#   bounce             light the parts throw on the panel, a metal cap's glare (colour dodge), and
#   bounce shine       the panel's shine reflecting it (linear dodge)
#   bounce from <part>, bounce shine from <part>, bounce base
#                      hidden: the share of the panel's light that comes off that part's colour, and
#                      what it adds to the shine (see bounce_code); the panel's look under them
#   <lamp> glow        a lamp's light on the panel (colour dodge), and "<lamp> glow shine" (linear
#                      dodge), shown when the lamp is on
#   <name> shadow      a moving part's shadow on the panel and on the parts under it
#   <name> reflection  a moving part's reflection in the shiny parts under it (linear dodge)
#   pivot              where turning parts turn about (a dot CEditor hides)
#   <name> shadow pivot  where a turning part's shadow turns about (a dot CEditor hides)
#
# A part that turns whole is written at each of several angles, "<name> at <angle>", "<name> shading
# at <angle>", "<name> shadow at <angle>", "<name> reflection at <angle>" and so on (see below).
#
# Stacked as listed, the layers give back Cycles' render to a level or two in 255, the edges where
# parts meet included, and each stays changeable in CEditor: a colour layer is retinted while its
# light stays as rendered. Where a part covers only some of a pixel, by itself (at its edge, and under
# another's), its look there is all in its colour layer, since a multiply or an add would reach what
# is beside it in the pixel too; the light layers come in over the next few pixels, and the layers
# under a part go on a little way under its edge, so that the layers still add up when CEditor draws
# them larger or smaller, or turned.
#
# The panel. CEditor lays a component's layers straight onto the panel it is on, so what depends on
# the panel is worked out for the panel, whatever its colour:
#   - The light on it brightens it in proportion, as light on a surface does: what its colour scatters
#     is written as colour dodge, a multiple of what is there (at full opacity: colour dodge reaches
#     white before its opacity mixes it, and fainter it would stop short on a light panel), and what
#     its shine reflects as light added, the same on any panel. Both are measured from the panel's
#     own passes, rendered with the parts there unseen and without them. Over nothing (Photoshop's
#     own view of the file, with no panel under it) the colour dodge shows as a dark patch.
#   - The outline. Where a part covers some of a pixel, Cycles mixes it with what is behind in linear
#     light, a browser in sRGB. CEditor mixes it for the panel under the control (its colour, or a
#     plate filled with a colour under it): the parts that stay put are written as they cover each
#     pixel, and named in the file's XMP for CEditor to mix.
#   - The colour. CEditor changes a part's colour by working its look out again: the light on it
#     and its gloss are written beside its colour layer, and with the new colour CEditor makes its
#     colour, shading and highlights layers as this file makes them, in linear light, so the part in
#     another colour is lit as Blender would light it (its edge, a metal's glint and all). The XMP
#     names each colour layer's shading and highlights (<ceditor:colourOf>, "cap highlights=cap"),
#     the parts that are metal (<ceditor:metal>, whose glint is light past white), and a turning
#     part's reflection that falls in a metal, which changes with the metal's colour.
#   - The light a part throws. A part's colour lights what is beside it (a red skirt casts red on the
#     panel by it, a brass cap a warm light on the skirt under its rim). Each part is rendered again
#     colourless, and the difference is written: on the other parts, the light and gloss off its
#     colour; on the panel, the share of the light there off it. CEditor scales each by the part's
#     change of colour, and works the parts and the panel it lights out again.
#   - A lit lamp's outermost pixels, which Cycles shows lit out to where the lamp covers a quarter of
#     a pixel while the panel still shows through, are lit as on the scene's panel ("For this panel",
#     on by default; off, or without a panel object, as on black).
#
# A turning part. The light stays put while the part turns, so what it does with the light changes:
# its own light (the side towards the sun lit, the sun's glint on it), its shadow, its reflection in
# a metal cap. It is rendered with the part turned every 27 degrees (a tenth of a dial's travel), and
# each is written turned back to rest, "... at <angle>"; CEditor's import makes each set one part of
# frames, whose frame follows the value, the two it falls between mixed. A finer step measured no
# nearer to Blender (13.5 and 9 degrees: the same to a tenth of a level, at twice and three times the
# export time): what is left is the picture turned twice, back to rest here and on again in the
# browser, so the turn back is through a Lanczos window rather than bilinear. Its shadow turns about
# a point of its own, half its reach from the axis towards where it falls (from the light that lights
# the part most, and the part's height), so it stays on the side away from the light.
#
# Needs numpy, which Blender's own builds carry.
#
# What moves is said by the names, with the words CEditor's import reads
# (CE/web/src/CE_Application/utils/artworkComponent.js):
#
#   turns    pointer, indicator, needle, rotor, marker, turns, rotate    turn with the value
#   moves    fader, thumb, handle, slide                                 slide along the track
#   on       lamp, led, light, lit, glow, on                             shown when on (switch, button)
#   off      off, unlit                                                  shown when off
#   pressed  pressed, down                                               shown while held
#   pivot    pivot, centre, center, axis                                 where turning parts turn about
#
# Model the pointer pointing straight up: that is the middle of the knob's travel. A part named
# "rotor" is round (a knurled or fluted cap): its colour turns while its light stays, as a round
# part's light does not change as it turns. Every other turning part turns whole. The panel the
# control sits on is an object named panel, ground, floor or backdrop, or one marked as a shadow
# catcher; without one, a plane is put under the control while it renders. The scene's camera is
# used when it is orthographic; otherwise one looks straight down at the control. The scene itself
# is left as it was: the renders run in a scene of their own.

bl_info = {
    "name": "CEditor Layers",
    "author": "CEditor",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "File > Export > CEditor Layers (.psd); 3D Viewport > Sidebar > CEditor",
    "description": "Write a control's objects as a layered PSD for CEditor's New Component from Photoshop Artwork",
    "category": "Import-Export",
}

import math
import os
import re
import struct
import tempfile
import textwrap
import zlib

import bpy
from bpy.props import BoolProperty, IntProperty, StringProperty
from bpy_extras.io_utils import ExportHelper

try:
    import numpy as np
except ImportError:  # Blender's own builds carry numpy; some Linux distributions' do not.
    np = None

# --------------------------------------------------------------------------------------------
# Roles, from the names, as CEditor reads them.

ROLE_WORDS = [
    ("pivot", ("pivot", "centre", "center", "axis")),
    ("pressed", ("pressed", "down")),
    ("off", ("off", "unlit")),
    ("on", ("lamp", "led", "light", "lit", "glow", "on")),
    ("moves", ("fader", "thumb", "handle", "slide")),
    ("turns", ("pointer", "indicator", "needle", "rotor", "marker", "turns", "rotate", "rotates")),
    ("track", ("track", "slot", "rail", "groove")),
]
ALL_ROLE_WORDS = {word for _, words in ROLE_WORDS for word in words}
PANEL_WORDS = {"panel", "ground", "floor", "backdrop"}
DRAWN_TYPES = {"MESH", "CURVE", "SURFACE", "META", "FONT"}


def name_words(name):
    """A name's words: split where a letter or digit stops, and where lower case meets upper."""
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(name or ""))
    return [w for w in re.split(r"[^a-z0-9]+", spaced.lower()) if w]


def role_of(name):
    words = set(name_words(name))
    for role, keywords in ROLE_WORDS:
        if words & set(keywords):
            return role
    return ""


def without_role_words(name, fallback):
    """The name with every role word taken out (a layer that must not move or light), or `fallback`."""
    kept = [w for w in name_words(name) if w not in ALL_ROLE_WORDS]
    return " ".join(kept) or fallback


def colourless(o):
    """Make `o`'s colour black for a render, its gloss kept (the Base Color of its Principled BSDFs,
    the Color of its Diffuse ones, links and all): what lights the rest by way of its colour is then
    gone, and the difference is that light. Returns a function that puts everything back."""
    saved = []
    for slot in o.material_slots:
        m = slot.material
        if m is None or not m.use_nodes:
            continue
        for node in m.node_tree.nodes:
            name = "Base Color" if node.type == "BSDF_PRINCIPLED" else "Color" if node.type == "BSDF_DIFFUSE" else None
            if name is None or name not in node.inputs:
                continue
            socket = node.inputs[name]
            links = [(link.from_socket, link.to_socket) for link in m.node_tree.links if link.to_socket == socket]
            saved.append((m, socket, tuple(socket.default_value), links))
            for link in [link for link in m.node_tree.links if link.to_socket == socket]:
                m.node_tree.links.remove(link)
            socket.default_value = (0.0, 0.0, 0.0, 1.0)

    def restore():
        for m, socket, value, links in saved:
            socket.default_value = value
            for from_socket, to_socket in links:
                m.node_tree.links.new(from_socket, to_socket)
    return restore


def is_rotor(name):
    return "rotor" in name_words(name)


def render_group(obj):
    """Which objects light each other: those that stay put together render together."""
    role = role_of(obj.name)
    if role in ("", "track", "on") or is_rotor(obj.name):
        return "still"
    return role


def is_panel(obj):
    return bool(set(name_words(obj.name)) & PANEL_WORDS) or bool(getattr(obj, "is_shadow_catcher", False))


def renders(obj):
    if obj.hide_render:
        return False
    return not any(c.hide_render for c in obj.users_collection)


def plan_scene(scene):
    """What the scene holds for the export: the parts, the panel, the pivot, the camera."""
    parts, panel, pivot, notes = [], None, None, []
    for obj in scene.objects:
        if not renders(obj):
            continue
        if obj.type in DRAWN_TYPES:
            if is_panel(obj):
                panel = panel or obj
            elif role_of(obj.name) == "pivot":
                pivot = pivot or obj
            else:
                parts.append(obj)
        elif obj.type == "EMPTY" and role_of(obj.name) == "pivot":
            pivot = pivot or obj
    cam = scene.camera if scene.camera and scene.camera.data.type == "ORTHO" else None
    if not parts:
        notes.append("No objects to write: every object that renders is the panel or the pivot.")
    if panel is None:
        notes.append("No panel: a plane is put under the control to catch its shadow.")
    if cam is None:
        notes.append("No orthographic camera: one looks straight down at the control.")
    if not any(o.type == "LIGHT" and renders(o) for o in scene.objects):
        notes.append("No lights: only the world lights the control.")
    turning = [o for o in parts if role_of(o.name) == "turns"]
    if turning and pivot is None:
        notes.append(f"Turning parts turn about {turning[0].name}'s origin (no object named pivot).")
    return {"parts": parts, "panel": panel, "pivot": pivot, "camera": cam, "notes": notes}


# --------------------------------------------------------------------------------------------
# Reading Cycles' passes: a multilayer EXR, uncompressed, read here so no compositor is needed.

def read_exr(path):
    """`{channel name: float32 array (height, width)}`, rows top to bottom."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"\x76\x2f\x31\x01":
        raise ValueError("not an OpenEXR file")
    pos = 8
    channels, window, compression = [], None, None
    while data[pos] != 0:
        end = data.index(b"\0", pos); name = data[pos:end].decode(); pos = end + 1
        end = data.index(b"\0", pos); kind = data[pos:end].decode(); pos = end + 1
        size = struct.unpack_from("<i", data, pos)[0]; pos += 4
        value = data[pos:pos + size]; pos += size
        if name == "channels":
            p = 0
            while value[p] != 0:
                e = value.index(b"\0", p); cname = value[p:e].decode(); p = e + 1
                ptype = struct.unpack_from("<i", value, p)[0]; p += 16
                channels.append((cname, ptype))
        elif name == "dataWindow":
            window = struct.unpack_from("<4i", value)
        elif name == "compression":
            compression = value[0]
    pos += 1
    if compression != 0:
        raise ValueError("the passes must be written uncompressed")
    x0, y0, x1, y1 = window
    width, height = x1 - x0 + 1, y1 - y0 + 1
    offsets = struct.unpack_from(f"<{height}Q", data, pos)
    channels.sort(key=lambda c: c[0])
    sizes = [2 if t == 1 else 4 for _, t in channels]
    out = {name: np.zeros((height, width), dtype=np.float32) for name, _ in channels}
    for offset in offsets:
        y = struct.unpack_from("<i", data, offset)[0] - y0
        p = offset + 8
        for (name, ptype), size in zip(channels, sizes):
            count = width
            if ptype == 1:
                row = np.frombuffer(data, dtype="<f2", count=count, offset=p).astype(np.float32)
            elif ptype == 2:
                row = np.frombuffer(data, dtype="<f4", count=count, offset=p)
            else:
                row = np.frombuffer(data, dtype="<u4", count=count, offset=p).astype(np.float32)
            out[name][y] = row
            p += size * count
    return out


def passes_of(channels, layer_name):
    """`{pass name: (h, w, n) array}` for the view layer `layer_name`."""
    grouped = {}
    for name, plane in channels.items():
        parts = name.split(".")
        if len(parts) < 3 or parts[0] != layer_name:
            continue
        grouped.setdefault(".".join(parts[1:-1]), {})[parts[-1]] = plane
    out = {}
    for pname, planes in grouped.items():
        order = [c for c in ("R", "G", "B", "A") if c in planes] or sorted(planes)
        out[pname] = np.stack([planes[c] for c in order], axis=-1)
    return out


# --------------------------------------------------------------------------------------------
# The layers' pixels.

def srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055)


def light_code(x):
    """Linear light as a layer's 8 bits, for CEditor (utils/pictureRecolour.js decodes it): 0 for none
    (under 1/256), else 1 to 255 over 1/256 to 256, a step a sixteenth of a doubling (4 %), which is
    under a level in 255 once shown; a glint many times white is held as well as a shadow."""
    x = np.asarray(x, dtype=np.float32)
    code = np.clip(np.round((np.log2(np.maximum(x, 2.0 ** -8)) + 8.0) * 255.0 / 16.0), 1.0, 255.0)
    return np.where(x >= 2.0 ** -8, code, 0.0) / 255.0


def bounce_code(x):
    """Light a part throws on another, as 8 bits: `light_code` sixteen times finer, 1/4096 to 16."""
    return light_code(np.asarray(x, dtype=np.float32) * 16.0)


def light_decode(code):
    """`light_code` read back, as CEditor reads it."""
    code = np.round(np.asarray(code, dtype=np.float32) * 255.0)
    return np.where(code > 0, np.power(2.0, code * 16.0 / 255.0 - 8.0), 0.0).astype(np.float32)


def srgb_beyond(x):
    """sRGB, its curve carried on past white: how far beyond white a light is, in its terms."""
    x = np.maximum(x, 0.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055)


def to8(x):
    return np.clip(np.round(x * 255.0), 0, 255).astype(np.uint8)


def rgba8(rgb, alpha):
    return np.concatenate([to8(rgb), to8(alpha)[..., None]], axis=-1)


def luma(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def part_look(p, lamp=False):
    """An object's coverage and look from its passes, straight (not premultiplied), in sRGB.

    `colour` is what the surface is: its diffuse colour, or where it is metal (its diffuse colour
    nothing and its gloss colour bright; a plastic's gloss colour is a few percent) its gloss colour,
    since a metal's colour is what it reflects. `shade` is what the light does to that colour, up to
    the colour itself; everything brighter, and a plastic's reflections, are its `highlights`. `glow`
    is its own light. `whole` is all of it as rendered; for a lamp (`lamp`), all of it but its glow,
    which only the lit lamp shows. `shown` is the pixel as shown on black, glow and all: brighter than
    white is white, so a bright lamp's edge is lit right out to where it covers a quarter of a pixel.
    """
    alpha = p["Combined"][..., 3]
    inv = np.where(alpha > 1e-4, 1.0 / np.maximum(alpha, 1e-4), 0.0)[..., None]
    rgb = lambda name: p[name][..., :3] if name in p else np.zeros_like(p["Combined"][..., :3])
    diff_colour = rgb("DiffCol") * inv
    gloss_colour = rgb("GlossCol") * inv
    metal = (luma(gloss_colour) > np.maximum(0.12, 3.0 * luma(diff_colour)))[..., None]
    colour = np.where(metal, gloss_colour, diff_colour)
    lit = np.where(metal, gloss_colour * ((rgb("GlossDir") + rgb("GlossInd")) * inv),
                   diff_colour * ((rgb("DiffDir") + rgb("DiffInd")) * inv))
    total = p["Combined"][..., :3] * inv
    without_glow = np.clip(total - rgb("Emit") * inv, 0.0, None)
    e_colour = srgb(colour)
    shade = np.where(e_colour > 1e-4, np.clip(srgb(lit) / np.maximum(e_colour, 1e-4), 0.0, 1.0), 1.0)
    # Where a metal's reflection is brighter than white (a glint), its highlights hold that light as it
    # is, up to a whole white, not only what fills the colour up to white: shown, the two add to white
    # all the same; recoloured (its highlights take its colour), a glint Blender shows white stays so.
    beyond = np.where(metal, srgb_beyond(without_glow), srgb(without_glow))
    highlights = np.clip(beyond - e_colour * shade, 0.0, 1.0)
    glow = np.clip(srgb(total) - srgb(without_glow), 0.0, 1.0)
    # The light on it without its colour (what its colour multiplies: the diffuse light, or a metal's
    # reflected light), and its gloss (what it reflects whatever its colour), in linear light: CEditor
    # works its look out from them in another colour.
    # Cycles' light passes are light per sample the surface covers, unlike its colour passes, which
    # are weighted by how much of the pixel it covers: not divided by the coverage again (at an edge
    # a sixtieth covered that made the light sixty times what it is).
    light_on = np.where(metal, rgb("GlossDir") + rgb("GlossInd"), rgb("DiffDir") + rgb("DiffInd"))
    gloss = np.clip(without_glow - colour * light_on, 0.0, None)
    return {"alpha": alpha, "colour": e_colour, "shade": shade, "highlights": highlights, "glow": glow,
            "whole": srgb(without_glow if lamp else total), "shown": srgb(p["Combined"][..., :3]),
            "lit": p["Combined"][..., :3], "metal": metal[..., 0].astype(np.float32),
            "light": light_on.astype(np.float32), "gloss": gloss.astype(np.float32),
            "bare": without_glow.astype(np.float32)}


def unover(coverages):
    """The opacities that stack `coverages` (bottom first, not overlapping: each rendered with the
    others held out) to their sum. Laid over each other as they are, two parts meeting along an edge
    each half-cover its pixels, and the pixels show through by a quarter: a seam. Each part's opacity
    is its coverage of what the parts above it leave, so a part under another's edge fills it.
    Returns the opacities, what the parts above each one leave of a pixel, and what all of them
    together leave."""
    left = np.ones_like(coverages[0]) if coverages else None
    out, above = [None] * len(coverages), [None] * len(coverages)
    for i in range(len(coverages) - 1, -1, -1):
        above[i] = left
        out[i] = np.where(left > 1e-4, np.clip(coverages[i] / np.maximum(left, 1e-4), 0.0, 1.0), 0.0)
        left = left * (1.0 - out[i])
    return out, above, left


NEIGHBOURS = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def carry_in(values, known, into, rings=2):
    """`values` (arrays, height by width first) carried from the pixels `known` into their neighbours
    in `into`, `rings` pixels deep: each new pixel the mean of the known ones beside it. Under a part
    that covers them whole, the pixels of a layer below do not show; scaled, though, a picture mixes
    each pixel with the next, and a layer that stopped dead under the part's edge would show there."""
    values = [np.array(v, dtype=np.float32) for v in values]
    known = known.copy()
    h, w = known.shape
    shifted = lambda a, dy, dx: np.pad(a, [(1, 1), (1, 1)] + [(0, 0)] * (a.ndim - 2))[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
    for _ in range(rings):
        weight = known.astype(np.float32)
        count = sum(shifted(weight, dy, dx) for dy, dx in NEIGHBOURS)
        new = ~known & into & (count > 0)
        if not new.any():
            break
        for v in values:
            wv = weight.reshape(weight.shape + (1,) * (v.ndim - 2))
            mean = sum(shifted(v * wv, dy, dx) for dy, dx in NEIGHBOURS) / np.maximum(count, 1).reshape(count.shape + (1,) * (v.ndim - 2))
            v[new] = mean[new]
        known = known | new
    return values


def light(added, strength):
    """Light to add (linear dodge) as a layer, over a part that covers the whole pixel: the light as
    its colour, `strength` (0 to 1, or where) its opacity where it adds any. Over an opaque pixel
    Photoshop's Linear Dodge and CSS's plus-lighter both add colour times opacity, short of white."""
    return added, np.where(added.max(-1) >= 0.5 / 255, np.asarray(strength, dtype=np.float32), 0.0)


def dodge(multiple):
    """Light on the panel as a layer that brightens what is under it in proportion (colour dodge),
    which is what light on a surface does: twice the light, twice as bright, whatever its colour.
    Photoshop's and CSS's colour dodge give B / (1 - s), short of white, before the layer's opacity
    mixes it with B; so only at full opacity, s = 1 - 1 / `multiple`, is it B times the multiple on
    any panel (laid fainter, its colour stronger, it reaches white on a light panel before it should).
    Written where it brightens anything by a level or more. Laid over nothing (Photoshop's own view of
    the file, without a panel under it) it shows as a dark patch."""
    k = np.maximum(multiple, 1.0)
    alpha = np.where((k - 1.0).max(-1) >= 1.0 / 255.0, 1.0, 0.0)
    return np.where(alpha[..., None] > 0, 1.0 - 1.0 / k, 0.0), alpha


def light_over_clear(added):
    """Light to add where what is under it is part clear: its colour the light at full strength and
    its opacity how strong, as CSS's plus-lighter adds both (Photoshop's Linear Dodge lays the colour
    over instead; nothing in between gives both)."""
    alpha = added.max(-1)
    return np.where(alpha[..., None] > 0, added / np.maximum(alpha[..., None], 1e-6), 0.0), alpha


# A turning part, rendered with it turned to angles a step apart (degrees clockwise from rest, over the
# -135 to 135 a CEditor dial turns).
TURN_STEP = 27


def turn_angles(step=TURN_STEP):
    """The angles a turning part is rendered at: from rest, a step at a time, out to the dial's ends."""
    count = int(math.floor(135 / step + 1e-9))
    return tuple(round(k * step, 6) for k in range(-count, count + 1))


TURN_ANGLES = turn_angles()


def angle_name(angle):
    return f"{angle:g}"


def turned(image, degrees, about, sharp=False):
    """`image` (height, width, 4: straight colour and opacity) turned `degrees` clockwise on screen
    about `about` (x, y in pixels), premultiplied: bilinear, as a browser turns a picture, or with
    `sharp` through a Lanczos window three pixels wide. A frame the add-on turns back to rest is turned
    again by the browser, and two bilinear turns blur a narrow part's highlight twice: on the test
    pointer, 8 pixels wide, its mean 6.5 levels off, 4.0 with the first turn sharp."""
    h, w = image.shape[:2]
    p = image.astype(np.float32).copy()
    p[..., :3] *= p[..., 3:4]
    t = math.radians(degrees)
    qy, qx = np.mgrid[0:h, 0:w] + 0.5
    sx = about[0] + (qx - about[0]) * math.cos(t) + (qy - about[1]) * math.sin(t) - 0.5
    sy = about[1] - (qx - about[0]) * math.sin(t) + (qy - about[1]) * math.cos(t) - 0.5
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]

    def at(y, x):
        inside = ((x >= 0) & (x < w) & (y >= 0) & (y < h))[..., None]
        return np.where(inside, p[np.clip(y, 0, h - 1), np.clip(x, 0, w - 1)], 0.0)

    if sharp:
        window = lambda d: np.where(np.abs(d) < 3, np.sinc(d) * np.sinc(d / 3), 0.0)
        q = np.zeros_like(p)
        total = np.zeros(p.shape[:2] + (1,), dtype=np.float32)
        for j in range(-2, 4):
            wy = window(fy - j)
            for i in range(-2, 4):
                weight = wy * window(fx - i)
                q += at(y0 + j, x0 + i) * weight
                total += weight
        q = q / np.maximum(total, 1e-6)
        # The window rings a little past a sharp edge: no light where nothing covers, none past opaque.
        q[..., 3:4] = np.clip(q[..., 3:4], 0.0, 1.0)
        q[..., :3] = np.clip(q[..., :3], 0.0, q[..., 3:4])
    else:
        q = (at(y0, x0) * (1 - fx) + at(y0, x0 + 1) * fx) * (1 - fy) + (at(y0 + 1, x0) * (1 - fx) + at(y0 + 1, x0 + 1) * fx) * fy
    a = q[..., 3:4]
    return np.concatenate([np.where(a > 0, q[..., :3] / np.maximum(a, 1e-6), 0.0), a], axis=-1)


def inward(full, width=3):
    """How far into the pixels a part covers whole (`full`) each one is, as a share of `width` pixels:
    0 where it covers part of a pixel, rising a step a pixel to 1 `width` pixels in."""
    depth = np.zeros(full.shape, dtype=np.float32)
    inside = full.copy()
    for _ in range(width):
        depth += inside
        padded = np.pad(inside, 1, mode="edge")
        h, w = inside.shape
        inside = np.logical_and.reduce([padded[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    return depth / width


def linear(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def edge_opacity(colour, opacity, under):
    """The opacity that gives an edge pixel as Cycles mixes it, in linear light, when it is laid over
    `under` (straight sRGB) as CEditor lays it, in sRGB: a pale part's edge over a dark one comes out
    too dark otherwise. Where the two are near alike the opacity stays."""
    target = srgb(opacity[..., None] * linear(colour) + (1.0 - opacity[..., None]) * linear(under))
    span = colour - under
    norm = (span * span).sum(-1)
    solved = np.clip(((target - under) * span).sum(-1) / np.maximum(norm, 1e-9), 0.0, 1.0)
    return np.where(norm > 3 * (2 / 255) ** 2, solved, opacity)


def edge_mix(colour, opacity, under):
    """The colour and opacity that give an edge pixel as Cycles mixes it, in linear light, when it is
    laid over `under` (straight sRGB) in sRGB, in each channel: the opacity the coverage, raised only
    as far as a channel needs to stay within 0 and 1, and the colour what then gives the mix. One
    opacity alone (edge_opacity) cannot do it for a saturated colour over a different one, red over
    grey pulling its red one way and its green and blue the other. CEditor mixes the outline of the
    parts that stay put so (utils/linearEdges.js linearEdgeMix)."""
    a = opacity[..., None]
    target = srgb(a * linear(colour) + (1.0 - a) * linear(under))
    need = np.where(target > under, (target - under) / np.maximum(1.0 - under, 1e-6),
                    np.where(target < under, (under - target) / np.maximum(under, 1e-6), 0.0))
    alpha = np.clip(np.maximum(opacity, need.max(-1)), 0.0, 1.0)
    rgb = np.where(alpha[..., None] > 0, np.clip(under + (target - under) / np.maximum(alpha[..., None], 1e-6), 0.0, 1.0), colour)
    return rgb, alpha


def blank(rgba):
    return int(rgba[..., 3].max()) == 0


def blend_over(dst, src, mode):
    """CSS/Photoshop compositing of a straight RGBA layer onto a premultiplied RGBA image (floats)."""
    sa = src[..., 3:4]
    sc = src[..., :3]
    da = dst[..., 3:4]
    dc = np.where(da > 0, dst[..., :3] / np.maximum(da, 1e-6), 0.0)
    if mode == "lddg":  # plus-lighter
        out = dst.copy()
        out[..., :3] = np.minimum(dst[..., :3] + sc * sa, 1.0)
        out[..., 3:4] = np.minimum(da + sa, 1.0)
        return out
    if mode == "mul ":
        mixed = sc * dc
    elif mode == "div ":  # colour dodge
        mixed = np.where(dc <= 0, 0.0, np.where(sc >= 1.0, 1.0, np.minimum(1.0, dc / np.maximum(1.0 - sc, 1e-6))))
    else:
        mixed = sc
    rgb = sa * (1 - da) * sc + sa * da * mixed + (1 - sa) * da * dc
    return np.concatenate([rgb, sa + da * (1 - sa)], axis=-1)


# --------------------------------------------------------------------------------------------
# The Photoshop file: 8-bit RGB, each layer's channels zipped, the picture of them all raw.

def _pascal(name):
    raw = name.encode("latin-1", "replace")[:255]
    data = bytes([len(raw)]) + raw
    return data + b"\0" * (-len(data) % 4)


def _unicode_name(name):
    text = name.encode("utf-16-be")
    body = struct.pack(">I", len(text) // 2) + text
    body += b"\0" * (-len(body) % 4)
    return b"8BIM" + b"luni" + struct.pack(">I", len(body)) + body


XMP_NAMESPACE = "https://github.com/Ted-juh/CEditor/ns/layers/1.0/"


def _xmp(linear_edges, colour_of=(), metal=()):
    """The file's XMP: the layers whose edge CEditor mixes for the panel under them; the light layers
    that go with a colour layer ("cap highlights=cap", its shading and highlights, and a turning
    part's reflection in a metal), which CEditor works out again in another colour; and the colour
    layers that are metal."""
    escape = lambda text: text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    items = "".join(f"<rdf:li>{escape(name)}</rdf:li>" for name in linear_edges)
    follows = "".join(f"<rdf:li>{escape(light)}={escape(colour)}</rdf:li>" for light, colour in colour_of)
    metals = "".join(f"<rdf:li>{escape(name)}</rdf:li>" for name in metal)
    return ('<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">'
            '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            f'<rdf:Description rdf:about="" xmlns:ceditor="{XMP_NAMESPACE}">'
            f'<ceditor:linearEdges><rdf:Bag>{items}</rdf:Bag></ceditor:linearEdges>'
            + (f'<ceditor:colourOf><rdf:Bag>{follows}</rdf:Bag></ceditor:colourOf>' if follows else "")
            + (f'<ceditor:metal><rdf:Bag>{metals}</rdf:Bag></ceditor:metal>' if metals else "")
            + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode("utf-8")


def write_psd(path, width, height, layers, merged, linear_edges=(), colour_of=(), metal=()):
    """`layers`, bottom first: `{name, rgba (h, w, 4) uint8, blend ('norm', 'mul ', 'lddg', 'div '), hidden}`.
    `linear_edges`: the names of the layers whose edge CEditor mixes for the panel under them, and
    `colour_of`: (light layer, colour layer) pairs, the light taking the colour's, in the file's XMP."""
    records, channel_data = [], []
    for layer in layers:
        rgba = layer["rgba"]
        ys, xs = np.nonzero(rgba[..., 3])
        if ys.size == 0:
            continue
        top, bottom, left, right = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
        crop = rgba[top:bottom, left:right]
        chans = []
        for cid, index in ((-1, 3), (0, 0), (1, 1), (2, 2)):
            payload = struct.pack(">H", 2) + zlib.compress(np.ascontiguousarray(crop[..., index]).tobytes(), 6)
            chans.append((cid, payload))
        flags = 0x08 | (0x02 if layer.get("hidden") else 0)
        extra = struct.pack(">I", 0) + struct.pack(">I", 0) + _pascal(layer["name"]) + _unicode_name(layer["name"])
        rec = struct.pack(">iiii", top, left, bottom, right) + struct.pack(">H", len(chans))
        rec += b"".join(struct.pack(">hI", cid, len(payload)) for cid, payload in chans)
        rec += b"8BIM" + layer["blend"].encode("ascii") + bytes([255, 0, flags, 0])
        rec += struct.pack(">I", len(extra)) + extra
        records.append(rec)
        channel_data.append(b"".join(payload for _, payload in chans))
    info = struct.pack(">h", -len(records)) + b"".join(records) + b"".join(channel_data)
    info += b"\0" * (-len(info) % 4)
    layer_info = struct.pack(">I", len(info)) + info
    section = layer_info + struct.pack(">I", 0)
    # The picture of them all, as Photoshop keeps it with a transparency: its colours laid on white.
    a = merged[..., 3:4]
    on_white = to8(np.concatenate([merged[..., :3] + (1.0 - a), a], axis=-1))
    planes = b"".join(np.ascontiguousarray(on_white[..., i]).tobytes() for i in range(4))
    with open(path, "wb") as f:
        f.write(b"8BPS" + struct.pack(">H", 1) + b"\0" * 6 + struct.pack(">HIIHH", 4, height, width, 8, 3))
        f.write(struct.pack(">I", 0))  # colour mode data
        resources = b""
        if linear_edges or colour_of or metal:
            xmp = _xmp(linear_edges, colour_of, metal)
            resources = b"8BIM" + struct.pack(">H", 1060) + b"\0\0" + struct.pack(">I", len(xmp)) + xmp + b"\0" * (len(xmp) % 2)
        f.write(struct.pack(">I", len(resources)) + resources)  # image resources
        f.write(struct.pack(">I", len(section)) + section)
        f.write(struct.pack(">H", 0) + planes)


# --------------------------------------------------------------------------------------------
# The renders, in a scene of their own so the author's is left as it was.

class Saved:
    """Object settings changed for a render, put back afterwards."""

    FIELDS = ("hide_render", "is_holdout", "is_shadow_catcher", "visible_camera", "visible_diffuse", "visible_glossy")

    def __init__(self, objects):
        self.values = {o.name: tuple(getattr(o, f) for f in self.FIELDS) for o in objects}
        self.objects = list(objects)

    def restore(self):
        for o in self.objects:
            for field, value in zip(self.FIELDS, self.values[o.name]):
                setattr(o, field, value)


def bounds(objects):
    from mathutils import Vector
    lo = Vector((math.inf,) * 3); hi = Vector((-math.inf,) * 3)
    for o in objects:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    return lo, hi


def shadow_reach(scene, objects):
    """How far, and which way (world, flat), the shadow of `objects` falls from them on what they stand
    on: from the light that lights them most, their height over its slant. None without a light, or
    with one from straight above or nearly level."""
    from mathutils import Vector
    lo, hi = bounds(objects)
    middle = (lo + hi) / 2
    best, direction = 0.0, None
    for light in scene.objects:
        if light.type != "LIGHT" or not renders(light):
            continue
        data = light.data
        if data.type == "SUN":
            travel = (light.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
            strength = data.energy
        else:
            offset = middle - light.matrix_world.translation
            if offset.length < 1e-6:
                continue
            travel = offset.normalized()
            strength = data.energy / max(offset.length_squared, 1e-6)
        if strength > best:
            best, direction = strength, travel
    if direction is None or direction.z > -0.05:
        return None
    height = hi.z - lo.z
    reach = Vector((direction.x, direction.y, 0.0)) * (-height / direction.z)
    return reach if reach.length > 1e-6 else None


def export_layers(scene, filepath, size=512, samples=128, report=print, for_panel=True, turn_step=TURN_STEP):
    """Write the scene's control as a layered PSD at `filepath`. `for_panel`: when the scene has a
    panel of its own, light a lamp's edge as on it (see the notes at the top). `turn_step`: the
    degrees between the angles a turning part is rendered at. Returns what was written, and the
    pictures the tests compare."""
    if np is None:
        raise RuntimeError("This Blender has no numpy: use a build from blender.org, which includes it.")
    plan = plan_scene(scene)
    parts = plan["parts"]
    if not parts:
        raise RuntimeError(plan["notes"][0])
    lo, hi = bounds(parts)
    temp = bpy.data.scenes.new("CEditor Layers")
    made = []
    workdir = tempfile.mkdtemp(prefix="ceditor-layers-")
    saved = Saved([o for o in scene.objects if o.type in DRAWN_TYPES])
    try:
        for o in scene.objects:
            if renders(o):
                temp.collection.objects.link(o)
        temp.world = scene.world
        panel = plan["panel"]
        if panel is None:
            span = max(hi.x - lo.x, hi.y - lo.y, 0.1) * 6
            mesh = bpy.data.meshes.new("CEditor panel")
            h = span / 2
            mesh.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)])
            panel = bpy.data.objects.new("CEditor panel", mesh)
            panel.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)
            temp.collection.objects.link(panel); made.append(panel)
        cam = plan["camera"]
        if cam is None:
            margin = 1.18
            w, h = (hi.x - lo.x) * margin, (hi.y - lo.y) * margin
            data = bpy.data.cameras.new("CEditor camera"); data.type = "ORTHO"; data.ortho_scale = max(w, h, 0.01)
            data.clip_end = max(1000.0, (hi.z - lo.z) * 10)
            cam = bpy.data.objects.new("CEditor camera", data)
            cam.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z + max(w, h) * 4 + 1)
            temp.collection.objects.link(cam); made.append(cam)
            width, height = (size, max(1, round(size * h / w))) if w >= h else (max(1, round(size * w / h)), size)
        else:
            if cam.name not in temp.collection.objects:
                temp.collection.objects.link(cam)
            rx, ry = scene.render.resolution_x, scene.render.resolution_y
            width, height = (size, max(1, round(size * ry / rx))) if rx >= ry else (max(1, round(size * rx / ry)), size)
        temp.camera = cam

        r = temp.render
        r.engine = "CYCLES"
        r.resolution_x, r.resolution_y, r.resolution_percentage = width, height, 100
        r.film_transparent = True
        r.image_settings.file_format = "OPEN_EXR_MULTILAYER"
        r.image_settings.color_depth = "32"
        r.image_settings.exr_codec = "NONE"
        r.use_file_extension = True
        temp.view_settings.view_transform = "Standard"
        temp.view_settings.look = "None"
        temp.view_settings.exposure = 0.0
        temp.view_settings.gamma = 1.0
        temp.cycles.samples = samples
        temp.cycles.use_denoising = False
        # Every render the same samples: parts meeting along an edge then cover its pixels exactly
        # between them.
        temp.cycles.use_adaptive_sampling = False
        temp.frame_current = scene.frame_current
        vl = temp.view_layers[0]
        for p in ("diffuse_color", "diffuse_direct", "diffuse_indirect", "glossy_color", "glossy_direct", "glossy_indirect", "emit"):
            setattr(vl, "use_pass_" + p, True)
        vl.cycles.use_pass_shadow_catcher = True

        drawn = [o for o in temp.collection.objects if o.type in DRAWN_TYPES]
        count = [0]
        angles = turn_angles(turn_step)

        def render(show, holdout=(), catchers=(), unseen=(), unlit=()):
            """Render with `show` visible, `holdout` cutting holes in them, `catchers` catching their
            shadows, `unseen` there for the light (casting shadows, in reflections) but not seen, and
            `unlit` throwing no light on the rest (seen, and casting shadows, but not lighting)."""
            for o in drawn:
                o.hide_render = not (o in show or o in holdout or o in catchers or o in unseen)
                o.is_holdout = o in holdout
                o.is_shadow_catcher = o in catchers
                o.visible_camera = o not in unseen
                o.visible_diffuse = o.visible_glossy = o not in unlit
            count[0] += 1
            r.filepath = os.path.join(workdir, f"pass{count[0]:03d}_")
            bpy.ops.render.render(write_still=True, scene=temp.name)
            files = sorted(f for f in os.listdir(workdir) if f.startswith(f"pass{count[0]:03d}_"))
            return passes_of(read_exr(os.path.join(workdir, files[-1])), vl.name)

        groups = {}
        for o in parts:
            groups.setdefault(render_group(o), []).append(o)
        order = lambda objs: sorted(objs, key=lambda o: (bounds([o])[1].z, o.name))
        still = order(groups.get("still", []))
        lamps = [o for o in still if role_of(o.name) == "on"]
        layers = []
        merged = np.zeros((height, width, 4), dtype=np.float32)
        black = np.zeros((height, width, 3), dtype=np.float32)

        # The panel the control sits on, as the scene shows it with nothing on it: what the light on it
        # is measured against, and with `for_panel` the panel a lit lamp's edge is made for. `on_panel`
        # is the layers on it as CEditor draws them (the outline mixed for it), for the tests.
        panel_alone = render([panel])
        look = panel_alone["Combined"]
        covered = look[..., 3:4] > 0.5
        colour = srgb(look[..., :3] / np.maximum(look[..., 3:4], 1e-6))
        fallback = np.median(colour[covered[..., 0]], axis=0) if covered.any() else np.full(3, 0.5)
        panel_look = np.where(covered, colour, fallback).astype(np.float32)
        bare = panel_look if for_panel and plan["panel"] is not None else None
        on_panel = None if bare is None else np.concatenate([bare, np.ones_like(bare[..., :1])], axis=-1)

        def add(name, rgb, alpha, blend="norm", hidden=False, panel_alpha=None, panel_rgb=None):
            """A layer, and the pictures of them so far. `panel_alpha`, `panel_rgb`: its opacity and colour
            as CEditor draws it on the scene's panel, where they are not the ones written (an edge it
            mixes for the panel)."""
            nonlocal merged, on_panel
            rgba = rgba8(rgb, alpha)
            if blank(rgba):
                return
            layers.append({"name": name, "rgba": rgba, "blend": blend, "hidden": hidden})
            if not hidden:
                merged = blend_over(merged, rgba.astype(np.float32) / 255.0, blend)
                if on_panel is not None:
                    shown = rgba if panel_alpha is None else rgba8(rgb if panel_rgb is None else panel_rgb, panel_alpha)
                    on_panel = blend_over(on_panel, shown.astype(np.float32) / 255.0, blend)

        def beneath():
            """What a layer added now is laid on, straight sRGB, and where that is opaque: on the
            scene's panel, everywhere; otherwise where the layers so far cover the pixel."""
            if on_panel is not None:
                return on_panel[..., :3], np.ones(on_panel.shape[:2], dtype=bool)
            a = merged[..., 3:4]
            return np.where(a > 0, merged[..., :3] / np.maximum(a, 1e-6), 0.0), a[..., 0] > 0.999

        linear_edges = []
        colour_of = []
        metal_names = []
        metal_cover = {}

        def colour_name_of(o):
            """The name its colour layer is written under: a lamp's body without its role word."""
            return without_role_words(o.name, "lens") if role_of(o.name) == "on" else o.name

        def add_part(o, look, opacity, at_angles=None, stays=False, bounce=None):
            """`at_angles`: for a part that turns whole, {angle: its look rendered turned that far, turned
            back to rest}; it is then written at each angle, "<name> at <angle>", "<name> shading at
            <angle>" and so on. Its colour inside is the same at every angle; at its edge, where the
            colour layer holds its whole look, and in its light layers, it is as lit at that angle.
            `stays`: a part that stays put, whose edge CEditor mixes for what is under it there (see the
            notes at the top): written as it covers each pixel, and named in the file for it."""
            role = role_of(o.name)
            # A lamp's body is always there; only its glow lights with the control. A rotor's colour
            # turns, its light stays. Everything else keeps its name, and with it its part.
            if role == "on":
                still_name = without_role_words(o.name, "lens")
            elif is_rotor(o.name):
                still_name = without_role_words(o.name, "cap")
            else:
                still_name = o.name
            # Inside the part, its colour and, over it, its light. Where it covers only some of a pixel,
            # its look as rendered, in its colour layer alone: a multiply or an add there would reach
            # what is beside the part in the pixel too. Between the two, over a few pixels, the light
            # layers come in and the colour layer gives up the light they bring, so that a picture
            # scaled (CEditor draws components at every size) never meets the change at one stroke.
            # Inside: the part covers the pixel whole itself, not only with the parts above it. Under
            # another part's edge (a pale skirt round a cap), its light worked out from a few samples is
            # not its light: there its look as rendered goes in its colour layer, as at its own edge.
            whole = (opacity > 254.5 / 255) & (look["alpha"] > 254.5 / 255)
            depth = inward(whole)[..., None]
            under, opaque = beneath()
            edge = np.where(~whole & opaque, edge_opacity(look["whole"], opacity, under), opacity)

            def colour_layer(seen):
                glow = 0.0 if role == "on" else seen["glow"]
                shading = 1.0 - depth + depth * seen["shade"]
                return np.where(depth >= 1.0, look["colour"],
                                np.clip((seen["whole"] - depth * (seen["highlights"] + glow)) / np.maximum(shading, 1e-4), 0.0, 1.0))

            def drawn_of(colour_rgb, alpha):
                """The colour CEditor measures the colour layer as drawn in (utils/pictureRecolour.js
                drawnColour): the median of its 8-bit pixels within two levels of its most covered."""
                a8, v8 = to8(alpha), to8(colour_rgb)
                pick = a8 >= int(a8.max()) - 2
                return np.array([np.sort(v8[..., c][pick])[int(pick.sum()) // 2] for c in range(3)], dtype=np.float32) / 255.0

            def add_light(name, suffix, seen, colour_rgb, alpha, drawn):
                """The light on the part and its gloss, beside its colour layer and as far as it goes,
                hidden: with them CEditor works out its colour, shading and highlights layers again in
                another colour (utils/pictureRecolour.js), as this function writes them. Its colour
                there is the colour layer's own where the part covers the pixel whole, else the colour
                it was drawn in, as CEditor takes them; the gloss is what the look is past that colour
                in that light. (Not past the light as its 8 bits hold it: the gloss would carry the
                rounding of the light, a few percent of the old colour, onto a new colour that has
                little of it.)"""
                covered = (to8(alpha) > 0).astype(np.float32)
                inside = (to8(depth[..., 0]) >= 255)[..., None]
                own = np.where(inside, linear(to8(colour_rgb) / 255.0), linear(drawn))
                gloss = np.clip(seen["bare"] - own * seen["light"], 0.0, None)
                add(f"{name} lighting{suffix}", light_code(seen["light"]), covered, hidden=True)
                add(f"{name} gloss{suffix}", light_code(gloss), covered, hidden=True)
                # The light each other part throws on it by way of its colour: the light on it, and its
                # gloss, less what they are with that part colourless.
                for k, colourless_look in (bounce or {}).items() if not suffix else ():
                    light_k = np.clip(seen["light"] - colourless_look["light"], 0.0, None)
                    gloss_k = np.clip(gloss - np.clip(colourless_look["bare"] - own * colourless_look["light"], 0.0, None), 0.0, None)
                    add(f"{name} lighting from {colour_name_of(k)}", bounce_code(light_k), covered, hidden=True)
                    add(f"{name} gloss from {colour_name_of(k)}", bounce_code(gloss_k), covered, hidden=True)

            if at_angles:
                colour_name = o.name
                rest_drawn = drawn_of(colour_layer(at_angles[0]), edge) if 0 in at_angles else None
                for angle, seen in at_angles.items():
                    layer = colour_layer(seen)
                    add(f"{o.name} at {angle_name(angle)}", layer, edge, hidden=angle != 0)
                    add_light(o.name, f" at {angle_name(angle)}", seen, layer, edge, rest_drawn if rest_drawn is not None else drawn_of(layer, edge))
            elif stays:
                colour_name = still_name if role == "on" else o.name
                layer = colour_layer(look)
                partial = ~whole & opaque
                mixed_rgb, mixed_alpha = edge_mix(look["whole"], opacity, under)
                add(colour_name, layer, opacity, panel_alpha=np.where(partial, mixed_alpha, opacity),
                    panel_rgb=np.where(partial[..., None], mixed_rgb, layer))
                add_light(colour_name, "", look, layer, opacity, drawn_of(layer, opacity))
                linear_edges.append(colour_name)
            else:
                colour_name = still_name if role == "on" else o.name
                layer = colour_layer(look)
                add(colour_name, layer, edge)
                add_light(colour_name, "", look, layer, edge, drawn_of(layer, edge))
            # Its shading and highlights go with its colour layer: CEditor works them out again with it.
            colour_of.extend([(f"{still_name} shading", colour_name), (f"{still_name} highlights", colour_name)])
            # A metal's reflections are its colour, and light past white (a glint) is in its highlights.
            covered = look["alpha"] > 0.5
            if covered.any() and float(look["metal"][covered].mean()) > 0.5:
                metal_names.append(colour_name)
                metal_cover[colour_name] = whole
            depth = depth[..., 0]
            if at_angles:
                inside = depth > 0
                shades = {angle: np.where(inside[..., None], seen["shade"], 1.0) for angle, seen in at_angles.items()}
                if not all(np.allclose(shade[inside], 1.0, atol=1 / 255) for shade in shades.values()):
                    for angle, shade in shades.items():
                        add(f"{still_name} shading at {angle_name(angle)}", shade, depth, "mul ", hidden=angle != 0)
                # Over the whole inside, adding nothing where there is none, so that CEditor can add
                # light anywhere inside when the colour changes.
                for angle, seen in at_angles.items():
                    add(f"{still_name} highlights at {angle_name(angle)}", seen["highlights"], depth, "lddg", hidden=angle != 0)
                for angle, seen in at_angles.items():
                    add(f"{still_name} emission at {angle_name(angle)}", *light(seen["glow"], depth), "lddg", hidden=angle != 0)
                report(f"{o.name}: rendered at {len(at_angles)} angles")
                return
            if not np.allclose(look["shade"][depth > 0], 1.0, atol=1 / 255):
                add(f"{still_name} shading", look["shade"], depth, "mul ")
            # Over the whole inside, adding nothing where there is none (see above).
            add(f"{still_name} highlights", look["highlights"], depth, "lddg")
            if role == "on":
                # A lamp's glow, out to its edge. There Cycles shows the lit lamp brighter than white
                # over part of the pixel and what is under it over the rest: the light to add is that,
                # less what the pixel shows unlit.
                rgb, alpha = light(look["glow"], whole)
                if on_panel is not None:
                    lit = srgb(np.clip(look["lit"] + (1.0 - look["alpha"][..., None]) * linear(under), 0.0, 1.0))
                    unlit = beneath()[0]
                else:
                    lit, unlit = look["shown"], edge[..., None] * look["whole"]
                edge_rgb, edge_alpha = light_over_clear(np.clip(lit - unlit, 0.0, 1.0))
                add(f"{o.name} lit", np.where(whole[..., None], rgb, edge_rgb), np.where(whole, alpha, edge_alpha), "lddg")
            else:
                add(f"{still_name} emission", *light(look["glow"], depth), "lddg")
            report(f"{o.name}: rendered")

        def share(shadow, left):
            """What the parts do to the light on what is under them, as a share of it: below 1 their
            shadow, above 1 their reflection or the light they give. Cycles gives it for what the
            parts leave of a pixel (where a part covers some of it, the rest), and the shadow layer,
            under the parts, darkens just that. Where they leave too little of a pixel to tell from
            (a few of its samples), and under them, it is what is beside them."""
            catcher = shadow.get("Shadow Catcher")
            if catcher is None:
                return None
            seen = left > 0.15
            ratio = np.where(seen[..., None], np.maximum(catcher[..., :3], 0.0), 1.0)
            return carry_in([ratio], seen, ~seen)[0]

        def add_group(objs, name, shadow, holdout, unseen, panel_light=(), lit_shadow=None, turn=None):
            """A group's shadow and reflection, then its parts, bottom up, each rendered with the others
            held out. `panel_light`: the panel's renders with the group there unseen, its lamps dark and
            lit, for the light it throws on the panel (the group under everything else). `lit_shadow`:
            the shadow render again with its lamps lighting (`shadow` then has them dark). `turn`: for
            parts that turn, a render with them turned to an angle."""
            shadow_name, reflection_name = f"{name}shadow", f"{name}reflection"
            before = merged.copy()
            look_of = lambda o, passes: part_look(passes, lamp=role_of(o.name) == "on")
            looks = [look_of(o, render([o], holdout=[x for x in objs if x is not o] + holdout, unseen=unseen)) for o in objs]
            opacities, above, left = unover([look["alpha"] for look in looks])
            # The light each part throws on the others and on the panel by way of its colour: each
            # rendered again with that part colourless, the difference (see colourless). CEditor scales
            # it by the part's change of colour, and the parts it lights are lit in its new colour.
            bounce_on = {}
            panel_without = {}
            if panel_light and len(objs) + 1 > 1:
                for k in objs:
                    restore = colourless(k)
                    try:
                        for r in objs:
                            if r is not k:
                                bounce_on.setdefault(r.name, {})[k] = look_of(r, render([r], holdout=[x for x in objs if x is not r] + holdout, unseen=unseen))
                        panel_without[k] = render([panel], unseen=still, unlit=lamps)
                    finally:
                        restore()
            ratio = share(shadow, left)
            darkness = lambda share_of_light: 1.0 - srgb(np.clip(luma(np.minimum(share_of_light, 1.0)), 0.0, 1.0))
            # Parts that turn: rendered turned to each angle as well, what they do to the light under them
            # (their shadow, their reflection) and their own look. Each is written turned back to rest,
            # "... at <angle>", and CEditor's import makes each set one part whose frame follows the value
            # (see the notes at the top). A rotor's light stays put, and so is made once.
            turned_shares, turned_looks = {}, {}
            if turn is not None:
                covered = np.concatenate([black, (1.0 - left)[..., None]], axis=-1)
                whole_turns = [o for o in objs if not is_rotor(o.name)]
                for angle in angles:
                    if not angle:
                        continue
                    left_there = 1.0 - turned(covered, angle, axis_px)[..., 3]
                    turned_shares[angle] = share(turn(angle, objs, catchers=[panel] + still), left_there)
                    for o in whole_turns:
                        passes = turn(angle, [o], holdout=[x for x in objs if x is not o] + holdout, unseen=unseen)
                        seen = look_of(o, passes)
                        back = lambda values: turned(np.concatenate([values, seen["alpha"][..., None]], axis=-1), -angle, axis_px, sharp=True)
                        kept = {key: back(seen[key]) for key in ("whole", "shade", "highlights", "glow")}
                        # Light can be many times white, and a turn keeps colour within its opacity:
                        # turned at a 256th, and back.
                        for key in ("light", "gloss", "bare"):
                            kept[key] = back(seen[key] / 256.0)
                            kept[key][..., :3] *= 256.0
                        rest = looks[objs.index(o)]
                        # Where the part turned back does not quite cover what it covers at rest (its
                        # edge, resampled), its look at rest.
                        turned_looks.setdefault(o.name, {})[angle] = {
                            key: np.where(value[..., 3:4] > 0.5, value[..., :3], rest[key]) for key, value in kept.items()}
            if ratio is not None:
                if turned_shares and shadow_pivot_px is not None:
                    # Its shadow at each angle, turned back about the point it turns about.
                    for angle in angles:
                        alpha = darkness(turned_shares[angle] if angle else ratio)
                        if angle:
                            alpha = turned(np.concatenate([black, alpha[..., None]], axis=-1), -angle, shadow_pivot_px, sharp=True)[..., 3]
                        add(f"{shadow_name} at {angle_name(angle)}", black, alpha, hidden=angle != 0)
                else:
                    add(shadow_name, black, darkness(ratio))
            if ratio is not None and panel_light:
                # On the panel: the light the parts throw on it (a metal cap's glare), and the lamps'
                # light, which shows when they are lit. Light on a surface is in two parts, and the
                # panel's own passes, rendered with the parts there unseen and without them, give
                # each. What its colour scatters (diffuse) is a multiple of what is there, written as
                # colour dodge, so that on a dark panel it brightens it a little and on a light one a
                # lot. What its shine reflects (gloss) is the same on any panel, written as light
                # added, "... shine". Each is measured on the scene's panel, and holds on another of
                # the same finish.
                lit_ratio = share(lit_shadow, left) if lit_shadow is not None else None
                regions = [luma(ratio) > 1.0 + 1 / 255]
                names = [f"{name}bounce"]
                if lit_ratio is not None:
                    regions.append(luma(lit_ratio) > luma(ratio) * (1.0 + 1 / 255))
                    names.append(f"{lamps[0].name} glow")

                def lighting(passes):
                    part = lambda key: passes[key][..., :3] if key in passes else np.zeros_like(black)
                    return part("DiffDir") + part("DiffInd"), (part("GlossDir") + part("GlossInd")) * part("GlossCol")
                base = linear(panel_look)
                gloss = lighting(panel_alone)[1]
                steps = [panel_alone] + list(panel_light)
                for step, ((without, with_it), region, layer_name) in enumerate(zip(zip(steps, steps[1:]), regions, names)):
                    (d0, g0), (d1, g1) = lighting(without), lighting(with_it)
                    region = region[..., None]
                    scattered = np.where(region & (d0 > 1e-6), np.maximum(d1 / np.maximum(d0, 1e-6), 1.0), 1.0)
                    shine = np.where(region, np.clip(g1 - g0, 0.0, None), 0.0)
                    # The panel's own gloss is in what it shows, and the multiple is of the rest.
                    lit_base = base + (base - gloss).clip(0.0, None) * (scattered - 1.0)
                    shown_before = srgb(base)
                    multiple = np.where(shown_before > 1e-4, srgb(lit_base) / np.maximum(shown_before, 1e-4), 1.0)
                    shone = np.clip(srgb(lit_base + shine) - srgb(lit_base), 0.0, 1.0)
                    if step == 0 and panel_without:
                        # What each part throws on the panel by way of its colour: the share of the
                        # panel's light at each pixel that comes off its colour (its shadow's fill
                        # included), and what it adds to the shine; with the panel's look under it. The
                        # bounce and shine layers then cover every pixel it reaches, adding nothing where
                        # there is none. In another colour CEditor scales that share of the light, the
                        # shadow made a multiply where the panel must darken and the bounce where it must
                        # brighten (utils/pictureRecolour.js recolourBouncePixels).
                        reach = np.zeros(region.shape[:2], dtype=bool)
                        for k, without_k in panel_without.items():
                            dk, gk = lighting(without_k)
                            via = np.where(d1 > 1e-6, np.clip((d1 - dk) / np.maximum(d1, 1e-6), 0.0, 1.0), 0.0)
                            scattered_k = np.where(region & (d0 > 1e-6), np.maximum(dk / np.maximum(d0, 1e-6), 1.0), 1.0)
                            lit_k = base + (base - gloss).clip(0.0, None) * (scattered_k - 1.0)
                            shine_k = np.where(region, np.clip(gk - g0, 0.0, None), 0.0)
                            sheen = np.clip(shone - np.clip(srgb(lit_k + shine_k) - srgb(lit_k), 0.0, 1.0), 0.0, 1.0)
                            # Where the parts cover some of a pixel, the panel there is measured over the
                            # whole pixel, the strip under a part's rim with it, lit almost only by the
                            # part: what shows of it is the panel just beside, whose share is carried in.
                            open_panel = left > 0.999
                            via, sheen = carry_in([via, sheen], open_panel, ~open_panel, rings=2)
                            near = (via.max(-1) >= 2.0 ** -12) | (sheen.max(-1) >= 2.0 ** -12)
                            reach |= near
                            name_k = colour_name_of(k)
                            add(f"{layer_name} from {name_k}", bounce_code(via), near.astype(np.float32), hidden=True)
                            add(f"{layer_name} shine from {name_k}", bounce_code(sheen), near.astype(np.float32), hidden=True)
                        add(f"{layer_name} base", light_code(base), reach.astype(np.float32), hidden=True)
                        s_dodge, a_dodge = dodge(multiple)
                        add(layer_name, s_dodge, np.where(reach, 1.0, a_dodge), "div ")
                        # Over the reach the shine is at least one step of opacity, its colour what it
                        # adds over that, so that it adds no more than it should where it is fainter.
                        a_shine = np.where(reach, np.maximum(shone.max(-1), 1.0 / 255.0), shone.max(-1))
                        rgb_shine = np.where(a_shine[..., None] > 0, np.clip(shone / np.maximum(a_shine[..., None], 1e-6), 0.0, 1.0), 0.0)
                        add(f"{layer_name} shine", rgb_shine, a_shine, "lddg")
                    else:
                        add(layer_name, *dodge(multiple), "div ")
                        add(f"{layer_name} shine", *light_over_clear(shone), "lddg")
                    base = lit_base + shine
                    gloss = gloss + shine
            if ratio is not None:
                # Their reflection in a part under them that shines: what it adds to that part's light.
                a = before[..., 3:4]
                under = np.where(a > 0, before[..., :3] / np.maximum(a, 1e-6), 0.0)
                where = a[..., 0] > 0.999
                reflect = lambda share_of_light: np.clip(srgb(linear(under) * np.maximum(share_of_light, 1.0)) - under, 0.0, 1.0)
                added = reflect(ratio)
                # A multiple of the light on what is under it: in a metal part, that metal's colour. When
                # most of it is in one, it takes that part's colour, as the part's own highlights do.
                weight = added.max(-1) * where
                for metal_name, cover in metal_cover.items():
                    if weight.sum() > 0 and float((weight * cover).sum()) > 0.6 * float(weight.sum()):
                        colour_of.append((reflection_name, metal_name))
                        break
                if turned_shares and (added.max(-1)[where] >= 0.5 / 255).any():
                    # A turning part's reflection is not the same at every angle: other faces of it catch
                    # the light. Away from rest the layers are hidden, so the file shows the part at rest.
                    for angle in angles:
                        share_there = turned_shares[angle] if angle else ratio
                        rgb, alpha = light(reflect(share_there), where)
                        if angle:
                            back = turned(np.concatenate([rgb, alpha[..., None]], axis=-1), -angle, axis_px, sharp=True)
                            rgb, alpha = back[..., :3], back[..., 3]
                        add(f"{reflection_name} at {angle_name(angle)}", rgb, alpha, "lddg", hidden=angle != 0)
                else:
                    add(reflection_name, *light(added, where), "lddg")
            for o, look, opacity, over in zip(objs, looks, opacities, above):
                # Under the parts above it, where they cover the pixel whole, the part goes on a little
                # way past its own edge (a part under another's edge has none of its own there).
                keys = ["colour", "shade", "highlights", "glow", "whole", "shown", "lit", "light", "gloss", "bare"]
                carried = carry_in([opacity] + [look[k] for k in keys], opacity > 1e-3, over < 1e-3)
                look = dict(look, **dict(zip(keys, carried[1:])))
                at_angles = None
                if o.name in turned_looks:
                    at_angles = {angle: turned_looks[o.name][angle] if angle else look for angle in angles}
                add_part(o, look, carried[0], at_angles, stays=bool(panel_light), bounce=bounce_on.get(o.name))

        from bpy_extras.object_utils import world_to_camera_view

        def at_pixel(point):
            v = world_to_camera_view(temp, cam, point)
            return v.x * width, (1 - v.y) * height

        def mark(name, point):
            """A hidden 2 by 2 dot centred on `point` (world), for CEditor's import to find."""
            x, y = at_pixel(point)
            px, py = int(round(x)), int(round(y))
            dot = np.zeros((height, width), dtype=np.float32)
            dot[max(0, py - 1):py + 1, max(0, px - 1):px + 1] = 1.0
            add(name, black + 1.0, dot, hidden=True)

        # The panel's shadow under what stays put, then what stays put, bottom up. With lamps, the
        # shadow is rendered with them dark, and again lit, for their light on the panel.
        if still:
            if lamps:
                dark = render(still, catchers=[panel], unlit=lamps)
                lit_shadow = render(still, catchers=[panel])
            else:
                dark, lit_shadow = render(still, catchers=[panel]), None
            # The panel as it shows with the parts there (unseen): their glare, and the lamps' light.
            panel_light = [render([panel], unseen=still, unlit=lamps)] + ([render([panel], unseen=still)] if lamps else [])
            add_group(still, "", dark, holdout=[panel], unseen=[], panel_light=panel_light, lit_shadow=lit_shadow)
        # Where turning parts turn about: the pivot object, or the first turning part's origin.
        turning = order(groups.get("turns", []))
        centre = (plan["pivot"].matrix_world.translation if plan["pivot"] else turning[0].matrix_world.translation).copy() if turning else None
        axis_px = at_pixel(centre) if turning else None

        def turned_render(objs):
            """A render with `objs` turned `angle` degrees clockwise as the camera sees them, about the
            axis, and put back after: `at(angle, show, holdout, catchers, unseen)`."""
            from mathutils import Matrix, Vector
            view = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()

            def at(angle, show, **how):
                spin = Matrix.Translation(centre) @ Matrix.Rotation(math.radians(angle), 4, view) @ Matrix.Translation(-centre)
                rest = [o.matrix_world.copy() for o in objs]
                try:
                    for o in objs:
                        o.matrix_world = spin @ o.matrix_world
                    return render(show, **how)
                finally:
                    for o, matrix in zip(objs, rest):
                        o.matrix_world = matrix
            return at

        # Where a turning part's shadow turns about: a shadow cast by a light that stays put falls the
        # same way whichever way the part points, so it turns about a point half its reach from the
        # axis, towards where it falls (CEditor's import reads "<layer> pivot").
        reach = shadow_reach(scene, turning) if turning else None
        shadow_pivot = (centre + reach / 2) if reach is not None else None
        shadow_pivot_px = at_pixel(shadow_pivot) if shadow_pivot is not None else axis_px

        # Each moving group: its shadow on the panel and on what stays put, then its parts, lit by
        # what stays put without being seen with it.
        for group in ("turns", "moves", "off", "pressed"):
            objs = order(groups.get(group, []))
            if objs:
                add_group(objs, f"{objs[0].name} ", render(objs, catchers=[panel] + still), holdout=[panel], unseen=still,
                          turn=turned_render(objs) if group == "turns" else None)
        # Where turning parts turn about, and where their shadow does.
        if turning:
            mark("pivot", centre)
            shadow_name = f"{turning[0].name} shadow"
            if shadow_pivot is not None and any(layer["name"] == shadow_name or layer["name"].startswith(f"{shadow_name} at ") for layer in layers):
                mark(f"{shadow_name} pivot", shadow_pivot)
        written = {layer["name"] for layer in layers}
        linear_edges = [name for name in linear_edges if name in written]
        has = lambda base: base in written or any(name.startswith(f"{base} at ") for name in written)
        colour_of = [(light, colour) for light, colour in colour_of if has(light) and has(colour)]
        metal_names = [name for name in metal_names if has(name)]
        write_psd(filepath, width, height, layers, merged, linear_edges, colour_of, metal_names)
        return {"width": width, "height": height, "layers": [(l["name"], l["blend"]) for l in layers], "renders": count[0], "turn_step": turn_step,
                "linear_edges": linear_edges, "colour_of": colour_of, "metal": metal_names,
                "hidden": [l["name"] for l in layers if l.get("hidden")],
                "notes": plan["notes"], "merged": merged, "pixels": {l["name"]: l["rgba"] for l in layers},
                "panel": bare, "on_panel": on_panel}
    finally:
        saved.restore()
        for o in made:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
        bpy.data.scenes.remove(temp)
        for f in os.listdir(workdir):
            os.remove(os.path.join(workdir, f))
        os.rmdir(workdir)


# --------------------------------------------------------------------------------------------
# Blender's side: File > Export, and a panel in the 3D Viewport's sidebar.

ROLE_LABELS = (("turns", "Turns with the value"), ("moves", "Slides with the value"), ("on", "Lights when on"),
               ("off", "Shown when off"), ("pressed", "Shown while held"), ("", "Stays put"), ("track", "Stays put (track)"))


class CEDITOR_OT_export_layers(bpy.types.Operator, ExportHelper):
    """Write the control's objects as a layered PSD for CEditor"""
    bl_idname = "ceditor.export_layers"
    bl_label = "Export CEditor Layers"
    bl_options = {"PRESET"}
    filename_ext = ".psd"
    filter_glob: StringProperty(default="*.psd", options={"HIDDEN"})
    size: IntProperty(name="Size", description="The longer side of the image, in pixels", default=512, min=32, max=4096)
    samples: IntProperty(name="Samples", description="Cycles samples for each render", default=128, min=1, max=16384)
    for_panel: BoolProperty(
        name="For this panel",
        description="A lit lamp's outermost pixels are lit as on the scene's panel, the one the control goes on in CEditor. "
                    "Off: as on black. (The outline and the light on the panel CEditor works out for any panel)",
        default=True)

    def execute(self, context):
        try:
            result = export_layers(context.scene, self.filepath, self.size, self.samples, report=lambda m: None,
                                   for_panel=self.for_panel)
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        self.report({"INFO"}, f"Wrote {len(result['layers'])} layers, {result['width']} x {result['height']}, to {os.path.basename(self.filepath)}")
        return {"FINISHED"}


class CEDITOR_PT_layers(bpy.types.Panel):
    bl_label = "CEditor Layers"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "CEditor"

    def draw(self, context):
        plan = plan_scene(context.scene)
        col = self.layout.column()
        for role, label in ROLE_LABELS:
            names = [o.name for o in plan["parts"] if role_of(o.name) == role]
            if names:
                box = col.box()
                box.label(text=label)
                for name in names:
                    box.label(text=name + ("   (colour turns, light stays)" if is_rotor(name) else ""), icon="OBJECT_DATA")
        col.label(text=f"Panel: {plan['panel'].name}" if plan["panel"] else "Panel: one is added", icon="MESH_PLANE")
        col.label(text=f"Camera: {plan['camera'].name}" if plan["camera"] else "Camera: straight down", icon="CAMERA_DATA")
        # Blender cuts a long label short: the notes are wrapped to the sidebar's width.
        chars = max(20, int(context.region.width / (7 * context.preferences.system.ui_scale)) - 4)
        for note in plan["notes"]:
            for i, line in enumerate(textwrap.wrap(note, chars)):
                col.label(text=line, icon="INFO" if i == 0 else "BLANK1")
        col.separator()
        col.operator(CEDITOR_OT_export_layers.bl_idname, text="Export for CEditor...", icon="EXPORT")


def menu_export(self, context):
    self.layout.operator(CEDITOR_OT_export_layers.bl_idname, text="CEditor Layers (.psd)")


def register():
    bpy.utils.register_class(CEDITOR_OT_export_layers)
    bpy.utils.register_class(CEDITOR_PT_layers)
    bpy.types.TOPBAR_MT_file_export.append(menu_export)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu_export)
    bpy.utils.unregister_class(CEDITOR_PT_layers)
    bpy.utils.unregister_class(CEDITOR_OT_export_layers)


if __name__ == "__main__":
    register()
