# mighty-nam controller

[Open controller](https://santismo.github.io/mighty-nam-controller/?v=0.8.6) · [License](LICENSE) · [Notices](THIRD-PARTY-LICENSES.txt) · [Privacy](PRIVACY.md)

A free Bluetooth controller for **mighty-nam**, by **santismo**. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**. This public repository contains the web controller only. Firmware and Mac development remain in the public [mighty-nam repository](https://github.com/santismo/mighty-nam).

## Signal chain

- Select any saved color directly. Controls apply live; **Save to plug** stores the capture, name, effects and settings after power-off.
- Tap a block symbol or its **Enabled / Bypassed** badge to toggle processing. Bypass retains the tile and settings. **Remove** and **Change block** are separate actions; drag or use arrows to reorder.
- **FX A / FX B** each offer Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo and Vibrato. Pitch spans −12 to +12 semitones and is intended for single notes.
- **High / Low Cut** provides independent adjustable filters, each with Off.
- **Master volume** controls the plug. On NAMLNK21–26, NAM has input/output gain, bass/middle/treble and mix; **USB recording gain** adjusts the computer recording feed separately.
- Choose an **8 / 16 / 32-sample** output buffer. NAMLNK18+ saves it globally. This is not a measurement of total guitar latency; time-based effects can add their own delay.
- Open **Tuner**, pluck one string, and let it ring. The plug measures the input; the page polls over Bluetooth. No microphone or browser audio playback is used.

Use one controller at a time. Refresh after using the physical PRESET button. Rapid edits are combined and confirmed by readback. Save is explicit and never automatically retried. Capture loading and tuning temporarily stop plug output and resume after successful checks; failed transfers and processing faults do not enable playback.

## TONE3000

**Powered by [TONE3000](https://www.tone3000.com).**

1. Open **Captures → Browse TONE3000**. Sign in, browse the official catalog, and select a tone.
2. Choose **Load capture** for a supported **48 kHz A2 Lite** model. A Lite component inside an A2 file is supported; full A2 and other architectures are rejected.
3. Reconnect Bluetooth when returning to the page. The selected capture becomes active only after transfer and checksum/readback confirmation. The Captures window stays open for continued browsing.
4. Star captures to keep multiple phone favorites. **Save to plug** separately stores one in a chosen color. Amp-and-cab captures bypass the stock cabinet.

The integration uses OAuth picker flows and bounded favorites/downloaded/created/trending/latest feeds. Full search stays on TONE3000. Downloads are user-requested, with creator and license metadata retained. No catalog mirroring, private API key, proxy account or bundled captures. Clearing browser data removes local favorites/downloads, not onboard presets. Up to 64 selected captures are cached locally. Tokens remain in memory; reloading requires signing in through the picker again.

## Compatibility and status

Controller **0.8.6** recognizes NAMLNK25 and NAMLNK26 and retains earlier guitar controls. **FX A / FX B → Auto Wah** uses the Daisy-derived algorithm on 24–26; **Drive → Touch Wah** retains the stock effect. Connection/status reads do not change playback. The controller does not install firmware.

## Looper

On **NAMLNK26**, open **Looper** for Arm, Finish/Pause/Play, Overdub/Finish layer, Stop, Clear, trigger threshold and loop level. **Looper controls / Preset controls** changes the hardware button mode. Selecting another preset leaves the loop/layer running. Opening or closing the panel does not stop playback. NAMLNK25 has basic transport only; settings, layers and button gestures need NAMLNK26.

Choose **30 s · 24 kHz** (default) or **60 s · 12 kHz** before recording. Long mode reduces loop bandwidth; live guitar remains 48 kHz. Overdubs merge into one mono loop without undo. Settings and audio are lost on power-off. Clear the loop before saving presets to flash.

The NAMLNK25 owner confirmed loop recording/playback through preset changes. NAMLNK26 layers, long mode and new physical gestures have offline coverage and still need their hardware trial. These development versions are not included in the public NAMLNK23 builder. [Implementation and button guide](https://github.com/santismo/mighty-nam/tree/main/tools/looper-prototype/layers).

| Firmware | Available features |
| --- | --- |
| NAMLNK12 | Legacy editing; incomplete metadata can limit save/tuner operations |
| NAMLNK13+ | Two FX blocks and paged replies |
| NAMLNK14+ | High / Low Cut and compatible capture transfers |
| NAMLNK15+ | Compact automatic tuner |
| NAMLNK18+ | Global persistent buffer |
| NAMLNK20+ | Active chain with Add / Remove / Change block |
| NAMLNK21–26 | NAM tone/mix/gain and independent USB recording gain |
| NAMLNK24–26 | Retained stock Touch Wah; Daisy-derived Auto Wah in FX A/B |
| NAMLNK25 | Basic looper transport |
| NAMLNK26 | Threshold/level, 30/60 s choice, merged overdubs and hardware control mode |

Only explicitly recognized firmware identities are enabled. Automated protocol/browser tests use simulated Bluetooth; they do not establish physical iPhone transfer speed or all effects' real-time headroom. No firmware images are distributed here.

## Development and rights

Serve this directory over HTTPS, or localhost for development. No build step. Run `npm test` with Node.js 20+. A fork should register its own publishable TONE3000 client ID and exact HTTPS callback address; keep secret keys out of client code. The callback follows the page's current path. Internal storage keys remain stable to preserve existing browser libraries on the same origin.

The canonical page is now **https://santismo.github.io/mighty-nam-controller/**. Update bookmarks; GitHub Pages does not redirect repository project URLs automatically. This is the same origin, so retained local storage remains available in the same browser. Bluetooth permission may need to be granted again.

Original source: **MIT © 2026 santismo**. Mightier Amp notices are retained. NUX hardware/firmware and creator captures have separate rights. See [legal notes](LEGAL.md) and [privacy](PRIVACY.md). No affiliation or endorsement by NUX, Neural Amp Modeler or TONE3000 is claimed.

## Firmware compatibility

NAMLNK23 r2 fixes stereo phone-music playback in firmware. Controller 0.8.3 already supports its unchanged protocol; no page update or preset migration is needed. Get the [local firmware builder and guide](https://santismo.github.io/mighty-nam/builder.html). The two wah choices are available in the NAMLNK24/25/26 test firmware. Reverse preset-cycling and new POWER/PRESET looper gestures remain under development.

The planned looper uses single POWER to switch between preset and loop controls, PRESET to arm/finish/pause/resume, and double POWER to stop and exit. See the [offline control tests and memory investigation](https://github.com/santismo/mighty-nam/blob/main/docs/looper-research.md); this is not part of controller 0.8.6.
