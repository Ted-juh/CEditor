# probe-synth — the instrument the Sound Browser is verified against

A real VST3, built so the auditioner can be pointed at something that is not a stub. Its three
programs differ **along the axes `SonicProfile` claims to measure**, and by enough that an
assertion can be made about which one should measure brighter:

| Program | Cutoff | Attack | Release | Spread |
| --- | --- | --- | --- | --- |
| Dark Pluck | 300 Hz | 4 ms | 40 ms | mono |
| Bright Pluck | 7.5 kHz | 3 ms | 40 ms | mono |
| Wide Slow Pad | 1.2 kHz | 600 ms | 900 ms | wide |

Three things about it are deliberate, and each was learned by getting them wrong first:

- **The filter is three poles, not one.** At 6 dB/oct a seven-fold cutoff change barely moves a
  saw's power-weighted centroid — the fundamental dominates whatever you do — so the first
  version of this could not tell a brightness measurement from a broken one.
- **`setCurrentProgram` notifies the host.** Writing a parameter object directly leaves the
  host's cached value in place and the host wins at the next sync, so programs half-applied.
- **The constructor's defaults ARE program 0.** Selecting the program you are already on sends
  nothing — there is no change for the host to make — so a plug-in whose initial state is not
  its first program will have that program measured as something else. Real plug-ins are built
  this way; this one had to be taught to be.

## Building it

```bash
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_PREFIX_PATH=<repo>/JUCE/lib/cmake/JUCE-8.0.7
cmake --build build
# build/ProbeSynth_artefacts/Release/VST3/Probe Synth.vst3
```

Then run the gate — see [docs/verify-end-to-end.md](../../../docs/verify-end-to-end.md).
