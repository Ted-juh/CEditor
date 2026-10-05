#!/usr/bin/env python3
"""A pattern arpeggiator for the CTRL49 screen lab, as a mockup: a piano roll, in the Rhythm Box
1980 design.

    python make_roll_mockup.py

Writes rhythm-box-1980-roll/: the manifest, Skin.lua (RollSkin.lua with its GENERATED block
filled in), and three atlases:

  panels.png  480 x 544  the EDIT and PLAY backgrounds
  roll.png    456 x 280  the grid (416 wide) and the keyboard (40 wide), 28 semitone rows each,
                         starting on a B: they repeat every octave, so one crop draws any scroll
  parts.png    80 x 20   the keyboard's lit keys

About 1.5 MiB decoded. The materials are make_era_designs.py's RhythmBox. Pillow only;
deterministic.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_era_designs as era                                  # noqa: E402
from make_era_designs import W, H, new, put, rect, recess, grad, mix, lua_table   # noqa: E402

TEMPLATE = os.path.join(HERE, 'RollSkin.lua')
SLUG, NAME = 'rhythm-box-1980-roll', 'Rhythm Box 1980 Roll'
FPS = 15
PAGES = ['Edit', 'Play']
ENCODERS = [8, 6]
ASSETS = [(576, 'panels.png'), (578, 'roll.png'), (580, 'parts.png')]

STRIP = 60
GRID_X, GRID_Y, GRID_W = 48, 46, 416
ROWS, ROW_H, STEP_W = 16, 10, 26
PIANO_X, PIANO_W = 4, 40
STRIP_ROWS = 28                  # 16 visible + 11 of scroll within an octave + 1
FRAME = (2, 44, 464, 164)
BLACK_PCS = (1, 3, 6, 8, 10)
LENGTH_1_STEP = 4


def note_value(n):
    """The EDIT E2 value RollSkin.lua reads as MIDI note n (28 + value / 2)."""
    return (n - 28) * 2


# The pattern: (step, note, length, velocity); length 1-3 is a quarter to three quarters of a
# step, 4-7 one to four steps. Two bars in C minor, with notes above and below the starting
# scroll (C3-D#4) so the edge markers show.
PATTERN = [
    (0, 48, 4, 112), (1, 55, 2, 80), (2, 60, 2, 90), (3, 63, 4, 100), (5, 55, 4, 84), (6, 58, 3, 76),
    (7, 60, 5, 104), (9, 51, 4, 92), (10, 55, 2, 70), (11, 60, 4, 96), (12, 62, 2, 60), (13, 63, 4, 120),
    (15, 67, 4, 100),
    (16, 44, 5, 112), (18, 51, 4, 84), (19, 56, 4, 90), (20, 60, 2, 100), (21, 63, 2, 76), (22, 60, 4, 88),
    (24, 46, 5, 108), (26, 53, 4, 80), (27, 58, 4, 92), (28, 62, 3, 70), (29, 65, 4, 116), (30, 62, 2, 60),
    (31, 58, 6, 96),
]


def pattern_flat():
    flat = [0, 0, 100] * 64
    for step, note, length, vel in PATTERN:
        flat[step * 3: step * 3 + 3] = [note, length, vel]
    return flat


DEFAULTS = [
    # step 1, E2 on C4 (a ghost beside step 1's C3), velocity 100, one step, scroll C3, key C,
    # 1/16, 120 BPM
    [0, note_value(60), 100, 72, 52, 64, 72, 60],
    # 32 steps, forwards, swing 54 %, gate 100 %, octave 0, follow on
    [62, 0, 21, 55, 64, 127, 64, 64],
]

LAYOUT = {
    'pages': len(PAGES), 'fps': FPS, 'defaults': DEFAULTS, 'bg': [0, H],
    'title': [14, 5, 150, 20], 'head': [170, 5, 296, 20], 'foot': [14, 254, 380, 16],
    'dots': [440, 260, 12, 8, 4],
    'grid': [GRID_X, GRID_Y, GRID_W], 'rows': ROWS, 'row_h': ROW_H, 'step_w': STEP_W,
    'piano': [PIANO_X, PIANO_W], 'ruler_y': 32,
    'grid_strip': [0, 0], 'piano_strip': [GRID_W, 0],
    'strip_w': STRIP, 'cell_label_y': 210, 'cell_value_y': 221, 'cell_bar': [8, 44, 239, 4],
    'pattern': pattern_flat(),
}

SPRITES = {'wplay': (0, 0, 40, 9), 'wcur': (0, 10, 40, 9), 'bplay': (42, 0, 26, 8), 'bcur': (42, 10, 26, 8)}


def lua_theme():
    return dict(
        name=NAME.upper(), titles=[p.upper() for p in PAGES],
        title='#EDE6CF', head='#A9A6A0', label='#C9C4B5', value='#F4EFE2', accent='#F2C514', cursor='#F07F1A',
        dim='#77746E', off='#4A4A4C', foot='#8E8C86', dot_on='#F07F1A', dot_off='#4A4A4C', bar='#F07F1A',
        note='#F07F1A', note_hi='#FFB36B', note_soft='#A5561A', note_soft_hi='#D9823A',
        note_loud='#E8342C', note_loud_hi='#FF8A80', note_play='#F2C514', note_play_hi='#FFF0A0',
        ghost='#EDE6CF', beyond='#0F0F10', playhead='#F2C514', key_label='#6A6052',
        load_bg='#2B2B2D', load_text='#EDE6CF', load_dim='#8E8C86', load_track='#46464A', load_bar='#F07F1A',
        f_title=[0, 15], f_head=[2, 11], f_label=[2, 9], f_big=[0, 24], f_foot=[10, 9], f_small=[2, 9],
        f_cell=[10, 11], f_key=[2, 8],
    )


# --- pictures ------------------------------------------------------------------------------------

def pc_of_row(i):
    """Strip row i from the top: row 0 is a B, then down a semitone a row."""
    return (11 - i) % 12


def grid_strip():
    im = new(GRID_W, STRIP_ROWS * ROW_H)
    for i in range(STRIP_ROWS):
        pc, y = pc_of_row(i), i * ROW_H
        rect(im, (0, y, GRID_W, ROW_H), '#161618' if pc in BLACK_PCS else '#1E1E21')
        rect(im, (0, y + ROW_H - 1, GRID_W, 1), '#36363B' if pc == 0 else '#141415')   # under each C: the octave
    for k in range(1, 16):
        rect(im, (k * STEP_W, 0, 1, STRIP_ROWS * ROW_H), '#3E3E43' if k % 4 == 0 else '#28282B')
    return im


def piano_strip():
    """A keyboard on its side: white keys run left (the back) to right (the front); black keys
    are bars from the left on their own rows. White keys part at the middle of a black key, and
    full width between E and F and between B and C."""
    h = STRIP_ROWS * ROW_H
    im = grad(PIANO_W, h, [(0, '#BDB49C'), (0.25, '#E4DCC6'), (1, '#F4EEDC')], vertical=False)
    rect(im, (0, 0, 2, h), (0, 0, 0, 90))
    for i in range(STRIP_ROWS):
        pc, y = pc_of_row(i), i * ROW_H
        if pc in BLACK_PCS:
            rect(im, (27, y + ROW_H // 2, PIANO_W - 27, 1), '#A39A82')
            rect(im, (0, y + 1, 27, ROW_H - 1), (0, 0, 0, 70))                   # its shadow
            put(im, grad(26, ROW_H - 2, [(0, '#3E3B37'), (0.45, '#232120'), (1, '#0E0D0C')]), 0, y + 1)
            rect(im, (2, y + 2, 21, 1), (255, 255, 255, 40))
        if pc in (5, 0):                                                           # F over E, C over B
            rect(im, (0, y + ROW_H - 1, PIANO_W, 1), '#A39A82')
    rect(im, (PIANO_W - 1, 0, 1, h), (0, 0, 0, 60))
    return im


def lit_key(colour, w, h, black):
    top, bottom = (mix(colour, (0, 0, 0), 0.25), mix(colour, (0, 0, 0), 0.55)) if black else \
                  (mix(colour, (255, 255, 255), 0.25), colour)
    im = grad(w, h, [(0, mix(colour, (0, 0, 0), 0.3)), (0.3, top), (1, bottom)], vertical=False)
    rect(im, (0, 0, w, 1), (255, 255, 255, 60))
    return im


def parts():
    atlas = new(80, 20)
    pieces = {'wplay': lit_key('#F2C514', 40, 9, False), 'wcur': lit_key('#F07F1A', 40, 9, False),
              'bplay': lit_key('#F2C514', 26, 8, True), 'bcur': lit_key('#F07F1A', 26, 8, True)}
    for name, im in pieces.items():
        x, y, w, h = SPRITES[name]
        assert im.size == (w, h), (name, im.size)
        atlas.paste(im, (x, y))
    return atlas


def background(th, page):
    img = th.surface(page)
    th.header(img)
    th.footer(img)
    recess(img, FRAME, 3, '#0E0E0F', th.P['lip_dark'], th.P['lip_light'])
    for i in range(ENCODERS[page]):
        th.track(img, (i * STRIP + 8, 239, 44, 4))
    return img


# --- the design -----------------------------------------------------------------------------------

def skin_lua():
    block = '\n'.join([
        '-- BEGIN GENERATED (make_roll_mockup.py writes this block)',
        '-- %s. Generated: edit make_roll_mockup.py and RollSkin.lua, then regenerate.' % NAME,
        lua_table('T', lua_theme()), lua_table('L', LAYOUT),
        lua_table('S', {k: list(v) for k, v in SPRITES.items()}),
        '-- END GENERATED'])
    template = open(TEMPLATE, encoding='utf-8').read()
    pattern = re.compile(r'-- BEGIN GENERATED.*?-- END GENERATED', re.S)
    assert len(pattern.findall(template)) == 1, 'RollSkin.lua must hold exactly one GENERATED block'
    return pattern.sub(lambda _: block, template)


def manifest():
    out = ['; %s - a CTRL49 screen-lab preset: a pattern arpeggiator, as a mockup.' % NAME,
           '; Generated by make_roll_mockup.py. Run: Ctrl49ScreenLab.exe preset "<this file>"',
           '; There is no envelope page; envelopePage names PLAY, whose Lua ignores set_envelope.',
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
    th = era.RhythmBox()
    folder = os.path.join(HERE, SLUG)
    os.makedirs(folder, exist_ok=True)
    panels = new(W, 2 * H)
    for p in range(2):
        panels.paste(background(th, p), (0, p * H))
    panels.save(os.path.join(folder, 'panels.png'), optimize=True)
    roll = new(GRID_W + PIANO_W, STRIP_ROWS * ROW_H)
    roll.paste(grid_strip(), (0, 0))
    roll.paste(piano_strip(), (GRID_W, 0))
    roll.save(os.path.join(folder, 'roll.png'), optimize=True)
    parts().save(os.path.join(folder, 'parts.png'), optimize=True)
    with open(os.path.join(folder, 'Skin.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(skin_lua())
    with open(os.path.join(folder, 'Design.ctrl49preset'), 'w', encoding='ascii', newline='') as f:
        f.write(manifest())
    kib = (W * 2 * H + (GRID_W + PIANO_W) * STRIP_ROWS * ROW_H + 80 * 20) * 4 / 1024
    print('%-22s %s  decoded about %d KiB' % (SLUG, folder, kib))


if __name__ == '__main__':
    main()
