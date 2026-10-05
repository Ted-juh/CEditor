-- CTRL49 screen lab: five HoSTage features, as mockups. One preset, five pages:
--
--   0 ATLAS    the sound library as a map: where a sound sits is what it measured (brightness
--              across, attack up). E1/E2 move the crosshair, E3 the box (a library query), E4
--              picks one of the eight nearest, E5 morphs from it to the next.
--   1 MOTION   modulation you can watch: four parameters, each pushed by a source (two LFOs, an
--              MSEG, a random step). The arc is where you set it; the trail is where it is now.
--              E1-E4 set the parameters, E5-E8 how far each source pushes.
--   2 CAPTURE  never lose an idea: the last two minutes of playing scroll past; E1 sizes a box of
--              bars, E2 slides it back in time, E3 quantises, E4 picks a loop slot, E5 keeps it.
--   3 STAGE    the setlist cue screen: song, section, bars left, the beat, the next sound and
--              whether it is loaded, and the failover's word when a plug-in had to restart.
--              E1 picks the song; on stage Shift + Page steps the setlist.
--   4 CHORDS   what am I playing: the chord held, its place in the key, and the next chords on
--              the pads. E1 sets the key, E2 the scale.
--
-- The colour of the whole screen is the colour of the sound picked on ATLAS: dark sounds warm,
-- bright ones cold, taken from its measured brightness. Everything that carries it is a grey
-- coverage image the keyboard tints as it draws, so recolouring costs nothing.
--
-- These are mockups: the lab has no library, no modulation, no MIDI journal and no setlist, so
-- this page simulates each from the frame counter and from data the generator wrote into it.
-- The README says, page by page, what HoSTage would send instead.
--
-- This file is the template. make_feature_mockups.py writes the design's Skin.lua from it,
-- replacing only the GENERATED block. Never hand-edit Skin.lua. No math library is assumed; every
-- number shown goes through whole() so Lua 5.2 on the keyboard and the 5.4 preview agree.

-- BEGIN GENERATED (make_feature_mockups.py writes this block)
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
local P_ATLAS, P_MOTION, P_CAPTURE, P_STAGE, P_CHORDS = 0, 1, 2, 3, 4

local function floor (x) return x - x % 1 end
local function whole (x)
    local s = tostring(floor(x))
    if s:sub(-2) == ".0" then s = s:sub(1, -3) end
    return s
end
local function tenths (x)
    local t = floor(x * 10 + 0.5)
    return whole(floor(t / 10)) .. "." .. whole(t % 10)
end
local function clamp (x, lo, hi)
    if x < lo then return lo end
    if x > hi then return hi end
    return x
end
local function two (x)
    if x < 10 then return "0" .. whole(x) end
    return whole(x)
end
local function hash (x, seed)
    return floor(((x * 2654435761 + seed * 97531) % 4294967296) / 65536)
end

-- --- state ---------------------------------------------------------------------------------------

local mode, ready, loaded, draws, framed = 0, false, 0, 0, false
local page, frame, last = 0, 0, -1
local enc = { 0, 0, 0, 0, 0, 0, 0, 0 }
local seen = {}             -- every page's encoders as last seen (the manifest's until then)
local accent = WHITE        -- the picked sound's colour; set once the atlas is read
local keptFrame, keptText = -1000, ""

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

-- A grey coverage sprite from tint.png, drawn in any colour. srcH crops from the bottom.
local function tint (name, x, y, colour, srcH)
    local s = S[name]
    local h = srcH or s[4]
    if h <= 0 then return end
    draw_image(BUF, TINT, x, y + (s[4] - h), s[1], s[2] + (s[4] - h), s[3], h, colour)
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

-- The cells over the encoders: a label, a value, and a bar of the encoder's position (the
-- tracks are in the background).
local function cells (labels, values)
    for i = 1, #labels do
        local x0 = (i - 1) * 60
        say(X.label, labels[i], focus_colour(i, T.label), x0, L.cell_label_y, 60, 11)
        say(X.cell, values[i], focus_colour(i, T.value), x0, L.cell_value_y, 60, 15)
        local fill = floor(enc[i] * 44 / 127)
        if fill > 0 then draw_rect(x0 + 8, L.cell_bar_y, fill, 4, focus_colour(i, T.bar)) end
    end
