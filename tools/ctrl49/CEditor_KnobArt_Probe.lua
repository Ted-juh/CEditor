-- Knob-art probe: draws the CTRL49's own built-in knob art (asset type 11, id 0).
--
-- The asset probe found type 11 id 0 on the keyboard but drew nothing: draw_image with up to nine
-- arguments draws only a plain image (data starting with width and height), and type 11 is a
-- multi-frame container. The firmware has a second form for it (read from the Akai ADVANCE
-- firmware, tools/ctrl49/README.md):
--
--   draw_image(_, _, x, y, _, _, w, h, colour, frame)
--
-- ten arguments; it always draws from type 11 id 0, frame `frame`, w x h, tinted `colour`; the first
-- two and the fifth and sixth are ignored. This form always returns 64: it does not pass on whether
-- the frame was found, so the screen is the only answer. The frames, as the ADVANCE's art has them
-- (the CTRL49's may differ; that is what this page is for):
--   0          the base, 74 x 71
--   1..128     the value arc, 66 x 62, one frame per value 0..127
--   129..256   the arc's cover, 66 x 62
--   257..384   the outer ring, 48 x 45
--   385..512   the ring's cover, 48 x 45
--
-- READ-ONLY: it draws, nothing else. Run with Start_CTRL49_KnobArt_Probe.cmd (HoSTage/CEditor, VIP
-- and the DAW closed). Turn encoder 1 to sweep the value 0..127.

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local BLUE   = 0xFF00AEFF
local GREEN  = 0xFF03FF00
local GREY   = 0xFF5A6B82
local WHITE  = 0xFFFFFFFF
local DARK   = 0xFF20262E

local value = 64
local T = text_data.new()

function init(args)
    text_data.set(T, { text = "", color = WHITE, font = 9, font_size = 13, just_ver = 1, just_hor = 0,
        bk_color = 0x00000000, border_width_top = 0, border_width_bottom = 0,
        border_width_left = 0, border_width_right = 0 })
end

function set_mode(args) end

function set_value(args)
    value = get_byte(args, 0)
    if value > 127 then value = 127 end
end

local function line(text, x, y, w, colour)
    text_data.set(T, { text = text, color = colour or WHITE })
    draw_text(T, x, y, w or 460, 16)
end

-- One frame of the art; "ok" when the call ran, "err" when Lua refused it.
local function frame(f, x, y, w, h, colour)
    local ok = pcall(draw_image, 0, 0, x, y, 0, 0, w, h, colour, f)
    return ok and "ok" or "err"
end

function draw(args)
    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)
    line("Knob art (type 11, id 0), value " .. tostring(value), 12, 8, 460, WHITE)

    local v = value
    local s = {}
    -- Each piece on its own, labelled.
    s[1] = frame(0,           12,  40, 74, 71, WHITE)    line("base 0",          12, 116, 80, GREY)
    s[2] = frame(1 + v,      100,  44, 66, 62, ORANGE)   line("arc " .. (1 + v), 100, 116, 80, GREY)
    s[3] = frame(129 + v,    180,  44, 66, 62, BLUE)     line("cover " .. (129 + v), 180, 116, 90, GREY)
    s[4] = frame(257 + v,    270,  52, 48, 45, GREEN)    line("ring " .. (257 + v), 262, 116, 80, GREY)
    s[5] = frame(385 + v,    340,  52, 48, 45, ORANGE)   line("cover " .. (385 + v), 334, 116, 90, GREY)

    -- Put together the way the firmware's knob does: base, then the arc on it, centred.
    local x0, y0 = 200, 150
    s[6] = frame(0,      x0,      y0,      74, 71, DARK)
    s[7] = frame(1 + v,  x0 + 4,  y0 + 4,  66, 62, ORANGE)
    line("together", x0 + 8, y0 + 76, 80, GREY)

    line("calls: " .. table.concat(s, " ") .. "   (err = Lua refused the call)", 12, 250, 460, GREY)
end
