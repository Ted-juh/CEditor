-- CTRL49 screen lab: the era designs. One renderer for six skins, five pages each:
--   0 CONTROLS     E1-E4  cutoff, resonance, drive, mix, over a filter response curve
--   1 MIXER        E1-E8  eight channel faders with demo meters
--   2 ENVELOPE     E1-E4  attack, decay, sustain, release; the curve comes from the host
--   3 SEQUENCER    E1-E8  the pitch of steps 1-8 (0 = rest)
--   4 ARPEGGIATOR  E1-E8  mode, rate, octaves, gate, swing, tempo, chord, rhythm
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
-- sequencer and arpeggiator clocks are the frame counter: steps = frames x BPM / (60 x FPS),
-- with FPS the manifest's requested redraw rate (written into L.fps by the generator).
--
-- What the firmware draws: filled rectangles, text boxes and sub-rectangles of decoded PNGs.
-- Every material, gradient and shadow is baked into the three atlases; this page crops and
-- places them. No math library is assumed, and every number shown goes through whole() so
-- Lua 5.2 on the keyboard and the 5.4 preview print the same thing.

-- BEGIN GENERATED (make_era_designs.py writes this block per design)
-- Test Bench 1958. Generated: edit make_era_designs.py and EraSkin.lua, then regenerate.
local T = {
    accent = 0xFFFFB04A,
    bar = 0xFFFFB04A,
    block = 0xFF4FD46E,
    block_hi = 0xFFB8FFC8,
    block_play = 0xFFF2FFF4,
    block_play_hi = 0xFFFFFFFF,
    dim = 0xFFA8AE9F,
    dot_off = 0xFF3E4840,
    dot_on = 0xFFFFB04A,
    env_fill = 0xFF5EE07A,
    env_fill_how = "sprite",
    env_glow = true,
    env_line = 0xFFA8FFB8,
    f_big = { 0, 24 },
    f_cell = { 10, 11 },
    f_foot = { 2, 9 },
    f_head = { 2, 11 },
    f_label = { 2, 9 },
    f_small = { 2, 9 },
    f_title = { 0, 14 },
    f_value = { 10, 14 },
    filter_fill = 0xFF5EE07A,
    filter_fill_how = "sprite",
    filter_line = 0xFF9DFFB0,
    foot = 0xFFD2CCB6,
    head = 0xFFE6DDC2,
    knob_tint = { 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF },
    label = 0xFFE3DCC6,
    line_thick = 2,
    load_bar = 0xFF9DFFB0,
    load_bg = 0xFF06100A,
    load_dim = 0xFF4FA866,
    load_text = 0xFF9DFFB0,
    load_track = 0xFF163A20,
    name = "TEST BENCH 1958",
    playhead = 0xFF9DFFB0,
    snap = false,
    title = 0xFFEDE4C8,
    titles = { "CONTROLS", "MIXER", "ENVELOPE", "SEQUENCER", "ARPEGGIATOR" },
    value = 0xFFFFF8E6,
}
local L = {
    bg = { { 577, 0 }, { 577, 272 }, { 577, 544 }, { 581, 180 }, { 581, 452 } },
    cap_top = 48,
    cap_travel = 120,
    cell_bar = { 8, 44, 230, 4 },
    cell_label_y = 190,
    cell_value_y = 203,
    defaults = { { 84, 38, 30, 100, 64, 64, 64, 64 }, { 104, 96, 80, 100, 72, 64, 88, 56 }, { 24, 64, 88, 60, 64, 64, 64, 64 }, { 1, 62, 37, 52, 0, 78, 27, 37 }, { 0, 72, 40, 71, 21, 60, 0, 20 } },
    dots = { 410, 260, 12, 8, 4 },
    env = { 20, 178 },
    env_label_y = 190,
    env_slider = { 20, 112, 104 },
    env_track = { 8, 88, 232 },
    env_value_y = 202,
    filter = { 20, 174, 440, 70 },
    foot = { 14, 254, 380, 16 },
    fps = 15,
    head = { 210, 5, 256, 20 },
    kb = { 30, 36, 20, 44, 12, 26 },
    kb_lo = 48,
    knob_focus_y = 164,
    knob_label_y = 40,
    knob_value_y = 144,
    knob_x = { 20, 140, 260, 380 },
    knob_y = 62,
    lane = { 32, 88, 416, 96, 26 },
    meter_dx = 44,
    meter_h = 144,
    meter_y = 56,
    mix_label_y = 34,
    mix_value_y = 214,
    pages = 5,
    seq_base = 178,
    seq_key_y = 206,
    seq_note_y = 184,
    seq_num_y = 33,
    slot_dx = 24,
    strip_w = 60,
    title = { 14, 5, 250, 20 },
}
local S = {
    black = { 170, 0, 12, 26 },
    blit = { 184, 0, 12, 26 },
    bplay = { 198, 0, 12, 26 },
    fill = { 0, 42, 4, 136 },
    glow = { 80, 0, 12, 12 },
    handle = { 96, 0, 14, 14 },
    hcap = { 38, 0, 22, 28 },
    key1 = { 128, 46, 44, 30 },
    key2 = { 172, 46, 44, 30 },
    key3 = { 216, 46, 44, 30 },
    key4 = { 260, 46, 44, 30 },
    key5 = { 304, 46, 44, 30 },
    key6 = { 348, 46, 44, 30 },
    key7 = { 392, 46, 44, 30 },
    key8 = { 436, 46, 44, 30 },
    key_on1 = { 128, 78, 44, 30 },
    key_on2 = { 172, 78, 44, 30 },
    key_on3 = { 216, 78, 44, 30 },
    key_on4 = { 260, 78, 44, 30 },
    key_on5 = { 304, 78, 44, 30 },
    key_on6 = { 348, 78, 44, 30 },
    key_on7 = { 392, 78, 44, 30 },
    key_on8 = { 436, 78, 44, 30 },
    meter = { 68, 0, 8, 144 },
    peak = { 8, 42, 8, 3 },
    seqbar = { 112, 0, 14, 128 },
    vcap = { 0, 0, 34, 40 },
    wlit = { 130, 0, 19, 44 },
    wplay = { 150, 0, 19, 44 },
}
-- END GENERATED

