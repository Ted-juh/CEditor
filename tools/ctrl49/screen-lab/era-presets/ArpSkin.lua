-- CTRL49 screen lab: a full arpeggiator, as a mockup. Six pages, one instrument:
--   0 PLAY      E1 mode   E2 rate    E3 octaves    E4 gate       E5 swing   E6 tempo  E7 chord   E8 root
--   1 MOTION    E1 octave order       E2 repeat     E3 transpose  E4 inversion
--               E5 pattern length     E6 accent     E7 random     E8 reset
--   2 STEPS     E1-E8  what each step does: rest, note, accent, tie, ratchet x2/x3/x4, chord
--   3 VELOCITY  E1-E8  each step's velocity (an accent adds MOTION's accent on top)
--   4 OCTAVE    E1-E8  each step's octave, -2 to +2
--   5 CHANCE    E1-E8  the chance each step plays
-- Encoder N is step N on every lane page, so a column of the screen is a column of the keyboard.
--
-- This file is the template. make_arp_mockup.py writes the design's Skin.lua from it, replacing
-- only the GENERATED block below (theme, layout, sprite crops). Never hand-edit Skin.lua.
--
-- What the host sends (Ctrl49ScreenLab preset mode, payloads from Ctrl49ScreenLab.h):
--   set_mode   [mode]       0 = loading, 1 = pages may draw
--   set_frame  [page][frameLo][e1..e8][lastEncoder][playhead][vuL][vuR][pads][frameHi]
-- set_envelope is accepted and ignored: this design has no envelope page.
--
-- Every value on every page is a function of the encoder values the host keeps. The host only
-- sends the encoders of the page that is up, so the values of the other pages are the last ones
-- seen (the manifest's defaults until then); since each lane is only edited on its own page, they
-- are always current. The arpeggiator itself runs here, from the frame counter, because the lab
-- has no arpeggiator of its own to ask: steps = frames x BPM x steps-per-beat / (60 x FPS). In
-- HoSTage the host would own the clock and the held notes, and this page would only draw.
--
-- No math library is assumed; every number shown goes through whole() so Lua 5.2 on the
-- keyboard and the 5.4 preview print the same thing.

-- BEGIN GENERATED (make_arp_mockup.py writes this block)
local T = {}
local L = {}
local S = {}
-- END GENERATED

local PNG, BUF = 14, 18
local WHITE = 0xFFFFFFFF
-- Uploaded PNG ids and the decoded buffers made from them, decoded one per redraw.
local ATLAS = { { 576, 577 }, { 578, 579 }, { 580, 581 } }
local PARTS = 581

local function floor (x) return x - x % 1 end
local function whole (x)
    local s = tostring(floor(x))
    if s:sub(-2) == ".0" then s = s:sub(1, -3) end
    return s
end
local function signed (x)
    if x > 0 then return "+" .. whole(x) end
    return whole(x)
end
local function clamp (x, lo, hi)
    if x < lo then return lo end
    if x > hi then return hi end
    return x
end

-- --- state, as the host last sent it -----------------------------------------------------------

local mode, ready, loaded, draws, framed = 0, false, 0, 0, false
local page, frame, last = 0, 0, -1
local enc = { 0, 0, 0, 0, 0, 0, 0, 0 }
local seen = {}

-- --- text --------------------------------------------------------------------------------------

local TITLE, HEAD, LABEL, VALUE, BIG, FOOT, SMALL, CELL, NOW

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

function init (args)
    if ready then return end
    TITLE = textbox(T.f_title, 0); HEAD = textbox(T.f_head, 2); LABEL = textbox(T.f_label, 1)
    VALUE = textbox(T.f_value, 1); BIG = textbox(T.f_big, 1); FOOT = textbox(T.f_foot, 0)
    SMALL = textbox(T.f_small, 1); CELL = textbox(T.f_cell, 1); NOW = textbox(T.f_now, 0)
    for p = 1, L.pages do
        seen[p] = {}
        for i = 1, 8 do seen[p][i] = L.defaults[p][i] end
    end
    for i = 1, 8 do enc[i] = seen[1][i] end
    ready = true
end

-- --- what the host sends -------------------------------------------------------------------------

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
        for i = 1, 8 do seen[page + 1][i] = enc[i] end
    end
    framed = true
end

function set_envelope (args) end

-- --- drawing helpers -----------------------------------------------------------------------------

-- A sprite from parts.png. srcH crops from the BOTTOM, so a bar grows up from its base.
local function part (name, x, y, srcH)
    local s = S[name]
    local h = srcH or s[4]
    if h <= 0 then return end
    draw_image(BUF, PARTS, x, y + (s[4] - h), s[1], s[2] + (s[4] - h), s[3], h, WHITE)
end

local function chrome (title, right, hint)
    local bg = L.bg[page + 1]
    draw_image(BUF, bg[1], 0, 0, 0, bg[2], 480, 272, WHITE)
    say(TITLE, title, T.title, L.title[1], L.title[2], L.title[3], L.title[4])
    say(HEAD, right, T.head, L.head[1], L.head[2], L.head[3], L.head[4])
    say(FOOT, hint, T.foot, L.foot[1], L.foot[2], L.foot[3], L.foot[4])
    for i = 0, L.pages - 1 do
        local c = T.dot_off
        if i == page then c = T.dot_on end
        draw_rect(L.dots[1] + i * L.dots[3], L.dots[2], L.dots[4], L.dots[5], c)
    end
end

local function focus_colour (i, normal)
    if last == i - 1 then return T.accent end
    return normal
end

-- Eight value cells over the eight encoders: a label, a value, a bar of the encoder's position.
local function cells (labels, values)
    for i = 1, 8 do
        local x0 = (i - 1) * L.strip_w
        say(LABEL, labels[i], focus_colour(i, T.label), x0, L.cell_label_y, L.strip_w, 12)
        say(CELL, values[i], focus_colour(i, T.value), x0, L.cell_value_y, L.strip_w, 16)
        local fill = floor(enc[i] * L.cell_bar[2] / 127)
        if fill > 0 then
            draw_rect(x0 + L.cell_bar[1], L.cell_bar[3], fill, L.cell_bar[4], focus_colour(i, T.bar))
        end
    end
end

-- --- the loading screen ----------------------------------------------------------------------------

local function loading ()
    draw_rect(0, 0, 480, 272, T.load_bg)
    say(BIG, T.name, T.load_text, 0, 96, 480, 30)
    say(LABEL, "LOADING  " .. whole(loaded) .. " / 3", T.load_dim, 0, 132, 480, 16)
    draw_rect(150, 160, 180, 4, T.load_track)
    if loaded > 0 then draw_rect(150, 160, floor(180 * loaded / 3), 4, T.load_bar) end
end

-- --- the arpeggiator -------------------------------------------------------------------------------

local NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
local MODES = { "UP", "DOWN", "UP/DN", "DN/UP", "UP+DN", "CONVERGE", "DIVERGE", "PINKY",
                "THUMB", "ORDER", "RANDOM", "CHORD" }
local SHORT = { "UP", "DOWN", "UP/DN", "DN/UP", "UP+DN", "CONV", "DIVG", "PINKY",
                "THUMB", "ORDER", "RAND", "CHORD" }
-- Divisions as steps per beat. D is dotted, T triplet.
local RATES = { { "1/2", 0.5 }, { "1/4D", 2 / 3 }, { "1/4", 1 }, { "1/4T", 1.5 }, { "1/8D", 4 / 3 },
                { "1/8", 2 }, { "1/8T", 3 }, { "1/16D", 8 / 3 }, { "1/16", 4 }, { "1/16T", 6 },
                { "1/32", 8 }, { "1/32T", 12 } }
-- The held notes. The lab hears no keys, so a chord and a root stand in for them; in HoSTage
-- the keys held on the CTRL49 would.
local CHORDS = { { "MAJ", { 0, 4, 7 } }, { "MIN", { 0, 3, 7 } }, { "7", { 0, 4, 7, 10 } },
                 { "MAJ7", { 0, 4, 7, 11 } }, { "MIN7", { 0, 3, 7, 10 } }, { "MIN9", { 0, 3, 7, 10, 14 } },
                 { "SUS4", { 0, 5, 7 } }, { "ADD9", { 0, 4, 7, 14 } }, { "DIM7", { 0, 3, 6, 9 } },
                 { "6/9", { 0, 4, 7, 9, 14 } } }
-- ORDER plays the held notes in the order they were pressed: here root, fifth, third, the rest.
local PLAYED = { { 1 }, { 1, 2 }, { 1, 3, 2 }, { 1, 3, 2, 4 }, { 1, 3, 2, 5, 4 } }
local OCT_ORDERS = { "UP", "DOWN", "UP-DN", "INTER" }
local INVERSIONS = { "ROOT", "1ST", "2ND", "3RD" }
local RESETS = { { "OFF", 0 }, { "1 BAR", 1 }, { "2 BARS", 2 }, { "4 BARS", 4 } }
local TYPES = { "REST", "NOTE", "ACCENT", "TIE", "x2", "x3", "x4", "CHORD" }
local REST, NOTE, ACCENT, TIE, X2, X3, X4, CHORDSTEP = 0, 1, 2, 3, 4, 5, 6, 7

local function index_of (n, v) return floor(v * n / 128) + 1 end

-- Every setting, from the encoders of all six pages.
local function settings ()
    local p, m = seen[1], seen[2]
    local P = {
        mode = index_of(12, p[1]), rate = RATES[index_of(12, p[2])], octaves = 1 + floor(p[3] * 4 / 128),
        gate = 10 + floor(p[4] * 90 / 127), swing = 50 + floor(p[5] * 25 / 127), bpm = 60 + p[6],
        chord = CHORDS[index_of(10, p[7])], root = floor(p[8] * 12 / 128),
        octOrder = index_of(4, m[1]), rep = 1 + floor(m[2] * 4 / 128), transpose = floor(m[3] * 25 / 128) - 12,
        inversion = floor(m[4] * 4 / 128), len = 1 + floor(m[5] * 8 / 128), accent = floor(m[6] * 60 / 127),
        random = floor(m[7] * 100 / 127), reset = RESETS[index_of(4, m[8])],
        types = {}, vel = {}, oct = {}, chance = {},
    }
    for i = 1, 8 do
        P.types[i] = floor(seen[3][i] * 8 / 128)
        P.vel[i] = seen[4][i]
        P.oct[i] = floor(seen[5][i] * 5 / 128) - 2
        P.chance[i] = floor(seen[6][i] * 100 / 127)
    end
    return P
end

-- The held notes, low to high, after the inversion: each step of inversion lifts the lowest an octave.
local function held_notes (P)
    local a = {}
    local iv = P.chord[2]
    for k = 1, #iv do a[k] = 48 + P.root + iv[k] end
    for i = 1, P.inversion do
        if i < #a then
            a[1] = a[1] + 12
            for k = 2, #a do                      -- one pass of insertion keeps it sorted
                if a[k - 1] > a[k] then a[k - 1], a[k] = a[k], a[k - 1] end
            end
        end
    end
    return a
end

-- The order the mode walks n held notes in, as indexes into them.
local function walk_order (m, n)
    local o = {}
    local function add (i) o[#o + 1] = i end
    if m == 2 then
        for i = n, 1, -1 do add(i) end
    elseif m == 3 then
        for i = 1, n do add(i) end
        for i = n - 1, 2, -1 do add(i) end
    elseif m == 4 then
        for i = n, 1, -1 do add(i) end
        for i = 2, n - 1 do add(i) end
    elseif m == 5 then
        for i = 1, n do add(i) end
        for i = n, 1, -1 do add(i) end
    elseif m == 6 or m == 7 then                  -- converge: outside in; diverge: inside out
        local lo, hi = 1, n
        while lo <= hi do
            add(lo)
            if hi ~= lo then add(hi) end
            lo, hi = lo + 1, hi - 1
        end
        if m == 7 then
            local r = {}
            for i = #o, 1, -1 do r[#r + 1] = o[i] end
            o = r
        end
    elseif m == 8 then                            -- pinky: every note answered by the top one
        for i = 1, n - 1 do add(i); add(n) end
        if n == 1 then add(1) end
    elseif m == 9 then                            -- thumb: every note answered by the bottom one
        for i = 2, n do add(1); add(i) end
        if n == 1 then add(1) end
    elseif m == 10 then
        local p = PLAYED[n]
        for i = 1, #p do add(p[i]) end
    else
        for i = 1, n do add(i) end                -- UP, and the pool RANDOM and CHORD draw from
    end
    return o
end

local function hash (x, seed)
    return floor(((x * 2654435761 + seed * 97531) % 4294967296) / 65536)
end

-- Everything that follows from the settings: the held notes, the walk through them over the
-- octaves (the cycle), and how many notes each pass of the step pattern moves the walk on.
local function analyse (P)
    local A = { held = held_notes(P), octs = {}, seq = {}, before = {}, adv = 0 }
    local k = P.octaves
    if P.octOrder == 2 then
        for i = k - 1, 0, -1 do A.octs[#A.octs + 1] = i end
    elseif P.octOrder == 3 then
        for i = 0, k - 1 do A.octs[#A.octs + 1] = i end
        for i = k - 2, 1, -1 do A.octs[#A.octs + 1] = i end
    else
        for i = 0, k - 1 do A.octs[#A.octs + 1] = i end
    end
    local o = walk_order(P.mode, #A.held)
    local function push (n) for r = 1, P.rep do A.seq[#A.seq + 1] = n end end
    if P.octOrder == 4 then                       -- interleaved: each note through every octave
        for i = 1, #o do
            for q = 0, k - 1 do push(A.held[o[i]] + 12 * q + P.transpose) end
        end
    else
        for j = 1, #A.octs do
            for i = 1, #o do push(A.held[o[i]] + 12 * A.octs[j] + P.transpose) end
        end
    end
    for j = 1, P.len do
        A.before[j] = A.adv
        local t = P.types[j]
        if t == NOTE or t == ACCENT or t == X2 or t == X3 or t == X4 then A.adv = A.adv + 1 end
    end
    A.resetLen = floor(P.reset[2] * 4 * P.rate[2] + 0.5)
    A.lo, A.hi = A.seq[1], A.seq[1]
    for i = 1, #A.seq do
        if A.seq[i] < A.lo then A.lo = A.seq[i] end
        if A.seq[i] > A.hi then A.hi = A.seq[i] end
    end
    if P.mode == 12 then
        A.lo = A.held[1] + P.transpose
        A.hi = A.held[#A.held] + P.transpose + 12 * (k - 1)
    end
    return A
end

-- The notes of the walk's k-th note.
local function notes_at (P, A, k)
    if P.mode == 12 then
        local o = A.octs[floor(k / P.rep) % #A.octs + 1]
        local out = {}
        for i = 1, #A.held do out[i] = A.held[i] + 12 * o + P.transpose end
        return out
    end
    local i = k % #A.seq + 1
    if P.mode == 11 then
        i = hash(floor(k / P.rep), 5) % #A.seq + 1
    elseif P.random > 0 and hash(k, 3) % 100 < P.random then
        i = hash(k, 11) % #A.seq + 1
    end
    return { A.seq[i] }
end

-- Which step the clock is on, for a tempo, a number of steps per beat and a swing of 50-75 %:
-- the first step of every pair lasts swing/50 of a step, the second the rest.
local function clock_step (bpm, perBeat, swing)
    local t = frame * bpm * perBeat / (60 * L.fps)
    local pair = floor(t / 2)
    local s = pair * 2
    if t - s >= 2 * swing / 100 then s = s + 1 end
    return s
end

-- What clock step s plays: its place in the pattern, its type, its notes and velocity, whether
-- its chance came up. A tie carries the step before it on.
local function event_at (P, A, s, depth)
    local sl = s
    if A.resetLen > 0 then sl = s % A.resetLen end
    local j = sl % P.len
    local e = { s = s, j = j, type = P.types[j + 1], sub = 1, vel = 0, played = false }
    e.k = floor(sl / P.len) * A.adv + A.before[j + 1]
    local t = e.type
    if t == REST then return e end
    if t == TIE then
        if (depth or 0) < 8 and s > 0 then
            local prev = event_at(P, A, s - 1, (depth or 0) + 1)
            if prev.played then e.notes, e.vel, e.played = prev.notes, prev.vel, true end
        end
        return e
    end
    e.played = hash(s, 9) % 100 < P.chance[j + 1]
    local vel = P.vel[j + 1]
    if t == ACCENT then vel = vel + P.accent end
    e.vel = clamp(vel, 1, 127)
    local base
    if t == CHORDSTEP then
        base = {}
        for i = 1, #A.held do base[i] = A.held[i] + P.transpose end
    else
        base = notes_at(P, A, e.k)
    end
    e.notes = {}
    for i = 1, #base do e.notes[i] = base[i] + 12 * P.oct[j + 1] end
    if t >= X2 and t <= X4 then e.sub = t - 2 end
    return e
end

local function note_name (n)
    return NAMES[n % 12 + 1] .. whole(floor(n / 12) - 1)
end

-- --- the keyboard ----------------------------------------------------------------------------------

local function key_x (n)
    local WHITE_OF = { 0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6 }
    local pc = n % 12
    local w = (floor((n - L.kb_lo) / 12)) * 7 + WHITE_OF[pc + 1]
    if pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10 then
        return L.kb[1] + (w + 1) * L.kb[3] - floor(L.kb[5] / 2), true
    end
    return L.kb[1] + w * L.kb[3], false
end

local function draw_keys (held, sounding)
    -- White keys first, then every black key beside a lit white one is put back over it, then
    -- the lit black keys: a lit white key is drawn whole, and its neighbours overlap it.
    local state = {}
    for k = 1, #held do state[held[k]] = 1 end
    for k = 1, #sounding do state[sounding[k]] = 2 end
    local restore = {}
    for n = L.kb_lo, L.kb_lo + 35 do
        local s = state[n]
        if s then
            local x, black = key_x(n)
            if not black then
                if s == 2 then part("wplay", x, L.kb[2]) else part("wlit", x, L.kb[2]) end
                local pc = n % 12
                if pc == 2 or pc == 4 or pc == 7 or pc == 9 or pc == 11 then restore[n - 1] = true end
                if pc == 0 or pc == 2 or pc == 5 or pc == 7 or pc == 9 then restore[n + 1] = true end
            end
        end
    end
    for n = L.kb_lo, L.kb_lo + 35 do
        local x, black = key_x(n)
        if black then
            local s = state[n]
            if s == 2 then part("bplay", x, L.kb[2])
            elseif s == 1 then part("blit", x, L.kb[2])
            elseif restore[n] then part("black", x, L.kb[2]) end
        end
    end
end

-- --- page 0: play ----------------------------------------------------------------------------------

local function header_summary (P)
    return MODES[P.mode] .. "   " .. P.rate[1] .. "   " .. whole(P.bpm) .. " BPM"
end

local function chord_name (P)
    return NAMES[P.root + 1] .. " " .. P.chord[1]
end

local function draw_play ()
    local P = settings()
    local A = analyse(P)
    local now = clock_step(P.bpm, P.rate[2], P.swing)
    chrome(T.titles[1], header_summary(P), "E7 CHORD AND E8 ROOT STAND IN FOR HELD KEYS")

    -- The roll: sixteen clock steps, every lane at once. Height is pitch, thickness velocity,
    -- width gate (a tie joins the next step), a ratchet splits its step, a missed chance is a
    -- dim ghost, the playing step is lit.
    local lx, ly, lh, sw = L.lane[1], L.lane[2], L.lane[4], L.lane[5]
    -- the roll's range: the walk's, widened by the octave lane where a step plays, so it does not
    -- rescale as it plays; a faint line at every C
    local lowest, highest = 0, 0
    for i = 1, P.len do
        if P.types[i] ~= REST and P.types[i] ~= TIE then
            if P.oct[i] < lowest then lowest = P.oct[i] end
            if P.oct[i] > highest then highest = P.oct[i] end
        end
    end
    local lo, hi = A.lo + 12 * lowest, A.hi + 12 * highest
    local span = hi - lo
    if span < 12 then span = 12 end
    local c = lo - lo % 12
    if c < lo then c = c + 12 end
    while c <= hi do
        draw_rect(lx, ly + lh - 9 - floor((c - lo) * (lh - 14) / span), L.lane[3], 1, T.c_line)
        c = c + 12
    end
    local base = floor(now / 16) * 16
    local events = {}
    for j = 0, 16 do events[j] = event_at(P, A, base + j) end
    local current
    for j = 0, 15 do
        local e = events[j]
        if e.s == now then current = e end
        if e.notes and #e.notes > 0 then
            local playing = e.s == now
            local x = lx + j * sw + 1
            local legato = events[j + 1].type == TIE and e.played
            local width = floor((sw - 2) * P.gate / 100)
            if legato or e.type == TIE then width = sw end
            if width < 3 then width = 3 end
            local thick = 3 + floor(e.vel * 5 / 127)
            local body, top = T.block, T.block_hi
            if e.type == ACCENT then body, top = T.block_accent, T.block_accent_hi end
            if e.type == CHORDSTEP then body, top = T.block_chord, T.block_chord_hi end
            if not e.played then body, top = T.block_ghost, T.block_ghost end
            if playing and e.played then body, top = T.block_play, T.block_play_hi end
            local subW = floor((sw - 2) / e.sub)
            local simple = #e.notes * e.sub > 4
            for q = 1, #e.notes do
                local y = ly + lh - 6 - thick - floor((e.notes[q] - lo) * (lh - 14) / span)
                for r = 0, e.sub - 1 do
                    local w = width
                    if e.sub > 1 then w = floor(subW * P.gate / 100); if w < 2 then w = 2 end end
                    draw_rect(x + r * subW, y, w, thick, body)
                    if not simple then draw_rect(x + r * subW, y, w, 1, top) end
                end
            end
        end
    end
    draw_rect(lx + (now - base) * sw, ly, sw, 2, T.playhead)
    draw_rect(lx + (now - base) * sw, ly + lh - 2, sw, 2, T.playhead)

    -- The keyboard: the held notes, and the ones sounding now.
    local sounding = {}
    if current.played and current.notes then sounding = current.notes end
    draw_keys(A.held, sounding)

    -- Now: the note, its velocity and what kind of step it is, and where the pattern is.
    local nx, ny, nw = L.now[1], L.now[2], L.now[3]
    local name, colour = "REST", T.dim
    if current.type ~= REST then
        if not current.played then
            name = "SKIP"
        elseif #current.notes > 1 then
            name, colour = "CHORD", T.now
        else
            name, colour = note_name(current.notes[1]), T.now
        end
    end
    say(NOW, name, colour, nx + 8, ny + 3, 84, 26)
    local vel = "--"
    if current.played and current.type ~= REST then vel = whole(current.vel) end
    say(LABEL, "VEL " .. vel, T.label, nx + nw - 52, ny + 4, 48, 12)
    say(LABEL, TYPES[current.type + 1], T.value, nx + nw - 52, ny + 18, 48, 12)
    for i = 0, 7 do
        local c = T.pos_off
        if i < P.len then c = T.pos_on end
        if i == current.j then c = T.accent end
        draw_rect(nx + 8 + i * 17, ny + 37, 13, 4, c)
    end

    cells({ "MODE", "RATE", "OCTAVES", "GATE", "SWING", "TEMPO", "CHORD", "ROOT" },
          { SHORT[P.mode], P.rate[1], whole(P.octaves), whole(P.gate) .. "%", whole(P.swing) .. "%",
            whole(P.bpm), P.chord[1], NAMES[P.root + 1] })
end

-- --- page 1: motion --------------------------------------------------------------------------------

-- The walk itself, before the step pattern: thirty-two of its notes as a contour, the one the
-- arpeggiator is on lit, a tick where the cycle starts again.
local function draw_motion ()
    local P = settings()
    local A = analyse(P)
    local now = clock_step(P.bpm, P.rate[2], P.swing)
    local e = event_at(P, A, now)
    local right = whole(#A.seq) .. "-NOTE CYCLE"
    if P.mode == 11 then right = "RANDOM FROM " .. whole(#A.seq) end
    if P.mode == 12 then right = "CHORDS, " .. whole(#A.octs) .. " OCTAVES" end
    chrome(T.titles[2], right, "THE ORDER OF THE NOTES, BEFORE THE STEP PATTERN")

    local cx, cy, cw, ch = L.contour[1], L.contour[2], L.contour[3], L.contour[4]
    local n = 32
    local pitch = 14
    local lo, hi = A.lo, A.hi
    local span = hi - lo
    if span < 12 then span = 12 end
    -- every C in range, with its name
    local c = lo - lo % 12
    if c < lo then c = c + 12 end
    while c <= hi do
        local y = cy + ch - 8 - floor((c - lo) * (ch - 16) / span)
        draw_rect(cx, y, cw, 1, T.c_line)
        say(FOOT, note_name(c), T.dim, cx + 2, y - 11, 30, 10)
        c = c + 12
    end
    local at = e.k
    local start = floor(at / n) * n
    local cycle = #A.seq
    if P.mode == 12 then cycle = #A.octs * P.rep end
    local py
    for i = 0, n - 1 do
        local k = start + i
        local notes = notes_at(P, A, k)
        local top = notes[#notes]
        local x = cx + i * pitch + 2
        local y = cy + ch - 8 - floor((top - lo) * (ch - 16) / span)
        if py then
            draw_rect(x - pitch + 5, py, pitch, 2, T.contour)
            local a, b = py, y
            if a > b then a, b = b, a end
            if b > a then draw_rect(x + 4, a, 2, b - a + 2, T.contour) end
        end
        if k % cycle == 0 and P.mode ~= 11 and i > 0 then
            draw_rect(x - 3, cy + 2, 1, ch - 4, T.cycle)
        end
        for q = 1, #notes do
            local qy = cy + ch - 8 - floor((notes[q] - lo) * (ch - 16) / span)
            if k == at then part("dot_on", x - 2, qy - 6) else part("dot", x, qy - 4) end
        end
        py = y
    end

    cells({ "OCT ORDER", "REPEAT", "TRANSP", "INVERT", "LENGTH", "ACCENT", "RANDOM", "RESET" },
          { OCT_ORDERS[P.octOrder], "x" .. whole(P.rep), signed(P.transpose), INVERSIONS[P.inversion + 1],
            whole(P.len), "+" .. whole(P.accent), whole(P.random) .. "%", P.reset[1] })
end

-- --- the lane pages --------------------------------------------------------------------------------

-- What every lane page shares: the step numbers, the step keys (lit on the step the clock is
-- on), the steps past the pattern's length dimmed.
local function lane (title, hint, body)
    local P = settings()
    local A = analyse(P)
    local now = clock_step(P.bpm, P.rate[2], P.swing)
    local e = event_at(P, A, now)
    chrome(title, "STEP " .. whole(e.j + 1) .. " / " .. whole(P.len) .. "   " .. P.rate[1], hint)
    for i = 1, 8 do
        local x0 = (i - 1) * L.strip_w
        local cx = x0 + floor(L.strip_w / 2)
        local active = i <= P.len
        local playing = e.j == i - 1
        local numColour = T.dim
        if playing then numColour = T.accent elseif not active then numColour = T.off end
        say(SMALL, whole(i), numColour, x0, L.num_y, L.strip_w, 12)
        body(P, e, i, x0, cx, active, playing)
        if playing then part("key_on" .. i, cx - 22, L.key_y) else part("key" .. i, cx - 22, L.key_y) end
    end
end

local function value_colour (i, active)
    if not active then return T.off end
    return focus_colour(i, T.value)
end

-- page 2: what each step does
local function draw_steps ()
    lane(T.titles[3], "E1-E8  REST NOTE ACCENT TIE x2 x3 x4 CHORD", function (P, e, i, x0, cx, active, playing)
        local t = P.types[i]
        local body, top = T.block, T.block_hi
        if t == ACCENT then body, top = T.block_accent, T.block_accent_hi end
        if t == CHORDSTEP then body, top = T.block_chord, T.block_chord_hi end
        if playing then body, top = T.block_play, T.block_play_hi end
        if not active then body, top = T.off, T.off end
        local y0 = L.glyph_y
        if t == REST then
            draw_rect(cx - 10, y0 + 40, 20, 3, T.off)
        elseif t == NOTE then
            draw_rect(cx - 18, y0 + 26, 36, 30, body); draw_rect(cx - 18, y0 + 26, 36, 2, top)
        elseif t == ACCENT then
            draw_rect(cx - 18, y0 + 4, 36, 52, body); draw_rect(cx - 18, y0 + 4, 36, 2, top)
            draw_rect(cx - 6, y0 - 4, 12, 4, top)
        elseif t == TIE then
            -- the note before carries on through this step: a bar out of the last column
            local from = cx - L.strip_w + 18
            if i == 1 then from = x0 + 6 end
            draw_rect(from, y0 + 36, cx + 18 - from, 10, body)
            draw_rect(from, y0 + 36, cx + 18 - from, 2, top)
        elseif t == CHORDSTEP then
            for b = 0, 2 do
                draw_rect(cx - 18, y0 + 20 + b * 13, 36, 9, body); draw_rect(cx - 18, y0 + 20 + b * 13, 36, 1, top)
            end
        else
            local n = t - 2
            local w = floor((40 - (n - 1) * 4) / n)
            for r = 0, n - 1 do
                draw_rect(cx - 20 + r * (w + 4), y0 + 26, w, 30, body)
                draw_rect(cx - 20 + r * (w + 4), y0 + 26, w, 2, top)
            end
        end
        local text = TYPES[t + 1]
        if not active then text = "OFF" end
        say(CELL, text, value_colour(i, active), x0, L.value_y, L.strip_w, 16)
    end)
end

-- page 3: velocity, with the accent stacked on top of an accented step
local function draw_velocity ()
    lane(T.titles[4], "E1-E8  STEP VELOCITY   ACCENT ADDS ON TOP", function (P, e, i, x0, cx, active, playing)
        local v = P.vel[i]
        local h = floor(v * S.velbar[4] / 127)
        if active then part("velbar", cx - 7, L.vel_base - S.velbar[4], h) end
        if active and P.types[i] == ACCENT and P.accent > 0 then
            local extra = floor(clamp(v + P.accent, 0, 127) * S.velbar[4] / 127) - h
            if extra > 0 then draw_rect(cx - 7, L.vel_base - h - extra, 14, extra, T.block_accent) end
        end
        local text = whole(v)
        if P.types[i] == ACCENT then text = whole(clamp(v + P.accent, 1, 127)) end
        local colour = value_colour(i, active)
        if P.types[i] == REST or P.types[i] == TIE then colour = T.off end
        say(CELL, text, colour, x0, L.value_y, L.strip_w, 16)
    end)
end

-- page 4: octave, a five-rung ladder per step
local function draw_octave ()
    lane(T.titles[5], "E1-E8  STEP OCTAVE, -2 TO +2", function (P, e, i, x0, cx, active, playing)
        local o = P.oct[i]
        local y = L.rung_y + (2 - o) * L.rung_pitch
        if active then
            if playing then part("oct_on", cx - 20, y) else part("oct", cx - 20, y) end
        end
        say(CELL, signed(o), value_colour(i, active), x0, L.value_y, L.strip_w, 16)
    end)
end

-- page 5: chance; on the step the clock is on, whether it came up
local function draw_chance ()
    lane(T.titles[6], "E1-E8  THE CHANCE EACH STEP PLAYS", function (P, e, i, x0, cx, active, playing)
        local c = P.chance[i]
        local lit = floor(c * L.leds / 100)
        if active and lit > 0 then part("leds", cx - 4, L.led_y, lit * L.led_pitch) end
        local text, colour = whole(c) .. "%", value_colour(i, active)
        if playing and active and e.type ~= REST and e.type ~= TIE and not e.played then
            text, colour = "SKIP", T.accent
        end
        say(CELL, text, colour, x0, L.value_y, L.strip_w, 16)
    end)
end

-- --- draw --------------------------------------------------------------------------------------------

local PAGES = { draw_play, draw_motion, draw_steps, draw_velocity, draw_octave, draw_chance }

-- The first redraw shows the loading screen; each of the next three decodes one atlas, so no
-- single redraw blocks the keyboard for long. The atlases are decoded once and kept.
function draw (args)
    if not ready then init("") end
    draws = draws + 1
    if loaded < 3 then
        if draws > 1 then
            local a = ATLAS[loaded + 1]
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
    PAGES[page + 1]()
end
