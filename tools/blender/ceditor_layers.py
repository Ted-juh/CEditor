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
#   <name> shading     what the lights and the room do to that colour (multiply)
#   <name> highlights  its reflections, and light brighter than its colour (linear dodge)
#   <name> lit         a lamp's own glow (linear dodge); a switch or button shows it when on
#   shadow             the knob's shadow on the panel (black, its darkness as opacity)
#   <name> shadow      a moving part's shadow on the panel and on the parts under it
#   <name> reflection  a moving part's reflection in the shiny parts under it (linear dodge)
#   pivot              where turning parts turn about (a dot CEditor hides)
#
# Stacked as listed, the layers give back Cycles' render to a level or two in 255, the edges where
# parts meet included, and each stays changeable in CEditor: a colour layer is retinted while its
# light stays as rendered. Where a part covers only some of a pixel, its look there is all in its
# colour layer, since a multiply or an add would reach what is beside it in the pixel too; the light
# layers come in over the next few pixels, and the layers under a part go on a little way under its
# edge, so that the layers still add up when CEditor draws them larger or smaller, or turned.
#
# What no layer can give exactly, since it depends on the panel CEditor puts the control on: the
# outline against the panel is blended in sRGB, as every transparent picture's is (Blender's own
# PNGs too), where Cycles mixes in linear light; a lit lamp's outermost pixels, which Cycles shows lit
# as far out as a quarter of a pixel, keep the lamp's colour rather than letting a light panel
# through; and the light a lamp throws on the panel is not written at all.
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
from bpy.props import IntProperty, StringProperty
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
    highlights = np.clip(srgb(without_glow) - e_colour * shade, 0.0, 1.0)
    glow = np.clip(srgb(total) - srgb(without_glow), 0.0, 1.0)
    return {"alpha": alpha, "colour": e_colour, "shade": shade, "highlights": highlights, "glow": glow,
            "whole": srgb(without_glow if lamp else total), "shown": srgb(p["Combined"][..., :3])}


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


def light_over_clear(added):
    """Light to add where what is under it is part clear: its colour the light at full strength and
    its opacity how strong, as CSS's plus-lighter adds both (Photoshop's Linear Dodge lays the colour
    over instead; nothing in between gives both)."""
    alpha = added.max(-1)
    return np.where(alpha[..., None] > 0, added / np.maximum(alpha[..., None], 1e-6), 0.0), alpha


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
    mixed = sc * dc if mode == "mul " else sc
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


def write_psd(path, width, height, layers, merged):
    """`layers`, bottom first: `{name, rgba (h, w, 4) uint8, blend ('norm', 'mul ', 'lddg'), hidden}`."""
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
        f.write(struct.pack(">I", 0))  # image resources
        f.write(struct.pack(">I", len(section)) + section)
        f.write(struct.pack(">H", 0) + planes)


# --------------------------------------------------------------------------------------------
# The renders, in a scene of their own so the author's is left as it was.

class Saved:
    """Object settings changed for a render, put back afterwards."""

    def __init__(self, objects):
        self.values = {o.name: (o.hide_render, o.is_holdout, o.is_shadow_catcher, o.visible_camera) for o in objects}
        self.objects = list(objects)

    def restore(self):
        for o in self.objects:
            o.hide_render, o.is_holdout, o.is_shadow_catcher, o.visible_camera = self.values[o.name]


def bounds(objects):
    from mathutils import Vector
    lo = Vector((math.inf,) * 3); hi = Vector((-math.inf,) * 3)
    for o in objects:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    return lo, hi


