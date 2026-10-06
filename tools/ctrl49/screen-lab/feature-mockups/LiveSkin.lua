-- CTRL49 screen lab: four more HoSTage pages, about what the screen can carry, as mockups. One
-- preset, four pages:
--
--   0 LIVE     the 49 keys with every part's zone, the keys you hold, and the notes the
--              arpeggiator plays from them, over the arp's sixteen steps with a playhead. E1
--              picks a step, E2-E5 edit it (velocity, octave, ratchets, chance), E6-E8 are the
--              arp's gate, rate and mode.
--   1 SECTION  one section of a plug-in's own window, cut out by the panel scan, with an overlay
--              on each control (a ring, a fader cap, a lamp, a selector mark) that follows the
--              CTRL49's eight knobs. A control the scan could not find gets a cell in the strip.
--   2 LABELS   the stage view in large type, where every word is a picture HoSTage drew and
--              uploaded once: no firmware text at all. E1 picks the song, E2 the bar, E3 the
--              colours (recolouring a word costs nothing: it is tinted as it is drawn).
--   3 METERS   every part's level, left and right, with peak hold, clip lamps and the fader,
--              the master, and the master's last six seconds. E1-E5 are the parts' faders, E6
--              the master's.
--
-- These are mockups: the lab has no rack, no arpeggiator, no plug-in and no audio, so the parts,
-- the playing, the plug-in's picture, the songs and the levels are data the generator wrote into
-- this page, and the clock is the frame counter. The README says, page by page, what HoSTage
-- would send instead.
--
-- This file is the template. make_live_mockups.py writes the design's Skin.lua from it, replacing
-- only the GENERATED block. Never hand-edit Skin.lua. No math library is assumed; every number
-- shown goes through whole() so Lua 5.2 on the keyboard and the 5.4 preview agree.

-- BEGIN GENERATED (make_live_mockups.py writes this block)
local T = {}
local L = {}
local S = {}
local D = {}
-- END GENERATED

local PNG, BUF = 14, 18
local WHITE = 0xFFFFFFFF
-- Uploaded PNG ids and the decoded buffers made from them, decoded one per redraw.
local ATLAS_PNGS = { { 576, 577 }, { 578, 579 }, { 580, 581 } }
local TINT = 579             -- the backgrounds are cropped by L.bg, which names their buffers
local P_LIVE, P_SECTION, P_LABELS, P_METERS = 0, 1, 2, 3

local function floor (x) return x - x % 1 end
local function whole (x)
    local s = tostring(floor(x))
    if s:sub(-2) == ".0" then s = s:sub(1, -3) end
    return s
end
local function clamp (x, lo, hi)
    if x < lo then return lo end
    if x > hi then return hi end
    return x
end
local function tenths (x)
    local neg = x < 0
    if neg then x = -x end
    local t = floor(x * 10 + 0.5)
    local s = whole(floor(t / 10)) .. "." .. whole(t % 10)
    if neg and t > 0 then s = "-" .. s end
    return s
end
local function signed (x)
    if x > 0 then return "+" .. whole(x) end
    return whole(x)
end
local function signed_tenths (x)
    if floor(x * 10 + 0.5) > 0 then return "+" .. tenths(x) end
    return tenths(x)
end
local function hash (x, seed)
    return floor(((x * 2654435761 + seed * 97531) % 4294967296) / 65536)
end

-- --- state ---------------------------------------------------------------------------------------

local mode, ready, loaded, draws, framed = 0, false, 0, 0, false
local page, frame, last = 0, 0, -1
local enc = { 0, 0, 0, 0, 0, 0, 0, 0 }
local seen = {}             -- every page's encoders as last seen (the manifest's until then)
local accent = WHITE

-- --- text --------------------------------------------------------------------------------------

local X = {}                -- text objects, by role

local function textbox (f, hor)
    local t = text_data.new()
    text_data.set(t, { text = "", color = WHITE, font = f[1], font_size = f[2], just_ver = 1,
                       just_hor = hor, bk_color = 0x00000000, border_width_top = 0,
                       border_width_bottom = 0, border_width_left = 0, border_width_right = 0 })
    return t
end

local function say (t, s, c, x, y, w, h)
    text_data.set(t, { text = s, color = c })
    draw_text(t, x, y, w, h)
