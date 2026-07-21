# Drum samples

One-shot samples for the browser practice drum machine (`src/core/drumMachine.ts`
/ `DrumMachinePanel`). All sources are CC0 1.0 (public domain); no attribution
required, listed here for provenance. Filenames are normalized to the lane ids
in `DRUM_LANES` (kick / snare / hat-closed / hat-open / perc / tom-lo / tom-hi /
crash) so `DRUM_KITS` can address every kit the same way.

- `tr808/` — Roland TR-808 recordings by Michael Fischer (1994), via
  <https://github.com/tidalcycles/sounds-tr808-fischer> (CC0).
  kick=BD0050, snare=SD0050, hat-closed=CH, hat-open=OH25, perc=CP (clap),
  tom-lo=LT25, tom-hi=HT25, crash=CY0025.
- `acoustic/` — acoustic kit one-shots from Sonic Pi's bundled samples
  (<https://github.com/sonic-pi-net/sonic-pi>, `etc/samples`, all CC0, originally
  from freesound.org — see that directory's README for per-sample links).
  kick=drum_heavy_kick, snare=drum_snare_hard, hat-closed=drum_cymbal_closed,
  hat-open=drum_cymbal_open, perc=drum_cowbell, tom-lo=drum_tom_lo_hard,
  tom-hi=drum_tom_hi_hard, crash=drum_splash_hard.
- `lofi/` — "soulful vintage" kit (bit-crushed/down-sampled TR-808 derivatives)
  from <https://github.com/Boochi44/free-drum-samples> (CC0),
  `drum-samples/03-soulful-vintage/`. kick=vintage-kick-01,
  snare=vintage-snare-01, hat-closed=ch-lofi, hat-open=oh00-lofi,
  perc=vintage-clap-01, tom-lo=lt00-lofi, tom-hi=ht00-lofi, crash=cy0000-lofi.

FLAC vs WAV is irrelevant to the app (`decodeAudioData` handles both in
Chrome/Edge, the only supported browsers); files keep their source format.
