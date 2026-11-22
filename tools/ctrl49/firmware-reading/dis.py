# dis.py APP_IMAGE DISASSEMBLY LO HI [c]
# Prints the disassembly lines in [LO, HI) with literal-pool values resolved and strings quoted.
# A fifth argument keeps only calls, compares, constants and returns.
import sys, struct, re
app = open(sys.argv[1],'rb').read(); B = 0x08040000
lo, hi = int(sys.argv[3],16), int(sys.argv[4],16); only = len(sys.argv) > 5
def cstr(a):
    if not (B <= a < B + len(app)): return None
    o = a - B; e = app.find(b'\0', o, o + 60); s = app[o:e]
    return s.decode() if e > o+1 and all(32 <= c < 127 for c in s) else None
for l in open(sys.argv[2]):
    m = re.match(r'\s*([0-9a-f]+):\t([0-9a-f ]+)\t(.*)', l)
    if not m: continue
    a = int(m.group(1), 16)
    if a < lo: continue
    if a >= hi: break
    txt = m.group(3).rstrip(); extra = ''
    mm = re.search(r'@ \(0x([0-9a-f]+)\)', txt)
    if mm:
        p = int(mm.group(1),16)
        if B <= p < B + len(app) - 3:
            v = struct.unpack_from('<I', app, p - B)[0]; s = cstr(v)
            extra = f"  ; =0x{v:08x}" + (f' "{s}"' if s else '')
        txt = re.sub(r'\s*@ \(0x[0-9a-f]+\)', '', txt)
    if only and not re.search(r'\b(bl|blx|b\.w|pop|bx|cmp|movs|movw|tbb|tbh)\b', txt) and not extra: continue
    print(f"{a:x}: {txt[:46]}{extra}")
