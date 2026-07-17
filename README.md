# GP200 Studio

Browser-based editor for Valeton GP-200 guitar-pedal preset files (`.prst`). Load a preset, edit effect parameters, push changes live to a connected GP-200 over USB-MIDI, save/export the result, all client-side, no backend.

> **Based on [phash/gp200editor](https://github.com/phash/gp200editor)** — the original project whose reverse-engineered `.prst` binary format, SysEx MIDI protocol, and 305-effect mapping this editor is built on.

Live at **[kabirtamari.com/gp200studio](https://kabirtamari.com/gp200studio)**. Web MIDI works in Chrome/Edge only (no Firefox/Safari support).

## Why this repo exists

This is a focused rebuild of the editor surface from [`gp200editor`](https://github.com/phash/gp200editor), a Next.js app that also has a preset gallery, accounts, sharing, and community features. The reverse-engineered protocol work (`.prst` binary format, SysEx MIDI protocol, 305-effect mapping) was already pure, framework-agnostic TypeScript with zero coupling to Next.js, and Web MIDI has never touched a backend either (`navigator.requestMIDIAccess()` + `MIDIOutput.send()` are 100% browser APIs). So the hard, valuable part of that project ported here with zero rewrite risk. Everything else (auth, database, gallery, sharing) was deliberately left behind. This app doesn't have or need a backend.

The old repo is frozen, not actively developed further; this repo is the intended future for the editor itself. Gallery/auth/sharing/community features, if ever revived, would live in `gp200editor`, not here.

## Features

- **Pedalboard editor** — the whole patch as a stage-styled board with per-effect pedal bodies, drag-reorder, FX-loop routing, and knob/fader parameter editing
- **Live device push** — edits stream to a connected GP-200 over USB-MIDI SysEx as you make them
- **Patch manager** — all 256 device slots: list with names/search, activate/open/rename, per-slot `.prst` export/import, bulk export to a single ZIP
- **Controller assignment** — per-patch EXP pedal and CTRL 1–8 footswitch assignments
- **Import/export** — native GP-200 `.prst` files
- **Looper panel** — drives the GP-200's built-in looper transport

## Stack

- Vite + React 19 + TypeScript (strict)
- Tailwind CSS v3
- GSAP (`gsap` + `@gsap/react`) as the animation backbone. See [`src/lib/motion.ts`](src/lib/motion.ts) and [`src/hooks/useGsapTimeline.ts`](src/hooks/useGsapTimeline.ts). Not wired into any component yet.
- Vitest for unit tests
- Cloudflare Workers static assets for deployment (`wrangler.jsonc`)
- No backend, no database, no auth, no i18n framework (English-only)

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build         # production build
npm run typecheck     # tsc -b --noEmit
npm run lint           # oxlint
npm run test            # vitest run
npm run test:watch      # vitest (watch mode)
```

## Architecture

```
src/
├── core/              # Pure TypeScript, zero framework dependency, ported from gp200editor
│   ├── types.ts               # Zod schemas: GP200Preset, EffectSlot
│   ├── BinaryParser.ts        # DataView-based reader
│   ├── BufferGenerator.ts     # DataView-based writer
│   ├── PRSTDecoder.ts         # .prst → GP200Preset (1224 bytes)
│   ├── PRSTEncoder.ts         # GP200Preset → .prst (byte-exact via rawSource round-trip)
│   ├── SysExCodec.ts          # USB-MIDI SysEx protocol (reverse-engineered)
│   ├── controlRecords.ts      # TLV walker for the EXP/CTRL "controls tail", shared by both codecs
│   ├── devicePush.ts          # Live-push orchestration (effect→settle→params→toggle)
│   ├── effectNames.ts         # 305 effect ID→name mappings + MODULE_COLORS
│   ├── effectParams.ts        # Per-effect parameter definitions (generated, see below)
│   ├── effectDescriptions.ts  # Effect → real-world pedal/amp it emulates
│   ├── ampCategories.ts       # Groups AMP-module effects by real-world amp
│   ├── looperBindings.ts, looperTransport.ts  # Built-in looper control
│   ├── zipStore.ts            # Minimal STORE-only ZIP writer for bulk patch export
│   └── defaultPreset.ts, midiControlMap.ts, presetNameCache.ts,
│       extractModules.ts, firmware.ts, normalizePresetName.ts
│
├── hooks/
│   ├── usePreset.ts        # Client-side preset state (load/toggle/param/reorder), MIDI-agnostic
│   ├── useMidiSend.ts      # Low-level send helpers, split out of useMidiDevice
│   ├── useMidiDevice.ts    # Web MIDI connection, handshake, pull/push/save, auto-reconnect
│   ├── useLooper.ts        # Looper transport state
│   ├── useAudioMeter.ts    # Input level metering
│   └── useGsapTimeline.ts  # GSAP animation backbone (infrastructure only, unused so far)
│
├── components/
│   ├── board/           # The pedalboard: the only effects view (PedalBoard, Pedal, knobs/faders,
│   │                    #   SwitcherUnit bottom deck, DeckDrawer sheets, cable layer, looper panel)
│   ├── ui/              # Shared primitives: Button, Card, Dialog, Badge
│   ├── Landing.tsx           # Entry view: connect device or open a blank preset
│   ├── PatchManagerSheet.tsx # Full 256-slot device patch management side sheet
│   ├── DeviceSlotBrowser.tsx # Slot-pick dialogs (load/save-as)
│   ├── ControllerPanel.tsx   # EXP pedal assignment
│   ├── FootswitchPanel.tsx   # Per-patch CTRL 1–8 footswitch assignment
│   └── ...                   # Import/export dialogs, firmware compat, guide, credits
│
└── lib/
    └── motion.ts          # GSAP duration/easing tokens, kept in sync with CSS keyframes
```

`App.tsx` is the sole composition root: no router, no global store; it wires `usePreset()` and `useMidiDevice()` together imperatively.

Test fixtures: real 1224-byte `.prst` preset files under a local (non-committed) `prst/` directory; unit tests that need them live in `tests/unit/`.

## USB-MIDI device communication

Reverse-engineered SysEx protocol, unchanged from the source repo. Web MIDI only works in Chrome/Edge (no Firefox/Safari). Never call `loadPresetNames()` without its abort mechanism; it can trigger a firmware-update popup on the device.

`scripts/generate-effect-params.mjs` regenerates `src/core/effectParams.ts` from Valeton's own `algorithm.xml`. That file isn't part of this repo (or the source repo); it's read from a local install of Valeton's editor software. You only need this script if effect parameter definitions ever need to be regenerated from a newer firmware/algorithm release.

## Credits

- [phash/gp200editor](https://github.com/phash/gp200editor) — original project and the reverse-engineering groundwork this editor is based on
- Built by [Kabir Tamari](https://kabirtamari.com)
