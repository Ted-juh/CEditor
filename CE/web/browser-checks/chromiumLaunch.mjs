import { existsSync } from 'node:fs';

// Launch options for the browser checks: every check gets its browser here, and nowhere else. So
// do the two scripts that photograph the editor for docs/media (tools/scripts/gen-manual-media.mjs
// and gen-display-demos.mjs).
//
// CHROMIUM_PATH always wins. Otherwise each check keeps its own Windows choice (Edge, a named
// browser, or Playwright's bundled one), passed in as `windows`. Everywhere else, the Chromium this
// repo's Linux containers have preinstalled under /opt/pw-browsers, since Playwright's own download
// is not there: Playwright looks for the build its version pins (1234 for 1.62), and the container
// has whichever build its image came with.
//
// That build changes. /opt/pw-browsers/chromium is a link to whichever one is installed, so it is
// tried first. The checks used to name build 1194's path directly, in fifty-odd places, and on
// 2026-11-28 the container had 1243: every check failed at launch with "executable doesn't exist"
// until CHROMIUM_PATH was set by hand. That path is still tried second, for a machine that has the
// build and not the link; with neither, Playwright's default, which says what is missing.
export const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
export const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function chromiumLaunchOptions(windows = {}) {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  if (process.platform === 'win32') return windows;
  const executablePath = [PREINSTALLED_CHROMIUM, PINNED_CHROMIUM].find((candidate) => existsSync(candidate));
  return executablePath ? { executablePath } : {};
}

// A Vite dev server compiles the editor's modules on the page's first request. On a cold machine
// (CI, a fresh checkout) that took effectsTab past Playwright's 30 s default here, and the checks
// that set a 20 s default have less still. A dev-server check's first load gets this long instead.
// Only the first: once it has loaded, everything it asks for is compiled.
export const DEV_SERVER_FIRST_LOAD_MS = 180_000;
