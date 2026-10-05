#!/usr/bin/env python3
"""A full arpeggiator for the CTRL49 screen lab, as a mockup, in the Rhythm Box 1980 design.

    python make_arp_mockup.py

Writes rhythm-box-1980-arp/: the manifest, Skin.lua (ArpSkin.lua with its GENERATED block
filled in), and three atlases:

  panels.png  480 x 816  the PLAY, MOTION and STEPS backgrounds, stacked
  lanes.png   480 x 816  the VELOCITY, OCTAVE and CHANCE backgrounds, stacked
  parts.png   480 x 150  sprites

Six backgrounds in two atlases of the proven 480 x 816 size, so no decode is larger than
Machined Metal's; there is no knob strip (the eight encoders are the knobs), so the total,
3.3 MiB decoded, is close to its 3.1. The materials are make_era_designs.py's RhythmBox.
Pillow only; deterministic.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_era_designs as era                                  # noqa: E402
from make_era_designs import (W, H, new, put, rect, recess, disc, glow_dot, mask, drop_shadow,  # noqa: E402
                              clip, grad, mix, bevel, lua_table)

TEMPLATE = os.path.join(HERE, 'ArpSkin.lua')
SLUG, NAME = 'rhythm-box-1980-arp', 'Rhythm Box 1980 Arp'
FPS = 15
PAGES = ['Play', 'Motion', 'Steps', 'Velocity', 'Octave', 'Chance']
ASSETS = [(576, 'panels.png'), (578, 'lanes.png'), (580, 'parts.png')]
STRIP = 60

KB_X, KB_Y, KB_W, KB_H, KB_BW, KB_BH, KB_LO = 16, 36, 14, 44, 8, 26, 48
NOW_WIN = (320, 34, 146, 48)
LANE_WIN, LANE = (14, 86, 452, 100), (16, 88, 448, 96, 28)
CONTOUR_WIN, CONTOUR = (14, 34, 452, 152), (16, 36, 448, 148)
TRACK_Y = 230
GLYPH_Y, VEL_BASE, RUNG_Y, RUNG_PITCH = 82, 178, 54, 24
LEDS, LED_BASE = 16, 178          # the chance column: the bottom sixteen of the meter's eighteen LEDs


def step_type(t):
    """The encoder value ArpSkin.lua reads as step type t (0 rest .. 7 chord)."""
    return t * 16 + 8


def step_octave(o):
    return (o + 2) * 128 // 5 + 12


DEFAULTS = [
    [22, 86, 40, 71, 21, 60, 58, 0],             # UP/DN, 1/16, 2 octaves, 60 %, 54 %, 120 BPM, MIN7, C
    [0, 0, 64, 0, 127, 64, 0, 0],                # octaves up, x1, no transpose, root, 8 steps, +30, 0 %, no reset
    [step_type(t) for t in (2, 1, 3, 1, 2, 4, 0, 7)],   # accent note tie note accent x2 rest chord
    [110, 72, 90, 64, 100, 84, 50, 96],
    [step_octave(o) for o in (0, 0, 0, 1, 0, -1, 0, 0)],
    [127, 127, 127, 127, 95, 127, 127, 80],      # chance: 100 % but steps 5 (74 %) and 8 (62 %)
]

LAYOUT = {
    'pages': len(PAGES), 'fps': FPS, 'defaults': DEFAULTS,
    'bg': [[577, 0], [577, 272], [577, 544], [579, 0], [579, 272], [579, 544]],
    'title': [14, 5, 250, 20], 'head': [210, 5, 256, 20], 'foot': [14, 254, 370, 16],
    'dots': [398, 260, 12, 8, 4],
    'kb': [KB_X, KB_Y, KB_W, KB_H, KB_BW, KB_BH], 'kb_lo': KB_LO,
    'now': list(NOW_WIN), 'lane': list(LANE), 'contour': list(CONTOUR),
    'strip_w': STRIP, 'cell_label_y': 190, 'cell_value_y': 203, 'cell_bar': [8, 44, TRACK_Y, 4],
    'num_y': 33, 'value_y': 185, 'key_y': 206,
    'glyph_y': GLYPH_Y, 'vel_base': VEL_BASE, 'rung_y': RUNG_Y, 'rung_pitch': RUNG_PITCH,
    'leds': LEDS, 'led_pitch': 8, 'led_y': LED_BASE - 144,
}

SPRITES = {
    'velbar': (0, 0, 14, 128), 'leds': (16, 0, 8, 144), 'dot': (26, 0, 10, 10), 'dot_on': (38, 0, 14, 14),
    'wlit': (54, 0, 13, 44), 'wplay': (68, 0, 13, 44),
    'black': (82, 0, 8, 26), 'blit': (92, 0, 8, 26), 'bplay': (102, 0, 8, 26),
    'oct': (112, 0, 40, 16), 'oct_on': (112, 18, 40, 16),
}
for _i in range(8):
    SPRITES['key%d' % (_i + 1)] = (128 + _i * 44, 46, 44, 30)
    SPRITES['key_on%d' % (_i + 1)] = (128 + _i * 44, 78, 44, 30)


def lua_theme(th):
    return dict(
        name=NAME.upper(), titles=[p.upper() for p in PAGES],
        title='#EDE6CF', head='#A9A6A0', label='#C9C4B5', value='#F4EFE2', accent='#F2C514',
        dim='#77746E', off='#4A4A4C', foot='#8E8C86', dot_on='#F07F1A', dot_off='#4A4A4C', bar='#F07F1A',
        block='#F07F1A', block_hi='#FFB36B', block_accent='#E8342C', block_accent_hi='#FF8A80',
        block_chord='#E8E1CC', block_chord_hi='#FFFFFF', block_play='#F2C514', block_play_hi='#FFF0A0',
        block_ghost='#4E3D2E', playhead='#D7262A', now='#F2C514', pos_on='#5A5A5E', pos_off='#2A2A2C',
        contour='#8A5320', c_line='#29292B', cycle='#4A4A4C',
        load_bg='#2B2B2D', load_text='#EDE6CF', load_dim='#8E8C86', load_track='#46464A', load_bar='#F07F1A',
        f_title=[0, 15], f_head=[2, 11], f_label=[2, 9], f_value=[10, 14], f_big=[0, 24], f_foot=[10, 9],
        f_small=[2, 9], f_cell=[10, 11], f_now=[0, 20],
    )


# --- backgrounds -----------------------------------------------------------------------------------

def tracks(th, img):
    for i in range(8):
        th.track(img, (i * STRIP + 8, TRACK_Y, 44, 4))


def dividers(th, img):
    for i in range(1, 8):
        th.divider(img, i * STRIP, 36, 240)


def background(th, page):
    img = th.surface(page)
    th.header(img)
    th.footer(img)
    if page == 0:
        recess(img, (KB_X - 2, KB_Y - 2, 21 * KB_W + 2, KB_H + 4), 2, th.P['keybed'], th.P['lip_dark'], th.P['lip_light'], inner=60)
        for k in range(21):
            put(img, th.white_key('off', KB_W - 1, KB_H), KB_X + k * KB_W, KB_Y)
        for octave in range(3):
            for left in (0, 1, 3, 4, 5):
                put(img, th.black_key('off', KB_BW, KB_BH), KB_X + (octave * 7 + left + 1) * KB_W - KB_BW // 2, KB_Y)
        th.display(img, NOW_WIN)
        th.display(img, LANE_WIN)
        th.grid(img, LANE[:4], 16, 1, strong=True)
        tracks(th, img)
    elif page == 1:
        th.display(img, CONTOUR_WIN)
        th.grid(img, CONTOUR, 8, 1)
        tracks(th, img)
    elif page == 2:
        for i in range(8):
            recess(img, (i * STRIP + 6, 46, 48, 134), 3, th.P['window'], th.P['lip_dark'], th.P['lip_light'])
        dividers(th, img)
    elif page == 3:
        for i in range(8):
            cx = i * STRIP + STRIP // 2
            th.seq_well(img, (cx - 9, 46, 18, 134))
            for v in (0, 32, 64, 96, 127):
                rect(img, (cx - 16, VEL_BASE - 1 - v * 128 // 127, 4, 1), th.P['tick'])
        dividers(th, img)
    elif page == 4:
        for i in range(8):
            cx = i * STRIP + STRIP // 2
            for r in range(5):
                recess(img, (cx - 20, RUNG_Y + r * RUNG_PITCH, 40, 16), 3, th.P['window'], th.P['lip_dark'], th.P['lip_light'])
            rect(img, (cx - 26, RUNG_Y + 2 * RUNG_PITCH + 7, 4, 2), th.P['tick'])     # the 0 rung
        dividers(th, img)
    elif page == 5:
        for i in range(8):
            put(img, th.meter(lit=False).crop((0, 144 - LEDS * 8, 8, 144)), i * STRIP + STRIP // 2 - 4, LED_BASE - LEDS * 8)
        dividers(th, img)
    return img


# --- sprites -----------------------------------------------------------------------------------------

def dot(lit):
    if lit:
        im = new(14, 14)
        glow_dot(im, 7, 7, 4.2, '#F2C514', 1.8)
        disc(im, 6, 6, 1.4, (255, 250, 220, 230))
        return im
    im = new(10, 10)
    disc(im, 5, 5, 3.8, '#C25E10')
    disc(im, 5, 5, 3.0, '#F07F1A')
    disc(im, 4.2, 4.2, 1.0, (255, 230, 200, 180))
    return im


def rung_cap(lit):
    im = new(40, 16)
    m = mask(40, 16, lambda d, s: d.rounded_rectangle((1 * s, 1 * s, 39 * s, 15 * s), 3 * s, fill=255))
    base = '#F2C514' if lit else '#E6DFC9'
    put(im, drop_shadow(m, 0, 1, 1.0, 170))
    put(im, clip(grad(40, 16, [(0, mix(base, (255, 255, 255), 0.35)), (0.5, base), (1, mix(base, (0, 0, 0), 0.3))]), m))
    hl, sh = bevel(m, 1.0, 2.0)
    put(im, hl)
    put(im, sh)
    rect(im, (19, 4, 2, 8), (40, 30, 20, 160))
    return im


def parts(th):
    atlas = new(W, 150)
    pieces = {'velbar': th.seqbar(), 'leds': th.meter(), 'dot': dot(False), 'dot_on': dot(True),
              'wlit': th.white_key('lit', KB_W - 1, KB_H), 'wplay': th.white_key('play', KB_W - 1, KB_H),
              'black': th.black_key('off', KB_BW, KB_BH), 'blit': th.black_key('lit', KB_BW, KB_BH),
              'bplay': th.black_key('play', KB_BW, KB_BH), 'oct': rung_cap(False), 'oct_on': rung_cap(True)}
    for i in range(8):
        pieces['key%d' % (i + 1)] = th.step_key(i, False)
        pieces['key_on%d' % (i + 1)] = th.step_key(i, True)
    for name, im in pieces.items():
        x, y, w, h = SPRITES[name]
        assert im.size == (w, h), (name, im.size, (w, h))
        atlas.paste(im, (x, y))
    return atlas


# --- the design --------------------------------------------------------------------------------------

def skin_lua(th):
    block = '\n'.join([
        '-- BEGIN GENERATED (make_arp_mockup.py writes this block)',
        '-- %s. Generated: edit make_arp_mockup.py and ArpSkin.lua, then regenerate.' % NAME,
        lua_table('T', lua_theme(th)), lua_table('L', LAYOUT),
        lua_table('S', {k: list(v) for k, v in SPRITES.items()}),
        '-- END GENERATED'])
    template = open(TEMPLATE, encoding='utf-8').read()
    pattern = re.compile(r'-- BEGIN GENERATED.*?-- END GENERATED', re.S)
    assert len(pattern.findall(template)) == 1, 'ArpSkin.lua must hold exactly one GENERATED block'
    return pattern.sub(lambda _: block, template)


def manifest():
    out = ['; %s - a CTRL49 screen-lab preset: a full arpeggiator, as a mockup.' % NAME,
           '; Generated by make_arp_mockup.py. Run: Ctrl49ScreenLab.exe preset "<this file>"',
           '; There is no envelope page; envelopePage names PLAY, whose Lua ignores set_envelope.',
           '[Preset]', 'version=1', 'name=%s' % NAME, 'width=%d' % W, 'height=%d' % H,
           'lua=Skin.lua', 'pages=%d' % len(PAGES), 'envelopePage=0', 'fps=%d' % FPS,
           'assets=%d' % len(ASSETS), '']
    for i, (ident, name) in enumerate(ASSETS):
        out += ['[Asset%d]' % i, 'id=%d' % ident, 'file=%s' % name, '']
    for p, title in enumerate(PAGES):
        out += ['[Page%d]' % p, 'title=%s' % title, 'encoders=8']
        out += ['e%d=%d' % (i + 1, v) for i, v in enumerate(DEFAULTS[p])]
        out.append('')
    return '\n'.join(out)


def main():
    th = era.RhythmBox()
    folder = os.path.join(HERE, SLUG)
    os.makedirs(folder, exist_ok=True)
    for name, pages in (('panels.png', (0, 1, 2)), ('lanes.png', (3, 4, 5))):
        atlas = new(W, 3 * H)
        for k, p in enumerate(pages):
            atlas.paste(background(th, p), (0, k * H))
        atlas.save(os.path.join(folder, name), optimize=True)
    parts(th).save(os.path.join(folder, 'parts.png'), optimize=True)
    with open(os.path.join(folder, 'Skin.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(skin_lua(th))
    with open(os.path.join(folder, 'Design.ctrl49preset'), 'w', encoding='ascii', newline='') as f:
        f.write(manifest())
    kib = (2 * W * 3 * H + W * 150) * 4 / 1024
    print('%-22s %s  decoded about %d KiB' % (SLUG, folder, kib))


if __name__ == '__main__':
    main()
