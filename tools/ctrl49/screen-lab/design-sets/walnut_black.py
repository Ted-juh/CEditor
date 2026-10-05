"""Walnut and Black, design set 5: the front of a 1970s American synthesizer.

Satin black panel between oiled walnut cheeks, cream silkscreen, skirted black knobs with spun
aluminium caps. No outline marks the control you last touched: the jewel lamp beside it lights.
Five pages rather than three, because this set also carries a step generator, two kinds of
selector, rockers, lamp buttons and a slide switch.

This script draws the approval mockups only. Nothing here is uploaded to the keyboard yet.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw
from kit import (Art, Screen, sheet, W, H, LIGHT, rgb, mix, smooth, sd_rrect, cov, round_edge,
                 noise, lit, wood, brushed)

OUT = Path(__file__).resolve().parent / 'mockups' / 'walnut-black'
PANEL, BODY = (30, 30, 32), (21, 21, 23)
CREAM, DIM, AMBER, INK = (238, 232, 212), (150, 146, 134), (255, 180, 76), (26, 20, 14)
TRACE = (255, 186, 84)
BLUE, ORANGE, WHITE, RED = (38, 104, 196), (232, 118, 28), (226, 224, 214), (198, 38, 32)


# ---------------------------------------------------------------- the cabinet

def face():
    art = Art(W, H)
    X, Y = art.coords()
    r = np.random.default_rng(5)
    tone = noise(X.shape, .45, .45, r) * .012 + noise(X.shape, 50, 70, r) * .010 + .030 * np.clip(1 - Y / 190, 0, 1)
    art.paint(rgb(PANEL) + tone[..., None], np.ones_like(X))
    for x0 in (0, 466):
        box = (x0, 0, x0 + 14, H)
        Xc, Yc = art.coords(box)
        board = wood(Xc, Yc, np.random.default_rng(20 + x0), (50, 28, 17), (132, 84, 46))
        crown = 4.2 * np.sqrt(np.clip(1 - ((Xc - x0 - 7) / 7.7) ** 2, 0, 1))
        art.paint(lit(crown, board, spec=.20, shin=10), np.ones_like(Xc), box)
    # The panel sits a little behind the cheeks: the left one shades it, the right one leaves a gap.
    Xs, _ = art.coords((14, 0, 24, H))
    art.paint((0, 0, 0), .6 * np.clip(1 - (Xs - 14) / 8, 0, 1) ** 2, (14, 0, 24, H))
    Xs, _ = art.coords((462, 0, 466, H))
    art.paint((0, 0, 0), .5 * np.clip((Xs - 463) / 3, 0, 1) ** 2, (462, 0, 466, H))
    art.line(25, 27.5, 455, 27.5, 1, CREAM, .85)
    return art


def dial(art, cx, cy, r0, r1, rn, size):
    """Silkscreened 0-10 scale. Without numerals when rn is None."""
    for k in range(11):
        a = math.radians(135 + 27 * k)
        ca, sa = math.cos(a), math.sin(a)
        art.line(cx + ca * r0, cy + sa * r0, cx + ca * r1, cy + sa * r1, 1.5 if k % 5 == 0 else 1.0, CREAM, .95)
        if rn:
            art.legend(str(k), cx + ca * rn, cy + sa * rn, size, CREAM)


def window(art, x0, y0, x1, y1, rad=3, glass=(9, 9, 10)):
    """A readout window: a turned-in lip, dark glass behind it, the lip's shadow on the glass."""
    box = art.clip((x0 - 4, y0 - 4, x1 + 4, y1 + 4))
    X, Y = art.coords(box)
    d = sd_rrect(X, Y, x0, y0, x1, y1, rad)
    art.solid(d - 1.3, rgb((66, 66, 70)), box, height=-1.8, bevel=1.5)
    art.paint(rgb(glass), cov(d), box)
    art.shadow(d, box, dx=.8, dy=1.6, soft=1.4, alpha=.9, inner=True)
    art.paint((1, 1, 1), .045 * cov(d) * smooth(y0 + (y1 - y0) * .5, y0, Y), box)


def caption(art, x0, y0, x1, y1):
    """The outlined strip a panel of this era names its sections with."""
    box = (x0 - 2, y0 - 2, x1 + 2, y1 + 2)
    X, Y = art.coords(box)
    art.paint(rgb(CREAM), cov(np.abs(sd_rrect(X, Y, x0, y0, x1, y1, 3)) - .55) * .9, box)


