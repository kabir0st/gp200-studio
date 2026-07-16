# Preset Forge Editor

Browser-based editor for Valeton GP-200 guitar-pedal preset files (`.prst`). Load a preset, edit effect parameters, push changes live to a connected GP-200 over USB-MIDI, save/export the result — all client-side, no backend.

## Why this repo exists

This is a focused rebuild of the editor surface from [`gp200editor`](https://github.com/phash/gp200editor), a Next.js app that also has a preset gallery, accounts, sharing, and community features. The reverse-engineered protocol work (`.prst` binary format, SysEx MIDI protocol, 305-effect mapping) was already pure, framework-agnostic TypeScript with zero coupling to Next.js — and Web MIDI has never touched a backend either (`navigator.requestMIDIAccess()` + `MIDIOutput.send()` are 100% browser APIs). So the hard, valuable part of that project ported here with zero rewrite risk. Everything else (auth, database, gallery, sharing) was deliberately left behind — this app doesn't have or need a backend.

The old repo is frozen, not actively developed further; this repo is the intended future for the editor itself. Gallery/auth/sharing/community features, if ever revived, would live in `gp200editor`, not here.

## Stack

- Vite + React 19 + TypeScript (strict)
- Tailwind CSS v3 — see [`docs/design-system.md`](docs/design-system.md) for the color/type/component conventions
- GSAP (`gsap` + `@gsap/react`) as the animation backbone — see [`src/lib/motion.ts`](src/lib/motion.ts) and [`src/hooks/useGsapTimeline.ts`](src/hooks/useGsapTimeline.ts). Not wired into any component yet.
- Vitest for unit tests
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
├── core/              # Pure TypeScript, zero framework dependency — ported verbatim
│   ├── types.ts               # Zod schemas: GP200Preset, EffectSlot
│   ├── BinaryParser.ts        # DataView-based reader
│   ├── BufferGenerator.ts     # DataView-based writer
│   ├── PRSTDecoder.ts         # .prst → GP200Preset (1224 bytes)
│   ├── PRSTEncoder.ts         # GP200Preset → .prst
│   ├── SysExCodec.ts          # USB-MIDI SysEx protocol (reverse-engineered)
│   ├── effectNames.ts         # 305 effect ID→name mappings + MODULE_COLORS
│   ├── effectParams.ts        # Per-effect parameter definitions (generated, see below)
│   ├── effectDescriptions.ts  # Effect → real-world pedal/amp it emulates
│   ├── ampCategories.ts       # Groups AMP-module effects by real-world amp
│   ├── HLXConverter.ts        # Line6 HX Stomp .hlx → GP200Preset import
│   ├── devicePush.ts          # Live-push orchestration (effect→settle→params→toggle)
│   └── extractModules.ts, firmware.ts, normalizePresetName.ts
│
├── hooks/
│   ├── useMidiDevice.ts    # Web MIDI connection, handshake, pull/push/live-edit sends
│   ├── useMidiSend.ts      # Low-level send helpers, split out of useMidiDevice
│   ├── usePreset.ts        # Client-side preset state (load/toggle/param/reorder)
│   └── useGsapTimeline.ts  # GSAP animation backbone (infrastructure only, unused so far)
│
├── components/
│   ├── ui/              # Shared primitives: Button, Card, Dialog, Badge — see docs/design-system.md
│   └── ...               # Editor components (EffectSlot, ControllerPanel, AmpHeadPanel, ...)
│
└── lib/
    └── motion.ts          # GSAP duration/easing tokens, kept in sync with CSS keyframes
```

Test fixtures: `prst/*.prst` (real 1224-byte preset files used by the ported unit tests).

## USB-MIDI device communication

Reverse-engineered SysEx protocol, unchanged from the source repo. Web MIDI only works in Chrome/Edge (no Firefox/Safari). Never call `loadPresetNames()` without its abort mechanism — it can trigger a firmware-update popup on the device.

`scripts/generate-effect-params.mjs` regenerates `src/core/effectParams.ts` from Valeton's own `algorithm.xml` — that file isn't part of this repo (or the source repo); it's read from a local install of Valeton's editor software. You only need this script if effect parameter definitions ever need to be regenerated from a newer firmware/algorithm release.

## Reference docs

| Topic | File |
|---|---|
| Design system (color, type, components, motion, a11y) | [`docs/design-system.md`](docs/design-system.md) |
| Pedal/effect icon scoping (no artwork yet) | [`docs/pedal-icons.md`](docs/pedal-icons.md) |
