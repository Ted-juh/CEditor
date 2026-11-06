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

import importlib.util
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
    bpy.context.object.data.materials.append(material("skirt", (0.05, 0.05, 0.055), roughness=0.4))
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.72, depth=0.5, location=(0, 0, 0.4))
    bpy.context.object.name = "cap"
    bpy.context.object.data.materials.append(material("cap", (0.8, 0.8, 0.82), metallic=1.0, roughness=0.32))
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.36, 0.71))
    pointer = bpy.context.object
    pointer.name = "pointer"
    pointer.scale = (0.07, 0.36, 0.12)
    pointer.data.materials.append(material("pointer", (0.95, 0.95, 0.9), roughness=0.5))
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


def shown(name, turn=0.0):
    """How much of a layer CEditor shows with the knob turned `turn` degrees: a turning part's
    reflection rendered at an angle ("... at 27") fades in from the angle a step before it and out by
    the one a step after, as the import wires it; every other layer whole."""
    at = re.search(r" at (-?\d+)$", name)
    return 1.0 if not at else max(0.0, 1.0 - abs(turn - int(at.group(1))) / addon.TURN_STEP)


def stacked(layers, pixels, under, turn=0.0, pivots=None, at_rest_only=False):
    """The layers laid onto `under` (straight RGB, opaque) as CEditor lays them, straight onto the
    panel; with the turning ones turned `turn` degrees clockwise about their pivots (`pivots`: a
    layer's own, by name, or "pivot"). `at_rest_only`: the reflection rendered at rest, turned, as
    it was before it was rendered at every angle."""
    out = np.concatenate([under, np.ones_like(under[..., :1])], axis=-1).astype(np.float32)
    for name, blend in layers:
        role = addon.role_of(name)
        weight = shown(name, 0.0 if at_rest_only else turn)
        if role == "pivot" or weight == 0:
            continue
        rgba = pixels[name] / 255.0
        rgba[..., 3] *= weight
        if turn and role == "turns":
            rgba = addon.turned(rgba, turn, pivots.get(name, pivots["pivot"]))
        out = addon.blend_over(out, rgba, blend)
    return out[..., :3]


turned = addon.turned


def dot_centre(rgba):
    ys, xs = np.nonzero(rgba[..., 3])
    return float(xs.mean() + 0.5), float(ys.mean() + 0.5)


scene = knob_scene()
SIZE = 96 if FIXTURE else 160
SAMPLES = 96
psd = os.path.join(OUT, "blender-knob.psd")
result = addon.export_layers(scene, psd, size=SIZE, samples=SAMPLES)
names = [name for name, _ in result["layers"]]
blends = dict(result["layers"])
print("layers:", ", ".join(f"{n} ({b.strip()})" for n, b in result["layers"]), f"- {result['renders']} renders")

check(os.path.getsize(psd) > 1000, f"the PSD is written ({os.path.getsize(psd)} bytes)")
check(names[0] == "shadow", "the knob's shadow on the panel is the bottom layer")
for part in ("skirt", "cap", "pointer"):
    check(part in names, f"{part}: its colour is a layer")
check(blends.get("cap shading") == "mul ", "the cap's shading multiplies its colour")
check(blends.get("cap highlights") == "lddg", "the metal cap's reflections add")
check("pointer shadow" in names and names.index("pointer shadow") < names.index("pointer"), "the pointer's shadow is under the pointer")
check(names.index("cap") < names.index("pointer shadow"), "the pointer's shadow falls on the cap")
reflections = [n for n in names if n.startswith("pointer reflection at ")]
check([int(n.rsplit(" ", 1)[1]) for n in reflections] == list(addon.TURN_ANGLES) and all(blends[n] == "lddg" for n in reflections),
      f"the pointer's reflection in the metal cap adds, rendered every {addon.TURN_STEP} degrees it turns: {len(reflections)} layers")
check("lens" in names and addon.role_of("lens") == "", "the lamp's body is there whether it is lit or not")
check(blends.get("lamp lit") == "lddg" and addon.role_of("lamp lit") == "on", "the lamp's glow adds, a layer of its own")
check(blends.get("lamp glow") == "lddg" and addon.role_of("lamp glow") == "on", "the lamp's light on the panel adds, shown with the lamp lit")
check(blends.get("bounce") == "lddg" and addon.role_of("bounce") == "", "the light the metal cap throws on the panel adds, and stays")
moving = [n for n in names if addon.role_of(n) == "turns"]
check(sorted(moving) == sorted(n for n in names if n.startswith("pointer") and not n.endswith("pivot")), f"what turns is the pointer's layers: {moving}")
check(all(addon.role_of(n) in ("", "pivot") for n in names if not n.startswith("pointer") and n not in ("lamp lit", "lamp glow")), "everything else stays put")

# The right way up: the pointer was modelled pointing up, and turns about the middle of the image.
ys, xs = np.nonzero(result["pixels"]["pointer"][..., 3])
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
mix8 = np.round(merged[..., :3] / np.maximum(a_mix[..., None], 1e-6) * 255)
diff = np.abs(ref8 - mix8).max(-1)[solid]
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

# On panels of other colours: the knob and its shadow, laid onto them as onto the scene's. The outline,
# the lit lamp's edge and the light on the panel are made for the scene's panel; they are left out.
outline = (np.abs(np.hypot(yy + 0.5 - SIZE / 2, xx + 0.5 - SIZE / 2) - px) < 1.5) | lamp
for name in ("bounce", "lamp glow"):
    outline |= result["pixels"][name][..., 3] > 0
