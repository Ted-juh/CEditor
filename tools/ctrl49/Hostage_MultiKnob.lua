-- Hostage CTRL49 page: a branded startup screen followed by the live eight-knob page.
-- The session draws once while mode is 0, keeps that splash visible for its loading dwell,
-- then calls set_mode(1) and redraws. The logo is uploaded as object 0x0210, already orange.

local FRAME           = 64
local KNOB_PNG_ID     = 0x0200
local KNOB_DECODED_ID = 0x0201
local LOGO_PNG_ID     = 0x0210
local LOGO_DECODED_ID = 0x0211

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local WHITE  = 0xFFFFFFFF
local GREY   = 0xFFAAB2BF
local DIM    = 0xFF5A6B82
local DARK   = 0xFF596273
local ROW    = 0xFF161B24     -- a selected row, a key range's track
local READY  = 0xFF2DD4BF
local WARN   = 0xFFFF4D6A
-- A colour per part on LAYERS, by its place in the rack.
local PART_COLOURS = { 0xFFFF9408, 0xFF2DD4BF, 0xFF8B7CFF, 0xFFFF5C93,
                       0xFFFFB547, 0xFF5B9BFF, 0xFF7BD88F, 0xFFE6E9F5 }
local SUGGEST = 0xFF8B7CFF   -- DISCOVER: a sound you have never opened

local initialized = false
local mode = 0
local title = "HOSTAGE"
local active = 0
local labels = { "", "", "", "", "", "", "", "" }
local values = { 0, 0, 0, 0, 0, 0, 0, 0 }

-- The performance page's extras, read from set_values bytes 9..11 (a control page sends nine
-- bytes, so they read 0 there and nothing extra is drawn): page kind, the beat in the bar
-- (1-based, 0 when stopped) and beats per bar. The pages that are not knob pages set their own
-- kind when the host sends them (set_check: 2, set_layers: 3, set_discover: 4); set_values sets it
-- back to a knob page.
local page_kind = 0
local beat = 0
local beats_per_bar = 4

-- Notes being held, by note number, with their velocity. Filled by the firmware's note hook
-- (hook 2), which calls note(args) with the raw MIDI bytes -- if this keyboard has it: the hook
-- is read from the Akai ADVANCE firmware, which runs the same runtime, and is not yet seen on a
-- CTRL49. Without it this stays empty and the strip is never drawn.
local held = {}
local held_count = 0

-- Which widget to mark dirty when a note arrives, so it shows without waiting for the host's
-- next redraw. The firmware tells a widget its id through set_widget_id; until it does, this
-- page's own target (2) is the best guess.
local WID = 2

local TITLE = text_data.new()
local VAL   = text_data.new()
local LBL   = text_data.new()
local SPLASH = text_data.new()
local WORDMARK = text_data.new()
local ROWTXT = text_data.new()     -- the stage pages: list rows, left
local ROWNUM = text_data.new()     -- and right
local SMALL  = text_data.new()     -- detail lines
local HEAD   = text_data.new()     -- a song or part name, larger

