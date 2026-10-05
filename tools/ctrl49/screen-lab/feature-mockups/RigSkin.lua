-- CTRL49 screen lab: five more HoSTage pages, about the rig, as mockups. One preset, five pages:
--
--   0 LAYERS      which sound is where: every part's key range as a band over the 49 keys, its
--                 velocity range and transpose, the splits, and the parts that answer each note
--                 as it is played. E1 picks the part, E2-E6 edit its range.
--   1 EFFECTS     what every effect is doing: the part's insert chain, and for every slot the
--                 same five measurements taken from what goes in and what comes out (gain,
--                 tone, squash, width, tail), whatever the plug-in is. E1 picks the slot, E2-E5
--                 are its four controls, E6 bypasses it.
--   2 SOUNDCHECK  the setlist checked before the show: every song ready, worth a look, or not
--                 going to play, and for a part with a problem what is wrong and what to do.
--                 E1 picks the song, E2 the part, E3 checks again.
--   3 DISCOVER    what you own and have never opened, nearest first to what you keep loading.
--                 E1 picks one, E2 reaches further out, E3 filters by kind, E4 keeps it.
--   4 CHANGES     the sound against its saved version: every parameter you changed, A/B and
--                 anywhere between, one change at a time undone, and the edit history. E1
--                 listens between saved and now, E2 picks a change, E3 reverts it, E4 walks back.
--
-- The screen takes the colour of the part picked on LAYERS: the colour of its sound's measured
-- brightness, as on the first mockups' atlas.
--
-- These are mockups: the lab has no rack, no plug-ins, no setlist and no library, so the parts,
-- the chain, the songs, the sounds and the edits are data the generator wrote into this page,
-- and the playing and the audio are simulated from the frame counter. The README says, page by
-- page, what HoSTage would send instead.
--
-- This file is the template. make_rig_mockups.py writes the design's Skin.lua from it, replacing
-- only the GENERATED block. Never hand-edit Skin.lua. No math library is assumed; every number
-- shown goes through whole() so Lua 5.2 on the keyboard and the 5.4 preview agree.

-- BEGIN GENERATED (make_rig_mockups.py writes this block)
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
local P_LAYERS, P_EFFECTS, P_CHECK, P_DISCOVER, P_CHANGES = 0, 1, 2, 3, 4

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
local function thousands (n)
    local s = whole(n)
    if #s > 3 then s = s:sub(1, -4) .. "," .. s:sub(-3) end
    return s
end

-- --- state ---------------------------------------------------------------------------------------

local mode, ready, loaded, draws, framed = 0, false, 0, 0, false
local page, frame, last = 0, 0, -1
local enc = { 0, 0, 0, 0, 0, 0, 0, 0 }
local seen = {}             -- every page's encoders as last seen (the manifest's until then)
local accent = WHITE        -- the focused part's colour
local bannerFrame, bannerText = -1000, ""

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

local function outline (x, y, w, h, c)
    draw_rect(x, y, w, 1, c)
    draw_rect(x, y + h - 1, w, 1, c)
    draw_rect(x, y, 1, h, c)
    draw_rect(x + w - 1, y, 1, h, c)
end

local function chrome (title, right, hint)
    draw_image(BUF, L.bg[page + 1][1], 0, 0, 0, L.bg[page + 1][2], 480, 272, WHITE)
    draw_rect(L.bar[1], L.bar[2], L.bar[3], L.bar[4], accent)
    say(X.title, title, T.title, L.title[1], L.title[2], L.title[3], L.title[4])
    say(X.head, right, T.head, L.head[1], L.head[2], L.head[3], L.head[4])
    say(X.foot, hint, T.foot, L.foot[1], L.foot[2], L.foot[3], L.foot[4])
    for i = 0, L.pages - 1 do
        local c = T.dot_off
        if i == page then c = accent end
        draw_rect(L.dots[1] + i * L.dots[3], L.dots[2], L.dots[4], L.dots[5], c)
    end
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

local function banner (y)
    if frame - bannerFrame >= 0 and frame - bannerFrame < 30 then
        draw_rect(40, y, 400, 30, accent)
        say(X.banner, bannerText, T.on_accent, 40, y, 400, 30)
    end
end

local function seconds () return frame / L.fps end

-- --- editing with absolute encoders -----------------------------------------------------------------

-- The host keeps each encoder's absolute position and stops it at 0 and 127, so an encoder cannot
-- simply nudge a value it does not own. Like a fader without a motor, it takes a value over only
-- once it reaches it; until then the value stays where it is and its cell shows it dim. Picking
-- another part or slot lets go of everything held.
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

-- --- the parts, and the colour of the focused one --------------------------------------------------

