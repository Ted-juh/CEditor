# meterButtonParts.py — the Meter's and the Button's parts, words and lamps, checked in WebKitGTK,
# the engine the app and the plug-in run on off Windows.
#
# The browser checks (meterShowcase.mjs, buttonShowcase.mjs) run Chromium, which Playwright drives;
# Playwright has no WebKitGTK, and WebKit has drawn SVG its own way before (CLAUDE.md, "WebKitGTK
# draws SVG differently"). So the same scenarios run here, in a WebKit2 4.1 WebView, against the
# editor on the Vite dev server: meterButtonParts.js, run in the page, opens each panel, plays it in
# Preview, and says what WebKit drew. What it checks is listed at the top of that file.
#
# The page asks for what it cannot do itself through the title: CMD:{"shot":"name"} for a picture of
# the window (ImageMagick's import), CMD:{"click":[x,y]} for a real click through xdotool, and DONE
# when it is finished, its checks in window.__report.
#
# Needs python3-gi with WebKit2 4.1, Xvfb, ImageMagick and xdotool:
#
#   (cd CE/web && npx vite --port 5180 --strictPort &)
#   Xvfb :97 -screen 0 1800x1200x24 &
#   DISPLAY=:97 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 \
#     python3.12 CE/web/browser-checks/webkitgtk/meterButtonParts.py http://127.0.0.1:5180/ /tmp/webkit-shots
#
# python3.12 because that is the version Ubuntu's python3-gi is built for. Exit code 0 when every
# check passed; the pictures are left in the directory given, to be looked at.
import json, os, subprocess, sys
import gi
gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')
from gi.repository import GLib, Gtk, WebKit2

URL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
PANELS_DIR = os.path.join(HERE, '../../../panels/Components')
PANELS = {key: open(os.path.join(PANELS_DIR, path), encoding='utf-8').read() for key, path in {
    'segments': 'Meter/Meter Segments.cepanel',
    'words': 'Meter/Meter Words.cepanel',
    'level': 'Meter/Meter Level.cepanel',
    'thrown': 'Button/Button Thrown.cepanel',
}.items()}
SCENARIO = open(os.path.join(HERE, 'meterButtonParts.js'), encoding='utf-8').read()
DISPLAY = os.environ.get('DISPLAY', ':97')

window = Gtk.Window()
window.set_default_size(1700, 1100)
window.move(0, 0)
manager = WebKit2.UserContentManager()
# The app's modules for the scenario, through a loader made before anything runs (behaviourKit.mjs
# says why: a panel's scripts harden the page, after which eval refuses an import expression). It is
# made by a script element of the page's own: an import() written in a user script resolves against
# the user script, not the page, and fails.
LOADER = "const s = document.createElement('script'); s.textContent = 'window.__ceImport = (path) => import(path);'; (document.head || document.documentElement).appendChild(s); s.remove();"
manager.add_script(WebKit2.UserScript.new(
    LOADER + ' window.__PANELS = ' + json.dumps(PANELS) + ';',
    WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START, None, None))
view = WebKit2.WebView.new_with_user_content_manager(manager)
window.add(view)
window.show_all()
result = {'code': 1}


def run(script):
    view.evaluate_javascript(script, -1, None, None, None, None, None)


def on_title(*_):
    title = view.get_title() or ''
    if title.startswith('CMD:'):
        cmd = json.loads(title[4:])
        if 'shot' in cmd:
            subprocess.run(['import', '-window', 'root', '-crop', '1700x1100+0+0', '+repage',
                            os.path.join(OUT, cmd['shot'] + '.png')], env={**os.environ, 'DISPLAY': DISPLAY})
        if 'click' in cmd:
            x, y = cmd['click']
            origin = window.get_position()
            subprocess.run(['xdotool', 'mousemove', str(origin[0] + int(x)), str(origin[1] + int(y)), 'click', '1'],
                           env={**os.environ, 'DISPLAY': DISPLAY})
        if 'move' in cmd:
            x, y = cmd['move']
            origin = window.get_position()
            subprocess.run(['xdotool', 'mousemove', str(origin[0] + int(x)), str(origin[1] + int(y))],
                           env={**os.environ, 'DISPLAY': DISPLAY})
        run('window.__cmdDone && window.__cmdDone(); document.title = "";')
    elif title == 'DONE':
        # A title is cut at about a thousand characters, so the report is read from the page.
        view.evaluate_javascript('JSON.stringify(window.__report)', -1, None, None, None, on_report, None)


def on_report(_view, task, _data):
    report = json.loads(view.evaluate_javascript_finish(task).to_string())
    for check in report['checks']:
        print(('  ok  ' if check['ok'] else 'FAIL  ') + check['name'] + ('' if check['ok'] else '\n      ' + check['detail']), flush=True)
    if report.get('error'):
        print('ERROR ' + report['error'], flush=True)
    result['code'] = 0 if report['checks'] and all(c['ok'] for c in report['checks']) and not report.get('error') else 1
    Gtk.main_quit()


def started():
    run(SCENARIO)
    return False


def on_load(_view, event):
    if event == WebKit2.LoadEvent.FINISHED:
        # The editor's modules compile on first load; the scenario waits for the app itself.
        GLib.timeout_add(3000, started)


view.connect('notify::title', on_title)
view.connect('load-changed', on_load)
GLib.timeout_add(20 * 60 * 1000, Gtk.main_quit)
view.load_uri(URL)
Gtk.main()
sys.exit(result['code'])
