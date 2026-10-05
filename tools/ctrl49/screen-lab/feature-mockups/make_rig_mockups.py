#!/usr/bin/env python3
"""Five more HoSTage pages, about the rig, as one CTRL49 screen-lab preset in the Midnight 2020
style:

    python make_rig_mockups.py

  0 LAYERS      which sound is where: every part's key range over the 49 keys, and who answers
  1 EFFECTS     what every effect is doing, measured from its input and output
  2 SOUNDCHECK  the setlist checked before the show
  3 DISCOVER    what you own and have never opened, nearest to what you keep loading
  4 CHANGES     the sound against its saved version, A/B, undo one change, the edit history

and the colour of the screen is the colour of the part picked on LAYERS.

hostage-rig/ gets what the screen lab's preset mode loads:

  Design.ctrl49preset  the manifest (INI): five pages, their encoders and starting values
  Skin.lua             RigSkin.lua with this design's GENERATED block
  panels.png           480 x 816   the LAYERS, EFFECTS and SOUNDCHECK backgrounds
  tint.png             128 x 64    8-bit grey coverage the keyboard tints as it draws: dots,
                                   rings, the check marks, a star, the keyboard's lit keys
  parts.png            480 x 544   the DISCOVER (its map baked in) and CHANGES backgrounds

The rig, the effect chain, the setlist, the library and the edit history are invented here,
seeded, and written into the Lua: the lab has none of them. Drawing helpers, the palette and
the Lua writer come from make_feature_mockups.py. Pillow only; deterministic.
"""
import math
import os
import random
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from make_feature_mockups import (ALPHABET, CATEGORIES, ADJECTIVES, P, RAMP, H, W, blur, card,  # noqa: E402
                                  cell_tracks, disc, dot, lua_table, mask, mix, new, paint, put,
                                  rect, ring, rrect)

TEMPLATE = os.path.join(HERE, 'RigSkin.lua')
SLUG, NAME = 'hostage-rig', 'HoSTage Rig'

# --- the contract with the host and with RigSkin.lua ---------------------------------------------------

FPS = 15
PAGES = ['Layers', 'Effects', 'Soundcheck', 'Discover', 'Changes']
TITLES = ['LAYERS', 'EFFECTS', 'SOUNDCHECK', 'DISCOVER', 'CHANGES']
ENCODERS = [6, 6, 3, 4, 4]
ASSETS = [(576, 'panels.png'), (578, 'tint.png'), (580, 'parts.png')]
TINT_W, TINT_H = 128, 64

ROWS = (8, 36, 464, 23)                  # LAYERS: x, y, width, height of a part's row
KB = (8, 158, 16)                        # the 49 keys: x, y, white key pitch
WHITE_H, BLACK_W, BLACK_H = 48, 10, 30
CARDS = (10, 34, 93, 88, 60)             # EFFECTS: x, y, step, width, height of a slot's card
CARD_MID = 31
SPEC, TIME = (12, 116, 144, 86), (166, 116, 140, 86)
MEAS = (320, 104, 20, 396, 26, 426)      # label x, first row y, row step, bar centre, half, value x
SETLIST, DETAIL, DETAIL_ROWS, FIX = (8, 54, 228, 16), (250, 56, 214), (102, 20), (246, 206, 222, 40)
DMAP, DLIST, DNOTE = (14, 40, 170, 160), (196, 36, 272, 17), (200, 180, 266)
AB, HIST, CROWS, CTRACK = (380, 34, 46, 40, 28), (84, 82, 330), (8, 96, 22, 5), (130, 170)
CELL_BAR_Y = 239

PARTS = [  # name, low, high, velocity low, high, transpose, colour (its sound's brightness)
    ('SUB BASS', 36, 54, 1, 127, 0, '#FFB547'),
    ('GRAND PIANO', 55, 84, 1, 127, 0, '#FF7A59'),
    ('STRING PAD', 55, 84, 1, 127, 0, '#8B7CFF'),
    ('BRASS STAB', 60, 84, 100, 127, 0, '#FF5C93'),
    ('BELL PLUCK', 72, 84, 1, 127, 12, '#2DD4BF'),
]


def enc_of(conv, value):
    """The encoder position whose value is `value` (as RigSkin.lua converts it)."""
    for v in range(128):
        if conv(v) == value:
            return v
    raise ValueError(value)


