# UI sounds

One-shots for the chassis chrome, played by `src/lib/uiSound.ts` through its own
small playback AudioContext (see that file for why it is not the shared engine
context). Loaded the same way as the drum kits — `fetch` +
`decodeAudioData` — so format is not important; these are mono 48 kHz 16-bit WAV,
~16 KB each.

- `switch-on.wav` / `switch-off.wav` — the stage-lights rocker (`PowerSwitch`).
  Captured from the third on/off pair in the YouTube short
  <https://www.youtube.com/shorts/1MZGDqYeOAo> (source timestamps 4.465 s and
  5.515 s), then trimmed, high-passed at 90 Hz, lightly denoised, fade-shaped and
  peak-normalised to -3 dBFS. Playback gain is applied in code (`CLICK_GAIN`),
  not baked into the files.

  **Licensing:** these are lifted from a third-party video and are *not* cleared
  for redistribution. They are placeholders. Swapping them is a pure file
  replacement — drop CC0 replacements at these exact paths, no code change — and
  that should happen before any public release. Update this entry when you do.

The ON sample is the paddle sinking into the housing (duller, ~800 Hz centroid);
OFF is the snap back out (brighter, ~3.3 kHz), which is why the two positions
sound different rather than being one sample played twice.
