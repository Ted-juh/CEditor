# Checks the CEditor Layers add-on in Blender, headless:
#
#   blender -b --factory-startup --python tools/blender/test_ceditor_layers.py -- [out-dir] [--fixture]
#
# Builds a knob (a panel, a skirt, a metal cap, a pointer, a lamp beside it, a sun), writes it with the add-on, renders
# Blender's own image of the same knob, and checks that the layers stacked as CEditor stacks them
# give that image back, on its own and on a panel; that the pointer, its shadow and its reflection
# are the layers that turn; that the image is the right way up; and that the pivot is on the knob's
# axis. --fixture writes the small file CE/web/test/fixtures/blender-knob.psd that
# the web suite imports (test/blenderLayersImport.test.js). Needs a Blender with numpy (blender.org's
# builds have it). Exits 1 on a failure.

import base64
import importlib.util
import json
import math
import os
import re
import sys
import tempfile

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ceditor_layers", os.path.join(HERE, "ceditor_layers.py"))
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)
np = addon.np

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FIXTURE = "--fixture" in args
args = [a for a in args if a != "--fixture"]
OUT = args[0] if args else tempfile.mkdtemp(prefix="ceditor-layers-test-")
os.makedirs(OUT, exist_ok=True)
failures = []


def check(ok, message):
    print(("PASS  " if ok else "FAIL  ") + message)
    if not ok:
        failures.append(message)


def material(name, colour, metallic=0.0, roughness=0.5, glow=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    if glow:
        b.inputs["Emission Color" if "Emission Color" in b.inputs else "Emission"].default_value = (*glow, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def knob_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    bpy.context.object.name = "panel"
    bpy.context.object.data.materials.append(material("panel", (0.18, 0.18, 0.2), roughness=0.7))
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=0.15, location=(0, 0, 0.075))
    bpy.context.object.name = "skirt"
    # Light grey: its outline against a dark panel is where mixing in sRGB and in linear light differ.
    bpy.context.object.data.materials.append(material("skirt", (0.55, 0.55, 0.52), roughness=0.4))
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.72, depth=0.5, location=(0, 0, 0.4))
    bpy.context.object.name = "cap"
    bpy.context.object.data.materials.append(material("cap", (0.8, 0.8, 0.82), metallic=1.0, roughness=0.32))
    bpy.ops.object.shade_smooth()
    # A rounded pointer, orange and a little glossy: its light changes as it turns (the side towards
    # the sun lit, the sun's glint on it), as a flat-topped white one's hardly does.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.5, location=(0, 0.36, 0.71))
    pointer = bpy.context.object
    pointer.name = "pointer"
    pointer.scale = (0.07, 0.36, 0.12)
    pointer.data.materials.append(material("pointer", (0.8, 0.28, 0.06), roughness=0.35))
    bpy.ops.object.shade_smooth()
    # The pointer turns about the knob's axis: its origin there.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    pointer.data.transform(__import__("mathutils").Matrix.Translation((0, 0.36, 0)))
    pointer.location = (0, 0, 0.71)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.11, depth=0.06, location=(1.0, -1.0, 0.03))
    bpy.context.object.name = "lamp"
    bpy.context.object.data.materials.append(material("lamp", (0.3, 0.03, 0.02), roughness=0.3, glow=(1, 0.06, 0.03), strength=5))
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 5), rotation=(math.radians(35), math.radians(-25), 0))
    bpy.context.object.data.energy = 3.5
    bpy.context.object.data.angle = math.radians(6)
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.36, 0.4, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    bpy.ops.object.camera_add(location=(0, 0, 10))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.6
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = 100
    return scene


def reference(scene, size, samples, tag="caught", catcher=True):
    """Blender's own image of the knob: over a transparent panel that catches its shadow (`catcher`),
    or on its panel as the scene shows it."""
    scene.objects["panel"].is_shadow_catcher = catcher
    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x = r.resolution_y = size
    r.film_transparent = catcher
    r.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    r.image_settings.color_depth = "32"
    r.image_settings.exr_codec = "NONE"
    scene.view_settings.view_transform = "Standard"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    r.filepath = os.path.join(OUT, f"{tag}-")
    bpy.ops.render.render(write_still=True)
    name = sorted(f for f in os.listdir(OUT) if f.startswith(f"{tag}-"))[-1]
    combined = addon.passes_of(addon.read_exr(os.path.join(OUT, name)), scene.view_layers[0].name)["Combined"]
    scene.objects["panel"].is_shadow_catcher = False
    return combined


AT_ANGLE = re.compile(r"^(.*) at (-?\d+(?:\.\d+)?)$")


def parts_of(layers):
    """The layers as CEditor's import makes them: each set "<name> at <angle>" one part of frames,
    [(name, blend, None or [(angle, layer name), ...])]."""
    out, sets = [], {}
    for name, blend in layers:
        at = AT_ANGLE.match(name)
        if not at:
            out.append((name, blend, None))
            continue
        if at.group(1) not in sets:
            sets[at.group(1)] = []
            out.append((at.group(1), blend, sets[at.group(1)]))
        sets[at.group(1)].append((float(at.group(2)), name))
    return out