end

local function outline (x, y, w, h, c)
    draw_rect(x, y, w, 1, c)
    draw_rect(x, y + h - 1, w, 1, c)
    draw_rect(x, y, 1, h, c)
    draw_rect(x + w - 1, y, 1, h, c)
end

local function seconds () return frame / L.fps end

-- --- page 0: the atlas ------------------------------------------------------------------------------

-- The library: each sound five characters of D.atlas — brightness (two), attack (two), category
-- (one) — in a 64-letter alphabet, so the page needs nothing but string.sub to read it.
local A64 = {}
local sx, sy, scat = {}, {}, {}
local atlasRead = false
local near, nearKey, inBox = {}, "", 0

local function read_atlas ()
    if atlasRead then return end
    local alphabet = D.alphabet
    for i = 1, 64 do A64[alphabet:sub(i, i)] = i - 1 end
    local a = D.atlas
    for i = 1, D.count do
        local o = (i - 1) * 5
        sx[i] = A64[a:sub(o + 1, o + 1)] * 64 + A64[a:sub(o + 2, o + 2)]
        sy[i] = A64[a:sub(o + 3, o + 3)] * 64 + A64[a:sub(o + 4, o + 4)]
        scat[i] = A64[a:sub(o + 5, o + 5)] + 1
    end
    atlasRead = true
end

local function map_x (v) return L.map[1] + floor(v * (L.map[3] - 1) / 4095) end
local function map_y (v) return L.map[2] + L.map[4] - 1 - floor(v * (L.map[4] - 1) / 4095) end