end

-- --- drawing helpers -----------------------------------------------------------------------------

-- A grey coverage sprite from tint.png, drawn in any colour.
local function tint (name, x, y, colour)
    local s = S[name]
    draw_image(BUF, TINT, x, y, s[1], s[2], s[3], s[4], colour)
end

-- A word HoSTage drew (a sprite of the same atlas), placed by its left edge (0), its centre (1)
-- or its right edge (2). Returns its width.
local function word (name, x, y, colour, align)
    local s = S[name]
    if align == 1 then x = x - floor(s[3] / 2) elseif align == 2 then x = x - s[3] end
    draw_image(BUF, TINT, x, y, s[1], s[2], s[3], s[4], colour)
    return s[3]
end

local function outline (x, y, w, h, c)
    draw_rect(x, y, w, 1, c)
    draw_rect(x, y + h - 1, w, 1, c)
    draw_rect(x, y, 1, h, c)
    draw_rect(x + w - 1, y, 1, h, c)
end

local function backdrop ()
    draw_image(BUF, L.bg[page + 1][1], 0, 0, 0, L.bg[page + 1][2], 480, 272, WHITE)
    draw_rect(L.bar[1], L.bar[2], L.bar[3], L.bar[4], accent)
    for i = 0, L.pages - 1 do
        local c = T.dot_off
        if i == page then c = accent end
        draw_rect(L.dots[1] + i * L.dots[3], L.dots[2], L.dots[4], L.dots[5], c)
    end
end

local function chrome (title, right, hint)
    backdrop()
    say(X.title, title, T.title, L.title[1], L.title[2], L.title[3], L.title[4])
    say(X.head, right, T.head, L.head[1], L.head[2], L.head[3], L.head[4])
    if hint then say(X.foot, hint, T.foot, L.foot[1], L.foot[2], L.foot[3], L.foot[4]) end
end

local function focus_colour (i, normal)
    if last == i - 1 then return accent end
    return normal
end

-- The cells over the encoders: a label, a value (dim while the encoder has not picked the
-- value up), and a bar of the encoder's position (the tracks are in the background).
local function cells (labels, values, dims)
    for i = 1, #labels do
        local x0 = (i - 1) * 60
        local c = focus_colour(i, T.value)
        if dims and dims[i] then c = T.dim end
        say(X.label, labels[i], focus_colour(i, T.label), x0, L.cell_label_y, 60, 11)
        say(X.cell, values[i], c, x0, L.cell_value_y, 60, 15)
        local fill = floor(enc[i] * 44 / 127)
        if fill > 0 then draw_rect(x0 + 8, L.cell_bar_y, fill, 4, focus_colour(i, T.bar)) end
    end
end

local function seconds () return frame / L.fps end

-- --- editing with absolute encoders -----------------------------------------------------------------

-- The lab keeps each encoder's absolute position, so an encoder takes a step's value over only
-- once it reaches it, like a fader without a motor; until then the value stays and its cell
-- shows it dim. Picking another step lets go of everything held. HoSTage reports each turn as a
-- relative step (encoderDelta), so it would not need this.
local held = {}
local function let_go () held = {} end
local function pick_up (key, value, conv, before, now)
    local a, b = conv(before), conv(now)
    if held[key] or (a <= value and b >= value) or (a >= value and b <= value) then
        held[key] = true
        return b
    end
    return value
end
local function same (v) return v end
local function waiting (key, value, conv, e)
    return not held[key] and conv(e) ~= value
end

-- --- the keyboard ---------------------------------------------------------------------------------

local WHITE_OF = { 0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6 }
local function is_black (pc) return pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10 end

-- Where key n is on the keyboard, and how wide.
local function key_x (n)
    local pc = n % 12
    local w = floor((n - 36) / 12) * 7 + WHITE_OF[pc + 1]
    if is_black(pc) then return L.kb[1] + (w + 1) * L.kb[3] - 5, 10 end
    return L.kb[1] + w * L.kb[3], L.kb[3] - 1
end

local function span (lo, hi)
    local a = key_x(lo)
    local b, bw = key_x(hi)
    return a, b + bw - a
end

