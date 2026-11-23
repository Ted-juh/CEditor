# measure.py MODE HOSTAGE_BINARY COMMANDS_JSON [SCREENSHOT.png]
# Starts HoSTage once, feeds it the commands (through the experiment patch beside this file), lets
# it settle, then reports every process it started: CPU as a share of one core, and memory as PSS
# (shared pages divided among their users) and RSS. MODE is "ui" or "headless".
#
# Needs: a HoSTage built from a tree with experiment.patch applied; DISPLAY pointing at an X server
# (Xvfb is enough) and an audio device HoSTage can open (PulseAudio with a null sink is enough).
# FOOTPRINT_SETTLE and FOOTPRINT_SAMPLE set the two waits in seconds (120 and 60 by default).
import collections, os, signal, subprocess, sys, tempfile, time

mode, exe, commands = sys.argv[1], os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
shot = sys.argv[4] if len(sys.argv) > 4 else ""
settle = float(os.environ.get("FOOTPRINT_SETTLE", "120"))
sample = float(os.environ.get("FOOTPRINT_SAMPLE", "60"))

home = tempfile.mkdtemp(prefix=f"hostage-footprint-{mode}-")   # a fresh rig every run
env = dict(os.environ, HOME=home, GTK_THEME="Adwaita:dark",
           HOSTAGE_EXPERIMENT_COMMANDS=commands, HOSTAGE_EXPERIMENT_MULTI_PART="1")
if mode.startswith("headless"):
    env["HOSTAGE_EXPERIMENT_HEADLESS"] = "1"
log = open(os.path.join(home, "hostage.log"), "w")
p = subprocess.Popen([exe], cwd=os.path.dirname(exe), env=env, stdout=log,
                     stderr=subprocess.STDOUT, start_new_session=True)
HZ = os.sysconf("SC_CLK_TCK")

def tree(root):
    kids = collections.defaultdict(list)
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            ppid = int(open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()[1])
            kids[ppid].append(int(pid))
        except OSError:
            pass
    out, todo = [], [root]
    while todo:
        x = todo.pop(); out.append(x); todo += kids[x]
    return out

def info(pid):
    try:
        comm = open(f"/proc/{pid}/comm").read().strip()
        st = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()
        ticks = int(st[11]) + int(st[12])
        pss = rss = 0
        for line in open(f"/proc/{pid}/smaps_rollup"):
            if line.startswith("Pss:"): pss = int(line.split()[1])
            if line.startswith("Rss:"): rss = int(line.split()[1])
        args = open(f"/proc/{pid}/cmdline").read().split("\0")
        if comm == "HoSTage" and len(args) > 2:
            comm = "HoSTage (web view child)"
        return comm, ticks, pss, rss
    except OSError:
        return None

time.sleep(settle)
if shot:
    subprocess.run(["scrot", "-o", shot])
before = {pid: info(pid) for pid in tree(p.pid)}
t0 = time.time(); time.sleep(sample); dt = time.time() - t0
after = {pid: info(pid) for pid in tree(p.pid)}
rows = collections.defaultdict(lambda: [0, 0.0, 0, 0])
for pid, a in after.items():
    b = before.get(pid)
    if a and b:
        r = rows[a[0]]; r[0] += 1; r[1] += (a[1] - b[1]) / HZ / dt * 100; r[2] += a[2]; r[3] += a[3]
print(f"== {mode}: process, count, CPU % of one core ({sample:.0f} s average), PSS MB, RSS MB")
cpu_total = pss_total = 0
for name, (n, cpu, pss, rss) in sorted(rows.items(), key=lambda kv: -kv[1][2]):
    print(f"  {name:28} x{n}  cpu {cpu:6.1f}%  pss {pss/1024:7.1f} MB  rss {rss/1024:7.1f} MB")
    cpu_total += cpu; pss_total += pss
print(f"  {'TOTAL':28}     cpu {cpu_total:6.1f}%  pss {pss_total/1024:7.1f} MB")
print(f"  log and rig: {home}")
os.killpg(p.pid, signal.SIGTERM); time.sleep(3)
try:
    os.killpg(p.pid, signal.SIGKILL)
except ProcessLookupError:
    pass
