"""Build the compact live encoder atlas from the original CTRL49 Screen Lab knobs.
Row order is the stored skin ID (one-based); append new designs at the end.
"""
import configparser
import json
from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent
LAB = ROOT / "screen-lab"
DESIGNS = [
    "machined-metal", "design-presets/studio-1978", "design-presets/bakelite-1936",
    "design-presets/neon-glass", "era-presets/metro-tiles-2012", "era-presets/midnight-2020",
    "era-presets/swiss-flat-2011", "era-presets/blueprint-1965", "era-presets/neo-brutal-2023",
    "era-presets/dot-matrix-1983", "era-presets/red-lead-1997", "era-presets/rhythm-box-1980",
    "era-presets/walnut-1971", "era-presets/test-bench-1958",
]
SIZE = 44
STEPS = 16
atlas = Image.new("RGB", (SIZE * STEPS, SIZE * len(DESIGNS)))
names = ["HoSTage Classic"]
palettes = []
for row, directory in enumerate(DESIGNS):
    path = LAB / directory
    manifest = configparser.ConfigParser()
    manifest.read(next(path.glob("*.ctrl49preset")), encoding="utf-8")
    names.append(manifest["Preset"]["name"])
    lua = (path / manifest["Preset"]["lua"]).read_text()
    if directory.startswith("era-presets/"):
        colors = [re.search(rf"^    {key} = (0x[0-9A-F]+)", lua, re.M)[1]
                  for key in ("load_bg", "value", "label", "accent")]
    else:
        fg, bg, label, accent, _ = re.findall(r"0x[0-9A-F]+", next(
            line for line in lua.splitlines() if line.startswith("local WHITE, INK")))
        colors = [bg, fg, label, accent]
    palettes.append("    { " + ", ".join(colors) + " },")
    bg, fg, label, accent = ["#" + c[-6:] for c in colors]
    strip = Image.open(path / "knobs.png")
    for step in range(STEPS):
        y = round(step * 63 / (STEPS - 1)) * 80
        knob = strip.crop((0, y, 80, y + 80))
        if strip.mode == "P":
            mask = knob.convert("L")
            knob = Image.new("RGBA", knob.size, accent)
            knob.putalpha(mask)
        tile = Image.new("RGB", (SIZE, SIZE), bg)
        knob = knob.convert("RGBA").resize(tile.size, Image.Resampling.LANCZOS)
        tile.paste(knob, mask=knob.getchannel("A"))
        atlas.paste(tile, (step * SIZE, row * SIZE))
atlas.save(ROOT / "live_knobs.png", optimize=True)
(ROOT / "live_skin_names.json").write_text(json.dumps(names, indent=2) + "\n")
page = ROOT / "Hostage_MultiKnob.lua"
src = page.read_text()
start, end = "-- BEGIN LIVE SKIN PALETTES", "-- END LIVE SKIN PALETTES"
a, b = src.index(start), src.index(end)
page.write_text(src[:a] + start + "\nlocal skins = {\n" + "\n".join(palettes) + "\n}\n" + src[b:])
