#!/usr/bin/env python3
"""Generate a CTRL49 arc-knob filmstrip: 128 vertically stacked frames, frame N showing
the knob swept to value N. White-on-transparent so the device can tint it per state at
draw time (the VIP rotary_page.lua technique). This is a Phase-3 probe/beauty-test asset;
the production path generates strips from CEditor's own renderer at bundle-compile time.

Pure standard library (zlib + struct) — no Pillow. Output is an 8-bit RGBA PNG.

    python make_filmstrip.py knob_strip.png [--frame 64] [--frames 128]

Layout matches what the Lua page expects: one frame is `frame`x`frame` px; the strip is
`frame` wide by `frame*frames` tall. draw_image crops frame N via source-rect y=frame*N.
"""

import argparse
import math
import struct
import zlib


def build_frame(pixels, strip_w, y0, size, value, frames):
    """Render one knob frame into the RGBA `pixels` bytearray at row offset y0."""
    cx = cy = size / 2.0
    outer_r = size / 2.0 - 2.0
    inner_r = outer_r - 6.0
    gap_deg = 90.0                     # gap centred on the bottom of the dial
    span_deg = 360.0 - gap_deg         # 270-degree sweep
    start_deg = 90.0 + gap_deg / 2.0   # first arc angle, clockwise (y-down coords)
    frac = value / float(frames - 1)   # 0..1 across the strip
    fill_span = span_deg * frac

    ss = 4                             # supersample factor for anti-aliasing
    inv = 1.0 / (ss * ss)

    for py in range(size):
        for px in range(size):
            fill_hits = 0
            track_hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = px + (sx + 0.5) / ss - cx
                    y = py + (sy + 0.5) / ss - cy
                    r = math.hypot(x, y)
                    if r < inner_r or r > outer_r:
                        continue
                    ang = math.degrees(math.atan2(y, x)) % 360.0
                    rel = (ang - start_deg) % 360.0
                    if rel <= span_deg:
                        track_hits += 1
                        if rel <= fill_span:
                            fill_hits += 1

            if fill_hits == 0 and track_hits == 0:
                continue

            # Fill (bright) sits on top of the track (dim); both are white, alpha differs.
            alpha = (fill_hits * 255 + (track_hits - fill_hits) * 70) * inv
            a = max(0, min(255, int(alpha + 0.5)))
            if a == 0:
                continue
            idx = ((y0 + py) * strip_w + px) * 4
            pixels[idx + 0] = 255
            pixels[idx + 1] = 255
            pixels[idx + 2] = 255
            pixels[idx + 3] = a


def write_png(path, width, height, pixels):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0 (none)
        raw.extend(pixels[y * stride:(y + 1) * stride])

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("output")
    ap.add_argument("--frame", type=int, default=64, help="per-frame size in px")
    ap.add_argument("--frames", type=int, default=128, help="frame count (values 0..N-1)")
    args = ap.parse_args()

    w = args.frame
    h = args.frame * args.frames
    pixels = bytearray(w * h * 4)  # zero = fully transparent

    for value in range(args.frames):
        build_frame(pixels, w, value * args.frame, args.frame, value, args.frames)

    write_png(args.output, w, h, pixels)
    print(f"wrote {args.output}: {w}x{h} RGBA, {args.frames} frames of {args.frame}px")


if __name__ == "__main__":
    main()
