# fontWorker.py — the font worker, checked in WebKitGTK, the engine the app runs on off Windows.
#
# browser-checks/fontWorker.mjs checks the worker in Chromium (Playwright has no WebKitGTK). The
# open question it could not answer: the Linux app is served from JUCE's `juce://` scheme, and a
# WebView may refuse module workers from a custom scheme. This answers it in two steps.
#
#   1. The scheme. CE/web/dist served the way JUCE's Linux webview serves it
#      (juce_WebBrowserComponent_linux.cpp: a `juce` URI scheme, the app's Content-Type, no CORS
#      header in a production build). Every font worker the build emits is started as a module
#      worker from it, and must answer a Comlink request. The fallback chunk (fontWorker-*.js that
#      the page imports when no worker is available) is expected to fail as a worker: it is page code.
#   2. The work. Against the Vite dev server, the same comparison as fontWorker.mjs: the glyph
#      atlas and a font subset built on the page and through the worker must be identical, and the
#      worker must keep the page responsive. Long Tasks is Chromium-only, so the stall is the longest
#      gap between 10 ms timer ticks.
#
# Needs python3-gi with WebKit2 4.1 (gir1.2-webkit2-4.1) and a display (Xvfb works):
#
#   (cd CE/web && npm run build && npx vite --port 5179 --strictPort &)
#   Xvfb :97 & DISPLAY=:97 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
#     python3.12 CE/web/browser-checks/webkitgtk/fontWorker.py CE/web/dist http://localhost:5179/player.html
#
# python3.12 because that is the version Ubuntu's python3-gi is built for; use whichever python
# your distribution's gi belongs to. Exit code 0 when every check passed.
import base64, glob, json, os, sys
import gi
gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1'); gi.require_version('Soup', '3.0')
from gi.repository import Gio, GLib, Gtk, Soup, WebKit2

DIST, DEV_URL = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
MONO = 'data:font/woff2;base64,' + base64.b64encode(
    open(os.path.join(HERE, '../../src/assets/fonts/liberation-mono-regular.woff2'), 'rb').read()).decode()
MIME = {'.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
        '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.wasm': 'application/wasm'}

PROBE = """<!doctype html><meta charset=utf-8><script>
const results = {};
async function probe(url) {
  return new Promise((resolve) => {
    let w;
    try { w = new Worker(url, { type: 'module' }); } catch (e) { return resolve('constructor threw: ' + e); }
    const t = setTimeout(() => resolve('no reply in 10 s'), 10000);
    w.addEventListener('error', (e) => { clearTimeout(t); resolve('error event: ' + (e.message || 'no message')); });
    w.addEventListener('message', (e) => { clearTimeout(t); resolve('replied: ' + JSON.stringify(e.data).slice(0, 120)); });
    // A Comlink GET of a property: any running Comlink endpoint answers it.
    w.postMessage({ id: 'probe', type: 'GET', path: ['fontWorkerApi'] });
  });
}
window.runProbe = async (urls) => {
  for (const u of urls) results[u] = await probe(u);
  document.title = 'DONE ' + JSON.stringify({ origin: location.origin, results });
};
</script>"""


SCRIPT = r"""
(async (mono) => {
  try {
    for (let i = 0; i < 300 && typeof window.__CE_LOAD_PANEL__ !== 'function'; i++) await new Promise(r => setTimeout(r, 100));
    const fonts = await import('/src/CE_Application/utils/fontSources.js');
    const client = await import('/src/CE_Application/utils/fontWorkerClient.js');
    const spec = { family: 'Rubik', weight: 650, style: 'normal' };
    async function stall(work) {
      let worst = 0, last = performance.now();
      const id = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; }, 10);
      await new Promise(r => setTimeout(r, 50));
      const value = await work();
      await new Promise(r => setTimeout(r, 100));
      clearInterval(id);
      return { value, worst: Math.round(worst) };
    }
    fonts.clearFontCache();
    const resolved = await fonts.resolveFont('Rubik', { weight: 650 });
    const onPage = await stall(async () => fonts.glyphAtlas(resolved, spec));
    fonts.clearFontCache();
    const again = await fonts.resolveFont('Rubik', { weight: 650 });
    const inWorker = await stall(() => fonts.glyphAtlasAsync(again, spec));
    const { panelCharacters, subsetFontDataUrl } = await import('/src/CE_Application/utils/fontSubset.js');
    const chars = panelCharacters({ controls: [{ _type: 'Label', _children: { Text: { content: 'Hello' } } }] });
    const subsetPage = await subsetFontDataUrl(mono, chars);
    const subsetWorker = await client.subsetFontInWorker(mono, chars);
    document.title = 'DONE ' + JSON.stringify({
      userAgent: navigator.userAgent.replace(/.*AppleWebKit/, 'AppleWebKit'),
      status: client.fontWorkerStatus(),
      same: JSON.stringify(onPage.value) === JSON.stringify(inWorker.value),
      kern: Object.keys(inWorker.value.kern).length,
      pageStallMs: onPage.worst, workerStallMs: inWorker.worst,
      subsetSame: subsetPage === subsetWorker, subsetShrank: subsetWorker.length < mono.length,
    });
  } catch (e) { document.title = 'DONE ' + JSON.stringify({ error: String(e && e.stack || e) }); }
})(%s);
""" % json.dumps(MONO)


