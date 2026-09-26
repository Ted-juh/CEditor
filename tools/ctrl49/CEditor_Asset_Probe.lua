-- Asset probe: which images does this keyboard already carry in its own flash?
--
-- The Akai ADVANCE firmware (same VIP runtime) ships 512 tintable knob frames, pictograms and
-- sprites in its asset flash, as asset types other than the 14/18 a host uploads. If the CTRL49
-- carries them too, a page could draw them directly: nothing to upload, nothing to decode.
--
-- READ-ONLY. This page only asks asset_get_valid(type, id) and tries draw_image(type, id, ...)
-- under pcall. It writes nothing to the keyboard's flash and uses no asset command.
--
-- Run with Start_CTRL49_Asset_Probe.cmd (HoSTage/CEditor closed). The list shows, per asset type,
-- how many ids answer valid and the first and last. Turn encoder 1 to show the first images of
-- each type that has any; each is drawn plain and tinted orange, so a tintable (8-bit) image shows
-- up orange and a colour one does not change.

local BLACK  = 0xFF07090D
local ORANGE = 0xFFFF9408
local WHITE  = 0xFFFFFFFF
local GREY   = 0xFFAAB2BF
local DIM    = 0xFF5A6B82

-- Types seen in the ADVANCE asset flash, plus 14 and 18 (host-uploaded PNG / decoded buffer).
local TYPES = { 1, 3, 8, 11, 13, 14, 15, 16, 18, 19, 20 }
local MAX_ID = 600

local scanned = false
local results = {}      -- { type, count, first, last, ids = {..first 12..} }
local selected = 0      -- index into the types that have images; 0 = the list
local status = ""

local T = text_data.new()
local H = text_data.new()

local function configure()
    text_data.set(T, { text = "", color = GREY, font = 9, font_size = 13,
        just_ver = 1, just_hor = 0, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0, border_width_left = 0, border_width_right = 0 })
    text_data.set(H, { text = "", color = WHITE, font = 10, font_size = 16,
        just_ver = 1, just_hor = 0, bk_color = 0x00000000,
        border_width_top = 0, border_width_bottom = 0, border_width_left = 0, border_width_right = 0 })
end

local function valid(t, id)
    if not asset_get_valid then return false end
    local ok, answer = pcall(asset_get_valid, t, id)
    return ok and answer == true
end

local function scan()
    if scanned then return end
    scanned = true
    if not asset_get_valid then status = "asset_get_valid is not on this keyboard" end
    for _, t in ipairs(TYPES) do
        local r = { type = t, count = 0, first = -1, last = -1, ids = {} }
        for id = 0, MAX_ID do
            if valid(t, id) then
                r.count = r.count + 1
                if r.first < 0 then r.first = id end
                r.last = id
                if #r.ids < 12 then r.ids[#r.ids + 1] = id end
            end
        end
        results[#results + 1] = r
    end
end

function init(args) configure() end
function set_mode(args) end

-- Encoder 1 (via Ctrl49KnobTest): 0..127. Every 8 steps is the next type that has images.
function set_value(args)
    local v = get_byte(args, 0)
    selected = math.floor(v / 8)
end

local function with_images()
    local list = {}
    for _, r in ipairs(results) do
        if r.count > 0 then list[#list + 1] = r end
    end
    return list
end

local function line(text, y, colour, x, w)
    text_data.set(T, { text = text, color = colour or GREY })
    draw_text(T, x or 12, y, w or 460, 16)
end

function draw(args)
    scan()
    draw_rect(0, 0, 480, 272, BLACK)
    draw_rect(0, 0, 480, 3, ORANGE)

    local shown = with_images()
    if selected == 0 or selected > #shown then
        text_data.set(H, { text = "Asset probe: images in this keyboard's flash" })
        draw_text(H, 12, 8, 460, 20)
        local y = 34
        for _, r in ipairs(results) do
            local text = "type " .. tostring(r.type) .. ": " .. tostring(r.count) .. " valid"
            if r.count > 0 then
                text = text .. "  (ids " .. tostring(r.first) .. " to " .. tostring(r.last) .. ")"
            end
            line(text, y, r.count > 0 and WHITE or DIM)
            y = y + 18
        end
        if status ~= "" then line(status, 232, ORANGE) end
        line("Turn encoder 1 to see the images of each type.", 250, DIM)
        return
    end

    local r = shown[selected]
    text_data.set(H, { text = "type " .. tostring(r.type) .. " (" .. tostring(r.count) .. " images)" })
    draw_text(H, 12, 8, 460, 20)
    line("top row plain, bottom row tinted orange (orange = tintable)", 30, DIM)
    local x = 12
    local drawn, failed = 0, 0
    for i, id in ipairs(r.ids) do
        if i > 6 then break end
        local ok1 = pcall(draw_image, r.type, id, x, 56)
        local ok2 = pcall(draw_image, r.type, id, x, 160, 0, 0, 72, 90, ORANGE)
        if ok1 or ok2 then drawn = drawn + 1 else failed = failed + 1 end
        line(tostring(id), 142, GREY, x, 72)
        x = x + 78
    end
    line("drawn " .. tostring(drawn) .. ", refused " .. tostring(failed), 254, failed > 0 and ORANGE or GREY)
end