def frame_at(frames, pixels, turn):
    """What a part of frames shows with the knob turned `turn` degrees (straight RGBA, at rest): the
    two frames either side, mixed by how near each is; an angle with no layer, nothing."""
    total = None
    angles = sorted(angle for angle, _ in frames)
    step = min(b - a for a, b in zip(angles, angles[1:]))
    for angle, name in frames:
        weight = max(0.0, 1.0 - abs(turn - angle) / step)
        if weight:
            p = pixels[name] / 255.0
            p = np.concatenate([p[..., :3] * p[..., 3:4], p[..., 3:4]], axis=-1) * weight
            total = p if total is None else total + p
    if total is None:
        return None
    a = total[..., 3:4]
    return np.concatenate([np.where(a > 0, total[..., :3] / np.maximum(a, 1e-6), 0.0), a], axis=-1)


def drawn(layers, pixels, turn=0.0, at_rest_only=False):
    """The parts CEditor draws with the knob turned `turn` degrees, before they turn: (name, blend, RGBA).
    `at_rest_only`: each part of frames only as it is at rest, as before the add-on rendered them at
    every angle."""
    for name, blend, frames in parts_of(layers):
        # A pivot is a mark, and a part's lighting and gloss hidden layers the import reads: none is drawn.
        if addon.role_of(name) == "pivot" or name.endswith((" lighting", " gloss")):
            continue
        rgba = pixels[name] / 255.0 if frames is None else frame_at(frames, pixels, 0.0 if at_rest_only else turn)
        if rgba is not None:
            yield name, blend, rgba


LINEAR = set()  # the layers the file names for CEditor to mix their edge for the panel under them


def stacked(layers, pixels, under, turn=0.0, pivots=None, at_rest_only=False, mixed_edges=True):
    """The layers laid onto `under` (straight RGB, opaque) as CEditor lays them, straight onto the
    panel; with the turning ones turned `turn` degrees clockwise about their pivots (`pivots`: a
    part's own, by name, or "pivot"). A layer the file names for it has its edge mixed for what is
    under it, as CEditor mixes it (utils/linearEdges.js); without `mixed_edges`, mixed in sRGB, as
    any picture's."""
    out = np.concatenate([under, np.ones_like(under[..., :1])], axis=-1).astype(np.float32)
    for name, blend, rgba in drawn(layers, pixels, turn, at_rest_only):
        if turn and addon.role_of(name) == "turns":
            rgba = addon.turned(rgba, turn, pivots.get(name, pivots["pivot"]))
        if mixed_edges and name in LINEAR:
            a = rgba[..., 3]
            partial = (a > 0) & (a < 1)
            rgba = rgba.copy()
            rgba[..., 3] = np.where(partial, addon.edge_opacity(rgba[..., :3], a, out[..., :3]), a)
        out = addon.blend_over(out, rgba, blend)
    return out[..., :3]


turned = addon.turned


def grown_by(mask, steps):
    for _ in range(steps):
        mask = np.pad(mask, 1)[2:, 1:-1] | np.pad(mask, 1)[:-2, 1:-1] | np.pad(mask, 1)[1:-1, 2:] | np.pad(mask, 1)[1:-1, :-2] | mask
    return mask


def dot_centre(rgba):
    ys, xs = np.nonzero(rgba[..., 3])
    return float(xs.mean() + 0.5), float(ys.mean() + 0.5)


scene = knob_scene()
# CEDITOR_LAYERS_SIZE and CEDITOR_LAYERS_SAMPLES make a quick run while working on it; the checks are
# for the sizes below.
SIZE = int(os.environ.get("CEDITOR_LAYERS_SIZE", 96 if FIXTURE else 160))
SAMPLES = int(os.environ.get("CEDITOR_LAYERS_SAMPLES", 96))
psd = os.path.join(OUT, "blender-knob.psd")
result = addon.export_layers(scene, psd, size=SIZE, samples=SAMPLES)
names = [name for name, _ in result["layers"]]
blends = dict(result["layers"])
LINEAR.update(result["linear_edges"])
print("layers:", ", ".join(f"{n} ({b.strip()})" for n, b in result["layers"]), f"- {result['renders']} renders")

check(os.path.getsize(psd) > 1000, f"the PSD is written ({os.path.getsize(psd)} bytes)")
check(names[0] == "shadow", "the knob's shadow on the panel is the bottom layer")
for part in ("skirt", "cap"):
    check(part in names, f"{part}: its colour is a layer")
check(blends.get("cap shading") == "mul ", "the cap's shading multiplies its colour")
check(blends.get("cap highlights") == "lddg", "the metal cap's reflections add")
hidden_layers = set(result["hidden"])
check(all(f"{part} {what}" in hidden_layers and blends[f"{part} {what}"] == "norm" for part in ("skirt", "cap", "lens") for what in ("lighting", "gloss"))
      and {"pointer lighting at 0", "pointer gloss at 0"} <= hidden_layers,
      "each colour layer has the light on it and its gloss beside it, hidden, at each angle for the pointer")
groups = dict(result["colour_of"])
check({"skirt highlights": "skirt", "cap highlights": "cap", "lens highlights": "lens", "pointer reflection": "cap"}.items() <= groups.items()
      and groups.get("skirt shading", "skirt") == "skirt" and groups.get("cap shading", "cap") == "cap",
      f"each part's shading and highlights go with its colour layer, and the pointer's reflection with the metal cap: {result['colour_of']}")
