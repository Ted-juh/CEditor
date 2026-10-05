#!/usr/bin/env python3
"""Five HoSTage features as one CTRL49 screen-lab preset, in the Midnight 2020 style:

    python make_feature_mockups.py

  0 SOUND ATLAS  the library as a map, brightness across and attack up; a box is a query
  1 MOTION       modulation you can watch: where a parameter is set, and where it is now
  2 CAPTURE      the last two minutes of playing, and a box of bars to keep as a loop
  3 STAGE        the setlist's cue screen: section, bars left, the beat, the next sound
  4 CHORDS       the chord held, its place in the key, the next chords on the pads

and the colour of the screen is the colour of the sound picked on the atlas.

hostage-features/ gets what the screen lab's preset mode loads:

  Design.ctrl49preset  the manifest (INI): five pages, their encoders and starting values
  Skin.lua             FeatureSkin.lua with this design's GENERATED block
  panels.png           480 x 816   the ATLAS (its map baked in), MOTION and CAPTURE backgrounds
  tint.png             80 x 5184   8-bit grey coverage the keyboard tints as it draws: 64 knob
                                   frames (value v -> frame floor(v*63/127 + 0.5)), then the
                                   sprites (rings, dots, the lit keys) from y 5120
  parts.png            480 x 544   the STAGE and CHORDS backgrounds

The library, the song, the setlist and the chord progressions are invented here, seeded, and
written into the Lua: the lab has none of them. The README says what HoSTage would send instead.

Every pixel is authored at 480 x 272. Text stays live firmware text: nothing here bakes
lettering. Pillow only; deterministic.
"""
import math
import os
import random
import re
import sys

from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'era-presets'))

from make_era_designs import (LANCZOS, SS, H, W, Midnight, argb, blur, coverage_arc, disc, mask,  # noqa: E402
                              mix, new, paint, pol, put, rect, rrect)

TEMPLATE = os.path.join(HERE, 'FeatureSkin.lua')
SLUG, NAME = 'hostage-features', 'HoSTage Features'
P = dict(Midnight.palette)

# --- the contract with the host and with FeatureSkin.lua -----------------------------------------------

FPS = 15
PAGES = ['Sound Atlas', 'Motion', 'Capture', 'Stage', 'Chords']
TITLES = ['SOUND ATLAS', 'MODULATION', 'CAPTURE', 'STAGE', 'CHORDS']
ENCODERS = [5, 8, 5, 1, 2]
ASSETS = [(576, 'panels.png'), (578, 'tint.png'), (580, 'parts.png')]
KNOB, KNOB_FRAMES = 80, 64
TINT_H = KNOB * KNOB_FRAMES + 64

DEFAULTS = [
    [70, 92, 40, 16, 40, 64, 64, 64],           # ATLAS: crosshair, box, the second nearest, morph
    [72, 40, 64, 64, 96, 84, 100, 40],          # MOTION: four parameters, four depths (64 = none)
    [56, 0, 80, 0, 64, 64, 64, 64],             # CAPTURE: eight bars, ending now, 1/16, loop A
    [24, 64, 64, 64, 64, 64, 64, 64],           # STAGE: the second song
    [100, 40, 64, 64, 64, 64, 64, 64],          # CHORDS: A minor
]

MAP = (16, 36, 262, 168)
LIST = (290, 36, 180, 21)
KNOB_X, KNOB_Y = [26, 146, 266, 386], 46
SCOPE_X, SCOPE = [8, 128, 248, 368], (156, 104, 50)
ROLL, MINIMAP = (8, 34, 464, 136), (8, 176, 464, 28)
KB = (30, 134, 20)
WHITE_H, BLACK_W, BLACK_H = 46, 10, 28
PADS = (190, 44)
CELL_BAR_Y = 239