local function configure_text()
    text_data.set(TITLE, {
        text = "", color = WHITE, font = 10, font_size = 18,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
    text_data.set(VAL, {
        text = "", color = WHITE, font = 10, font_size = 20,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
    text_data.set(LBL, {
        text = "", color = GREY, font = 9, font_size = 11,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
    -- The wordmark in type, for when the logo image cannot be drawn (see draw_splash).
    text_data.set(WORDMARK, {
        text = "HOSTAGE", color = ORANGE, font = 10, font_size = 48,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
    text_data.set(SPLASH, {
        text = "CTRL49 CONTROL SURFACE", color = GREY, font = 9, font_size = 13,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
    local function plain(t, size, hor, font)
        text_data.set(t, {
            text = "", color = WHITE, font = font or 9, font_size = size,
            just_ver = 1, just_hor = hor, bk_color = 0x00000000,
            border_width_top = 0, border_width_bottom = 0,
            border_width_left = 0, border_width_right = 0
        })
    end
    plain(ROWTXT, 12, 0)
    plain(ROWNUM, 11, 2)
    plain(SMALL, 11, 0)
    plain(HEAD, 17, 0, 10)
end

-- The knob filmstrip decodes to 64 x 8192 pixels, about 2 MB, and the keyboard does nothing else
-- while it decodes. Decoding it in init put that work between upload and the splash's first
-- draw, and every splash draw then waited behind it, running just before set_mode(1) replaced
-- it: the keyboard showed black and then the knobs. So init decodes only the small logo, and the
-- strip is decoded when the knob page is first needed, which is while the splash is on screen.
local knobs_decoded = false
local function ensure_knobs()
    if knobs_decoded then return end
    decode_image(14, KNOB_PNG_ID, 18, KNOB_DECODED_ID, WHITE)
    knobs_decoded = true
end

function init(args)
    if initialized then return end
    configure_text()
    decode_image(14, LOGO_PNG_ID, 18, LOGO_DECODED_ID, WHITE)
    if pcall and set_hook_enabled then pcall(set_hook_enabled, 2, 1) end
    initialized = true
end

function set_widget_id(args)
    WID = get_byte(args, 0)
end

function note(args)
    local status = get_byte(args, 0)
    local number = get_byte(args, 1)
    local velocity = get_byte(args, 2)
    local kind = status - (status % 16)
    local on = kind == 144 and velocity > 0
    if on and held[number] == nil then held_count = held_count + 1 end
    if (not on) and held[number] ~= nil then held_count = held_count - 1 end
    if on then held[number] = velocity else held[number] = nil end
    if (page_kind == 1 or page_kind == 3) and pcall and lua_widget_make_dirty then pcall(lua_widget_make_dirty, WID) end
end

function set_mode(args)
    mode = get_byte(args, 0)
    if mode ~= 0 then ensure_knobs() end
end

-- args is a Lua string (see VIP's set_text pattern): get_byte is 0-based, :sub is 1-based.
function set_labels(args)
    local i = 0
    local titleLen = get_byte(args, i); i = i + 1
    title = args:sub(i + 1, i + titleLen); i = i + titleLen
    for slot = 1, 8 do
        local n = get_byte(args, i); i = i + 1
        labels[slot] = args:sub(i + 1, i + n); i = i + n
    end
end

function set_values(args)
    active = get_byte(args, 0)
    for slot = 1, 8 do
        values[slot] = get_byte(args, slot)
    end
    page_kind = get_byte(args, 9)
    if page_kind > 1 then page_kind = 0 end
    beat = get_byte(args, 10)
    beats_per_bar = get_byte(args, 11)
    if beats_per_bar < 1 then beats_per_bar = 4 end
    if beats_per_bar > 16 then beats_per_bar = 16 end
end

-- Beat dots at the right of the title: one per beat in the bar, the current one lit.
local function draw_beats()
    local size, gap = 6, 5
    local x = 470 - beats_per_bar * (size + gap)
    for b = 1, beats_per_bar do
        local colour = DARK
        if b == beat then
            if b == 1 then colour = ORANGE else colour = WHITE end
        end
        draw_rect(x + (b - 1) * (size + gap), 13, size, size, colour)
    end
end

-- The notes held on the keyboard, as a strip along the bottom: C2..C7, brighter for harder.
local LOW_NOTE, HIGH_NOTE = 36, 96
local function draw_held_notes()
    if held_count <= 0 then return end
    local span = HIGH_NOTE - LOW_NOTE + 1
    local width = 480 / span
    draw_rect(0, 266, 480, 1, DARK)
    for number, velocity in pairs(held) do
        if number >= LOW_NOTE and number <= HIGH_NOTE then
            local colour = DIM
            if velocity >= 96 then colour = ORANGE elseif velocity >= 48 then colour = WHITE end
            draw_rect(math.floor((number - LOW_NOTE) * width), 256, math.max(2, math.floor(width) - 1), 10, colour)
        end
    end
end

local function knob_pos(slot)
    local col = (slot - 1) % 4
    local row = 0
    if slot > 4 then row = 1 end
    return 31 + col * 118, 32 + row * 118
end

-- The logo is the one large image this page draws (440 px wide; the knob frames are 64). If the
-- device will not draw it, the error must not take the rest of the splash with it: on the first
-- hardware run the keyboard showed a black screen here while the app's preview showed the logo.
-- So the text goes first, the logo is attempted under pcall, and the wordmark in type stands in
-- when it fails.
--
-- COLOUR. The device tints an image only if it decodes to an 8-bit buffer, and it does that only
-- for an 8-bit grey palette PNG, the grey level being coverage: every image VIP tints is one (its
-- arc filmstrips, arrows, tabs), and VIP says so beside its decode_image ("Passing white to create
-- an 8-bit buffer"). An RGBA PNG decodes to colour and the tint is ignored, which is why the logo
-- and every knob came out white. Both images are grey palette PNGs now; see make_filmstrip.py.
local function draw_splash()
    draw_text(SPLASH, 0, 180, 480, 24)
    local drawn = false
    if pcall then
        drawn = pcall(draw_image, 18, LOGO_DECODED_ID, 20, 84, 0, 0, 440, 80, ORANGE)
    end
    if not drawn then
        draw_text(WORDMARK, 0, 84, 480, 80)
    end
    draw_rect(192, 222, 96, 2, DIM)
    draw_rect(192, 222, 48, 2, ORANGE)
end

-- --- the stage pages ------------------------------------------------------------------------------

-- Reads a [length][ASCII] string at byte i (0-based); returns it and the byte after it.
local function read_string(args, i)
    local n = get_byte(args, i)
    return args:sub(i + 2, i + 1 + n), i + 1 + n
end

local function say(t, text, colour, x, y, w, h)
    text_data.set(t, { text = text, color = colour })
    draw_text(t, x, y, w, h)
end

local function outline(x, y, w, h, colour)
    draw_rect(x, y, w, 1, colour)
    draw_rect(x, y + h - 1, w, 1, colour)
    draw_rect(x, y, 1, h, colour)
    draw_rect(x + w - 1, y, 1, h, colour)
end

local function title_bar(text, right)
    text_data.set(TITLE, { text = text, color = WHITE })
    draw_text(TITLE, 0, 5, 480, 22)
    if right ~= "" then say(ROWNUM, right, GREY, 240, 6, 232, 20) end
end

-- SOUNDCHECK: set_check (Ctrl49StagePages.h has the bytes). The setlist on the left, each song
-- ready, with problems, or not checked yet, and its measured level; the selected song on the
-- right: what it was checked against, its problems as the check words them, its level.
local check = { count = 0, first = 0, rows = 0, selected = 0, current = 0, ready = 0, problems = 0,
                unchecked = 0, list = {}, basis = "", total = 0, lines = {}, peak = 0, rms = 0, seconds = 0 }

function set_check(args)
    local i = 0
    check.count = get_byte(args, 0); check.first = get_byte(args, 1); check.rows = get_byte(args, 2)
    check.selected = get_byte(args, 3); check.current = get_byte(args, 4)
    check.ready = get_byte(args, 5); check.problems = get_byte(args, 6); check.unchecked = get_byte(args, 7)
    i = 8
    check.list = {}
    for r = 1, check.rows do
        local row = { status = get_byte(args, i), level = get_byte(args, i + 1), problems = get_byte(args, i + 2) }
        row.name, i = read_string(args, i + 3)
        check.list[r] = row
    end
    check.basis, i = read_string(args, i)
    check.total = get_byte(args, i); local n = get_byte(args, i + 1); i = i + 2
    check.lines = {}
    for l = 1, n do check.lines[l], i = read_string(args, i) end
    check.peak = get_byte(args, i); check.rms = get_byte(args, i + 1); check.seconds = get_byte(args, i + 2)
    page_kind = 2
end

local function level_text(b)
    if b == 0 then return "-" end
    return tostring(b - 61) .. " dB"
end

local function draw_check()
    local head = "NOTHING CHECKED YET"
    if check.count == 0 then head = "NO SETLIST"
    elseif check.problems > 0 then head = tostring(check.problems) .. " OF " .. tostring(check.count) .. " WITH PROBLEMS"
    elseif check.unchecked == 0 then head = "ALL " .. tostring(check.count) .. " READY" end
    title_bar("SOUNDCHECK", head)
    -- the summary
    local words = { { check.ready, " READY", READY }, { check.problems, " WITH PROBLEMS", WARN },
                    { check.unchecked, " NOT CHECKED", DIM } }
    for k = 1, 3 do
        local x = 12 + (k - 1) * 156
        draw_rect(x, 37, 8, 8, words[k][3])
        local c = GREY
        if words[k][1] > 0 then c = WHITE end
        say(ROWTXT, tostring(words[k][1]) .. words[k][2], c, x + 14, 32, 140, 18)
    end
    draw_rect(0, 53, 480, 1, ROW)
    -- the setlist
    for r = 1, check.rows do
        local row = check.list[r]
        local index = check.first + r - 1
        local y = 58 + (r - 1) * 19
        if index == check.selected then draw_rect(6, y, 236, 18, ROW) end
        local mark = DIM
        if row.status == 1 then mark = READY elseif row.status == 2 then mark = WARN end
        draw_rect(12, y + 5, 8, 8, mark)
        local c = WHITE
        if row.status == 0 then c = GREY end
        if index + 1 == check.current then c = ORANGE end
        say(ROWTXT, row.name, c, 28, y, 150, 18)
        -- the measured level, so a song much louder than the rest stands out
        if row.level > 0 then
            draw_rect(186, y + 8, 48, 2, DARK)
            draw_rect(186, y + 7, math.floor(row.level * 48 / 61), 4, GREY)
        end
    end
    draw_rect(247, 58, 1, 190, ROW)
    -- the selected song
    local sel = check.list[check.selected - check.first + 1]
    if sel ~= nil then
        say(HEAD, sel.name, WHITE, 256, 56, 218, 24)
        local status = "NOT CHECKED YET"
        if sel.status == 1 then status = "READY" elseif sel.status == 2 then
            status = tostring(check.total) .. " PROBLEM"
            if check.total ~= 1 then status = status .. "S" end
        end
        local sc = DIM
        if sel.status == 1 then sc = READY elseif sel.status == 2 then sc = WARN end
        say(ROWTXT, status, sc, 256, 82, 218, 18)
        if check.basis ~= "" then say(SMALL, "CHECKED AGAINST " .. check.basis, GREY, 256, 100, 218, 16) end
        for l = 1, #check.lines do say(SMALL, check.lines[l], WHITE, 256, 120 + (l - 1) * 18, 218, 16) end
        if check.total > #check.lines then
            say(SMALL, "AND " .. tostring(check.total - #check.lines) .. " MORE IN THE APP", GREY, 256, 120 + #check.lines * 18, 218, 16)
        end
        local level = "LEVEL NOT MEASURED"
        if check.rms > 0 then
            level = "LEVEL " .. level_text(check.rms) .. "   PEAK " .. level_text(check.peak) .. "   " .. tostring(check.seconds) .. " S"
        end
        say(SMALL, level, GREY, 256, 214, 218, 16)
    end
    say(SMALL, "E1 SONG   E8 CHECKS AGAIN", DARK, 12, 250, 300, 16)
end

-- LAYERS: set_layers (Ctrl49StagePages.h). Every part's key range as a band over the 49 keys,
-- its velocity range and transpose, and as notes are played a light under every part that
-- answers each one. The notes come from the host, and from this page's own note hook where the
-- keyboard has one.
local layers = { count = 0, first = 0, rows = 0, focused = 0, key = 36, parts = {}, held = {} }

function set_layers(args)
    layers.count = get_byte(args, 0); layers.first = get_byte(args, 1); layers.rows = get_byte(args, 2)
    layers.focused = get_byte(args, 3); layers.key = get_byte(args, 4)
    local i = 5
    layers.parts = {}
    for r = 1, layers.rows do
        local p = { lo = get_byte(args, i), hi = get_byte(args, i + 1), vlo = get_byte(args, i + 2),
                    vhi = get_byte(args, i + 3), tr = get_byte(args, i + 4) - 64, flags = get_byte(args, i + 5) }
        p.name, i = read_string(args, i + 6)
        layers.parts[r] = p
    end
    layers.held = {}
    local n = get_byte(args, i); i = i + 1
    for k = 1, n do
        layers.held[get_byte(args, i)] = get_byte(args, i + 1)
        i = i + 2
    end
    page_kind = 3
end

local WHITE_OF = { 0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6 }
local NAMES = { "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B" }
local function is_black(pc) return pc == 1 or pc == 3 or pc == 6 or pc == 8 or pc == 10 end
local function note_name(n) return NAMES[n % 12 + 1] .. tostring(math.floor(n / 12) - 1) end
local KX, KY, KW = 8, 196, 16           -- 29 white keys of 16 px, 48 tall

-- Where key n is drawn and how wide; keys left or right of the 49 are pinned to the ends.
local function key_x(n)
    local first = layers.key
    if n < first then return KX, 2 end
    if n > first + 48 then return KX + 29 * KW - 2, 2 end
    local w = math.floor((n - first) / 12) * 7 + WHITE_OF[(n - first) % 12 + 1]
    if is_black(n % 12) then return KX + (w + 1) * KW - 5, 10 end
    return KX + w * KW, KW - 1
end

-- A part the keys can reach: enabled, not muted, and taking its MIDI from the keyboard.
local function playable(p)
    return p.flags % 2 == 1 and math.floor(p.flags / 2) % 2 == 0 and math.floor(p.flags / 4) % 2 == 1
end

local function answers(p, n, v)
    return playable(p) and n >= p.lo and n <= p.hi and v >= p.vlo and v <= p.vhi
end

local function draw_layers()
    -- what is sounding: the host's notes, and the note hook's where the keyboard has one
    local sounding = {}
    for n, v in pairs(layers.held) do sounding[n] = v end
    for n, v in pairs(held) do sounding[n] = v end
    local focus = layers.parts[layers.focused - layers.first + 1]
    local right = ""
    if focus ~= nil then
        right = focus.name .. "  " .. note_name(focus.lo) .. "-" .. note_name(focus.hi)
    end
    title_bar("LAYERS", right)
    -- one row a part: its range over the keys, lit where it answers a note being played
    for r = 1, layers.rows do
        local p = layers.parts[r]
        local y = 32 + (r - 1) * 20
        local colour = PART_COLOURS[(layers.first + r - 1) % 8 + 1]
        draw_rect(KX, y, 29 * KW - 1, 18, ROW)
        local x0 = key_x(p.lo)
        local x1, w1 = key_x(p.hi)
        if p.lo <= p.hi then
            local band = colour
            if not playable(p) then band = DARK end
            draw_rect(x0, y + 14, x1 + w1 - x0, 3, band)
            -- a note it answers is a white notch in its band, below the name rather than over it
            for n, v in pairs(sounding) do
                if answers(p, n, v) then
                    local kx, kw = key_x(n)
                    draw_rect(kx, y + 12, kw, 6, WHITE)
                end
            end
        end
        local text = p.name
        if p.vlo > 1 or p.vhi < 127 then text = text .. "  VEL " .. tostring(p.vlo) .. "-" .. tostring(p.vhi) end
        if p.tr ~= 0 then
            local t = tostring(p.tr)
            if p.tr > 0 then t = "+" .. t end
            text = text .. "  " .. t
        end
        if math.floor(p.flags / 2) % 2 == 1 then text = text .. "  MUTED" end
        if math.floor(p.flags / 4) % 2 == 0 then text = text .. "  FROM A PART" end
        local c = GREY
        if layers.first + r - 1 == layers.focused then
            c = WHITE
            outline(KX - 2, y - 1, 29 * KW + 3, 20, ORANGE)
        end
        local tx = x0 + 3
        if tx > KX + 29 * KW - 200 then tx = KX + 29 * KW - 200 end
        say(SMALL, text, c, tx, y, 196, 14)
    end
    -- the keys, lit in the colour of the first part that answers each (grey when none does)
    for pass = 1, 2 do
        for k = 0, 48 do
            local n = layers.key + k
            local black = is_black(n % 12)
            if (pass == 1 and not black) or (pass == 2 and black) then
                local x, w = key_x(n)
                local v = sounding[n]
                local c = 0xFFC9CEE0
                if black then c = 0xFF161A2B end
                if v ~= nil then
                    c = DIM
                    for r = layers.rows, 1, -1 do
                        if answers(layers.parts[r], n, v) then c = PART_COLOURS[(layers.first + r - 1) % 8 + 1] end
                    end
                end
                if black then draw_rect(x, KY, w, 30, c) else draw_rect(x, KY, w, 48, c) end
            end
        end
    end
    say(SMALL, "E1 PART  E2 LOW  E3 HIGH  E4 TRANSPOSE  E5 VEL LOW  E6 VEL HIGH", DARK, 12, 250, 460, 16)
end

-- DISCOVER: set_discover (Ctrl49StagePages.h has the bytes). What you own and have never opened,
-- nearest first to what you keep loading. On the left the map, brightness across and attack up:
-- grey dots are the sounds you load most, YOU is their centre weighted by how often, and the
-- suggestions listed are lit. On the right the list, eight at a time, pad N auditioning row N.
local disc = { state = 0, count = 0, first = 0, rows = 0, selected = 0, never = 0, from = 0, kind = "",
               cx = 0, cy = 0, list = {}, like = "", like_loads = 0, points = {} }

function set_discover(args)
    disc.state = get_byte(args, 0); disc.count = get_byte(args, 1); disc.first = get_byte(args, 2)
    disc.rows = get_byte(args, 3); disc.selected = get_byte(args, 4)
    disc.never = get_byte(args, 5) + 256 * get_byte(args, 6); disc.from = get_byte(args, 7)
    local i = 8
    disc.kind, i = read_string(args, i)
    disc.cx = get_byte(args, i); disc.cy = get_byte(args, i + 1); i = i + 2
    disc.list = {}
    for r = 1, disc.rows do
        local row = { x = get_byte(args, i), y = get_byte(args, i + 1), percent = get_byte(args, i + 2),
                      kept = get_byte(args, i + 3) ~= 0 }
        row.name, i = read_string(args, i + 4)
        row.instrument, i = read_string(args, i)
        disc.list[r] = row
    end
    disc.like, i = read_string(args, i)
    disc.like_loads = get_byte(args, i); i = i + 1
    local n = get_byte(args, i); i = i + 1
    disc.points = {}
    for k = 1, n do disc.points[k] = { get_byte(args, i), get_byte(args, i + 1) }; i = i + 2 end
    page_kind = 4
end

local function thousands(n)
    local s = tostring(n)
    local out = ""
    while #s > 3 do out = "," .. s:sub(-3) .. out; s = s:sub(1, -4) end
    return s .. out
end

local MAP_X, MAP_Y, MAP_S = 12, 34, 168
local function map_xy(x, y) return MAP_X + math.floor(x * MAP_S / 100), MAP_Y + MAP_S - math.floor(y * MAP_S / 100) end

local function draw_discover()
    local right = thousands(disc.never) .. " NEVER OPENED"
    title_bar("DISCOVER", right)
    -- the map
    outline(MAP_X - 4, MAP_Y - 4, MAP_S + 9, MAP_S + 9, ROW)
    say(SMALL, "SLOW", DIM, MAP_X, MAP_Y - 2, 60, 14)
    say(SMALL, "BRIGHT", DIM, MAP_X + MAP_S - 60, MAP_Y + MAP_S - 14, 60, 14)
    for k = 1, #disc.points do
        local px, py = map_xy(disc.points[k][1], disc.points[k][2])
        draw_rect(px - 1, py - 1, 3, 3, DARK)
    end
    local sel = disc.list[disc.selected - disc.first + 1]
    if disc.state == 1 then
        for r = 1, disc.rows do
            local row = disc.list[r]
            local px, py = map_xy(row.x, row.y)
            draw_rect(px - 2, py - 2, 5, 5, SUGGEST)
        end
        if sel ~= nil then
            local px, py = map_xy(sel.x, sel.y)
            draw_rect(px - 3, py - 3, 7, 7, WHITE)
        end
        -- YOU last, so no dot covers where your taste sits
        local yx, yy = map_xy(disc.cx, disc.cy)
        outline(yx - 7, yy - 7, 15, 15, ORANGE)
        draw_rect(yx - 14, yy + 9, 29, 13, BLACK)
        say(SMALL, "YOU", ORANGE, yx - 20, yy + 8, 40, 14)
    end
    -- the list, or why there is none
    local footer = "E1 PICK  E2 REACH  E3 KIND  E4 KEEP  PADS AUDITION"
    if disc.state == 0 then
        say(HEAD, "NOT ENOUGH TO GO ON", WHITE, 196, 70, 276, 24)
        say(SMALL, "Load a few more sounds and this can tell", GREY, 196, 100, 276, 16)
        say(SMALL, "you what you'd like: " .. tostring(disc.from) .. " of 5 so far.", GREY, 196, 118, 276, 16)
        say(SMALL, footer, DARK, 12, 250, 460, 16)
        return
    end
    if disc.state == 2 or disc.rows == 0 then
        say(HEAD, "NOTHING NEW TO SUGGEST", WHITE, 196, 70, 276, 24)
        if disc.kind ~= "" then
            say(SMALL, "No " .. disc.kind .. " you have not opened: E3 for another kind.", GREY, 196, 100, 276, 16)
        else
            say(SMALL, "Every measured sound has been opened, or", GREY, 196, 100, 276, 16)
            say(SMALL, "nothing unopened is measured yet.", GREY, 196, 118, 276, 16)
        end
        say(SMALL, footer, DARK, 12, 250, 460, 16)
        return
    end
    for r = 1, disc.rows do
        local row = disc.list[r]
        local index = disc.first + r - 1
        local y = 32 + (r - 1) * 19
        if index == disc.selected then draw_rect(192, y, 282, 18, ROW) end
        say(ROWNUM, tostring(r), DIM, 192, y, 14, 18)
        if row.kept then draw_rect(211, y + 6, 6, 6, ORANGE) end
        local c = GREY
        if index == disc.selected then c = WHITE end
        say(ROWTXT, row.name, c, 222, y, 150, 18)
        say(ROWNUM, row.instrument, DIM, 330, y, 98, 18)
        draw_rect(434, y + 8, 34, 2, DARK)
        draw_rect(434, y + 7, math.floor(row.percent * 34 / 100), 4, SUGGEST)
    end
    draw_rect(192, 188, 282, 1, ROW)
    if sel ~= nil then
        local where = sel.name
        if sel.instrument ~= "" then where = where .. "  IN " .. sel.instrument end
        say(ROWTXT, where, WHITE, 192, 192, 282, 18)
        local like = tostring(sel.percent) .. "% LIKE WHAT YOU LOAD"
        if sel.kept then like = like .. ", KEPT" end
        say(SMALL, like, GREY, 192, 210, 282, 16)
        if disc.like ~= "" then
            local times = " TIMES"
            if disc.like_loads == 1 then times = " TIME" end
            say(SMALL, "NEAREST " .. disc.like .. ", LOADED " .. tostring(disc.like_loads) .. times, GREY, 192, 226, 282, 16)
        end
    end
    local kind = "ALL"
    if disc.kind ~= "" then kind = disc.kind end
    say(SMALL, "E1 PICK  E2 REACH  E3 " .. kind .. "  E4 KEEP  PADS AUDITION", DARK, 12, 250, 460, 16)
    say(ROWNUM, tostring(disc.selected + 1) .. " / " .. tostring(disc.count), DIM, 372, 250, 100, 16)
end

function draw(args)
    if not initialized then init("") end

    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)

    if mode == 0 then
        draw_splash()
        return
    end

    if page_kind == 2 then
        draw_check()
        return
    end
    if page_kind == 3 then
        draw_layers()
        return
    end
    if page_kind == 4 then
        draw_discover()
        return
    end

    ensure_knobs()
    text_data.set(TITLE, { text = title, color = WHITE })
    draw_text(TITLE, 0, 5, 480, 22)

    for slot = 1, 8 do
        local x, y = knob_pos(slot)
        local v = values[slot]
        local is_active = (slot - 1) == active
        local tint = is_active and ORANGE or DIM

        draw_image(18, KNOB_DECODED_ID, x, y, 0, FRAME * v, FRAME, FRAME, tint)

        text_data.set(VAL, { text = tostring(v), color = is_active and WHITE or GREY })
        draw_text(VAL, x, y + 20, 64, 26)

        text_data.set(LBL, { text = labels[slot], color = is_active and WHITE or DARK })
        draw_text(LBL, x - 8, y + 66, 80, 14)
    end

    if page_kind == 1 then
        draw_beats()
        draw_held_notes()
    end
end