check(result["metal"] == ["cap"], f"the cap is the metal part: {result['metal']}")
frames = {name: list_ for name, _, list_ in parts_of(result["layers"]) if list_}
first = lambda base: names.index(frames[base][0][1])
check("pointer shadow" in frames and first("pointer shadow") < first("pointer"), "the pointer's shadow is under the pointer")
check(names.index("cap") < first("pointer shadow"), "the pointer's shadow falls on the cap")
# Its light inside it, at each angle, where it has an inside: at the fixture's 96 pixels the pointer
# is five wide, all edge, its whole look in its colour frames.
inside_sets = (("pointer shading", "mul "), ("pointer highlights", "lddg")) if SIZE >= 128 else ()
for base, blend in (("pointer", "norm"), ("pointer shadow", "norm"), ("pointer reflection", "lddg")) + inside_sets:
    angles = [angle for angle, _ in frames.get(base, [])]
    every = addon.turn_angles(result["turn_step"])
    check(len(angles) >= len(every) - 2 and set(angles) <= set(every) and all(blends[n] == blend for _, n in frames[base]),
          f"{base}: rendered every {result['turn_step']:g} degrees the pointer turns, {len(angles)} layers ({blend.strip()})")
check(sorted(result["linear_edges"]) == ["cap", "lens", "skirt"],
      f"the parts that stay put are named in the file, for CEditor to mix their edge for the panel: {result['linear_edges']}")
check("lens" in names and addon.role_of("lens") == "", "the lamp's body is there whether it is lit or not")
check(blends.get("lamp lit") == "lddg" and addon.role_of("lamp lit") == "on", "the lamp's glow adds, a layer of its own")
check(addon.role_of("lamp glow") == "on", "the lamp's light on the panel is shown with the lamp lit")
check(addon.role_of("bounce") == "", "the light the metal cap throws on the panel stays")
moving = [n for n in names if addon.role_of(n) == "turns"]
check(sorted(moving) == sorted(n for n in names if n.startswith("pointer") and not n.endswith("pivot")), f"what turns is the pointer's layers: {moving}")
check(all(addon.role_of(n) in ("", "pivot") for n in names if not n.startswith("pointer") and not n.startswith("lamp ")), "everything else stays put")

# The right way up: the pointer was modelled pointing up, and turns about the middle of the image.
ys, xs = np.nonzero(result["pixels"]["pointer at 0"][..., 3])
check(ys.mean() < SIZE * 0.4 and abs(xs.mean() - SIZE / 2) < 1.5, f"the pointer points up, as it was modelled (its middle at {xs.mean():.1f}, {ys.mean():.1f})")
pivots = {"pivot": dot_centre(result["pixels"]["pivot"]), "pointer shadow": dot_centre(result["pixels"]["pointer shadow pivot"])}
check(abs(pivots["pivot"][0] - SIZE / 2) < 1 and abs(pivots["pivot"][1] - SIZE / 2) < 1, f"the pivot is on the knob's axis {pivots['pivot']}")
# The pointer's shadow turns about a point of its own: half its reach from the axis, towards where it
# falls (the sun's slant over the pointer's height), so it stays on the side away from the sun.
px = SIZE / 2.6  # pixels to a metre
reach = addon.shadow_reach(scene, [scene.objects["pointer"]])
expected = (SIZE / 2 + reach.x / 2 * px, SIZE / 2 - reach.y / 2 * px)
check(math.dist(pivots["pointer shadow"], expected) < 1,
      f"the pointer's shadow turns about its own point, half its reach from the axis: {pivots['pointer shadow']}, {expected}")

merged = result["merged"]
ref = reference(scene, SIZE, SAMPLES)
check(ref.shape == merged.shape, f"the reference is the same size ({ref.shape[1]} x {ref.shape[0]})")
a_ref, a_mix = ref[..., 3], merged[..., 3]

# The knob itself: its colours, light, reflections and the pointer's shadow, edges between the parts
# included, as Cycles renders them.
solid = (a_ref > 0.999) & (a_mix > 0.999)
ref8 = np.round(addon.srgb(ref[..., :3] / np.maximum(a_ref[..., None], 1e-6)) * 255)
# As CEditor draws it (on any panel: these pixels the knob covers whole), its parts' edges where they
# meet mixed as CEditor mixes them.
mix8 = np.round(stacked(result["layers"], result["pixels"], result["panel"]) * 255)
diff = np.abs(ref8 - mix8).max(-1)[solid]
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.savez(os.path.join(OUT, "knob.npz"), ref8=ref8, mix8=mix8, solid=solid)
check(solid.sum() > SIZE * SIZE * 0.3, f"the knob covers {int(solid.sum())} pixels to compare")
mean, p99 = float(diff.mean()), float(np.percentile(diff, 99))
check(mean < 1 and p99 < 4, f"the layers give Blender's render of the knob back: mean {mean:.2f}, 99th percentile {p99:.1f} of 255 levels")