def export_layers(scene, filepath, size=512, samples=128, report=print):
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

        def render(show, holdout=(), catchers=(), unseen=()):
            """Render with `show` visible, `holdout` cutting holes in them, `catchers` catching their
            shadows, and `unseen` there for the light (casting shadows, in reflections) but not seen."""
            for o in drawn:
                o.hide_render = not (o in show or o in holdout or o in catchers or o in unseen)
                o.is_holdout = o in holdout
                o.is_shadow_catcher = o in catchers
                o.visible_camera = o not in unseen
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
        layers = []
        merged = np.zeros((height, width, 4), dtype=np.float32)
        black = np.zeros((height, width, 3), dtype=np.float32)

        def add(name, rgb, alpha, blend="norm", hidden=False):
            nonlocal merged
            rgba = rgba8(rgb, alpha)
            if blank(rgba):
                return
            layers.append({"name": name, "rgba": rgba, "blend": blend, "hidden": hidden})
            if not hidden:
                merged = blend_over(merged, rgba.astype(np.float32) / 255.0, blend)

        def add_part(o, look, opacity):
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
            whole = opacity > 254.5 / 255
            depth = inward(whole)[..., None]
            a = merged[..., 3]
            under = np.where(a[..., None] > 0, merged[..., :3] / np.maximum(a[..., None], 1e-6), 0.0)
            edge = np.where(~whole & (a > 0.999), edge_opacity(look["whole"], opacity, under), opacity)
            glow = 0.0 if role == "on" else look["glow"]
            shading = 1.0 - depth + depth * look["shade"]
            colour = np.where(depth >= 1.0, look["colour"],
                              np.clip((look["whole"] - depth * (look["highlights"] + glow)) / np.maximum(shading, 1e-4), 0.0, 1.0))
            add(still_name if role == "on" else o.name, colour, edge)
            depth = depth[..., 0]
            if not np.allclose(look["shade"][depth > 0], 1.0, atol=1 / 255):
                add(f"{still_name} shading", look["shade"], depth, "mul ")
            add(f"{still_name} highlights", *light(look["highlights"], depth), "lddg")
            if role == "on":
                # A lamp's glow, out to its edge: there, what the lit pixel shows less what its body
                # gives it unlit.
                rgb, alpha = light(look["glow"], whole)
                edge_rgb, edge_alpha = light_over_clear(np.clip(look["shown"] - edge[..., None] * look["whole"], 0.0, 1.0))
                add(f"{o.name} lit", np.where(whole[..., None], rgb, edge_rgb), np.where(whole, alpha, edge_alpha), "lddg")
            else:
                add(f"{still_name} emission", *light(look["glow"], depth), "lddg")
            report(f"{o.name}: rendered")

        def add_group(objs, name, shadow, holdout, unseen):
            """A group's shadow and reflection, then its parts, bottom up, each rendered with the others
            held out."""
            shadow_name, reflection_name = f"{name}shadow", f"{name}reflection"
            looks = [part_look(render([o], holdout=[x for x in objs if x is not o] + holdout, unseen=unseen),
                               lamp=role_of(o.name) == "on") for o in objs]
            opacities, above, left = unover([look["alpha"] for look in looks])
            catcher = shadow.get("Shadow Catcher")
            if catcher is not None:
                # What the parts do to the light on what is under them, as a share of it: below 1 their
                # shadow, above 1 their reflection. The parts' own pixels are 1, so where a part covers
                # some of a pixel, the rest of it has what is left over; and where they leave too little
                # of it to tell from (a few of the pixel's samples), and under them, what is beside them.
                spread = left[..., None]
                seen = left > 0.15
                ratio = np.where(spread > 1e-3, np.maximum(catcher[..., :3] - (1.0 - spread), 0.0) / np.maximum(spread, 1e-3), 1.0)
                ratio = np.where(seen[..., None], ratio, 1.0)
                ratio = carry_in([ratio], seen, ~seen)[0]
                add(shadow_name, black, 1.0 - srgb(np.clip(luma(np.minimum(ratio, 1.0)), 0.0, 1.0)))
                # Their reflection in a part under them that shines: what it adds to that part's light.
                a = merged[..., 3:4]
                under = np.where(a > 0, merged[..., :3] / np.maximum(a, 1e-6), 0.0)
                added = np.clip(srgb(linear(under) * np.maximum(ratio, 1.0)) - under, 0.0, 1.0)
                add(reflection_name, *light(added, a[..., 0] > 0.999), "lddg")
            for o, look, opacity, over in zip(objs, looks, opacities, above):
                # Under the parts above it, where they cover the pixel whole, the part goes on a little
                # way past its own edge (a part under another's edge has none of its own there).
                keys = ["colour", "shade", "highlights", "glow", "whole", "shown"]
                carried = carry_in([opacity] + [look[k] for k in keys], opacity > 1e-3, over < 1e-3)
                look = dict(look, **dict(zip(keys, carried[1:])))
                add_part(o, look, carried[0])

        # The panel's shadow under what stays put, then what stays put, bottom up.
        if still:
            add_group(still, "", render(still, catchers=[panel]), holdout=[panel], unseen=[])
        # Each moving group: its shadow on the panel and on what stays put, then its parts, lit by
        # what stays put without being seen with it.
        for group in ("turns", "moves", "off", "pressed"):
            objs = order(groups.get(group, []))
            if objs:
                add_group(objs, f"{objs[0].name} ", render(objs, catchers=[panel] + still), holdout=[panel], unseen=still)
        # Where turning parts turn about.
        if groups.get("turns"):
            from bpy_extras.object_utils import world_to_camera_view
            centre = plan["pivot"].matrix_world.translation if plan["pivot"] else order(groups["turns"])[0].matrix_world.translation
            v = world_to_camera_view(temp, cam, centre)
            px, py = int(round(v.x * width)), int(round((1 - v.y) * height))
            dot = np.zeros((height, width), dtype=np.float32)
            dot[max(0, py - 1):py + 1, max(0, px - 1):px + 1] = 1.0
            add("pivot", black + 1.0, dot, hidden=True)
        write_psd(filepath, width, height, layers, merged)
        return {"width": width, "height": height, "layers": [(l["name"], l["blend"]) for l in layers], "renders": count[0],
                "notes": plan["notes"], "merged": merged, "pixels": {l["name"]: l["rgba"] for l in layers}}
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

    def execute(self, context):
        try:
            result = export_layers(context.scene, self.filepath, self.size, self.samples, report=lambda m: None)
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
