# hexblobs.py BINARY OUT_DIR
# Finds Intel HEX images embedded as text in a binary (the Advance updater carries its firmware
# that way), parses them, and writes each as a flat image named after its load address.
import sys, re, os
d = open(sys.argv[1], 'rb').read()
outdir = sys.argv[2]; os.makedirs(outdir, exist_ok=True)
blocks = [m for m in re.finditer(rb'(?::[0-9A-Fa-f]{10,}\r?\n?){8,}', d)]
print(len(blocks), "Intel HEX blocks")
for n, m in enumerate(blocks):
    text = m.group(0).decode()
    upper = 0; mem = {}; start = None; seg_bases = []
    for line in re.findall(r':[0-9A-Fa-f]+', text):
        b = bytes.fromhex(line[1:])
        ln, addr, typ = b[0], (b[1] << 8) | b[2], b[3]
        data = b[4:4 + ln]
        if typ == 0:
            base = upper + addr
            for i, x in enumerate(data): mem[base + i] = x
        elif typ == 2: upper = int.from_bytes(data, 'big') << 4; seg_bases.append(upper)
        elif typ == 4: upper = int.from_bytes(data, 'big') << 16; seg_bases.append(upper)
        elif typ == 5: start = int.from_bytes(data, 'big')
        elif typ == 3: start = ('seg', data.hex())
    if not mem: continue
    lo_a, hi_a = min(mem), max(mem)
    # contiguous ranges
    ranges = []; prev = None
    for a in sorted(mem):
        if prev is None or a != prev + 1: ranges.append([a, a])
        else: ranges[-1][1] = a
        prev = a
    img = bytearray(b'\xff' * (hi_a - lo_a + 1))
    for a, x in mem.items(): img[a - lo_a] = x
    path = os.path.join(outdir, f"hex{n:02d}_{lo_a:08x}.bin"); open(path, 'wb').write(img)
    big = [f"0x{r[0]:08x}-0x{r[1]:08x}" for r in ranges if r[1] - r[0] > 4096][:6]
    print(f"#{n:02d} file@0x{m.start():x}: {len(mem)} bytes, span 0x{lo_a:08x}..0x{hi_a:08x}, "
          f"start={start if not isinstance(start,int) else hex(start)}, ext bases={sorted(set(hex(s) for s in seg_bases))[:6]}, ranges={big}")
