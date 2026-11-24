# llvmdis.py LLVM_BIN_DIR IMAGE OUT_LISTING [BASE]
# Disassembles a flat Thumb image with LLVM's objdump, which ships with Visual Studio's Clang
# (VC\Tools\Llvm\x64\bin), so no arm-none-eabi toolchain is needed. BASE is the load address in hex:
# 08040000 (the default) for the Advance application, 08000000 for the second chip's image that
# the application carries. Writes one line per instruction, "address  instruction", with every
# pc-relative load's literal resolved and quoted when it points at a string. Reads and writes
# files; it runs nothing but the two LLVM tools.
import os, re, struct, subprocess, sys, tempfile

llvm, image, out = sys.argv[1:4]
BASE = int(sys.argv[4], 16) if len(sys.argv) > 4 else 0x08040000
app = open(image, 'rb').read()

def cstr(a):
    if not BASE <= a < BASE + len(app):
        return None
    o = a - BASE; e = app.find(b'\0', o, o + 80); s = app[o:e]
    return s.decode() if e > o + 1 and all(32 <= c < 127 for c in s) else None

with tempfile.TemporaryDirectory() as tmp:
    elf = os.path.join(tmp, 'app.elf')
    subprocess.run([os.path.join(llvm, 'llvm-objcopy'), '-I', 'binary', '-O', 'elf32-littlearm',
                    '--rename-section', '.data=.text,alloc,load,readonly,code,contents', image, elf],
                   check=True)
    listing = subprocess.run([os.path.join(llvm, 'llvm-objdump'), '-d', '--no-show-raw-insn',
                              '--triple=thumbv7em-none-eabi', '--mattr=+vfp4,+dsp',
                              f'--adjust-vma=0x{BASE:08x}', elf],
                             capture_output=True, text=True, check=True).stdout

line = re.compile(r'^\s*([0-9a-f]+):\s+(.*)$')
with open(out, 'w') as o:
    for l in listing.splitlines():
        m = line.match(l)
        if not m:
            continue
        a = int(m.group(1), 16)
        text = re.sub(r'\s*<_binary_[^>]*>', '', m.group(2)).replace('\t', ' ')
        text = re.sub(r' @ imm = #\S+$', '', text)
        extra = ''
        lit = re.search(r' @ 0x([0-9a-f]+)$', text)
        if lit:
            # llvm-objdump prints a literal's place without --adjust-vma applied.
            t = int(lit.group(1), 16) + BASE
            if BASE <= t < BASE + len(app) - 3:
                v = struct.unpack_from('<I', app, t - BASE)[0]; s = cstr(v)
                extra = f"  ; =0x{v:08x}" + (f' "{s}"' if s else '')
            text = text[:lit.start()].rstrip()
        o.write(f"{a:08x}  {text}{extra}\n")
