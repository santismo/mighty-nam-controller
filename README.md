# mighty-nam controller

[Open controller](https://santismo.github.io/mighty-nam-controller/?v=0.8.5) · [License](LICENSE) · [Notices](THIRD-PARTY-LICENSES.txt) · [Privacy](PRIVACY.md)

A free Bluetooth controller for **mighty-nam**, by **santismo**. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**. This public repository contains the web controller only. Firmware and Mac development remain in the public [mighty-nam repository](https://github.com/santismo/mighty-nam).

## Signal chain

- Select any saved color directly. Controls apply live; **Save to plug** stores the capture, name, effects and settings after power-off.
- Tap a block symbol or its **Enabled / Bypassed** badge to toggle processing. Bypass retains the tile and settings. **Remove** and **Change block** are separate actions; drag or use arrows to reorder.
- **FX A / FX B** each offer Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo and Vibrato. Pitch spans −12 to +12 semitones and is intended for single notes.
- **High / Low Cut** provides independent adjustable filters, each with Off.
- **Master volume** controls the plug. On NAMLNK21–25, NAM has input/output gain, bass/middle/treble and mix; **USB recording gain** adjusts the computer recording feed separately.
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

Controller **0.8.5** recognizes the NAMLNK25 looper RAM/timing trial and retains support for earlier builds. **FX A / FX B → Auto Wah** uses the improved Daisy-derived algorithm on NAMLNK24/25. **Drive → Touch Wah** offers Type, Wow, Sense, Direction and Level on both versions. The controller does not install firmware. Capture transfer, both wah choices, NAM controls, USB recording gain, tuner, presets and global buffering have offline protocol coverage. Connection/status reads do not change playback.

NAMLNK25 remains a diagnostic looper trial: recording controls and the new POWER/PRESET gestures are not exposed by this page. Preset switching remains available. Firmware refuses preset saves while a loop exists; stop and clear the loop with the diagnostic tool before saving. Hardware loop recording/playback and worst-case timing still need testing.

| Firmware | Available features |
| --- | --- |
| NAMLNK12 | Legacy editing; incomplete metadata can limit save/tuner operations |
| NAMLNK13+ | Two FX blocks and paged replies |
| NAMLNK14+ | High / Low Cut and compatible capture transfers |
| NAMLNK15+ | Compact automatic tuner |
| NAMLNK18+ | Global persistent buffer |
| NAMLNK20+ | Active chain with Add / Remove / Change block |
| NAMLNK21–25 | NAM tone/mix/gain and independent USB recording gain |
| NAMLNK24–25 | Retained stock Touch Wah; Daisy-derived Auto Wah in FX A/B |
| NAMLNK25 | Existing editing supported; diagnostic looper operated separately |

Only explicitly recognized firmware identities are enabled. Automated protocol/browser tests use simulated Bluetooth; they do not establish physical iPhone transfer speed or all effects' real-time headroom. No firmware images are distributed here.

## Development and rights

Serve this directory over HTTPS, or localhost for development. No build step. Run `npm test` with Node.js 20+. A fork should register its own publishable TONE3000 client ID and exact HTTPS callback address; keep secret keys out of client code. The callback follows the page's current path. Internal storage keys remain stable to preserve existing browser libraries on the same origin.

The canonical page is now **https://santismo.github.io/mighty-nam-controller/**. Update bookmarks; GitHub Pages does not redirect repository project URLs automatically. This is the same origin, so retained local storage remains available in the same browser. Bluetooth permission may need to be granted again.

Original source: **MIT © 2026 santismo**. Mightier Amp notices are retained. NUX hardware/firmware and creator captures have separate rights. See [legal notes](LEGAL.md) and [privacy](PRIVACY.md). No affiliation or endorsement by NUX, Neural Amp Modeler or TONE3000 is claimed.

## Firmware compatibility

NAMLNK23 r2 fixes stereo phone-music playback in firmware. Controller 0.8.3 already supports its unchanged protocol; no page update or preset migration is needed. Get the [local firmware builder and guide](https://santismo.github.io/mighty-nam/builder.html). The two wah choices are available in the NAMLNK24/25 test firmware. Reverse preset-cycling and new POWER/PRESET looper gestures remain under development.

The planned looper uses single POWER to switch between preset and loop controls, PRESET to arm/finish/pause/resume, and double POWER to stop and exit. See the [offline control tests and memory investigation](https://github.com/santismo/mighty-nam/blob/main/docs/looper-research.md); this is not part of controller 0.8.5.