def run(url, on_finished, register_scheme=False):
    """Load `url` in a fresh WebView; `on_finished` runs JS once loaded; the page reports via its title."""
    result = {}
    view = WebKit2.WebView()
    if register_scheme:
        view.get_context().register_uri_scheme('juce', serve)
    win = Gtk.Window(); win.set_default_size(1200, 800); win.add(view); win.show_all()

    def on_title(*_):
        title = view.get_title() or ''
        if title.startswith('DONE '):
            result.update(json.loads(title[5:])); Gtk.main_quit()
    view.connect('notify::title', on_title)

    started = [False]
    def on_load(v, event):
        if event == WebKit2.LoadEvent.FINISHED and not started[0]:
            started[0] = True
            v.evaluate_javascript(on_finished, -1, None, None, None, None, None)
    view.connect('load-changed', on_load)
    timeout = GLib.timeout_add_seconds(240, lambda: (result.update(timedOut=True), Gtk.main_quit()))
    view.load_uri(url)
    Gtk.main()
    if not result.get('timedOut'):
        GLib.source_remove(timeout)
    win.hide()
    return result


def serve(request):
    path = request.get_path()
    if path in ('/probe.html', 'probe.html'):
        data, mime = PROBE.encode(), 'text/html; charset=utf-8'
    else:
        file = os.path.join(DIST, path.lstrip('/'))
        if not os.path.isfile(file):
            request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(), 'not found ' + path, 1))
            return
        data = open(file, 'rb').read()
        mime = MIME.get(os.path.splitext(file)[1], 'application/octet-stream')
    response = WebKit2.URISchemeResponse.new(Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data)), len(data))
    headers = Soup.MessageHeaders.new(Soup.MessageHeadersType.RESPONSE)
    headers.append('Content-Type', mime)
    response.set_http_headers(headers)
    response.set_status(200, None)
    request.finish_with_response(response)


failures = []
def check(name, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + name + (f'  ({detail})' if detail else ''))
    if not ok: failures.append(name)

# 1. The scheme. The worker entry is the file the client constructs with `new Worker`.
client = glob.glob(os.path.join(DIST, 'assets', 'fontWorkerClient-*.js'))
workers = sorted({os.path.basename(p) for p in glob.glob(os.path.join(DIST, 'assets', 'fontWorker-*.js'))})
entry = next((w for w in workers if client and f'new URL("{w}"' in open(client[0]).read()), None)
check('the build has a font worker entry', entry is not None, ', '.join(workers))
if entry:
    scheme = run('juce://juce.backend/probe.html', 'runProbe(%s)' % json.dumps(['/assets/' + entry]), register_scheme=True)
    answer = scheme.get('results', {}).get('/assets/' + entry, 'no result')
    check('a module worker starts from the juce:// scheme and answers Comlink', answer.startswith('replied'),
          f"origin {scheme.get('origin')}: {answer}")

# 2. The work, against the dev server.
work = run(DEV_URL, SCRIPT)
print('  ' + json.dumps(work))
check('the worker started and did the work', work.get('status') == 'worker')
check("the worker's atlas is identical to the page's", work.get('same') is True and work.get('kern', 0) > 0)
check('a carried face subsets the same in the worker as on the page', work.get('subsetSame') is True and work.get('subsetShrank') is True)
check('the page keeps drawing while the worker builds',
      work.get('pageStallMs', 0) > 100 and work.get('workerStallMs', 1e9) < work.get('pageStallMs', 0) / 3,
      f"page {work.get('pageStallMs')} ms, worker {work.get('workerStallMs')} ms")
# os._exit, not sys.exit: WebKitGTK crashes in its own teardown when the interpreter unwinds with
# views still alive, and that crash would replace the verdict with a segfault's exit code.
sys.stdout.flush()
os._exit(1 if failures else 0)
