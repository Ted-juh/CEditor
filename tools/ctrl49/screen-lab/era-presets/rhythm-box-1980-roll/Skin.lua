-- CTRL49 screen lab: a pattern arpeggiator, as a mockup. A piano roll:
--
--   left   a keyboard on its side, one row a semitone, sixteen rows at a time, scrolled up and
--          down (EDIT E5)
--   right  sixteen steps of the pattern: one bar. The view turns to the bar the playhead is in;
--          while you edit, it shows the bar the cursor is in.
--
--   0 EDIT  E1 step   E2 note   E3 velocity  E4 length  E5 scroll  E6 key   E7 rate  E8 tempo
--   1 PLAY  E1 pattern length   E2 direction  E3 swing  E4 gate    E5 octave  E6 follow
--
-- A step holds one note: its pitch, velocity and length (a quarter of a step up to four steps,
-- or off). E2-E4 edit the step under the cursor and pick its value up the way a motorless fader
-- does: an encoder only moves the step once it has reached the step's value, and until then a
-- ghost shows where the encoder is. An empty step takes E2's note, or E4's length, at once.
-- KEY transposes the whole pattern, as a held key does on an arpeggiator; the lab hears no keys,
-- so an encoder stands in for it. Everything is drawn as it plays: transposed, so a row of the
-- grid and the key beside it are the same note.
--
-- This file is the template. make_roll_mockup.py writes the design's Skin.lua from it, replacing
-- only the GENERATED block below. Never hand-edit Skin.lua.
--
-- What the host sends (Ctrl49ScreenLab preset mode, payloads from Ctrl49ScreenLab.h):
--   set_mode   [mode]       0 = loading, 1 = pages may draw
--   set_frame  [page][frameLo][e1..e8][lastEncoder][playhead][vuL][vuR][pads][frameHi]
-- set_envelope is accepted and ignored: this design has no envelope page.
--
-- The pattern is kept here, because the lab has nowhere else to keep it, and starts again from
-- the generated one when the lab restarts. In HoSTage the host would own it, and the encoders'
-- relative turns (Ctrl49Reducer's encoderDelta) would edit it with no pick-up at all. The device
-- keeps no time, so the clock is the frame counter: steps = frames x BPM x steps-per-beat /
-- (60 x FPS). No math library is assumed; every number shown goes through whole().

-- BEGIN GENERATED (make_roll_mockup.py writes this block)
-- Rhythm Box 1980 Roll. Generated: edit make_roll_mockup.py and RollSkin.lua, then regenerate.
local T = {
    accent = 0xFFF2C514,
    bar = 0xFFF07F1A,
    beyond = 0xFF0F0F10,
    cursor = 0xFFF07F1A,
    dim = 0xFF77746E,
    dot_off = 0xFF4A4A4C,
    dot_on = 0xFFF07F1A,
    f_big = { 0, 24 },
    f_cell = { 10, 11 },
    f_foot = { 10, 9 },
    f_head = { 2, 11 },
    f_key = { 2, 8 },
    f_label = { 2, 9 },
    f_small = { 2, 9 },
    f_title = { 0, 15 },
    foot = 0xFF8E8C86,
    ghost = 0xFFEDE6CF,
    head = 0xFFA9A6A0,
    key_label = 0xFF6A6052,
    label = 0xFFC9C4B5,
    load_bar = 0xFFF07F1A,
    load_bg = 0xFF2B2B2D,
    load_dim = 0xFF8E8C86,
    load_text = 0xFFEDE6CF,
    load_track = 0xFF46464A,
    name = "RHYTHM BOX 1980 ROLL",
    note = 0xFFF07F1A,
    note_hi = 0xFFFFB36B,
    note_loud = 0xFFE8342C,
    note_loud_hi = 0xFFFF8A80,
    note_play = 0xFFF2C514,
    note_play_hi = 0xFFFFF0A0,
    note_soft = 0xFFA5561A,
    note_soft_hi = 0xFFD9823A,
    off = 0xFF4A4A4C,
    playhead = 0xFFF2C514,
    title = 0xFFEDE6CF,
    titles = { "EDIT", "PLAY" },
    value = 0xFFF4EFE2,
}
local L = {
    bg = { 0, 272 },
    cell_bar = { 8, 44, 239, 4 },
    cell_label_y = 210,
    cell_value_y = 221,
    defaults = { { 0, 64, 100, 72, 52, 64, 72, 60 }, { 62, 0, 21, 55, 64, 127, 64, 64 } },
    dots = { 440, 260, 12, 8, 4 },
    foot = { 14, 254, 380, 16 },
    fps = 15,
    grid = { 48, 46, 416 },
    grid_strip = { 0, 0 },
    head = { 170, 5, 296, 20 },
    pages = 2,
    pattern = { 48, 4, 112, 55, 2, 80, 60, 2, 90, 63, 4, 100, 0, 0, 100, 55, 4, 84, 58, 3, 76, 60, 5, 104, 0, 0, 100, 51, 4, 92, 55, 2, 70, 60, 4, 96, 62, 2, 60, 63, 4, 120, 0, 0, 100, 67, 4, 100, 44, 5, 112, 0, 0, 100, 51, 4, 84, 56, 4, 90, 60, 2, 100, 63, 2, 76, 60, 4, 88, 0, 0, 100, 46, 5, 108, 0, 0, 100, 53, 4, 80, 58, 4, 92, 62, 3, 70, 65, 4, 116, 62, 2, 60, 58, 6, 96, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100 },
    piano = { 4, 40 },
    piano_strip = { 416, 0 },
    row_h = 10,
    rows = 16,
    ruler_y = 32,
    step_w = 26,
    strip_w = 60,
    title = { 14, 5, 150, 20 },
}
local S = {
    bcur = { 42, 10, 26, 8 },
    bplay = { 42, 0, 26, 8 },
    wcur = { 0, 10, 40, 9 },
    wplay = { 0, 0, 40, 9 },
}
-- END GENERATED

local PNG, BUF = 14, 18
local WHITE = 0xFFFFFFFF
-- Uploaded PNG ids and the decoded buffers made from them, decoded one per redraw.
local ATLAS = { { 576, 577 }, { 578, 579 }, { 580, 581 } }
local PANELS, ROLL, PARTS = 577, 579, 581
local EDIT, PLAY = 0, 1

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

-- --- state ---------------------------------------------------------------------------------------

local mode, ready, loaded, draws, framed = 0, false, 0, 0, false
local page, frame, last = 0, 0, -1
local enc = { 0, 0, 0, 0, 0, 0, 0, 0 }
local seen = {}             -- every page's encoders as last seen (the manifest's until then)
local steps = {}            -- [1..64] = { note = n or nil, len = 0..7, vel = 1..127 }
local cursor = 0
local picked = { false, false, false }      -- note, velocity, length of the step under the cursor
local lastEdit = -1000      -- the frame E1-E4 last moved on

