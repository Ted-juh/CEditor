"""Shared renderer for the CTRL49 design sets.

Two halves. Art bakes materials at 4x and box-filters down: wood, paint, metal, and relief
lit by one fixed lamp up and to the left. Screen then composes a 480x272 page from those
bakes with only what the keyboard's Lua has: rectangles, PNG crops and live text. A mockup
made this way is the page the device will draw, not an illustration of it.

Run a set's own script with a Python that has Pillow and numpy.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 4
W, H = 480, 272
FONTS = Path('C:/Windows/Fonts')
LIVE = 'seguisb.ttf'       # stands in for the device's Aileron SemiBold, as the browser preview does
LEGEND = 'arialbd.ttf'     # lettering baked into a panel, never a parameter name or a value


def unit(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


# HALF is the way a glossy surface has to face to flare: a slope of about 30 degrees toward the lamp.
LIGHT = unit((-.50, -.70, .52))
HALF = unit(LIGHT + np.array((0, 0, 1), np.float32))


def rgb(c):
    return np.asarray(c, np.float32) / 255


def mix(a, b, t):
    t = np.asarray(t, np.float32)[..., None]
    return rgb(a) * (1 - t) + rgb(b) * t


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def sd_rrect(X, Y, x0, y0, x1, y1, r):
    qx = np.abs(X - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
    qy = np.abs(Y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def sd_seg(X, Y, ax, ay, bx, by):
    px, py, vx, vy = X - ax, Y - ay, bx - ax, by - ay
    t = np.clip((px * vx + py * vy) / (vx * vx + vy * vy), 0, 1)
    return np.hypot(px - vx * t, py - vy * t)


def cov(d):
    """Coverage of a shape from its signed distance in device pixels."""
    return np.clip(.5 - d * S, 0, 1)


def round_edge(d, bevel):
    """0 at the edge of a shape rising to 1 over `bevel` pixels, as a quarter round."""
    q = np.clip(-d / bevel, 0, 1)
    return np.sqrt(1 - (1 - q) ** 2)


def blur(a, radius):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius * S)), np.float32) / 255


def noise(shape, cy, cx, rng):
    """Smooth noise in -1..1 whose cells are cy by cx device pixels. Unequal cells make streaks."""
    h, w = shape
    g = rng.random((max(2, int(h / (cy * S)) + 3), max(2, int(w / (cx * S)) + 3)), dtype=np.float32)
    return np.asarray(Image.fromarray(g).resize((w, h), Image.Resampling.BICUBIC)) * 2 - 1


def lit(Hm, albedo, amb=.38, dif=.62, spec=0., shin=20., sheen=0.):
    """Shade a height map. A flat surface comes back as its albedo exactly, so relief can be
    painted onto a panel without a seam. `spec` is the sharp flare of a slope that faces HALF;
    `sheen` is the broad wash any slope toward the lamp picks up from the room."""
    gy, gx = np.gradient(Hm.astype(np.float32))
    gx *= S
    gy *= S
    inv = 1 / np.sqrt(gx * gx + gy * gy + 1)
    nx, ny, nz = -gx * inv, -gy * inv, inv
    ndl = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    out = np.asarray(albedo, np.float32) * ((amb + dif * ndl) / (amb + dif * LIGHT[2]))[..., None]
    if spec:
        ndh = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1)
        out = out + (spec * np.maximum(ndh ** shin - HALF[2] ** shin, 0))[..., None]
    if sheen:
        toward = (nx * LIGHT[0] + ny * LIGHT[1]) / math.hypot(LIGHT[0], LIGHT[1])
        out = out + (sheen * np.clip(toward, 0, 1) ** 1.5)[..., None]
    return np.clip(out, 0, 1)


def wood(X, Y, rng, dark, light, vertical=True, ring=6., figure=1.):
    """Plain-sawn timber: warped growth rings, fine fibre, and open pores along the grain."""
    def n(along, across):
        return noise(X.shape, along, across, rng) if vertical else noise(X.shape, across, along, rng)
    u = X if vertical else Y
    rings = .5 + .5 * np.sin((u / ring + n(140, 16) * 2.2 * figure + n(50, 6) * .5) * 2 * np.pi)
    pores = np.clip(n(5, .3) - .55, 0, 1) * 2
    return mix(dark, light, np.clip(.15 + .62 * rings ** 1.6 + .22 * n(30, .35) - .5 * pores, 0, 1))


def brushed(X, Y, rng, base, vertical=False):
    """Aluminium drawn across an abrasive: long fine streaks one way, nothing the other."""
    def n(along, across):
        return noise(X.shape, along, across, rng) if vertical else noise(X.shape, across, along, rng)
    return rgb(base) * (1 + .07 * n(60, .3) + .05 * n(14, .2))[..., None]


_fonts = {}


def font(name, px):
    if (name, px) not in _fonts:
        _fonts[name, px] = ImageFont.truetype(str(FONTS / name), px)
    return _fonts[name, px]


class Art:
    """A straight-alpha canvas at S times the device resolution. Coordinates are device pixels."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = np.zeros((h * S, w * S, 4), np.float32)

    def copy(self):
        other = Art(self.w, self.h)
        other.px = self.px.copy()
        return other

    def clip(self, box):
        x0, y0, x1, y1 = box
        return max(0, math.floor(x0)), max(0, math.floor(y0)), min(self.w, math.ceil(x1)), min(self.h, math.ceil(y1))

    def coords(self, box=None):
        x0, y0, x1, y1 = box or (0, 0, self.w, self.h)
        ys, xs = np.mgrid[y0 * S:y1 * S, x0 * S:x1 * S].astype(np.float32)
        return (xs + .5) / S, (ys + .5) / S

    def paint(self, color, alpha, box=None):
        x0, y0, x1, y1 = box or (0, 0, self.w, self.h)
        v = self.px[y0 * S:y1 * S, x0 * S:x1 * S]
        c = np.asarray(color, np.float32)
        a = np.clip(alpha, 0, 1)[..., None]
        under = v[..., 3:4] * (1 - a)
        out = a + under
        v[..., :3] = (c * a + v[..., :3] * under) / np.maximum(out, 1e-6)
        v[..., 3:4] = out

    def solid(self, d, albedo, box=None, height=2., bevel=1.5, extra=0., **light):
        """A plateau bounded by signed distance d: raised for a positive height, sunk for a negative."""
        self.paint(lit(height * round_edge(d, bevel) + extra, albedo, **light), cov(d), box)

    def shadow(self, d, box=None, dx=1.5, dy=2.5, soft=2., alpha=.6, inner=False):
        """Cast shadow of shape d. The box needs a margin at least as wide as the offset."""
        c = cov(d)
        cast = blur(np.roll(1 - c if inner else c, (round(dy * S), round(dx * S)), (0, 1)), soft)
        self.paint((0, 0, 0), cast * (c if inner else 1) * alpha, box)

    def line(self, x0, y0, x1, y1, width, color, alpha=1.):
        m = width + 1
        box = self.clip((min(x0, x1) - m, min(y0, y1) - m, max(x0, x1) + m, max(y0, y1) + m))
        X, Y = self.coords(box)
        self.paint(rgb(color), cov(sd_seg(X, Y, x0, y0, x1, y1) - width / 2) * alpha, box)

    def legend(self, s, x, y, size, color, face=LEGEND, anchor='mm', alpha=1.):
        f = font(face, round(size * S))
        l, t, r, b = f.getbbox(s, anchor=anchor)
        box = self.clip((x + l / S - 1, y + t / S - 1, x + r / S + 1, y + b / S + 1))
        m = Image.new('L', ((box[2] - box[0]) * S, (box[3] - box[1]) * S))
        ImageDraw.Draw(m).text(((x - box[0]) * S, (y - box[1]) * S), s, font=f, fill=255, anchor=anchor)
        self.paint(rgb(color), np.asarray(m, np.float32) / 255 * alpha, box)

    def image(self):
        p = self.px.copy()
        p[..., :3] *= p[..., 3:4]
        p = p.reshape(self.h, S, self.w, S, 4).mean(axis=(1, 3))
        p[..., :3] /= np.maximum(p[..., 3:4], 1e-6)
        return Image.fromarray((np.clip(p, 0, 1) * 255 + .5).astype(np.uint8))