local function sound_colour (i) return D.ramp[floor(sx[i] * #D.ramp / 4096) + 1] end

local function sound_name (i)
    return D.adjectives[hash(i, 3) % #D.adjectives + 1] .. " " .. D.categories[scat[i]] .. " " .. whole(i % 89 + 1)
end

-- The eight sounds nearest the crosshair, and how many sit in the box: one pass over the library,
-- only when the crosshair or the box moved.
local function find_near (e)
    local key = whole(e[1]) .. "," .. whole(e[2]) .. "," .. whole(e[3])
    if key == nearKey then return end
    nearKey = key
    local cx, cy = e[1] * 4095 / 127, e[2] * 4095 / 127
    local r = 80 + e[3] * 1100 / 127
    local best, dist = {}, {}
    inBox = 0
    for i = 1, D.count do
        local dx, dy = sx[i] - cx, sy[i] - cy
        if dx >= -r and dx <= r and dy >= -r and dy <= r then inBox = inBox + 1 end
        local d = dx * dx + dy * dy
        if #best < 8 or d < dist[#best] then
            local k = #best + 1
            if k > 8 then k = 8 end
            while k > 1 and dist[k - 1] > d do
                best[k], dist[k] = best[k - 1], dist[k - 1]
                k = k - 1
            end
            best[k], dist[k] = i, d
        end
    end
    near = best
end

local function atlas_state ()
    read_atlas()
    local e = seen[P_ATLAS + 1]
    find_near(e)
    local pick = floor(e[4] * 8 / 128) + 1
    accent = sound_colour(near[pick])
    return e, pick
end

local function brightness_text (v)
    local f = 200
    for i = 1, floor(v * 64 / 4096) do f = f * 1.0594 end      -- 200 Hz to 8 kHz centroid
    if f < 1000 then return whole(f) .. " Hz" end
    return tenths(f / 1000) .. " kHz"
end

local function attack_text (v)
    local ms = 1
    for i = 1, 64 - floor(v * 64 / 4096) do ms = ms * 1.1261 end -- 2 s at the bottom, 1 ms at the top
    if ms < 1000 then return whole(ms) .. " ms" end
    return tenths(ms / 1000) .. " s"
end

-- A sound's thumbprint: the shape of its own level over its first second, as the auditioner
-- measured it — here derived from its attack and a little of its own noise.
local function thumbprint (i, x, y, colour)
    local slow = 1 - sy[i] / 4095
    local rise = 1 + floor(slow * 9)
    for c = 0, 14 do
        local h
        if c < rise then h = 1 + floor(5 * (c + 1) / rise)
        else h = 6 - floor((c - rise) * (2 + scat[i] % 3) / 6) end
        h = clamp(h - hash(i * 16 + c, 7) % 2, 1, 6)
        draw_rect(x + c * 2, y + 7 - h, 1, h * 2, colour)
    end
end

local function draw_atlas ()
    local e, pick = atlas_state()
    chrome(T.titles[1], whole(D.count) .. " SOUNDS   BRIGHTNESS x ATTACK", "PADS AUDITION THE EIGHT NEAREST   E5 MORPHS")
    local mx, my, mw, mh = L.map[1], L.map[2], L.map[3], L.map[4]
    local cx, cy = map_x(e[1] * 4095 / 127), map_y(e[2] * 4095 / 127)
    -- the box the query is, and the crosshair
    local r = 80 + e[3] * 1100 / 127
    local bx0, bx1 = map_x(clamp(e[1] * 4095 / 127 - r, 0, 4095)), map_x(clamp(e[1] * 4095 / 127 + r, 0, 4095))
    local by0, by1 = map_y(clamp(e[2] * 4095 / 127 + r, 0, 4095)), map_y(clamp(e[2] * 4095 / 127 - r, 0, 4095))
    draw_rect(mx, cy, mw, 1, T.cross)
    draw_rect(cx, my, 1, mh, T.cross)
    outline(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, accent)
    local tx, ty = bx0, by0 - 12                 -- the count on a tab above the box, or inside it
    if ty < my then ty = by0 end
    if tx > mx + mw - 64 then tx = mx + mw - 64 end
    draw_rect(tx, ty, 64, 12, accent)
    say(X.tag, whole(inBox) .. " IN BOX", T.on_accent, tx + 3, ty, 60, 12)
    -- the eight nearest, ringed; the picked one large, and the morph to the next
    local b = near[pick % #near + 1]
    for k = 1, #near do
        local i = near[k]
        if k ~= pick then tint("ring", map_x(sx[i]) - 4, map_y(sy[i]) - 4, T.ring) end
    end
    local a = near[pick]
    local ax, ay, bxp, byp = map_x(sx[a]), map_y(sy[a]), map_x(sx[b]), map_y(sy[b])
    local m = e[5] / 127
    for k = 1, 5 do
        tint("dot", ax + floor((bxp - ax) * k / 6) - 2, ay + floor((byp - ay) * k / 6) - 2, T.ring)
    end
    tint("ring_big", ax - 7, ay - 7, accent)
    tint("puck", ax + floor((bxp - ax) * m) - 5, ay + floor((byp - ay) * m) - 5, accent)
    say(X.tag, "FAST", T.axis, mx + 3, my + 2, 40, 11)
    say(X.tag, "SLOW", T.axis, mx + 3, my + mh - 24, 40, 11)
    say(X.tag, "DARK", T.axis, mx + 3, my + mh - 13, 40, 11)
    say(X.tagr, "BRIGHT", T.axis, mx + mw - 63, my + mh - 13, 60, 11)
    -- the list: the eight nearest, each with its thumbprint; the picked one lit
    local lx, ly = L.list[1], L.list[2]
    for k = 1, #near do
        local i = near[k]
        local y = ly + (k - 1) * L.list[4]
        if k == pick then draw_rect(lx, y, L.list[3], L.list[4] - 2, T.raised) end
        say(X.small, whole(k), k == pick and accent or T.dim, lx, y, 12, L.list[4] - 2)
        thumbprint(i, lx + 14, y + 3, sound_colour(i))
        local nameColour = T.value
        if k ~= pick then nameColour = T.label end
        say(X.tag, sound_name(i), nameColour, lx + 48, y, L.list[3] - 50, L.list[4] - 2)
    end
    cells({ "BRIGHT", "ATTACK", "BOX", "PICK", "MORPH" },
          { brightness_text(e[1] * 4095 / 127), attack_text(e[2] * 4095 / 127), whole(inBox),
            whole(pick) .. " / 8", whole(e[5] * 100 / 127) .. "%" })
end

-- --- page 1: modulation you can watch ----------------------------------------------------------------

local SOURCES = { "LFO 1", "LFO 2", "MSEG", "RANDOM" }
local SHAPES = { "SINE 0.5 Hz", "TRI 2 BARS", "2 BARS", "S+H 1/8" }
local TARGETS = { "CUTOFF", "RESONANCE", "WAVE", "PAN" }

-- The four sources at a time in seconds, -1 to 1 (the MSEG 0 to 1).
local function sine (phase) return D.sine[floor(phase * 64) % 64 + 1] / 127 end
local function source (k, t)
    if k == 1 then return sine(t * 0.5 - floor(t * 0.5)) end
    if k == 2 then
        local p = t / 4 - floor(t / 4)
        if p < 0.5 then return p * 4 - 1 end
        return 3 - p * 4
    end
    if k == 3 then
        local p = (t / 4 - floor(t / 4)) * (#D.mseg - 1)
        local i = floor(p)
        local f = p - i
        return (D.mseg[i + 1] * (1 - f) + D.mseg[i % (#D.mseg - 1) + 2] * f) / 127
    end
    return (hash(floor(t * 4), 13) % 255) / 127 - 1
end

local function target_text (k, v)
    if k == 1 then
        local f = 20
        for i = 1, floor(v) do f = f * 1.0559 end
        if f < 1000 then return whole(f) .. " Hz" end
        return tenths(f / 1000) .. " kHz"
    end
    if k == 2 then return whole(v * 100 / 127) .. " %" end
    if k == 3 then return "POS " .. whole(v) end
    local p = floor((v - 64) * 100 / 63)
    if p < -2 then return "L " .. whole(-p) end
    if p > 2 then return "R " .. whole(p) end
    return "CENTRE"
end

local function ring_at (cx, cy, v, name, colour, offset)
    local i = clamp(floor(v), 0, 127)
    tint(name, cx + D.ring[i * 2 + 1] - offset, cy + D.ring[i * 2 + 2] - offset, colour)
end

local function draw_motion ()
    atlas_state()
    local e = seen[P_MOTION + 1]
    local t = seconds()
    chrome(T.titles[2], "4 SOURCES   4 TARGETS   LIVE", "E1-E4 SET   E5-E8 HOW FAR EACH SOURCE PUSHES")
    for k = 1, 4 do
        local x = L.knob_x[k]
        local cx, cy = x + 40, L.knob_y + 40
        local base = e[k]
        local depth = (e[k + 4] - 64) / 63
        local s = source(k, t)
        local now = clamp(base + depth * 63 * s, 0, 127)
        local colour = D.source_colours[k]
        draw_image(BUF, TINT, x, L.knob_y, 0, floor(base * (L.knob_frames - 1) / 127 + 0.5) * 80, 80, 80, T.knob)
        -- the trail from where it is set to where the source has pushed it
        for j = 1, 5 do ring_at(cx, cy, base + (now - base) * j / 6, "dot", colour, 2) end
        ring_at(cx, cy, now, "dot_big", colour, 4)
        say(X.label, TARGETS[k], last == k - 1 and accent or T.label, x - 14, L.knob_label_y, 108, 12)
        say(X.value, target_text(k, now), colour, x - 14, L.knob_value_y, 108, 16)
        say(X.small, "SET " .. target_text(k, base), T.dim, x - 14, L.knob_value_y + 16, 108, 11)
        -- the source, one cycle of it, and where it is
        local sxo, syo, sw, sh = L.scope_x[k], L.scope[1], L.scope[2], L.scope[3]
        say(X.scope, SOURCES[k] .. "  " .. SHAPES[k], colour, sxo + 6, syo + 3, sw - 12, 11)
        local mid = syo + 15 + floor((sh - 20) / 2)
        local amp = floor((sh - 22) / 2)
        local step = L.scope_step          -- pixels a column: 2 in full, wider when slimmed
        local cols = floor((sw - 12) / step)
        local phase
        if k == 1 then phase = t * 0.5 - floor(t * 0.5)
        elseif k == 4 then phase = 1
        else phase = t / 4 - floor(t / 4) end
        for c = 0, cols - 1 do
            local v
            if k == 4 then v = source(4, t - (cols - 1 - c) / 16)
            elseif k == 1 then v = sine(c / cols)
            elseif k == 2 then v = source(2, 4 * c / cols)
            else v = source(3, 4 * c / cols) * 2 - 1 end
            draw_rect(sxo + 6 + c * step, mid - floor(v * amp), step, 2, D.source_dims[k])
        end
        local pc = clamp(floor(phase * cols), 0, cols - 1)
        local pv = s
        if k == 3 then pv = s * 2 - 1 end
        draw_rect(sxo + 6 + pc * step, syo + 15, 1, sh - 20, colour)
        tint("dot_big", sxo + 6 + pc * step - 4, mid - floor(pv * amp) - 4, colour)
    end
    local depths = {}
    for k = 1, 4 do
        local d = floor((e[k + 4] - 64) * 100 / 63 + 0.5)
        if d > 0 then depths[k] = "+" .. whole(d) .. "%" else depths[k] = whole(d) .. "%" end
    end
    cells({ "CUTOFF", "RESO", "WAVE", "PAN", "LFO 1", "LFO 2", "MSEG", "RANDOM" },
          { target_text(1, e[1]), target_text(2, e[2]), target_text(3, e[3]), target_text(4, e[4]),
            depths[1], depths[2], depths[3], depths[4] })
end

-- --- page 2: never lose an idea ------------------------------------------------------------------------

-- What was played, a function of the bar: a chord under each bar, an arpeggio of eighths over it,
-- and now and then a held melody note. HoSTage keeps the real thing in its capture journal.
local function bar_notes (b)
    local out = {}
    local chord = D.song[b % #D.song + 1]
    if b < 0 or hash(floor(b / 4), 33) % 5 == 0 then return out end      -- a pause, four bars long
    if hash(b, 21) % 5 ~= 0 then
        for k = 1, 3 do out[#out + 1] = { 0, 4, chord[k], 64 } end
    end
    for k = 0, 7 do
        if hash(b * 8 + k, 22) % 7 ~= 0 then
            local note = chord[D.arp[k * 2 + 1]] + 12 * (1 + D.arp[k * 2 + 2])
            out[#out + 1] = { k / 2, 0.45, note, 80 + hash(b * 8 + k, 23) % 40 }
        end
    end
    if b % 2 == 1 then out[#out + 1] = { 2, 2, chord[2] + 24, 110 } end
    return out
end

-- Notes per bar, remembered for the last 128 bars: the minimap asks for sixty of them a redraw.
local countBar, countN = {}, {}
local function bar_count (b)
    if b < 0 then return 0 end
    local k = b % 128 + 1
    if countBar[k] ~= b then countBar[k], countN[k] = b, #bar_notes(b) end
    return countN[k]
end

local function draw_capture ()
    atlas_state()
    local e = seen[P_CAPTURE + 1]
    local beat = (seconds() + D.capture_offset) * D.capture_bpm / 60
    local nowBar = floor(beat / 4)
    local keep = 1 + floor(e[1] * 16 / 128)
    local back = floor(e[2] * 17 / 128)
    local quant = D.quantise[floor(e[3] * 4 / 128) + 1]
    local slot = D.slots[floor(e[4] * 4 / 128) + 1]
    local total = 0
    for b = nowBar - 59, nowBar do total = total + bar_count(b) end
    chrome(T.titles[3], whole(total) .. " NOTES IN THE LAST 2:00", "NOTHING YOU PLAY IS LOST   E5 KEEPS THE BOX")

    local rx, ry, rw, rh = L.roll[1], L.roll[2], L.roll[3], L.roll[4]
    local ppb = L.roll_beat_px
    local right = rx + rw - 2
    local function x_of (bt) return right - floor((beat - bt) * ppb) end
    local function y_of (n) return ry + rh - 4 - floor((n - 36) * (rh - 8) / 48) end
    local selEnd = (floor(beat / 4) - back) * 4
    local selStart = selEnd - keep * 4
    -- bar and beat lines
    local firstBar = nowBar - 9         -- nine bars and a little: the roll is never short on the left
    for b = firstBar, nowBar do
        for q = 0, 3 do
            local x = x_of(b * 4 + q)
            if x >= rx and x < right then draw_rect(x, ry, 1, rh, q == 0 and T.bar_line or T.beat_line) end
        end
    end
    -- the notes; those inside the box in the sound's colour
    for b = firstBar, nowBar do
        local notes = bar_notes(b)
        for k = 1, #notes do
            local n = notes[k]
            local start = b * 4 + n[1]
            if start <= beat then
                local x0 = x_of(start)
                local x1 = x_of(start + n[2])
                if x1 > right then x1 = right end
                if x0 < rx then x0 = rx end
                if x1 - x0 >= 1 then
                    local c = T.note_soft
                    if n[4] >= 100 then c = T.note_loud elseif n[4] >= 75 then c = T.note end
                    if start >= selStart and start < selEnd then c = accent end
                    draw_rect(x0, y_of(n[3]), x1 - x0, 3, c)
                end
            end
        end
    end
    -- the box being kept, and the now line
    local bx0, bx1 = clamp(x_of(selStart), rx, right), clamp(x_of(selEnd), rx, right)
    if bx1 > bx0 then
        outline(bx0, ry, bx1 - bx0 + 1, rh, accent)
        local tab = bx0                 -- the label's tab, kept on the roll when the box is narrow
        if tab > right - 84 then tab = right - 84 end
        draw_rect(tab, ry, 84, 12, accent)
        say(X.tag, "KEEP " .. whole(keep) .. (keep == 1 and " BAR" or " BARS"), T.on_accent, tab + 3, ry, 80, 12)
    end
    if x_of(selStart) < rx then say(X.tag, "+" .. whole(floor((rx - x_of(selStart)) / (ppb * 4)) + 1) .. " BARS", accent, rx + 2, ry + rh - 13, 60, 11) end
    draw_rect(right, ry, 2, rh, T.now)
    if frame % 16 < 10 then tint("rec", right - 12, ry + 3, T.rec) end
    -- two minutes at a glance: a column a bar (or L.mini_group bars when slimmed), the visible
    -- stretch and the box marked
    local mx, my, mw, mh = L.minimap[1], L.minimap[2], L.minimap[3], L.minimap[4]
    local g = L.mini_group
    local n = floor(60 / g)
    for j = 0, n - 1 do
        local count, c = 0, T.mini
        for q = 0, g - 1 do
            local b = nowBar - 59 + j * g + q
            count = count + bar_count(b)
            if b >= firstBar and c == T.mini then c = T.mini_visible end
            if b * 4 >= selStart and b * 4 < selEnd then c = accent end
        end
        local x = mx + floor(j * mw / n)
        local w = floor((j + 1) * mw / n) - floor(j * mw / n) - 1
        local h = clamp(floor(count * (mh - 4) / (13 * g)), 1, mh - 4)
        draw_rect(x, my + mh - 2 - h, w, h, c)
    end
    -- E5 keeps: a turn of it files the box as a loop
    if frame - keptFrame >= 0 and frame - keptFrame < 30 then
        draw_rect(rx + 60, ry + 50, rw - 120, 30, accent)
        say(X.banner, keptText, T.on_accent, rx + 60, ry + 50, rw - 120, 30)
    end
    cells({ "KEEP", "FROM", "QUANTISE", "TO", "KEEP IT" },
          { whole(keep) .. (keep == 1 and " BAR" or " BARS"), back == 0 and "NOW" or (whole(back) .. " AGO"), quant, slot, "TURN" })
end

-- --- page 3: the stage ------------------------------------------------------------------------------------

local function draw_stage ()
    atlas_state()
    local e = seen[P_STAGE + 1]
    local song = floor(e[1] * #D.songs / 128) + 1
    local bpm = D.tempos[song]
    local beat = (seconds() + D.stage_offset) * bpm / 60
    local barsTotal = 0
    for k = 1, #D.form do barsTotal = barsTotal + D.form[k][2] end
    local bar = floor(beat / 4) % barsTotal
    local inBeat = floor(beat) % 4
    local section, start = 1, 0
    while bar >= start + D.form[section][2] do
        start = start + D.form[section][2]
        section = section + 1
    end
    local len = D.form[section][2]
    local done = bar - start
    local nextSection = D.form[section % #D.form + 1][1]
    local setSecs = floor(seconds()) + 1800 + song * 240
    chrome(T.titles[4], "SET " .. whole(floor(setSecs / 60)) .. ":" .. two(setSecs % 60), "SHIFT + PAGE STEPS THE SETLIST   E1 PICKS A SONG")

    say(X.tag, "SONG " .. whole(song) .. " OF " .. whole(#D.songs), T.label, 14, 34, 200, 12)
    say(X.song, D.songs[song], T.title, 14, 46, 300, 26)
    say(X.bpm, whole(bpm) .. " BPM", T.value, 300, 46, 166, 26)
    -- the section, how far through it, and the bars left
    say(X.section, D.form[section][1], accent, 18, 84, 282, 48)
    say(X.tag, "BAR " .. whole(done + 1) .. " OF " .. whole(len), T.label, 18, 136, 200, 12)
    local sw = floor(282 / len)
    for k = 0, len - 1 do
        local c = T.track
        if k < done then c = T.dim elseif k == done then c = accent end
        draw_rect(18 + k * sw, 156, sw - 2, 10, c)
    end
    say(X.label, "BARS LEFT", T.label, 318, 84, 152, 12)
    say(X.huge, whole(len - done), accent, 318, 96, 152, 62)
    for q = 0, 3 do
        local c = T.track
        if q == inBeat then c = (q == 0) and accent or T.value end
        draw_rect(336 + q * 30, 164, 24, 8, c)
    end
    -- the beat at the edge of the screen, where the eye catches it
    if beat - floor(beat) < 0.18 then
        local c = T.dim
        if inBeat == 0 then c = accent end
        draw_rect(0, 0, 480, 3, c); draw_rect(0, 269, 480, 3, c)
        draw_rect(0, 0, 3, 272, c); draw_rect(477, 0, 3, 272, c)
    end
    -- next: the section, its sound, and whether the preloader has it warm
    local nextSound = D.sounds[(song + section) % #D.sounds + 1]
    local loadedPct = clamp(floor(25 + (done + beat / 4 - floor(beat / 4)) * 150 / len), 0, 100)
    say(X.tag, "NEXT", T.label, 18, 186, 40, 12)
    say(X.next, nextSection, T.title, 18, 198, 150, 24)
    say(X.line, nextSound, T.value, 170, 198, 200, 24)
    if loadedPct >= 100 then
        tint("dot_big", 378, 206, T.ready)
        say(X.line, "READY", T.ready, 392, 198, 80, 24)
    else
        say(X.tag, "LOADING " .. whole(loadedPct) .. "%", T.label, 378, 196, 90, 12)
        draw_rect(378, 212, 84, 4, T.track)
        draw_rect(378, 212, floor(84 * loadedPct / 100), 4, T.value)
    end
    -- the failover: a plug-in that died is restarted, and the screen says so
    if frame % 600 >= 420 and frame % 600 < 480 then
        draw_rect(8, 180, 464, 46, T.warn)
        say(X.banner, "PART 2 RESTARTED IN 0.3 s  -  SOUND BACK", T.on_warn, 8, 180, 464, 46)
    end
end

-- --- page 4: what am I playing ---------------------------------------------------------------------------

local function scale_of (e) return D.scales[floor(e[2] * #D.scales / 128) + 1] end

local function chord_at (sc, k)
    local list = D.progressions[sc[3]]
    return list[k % #list + 1]
end

local function draw_chords ()
    atlas_state()
    local e = seen[P_CHORDS + 1]
    local key = floor(e[1] * 12 / 128)
    local sc = scale_of(e)
    local beat = seconds() * D.chord_bpm / 60
    local barF = beat / 4
    local bar = floor(barF)
    local ch = chord_at(sc, bar)
    local nx = chord_at(sc, bar + 1)
    local NAMES = D.notes
    local root = (key + sc[2][ch[1]]) % 12
    local name = NAMES[root + 1] .. ch[2]
    if ch[5] then name = name .. "/" .. NAMES[(root + ch[5]) % 12 + 1] end
    -- the notes held: the voicing, and a bass under it when the chord is over another note
    local isHeld, count = {}, 0
    local function hold (n)
        if not isHeld[n] then isHeld[n], count = true, count + 1 end
    end
    local low = 48 + root
    if root >= 6 then low = low - 12 end
    for k = 1, #ch[3] do hold(low + ch[3][k]) end
    if ch[5] then hold(36 + (root + ch[5]) % 12) end
    chrome(T.titles[5], "LISTENING   " .. whole(count) .. " NOTES HELD", "PADS PLAY THE NEXT CHORDS THROUGH THE CHORDER")

    say(X.big, name, accent, 14, 34, 280, 66)
    say(X.line, ch[4] .. "   " .. ch[6], T.value, 16, 100, 280, 18)
    draw_rect(16, 120, 270, 3, T.track)
    draw_rect(16, 120, floor(270 * (barF - bar)), 3, accent)
    say(X.label, "KEY", T.label, 300, 38, 166, 12)
    say(X.key, NAMES[key + 1] .. " " .. sc[1], T.title, 300, 52, 166, 26)
    say(X.label, sc[4], T.dim, 300, 80, 166, 12)
    tint("dot", 334, 106, T.scale_mark)
    say(X.tag, "IN SCALE", T.dim, 342, 102, 56, 12)
    draw_rect(402, 104, 9, 9, accent)
    say(X.tag, "HELD", T.dim, 415, 102, 40, 12)
    -- the keyboard: in-scale keys marked, held keys lit in the sound's colour
    local kx, ky = L.kb[1], L.kb[2]
    local WHITE_OF = { 0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6 }
    local inScale = {}
    for d = 1, 7 do inScale[(key + sc[2][d]) % 12] = true end
    for pass = 1, 2 do
        for n = 36, 71 do
            local pc = n % 12
            local black = pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10
            local w = floor((n - 36) / 12) * 7 + WHITE_OF[pc + 1]
            if (pass == 1 and not black) or (pass == 2 and black) then
                local x, y
                if black then x, y = kx + (w + 1) * L.kb[3] - 5, ky else x, y = kx + w * L.kb[3], ky end
                if isHeld[n] then
                    -- a white key's lit shape stops short of its neighbours' black keys, so it
                    -- never covers one: C and F are notched right, E and B left, the rest both
                    if black then tint("key_black", x, y, accent)
                    elseif pc == 0 or pc == 5 then tint("key_c", x, y, accent)
                    elseif pc == 4 or pc == 11 then tint("key_e", x, y, accent)
                    else tint("key_d", x, y, accent) end
                end
                if inScale[pc] then
                    if black then tint("dot", x + 3, y + 20, T.scale_mark) else tint("dot", x + 7, y + 37, T.scale_mark) end
                end
            end
        end
    end
    -- the pads: the key's chords, the likeliest next one ringed
    for p = 1, 8 do
        local d = D.pad_degrees[sc[3]][p]
        local pr = (key + sc[2][d[1]]) % 12
        local x = 6 + (p - 1) * 59
        local likely = d[1] == nx[1] and d[2] == nx[2]
        if likely then outline(x - 1, L.pads[1] - 1, 56, L.pads[2] + 2, accent) end
        say(X.pad, NAMES[pr + 1] .. d[2], likely and accent or T.value, x - 2, L.pads[1] + 3, 58, 17)
        say(X.small, d[3], T.label, x, L.pads[1] + 20, 54, 12)
        say(X.small, "PAD " .. whole(p), T.dim, x, L.pads[1] + 32, 54, 11)
    end
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

function init (args)
    if ready then return end
    for k = 1, #T.roles do
        local role = T.roles[k]
        X[role] = textbox(T.fonts[role], T.aligns[role])
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
        if page == P_CAPTURE and enc[5] ~= seen[P_CAPTURE + 1][5] then
            local keep = 1 + floor(enc[1] * 16 / 128)
            keptFrame = frame
            keptText = "KEPT " .. whole(keep) .. (keep == 1 and " BAR" or " BARS") .. " AS "
                .. D.slots[floor(enc[4] * 4 / 128) + 1] .. ",  QUANTISED " .. D.quantise[floor(enc[3] * 4 / 128) + 1]
        end
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

local PAGES = { draw_atlas, draw_motion, draw_capture, draw_stage, draw_chords }

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