-- --- text --------------------------------------------------------------------------------------

local TITLE, HEAD, LABEL, BIG, FOOT, SMALL, CELL, KEYNAME

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

-- --- the settings --------------------------------------------------------------------------------

local NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
local RATES = { { "1/4", 1 }, { "1/4T", 1.5 }, { "1/8", 2 }, { "1/8T", 3 },
                { "1/16", 4 }, { "1/16T", 6 }, { "1/32", 8 }, { "1/32T", 12 } }
local DIRECTIONS = { "FWD", "REV", "PING", "RANDOM" }
local LENGTHS = { "OFF", "25%", "50%", "75%", "1 STEP", "2 STEPS", "3 STEPS", "4 STEPS" }
local SPANS = { 0, 0.25, 0.5, 0.75, 1, 2, 3, 4 }
local NOTE_LOW = 28                          -- E2's note: 28 + value / 2, E1 to G6

local function index_of (n, v) return floor(v * n / 128) + 1 end
local function note_of (v) return NOTE_LOW + floor(v / 2) end
local function length_of (v) return floor(v * 8 / 128) end

local function settings ()
    local e, p = seen[EDIT + 1], seen[PLAY + 1]
    local P = {
        scroll = 24 + floor(e[5] * 60 / 128), key = floor(e[6] * 25 / 128) - 12,
        rate = RATES[index_of(8, e[7])], bpm = 60 + e[8],
        len = 1 + floor(p[1] * 64 / 128), dir = index_of(4, p[2]), swing = 50 + floor(p[3] * 25 / 127),
        gate = 25 + floor(p[4] * 175 / 127), oct = floor(p[5] * 5 / 128) - 2, follow = p[6] >= 64,
    }
    P.shift = P.key + 12 * P.oct
    return P
end

local function note_name (n)
    return NAMES[n % 12 + 1] .. whole(floor(n / 12) - 1)
end

-- --- editing --------------------------------------------------------------------------------------

-- Whether an encoder moving from a to b reached or crossed a value v (both mapped the same way).
local function reaches (a, b, v) return (a - v) * (b - v) <= 0 end