def note_of(v):
    return 36 + int(math.floor(v * 48 / 127 + 0.5))


def vel_of(v):
    return 1 + int(math.floor(v * 126 / 127 + 0.5))


def tr_of(v):
    return int(math.floor(v * 48 / 127 + 0.5)) - 24


FOCUS = 3                                                    # the string pad
_, LO, HI, VLO, VHI, TR, _ = PARTS[FOCUS - 1]
CHAIN = [  # name, kind, its four controls (0-127)
    ('CHANNEL EQ', 'eq', [70, 52, 84, 78]),
    ('BUS COMP', 'comp', [64, 24, 12, 30]),
    ('ENSEMBLE', 'chorus', [40, 70, 80, 50]),
    ('TAPE ECHO', 'delay', [62, 70, 60, 45]),
    ('PLATE', 'reverb', [80, 70, 50, 40]),
]
DEFAULTS = [
    [64, enc_of(note_of, LO), enc_of(note_of, HI), enc_of(tr_of, TR), enc_of(vel_of, VLO), enc_of(vel_of, VHI), 64, 64],
    [40] + CHAIN[1][2] + [64, 64, 64],          # EFFECTS: the compressor
    [64, 70, 64, 64, 64, 64, 64, 64],           # SOUNDCHECK: song 7, its third part
    [16, 0, 0, 64, 64, 64, 64, 64],             # DISCOVER: the second nearest, every kind
    [127, 30, 64, 0, 64, 64, 64, 64],           # CHANGES: listening to now, the third change
]

LAYOUT = {
    'pages': len(PAGES), 'fps': FPS, 'defaults': DEFAULTS,
    'bg': [[577, 0], [577, 272], [577, 544], [581, 0], [581, 272]],
    'title': [18, 5, 250, 20], 'head': [170, 5, 296, 20], 'foot': [14, 254, 380, 16],
    'dots': [410, 260, 12, 8, 4], 'bar': [6, 8, 4, 14],
    'cell_label_y': 210, 'cell_value_y': 221, 'cell_bar_y': CELL_BAR_Y,
    'rows': list(ROWS), 'kb': list(KB),
    'cards': list(CARDS), 'card_mid': CARD_MID, 'spec': list(SPEC), 'time': list(TIME), 'meas': list(MEAS),
    'setlist': list(SETLIST), 'detail': list(DETAIL), 'detail_rows': list(DETAIL_ROWS), 'fix': list(FIX),
    'dmap': list(DMAP), 'dlist': list(DLIST), 'dnote': list(DNOTE),
    'ab': list(AB), 'hist': list(HIST), 'crows': list(CROWS), 'ctrack': list(CTRACK),
}

SPRITES = {
    'dot': (0, 0, 5, 5), 'dot_big': (6, 0, 9, 9), 'ring': (16, 0, 9, 9), 'ring_big': (26, 0, 15, 15),
    'ok': (42, 0, 11, 11), 'warn': (54, 0, 11, 11), 'bad': (66, 0, 11, 11), 'star': (78, 0, 11, 11),
    'key_c': (0, 16, 15, WHITE_H), 'key_d': (16, 16, 15, WHITE_H), 'key_e': (32, 16, 15, WHITE_H),
    'key_full': (48, 16, 15, WHITE_H), 'key_black': (64, 16, BLACK_W, BLACK_H),
}

ROLES = {   # text role: (font, size), horizontal justification (0 left, 1 centre, 2 right)
    'title': ((10, 15), 0), 'head': ((9, 11), 2), 'foot': ((9, 9), 0), 'name': ((10, 18), 1),
    'label': ((10, 9), 1), 'label9': ((10, 9), 0), 'cell': ((9, 13), 1), 'small': ((10, 9), 1),
    'tag': ((9, 10), 0), 'tag9': ((9, 9), 0), 'tagr': ((9, 10), 2), 'tagr9': ((9, 9), 2),
    'banner': ((10, 13), 1), 'song': ((10, 17), 0), 'pad': ((10, 15), 1),
}

THEME = dict(
    title=P['text'], head=P['dim'], foot='#565E7E', label='#8890B0', value=P['text'], dim='#565E7E',
    dot_off=P['raised'], bar='#4A5378', raised=P['raised'], track=P['raised'], ring='#9AA3C2',
    mini_visible='#4A5378', on_accent=P['bg'], load_bg=P['bg'], load_bar=P['violet'],
    split='#E6E9F5', ghost='#E6E9F5', dead='#6B7393', spec_in='#2E3757', reach='#3A4468',
    ok=P['teal'], warn=P['amber'], bad='#FF4D6A',
)

