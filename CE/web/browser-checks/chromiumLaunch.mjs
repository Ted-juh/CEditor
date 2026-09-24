// Launch options for the browser checks. CHROMIUM_PATH always wins. Otherwise each check keeps its
// own Windows choice (Edge, a named browser, or Playwright's bundled one) and everywhere else uses
// the Chromium preinstalled under /opt/pw-browsers, since Playwright's bundled download is not there.
export const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function chromiumLaunchOptions(windows = {}) {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  return process.platform === 'win32' ? windows : { executablePath: PREINSTALLED_CHROMIUM };
}
