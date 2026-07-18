<div align="center">

<img src="public/icon-512.png" alt="GP200 Studio logo" width="120" />

# GP200 Studio

**A browser-based editor, patch manager & loop station for the Valeton GP-200.**
No install. No account. No backend. Just plug in and play.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.app.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](package.json)
[![Vite](https://img.shields.io/badge/Vite-⚡-646CFF?logo=vite&logoColor=white)](vite.config.ts)
[![Web MIDI](https://img.shields.io/badge/Web%20MIDI-SysEx-5df08a)](src/core/SysExCodec.ts)
[![Backend](https://img.shields.io/badge/backend-none-success)](#how-it-works)
[![Browser](https://img.shields.io/badge/browser-Chrome%20%7C%20Edge-orange?logo=googlechrome&logoColor=white)](#browser-support)

**[▶ Open the live app](https://kabirtamari.com/gp200studio/)**

<img src="public/guide/02-editor-board.png" alt="The GP200 Studio pedalboard editor" width="100%" />

</div>

---

## Why?

The Valeton GP-200 is a great multi-effects pedal with a not-so-great support for linux as the official editor runs on **Windows and macOS only**, and organizing 256 patches through a 4" screen and two footswitches is nobody's idea of fun.

GP200 Studio fixes that:

- 🐧 **Runs anywhere Chrome runs** — including Linux. Web MIDI + Web Audio, straight from the browser to the pedal over USB. Nothing to install.
- 🗂️ **Real patch management** — browse, search, rename, import, export and back up all 256 device slots. Bulk-export your entire pedal to a single ZIP.
- 🎛️ **A UI that looks like the gear it edits** — your patch is a pedalboard, not a parameter spreadsheet. Every effect is a colorful pedal with knobs you can actually see and turn. See your signal chain at a glance instead of decoding menus.
- 🔁 **A loop station the pedal doesn't ship with** — records the GP-200's USB audio right in the browser, with MIDI footswitch learn so you can drive it hands-free from the pedal itself.

## Features

- 🎸 **Pedalboard editor** — the whole patch as a stage-styled board: per-effect pedal bodies, drag-to-reorder, FX-loop routing, knob/fader parameter editing, and real-world "based on" info for all 305 effects
- ⚡ **Live device push** — edits stream to a connected GP-200 over USB-MIDI SysEx as you make them; hardware-side changes sync back into the editor
- 🗄️ **Patch manager** — full 256-slot list with names & search, activate/open/rename, per-slot `.prst` export/import, one-click bulk ZIP backup
- 🦶 **Controller assignment** — per-patch EXP pedal and CTRL 1–8 footswitch mappings
- 🔁 **Loop station** — in-browser recording of the GP-200's USB audio with overdub, plus MIDI-learn to bind transport controls to the pedal's footswitches

<div align="center">
<img src="public/guide/03-effect-picker.png" alt="Effect picker" width="49%" /> <img src="public/guide/08-deck-loop.png" alt="Loop station" width="49%" />
</div>

<details>
<summary><b>📸 More screenshots</b></summary>
<br/>
<table>
  <tr>
    <td><img src="public/guide/01-landing.png" alt="Landing screen" /></td>
    <td><img src="public/guide/05-deck-fxloop.png" alt="FX loop routing" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Landing</sub></td>
    <td align="center"><sub>FX-loop routing</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/06-deck-exp.png" alt="EXP pedal assignment" /></td>
    <td><img src="public/guide/07-deck-ctrl.png" alt="CTRL footswitch assignment" /></td>
  </tr>
  <tr>
    <td align="center"><sub>EXP pedal assignment</sub></td>
    <td align="center"><sub>CTRL footswitch assignment</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/04-info-bar-chain.png" alt="Signal chain info bar" /></td>
    <td><img src="public/guide/09-export-dialog.png" alt="Export dialog" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Signal chain & effect info</sub></td>
    <td align="center"><sub>Export</sub></td>
  </tr>
</table>
</details>

## Getting started

### Just use it

1. Open **[GP200studio](https://kabirtamari.com/gp200studio/)** in Chrome or Edge
2. Plug your GP-200 into USB and hit **CONNECT GP-200** — or hit **Open editor** to work on `.prst` files offline
3. That's it. Everything runs client-side; your presets never leave your machine.

## How it works

Everything is client-side TypeScript. A pure protocol layer in [`src/core/`](src/core/) decodes/encodes the GP-200's binary `.prst` preset format (byte-exact round-trips via raw-source passthrough) and speaks the pedal's **reverse-engineered USB-MIDI SysEx protocol** — parameter changes, effect swaps, toggles, reorders, preset pulls and saves — over the browser's Web MIDI API. React hooks layer connection/session handling on top, and the pedalboard UI sits on that. No server is involved at any point.


## Credits

- Built on the reverse-engineering groundwork of **[phash/gp200editor](https://github.com/phash/gp200editor)** — the `.prst` binary format, SysEx MIDI protocol, and 305-effect mapping
- Built by [Kabir Tamari](https://kabirtamari.com)
