# pcapsysex.py OUT_JSONL CAPTURE [CAPTURE ...]
# Pulls the CTRL49's SysEx out of USBPcap captures (pcapng, link type 249) and writes one JSON line
# per complete frame: capture, time, direction ("out" is host to keyboard), USB-MIDI cable, bytes.
# Only the device that carries CTRL49 frames (F0 00 01 05 31 08) is decoded; other devices on the
# same root hub are left out. It reads the captures and writes one file; it sends nothing.
import json, os, struct, sys

def packets(path):
    """(time, bus, device, endpoint, direction, data) for every bulk packet that carries data."""
    d = open(path, 'rb').read()
    if d[:4] != b'\x0a\x0d\x0d\x0a':
        sys.exit(f"{path}: not a pcapng file")
    p = 0; e = '<'; links = []
    while p + 12 <= len(d):
        btype = struct.unpack_from(e + 'I', d, p)[0]
        if btype == 0x0A0D0D0A:
            e = '<' if d[p + 8:p + 12] == b'\x4d\x3c\x2b\x1a' else '>'
        blen = struct.unpack_from(e + 'I', d, p + 4)[0]
        if blen < 12:
            break
        body = d[p + 8:p + blen - 4]; p += blen
        if btype == 0x0A0D0D0A:
            links = []
        elif btype == 1:
            links.append(struct.unpack_from(e + 'H', body, 0)[0])
        elif btype == 6:
            iface, hi, lo, caplen = struct.unpack_from(e + 'IIII', body, 0)
            if links[iface] != 249:
                continue
            pkt = body[20:20 + caplen]
            hlen = struct.unpack_from('<H', pkt, 0)[0]
            info = pkt[16]
            bus, dev = struct.unpack_from('<HH', pkt, 17)
            endpoint, transfer = pkt[21], pkt[22]
            data = pkt[hlen:hlen + struct.unpack_from('<I', pkt, 23)[0]]
            if transfer != 3 or not data:  # bulk only
                continue
            # OUT data rides on the request (info bit 0 clear), IN data on the completion (set).
            if endpoint & 0x80:
                if info & 1:
                    yield ((hi << 32) | lo) / 1e6, bus, dev, endpoint, 'in', data
            elif not info & 1:
                yield ((hi << 32) | lo) / 1e6, bus, dev, endpoint, 'out', data

def carries_ctrl49(data):
    return any(data[i] & 0x0F == 0x4 and data[i + 1:i + 4] == b'\xf0\x00\x01'
               and data[i + 5:i + 8] == b'\x05\x31\x08' for i in range(0, len(data) - 7, 4))

CIN_BYTES = {0x4: 3, 0x5: 1, 0x6: 2, 0x7: 3}

def main(out, paths):
    with open(out, 'w') as o:
        for path in paths:
            name = os.path.basename(path)
            pk = list(packets(path))
            devices = {(b, dv) for _, b, dv, _, _, data in pk if carries_ctrl49(data)}
            partial = {}; n = 0
            for t, bus, dev, ep, direction, data in pk:
                if (bus, dev) not in devices:
                    continue
                for i in range(0, len(data) - 3, 4):
                    cable, cin = data[i] >> 4, data[i] & 0x0F
                    if cin not in CIN_BYTES:
                        continue
                    chunk = data[i + 1:i + 1 + CIN_BYTES[cin]]
                    key = (direction, cable)
                    if chunk[:1] == b'\xf0':
                        partial[key] = bytearray()
                    if key not in partial:
                        continue
                    partial[key] += chunk
                    if 0xF7 in chunk:
                        frame = bytes(partial.pop(key))
                        o.write(json.dumps({'capture': name, 't': round(t, 6), 'dir': direction,
                                            'cable': cable, 'hex': frame.hex(' ')}) + '\n')
                        n += 1
            where = ', '.join(f"bus {b} device {dv}" for b, dv in sorted(devices)) or 'no CTRL49 device'
            print(f"{name}: {n} SysEx frames ({where})")

if len(sys.argv) < 3:
    sys.exit(__doc__ or "usage: pcapsysex.py OUT_JSONL CAPTURE [CAPTURE ...]")
main(sys.argv[1], sys.argv[2:])
