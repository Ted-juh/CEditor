"""Deterministic native CTRL49 skin assets, extending the screen-lab PNG renderer.

Pillow only; python make_assets.py. No fonts/text baked into PNGs. Knobs are 64
80px frames; all remaining motion crops or translates small reusable sprites.
Pixels are authored at their final 480x272 screen coordinates, not a resized mockup.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFilter
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import smooth_curve  # noqa: E402  (the envelope's anti-aliased line pieces)

HERE = Path(__file__).resolve().parent
W, H, FRAME, FRAMES = 480, 272, 80, 64
AMBER = (255, 183, 62, 255)
MINT = (156, 255, 208)
# The envelope's line pieces (smooth_curve.py), for MachinedMetal.lua's SEG_D, SEG_M, SEG_ROW: a
# 2 px line centred 1 px below the sample row (where the old 1 px slivers centred it), 13 pieces
# to a row in the empty left of parts.png from y 40.
SEG_D, SEG_THICK, SEG_CENTRE, SEG_PER_ROW, SEG_AT = 24, 2, 1, 13, (0, 40)


def metal(w, h, top=46, bottom=23):
    im = Image.new('RGBA', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            grain = ((x * 13 + y * 31) % 19 - 9) * .18 + (y % 3 - 1) * .8
            v = int(top + (bottom-top)*y/max(1,h-1) + grain)
            px[x,y] = (v+2,v+2,v,255)
    return im


def well(im, box, radius=4, fill=(7, 10, 10, 255)):
    d = ImageDraw.Draw(im)
    x,y,r,b = box
    d.rounded_rectangle((x,y,r,b), radius, fill=(4,5,5,255), outline=(7,8,8,255))
    d.rounded_rectangle((x+1,y+1,r,b+1), radius, outline=(99,99,89,255))
    d.rounded_rectangle((x+2,y+1,r-1,b-1), radius, fill=fill, outline=(0,0,0,255))
    d.line((x+4,y+2,r-4,y+2), fill=(0,0,0,255), width=2)


def panel(kind):
    im = metal(W,H)
    d = ImageDraw.Draw(im)
    d.rectangle((0,0,479,271), outline=(6,7,7,255), width=2)
    d.line((3,2,477,2),fill=(118,117,106,255))
    d.line((3,29,477,29),fill=(5,6,6,255))
    d.line((3,30,477,30),fill=(69,70,63,255))
    if kind == 0:
        for i in range(4):
            x=8+i*118
            if i: d.line((x-4,39,x-4,230),fill=(12,14,13,255))
            cx,cy=x+55,135
            for k in range(7):
                a=math.radians(135+k*45)
                p=[cx+math.cos(a)*r for r in (45,50)]
                q=[cy+math.sin(a)*r for r in (45,50)]
                d.line((p[0],q[0],p[1],q[1]),fill=(191,180,146,255),width=2)
            well(im,(x+8,191,x+102,224))
        well(im,(10,241,469,265))
    elif kind == 1:
        for i in range(8):
            x=8+i*58
            if i: d.line((x-3,37,x-3,236),fill=(9,11,11,255))
            well(im,(x+17,66,x+30,213),6)
            for j in range(5):
                yy=75+j*32
                d.line((x+3,yy,x+11,yy),fill=(148,143,119,255))
            well(im,(x+38,66,x+49,213),3)
            for j in range(18):
                d.rectangle((x+41,70+j*8,x+46,74+j*8),fill=(37,40,31,255))
            well(im,(x+2,218,x+50,239),3)
        well(im,(10,245,469,268))
    else:
        well(im,(9,39,470,199),8)
        d.rounded_rectangle((15,44,465,194),5,fill=(7,22,20,255))
        for y in range(46,194):
            t=(y-46)/148
            d.line((17,y,462,y),fill=(7+int(6*(1-t)),23+int(9*(1-t)),20+int(7*(1-t)),255))
        for x in range(20,461,44): d.line((x,48,x,191),fill=(25,48,39,255))
        for y in range(58,192,33): d.line((20,y,459,y),fill=(25,48,39,255))
        d.line((20,49,458,49),fill=(70,93,79,255))
        for i in range(4):
            x=8+i*118
            well(im,(x+8,213,x+104,230),6)
            well(im,(x+8,241,x+104,265),3)
    return im


def knob_base():
    im=Image.new('RGBA',(FRAME,FRAME))
    px=im.load()
    for y in range(FRAME):
        for x in range(FRAME):
            dx,dy=x-39.5,y-37.5
            r=math.hypot(dx,dy)
            a=math.atan2(dy,dx)
            # Lower offset shadow stays stationary across all frames.
            sr=math.hypot(x-41,y-42)
            if sr<38: px[x,y]=(0,0,0,int(max(0,min(120,(38-sr)*30))))
            if r>36: continue
            light=(-dx-dy)/max(1,r)*.5
            if r>34:
                v=60+45*light
            elif r>29:
                v=22+18*light+13*(math.cos(a*48)**10)
            elif r>27:
                v=135+94*light
            else:
                # Turned metal: opposing triangular specular lobes and fine lathe rings.
                shine=max(0,math.cos(2*(a+.7)))**10
                v=51+shine*131+18*light+3*math.sin(r*7)
            v=int(max(0,min(255,v)))
            px[x,y]=(v,min(255,v+1),v,255)
    return im


def knobs():
    strip=Image.new('RGBA',(FRAME,FRAME*FRAMES))
    base=knob_base()
    for f in range(FRAMES):
        im=base.copy()
        pointer=Image.new('RGBA',(FRAME*4,FRAME*4))
        d=ImageDraw.Draw(pointer)
        a=math.radians(135+270*f/(FRAMES-1))
        pts=[(4*(39.5+math.cos(a)*r),4*(37.5+math.sin(a)*r)) for r in (18,27)]
        d.line(pts,fill=(255,231,175,255),width=9)
        im.alpha_composite(pointer.resize((FRAME,FRAME),Image.Resampling.LANCZOS))
        strip.paste(im,(0,f*FRAME))
    return strip


def cap(w,h):
    im=Image.new('RGBA',(w,h))
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((2,4,w-1,h-1),3,fill=(0,0,0,135))
    face=Image.new('RGBA',(w-6,h-7))
    fd=ImageDraw.Draw(face)
    stops=[(0,199),(.12,230),(.16,91),(.4,176),(.5,211),(.55,78),(.9,158),(1,70)]
    for yy in range(face.height):
        t=yy/max(1,face.height-1)
        for (t0,v0),(t1,v1) in zip(stops,stops[1:]):
            if t0<=t<=t1:
                v=int(v0+(v1-v0)*(t-t0)/(t1-t0)); break
        fd.line((0,yy,face.width,yy),fill=(v,min(255,v+1),max(0,v-10),255))
    for yy in range(6,face.height-3,3):
        fd.line((3,yy,face.width-4,yy),fill=(72,72,65,255))
        fd.line((3,yy+1,face.width-4,yy+1),fill=(205,202,185,255))
    im.alpha_composite(face,(2,1))
    d.rectangle((2,1,w-5,h-7),outline=(217,213,191,255))
    return im


def parts():
    im=Image.new('RGBA',(128,160))
    im.paste(cap(34,40),(0,0))
    im.paste(cap(22,28),(38,0))
    d=ImageDraw.Draw(im)
    # 8x144 LED column. Crop its bottom to expose the illuminated level.
    for j in range(18):
        c=(255,95,45,255) if j<2 else AMBER if j<6 else (83,237,118,255)
        y=j*8
        d.rectangle((68,y,75,y+4),fill=c)
        d.line((69,y,74,y),fill=(207,255,197,255))
    glow=Image.new('RGBA',(12,12))
    gd=ImageDraw.Draw(glow)
    gd.ellipse((2,2,9,9),fill=(90,255,176,160))
    glow=glow.filter(ImageFilter.GaussianBlur(2))
    # A soft halo only; the continuous live curve supplies the bright core.
    im.paste(glow,(80,0))
    handle=Image.new('RGBA',(14,14))
    hd=ImageDraw.Draw(handle)
    hd.ellipse((1,1,12,12),fill=(15,81,57,255),outline=(143,255,195,255),width=2)
    hd.ellipse((5,5,8,8),fill=(184,255,219,255))
    im.paste(handle,(96,0))
    smooth_curve.paste_family(im, *SEG_AT, SEG_D, SEG_THICK, MINT, SEG_CENTRE, per_row=SEG_PER_ROW)
    return im


def main():
    panels=Image.new('RGBA',(W,H*3))
    for i in range(3): panels.paste(panel(i),(0,H*i))
    images={'panels.png':panels,'knobs.png':knobs(),'parts.png':parts()}
    for name,im in images.items():
        im.save(HERE/name,optimize=True)
        print(f'{name}: {im.width}x{im.height}, {(HERE/name).stat().st_size} bytes, {im.width*im.height*4//1024} KiB decoded')


if __name__ == '__main__': main()
