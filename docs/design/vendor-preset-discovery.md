# Vendor preset discovery and recall

Sounds keeps its persistent index in `instrument-host/library.json`. Scanning merges discovered
sources into that index; it preserves record identities and personal metadata, and marks missing
sources rather than deleting them. It does not modify vendor files or vendor databases.

The supported file adapters are:

| Instrument/source | Discovery and loading |
| --- | --- |
| VST3 presets | Standard user/shared preset folders and added folders; nested instrument folders are recognised. VST3 validates the class UID on recall. |
| Massive X | `.nksf` RIFF metadata and PCHK component state. PLID may contain the VST2 magic, the VST3 UID, or both; older expansions omit display names. Default shared libraries, the registered factory ContentDir, NI user folders and added folders are searched. |
| Vanguard 2 | `.fxp` files with VGRD identity and a VGRD2 Preset chunk. Factory and user reFX folders and added folders are searched. |
| Spire | `.spf2` JSON parameter maps in Factory Presets beside the catalogued module, RevealSound/Banks, the configured workspace directory and added folders. File enumeration also finds sounds missing from Spire's database. Parameter keys are matched and validated before any values are applied. |
| Zebra3 | Complete `.h2p` patches in the registered u-he DataPath's Presets and UserPresets folders, standard locations, beside the VST3 module and added folders. Names come from filenames. Module-only H2P files are excluded. The native H2P text restores both VST3 component and controller state, including the `#pgm` name. |

The NKS and FXP adapters are instrument-specific. They do not claim support for arbitrary NKS
instruments, VST2 parameter FXPs, legacy Spire banks, or proprietary archive formats. Additional
locations can be supplied with Sounds' Add folder button. Files remain at their original locations.

Discovery runs off the controlling thread and publishes a complete merge on that thread. The
existing library remains available during a scan. Overlapping roots are deduplicated. Vendor
files use full SHA-256 fingerprints so edits beyond their headers invalidate cached analysis.
Discovery covers every healthy imported VST3 class in the catalogue, both instruments and
effects. It does not depend on rack membership. After indexing files, the scan creates one
temporary isolated instance at a time to refresh each class's factory program list; instances
never enter the rack and are released before the next one. Quarantine and safe-mode refusals
are respected. The Sounds scan report shows per-plug-in counts and failures or absent supported
sources. Program metadata is no longer silently truncated at 4,096 entries. Opening Sounds
reads the persistent library; scanning is only needed to discover additions and changes.

Standard VST3 files resolve by the class UID's JUCE identifier before falling back to folder
names. Effect presets have an FX badge: Load reuses a matching insert on the focused part or
adds one, and + adds a new insert. The focused instrument remains available as the audio source.

Live recall and the isolated auditioner share the file adapters. Massive X needs its deferred
engine state to settle before Hostage publishes parameter values or captures session state.
Vanguard's bank state is supplemented with stable parameter IDs and values because restoring
its native bank alone can lose the current imported patch's exposed values. Existing native
states without that supplemental XML remain readable.

Zebra3's generic numbered MIDI program slots are not its named factory library. Updating the
library removes the old program-slot records and indexes the H2P files; subsequent program-list
refreshes cannot recreate those generic records. Captured user sounds and other plug-ins' named
programs are unaffected. H2P recall uses JUCE's state restore path, which resets its parameter
cache. Loading the same text through JUCE's preset-file path alone leaves stale cached values
that the proxy can write back over the new sound during processing or a session save.

Validation includes synthetic malformed/truncated containers, legacy and VST3-only NKS
identities, nested/overlapping directories, rescan metadata preservation, asynchronous scan
dispatch, each vendor source's new-instance and in-place load routes, missing files and worker
program refreshes above 4,096 entries. The opt-in `CEditorPluginWorkerRealVstSmoke` accepts an
optional preset after the class selector and checks actual recall plus parameter restoration
in a fresh worker. Vendor binaries and factory preset content are not repository fixtures.