LAYOUT = {
    'pages': len(PAGES), 'fps': FPS, 'defaults': DEFAULTS,
    'bg': [[577, 0], [577, 272], [577, 544], [581, 0], [581, 272]],
    'title': [18, 5, 250, 20], 'head': [170, 5, 296, 20], 'foot': [14, 254, 380, 16],
    'dots': [410, 260, 12, 8, 4], 'bar': [6, 8, 4, 14],
    'cell_label_y': 210, 'cell_value_y': 221, 'cell_bar_y': CELL_BAR_Y,
    'map': list(MAP), 'list': list(LIST),
    'knob_x': KNOB_X, 'knob_y': KNOB_Y, 'knob_label_y': 34, 'knob_value_y': 126,
    'scope_x': SCOPE_X, 'scope': list(SCOPE),
    'roll': list(ROLL), 'roll_beat_px': 13, 'minimap': list(MINIMAP),
    'kb': list(KB), 'pads': list(PADS),
}

SPRITE_Y = KNOB * KNOB_FRAMES
SPRITES = {
    'ring': (0, SPRITE_Y, 9, 9), 'ring_big': (10, SPRITE_Y, 15, 15), 'dot': (26, SPRITE_Y, 5, 5),
    'dot_big': (32, SPRITE_Y, 9, 9), 'puck': (42, SPRITE_Y, 11, 11), 'rec': (54, SPRITE_Y, 8, 8),
    'key_c': (0, SPRITE_Y + 16, 19, WHITE_H), 'key_d': (20, SPRITE_Y + 16, 19, WHITE_H),
    'key_e': (40, SPRITE_Y + 16, 19, WHITE_H), 'key_black': (60, SPRITE_Y + 16, BLACK_W, BLACK_H),
}

ROLES = {   # text role: (font, size), horizontal justification (0 left, 1 centre, 2 right)
    'title': ((10, 15), 0), 'head': ((9, 11), 2), 'foot': ((9, 9), 0), 'name': ((10, 18), 1),
    'label': ((10, 9), 1), 'cell': ((9, 13), 1), 'small': ((10, 9), 1), 'value': ((9, 14), 1),
    'tag': ((9, 10), 0), 'scope': ((9, 9), 0), 'tagr': ((9, 10), 2), 'line': ((9, 14), 0), 'banner': ((10, 13), 1),
    'song': ((10, 20), 0), 'bpm': ((9, 20), 2), 'section': ((10, 40), 0), 'huge': ((7, 60), 1),
    'next': ((10, 18), 0), 'big': ((10, 48), 0), 'key': ((10, 16), 1), 'pad': ((10, 12), 1),
}

THEME = dict(
    title=P['text'], head=P['dim'], foot='#565E7E', label='#8890B0', value=P['text'], dim='#565E7E',
    dot_off=P['raised'], bar='#4A5378', raised=P['raised'], track=P['raised'],
    cross='#2B3456', ring='#9AA3C2', axis='#565E7E', knob='#4A5378',
    bar_line='#2B3456', beat_line='#1B2238', note_soft='#3A4468', note='#6B7393', note_loud='#A3AACB',
    now=P['text'], rec='#FF4D6A', mini='#2B3456', mini_visible='#4A5378', on_accent=P['bg'],
    ready=P['teal'], warn=P['amber'], on_warn=P['bg'], scale_mark='#6B7393',
    load_bg=P['bg'], load_bar=P['violet'],
)

# --- the simulated world: a library, a song, a setlist, a key -------------------------------------------

ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
CATEGORIES = ['Pad', 'Bass', 'Keys', 'Lead', 'Pluck', 'Strings', 'Brass', 'FX']
# Where each kind of sound sits on the map (brightness, attack; 0-4095, attack 4095 = 1 ms), how
# spread, and how many of them: the clusters a real library measures into.
CLUSTERS = [('Pad', 1700, 900, 520, 360, 220), ('Bass', 700, 2900, 360, 600, 200),
            ('Keys', 2100, 3300, 460, 300, 160), ('Lead', 2900, 3500, 460, 260, 180),
            ('Pluck', 3300, 3800, 400, 160, 140), ('Strings', 2300, 1500, 400, 400, 120),
            ('Brass', 2700, 2500, 360, 360, 80), ('FX', None, None, 0, 0, 100)]
ADJECTIVES = ['Warm', 'Glassy', 'Dusty', 'Bright', 'Hollow', 'Soft', 'Gritty', 'Airy', 'Deep', 'Silver',
              'Velvet', 'Broken', 'Lush', 'Thin', 'Wide', 'Cold']


