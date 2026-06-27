# JUCE Capabilities — What CEditor Could Use

> Status: **survey / backlog.** A broad sweep of JUCE classes & modules that a
> *no-audio* MIDI device editor could benefit from, with what's already used vs
> missing. Part of the [panel parts backlog](./README.md).

## Context

CEditor is a MIDI device editor: ValueTree document model, WebView (Svelte) UI,
Lua/JS/Python scripting, device profiles / DPD / SysEx / MIDI-CI, exported to a
standalone + VST "Player". **No audio processing.**

### Modules linked today (`CMakeLists.txt`)
`juce_core`, `juce_audio_basics`, `juce_audio_devices`, `juce_midi_ci`,
`juce_data_structures`, `juce_events`, `juce_graphics`, `juce_gui_basics`,
`juce_gui_extra` (+ `juce_audio_utils` / `juce_audio_processors` in the VST
target only).

### Skip (no audio)
`juce_dsp`, `juce_audio_formats`, most of `juce_audio_utils`, `juce_video`,
`juce_box2d`, `juce_opengl` (WebView renders the UI).

> **Key insight:** most opportunities below live in modules you *already link* —
> they're unused classes, not new dependencies. Only OSC, cryptography,
> product-unlocking, and analytics need a new module.

Status legend: ✅ already used · ⬜ available (linked, unused) · 🆕 new module.

---

## 1. Protocols & connectivity

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **OSC** in/out | `juce_osc` (`OSCSender`/`OSCReceiver`/`OSCMessage`/`OSCBundle`) | A second transport beside MIDI — many modern synths / Eurorack bridges / surfaces speak OSC. **(point 1)** | 🆕 |
| **MIDI 2.0 / UMP** | `juce::universal_midi_packets` (`juce_audio_basics`) | Per-note controllers, 32-bit resolution, Property Exchange — natural next step from your MIDI-CI work. **(point 2)** | ✅ partial (via `MidiCiSession`) |
| **Bluetooth MIDI pairing** | `BluetoothMidiDevicePairingDialogue` (`juce_audio_devices`) | Pair BLE-MIDI gear directly from the app — common on modern hardware. | ⬜ |
| **HTTP / cloud** | `URL`, `WebInputStream` (`juce_core`) | Online device-profile library, update check, panel cloud sync. **(point 5)** | ✅ `URL` used; `WebInputStream` ⬜ |
| **Sockets / network** | `StreamingSocket`, `DatagramSocket` (`juce_core`) | Network-MIDI bridge, remote control of a Player, LAN sync. | ⬜ |
| **IPC** | `InterprocessConnection` (`juce_events`), `NamedPipe`, `ChildProcess` (`juce_core`) | Editor↔Player IPC, headless CLI exporter. **(point 7)** | ✅ `ChildProcess` used |

## 2. MIDI depth (within modules you already link)

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Standard MIDI Files** | `MidiFile`, `MidiMessageSequence` (`juce_audio_basics`) | Import/export `.mid`; record/replay parameter-change or patch-init sequences; demo playback. | ⬜ |
| **RPN/NRPN helpers** | `MidiRPNDetector`, `MidiRPNGenerator` | Robust (N)RPN handling instead of hand-rolling; you do NRPN manually today. | ⬜ |
| **MPE configuration** | `MPEZoneLayout`, `MPEMessages` (`juce_audio_basics`) | Configure/visualize MPE zones for expressive controllers (message/zone parts need no audio). | ⬜ |
| **Param range mapping** | `NormalisableRange` | Skewed/stepped value↔normalized mapping for device parameters. | ✅ used (`PanelParameters`) |

## 3. Document model, sync & settings

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **ValueTree sync** | `ValueTreeSynchroniser` (`juce_data_structures`) | Mirror the document editor↔Player or over a socket — collaborative / live-preview sync. | ⬜ |
| **Typed tree access** | `CachedValue` | Safer, faster typed reads of ValueTree properties. | ⬜ |
| **App settings** | `PropertiesFile` / `ApplicationProperties` | Recent files, window state, prefs. | ✅ `PropertiesFile` used; `ApplicationProperties` ⬜ |
| **Undo** | `UndoManager` | Already central to the bridge. | ✅ |

## 4. Files, packaging & compression

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Zip packaging** | `ZipFile` + `ZipFile::Builder` (`juce_core`) | Native `.ceditor` panel packages with embedded assets/fonts (today packaging is web-side). **(point 6)** | ⬜ |
| **Compression** | `GZIPCompressorOutputStream` / `GZIPDecompressorInputStream` | Compress bulk dumps / saved state / asset blobs. | ⬜ |
| **Binary↔text** | `Base64` | Encode SysEx dumps / assets for JSON transport. | ✅ used |
| **Big files** | `MemoryMappedFile`, `FileSearchPath`, `TemporaryFile` | Large filmstrips/assets; profile discovery; crash-safe writes. | ⬜ |

