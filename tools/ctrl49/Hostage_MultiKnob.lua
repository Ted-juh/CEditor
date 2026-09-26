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

local initialized = false
local mode = 0
local title = "HOSTAGE"
local active = 0
local labels = { "", "", "", "", "", "", "", "" }
local values = { 0, 0, 0, 0, 0, 0, 0, 0 }

local TITLE = text_data.new()
local VAL   = text_data.new()
local LBL   = text_data.new()
local SPLASH = text_data.new()
local WORDMARK = text_data.new()

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
    initialized = true
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
-- when it fails. The logo carries its own orange: tinted at draw time, a white mask came out
-- white on the keyboard, so the colour is in the image and the tint is white (no change).
local function draw_splash()
    draw_text(SPLASH, 0, 180, 480, 24)
    local drawn = false
    if pcall then
        drawn = pcall(draw_image, 18, LOGO_DECODED_ID, 20, 84, 0, 0, 440, 80, WHITE)
    end
    if not drawn then
        draw_text(WORDMARK, 0, 84, 480, 80)
    end
    draw_rect(192, 222, 96, 2, DIM)
    draw_rect(192, 222, 48, 2, ORANGE)
end

function draw(args)
    if not initialized then init("") end

    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)

    if mode == 0 then
        draw_splash()
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
end
