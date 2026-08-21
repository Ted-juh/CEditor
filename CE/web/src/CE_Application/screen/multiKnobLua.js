// The CTRL49 multi-knob display page, embedded as a string so the editor preview runs the
// exact same Lua that ships to the keyboard. Mirror of tools/ctrl49/CEditor_MultiKnob.lua
// (keep the two in sync). Contract: PNG filmstrip = object id 0x0200; set_labels/set_values
// as documented in the .lua header.

export const MULTI_KNOB_LUA = String.raw`
local FRAME      = 64
local PNG_ID     = 0x0200
local DECODED_ID = 0x0201

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local WHITE  = 0xFFFFFFFF
local GREY   = 0xFFAAB2BF
local DIM    = 0xFF5A6B82
local DARK   = 0xFF596273

local initialized = false
local title = "CEDITOR"
local active = 0
local labels = { "", "", "", "", "", "", "", "" }
local values = { 0, 0, 0, 0, 0, 0, 0, 0 }

local TITLE = text_data.new()
local VAL   = text_data.new()
local LBL   = text_data.new()

local function configure_text()
    text_data.set(TITLE, { text = "", color = WHITE, font = 10, font_size = 18, just_ver = 1, just_hor = 1, bk_color = 0x00000000 })
    text_data.set(VAL,   { text = "", color = WHITE, font = 10, font_size = 20, just_ver = 1, just_hor = 1, bk_color = 0x00000000 })
    text_data.set(LBL,   { text = "", color = GREY,  font = 9,  font_size = 11, just_ver = 1, just_hor = 1, bk_color = 0x00000000 })
end

function init(args)
    if initialized then return end
    configure_text()
    decode_image(14, PNG_ID, 18, DECODED_ID, WHITE)
    initialized = true
end

function set_mode(args) end

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

local function knob_pos(slot)
    local col = (slot - 1) % 4
    local row = 0
    if slot > 4 then row = 1 end
    return 31 + col * 118, 32 + row * 118
end

function draw(args)
    if not initialized then init("") end
    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)
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
`;