# On the panel it was modelled on, as CEditor lays the layers, straight onto the panel: Blender's whole
# render, the outline mixed as Cycles mixes it, the shadow, the lamp lit and its light on the panel.
bare = result["panel"]
full = reference(scene, SIZE, SAMPLES, "onpanel", catcher=False)
want = np.round(addon.srgb(full[..., :3]) * 255)
got = np.round(result["on_panel"][..., :3] * 255)
laid = np.abs(np.round(stacked(result["layers"], result["pixels"], bare) * 255) - got).max()
check(laid <= 1, f"the layers laid onto the panel are the picture the export made of them (within {laid:.0f} level)")
d = np.abs(want - got).max(-1)
yy, xx = np.mgrid[0:SIZE, 0:SIZE]
lamp = np.hypot(yy + 0.5 - SIZE / 2 - px, xx + 0.5 - SIZE / 2 - px) < 0.11 * px + 4
mean, p99 = float(d.mean()), float(np.percentile(d, 99))
check(mean < 1 and p99 < 6, f"on its own panel the layers give Blender's whole render back: mean {mean:.2f}, 99th percentile {p99:.1f}, at most {d.max():.0f}")
check(float(np.percentile(d[lamp], 95)) < 8, f"and the lit lamp and its light on the panel: 95th percentile {np.percentile(d[lamp], 95):.1f}")
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.save(os.path.join(OUT, "full.npy"), full); np.save(os.path.join(OUT, "on_panel.npy"), result["on_panel"]); np.save(os.path.join(OUT, "bare.npy"), bare)

# On panels of other colours, as Blender renders the knob on them: the layers laid onto each panel as
# it renders with nothing on it. The light on the panel (the cap's glare, the lamp's) brightens it in
# proportion, as light on a surface does; laid on as light made for the scene's panel, added (as the
# add-on wrote it before), it is too bright on a dark panel and too faint on a light one. The outline,
# which CEditor mixes for the panel, is held on its own.
outline = np.abs(np.hypot(yy + 0.5 - SIZE / 2, xx + 0.5 - SIZE / 2) - px) < 1.5
outline |= np.abs(np.hypot(yy + 0.5 - SIZE / 2 - px, xx + 0.5 - SIZE / 2 - px) - 0.11 * px) < 1.5
on_panel_light = np.zeros((SIZE, SIZE), dtype=bool)
for name in ("bounce", "lamp glow"):
    on_panel_light |= result["pixels"][name][..., 3] > 0
check(blends.get("bounce") == "div " and blends.get("lamp glow") == "div ", "the light on the panel brightens it in proportion (colour dodge)")


def as_added(layers, pixels):
    """The light on the panel as the add-on wrote it before: made for the scene's panel, and added."""
    pixels = dict(pixels)
    under = bare
    for name in ("bounce", "lamp glow"):
        s_, a_ = pixels[name][..., :3] / 255.0, pixels[name][..., 3:4] / 255.0
        multiple = 1.0 + a_ * s_ / np.maximum(1.0 - s_, 1e-6)
        added = np.clip(under * (multiple - 1.0), 0.0, 1.0)
        pixels[name] = addon.rgba8(added, (added.max(-1) > 0).astype(np.float32))
        under = np.clip(under * multiple, 0.0, 1.0)
    return [(n, "lddg" if n in ("bounce", "lamp glow") else b) for n, b in layers], pixels


panel_colour = scene.objects["panel"].data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Base Color"]
as_modelled = tuple(panel_colour.default_value)
others = [o for o in scene.objects if o.type == "MESH" and o.name != "panel"]
tones = {}
for tone, colour in (("dark", (0.025, 0.025, 0.03)), ("light", (0.62, 0.62, 0.6)), ("red", (0.45, 0.05, 0.035))):
    panel_colour.default_value = (*colour, 1)
    for o in others:
        o.hide_render = True
    bare_tone = addon.srgb(reference(scene, SIZE, SAMPLES, f"bare-{tone}", catcher=False)[..., :3])
    for o in others:
        o.hide_render = False
    want = np.round(addon.srgb(reference(scene, SIZE, SAMPLES, f"full-{tone}", catcher=False)[..., :3]) * 255)
    d = np.abs(want - np.round(stacked(result["layers"], result["pixels"], bare_tone) * 255)).max(-1)
    before = np.abs(want - np.round(stacked(*as_added(result["layers"], result["pixels"]), bare_tone) * 255)).max(-1)
    away = ~outline
    lit = on_panel_light & away
    srgb_edges = np.abs(want - np.round(stacked(result["layers"], result["pixels"], bare_tone, mixed_edges=False) * 255)).max(-1)
    tones[tone] = (d, srgb_edges)
    if os.environ.get("CEDITOR_LAYERS_DEBUG"):
        np.savez(os.path.join(OUT, f"tone-{tone}.npz"), want=want, got=np.round(stacked(result["layers"], result["pixels"], bare_tone) * 255),
                 bare=bare_tone, lit=lit, before=np.round(stacked(*as_added(result["layers"], result["pixels"]), bare_tone) * 255))
    check(float(d[away].mean()) < 1.6 and float(np.percentile(d[away], 99)) < 8,
          f"on a {tone} panel, the knob, its shadow and the light on the panel as Blender renders them: mean {d[away].mean():.2f}, "
          f"99th percentile {np.percentile(d[away], 99):.1f}")
    check(float(np.percentile(d[lit], 99)) <= max(4.0, 0.6 * float(np.percentile(before[lit], 99))),
          f"and the light on it: 99th percentile {np.percentile(d[lit], 99):.0f} levels, {np.percentile(before[lit], 99):.0f} made for the scene's panel and added")
