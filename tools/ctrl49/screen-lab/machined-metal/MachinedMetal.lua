-- Machined Metal, native 480x272. Same set_frame/set_envelope bytes as Ctrl49ScreenLab.
-- Device operations are only text, rectangles and PNG crops. No scaling/rotation/math library.
-- Reusable skin: 3 panel backgrounds, a 64-frame 80px knob and one small moving-parts atlas.
local WHITE, INK, DIM, AMBER, MINT = 0xFFFFF0CE, 0xFF101412, 0xFFB1B19E, 0xFFFFBD54, 0xFF9CFFD0
local PANELS, KNOBS, PARTS = 577, 579, 581
local page, frame, focus, mode, decoded = 0, 0, 0, 0, 0
local values = {63,41,23,83,64,64,64,64}
local cols, marks, texts = {}, {0,0,0,0}, {"12 ms","248 ms","68 %","684 ms"}
local labels = {"CUTOFF","RES","DRIVE","MIX"}
local channels = {"KICK","SNARE","HATS","BASS","KEYS","PAD","LEAD","FX"}
local TITLE, SMALL, VALUE, FOOT
local initialized = false
local function floor(x) return x-x%1 end
local function whole(x)
    local s=tostring(floor(x))
    if s:sub(-2)==".0" then s=s:sub(1,-3) end
    return s
end
local function textbox(size,hor)
    local t=text_data.new()
    text_data.set(t,{text="",color=WHITE,font=10,font_size=size,just_hor=hor,just_ver=1,
        bk_color=0x00000000,border_width_top=0,border_width_bottom=0,border_width_left=0,border_width_right=0})
    return t
end
local function say(t,s,c,x,y,w,h)
    text_data.set(t,{text=s,color=c}); draw_text(t,x,y,w,h)
end
local function part(sx,sy,w,h,x,y)
    draw_image(18,PARTS,x,y,sx,sy,w,h,0xFFFFFFFF)
end
local function outline(x,y,w,h)
    draw_rect(x,y,w,1,AMBER); draw_rect(x,y+h-1,w,1,AMBER)
    draw_rect(x,y,1,h,AMBER); draw_rect(x+w-1,y,1,h,AMBER)
end
function init(args)
    if initialized then return end
    TITLE=textbox(14,0); SMALL=textbox(13,1); VALUE=textbox(21,1); FOOT=textbox(13,1)
    initialized=true
end
function set_mode(args) mode=get_byte(args,0) end
function set_frame(args)
    page=get_byte(args,0); if page>2 then page=2 end
    frame=get_byte(args,1)+get_byte(args,15)*256
    for i=1,8 do values[i]=get_byte(args,i+1) end
    focus=get_byte(args,10)
    if page~=1 and focus>3 then focus=3 end
end
function set_envelope(args)
    for c=1,110 do cols[c]=get_byte(args,c-1) end
    for m=1,4 do marks[m]=get_byte(args,109+m) end
    local offset=114
    for t=1,4 do
        local n=get_byte(args,offset); offset=offset+1
        texts[t]=args:sub(offset+1,offset+n); offset=offset+n
    end
end
local function knob_value(i)
    if i==1 then return whole(20+19980*values[i]*values[i]*values[i]/2048383).." Hz" end
    return whole(values[i]*100/127+.5).."%"
end
local function draw_controls()
    for i=1,4 do
        local x=8+(i-1)*118
        say(SMALL,labels[i],WHITE,x,51,110,24)
        local f=floor(values[i]*63/127+.5)
        draw_image(18,KNOBS,x+15,97,0,f*80,80,80,0xFFFFFFFF)
        local val=knob_value(i)
        if i==1 then
            local hz=20+19980*values[i]*values[i]*values[i]/2048383
            if hz<1000 then val=whole(hz).." Hz"
            else
                local tenth=floor(hz/100)
                val=whole(tenth/10).."."..whole(tenth%10).."k"
            end
        end
        say(VALUE,val,AMBER,x+8,192,94,30)
        if focus==i-1 then outline(x+1,42,108,188) end
    end
    say(FOOT,labels[focus+1].."   "..knob_value(focus+1),WHITE,13,242,454,22)