# --- the simulated rig ------------------------------------------------------------------------------------

# What the player plays: [beat, length, note, velocity] over four bars of a sixteen-beat loop. The
# left hand is under the split, the right hand over it, and some of the right hand is hit hard
# enough for the brass. The page starts four and a half beats in (play_offset), so a picture taken
# early on catches the loud chord of bar three rather than one bass note.
PLAY = [
    [0, 4, 48, 90], [0, 2, 64, 72], [0, 2, 67, 70], [0, 2, 72, 74],
    [2, 1.5, 64, 112], [2, 1.5, 67, 110], [2, 1.5, 72, 114],
    [4, 4, 45, 88], [4, 3.5, 69, 80], [4, 3.5, 72, 78], [4, 3.5, 76, 82],
    [8, 4, 41, 92], [8, 2, 69, 118], [8, 2, 72, 116], [8, 2, 77, 120],
    [10, 2, 69, 76], [10, 2, 72, 74], [10, 2, 77, 78],
    [12, 4, 43, 86], [12, 3, 71, 66], [12, 3, 74, 64], [12, 3, 79, 68], [15, 1, 84, 104],
]

LABELS = {'eq': ['LOW', 'MID', 'HIGH', 'AIR'], 'comp': ['THRESH', 'RATIO', 'ATTACK', 'RELEASE'],
          'chorus': ['RATE', 'DEPTH', 'WIDTH', 'MIX'], 'delay': ['TIME', 'FEEDBK', 'TONE', 'MIX'],
          'reverb': ['SIZE', 'DECAY', 'DAMP', 'MIX']}


def spectrum():
    """A part's average spectrum in 36 bands, 30 Hz to 16 kHz (dB): low mids up, falling above."""
    out = []
    for b in range(36):
        v = -26 + 12 * math.exp(-((b - 7) / 6.0) ** 2) - max(0, b - 10) * 0.9 + 2 * math.sin(b * 1.7)
        out.append(round(v, 1))
    return out


def OK(name, what, secs):
    """A part with nothing wrong: [name, plug-in or port, status 1-3, what is wrong, what to do]."""
    return [name, what, 1, 'READY: LOADS IN %s s' % secs, 'STATE MATCHES WHAT WAS SAVED']


SET = [
    ['GLASS HARBOUR', 92, [OK('STRING PAD', 'NEBULA', '0.8'), OK('GRAND PIANO', 'KEYS 73', '1.4'), OK('SUB BASS', 'MONO BASS', '0.3')], 'SCENE 1'],
    ['NIGHT BUS', 124, [OK('SAW LEAD', 'WAVEFIELD', '0.9'), OK('SUB BASS', 'MONO BASS', '0.3')], 'SCENE 2'],
    ['PAPER MOONS', 108, [OK('BELL PLUCK', 'PLUCKBOX', '0.5'), OK('STRING PAD', 'NEBULA', '0.8'), OK('GRAND PIANO', 'KEYS 73', '1.4')], 'SCENE 3'],
    ['LOW TIDE', 76, [OK('SUB BASS', 'MONO BASS', '0.3'),
                      ['E-PIANO', 'KEYS 73', 2, 'SAVED BY KEYS 73 2.1, NOW 3.0', 'IT LOADS: PLAY IT ONCE TO BE SURE'],
                      OK('STRING PAD', 'NEBULA', '0.8')], 'SCENE 4'],
    ['COPPER SKY', 116, [OK('BRASS STAB', 'BRASSWORKS', '1.1'), OK('SUB BASS', 'MONO BASS', '0.3'), OK('STRING PAD', 'NEBULA', '0.8')], 'SCENE 5'],
    ['NORTHBOUND', 132, [OK('SAW LEAD', 'WAVEFIELD', '0.9'), OK('BELL PLUCK', 'PLUCKBOX', '0.5')], 'SCENE 6'],
    ['SALT ROAD', 98, [OK('SUB BASS', 'MONO BASS', '0.3'), OK('GRAND PIANO', 'KEYS 73', '1.4'),
                       ['POLY SYNTH', 'HW: USB MIDI 2', 3, 'MIDI PORT USB MIDI 2 IS GONE', 'PLUG IT IN, OR PICK ANOTHER PORT'],
                       OK('STRING PAD', 'NEBULA', '0.8')], 'SCENE 7'],
    ['EMBER', 84, [OK('GRAND PIANO', 'KEYS 73', '1.4'), OK('STRING PAD', 'NEBULA', '0.8')], 'SCENE 8'],
    ['PARALLEL', 120, [OK('SUB BASS', 'MONO BASS', '0.3'),
                       ['GRAIN PAD', 'DRIFTER', 3, 'PLUG-IN NOT FOUND: DRIFTER', 'NEAREST YOU HAVE: NEBULA, 91% ALIKE'],
                       OK('BELL PLUCK', 'PLUCKBOX', '0.5')], 'SCENE 9'],
    ['BLUE HOUR', 70, [OK('STRING PAD', 'NEBULA', '0.8'), OK('GRAND PIANO', 'KEYS 73', '1.4')], 'SCENE 10'],
    ['STATIC', 140, [OK('SUB BASS', 'MONO BASS', '0.3'),
                     ['SAW LEAD', 'WAVEFIELD', 2, 'TAKES 6.8 s TO LOAD', 'PRELOAD IT: SET AHEAD TO 2'],
                     OK('BRASS STAB', 'BRASSWORKS', '1.1')], 'SCENE 11'],
    ['HOME AGAIN', 88, [OK('GRAND PIANO', 'KEYS 73', '1.4'), OK('STRING PAD', 'NEBULA', '0.8'), OK('SUB BASS', 'MONO BASS', '0.3')], 'SCENE 12'],
]

