#!/usr/bin/env python3
"""Six CTRL49 screen-lab designs from six eras of synthesizer, flat to skeuomorphic.

    python make_era_designs.py            # every design
    python make_era_designs.py walnut-1971 test-bench-1958

Each design folder gets exactly what the screen lab's preset mode loads:

  Design.ctrl49preset  the manifest (INI): five pages, their encoders and starting values
  Skin.lua             EraSkin.lua with this design's GENERATED block (theme, layout, crops)
  panels.png           480 x 816   the Controls, Mixer and Envelope backgrounds, stacked
  knobs.png            80 x 5120   64 knob frames, value 0..127 -> frame floor(v*63/127 + 0.5)
  parts.png            480 x 724   sprites in the top 180 rows, then the Sequencer and
                                   Arpeggiator backgrounds (y 180 and y 452)

The five sprite crops the first four designs share (fader cap, ADSR cap, meter column,
envelope glow, envelope handle) keep their coordinates. The two extra backgrounds ride in
parts.png rather than a fourth asset, so no single decode is larger than the proven ones.

Every pixel is authored at 480 x 272, never shrunk from a larger mock-up. Text stays live
firmware text: nothing here bakes lettering. Pillow only; deterministic (seeded noise).
"""
import math
import os
import random
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, 'EraSkin.lua')
SS = 4                      # shapes are drawn 4x and downsampled, so every edge anti-aliases
W, H = 480, 272
LANCZOS = Image.Resampling.LANCZOS
BILINEAR = Image.Resampling.BILINEAR
NEAREST = Image.Resampling.NEAREST

# --- the contract with the host and with EraSkin.lua ------------------------------------------------

FPS = 15
PAGES = ['Controls', 'Mixer', 'Envelope', 'Sequencer', 'Arpeggiator']
ENCODERS = [4, 8, 4, 8, 8]
ASSETS = [(576, 'panels.png'), (578, 'knobs.png'), (580, 'parts.png')]
KNOB, KNOB_FRAMES = 80, 64
PARTS_TOP = 180             # sprite rows at the top of parts.png; the two backgrounds follow


