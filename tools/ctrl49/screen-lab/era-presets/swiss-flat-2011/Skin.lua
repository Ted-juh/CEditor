-- CTRL49 screen lab: the era designs. One renderer for six skins, five pages each:
--   0 CONTROLS     E1-E4  cutoff, resonance, drive, mix, over a filter response curve
--   1 MIXER        E1-E8  eight channel faders with demo meters
--   2 ENVELOPE     E1-E4  attack, decay, sustain, release; the curve comes from the host
--   3 ARP EDIT     a piano roll: E1 step, E2 note, E3 velocity, E4 length, E5 scroll, E6 key,
--                  E7 rate, E8 tempo
--   4 ARP PLAY     the same roll: E1 pattern length, E2 direction, E3 swing, E4 gate, E5 octave,
--                  E6 follow
--
-- This file is the template. make_era_designs.py writes one Skin.lua per design from it,
-- replacing only the GENERATED block below with that design's theme, layout and sprite crops.
-- Change behaviour here and regenerate; never hand-edit a generated Skin.lua.
--
-- What the host sends (Ctrl49ScreenLab preset mode, payloads from Ctrl49ScreenLab.h):
--   set_mode      [mode]                0 = loading, 1 = pages may draw
--   set_frame     [page][frameLo][e1..e8][lastEncoder][playhead][vuL][vuR][pads][frameHi]
--   set_envelope  [110 heights][attackCol][decayEndCol][releaseStartCol][sustain] + 4 texts
-- Only page, frame, the encoders and lastEncoder are read. The device keeps no time, so the
-- arpeggiator's clock is the frame counter: steps = frames x BPM x steps-per-beat / (60 x FPS),
-- with FPS the manifest's requested redraw rate (written into L.fps by the generator).
--
-- The arpeggiator is a pattern on a piano roll: a keyboard on its side down the left, sixteen
-- semitone rows scrolled up and down, and a bar of sixteen steps beside it that turns with the
-- playhead (or to the cursor's bar while you edit). A step holds one note: pitch, velocity, and a
-- length from a quarter of a step to four, or off. The host keeps each encoder's absolute position
-- and stops it at 0 and 127, so E2-E4 pick the step's value up the way a motorless fader does:
-- they leave it alone until they reach it, and a ghost shows where E2 is until then. An empty
-- step takes E2's note, or E4's length, at once. KEY transposes the pattern as a held key would.
-- The pattern lives in this page (the lab has nowhere else to keep it) and starts again from the
-- generated one on restart; in HoSTage the host would own it and edit it with relative turns.
--
-- What the firmware draws: filled rectangles, text boxes and sub-rectangles of decoded PNGs.
-- Every material, gradient and shadow is baked into the three atlases; this page crops and
-- places them. No math library is assumed, and every number shown goes through whole() so
-- Lua 5.2 on the keyboard and the 5.4 preview print the same thing.

-- BEGIN GENERATED (make_era_designs.py writes this block per design)
-- Swiss Flat 2011. Generated: edit make_era_designs.py and EraSkin.lua, then regenerate.
local T = {
    accent = 0xFFFF6A13,
    bar = 0xFFBDBCB6,
    beyond = 0xFFE4E3DD,
    cursor = 0xFF151515,
    dim = 0xFFA9A8A2,
    dot_off = 0xFFCFCEC8,
    dot_on = 0xFF151515,
    env_fill = 0xFFDCE3FA,
    env_fill_how = "rect",
    env_glow = false,
    env_line = 0xFF151515,
    f_big = { 2, 22 },
    f_cell = { 9, 11 },
    f_foot = { 9, 9 },
    f_head = { 9, 11 },
    f_key = { 2, 8 },
    f_label = { 10, 9 },
    f_small = { 2, 9 },
    f_title = { 2, 15 },
    f_value = { 9, 14 },
    filter_fill = 0xFFDCE3FA,
    filter_fill_how = "rect",
    filter_line = 0xFF151515,
    foot = 0xFF8C8B86,
    ghost = 0xFF8C8B86,
    head = 0xFF8C8B86,
    key_label = 0xFF8C8B86,
    knob_tint = { 0xFF2F5BEA, 0xFF13A866, 0xFF2A2A2A, 0xFFFF6A13 },
    label = 0xFF6E6D68,
    line_thick = 2,
    load_bar = 0xFFFF6A13,
    load_bg = 0xFFEEEDE8,
    load_dim = 0xFF8C8B86,
    load_text = 0xFF151515,
    load_track = 0xFFCFCEC8,
    name = "SWISS FLAT 2011",
    note = 0xFF2F5BEA,
    note_hi = 0xFF7D99F2,
    note_loud = 0xFF1A3DB8,
    note_loud_hi = 0xFF5A79E0,
    note_play = 0xFFFF6A13,
    note_play_hi = 0xFFFFAB7A,
    note_soft = 0xFF9DB2F5,
    note_soft_hi = 0xFFC7D3FA,
    playhead = 0xFFFF6A13,
    snap = false,
    title = 0xFF151515,
    titles = { "CONTROLS", "MIXER", "ENVELOPE", "ARP EDIT", "ARP PLAY" },
    track_dark = 0xFFCFCEC8,
    track_fill = 0xFFDEDDD7,
    track_light = 0xFFF8F7F3,
    value = 0xFF151515,
}
local L = {
    bg = { { 577, 0 }, { 577, 272 }, { 577, 544 }, { 581, 460 }, { 581, 460 } },
    cap_top = 48,
    cap_travel = 120,
    cell_bar = { 8, 44, 239, 4 },
    cell_label_y = 210,
    cell_value_y = 221,
    defaults = { { 84, 38, 30, 100, 64, 64, 64, 64 }, { 104, 96, 80, 100, 72, 64, 88, 56 }, { 24, 64, 88, 60, 64, 64, 64, 64 }, { 0, 64, 100, 72, 52, 64, 72, 60 }, { 62, 0, 21, 55, 64, 127, 64, 64 } },
    dots = { 410, 260, 12, 8, 4 },
    env = { 20, 178 },
    env_label_y = 190,
    env_slider = { 20, 112, 104 },
    env_track = { 8, 88, 232 },
    env_value_y = 202,
    filter = { 20, 174, 440, 70 },
    foot = { 14, 254, 380, 16 },
    fps = 15,
    grid = { 50, 46, 416 },
    grid_strip = { 0, 180 },
    head = { 170, 5, 296, 20 },
    knob_focus_y = 164,
    knob_label_y = 40,
    knob_value_y = 144,
    knob_x = { 20, 140, 260, 380 },
    knob_y = 62,
    meter_dx = 44,
    meter_h = 144,
    meter_y = 56,
    mix_label_y = 34,
    mix_value_y = 214,
    pages = 5,
    pattern = { 48, 4, 112, 55, 2, 80, 60, 2, 90, 63, 4, 100, 0, 0, 100, 55, 4, 84, 58, 3, 76, 60, 5, 104, 0, 0, 100, 51, 4, 92, 55, 2, 70, 60, 4, 96, 62, 2, 60, 63, 4, 120, 0, 0, 100, 67, 4, 100, 44, 5, 112, 0, 0, 100, 51, 4, 84, 56, 4, 90, 60, 2, 100, 63, 2, 76, 60, 4, 88, 0, 0, 100, 46, 5, 108, 0, 0, 100, 53, 4, 80, 58, 4, 92, 62, 3, 70, 65, 4, 116, 62, 2, 60, 58, 6, 96, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100 },
    piano = { 6, 40 },
    piano_strip = { 416, 180 },
    row_h = 10,
    rows = 16,
    ruler_y = 32,
    slot_dx = 24,
    step_w = 26,
    strip_w = 60,
    title = { 14, 5, 250, 20 },
}
local S = {
    bcur = { 154, 10, 26, 8 },
    bplay = { 154, 0, 26, 8 },
    fill = { 0, 42, 4, 136 },
    glow = { 80, 0, 12, 12 },
    handle = { 96, 0, 14, 14 },
    hcap = { 38, 0, 22, 28 },
    meter = { 68, 0, 8, 144 },
    peak = { 8, 42, 8, 3 },
    vcap = { 0, 0, 34, 40 },
    wcur = { 112, 10, 40, 9 },
    wplay = { 112, 0, 40, 9 },
}
-- END GENERATED

local PNG, BUF = 14, 18
local WHITE = 0xFFFFFFFF
-- Uploaded PNG ids and the decoded buffers made from them, decoded one per redraw.
local ATLAS = { { 576, 577 }, { 578, 579 }, { 580, 581 } }
local KNOBS, PARTS = 579, 581
local EDIT, PLAY = 3, 4         -- the arpeggiator's two pages

local function floor (x) return x - x % 1 end
local function whole (x)
    local s = tostring(floor(x))
    if s:sub(-2) == ".0" then s = s:sub(1, -3) end
    return s
end
-- One decimal, for readouts: 2.4, -12.0, 0.5.
local function tenths (x)
    local sign = ""
    if x < 0 then sign = "-"; x = -x end
    local t = floor(x * 10 + 0.5)
    return sign .. whole(floor(t / 10)) .. "." .. whole(t % 10)
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
-- The encoders of every page as last seen. The arpeggiator's settings are on two pages and the
-- mixer's meters keep its tempo, and the host only sends the page that is up, so the last values
-- seen stand in for the others (the manifest's defaults until then).
local seen = {}
local env = { cols = {}, a = 0, d = 0, r = 0, sus = 0, texts = { "", "", "", "" } }
local peak = { 0, 0, 0, 0, 0, 0, 0, 0 }
local peakFrame = -1
local steps = {}            -- the pattern: [1..64] = { note = n or nil, len = 0..7, vel = 1..127 }
local cursor = 0
local picked = { false, false, false }      -- note, velocity, length of the step under the cursor
local lastEdit = -1000      -- the frame E1-E4 last moved on, on ARP EDIT
local edit                  -- (defined with the arpeggiator below)

-- --- text --------------------------------------------------------------------------------------

local TITLE, HEAD, LABEL, VALUE, BIG, FOOT, SMALL, CELL, KEYNAME

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
    SMALL = textbox(T.f_small, 1); CELL = textbox(T.f_cell, 1); KEYNAME = textbox(T.f_key, 2)
    for p = 1, L.pages do
        seen[p] = {}
        for i = 1, 8 do seen[p][i] = L.defaults[p][i] end
    end
    for i = 1, 64 do
        local n = L.pattern[i * 3 - 2]
        steps[i] = { note = (n > 0) and n or nil, len = L.pattern[i * 3 - 1], vel = L.pattern[i * 3] }
    end
    local len = 1 + floor(seen[PLAY + 1][1] * 64 / 128)
    cursor = floor(seen[EDIT + 1][1] * len / 128)
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
        if page == EDIT then edit(seen[EDIT + 1], enc) end
        for i = 1, 8 do seen[page + 1][i] = enc[i] end
    end
    framed = true
end

function set_envelope (args)
    for c = 1, 110 do env.cols[c] = get_byte(args, c - 1) end
    env.a = get_byte(args, 110)
    env.d = get_byte(args, 111)
    env.r = get_byte(args, 112)
    env.sus = get_byte(args, 113)
    local i = 114
    for t = 1, 4 do
        local n = get_byte(args, i); i = i + 1
        env.texts[t] = args:sub(i + 1, i + n); i = i + n
    end
end

-- --- drawing helpers -----------------------------------------------------------------------------

-- A sprite from parts.png. srcH crops from the BOTTOM, so a bar grows up from its base.
local function part (name, x, y, srcH)
    local s = S[name]
    local h = srcH or s[4]
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

-- A connected line through column heights: a short level at each column, a riser between
-- columns. Two rectangles per column, so a cliff stays a line and not a dotted gap.
local function trace (x0, base, cols, n, colour, thick, snap)
    local prev = -1
    for c = 1, n do
        local h = cols[c]
        if snap then h = h - h % 2 end
        local x = x0 + (c - 1) * 4
        draw_rect(x, base - h - thick + 1, 4, thick, colour)
        if prev >= 0 and prev ~= h then
            local lo, hi = prev, h
            if lo > hi then lo, hi = hi, lo end
            draw_rect(x, base - hi - thick + 1, thick, hi - lo + thick, colour)
        end
        prev = h
    end
end

-- A filled area under column heights: solid, or cropped from a baked gradient column.
local function area (x0, base, cols, n, how, colour)
    for c = 1, n do
        local h = cols[c]
        if h > 0 then
            local x = x0 + (c - 1) * 4
            if how == "sprite" then
                part("fill", x, base - S.fill[4], h)
            else
                draw_rect(x, base - h, 4, h, colour)
            end
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

-- --- page 0: controls ------------------------------------------------------------------------------

local CONTROL_NAMES = { "CUTOFF", "RESONANCE", "DRIVE", "MIX" }

local function cutoff_text (v)
    local f = 20
    for i = 1, v do f = f * 1.0559 end         -- 20 Hz to 20 kHz over the knob, exponential
    if f < 1000 then return whole(f) .. " Hz" end
    if f < 10000 then return tenths(f / 1000) .. " kHz" end
    return whole(f / 1000) .. " kHz"
end

local function control_text (i, v)
    if i == 1 then return cutoff_text(v) end
    if i == 2 then return whole(v * 100 / 127) .. " %" end
    if i == 3 then return "+" .. tenths(v * 24 / 127) .. " dB" end
    return whole(v * 100 / 127) .. " % WET"
end

-- A 24 dB low-pass, drawn the way a synth's filter page does: flat below the cutoff, a bump of
-- resonance at it, falling away above it. Drive lifts the pass band a little. Pure arithmetic.
local response = {}
local function filter_heights (cut, res, drive)
    local gh = L.filter[4]
    local n = floor(L.filter[3] / 4)
    local pc = cut * (n - 1) / 127
    local h0 = gh * (0.46 + drive * 0.14 / 127)
    local bump = res * gh * 0.42 / 127
    for c = 1, n do
        local d = (c - 1) - pc
        local h = h0
        if d > 0 then h = h0 - d * 3.4 end
        local ad = d
        if ad < 0 then ad = -ad end
        if ad < 9 then
            local k = 1 - ad / 9
            h = h + bump * k * k
        end
        response[c] = floor(clamp(h, 0, gh - 3))
    end
    return n
end

local function draw_controls ()
    chrome(T.titles[1], T.name, "E1-E4   CUTOFF   RESONANCE   DRIVE   MIX")
    for i = 1, 4 do
        local x = L.knob_x[i]
        local v = enc[i]
        local f = floor(v * 63 / 127 + 0.5)
        draw_image(BUF, KNOBS, x, L.knob_y, 0, f * 80, 80, 80, T.knob_tint[i])
        say(LABEL, CONTROL_NAMES[i], focus_colour(i, T.label), x - 14, L.knob_label_y, 108, 14)
        say(VALUE, control_text(i, v), focus_colour(i, T.value), x - 14, L.knob_value_y, 108, 18)
        if last == i - 1 then draw_rect(x + 22, L.knob_focus_y, 36, 2, T.accent) end
    end
    local n = filter_heights(enc[1], enc[2], enc[3])
    local base = L.filter[2] + L.filter[4]
    if T.filter_fill then area(L.filter[1], base, response, n, T.filter_fill_how, T.filter_fill) end
    trace(L.filter[1], base, response, n, T.filter_line, T.line_thick, T.snap)
end

-- --- page 1: mixer -----------------------------------------------------------------------------------

local CHANNELS = { "KICK", "SNARE", "HATS", "BASS", "KEYS", "PAD", "LEAD", "FX" }
-- Demo program material: each channel hits on its own sixteenths and decays at its own rate.
local HITS = { "x...x...x...x...", "....x.......x...", "x.x.x.x.x.x.x.x.", "x..x..x...x..x..",
               "x.....x.....x...", "x...............", "..x...x..x....x.", "........x......." }
local DECAY = { 0.22, 0.16, 0.45, 0.14, 0.12, 0.03, 0.10, 0.06 }

local function fader_db (v)
    local P = { { 0, -60 }, { 16, -40 }, { 40, -24 }, { 64, -12 }, { 90, -3 }, { 100, 0 }, { 127, 6 } }
    for k = 2, #P do
        if v <= P[k][1] then
            local a, b = P[k - 1], P[k]
            return a[2] + (b[2] - a[2]) * (v - a[1]) / (b[1] - a[1])
        end
    end
    return 6
end

local function fader_text (v)
    if v == 0 then return "OFF" end
    local db = fader_db(v)
    if db > 0.04 then return "+" .. tenths(db) end
    if db > -0.05 then return "0.0" end
    return tenths(db)
end

local function sixteenths ()
    local bpm = 60 + seen[EDIT + 1][8]          -- the arpeggiator's tempo
    return frame * bpm * 4 / (60 * L.fps)
end

local function meter_level (i, v)
    local s = sixteenths()
    local pattern = HITS[i]
    local at = floor(s)
    local dt = 16
    for back = 0, 15 do
        local k = (at - back) % 16
        if pattern:sub(k + 1, k + 1) == "x" then
            dt = s - (at - back)
            break
        end
    end
    local level = 1 - dt * DECAY[i]
    if level < 0 then level = 0 end
    if i == 6 then level = 0.55 + 0.25 * level end         -- the pad sustains
    local jitter = ((frame * 7 + i * 13) % 5) - 2
    return floor(clamp(level * L.meter_h * 0.92 * v / 127 + jitter * level, 0, L.meter_h))
end

local function draw_mixer ()
    chrome(T.titles[2], "DEMO METERS", "E1-E8   CHANNEL LEVELS")
    local newFrame = frame ~= peakFrame
    peakFrame = frame
    for i = 1, 8 do
        local x0 = (i - 1) * L.strip_w
        local v = enc[i]
        local lvl = meter_level(i, v)
        if newFrame then
            peak[i] = peak[i] - 3
            if lvl > peak[i] then peak[i] = lvl end
        end
        if lvl > 0 then part("meter", x0 + L.meter_dx, L.meter_y, lvl) end
        if peak[i] > 3 then
            part("peak", x0 + L.meter_dx, L.meter_y + L.meter_h - floor(peak[i]))
        end
        local top = L.cap_top + floor((127 - v) * L.cap_travel / 127)
        part("vcap", x0 + L.slot_dx - 17, top)
        say(LABEL, CHANNELS[i], focus_colour(i, T.label), x0, L.mix_label_y, L.strip_w, 12)
        say(VALUE, fader_text(v), focus_colour(i, T.value), x0, L.mix_value_y, L.strip_w, 16)
    end
end

-- --- page 2: envelope --------------------------------------------------------------------------------

local ENV_NAMES = { "ATTACK", "DECAY", "SUSTAIN", "RELEASE" }

local function draw_envelope ()
    chrome(T.titles[3], "AMP", "E1-E4   ATTACK   DECAY   SUSTAIN   RELEASE")
    local cols = env.cols
    local n = #cols
    local x0, base = L.env[1], L.env[2]
    if n > 0 then
        if T.env_fill then area(x0, base, cols, n, T.env_fill_how, T.env_fill) end
        if T.env_glow then
            for c = 1, n do
                local h = cols[c]
                if T.snap then h = h - h % 2 end
                part("glow", x0 + (c - 1) * 4 - 4, base - h - 6)
                if c < n then
                    local d = cols[c + 1] - h
                    if d < 0 then d = -d end
                    local extra = floor(d / 14)                     -- a steep stretch glows along its length
                    for k = 1, extra do
                        part("glow", x0 + (c - 1) * 4 - 2, base - h - 6 - floor((cols[c + 1] - h) * k / (extra + 1)))
                    end
                end
            end
        end
        trace(x0, base, cols, n, T.env_line, T.line_thick, T.snap)
        local marks = { { env.a, cols[env.a + 1] }, { env.d, env.sus }, { env.r, env.sus } }
        for i = 1, 3 do
            part("handle", x0 + marks[i][1] * 4 - 5, base - marks[i][2] - 7)
        end
    end
    for i = 1, 4 do
        local x = L.env_slider[1] + (i - 1) * L.env_slider[2]
        local w = L.env_slider[3]
        say(LABEL, ENV_NAMES[i], focus_colour(i, T.label), x, L.env_label_y, w, 12)
        say(VALUE, env.texts[i], focus_colour(i, T.value), x, L.env_value_y, w, 16)
        local travel = L.env_track[2] - S.hcap[3]
        part("hcap", x + L.env_track[1] + floor(enc[i] * travel / 127), L.env_track[3] - 14)
    end
end

-- --- pages 3 and 4: the arpeggiator, a piano roll ---------------------------------------

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

function edit (before, now)
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

-- --- the roll -------------------------------------------------------------------------------------

local function is_black (n)
    local pc = n % 12
    return pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10
end

-- The cells under the roll: a label, a value, and the encoder's position on a track drawn live
-- (the two pages share one background and have six and eight cells).
local function roll_cells (labels, values, count)
    for i = 1, count do
        local x0 = (i - 1) * L.strip_w
        local tx, ty, tw, th = x0 + L.cell_bar[1], L.cell_bar[3], L.cell_bar[2], L.cell_bar[4]
        draw_rect(tx, ty - 1, tw, 1, T.track_dark)
        draw_rect(tx, ty, tw, th, T.track_fill)
        draw_rect(tx, ty + th, tw, 1, T.track_light)
        say(LABEL, labels[i], focus_colour(i, T.label), x0, L.cell_label_y, L.strip_w, 11)
        say(CELL, values[i], focus_colour(i, T.value), x0, L.cell_value_y, L.strip_w, 15)
        local fill = floor(enc[i] * L.cell_bar[2] / 127)
        if fill > 0 then
            draw_rect(x0 + L.cell_bar[1], L.cell_bar[3], fill, L.cell_bar[4], focus_colour(i, T.bar))
        end
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
    draw_image(BUF, PARTS, gx, gy, L.grid_strip[1], L.grid_strip[2] + o * rh, gw, rows * rh, WHITE)
    draw_image(BUF, PARTS, px, gy, L.piano_strip[1], L.piano_strip[2] + o * rh, pw, rows * rh, WHITE)

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

local function draw_arp_edit ()
    local P = settings()
    local pos = position(P)
    local bar = shown_bar(P, pos)
    chrome(T.titles[4], summary(P, bar), "E1 STEP  E2 NOTE  E3 VEL  E4 LENGTH  E5 SCROLL")
    roll(P, pos, bar, true)
    local st = steps[cursor + 1]
    local note, vel, len = "--", "--", LENGTHS[1]
    if st.note and st.len > 0 then
        note, vel, len = note_name(st.note + P.shift), whole(st.vel), LENGTHS[st.len + 1]
    end
    roll_cells({ "STEP", "NOTE", "VELOCITY", "LENGTH", "SCROLL", "KEY", "RATE", "TEMPO" },
          { whole(cursor + 1), note, vel, len, note_name(P.scroll), signed(P.key), P.rate[1], whole(P.bpm) }, 8)
end

local function draw_arp_play ()
    local P = settings()
    local pos = position(P)
    local bar = shown_bar(P, pos)
    chrome(T.titles[5], summary(P, bar), "THE VIEW FOLLOWS THE PLAYHEAD, OR THE CURSOR")
    roll(P, pos, bar, false)
    local follow = "OFF"
    if P.follow then follow = "ON" end
    roll_cells({ "LENGTH", "DIRECTION", "SWING", "GATE", "OCTAVE", "FOLLOW" },
          { whole(P.len), DIRECTIONS[P.dir], whole(P.swing) .. "%", whole(P.gate) .. "%", signed(P.oct), follow }, 6)
end

-- --- draw --------------------------------------------------------------------------------------------

local PAGES = { draw_controls, draw_mixer, draw_envelope, draw_arp_edit, draw_arp_play }

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
