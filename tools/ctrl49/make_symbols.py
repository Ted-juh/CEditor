#!/usr/bin/env python3
"""Adds HoSTage's small symbols to hostage_logo.png, under the logo, so the keyboard page has them
without a third upload: the logo is decoded once at start, and is a grey palette PNG the CTRL49
tints, so every symbol can be drawn in any colour.

    python tools/ctrl49/make_symbols.py

The logo itself (440 x 80 at the top) is kept pixel for pixel; the symbols go in the rows under it
and the image becomes 440 x 100. Their crops are SYMBOLS below, and the same numbers are in
Hostage_MultiKnob.lua (local SYM): change one, change the other.

Why symbols at all: the keyboard's text is ASCII, so the page used characters for states ("> 3.2
122" for playing, "*" a running clip, ">" a waiting one, "!" a control that is not connected).
The host still sends those marks; the page now draws these in their place. Pillow only.
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, 'hostage_logo.png')
W, LOGO_H, H = 440, 80, 100
SS = 8

SYMBOLS = {   # name: (x, y, w, h)
    'play': (0, 84, 11, 12), 'stop': (14, 85, 10, 10), 'run': (28, 85, 10, 10), 'wait': (42, 85, 10, 10),
    'warn': (56, 84, 13, 12), 'dot5': (72, 86, 5, 5), 'dot7': (80, 85, 7, 7), 'ring11': (90, 84, 11, 11),
    'ring17': (104, 82, 17, 17),
}


def mask(w, h, draw):
    m = Image.new('L', (w * SS, h * SS), 0)
    draw(ImageDraw.Draw(m), SS)
    return m.resize((w, h), Image.Resampling.LANCZOS)


def disc(w, h, inset=0.5):
    return mask(w, h, lambda d, s: d.ellipse((inset * s, inset * s, (w - inset) * s, (h - inset) * s), fill=255))


def ring(w, h, width):
    return mask(w, h, lambda d, s: d.ellipse((0.6 * s, 0.6 * s, (w - 0.6) * s, (h - 0.6) * s), outline=255, width=int(width * s)))


def warn(w, h):
    def draw(d, s):
        d.polygon([(w / 2 * s, 0.4 * s), ((w - 0.3) * s, (h - 0.4) * s), (0.3 * s, (h - 0.4) * s)], fill=255)
        d.rectangle(((w / 2 - 0.8) * s, 3.6 * s, (w / 2 + 0.8) * s, 8.0 * s), fill=0)
        d.rectangle(((w / 2 - 0.8) * s, 9.0 * s, (w / 2 + 0.8) * s, 10.4 * s), fill=0)
    return mask(w, h, draw)


def pieces():
    return {
        'play': mask(11, 12, lambda d, s: d.polygon([(1 * s, 0.5 * s), (10.5 * s, 6 * s), (1 * s, 11.5 * s)], fill=255)),
        'stop': mask(10, 10, lambda d, s: d.rounded_rectangle((0.5 * s, 0.5 * s, 9.5 * s, 9.5 * s), 1.5 * s, fill=255)),
        'run': disc(10, 10), 'wait': ring(10, 10, 1.6), 'warn': warn(13, 12),
        'dot5': disc(5, 5, 0.3), 'dot7': disc(7, 7, 0.3), 'ring11': ring(11, 11, 1.6), 'ring17': ring(17, 17, 2.0),
    }


def main():
    old = Image.open(LOGO)
    grey = old.convert('L') if old.mode != 'P' else Image.frombytes('L', old.size, bytes(old.getpalette()[i * 3] for i in old.tobytes()))
    atlas = Image.new('L', (W, H), 0)
    atlas.paste(grey.crop((0, 0, W, LOGO_H)), (0, 0))
    for name, im in pieces().items():
        x, y, w, h = SYMBOLS[name]
        assert im.size == (w, h), (name, im.size)
        assert y >= LOGO_H and x + w <= W and y + h <= H, name
        atlas.paste(im, (x, y))
    # the format the CTRL49 tints: 8-bit palette of 256 greys, index = grey = coverage, no tRNS
    out = Image.frombytes('P', atlas.size, atlas.tobytes())
    out.putpalette([v for i in range(256) for v in (i, i, i)])
    out.save(LOGO, optimize=True)
    print('wrote %s: %d x %d, the logo and %d symbols' % (LOGO, W, H, len(SYMBOLS)))


if __name__ == '__main__':
    main()