def slot(art, cx, y0, y1, w=5):
    box = (cx - 8, y0 - 4, cx + 8, y1 + 4)
    X, Y = art.coords(box)
    d = sd_rrect(X, Y, cx - w / 2, y0, cx + w / 2, y1, w / 2)
    art.solid(d - 1.1, rgb((70, 70, 74)), box, height=-1.5, bevel=1.3)
    art.paint(rgb((5, 5, 6)), cov(d), box)


def meter(art, x0, y0, x1, y1):
    """Edgewise panel meter: a lamp-lit cream scale behind glass. The needle is a separate part."""
    box = (x0 - 4, y0 - 4, x1 + 4, y1 + 4)
    X, Y = art.coords(box)
    d = sd_rrect(X, Y, x0, y0, x1, y1, 2.5)
    art.solid(d - 1.6, rgb((62, 62, 66)), box, height=-2.2, bevel=1.7)
    v = (Y - y0) / (y1 - y0)
    art.paint(mix((168, 134, 76), (252, 238, 198), np.exp(-((v - .5) / .5) ** 2)), cov(d), box)
    for k in range(21):
        yy = y1 - 7 - (y1 - y0 - 14) * k / 20
        left = x0 + 3 if k % 10 == 0 else x0 + 6 if k % 2 == 0 else x0 + 9
        art.line(left, yy, x1 - 3, yy, 1, (184, 34, 22) if k >= 16 else (44, 34, 24), .95)
    art.shadow(d, box, dx=1.2, dy=2, soft=1.6, alpha=.55, inner=True)
    art.paint((1, 1, 1), .16 * cov(d) * smooth(.34, .10, v + (X - x0) / (x1 - x0) * .12), box)


def scope(art, x0, y0, x1, y1):
    """A cathode-ray tube behind a moulded bezel. Returns the rectangle of glass the trace may use."""
    box = (x0 - 4, y0 - 4, x1 + 8, y1 + 8)
    X, Y = art.coords(box)
    outer = sd_rrect(X, Y, x0, y0, x1, y1, 9)
    glass = sd_rrect(X, Y, x0 + 13, y0 + 13, x1 - 13, y1 - 13, 13)
    art.shadow(outer, box, dx=1.5, dy=3, soft=3, alpha=.6)
    Hm = 3.2 * round_edge(outer, 3) - 5.5 * round_edge(glass - 6, 6)
    art.paint(lit(Hm, rgb((36, 36, 39)), spec=.28, shin=10), cov(outer), box)
    bead = np.abs(glass - .6) - 1.0                                   # polished trim round the glass
    art.paint(lit(1.4 * np.sqrt(np.clip(1 - ((glass - .6) / 1.0) ** 2, 0, 1)), rgb((150, 152, 158)), spec=.9, shin=30), cov(bead), box)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    fall = np.clip(1 - ((X - cx) / ((x1 - x0) * .56)) ** 2 - ((Y - cy) / ((y1 - y0) * .62)) ** 2, 0, 1)
    art.paint(mix((9, 8, 7), (33, 27, 20), fall), cov(glass), box)
    gx0, gy0, gx1, gy1 = x0 + 17, y0 + 17, x1 - 17, y1 - 17
    for i in range(11):
        x = gx0 + (gx1 - gx0) * i / 10
        art.line(x, gy0, x, gy1, .8, (120, 96, 60), .30 if i != 5 else .5)
    for j in range(5):
        y = gy0 + (gy1 - gy0) * j / 4
        art.line(gx0, y, gx1, y, .8, (120, 96, 60), .30 if j != 2 else .5)
    art.shadow(glass, box, dx=2, dy=3.5, soft=3.5, alpha=.8, inner=True)
    glare = smooth(.9, .2, (X - x0) / (x1 - x0) * .9 + (Y - y0) / (y1 - y0) * 1.6)
    art.paint((1, 1, 1), .07 * glare * cov(glass), box)
    return gx0, gy0, gx1, gy1


