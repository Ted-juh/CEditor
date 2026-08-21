-- CTRL49 preset-browser list page: a header plus up to 6 visible patch-name rows with the
-- selected row highlighted. The host owns the full patch list and scrolling; it sends the
-- visible window (the names around the selection) via set_rows and a header via set_header,
-- then redraws. On the data dial the host reselects; on dial-press it loads the patch.
--
-- Host contract:
--   set_header(args): args IS the header string (e.g. "GAIA PATCHES   003/012")
--   set_rows(args):   [selectedRow 0..5][rowCount][ rowCount x [nameLen][name bytes] ]
--   set_mode(args):   no-op (session startup calls set_mode(1))

local ROWS = 6
local ROW_H = 36
local TOP = 34

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local PANEL  = 0xFF1A2230
local WHITE  = 0xFFFFFFFF
local GREY   = 0xFFAAB2BF
local DARK   = 0xFF596273

local initialized = false
local header = "PRESETS"
local selected = 0
local rows = {}

local HEADER = text_data.new()
local ROW = text_data.new()

local function configure_text()
    text_data.set(HEADER, { text = "", color = ORANGE, font = 10, font_size = 16, just_ver = 1, just_hor = 0, bk_color = 0x00000000 })
    text_data.set(ROW,    { text = "", color = WHITE,  font = 10, font_size = 18, just_ver = 1, just_hor = 0, bk_color = 0x00000000 })
end

function init(args)
    if initialized then return end
    configure_text()
    initialized = true
end

function set_mode(args) end

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

function draw(args)
    if not initialized then init("") end

    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)

    text_data.set(HEADER, { text = header, color = ORANGE })
    draw_text(HEADER, 12, 6, 456, 22)

    for k = 1, #rows do
        local y = TOP + (k - 1) * ROW_H
        local is_sel = (k - 1) == selected
        if is_sel then
            draw_rect(6, y, 468, ROW_H - 4, PANEL)
            draw_rect(6, y, 4, ROW_H - 4, ORANGE)
        end
        text_data.set(ROW, { text = rows[k], color = is_sel and WHITE or GREY })
        draw_text(ROW, 20, y + 6, 448, 22)
    end
end