local PNG, BUF = 14, 18
local WHITE = 0xFFFFFFFF
-- Uploaded PNG ids and the decoded buffers made from them, decoded one per redraw.
local ATLAS = { { 576, 577 }, { 578, 579 }, { 580, 581 } }
local KNOBS, PARTS = 579, 581

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
local function clamp (x, lo, hi)
    if x < lo then return lo end
    if x > hi then return hi end
    return x
end

-- --- state, as the host last sent it -----------------------------------------------------------

local mode, ready, loaded, draws, framed = 0, false, 0, 0, false
local page, frame, last = 0, 0, -1
local enc = { 0, 0, 0, 0, 0, 0, 0, 0 }
-- The encoders of every page as last seen. The sequencer runs on the arpeggiator's tempo and
-- swing, which are only sent while that page is up, so the last values seen stand in for them
-- (the manifest's defaults until then).
local seen = {}
local env = { cols = {}, a = 0, d = 0, r = 0, sus = 0, texts = { "", "", "", "" } }
local peak = { 0, 0, 0, 0, 0, 0, 0, 0 }
local peakFrame = -1

-- --- text --------------------------------------------------------------------------------------

local TITLE, HEAD, LABEL, VALUE, BIG, FOOT, SMALL, CELL

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
    SMALL = textbox(T.f_small, 1); CELL = textbox(T.f_cell, 1)
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
    local bpm = 60 + seen[5][6]
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

-- --- the clock -----------------------------------------------------------------------------------------

-- Which step the clock is on, for a tempo, a number of steps per beat and a swing of 50-75 %:
-- the first step of every pair lasts swing/50 of a step, the second the rest.
local function clock_step (bpm, perBeat, swing)
    local t = frame * bpm * perBeat / (60 * L.fps)
    local pair = floor(t / 2)
    local s = pair * 2
    if t - s >= 2 * swing / 100 then s = s + 1 end
    return s
end

local NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
local function note_name (n)
    return NAMES[n % 12 + 1] .. whole(floor(n / 12) - 1)
end

local function swing_of (v) return 50 + floor(v * 25 / 127) end

-- --- page 3: sequencer -----------------------------------------------------------------------------------

-- 0 is a rest; 1-127 spread two octaves, C2 to C4, about five encoder detents a semitone.
local function seq_note (v)
    if v == 0 then return nil end
    return 36 + floor((v - 1) * 25 / 127)
end

local function draw_sequencer ()
    local arp = seen[5]
    local bpm, swing = 60 + arp[6], swing_of(arp[5])
    chrome(T.titles[4], whole(bpm) .. " BPM   1/16   SWING " .. whole(swing) .. "%", "E1-E8   STEP PITCH   0 = REST")
    local step = clock_step(bpm, 4, swing) % 8
    for i = 1, 8 do
        local x0 = (i - 1) * L.strip_w
        local cx = x0 + floor(L.strip_w / 2)
        local n = seq_note(enc[i])
        local playing = step == i - 1
        local numColour = T.dim
        if playing then numColour = T.accent end
        say(SMALL, whole(i), numColour, x0, L.seq_num_y, L.strip_w, 12)
        if n then
            part("seqbar", cx - 7, L.seq_base - S.seqbar[4], floor((n - 35) * S.seqbar[4] / 25))
            say(VALUE, note_name(n), focus_colour(i, T.value), x0, L.seq_note_y, L.strip_w, 16)
        else
            say(VALUE, "REST", focus_colour(i, T.dim), x0, L.seq_note_y, L.strip_w, 16)
        end
        if playing then part("key_on" .. i, cx - 22, L.seq_key_y) else part("key" .. i, cx - 22, L.seq_key_y) end
    end
end

-- --- page 4: arpeggiator ---------------------------------------------------------------------------------

local MODES = { "UP", "DOWN", "INCL", "EXCL", "ORDER", "RANDOM", "CHORD" }
local RATES = { { "1/4", 1 }, { "1/4T", 1.5 }, { "1/8", 2 }, { "1/8T", 3 },
                { "1/16", 4 }, { "1/16T", 6 }, { "1/32", 8 }, { "1/32T", 12 } }
-- Name, the notes low to high, and the order they were "played" in (for ORDER). The lab has no
-- keys to listen to, so the chord is chosen here; in HoSTage the held notes would replace it.
local CHORDS = {
    { "Cm7",    { 48, 51, 55, 58 },     { 48, 55, 51, 58 } },
    { "Abmaj7", { 44, 48, 51, 55 },     { 44, 51, 55, 48 } },
    { "Fm9",    { 41, 44, 48, 51, 55 }, { 41, 48, 44, 55, 51 } },
    { "G7sus4", { 43, 48, 50, 53 },     { 43, 50, 48, 53 } },
    { "Ebmaj9", { 51, 55, 58, 62, 65 }, { 51, 58, 62, 55, 65 } },
    { "Dm7b5",  { 50, 53, 56, 60 },     { 50, 56, 53, 60 } },
    { "Bbadd9", { 46, 50, 53, 60 },     { 46, 53, 60, 50 } },
    { "Csus2",  { 48, 50, 55 },         { 48, 55, 50 } },
}
local RHYTHMS = {
    { "EVEN",     "xxxxxxxxxxxxxxxx" }, { "3+3+2", "x..x..x.x..x..x." },
    { "GALLOP",   "x.xxx.xxx.xxx.xx" }, { "OFFBEAT", ".x.x.x.x.x.x.x.x" },
    { "SKIP",     "xx.xx.xx.xx.xx.x" }, { "PULSE", "x...x...x...x..." },
    { "BROKEN",   "x.x..x.xx.x..x.x" }, { "SPARSE", "x......x..x....." },
}
local ARP_NAMES = { "MODE", "RATE", "OCTAVE", "GATE", "SWING", "TEMPO", "CHORD", "RHYTHM" }

local function pick (list, v) return list[floor(v * #list / 128) + 1] end
local function octaves_of (v) return 1 + floor(v * 4 / 128) end
local function gate_of (v) return 10 + floor(v * 90 / 127) end

-- The notes the arpeggiator walks, for a chord, an octave count and a mode.
local function walk (chord, octs, m)
    local up, order = {}, {}
    for o = 0, octs - 1 do
        for k = 1, #chord[2] do up[#up + 1] = chord[2][k] + 12 * o end
        for k = 1, #chord[3] do order[#order + 1] = chord[3][k] + 12 * o end
    end
    local n = #up
    local out = {}
    if m == "DOWN" then
        for k = n, 1, -1 do out[#out + 1] = up[k] end
    elseif m == "INCL" then
        for k = 1, n do out[#out + 1] = up[k] end
        for k = n, 1, -1 do out[#out + 1] = up[k] end
    elseif m == "EXCL" then
        for k = 1, n do out[#out + 1] = up[k] end
        for k = n - 1, 2, -1 do out[#out + 1] = up[k] end
    elseif m == "ORDER" then
        out = order
    else
        out = up
    end
    return out, up
end

-- The note (or, for CHORD, nil: every note) the arpeggiator plays on its k-th played step.
local function arp_note (seq, m, k)
    if m == "CHORD" then return nil end
    if m == "RANDOM" then
        local h = (k * 2654435761 + 97) % 4294967296
        return seq[floor(h / 65536) % #seq + 1]
    end
    return seq[k % #seq + 1]
end

local function key_x (n)
    local WHITE_OF = { 0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6 }
    local pc = n % 12
    local w = (floor((n - L.kb_lo) / 12)) * 7 + WHITE_OF[pc + 1]
    if pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10 then
        return L.kb[1] + (w + 1) * L.kb[3] - floor(L.kb[5] / 2), true
    end
    return L.kb[1] + w * L.kb[3], false
end

local function in_keyboard (n) return n >= L.kb_lo and n < L.kb_lo + 36 end

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

local function draw_arpeggiator ()
    local e = enc
    local m = pick(MODES, e[1])
    local rate = pick(RATES, e[2])
    local octs = octaves_of(e[3])
    local gate = gate_of(e[4])
    local swing = swing_of(e[5])
    local bpm = 60 + e[6]
    local chord = pick(CHORDS, e[7])
    local rhythm = pick(RHYTHMS, e[8])
    chrome(T.titles[5], m .. "   " .. rate[1] .. "   " .. whole(bpm) .. " BPM",
           "E5 SWING AND E6 TEMPO ALSO CLOCK THE SEQUENCER")

    local seq, up = walk(chord, octs, m)
    local mask = rhythm[2]
    local hitsPerBar, before = 0, {}
    for j = 1, 16 do
        before[j] = hitsPerBar
        if mask:sub(j, j) == "x" then hitsPerBar = hitsPerBar + 1 end
    end
    local now = clock_step(bpm, rate[2], swing)
    local bar, at = floor(now / 16), now % 16
    local lo, hi = up[1], up[#up]
    local span = hi - lo
    if span < 1 then span = 1 end

    -- The lane: one bar of sixteen steps, each played step a block at its pitch, gate wide.
    local lx, ly, lw, lh, sw = L.lane[1], L.lane[2], L.lane[3], L.lane[4], L.lane[5]
    local bw = floor((sw - 2) * gate / 100)
    if bw < 3 then bw = 3 end
    local sounding = {}
    for j = 0, 15 do
        if mask:sub(j + 1, j + 1) == "x" then
            local k = bar * hitsPerBar + before[j + 1]
            local note = arp_note(seq, m, k)
            local notes = { note }
            if note == nil then notes = up end
            local playing = j == at
            for q = 1, #notes do
                local y = ly + lh - 10 - floor((notes[q] - lo) * (lh - 20) / span)
                local c, top = T.block, T.block_hi
                if playing then c, top = T.block_play, T.block_play_hi; sounding[#sounding + 1] = notes[q] end
                if note == nil then
                    draw_rect(lx + j * sw + 1, y + 1, bw, 4, c)       -- a chord: one bar a note
                else
                    draw_rect(lx + j * sw + 1, y, bw, 6, c)
                    draw_rect(lx + j * sw + 1, y, bw, 1, top)
                end
            end
        end
    end
    draw_rect(lx + at * sw, ly + 1, sw, 2, T.playhead)
    draw_rect(lx + at * sw, ly + lh - 3, sw, 2, T.playhead)

    draw_keys(chord[2], sounding)

    local values = { m, rate[1], whole(octs), whole(gate) .. "%", whole(swing) .. "%",
                     whole(bpm), chord[1], rhythm[1] }
    for i = 1, 8 do
        local x0 = (i - 1) * L.strip_w
        say(LABEL, ARP_NAMES[i], focus_colour(i, T.label), x0, L.cell_label_y, L.strip_w, 12)
        say(CELL, values[i], focus_colour(i, T.value), x0, L.cell_value_y, L.strip_w, 16)
        local fill = floor(e[i] * L.cell_bar[2] / 127)
        if fill > 0 then
            draw_rect(x0 + L.cell_bar[1], L.cell_bar[3], fill, L.cell_bar[4], focus_colour(i, T.bar))
        end
    end
end

-- --- draw --------------------------------------------------------------------------------------------

local PAGES = { draw_controls, draw_mixer, draw_envelope, draw_sequencer, draw_arpeggiator }

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