def drum(art, x0, y0, x1, y1, wheel=14):
    """Thumbwheel selector: a printed drum behind a window, turned by the knurled wheel on its right."""
    box = (x0 - 4, y0 - 4, x1 + 4, y1 + 4)
    X, Y = art.coords(box)
    d = sd_rrect(X, Y, x0, y0, x1, y1, 3)
    art.solid(d - 2.2, rgb((66, 66, 70)), box, height=-2.6, bevel=2.2)
    v = (Y - (y0 + y1) / 2) / ((y1 - y0) / 2)
    curve = np.sqrt(np.clip(1 - (v * .94) ** 2, 0, 1))
    art.paint(mix((66, 56, 40), (244, 234, 204), curve ** 1.3), cov(d), box)
    phi = np.arcsin(np.clip(v, -1, 1))
    ridge = .5 + .5 * np.cos(phi * 34)
    steel = mix((14, 14, 15), (120, 122, 128), ridge * curve ** 1.5)
    art.paint(steel, cov(d) * cov(x1 - wheel - X), box)
    art.paint((0, 0, 0), .8 * cov(np.abs(X - (x1 - wheel)) - .6) * cov(d), box)
    row = (y1 - y0) / 3
    for yy in ((y0 + y1) / 2 - row / 2, (y0 + y1) / 2 + row / 2):
        art.line(x0 + 3, yy, x1 - wheel - 3, yy, .9, (178, 32, 22), .9)
    art.shadow(d, box, dx=1.2, dy=2.2, soft=2, alpha=.7, inner=True)


def drum_shade(w, h):
    """Drawn over the drum's live text, so the rows above and below fall away round the cylinder."""
    art = Art(w, h)
    X, Y = art.coords()
    v = np.abs(Y - h / 2) / (h / 2)
    art.paint(rgb((40, 32, 22)), .78 * smooth(.30, 1.0, v))
    art.paint((1, 1, 1), .10 * smooth(.5, .0, np.abs(Y - h * .30) / 5))
    return art.image()


def slide_plate(art, x0, y0, x1, y1):
    """Brushed escutcheon held by two screws, with the slot a slide switch travels in."""
    box = (x0 - 4, y0 - 4, x1 + 5, y1 + 6)
    X, Y = art.coords(box)
    d = sd_rrect(X, Y, x0, y0, x1, y1, 2.5)
    art.shadow(d, box, dx=1, dy=2, soft=1.6, alpha=.75)
    art.solid(d, brushed(X, Y, np.random.default_rng(9), (166, 168, 174)), box, height=1.2, bevel=1, spec=.5, shin=24)
    cy = (y0 + y1) / 2
    for sx, turn in ((x0 + 5.5, .5), (x1 - 5.5, 2.1)):
        r = np.hypot(X - sx, Y - cy)
        art.paint(lit(.9 * np.sqrt(np.clip(1 - (r / 2.4) ** 2, 0, 1)), rgb((132, 134, 140)), spec=.8, shin=30), cov(r - 2.3), box)
        art.line(sx - math.cos(turn) * 1.8, cy - math.sin(turn) * 1.8, sx + math.cos(turn) * 1.8, cy + math.sin(turn) * 1.8, .8, (30, 30, 32))
    way = sd_rrect(X, Y, x0 + 10, y0 + 6, x1 - 10, y1 - 6, 2)
    art.paint(rgb((5, 5, 6)), cov(way), box)
    art.shadow(way, box, dx=.8, dy=1.6, soft=1.2, alpha=.8, inner=True)


# ---------------------------------------------------------------- the moving parts