def library():
    rng = random.Random(49)
    sounds = []
    for cat, x, y, sx, sy, n in CLUSTERS:
        k = CATEGORIES.index(cat)
        for _ in range(n):
            if x is None:
                px, py = rng.uniform(250, 3900), rng.uniform(200, 3950)
            else:
                px, py = rng.gauss(x, sx), rng.gauss(y, sy)
            sounds.append((int(min(4095, max(0, px))), int(min(4095, max(0, py))), k))
    rng.shuffle(sounds)
    return sounds


def encode(sounds):
    a = ALPHABET
    return ''.join(a[x // 64] + a[x % 64] + a[y // 64] + a[y % 64] + a[k] for x, y, k in sounds)


def ramp():
    """Dark sounds warm, bright ones cold: amber through coral, pink and violet to teal."""
    stops = [(0, '#FFB547'), (0.18, '#FF7A59'), (0.36, '#FF5C93'), (0.54, '#C86BFA'),
             (0.72, '#8B7CFF'), (0.86, '#5B9BFF'), (1, '#2DD4BF')]
    out = []
    for i in range(16):
        t = i / 15
        for k in range(1, len(stops)):
            if t <= stops[k][0]:
                (t0, c0), (t1, c1) = stops[k - 1], stops[k]
                c = mix(c0, c1, (t - t0) / (t1 - t0))
                out.append('#%02X%02X%02X' % c[:3])
                break
    return out


RAMP = ramp()


def map_x(v):
    return MAP[0] + v * (MAP[2] - 1) // 4095


def map_y(v):
    return MAP[1] + MAP[3] - 1 - v * (MAP[3] - 1) // 4095


def ring_offsets():
    """Where a dot sits on a knob's arc (radius 31) at each value, as offsets from the knob's
    centre to the pixel the dot is centred on."""
    out = []
    for v in range(128):
        x, y = pol(0, 0, 31, -150 + 300 * v / 127)
        out += [int(round(x - 0.5)), int(round(y - 0.5))]
    return out


SONG = [[48, 51, 55], [44, 48, 51], [43, 46, 51], [46, 50, 53],      # Cm  Ab  Eb/G  Bb
        [41, 44, 48], [44, 48, 51], [46, 50, 53], [43, 47, 50]]      # Fm  Ab  Bb    G
ARP = [1, 0, 2, 0, 3, 0, 1, 1, 2, 1, 3, 0, 2, 0, 1, 1]              # (chord note, octave) per eighth

MAJ, MIN = [0, 4, 7], [0, 3, 7]
SCALES = [['MAJOR', [0, 2, 4, 5, 7, 9, 11], 1, 'IONIAN'],
          ['MINOR', [0, 2, 3, 5, 7, 8, 10], 2, 'AEOLIAN'],
          ['DORIAN', [0, 2, 3, 5, 7, 9, 10], 3, 'MINOR, A BRIGHT SIXTH'],
          ['MIXOLYDIAN', [0, 2, 4, 5, 7, 9, 10], 4, 'MAJOR, A FLAT SEVENTH']]
# A bar a chord: degree, suffix, voicing over the chord's root, numeral, the bass's interval over
# the root when the chord is over another note (false when not), and what the chord is doing.
PROGRESSIONS = [
    [[1, 'maj7', [0, 4, 7, 11], 'Imaj7', False, 'TONIC'],
     [6, 'm7', [0, 3, 7, 10], 'vi7', False, 'RELATIVE MINOR'],
     [2, 'm9', [0, 3, 7, 10, 14], 'ii9', False, 'PREDOMINANT'],
     [5, '7', [0, 4, 7, 10], 'V7', False, 'DOMINANT'],
     [1, '', [0, 4, 7, 12], 'I6', 4, 'TONIC, FIRST INVERSION'],
     [4, 'add9', [0, 4, 7, 14], 'IVadd9', False, 'SUBDOMINANT'],
     [3, 'm7', [0, 3, 7, 10], 'iii7', False, 'MEDIANT'],
     [5, '7', [0, 4, 7, 10], 'V7', False, 'DOMINANT']],
    [[1, 'm7', [0, 3, 7, 10], 'i7', False, 'TONIC'],
     [6, 'maj7', [0, 4, 7, 11], 'VImaj7', False, 'SUBMEDIANT'],
     [3, '', MAJ + [12], 'III', False, 'RELATIVE MAJOR'],
     [7, '', MAJ, 'VII', False, 'SUBTONIC'],
     [4, 'm7', [0, 3, 7, 10], 'iv7', False, 'SUBDOMINANT'],
     [5, 'm7', [0, 3, 7, 10], 'v7', False, 'MINOR DOMINANT'],
     [1, 'm', MIN + [12], 'i6', 3, 'TONIC, FIRST INVERSION'],
     [7, '', MAJ, 'VII', False, 'SUBTONIC']],
    [[1, 'm9', [0, 3, 7, 10, 14], 'i9', False, 'TONIC'],
     [4, '7', [0, 4, 7, 10], 'IV7', False, 'THE DORIAN SIXTH'],
     [1, 'm7', [0, 3, 7, 10], 'i7', False, 'TONIC'],
     [7, '', MAJ, 'VII', False, 'SUBTONIC'],
     [2, 'm7', [0, 3, 7, 10], 'ii7', False, 'SUPERTONIC'],
     [5, 'm7', [0, 3, 7, 10], 'v7', False, 'MINOR DOMINANT'],
     [3, 'maj7', [0, 4, 7, 11], 'IIImaj7', False, 'MEDIANT'],
     [4, '7', [0, 4, 7, 10], 'IV7', False, 'THE DORIAN SIXTH']],
    [[1, '', MAJ + [12], 'I', False, 'TONIC'],
     [7, '', MAJ, 'VII', False, 'THE FLAT SEVENTH'],
     [4, '', MAJ, 'IV', False, 'SUBDOMINANT'],
     [5, 'm7', [0, 3, 7, 10], 'v7', False, 'MINOR DOMINANT'],
     [2, 'm7', [0, 3, 7, 10], 'ii7', False, 'SUPERTONIC'],
     [6, 'm7', [0, 3, 7, 10], 'vi7', False, 'SUBMEDIANT'],
     [1, '7', [0, 4, 7, 10], 'I7', False, 'TONIC SEVENTH'],
     [4, '', MAJ, 'IV', False, 'SUBDOMINANT']],
]
# The pads: the key's chords, every one the progression plays among them.
PAD_DEGREES = [
    [[1, 'maj7', 'Imaj7'], [2, 'm9', 'ii9'], [3, 'm7', 'iii7'], [4, 'add9', 'IVadd9'],
     [5, '7', 'V7'], [6, 'm7', 'vi7'], [1, '', 'I'], [7, 'm7b5', 'vii7b5']],
    [[1, 'm7', 'i7'], [3, '', 'III'], [4, 'm7', 'iv7'], [5, 'm7', 'v7'],
     [6, 'maj7', 'VImaj7'], [7, '', 'VII'], [1, 'm', 'i'], [2, 'm7b5', 'ii7b5']],
    [[1, 'm9', 'i9'], [2, 'm7', 'ii7'], [3, 'maj7', 'IIImaj7'], [4, '7', 'IV7'],
     [5, 'm7', 'v7'], [7, '', 'VII'], [1, 'm7', 'i7'], [6, 'm7b5', 'vi7b5']],
    [[1, '', 'I'], [2, 'm7', 'ii7'], [4, '', 'IV'], [5, 'm7', 'v7'],
     [6, 'm7', 'vi7'], [7, '', 'VII'], [1, '7', 'I7'], [3, 'm7b5', 'iii7b5']],
]


def data():
    sounds = library()
    sine = [int(round(127 * math.sin(2 * math.pi * i / 64))) for i in range(64)]
    return {
        'alphabet': ALPHABET, 'atlas': encode(sounds), 'count': len(sounds), 'ramp': RAMP,
        'adjectives': ADJECTIVES, 'categories': CATEGORIES,
        'sine': sine, 'mseg': [0, 127, 96, 70, 112, 28, 54, 12, 0], 'ring': ring_offsets(),
        'source_colours': [P['violet'], P['teal'], P['pink'], P['amber']],
        'source_dims': ['#%02X%02X%02X' % mix(c, P['card'], 0.55)[:3] for c in (P['violet'], P['teal'], P['pink'], P['amber'])],
        'song': SONG, 'arp': ARP, 'capture_bpm': 112, 'capture_offset': 300,
        'quantise': ['OFF', '1/8', '1/16', '1/16T'], 'slots': ['LOOP A', 'LOOP B', 'LOOP C', 'LOOP D'],
        'songs': ['GLASS HARBOUR', 'NIGHT BUS', 'PAPER MOONS', 'LOW TIDE', 'COPPER SKY', 'NORTHBOUND'],
        'tempos': [92, 124, 108, 76, 116, 132], 'stage_offset': 52,
        'form': [['INTRO', 4], ['VERSE 1', 8], ['CHORUS', 8], ['VERSE 2', 8], ['BRIDGE', 4], ['CHORUS', 8], ['OUTRO', 4]],
        'sounds': ['GLASS PAD', 'SUB BASS', 'TINE KEYS', 'SAW LEAD', 'BELL PLUCK', 'STRING SWELL', 'BRASS STAB'],
        'scales': SCALES, 'progressions': PROGRESSIONS, 'pad_degrees': PAD_DEGREES,
        'notes': ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], 'chord_bpm': 96,
    }, sounds


# --- pictures ---------------------------------------------------------------------------------------------


def card(img, box, r=8, colour=None):
    rrect(img, box, r, colour or P['card'])


def cell_tracks(img, n):
    for i in range(n):
        rrect(img, (i * 60 + 8, CELL_BAR_Y, 44, 4), 2, P['raised'])


def seat(img, cx, cy):
    disc(img, cx, cy, 22, P['raised'])
    put(img, paint(mask(W, H, lambda d, s: coverage_arc(d, s, cx, cy, 31, 5, -150, 150)), P['raised']))


def atlas_bg(sounds):
    img = new(W, H, P['bg'])
    card(img, (10, 31, 274, 178))
    card(img, (286, 31, 188, 178))
    mx, my, mw, mh = MAP
    for k in (1, 2, 3):
        rect(img, (mx + k * mw // 4, my, 1, mh), '#1A2036')
        rect(img, (mx, my + k * mh // 4, mw, 1), '#1A2036')
    # the library: a soft glow where sounds crowd, then a point for each, in its colour
    points = new(W, H)
    for x, y, _ in sounds:
        disc(points, map_x(x) + 0.5, map_y(y) + 0.5, 1.15, RAMP[x * 16 // 4096])
    glow = blur(points, 3.2)
    glow.putalpha(glow.getchannel('A').point(lambda v: min(255, v * 2)))
    put(img, glow)
    dots = points.copy()
    dots.putalpha(points.getchannel('A').point(lambda v: v * 200 // 255))
    put(img, dots)
    cell_tracks(img, 5)
    return img


def motion_bg():
    img = new(W, H, P['bg'])
    for x in KNOB_X:
        seat(img, x + 40, KNOB_Y + 40)
    y, w, h = SCOPE
    for x in SCOPE_X:
        card(img, (x, y, w, h), 6)
        rect(img, (x + 6, y + 15 + (h - 20) // 2 + 1, w - 12, 1), '#222A45')
    cell_tracks(img, 8)
    return img


def capture_bg():
    img = new(W, H, P['bg'])
    x, y, w, h = ROLL
    card(img, ROLL, 6)
    for n in (48, 60, 72):       # a faint line at each C, as FeatureSkin.lua places notes
        rect(img, (x + 2, y + h - 4 - (n - 36) * (h - 8) // 48 + 1, w - 4, 1), '#1B2238')
    card(img, MINIMAP, 4)
    cell_tracks(img, 5)
    return img


def stage_bg():
    img = new(W, H, P['bg'])
    rect(img, (14, 76, 452, 1), '#1F2742')
    card(img, (8, 80, 300, 94))
    card(img, (312, 80, 160, 94))
    card(img, (8, 182, 464, 46))
    return img


def chords_bg():
    img = new(W, H, P['bg'])
    card(img, (8, 30, 288, 98))
    card(img, (298, 30, 176, 98))
    kx, ky, kw = KB
    white = 0
    for n in range(36, 72):
        pc = n % 12
        if pc in (1, 3, 6, 8, 10):
            continue
        x = kx + white * kw
        rrect(img, (x, ky - 3, kw - 1, WHITE_H + 3), 2, '#C9CEE0')      # rounded at the front only
        rect(img, (x, ky - 3, kw - 1, 3), P['bg'])
        white += 1
    white = 0
    for n in range(36, 72):
        pc = n % 12
        if pc in (1, 3, 6, 8, 10):
            x = kx + white * kw - BLACK_W // 2
            rrect(img, (x, ky - 3, BLACK_W, BLACK_H + 3), 2, '#161A2B')
            rect(img, (x, ky - 3, BLACK_W, 3), P['bg'])
        else:
            white += 1
    rect(img, (kx - 2, ky - 1, white * kw + 3, 1), '#2B3456')
    y, h = PADS
    for p in range(8):
        rrect(img, (6 + p * 59, y, 54, h), 6, P['raised'])
    return img


# --- the coverage atlas -----------------------------------------------------------------------------------


def knob(deg):
    """Coverage the device tints: the arc to where the parameter is set, and a pointer."""
    m = Image.new('L', (KNOB * SS, KNOB * SS), 0)
    d = ImageDraw.Draw(m)
    coverage_arc(d, SS, 40, 40, 31, 5, -150, deg)
    p0, p1 = pol(40 * SS, 40 * SS, 8 * SS, deg), pol(40 * SS, 40 * SS, 17 * SS, deg)
    d.line([p0, p1], fill=255, width=int(3 * SS))
    for q in (p0, p1):
        d.ellipse((q[0] - 1.5 * SS, q[1] - 1.5 * SS, q[0] + 1.5 * SS, q[1] + 1.5 * SS), fill=255)
    return m.resize((KNOB, KNOB), LANCZOS)


def ring(size, r, width):
    c = size / 2
    return mask(size, size, lambda d, s: d.ellipse(((c - r - width / 2) * s, (c - r - width / 2) * s,
                                                    (c + r + width / 2) * s, (c + r + width / 2) * s),
                                                   outline=255, width=int(width * s)))


def dot(size, r):
    c = size / 2
    return mask(size, size, lambda d, s: d.ellipse(((c - r) * s, (c - r) * s, (c + r) * s, (c + r) * s), fill=255))


def puck():
    """Where the morph is: a ring with a point in it."""
    return ImageChops.lighter(ring(11, 4.0, 2.0), dot(11, 1.6))


def lit_key(notch_left, notch_right):
    """A white key's lit shape, one pixel inside the key, stopping short of the black keys beside
    it (they are BLACK_W wide, centred on the line between two white keys)."""
    w, h = KB[2] - 1, WHITE_H
    half = BLACK_W // 2

    def draw(d, s):
        d.rounded_rectangle((1 * s, 1 * s, (w - 1) * s - 1, (h - 1) * s - 1), 2 * s, fill=255)
        if notch_left:
            d.rectangle((0, 0, (half + 1) * s - 1, (BLACK_H + 1) * s - 1), fill=0)
        if notch_right:
            d.rectangle(((w + 1 - half - 1) * s, 0, w * s, (BLACK_H + 1) * s - 1), fill=0)
    return mask(w, h, draw)


def black_key():
    return mask(BLACK_W, BLACK_H, lambda d, s: d.rounded_rectangle((1 * s, 0, (BLACK_W - 1) * s - 1, (BLACK_H - 1) * s - 1), 1.5 * s, fill=255))


def tint_atlas():
    strip = Image.new('L', (KNOB, TINT_H), 0)
    for f in range(KNOB_FRAMES):
        strip.paste(knob(-150 + 300 * f / (KNOB_FRAMES - 1)), (0, f * KNOB))
    pieces = {'ring': ring(9, 3.4, 1.5), 'ring_big': ring(15, 6.0, 2.0), 'dot': dot(5, 2.2),
              'dot_big': dot(9, 3.8), 'puck': puck(), 'rec': dot(8, 3.6),
              'key_c': lit_key(False, True), 'key_d': lit_key(True, True), 'key_e': lit_key(True, False),
              'key_black': black_key()}
    for name, im in pieces.items():
        x, y, w, h = SPRITES[name]
        assert im.size == (w, h), (name, im.size, (w, h))
        strip.paste(im, (x, y))
    # the format the CTRL49 tints: 8-bit palette of 256 greys, index = grey = coverage
    pal = Image.frombytes('P', strip.size, strip.tobytes())
    pal.putpalette([v for i in range(256) for v in (i, i, i)])
    return pal


# --- the Lua and the manifest -------------------------------------------------------------------------


def lua_value(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str) and re.fullmatch(r'#[0-9A-Fa-f]{6}', v):
        return argb(v)
    if isinstance(v, str):
        assert '"' not in v and '\\' not in v, v
        return '"%s"' % v
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, tuple)):
        return '{ ' + ', '.join(lua_value(x) for x in v) + ' }'
    if isinstance(v, dict):
        return '{ ' + ', '.join('%s = %s' % (k, lua_value(v[k])) for k in sorted(v)) + ' }'
    raise TypeError(v)


def lua_table(name, d):
    lines = ['local %s = {' % name]
    for k in sorted(d):
        lines.append('    %s = %s,' % (k, lua_value(d[k])))
    lines.append('}')
    return '\n'.join(lines)


def skin_lua(D):
    theme = dict(THEME)
    theme['name'] = NAME.upper()
    theme['titles'] = TITLES
    theme['roles'] = sorted(ROLES)
    theme['fonts'] = {k: list(f) for k, (f, _) in ROLES.items()}
    theme['aligns'] = {k: a for k, (_, a) in ROLES.items()}
    block = '\n'.join([
        '-- BEGIN GENERATED (make_feature_mockups.py writes this block)',
        '-- %s. Generated: edit make_feature_mockups.py and FeatureSkin.lua, then regenerate.' % NAME,
        lua_table('T', theme), lua_table('L', LAYOUT),
        lua_table('S', {k: list(v) for k, v in SPRITES.items()}),
        lua_table('D', D),
        '-- END GENERATED'])
    template = open(TEMPLATE, encoding='utf-8').read()
    pattern = re.compile(r'-- BEGIN GENERATED.*?-- END GENERATED', re.S)
    assert len(pattern.findall(template)) == 1, 'FeatureSkin.lua must hold exactly one GENERATED block'
    return pattern.sub(lambda _: block, template)


def manifest():
    out = ['; %s - a CTRL49 screen-lab preset. Generated by make_feature_mockups.py.' % NAME,
           '; Run: Ctrl49ScreenLab.exe preset "<this file>"   (--check validates without MIDI)',
           '; The skin draws no envelope; envelopePage only has to name a page.',
           '[Preset]', 'version=1', 'name=%s' % NAME, 'width=%d' % W, 'height=%d' % H,
           'lua=Skin.lua', 'pages=%d' % len(PAGES), 'envelopePage=1', 'fps=%d' % FPS,
           'assets=%d' % len(ASSETS), '']
    for i, (ident, name) in enumerate(ASSETS):
        out += ['[Asset%d]' % i, 'id=%d' % ident, 'file=%s' % name, '']
    for p, title in enumerate(PAGES):
        out += ['[Page%d]' % p, 'title=%s' % title, 'encoders=%d' % ENCODERS[p]]
        out += ['e%d=%d' % (i + 1, v) for i, v in enumerate(DEFAULTS[p])]
        out.append('')
    return '\n'.join(out)


def main():
    folder = os.path.join(HERE, SLUG)
    os.makedirs(folder, exist_ok=True)
    D, sounds = data()
    panels = new(W, 3 * H)
    for p, im in enumerate([atlas_bg(sounds), motion_bg(), capture_bg()]):
        panels.paste(im, (0, p * H))
    panels.save(os.path.join(folder, 'panels.png'), optimize=True)
    tint_atlas().save(os.path.join(folder, 'tint.png'))
    parts = new(W, 2 * H)
    for p, im in enumerate([stage_bg(), chords_bg()]):
        parts.paste(im, (0, p * H))
    parts.save(os.path.join(folder, 'parts.png'), optimize=True)
    with open(os.path.join(folder, 'Skin.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(skin_lua(D))
    with open(os.path.join(folder, 'Design.ctrl49preset'), 'w', encoding='ascii', newline='') as f:
        f.write(manifest())
    kib = (W * 3 * H + KNOB * TINT_H + W * 2 * H) * 4 / 1024
    print('%-18s %s  decoded about %d KiB (as RGBA)' % (SLUG, folder, kib))


if __name__ == '__main__':
    main()
