"""Three native skins for the proven Machined Metal screen-lab renderer.

Run with Pillow. Same coordinates, payloads and 3,210 KiB decoded budget, but different
materials, knob silhouettes, fader shapes, meter faces and envelope glass. Generated
Skin.lua files are standalone on-device pages; the common renderer remains authoritative.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
BASE = HERE.parent / 'machined-metal'
THEMES = {
    'neon-glass': dict(name='Neon Glass', face=(12,23,42), text=(218,250,255),
        accent=(77,232,255), dim=(126,181,206), curve=(145,239,255),
        well=(5,14,29), rim=(61,133,175), grid=(21,57,83)),
    'studio-1978': dict(name='Studio 1978', face=(180,185,179), text=(28,38,43),
        accent=(123,43,19), dim=(64,80,83), curve=(191,255,140),
        well=(234,215,164), rim=(87,96,94), grid=(32,57,33)),
    'bakelite-1936': dict(name='Bakelite 1936', face=(67,40,29), text=(245,221,177),
        accent=(255,214,132), dim=(205,177,127), curve=(94,43,18),
        well=(25,16,10), rim=(153,116,59), grid=(178,148,99)),
}


def rgba(c,a=255): return tuple(c)+(a,)
def rgbmix(a,b,t): return tuple(int(x+(y-x)*t) for x,y in zip(a,b))
def clamp(v): return max(0,min(255,int(v)))
def hexcolor(c): return '0xFF'+''.join(f'{v:02X}' for v in c)


def face(kind,t):
    im=Image.new('RGBA',(480,272))
    px=im.load()
    for y in range(272):
        for x in range(480):
            if kind=='neon-glass':
                shade=10*max(0,1-y/150)+2*math.sin((x+y)*.022)
            elif kind=='studio-1978':
                shade=12*(1-y/272)+((x*17+y*13)%17-8)*.23+(y%3-1)
            else:
                shade=5*math.sin(x*.085+math.sin(y*.037)*2)+3*math.sin(y*.15+x*.03)
                shade+=3*math.sin(x*.011-y*.061)+5*(1-y/272)
            px[x,y]=rgba(tuple(clamp(c+shade) for c in t['face']))
    d=ImageDraw.Draw(im)
    if kind=='neon-glass':
        d.rectangle((1,1,478,270),outline=(20,50,76),width=2)
        d.line((8,2,470,2),fill=(80,151,186))
        d.polygon([(2,31),(120,31),(127,36),(2,36)],fill=(29,82,116))
        d.polygon([(356,29),(478,29),(478,34),(362,34)],fill=(35,152,188))
    elif kind=='studio-1978':
        # Dark navy enamel header against a machined aluminium panel.
        d.rectangle((0,0,479,29),fill=(29,49,62))
        d.line((0,0,479,0),fill=(108,133,148))
        d.line((0,29,479,29),fill=(255,235,180))
        d.line((1,31,478,31),fill=(89,95,95))
        d.rectangle((1,1,478,270),outline=(74,83,81))
    else:
        # Brass edging and small slotted fasteners in a dark molded cabinet.
        d.rectangle((1,1,478,270),outline=(145,107,55),width=2)
        d.line((4,4,476,4),fill=(212,171,96))
        d.line((3,30,477,30),fill=(12,9,7),width=2)
        for x in [5,474]:
            for y in [8,262]:
                d.ellipse((x-2,y-2,x+2,y+2),fill=(195,151,81))
                d.line((x-1,y+1,x+1,y-1),fill=(50,32,17))
    return im


def recess(im,box,t,kind,fill=None,radius=4):
    d=ImageDraw.Draw(im)
    x,y,r,b=box
    d.rounded_rectangle((x,y,r,b),radius,fill=(4,7,10),outline=rgba(t['rim']))
    d.rounded_rectangle((x+2,y+2,r-2,b-2),max(0,radius-2),fill=rgba(fill or t['well']))
    d.line((x+3,y+2,r-3,y+2),fill=(0,0,0),width=2)
    highlight=(54,107,143) if kind=='neon-glass' else (220,221,207) if kind=='studio-1978' else (207,167,98)
    d.line((x+3,b,r-3,b),fill=highlight)
    if kind=='neon-glass':
        d.line((x+5,y+5,r-7,y+5),fill=(27,57,82))


def panel(kind,t,page):
    im=face(kind,t); d=ImageDraw.Draw(im)
    tick=t['dim']
    if page==0:
        for i in range(4):
            x=8+i*118; cx,cy=x+55,135
            if kind=='neon-glass':
                d.polygon([(x+8,80),(x+97,80),(x+109,94),(x+109,174),(x+98,187),(x+10,187),(x,175),(x,94)],
                    fill=(9,18,34),outline=(40,85,116))
                d.line((x+17,82,x+94,82),fill=(59,113,145))
            elif kind=='studio-1978':
                d.ellipse((cx-50,cy-50,cx+50,cy+50),fill=(208,211,196),outline=(104,119,119))
                d.arc((cx-46,cy-46,cx+46,cy+46),135,405,fill=(60,77,79),width=1)
            else:
                d.ellipse((cx-52,cy-52,cx+52,cy+52),fill=(155,115,59),outline=(234,192,119))
                d.ellipse((cx-49,cy-49,cx+49,cy+49),fill=(229,210,165),outline=(46,29,17))
                tick=(81,52,28)
            for k in range(11):
                a=math.radians(135+270*k/10)
                r0,r1=(43,49) if k%2==0 else (45,48)
                d.line((cx+math.cos(a)*r0,cy+math.sin(a)*r0,cx+math.cos(a)*r1,cy+math.sin(a)*r1),fill=rgba(tick),width=2 if k%2==0 else 1)
            recess(im,(x+8,191,x+102,224),t,kind)
        recess(im,(10,241,469,265),t,kind)
    elif page==1:
        for i in range(8):
            x=8+i*58
            if kind=='studio-1978':
                d.rectangle((x,35,x+53,215),fill=(165+(i%2)*7,172+(i%2)*7,164+(i%2)*7),outline=(118,127,120))
                d.rectangle((x+8,37,x+43,58),fill=(221,216,187))
            elif kind=='bakelite-1936':
                d.rounded_rectangle((x+2,35,x+50,216),6,fill=(99,68,40),outline=(177,131,64))
            else:
                d.polygon([(x,36),(x+46,36),(x+53,43),(x+53,214),(x,214)],fill=(8,17,32),outline=(30,69,100))
            recess(im,(x+17,66,x+30,213),t,kind,fill=(3,6,8),radius=5)
            for j in range(9):
                yy=73+j*16
                d.line((x+4,yy,x+11,yy),fill=rgba(tick))
            recess(im,(x+38,66,x+49,213),t,kind,fill=(9,16,17),radius=3)
            for j in range(18):
                c=(32,45,55) if kind=='neon-glass' else (49,49,32)
                d.rectangle((x+41,70+j*8,x+46,74+j*8),fill=c)
            recess(im,(x+2,218,x+50,239),t,kind,radius=2)
        recess(im,(10,245,469,268),t,kind)
    else:
        recess(im,(9,39,470,199),t,kind,fill=(5,9,10),radius=8)
        top,bot=((11,34,60),(5,12,25)) if kind=='neon-glass' else ((18,38,27),(6,19,12)) if kind=='studio-1978' else ((230,210,165),(193,162,111))
        for y in range(45,195):
            d.line((16,y,464,y),fill=rgbmix(top,bot,(y-45)/150))
        for x in range(20,461,44): d.line((x,48,x,191),fill=rgba(t['grid']))
        for y in range(58,192,33): d.line((20,y,459,y),fill=rgba(t['grid']))
        # Shallow reflection on the upper glass, kept clear of the curve.
        d.line((20,47,458,47),fill=(79,126,148) if kind=='neon-glass' else (86,110,78) if kind=='studio-1978' else (252,233,197))
        for i in range(4):
            x=8+i*118
            recess(im,(x+8,213,x+104,230),t,kind,fill=(3,7,8),radius=6)
            recess(im,(x+8,241,x+104,265),t,kind,radius=3)
    return im


def knob(kind,t,frame):
    # Pixel shading keeps lighting fixed while geometry and the pointer animate. Bakelite
    # has a rotating scalloped silhouette; Neon has an illuminated segmented outer ring.
    im=Image.new('RGBA',(80,80)); px=im.load()
    angle=math.radians(135+270*frame/63)
    for y in range(80):
        for x in range(80):
            dx,dy=x-39.5,y-37.5; r=math.hypot(dx,dy); a=math.atan2(dy,dx)
            if math.hypot(x-41,y-42)<37: px[x,y]=(0,0,0,100)
            light=(-dx-dy)/max(r,1)*.5
            edge=34+2.2*math.cos((a-angle)*8) if kind=='bakelite-1936' else 36
            if r>edge: continue
            if kind=='neon-glass':
                if r>33:
                    segment=(a-math.radians(135))%(2*math.pi)
                    on=segment<=math.radians(270*frame/63)
                    c=t['accent'] if on and r<35 and int(segment*27)%3!=0 else (30,68,101)
                elif r>29: c=(12+20*light,29+25*light,48+35*light)
                elif r>27: c=(115+70*light,155+70*light,186+60*light)
                else:
                    spec=90*max(0,1-math.hypot(dx+10,dy+13)/20)**2
                    c=(16+spec+9*light,34+spec+15*light,54+spec+21*light)
            elif kind=='studio-1978':
                if r>33: c=(35+17*light,41+17*light,38+17*light)
                elif r>28:
                    rib=15*math.cos(a*36)**8
                    c=(26+rib+13*light,45+rib+19*light,56+rib+23*light)
                elif r>26: c=(149+90*light,174+75*light,181+72*light)
                else:
                    v=30*max(0,math.cos(a+.8))+2*math.sin(r*5)
                    c=(28+v+8*light,80+v+15*light,100+v+20*light)
            else:
                spec=74*max(0,1-math.hypot(dx+11,dy+16)/17)**2
                if r>edge-2: c=(51+22*light,32+16*light,20+11*light)
                elif r>22: c=(39+spec+11*light,22+spec*.7+9*light,15+spec*.4+5*light)
                else: c=(29+spec,18+spec*.6,12+spec*.4)
            px[x,y]=rgba(tuple(clamp(v) for v in c))
    overlay=Image.new('RGBA',(320,320)); d=ImageDraw.Draw(overlay)
    cx,cy=158,150
    if kind=='bakelite-1936':
        tip=(cx+math.cos(angle)*112,cy+math.sin(angle)*112)
        tail=(cx+math.cos(angle)*15,cy+math.sin(angle)*15)
        side=(-math.sin(angle)*11,math.cos(angle)*11)
        d.polygon([tip,(tail[0]+side[0],tail[1]+side[1]),(tail[0]-side[0],tail[1]-side[1])],fill=(240,215,164,255))
    else:
        d.line([(cx+math.cos(angle)*r,cy+math.sin(angle)*r) for r in (62,102)],fill=rgba(t['accent'] if kind=='neon-glass' else (248,235,199)),width=10)
    im.alpha_composite(overlay.resize((80,80),Image.Resampling.LANCZOS))
    return im


def cap(kind,t,w,h):
    im=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((3,4,w-1,h-1),3,fill=(0,0,0,145))
    x0,y0,x1,y1=2,1,w-5,h-6
    for y in range(y0,y1+1):
        q=(y-y0)/(y1-y0)
        if kind=='neon-glass':
            c=rgbmix((84,127,161),(13,30,51),q)
        elif kind=='studio-1978':
            c=rgbmix((245,235,200),(151,145,120),q)
        else:
            c=rgbmix((125,85,44),(39,23,13),q)
        d.line((x0,y,x1,y),fill=c)
    border=t['accent'] if kind=='neon-glass' else (252,244,214) if kind=='studio-1978' else (202,162,90)
    d.rectangle((x0,y0,x1,y1),outline=rgba(border))
    if kind=='neon-glass':
        cy=(y0+y1)//2
        d.line((x0+3,cy,x1-3,cy),fill=(129,253,255),width=3)
        d.line((x0+3,cy+3,x1-3,cy+3),fill=(16,60,91))
    elif kind=='studio-1978':
        for y in range(6,y1-3,4):
            d.line((x0+3,y,x1-3,y),fill=(112,105,88))
            d.line((x0+3,y+1,x1-3,y+1),fill=(249,241,204))
        d.line((x0+2,(y0+y1)//2,x1-2,(y0+y1)//2),fill=(44,57,61),width=2)
    else:
        d.line((x0+3,4,x1-3,4),fill=(215,173,105))
        d.rectangle((x0+3,(y0+y1)//2-1,x1-3,(y0+y1)//2+1),fill=(240,213,155))
    return im


def parts(kind,t):
    im=Image.new('RGBA',(128,160))
    im.paste(cap(kind,t,34,40),(0,0)); im.paste(cap(kind,t,22,28),(38,0))
    d=ImageDraw.Draw(im)
    for j in range(18):
        if kind=='neon-glass': c=(208,109,255) if j<5 else (65,227,255)
        elif kind=='studio-1978': c=(240,74,42) if j<3 else (237,181,67) if j<7 else (120,206,86)
        else: c=(254,195,95) if j<6 else (213,145,66)
        d.rounded_rectangle((68,j*8,75,j*8+4),1,fill=c)
        d.line((69,j*8,73,j*8),fill=rgbmix(c,(255,255,225),.6))
    glow=Image.new('RGBA',(12,12)); gd=ImageDraw.Draw(glow)
    gd.ellipse((2,2,9,9),fill=rgba(t['curve'],85 if kind=='bakelite-1936' else 145))
    im.paste(glow.filter(ImageFilter.GaussianBlur(2)),(80,0))
    d=ImageDraw.Draw(im)
    fill=(222,197,143) if kind=='bakelite-1936' else (13,37,42)
    d.ellipse((97,1,108,12),fill=fill,outline=rgba(t['curve']),width=2)
    d.ellipse((101,5,104,8),fill=rgba(t['curve']))
    return im


def main():
    lua=(BASE/'MachinedMetal.lua').read_text()
    manifest=(BASE/'MachinedMetal.ctrl49preset').read_text()
    for kind,t in THEMES.items():
        dest=HERE/kind; dest.mkdir(exist_ok=True)
        panels=Image.new('RGBA',(480,816))
        for p in range(3): panels.paste(panel(kind,t,p),(0,p*272))
        strip=Image.new('RGBA',(80,5120))
        for f in range(64): strip.paste(knob(kind,t,f),(0,f*80))
        images={'panels.png':panels,'knobs.png':strip,'parts.png':parts(kind,t)}
        for name,im in images.items(): im.save(dest/name,optimize=True)
        skin=lua.replace('Machined Metal',t['name']).replace('MACHINED METAL',t['name'].upper())
        colors=[t['text'],t['face'],t['dim'],t['accent'],t['curve']]
        old='0xFFFFF0CE, 0xFF101412, 0xFFB1B19E, 0xFFFFBD54, 0xFF9CFFD0'
        assert old in skin
        skin=skin.replace(old,', '.join(hexcolor(c) for c in colors))
        if kind=='studio-1978':
            skin=skin.replace('say(TITLE,titles[page+1],WHITE','say(TITLE,titles[page+1],0xFFFFEEC8')
            skin=skin.replace('" / 3  >",DIM','" / 3  >",0xFFE0DFBA')
        if kind=='neon-glass':
            start=skin.index('local function outline('); end=skin.index('\nfunction init',start)
            skin=skin[:start]+'''local function outline(x,y,w,h)
    draw_rect(x,y,12,2,AMBER); draw_rect(x+w-12,y,12,2,AMBER)
    draw_rect(x,y+h-2,12,2,AMBER); draw_rect(x+w-12,y+h-2,12,2,AMBER)
    draw_rect(x,y,2,9,AMBER); draw_rect(x+w-2,y,2,9,AMBER)
    draw_rect(x,y+h-9,2,9,AMBER); draw_rect(x+w-2,y+h-9,2,9,AMBER)
end''' + skin[end:]
        (dest/'Skin.lua').write_text(skin,encoding='utf8')
        (dest/'Design.ctrl49preset').write_text(manifest.replace('name=Machined Metal','name='+t['name']).replace('lua=MachinedMetal.lua','lua=Skin.lua'),encoding='utf8')
        print(f"{t['name']}: {sum((dest/n).stat().st_size for n in images):,} PNG bytes; 3,210 KiB decoded")


if __name__=='__main__': main()
