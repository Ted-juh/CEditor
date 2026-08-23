// updateCheck.js — is there a newer CEditor than this one?
//
// There has never been an update check, so the release notes have had to say "watch the
// repository", which nobody does.
//
// THE COMPARISON LIVES ON ONE SIDE. C++ fetches and forwards GitHub's reply verbatim; this decides
// whether it is newer, because this is the side that knows the running version (it comes from the
// build stamp `__APP_BUILD__`, which vite writes from CMakeLists' `project()` line). Two copies of
// "is this newer" would eventually disagree, and the disagreement would show up as a build that
// nags about itself. `CE/src/UpdateCheck.h` carries the same rules for its own use and has the
// canonical test; this file and that one are checked against each other by `updateCheck.test.js`.
//
// CONSENT. A check sends this machine's IP to GitHub. Unremarkable, and still not something the
// program should do on its own the first time somebody starts it — so the setting defaults to off
// and Help → Check for Updates is the always-available path, because choosing it is the consent.

/** "1.2.3", "v1.2.3", "1.2", "1.2.3-beta.1" → {major, minor, patch} or null. */
export function parseVersion(text) {
  let trimmed = String(text ?? '').trim();
  if (/^v/i.test(trimmed)) trimmed = trimmed.slice(1);
  // Pre-release and build suffixes are DROPPED rather than ordered — see the C++ header for why.
  trimmed = trimmed.split('-')[0].split('+')[0].trim();
  if (!trimmed) return null;

  const parts = trimmed.split('.');
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;

  return {
    major: Number(parts[0]),
    minor: parts.length > 1 ? Number(parts[1]) : 0,
    patch: parts.length > 2 ? Number(parts[2]) : 0,
  };
}

/** -1, 0, 1. An unreadable version on either side is 0 — which errs toward not nagging. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}

export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

/**
 * Read GitHub's `releases/latest` reply.
 *
 * Forgiving about everything except the version. A missing URL or date costs a link and a line of
 * text; a version that cannot be read must NOT become "you are up to date", because that is the
 * failure that hides itself — so it comes back as an error the user can see.
 *
 * Drafts and pre-releases are refused. The endpoint is documented not to return them, but that is
 * GitHub's promise rather than ours.
 */
export function readLatestRelease(release, currentVersion) {
  if (!release || typeof release !== 'object' || Array.isArray(release)) {
    return { ok: false, updateAvailable: false, error: 'The update service replied with something that is not a release.' };
  }

  if (release.draft === true || release.prerelease === true) {
    return { ok: false, updateAvailable: false, error: 'The newest release is a draft or pre-release, so it is not being offered.' };
  }

  const tag = String(release.tag_name ?? '').trim();
  const name = String(release.name ?? '').trim();
  const raw = parseVersion(tag) ? tag : name;

  if (!parseVersion(raw)) {
    return {
      ok: false,
      updateAvailable: false,
      error: `The newest release is not named with a version number${tag ? ` ("${tag}")` : ''}.`,
    };
  }

  const latestVersion = /^v/i.test(raw) ? raw.slice(1) : raw;
  return {
    ok: true,
    updateAvailable: isNewerVersion(latestVersion, currentVersion),
    latestVersion,
    releaseUrl: String(release.html_url ?? ''),
    publishedAt: String(release.published_at ?? ''),
    error: '',
  };
}

/** Off, and nobody asked → no check. The rule in one place, so neither call site forgets it. */
export function updateCheckIsAllowed(settingEnabled, userAsked) {
  return !!userAsked || !!settingEnabled;
}

/** What to show, in one sentence, for every outcome including the ones that are not news. */
export function updateCheckSummary(result, currentVersion) {
  if (!result) return 'No update check has run yet.';
  if (!result.ok) return result.error || 'The update check did not complete.';
  if (result.updateAvailable) return `CEditor ${result.latestVersion} is available. You have ${currentVersion}.`;
  return `You have the newest release (${currentVersion}).`;
}