def skirted_knob(size, Rs, Rg, Rc, flutes, t):
    """Skirted phenolic knob. The flutes and the index turn; the light and the cap's sheen do not."""
    art = Art(size, size)
    X, Y = art.coords()
    dx, dy = X - size / 2, Y - size / 2
    r, th = np.hypot(dx, dy), np.arctan2(dy, dx)
    ang = math.radians(135 + 270 * t)
    art.shadow(r - Rs, dx=.05 * Rs, dy=.09 * Rs, soft=.07 * Rs, alpha=.8)
    edge = Rg - .09 * Rg * (.5 - .5 * np.cos(flutes * (th - ang)))
    skirt = (1.8 + .2 * Rs * np.clip((Rs - r) / (Rs - Rg), 0, 1) ** 1.7) * smooth(Rs + .2, Rs - 1, r)
    wall = smooth(edge + .7, edge - .7, r)
    along = dx * math.cos(ang) + dy * math.sin(ang)
    across = dy * math.cos(ang) - dx * math.sin(ang)
    mark = cov(np.maximum(np.abs(across) - max(1.8, .075 * Rs) / 2, np.maximum(Rg + 1.3 - along, along - Rs + 1.6)))[..., None]
    body = rgb(BODY) * (1 - wall[..., None]) + rgb((38, 38, 41)) * wall[..., None]
    art.paint(lit(skirt * (1 - wall) + .52 * Rs * wall, body * (1 - mark) + rgb(CREAM) * mark, spec=.7, shin=10, sheen=.14), cov(r - Rs))
    a0 = math.atan2(LIGHT[1], LIGHT[0])
    tone = .46 + .50 * (.5 + .5 * np.cos(2 * (th - a0))) ** 2.4 + .06 * np.cos(4 * (th - a0) + .9)
    n = int(Rc * 3)
    tone += .07 * (np.interp(r, np.linspace(0, Rc + 1, n), np.random.default_rng(3).random(n)) - .5)
    rim = smooth(Rc - 1.8, Rc - .2, r) * (dx * LIGHT[0] + dy * LIGHT[1]) / np.maximum(r, .01) / math.hypot(LIGHT[0], LIGHT[1])
    art.paint(np.clip(rgb((218, 220, 224)) * (tone * (1 + .35 * rim))[..., None], 0, 1), cov(r - Rc))
    art.paint((0, 0, 0), cov(np.abs(r - Rc - .2) - .5) * .85)
    return art.image()


KNOBS = {'big': (72, 31, 21.5, 15, 24), 'small': (46, 19, 13.2, 9, 18)}
_knobs = {}


def knob(kind, value):
    """One frame of the 64-frame strip, for a 0-127 value."""
    key = kind, int(value * 63 / 127 + .5)
    if key not in _knobs:
        _knobs[key] = skirted_knob(*KNOBS[kind], key[1] / 63)
    return _knobs[key]


def pointer_knob(deg, size=76):
    """Bar knob for a rotary switch, pointing `deg` clockwise from twelve o'clock."""
    art = Art(size, size)
    X, Y = art.coords()
    dx, dy = X - size / 2, Y - size / 2
    ux, uy = math.sin(math.radians(deg)), -math.cos(math.radians(deg))
    along, across = dx * ux + dy * uy, dy * ux - dx * uy
    t0, t1 = -15., 28.
    q = np.clip((along - t0) / (t1 - t0), 0, 1)
    bar = np.hypot(along - (t0 + (t1 - t0) * q), across) - (9.5 - 4.3 * q)
    collar = np.hypot(dx, dy) - 19
    both = np.minimum(bar, collar)
    art.shadow(both, dx=2.2, dy=3.4, soft=2.4, alpha=.8)
    mark = cov(np.maximum(np.abs(across) - 1.0, np.maximum(1 - along, along - 26.5)))[..., None]
    Hm = np.maximum(3 * round_edge(collar, 2.6), 10 * round_edge(bar, 4.6))
    art.paint(lit(Hm, rgb(BODY) * (1 - mark) + rgb(CREAM) * mark, spec=.75, shin=10, sheen=.16), cov(both))
    return art.image()


def rocker(color, on):
    """Coloured rocker. On is the top pressed in, which leaves the lower half standing proud and lit."""
    art = Art(24, 40)
    X, Y = art.coords()
    bezel = sd_rrect(X, Y, 2, 2, 22, 36, 3.2)
    art.shadow(bezel, dx=1, dy=2, soft=1.6, alpha=.7)
    art.solid(bezel, rgb((17, 17, 18)), height=1.6, bevel=1.2, spec=.3)
    pad = sd_rrect(X, Y, 4.5, 4.5, 19.5, 33.5, 1.6)
    s = (Y - 19) / 14.5
    Hm = (1.2 + 4.4 * np.maximum(s if on else -s, 0)) * smooth(0, -.8, pad)
    art.paint(lit(Hm, rgb(color), spec=.38, shin=12), cov(pad))
    return art.image()


