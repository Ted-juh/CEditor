-- CTRL49 bridge page: ONE display program with two modes, switched live from the keyboard
-- (host intercepts the Main/Browser buttons and calls set_mode):
--   mode 1 = KNOBS  : eight filmstrip knobs bound to device parameters (4x2 grid)
--   mode 2 = PRESETS: scrollable patch-name list with the selection highlighted
--
-- Merged from CEditor_MultiKnob.lua + CEditor_PresetList.lua (kept for the dev harnesses;
-- keep the three in sync). Host contract:
--   set_mode(args):   [mode]
--   Knobs:  set_labels([titleLen][title][8x [len][label]]),
--           set_values([activeSlot][v0..v7])
--   Presets: set_header(args = header string),
--            set_rows([selectedRow][rowCount][rowCount x [len][name]])
-- PNG filmstrip = object id 0x0200 (128 frames of 64px, white-on-transparent).

local FRAME      = 64
local PNG_ID     = 0x0200
local DECODED_ID = 0x0201

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local PANEL  = 0xFF1A2230
local WHITE  = 0xFFFFFFFF
local GREY   = 0xFFAAB2BF
local DIM    = 0xFF5A6B82
local DARK   = 0xFF596273

local initialized = false
local mode = 1

-- knobs state
local title = "CEDITOR"
local active = 0
local labels = { "", "", "", "", "", "", "", "" }
local values = { 0, 0, 0, 0, 0, 0, 0, 0 }

-- preset-list state
local header = "PRESETS"
local selected = 0
local rows = {}
local LIST_ROWS = 6
local ROW_H = 36
local LIST_TOP = 34

local TITLE  = text_data.new()
local VAL    = text_data.new()
local LBL    = text_data.new()
local HEADER = text_data.new()
local ROW    = text_data.new()

local function configure_text()
    text_data.set(TITLE,  { text = "", color = WHITE,  font = 10, font_size = 18, just_ver = 1, just_hor = 1, bk_color = 0x00000000 })
    text_data.set(VAL,    { text = "", color = WHITE,  font = 10, font_size = 20, just_ver = 1, just_hor = 1, bk_color = 0x00000000 })
    text_data.set(LBL,    { text = "", color = GREY,   font = 9,  font_size = 11, just_ver = 1, just_hor = 1, bk_color = 0x00000000 })
    text_data.set(HEADER, { text = "", color = ORANGE, font = 10, font_size = 16, just_ver = 1, just_hor = 0, bk_color = 0x00000000 })
    text_data.set(ROW,    { text = "", color = WHITE,  font = 10, font_size = 18, just_ver = 1, just_hor = 0, bk_color = 0x00000000 })
end

function init(args)
    if initialized then return end
    configure_text()
    decode_image(14, PNG_ID, 18, DECODED_ID, WHITE)
    initialized = true
end

function set_mode(args)
    local m = get_byte(args, 0)
    if m >= 1 and m <= 2 then mode = m end
end

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
end

function set_header(args)
    header = args:sub(1, #args)
end

function set_rows(args)
    local i = 0
    selected = get_byte(args, i); i = i + 1
    local n = get_byte(args, i); i = i + 1
    rows = {}
    for k = 1, n do
        local len = get_byte(args, i); i = i + 1
        rows[k] = args:sub(i + 1, i + len); i = i + len
    end
end

local function knob_pos(slot)
    local col = (slot - 1) % 4
    local row = 0
    if slot > 4 then row = 1 end
    return 31 + col * 118, 32 + row * 118
end

local function draw_knobs()
    text_data.set(TITLE, { text = title, color = WHITE })
    draw_text(TITLE, 0, 5, 480, 22)

    for slot = 1, 8 do
        local x, y = knob_pos(slot)
        local v = values[slot]
        local is_active = (slot - 1) == active
        local tint = is_active and ORANGE or DIM
        draw_image(18, DECODED_ID, x, y, 0, FRAME * v, FRAME, FRAME, tint)
        text_data.set(VAL, { text = tostring(v), color = is_active and WHITE or GREY })
        draw_text(VAL, x, y + 20, 64, 26)
        text_data.set(LBL, { text = labels[slot], color = is_active and WHITE or DARK })
        draw_text(LBL, x - 8, y + 66, 80, 14)
    end
end

local function draw_list()
    text_data.set(HEADER, { text = header, color = ORANGE })
    draw_text(HEADER, 12, 6, 456, 22)

    for k = 1, #rows do
        local y = LIST_TOP + (k - 1) * ROW_H
        local is_sel = (k - 1) == selected
        if is_sel then
            draw_rect(6, y, 468, ROW_H - 4, PANEL)
            draw_rect(6, y, 4, ROW_H - 4, ORANGE)
        end
        text_data.set(ROW, { text = rows[k], color = is_sel and WHITE or GREY })
        draw_text(ROW, 20, y + 6, 448, 22)
    end
end

function draw(args)
    if not initialized then init("") end

    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)

    if mode == 2 then
        draw_list()
    else
        draw_knobs()
    end
end