PLUGINS = ['NEBULA', 'KEYS 73', 'MONO BASS', 'WAVEFIELD', 'STRINGFIELD', 'SIX-OP', 'PLUCKBOX', 'BRASSWORKS']
KINDS = ['PADS', 'BASS', 'KEYS', 'LEADS', 'PLUCKS', 'STRINGS', 'BRASS', 'FX']
# Each kind's usual plug-ins (the second is now and then a different one).
KIND_PLUGINS = {'Pad': [0, 5], 'Bass': [2, 5], 'Keys': [1, 5], 'Lead': [3, 5], 'Pluck': [6, 5],
                'Strings': [4, 0], 'Brass': [7, 3], 'FX': [0, 3]}
NEVER_CLUSTERS = [('Pad', 1800, 1000, 520, 380, 130), ('Bass', 650, 2900, 380, 560, 110),
                  ('Keys', 2000, 3250, 480, 320, 100), ('Lead', 2900, 3450, 460, 280, 110),
                  ('Pluck', 3300, 3800, 400, 160, 80), ('Strings', 2250, 1500, 420, 420, 80),
                  ('Brass', 2700, 2500, 360, 360, 50), ('FX', None, None, 0, 0, 60)]
# What you play, and how often you have loaded it: warm keys and pads, mostly.
PLAYED = [(1900, 3100, 'WARM KEYS 16', 41), (1700, 1150, 'VELVET PAD 3', 37), (2050, 3350, 'DUSTY KEYS 8', 29),
          (2300, 1400, 'SOFT STRINGS 12', 22), (1500, 900, 'HOLLOW PAD 30', 18), (800, 2800, 'DEEP BASS 4', 16),
          (2150, 3000, 'GLASSY KEYS 51', 12), (1850, 1350, 'LUSH PAD 19', 11), (2600, 2450, 'BRIGHT BRASS 7', 6),
          (900, 3100, 'GRITTY BASS 22', 5), (2400, 1700, 'WIDE STRINGS 2', 4), (3100, 3500, 'THIN LEAD 40', 3)]
NEVER_TOTAL = 11903


def never():
    rng = random.Random(73)
    sounds = []
    for cat, x, y, sx, sy, n in NEVER_CLUSTERS:
        k = CATEGORIES.index(cat)
        for _ in range(n):
            if x is None:
                px, py = rng.uniform(250, 3900), rng.uniform(200, 3950)
            else:
                px, py = rng.gauss(x, sx), rng.gauss(y, sy)
            plug = KIND_PLUGINS[cat][0 if rng.random() < 0.8 else 1]
            sounds.append((int(min(4095, max(0, px))), int(min(4095, max(0, py))), k, plug))
    loads = sum(p[3] for p in PLAYED)
    taste = (round(sum(p[0] * p[3] for p in PLAYED) / loads), round(sum(p[1] * p[3] for p in PLAYED) / loads))
    sounds.sort(key=lambda s: ((s[0] - taste[0]) ** 2 + (s[1] - taste[1]) ** 2, s))
    return sounds, taste