end
local function db(v)
    if v==0 then return "-INF" end
    -- Demonstration fader taper: -60..+6 dB; exact mute at zero.
    return whole(-60+v*66/127+.5)
end
local function draw_mixer()
    for i=1,8 do
        local x=8+(i-1)*58
        say(SMALL,whole(i),WHITE,x,36,52,25)
        part(0,0,34,40,x+8,64+floor((127-values[i])*110/127))
        local pulse=(frame+i*13)%48
        if pulse>24 then pulse=48-pulse end
        local level=floor(values[i]*(.55+pulse/60)*18/127)
        if level>18 then level=18 end
        if level>0 then
            local h=level*8
            part(68,144-h,8,h,x+40,70+144-h)
        end
        say(SMALL,db(values[i]),AMBER,x+2,219,48,20)
        if focus==i-1 then outline(x,34,54,208) end
    end
    say(FOOT,"CH "..whole(focus+1).."  "..channels[focus+1].."  "..db(values[focus+1]).." dB   / DEMO",WHITE,12,246,456,21)
end
local function draw_envelope()
    if #cols>0 then
        -- Reconstruct a continuous line from the host's 4px-spaced samples. Small rectangles
        -- bridge steep segments; atlas glow adds depth without a full-screen animated strip.
        for c=1,109 do
            local a,b=cols[c],cols[c+1]
            for s=0,3 do
                local lo=floor(a+(b-a)*s/4)
                local hi=floor(a+(b-a)*(s+1)/4)
                if lo>hi then lo,hi=hi,lo end
                draw_rect(20+(c-1)*4+s,190-hi,1,hi-lo+2,MINT)
            end
            if c%2==0 then part(80,0,12,12,14+(c-1)*4,184-a) end
        end
        for m=1,3 do
            local c=marks[m]+1
            if c>110 then c=110 end
            part(96,0,14,14,13+(c-1)*4,183-cols[c])
        end
    end
    local stage={"A","D","S","R"}
    for i=1,4 do
        local x=8+(i-1)*118
        part(38,0,22,28,x+10+floor(values[i]*72/127),209)
        say(FOOT,stage[i].." "..texts[i],AMBER,x+4,242,105,22)
        if focus==i-1 then outline(x+2,204,108,64) end
    end
end
function draw(args)
    -- Decode one atlas per draw, after a visible loading frame. Never decode a large filmstrip
    -- from init(): the host sends keepalives during the startup dwell between these draws.
    if decoded<4 then
        draw_rect(0,0,480,272,INK)
        say(TITLE,"MACHINED METAL",WHITE,28,94,420,26)
        say(FOOT,"Loading screen preset...",AMBER,20,133,440,26)
        if decoded==1 then decode_image(14,576,18,PANELS,0xFFFFFFFF) end
        if decoded==2 then decode_image(14,578,18,KNOBS,0xFFFFFFFF) end
        if decoded==3 then decode_image(14,580,18,PARTS,0xFFFFFFFF) end
        decoded=decoded+1
        return
    end
    if mode==0 then
        draw_rect(0,0,480,272,INK)
        say(TITLE,"MACHINED METAL",WHITE,28,94,420,26)
        say(FOOT,"Ready",AMBER,20,133,440,26)
        return
    end
    draw_image(18,PANELS,0,0,0,page*272,480,272,0xFFFFFFFF)
    local titles={"CONTROLS","MIXER / DEMO","AMP ENVELOPE"}
    say(TITLE,titles[page+1],WHITE,12,4,310,23)
    say(FOOT,"<  "..whole(page+1).." / 3  >",DIM,366,4,104,23)
    if page==0 then draw_controls() elseif page==1 then draw_mixer() else draw_envelope() end
end
