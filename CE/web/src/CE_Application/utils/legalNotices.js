// legalNotices.js — the two things the program has to say about itself, said once.
//
// Both were claimed in RELEASE-NOTES.md ("the app states this in About and on the Export tab")
// before either existed. About was a `window.alert` with a commit hash in it and the Export tab
// said nothing at all. Writing the words in one module and reading them from both places is what
// makes the claim true and keeps it true.
//
// They belong together because they are the same conversation, in the same order, at the same
// moment: you are about to ship a plugin somebody else will install.

/** The AGPL obligation, which follows an exported plugin because JUCE is linked into it. */
export const LICENCE_NOTICE = {
  title: 'AGPL-3.0',
  short: 'CEditor is AGPL-3.0. Exported plugins link JUCE and inherit the obligation.',
  detail:
    'CEditor is licensed under the GNU Affero General Public License v3.0. A plugin you export '
    + 'links the JUCE framework and this program\'s player, so it carries the same licence: if you '
    + 'distribute the plugin, you must make its corresponding source available to whoever receives '
    + 'it. Panels you design are your own work — the obligation is on the built plugin, not on the '
    + '.cepanel document.',
};

/** No Authenticode certificate yet. The user's decision was: unsigned now, certificate before 1.0. */
export const SIGNING_NOTICE = {
  title: 'Unsigned',
  short: 'No code-signing certificate yet, so Windows SmartScreen will warn about what you export.',
  detail:
    'There is no Authenticode certificate for this build, so Windows SmartScreen warns about the '
    + 'CEditor installer and about every plugin exported from it. That is not a sign anything is '
    + 'wrong — it is a sign nothing has been signed. Anyone you send a plugin to will see the same '
    + 'warning and can choose More info → Run anyway. A certificate is planned before 1.0.',
};

/** What About shows, assembled from the build stamp plus the two notices above. */
export function aboutText(buildInfo = {}) {
  return [
    'CEditor',
    '',
    `Version ${buildInfo.version ?? '0.0.0'} — build ${buildInfo.sha ?? 'unknown'} (${buildInfo.branch ?? 'unknown'})`,
    `Built ${buildInfo.time ?? 'unknown'}`,
    '',
    `${LICENCE_NOTICE.title} — ${LICENCE_NOTICE.detail}`,
    '',
    `${SIGNING_NOTICE.title} — ${SIGNING_NOTICE.detail}`,
  ].join('\n');
}
