# isx.py SETUP_EXE OUT_DIR
# Unpacks the files an InstallShield setup launcher carries after its last PE section (the
# "ISSetupStream"). Each file is scrambled with a key made from its own name and then
# zlib-compressed; this undoes both. It reads the launcher and writes the files; it runs nothing.
import os, struct, sys, zlib

MAGIC = (0x13, 0x35, 0x86, 0x07)

def decode(buf, seed):
    key = bytes(c ^ MAGIC[i % 4] for i, c in enumerate(seed))
    out = bytearray(len(buf))
    for i, b in enumerate(buf):
        out[i] = ~(key[i % len(key)] ^ (((b << 4) | (b >> 4)) & 0xFF)) & 0xFF
    return bytes(out)

def overlay_offset(d):
    pe = struct.unpack_from('<I', d, 0x3c)[0]
    count = struct.unpack_from('<H', d, pe + 6)[0]
    table = pe + 24 + struct.unpack_from('<H', d, pe + 20)[0]
    end = 0
    for i in range(count):
        size, pointer = struct.unpack_from('<II', d, table + 40 * i + 16)
        end = max(end, pointer + size)
    return end

def main(path, outdir):
    d = open(path, 'rb').read()
    p = overlay_offset(d)
    if d[p:p + 14] != b'ISSetupStream\0':
        sys.exit(f"no ISSetupStream at 0x{p:x}")
    count = struct.unpack_from('<H', d, p + 14)[0]
    p += 46
    os.makedirs(outdir, exist_ok=True)
    for _ in range(count):
        name_len = struct.unpack_from('<I', d, p)[0]
        size = struct.unpack_from('<I', d, p + 10)[0]
        name = d[p + 24:p + 24 + name_len].decode('utf-16le')
        p += 24 + name_len
        raw = d[p:p + size]; p += size
        seed = name.encode('latin-1', 'replace')
        # The launcher scrambles in 1024-byte blocks, the key restarting with each block.
        data = b''.join(decode(raw[i:i + 1024], seed) for i in range(0, len(raw), 1024))
        if data[:1] == b'\x78':
            data = zlib.decompress(data)
        open(os.path.join(outdir, os.path.basename(name)), 'wb').write(data)
        print(f"{name}: {size} -> {len(data)} bytes")

main(sys.argv[1], sys.argv[2])