local function edit (before, now)
    local P = settings()
    local c = floor(now[1] * P.len / 128)
    if c ~= cursor then
        cursor = c
        picked = { false, false, false }
    end
    for i = 1, 4 do
        if now[i] ~= before[i] then lastEdit = frame end
    end
    local st = steps[cursor + 1]
    local empty = st.note == nil or st.len == 0
    if now[2] ~= before[2] then
        local shown = note_of(now[2])
        if empty or picked[1] or reaches(note_of(before[2]), shown, st.note + P.shift) then
            st.note = shown - P.shift
            if st.len == 0 then st.len = 4 end
            picked[1] = true
            empty = false
        end
    end
    if now[3] ~= before[3] and not empty then
        if picked[2] or reaches(before[3], now[3], st.vel) then
            st.vel = clamp(now[3], 1, 127)
            picked[2] = true
        end
    end
    if now[4] ~= before[4] then
        local len = length_of(now[4])
        if empty or picked[3] or reaches(length_of(before[4]), len, st.len) then
            if st.note == nil then st.note = note_of(now[2]) - P.shift end
            st.len = len
            picked[3] = true
        end
    end
end

-- --- what the host sends -------------------------------------------------------------------------

function init (args)
    if ready then return end
    TITLE = textbox(T.f_title, 0); HEAD = textbox(T.f_head, 2); LABEL = textbox(T.f_label, 1)
    BIG = textbox(T.f_big, 1); FOOT = textbox(T.f_foot, 0); SMALL = textbox(T.f_small, 1)
    CELL = textbox(T.f_cell, 1); KEYNAME = textbox(T.f_key, 2)
    for p = 1, L.pages do
        seen[p] = {}
        for i = 1, 8 do seen[p][i] = L.defaults[p][i] end
    end
    for i = 1, 64 do
        local n = L.pattern[i * 3 - 2]
        steps[i] = { note = (n > 0) and n or nil, len = L.pattern[i * 3 - 1], vel = L.pattern[i * 3] }
    end
    for i = 1, 8 do enc[i] = seen[1][i] end
    cursor = floor(seen[1][1] * settings().len / 128)
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
        if page == EDIT then edit(seen[EDIT + 1], enc) end
        for i = 1, 8 do seen[page + 1][i] = enc[i] end
    end
    framed = true
end

function set_envelope (args) end

-- --- the clock ---------------------------------------------------------------------------------------

local function hash (x, seed)
    return floor(((x * 2654435761 + seed * 97531) % 4294967296) / 65536)
end

-- Which step of the pattern the playhead is on: the clock's step (swung: the first of every pair
-- lasts swing/50 of a step), walked forwards, backwards, there and back, or at random.
local function position (P)
    local t = frame * P.bpm * P.rate[2] / (60 * L.fps)
    local pair = floor(t / 2)
    local s = pair * 2
    if t - s >= 2 * P.swing / 100 then s = s + 1 end
    local n = P.len
    if P.dir == 2 then return n - 1 - s % n end
    if P.dir == 3 then
        if n < 2 then return 0 end
        local q = s % (2 * n - 2)
        if q < n then return q end
        return 2 * n - 2 - q
    end
    if P.dir == 4 then return hash(s, 5) % n end
    return s % n
end

-- A step's note, as it sounds, and how many steps it lasts (the gate scales every length).
local function sounding_note (P, i)
    local st = steps[i + 1]
    if st == nil or st.note == nil or st.len == 0 then return nil end
    return st.note + P.shift, SPANS[st.len + 1] * P.gate / 100
end

