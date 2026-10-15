// Launch options for the browser checks. CHROMIUM_PATH always wins. Otherwise each check keeps its
// own Windows choice (Edge, a named browser, or Playwright's bundled one) and everywhere else uses
// the Chromium preinstalled under /opt/pw-browsers, since Playwright's bundled download is not there.
export const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function chromiumLaunchOptions(windows = {}) {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  return process.platform === 'win32' ? windows : { executablePath: PREINSTALLED_CHROMIUM };
}

// A Vite dev server compiles the editor's modules on the page's first request. On a cold machine
// (CI, a fresh checkout) that took effectsTab past Playwright's 30 s default here, and the checks
// that set a 20 s default have less still. A dev-server check's first load gets this long instead.
// Only the first: once it has loaded, everything it asks for is compiled.
export const DEV_SERVER_FIRST_LOAD_MS = 180_000;
