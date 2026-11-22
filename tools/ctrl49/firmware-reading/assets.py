# assets.py RESOURCE_IMAGE [PREVIEW_DIR]
# Lists the records of the resource image (the one loaded at 0x08100000): type, id, size and what
# each holds. With PREVIEW_DIR (needs Pillow) it also writes the images as PNG files to look at.
# A record is: type u16, id u16, 10 10 10 10, length u32, "ADDF", ..., a 16-byte checksum, data.
# Image containers (types 1, 3, 8, 11, 13) are: length u32 BE, 0 u16, count u16, count offsets u32,
# then per image: format u32 (2 PNG, 3 raw 8-bit coverage, 0 raw RGB565), width u16, height u16.
import os, re, struct, sys

r = open(sys.argv[1], 'rb').read()
preview = sys.argv[2] if len(sys.argv) > 2 else None
if preview:
    from PIL import Image
    os.makedirs(preview, exist_ok=True)

def container(body):
    c = body[4:]
    count = struct.unpack_from('<H', c, 2)[0]
    for n, o in enumerate(struct.unpack_from(f'<{count}I', c, 4)):
        fmt = c[o + 3]; w, h = struct.unpack_from('<HH', c, o + 4)
        yield n, fmt, w, h, c, o

for m in re.finditer(rb'\x10\x10\x10\x10', r):
    s = m.start() - 4
    typ, aid = struct.unpack_from('<HH', r, s)
    length = struct.unpack_from('<I', r, s + 8)[0]
    body = r[s + 36:s + 36 + length]
    if typ in (1, 3, 8, 11, 13):
        items = list(container(body))
        sizes = sorted({(w, h) for _, _, w, h, _, _ in items})
        what = f"{len(items)} image(s) {sizes[:4]}"
        if preview:
            for n, fmt, w, h, c, o in items:
                name = os.path.join(preview, f"type{typ}_id{aid}_{n:03d}.png")
                if fmt == 2:
                    size = struct.unpack_from('<I', c, o + 8)[0]
                    open(name, 'wb').write(c[o + 12:o + 12 + size])
                elif fmt == 3:
                    Image.frombytes('L', (w, h), c[o + 8:o + 8 + w * h]).save(name)
                elif fmt == 0:
                    px = struct.unpack_from(f'<{w * h}H', c, o + 8)
                    im = Image.new('RGB', (w, h))
                    im.putdata([((p >> 11) * 255 // 31, ((p >> 5) & 63) * 255 // 63, (p & 31) * 255 // 31) for p in px])
                    im.save(name)
    elif b'\x89PNG' in body[:12]:
        p = body.find(b'\x89PNG'); w, h = struct.unpack_from('>II', body, p + 16)
        what = f"PNG {w}x{h}"
        if preview:
            open(os.path.join(preview, f"type{typ}_id{aid}.png"), 'wb').write(body[p:])
    elif b'OTTO' in body[:16]:
        what = "OpenType font"
    elif typ == 16:
        what = "Lua source"
    else:
        what = "data"
    print(f"type {typ:2} id {aid:2}  {length:8} bytes  {what}")
