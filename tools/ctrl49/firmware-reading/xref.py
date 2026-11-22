# xref.py APP_IMAGE DISASSEMBLY VALUE [VALUE ...]
# Who loads a 32-bit constant? Finds the literal-pool slots holding VALUE (hex), then the ldr lines
# that read them. APP_IMAGE is the flat application image (base 0x08040000), DISASSEMBLY its objdump.
import sys, struct, re
app = open(sys.argv[1], 'rb').read(); BASE = 0x08040000
dis = open(sys.argv[2]).read().splitlines()
for value in sys.argv[3:]:
    v = int(value, 16); slots = []
    i = app.find(struct.pack('<I', v))
    while i != -1:
        if i % 4 == 0: slots.append(BASE + i)
        i = app.find(struct.pack('<I', v), i + 1)
    users = [l.strip() for l in dis if any(f"(0x{s:x})" in l or f"(0x{s:08x})" in l for s in slots)]
    print(f"0x{v:08x}: pool slots {[hex(s) for s in slots[:4]]}; loaded by:")
    for u in users[:6]: print("   ", u)
