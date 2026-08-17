-- CTRL49 filmstrip knob beauty-test page. Displays one CEditor-generated arc-knob
-- filmstrip (128 frames of 64px, white-on-transparent) driven by a single value, plus
-- the numeric value and a label. Proves the pre-rendered-filmstrip pipeline on hardware:
-- the device only crops and tints one frame per draw; all the anti-aliasing was baked on
-- the PC. Host contract: upload the PNG as object id 0x0200, upload this Lua, bind, then
-- call set_value([0..127]) + draw on every encoder change.
--
-- Asset conventions (handoff section 9): asset type 14 = uploaded PNG, type 18 = decoded
-- Buffer2D. decode_image tints to white so draw_image's colour argument can re-tint.

local FRAME       = 64        -- per-frame size in the strip
local PNG_ID      = 0x0200    -- uploaded filmstrip PNG object id
local DECODED_ID  = 0x0201    -- decoded Buffer2D id
local KNOB_X      = 208       -- centre the 64px knob on the 480-wide screen
local KNOB_Y      = 70

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local WHITE  = 0xFFFFFFFF
local GREY   = 0xFFAAB2BF
local DARK   = 0xFF596273

local value = 0
local initialized = false

local VALUE_TEXT = text_data.new()
local LABEL_TEXT = text_data.new()

local function configure_text()
    text_data.set(VALUE_TEXT, {
        text = "", color = WHITE, font = 10, font_size = 40,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
    text_data.set(LABEL_TEXT, {
        text = "", color = GREY, font = 9, font_size = 13,
        just_ver = 1, just_hor = 1, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0
    })
end

function init(args)
    if initialized then return end
    configure_text()
    -- Decode the uploaded filmstrip once, tinted white so draw_image can re-colour it.
    decode_image(14, PNG_ID, 18, DECODED_ID, WHITE)
    initialized = true
end

-- The session startup calls set_mode(1) for the loading->landing transition; this page
-- has a single mode, so it is a no-op kept for contract compatibility.
function set_mode(args)
end

function set_value(args)
    value = get_byte(args, 0)
    if value < 0 then value = 0 end
    if value > 127 then value = 127 end
end

function draw(args)
    if not initialized then init("") end

    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 4, ORANGE)

    -- Crop frame `value` from the vertical strip and tint it orange.
    draw_image(18, DECODED_ID, KNOB_X, KNOB_Y, 0, FRAME * value, FRAME, FRAME, ORANGE)

    text_data.set(VALUE_TEXT, { text = tostring(value), color = WHITE })
    draw_text(VALUE_TEXT, 140, 150, 200, 46)

    text_data.set(LABEL_TEXT, { text = "CUTOFF   /   ENCODER 1", color = GREY })
    draw_text(LABEL_TEXT, 140, 205, 200, 20)

    text_data.set(LABEL_TEXT, { text = "CEDITOR FILMSTRIP KNOB", color = DARK })
    draw_text(LABEL_TEXT, 140, 242, 200, 18)
end