panel_colour.default_value = as_modelled
# The knob's outline, where the skirt covers some of a pixel: CEditor mixes it for the panel under it,
# as Cycles does, in linear light; mixed in sRGB, as any picture's is, a pale skirt's edge on a dark
# panel is too dark and on a light one too light. (The lit lamp's edge is made for the scene's panel.)
skirt_edge = (result["pixels"]["skirt"][..., 3] > 0) & (result["pixels"]["skirt"][..., 3] < 255)
for tone, (d, srgb_edges) in tones.items():
    mixed_mean, srgb_mean = float(d[skirt_edge].mean()), float(srgb_edges[skirt_edge].mean())
    # Never further off than mixed in sRGB, and much nearer where the skirt and the panel differ.
    check(mixed_mean <= srgb_mean and (mixed_mean < 0.6 * srgb_mean or srgb_mean < 6),
          f"on a {tone} panel the knob's outline is mixed for it: mean {d[skirt_edge].mean():.1f}, 99th percentile "
          f"{np.percentile(d[skirt_edge], 99):.0f} levels, {srgb_edges[skirt_edge].mean():.1f} and {np.percentile(srgb_edges[skirt_edge], 99):.0f} mixed in sRGB")

# A part's colour changed, as CEditor changes it (utils/pictureRecolour.js): from the light on it and
# its gloss, written beside its colour layer, its colour, shading and highlights layers worked out
# again in the new colour, in linear light, as the add-on works them out; a turning part's reflection
# in a metal changed with the metal's colour, in proportion. Against Blender rendering the knob with
# that part's material in the new colour.
def decoded(code):
    code = code.astype(np.float32)
    return np.where(code > 0, np.power(2.0, code * 16.0 / 255.0 - 8.0), 0.0)