local function light_key (n, c)
    local pc = n % 12
    local x, ky = key_x(n), L.kb[2]
    if is_black(pc) then tint("key_black", x, ky, c)
    elseif n == 84 then tint("key_full", x, ky, c)
    elseif pc == 0 or pc == 5 then tint("key_c", x, ky, c)
    elseif pc == 4 or pc == 11 then tint("key_e", x, ky, c)
    else tint("key_d", x, ky, c) end
end

-- --- page 0: live --------------------------------------------------------------------------------

local steps = {}            -- { velocity (0 = a rest), octave, ratchets, chance }
local function step_of (v) return floor(v * 16 / 128) + 1 end
local function oct_of (v) return floor(v * 5 / 128) - 2 end
local function rat_of (v) return floor(v * 4 / 128) + 1 end
local function chance_of (v) return floor(v * 100 / 127 + 0.5) end
local function gate_of (v) return 5 + floor(v * 95 / 127 + 0.5) end
local function rate_of (v) return floor(v * #D.rates / 128) + 1 end
local function mode_of (v) return floor(v * #D.modes / 128) + 1 end

local function turn_live (b, n)
    local k = step_of(n[1])
    if k ~= step_of(b[1]) then let_go() end
    local s = steps[k]
    s[1] = pick_up(k .. "v", s[1], same, b[2], n[2])
    s[2] = pick_up(k .. "o", s[2], oct_of, b[3], n[3])
    s[3] = pick_up(k .. "r", s[3], rat_of, b[4], n[4])
    s[4] = pick_up(k .. "c", s[4], chance_of, b[5], n[5])
end

-- What the arpeggiator plays at a step: the held chord across two octaves, walked the mode's
-- way, the step's octave added. A rest, or a step its chance skips, plays nothing.
local function arp_notes (chord, count, s, m)
    if s[1] == 0 or hash(count, 3) % 100 >= s[4] then return {} end
    local pool = {}
    for k = 1, #chord do pool[#pool + 1] = chord[k] end
    for k = 1, #chord do pool[#pool + 1] = chord[k] + 12 end
    local n, out, name = #pool, {}, D.modes[m]
    if name == "CHORD" then
        for k = 1, #chord do out[k] = chord[k] + s[2] * 12 end
        return out
    end
    local i = count % n + 1
    if name == "DOWN" then i = n - count % n
    elseif name == "UP-DOWN" then
        local k = count % (2 * n - 2)
        if k < n then i = k + 1 else i = 2 * n - 1 - k end
    elseif name == "RANDOM" then i = hash(count, 7) % n + 1 end
    out[1] = pool[i] + s[2] * 12
    return out
end

local function draw_live ()
    local e = seen[P_LIVE + 1]
    accent = D.parts[3].colour
    local cursor = step_of(e[1])
    local gate, rate, m = gate_of(e[6]), rate_of(e[7]), mode_of(e[8])
    local beats = seconds() * D.bpm / 60 + D.offset
    local pos = beats * D.spb[rate]
    local count = floor(pos)
    local frac = pos - count
    local playing = count % 16 + 1
    local bar = D.chords[floor(beats / 4) % #D.chords + 1]
    local s = steps[playing]
    local now = arp_notes(bar[3], count, s, m)
    local within = frac * s[3]
    local sounding = within - floor(within) < gate / 100
    chrome(T.titles[1], "HOLDING " .. bar[1] .. "   ARP " .. D.modes[m] .. " " .. D.rates[rate] .. "   " .. whole(D.bpm) .. " BPM",
           "PADS TURN STEPS ON AND OFF   E1 STEP")
    -- the steps: velocity as a bar, ratchets as dots, octave and chance under them
    local gx, gy, pitch, cw, ch = L.grid[1], L.grid[2], L.grid[3], L.grid[4], L.grid[5]
    local base, tall = gy + L.grid[6], L.grid[7]
    for p = 1, 16 do
        local q = steps[p]
        local x = gx + (p - 1) * pitch
        if p == cursor then draw_rect(x, gy, cw, ch, T.raised) end
        local c = T.bar
        if p == playing then c = accent end
        if p == playing and #now == 0 then c = T.dim end
        if q[1] > 0 then
            local h = floor(q[1] * tall / 127)
            if h > 0 then draw_rect(x + 6, base - h, cw - 12, h, c) end
            local dots = q[3] * 5 - 2
            for j = 1, q[3] do draw_rect(x + floor((cw - dots) / 2) + (j - 1) * 5, gy + 4, 3, 3, c) end
        else
            draw_rect(x + 8, base - 2, cw - 16, 2, T.dim)
        end
        if q[2] ~= 0 then say(X.ctext, signed(q[2]), T.label, x, base + 3, cw, 11) end
        if q[4] < 100 then say(X.ctext, whole(q[4]) .. "%", T.dim, x, base + 14, cw, 11) end
        if p == playing then outline(x, gy, cw, ch, accent) end
    end
    -- every part's zone over the keys
    local zx, zy, zw, zh = L.zone[1], L.zone[2], L.zone[3], L.zone[4]
    for k = 1, #D.parts do
        local pt = D.parts[k]
        local x, w = span(pt.lo, pt.hi)
        local y = zy + (k - 1) * zh
        draw_rect(x, y, w, zh - 1, pt.dim)
        say(X.zone, pt.name, k == 3 and T.title or T.label, x + 3, y, w - 6, zh - 1)
    end
    -- the keys: what you hold in the colour of the part that plays it, and over them, with a
    -- mark, what the arpeggiator plays now
    local lit, mark = {}, {}
    for k = 1, #D.parts - 1 do
        local pt = D.parts[k]
        if bar[2] >= pt.lo and bar[2] <= pt.hi then lit[bar[2]] = pt.colour end
        for j = 1, #bar[3] do
            local n = bar[3][j]
            if n >= pt.lo and n <= pt.hi then lit[n] = pt.colour end
        end
    end
    if sounding then
        for j = 1, #now do
            local n = now[j]
            if n >= 36 and n <= 84 then lit[n], mark[n] = accent, true end
        end
    end
    for pass = 1, 2 do
        for n = 36, 84 do
            if lit[n] and (pass == 2) == is_black(n % 12) then
                light_key(n, lit[n])
                if mark[n] then
                    -- the mark sits near the front of the key: L.kb[4] down a white key, L.kb[5] a black
                    local x, w = key_x(n)
                    local y = L.kb[2] + L.kb[4]
                    if is_black(n % 12) then y = L.kb[2] + L.kb[5] end
                    tint("dot", x + floor((w - 5) / 2), y, T.on_accent)
                end
            end
        end
    end
    local q = steps[cursor]
    local dims = { false, waiting(cursor .. "v", q[1], same, e[2]), waiting(cursor .. "o", q[2], oct_of, e[3]),
                   waiting(cursor .. "r", q[3], rat_of, e[4]), waiting(cursor .. "c", q[4], chance_of, e[5]) }
    local vel = whole(q[1])
    if q[1] == 0 then vel = "REST" end
    cells({ "STEP", "VELOCITY", "OCTAVE", "RATCHET", "CHANCE", "GATE", "RATE", "MODE" },
          { whole(cursor) .. " / 16", vel, signed(q[2]), "x" .. whole(q[3]), whole(q[4]) .. "%",
            whole(gate) .. "%", D.rates[rate], D.modes[m] }, dims)
end

-- --- page 1: one section of the plug-in's own window ------------------------------------------

local function hz (v)
    local f = 20
    for i = 1, floor(v) do f = f * 1.0559 end
    if f < 1000 then return whole(f) .. " Hz" end
    return tenths(f / 1000) .. " kHz"
end

local function control_text (c, v)
    local f = c.fmt
    if f == "type" then return D.section.segments[floor(v * #D.section.segments / 128) + 1] end
    if f == "onoff" then
        if v >= 64 then return "ON" end
        return "OFF"
    end
    if f == "hz" then return hz(v) end
    if f == "db" then return tenths(v * 24 / 127) .. " dB" end
    if f == "bip" then return signed(floor((v - 64) * 100 / 63)) .. "%" end
    return whole(floor(v * 100 / 127 + 0.5)) .. "%"
end

local function badge (n, x, y)
    tint("badge", x, y, accent)
    say(X.badge, whole(n), T.on_accent, x, y + 1, L.badge, L.badge - 2)
end

local function draw_section ()
    local e = seen[P_SECTION + 1]
    local sec = D.section
    accent = T.section
    chrome(sec.name, sec.plugin .. "   SECTION " .. whole(sec.index) .. " OF " .. whole(sec.count), nil)
    local strip = 0
    for i = 1, #sec.controls do
        local c = sec.controls[i]
        local v = e[i]
        local b = c.box
        if c.kind == "knob" then
            local cx, cy = b[1] + floor(b[3] / 2), b[2] + floor(b[4] / 2)
            local half = floor(L.arc[3] / 2)
            local f = floor(v * (L.arc[4] - 1) / 127 + 0.5)
            local function arc (k, colour)
                local col, row = k % L.arc[5], floor(k / L.arc[5])
                draw_image(BUF, TINT, cx - half, cy - half, L.arc[1] + col * L.arc[3], L.arc[2] + row * L.arc[3],
                           L.arc[3], L.arc[3], colour)
            end
            arc(L.arc[4] - 1, T.track)
            if f > 0 then arc(f, accent) end
            tint("dot_big", cx + D.tip[v * 2 + 1] - 4, cy + D.tip[v * 2 + 2] - 4, accent)
            badge(i, cx - half - 2, cy - half - 2)
        elseif c.kind == "vfader" then
            local y = b[2] + floor((127 - v) * (b[4] - 8) / 127)
            draw_rect(b[1] - 4, y, b[3] + 8, 8, accent)
            draw_rect(b[1] - 4, y + 3, b[3] + 8, 2, T.on_accent)
            badge(i, b[1] - 20, b[2])
        elseif c.kind == "button" then
            outline(b[1] - 2, b[2] - 2, b[3] + 4, b[4] + 4, accent)
            if v >= 64 then tint("dot_big", b[1] + b[3] - 13, b[2] + floor((b[4] - 9) / 2), accent)
            else tint("ring", b[1] + b[3] - 13, b[2] + floor((b[4] - 9) / 2), accent) end
            badge(i, b[1] - 9, b[2] - 9)
        elseif c.kind == "selector" then
            local n = #sec.segments
            local k = floor(v * n / 128)
            local sw = floor((b[3] + sec.gap) / n)
            local x = b[1] + k * sw
            outline(x - 2, b[2] - 2, sw - sec.gap + 4, b[4] + 4, accent)
            draw_rect(x, b[2] + b[4] + 4, sw - sec.gap, 2, accent)
            badge(i, b[1] - 9, b[2] - 9)
        else
            -- not found on the GUI: a cell of its own in the strip under the picture
            local sx, sy = L.strip[1] + strip * L.strip[3], L.strip[2]
            badge(i, sx + 4, sy + 4)
            say(X.tag, c.name, T.value, sx + 22, sy + 2, L.strip[3] - 30, 13)
            say(X.tag, control_text(c, v), focus_colour(i, T.label), sx + 22, sy + 16, 60, 13)
            local w = floor(v * 50 / 127)
            if w > 0 then draw_rect(sx + 84, sy + 22, w, 4, accent) end
            strip = strip + 1
        end
    end
    if strip > 0 then say(X.tag9, "NOT ON ITS GUI, BY NAME ONLY", T.dim, L.strip[1] + strip * L.strip[3] + 4, L.strip[2] + 2, 160, 12) end
    -- the control turned last: its name and value over the picture
    local c = sec.controls[last + 1]
    if c and c.kind ~= "none" then
        local t = c.tag
        draw_rect(t[1], t[2], t[3], 15, T.raised)
        draw_rect(t[1], t[2], 2, 15, accent)
        say(X.tag, c.name .. "  " .. control_text(c, e[last + 1]), T.title, t[1] + 6, t[2] + 1, t[3] - 8, 13)
    end
end

-- --- page 2: every word a picture ---------------------------------------------------------------------

-- A number from the digit sprites of a size ("big" or "small"), right edge at x.
local function number (n, size, x, y, colour)
    local s = whole(n)
    local w = 0
    for k = 1, #s do w = w + S[size .. s:sub(k, k)][3] + 1 end
    x = x - w
    for k = 1, #s do x = x + word(size .. s:sub(k, k), x, y, colour, 0) + 1 end
    return w
end

local function draw_labels ()
    local e = seen[P_LABELS + 1]
    local songs = D.songs
    local si = floor(e[1] * #songs / 128) + 1
    local song, after = songs[si], songs[si % #songs + 1]
    local total = 0
    for k = 1, #song.sections do total = total + song.sections[k][2] end
    local at = floor(e[2] * total / 128)
    local scheme = floor(e[3] * 3 / 128) + 1
    local function colour_of (v)
        if scheme == 2 then return T.title end
        if scheme == 3 then return T.stage end
        return T.kinds[D.kind[v]]
    end
    -- where the bar is: the section, and the bars left in it
    local start, cur, left = 0, 1, 0
    for k = 1, #song.sections do
        local b = song.sections[k][2]
        if at >= start and at < start + b then cur, left = k, start + b - at end
        start = start + b
    end
    local v = song.sections[cur][1]
    accent = colour_of(v)
    local plain = T.title
    if scheme == 3 then plain = T.stage end
    backdrop()
    word("stage", L.title[1], L.title[2] + 1, plain, 0)
    local x = L.lright
    x = x - number(#songs, "small", x, L.title[2] + 3, T.head) - 4
    x = x - word("slash", x, L.title[2] + 3, T.head, 2) - 4
    number(si, "small", x, L.title[2] + 3, T.head)
    word(song.big, L.lname[1], L.lname[2], plain, 0)
    word(song.meta, L.lname[1], L.lmeta, T.label, 0)
    -- the section card: its name, the beat, the bars left
    local cx, cy = L.lcard[1], L.lcard[2]
    word(D.vocab[v] .. "B", cx, cy, accent, 0)
    local beat = floor(seconds() * song.bpm / 60) % 4
    for k = 0, 3 do
        local c = T.dot_off
        if k == beat then c = accent end
        tint("dot_big", cx + k * 14, L.lbeat, c)
    end
    number(left, "big", L.lbars[1], L.lbars[2], accent)
    if left == 1 then word("barleft", L.lbars[1] + 6, L.lbars[3], T.label, 0)
    else word("barsleft", L.lbars[1] + 6, L.lbars[3], T.label, 0) end
    -- the song's form: every section, the one you are in lit, its name under it where it fits
    local tx, ty, tw, th = L.lform[1], L.lform[2], L.lform[3], L.lform[4]
    start = 0
    for k = 1, #song.sections do
        local sv, b = song.sections[k][1], song.sections[k][2]
        local x0, x1 = tx + floor(start * tw / total), tx + floor((start + b) * tw / total)
        local c = T.raised
        if k < cur then c = T.bar elseif k == cur then c = accent end
        draw_rect(x0, ty, x1 - x0 - 1, th, c)
        local name = D.vocab[sv] .. "S"
        if S[name][3] + 4 <= x1 - x0 then
            local nc = T.dim
            if k == cur then nc = accent end
            word(name, x0 + floor((x1 - x0) / 2), ty + th + 3, nc, 1)
        end
        start = start + b
    end
    draw_rect(tx + floor(at * tw / total), ty - 3, 2, th + 6, plain)
    -- and the song after this one
    local nx = L.lname[1] + word("nextsong", L.lname[1], L.lnext + 3, T.dim, 0) + 8
    word(after.small, nx, L.lnext, T.label, 0)
end

-- --- page 3: levels -------------------------------------------------------------------------------------

local HISTORY = 48
local function gain_of (v)
    if v == 0 then return nil end
    if v >= 104 then return (v - 104) * 6 / 23 end
    return (v - 104) * 40 / 104
end
local function gain_text (v)
    local g = gain_of(v)
    if g == nil then return "OFF" end
    return signed_tenths(g) .. " dB"
end

local function answers (p, note, velocity)
    return note >= p.lo and note <= p.hi and velocity >= p.vlo and velocity <= p.vhi
end

-- A part's level at a beat (dB, before its fader): what it plays, each note from its velocity
-- down by the part's decay to its sustain, then its release; more notes at once a little louder.
local function level (p, beat)
    local b = beat % D.loop_beats
    local best, count = -90, 0
    for k = 1, #D.play do
        local ev = D.play[k]
        if answers(p, ev[3], ev[4]) then
            local t = b - ev[1]
            if t < 0 then t = t + D.loop_beats end
            local peak = -20 + ev[4] * 12 / 127
            local sus = peak - t * p.decay
            if sus < peak - p.drop then sus = peak - p.drop end
            local lvl = -90
            if t < ev[2] then lvl = sus
            elseif t < ev[2] + p.rel then
                local at_end = peak - ev[2] * p.decay
                if at_end < peak - p.drop then at_end = peak - p.drop end
                lvl = at_end - (t - ev[2]) * 40 / p.rel
            end
            if lvl > best then best = lvl end
            if lvl > -40 then count = count + 1 end
        end
    end
    if count > 1 then best = best + (count - 1) * 1.5 end
    return best
end

local function meter_h (db)
    return clamp(floor((db + 48) * L.meter[4] / 54), 0, L.meter[4])
end

local function draw_meters ()
    local e = seen[P_METERS + 1]
    local parts = D.meter_parts
    local n = #parts
    -- every part's level now and every other frame back, after its fader; the master from them
    local lv, master = {}, {}
    for i = 0, HISTORY - 1 do
        local f = frame - i * 2
        local beat = f / L.fps * D.play_bpm / 60 + D.play_offset
        local top, near = -90, 0
        for k = 1, n do
            if i == 0 then lv[k] = {} end
            local g = gain_of(e[k])
            local l = -90
            if g ~= nil then l = level(parts[k], beat) + g end
            lv[k][i] = l
            if l > top then top = l end
        end
        for k = 1, n do if lv[k][i] > top - 6 and lv[k][i] > -60 then near = near + 1 end end
        if near > 1 then top = top + (near - 1) * 1.5 end
        local g = gain_of(e[n + 1])
        if g == nil then master[i] = -90 else master[i] = top + g end
    end
    local loudest, peak = 1, -90
    for k = 1, n do
        if lv[k][0] > peak then loudest, peak = k, lv[k][0] end
    end
    accent = parts[loudest].colour
    local head = "NOTHING PLAYING"
    if peak > -60 then head = "LOUDEST " .. parts[loudest].name .. "   " .. signed_tenths(peak) .. " dB" end
    chrome(T.titles[4], head, "THE RACK'S OWN METERS, 15 TIMES A SECOND")
    local mx, my, step, mh = L.meter[1], L.meter[2], L.meter[3], L.meter[4]
    local labels, values = {}, {}
    for k = 1, n + 1 do
        local x = L.strips[1] + (k - 1) * L.strips[3]
        local name, colour, now, hold = "MASTER", T.title, master[0], -90
        if k <= n then name, colour, now = parts[k].short, parts[k].colour, lv[k][0] end
        local clip = false
        for i = 0, 14 do
            local l = master[i]
            if k <= n then l = lv[k][i] end
            if l > hold then hold = l end
            if l > 0 then clip = true end
        end
        say(X.small, name, focus_colour(k, T.label), x, L.strips[2], L.strips[4], 11)
        if clip then draw_rect(x + mx, my - 8, 2 * step - 2, 4, T.bad) end
        -- left and right: the part's pan, and a little difference that moves
        for side = 0, 1 do
            local l = now + D.pan[k][side + 1] + (hash(frame + side * 7, k) % 5 - 2) * 0.3
            local h = meter_h(l)
            local c = colour
            if l > 0 then c = T.bad end
            if h > 0 then draw_rect(x + mx + side * step, my + mh - h, step - 2, h, c) end
        end
        local hh = meter_h(hold)
        if hh > 0 then draw_rect(x + mx, my + mh - hh, 2 * step - 2, 2, T.title) end
        -- where the fader is, on the meter's scale
        local g = gain_of(e[k])
        if g ~= nil then draw_rect(x + mx + 2 * step, my + mh - meter_h(g) - 1, 5, 3, focus_colour(k, T.ring)) end
        local text = "-INF"
        if hold > -60 then text = signed_tenths(hold) end
        say(X.small, text, T.value, x, my + mh + 4, L.strips[4], 12)
        labels[k], values[k] = name, gain_text(e[k])
    end
    -- the master's last six seconds, oldest on the left
    local hx = L.hist[1]
    say(X.tag9, "MASTER, LAST 6 s", T.label, hx, L.strips[2], L.hist[2], 11)
    for i = HISTORY - 1, 0, -1 do
        local h = meter_h(master[i])
        if h > 0 then
            local x = hx + (HISTORY - 1 - i) * 2
            draw_rect(x, my + mh - h, 2, h, T.spec_in)
            draw_rect(x, my + mh - h, 2, 2, master[i] > 0 and T.bad or T.title)
        end
    end
    cells(labels, values)
end

-- --- what the keyboard is being asked to do ------------------------------------------------------

-- For the stress test, in the corner beside the page dots: the draw calls this redraw made, the
-- Lua heap in KB (collectgarbage), and the firmware's own mem_usage(0) where it has one. The
-- preview hides it (CTRL49_PREVIEW): its numbers would be the browser's, not the keyboard's.
local calls, heap, device = 0, -1, -1
local function counting (f)
    return function (...)
        calls = calls + 1
        return f(...)
    end
end
local function diagnostics ()
    if CTRL49_PREVIEW then return end
    if draws % 15 == 0 or heap < 0 then
        if type(collectgarbage) == "function" then heap = collectgarbage("count") end
        if type(mem_usage) == "function" and type(pcall) == "function" then
            local ok, v = pcall(mem_usage, 0)
            if ok and type(v) == "number" then device = v end
        end
    end
    local s = whole(calls) .. "   " .. whole(heap) .. "K"
    if device >= 0 then s = s .. "   " .. whole(device) end
    say(X.diag, s, T.dim, L.diag[1], L.diag[2], L.diag[3], L.diag[4])
end

-- --- what the host sends -------------------------------------------------------------------------

local function nothing (b, n) end
local TURN = { turn_live, nothing, nothing, nothing }

function init (args)
    if ready then return end
    for k = 1, #T.roles do
        local role = T.roles[k]
        X[role] = textbox(T.fonts[role], T.aligns[role])
    end
    for k = 1, #D.steps do
        local q = D.steps[k]
        steps[k] = { q[1], q[2], q[3], q[4] }
    end
    for p = 1, L.pages do
        seen[p] = {}
        for i = 1, 8 do seen[p][i] = L.defaults[p][i] end
    end
    for i = 1, 8 do enc[i] = seen[1][i] end
    draw_rect, draw_image, draw_text = counting(draw_rect), counting(draw_image), counting(draw_text)
    ready = true
end

function set_mode (args)
    local m = get_byte(args, 0)
    if m == nil then m = 1 end
    mode = m
end

function set_frame (args)
    page = clamp(get_byte(args, 0), 0, L.pages - 1)
    frame = get_byte(args, 1) + get_byte(args, 15) * 256
    for i = 1, 8 do enc[i] = clamp(get_byte(args, 1 + i), 0, 127) end
    last = get_byte(args, 10)
    if ready then
        local before = seen[page + 1]
        local moved = false
        for i = 1, 8 do if enc[i] ~= before[i] then moved = true end end
        if moved then TURN[page + 1](before, enc) end
        for i = 1, 8 do seen[page + 1][i] = enc[i] end
    end
    framed = true
end

function set_envelope (args) end

-- --- the loading screen and draw -----------------------------------------------------------------

local function loading ()
    draw_rect(0, 0, 480, 272, T.load_bg)
    say(X.name, T.name, T.title, 0, 96, 480, 30)
    say(X.label, "LOADING  " .. whole(loaded) .. " / 3", T.label, 0, 132, 480, 16)
    draw_rect(150, 160, 180, 4, T.track)
    if loaded > 0 then draw_rect(150, 160, floor(180 * loaded / 3), 4, T.load_bar) end
end

local PAGES = { draw_live, draw_section, draw_labels, draw_meters }

-- The first redraw shows the loading screen; each of the next three decodes one atlas, so no
-- single redraw blocks the keyboard for long. The atlases are decoded once and kept.
function draw (args)
    if not ready then init("") end
    draws = draws + 1
    if loaded < 3 then
        if draws > 1 then
            local a = ATLAS_PNGS[loaded + 1]
            decode_image(PNG, a[1], BUF, a[2], WHITE)
            loaded = loaded + 1
        end
        loading()
        return
    end
    if mode ~= 1 and not framed then
        loading()
        return
    end
    calls = 0
    PAGES[page + 1]()
    diagnostics()
end