local parts = {}
local function part_of (v) return floor(v * #parts / 128) + 1 end
local function focused ()
    local k = part_of(seen[P_LAYERS + 1][1])
    accent = parts[k].colour
    return k, parts[k]
end

-- --- page 0: layers and splits ----------------------------------------------------------------------

local WHITE_OF = { 0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6 }
local function is_black (pc) return pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10 end
local function note_of (v) return 36 + floor(v * 48 / 127 + 0.5) end
local function vel_of (v) return 1 + floor(v * 126 / 127 + 0.5) end
local function tr_of (v) return floor(v * 48 / 127 + 0.5) - 24 end
local function note_name (n) return D.notes[n % 12 + 1] .. whole(floor(n / 12) - 1) end

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

local function answers (p, note, velocity)
    return note >= p.lo and note <= p.hi and velocity >= p.vlo and velocity <= p.vhi
end

-- What is being played at a beat: the events of a four-bar loop sounding then.
local function sounding (beat)
    local b = beat % D.loop_beats
    local out = {}
    for k = 1, #D.play do
        local e = D.play[k]
        if b >= e[1] and b < e[1] + e[2] then out[#out + 1] = e end
    end
    return out
end

local function turn_layers (b, n)
    local k = part_of(n[1])
    if k ~= part_of(b[1]) then let_go() end
    local p = parts[k]
    p.lo = clamp(pick_up(k .. "lo", p.lo, note_of, b[2], n[2]), 36, p.hi)
    p.hi = clamp(pick_up(k .. "hi", p.hi, note_of, b[3], n[3]), p.lo, 84)
    p.tr = pick_up(k .. "tr", p.tr, tr_of, b[4], n[4])
    p.vlo = clamp(pick_up(k .. "vlo", p.vlo, vel_of, b[5], n[5]), 1, p.vhi)
    p.vhi = clamp(pick_up(k .. "vhi", p.vhi, vel_of, b[6], n[6]), p.vlo, 127)
end

local function draw_layers ()
    local e = seen[P_LAYERS + 1]
    local focus, fp = focused()
    local notes = sounding(seconds() * D.play_bpm / 60 + D.play_offset)
    -- the splits (a part ending where another begins) and how deep the layers go
    local splits, first, deepest = 0, 36, 0
    for n = 36, 84 do
        local deep, ends, starts = 0, false, false
        for k = 1, #parts do
            local p = parts[k]
            if n >= p.lo and n <= p.hi then deep = deep + 1 end
            if p.hi == n - 1 then ends = true end
            if p.lo == n then starts = true end
        end
        if deep > deepest then deepest = deep end
        if ends and starts then
            splits = splits + 1
            if splits == 1 then first = n end
        end
    end
    local head = "NO SPLIT"
    if splits == 1 then head = "SPLIT AT " .. note_name(first)
    elseif splits > 1 then head = whole(splits) .. " SPLITS" end
    head = head .. "   " .. whole(deepest) .. " DEEP"
    if #notes > 0 then head = head .. "   VEL " .. whole(notes[#notes][4]) end
    chrome(T.titles[1], head, "PLAY: EVERY PART THAT ANSWERS LIGHTS UP   E1 PART")
    -- a line at every split, through the rows down to the keys
    for n = 37, 84 do
        local ends, starts = false, false
        for k = 1, #parts do
            if parts[k].hi == n - 1 then ends = true end
            if parts[k].lo == n then starts = true end
        end
        if ends and starts then draw_rect(key_x(n) - 1, L.rows[2], 2, L.kb[2] - L.rows[2] - 2, T.split) end
    end
    local rx, ry, rw, rh = L.rows[1], L.rows[2], L.rows[3], L.rows[4]
    for k = 1, #parts do
        local p = parts[k]
        local y = ry + (k - 1) * rh
        if k == focus then outline(rx, y, rw, rh - 1, accent) end
        local x, w = span(p.lo, p.hi)
        draw_rect(x, y + 3, w, rh - 7, p.dim)
        draw_rect(x, y + rh - 6, w, 2, p.colour)
        for j = 1, #notes do
            local m = notes[j]
            if answers(p, m[3], m[4]) then
                local kx, kw = key_x(m[3])
                draw_rect(kx, y + rh - 10, kw, 6, p.colour)
            end
        end
        local text = p.name
        if p.vlo > 1 or p.vhi < 127 then text = text .. "   VEL " .. whole(p.vlo) .. "-" .. whole(p.vhi) end
        if p.tr ~= 0 then text = text .. "   " .. signed(p.tr) end
        -- the name in the band when it fits (about 6 px a character), else just before it
        local c = T.label
        if k == focus then c = T.title end
        if w < #text * 6 + 8 and x - 178 >= rx then
            say(X.tagr, text, c, x - 174, y + 2, 170, 12)
        else
            local tx = x + 4
            if tx > rx + rw - 174 and w >= #text * 6 + 8 then
                say(X.tag, text, c, tx, y + 2, rx + rw - tx, 12)
            else
                if tx > rx + rw - 174 then tx = rx + rw - 174 end
                say(X.tag, text, c, tx, y + 2, 170, 12)
            end
        end
    end
    -- where E2 or E3 is, while it has not reached the range's end yet
    local fy = ry + (focus - 1) * rh
    for i = 2, 3 do
        local key = focus .. (i == 2 and "lo" or "hi")
        local v = fp.lo
        if i == 3 then v = fp.hi end
        if last == i - 1 and waiting(key, v, note_of, e[i]) then
            local gx, gw = key_x(note_of(e[i]))
            outline(gx, fy + 2, gw, rh - 5, T.ghost)
        end
    end
    -- the keyboard: a key held lights in the colour of the part that answers it (the focused
    -- part first), grey when no part does
    local kx, ky = L.kb[1], L.kb[2]
    for pass = 1, 2 do
        for j = 1, #notes do
            local m = notes[j]
            local n = m[3]
            local pc = n % 12
            if (pass == 2) == is_black(pc) then
                local c = T.dead
                for k = #parts, 1, -1 do
                    if answers(parts[k], n, m[4]) then c = parts[k].colour end
                end
                if answers(fp, n, m[4]) then c = fp.colour end
                local x = key_x(n)
                if is_black(pc) then tint("key_black", x, ky, c)
                elseif n == 84 then tint("key_full", x, ky, c)
                elseif pc == 0 or pc == 5 then tint("key_c", x, ky, c)
                elseif pc == 4 or pc == 11 then tint("key_e", x, ky, c)
                else tint("key_d", x, ky, c) end
            end
        end
    end
    local dims = { false, waiting(focus .. "lo", fp.lo, note_of, e[2]), waiting(focus .. "hi", fp.hi, note_of, e[3]),
                   waiting(focus .. "tr", fp.tr, tr_of, e[4]), waiting(focus .. "vlo", fp.vlo, vel_of, e[5]),
                   waiting(focus .. "vhi", fp.vhi, vel_of, e[6]) }
    cells({ "PART", "LOW", "HIGH", "TRANSP", "VEL LOW", "VEL HIGH" },
          { whole(focus) .. " / " .. whole(#parts), note_name(fp.lo), note_name(fp.hi), signed(fp.tr),
            whole(fp.vlo), whole(fp.vhi) }, dims)
end

-- --- page 1: what every effect is doing -----------------------------------------------------------------

local slots = {}
local SPEC_N, TIME_N, HIST = 36, 70, 48
local MEASURES = { "GAIN", "TONE", "SQUASH", "WIDTH", "TAIL" }
local SCALE = { 12, 12, 12, 100, 4 }

local function slot_of (v) return floor(v * #slots / 128) + 1 end
local function ramp (x, a, b)
    if x <= a then return 0 end
    if x >= b then return 1 end
    return (x - a) / (b - a)
end
local function db12 (v) return (v - 64) * 12 / 63 end
local function pct (v) return floor(v * 100 / 127 + 0.5) end

-- What a slot does to each band of the spectrum, in dB, from its four controls.
local function transfer (s, band)
    if s.bypass then return 0 end
    local p = s.p
    if s.kind == "eq" then
        local m = (band - 18) / 7
        local g = (1 - ramp(band, 4, 10)) * db12(p[1]) + ramp(band, 22, 30) * db12(p[3])
                  + ramp(band, 30, 35) * db12(p[4])
        if m * m < 1 then g = g + (1 - m * m) * db12(p[2]) end
        return g
    elseif s.kind == "delay" then
        return -ramp(band, 20, 35) * (127 - p[3]) * 6 / 127 * p[4] / 127
    elseif s.kind == "reverb" then
        return -ramp(band, 18, 35) * p[3] * 8 / 127 * p[4] / 127
    end
    return 0
end

-- The level of what the part plays, column by column (16 a second, dB): a hit on every beat,
-- louder on the bar, and a floor of sustained sound under it.
local function program (c)
    local beat = floor(c / 8)
    local peak = -11 + hash(beat, 41) % 5
    if beat % 4 == 0 then peak = -3 end
    local v = peak - (c % 8) * 4
    local low = -40 + hash(c, 43) % 4
    if v < low then v = low end
    return v
end

-- A slot's output level from its input level, column by column, and what it did to the dry
-- signal (the gain it applied, which a compressor changes from moment to moment). All in dB:
-- where the dry signal and an echo or a tail add, the louder one stands for the sum.
local function run (s, inT)
    local out, dry, n, p = {}, {}, #inT, s.p
    local g = 0
    if s.bypass then
        g = 0
    elseif s.kind == "eq" then
        for band = 0, SPEC_N - 1 do g = g + transfer(s, band) end
        g = g / SPEC_N
    elseif s.kind == "chorus" then
        g = p[4] * 1.5 / 127
    end
    for j = 1, n do out[j], dry[j] = inT[j] + g, g end
    if s.bypass then return out, dry end
    if s.kind == "comp" then
        local thr, ratio = -40 + p[1] * 40 / 127, 1 + p[2] * 19 / 127
        local att, rel = 1 - p[3] * 0.9 / 127, 0.04 + (127 - p[4]) * 0.5 / 127
        local gr, makeup = 0, -thr * (1 - 1 / ratio) / 2      -- automatic make-up gain
        for j = 1, n do
            local want = inT[j] - thr
            if want < 0 then want = 0 end
            want = want * (1 - 1 / ratio)
            if want > gr then gr = gr + (want - gr) * att else gr = gr + (want - gr) * rel end
            dry[j] = makeup - gr
            out[j] = inT[j] + dry[j]
        end
    elseif s.kind == "delay" then
        local d = clamp(floor((40 + p[1] * 960 / 127) * 16 / 1000 + 0.5), 1, 16)
        local fb, mix = -(3 + (127 - p[2]) * 30 / 127), -(1 + (127 - p[4]) * 30 / 127)
        local wet = {}
        for j = 1, n do
            local w = -120
            if j > d then
                w = inT[j - d] + mix
                if wet[j - d] + fb > w then w = wet[j - d] + fb end
            end
            wet[j] = w
            if w > out[j] then out[j] = w end
        end
    elseif s.kind == "reverb" then
        local fall = 60 / ((0.3 + p[2] * 5.7 / 127) * 16)
        local mix = -(4 + (127 - p[4]) * 30 / 127)
        local w = -120
        for j = 1, n do
            w = w - fall
            if inT[j] + mix > w then w = inT[j] + mix end
            if w > out[j] then out[j] = w end
        end
    end
    return out, dry
end

-- The five things measured of every slot: how much louder or quieter it makes the part, how much
-- brighter or darker, how far it brings the loudest moments down towards the rest, how much
-- wider, and how long it rings on. HoSTage would take them from the plug-in's real input and
-- output; the mockup works them out from the simulated signal and the slot's controls.
local function measure (s, inT, dry)
    local n, peak = #inT, -120
    for j = n - TIME_N + 1, n do if inT[j] > peak then peak = inT[j] end end
    local all, hit, hits, quiet, quiets = 0, 0, 0, 0, 0
    for j = n - TIME_N + 1, n do
        all = all + dry[j]
        if inT[j] >= peak - 6 then hit, hits = hit + dry[j], hits + 1 end
        if inT[j] < peak - 18 then quiet, quiets = quiet + dry[j], quiets + 1 end
    end
    local squash = 0
    if quiets > 0 then squash = quiet / quiets - hit / hits end
    local lo, hi = 0, 0
    for band = 0, SPEC_N - 1 do
        if band < SPEC_N / 2 then lo = lo + transfer(s, band) else hi = hi + transfer(s, band) end
    end
    local tone = (hi - lo) / (SPEC_N / 2)
    local width, tail, p = 0, 0, s.p
    if not s.bypass then
        if s.kind == "chorus" then width = p[2] * p[4] * 100 / (127 * 127) + p[3] * 40 / 127
        elseif s.kind == "delay" then
            width = p[4] * 30 / 127
            tail = (40 + p[1] * 960 / 127) / 1000 * 60 / (3 + (127 - p[2]) * 30 / 127)
        elseif s.kind == "reverb" then
            width = p[1] * p[4] * 70 / (127 * 127)
            tail = (0.3 + p[2] * 5.7 / 127) * (0.4 + p[4] * 0.6 / 127)
        end
    end
    return { all / TIME_N, tone, squash, width, tail }
end

local function measure_text (j, v)
    if j == 4 then return whole(v) .. "%" end
    if j == 5 then return tenths(v) .. " s" end
    if j == 3 then return tenths(v) .. " dB" end
    return signed_tenths(v) .. " dB"
end

local function param_text (s, j)
    local v, k = s.p[j], s.kind
    if k == "eq" then return signed(floor(db12(v) + 0.5)) .. " dB" end
    if k == "comp" then
        if j == 1 then return whole(-40 + v * 40 / 127) .. " dB" end
        if j == 2 then return tenths(1 + v * 19 / 127) .. ":1" end
        if j == 3 then return whole(1 + v * 99 / 127) .. " ms" end
        return whole(20 + v * 980 / 127) .. " ms"
    end
    if k == "chorus" and j == 1 then return tenths(0.1 + v * 4.9 / 127) .. " Hz" end
    if k == "delay" and j == 1 then return whole(40 + v * 960 / 127) .. " ms" end
    if k == "reverb" and j == 2 then return tenths(0.3 + v * 5.7 / 127) .. " s" end
    return whole(pct(v)) .. "%"
end

local function turn_effects (b, n)
    local k = slot_of(n[1])
    if k ~= slot_of(b[1]) then let_go() end
    local s = slots[k]
    for j = 1, 4 do s.p[j] = pick_up(k .. ":" .. j, s.p[j], same, b[j + 1], n[j + 1]) end
    if n[6] ~= b[6] then s.bypass = not s.bypass end
end

local function draw_effects ()
    local e = seen[P_EFFECTS + 1]
    local focus, fp = focused()
    local sel = slot_of(e[1])
    -- the chain, run: every slot's input and output, its measurements, and the spectrum after it
    local now = floor(seconds() * 16)
    local trace = {}
    for j = 1, TIME_N + HIST do trace[j] = program(now - TIME_N - HIST + j) end
    local spec = {}
    for band = 1, SPEC_N do spec[band] = D.spectrum[band] end
    local M, inSel, outSel, specIn, specOut = {}, nil, nil, nil, nil
    for k = 1, #slots do
        local s = slots[k]
        local out, dry = run(s, trace)
        M[k] = measure(s, trace, dry)
        local after = {}
        local shift = 0
        if s.kind == "comp" and not s.bypass then shift = M[k][1] end
        for band = 1, SPEC_N do after[band] = spec[band] + transfer(s, band - 1) + shift end
        if k == sel then inSel, outSel, specIn, specOut = trace, out, spec, after end
        trace, spec = out, after
    end
    chrome(T.titles[2], fp.name .. "   " .. whole(#slots) .. " EFFECTS", "EVERY PLUG-IN MEASURED BY WHAT IT DOES")
    -- the cards: five measurements each, as bars from a centre line
    local cx, cy, step, cw, ch = L.cards[1], L.cards[2], L.cards[3], L.cards[4], L.cards[5]
    for k = 1, #slots do
        local s = slots[k]
        local x = cx + (k - 1) * step
        if k == sel then outline(x, cy, cw, ch, accent) end
        local nameColour = T.label
        if k == sel then nameColour = T.title end
        if s.bypass then nameColour = T.dim end
        say(X.tag9, whole(k) .. "  " .. s.name, nameColour, x + 6, cy + 4, cw - 12, 12)
        if s.bypass then
            say(X.small, "BYPASSED", T.dim, x, cy + 22, cw, 14)
        else
            local most, best = 0, 0
            for j = 1, 5 do
                local v = clamp(M[k][j] / SCALE[j], -1, 1)
                local h = floor(v * 13 + 0.5)
                local c = T.mini_visible
                if k == sel then c = accent end
                local bx = x + 7 + (j - 1) * 15
                if h > 0 then draw_rect(bx, cy + L.card_mid - h, 12, h, c)
                elseif h < 0 then draw_rect(bx, cy + L.card_mid + 1, 12, -h, c) end
                if v * v > most then most, best = v * v, j end
            end
            local headline = "LEAVES IT ALONE"
            if most > 0.0025 then headline = MEASURES[best] .. " " .. measure_text(best, M[k][best]) end
            say(X.small, headline, k == sel and T.value or T.label, x, cy + ch - 15, cw, 12)
        end
    end
    -- the selected slot, in and out: the spectrum, the level over the last four seconds, and the
    -- five measurements in full
    local sx, sy, sw, sh = L.spec[1], L.spec[2], L.spec[3], L.spec[4]
    local function spec_y (db) return sy + sh - 1 - clamp(floor((db + 60) * sh / 60), 0, sh - 1) end
    say(X.tag9, "TONE   IN (GREY), OUT", T.label, sx, sy - 16, sw, 12)
    say(X.tag9, "LEVEL   LAST 4 SECONDS", T.label, L.time[1], L.time[2] - 16, L.time[3], 12)
    -- every band in full; every L.spec_step-th, wider, when slimmed (and the level likewise)
    local step = L.spec_step
    for band = 1, SPEC_N, step do
        local x = sx + (band - 1) * 4
        local yi = spec_y(specIn[band])
        draw_rect(x, yi, 4 * step - 1, sy + sh - yi, T.spec_in)
        draw_rect(x, spec_y(specOut[band]), 4 * step - 1, 2, accent)
    end
    local tx, ty, th = L.time[1], L.time[2], L.time[4]
    local function time_y (db) return ty + th - 1 - clamp(floor((db + 48) * th / 48), 0, th - 1) end
    local n = #inSel
    step = L.time_step
    for j = step, TIME_N, step do
        local x = tx + (j - step) * 2
        local yi = time_y(inSel[n - TIME_N + j])
        draw_rect(x, yi, 2 * step, ty + th - yi, T.spec_in)
        draw_rect(x, time_y(outSel[n - TIME_N + j]), 2 * step, 2, accent)
    end
    local m = M[sel]
    for j = 1, 5 do
        local y = L.meas[2] + (j - 1) * L.meas[3]
        say(X.label9, MEASURES[j], T.label, L.meas[1], y, 48, 12)
        local v = clamp(m[j] / SCALE[j], -1, 1)
        if slots[sel].bypass then v = 0 end
        local w = floor(v * L.meas[5] + 0.5)
        if w > 0 then draw_rect(L.meas[4], y + 4, w, 5, accent)
        elseif w < 0 then draw_rect(L.meas[4] + w, y + 4, -w, 5, accent) end
        local text = measure_text(j, m[j])
        if slots[sel].bypass then text = "-" end
        say(X.tagr, text, T.value, L.meas[6], y, 44, 12)
    end
    local s = slots[sel]
    local dims = { false }
    for j = 1, 4 do dims[j + 1] = waiting(sel .. ":" .. j, s.p[j], same, e[j + 1]) end
    local labels = { "SLOT", D.labels[s.kind][1], D.labels[s.kind][2], D.labels[s.kind][3], D.labels[s.kind][4], "BYPASS" }
    local bypass = "OFF"
    if s.bypass then bypass = "ON" end
    cells(labels, { whole(sel) .. " / " .. whole(#slots), param_text(s, 1), param_text(s, 2), param_text(s, 3),
                    param_text(s, 4), bypass }, dims)
end

-- --- page 2: soundcheck -------------------------------------------------------------------------------

local scanFrom = -1000
local MARKS = { "ok", "warn", "bad" }

local function song_status (song)
    local worst = 1
    for k = 1, #song[3] do if song[3][k][3] > worst then worst = song[3][k][3] end end
    return worst
end

local function turn_check (b, n)
    if n[3] ~= b[3] then scanFrom = frame end
end

local function draw_check ()
    focused()
    local e = seen[P_CHECK + 1]
    local set = D.set
    local songs = #set
    local sel = floor(e[1] * songs / 128) + 1
    local song = set[sel]
    local part = clamp(floor(e[2] * #song[3] / 128) + 1, 1, #song[3])
    local checked = songs
    if frame >= scanFrom then checked = clamp(floor((frame - scanFrom) / 5), 0, songs) end
    local count = { 0, 0, 0 }
    for k = 1, checked do count[song_status(set[k])] = count[song_status(set[k])] + 1 end
    local head = "ALL " .. whole(songs) .. " READY"
    if count[3] > 0 then head = whole(count[3]) .. " OF " .. whole(songs) .. " WILL NOT PLAY"
    elseif count[2] > 0 then head = whole(count[2]) .. " OF " .. whole(songs) .. " TO LOOK AT" end
    if checked < songs then head = "CHECKING" end
    chrome(T.titles[3], head, "E1 SONG   E2 PART   E3 CHECKS AGAIN")
    -- the summary, or the check running
    local colours = { T.ok, T.warn, T.bad }
    if checked < songs then
        say(X.tag, "CHECKING " .. whole(checked + 1) .. " OF " .. whole(songs), T.value, 14, 33, 140, 16)
        draw_rect(160, 39, 300, 4, T.track)
        draw_rect(160, 39, floor(300 * checked / songs), 4, accent)
    else
        local words = { " READY", " TO LOOK AT", " WILL NOT PLAY" }
        for k = 1, 3 do
            local x = 14 + (k - 1) * 150
            tint("dot_big", x, 37, colours[k])
            say(X.tag, whole(count[k]) .. words[k], count[k] > 0 and T.value or T.dim, x + 14, 33, 130, 16)
        end
    end
    -- the setlist
    local lx, ly, lw, lh = L.setlist[1], L.setlist[2], L.setlist[3], L.setlist[4]
    for k = 1, songs do
        local y = ly + (k - 1) * lh
        local s = set[k]
        if k == sel then draw_rect(lx, y, lw, lh - 1, T.raised) end
        say(X.small, whole(k), k == sel and accent or T.dim, lx, y, 18, lh - 1)
        say(X.tag, s[1], k <= checked and T.value or T.dim, lx + 20, y, 140, lh - 1)
        say(X.tagr, whole(s[2]), T.dim, lx + 150, y, 40, lh - 1)
        if k <= checked then
            tint(MARKS[song_status(s)], lx + lw - 18, y + 2, colours[song_status(s)])
        elseif k == checked + 1 and frame % 6 < 3 then
            tint("ring", lx + lw - 17, y + 3, accent)
        end
    end
    -- the song: its parts, each checked, and for the part picked what is wrong and what to do
    local dx, dy, dw = L.detail[1], L.detail[2], L.detail[3]
    say(X.song, song[1], T.title, dx, dy, dw, 22)
    say(X.tag, whole(song[2]) .. " BPM   " .. whole(#song[3]) .. " PARTS   " .. song[4], T.dim, dx, dy + 22, dw, 14)
    local done = sel <= checked
    for k = 1, #song[3] do
        local p = song[3][k]
        local y = L.detail_rows[1] + (k - 1) * L.detail_rows[2]
        if k == part then draw_rect(dx - 4, y, dw + 8, L.detail_rows[2] - 2, T.raised) end
        if done then tint(MARKS[p[3]], dx, y + 3, colours[p[3]]) end
        say(X.tag, p[1], k == part and T.title or T.value, dx + 16, y, 110, L.detail_rows[2] - 2)
        say(X.tagr, p[2], T.dim, dx + 120, y, dw - 120, L.detail_rows[2] - 2)
    end
    local p = song[3][part]
    local bx, by = L.fix[1], L.fix[2]
    if not done then
        say(X.tag, "NOT CHECKED YET", T.dim, bx + 6, by + 4, L.fix[3] - 12, 16)
    else
        local c = colours[p[3]]
        if p[3] == 1 then c = T.value end
        say(X.tag, p[4], c, bx + 6, by + 4, L.fix[3] - 12, 16)
        say(X.tag9, p[5], T.label, bx + 6, by + 22, L.fix[3] - 12, 14)
    end
end

-- --- page 3: what you have never played ----------------------------------------------------------------

local A64 = {}
local nx, ny, ncat, nplug = {}, {}, {}, {}
local neverRead = false
local kept = {}
local listKey, list = "", {}

local function read_never ()
    if neverRead then return end
    for i = 1, 64 do A64[D.alphabet:sub(i, i)] = i - 1 end
    local a = D.never
    for i = 1, D.never_count do
        local o = (i - 1) * 6
        nx[i] = A64[a:sub(o + 1, o + 1)] * 64 + A64[a:sub(o + 2, o + 2)]
        ny[i] = A64[a:sub(o + 3, o + 3)] * 64 + A64[a:sub(o + 4, o + 4)]
        ncat[i] = A64[a:sub(o + 5, o + 5)] + 1
        nplug[i] = A64[a:sub(o + 6, o + 6)] + 1
    end
    neverRead = true
end

local function dmap_x (v) return L.dmap[1] + floor(v * (L.dmap[3] - 1) / 4095) end
local function dmap_y (v) return L.dmap[2] + L.dmap[4] - 1 - floor(v * (L.dmap[4] - 1) / 4095) end

local function never_name (i)
    return D.adjectives[hash(i, 5) % #D.adjectives + 1] .. " " .. D.categories[ncat[i]] .. " " .. whole(hash(i, 9) % 97 + 1)
end

local function distance (i)
    local dx, dy = nx[i] - D.taste[1], ny[i] - D.taste[2]
    local d2 = dx * dx + dy * dy
    local r = 1
    while r * r < d2 do r = r * 2 end           -- a square root by halving, no math library
    local lo, hi = r / 2, r
    for k = 1, 12 do
        local mid = (lo + hi) / 2
        if mid * mid < d2 then lo = mid else hi = mid end
    end
    return hi
end

-- The eight on show: the never-opened sounds of the kind asked for, nearest first (the list is
-- written sorted), skipping as many as E2 reaches out.
local function listing (e)
    local kind = floor(e[3] * (#D.categories + 1) / 128)
    local skip = floor(e[2] * 60 / 127)
    local key = whole(kind) .. "," .. whole(skip)
    if key == listKey then return list, kind end
    listKey, list = key, {}
    for i = 1, D.never_count do
        if kind == 0 or ncat[i] == kind then
            if skip > 0 then skip = skip - 1
            elseif #list < 8 then list[#list + 1] = i end
        end
    end
    return list, kind
end

-- The sound you keep coming back to (ten loads or more) that this one is nearest.
local function like (i)
    local best, bd = 1, -1
    for k = 1, #D.played do
        local q = D.played[k]
        local dx, dy = nx[i] - q[1], ny[i] - q[2]
        local d = dx * dx + dy * dy
        if q[4] >= 10 and (bd < 0 or d < bd) then best, bd = k, d end
    end
    return D.played[best]
end

local function turn_discover (b, n)
    if n[4] ~= b[4] then
        read_never()
        local l = listing(n)
        local i = l[clamp(floor(n[1] * 8 / 128) + 1, 1, #l)]
        if i then
            kept[i] = not kept[i]
            bannerFrame = frame
            if kept[i] then bannerText = "KEPT " .. never_name(i) .. " IN FAVOURITES"
            else bannerText = never_name(i) .. " TAKEN OUT OF FAVOURITES" end
        end
    end
end

local function draw_discover ()
    focused()
    read_never()
    local e = seen[P_DISCOVER + 1]
    local l, kind = listing(e)
    local pick = clamp(floor(e[1] * 8 / 128) + 1, 1, 8)
    chrome(T.titles[4], thousands(D.never_total) .. " NEVER OPENED", "NEAREST TO WHAT YOU LOAD   PADS AUDITION")
    -- the map: everything never opened (faint), what you play (white) and your taste (the halo)
    -- are in the background; the eight on show are ringed, the one picked large
    local tx, ty = dmap_x(D.taste[1]), dmap_y(D.taste[2])
    say(X.small, "YOU", T.title, tx - 15, ty + 12, 30, 11)
    if #l > 0 then
        local r = distance(l[#l])
        local x0, x1 = dmap_x(clamp(D.taste[1] - r, 0, 4095)), dmap_x(clamp(D.taste[1] + r, 0, 4095))
        local y0, y1 = dmap_y(clamp(D.taste[2] + r, 0, 4095)), dmap_y(clamp(D.taste[2] - r, 0, 4095))
        outline(x0, y0, x1 - x0 + 1, y1 - y0 + 1, T.reach)
    end
    for k = 1, #l do
        local i = l[k]
        if k ~= pick then tint("ring", dmap_x(nx[i]) - 4, dmap_y(ny[i]) - 4, T.ring) end
    end
    local i = l[pick]
    if i then
        tint("ring_big", dmap_x(nx[i]) - 7, dmap_y(ny[i]) - 7, accent)
        if frame % 10 < 6 then tint("dot", dmap_x(nx[i]) - 2, dmap_y(ny[i]) - 2, accent) end
    end
    -- the list
    local lx, ly, lw, lh = L.dlist[1], L.dlist[2], L.dlist[3], L.dlist[4]
    for k = 1, 8 do
        local y = ly + (k - 1) * lh
        local j = l[k]
        if k == pick then draw_rect(lx, y, lw, lh - 1, T.raised) end
        say(X.small, whole(k), k == pick and accent or T.dim, lx, y, 16, lh - 1)
        if j then
            if kept[j] then tint("star", lx + 18, y + 3, accent) end
            say(X.tag, never_name(j), k == pick and T.title or T.value, lx + 32, y, 118, lh - 1)
            say(X.tagr9, D.plugins[nplug[j]], T.dim, lx + 152, y, 78, lh - 1)
            local sim = clamp(100 - floor(distance(j) * 100 / D.far), 0, 100)
            draw_rect(lx + 238, y + 7, 28, 3, T.track)
            local sw = floor(sim * 28 / 100)
            if sw > 0 then draw_rect(lx + 238, y + 7, sw, 3, k == pick and accent or T.mini_visible) end
        end
    end
    if i then
        local q = like(i)
        say(X.tag, never_name(i) .. "  IN  " .. D.plugins[nplug[i]], T.title, L.dnote[1], L.dnote[2], L.dnote[3], 14)
        say(X.tag9, "SOUNDS LIKE " .. q[3] .. ", LOADED " .. whole(q[4]) .. " TIMES", T.label,
            L.dnote[1], L.dnote[2] + 15, L.dnote[3], 13)
    else
        say(X.tag, "NOTHING OF THAT KIND THAT FAR OUT", T.dim, L.dnote[1], L.dnote[2], L.dnote[3], 14)
    end
    banner(L.dlist[2] + 50)
    local kinds = "ALL"
    if kind > 0 then kinds = D.kinds[kind] end
    local reach = "NEAR"
    if floor(e[2] * 60 / 127) > 0 then reach = "+" .. whole(floor(e[2] * 60 / 127)) end
    cells({ "PICK", "REACH", "KIND", "KEEP" }, { whole(pick) .. " / 8", reach, kinds, "TURN" })
end

-- --- page 4: what changed ----------------------------------------------------------------------------------

local reverted = {}

local function value_text (p, v)
    local k = p[2]
    if k == "hz" then
        local f = 20
        for i = 1, floor(v) do f = f * 1.0559 end
        if f < 1000 then return whole(f) .. " Hz" end
        return tenths(f / 1000) .. " kHz"
    end
    if k == "ms" then return whole(1 + v * v * 2000 / 16129) .. " ms" end
    if k == "s" then return tenths(0.05 + v * 7.95 / 127) .. " s" end
    if k == "ct" then return whole(v * 50 / 127) .. " ct" end
    if k == "bip" then return signed(floor((v - 64) * 100 / 63)) .. "%" end
    return whole(pct(v)) .. "%"
end

-- Every parameter's value after the history's first `upto` edits.
local function values_at (upto)
    local v = {}
    for k = 1, #D.params do v[k] = D.params[k][3] end
    for k = 1, upto do v[D.history[k][1]] = D.history[k][2] end
    return v
end

local function changed_list (e)
    local back = floor(e[4] * (#D.history + 1) / 128)
    local v = values_at(#D.history - back)
    local out, count = {}, 0
    for k = 1, #D.params do
        if v[k] ~= D.params[k][3] then
            out[#out + 1] = k
            if not reverted[k] then count = count + 1 end
        end
    end
    return out, v, back, count
end

local function turn_changes (b, n)
    if n[3] ~= b[3] then
        local out = changed_list(n)
        local k = out[clamp(floor(n[2] * #out / 128) + 1, 1, #out)]
        if k then reverted[k] = not reverted[k] end
    end
end

local function draw_changes ()
    local focus, fp = focused()
    local e = seen[P_CHANGES + 1]
    local out, v, back, count = changed_list(e)
    local blend = e[1] / 127
    local row = clamp(floor(e[2] * #out / 128) + 1, 1, #out)
    local head = whole(count) .. " CHANGES SINCE SAVED"
    if count == 1 then head = "1 CHANGE SINCE SAVED" end
    if count == 0 then head = "NOTHING CHANGED" end
    chrome(T.titles[5], head, "E1 SAVED (A) TO NOW (B)   E3 UNDOES ONE")
    say(X.song, fp.name, T.title, 16, 34, 300, 22)
    say(X.tag9, D.saved_at, T.dim, 16, 56, 300, 12)
    -- A and B, and where between them you are listening
    local nearB = blend >= 0.5
    for k = 1, 2 do
        local x = L.ab[1] + (k - 1) * L.ab[3]
        local on = (k == 2) == nearB
        draw_rect(x, L.ab[2], L.ab[4], L.ab[5], on and accent or T.raised)
        say(X.pad, k == 1 and "A" or "B", on and T.on_accent or T.label, x, L.ab[2], L.ab[4], 16)
        say(X.label, k == 1 and "SAVED" or "NOW", on and T.on_accent or T.dim, x, L.ab[2] + 15, L.ab[4], 11)
    end
    local bw = floor((L.ab[3] + L.ab[4]) * blend + 0.5)
    if bw > 0 then draw_rect(L.ab[1], L.ab[2] + L.ab[5] + 4, bw, 3, accent) end
    -- the edit history: a tick an edit, the ones after where you have walked back to dim
    local hx, hy, hw = L.hist[1], L.hist[2], L.hist[3]
    say(X.tag9, "HISTORY", T.label, 16, hy - 3, 60, 12)
    local n = #D.history
    for k = 1, n do
        local x = hx + floor((k - 1) * hw / (n - 1))
        local c = T.label
        if k > n - back then c = T.track end
        draw_rect(x, hy, 2, 7, c)
    end
    local at = hx + floor((n - back - 1) * hw / (n - 1))
    if n - back >= 1 then draw_rect(at - 1, hy - 3, 4, 13, accent) end
    local where = "NOW"
    if back > 0 then where = whole(back) .. " BACK" end
    say(X.tagr, where, back > 0 and accent or T.label, hx + hw + 6, hy - 3, 52, 12)
    -- the changes: saved (the tick), now, and what you hear (the bar)
    local rx, ry, rh, rows = L.crows[1], L.crows[2], L.crows[3], L.crows[4]
    local first = 1
    if row > rows then first = row - rows + 1 end
    for r = 0, rows - 1 do
        local k = out[first + r]
        local y = ry + r * rh
        if k then
            local p = D.params[k]
            if first + r == row then draw_rect(8, y, 3, rh - 1, accent) end
            local saved, now = p[3], v[k]
            if reverted[k] then now = saved end
            local hear = saved + (now - saved) * blend
            local tx0, tw = L.ctrack[1], L.ctrack[2]
            local xs, xh = tx0 + floor(saved * tw / 127), tx0 + floor(hear * tw / 127)
            local c = accent
            if reverted[k] then c = T.dim end
            if xh > xs then draw_rect(xs, y + 8, xh - xs, 5, c) elseif xh < xs then draw_rect(xh, y + 8, xs - xh, 5, c) end
            draw_rect(xs - 1, y + 5, 2, 11, T.ring)
            say(X.tag, p[1], reverted[k] and T.dim or T.value, 16, y, 110, rh - 1)
            if reverted[k] then
                say(X.tagr, "UNDONE, BACK TO " .. value_text(p, saved), T.dim, 306, y, 160, rh - 1)
            else
                say(X.tagr, value_text(p, saved) .. "  >  " .. value_text(p, v[k]), T.value, 306, y, 160, rh - 1)
            end
        end
    end
    if #out == 0 then say(X.tag, "THE SOUND IS AS IT WAS SAVED", T.dim, 16, ry, 300, rh) end
    local listen = "A"
    if blend >= 1 then listen = "B" elseif blend > 0 then listen = whole(floor(blend * 100 + 0.5)) .. "% B" end
    local hist = "NOW"
    if back > 0 then hist = "-" .. whole(back) end
    cells({ "LISTEN", "CHANGE", "UNDO IT", "HISTORY" },
          { listen, #out > 0 and (whole(row) .. " / " .. whole(#out)) or "-", "TURN", hist })
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

local TURN = { turn_layers, turn_effects, turn_check, turn_discover, turn_changes }

function init (args)
    if ready then return end
    for k = 1, #T.roles do
        local role = T.roles[k]
        X[role] = textbox(T.fonts[role], T.aligns[role])
    end
    for k = 1, #D.parts do
        local q = D.parts[k]
        parts[k] = { name = q.name, lo = q.lo, hi = q.hi, vlo = q.vlo, vhi = q.vhi, tr = q.tr,
                     colour = q.colour, dim = q.dim }
    end
    for k = 1, #D.chain do
        local q = D.chain[k]
        slots[k] = { name = q.name, kind = q.kind, p = { q.p[1], q.p[2], q.p[3], q.p[4] }, bypass = false }
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

local PAGES = { draw_layers, draw_effects, draw_check, draw_discover, draw_changes }

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