class Screen:
    """The device's vocabulary and nothing else. `calls` is what the browser check counts."""

    def __init__(self, base):
        self.im = base.convert('RGBA').copy()
        self.calls = 0

    def image(self, src, x, y, sx=0, sy=0, w=None, h=None):
        w, h = w or src.width, h or src.height
        assert 0 <= x and 0 <= y and x + w <= W and y + h <= H, f'crop leaves the screen: {x},{y} {w}x{h}'
        self.im.alpha_composite(src.crop((sx, sy, sx + w, sy + h)), (x, y))
        self.calls += 1

    def rect(self, x, y, w, h, color):
        ImageDraw.Draw(self.im).rectangle((x, y, x + w - 1, y + h - 1), fill=tuple(color) + (255,))
        self.calls += 1

    def text(self, s, x, y, w, h, size, color, hor=1):
        ax, anchor = ((x, 'lm'), (x + w / 2, 'mm'), (x + w, 'rm'))[hor]
        ImageDraw.Draw(self.im).text((ax, y + h / 2), s, font=font(LIVE, size), fill=tuple(color) + (255,), anchor=anchor)
        self.calls += 1


def sheet(cells, title, path, scale=2, cols=2):
    """Contact sheet of (caption, 480x272 image) cells, enlarged by whole pixels so nothing is invented."""
    gap, cap, top = 28, 30, 64
    rows = -(-len(cells) // cols)
    cw, ch = W * scale, H * scale
    out = Image.new('RGB', (cols * cw + (cols + 1) * gap, top + rows * (ch + cap + gap)), (17, 17, 19))
    d = ImageDraw.Draw(out)
    d.text((gap, 20), title, font=font(LIVE, 26), fill=(232, 232, 228))
    for i, (caption, im) in enumerate(cells):
        x = gap + (i % cols) * (cw + gap)
        y = top + (i // cols) * (ch + cap + gap)
        d.text((x, y + 4), caption, font=font(LIVE, 17), fill=(160, 160, 156))
        out.paste(im.convert('RGB').resize((cw, ch), Image.Resampling.NEAREST), (x, y + cap))
    out.save(path)
