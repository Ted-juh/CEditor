
-- BEGIN GENERATED (make_feature_mockups.py writes this block)
-- HoSTage Features Slim. Generated: edit make_feature_mockups.py and FeatureSkin.lua, then regenerate.
local T = {
    aligns = { banner = 1, big = 0, bpm = 2, cell = 1, diag = 2, foot = 0, head = 2, huge = 1, key = 1, label = 1, line = 0, name = 1, next = 0, pad = 1, scope = 0, section = 0, small = 1, song = 0, tag = 0, tagr = 2, title = 0, value = 1 },
    axis = 0xFF565E7E,
    bar = 0xFF4A5378,
    bar_line = 0xFF2B3456,
    beat_line = 0xFF1B2238,
    cross = 0xFF2B3456,
    dim = 0xFF565E7E,
    dot_off = 0xFF232B48,
    fonts = { banner = { 10, 13 }, big = { 10, 48 }, bpm = { 9, 20 }, cell = { 9, 13 }, diag = { 9, 8 }, foot = { 9, 9 }, head = { 9, 11 }, huge = { 7, 60 }, key = { 10, 16 }, label = { 10, 9 }, line = { 9, 14 }, name = { 10, 18 }, next = { 10, 18 }, pad = { 10, 12 }, scope = { 9, 9 }, section = { 10, 40 }, small = { 10, 9 }, song = { 10, 20 }, tag = { 9, 10 }, tagr = { 9, 10 }, title = { 10, 15 }, value = { 9, 14 } },
    foot = 0xFF565E7E,
    head = 0xFF6B7393,
    knob = 0xFF4A5378,
    label = 0xFF8890B0,
    load_bar = 0xFF8B7CFF,
    load_bg = 0xFF0F1424,
    mini = 0xFF2B3456,
    mini_visible = 0xFF4A5378,
    name = "HOSTAGE FEATURES SLIM",
    note = 0xFF6B7393,
    note_loud = 0xFFA3AACB,
    note_soft = 0xFF3A4468,
    now = 0xFFE6E9F5,
    on_accent = 0xFF0F1424,
    on_warn = 0xFF0F1424,
    raised = 0xFF232B48,
    ready = 0xFF2DD4BF,
    rec = 0xFFFF4D6A,
    ring = 0xFF9AA3C2,
    roles = { "banner", "big", "bpm", "cell", "diag", "foot", "head", "huge", "key", "label", "line", "name", "next", "pad", "scope", "section", "small", "song", "tag", "tagr", "title", "value" },
    scale_mark = 0xFF6B7393,
    title = 0xFFE6E9F5,
    titles = { "SOUND ATLAS", "MODULATION", "CAPTURE", "STAGE", "CHORDS" },
    track = 0xFF232B48,
    value = 0xFFE6E9F5,
    warn = 0xFFFFB547,
}
local L = {
    bar = { 6, 8, 4, 14 },
    bg = { { 577, 0 }, { 577, 272 }, { 577, 544 }, { 581, 0 }, { 581, 272 } },
    cell_bar_y = 239,
    cell_label_y = 210,
    cell_value_y = 221,
    defaults = { { 70, 92, 40, 16, 40, 64, 64, 64 }, { 72, 40, 64, 64, 96, 84, 100, 40 }, { 56, 0, 80, 0, 64, 64, 64, 64 }, { 24, 64, 64, 64, 64, 64, 64, 64 }, { 100, 40, 64, 64, 64, 64, 64, 64 } },
    diag = { 300, 255, 104, 12 },
    dots = { 410, 260, 12, 8, 4 },
    foot = { 14, 254, 286, 16 },
    fps = 10,
    head = { 170, 5, 296, 20 },
    kb = { 30, 134, 20 },
    knob_frames = 32,
    knob_label_y = 34,
    knob_value_y = 126,
    knob_x = { 26, 146, 266, 386 },
    knob_y = 46,
    list = { 290, 36, 180, 21 },
    map = { 16, 36, 262, 168 },
    mini_group = 2,
    minimap = { 8, 176, 464, 28 },
    pads = { 190, 44 },
    pages = 5,
    roll = { 8, 34, 464, 136 },
    roll_beat_px = 13,
    scope = { 156, 104, 50 },
    scope_step = 4,
    scope_x = { 8, 128, 248, 368 },
    title = { 18, 5, 250, 20 },
}
local S = {
    dot = { 26, 2560, 5, 5 },
    dot_big = { 32, 2560, 9, 9 },
    key_black = { 60, 2576, 10, 28 },
    key_c = { 0, 2576, 19, 46 },
    key_d = { 20, 2576, 19, 46 },
    key_e = { 40, 2576, 19, 46 },
    puck = { 42, 2560, 11, 11 },
    rec = { 54, 2560, 8, 8 },
    ring = { 0, 2560, 9, 9 },
    ring_big = { 10, 2560, 15, 15 },
}
local D = {
    adjectives = { "Warm", "Glassy", "Dusty", "Bright", "Hollow", "Soft", "Gritty", "Airy", "Deep", "Silver", "Velvet", "Broken", "Lush", "Thin", "Wide", "Cold" },
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
    arp = { 1, 0, 2, 0, 3, 0, 1, 1, 2, 1, 3, 0, 2, 0, 1, 1 },
    atlas = "SoOEAiEygDYbzECVmyBCR3IYAOZzkBrhy3Dpe6QDdIrOCXAruBAAk2BXzI9AY4WLFqR35DTINsAXQMhHxfrnGkzUnFtc7OEeWXWA7sI1HWkO2AiaQ6HyB58DIAxPHTxwsBdRHzHdE2kCNIrLBND/bBtL7bDWFI5AoUMAAaCy6CsrumDoPUbF2i43EdeR9AAAlaB1DylDpY0MDza0GDKxWJAtq3gDuP1tDdkTnAHnrUB0L7eEphyPDr64WE7y7dEv40UDaXHXFbQatF0p5mDZlK1AQpxVBEeNiHW+s2HM5urBvG56DrT66Ep1vXGn25uDlH4jDrr3NDtpyYD2j0xDer5cCsVj6GTgKqAyb2eEZ4arArg3wDl+UQF698xEcrOIAhXIDA0o52EKSxLBPgt2BJ/5mBUsLRAiF2vCZEQAAgv5cCqQTFFJ23tBwqleG3W9CEq9pKG7R8TEcG1pCkikxFmRkjGbdJqAjNoIGQ34fBxP2ADZhv+CnYwKC3K3aDu/6VE0P87Ejh3kC1i+sEmAhiG5E6gEq1PTFTNLiALEmkBTkQmAqn8TDULooBoU0uDjq7SCow0QDvAqKH1h8jDnTQnAZ8jmGewRgFbG6OCAAvPBpDygCG4TeA2z4TDamRIAqFpkGJNcSBY8z7CP1pVB21//E1H74EX+N7AemZhFsrqOGI5LBANgxiBH9nQBOkw3BgY3zDdtwhCnXwRCMJvGBZNwGCHFoWBiCVnA2m8sEqIQ/FT38ABJKnxBH1nTBqDkiG7TimHyK6AE//90E127jE20t2DaRUFAj4z+CuikdGdicPFOiKDAqfyiDm1boFiOQbAzI4SD3J+sEcrtiH428tEwC5VENU0uB1S+vEQvIIAyM6CDnXVBHSSR2AYXyqCwJ+fCc9uZChMRhAmZMBAQXyIBrQU4AsfvvGzd4JE0tyvHin2mCoo1CCIgyaBhwP4F1m72EyaxUDL3muBza1BEpeZ/F7vv+DvkzYDbCaQH3jzdDhs0rDuV/EE1J4yEknySDAAsLBT/JMAq7P6Fk/bsFGkH+ARCIdAvw7DChyHnAJSk8BVrj/Bkh5mHoSXNF0Mp3Gk/UEAgsSeFO8WaAIkyIBZNO+AnZMpA3T+iEpuocGka1mDiRzNCQ3L+AmDWiFr2g6Gzd8DEfmtVCU0OXAIi//Bpo2YDcg4hCSU5vBmUVJFkAiEGxK7THY312CQekzBtg8dEqybLFi7qiCbNUXFH02dBd0kJHpZ0DCvt2qCKyx+BUpIhAlFLsAOJJEHjovyHKWJJAiOy3HVy32CGdZ2HlUzPCKyr0BkhReFr29jDePb3Hi5IAAOM1FBrsKLAeh6mCuG0kDfXbhF4N5MEhKlOGjf65Cau4NHdyRFAjhz7Ce8WSFLwa0BXAKzApLWXFgRPyA+r5tDNI3QBS9ldB2182EEJh0Bb8MRAh63KCGas1BD4z1B40NsHw7flGnmP0Fm4R2FgN1rCTxCpAdmHlHLGwQBEMtGH",
    capture_bpm = 112,
    capture_offset = 300,
    categories = { "Pad", "Bass", "Keys", "Lead", "Pluck", "Strings", "Brass", "FX" },
    chord_bpm = 96,
    count = 300,
    form = { { "INTRO", 4 }, { "VERSE 1", 8 }, { "CHORUS", 8 }, { "VERSE 2", 8 }, { "BRIDGE", 4 }, { "CHORUS", 8 }, { "OUTRO", 4 } },
    mseg = { 0, 127, 96, 70, 112, 28, 54, 12, 0 },
    notes = { "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B" },
    pad_degrees = { { { 1, "maj7", "Imaj7" }, { 2, "m9", "ii9" }, { 3, "m7", "iii7" }, { 4, "add9", "IVadd9" }, { 5, "7", "V7" }, { 6, "m7", "vi7" }, { 1, "", "I" }, { 7, "m7b5", "vii7b5" } }, { { 1, "m7", "i7" }, { 3, "", "III" }, { 4, "m7", "iv7" }, { 5, "m7", "v7" }, { 6, "maj7", "VImaj7" }, { 7, "", "VII" }, { 1, "m", "i" }, { 2, "m7b5", "ii7b5" } }, { { 1, "m9", "i9" }, { 2, "m7", "ii7" }, { 3, "maj7", "IIImaj7" }, { 4, "7", "IV7" }, { 5, "m7", "v7" }, { 7, "", "VII" }, { 1, "m7", "i7" }, { 6, "m7b5", "vi7b5" } }, { { 1, "", "I" }, { 2, "m7", "ii7" }, { 4, "", "IV" }, { 5, "m7", "v7" }, { 6, "m7", "vi7" }, { 7, "", "VII" }, { 1, "7", "I7" }, { 3, "m7b5", "iii7b5" } } },
    progressions = { { { 1, "maj7", { 0, 4, 7, 11 }, "Imaj7", false, "TONIC" }, { 6, "m7", { 0, 3, 7, 10 }, "vi7", false, "RELATIVE MINOR" }, { 2, "m9", { 0, 3, 7, 10, 14 }, "ii9", false, "PREDOMINANT" }, { 5, "7", { 0, 4, 7, 10 }, "V7", false, "DOMINANT" }, { 1, "", { 0, 4, 7, 12 }, "I6", 4, "TONIC, FIRST INVERSION" }, { 4, "add9", { 0, 4, 7, 14 }, "IVadd9", false, "SUBDOMINANT" }, { 3, "m7", { 0, 3, 7, 10 }, "iii7", false, "MEDIANT" }, { 5, "7", { 0, 4, 7, 10 }, "V7", false, "DOMINANT" } }, { { 1, "m7", { 0, 3, 7, 10 }, "i7", false, "TONIC" }, { 6, "maj7", { 0, 4, 7, 11 }, "VImaj7", false, "SUBMEDIANT" }, { 3, "", { 0, 4, 7, 12 }, "III", false, "RELATIVE MAJOR" }, { 7, "", { 0, 4, 7 }, "VII", false, "SUBTONIC" }, { 4, "m7", { 0, 3, 7, 10 }, "iv7", false, "SUBDOMINANT" }, { 5, "m7", { 0, 3, 7, 10 }, "v7", false, "MINOR DOMINANT" }, { 1, "m", { 0, 3, 7, 12 }, "i6", 3, "TONIC, FIRST INVERSION" }, { 7, "", { 0, 4, 7 }, "VII", false, "SUBTONIC" } }, { { 1, "m9", { 0, 3, 7, 10, 14 }, "i9", false, "TONIC" }, { 4, "7", { 0, 4, 7, 10 }, "IV7", false, "THE DORIAN SIXTH" }, { 1, "m7", { 0, 3, 7, 10 }, "i7", false, "TONIC" }, { 7, "", { 0, 4, 7 }, "VII", false, "SUBTONIC" }, { 2, "m7", { 0, 3, 7, 10 }, "ii7", false, "SUPERTONIC" }, { 5, "m7", { 0, 3, 7, 10 }, "v7", false, "MINOR DOMINANT" }, { 3, "maj7", { 0, 4, 7, 11 }, "IIImaj7", false, "MEDIANT" }, { 4, "7", { 0, 4, 7, 10 }, "IV7", false, "THE DORIAN SIXTH" } }, { { 1, "", { 0, 4, 7, 12 }, "I", false, "TONIC" }, { 7, "", { 0, 4, 7 }, "VII", false, "THE FLAT SEVENTH" }, { 4, "", { 0, 4, 7 }, "IV", false, "SUBDOMINANT" }, { 5, "m7", { 0, 3, 7, 10 }, "v7", false, "MINOR DOMINANT" }, { 2, "m7", { 0, 3, 7, 10 }, "ii7", false, "SUPERTONIC" }, { 6, "m7", { 0, 3, 7, 10 }, "vi7", false, "SUBMEDIANT" }, { 1, "7", { 0, 4, 7, 10 }, "I7", false, "TONIC SEVENTH" }, { 4, "", { 0, 4, 7 }, "IV", false, "SUBDOMINANT" } } },
    quantise = { "OFF", "1/8", "1/16", "1/16T" },
    ramp = { 0xFFFFB547, 0xFFFF9F4E, 0xFFFF8954, 0xFFFF775F, 0xFFFF6C75, 0xFFFF608A, 0xFFF35FAA, 0xFFDE65D0, 0xFFCA6AF6, 0xFFB471FC, 0xFF9D77FE, 0xFF867FFF, 0xFF708EFF, 0xFF599EFC, 0xFF43B9DD, 0xFF2DD4BF },
    ring = { -16, 26, -17, 26, -18, 25, -19, 24, -20, 23, -21, 23, -22, 22, -23, 21, -24, 20, -25, 19, -25, 18, -26, 17, -27, 16, -28, 15, -28, 14, -29, 12, -29, 11, -30, 10, -30, 9, -30, 8, -31, 6, -31, 5, -31, 4, -31, 3, -31, 1, -31, 0, -31, -1, -31, -3, -31, -4, -31, -5, -31, -6, -31, -8, -30, -9, -30, -10, -30, -11, -29, -12, -29, -14, -28, -15, -27, -16, -27, -17, -26, -18, -25, -19, -25, -20, -24, -21, -23, -22, -22, -23, -21, -24, -20, -25, -19, -25, -18, -26, -17, -27, -16, -27, -15, -28, -14, -29, -12, -29, -11, -30, -10, -30, -9, -30, -7, -31, -6, -31, -5, -31, -4, -31, -2, -31, -1, -31, 0, -31, 1, -31, 3, -31, 4, -31, 5, -31, 6, -31, 8, -30, 9, -30, 10, -30, 11, -29, 13, -29, 14, -28, 15, -27, 16, -27, 17, -26, 18, -25, 19, -25, 20, -24, 21, -23, 22, -22, 23, -21, 24, -20, 24, -19, 25, -18, 26, -17, 26, -16, 27, -15, 28, -14, 28, -12, 29, -11, 29, -10, 29, -9, 30, -8, 30, -6, 30, -5, 30, -4, 30, -3, 30, -1, 30, 0, 30, 1, 30, 3, 30, 4, 30, 5, 30, 6, 29, 8, 29, 9, 29, 10, 28, 11, 28, 12, 27, 14, 27, 15, 26, 16, 25, 17, 24, 18, 24, 19, 23, 20, 22, 21, 21, 22, 20, 23, 19, 23, 18, 24, 17, 25, 16, 26, 15, 26 },
    scales = { { "MAJOR", { 0, 2, 4, 5, 7, 9, 11 }, 1, "IONIAN" }, { "MINOR", { 0, 2, 3, 5, 7, 8, 10 }, 2, "AEOLIAN" }, { "DORIAN", { 0, 2, 3, 5, 7, 9, 10 }, 3, "MINOR, A BRIGHT SIXTH" }, { "MIXOLYDIAN", { 0, 2, 4, 5, 7, 9, 10 }, 4, "MAJOR, A FLAT SEVENTH" } },
    sine = { 0, 12, 25, 37, 49, 60, 71, 81, 90, 98, 106, 112, 117, 122, 125, 126, 127, 126, 125, 122, 117, 112, 106, 98, 90, 81, 71, 60, 49, 37, 25, 12, 0, -12, -25, -37, -49, -60, -71, -81, -90, -98, -106, -112, -117, -122, -125, -126, -127, -126, -125, -122, -117, -112, -106, -98, -90, -81, -71, -60, -49, -37, -25, -12 },
    slots = { "LOOP A", "LOOP B", "LOOP C", "LOOP D" },
    song = { { 48, 51, 55 }, { 44, 48, 51 }, { 43, 46, 51 }, { 46, 50, 53 }, { 41, 44, 48 }, { 44, 48, 51 }, { 46, 50, 53 }, { 43, 47, 50 } },
    songs = { "GLASS HARBOUR", "NIGHT BUS", "PAPER MOONS", "LOW TIDE", "COPPER SKY", "NORTHBOUND" },
    sounds = { "GLASS PAD", "SUB BASS", "TINE KEYS", "SAW LEAD", "BELL PLUCK", "STRING SWELL", "BRASS STAB" },
    source_colours = { 0xFF8B7CFF, 0xFF2DD4BF, 0xFFFF5C93, 0xFFFFB547 },
    source_dims = { 0xFF4B488F, 0xFF216F72, 0xFF7F395E, 0xFF7F613C },
    stage_offset = 52,
    tempos = { 92, 124, 108, 76, 116, 132 },
}
-- END GENERATED
local PNG,BUF=14,18
local WHITE=0xFFFFFFFF
local ATLAS_PNGS={{576,577},{578,579},{580,581}}
local TINT=579
local P_ATLAS,P_MOTION,P_CAPTURE,P_STAGE,P_CHORDS=0,1,2,3,4
local function floor(x)return x-x%1 end
local function whole(x)
local s=tostring(floor(x))
if s:sub(-2)==".0" then s=s:sub(1,-3)end
return s
end
local function tenths(x)
local t=floor(x*10+0.5)
return whole(floor(t/10)).."."..whole(t%10)
end
local function clamp(x,lo,hi)
if x<lo then return lo end
if x>hi then return hi end
return x
end
local function two(x)
if x<10 then return "0"..whole(x)end
return whole(x)
end
local function hash(x,seed)
return floor(((x*2654435761+seed*97531)%4294967296)/65536)
end
local mode,ready,loaded,draws,framed=0,false,0,0,false
local page,frame,last=0,0,-1
local enc={0,0,0,0,0,0,0,0}
local seen={}
local accent=WHITE
local keptFrame,keptText=-1000,""
local X={}
local function textbox(f,hor)
local t=text_data.new()
text_data.set(t,{text="",color=WHITE,font=f[1],font_size=f[2],just_ver=1,
just_hor=hor,bk_color=0x00000000,border_width_top=0,
border_width_bottom=0,border_width_left=0,border_width_right=0})
return t
end
local function say(t,s,c,x,y,w,h)
text_data.set(t,{text=s,color=c})
draw_text(t,x,y,w,h)
end
local function tint(name,x,y,colour,srcH)
local s=S[name]
local h=srcH or s[4]
if h<=0 then return end
draw_image(BUF,TINT,x,y+(s[4]-h),s[1],s[2]+(s[4]-h),s[3],h,colour)
end
local function chrome(title,right,hint)
draw_image(BUF,L.bg[page+1][1],0,0,0,L.bg[page+1][2],480,272,WHITE)
draw_rect(L.bar[1],L.bar[2],L.bar[3],L.bar[4],accent)
say(X.title,title,T.title,L.title[1],L.title[2],L.title[3],L.title[4])
say(X.head,right,T.head,L.head[1],L.head[2],L.head[3],L.head[4])
say(X.foot,hint,T.foot,L.foot[1],L.foot[2],L.foot[3],L.foot[4])
for i=0,L.pages-1 do
local c=T.dot_off
if i==page then c=accent end
draw_rect(L.dots[1]+i*L.dots[3],L.dots[2],L.dots[4],L.dots[5],c)
end
end
local function focus_colour(i,normal)
if last==i-1 then return accent end
return normal
end
local function cells(labels,values)
for i=1,#labels do
local x0=(i-1)*60
say(X.label,labels[i],focus_colour(i,T.label),x0,L.cell_label_y,60,11)
say(X.cell,values[i],focus_colour(i,T.value),x0,L.cell_value_y,60,15)
local fill=floor(enc[i]*44/127)
if fill>0 then draw_rect(x0+8,L.cell_bar_y,fill,4,focus_colour(i,T.bar))end
end
end
local function outline(x,y,w,h,c)
draw_rect(x,y,w,1,c)
draw_rect(x,y+h-1,w,1,c)
draw_rect(x,y,1,h,c)
draw_rect(x+w-1,y,1,h,c)
end
local function seconds()return frame/L.fps end
local A64={}
local sx,sy,scat={},{},{}
local atlasRead=false
local near,nearKey,inBox={},"",0
local function read_atlas()
if atlasRead then return end
local alphabet=D.alphabet
for i=1,64 do A64[alphabet:sub(i,i)]=i-1 end
local a=D.atlas
for i=1,D.count do
local o=(i-1)*5
sx[i]=A64[a:sub(o+1,o+1)]*64+A64[a:sub(o+2,o+2)]
sy[i]=A64[a:sub(o+3,o+3)]*64+A64[a:sub(o+4,o+4)]
scat[i]=A64[a:sub(o+5,o+5)]+1
end
atlasRead=true
end
local function map_x(v)return L.map[1]+floor(v*(L.map[3]-1)/4095)end
local function map_y(v)return L.map[2]+L.map[4]-1-floor(v*(L.map[4]-1)/4095)end
local function sound_colour(i)return D.ramp[floor(sx[i]*#D.ramp/4096)+1]end
local function sound_name(i)
return D.adjectives[hash(i,3)%#D.adjectives+1].." "..D.categories[scat[i]].." "..whole(i%89+1)
end
local function find_near(e)
local key=whole(e[1])..","..whole(e[2])..","..whole(e[3])
if key==nearKey then return end
nearKey=key
local cx,cy=e[1]*4095/127,e[2]*4095/127
local r=80+e[3]*1100/127
local best,dist={},{}
inBox=0
for i=1,D.count do
local dx,dy=sx[i]-cx,sy[i]-cy
if dx>=-r and dx<=r and dy>=-r and dy<=r then inBox=inBox+1 end
local d=dx*dx+dy*dy
if#best<8 or d<dist[#best]then
local k=#best+1
if k>8 then k=8 end
while k>1 and dist[k-1]>d do
best[k],dist[k]=best[k-1],dist[k-1]
k=k-1
end
best[k],dist[k]=i,d
end
end
near=best
end
local function atlas_state()
read_atlas()
local e=seen[P_ATLAS+1]
find_near(e)
local pick=floor(e[4]*8/128)+1
accent=sound_colour(near[pick])
return e,pick
end
local function brightness_text(v)
local f=200
for i=1,floor(v*64/4096)do f=f*1.0594 end
if f<1000 then return whole(f).." Hz" end
return tenths(f/1000).." kHz"
end
local function attack_text(v)
local ms=1
for i=1,64-floor(v*64/4096)do ms=ms*1.1261 end
if ms<1000 then return whole(ms).." ms" end
return tenths(ms/1000).." s"
end
local function thumbprint(i,x,y,colour)
local slow=1-sy[i]/4095
local rise=1+floor(slow*9)
for c=0,14 do
local h
if c<rise then h=1+floor(5*(c+1)/rise)
else h=6-floor((c-rise)*(2+scat[i]%3)/6)end
h=clamp(h-hash(i*16+c,7)%2,1,6)
draw_rect(x+c*2,y+7-h,1,h*2,colour)
end
end
local function draw_atlas()
local e,pick=atlas_state()
chrome(T.titles[1],whole(D.count).." SOUNDS   BRIGHTNESS x ATTACK","PADS AUDITION THE EIGHT NEAREST   E5 MORPHS")
local mx,my,mw,mh=L.map[1],L.map[2],L.map[3],L.map[4]
local cx,cy=map_x(e[1]*4095/127),map_y(e[2]*4095/127)
local r=80+e[3]*1100/127
local bx0,bx1=map_x(clamp(e[1]*4095/127-r,0,4095)),map_x(clamp(e[1]*4095/127+r,0,4095))
local by0,by1=map_y(clamp(e[2]*4095/127+r,0,4095)),map_y(clamp(e[2]*4095/127-r,0,4095))
draw_rect(mx,cy,mw,1,T.cross)
draw_rect(cx,my,1,mh,T.cross)
outline(bx0,by0,bx1-bx0+1,by1-by0+1,accent)
local tx,ty=bx0,by0-12
if ty<my then ty=by0 end
if tx>mx+mw-64 then tx=mx+mw-64 end
draw_rect(tx,ty,64,12,accent)
say(X.tag,whole(inBox).." IN BOX",T.on_accent,tx+3,ty,60,12)
local b=near[pick%#near+1]
for k=1,#near do
local i=near[k]
if k~=pick then tint("ring",map_x(sx[i])-4,map_y(sy[i])-4,T.ring)end
end
local a=near[pick]
local ax,ay,bxp,byp=map_x(sx[a]),map_y(sy[a]),map_x(sx[b]),map_y(sy[b])
local m=e[5]/127
for k=1,5 do
tint("dot",ax+floor((bxp-ax)*k/6)-2,ay+floor((byp-ay)*k/6)-2,T.ring)
end
tint("ring_big",ax-7,ay-7,accent)
tint("puck",ax+floor((bxp-ax)*m)-5,ay+floor((byp-ay)*m)-5,accent)
say(X.tag,"FAST",T.axis,mx+3,my+2,40,11)
say(X.tag,"SLOW",T.axis,mx+3,my+mh-24,40,11)
say(X.tag,"DARK",T.axis,mx+3,my+mh-13,40,11)
say(X.tagr,"BRIGHT",T.axis,mx+mw-63,my+mh-13,60,11)
local lx,ly=L.list[1],L.list[2]
for k=1,#near do
local i=near[k]
local y=ly+(k-1)*L.list[4]
if k==pick then draw_rect(lx,y,L.list[3],L.list[4]-2,T.raised)end
say(X.small,whole(k),k==pick and accent or T.dim,lx,y,12,L.list[4]-2)
thumbprint(i,lx+14,y+3,sound_colour(i))
local nameColour=T.value
if k~=pick then nameColour=T.label end
say(X.tag,sound_name(i),nameColour,lx+48,y,L.list[3]-50,L.list[4]-2)
end
cells({"BRIGHT","ATTACK","BOX","PICK","MORPH"},
{brightness_text(e[1]*4095/127),attack_text(e[2]*4095/127),whole(inBox),
whole(pick).." / 8",whole(e[5]*100/127).."%"})
end
local SOURCES={"LFO 1","LFO 2","MSEG","RANDOM"}
local SHAPES={"SINE 0.5 Hz","TRI 2 BARS","2 BARS","S+H 1/8"}
local TARGETS={"CUTOFF","RESONANCE","WAVE","PAN"}
local function sine(phase)return D.sine[floor(phase*64)%64+1]/127 end
local function source(k,t)
if k==1 then return sine(t*0.5-floor(t*0.5))end
if k==2 then
local p=t/4-floor(t/4)
if p<0.5 then return p*4-1 end
return 3-p*4
end
if k==3 then
local p=(t/4-floor(t/4))*(#D.mseg-1)
local i=floor(p)
local f=p-i
return(D.mseg[i+1]*(1-f)+D.mseg[i%(#D.mseg-1)+2]*f)/127
end
return(hash(floor(t*4),13)%255)/127-1
end
local function target_text(k,v)
if k==1 then
local f=20
for i=1,floor(v)do f=f*1.0559 end
if f<1000 then return whole(f).." Hz" end
return tenths(f/1000).." kHz"
end
if k==2 then return whole(v*100/127).." %" end
if k==3 then return "POS "..whole(v)end
local p=floor((v-64)*100/63)
if p<-2 then return "L "..whole(-p)end
if p>2 then return "R "..whole(p)end
return "CENTRE"
end
local function ring_at(cx,cy,v,name,colour,offset)
local i=clamp(floor(v),0,127)
tint(name,cx+D.ring[i*2+1]-offset,cy+D.ring[i*2+2]-offset,colour)
end
local function draw_motion()
atlas_state()
local e=seen[P_MOTION+1]
local t=seconds()
chrome(T.titles[2],"4 SOURCES   4 TARGETS   LIVE","E1-E4 SET   E5-E8 HOW FAR EACH SOURCE PUSHES")
for k=1,4 do
local x=L.knob_x[k]
local cx,cy=x+40,L.knob_y+40
local base=e[k]
local depth=(e[k+4]-64)/63
local s=source(k,t)
local now=clamp(base+depth*63*s,0,127)
local colour=D.source_colours[k]
draw_image(BUF,TINT,x,L.knob_y,0,floor(base*(L.knob_frames-1)/127+0.5)*80,80,80,T.knob)
for j=1,5 do ring_at(cx,cy,base+(now-base)*j/6,"dot",colour,2)end
ring_at(cx,cy,now,"dot_big",colour,4)
say(X.label,TARGETS[k],last==k-1 and accent or T.label,x-14,L.knob_label_y,108,12)
say(X.value,target_text(k,now),colour,x-14,L.knob_value_y,108,16)
say(X.small,"SET "..target_text(k,base),T.dim,x-14,L.knob_value_y+16,108,11)
local sxo,syo,sw,sh=L.scope_x[k],L.scope[1],L.scope[2],L.scope[3]
say(X.scope,SOURCES[k].."  "..SHAPES[k],colour,sxo+6,syo+3,sw-12,11)
local mid=syo+15+floor((sh-20)/2)
local amp=floor((sh-22)/2)
local step=L.scope_step
local cols=floor((sw-12)/step)
local phase
if k==1 then phase=t*0.5-floor(t*0.5)
elseif k==4 then phase=1
else phase=t/4-floor(t/4)end
for c=0,cols-1 do
local v
if k==4 then v=source(4,t-(cols-1-c)/16)
elseif k==1 then v=sine(c/cols)
elseif k==2 then v=source(2,4*c/cols)
else v=source(3,4*c/cols)*2-1 end
draw_rect(sxo+6+c*step,mid-floor(v*amp),step,2,D.source_dims[k])
end
local pc=clamp(floor(phase*cols),0,cols-1)
local pv=s
if k==3 then pv=s*2-1 end
draw_rect(sxo+6+pc*step,syo+15,1,sh-20,colour)
tint("dot_big",sxo+6+pc*step-4,mid-floor(pv*amp)-4,colour)
end
local depths={}
for k=1,4 do
local d=floor((e[k+4]-64)*100/63+0.5)
if d>0 then depths[k]="+"..whole(d).."%" else depths[k]=whole(d).."%" end
end
cells({"CUTOFF","RESO","WAVE","PAN","LFO 1","LFO 2","MSEG","RANDOM"},
{target_text(1,e[1]),target_text(2,e[2]),target_text(3,e[3]),target_text(4,e[4]),
depths[1],depths[2],depths[3],depths[4]})
end
local function bar_notes(b)
local out={}
local chord=D.song[b%#D.song+1]
if b<0 or hash(floor(b/4),33)%5==0 then return out end
if hash(b,21)%5~=0 then
for k=1,3 do out[#out+1]={0,4,chord[k],64}end
end
for k=0,7 do
if hash(b*8+k,22)%7~=0 then
local note=chord[D.arp[k*2+1]]+12*(1+D.arp[k*2+2])
out[#out+1]={k/2,0.45,note,80+hash(b*8+k,23)%40}
end
end
if b%2==1 then out[#out+1]={2,2,chord[2]+24,110}end
return out
end
local countBar,countN={},{}
local function bar_count(b)
if b<0 then return 0 end
local k=b%128+1
if countBar[k]~=b then countBar[k],countN[k]=b,#bar_notes(b)end
return countN[k]
end
local function draw_capture()
atlas_state()
local e=seen[P_CAPTURE+1]
local beat=(seconds()+D.capture_offset)*D.capture_bpm/60
local nowBar=floor(beat/4)
local keep=1+floor(e[1]*16/128)
local back=floor(e[2]*17/128)
local quant=D.quantise[floor(e[3]*4/128)+1]
local slot=D.slots[floor(e[4]*4/128)+1]
local total=0
for b=nowBar-59,nowBar do total=total+bar_count(b)end
chrome(T.titles[3],whole(total).." NOTES IN THE LAST 2:00","NOTHING YOU PLAY IS LOST   E5 KEEPS THE BOX")
local rx,ry,rw,rh=L.roll[1],L.roll[2],L.roll[3],L.roll[4]
local ppb=L.roll_beat_px
local right=rx+rw-2
local function x_of(bt)return right-floor((beat-bt)*ppb)end
local function y_of(n)return ry+rh-4-floor((n-36)*(rh-8)/48)end
local selEnd=(floor(beat/4)-back)*4
local selStart=selEnd-keep*4
local firstBar=nowBar-9
for b=firstBar,nowBar do
for q=0,3 do
local x=x_of(b*4+q)
if x>=rx and x<right then draw_rect(x,ry,1,rh,q==0 and T.bar_line or T.beat_line)end
end
end
for b=firstBar,nowBar do
local notes=bar_notes(b)
for k=1,#notes do
local n=notes[k]
local start=b*4+n[1]
if start<=beat then
local x0=x_of(start)
local x1=x_of(start+n[2])
if x1>right then x1=right end
if x0<rx then x0=rx end
if x1-x0>=1 then
local c=T.note_soft
if n[4]>=100 then c=T.note_loud elseif n[4]>=75 then c=T.note end
if start>=selStart and start<selEnd then c=accent end
draw_rect(x0,y_of(n[3]),x1-x0,3,c)
end
end
end
end
local bx0,bx1=clamp(x_of(selStart),rx,right),clamp(x_of(selEnd),rx,right)
if bx1>bx0 then
outline(bx0,ry,bx1-bx0+1,rh,accent)
local tab=bx0
if tab>right-84 then tab=right-84 end
draw_rect(tab,ry,84,12,accent)
say(X.tag,"KEEP "..whole(keep)..(keep==1 and " BAR" or " BARS"),T.on_accent,tab+3,ry,80,12)
end
if x_of(selStart)<rx then say(X.tag,"+"..whole(floor((rx-x_of(selStart))/(ppb*4))+1).." BARS",accent,rx+2,ry+rh-13,60,11)end
draw_rect(right,ry,2,rh,T.now)
if frame%16<10 then tint("rec",right-12,ry+3,T.rec)end
local mx,my,mw,mh=L.minimap[1],L.minimap[2],L.minimap[3],L.minimap[4]
local g=L.mini_group
local n=floor(60/g)
for j=0,n-1 do
local count,c=0,T.mini
for q=0,g-1 do
local b=nowBar-59+j*g+q
count=count+bar_count(b)
if b>=firstBar and c==T.mini then c=T.mini_visible end
if b*4>=selStart and b*4<selEnd then c=accent end
end
local x=mx+floor(j*mw/n)
local w=floor((j+1)*mw/n)-floor(j*mw/n)-1
local h=clamp(floor(count*(mh-4)/(13*g)),1,mh-4)
draw_rect(x,my+mh-2-h,w,h,c)
end
if frame-keptFrame>=0 and frame-keptFrame<30 then
draw_rect(rx+60,ry+50,rw-120,30,accent)
say(X.banner,keptText,T.on_accent,rx+60,ry+50,rw-120,30)
end
cells({"KEEP","FROM","QUANTISE","TO","KEEP IT"},
{whole(keep)..(keep==1 and " BAR" or " BARS"),back==0 and "NOW" or(whole(back).." AGO"),quant,slot,"TURN"})
end
local function draw_stage()
atlas_state()
local e=seen[P_STAGE+1]
local song=floor(e[1]*#D.songs/128)+1
local bpm=D.tempos[song]
local beat=(seconds()+D.stage_offset)*bpm/60
local barsTotal=0
for k=1,#D.form do barsTotal=barsTotal+D.form[k][2]end
local bar=floor(beat/4)%barsTotal
local inBeat=floor(beat)%4
local section,start=1,0
while bar>=start+D.form[section][2]do
start=start+D.form[section][2]
section=section+1
end
local len=D.form[section][2]
local done=bar-start
local nextSection=D.form[section%#D.form+1][1]
local setSecs=floor(seconds())+1800+song*240
chrome(T.titles[4],"SET "..whole(floor(setSecs/60))..":"..two(setSecs%60),"SHIFT + PAGE STEPS THE SETLIST   E1 PICKS A SONG")
say(X.tag,"SONG "..whole(song).." OF "..whole(#D.songs),T.label,14,34,200,12)
say(X.song,D.songs[song],T.title,14,46,300,26)
say(X.bpm,whole(bpm).." BPM",T.value,300,46,166,26)
say(X.section,D.form[section][1],accent,18,84,282,48)
say(X.tag,"BAR "..whole(done+1).." OF "..whole(len),T.label,18,136,200,12)
local sw=floor(282/len)
for k=0,len-1 do
local c=T.track
if k<done then c=T.dim elseif k==done then c=accent end
draw_rect(18+k*sw,156,sw-2,10,c)
end
say(X.label,"BARS LEFT",T.label,318,84,152,12)
say(X.huge,whole(len-done),accent,318,96,152,62)
for q=0,3 do
local c=T.track
if q==inBeat then c=(q==0)and accent or T.value end
draw_rect(336+q*30,164,24,8,c)
end
if beat-floor(beat)<0.18 then
local c=T.dim
if inBeat==0 then c=accent end
draw_rect(0,0,480,3,c);draw_rect(0,269,480,3,c)
draw_rect(0,0,3,272,c);draw_rect(477,0,3,272,c)
end
local nextSound=D.sounds[(song+section)%#D.sounds+1]
local loadedPct=clamp(floor(25+(done+beat/4-floor(beat/4))*150/len),0,100)
say(X.tag,"NEXT",T.label,18,186,40,12)
say(X.next,nextSection,T.title,18,198,150,24)
say(X.line,nextSound,T.value,170,198,200,24)
if loadedPct>=100 then
tint("dot_big",378,206,T.ready)
say(X.line,"READY",T.ready,392,198,80,24)
else
say(X.tag,"LOADING "..whole(loadedPct).."%",T.label,378,196,90,12)
draw_rect(378,212,84,4,T.track)
draw_rect(378,212,floor(84*loadedPct/100),4,T.value)
end
if frame%600>=420 and frame%600<480 then
draw_rect(8,180,464,46,T.warn)
say(X.banner,"PART 2 RESTARTED IN 0.3 s  -  SOUND BACK",T.on_warn,8,180,464,46)
end
end
local function scale_of(e)return D.scales[floor(e[2]*#D.scales/128)+1]end
local function chord_at(sc,k)
local list=D.progressions[sc[3]]
return list[k%#list+1]
end
local function draw_chords()
atlas_state()
local e=seen[P_CHORDS+1]
local key=floor(e[1]*12/128)
local sc=scale_of(e)
local beat=seconds()*D.chord_bpm/60
local barF=beat/4
local bar=floor(barF)
local ch=chord_at(sc,bar)
local nx=chord_at(sc,bar+1)
local NAMES=D.notes
local root=(key+sc[2][ch[1]])%12
local name=NAMES[root+1]..ch[2]
if ch[5]then name=name.."/"..NAMES[(root+ch[5])%12+1]end
local isHeld,count={},0
local function hold(n)
if not isHeld[n]then isHeld[n],count=true,count+1 end
end
local low=48+root
if root>=6 then low=low-12 end
for k=1,#ch[3]do hold(low+ch[3][k])end
if ch[5]then hold(36+(root+ch[5])%12)end
chrome(T.titles[5],"LISTENING   "..whole(count).." NOTES HELD","PADS PLAY THE NEXT CHORDS THROUGH THE CHORDER")
say(X.big,name,accent,14,34,280,66)
say(X.line,ch[4].."   "..ch[6],T.value,16,100,280,18)
draw_rect(16,120,270,3,T.track)
draw_rect(16,120,floor(270*(barF-bar)),3,accent)
say(X.label,"KEY",T.label,300,38,166,12)
say(X.key,NAMES[key+1].." "..sc[1],T.title,300,52,166,26)
say(X.label,sc[4],T.dim,300,80,166,12)
tint("dot",334,106,T.scale_mark)
say(X.tag,"IN SCALE",T.dim,342,102,56,12)
draw_rect(402,104,9,9,accent)
say(X.tag,"HELD",T.dim,415,102,40,12)
local kx,ky=L.kb[1],L.kb[2]
local WHITE_OF={0,0,1,1,2,3,3,4,4,5,5,6}
local inScale={}
for d=1,7 do inScale[(key+sc[2][d])%12]=true end
for pass=1,2 do
for n=36,71 do
local pc=n%12
local black=pc==1 or pc==3 or pc==6 or pc==8 or pc==10
local w=floor((n-36)/12)*7+WHITE_OF[pc+1]
if(pass==1 and not black)or(pass==2 and black)then
local x,y
if black then x,y=kx+(w+1)*L.kb[3]-5,ky else x,y=kx+w*L.kb[3],ky end
if isHeld[n]then
if black then tint("key_black",x,y,accent)
elseif pc==0 or pc==5 then tint("key_c",x,y,accent)
elseif pc==4 or pc==11 then tint("key_e",x,y,accent)
else tint("key_d",x,y,accent)end
end
if inScale[pc]then
if black then tint("dot",x+3,y+20,T.scale_mark)else tint("dot",x+7,y+37,T.scale_mark)end
end
end
end
end
for p=1,8 do
local d=D.pad_degrees[sc[3]][p]
local pr=(key+sc[2][d[1]])%12
local x=6+(p-1)*59
local likely=d[1]==nx[1]and d[2]==nx[2]
if likely then outline(x-1,L.pads[1]-1,56,L.pads[2]+2,accent)end
say(X.pad,NAMES[pr+1]..d[2],likely and accent or T.value,x-2,L.pads[1]+3,58,17)
say(X.small,d[3],T.label,x,L.pads[1]+20,54,12)
say(X.small,"PAD "..whole(p),T.dim,x,L.pads[1]+32,54,11)
end
end
local calls,heap,device=0,-1,-1
local function counting(f)
return function(...)
calls=calls+1
return f(...)
end
end
local function diagnostics()
if CTRL49_PREVIEW then return end
if draws%15==0 or heap<0 then
if type(collectgarbage)=="function" then heap=collectgarbage("count")end
if type(mem_usage)=="function" and type(pcall)=="function" then
local ok,v=pcall(mem_usage,0)
if ok and type(v)=="number" then device=v end
end
end
local s=whole(calls).."   "..whole(heap).."K"
if device>=0 then s=s.."   "..whole(device)end
say(X.diag,s,T.dim,L.diag[1],L.diag[2],L.diag[3],L.diag[4])
end
function init(args)
if ready then return end
for k=1,#T.roles do
local role=T.roles[k]
X[role]=textbox(T.fonts[role],T.aligns[role])
end
for p=1,L.pages do
seen[p]={}
for i=1,8 do seen[p][i]=L.defaults[p][i]end
end
for i=1,8 do enc[i]=seen[1][i]end
draw_rect,draw_image,draw_text=counting(draw_rect),counting(draw_image),counting(draw_text)
ready=true
end
function set_mode(args)
local m=get_byte(args,0)
if m==nil then m=1 end
mode=m
end
function set_frame(args)
page=clamp(get_byte(args,0),0,L.pages-1)
frame=get_byte(args,1)+get_byte(args,15)*256
for i=1,8 do enc[i]=clamp(get_byte(args,1+i),0,127)end
last=get_byte(args,10)
if ready then
if page==P_CAPTURE and enc[5]~=seen[P_CAPTURE+1][5]then
local keep=1+floor(enc[1]*16/128)
keptFrame=frame
keptText="KEPT "..whole(keep)..(keep==1 and " BAR" or " BARS").." AS "
..D.slots[floor(enc[4]*4/128)+1]..",  QUANTISED "..D.quantise[floor(enc[3]*4/128)+1]
end
for i=1,8 do seen[page+1][i]=enc[i]end
end
framed=true
end
function set_envelope(args)end
local function loading()
draw_rect(0,0,480,272,T.load_bg)
say(X.name,T.name,T.title,0,96,480,30)
say(X.label,"LOADING  "..whole(loaded).." / 3",T.label,0,132,480,16)
draw_rect(150,160,180,4,T.track)
if loaded>0 then draw_rect(150,160,floor(180*loaded/3),4,T.load_bar)end
end
local PAGES={draw_atlas,draw_motion,draw_capture,draw_stage,draw_chords}
function draw(args)
if not ready then init("")end
draws=draws+1
if loaded<3 then
if draws>1 then
local a=ATLAS_PNGS[loaded+1]
decode_image(PNG,a[1],BUF,a[2],WHITE)
loaded=loaded+1
end
loading()
return
end
if mode~=1 and not framed then
loading()
return
end
calls=0
PAGES[page+1]()
diagnostics()
end