for tone, panel in (("dark", 0.2), ("grey", 0.5), ("light", 0.8)):
    flat = np.full((SIZE, SIZE, 3), panel, dtype=np.float32)
    want = np.round(addon.srgb(ref[..., :3] + (1 - a_ref[..., None]) * addon.linear(np.float32(panel))) * 255)
    got = np.round(stacked(result["layers"], result["pixels"], flat) * 255)
    d = np.abs(want - got).max(-1)[~outline]
    mean, p99 = float(d.mean()), float(np.percentile(d, 99))
    check(mean < 1 and p99 < 8, f"on a {tone} panel, its shadow too, away from its outline and the lamp: mean {mean:.2f}, 99th percentile {p99:.1f}")

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
for name, blend in result["layers"]:
    if addon.role_of(name) != "pivot" and shown(name):
        scaled = addon.blend_over(scaled, larger(result["pixels"][name] / 255.0), blend)
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
hidden = turned(result["pixels"]["pointer"] / 255.0, TURN, pivots["pivot"])[..., 3] > 0.5


def centre_of(darkness):
    """Where a shadow is, weighted by its darkness, outside the pointer that hides some of it."""
    w = np.where(hidden, 0.0, darkness)
    w = np.where(w > 0.2 * w.max(), w, 0.0)
    return float((w * (xx + 0.5)).sum() / w.sum()), float((w * (yy + 0.5)).sum() / w.sum())


blender = centre_of(1.0 - addon.luma(np.clip(cast[..., :3], 0.0, 1.0)))
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.save(os.path.join(OUT, "cast.npy"), 1.0 - addon.luma(np.clip(cast[..., :3], 0.0, 1.0)))
    np.save(os.path.join(OUT, "own.npy"), turned(result["pixels"]["pointer shadow"] / 255.0, TURN, pivots["pointer shadow"])[..., 3])
    np.save(os.path.join(OUT, "hidden.npy"), hidden)
shadow = result["pixels"]["pointer shadow"] / 255.0
own = centre_of(turned(shadow, TURN, pivots["pointer shadow"])[..., 3])
axis = centre_of(turned(shadow, TURN, pivots["pivot"])[..., 3])
check(math.dist(own, blender) < 2.5 and math.dist(axis, blender) > 2 * math.dist(own, blender),
      f"turned {TURN} degrees, the pointer's shadow falls where Blender casts it: {math.dist(own, blender):.1f} px off about "
      f"its own point, {math.dist(axis, blender):.1f} px about the axis")

# Round the turned pointer, on the cap: its own pixels and their edge left out (a sharp edge turned is
# resampled).
def grown(mask, steps):
    for _ in range(steps):
        mask = np.pad(mask, 1)[2:, 1:-1] | np.pad(mask, 1)[:-2, 1:-1] | np.pad(mask, 1)[1:-1, 2:] | np.pad(mask, 1)[1:-1, :-2] | mask
    return mask


on_it = turned(result["pixels"]["pointer"] / 255.0, TURN, pivots["pivot"])[..., 3] > 0
around = grown(on_it, int(round(0.12 * px))) & ~grown(on_it, 2)
means = {}
for how, about in (("own", pivots), ("axis", {"pivot": pivots["pivot"]})):
    turned_layers = np.round(stacked(result["layers"], result["pixels"], bare, TURN, about) * 255)
    means[how] = float(np.abs(turned_layers - turned_full).max(-1)[around].mean())
    if how == "own" and os.environ.get("CEDITOR_LAYERS_DEBUG"):
        np.save(os.path.join(OUT, "turned_full.npy"), turned_full); np.save(os.path.join(OUT, "turned_layers.npy"), turned_layers)
# The pointer's reflection in the metal cap, round the pointer: rendered at angles a step apart and
# faded from one to the next, against the one rendered at rest and turned (a bright streak where the
# end of the pointer caught the sun at rest, and does not turned).
ring = grown(on_it, int(round(0.06 * px))) & ~on_it
worst = {}
for how, rest_only in (("angles", False), ("rest", True)):
    picture = np.round(stacked(result["layers"], result["pixels"], bare, TURN, pivots, at_rest_only=rest_only) * 255)
    worst[how] = float(np.percentile(np.abs(picture - turned_full).max(-1)[ring], 99))
check(worst["angles"] < 0.6 * worst["rest"],
      f"and the pointer's reflection in the cap is where Blender shows it: 99th percentile {worst['angles']:.0f} levels round the pointer, "
      f"{worst['rest']:.0f} with the reflection rendered at rest and turned")
check(means["own"] < 4 and means["own"] <= means["axis"] + 0.05,
      f"and round the turned pointer the cap is Blender's to a mean {means['own']:.2f} levels ({means['axis']:.2f} with the shadow turned about the axis)")

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
check(bare_names[0] == "shadow" and "pointer" in bare_names, f"and still writes the knob and its shadow: {', '.join(bare_names)}")
check(not any(o.name.startswith("CEditor") for o in bpy.data.objects), "and takes the panel and camera it put in out again")

if FIXTURE:
    target = os.path.normpath(os.path.join(HERE, "..", "..", "CE", "web", "test", "fixtures", "blender-knob.psd"))
    with open(psd, "rb") as src, open(target, "wb") as dst:
        dst.write(src.read())
    print("wrote", target)

print(f"\n{'All passed' if not failures else f'{len(failures)} failed'} ({OUT})")
sys.exit(1 if failures else 0)
