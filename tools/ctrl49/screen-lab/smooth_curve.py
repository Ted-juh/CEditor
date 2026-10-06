"""Anti-aliased pieces for drawing a smooth curve on the CTRL49, which has rectangles and image
crops but no lines and no anti-aliasing.

An envelope arrives as column heights 4 px apart (Ctrl49ScreenLab.h, set_envelope). Drawn as a
flat rectangle per column it is a staircase; drawn as 1 px slivers its edges are hard. Instead
the page draws each 4 px column of the curve as ONE pre-rendered piece: the stretch of an
anti-aliased line that rises or falls `dy` pixels across those 4 px. There is a piece for every
dy from -D to D; steeper columns (rare: a fast attack, the first moment of a release) are close
enough to vertical that 1 px slivers look right there. A flat run is one rectangle.

Under a filled curve a second family, the wedges, fills between the line and the lower of the
column's two ends, so the fill follows the line too; a rectangle fills the rest down to the base.

Conventions, shared with the Lua that draws them (EraSkin.lua, MachinedMetal.lua):
  - A column's two ends are at screen rows Y0 and Y1 (integers), dy = Y1 - Y0.
  - The line's centre passes `centre` px below those ends (a float; it is where the page's old
    rectangles centred their line), and it is `thick` px across, measured square to the line.
  - A line piece is placed with its top at min(Y0, Y1) - margin(thick, centre); it is 4 wide and
    abs(dy) + 2 * margin tall.
  - A wedge piece is placed at the same top; it is abs(dy) + margin tall and covers everything
    below the straight line through the two ends themselves (not the line's centre); from row
    max(Y0, Y1) down, a rectangle continues the fill.
  - Pieces are laid out in a grid: index dy + D, `per_row` to a row, each `pitch` px wide and one
    row `row_h` px tall (row_h = D + 2 * margin), so the Lua can work out any crop.

Pillow only; deterministic.
"""
import math

from PIL import Image, ImageDraw

SS = 8          # supersampling
COL = 4         # the width of a column of the curve


def margin(thick, centre=0.0):
    return int(math.ceil(thick / 2 + abs(centre))) + 1


def _supersampled(w, h, draw):
    m = Image.new('L', (w * SS, h * SS), 0)
    draw(ImageDraw.Draw(m))
    return m.resize((w, h), Image.Resampling.BOX)


def line_coverage(dy, thick, centre=0.0):
    """The coverage of one column's stretch of the line, clipped to the column."""
    m = margin(thick, centre)
    h = abs(dy) + 2 * m
    y0 = m + (0 if dy >= 0 else -dy) + centre
    slope = dy / COL

    def draw(d):
        # a long segment through the column, so its ends are cut square by the column's edges
        x_a, x_b = -COL, 2 * COL
        d.line([(x_a * SS, (y0 + slope * x_a) * SS), (x_b * SS, (y0 + slope * x_b) * SS)],
               fill=255, width=max(1, int(round(thick * SS))))
    return _supersampled(COL, h, draw)


def wedge_coverage(dy, thick, centre=0.0):
    """The coverage under the straight line through the column's two ends, down to the lower end."""
    m = margin(thick, centre)
    h = abs(dy) + m
    y0 = m + (0 if dy >= 0 else -dy)

    def draw(d):
        d.polygon([(0, y0 * SS), (COL * SS, (y0 + dy) * SS), (COL * SS, h * SS), (0, h * SS)], fill=255)
    return _supersampled(COL, h, draw)


def paint(coverage, colour):
    """A coverage mask as RGBA in one colour (r, g, b), its alpha the coverage."""
    im = Image.new('RGBA', coverage.size, tuple(colour[:3]) + (0,))
    im.putalpha(coverage)
    return im


def grid(D, thick, centre=0.0, per_row=None, pitch=COL + 1):
    """The layout of a family: (per_row, pitch, row_h). One row unless per_row says otherwise."""
    return (per_row or 2 * D + 1, pitch, D + 2 * margin(thick, centre))


def paste_family(atlas, x0, y0, D, thick, colour, centre=0.0, per_row=None, wedges=False):
    """Pastes the line pieces (or, with wedges=True, the wedges) for dy -D..D into atlas at
    (x0, y0), laid out by grid(). The region must be empty: an atlas's existing sprites are not
    to be painted over. Returns the region's (w, h)."""
    per, pitch, row_h = grid(D, thick, centre, per_row)
    rows = int(math.ceil((2 * D + 1) / per))
    for k in range(2 * D + 1):
        dy = k - D
        cov = wedge_coverage(dy, thick, centre) if wedges else line_coverage(dy, thick, centre)
        x, y = x0 + (k % per) * pitch, y0 + (k // per) * row_h
        region = atlas.crop((x, y, x + cov.width, y + cov.height))
        assert region.getchannel('A').getbbox() is None, ('smooth_curve: the region is not empty', x, y)
        atlas.paste(paint(cov, colour), (x, y))
    return per * pitch, rows * row_h
