# pinmap.py LISTING [DATASHEET_PDF]
# Every GPIO_Init and GPIO_PinAFConfig call in the Advance application, with its arguments
# recovered by a small constant tracker that follows each calling function from its start.
# LISTING is llvmdis.py's output. With the F427/F429 datasheet (DS9405) as a second argument, each
# alternate function is named from the datasheet's alternate-function table (needs PyMuPDF).
# Reads files and prints; it runs nothing.
import re, sys

GPIO_INIT, GPIO_AF = 0x0806db38, 0x0806dbf4  # ST's peripheral library, as linked in 1.0.10
ARGS = {0x08069ed8: {'r0': 14}}  # the screen-pin routine takes its AF as an argument (AF14, 0x0806a0ea)
PORT = {0x40020000 + 0x400 * i: 'ABCDEFGHIJK'[i] for i in range(11)}
MODE = {0: 'in', 1: 'out', 2: 'AF', 3: 'analog'}
PULL = {0: '', 1: ', pull-up', 2: ', pull-down'}

lines = []
for l in open(sys.argv[1]):
    a = int(l[:8], 16); text = l[10:].rstrip()
    lit = re.search(r'; =0x([0-9a-f]+)', text)
    lines.append((a, text.split(';')[0].strip(), int(lit.group(1), 16) if lit else None))

def imm(s):
    m = re.fullmatch(r'#(-?0x[0-9a-f]+|-?\d+)', s.strip())
    return int(m.group(1), 0) if m else None

def track(i):
    """Registers and stack bytes just before instruction i, following its function from the push."""
    regs, stack = {}, {}
    start = i - 1
    while start > 0 and i - start < 600 and not lines[start][1].startswith('push'):
        start -= 1
    regs.update(ARGS.get(lines[start][0], {}))
    for _, ins, lit in lines[start:i]:
        op, _, args = ins.partition(' ')
        ops = [x.strip() for x in re.split(r',(?![^\[]*\])', args)] if args else []
        if op.startswith('bl') or op in ('bx', 'pop', 'b', 'b.w'):
            if op.startswith('bl'):
                for r in ('r0', 'r1', 'r2', 'r3', 'r12'): regs.pop(r, None)
            continue
        if op.startswith('ldr') and lit is not None and ops:
            regs[ops[0]] = lit; continue
        if op in ('movs', 'mov', 'mov.w', 'movw', 'uxtb', 'uxth') and len(ops) == 2:
            v = ('sp', 0) if ops[1] == 'sp' else imm(ops[1]) if ops[1].startswith('#') else regs.get(ops[1])
            if v is None: regs.pop(ops[0], None)
            else: regs[ops[0]] = v
            continue
        k = re.fullmatch(r'#(0x[0-9a-f]+|\d+)', ops[2]) if len(ops) == 3 else None
        if op in ('sub', 'sub.w', 'subs', 'add', 'add.w', 'adds') and k and ops[0] == ops[1] \
                and isinstance(regs.get(ops[1]), int):
            n = int(k.group(1), 0); regs[ops[0]] += n if op.startswith('add') else -n; continue
        wb = re.fullmatch(r'\[(r\d+), #(-?0x[0-9a-f]+|-?\d+)\]!', ops[1]) if len(ops) == 2 else None
        if op.startswith('str') and wb and isinstance(regs.get(wb.group(1)), tuple):
            off = regs[wb.group(1)][1] + int(wb.group(2), 0); regs[wb.group(1)] = ('sp', off)
            v = regs.get(ops[0])
            for b in range(4): stack[off + b] = (v >> (8 * b)) & 0xFF if isinstance(v, int) else None
            continue
        if op in ('add', 'adds') and len(ops) == 3 and ops[1] == 'sp':
            v = imm(ops[2]); regs[ops[0]] = ('sp', v) if v is not None else None; continue
        if op in ('add', 'adds') and len(ops) == 2 and ops[1] == 'sp':
            regs[ops[0]] = ('sp', 0); continue
        st = re.fullmatch(r'\[sp(?:, #(0x[0-9a-f]+|\d+))?\]', ops[1]) if len(ops) == 2 else None
        if op.startswith('str') and st:
            off = int(st.group(1), 0) if st.group(1) else 0
            size = 1 if op.startswith('strb') else 2 if op.startswith('strh') else 4
            v = regs.get(ops[0])
            for b in range(size): stack[off + b] = (v >> (8 * b)) & 0xFF if isinstance(v, int) else None
            continue
        if ops and re.fullmatch(r'r\d+|lr', ops[0]):
            regs.pop(ops[0], None)
    return regs, stack

def tidy(cell):
    """The PDF's cells come out with their underscores out of place ("FMCA6_"); put them back."""
    parts = []
    for part in cell.replace('_', '').split('/'):
        m = re.match(r'(OTGFS|OTGHS|FMC|LCD|USART\d|UART\d|SPI\d|I2S\d(?:ext)?|TIM\d+|SAI1|ETH|DCMI|CAN\d|I2C\d)(.*)', part)
        parts.append(f"{m.group(1).replace('OTGFS', 'OTG_FS').replace('OTGHS', 'OTG_HS')}_{m.group(2)}"
                     if m and m.group(2) else part)
    return '/'.join(parts)

names = {}
if len(sys.argv) > 2:
    import fitz
    doc = fitz.open(sys.argv[2])
    for page in doc:
        if 'alternate function mapping' not in page.get_text():
            continue
        for t in page.find_tables().tables:
            for row in t.extract():
                cells = [(c or '').replace('\n', '').replace(' ', '') for c in row]
                pin = next((c for c in cells[:2] if re.fullmatch(r'P[A-K]\d{1,2}', c)), None)
                if pin and len(cells) - cells.index(pin) > 16:
                    names[pin] = cells[cells.index(pin) + 1:cells.index(pin) + 17]

out = []
for i, (a, ins, _) in enumerate(lines):
    m = re.fullmatch(r'bl 0x([0-9a-f]+)', ins)
    if not m or int(m.group(1), 16) not in (GPIO_INIT, GPIO_AF):
        continue
    regs, stack = track(i)
    port = PORT.get(regs.get('r0'), '?')
    if int(m.group(1), 16) == GPIO_AF:
        pin, af = regs.get('r1'), regs.get('r2')
        name = tidy(names.get(f'P{port}{pin}', [''] * 16)[af]) if isinstance(af, int) and isinstance(pin, int) else ''
        out.append((port, pin if isinstance(pin, int) else 99,
                    f"{a:08x}  P{port}{pin if isinstance(pin, int) else '?'}  AF{af if isinstance(af, int) else '?'}  {name}"))
    else:
        r1 = regs.get('r1'); base = r1[1] if isinstance(r1, tuple) else None
        b = [stack.get(base + k) for k in range(8)] if base is not None else [None] * 8
        mask = None if None in b[:4] else int.from_bytes(bytes(b[:4]), 'little')
        pins = [p for p in range(16) if mask >> p & 1] if mask is not None else None
        desc = f"{MODE.get(b[4], '?')}{PULL.get(b[7], '')}" if b[4] is not None else 'not tracked'
        out.append((port, min(pins) if pins else 98, f"{a:08x}  GPIO{port} {pins if pins else '?'}: {desc}"))
for _, _, s in sorted(out, key=lambda x: (x[0], x[1])):
    print(s)
print(len(out), "calls")
