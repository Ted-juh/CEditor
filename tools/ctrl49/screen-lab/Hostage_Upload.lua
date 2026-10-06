-- CTRL49 screen lab: the upload probe. Two pages HoSTage could have (Section, a plug-in's own
-- window; Labels, every word drawn in the app's typeface) need pictures made while the page runs,
-- uploaded then. Nothing has been uploaded to the keyboard after startup yet. This page answers it:
-- the host (Ctrl49ScreenLab.cpp, upload mode) uploads PNGs of growing size while it keeps the page
-- redrawing ten times a second, then asks the page to decode each and shows a piece of it.
--
--   set_frame [frameHi][frameLo]                                 every redraw
--   show      [slot][idHi][idLo][kbHi][kbLo][msHi][msLo]          after each upload
--
-- What to watch: the orange bar under the header keeps moving during an upload (the redraws get
-- through between the upload's frames), and each row gets a picture beside its size: the picture
-- decoded after the page had been running, which no page has done on the keyboard yet.
--
-- Standard libraries are not assumed: no math.*, only what the proven pages already use.

local BLACK, WHITE, GREY, ORANGE, DARK = 0xFF07090D, 0xFFFFFFFF, 0xFFAAB2BF, 0xFFFF9408, 0xFF1C222B
local frame, redraws = 0, 0
local shown = {}              -- slot -> { buffer, kb, ms }
local HEAD, ROW, BIG
local initialized = false

local function textbox (size, hor, colour)
    local t = text_data.new()
    text_data.set(t, { text = "", color = colour, font = 10, font_size = size, just_ver = 1,
                       just_hor = hor, bk_color = 0x00000000, border_width_top = 0,
                       border_width_bottom = 0, border_width_left = 0, border_width_right = 0 })
    return t
end

function init (args)
    if initialized then return end
    HEAD = textbox(18, 0, WHITE)
    ROW = textbox(14, 0, GREY)
    BIG = textbox(20, 2, WHITE)
    initialized = true
end

function set_mode (args) end

function set_frame (args)
    frame = get_byte(args, 0) * 256 + get_byte(args, 1)
end

function show (args)
    local slot = get_byte(args, 0)
    local id = get_byte(args, 1) * 256 + get_byte(args, 2)
    local kb = get_byte(args, 3) * 256 + get_byte(args, 4)
    local ms = get_byte(args, 5) * 256 + get_byte(args, 6)
    decode_image(14, id, 18, id + 1, WHITE)
    shown[slot] = { buffer = id + 1, kb = kb, ms = ms }
end

function draw (args)
    if not initialized then init("") end
    redraws = redraws + 1
    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)
    text_data.set(HEAD, { text = "UPLOAD PROBE" })
    draw_text(HEAD, 10, 6, 300, 22)
    text_data.set(BIG, { text = tostring(frame) })
    draw_text(BIG, 380, 6, 90, 22)
    draw_rect(0, 32, 480, 3, DARK)
    draw_rect((frame * 8) % 440, 32, 40, 3, ORANGE)
    for slot = 0, 5 do
        local y = 44 + slot * 37
        local s = shown[slot]
        draw_rect(10, y, 460, 34, DARK)
        if s ~= nil then
            text_data.set(ROW, { text = tostring(s.kb) .. " KB   " .. tostring(s.ms) .. " MS" })
            draw_text(ROW, 18, y + 8, 200, 18)
            -- a piece of the picture: decoded after the page had been running
            draw_image(18, s.buffer, 230, y + 2, 0, 0, 120, 30, WHITE)
        end
    end
end
