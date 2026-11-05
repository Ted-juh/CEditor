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
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.36, 0.675))
    pointer = bpy.context.object
    pointer.name = "pointer"
    pointer.scale = (0.07, 0.36, 0.05)
    pointer.data.materials.append(material("pointer", (0.95, 0.95, 0.9), roughness=0.5))
    # The pointer turns about the knob's axis: its origin there.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    pointer.data.transform(__import__("mathutils").Matrix.Translation((0, 0.36, 0)))
    pointer.location = (0, 0, 0.675)
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


def reference(scene, size, samples):
    """Blender's own image of the knob over a transparent panel that catches its shadow."""
    scene.objects["panel"].is_shadow_catcher = True
    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x = r.resolution_y = size
    r.film_transparent = True
    r.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    r.image_settings.color_depth = "32"
    r.image_settings.exr_codec = "NONE"
    scene.view_settings.view_transform = "Standard"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    r.filepath = os.path.join(OUT, "reference_")
    bpy.ops.render.render(write_still=True)
    name = sorted(f for f in os.listdir(OUT) if f.startswith("reference_"))[-1]
    combined = addon.passes_of(addon.read_exr(os.path.join(OUT, name)), scene.view_layers[0].name)["Combined"]
    scene.objects["panel"].is_shadow_catcher = False
    return combined


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
check(blends.get("pointer reflection") == "lddg", "the pointer's reflection in the metal cap adds")
check("lens" in names and addon.role_of("lens") == "", "the lamp's body is there whether it is lit or not")
check(blends.get("lamp lit") == "lddg" and addon.role_of("lamp lit") == "on", "the lamp's glow adds, a layer of its own")
moving = [n for n in names if addon.role_of(n) == "turns"]
check(sorted(moving) == sorted(n for n in names if n.startswith("pointer")), f"what turns is the pointer's layers: {moving}")
check(all(addon.role_of(n) in ("", "pivot") for n in names if not n.startswith("pointer") and n != "lamp lit"), "everything else stays put")

# The right way up: the pointer was modelled pointing up, and turns about the middle of the image.
ys, xs = np.nonzero(result["pixels"]["pointer"][..., 3])
check(ys.mean() < SIZE * 0.4 and abs(xs.mean() - SIZE / 2) < 1.5, f"the pointer points up, as it was modelled (its middle at {xs.mean():.1f}, {ys.mean():.1f})")
ys, xs = np.nonzero(result["pixels"]["pivot"][..., 3])
check(abs(xs.mean() + 0.5 - SIZE / 2) < 1 and abs(ys.mean() + 0.5 - SIZE / 2) < 1, f"the pivot is on the knob's axis ({xs.mean() + 0.5:.1f}, {ys.mean() + 0.5:.1f})")

merged = result["merged"]
ref = reference(scene, SIZE, SAMPLES)
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.save(os.path.join(OUT, "ref.npy"), ref); np.save(os.path.join(OUT, "merged.npy"), merged)
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

# On a panel, its shadow included. Cycles mixes in linear light and CEditor in sRGB, as browsers and
# Photoshop do: the layers are made to give Cycles' mix, but at the knob's outline that depends on the
# panel CEditor puts it on, so the outline is mixed as any transparent picture's is, and left out here.
yy, xx = np.mgrid[0:SIZE, 0:SIZE]
px = SIZE / 2.6  # pixels to a metre
outline = (np.abs(np.hypot(yy + 0.5 - SIZE / 2, xx + 0.5 - SIZE / 2) - px) < 1.5) | \
          (np.abs(np.hypot(yy + 0.5 - SIZE / 2 - px, xx + 0.5 - SIZE / 2 - px) - 0.11 * px) < 1.5)
for tone, panel in (("dark", 0.2), ("grey", 0.5), ("light", 0.8)):
    want = np.round(addon.srgb(ref[..., :3] + (1 - a_ref[..., None]) * addon.linear(np.float32(panel))) * 255)
    got = np.round((merged[..., :3] + (1 - a_mix[..., None]) * panel) * 255)
    d = np.abs(want - got).max(-1)[~outline]
    mean, p99 = float(d.mean()), float(np.percentile(d, 99))
    check(mean < 1 and p99 < 8, f"on a {tone} panel, its shadow too, away from its outline: mean {mean:.2f}, 99th percentile {p99:.1f}")

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


def on_grey(rgba, premultiplied):
    a = rgba[..., 3:4]
    return np.round(((rgba[..., :3] if premultiplied else rgba[..., :3] * a) + (1 - a) * 0.5) * 255)


scaled = np.zeros((2 * SIZE, 2 * SIZE, 4), dtype=np.float32)
for name, blend in result["layers"]:
    if name != "pivot":
        scaled = addon.blend_over(scaled, larger(result["pixels"][name] / 255.0), blend)
covered = merged[..., 3:4]
picture = larger(np.concatenate([np.where(covered > 0, merged[..., :3] / np.maximum(covered, 1e-6), 0.0), covered], axis=-1))
d = np.abs(on_grey(scaled, True) - on_grey(picture, False)).max(-1)
if os.environ.get("CEDITOR_LAYERS_DEBUG"):
    np.save(os.path.join(OUT, "scaled.npy"), d)
    np.savez(os.path.join(OUT, "pixels.npz"), **result["pixels"])
# Where two layers both fade across the same pixels (the skirt's outline over its shadow, the pointer's
# over its own), scaling each and then laying one over the other is not quite scaling the two laid
# together: a few levels, as for any picture with a drop shadow. The lit lamp's edge, made to look
# right where light cannot be added exactly, is left out (see the add-on's notes).
yy2, xx2 = np.mgrid[0:2 * SIZE, 0:2 * SIZE] / 2.0
d = d[np.hypot(yy2 + 0.25 - SIZE / 2 - px, xx2 + 0.25 - SIZE / 2 - px) > 0.11 * px + 1.5]
check(float(np.percentile(d, 99.9)) < 14 and d.max() < 24, f"drawn twice the size, the layers still add up to the picture: 99.9th percentile {np.percentile(d, 99.9):.1f}, at most {d.max():.0f} levels")

# On black a lit lamp's edge is as Cycles shows it, lit out to where it covers a quarter of a pixel.
lamp_edge = np.abs(np.hypot(yy + 0.5 - SIZE / 2 - px, xx + 0.5 - SIZE / 2 - px) - 0.11 * px) < 1.5
d = np.abs(np.round(addon.srgb(ref[..., :3]) * 255) - np.round(merged[..., :3] * 255)).max(-1)[lamp_edge]
check(d.max() <= 3, f"on black, the lit lamp's edge is as Cycles shows it: at most {d.max():.0f} levels")

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