def lamp(state):
    """Jewel lamp in a chromed bezel: 0 dark, 1 glowing low, 2 lit."""
    art = Art(18, 18)
    X, Y = art.coords()
    r, th = np.hypot(X - 9, Y - 9), np.arctan2(Y - 9, X - 9)
    art.shadow(r - 7.4, dx=.7, dy=1.3, soft=1.1, alpha=.7)
    ring = 1.8 * np.sqrt(np.clip(1 - ((r - 6.0) / 1.5) ** 2, 0, 1))
    art.paint(lit(ring, rgb((170, 172, 178)), amb=.3, dif=.7, spec=.9, shin=30), cov(np.abs(r - 6.0) - 1.5))
    dome = 3.2 * np.sqrt(np.clip(1 - (r / 4.7) ** 2, 0, 1)) + .2 * np.cos(8 * th) * (r / 4.6)
    core = np.exp(-(r / 2.7) ** 2)[..., None]
    if state == 2:
        col = rgb((255, 44, 20)) * (1 - core) + rgb((255, 220, 170)) * core
    else:
        col = lit(dome, rgb(((66, 8, 7), (120, 14, 9))[state]), spec=.8, shin=40)
        if state:
            col = np.clip(col + rgb((230, 50, 20)) * .55 * core, 0, 1)
    art.paint(col, cov(r - 4.6))
    return art.image()


def halo(color, size, strength=.5):
    art = Art(size, size)
    X, Y = art.coords()
    r = np.hypot(X - size / 2, Y - size / 2)
    art.paint(rgb(color), strength * np.exp(-(r / (size * .22)) ** 2) * smooth(size / 2, size / 2 - 4, r))
    return art.image()


def fader_cap():
    """Dished cap with finger ridges and a white index, on a short stalk's worth of shadow."""
    art = Art(26, 32)
    X, Y = art.coords()
    body = sd_rrect(X, Y, 2, 2, 22, 26, 2)
    art.shadow(body, dx=1.5, dy=3, soft=2, alpha=.8)
    off = Y - 14
    ridges = .7 * np.cos(off * 2 * np.pi / 3) * (np.abs(off) > 2.4)
    Hm = (5 + ridges + 1.8 * (off / 12) ** 2) * round_edge(body, 1.6)
    mark = cov(np.maximum(np.abs(off) - 1.0, np.abs(X - 12) - 8.5))[..., None]
    art.paint(lit(Hm, rgb((28, 28, 30)) * (1 - mark) + rgb(CREAM) * mark, spec=.6, shin=10, sheen=.12), cov(body))
    return art.image()


def needle(w):
    im = Image.new('RGBA', (w, 3))
    d = ImageDraw.Draw(im)
    d.line((0, 0, w - 1, 0), fill=(150, 18, 12, 255))
    d.line((0, 1, w - 1, 1), fill=(60, 8, 6, 255))
    d.line((0, 2, w - 1, 2), fill=(0, 0, 0, 70))
    return im


def lamp_button(w, h, on, color):
    """Square illuminated push button. Its legend is live text drawn over the cap."""
    art = Art(w + 6, h + 8)
    X, Y = art.coords()
    d = sd_rrect(X, Y, 3, 2, 3 + w, 2 + h, 2.5)
    art.shadow(d, dx=1, dy=2.2, soft=1.8, alpha=.75)
    art.solid(d, rgb((16, 16, 17)), height=1.2, bevel=1, spec=.2)
    cap = d + 1.7
    if on:
        hot = np.clip(-cap / (h * .42), 0, 1) ** .7
        art.paint(lit(1.6 * round_edge(cap, 2), mix(color, (255, 244, 212), hot), amb=.75, dif=.25), cov(cap))
    else:
        art.solid(cap, mix((0, 0, 0), color, .26), height=1.8, bevel=2, spec=.3, shin=12)
    return art.image()


def slide_nub():
    art = Art(22, 20)
    X, Y = art.coords()
    body = sd_rrect(X, Y, 2, 1, 18, 15, 1.6)
    art.shadow(body, dx=1.2, dy=2.4, soft=1.6, alpha=.8)
    Hm = (4 + .7 * np.cos((X - 10) * 2 * np.pi / 2.7)) * round_edge(body, 1.4)
    art.paint(lit(Hm, rgb((30, 30, 32)), spec=.5, shin=12), cov(body))
    return art.image()


def handle():
    art = Art(13, 13)
    X, Y = art.coords()
    r = np.hypot(X - 6.5, Y - 6.5)
    art.paint(rgb((24, 18, 12)), cov(r - 5))
    art.paint(rgb(TRACE), cov(np.abs(r - 4.2) - .9))
    art.paint(rgb((255, 232, 190)), cov(r - 1.6))
    return art.image()


# ---------------------------------------------------------------- the pages

def header(s, title, n):
    s.text(title, 25, 4, 260, 21, 14, CREAM, 0)
    s.text(f'<  {n} / 5  >', 355, 4, 100, 21, 13, DIM, 2)