def seq_value(semitone):
    """The smallest encoder value EraSkin.lua's seq_note() reads as C2 + semitone."""
    return 1 + -(-semitone * 127 // 25)


# A C minor bassline: C2 C3 G2 Bb2 rest Eb3 F2 G2.
SEQ_DEFAULT = [seq_value(s) if s is not None else 0 for s in (0, 12, 7, 10, None, 15, 5, 7)]
DEFAULTS = [
    [84, 38, 30, 100, 64, 64, 64, 64],          # cutoff, resonance, drive, mix
    [104, 96, 80, 100, 72, 64, 88, 56],         # eight channel faders
    [24, 64, 88, 60, 64, 64, 64, 64],           # attack, decay, sustain, release
    SEQ_DEFAULT + [],                           # steps 1-8
    [0, 72, 40, 71, 21, 60, 0, 20],             # UP, 1/16, 2 oct, 60 %, 54 %, 120 BPM, Cm7, 3+3+2
]

KNOB_X = [20, 140, 260, 380]
KNOB_Y = 62
FILTER_WIN, FILTER = (16, 170, 448, 78), (20, 174, 440, 70)
ENV_WIN, ENV_X, ENV_BASE = (16, 34, 448, 150), 20, 178
STRIP = 60
SLOT_DX, CAP_TOP, CAP_TRAVEL = 24, 48, 120
METER_DX, METER_Y, METER_H = 44, 56, 144
SEQ_WELL_Y, SEQ_BASE = 46, 178
KB_X, KB_Y, KB_WHITE, KB_WHITE_H, KB_BLACK, KB_BLACK_H, KB_LO = 30, 36, 20, 44, 12, 26, 48
LANE_WIN, LANE = (30, 86, 420, 100), (32, 88, 416, 96, 26)
TRACK_Y = 230                # the envelope sliders' and arpeggiator cells' tracks: 4 px tall

LAYOUT = {
    'pages': 5, 'fps': FPS, 'defaults': DEFAULTS,
    'bg': [[577, 0], [577, 272], [577, 544], [581, PARTS_TOP], [581, PARTS_TOP + 272]],
    'title': [14, 5, 250, 20], 'head': [210, 5, 256, 20], 'foot': [14, 254, 380, 16],
    'dots': [410, 260, 12, 8, 4],
    'knob_x': KNOB_X, 'knob_y': KNOB_Y, 'knob_label_y': 40, 'knob_value_y': 144, 'knob_focus_y': 164,
    'filter': list(FILTER),
    'strip_w': STRIP, 'mix_label_y': 34, 'slot_dx': SLOT_DX, 'cap_top': CAP_TOP, 'cap_travel': CAP_TRAVEL,
    'meter_dx': METER_DX, 'meter_y': METER_Y, 'meter_h': METER_H, 'mix_value_y': 214,
    'env': [ENV_X, ENV_BASE], 'env_slider': [20, 112, 104], 'env_label_y': 190, 'env_value_y': 202,
    'env_track': [8, 88, TRACK_Y + 2],
    'seq_num_y': 33, 'seq_base': SEQ_BASE, 'seq_note_y': 184, 'seq_key_y': 206,
    'kb': [KB_X, KB_Y, KB_WHITE, KB_WHITE_H, KB_BLACK, KB_BLACK_H], 'kb_lo': KB_LO,
    'lane': list(LANE), 'cell_label_y': 190, 'cell_value_y': 203, 'cell_bar': [8, 44, TRACK_Y, 4],
}

SPRITES = {
    # shared with the first four designs: same place, same size
    'vcap': (0, 0, 34, 40), 'hcap': (38, 0, 22, 28), 'meter': (68, 0, 8, 144),
    'glow': (80, 0, 12, 12), 'handle': (96, 0, 14, 14),
    # new for the era designs
    'fill': (0, 42, 4, 136), 'peak': (8, 42, 8, 3), 'seqbar': (112, 0, 14, 128),
    'wlit': (130, 0, 19, 44), 'wplay': (150, 0, 19, 44),
    'black': (170, 0, 12, 26), 'blit': (184, 0, 12, 26), 'bplay': (198, 0, 12, 26),
}
for _i in range(8):
    SPRITES['key%d' % (_i + 1)] = (128 + _i * 44, 46, 44, 30)
    SPRITES['key_on%d' % (_i + 1)] = (128 + _i * 44, 78, 44, 30)

# --- colour --------------------------------------------------------------------------------------------


def C(c, a=None):
    if isinstance(c, str):
        s = c.lstrip('#')
        c = (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)
    c = tuple(int(v) for v in c)
    if len(c) == 3:
        c = c + (255,)
    if a is not None:
        c = c[:3] + (int(a),)
    return c


def mix(a, b, t):
    a, b = C(a), C(b)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


def argb(c):
    c = C(c)
    return '0x%02X%02X%02X%02X' % (c[3], c[0], c[1], c[2])


# --- images --------------------------------------------------------------------------------------------


def new(w, h, c=(0, 0, 0, 0)):
    return Image.new('RGBA', (w, h), C(c))


def interp(stops, t):
    for k in range(1, len(stops)):
        if t <= stops[k][0]:
            t0, c0 = stops[k - 1]
            t1, c1 = stops[k]
            return mix(c0, c1, 0 if t1 == t0 else (t - t0) / (t1 - t0))
    return C(stops[-1][1])


def grad(w, h, stops, vertical=True):
    n = h if vertical else w
    strip = Image.new('RGBA', (1, n) if vertical else (n, 1))
    strip.putdata([interp(stops, i / max(1, n - 1)) for i in range(n)])
    return strip.resize((w, h), NEAREST)


def noise(w, h, seed, blur=0.0, stretch=(1, 1)):
    """Seeded grey noise, optionally blurred, or stretched (8, 1) into brushed streaks."""
    rng = random.Random(seed)
    nw, nh = max(1, w // stretch[0]), max(1, h // stretch[1])
    im = Image.frombytes('L', (nw, nh), rng.randbytes(nw * nh))
    if stretch != (1, 1):
        im = im.resize((w, h), BILINEAR)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return ImageOps.autocontrast(im)


def modulate(img, n, strength):
    """Lightens and darkens img by grey noise n around its mid grey; keeps img's alpha."""
    light = Image.new('RGBA', img.size, (255, 255, 255, 0))
    light.putalpha(n.point(lambda v: max(0, min(255, int((v - 128) * strength)))))
    dark = Image.new('RGBA', img.size, (0, 0, 0, 0))
    dark.putalpha(n.point(lambda v: max(0, min(255, int((128 - v) * strength)))))
    out = img.copy()
    out.alpha_composite(light)
    out.alpha_composite(dark)
    out.putalpha(img.getchannel('A'))
    return out


def field(w, h, fn):
    im = Image.new('RGBA', (w, h))
    im.putdata([C(fn(x, y)) for y in range(h) for x in range(w)])
    return im


def mask(w, h, fn):
    """An anti-aliased L mask: fn(draw, s) draws white at scale s, in w x h pixel units."""
    m = Image.new('L', (w * SS, h * SS), 0)
    fn(ImageDraw.Draw(m), SS)
    return m.resize((w, h), LANCZOS)


def paint(m, colour):
    c = C(colour)
    im = Image.new('RGBA', m.size, c[:3] + (0,))
    im.putalpha(m if c[3] == 255 else m.point(lambda v: v * c[3] // 255))
    return im


def clip(img, m):
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel('A'), m))
    return out


def blur(img, r):
    return img.filter(ImageFilter.GaussianBlur(r))


def put(base, layer, x=0, y=0):
    """alpha_composite that tolerates a layer hanging off the edge."""
    x, y = int(round(x)), int(round(y))
    sx, sy = max(0, -x), max(0, -y)
    w = min(layer.width - sx, base.width - max(0, x))
    h = min(layer.height - sy, base.height - max(0, y))
    if w > 0 and h > 0:
        base.alpha_composite(layer.crop((sx, sy, sx + w, sy + h)), dest=(max(0, x), max(0, y)))


def rect(img, box, colour):
    x, y, w, h = box
    put(img, new(w, h, colour), x, y)


def rrect(img, box, r, colour):
    x, y, w, h = box
    put(img, paint(mask(w, h, lambda d, s: d.rounded_rectangle((0, 0, w * s - 1, h * s - 1), r * s, fill=255)), colour), x, y)


def rgrad(img, box, r, stops, vertical=True):
    x, y, w, h = box
    m = mask(w, h, lambda d, s: d.rounded_rectangle((0, 0, w * s - 1, h * s - 1), r * s, fill=255))
    put(img, clip(grad(w, h, stops, vertical), m), x, y)


def disc(img, cx, cy, r, colour):
    size = int(math.ceil(r * 2)) + 4
    ox, oy = int(cx - size / 2), int(cy - size / 2)
    m = mask(size, size, lambda d, s: d.ellipse(((cx - r - ox) * s, (cy - r - oy) * s, (cx + r - ox) * s, (cy + r - oy) * s), fill=255))
    put(img, paint(m, colour), ox, oy)


def glow_dot(img, cx, cy, r, colour, spread):
    size = int(2 * (r + spread * 3)) + 4
    layer = new(size, size)
    disc(layer, size / 2, size / 2, r, colour)
    halo = blur(layer, spread)
    put(img, halo, cx - size / 2, cy - size / 2)
    put(img, halo, cx - size / 2, cy - size / 2)
    put(img, layer, cx - size / 2, cy - size / 2)


def inner_shadow(img, box, r, alpha=150, depth=2, spread=2.0):
    x, y, w, h = box
    m = mask(w, h, lambda d, s: d.rounded_rectangle((0, 0, w * s - 1, h * s - 1), r * s, fill=255))
    pad = 8
    big = Image.new('L', (w + 2 * pad, h + 2 * pad), 255)
    big.paste(ImageChops.invert(m), (pad, pad + depth))
    sh = big.filter(ImageFilter.GaussianBlur(spread)).crop((pad, pad, pad + w, pad + h))
    sh = ImageChops.multiply(sh, m).point(lambda v: v * alpha // 255)
    put(img, paint(sh, (0, 0, 0, 255)), x, y)


def recess(img, box, r, fill, lip_dark, lip_light, inner=150, stops=None):
    """A rounded hole in the panel: a dark lip above, a light lip below, an inner shadow."""
    x, y, w, h = box
    rrect(img, (x, y - 1, w, h), r, lip_dark)
    rrect(img, (x, y + 1, w, h), r, lip_light)
    if stops:
        rgrad(img, box, r, stops)
    else:
        rrect(img, box, r, fill)
    inner_shadow(img, box, r, inner)


def bevel(m, radius=1.5, gain=3.0):
    """Highlight and shade layers for a shape lit from the top left, from its mask alone, so
    a rotating silhouette keeps a light that does not rotate with it."""
    b = m.filter(ImageFilter.GaussianBlur(radius))
    shifted = ImageChops.offset(b, 1, 1)
    hl = ImageChops.multiply(ImageChops.subtract(b, shifted, scale=1.0 / gain), m)
    sh = ImageChops.multiply(ImageChops.subtract(shifted, b, scale=1.0 / gain), m)
    return paint(hl, (255, 255, 255, 255)), paint(sh, (0, 0, 0, 255))


def drop_shadow(m, dx, dy, radius, alpha):
    pad = int(radius * 3) + 4
    big = Image.new('L', (m.width + 2 * pad, m.height + 2 * pad), 0)
    big.paste(m.point(lambda v: v * alpha // 255), (pad + dx, pad + dy))
    big = big.filter(ImageFilter.GaussianBlur(radius)).crop((pad, pad, pad + m.width, pad + m.height))
    return paint(big, (0, 0, 0, 255))


def pol(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


def knob_angle(frame):
    return -150 + 300 * frame / (KNOB_FRAMES - 1)


def segments(w, h, seg, gap, colour_at):
    """A column of segments from the bottom up; colour_at(t) gives each one its colour."""
    im = new(w, h)
    y = h
    while y - seg >= 0:
        t = 1 - (y - seg / 2) / h
        rect(im, (0, y - seg, w, seg), colour_at(t))
        y -= seg + gap
    return im


# --- the base theme: a dark, lit, three-dimensional panel; each era overrides what it must ----------

class Theme:
    slug = name = ''
    tintable = False         # knobs.png as 8-bit grey coverage the device tints, not RGBA

    def __init__(self):
        self.P = dict(self.palette)

    # Lua theme values every design must give
    def lua_theme(self):
        raise NotImplementedError

    # -- panel furniture ----------------------------------------------------------------------------
    def surface(self, page):
        return grad(W, H, [(0, self.P['panel_top']), (1, self.P['panel_bot'])])

    def header(self, img):
        rect(img, (0, 30, W, 1), self.P['groove_dark'])
        rect(img, (0, 31, W, 1), self.P['groove_light'])

    def footer(self, img):
        rect(img, (0, 249, W, 1), self.P['groove_dark'])
        rect(img, (0, 250, W, 1), self.P['groove_light'])

    def display(self, img, box):
        recess(img, box, 4, self.P['window'], self.P['lip_dark'], self.P['lip_light'],
               stops=[(0, self.P['window_top']), (1, self.P['window'])])
        x, y, w, h = box
        # a faint sheet of glass: one soft diagonal reflection across the top left
        g = mask(w, h, lambda d, s: d.polygon([(0, 0), (w * 0.42 * s, 0), (w * 0.18 * s, h * s), (0, h * s)], fill=255))
        g = ImageChops.multiply(g, grad(w, h, [(0, (255, 255, 255, 255)), (1, (60, 60, 60, 255))]).getchannel('R'))
        put(img, paint(g.point(lambda v: v * self.P.get('glass', 10) // 255), (255, 255, 255, 255)), x, y)

    def grid(self, img, area, nx, ny, strong=False):
        x, y, w, h = area
        colour = self.P['grid']
        accent = self.P.get('grid_strong') or mix(colour, (255, 255, 255), 0.10)
        for i in range(1, nx):
            rect(img, (x + round(i * w / nx), y, 1, h), accent if strong and i % 4 == 0 else colour)
        for j in range(1, ny):
            rect(img, (x, y + round(j * h / ny), w, 1), colour)

    def track(self, img, box):
        x, y, w, h = box
        recess(img, (x - 1, y - 1, w + 2, h + 2), (h + 2) // 2, self.P['slot'], self.P['lip_dark'], self.P['lip_light'], inner=200)

    def ticks(self, img, x, y0, y1, n, colour=None, length=5, unity=None):
        colour = colour or self.P['tick']
        for k in range(n):
            y = round(y0 + (y1 - y0) * k / (n - 1))
            rect(img, (x, y, length, 1), colour)
        if unity is not None:
            rect(img, (x - 2, unity, length + 2, 1), colour)

    def divider(self, img, x, y0, y1):
        rect(img, (x, y0, 1, y1 - y0), self.P['groove_dark'])
        rect(img, (x + 1, y0, 1, y1 - y0), self.P['groove_light'])

    def meter_bg(self, img, x, y):
        recess(img, (x - 1, y - 1, 10, METER_H + 2), 2, self.P['window'], self.P['lip_dark'], self.P['lip_light'])
        put(img, self.meter(lit=False), x, y)

    def seq_well(self, img, box):
        recess(img, box, 3, self.P['window'], self.P['lip_dark'], self.P['lip_light'])
        x, y, w, h = box
        put(img, self.seqbar(lit=False), x + (w - 14) // 2, SEQ_BASE - 128)

    def seat(self, img, cx, cy):
        pass

    def scale(self, img, cx, cy, r0, r1, colour, minor=None, majors=11, width=1.6):
        def draw(d, s):
            for k in range(majors):
                a = -150 + 300 * k / (majors - 1)
                big = k in (0, majors // 2, majors - 1)
                p0 = pol(cx * s, cy * s, (r0 - (1.5 if big else 0)) * s, a)
                p1 = pol(cx * s, cy * s, r1 * s, a)
                d.line([p0, p1], fill=255, width=int(width * s))
            if minor:
                for k in range((majors - 1) * 2 + 1):
                    if k % 2:
                        a = -150 + 300 * k / ((majors - 1) * 2)
                        p0 = pol(cx * s, cy * s, (r0 + 2) * s, a)
                        p1 = pol(cx * s, cy * s, r1 * s, a)
                        d.line([p0, p1], fill=255, width=int(width * 0.7 * s))
        m = mask(W, H, draw)
        put(img, paint(m, colour))

    def keybed(self, img):
        recess(img, (KB_X - 2, KB_Y - 2, 21 * KB_WHITE + 4, KB_WHITE_H + 4), 2, self.P['keybed'], self.P['lip_dark'], self.P['lip_light'], inner=60)

    def keyboard(self, img):
        self.keybed(img)
        for k in range(21):
            put(img, self.white_key('off'), KB_X + k * KB_WHITE, KB_Y)
        for octave in range(3):
            for left in (0, 1, 3, 4, 5):
                x = KB_X + (octave * 7 + left + 1) * KB_WHITE - KB_BLACK // 2
                put(img, self.black_key('off'), x, KB_Y)

    # -- keys, the same pictures for the baked keyboard and the sprites ------------------------------
    def white_key(self, state):
        w, h = KB_WHITE - 1, KB_WHITE_H
        top, bot = self.P['ivory_top'], self.P['ivory']
        if state != 'off':
            c = self.P['key_lit' if state == 'lit' else 'key_play']
            top, bot = mix(top, c, 0.55), mix(bot, c, 0.75)
        im = new(w, h)
        rrect(im, (0, 0, w, h), 2, mix(bot, (0, 0, 0), 0.35))
        rgrad(im, (0, 0, w, h - 3), 2, [(0, mix(top, (0, 0, 0), 0.25)), (0.12, top), (1, bot)])
        rect(im, (0, h - 3, w, 1), mix(bot, (255, 255, 255), 0.35))
        rect(im, (w - 1, 0, 1, h - 3), mix(bot, (0, 0, 0), 0.18))
        return im

    def black_key(self, state):
        w, h = KB_BLACK, KB_BLACK_H
        top, bot = self.P['ebony_top'], self.P['ebony']
        if state != 'off':
            c = self.P['key_lit' if state == 'lit' else 'key_play']
            top, bot = mix(top, c, 0.6), mix(bot, c, 0.8)
        im = new(w, h)
        rrect(im, (0, 0, w, h), 2, mix(bot, (0, 0, 0), 0.5))
        rgrad(im, (1, 0, w - 2, h - 5), 2, [(0, bot), (0.7, top), (1, mix(top, (255, 255, 255), 0.15))])
        rgrad(im, (1, h - 5, w - 2, 4), 1, [(0, mix(top, (255, 255, 255), 0.25)), (1, bot)])
        return im

    # -- sprites --------------------------------------------------------------------------------------
    def vcap(self):
        im = new(34, 40)
        m = mask(34, 40, lambda d, s: d.rounded_rectangle((3 * s, 4 * s, 31 * s, 36 * s), 3 * s, fill=255))
        put(im, drop_shadow(m, 1, 2, 2, 170))
        body = clip(grad(34, 40, [(0, self.P['cap_top']), (0.5, self.P['cap']), (1, self.P['cap_bot'])]), m)
        put(im, body)
        for k in range(5):
            if k != 2:
                rect(im, (6, 9 + k * 5 + (2 if k > 2 else 0), 22, 1), mix(self.P['cap_bot'], (0, 0, 0), 0.4))
        rect(im, (5, 19, 24, 2), self.P['cap_line'])
        hl, sh = bevel(m, 1.2, 2.5)
        put(im, hl)
        put(im, sh)
        return im

    def hcap(self):
        im = new(22, 28)
        m = mask(22, 28, lambda d, s: d.rounded_rectangle((3 * s, 2 * s, 19 * s, 25 * s), 3 * s, fill=255))
        put(im, drop_shadow(m, 1, 2, 1.5, 170))
        put(im, clip(grad(22, 28, [(0, self.P['cap_top']), (0.5, self.P['cap']), (1, self.P['cap_bot'])], vertical=False), m))
        rect(im, (10, 4, 2, 20), self.P['cap_line'])
        hl, sh = bevel(m, 1.0, 2.5)
        put(im, hl)
        put(im, sh)
        return im

    def meter_colour(self, t):
        if t > 0.86:
            return self.P['meter_hot']
        if t > 0.68:
            return self.P['meter_warm']
        return self.P['meter']

    def meter(self, lit=True):
        def colour(t):
            c = self.meter_colour(t)
            return c if lit else mix(c, self.P['window'], 0.78)
        im = segments(8, METER_H, 4, 2, colour)
        if lit:
            g = blur(im, 1.2)
            out = new(8, METER_H)
            put(out, g)
            put(out, im)
            return out
        return im

    def glow(self):
        im = new(12, 12)
        glow_dot(im, 6, 6, 1.6, self.P['line'], 1.8)
        return im

    def handle(self):
        im = new(14, 14)
        disc(im, 7, 7, 5.5, mix(self.P['line'], (0, 0, 0), 0.5))
        disc(im, 7, 7, 4.2, self.P['line'])
        disc(im, 6, 6, 1.6, (255, 255, 255, 200))
        return im

    def peak(self):
        im = new(8, 3)
        rect(im, (0, 0, 8, 2), self.P['meter_hot'])
        return im

    def fill(self):
        c = self.P['line']
        return grad(4, 136, [(0, C(c, 120)), (0.6, C(c, 50)), (1, C(c, 18))])

    def seqbar(self, lit=True):
        def colour(t):
            c = self.P['seq']
            return c if lit else mix(c, self.P['window'], 0.8)
        im = segments(14, 128, 4, 1, colour)
        if lit:
            out = new(14, 128)
            put(out, blur(im, 1.0))
            put(out, im)
            return out
        return im

    def step_key(self, i, lit):
        im = new(44, 30)
        led = self.P['led'] if lit else mix(self.P['led'], (0, 0, 0), 0.72)
        if lit:
            glow_dot(im, 22, 5, 3, led, 2.0)
        else:
            disc(im, 22, 5, 3, led)
            disc(im, 21.3, 4.3, 1.0, (255, 255, 255, 60))
        m = mask(44, 30, lambda d, s: d.rounded_rectangle((5 * s, 11 * s, 39 * s, 28 * s), 3 * s, fill=255))
        put(im, drop_shadow(m, 0, 1, 1.2, 160))
        base = self.P['key_colours'][i] if 'key_colours' in self.P else self.P['button']
        if lit:
            base = mix(base, (255, 255, 255), 0.18)
        put(im, clip(grad(44, 30, [(0, mix(base, (255, 255, 255), 0.25)), (0.5, base), (1, mix(base, (0, 0, 0), 0.3))]), m))
        hl, sh = bevel(m, 1.0, 2.0)
        put(im, hl)
        put(im, sh)
        return im

    def knob(self, deg):
        raise NotImplementedError


# --- 2011: flat --------------------------------------------------------------------------------------

class SwissFlat(Theme):
    slug, name = 'swiss-flat-2011', 'Swiss Flat 2011'
    tintable = True
    palette = dict(bg='#EEEDE8', ink='#151515', mid='#8C8B86', rule='#CFCEC8', light='#DEDDD7',
                   paper='#F8F7F3', grid='#E9E8E2', grid_strong='#D6D5CF', blue='#2F5BEA', green='#13A866', black='#2A2A2A', orange='#FF6A13',
                   red='#E5322D')

    def lua_theme(self):
        P = self.P
        return dict(
            title=P['ink'], head=P['mid'], label='#6E6D68', value=P['ink'], accent=P['orange'],
            dim='#A9A8A2', foot=P['mid'], dot_on=P['ink'], dot_off=P['rule'],
            filter_line=P['ink'], filter_fill='#DCE3FA', filter_fill_how='rect',
            env_line=P['ink'], env_fill='#DCE3FA', env_fill_how='rect', env_glow=False,
            line_thick=2, snap=False,
            block=P['blue'], block_hi='#7D99F2', block_play=P['orange'], block_play_hi='#FFAB7A',
            playhead=P['orange'], bar='#BDBCB6',
            knob_tint=[P['blue'], P['green'], P['black'], P['orange']],
            load_bg=P['bg'], load_text=P['ink'], load_dim=P['mid'], load_track=P['rule'], load_bar=P['orange'],
            fonts=dict(title=(2, 15), head=(9, 11), label=(10, 9), value=(9, 14), big=(2, 22), foot=(9, 9), small=(2, 9)),
        )

    def surface(self, page):
        return new(W, H, self.P['bg'])

    def header(self, img):
        rect(img, (14, 29, 452, 2), self.P['ink'])

    def footer(self, img):
        rect(img, (14, 249, 452, 1), self.P['rule'])

    def display(self, img, box):
        x, y, w, h = box
        rect(img, box, self.P['rule'])
        rect(img, (x + 1, y + 1, w - 2, h - 2), self.P['paper'])

    def track(self, img, box):
        rect(img, box, self.P['light'])

    def ticks(self, img, x, y0, y1, n, colour=None, length=5, unity=None):
        Theme.ticks(self, img, x, y0, y1, n, self.P['rule'], length, unity)

    def divider(self, img, x, y0, y1):
        pass

    def meter_bg(self, img, x, y):
        rect(img, (x, y, 8, METER_H), self.P['light'])

    def seq_well(self, img, box):
        x, y, w, h = box
        rect(img, (x + 2, y, w - 4, h), '#E6E5DF')
        rect(img, (x, SEQ_BASE, w, 2), self.P['rule'])

    def seat(self, img, cx, cy):
        m = mask(W, H, lambda d, s: d.arc(((cx - 37.5) * s, (cy - 37.5) * s, (cx + 37.5) * s, (cy + 37.5) * s),
                                          120, 60, fill=255, width=int(4 * s)))
        put(img, paint(m, self.P['light']))

    def keybed(self, img):
        rect(img, (KB_X - 1, KB_Y - 1, 21 * KB_WHITE + 1, KB_WHITE_H + 2), self.P['rule'])

    def white_key(self, state):
        c = {'off': self.P['paper'], 'lit': self.P['blue'], 'play': self.P['orange']}[state]
        return new(KB_WHITE - 1, KB_WHITE_H, c)

    def black_key(self, state):
        c = {'off': self.P['ink'], 'lit': self.P['blue'], 'play': self.P['orange']}[state]
        im = new(KB_BLACK, KB_BLACK_H, c)
        return im

    def vcap(self):
        im = new(34, 40)
        rect(im, (4, 13, 26, 14), self.P['ink'])
        rect(im, (4, 19, 26, 2), self.P['paper'])
        return im

    def hcap(self):
        im = new(22, 28)
        rect(im, (5, 4, 12, 20), self.P['ink'])
        rect(im, (10, 4, 2, 20), self.P['paper'])
        return im

    def meter(self, lit=True):
        im = new(8, METER_H)
        rect(im, (0, 0, 8, 18), self.P['red'])
        rect(im, (0, 18, 8, 26), self.P['orange'])
        rect(im, (0, 44, 8, METER_H - 44), self.P['green'])
        for y in range(3, METER_H, 4):
            rect(im, (0, y, 8, 1), (0, 0, 0, 0))
        return im

    def glow(self):
        im = new(12, 12)
        disc(im, 6, 6, 3, self.P['ink'])
        return im

    def handle(self):
        im = new(14, 14)
        disc(im, 7, 7, 6, self.P['ink'])
        disc(im, 7, 7, 3.6, self.P['paper'])
        return im

    def peak(self):
        im = new(8, 3)
        rect(im, (0, 0, 8, 2), self.P['ink'])
        return im

    def fill(self):
        return new(4, 136, '#DCE3FA')

    def seqbar(self, lit=True):
        return new(14, 128, self.P['blue'])

    def step_key(self, i, lit):
        im = new(44, 30)
        disc(im, 22, 5, 3, self.P['orange'] if lit else self.P['rule'])
        rect(im, (5, 11, 34, 17), self.P['ink'] if lit else self.P['light'])
        return im

    def knob(self, deg):
        """Coverage, not colour: the device tints it per knob. A disc with a notch cut out (the
        panel shows through it) and the value arc around it."""
        cx = cy = 40
        m = Image.new('L', (80 * SS, 80 * SS), 0)
        d = ImageDraw.Draw(m)
        s = SS
        d.ellipse(((cx - 25) * s, (cy - 25) * s, (cx + 25) * s, (cy + 25) * s), fill=255)
        p0, p1 = pol(cx * s, cy * s, 8 * s, deg), pol(cx * s, cy * s, 20 * s, deg)
        d.line([p0, p1], fill=0, width=int(5 * s))
        for p in (p0, p1):
            d.ellipse((p[0] - 2.5 * s, p[1] - 2.5 * s, p[0] + 2.5 * s, p[1] + 2.5 * s), fill=0)
        if deg > -149.5:
            d.arc(((cx - 37.5) * s, (cy - 37.5) * s, (cx + 37.5) * s, (cy + 37.5) * s), -240, deg - 90, fill=255, width=int(4 * s))
            for a in (-150, deg):
                p = pol(cx * s, cy * s, 35.5 * s, a)
                d.ellipse((p[0] - 2 * s, p[1] - 2 * s, p[0] + 2 * s, p[1] + 2 * s), fill=255)
        return m.resize((80, 80), LANCZOS)


# --- 1983: a backlit dot-matrix LCD --------------------------------------------------------------------

class DotMatrix(Theme):
    slug, name = 'dot-matrix-1983', 'Dot Matrix 1983'
    palette = dict(lcd='#AFBF73', lcd_hi='#BCCB82', lcd_lo='#9DAE62', ink='#1E2913', mid='#56653A',
                   ghost='#9AAA5E', ghost2='#93A358', dim='#7C8C52')

    def lua_theme(self):
        P = self.P
        return dict(
            title=P['lcd_hi'], head=P['lcd_hi'], label=P['mid'], value=P['ink'], accent='#0B1205',
            dim=P['dim'], foot=P['mid'], dot_on=P['ink'], dot_off=P['ghost2'],
            filter_line=P['ink'], filter_fill='#8E9E55', filter_fill_how='sprite',
            env_line=P['ink'], env_fill='#8E9E55', env_fill_how='sprite', env_glow=False,
            line_thick=2, snap=True,
            block=P['mid'], block_hi=P['mid'], block_play=P['ink'], block_play_hi=P['ink'],
            playhead=P['ink'], bar=P['mid'],
            knob_tint=['#FFFFFF'] * 4,
            load_bg=P['lcd'], load_text=P['ink'], load_dim=P['mid'], load_track=P['ghost'], load_bar=P['ink'],
            fonts=dict(title=(0, 14), head=(2, 11), label=(2, 9), value=(10, 14), big=(0, 22), foot=(2, 9), small=(2, 9)),
        )

    def surface(self, page):
        P = self.P
        cx, cy = 200, 110
        base = field(W // 4, H // 4, lambda x, y: mix(P['lcd_hi'], P['lcd_lo'],
                     min(1.0, math.hypot((x * 4 - cx) / 330, (y * 4 - cy) / 230))))
        img = base.resize((W, H), BILINEAR)
        # the dot pitch: a faint darker line every third row and column
        lines = new(W, H)
        for x in range(2, W, 3):
            rect(lines, (x, 0, 1, H), C(P['lcd_lo'], 70))
        for y in range(2, H, 3):
            rect(lines, (0, y, W, 1), C(P['lcd_lo'], 70))
        put(img, lines)
        return img

    def header(self, img):
        rect(img, (0, 0, W, 29), self.P['ink'])

    def footer(self, img):
        for x in range(14, 466, 3):
            rect(img, (x, 249, 2, 1), self.P['ghost2'])

    def display(self, img, box):
        x, y, w, h = box
        rect(img, box, self.P['ink'])
        rect(img, (x + 1, y + 1, w - 2, h - 2), self.P['lcd'])
        rect(img, (x + 2, y + 2, w - 4, h - 4), C(self.P['lcd_hi'], 120))

    def grid(self, img, area, nx, ny, strong=False):
        x, y, w, h = area
        for i in range(1, nx):
            gx = x + round(i * w / nx)
            for gy in range(y, y + h, 3 if strong and i % 4 == 0 else 6):
                rect(img, (gx, gy, 1, 1), self.P['ghost2'])
        for j in range(1, ny):
            gy = y + round(j * h / ny)
            for gx in range(x, x + w, 6):
                rect(img, (gx, gy, 1, 1), self.P['ghost2'])

    def track(self, img, box):
        x, y, w, h = box
        for gx in range(x, x + w, 3):
            rect(img, (gx, y, 2, h), self.P['ghost'])

    def ticks(self, img, x, y0, y1, n, colour=None, length=5, unity=None):
        Theme.ticks(self, img, x, y0, y1, n, self.P['ghost2'], 4, unity)

    def divider(self, img, x, y0, y1):
        for y in range(y0, y1, 4):
            rect(img, (x, y, 1, 2), self.P['ghost'])

    def meter_bg(self, img, x, y):
        put(img, self.meter(lit=False), x, y)

    def seq_well(self, img, box):
        x, y, w, h = box
        put(img, self.seqbar(lit=False), x + (w - 14) // 2, SEQ_BASE - 128)

    def keybed(self, img):
        rect(img, (KB_X - 1, KB_Y - 1, 21 * KB_WHITE + 1, KB_WHITE_H + 2), self.P['ink'])

    def white_key(self, state):
        im = new(KB_WHITE - 1, KB_WHITE_H, self.P['lcd'] if state == 'off' else self.P['ink'])
        if state == 'lit':
            rect(im, (2, 2, KB_WHITE - 5, KB_WHITE_H - 4), self.P['mid'])
        return im

    def black_key(self, state):
        im = new(KB_BLACK, KB_BLACK_H, self.P['ink'])
        if state == 'lit':
            rect(im, (2, 2, KB_BLACK - 4, KB_BLACK_H - 4), self.P['mid'])
        elif state == 'play':
            rect(im, (2, 2, KB_BLACK - 4, KB_BLACK_H - 4), self.P['lcd_hi'])
        return im

    def vcap(self):
        im = new(34, 40)
        rect(im, (4, 14, 26, 12), self.P['ink'])
        rect(im, (6, 19, 22, 2), self.P['lcd_hi'])
        return im

    def hcap(self):
        im = new(22, 28)
        rect(im, (6, 4, 10, 20), self.P['ink'])
        rect(im, (10, 6, 2, 16), self.P['lcd_hi'])
        return im

    def meter(self, lit=True):
        return segments(8, METER_H, 4, 2, lambda t: self.P['ink'] if lit else self.P['ghost'])

    def glow(self):
        im = new(12, 12)
        rect(im, (4, 4, 4, 4), self.P['ink'])
        return im

    def handle(self):
        im = new(14, 14)
        rect(im, (2, 2, 10, 10), self.P['ink'])
        rect(im, (5, 5, 4, 4), self.P['lcd_hi'])
        return im

    def peak(self):
        im = new(8, 3)
        rect(im, (0, 0, 8, 2), self.P['ink'])
        return im

    def fill(self):
        im = new(4, 136)
        for y in range(136):
            for x in range(4):
                if (x + y) % 2 == 0:
                    im.putpixel((x, y), C('#8E9E55'))
        return im

    def seqbar(self, lit=True):
        return segments(14, 128, 4, 1, lambda t: self.P['ink'] if lit else self.P['ghost'])

    def step_key(self, i, lit):
        im = new(44, 30)
        ink = self.P['ink']
        rect(im, (19, 2, 6, 6), ink if lit else self.P['ghost'])
        rect(im, (5, 11, 34, 17), ink)
        if not lit:
            rect(im, (6, 12, 32, 15), self.P['lcd'])
            rect(im, (8, 14, 28, 11), C(self.P['ghost'], 160))
        return im

    def knob(self, deg):
        """Pixel art, not anti-aliased: a ring of LCD dots lit up to the value, a pointer of
        2 x 2 pixels, a circle of ghost pixels. Everything sits on a 2-pixel grid."""
        P = self.P
        im = new(80, 80)
        snap = lambda v: int(v) - int(v) % 2
        for k in range(25):
            a = -150 + 300 * k / 24
            x, y = pol(40, 40, 33, a)
            rect(im, (snap(x - 2), snap(y - 2), 4, 4), P['ink'] if a <= deg + 0.01 else P['ghost'])
        for k in range(48):
            x, y = pol(40, 40, 22, k * 7.5)
            rect(im, (snap(x - 1), snap(y - 1), 2, 2), P['mid'])
        for r in range(4, 21, 2):
            x, y = pol(40, 40, r, deg)
            rect(im, (snap(x - 1), snap(y - 1), 2, 2), P['ink'])
        rect(im, (38, 38, 4, 4), P['ink'])
        return im


# --- 1997: a red virtual analogue ----------------------------------------------------------------------

class RedLead(Theme):
    slug, name = 'red-lead-1997', 'Red Lead 1997'
    palette = dict(panel_top='#D2232A', panel_bot='#A8141B', groove_dark='#7A0C11', groove_light='#E2565A',
                   window='#130708', window_top='#1E0B0C', lip_dark='#5E0A0E', lip_light='#E35A5E',
                   grid='#2E1113', slot='#1A0809', tick='#F4B3AE', keybed='#140708',
                   ivory_top='#F1EEEA', ivory='#DDD8D2', ebony_top='#3A3A3E', ebony='#202023',
                   key_lit='#FF6A5E', key_play='#FFD447',
                   cap_top='#4A4A4F', cap='#333336', cap_bot='#1E1E21', cap_line='#F4F4F4',
                   meter='#4CFF5A', meter_warm='#FFD23A', meter_hot='#FF3B2F', line='#FF4B3E',
                   seq='#FF4B3E', led='#FF3326', button='#333336', glass=14, white='#FFFFFF')

    def lua_theme(self):
        return dict(
            title='#FFFFFF', head='#FFD9D6', label='#FFC9C4', value='#FFFFFF', accent='#FFD447',
            dim='#F09A94', foot='#FFC9C4', dot_on='#FFFFFF', dot_off='#6A0A0E',
            filter_line='#FF5245', filter_fill='#FF4B3E', filter_fill_how='sprite',
            env_line='#FF5245', env_fill='#FF4B3E', env_fill_how='sprite', env_glow=True,
            line_thick=2, snap=False,
            block='#E8352B', block_hi='#FF9088', block_play='#FFE7E2', block_play_hi='#FFFFFF',
            playhead='#FFD447', bar='#FF6A60',
            knob_tint=['#FFFFFF'] * 4,
            load_bg='#B8181F', load_text='#FFFFFF', load_dim='#FFC9C4', load_track='#7A0D12', load_bar='#FFFFFF',
            fonts=dict(title=(3, 15), head=(10, 11), label=(10, 9), value=(2, 13), big=(3, 24), foot=(10, 9), small=(2, 9)),
        )

    def surface(self, page):
        img = Theme.surface(self, page)
        img = modulate(img, noise(W // 2, H // 2, 1997, 1.0).resize((W, H), BILINEAR), 0.035)
        sheen = grad(W, H, [(0, (255, 255, 255, 26)), (0.35, (255, 255, 255, 0)), (1, (0, 0, 0, 30))])
        put(img, sheen)
        return img

    def seat(self, img, cx, cy):
        """A smoked ring the knob's LEDs shine through: red LEDs on a red panel would vanish."""
        ring = mask(W, H, lambda d, s: (d.ellipse(((cx - 38) * s, (cy - 38) * s, (cx + 38) * s, (cy + 38) * s), fill=255),
                                       d.ellipse(((cx - 27) * s, (cy - 27) * s, (cx + 27) * s, (cy + 27) * s), fill=0)))
        lip = mask(W, H, lambda d, s: d.ellipse(((cx - 38) * s, (cy - 37) * s, (cx + 38) * s, (cy + 39) * s), fill=255))
        put(img, paint(lip, self.P['lip_light']))
        put(img, paint(ring, self.P['window']))
        inner = mask(W, H, lambda d, s: d.ellipse(((cx - 38) * s, (cy - 38) * s, (cx + 38) * s, (cy + 38) * s), fill=255))
        put(img, paint(ImageChops.multiply(ImageChops.subtract(inner, ImageChops.offset(inner, 0, 2)), ring), (0, 0, 0, 255)))
        disc(img, cx, cy, 27, self.P['panel_bot'])

    def knob(self, deg):
        im = new(80, 80)
        cx = cy = 40
        for k in range(15):
            a = -150 + 300 * k / 14
            x, y = pol(cx, cy, 33, a)
            if a <= deg + 0.01:
                glow_dot(im, x, y, 2.4, '#FF3326', 1.2)
                disc(im, x - 0.5, y - 0.5, 0.9, (255, 220, 210, 230))
            else:
                disc(im, x, y + 0.6, 2.5, (255, 140, 140, 70))
                disc(im, x, y, 2.4, '#4E0C10')
        body = mask(80, 80, lambda d, s: d.ellipse(((cx - 24) * s, (cy - 24) * s, (cx + 24) * s, (cy + 24) * s), fill=255))
        put(im, drop_shadow(body, 2, 3, 2.5, 190))
        side = field(80, 80, lambda x, y: mix('#3C3C40', '#141416', max(0, min(1, ((x - 20) + (y - 20)) / 48))))
        put(im, clip(side, body))
        top = mask(80, 80, lambda d, s: d.ellipse(((cx - 19) * s, (cy - 20) * s, (cx + 19) * s, (cy + 18) * s), fill=255))
        cap = field(80, 80, lambda x, y: mix('#46464B', '#232326', max(0, min(1, (y - 21) / 38))))
        put(im, clip(cap, top))
        hl, sh = bevel(top, 1.2, 2.0)
        put(im, hl)
        rim = mask(80, 80, lambda d, s: d.arc(((cx - 23.5) * s, (cy - 23.5) * s, (cx + 23.5) * s, (cy + 23.5) * s), 200, 290, fill=255, width=int(1.2 * s)))
        put(im, paint(rim, (255, 255, 255, 70)))
        line = mask(80, 80, lambda d, s: d.line([pol(cx * s, (cy - 1) * s, 7 * s, deg), pol(cx * s, (cy - 1) * s, 17 * s, deg)], fill=255, width=int(2.6 * s)))
        put(im, paint(line, '#F4F4F4'))
        return im


# --- 1980: a rhythm composer's plastic -----------------------------------------------------------------

class RhythmBox(Theme):
    slug, name = 'rhythm-box-1980', 'Rhythm Box 1980'
    palette = dict(panel_top='#333336', panel_bot='#28282A', groove_dark='#18181A', groove_light='#46464A',
                   window='#111112', window_top='#1B1B1D', lip_dark='#151516', lip_light='#4C4C50',
                   grid='#242426', slot='#0E0E0F', tick='#8E8C86', keybed='#111112',
                   ivory_top='#F2EBD7', ivory='#E2D9C1', ebony_top='#3A3A3C', ebony='#1B1B1C',
                   key_lit='#F07F1A', key_play='#F2C514',
                   cap_top='#F4EEDD', cap='#E6DFC9', cap_bot='#C8C0A8', cap_line='#1B1B1C',
                   meter='#FF2A1A', meter_warm='#FF2A1A', meter_hot='#FF2A1A', line='#F2A33A',
                   seq='#F07F1A', led='#FF2A1A', button='#E6DFC9', glass=12,
                   red='#D7262A', orange='#F07F1A', yellow='#F2C514', cream='#E8E1CC',
                   key_colours=['#D7262A', '#D7262A', '#F07F1A', '#F07F1A', '#F2C514', '#F2C514', '#E8E1CC', '#E8E1CC'])

    def lua_theme(self):
        return dict(
            title='#EDE6CF', head='#A9A6A0', label='#C9C4B5', value='#F4EFE2', accent='#F2C514',
            dim='#77746E', foot='#8E8C86', dot_on='#F07F1A', dot_off='#4A4A4C',
            filter_line='#F2A33A', filter_fill='#F07F1A', filter_fill_how='sprite',
            env_line='#F2A33A', env_fill='#F07F1A', env_fill_how='sprite', env_glow=True,
            line_thick=2, snap=False,
            block='#F07F1A', block_hi='#FFB36B', block_play='#F2C514', block_play_hi='#FFF0A0',
            playhead='#D7262A', bar='#F07F1A',
            knob_tint=['#FFFFFF'] * 4,
            load_bg='#2B2B2D', load_text='#EDE6CF', load_dim='#8E8C86', load_track='#46464A', load_bar='#F07F1A',
            fonts=dict(title=(0, 15), head=(2, 11), label=(2, 9), value=(10, 14), big=(0, 24), foot=(10, 9), small=(2, 9)),
        )

    def surface(self, page):
        img = Theme.surface(self, page)
        return modulate(img, noise(W // 2, H // 2, 1980, 0.9).resize((W, H), BILINEAR), 0.05)

    def header(self, img):
        colours = [self.P['red'], self.P['orange'], self.P['yellow'], self.P['cream']]
        for k, c in enumerate(colours):
            rect(img, (k * 120, 27, 120, 3), c)
        rect(img, (0, 30, W, 1), self.P['groove_dark'])

    def meter(self, lit=True):
        im = new(8, METER_H)
        for k in range(18):
            y = METER_H - 4 - k * 8
            if lit:
                glow_dot(im, 4, y, 2.6, '#FF2A1A', 1.4)
                disc(im, 3.4, y - 0.7, 0.9, (255, 220, 200, 220))
            else:
                disc(im, 4, y, 2.8, '#3A1311')
                disc(im, 3.4, y - 0.8, 0.9, (255, 255, 255, 40))
        return im

    def meter_bg(self, img, x, y):
        put(img, self.meter(lit=False), x, y)

    def peak(self):
        im = new(8, 3)
        rect(im, (1, 0, 6, 2), '#FFE0A0')
        return im

    def seqbar(self, lit=True):
        im = new(14, 128)
        if not lit:
            return im
        put(im, grad(14, 128, [(0, '#C45E0E'), (0.25, '#FFB060'), (0.45, '#F07F1A'), (1, '#9A4A0A')], vertical=False))
        for y in range(4, 128, 8):
            rect(im, (0, y, 14, 1), (0, 0, 0, 60))
        return im

    def seat(self, img, cx, cy):
        self.scale(img, cx, cy, 31.5, 36, self.P['tick'], majors=11)

    def knob(self, deg):
        im = new(80, 80)
        cx = cy = 40
        skirt = mask(80, 80, lambda d, s: d.ellipse(((cx - 27) * s, (cy - 27) * s, (cx + 27) * s, (cy + 27) * s), fill=255))
        put(im, drop_shadow(skirt, 2, 3, 2.5, 200))
        put(im, clip(field(80, 80, lambda x, y: mix('#5A5A5E', '#1E1E20', max(0, min(1, ((x - 13) + (y - 13)) / 54)))), skirt))
        ribs = mask(80, 80, lambda d, s: [d.line([pol(cx * s, cy * s, 20 * s, deg + k * 10), pol(cx * s, cy * s, 27 * s, deg + k * 10)], fill=255, width=int(1.2 * s)) for k in range(36)])
        put(im, paint(ribs, (0, 0, 0, 90)))
        hl, sh = bevel(skirt, 1.4, 2.5)
        put(im, hl)
        tick = mask(80, 80, lambda d, s: d.line([pol(cx * s, cy * s, 21 * s, deg), pol(cx * s, cy * s, 26.5 * s, deg)], fill=255, width=int(2.2 * s)))
        put(im, paint(tick, '#F4EEDD'))
        cap = mask(80, 80, lambda d, s: d.ellipse(((cx - 17) * s, (cy - 17) * s, (cx + 17) * s, (cy + 17) * s), fill=255))
        put(im, drop_shadow(cap, 1, 1, 1.2, 160))
        dome = field(80, 80, lambda x, y: mix('#FBF6E8', '#B9B095', max(0, min(1, math.hypot(x - 34, y - 33) / 24))))
        put(im, clip(dome, cap))
        line = mask(80, 80, lambda d, s: d.line([pol(cx * s, cy * s, 4 * s, deg), pol(cx * s, cy * s, 15 * s, deg)], fill=255, width=int(3 * s)))
        put(im, paint(line, '#F07F1A'))
        hl, sh = bevel(cap, 1.0, 2.0)
        put(im, sh)
        return im


# --- 1971: walnut cheeks and a black panel -------------------------------------------------------------

class Walnut(Theme):
    slug, name = 'walnut-1971', 'Walnut 1971'
    palette = dict(panel_top='#1E1E1E', panel_bot='#121212', groove_dark='#050505', groove_light='#2E2E2E',
                   window='#0A0806', window_top='#14100B', lip_dark='#050505', lip_light='#6A6C6E',
                   grid='#2A2117', slot='#060606', tick='#E8E8E8', keybed='#0B0B0B',
                   ivory_top='#FBF4E2', ivory='#E9DEC2', ebony_top='#2C2724', ebony='#0F0D0C',
                   key_lit='#FFB347', key_play='#FFE2A8',
                   cap_top='#3A3A3A', cap='#1E1E1E', cap_bot='#0A0A0A', cap_line='#F2F2F2',
                   meter='#FFB347', meter_warm='#FFB347', meter_hot='#FFE0A0', line='#FFC46B',
                   seq='#FFB347', led='#FF4A2A', button='#1C1C1C', glass=16,
                   wood_dark='#3A1F10', wood='#6B3C1F', wood_light='#9A5D33', alu='#C9CCCF')

    def lua_theme(self):
        return dict(
            title='#F2F2F2', head='#BDBDBD', label='#BEBEBE', value='#F4F1EA', accent='#FFB347',
            dim='#7C7C7C', foot='#9A9A9A', dot_on='#FFB347', dot_off='#3A3A3A',
            filter_line='#FFC46B', filter_fill='#FFB347', filter_fill_how='sprite',
            env_line='#FFC46B', env_fill='#FFB347', env_fill_how='sprite', env_glow=True,
            line_thick=2, snap=False,
            block='#E89A3C', block_hi='#FFD08A', block_play='#FFF1C9', block_play_hi='#FFFFFF',
            playhead='#FFB347', bar='#C08A50',
            knob_tint=['#FFFFFF'] * 4,
            load_bg='#151515', load_text='#F2F2F2', load_dim='#9A9A9A', load_track='#2E2E2E', load_bar='#FFB347',
            fonts=dict(title=(10, 14), head=(9, 11), label=(10, 9), value=(9, 14), big=(7, 26), foot=(9, 9), small=(10, 9)),
        )

    def surface(self, page):
        P = self.P
        img = Theme.surface(self, page)
        img = modulate(img, noise(W, H, 71, 0, stretch=(24, 1)), 0.05)
        grain = noise(6, H, 1971 + page, 0, stretch=(1, 10))
        streak = noise(6, H, 1972 + page, 0.8, stretch=(1, 40))
        for x0 in (0, W - 6):
            wood = field(6, H, lambda x, y: mix(P['wood_dark'], P['wood_light'],
                                                 (streak.getpixel((x, y)) * 0.65 + grain.getpixel((x, y)) * 0.35) / 255))
            rect(wood, (2 if x0 == 0 else 3, 0, 1, H), (255, 220, 180, 34))
            put(img, wood, x0)
            rect(img, (5 if x0 == 0 else W - 6, 0, 1, H), (0, 0, 0, 200))
        return img

    def header(self, img):
        put(img, grad(W - 12, 3, [(0, '#9A9DA0'), (0.5, '#E2E4E6'), (1, '#55585B')]), 6, 29)

    def display(self, img, box):
        x, y, w, h = box
        rgrad(img, (x - 2, y - 2, w + 4, h + 4), 5, [(0, '#E4E6E8'), (0.5, '#8A8D90'), (1, '#4A4C4E')])
        recess(img, box, 4, self.P['window'], '#000000', '#3A3B3C', stops=[(0, self.P['window_top']), (1, self.P['window'])])
        g = mask(w, h, lambda d, s: d.polygon([(0, 0), (w * 0.42 * s, 0), (w * 0.18 * s, h * s), (0, h * s)], fill=255))
        put(img, paint(g.point(lambda v: v * 12 // 255), (255, 255, 255, 255)), x, y)

    def meter(self, lit=True):
        def colour(t):
            c = mix('#FF8A2A', '#FFE2A0', t)
            return c if lit else mix(c, '#140E08', 0.86)
        im = segments(8, METER_H, 5, 1, colour)
        if lit:
            out = new(8, METER_H)
            put(out, blur(im, 1.5))
            put(out, im)
            for y in range(0, METER_H, 6):
                rect(out, (3, y, 2, 4), (255, 255, 230, 60))
            return out
        return im

    def seqbar(self, lit=True):
        im = new(14, 128)
        if not lit:
            rect(im, (0, 0, 14, 128), '#140E08')
            return im
        put(im, grad(14, 128, [(0, '#B85A10'), (0.3, '#FFC870'), (0.5, '#FFF0C8'), (0.7, '#FFC870'), (1, '#B85A10')], vertical=False))
        return im

    def seat(self, img, cx, cy):
        self.scale(img, cx, cy, 32, 37, '#E8E8E8', minor=True)

    def keybed(self, img):
        Theme.keybed(self, img)
        rect(img, (KB_X, KB_Y - 1, 21 * KB_WHITE, 2), '#7A1414')

    def vcap(self):
        im = Theme.vcap(self)
        rect(im, (7, 7, 20, 3), self.P['alu'])
        return im

    def step_key(self, i, lit):
        im = new(44, 30)
        if lit:
            glow_dot(im, 22, 5, 3.6, '#FF5A2A', 2.4)
            disc(im, 21, 4, 1.4, (255, 230, 200, 230))
        else:
            disc(im, 22, 5, 4.2, '#2A0A06')
            disc(im, 22, 5, 3.4, '#5A140C')
            disc(im, 21, 4, 1.2, (255, 255, 255, 80))
        m = mask(44, 30, lambda d, s: d.rounded_rectangle((6 * s, 12 * s, 38 * s, 28 * s), 2 * s, fill=255))
        put(im, drop_shadow(m, 0, 1, 1.2, 200))
        put(im, clip(grad(44, 30, [(0, '#3A3A3A'), (0.5, '#1C1C1C'), (1, '#0A0A0A')]), m))
        hl, sh = bevel(m, 1.0, 2.5)
        put(im, hl)
        put(im, sh)
        return im

    def knob(self, deg):
        """A fluted black skirt (its flutes turn with it, the light does not), an aluminium cap,
        the pointer on the skirt."""
        im = new(80, 80)
        cx = cy = 40

        def flutes(d, s):
            pts = []
            for k in range(360):
                a = k * 1.0
                r = 26.5 - 1.7 * abs(math.cos(math.radians((a - deg) * 8)))
                pts.append(pol(cx * s, cy * s, r * s, a))
            d.polygon(pts, fill=255)
        skirt = mask(80, 80, flutes)
        put(im, drop_shadow(skirt, 2, 4, 3, 210))
        put(im, clip(field(80, 80, lambda x, y: mix('#3A3A3A', '#050505', max(0, min(1, ((x - 14) + (y - 14)) / 50)))), skirt))
        hl, sh = bevel(skirt, 1.0, 4.0)
        put(im, hl)
        put(im, sh)
        line = mask(80, 80, lambda d, s: d.line([pol(cx * s, cy * s, 17 * s, deg), pol(cx * s, cy * s, 25 * s, deg)], fill=255, width=int(2.4 * s)))
        put(im, paint(line, '#F2F2F2'))
        cap = mask(80, 80, lambda d, s: d.ellipse(((cx - 14.5) * s, (cy - 14.5) * s, (cx + 14.5) * s, (cy + 14.5) * s), fill=255))
        put(im, drop_shadow(cap, 0, 1, 1.0, 180))
        alu = field(80, 80, lambda x, y: mix('#F2F4F6', '#7E8286', max(0, min(1, ((x - 28) * 0.8 + (y - 26)) / 30))))
        ring = field(80, 80, lambda x, y: (255, 255, 255, int(28 * math.sin(math.hypot(x - cx, y - cy) * 2.3) ** 2)))
        put(alu, ring)
        put(im, clip(alu, cap))
        hl, sh = bevel(cap, 1.0, 2.0)
        put(im, hl)
        put(im, sh)
        return im


# --- 1958: test-bench enamel, a cathode-ray tube, chicken-head knobs ----------------------------------

class TestBench(Theme):
    slug, name = 'test-bench-1958', 'Test Bench 1958'
    palette = dict(panel_top='#66746A', panel_bot='#4D5A50', groove_dark='#323B34', groove_light='#7E8C81',
                   window='#040A06', window_top='#0B1A0F', lip_dark='#2E3630', lip_light='#87958A',
                   grid='#1C4227', slot='#141815', tick='#EDE4C8', keybed='#121412',
                   ivory_top='#F2E8C8', ivory='#DCCFA6', ebony_top='#33302A', ebony='#12110F',
                   key_lit='#FFB04A', key_play='#FFE6A8',
                   cap_top='#3E3E3C', cap='#1C1C1B', cap_bot='#070707', cap_line='#EDE4C8',
                   meter='#FF7A2A', meter_warm='#FF7A2A', meter_hot='#FF9A4A', line='#8DFFA4',
                   seq='#FF7A2A', led='#FFB04A', button='#1A1A19', glass=0, cream='#EDE4C8')

    def lua_theme(self):
        return dict(
            title='#EDE4C8', head='#E6DDC2', label='#E3DCC6', value='#FFF8E6', accent='#FFB04A',
            dim='#A8AE9F', foot='#D2CCB6', dot_on='#FFB04A', dot_off='#3E4840',
            filter_line='#9DFFB0', filter_fill='#5EE07A', filter_fill_how='sprite',
            env_line='#A8FFB8', env_fill='#5EE07A', env_fill_how='sprite', env_glow=True,
            line_thick=2, snap=False,
            block='#4FD46E', block_hi='#B8FFC8', block_play='#F2FFF4', block_play_hi='#FFFFFF',
            playhead='#9DFFB0', bar='#FFB04A',
            knob_tint=['#FFFFFF'] * 4,
            load_bg='#06100A', load_text='#9DFFB0', load_dim='#4FA866', load_track='#163A20', load_bar='#9DFFB0',
            fonts=dict(title=(0, 14), head=(2, 11), label=(2, 9), value=(10, 14), big=(0, 24), foot=(2, 9), small=(2, 9)),
        )

    def surface(self, page):
        img = Theme.surface(self, page)
        # hammertone: blurred cells, shaded as if struck from the top left
        n = noise(W, H, 1958, 2.2)
        hl, sh = bevel(n, 0.8, 1.6)
        hl.putalpha(hl.getchannel('A').point(lambda v: v * 70 // 255))
        sh.putalpha(sh.getchannel('A').point(lambda v: v * 90 // 255))
        img = modulate(img, n, 0.10)
        put(img, hl)
        put(img, sh)
        for sx, sy in ((6, 6), (W - 6, 6), (6, H - 6), (W - 6, H - 6)):
            self.screw(img, sx, sy, (sx * 31 + sy * 17) % 180)
        return img

    def screw(self, img, cx, cy, deg):
        """A slotted nickel screw head, 8 px across."""
        head = new(14, 14)
        m = mask(14, 14, lambda d, s: d.ellipse((3 * s, 3 * s, 11 * s, 11 * s), fill=255))
        put(head, drop_shadow(m, 1, 1, 1.0, 150))
        put(head, clip(grad(14, 14, [(0.2, '#E8ECEA'), (0.8, '#7C8280')]), m))
        slot = mask(14, 14, lambda d, s: d.line([pol(7 * s, 7 * s, 3.4 * s, deg), pol(7 * s, 7 * s, 3.4 * s, deg + 180)], fill=255, width=int(1.2 * s)))
        put(head, paint(slot, (40, 44, 42, 220)))
        put(img, head, cx - 7, cy - 7)

    def header(self, img):
        m = mask(262, 24, lambda d, s: d.rounded_rectangle((0, 0, 262 * s - 1, 24 * s - 1), 3 * s, fill=255))
        put(img, drop_shadow(m, 1, 1, 1.0, 140), 4, 3)
        put(img, clip(grad(262, 24, [(0, '#2C2E2C'), (0.45, '#141514'), (1, '#060606')]), m), 4, 3)
        put(img, clip(grad(262, 24, [(0, (255, 255, 255, 30)), (0.5, (255, 255, 255, 0))]), m), 4, 3)
        disc(img, 259, 15, 1.6, '#B8BCB8')
        rect(img, (0, 30, W, 1), self.P['groove_dark'])
        rect(img, (0, 31, W, 1), self.P['groove_light'])

    def display(self, img, box):
        """A cathode-ray tube behind a black bezel: a green-black face, brighter in the middle."""
        x, y, w, h = box
        bez = mask(w + 8, h + 8, lambda d, s: d.rounded_rectangle((0, 0, (w + 8) * s - 1, (h + 8) * s - 1), 9 * s, fill=255))
        put(img, drop_shadow(bez, 1, 2, 2.0, 170), x - 4, y - 4)
        put(img, clip(grad(w + 8, h + 8, [(0, '#3A3B3A'), (0.08, '#1A1B1A'), (0.92, '#0C0C0C'), (1, '#262726')]), bez), x - 4, y - 4)
        face = mask(w, h, lambda d, s: d.rounded_rectangle((0, 0, w * s - 1, h * s - 1), 7 * s, fill=255))
        glow = field(w // 4, h // 4, lambda gx, gy: mix('#0F2A17', '#020604', min(1, math.hypot((gx * 4 - w / 2) / (w * 0.62), (gy * 4 - h / 2) / (h * 0.75)))))
        put(img, clip(glow.resize((w, h), BILINEAR), face), x, y)
        inner_shadow(img, box, 7, 220, 2, 3.0)
        spec = mask(w, h, lambda d, s: d.ellipse((w * 0.04 * s, h * 0.06 * s, w * 0.5 * s, h * 0.42 * s), fill=255))
        put(img, paint(blur(spec, 6).point(lambda v: v * 22 // 255), (220, 255, 230, 255)), x, y)

    def grid(self, img, area, nx, ny, strong=False):
        x, y, w, h = area
        g = '#173B22'
        for i in range(1, nx):
            rect(img, (x + round(i * w / nx), y, 1, h), '#215A31' if strong and i % 4 == 0 else g)
        for j in range(1, ny):
            rect(img, (x, y + round(j * h / ny), w, 1), g)
        for i in range(0, nx * 5):
            rect(img, (x + round(i * w / (nx * 5)), y + h // 2 - 1, 1, 3), g)

    def meter(self, lit=True):
        def colour(t):
            return '#FF7A2A' if lit else '#3A2A22'
        im = segments(8, METER_H, 3, 1, colour)
        if lit:
            out = new(8, METER_H)
            put(out, blur(im, 1.6))
            put(out, blur(im, 0.6))
            put(out, im)
            return out
        return im

    def meter_bg(self, img, x, y):
        recess(img, (x - 2, y - 2, 12, METER_H + 4), 5, '#120C0A', self.P['lip_dark'], self.P['lip_light'])
        put(img, self.meter(lit=False), x, y)
        put(img, grad(12, METER_H + 4, [(0, (255, 255, 255, 0)), (0.3, (255, 255, 255, 26)), (0.5, (255, 255, 255, 0))], vertical=False), x - 2, y - 2)

    def seqbar(self, lit=True):
        im = segments(14, 128, 3, 1, lambda t: '#FF7A2A' if lit else '#3A2A22')
        if lit:
            out = new(14, 128)
            put(out, blur(im, 1.4))
            put(out, im)
            return out
        return im

    def seq_well(self, img, box):
        recess(img, box, 7, '#120C0A', self.P['lip_dark'], self.P['lip_light'])
        x, y, w, h = box
        put(img, self.seqbar(lit=False), x + (w - 14) // 2, SEQ_BASE - 128)
        put(img, grad(w, h, [(0, (255, 255, 255, 0)), (0.3, (255, 255, 255, 22)), (0.5, (255, 255, 255, 0))], vertical=False), x, y)

    def seat(self, img, cx, cy):
        self.scale(img, cx, cy, 32.5, 37.5, self.P['cream'], minor=True, width=1.4)

    def step_key(self, i, lit):
        """A jewel lamp over a black Bakelite push button."""
        im = new(44, 30)
        disc(im, 22, 6, 5.2, '#8A8E8A')
        disc(im, 22, 6, 4.4, '#3A3C3A')
        if lit:
            glow_dot(im, 22, 6, 3.8, '#FFB04A', 2.4)
            disc(im, 21, 5, 1.4, (255, 250, 230, 240))
        else:
            disc(im, 22, 6, 3.8, '#4A2A0A')
            disc(im, 20.8, 4.8, 1.3, (255, 255, 255, 90))
        m = mask(44, 30, lambda d, s: d.rounded_rectangle((8 * s, 14 * s, 36 * s, 28 * s), 6 * s, fill=255))
        put(im, drop_shadow(m, 0, 2, 1.4, 200))
        put(im, clip(grad(44, 30, [(0, '#4A4A48'), (0.55, '#1A1A19'), (1, '#050505')]), m))
        hl, sh = bevel(m, 1.2, 3.0)
        put(im, hl)
        put(im, sh)
        return im

    def knob(self, deg):
        """A chicken-head pointer in black Bakelite: the whole silhouette turns, the gloss stays."""
        im = new(80, 80)
        cx = cy = 40

        def shape(d, s):
            d.ellipse(((cx - 19) * s, (cy - 19) * s, (cx + 19) * s, (cy + 19) * s), fill=255)
            tip, tail = pol(cx, cy, 32, deg), pol(cx, cy, 16, deg + 180)
            l, r = pol(cx, cy, 9, deg - 90), pol(cx, cy, 9, deg + 90)
            tl, tr = pol(tip[0], tip[1], 3.2, deg - 90), pol(tip[0], tip[1], 3.2, deg + 90)
            al, ar = pol(tail[0], tail[1], 5, deg - 90), pol(tail[0], tail[1], 5, deg + 90)
            d.polygon([(p[0] * s, p[1] * s) for p in (tl, tr, r, ar, al, l)], fill=255)
            d.ellipse(((tip[0] - 3.2) * s, (tip[1] - 3.2) * s, (tip[0] + 3.2) * s, (tip[1] + 3.2) * s), fill=255)
            d.ellipse(((tail[0] - 5) * s, (tail[1] - 5) * s, (tail[0] + 5) * s, (tail[1] + 5) * s), fill=255)
        m = mask(80, 80, shape)
        put(im, drop_shadow(m, 2, 4, 2.8, 220))
        put(im, clip(field(80, 80, lambda x, y: mix('#3C3C3A', '#060606', max(0, min(1, ((x - 18) + (y - 18)) / 46)))), m))
        hl, sh = bevel(m, 1.6, 3.5)
        put(im, hl)
        put(im, sh)
        spec = mask(80, 80, lambda d, s: d.ellipse(((cx - 12) * s, (cy - 13) * s, (cx + 2) * s, (cy - 3) * s), fill=255))
        put(im, paint(ImageChops.multiply(blur(spec, 2.5), m).point(lambda v: v * 90 // 255), (255, 255, 255, 255)))
        line = mask(80, 80, lambda d, s: d.line([pol(cx * s, cy * s, 5 * s, deg), pol(cx * s, cy * s, 29 * s, deg)], fill=255, width=int(2.2 * s)))
        put(im, paint(line, '#EDE4C8'))
        return im


THEMES = [SwissFlat, DotMatrix, RedLead, RhythmBox, Walnut, TestBench]

# --- assembling a design -------------------------------------------------------------------------------


def background(th, page):
    img = th.surface(page)
    th.header(img)
    th.footer(img)
    if page == 0:
        for x in KNOB_X:
            th.seat(img, x + 40, KNOB_Y + 40)
        th.display(img, FILTER_WIN)
        th.grid(img, FILTER, 10, 3)
    elif page == 1:
        for i in range(8):
            x0 = i * STRIP
            th.track(img, (x0 + SLOT_DX - 2, 52, 4, 152))
            unity = CAP_TOP + 20 + round((127 - 100) * CAP_TRAVEL / 127)
            th.ticks(img, x0 + 4, CAP_TOP + 20, CAP_TOP + 20 + CAP_TRAVEL, 9, unity=unity)
            th.meter_bg(img, x0 + METER_DX, METER_Y)
            if i:
                th.divider(img, x0, 36, 236)
    elif page == 2:
        th.display(img, ENV_WIN)
        th.grid(img, (ENV_X, ENV_BASE - 132 - 6, 440, 138), 8, 4)
        for i in range(4):
            th.track(img, (20 + i * 112 + 8, TRACK_Y, 88, 4))
    elif page == 3:
        for i in range(8):
            x0 = i * STRIP
            th.seq_well(img, (x0 + STRIP // 2 - 9, SEQ_WELL_Y, 18, 134))
            if i:
                th.divider(img, x0, 36, 240)
    elif page == 4:
        th.keyboard(img)
        th.display(img, LANE_WIN)
        th.grid(img, LANE[:4], 16, 4, strong=True)
        for i in range(8):
            th.track(img, (i * STRIP + 8, TRACK_Y, 44, 4))
    return img.convert('RGBA')


def parts_atlas(th):
    atlas = new(W, PARTS_TOP + 2 * H)
    pieces = {'vcap': th.vcap(), 'hcap': th.hcap(), 'meter': th.meter(), 'glow': th.glow(),
              'handle': th.handle(), 'fill': th.fill(), 'peak': th.peak(), 'seqbar': th.seqbar(),
              'wlit': th.white_key('lit'), 'wplay': th.white_key('play'),
              'black': th.black_key('off'), 'blit': th.black_key('lit'), 'bplay': th.black_key('play')}
    for i in range(8):
        pieces['key%d' % (i + 1)] = th.step_key(i, False)
        pieces['key_on%d' % (i + 1)] = th.step_key(i, True)
    for name, im in pieces.items():
        x, y, w, h = SPRITES[name]
        assert im.size == (w, h), (th.slug, name, im.size, (w, h))
        atlas.paste(im, (x, y))
    atlas.paste(background(th, 3), (0, PARTS_TOP))
    atlas.paste(background(th, 4), (0, PARTS_TOP + H))
    return atlas


def knob_strip(th):
    if th.tintable:
        strip = Image.new('L', (KNOB, KNOB * KNOB_FRAMES), 0)
        for f in range(KNOB_FRAMES):
            strip.paste(th.knob(knob_angle(f)), (0, f * KNOB))
        # the format the CTRL49 tints: 8-bit palette of 256 greys, index = grey = coverage
        pal = Image.frombytes('P', strip.size, strip.tobytes())
        pal.putpalette([v for i in range(256) for v in (i, i, i)])
        return pal
    strip = new(KNOB, KNOB * KNOB_FRAMES)
    for f in range(KNOB_FRAMES):
        strip.paste(th.knob(knob_angle(f)), (0, f * KNOB))
    return strip


def lua_value(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str) and re.fullmatch(r'#[0-9A-Fa-f]{6}', v):
        return argb(v)
    if isinstance(v, str):
        return '"%s"' % v
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, tuple)):
        return '{ ' + ', '.join(lua_value(x) for x in v) + ' }'
    raise TypeError(v)


def lua_table(name, d):
    lines = ['local %s = {' % name]
    for k in sorted(d):
        lines.append('    %s = %s,' % (k, lua_value(d[k])))
    lines.append('}')
    return '\n'.join(lines)


def skin_lua(th):
    theme = th.lua_theme()
    fonts = theme.pop('fonts')
    fonts.setdefault('cell', (fonts['value'][0], 11))     # the arpeggiator's eight 60 px cells
    for k, f in fonts.items():
        theme['f_' + k] = list(f)
    theme['name'] = th.name.upper()
    theme['titles'] = [p.upper() for p in PAGES]
    block = '\n'.join([
        '-- BEGIN GENERATED (make_era_designs.py writes this block per design)',
        '-- %s. Generated: edit make_era_designs.py and EraSkin.lua, then regenerate.' % th.name,
        lua_table('T', theme), lua_table('L', LAYOUT),
        lua_table('S', {k: list(v) for k, v in SPRITES.items()}),
        '-- END GENERATED'])
    template = open(TEMPLATE, encoding='utf-8').read()
    pattern = re.compile(r'-- BEGIN GENERATED.*?-- END GENERATED', re.S)
    assert len(pattern.findall(template)) == 1, 'EraSkin.lua must hold exactly one GENERATED block'
    return pattern.sub(lambda _: block, template)


def manifest(th):
    out = ['; %s - a CTRL49 screen-lab preset. Generated by make_era_designs.py.' % th.name,
           '; Run: Ctrl49ScreenLab.exe preset "<this file>"   (--check validates without MIDI)',
           '[Preset]', 'version=1', 'name=%s' % th.name, 'width=%d' % W, 'height=%d' % H,
           'lua=Skin.lua', 'pages=%d' % len(PAGES), 'envelopePage=2', 'fps=%d' % FPS,
           'assets=%d' % len(ASSETS), '']
    for i, (ident, name) in enumerate(ASSETS):
        out += ['[Asset%d]' % i, 'id=%d' % ident, 'file=%s' % name, '']
    for p, title in enumerate(PAGES):
        out += ['[Page%d]' % p, 'title=%s' % title, 'encoders=%d' % ENCODERS[p]]
        out += ['e%d=%d' % (i + 1, v) for i, v in enumerate(DEFAULTS[p])]
        out.append('')
    return '\n'.join(out)


def build(th):
    folder = os.path.join(HERE, th.slug)
    os.makedirs(folder, exist_ok=True)
    panels = new(W, 3 * H)
    for p in range(3):
        panels.paste(background(th, p), (0, p * H))
    panels.save(os.path.join(folder, 'panels.png'), optimize=True)
    knob_strip(th).save(os.path.join(folder, 'knobs.png'), optimize=not th.tintable)
    parts_atlas(th).save(os.path.join(folder, 'parts.png'), optimize=True)
    with open(os.path.join(folder, 'Skin.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(skin_lua(th))
    with open(os.path.join(folder, 'Design.ctrl49preset'), 'w', encoding='ascii', newline='') as f:
        f.write(manifest(th))
    kib = (W * 3 * H + KNOB * KNOB * KNOB_FRAMES * (1 if th.tintable else 4) // 4 + W * (PARTS_TOP + 2 * H)) * 4 / 1024
    print('%-18s %s  decoded about %d KiB' % (th.slug, folder, kib))


def main(argv):
    wanted = set(argv)
    for cls in THEMES:
        if not wanted or cls.slug in wanted:
            build(cls())


if __name__ == '__main__':
    main(sys.argv[1:])
