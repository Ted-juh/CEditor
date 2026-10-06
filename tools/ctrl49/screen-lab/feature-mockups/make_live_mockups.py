#!/usr/bin/env python3
"""Four more HoSTage pages, about what the CTRL49's screen can carry, as one screen-lab preset in
the Midnight 2020 style:

    python make_live_mockups.py

  0 LIVE     the 49 keys with every part's zone, the keys held and the notes the arpeggiator
             plays from them, over the arp's sixteen steps with a playhead
  1 SECTION  one section of a plug-in's own window as the panel scan cuts it out, with an
             overlay on every control that follows the CTRL49's knobs
  2 LABELS   the stage view in large type, every word a picture HoSTage drew: no firmware text
  3 METERS   every part's level with peak hold, clip and the fader, the master and its history

hostage-live/ gets what the screen lab's preset mode loads:

  Design.ctrl49preset  the manifest (INI): four pages, their encoders and starting values
  Skin.lua             LiveSkin.lua with this design's GENERATED block
  panels.png           480 x 544   the LIVE and METERS backgrounds
  tint.png             480 x N     8-bit grey coverage the keyboard tints as it draws: 32 frames
                                   of a knob's ring (y 0), dots, a badge and the lit keys (y 320),
                                   then every word of the LABELS page (y 370)
  parts.png            480 x 544   the SECTION background (the invented plug-in's filter section,
                                   as the scan would cut it) and the LABELS background

The words are drawn with the app's own typeface (Barlow Semi Condensed, CE/web/src/assets/fonts),
the invented plug-in's lettering with Liberation Sans, so the picture reads as somebody else's GUI.
The rig, the playing and the set come from make_rig_mockups.py; the drawing helpers and the Lua
writer from make_feature_mockups.py. Pillow only; deterministic.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from make_feature_mockups import GENERATED, P, H, W, card, disc, dot, lua_table, mask, mix, new, paint, put, rect, ring, rrect  # noqa: E402
from make_rig_mockups import BLACK_H, BLACK_W, PARTS, PLAY, SET, WHITE_H, black_key, enc_of, keyboard, lit_key  # noqa: E402

sys.path.insert(0, os.path.join(HERE, '..', 'era-presets'))
from make_era_designs import coverage_arc, modulate, noise, pol  # noqa: E402

TEMPLATE = os.path.join(HERE, 'LiveSkin.lua')
SLUG, NAME = 'hostage-live', 'HoSTage Live'
FONTS = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', 'CE', 'web', 'src', 'assets', 'fonts'))
FPS = 15

# --- the contract with the host and with LiveSkin.lua --------------------------------------------------

PAGES = ['Live', 'Section', 'Labels', 'Meters']
TITLES = ['LIVE', 'SECTION', 'LABELS', 'METERS']
ENCODERS = [8, 8, 3, 6]
ASSETS = [(576, 'panels.png'), (578, 'tint.png'), (580, 'parts.png')]
CELL_BAR_Y = 239

GRID = (8, 32, 29, 27, 94, 62, 52)       # LIVE: x, y, pitch, width, height, bar base, bar height
ZONE = (8, 129, 464, 10)                 # a zone row: x, y, width, row pitch
KB = (8, 160, 16, 39, 22)                # the keys: x, y, white key pitch, the mark's y on a white and a black key
ARC = (0, 0, 64, 32, 7)                  # SECTION: the ring frames: x, y, size, frames, a row
ARC_R, ARC_W = 28, 4
STRIP = (4, 236, 186)                    # the strip's first cell: x, y, a cell's width
STRIPS, METER, HIST = (8, 34, 58, 56), (14, 52, 12, 138), (368, 100)
SPRITE_Y, LABEL_Y = 320, 370

# LIVE: the parts over the keys, and what the left hand holds bar by bar (bass, chord)
ZONES = [  # name, low, high, colour (its sound's brightness, as on the rig's LAYERS)
    ('SUB BASS', 36, 54, PARTS[0][6]),
    ('STRING PAD', 55, 84, PARTS[2][6]),
    ('BELL PLUCK  ARP', 55, 84, PARTS[4][6]),
]
CHORDS = [['C', 48, [60, 64, 67]], ['Am', 45, [57, 60, 64]], ['F', 41, [57, 60, 65]], ['G', 43, [55, 59, 62]]]
STEPS = [  # velocity (0 = a rest), octave, ratchets, chance
    [100, 0, 1, 100], [64, 0, 1, 100], [76, 1, 1, 100], [0, 0, 1, 100],
    [110, 0, 2, 100], [58, 0, 1, 80], [88, 1, 1, 100], [70, 0, 1, 100],
    [104, 0, 1, 100], [0, 0, 1, 100], [80, 1, 3, 100], [60, 0, 1, 60],
    [96, -1, 1, 100], [72, 0, 1, 100], [118, 1, 2, 100], [50, 0, 1, 90],
]
RATES, SPB = ['1/8', '1/8T', '1/16', '1/16T', '1/32'], [2, 3, 4, 6, 8]
MODES = ['UP', 'DOWN', 'UP/DN', 'RANDOM', 'CHORD']


def oct_of(v):
    return v * 5 // 128 - 2


def rat_of(v):
    return v * 4 // 128 + 1


def chance_of(v):
    return int(math.floor(v * 100 / 127 + 0.5))


def gate_of(v):
    return 5 + int(math.floor(v * 95 / 127 + 0.5))


# SECTION: the invented plug-in's filter, as the scan would report it. Boxes are where the scan
# found each control on the picture (screen pixels here: the picture is drawn at its fitted size);
# tag is where the turned control's name and value go. The order is the scan's reading order.
PLUGIN = 'NEBULA'
SEGMENTS, SEG_GAP = ['LP24', 'LP12', 'BP', 'HP'], 2
CONTROLS = [  # name, kind, format, box, saved value, tag
    ('TYPE', 'selector', 'type', [24, 58, 182, 20], 16, [24, 86, 150]),
    ('ENV INVERT', 'button', 'onoff', [300, 58, 64, 20], 0, [300, 86, 150]),
    ('CUTOFF', 'knob', 'hz', [52, 126, 44, 44], 84, [8, 98, 140]),
    ('RESONANCE', 'knob', 'pct', [136, 126, 44, 44], 40, [88, 98, 140]),
    ('DRIVE', 'knob', 'db', [208, 126, 44, 44], 30, [160, 98, 140]),
    ('ENV AMOUNT', 'knob', 'bip', [280, 126, 44, 44], 90, [232, 98, 140]),
    ('MIX', 'vfader', 'pct', [414, 96, 20, 116], 100, [268, 98, 140]),
    ('KEY TRACK', 'none', 'pct', [0, 0, 0, 0], 64, [0, 0, 0]),
]

# LABELS: the set, with forms; two names with letters the firmware's fonts do not have
VOCAB = ['Intro', 'Verse 1', 'Verse 2', 'Verse 3', 'Pre-Chorus', 'Chorus 1', 'Chorus 2', 'Chorus 3', 'Bridge',
         'Solo', 'Breakdown', 'Outro']
KIND = [1, 2, 2, 2, 3, 4, 4, 4, 5, 5, 3, 1]          # intro/outro, verse, build, chorus, bridge/solo
SONG_NAMES = ['Glass Harbour', 'Night Bus', 'Paper Moons', 'Low Tide', 'Copper Sky', 'Northbound',
              'Salt Road', 'Ember', 'Über den Fluss', 'Blue Hour', 'Café Minuit', 'Home Again']
KEYS = ['D minor', 'A minor', 'G major', 'E minor', 'Bb major', 'F# minor', 'C major', 'Ab major',
        'E major', 'D major', 'G minor', 'F major']
FORMS = [
    [(1, 4), (2, 8), (6, 8), (3, 8), (7, 8), (9, 4), (8, 8), (12, 4)],
    [(1, 8), (2, 16), (6, 8), (10, 8), (7, 16), (12, 8)],
    [(2, 8), (5, 4), (6, 8), (3, 8), (5, 4), (7, 8), (9, 8), (8, 8)],
    [(1, 4), (2, 8), (3, 8), (6, 8), (11, 8), (7, 8), (12, 4)],
    [(1, 4), (2, 8), (6, 8), (3, 8), (7, 8), (10, 8), (8, 8), (12, 4)],
    [(1, 8), (2, 8), (5, 4), (6, 8), (3, 8), (5, 4), (7, 8), (12, 8)],
    [(2, 8), (6, 8), (3, 8), (7, 8), (9, 8), (8, 16)],
    [(1, 4), (2, 12), (6, 8), (3, 12), (7, 8), (12, 4)],
    [(1, 8), (2, 8), (6, 8), (11, 8), (7, 8), (8, 8), (12, 8)],
    [(1, 4), (2, 8), (3, 8), (6, 8), (9, 4), (7, 8), (12, 4)],
    [(1, 4), (2, 8), (5, 4), (6, 8), (10, 8), (7, 8), (12, 4)],
    [(2, 8), (6, 8), (3, 8), (7, 8), (12, 8)],
]

# METERS: the rig's parts, each with how its notes fall away (dB a beat, how far, release beats)
ENVELOPES = [(2.0, 6, 0.5), (4.0, 18, 0.6), (0.5, 3, 2.0), (8.0, 12, 0.3), (10.0, 30, 1.5)]
SHORT = ['BASS', 'PIANO', 'PAD', 'BRASS', 'BELL']
PAN = [[0, 0], [-1.5, 0.5], [0.5, -1.0], [-3.0, 0], [1.0, -2.0], [0, 0]]

DEFAULTS = [
    [4, STEPS[0][0], enc_of(oct_of, STEPS[0][1]), enc_of(rat_of, STEPS[0][2]), enc_of(chance_of, STEPS[0][3]),
     enc_of(gate_of, 50), 64, 12],
    [c[4] for c in CONTROLS],
    [5, 40, 0, 64, 64, 64, 64, 64],
    [104, 96, 100, 92, 88, 104, 64, 64],
]

ROLES = {   # text role: (font, size), horizontal justification (0 left, 1 centre, 2 right)
    'title': ((10, 15), 0), 'head': ((9, 11), 2), 'foot': ((9, 9), 0), 'name': ((10, 18), 1),
    'label': ((10, 9), 1), 'cell': ((9, 13), 1), 'small': ((10, 9), 1), 'tag': ((9, 10), 0),
    'tag9': ((9, 9), 0), 'zone': ((9, 9), 0), 'ctext': ((10, 9), 1), 'badge': ((10, 9), 1), 'diag': ((9, 8), 2),
}

THEME = dict(
    title=P['text'], head=P['dim'], foot='#565E7E', label='#8890B0', value=P['text'], dim='#565E7E',
    dot_off=P['raised'], bar='#4A5378', raised=P['raised'], track=P['raised'], ring='#9AA3C2',
    on_accent=P['bg'], load_bg=P['bg'], load_bar=P['violet'], spec_in='#2E3757', bad='#FF4D6A',
    section=P['violet'], stage=P['amber'],
    kinds=[P['teal'], P['violet'], '#9AA3C2', P['pink'], P['amber']],
)

# --- the words, drawn by "HoSTage" -------------------------------------------------------------------------


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def bsc(weight, size):
    return font('barlow-semi-condensed-%d-latin.woff2' % weight, size)


def words():
    """Every word of the LABELS page: [(sprite name, coverage image)]. Each size has one line box
    (accents above, descenders below) so words of a size share a baseline when placed by their
    top; the digits are cropped to the digits alone."""
    out = []

    def line(name, text, f, probe='ÉÜHgjpqy'):
        top, bottom = f.getbbox(probe, anchor='ls')[1], f.getbbox(probe, anchor='ls')[3]
        w = int(math.ceil(f.getlength(text))) + 2
        im = Image.new('L', (w, bottom - top + 2), 0)
        ImageDraw.Draw(im).text((1, 1 - top), text, font=f, fill=255, anchor='ls')
        out.append((name, im))

    def digits(prefix, f, extra=()):
        top = min(f.getbbox(d, anchor='ls')[1] for d in '0123456789')
        for d in list('0123456789') + list(extra):
            glyph = '/' if d == 'slash' else d
            w = int(math.ceil(f.getlength(glyph))) + 1
            im = Image.new('L', (w, -top + 2), 0)
            ImageDraw.Draw(im).text((0, 1 - top), glyph, font=f, fill=255, anchor='ls')
            out.append((prefix + d if d != 'slash' else 'slash', im))

    for k, name in enumerate(SONG_NAMES):
        size = 46
        while bsc(700, size).getlength(name) > 440:
            size -= 1
        line('s%db' % (k + 1), name, bsc(700, 46) if size == 46 else bsc(700, size))
        line('s%ds' % (k + 1), name, bsc(600, 18))
        bpm = SET[k][1]
        line('s%dm' % (k + 1), '%d BPM  ·  %s  ·  4/4' % (bpm, KEYS[k]), bsc(500, 16))
    for k, name in enumerate(VOCAB):
        line('v%dB' % (k + 1), name, bsc(600, 28))
        line('v%dS' % (k + 1), name, bsc(500, 11))
    digits('big', bsc(700, 64))
    digits('small', bsc(600, 16), extra=('slash',))
    line('stage', 'Stage', bsc(600, 18))
    line('barsleft', 'bars left', bsc(500, 15))
    line('barleft', 'bar left', bsc(500, 15))
    line('nextsong', 'Next song', bsc(500, 13))
    return out


def pack(items, y0, width=W):
    """Shelf-packs the words below y0: tallest first, a pixel apart. Returns positions and the
    height used."""
    order = sorted(range(len(items)), key=lambda i: (-items[i][1].height, items[i][0]))
    pos, x, y, shelf = {}, 0, y0, 0
    for i in order:
        name, im = items[i]
        assert im.width <= width, (name, im.width)
        if x + im.width > width:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[name] = (x, y, im.width, im.height)
        x += im.width + 1
        shelf = max(shelf, im.height)
    return pos, y + shelf + 1


# --- pictures ---------------------------------------------------------------------------------------------


def cell_tracks(img, n):
    for i in range(n):
        rrect(img, (i * 60 + 8, CELL_BAR_Y, 44, 4), 2, P['raised'])


def live_bg():
    img = new(W, H, P['bg'])
    x0, y0, pitch, w, h = GRID[:5]
    for k in range(16):
        rrect(img, (x0 + k * pitch, y0, w, h), 4, P['card'])
        if k % 4 == 0:
            rect(img, (x0 + k * pitch, y0 + h + 1, w, 1), '#2B3456')   # the beats
    zx, zy, zw, zp = ZONE
    for k in range(len(ZONES)):
        rect(img, (zx, zy + k * zp, zw, zp - 1), '#141A2E')
    keyboard(img, KB[0], KB[1], KB[2], 36, 84)
    cell_tracks(img, 8)
    return img


def meter_y(db):
    return METER[1] + METER[3] - max(0, min(METER[3], int((db + 48) * METER[3] // 54)))


def meters_bg():
    img = new(W, H, P['bg'])
    x0, _, pitch, sw = STRIPS
    mx, my, step, mh = METER
    for k in range(6):
        x = x0 + k * pitch
        card(img, (x, 30, sw, 176), 6)
        rrect(img, (x + mx, my - 8, 2 * step - 2, 4), 1, P['raised'])
        for side in range(2):
            rect(img, (x + mx + side * step, my, step - 2, mh), '#1B2240')
        for db in (6, 0, -6, -12, -24, -48):
            rect(img, (x + mx - 5, meter_y(db), 3, 1), '#3A4468' if db else '#6B7393')
    card(img, (HIST[0] - 6, 30, HIST[1] + 10, 176), 6)
    rect(img, (HIST[0], meter_y(0), 96, 1), '#3A4468')
    rect(img, (HIST[0], METER[1] + METER[3], 96, 1), '#2B3456')
    cell_tracks(img, 6)
    return img


CREAM, LED = '#D9CDB0', '#FF9E3D'


def plugin_knob(img, cx, cy, value):
    """The invented plug-in's own knob: a printed scale, a skirt, a cap, the pointer where the
    parameter was when the scan took the picture."""
    for i in range(11):
        x, y = pol(cx, cy, 33, -150 + 30 * i)
        disc(img, x, y, 1.0 if i % 5 else 1.4, CREAM)
    disc(img, cx, cy + 1.5, 23, (0, 0, 0, 120))
    disc(img, cx, cy, 22, '#17181C')
    disc(img, cx, cy, 19, '#3A3C44')
    disc(img, cx, cy - 1, 17, '#4A4D57')
    disc(img, cx, cy, 15, '#3F424B')
    a = -150 + 300 * value / 127
    m = mask(W, H, lambda d, s: d.line([pol(cx * s, cy * s, 6 * s, a), pol(cx * s, cy * s, 18 * s, a)], fill=255, width=int(3 * s)))
    put(img, paint(m, CREAM))


def engraved(img, xy, text, f, colour=CREAM, anchor='la'):
    layer = new(W, H)
    ImageDraw.Draw(layer).text(xy, text, font=f, fill=colour, anchor=anchor)
    put(img, layer)


def section_bg():
    img = new(W, H, P['bg'])
    # the plug-in's picture: its brushed graphite, its own lettering, its own controls
    x, y, w, h = 6, 27, 468, 203
    panel = new(w, h, '#26272C')
    panel = modulate(panel, noise(w, h, 5, stretch=(12, 1)), 0.10)
    m = mask(w, h, lambda d, s: d.rounded_rectangle((0, 0, w * s - 1, h * s - 1), 6 * s, fill=255))
    panel.putalpha(m)
    put(img, panel, x, y)
    grotesk = font('liberation-sans-bold.woff2', 13)
    small = font('liberation-sans-regular.woff2', 9)
    engraved(img, (18, 31), 'FILTER', grotesk)
    engraved(img, (462, 33), 'VCF  ·  2', small, '#8C8573', 'ra')
    rect(img, (14, 48, 452, 1), '#3A3B42')
    by, bh = CONTROLS[0][3][1], CONTROLS[0][3][3]
    sw = (CONTROLS[0][3][2] + SEG_GAP) // len(SEGMENTS)
    for k, name in enumerate(SEGMENTS):
        sx = CONTROLS[0][3][0] + k * sw
        lit = k == CONTROLS[0][4] * len(SEGMENTS) // 128
        rrect(img, (sx, by, sw - SEG_GAP, bh), 3, '#5A3A1C' if lit else '#1A1B1F')
        engraved(img, (sx + (sw - SEG_GAP) // 2, by + bh // 2), name, small, LED if lit else '#8C8573', 'mm')
    engraved(img, (24, 81), 'TYPE', small, '#8C8573')
    bx, by, bw, bh = CONTROLS[1][3]
    rrect(img, (bx, by, bw, bh), 3, '#1A1B1F')
    disc(img, bx + 9, by + bh / 2, 3, '#4A3420')
    engraved(img, (bx + 18, by + bh // 2), 'INVERT', small, '#B8AE96', 'lm')
    engraved(img, (bx, 81), 'ENV', small, '#8C8573')
    for name, kind, _, box, value, _ in CONTROLS[2:6]:
        cx, cy = box[0] + box[2] // 2, box[1] + box[3] // 2
        plugin_knob(img, cx, cy, value)
        engraved(img, (cx, cy + 42), name, small, CREAM, 'mm')
    fx, fy, fw, fh = CONTROLS[6][3]
    rrect(img, (fx + fw // 2 - 3, fy, 6, fh), 3, '#101114')
    for i in range(7):
        rect(img, (fx - 2, fy + 4 + i * (fh - 8) // 6, 4, 1), '#6E6858')
    cap = fy + (127 - CONTROLS[6][4]) * (fh - 8) // 127
    rrect(img, (fx - 2, cap - 2, fw + 4, 12), 2, '#5E616B')
    rect(img, (fx - 2, cap + 3, fw + 4, 2), CREAM)
    engraved(img, (fx + fw // 2, 84), 'MIX', small, CREAM, 'mm')
    # the strip under the picture: a cell for the control the scan did not find
    rrect(img, (STRIP[0], STRIP[1], STRIP[2] - 4, 32), 4, P['card'])
    rrect(img, (STRIP[0] + 84, STRIP[1] + 22, 50, 4), 2, P['raised'])
    return img


def labels_bg():
    img = new(W, H, P['bg'])
    card(img, (8, 114, 464, 90), 6)
    return img


# --- the coverage atlas -----------------------------------------------------------------------------------

def arc_frame(k):
    a1 = -150 + 300 * k / (ARC[3] - 1)
    c = ARC[2] / 2
    return mask(ARC[2], ARC[2], lambda d, s: coverage_arc(d, s, c, c, ARC_R, ARC_W, -150, a1))


SPRITES = {
    'dot': (0, SPRITE_Y, 5, 5), 'dot_big': (6, SPRITE_Y, 9, 9), 'ring': (16, SPRITE_Y, 9, 9),
    'badge': (26, SPRITE_Y, 13, 13),
    'key_c': (40, SPRITE_Y, 15, WHITE_H), 'key_d': (56, SPRITE_Y, 15, WHITE_H), 'key_e': (72, SPRITE_Y, 15, WHITE_H),
    'key_full': (88, SPRITE_Y, 15, WHITE_H), 'key_black': (104, SPRITE_Y, BLACK_W, BLACK_H),
}


def tint_atlas():
    labels, height = pack(words(), LABEL_Y)
    atlas = Image.new('L', (W, height), 0)
    for k in range(ARC[3]):
        atlas.paste(arc_frame(k), (ARC[0] + (k % ARC[4]) * ARC[2], ARC[1] + (k // ARC[4]) * ARC[2]))
    pieces = {'dot': dot(5, 2.2), 'dot_big': dot(9, 3.8), 'ring': ring(9, 3.4, 1.5), 'badge': dot(13, 6.3),
              'key_c': lit_key(False, True), 'key_d': lit_key(True, True), 'key_e': lit_key(True, False),
              'key_full': lit_key(False, False), 'key_black': black_key()}
    for name, im in pieces.items():
        x, y, w, h = SPRITES[name]
        assert im.size == (w, h), (name, im.size, (w, h))
        atlas.paste(im, (x, y))
    for name, im in words():
        atlas.paste(im, labels[name][:2])
    pal = Image.frombytes('P', atlas.size, atlas.tobytes())
    pal.putpalette([v for i in range(256) for v in (i, i, i)])
    return pal, labels


# --- the Lua and the manifest -------------------------------------------------------------------------

def tips():
    out = []
    for v in range(128):
        x, y = pol(0, 0, ARC_R, -150 + 300 * v / 127)
        out += [int(round(x - 0.5)), int(round(y - 0.5))]
    return out


def data():
    songs = []
    for k, form in enumerate(FORMS):
        songs.append(dict(big='s%db' % (k + 1), small='s%ds' % (k + 1), meta='s%dm' % (k + 1), bpm=SET[k][1],
                          sections=[list(s) for s in form]))
    return {
        'parts': [dict(name=n, lo=lo, hi=hi, colour=c, dim='#%02X%02X%02X' % mix(c, P['card'], 0.62)[:3])
                  for n, lo, hi, c in ZONES],
        'chords': CHORDS, 'steps': STEPS, 'rates': RATES, 'spb': SPB, 'modes': MODES, 'bpm': 112, 'offset': 0.42,
        'section': dict(name='FILTER', plugin=PLUGIN, index=3, count=6, segments=SEGMENTS, gap=SEG_GAP,
                        controls=[dict(name=n, kind=k, fmt=f, box=b, tag=t) for n, k, f, b, _, t in CONTROLS]),
        'tip': tips(),
        'songs': songs, 'vocab': ['v%d' % (k + 1) for k in range(len(VOCAB))], 'kind': KIND,
        'meter_parts': [dict(name=n, short=SHORT[k], lo=lo, hi=hi, vlo=vlo, vhi=vhi, colour=c,
                             decay=ENVELOPES[k][0], drop=ENVELOPES[k][1], rel=ENVELOPES[k][2])
                        for k, (n, lo, hi, vlo, vhi, _, c) in enumerate(PARTS)],
        'pan': PAN, 'play': PLAY, 'loop_beats': 16, 'play_bpm': 96, 'play_offset': 4.5,
    }


LAYOUT = {
    'pages': len(PAGES), 'defaults': DEFAULTS, 'fps': FPS,
    'bg': [[577, 0], [581, 0], [581, 272], [577, 272]],
    'title': [18, 5, 250, 20], 'head': [170, 5, 296, 20], 'foot': [14, 254, 286, 16],
    'dots': [410, 260, 12, 8, 4], 'bar': [6, 8, 4, 14], 'diag': [300, 255, 104, 12],
    'cell_label_y': 210, 'cell_value_y': 221, 'cell_bar_y': CELL_BAR_Y,
    'grid': list(GRID), 'zone': list(ZONE), 'kb': list(KB),
    'arc': list(ARC), 'badge': 13, 'strip': list(STRIP),
    'lright': 466, 'lname': [18, 33], 'lmeta': 90, 'lcard': [22, 121], 'lbeat': 168, 'lbars': [388, 129, 160],
    'lform': [18, 212, 444, 8], 'lnext': 244,
    'strips': list(STRIPS), 'meter': list(METER), 'hist': list(HIST),
}


def skin_lua(D, labels):
    theme = dict(THEME)
    theme['name'] = NAME.upper()
    theme['titles'] = TITLES
    theme['roles'] = sorted(ROLES)
    theme['fonts'] = {k: list(f) for k, (f, _) in ROLES.items()}
    theme['aligns'] = {k: a for k, (_, a) in ROLES.items()}
    sprites = {k: list(v) for k, v in SPRITES.items()}
    sprites.update({k: list(v) for k, v in labels.items()})
    block = '\n'.join([
        '-- BEGIN GENERATED (make_live_mockups.py writes this block)',
        '-- %s. Generated: edit make_live_mockups.py and LiveSkin.lua, then regenerate.' % NAME,
        lua_table('T', theme), lua_table('L', LAYOUT), lua_table('S', sprites), lua_table('D', D),
        '-- END GENERATED'])
    template = open(TEMPLATE, encoding='utf-8').read()
    assert len(GENERATED.findall(template)) == 1, 'LiveSkin.lua must hold exactly one GENERATED block'
    return GENERATED.sub(lambda _: block, template)


def manifest():
    out = ['; %s - a CTRL49 screen-lab preset. Generated by make_live_mockups.py.' % NAME,
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


def build():
    folder = os.path.join(HERE, SLUG)
    os.makedirs(folder, exist_ok=True)
    panels = new(W, 2 * H)
    for p, im in enumerate([live_bg(), meters_bg()]):
        panels.paste(im, (0, p * H))
    panels.save(os.path.join(folder, 'panels.png'), optimize=True)
    tint, labels = tint_atlas()
    tint.save(os.path.join(folder, 'tint.png'), optimize=True)
    parts = new(W, 2 * H)
    for p, im in enumerate([section_bg(), labels_bg()]):
        parts.paste(im, (0, p * H))
    parts.save(os.path.join(folder, 'parts.png'), optimize=True)
    with open(os.path.join(folder, 'Skin.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(skin_lua(data(), labels))
    with open(os.path.join(folder, 'Design.ctrl49preset'), 'w', encoding='ascii', newline='') as f:
        f.write(manifest())
    lua = os.path.getsize(os.path.join(folder, 'Skin.lua'))
    upload = sum(os.path.getsize(os.path.join(folder, f)) for _, f in ASSETS)
    rgba = (W * 2 * H * 2 + tint.width * tint.height) * 4
    print('%-22s Skin.lua %3d KB, uploads %3d KB, tint.png %d x %d, decoded %d KiB at four bytes a pixel'
          % (SLUG, lua // 1000, upload // 1000, tint.width, tint.height, rgba // 1024))


if __name__ == '__main__':
    build()