def focus_lamp(s, P, x, y, lit_up):
    s.image(P['lamp'][2 if lit_up else 0], x, y)
    if lit_up:
        s.image(P['halo'], x - 11, y - 11)


def controls(bg, P):
    art = bg.copy()
    cxs, cy = (71, 184, 297, 410), 121
    for cx in cxs:
        dial(art, cx, cy, 34.5, 38.5, 45.5, 7.6)
        window(art, cx - 42, 183, cx + 42, 211)
    window(art, 25, 234, 455, 259)
    s = Screen(art.image())
    header(s, 'CONTROLS', 1)
    names, values, shown = ('CUTOFF', 'EMPHASIS', 'DRIVE', 'MIX'), (63, 41, 23, 83), ('2.4k', '32%', '18%', '65%')
    for i, cx in enumerate(cxs):
        s.text(names[i], cx - 52, 33, 104, 20, 13, CREAM)
        s.image(knob('big', values[i]), cx - 36, cy - 36)
        focus_lamp(s, P, cx - 9, cy + 39, i == 0)
        s.text(shown[i], cx - 42, 183, 84, 28, 19, AMBER)
    s.text('CUTOFF     2458 Hz', 25, 234, 430, 25, 13, CREAM)
    return s


def mixer(bg, P):
    art = bg.copy()
    for i in range(8):
        sx = 16 + 56 * i
        slot(art, sx + 20, 54, 204)
        for k in range(11):
            yy = 68 + 12.2 * k
            art.line(sx + (4 if k % 5 == 0 else 7), yy, sx + 11, yy, 1, CREAM, .9)
        meter(art, sx + 35, 53, sx + 50, 205)
        window(art, sx + 5, 213, sx + 51, 231, rad=2)
    s = Screen(art.image())
    header(s, 'MIXER', 2)
    names = ('KICK', 'SNARE', 'HATS', 'BASS', 'KEYS', 'PAD', 'LEAD', 'FX')
    values, level, muted, focus = (92, 78, 104, 60, 110, 84, 96, 70), (96, 70, 58, 88, 104, 40, 0, 52), 6, 2
    for i in range(8):
        sx = 16 + 56 * i
        s.text(names[i], sx, 31, 56, 18, 11, AMBER if i == focus else CREAM)
        s.image(P['cap'], sx + 8, 54 + (127 - values[i]) * 122 // 127)
        s.image(P['needle'], sx + 37, 197 - level[i] * 138 // 127)
        s.text(('-9', '-14', '-3', '-19', '+2', '-12', '-5', '-22')[i], sx + 5, 213, 46, 18, 12, AMBER)
        focus_lamp(s, P, sx + 6, 239, i == focus)
        s.image(P['mute'][i == muted], sx + 26, 237)
        s.text('M', sx + 29, 239, 22, 16, 10, INK if i == muted else DIM)
    return s


def envelope():
    """Heights of the curve per 4 px column, as the host sends them, and the three corner columns."""
    n, peak, sustain = 100, 104, .62
    a, d, r = 8, 24, 30
    hold = n - a - d - r
    cols = [peak * (1 - math.exp(-3.2 * i / (a - 1))) / (1 - math.exp(-3.2)) for i in range(a)]
    cols += [peak * (sustain + (1 - sustain) * math.exp(-4 * i / d)) for i in range(1, d + 1)]
    cols += [cols[-1]] * hold
    cols += [cols[-1] * math.exp(-4.2 * i / r) for i in range(1, r + 1)]
    return cols, (a - 1, a + d - 1, a + d + hold - 1)


def contour(bg, P):
    art = bg.copy()
    gx0, gy0, gx1, gy1 = scope(art, 22, 33, 458, 186)
    for i in range(4):
        dial(art, 22 + 109 * i + 27, 223, 21.5, 24, None, 0)
    s = Screen(art.image())
    header(s, 'LOUDNESS CONTOUR', 3)
    cols, marks = envelope()
    x0, base = int(gx0) + 1, int(gy1) - 4
    for c in range(len(cols) - 1):
        a, b = cols[c], cols[c + 1]
        for k in range(4):
            lo, hi = sorted((int(a + (b - a) * k / 4), int(a + (b - a) * (k + 1) / 4)))
            s.rect(x0 + c * 4 + k, base - hi - 1, 1, hi - lo + 2, TRACE)
        if c % 2 == 0:
            s.image(P['glow'], x0 + c * 4 - 10, base - int(a) - 10)
    for m in marks:
        s.image(P['handle'], x0 + m * 4 - 6, base - int(cols[m]) - 7)
    stage, values, shown = ('ATTACK', 'DECAY', 'SUSTAIN', 'RELEASE'), (22, 58, 79, 70), ('12 ms', '248 ms', '62 %', '684 ms')
    for i in range(4):
        x = 22 + 109 * i
        s.image(knob('small', values[i]), x + 4, 200)
        focus_lamp(s, P, x + 18, 243, i == 1)
        s.text(stage[i], x + 56, 205, 52, 16, 10, CREAM if i == 1 else DIM, 0)
        s.text(shown[i], x + 56, 221, 52, 20, 15, AMBER, 0)
    return s


def sequencer(bg, P):
    art = bg.copy()
    rows = (79, 171)
    for cy in rows:
        for i in range(8):
            dial(art, 44 + 56 * i, cy, 21.5, 24, None, 0)
    art.line(25, 125.5, 455, 125.5, 1, CREAM, .35)
    window(art, 25, 226, 455, 251)
    s = Screen(art.image())
    header(s, 'SEQUENCER', 4)
    notes = (40, 40, 76, 40, 64, 52, 88, 40, 40, 100, 76, 52, 64, 40, 112, 58)
    gate = (1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1)
    playing = 6
    for step in range(16):
        cx, cy = 44 + 56 * (step % 8), rows[step // 8]
        s.image(P['lamp'][2 if step == playing else gate[step]], cx - 9, cy - 43)
        if step == playing:
            s.image(P['halo'], cx - 20, cy - 54)
        s.image(knob('small', notes[step]), cx - 23, cy - 23)
        s.text(str(step + 1), cx - 20, cy + 24, 40, 15, 11, CREAM if step == playing else DIM)
    s.text('STEP 7     F 3     GATE ON     120 BPM', 25, 226, 430, 25, 13, CREAM)
    return s


def switches(bg, P):
    art = bg.copy()
    for x in (176.5, 334.5):
        art.line(x, 38, x, 258, 1, CREAM, .5)
    for x0, x1 in ((25, 168), (185, 326), (343, 455)):
        caption(art, x0, 240, x1, 258)
    wcx, wcy, angles = 92, 104, (-115, -69, -23, 23, 69, 115)
    for a in angles:
        ux, uy = math.sin(math.radians(a)), -math.cos(math.radians(a))
        art.line(wcx + ux * 37, wcy + uy * 37, wcx + ux * 42, wcy + uy * 42, 1.4, CREAM, .95)
    slide_plate(art, 50, 189, 142, 213)
    drum(art, 190, 44, 322, 128)
    s = Screen(art.image())
    header(s, 'SWITCHES', 5)
    # Rotary selector: the labels are live text, so one tile serves any six-way choice.
    waves, pick = ('SINE', 'TRI', 'SAW', 'SQUARE', 'PULSE', 'NOISE'), 2
    for i, a in enumerate(angles):
        ux, uy = math.sin(math.radians(a)), -math.cos(math.radians(a))
        x, y = wcx + ux * 46, wcy + uy * 46
        if a < 0:
            s.text(waves[i], int(x) - 50, int(y) - 8, 50, 16, 11, CREAM if i == pick else DIM, 2)
        else:
            s.text(waves[i], int(x), int(y) - 8, 50, 16, 11, CREAM if i == pick else DIM, 0)
    s.image(pointer_knob(angles[pick]), wcx - 38, wcy - 38)
    # Three-way slide switch.
    for i, name in enumerate(("32'", "16'", "8'")):
        s.text(name, 58 + 26 * i, 171, 24, 16, 11, CREAM if i == 1 else DIM)
    s.image(P['nub'], 60 + 26 * 1, 193)
    s.text('RANGE', 50, 217, 92, 16, 10, DIM)
    s.text('OSCILLATOR', 25, 240, 143, 18, 11, CREAM)
    # Thumbwheel drum: three live rows, then the shading that bends them round the cylinder.
    modes = ('LOW PASS 12', 'LOW PASS 24', 'BAND PASS')
    for i, name in enumerate(modes):
        s.text(name, 192, 46 + 27 * i, 114, 26, 14 if i == 1 else 12, INK if i == 1 else (70, 58, 42))
    s.image(P['drumshade'], 192, 46)
    s.image(P['glide'][1], 190, 150)
    s.text('GLIDE', 193, 152, 60, 24, 11, INK)
    s.image(P['glide'][0], 262, 150)
    s.text('HOLD', 265, 152, 60, 24, 11, DIM)
    s.text('2 OF 5', 190, 196, 132, 16, 10, DIM)
    s.text('FILTER', 185, 240, 141, 18, 11, CREAM)
    # Rockers.
    rows = ((('OSC 1', BLUE, 1), ('OSC 2', BLUE, 1), ('OSC 3', BLUE, 0), ('NOISE', WHITE, 0)),
            (('EXT', WHITE, 0), ('A-440', ORANGE, 1), ('MOD', ORANGE, 0), ('KILL', RED, 0)))
    for j, row in enumerate(rows):
        for i, (name, color, on) in enumerate(row):
            x, y = 344 + 28 * i, 50 + 96 * j
            s.text(name, x - 3, y - 15, 30, 14, 9, CREAM if on else DIM)
            s.image(P['rocker'][color, on], x, y)
            s.image(P['lamp'][1 if on else 0], x + 3, y + 42)
    s.text('SOURCES', 343, 240, 112, 18, 11, CREAM)
    return s


def parts_page(bg, P):
    """The kit laid out by itself, every part in each of its states."""
    s = Screen(bg.image())
    s.text('PARTS', 25, 4, 260, 21, 14, CREAM, 0)
    for i, v in enumerate((0, 42, 85, 127)):
        s.image(knob('big', v), 22 + 74 * i, 32)
    for i, v in enumerate((0, 64, 127)):
        s.image(knob('small', v), 324 + 46 * i, 44)
    for i, a in enumerate((-115, -23, 69)):
        s.image(pointer_knob(a), 20 + 72 * i, 106)
    for i, (color, on) in enumerate(((BLUE, 0), (BLUE, 1), (ORANGE, 0), (ORANGE, 1), (WHITE, 0), (WHITE, 1), (RED, 0), (RED, 1))):
        s.image(P['rocker'][color, on], 246 + 27 * i, 124)
    for i in range(3):
        s.image(P['lamp'][i], 30 + 26 * i, 196)
    s.image(P['halo'], 30 + 52 - 11, 196 - 11)
    s.image(P['cap'], 120, 188)
    s.image(P['nub'], 156, 194)
    s.image(P['glide'][0], 190, 190)
    s.image(P['glide'][1], 262, 190)
    s.image(P['mute'][0], 336, 194)
    s.image(P['mute'][1], 366, 194)
    s.image(P['handle'], 404, 198)
    s.image(P['glow'], 424, 197)
    for x, name in ((26, 'LAMP'), (112, 'FADER'), (150, 'SLIDE'), (190, 'LAMP BUTTON'), (336, 'MUTE'), (398, 'TRACE')):
        s.text(name, x, 228, 80, 14, 9, DIM, 0)
    return s


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bg = face()
    P = {
        'lamp': [lamp(i) for i in range(3)], 'halo': halo((255, 60, 24), 40), 'cap': fader_cap(), 'needle': needle(11),
        'mute': [lamp_button(22, 14, on, (255, 70, 40)) for on in (0, 1)],
        'glide': [lamp_button(60, 24, on, (255, 178, 60)) for on in (0, 1)],
        'glow': halo(TRACE, 20, .5), 'handle': handle(), 'nub': slide_nub(), 'drumshade': drum_shade(114, 80),
        'rocker': {(c, on): rocker(c, on) for c in (BLUE, ORANGE, WHITE, RED) for on in (0, 1)},
    }
    pages = [('1  Controls', controls), ('2  Mixer', mixer), ('3  Envelope', contour),
             ('4  Step generator', sequencer), ('5  Selectors and switches', switches), ('Parts and their states', parts_page)]
    cells = []
    for name, build in pages:
        s = build(bg, P)
        s.im.save(OUT / (name.split('  ')[-1].lower().replace(' ', '-') + '.png'))
        cells.append((name, s.im))
        print(f'{name}: {s.calls} draw calls')
    sheet(cells, 'Walnut and Black    native 480 x 272, shown at 2x', OUT / 'walnut-black-sheet.png')


if __name__ == '__main__':
    main()