-- The notes sounding with the playhead on step pos: its own, and any longer one still held over.
local function sounding (P, pos)
    local out = {}
    for back = 0, 4 do
        local i = pos - back
        if i >= 0 then
            local n, span = sounding_note(P, i)
            if n and (back == 0 or span > back) then out[#out + 1] = n end
        end
    end
    return out
end

-- --- drawing -----------------------------------------------------------------------------------------

local function part (name, x, y)
    local s = S[name]
    draw_image(BUF, PARTS, x, y, s[1], s[2], s[3], s[4], WHITE)
end

local function is_black (n)
    local pc = n % 12
    return pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10
end

local function focus_colour (i, normal)
    if last == i - 1 then return T.accent end
    return normal
end

local function cells (labels, values, count)
    for i = 1, count do
        local x0 = (i - 1) * L.strip_w
        say(LABEL, labels[i], focus_colour(i, T.label), x0, L.cell_label_y, L.strip_w, 11)
        say(CELL, values[i], focus_colour(i, T.value), x0, L.cell_value_y, L.strip_w, 15)
        local fill = floor(enc[i] * L.cell_bar[2] / 127)
        if fill > 0 then
            draw_rect(x0 + L.cell_bar[1], L.cell_bar[3], fill, L.cell_bar[4], focus_colour(i, T.bar))
        end
    end
end

local function chrome (title, right, hint)
    draw_image(BUF, PANELS, 0, 0, 0, L.bg[page + 1], 480, 272, WHITE)
    say(TITLE, title, T.title, L.title[1], L.title[2], L.title[3], L.title[4])
    say(HEAD, right, T.head, L.head[1], L.head[2], L.head[3], L.head[4])
    say(FOOT, hint, T.foot, L.foot[1], L.foot[2], L.foot[3], L.foot[4])
    for i = 0, L.pages - 1 do
        local c = T.dot_off
        if i == page then c = T.dot_on end
        draw_rect(L.dots[1] + i * L.dots[3], L.dots[2], L.dots[4], L.dots[5], c)
    end
end

-- The roll: the keyboard and the grid for the sixteen notes from the scroll up, the bar of
-- sixteen steps, the notes, the playhead, and on EDIT the cursor and its ghost.
local function roll (P, pos, bar, editing)
    local gx, gy, gw = L.grid[1], L.grid[2], L.grid[3]
    local rows, rh, sw = L.rows, L.row_h, L.step_w
    local px, pw = L.piano[1], L.piano[2]
    local low = P.scroll
    local top = low + rows - 1
    local function row_y (n) return gy + (top - n) * rh end

    -- Both strips repeat every octave and start on a B, so one crop each draws any scroll.
    local o = (11 - top % 12) % 12
    draw_image(BUF, ROLL, gx, gy, L.grid_strip[1], L.grid_strip[2] + o * rh, gw, rows * rh, WHITE)
    draw_image(BUF, ROLL, px, gy, L.piano_strip[1], L.piano_strip[2] + o * rh, pw, rows * rh, WHITE)

    -- steps past the pattern's end are shaded off
    local first = bar * 16
    local endCol = P.len - first
    if endCol < 16 then draw_rect(gx + endCol * sw, gy, (16 - endCol) * sw, rows * rh, T.beyond) end
    local right = gx + clamp(endCol, 0, 16) * sw

    -- the notes, starting a few steps back so a long note from the bar before shows its tail
    for i = -4, 15 do
        local idx = first + i
        if idx >= 0 and idx < P.len then
            local n, span = sounding_note(P, idx)
            if n then
                local x0 = gx + i * sw + 1
                local x1 = gx + floor((i + span) * sw) - 1
                if x1 > gx then                          -- (a tail that ends before the bar is not drawn)
                    if x1 > right then x1 = right - 1 end
                    if x0 < gx then x0 = gx end
                    if x1 - x0 < 2 then x1 = x0 + 2 end
                    local st = steps[idx + 1]
                    local body, hi = T.note, T.note_hi
                    if st.vel < 64 then body, hi = T.note_soft, T.note_soft_hi end
                    if st.vel >= 110 then body, hi = T.note_loud, T.note_loud_hi end
                    local covers = idx <= pos and pos < idx + span
                    if covers or idx == pos then body, hi = T.note_play, T.note_play_hi end
                    if n > top then
                        if i >= 0 then draw_rect(x0 + 6, gy + 1, sw - 14, 3, body) end
                    elseif n < low then
                        if i >= 0 then draw_rect(x0 + 6, gy + rows * rh - 4, sw - 14, 3, body) end
                    else
                        draw_rect(x0, row_y(n) + 1, x1 - x0, rh - 2, body)
                        draw_rect(x0, row_y(n) + 1, x1 - x0, 1, hi)
                    end
                end
            end
        end
    end

    -- the playhead, above and below its column
    if floor(pos / 16) == bar then
        local x = gx + (pos % 16) * sw
        draw_rect(x, gy - 3, sw, 2, T.playhead)
        draw_rect(x, gy + rows * rh + 1, sw, 2, T.playhead)
    end

    -- the cursor: its column outlined, and while E2 has not picked the note up, a ghost
    -- where E2 would put it
    if editing and floor(cursor / 16) == bar then
        local x = gx + (cursor % 16) * sw
        draw_rect(x, gy, sw, 1, T.cursor)
        draw_rect(x, gy + rows * rh - 1, sw, 1, T.cursor)
        draw_rect(x, gy, 1, rows * rh, T.cursor)
        draw_rect(x + sw - 1, gy, 1, rows * rh, T.cursor)
        local here = sounding_note(P, cursor)
        local ghost = note_of(enc[2])
        if not picked[1] and ghost ~= here then
            local y
            if ghost > top then y = gy + 1 elseif ghost < low then y = gy + rows * rh - rh - 1 else y = row_y(ghost) end
            draw_rect(x + 2, y + 1, sw - 4, 1, T.ghost)
            draw_rect(x + 2, y + rh - 2, sw - 4, 1, T.ghost)
            draw_rect(x + 2, y + 1, 1, rh - 2, T.ghost)
            draw_rect(x + sw - 3, y + 1, 1, rh - 2, T.ghost)
        end
    end

    -- the keyboard: the notes sounding lit, the cursor's note marked, every C named
    local lit = sounding(P, pos)
    local state = {}
    if editing and floor(cursor / 16) == bar then
        local n = sounding_note(P, cursor)
        if n then state[n] = 1 end
    end
    for k = 1, #lit do state[lit[k]] = 2 end
    for n = low, top do
        local s = state[n]
        if s then
            if is_black(n) then
                if s == 2 then part("bplay", px, row_y(n) + 1) else part("bcur", px, row_y(n) + 1) end
            else
                if s == 2 then part("wplay", px, row_y(n)) else part("wcur", px, row_y(n)) end
            end
        end
        if n % 12 == 0 then say(KEYNAME, note_name(n), T.key_label, px + pw - 22, row_y(n), 20, rh) end
    end

    -- the ruler: step numbers of the bar shown, the playhead's and the cursor's lit
    say(SMALL, "BAR " .. whole(bar + 1), T.dim, px, L.ruler_y, pw, 12)
    for i = 0, 15 do
        local idx = first + i
        local c = T.dim
        if idx >= P.len then c = T.off
        elseif idx == pos then c = T.accent
        elseif editing and idx == cursor then c = T.cursor end
        say(SMALL, whole(idx + 1), c, gx + i * sw, L.ruler_y, sw, 12)
    end
end

local function shown_bar (P, pos)
    local since = frame - lastEdit
    if since < 0 then since = 1000 end
    if P.follow and (page ~= EDIT or since > L.fps * 2) then return floor(pos / 16) end
    return floor(cursor / 16)
end

local function summary (P, bar)
    local bars = floor((P.len + 15) / 16)
    local key = NAMES[(P.key % 12) + 1]
    return "BAR " .. whole(bar + 1) .. "/" .. whole(bars) .. "   KEY " .. key .. "   "
        .. P.rate[1] .. "   " .. whole(P.bpm) .. " BPM"
end

local function draw_edit ()
    local P = settings()
    local pos = position(P)
    local bar = shown_bar(P, pos)
    chrome(T.titles[1], summary(P, bar), "E1 STEP  E2 NOTE  E3 VEL  E4 LENGTH  E5 SCROLL")
    roll(P, pos, bar, true)
    local st = steps[cursor + 1]
    local note, vel, len = "--", "--", LENGTHS[1]
    if st.note and st.len > 0 then
        note, vel, len = note_name(st.note + P.shift), whole(st.vel), LENGTHS[st.len + 1]
    end
    cells({ "STEP", "NOTE", "VELOCITY", "LENGTH", "SCROLL", "KEY", "RATE", "TEMPO" },
          { whole(cursor + 1), note, vel, len, note_name(P.scroll), signed(P.key), P.rate[1], whole(P.bpm) }, 8)
end

local function draw_play ()
    local P = settings()
    local pos = position(P)
    local bar = shown_bar(P, pos)
    chrome(T.titles[2], summary(P, bar), "THE VIEW FOLLOWS THE PLAYHEAD, OR THE CURSOR")
    roll(P, pos, bar, false)
    local follow = "OFF"
    if P.follow then follow = "ON" end
    cells({ "LENGTH", "DIRECTION", "SWING", "GATE", "OCTAVE", "FOLLOW" },
          { whole(P.len), DIRECTIONS[P.dir], whole(P.swing) .. "%", whole(P.gate) .. "%", signed(P.oct), follow }, 6)
end

-- --- the loading screen and draw -----------------------------------------------------------------

local function loading ()
    draw_rect(0, 0, 480, 272, T.load_bg)
    say(BIG, T.name, T.load_text, 0, 96, 480, 30)
    say(LABEL, "LOADING  " .. whole(loaded) .. " / 3", T.load_dim, 0, 132, 480, 16)
    draw_rect(150, 160, 180, 4, T.load_track)
    if loaded > 0 then draw_rect(150, 160, floor(180 * loaded / 3), 4, T.load_bar) end
end

local PAGES = { draw_edit, draw_play }

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
