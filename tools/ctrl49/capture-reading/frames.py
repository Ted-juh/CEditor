# frames.py FRAMES_JSONL                         count CTRL49 frames per capture, direction, TT/CC
# frames.py FRAMES_JSONL REGEX [CAPTURE_PREFIX]  list the frames whose "TT/CC" matches, in order
# Reads what pcapsysex.py wrote. A listing shows the payload in hex; for the type-02 commands that
# address an object it names the id first, and 02/22's string is shown as text.
import collections, json, re, sys

HEADER = bytes.fromhex('f0 00 01 05 31 08')
ADDRESSED = set(range(0x21, 0x2C)) | {0x11, 0x31, 0x32, 0x33, 0x39, 0x3A}

def payload_text(tt, cc, p):
    if tt == 0x02 and cc in ADDRESSED and len(p) >= 2:
        rest = repr(p[2:-1].decode('latin-1')) if cc == 0x22 else p[2:].hex(' ')
        return f"id 0x{(p[0] << 7) | p[1]:03x} | {rest}"
    return p.hex(' ')

rows = [json.loads(line) for line in open(sys.argv[1])]
if len(sys.argv) > 2:
    pattern = re.compile(sys.argv[2], re.I)
    prefix = sys.argv[3] if len(sys.argv) > 3 else ''
    for r in rows:
        f = bytes.fromhex(r['hex'])
        if not f.startswith(HEADER) or not r['capture'].startswith(prefix):
            continue
        tt, cc = f[6], f[7]
        if pattern.fullmatch(f"{tt:02X}/{cc:02X}"):
            print(f"{r['capture'][:28]:28} {r['t']:.3f} {r['dir']:3} c{r['cable']} {tt:02X}/{cc:02X} "
                  f"{payload_text(tt, cc, f[10:-1])}")
else:
    counts = collections.OrderedDict()
    for r in rows:
        f = bytes.fromhex(r['hex'])
        key = f"{f[6]:02X}/{f[7]:02X}" if f.startswith(HEADER) else 'other'
        counts.setdefault(r['capture'], collections.Counter())[(r['dir'], key)] += 1
    for capture, c in counts.items():
        print(capture)
        for direction in ('out', 'in'):
            line = '  '.join(f"{k}={n}" for (d, k), n in sorted(c.items()) if d == direction)
            if line:
                print(f"  {direction:3} {line}")