## 5. Concurrency & background work

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Background jobs** | `ThreadPool` / `ThreadPoolJob`, `TimeSliceThread` | Offload profile parsing, large dumps, VST export builds (today the build job polls a `Timer`). | ⬜ |
| **Coalesced UI updates** | `AsyncUpdater` | Batch high-rate MIDI→UI/script updates without flooding the message thread. | ⬜ |
| **Primitives** | `WaitableEvent`, `CriticalSection`, `Thread` | Standard sync. | ✅ `CriticalSection` used |

## 6. Security, integrity & licensing (new modules)

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Crypto** | `juce_cryptography` (SHA-256, MD5, RSA, BlowFish) | Sign/verify exported panels (tamper detection, "official profile"), content-hash asset dedup, licensing groundwork. **(point — infra)** | 🆕 |
| **Licensing** | `juce_product_unlocking` | Online activation, key files, trials — *if* CEditor/Players are commercial. **(point 4)** | 🆕 |
| **Analytics** | `juce_analytics` | Opt-in usage telemetry (privacy considerations). | 🆕 |

## 7. Native UI & system integration (despite the WebView)

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **System tray** | `SystemTrayIconComponent` (`juce_gui_extra`) | Background MIDI utility / Player. **(point 8)** | ⬜ |
| **Desktop notifications** | `PushNotifications` (`juce_gui_extra`) | "Export done", "device connected". | ⬜ |
| **Native clipboard** | `SystemClipboard` (`juce_gui_basics`) | Cross-app copy/paste of dumps/values (web clipboard is in-app only). | ⬜ |
| **Command system** | `ApplicationCommandManager`, `KeyPressMappingSet` | Native menus + remappable shortcuts driving the WebView. | ⬜ |
| **Native dialogs** | `FileChooser`, `AlertWindow`, `NativeMessageBox`, `PopupMenu` | OS-native file/save/confirm. | ⬜ (verify) |
| **Animation** | `VBlankAttachment`, `Animator` / `ComponentAnimator` | Frame-synced ticking (ties into the [timer system](./timer-system.md) / LCD scroll). | ⬜ |
| **Displays** | `Desktop`, `Displays` | Multi-monitor / DPI awareness. | ⬜ |
| **Accessibility** | `AccessibilityHandler` | Native a11y (mostly handled inside the WebView though). | ⬜ |

## 8. Web integration (JUCE 8)

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Modern WebView bridge** | `WebBrowserComponent::Options` + native↔JS relays (`WebSliderRelay`, resource provider, `WebControlParameterIndexReceiver`) | Could augment/replace the custom `window.__JUCE__` bridge with JUCE 8's typed bindings + in-binary resource serving. | ✅ `WebBrowserComponent` used; new helpers ⬜ |

## 9. Text, i18n & diagnostics

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Localization** | `LocalisedStrings` | Translate native-side strings (WebView UI does its own i18n). | ⬜ |
| **Diagnostics** | `SystemStats`, `Logger`, `PerformanceCounter` | Crash/diagnostic reports, perf timing. | ⬜ |
| **Images** | `ImageFileFormat` / `PNGImageFormat` / `JPEGImageFormat`, `ImageConvolutionKernel` | Native asset thumbnails; could host the LCD picture→dither converter. | ✅ used |

## 10. Testing

| Capability | JUCE | Benefit | Status |
|---|---|---|---|
| **Unit tests** | `UnitTest` / `UnitTestRunner` (`juce_core`) | A JUCE-native test path alongside the existing test targets. | ⬜ |

---

## Top picks for CEditor

1. **OSC** (`juce_osc`) — the one new *protocol* that meaningfully expands what
   the editor controls. 🆕
2. **MIDI 2.0 / UMP** — deepen beyond MIDI-CI; already partly present, no new
   module.
3. **Bluetooth MIDI pairing** — high user value, already-linked module.
4. **ThreadPool + AsyncUpdater** — responsiveness for parsing/export and
   high-rate MIDI→UI.
5. **ZipFile + cryptography** — native, verifiable panel packaging.
6. **ValueTreeSynchroniser** — clean editor↔Player live sync.

Everything else is opportunistic and cheap (already-linked classes).

## Add findings below
<!-- New JUCE capability ideas go here. -->