def encode(sounds):
    a = ALPHABET
    return ''.join(a[x // 64] + a[x % 64] + a[y // 64] + a[y % 64] + a[k] + a[p] for x, y, k, p in sounds)


PARAMS = [  # name, how it reads, its saved value (0-127)
    ['CUTOFF', 'hz', 70], ['RESONANCE', 'pct', 23], ['ENV AMOUNT', 'bip', 74], ['ATTACK', 'ms', 20],
    ['RELEASE', 's', 22], ['DETUNE', 'ct', 10], ['CHORUS MIX', 'pct', 25], ['REVERB SIZE', 'pct', 51],
    ['VIBRATO', 'pct', 0],
]
HISTORY = [[1, 82], [2, 40], [1, 92], [4, 60], [5, 40], [3, 96], [6, 28], [7, 57], [8, 92], [2, 53], [9, 30], [1, 88]]


def data():
    sounds, taste = never()
    far = max(math.hypot(x - taste[0], y - taste[1]) for x, y, _, _ in sounds)
    return {
        'notes': ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
        'parts': [dict(name=n, lo=lo, hi=hi, vlo=vlo, vhi=vhi, tr=tr, colour=c,
                       dim='#%02X%02X%02X' % mix(c, P['card'], 0.62)[:3])
                  for n, lo, hi, vlo, vhi, tr, c in PARTS],
        'play': PLAY, 'loop_beats': 16, 'play_bpm': 96, 'play_offset': 4.5,
        'chain': [dict(name=n, kind=k, p=p) for n, k, p in CHAIN], 'labels': LABELS, 'spectrum': spectrum(),
        'set': SET,
        'alphabet': ALPHABET, 'never': encode(sounds), 'never_count': len(sounds), 'never_total': NEVER_TOTAL,
        'taste': list(taste), 'far': int(far), 'played': [list(p) for p in PLAYED], 'plugins': PLUGINS,
        'categories': CATEGORIES, 'kinds': KINDS, 'adjectives': ADJECTIVES,
        'params': PARAMS, 'history': HISTORY, 'saved_at': 'SAVED 14 MAY, 21:04',
    }, sounds, taste


# --- pictures ---------------------------------------------------------------------------------------------

def dmap_x(v):
    return DMAP[0] + v * (DMAP[2] - 1) // 4095


def dmap_y(v):
    return DMAP[1] + DMAP[3] - 1 - v * (DMAP[3] - 1) // 4095


def keyboard(img, kx, ky, kw, low, high):
    white = 0
    for n in range(low, high + 1):
        if n % 12 in (1, 3, 6, 8, 10):
            continue
        x = kx + white * kw
        rrect(img, (x, ky - 3, kw - 1, WHITE_H + 3), 2, '#C9CEE0')       # rounded at the front only
        rect(img, (x, ky - 3, kw - 1, 3), P['bg'])
        white += 1
    white = 0
    for n in range(low, high + 1):
        if n % 12 in (1, 3, 6, 8, 10):
            x = kx + white * kw - BLACK_W // 2
            rrect(img, (x, ky - 3, BLACK_W, BLACK_H + 3), 2, '#161A2B')
            rect(img, (x, ky - 3, BLACK_W, 3), P['bg'])
        else:
            white += 1


def layers_bg():
    img = new(W, H, P['bg'])
    x, y, w, h = ROWS
    for k in range(len(PARTS)):
        rrect(img, (x, y + k * h, w, h - 1), 4, P['card'])
    keyboard(img, KB[0], KB[1], KB[2], 36, 84)
    cell_tracks(img, 6)
    return img


def effects_bg():
    img = new(W, H, P['bg'])
    x0, y0, step, w, h = CARDS
    for k in range(len(CHAIN)):
        x = x0 + k * step
        card(img, (x, y0, w, h), 6)
        rect(img, (x + 6, y0 + CARD_MID, w - 12, 1), '#2B3456')
        if k:
            tri = mask(5, 9, lambda d, s: d.polygon([(0, 0), (5 * s, 4.5 * s), (0, 9 * s)], fill=255))
            put(img, paint(tri, '#3A4468'), x - 5, y0 + h // 2 - 4)
    card(img, (8, 98, 152, 108), 6)
    card(img, (162, 98, 148, 108), 6)
    card(img, (314, 98, 158, 108), 6)
    for j in range(5):
        y = MEAS[1] + j * MEAS[2]
        rect(img, (MEAS[3] - MEAS[4], y + 6, 2 * MEAS[4], 1), '#2B3456')
        rect(img, (MEAS[3], y + 2, 1, 9), '#3A4468')
    cell_tracks(img, 6)
    return img


def soundcheck_bg():
    img = new(W, H, P['bg'])
    card(img, (4, 52, 236, 198), 6)
    card(img, (242, 52, 232, 198), 6)
    rrect(img, FIX, 4, P['raised'])
    return img


def discover_bg(sounds, taste):
    img = new(W, H, P['bg'])
    card(img, (6, 32, 184, 176), 6)
    card(img, (192, 32, 280, 144), 6)
    card(img, (192, 178, 280, 30), 6)
    mx, my, mw, mh = DMAP
    for k in (1, 2, 3):
        rect(img, (mx + k * mw // 4, my, 1, mh), '#1A2036')
        rect(img, (mx, my + k * mh // 4, mw, 1), '#1A2036')
    # your taste: a soft halo where what you load sits
    halo = new(W, H)
    disc(halo, dmap_x(taste[0]) + 0.5, dmap_y(taste[1]) + 0.5, 18, (230, 233, 245, 60))
    put(img, blur(halo, 9))
    # what you have never opened, faint, in the colour of its brightness
    points = new(W, H)
    for x, y, _, _ in sounds:
        disc(points, dmap_x(x) + 0.5, dmap_y(y) + 0.5, 1.0, RAMP[x * 16 // 4096])
    points.putalpha(points.getchannel('A').point(lambda v: v * 120 // 255))
    put(img, points)
    # what you play, white
    for x, y, _, loads in PLAYED:
        disc(img, dmap_x(x) + 0.5, dmap_y(y) + 0.5, 1.4 + loads / 30, (230, 233, 245, 230))
    disc(img, dmap_x(taste[0]) + 0.5, dmap_y(taste[1]) + 0.5, 2.5, P['text'])
    cell_tracks(img, 4)
    return img


def changes_bg():
    img = new(W, H, P['bg'])
    card(img, (8, 30, 464, 44), 6)
    rect(img, (HIST[0], HIST[1] + 3, HIST[2] + 2, 1), '#2B3456')
    x, y, h, rows = CROWS
    for r in range(rows):
        rrect(img, (x, y + r * h, 464, h - 1), 3, P['card'])
        rrect(img, (CTRACK[0], y + r * h + 8, CTRACK[1] + 1, 5), 2, P['raised'])
    cell_tracks(img, 4)
    return img


# --- the coverage atlas -----------------------------------------------------------------------------------

def mark(kind):
    """A status mark: a disc with its sign knocked out, so it reads on any background."""
    def draw(d, s):
        d.ellipse((0, 0, 11 * s - 1, 11 * s - 1), fill=255)
        if kind == 'ok':
            d.line([(2.8 * s, 5.8 * s), (4.8 * s, 7.8 * s), (8.4 * s, 3.6 * s)], fill=0, width=int(1.6 * s))
        elif kind == 'bad':
            d.line([(3.4 * s, 3.4 * s), (7.6 * s, 7.6 * s)], fill=0, width=int(1.6 * s))
            d.line([(7.6 * s, 3.4 * s), (3.4 * s, 7.6 * s)], fill=0, width=int(1.6 * s))
        else:
            d.rectangle((4.7 * s, 2.4 * s, 6.3 * s, 6.6 * s), fill=0)
            d.rectangle((4.7 * s, 7.6 * s, 6.3 * s, 9.0 * s), fill=0)
    return mask(11, 11, draw)


def star():
    pts = []
    for i in range(10):
        r = 5.3 if i % 2 == 0 else 2.3
        a = math.radians(-90 + i * 36)
        pts.append((5.5 + r * math.cos(a), 5.7 + r * math.sin(a)))
    return mask(11, 11, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))


def lit_key(notch_left, notch_right):
    """A white key's lit shape, one pixel inside the key, stopping short of the black keys beside
    it (BLACK_W wide, centred on the line between two white keys)."""
    w, h = KB[2] - 1, WHITE_H
    half = BLACK_W // 2

    def draw(d, s):
        d.rounded_rectangle((1 * s, 1 * s, (w - 1) * s - 1, (h - 1) * s - 1), 2 * s, fill=255)
        if notch_left:
            d.rectangle((0, 0, (half + 1) * s - 1, (BLACK_H + 1) * s - 1), fill=0)
        if notch_right:
            d.rectangle(((w - half) * s, 0, w * s, (BLACK_H + 1) * s - 1), fill=0)
    return mask(w, h, draw)


def black_key():
    return mask(BLACK_W, BLACK_H, lambda d, s: d.rounded_rectangle((1 * s, 0, (BLACK_W - 1) * s - 1, (BLACK_H - 1) * s - 1), 1.5 * s, fill=255))


def tint_atlas():
    atlas = Image.new('L', (TINT_W, TINT_H), 0)
    pieces = {'dot': dot(5, 2.2), 'dot_big': dot(9, 3.8), 'ring': ring(9, 3.4, 1.5), 'ring_big': ring(15, 6.0, 2.0),
              'ok': mark('ok'), 'warn': mark('warn'), 'bad': mark('bad'), 'star': star(),
              'key_c': lit_key(False, True), 'key_d': lit_key(True, True), 'key_e': lit_key(True, False),
              'key_full': lit_key(False, False), 'key_black': black_key()}
    for name, im in pieces.items():
        x, y, w, h = SPRITES[name]
        assert im.size == (w, h), (name, im.size, (w, h))
        atlas.paste(im, (x, y))
    pal = Image.frombytes('P', atlas.size, atlas.tobytes())
    pal.putpalette([v for i in range(256) for v in (i, i, i)])
    return pal


# --- the Lua and the manifest -------------------------------------------------------------------------

def skin_lua(D):
    theme = dict(THEME)
    theme['name'] = NAME.upper()
    theme['titles'] = TITLES
    theme['roles'] = sorted(ROLES)
    theme['fonts'] = {k: list(f) for k, (f, _) in ROLES.items()}
    theme['aligns'] = {k: a for k, (_, a) in ROLES.items()}
    block = '\n'.join([
        '-- BEGIN GENERATED (make_rig_mockups.py writes this block)',
        '-- %s. Generated: edit make_rig_mockups.py and RigSkin.lua, then regenerate.' % NAME,
        lua_table('T', theme), lua_table('L', LAYOUT),
        lua_table('S', {k: list(v) for k, v in SPRITES.items()}),
        lua_table('D', D),
        '-- END GENERATED'])
    template = open(TEMPLATE, encoding='utf-8').read()
    pattern = re.compile(r'-- BEGIN GENERATED.*?-- END GENERATED', re.S)
    assert len(pattern.findall(template)) == 1, 'RigSkin.lua must hold exactly one GENERATED block'
    return pattern.sub(lambda _: block, template)


def manifest():
    out = ['; %s - a CTRL49 screen-lab preset. Generated by make_rig_mockups.py.' % NAME,
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
    D, sounds, taste = data()
    panels = new(W, 3 * H)
    for p, im in enumerate([layers_bg(), effects_bg(), soundcheck_bg()]):
        panels.paste(im, (0, p * H))
    panels.save(os.path.join(folder, 'panels.png'), optimize=True)
    tint_atlas().save(os.path.join(folder, 'tint.png'))
    parts = new(W, 2 * H)
    for p, im in enumerate([discover_bg(sounds, taste), changes_bg()]):
        parts.paste(im, (0, p * H))
    parts.save(os.path.join(folder, 'parts.png'), optimize=True)
    with open(os.path.join(folder, 'Skin.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(skin_lua(D))
    with open(os.path.join(folder, 'Design.ctrl49preset'), 'w', encoding='ascii', newline='') as f:
        f.write(manifest())
    kib = (W * 3 * H + TINT_W * TINT_H + W * 2 * H) * 4 / 1024
    print('%-18s %s  decoded about %d KiB (as RGBA)' % (SLUG, folder, kib))


if __name__ == '__main__':
    main()