def in_colour(pixels, name, colour, was, with_light=True):
    """`pixels` with `name` in the colour the material `colour` (linear) gives its colour layer, where
    `was` gave it the colour it was drawn in (Blender's diffuse colour is a few percent under the base
    colour), picked as an 8-bit colour; and the layers that go with it. `with_light` False: the colour
    layer changed in proportion instead, and its light layers left as rendered (what CEditor does for
    a picture with no light written beside it)."""
    out = dict(pixels)
    layer = pixels[name]
    a = layer[..., 3]
    inside = a >= int(a.max()) - 2
    drawn = np.array([np.sort(layer[..., c][inside])[int(inside.sum()) // 2] for c in range(3)], dtype=np.float32)
    albedo = addon.linear(drawn / 255.0) / np.maximum(np.asarray(was[:3], dtype=np.float32), 1e-6)
    picked = np.round(addon.srgb(np.asarray(colour, dtype=np.float32) * albedo) * 255)
    covered = a > 0
    members = {light: colour_name for light, colour_name in result["colour_of"] if colour_name == name}
    followers = [light for light in members if not light.endswith(("shading", "highlights"))]

    def in_proportion(rgba):
        rgb = rgba[..., :3].astype(np.float32)
        share = np.where(drawn >= 8, rgb / np.maximum(drawn, 1e-6), 1.0)
        rgb = np.clip(np.round(rgb + (picked - drawn) * share), 0, 255)
        return np.concatenate([rgb, rgba[..., 3:4]], axis=-1).astype(np.uint8)

    for base in followers:
        for light in [n for n in pixels if n == base or n.startswith(f"{base} at ")]:
            out[light] = in_proportion(pixels[light])
    if not with_light:
        out[name] = in_proportion(layer)
        return out, drawn
    shading = pixels.get(next((n for n in members if n.endswith("shading")), ""))
    highlights = pixels.get(next((n for n in members if n.endswith("highlights")), ""))
    s_alpha = (shading[..., 3:4] / 255.0) if shading is not None else 0.0
    h_alpha = (highlights[..., 3:4] / 255.0) if highlights is not None else np.zeros_like(a[..., None], dtype=np.float32)
    ref = addon.linear(drawn / 255.0)
    new = addon.linear(picked / 255.0)
    own = np.where(h_alpha >= 1.0, addon.linear(layer[..., :3] / 255.0), ref)
    c = np.where(ref > 1e-4, own * new / np.maximum(ref, 1e-4), new)
    lit = c * decoded(pixels[f"{name} lighting"][..., :3])
    total = lit + decoded(pixels[f"{name} gloss"][..., :3])
    e = addon.srgb(c)
    shade = np.where(e > 1e-4, np.clip(addon.srgb_beyond(lit) / np.maximum(e, 1e-4), 0.0, 1.0), 1.0)
    beyond = addon.srgb_beyond(total) if name in result["metal"] else addon.srgb(total)
    shine = np.clip(beyond - e * shade, 0.0, 1.0)
    colour_now = np.clip((addon.srgb(total) - h_alpha * shine) / np.maximum(1.0 - s_alpha + s_alpha * shade, 1e-4), 0.0, 1.0)
    keep = lambda new_rgb, old: np.where(covered[..., None] & (old[..., 3:4] > 0), np.concatenate([addon.to8(new_rgb), old[..., 3:4]], axis=-1), old)
    out[name] = keep(colour_now, layer)
    for member, picture in ((n, pixels[n]) for n in members if n.endswith(("shading", "highlights")) and n in pixels):
        out[member] = keep(shade if member.endswith("shading") else shine, picture)
    return out, drawn


def material_colour(name):
    return scene.objects[name].data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Base Color"]


recoloured_references = {}
for part, colour in (("skirt", (0.42, 0.02, 0.018)), ("cap", (0.62, 0.36, 0.06))):
    socket = material_colour(part)
    was = tuple(socket.default_value)
    socket.default_value = (*colour, 1)
    want = np.round(addon.srgb(reference(scene, SIZE, SAMPLES, f"recoloured-{part}", catcher=False)[..., :3]) * 255)
    socket.default_value = was
    pixels_now, drawn_colour = in_colour(result["pixels"], part, colour, was)
    albedo = addon.linear(drawn_colour / 255.0) / np.maximum(np.asarray(was[:3], dtype=np.float32), 1e-6)
    picked = np.round(addon.srgb(np.asarray(colour, dtype=np.float32) * albedo) * 255).astype(int)
    # For the web suite (test/blenderLayersImport.test.js): Blender's render, and the colour picked.
    recoloured_references[part] = {"colour": "FF" + "".join(f"{v:02X}" for v in picked),
                                   "rgb": base64.b64encode(np.ascontiguousarray(want.astype(np.uint8)).tobytes()).decode("ascii")}
    as_drawn = np.round(addon.srgb(np.asarray(was[:3], dtype=np.float32)) * 255)
    check(np.abs(drawn_colour - as_drawn).max() <= 3, f"{part}: the colour it was drawn in is its material's, {drawn_colour} against {as_drawn}")
    # Worked out again in the colour it was drawn in, it is the picture as written.
    same = np.abs(np.round(stacked(result["layers"], in_colour(result["pixels"], part, was[:3], was)[0], bare) * 255)
                  - np.round(stacked(result["layers"], result["pixels"], bare) * 255)).max(-1)
    # On the part itself, where it shows, the parts over it left out: where it covers the pixel whole
    # (its light layers over it), and at its edge.
    own = result["pixels"][part][..., 3] > 0
    for other in ("cap", "pointer at 0", "pointer shadow at 0") if part == "skirt" else ("pointer at 0", "pointer shadow at 0"):
        own &= ~grown_by(result["pixels"][other][..., 3] > 0, 1)
    body = own & (result["pixels"][f"{part} highlights"][..., 3] > 0)
    edge = own & ~body
    # Just outside it, where nothing of it is drawn: the light it throws on what is beside it (the
    # panel by the skirt, the skirt by the cap), which Blender lights in the new colour and the layers
    # keep as rendered.
    beside = grown_by(result["pixels"][part][..., 3] > 0, 3) & ~(result["pixels"][part][..., 3] > 0)
    for other in ("pointer at 0", "pointer shadow at 0"):
        beside &= ~grown_by(result["pixels"][other][..., 3] > 0, 2)
    if part == "cap":
        beside &= result["pixels"]["skirt"][..., 3] == 255
    got = np.round(stacked(result["layers"], pixels_now, bare) * 255)
    d = np.abs(want - got).max(-1)
    plain = np.abs(want - np.round(stacked(result["layers"], in_colour(result["pixels"], part, colour, was, with_light=False)[0], bare) * 255)).max(-1)
    if os.environ.get("CEDITOR_LAYERS_DEBUG"):
        np.savez(os.path.join(OUT, f"recoloured-{part}.npz"), want=want, got=got, own=own)
    print(f"  {part} in a new colour: where it covers the pixel mean {d[body].mean():.2f}, p99 {np.percentile(d[body], 99):.1f}; "
          f"its edge {d[edge].mean():.2f}; beside it {d[beside].mean():.2f}; in proportion, its light as rendered: {plain[body].mean():.2f}, "
          f"p99 {np.percentile(plain[body], 99):.1f}; as drawn again: at most {same.max():.0f}")
    check(float(same.max()) <= 3, f"{part}, worked out again in its own colour, is the picture as written: at most {same.max():.0f} levels")
    check(float(d[body].mean()) < 2 and float(np.percentile(d[body], 99)) < 6,
          f"{part} in a new colour is Blender's render of it: mean {d[body].mean():.2f}, 99th percentile {np.percentile(d[body], 99):.1f} levels where "
          f"it covers the pixel, glint and all (changed in proportion with its light as rendered, {plain[body].mean():.2f} and {np.percentile(plain[body], 99):.1f})")
    # Its edge is partly what is beside it, lit by it in its old colour: no further off than that.
    check(float(d[edge].mean()) <= float(d[beside].mean()) + 2,
          f"and its edge within what it throws on what is beside it: mean {d[edge].mean():.2f} levels, {d[beside].mean():.2f} just beside it")

# Drawn larger, as CEditor draws a component at any size and on a screen of two pixels to the point:
# the browser scales each layer before it blends them, and the layers must still add up to the
# picture scaled. A layer that changed how it holds a pixel from one pixel to the next (its look in
# its colour layer at a part's edge, colour times light inside) showed it as a light ring there.
def larger(rgba):
    """`rgba` (straight, 0..1) twice the size, as a browser scales a picture: bilinear, premultiplied."""
    p = rgba.astype(np.float32).copy()
    p[..., :3] *= p[..., 3:4]
    for axis in (0, 1):
        n = p.shape[axis]
        u = (np.arange(2 * n) + 0.5) / 2 - 0.5
        i0 = np.floor(u).astype(int)
        t = (u - i0).reshape([-1 if k == axis else 1 for k in range(3)])
        p = np.take(p, np.clip(i0, 0, n - 1), axis) * (1 - t) + np.take(p, np.clip(i0 + 1, 0, n - 1), axis) * t
    a = p[..., 3:4]
    return np.concatenate([np.where(a > 0, p[..., :3] / np.maximum(a, 1e-6), 0.0), a], axis=-1)


opaque = lambda rgb: np.concatenate([rgb, np.ones_like(rgb[..., :1])], axis=-1)
scaled = larger(opaque(bare))
under_1x = opaque(bare)
for name, blend, rgba in drawn(result["layers"], result["pixels"]):
    if name in LINEAR:  # CEditor mixes the edge at the picture's own size; the browser then scales it
        a = rgba[..., 3]
        rgba = rgba.copy()
        rgba[..., 3] = np.where((a > 0) & (a < 1), addon.edge_opacity(rgba[..., :3], a, under_1x[..., :3]), a)
    under_1x = addon.blend_over(under_1x, rgba, blend)
    scaled = addon.blend_over(scaled, larger(rgba), blend)
picture = larger(opaque(result["on_panel"][..., :3]))
d = np.abs(np.round(scaled[..., :3] * 255) - np.round(picture[..., :3] * 255)).max(-1)
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.save(os.path.join(OUT, "scaled.npy"), d)
    np.savez(os.path.join(OUT, "pixels.npz"), **result["pixels"])
# Where two layers both fade across the same pixels (the skirt's outline over its shadow, the pointer's
# over its own), scaling each and then laying one over the other is not quite scaling the two laid
# together: a few levels, as for any picture with a drop shadow.
check(float(np.percentile(d, 99.9)) < 14 and d.max() < 24, f"drawn twice the size, the layers still add up to the picture: 99.9th percentile {np.percentile(d, 99.9):.1f}, at most {d.max():.0f} levels")

# Turned: where Blender casts the pointer's shadow with the pointer turned, against the shadow layer
# turned as CEditor turns it. Turned about the axis, the shadow swings round with the pointer, and at
# half a turn falls on the side towards the sun; about its own point it stays on the side away.
TURN = 120
pointer = scene.objects["pointer"]
pointer.rotation_euler.z = math.radians(-TURN)  # clockwise on screen, seen from above
catchers = [o.name for o in scene.objects if o.type == "MESH" and o.name != "pointer"]  # only the pointer casts
for name in catchers:
    scene.objects[name].is_shadow_catcher = True
scene.view_layers[0].cycles.use_pass_shadow_catcher = True
scene.render.film_transparent = True
scene.render.filepath = os.path.join(OUT, "cast-")
bpy.ops.render.render(write_still=True)
cast = addon.passes_of(addon.read_exr(os.path.join(OUT, sorted(f for f in os.listdir(OUT) if f.startswith("cast-"))[-1])),
                       scene.view_layers[0].name)["Shadow Catcher"]
for name in catchers:
    scene.objects[name].is_shadow_catcher = False
turned_full = np.round(addon.srgb(reference(scene, SIZE, SAMPLES, "turned", catcher=False)[..., :3]) * 255)
pointer.rotation_euler.z = 0.0
hidden = turned(result["pixels"]["pointer at 0"] / 255.0, TURN, pivots["pivot"])[..., 3] > 0.5


def centre_of(darkness):
    """Where a shadow is, weighted by its darkness, outside the pointer that hides some of it."""
    w = np.where(hidden, 0.0, darkness)
    w = np.where(w > 0.2 * w.max(), w, 0.0)
    return float((w * (xx + 0.5)).sum() / w.sum()), float((w * (yy + 0.5)).sum() / w.sum())


blender = centre_of(1.0 - addon.luma(np.clip(cast[..., :3], 0.0, 1.0)))
own = centre_of(turned(frame_at(frames["pointer shadow"], result["pixels"], TURN), TURN, pivots["pointer shadow"])[..., 3])
# As it was before the shadow had a point of its own: the one at rest, turned about the axis.
axis = centre_of(turned(frame_at(frames["pointer shadow"], result["pixels"], 0.0), TURN, pivots["pivot"])[..., 3])
check(math.dist(own, blender) < 2.5 and math.dist(axis, blender) > 2 * math.dist(own, blender),
      f"turned {TURN} degrees, the pointer's shadow falls where Blender casts it: {math.dist(own, blender):.1f} px off, "
      f"{math.dist(axis, blender):.1f} px turned about the axis")

# Round the turned pointer, on the cap: its own pixels and their edge left out (a sharp edge turned is
# resampled).
def grown(mask, steps):
    for _ in range(steps):
        mask = np.pad(mask, 1)[2:, 1:-1] | np.pad(mask, 1)[:-2, 1:-1] | np.pad(mask, 1)[1:-1, 2:] | np.pad(mask, 1)[1:-1, :-2] | mask
    return mask


on_it = turned(result["pixels"]["pointer at 0"] / 255.0, TURN, pivots["pivot"])[..., 3] > 0
inside = on_it & ~grown(~on_it, 2)
around = grown(on_it, int(round(0.12 * px))) & ~grown(on_it, 2)
ring = grown(on_it, int(round(0.06 * px))) & ~on_it
# The knob turned as CEditor turns it: its parts of frames each mixed from the two angles either side,
# against them as they are at rest, turned (as before the add-on rendered them at every angle).
diff = {}
for how, rest_only in (("angles", False), ("rest", True)):
    picture = np.round(stacked(result["layers"], result["pixels"], bare, TURN, pivots, at_rest_only=rest_only) * 255)
    diff[how] = np.abs(picture - turned_full).max(-1)
    if os.environ.get("CEDITOR_LAYERS_DEBUG"):
        np.save(os.path.join(OUT, f"turned_layers_{how}.npy"), picture)
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.save(os.path.join(OUT, "turned_full.npy"), turned_full)
stat = lambda how, where, q=None: float(diff[how][where].mean() if q is None else np.percentile(diff[how][where], q))
# The pointer's own light: the side towards the sun lit and the sun's glint on it, wherever it points.
# What is left is mostly the picture turned twice (back to rest here, on again in the browser), which
# softens the glint along an 8 pixel pointer: 4 levels of the mean on its own.
check(stat("angles", inside) < 0.4 * stat("rest", inside),
      f"and the turned pointer is lit as Blender lights it: mean {stat('angles', inside):.2f}, 99th percentile {stat('angles', inside, 99):.0f} levels, "
      f"{stat('rest', inside):.2f} and {stat('rest', inside, 99):.0f} with its light as it is at rest, turned")
# Its reflection in the metal cap (a bright streak where its end caught the sun at rest, and does not turned).
check(stat("angles", ring, 99) < 0.6 * stat("rest", ring, 99),
      f"and its reflection in the cap is where Blender shows it: 99th percentile {stat('angles', ring, 99):.0f} levels round the pointer, "
      f"{stat('rest', ring, 99):.0f} with the reflection rendered at rest and turned")
# The cap round it, its shadow on it included.
check(stat("angles", around) < 3 and stat("angles", around) <= stat("rest", around) + 0.05,
      f"and round the turned pointer the cap is Blender's to a mean {stat('angles', around):.2f} levels ({stat('rest', around):.2f} rendered at rest only)")

# The scene is left as it was: no scene, object or setting of the export's is left behind.
check([s.name for s in bpy.data.scenes] == [scene.name], "the export's own scene is gone")
check(all(not o.is_holdout and o.visible_camera and not o.hide_render for o in scene.objects if o.type == "MESH"),
      "every object renders as it did")

# File > Export, as a person runs it.
addon.register()
try:
    small = os.path.join(OUT, "operator.psd")
    check(bpy.ops.ceditor.export_layers(filepath=small, size=48, samples=8) == {"FINISHED"} and os.path.getsize(small) > 1000,
          "File > Export > CEditor Layers writes the file")
finally:
    addon.unregister()

# Without a panel or a camera of its own: one of each is put in while it renders, and taken out after.
for obj in (scene.objects["panel"], scene.camera):
    bpy.data.objects.remove(obj, do_unlink=True)
bare = addon.export_layers(scene, os.path.join(OUT, "bare.psd"), size=48, samples=8, report=lambda m: None)
bare_names = [n for n, _ in bare["layers"]]
check(any("No panel" in n for n in bare["notes"]) and any("camera" in n for n in bare["notes"]), "without a panel or a camera it says so")
check(bare_names[0] == "shadow" and "pointer at 0" in bare_names, f"and still writes the knob and its shadow: {', '.join(bare_names)}")
check(not any(o.name.startswith("CEditor") for o in bpy.data.objects), "and takes the panel and camera it put in out again")

if FIXTURE:
    target = os.path.normpath(os.path.join(HERE, "..", "..", "CE", "web", "test", "fixtures", "blender-knob.psd"))
    with open(psd, "rb") as src, open(target, "wb") as dst:
        dst.write(src.read())
    print("wrote", target)
    # Blender's renders of the knob with the skirt red and the cap brass, on its panel, and the colour
    # each colour layer is given: what CEditor's own recolour is held to.
    references = os.path.join(os.path.dirname(target), "blender-knob-recoloured.json")
    with open(references, "w") as out:
        json.dump({"width": SIZE, "height": SIZE, **recoloured_references}, out)
    print("wrote", references)

print(f"\n{'All passed' if not failures else f'{len(failures)} failed'} ({OUT})")
sys.exit(1 if failures else 0)
