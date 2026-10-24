# mighty-nam controller

[Open controller](https://santismo.github.io/mighty-nam-controller/?v=0.9.1) · [License](LICENSE) · [Notices](THIRD-PARTY-LICENSES.txt) · [Privacy](PRIVACY.md)

A free Bluetooth controller for **mighty-nam**, by **santismo**. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**. This public repository contains the web controller only. Firmware and Mac development remain in the public [mighty-nam repository](https://github.com/santismo/mighty-nam).

## Signal chain

- Select any saved color directly. Controls apply live; **Save to plug** stores the capture, name, effects and settings after power-off.
- Tap a block symbol or its **Enabled / Bypassed** badge to toggle processing. Bypass retains the tile and settings. **Remove** and **Change block** are separate actions; drag or use arrows to reorder.
- **FX A / FX B** each offer Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo and Vibrato. Pitch spans −12 to +12 semitones and is intended for single notes.
- **High / Low Cut** provides independent adjustable filters, each with Off.
- **Master volume** controls the plug. On NAMLNK21–28, NAM has input/output gain, bass/middle/treble and mix; **USB recording gain** adjusts the computer recording feed separately.
- Choose an **8 / 16 / 32-sample** output buffer. NAMLNK18+ saves it globally. This is not a measurement of total guitar latency; time-based effects can add their own delay.
- Open **Tuner**, pluck one string, and let it ring. The plug measures the input; the page polls over Bluetooth. No microphone or browser audio playback is used.

Use one controller at a time. Refresh after using the physical PRESET button. Rapid edits are combined and confirmed by readback. Save is explicit and never automatically retried. Choose Save to plug to copy the current onboard capture into any empty color; a local capture download is not required. Use one to seven occupied colors. Capture loading and tuning temporarily stop plug output and resume after successful checks; failed transfers and processing faults do not enable playback.

## TONE3000

**Powered by [TONE3000](https://www.tone3000.com).**

1. Open **Captures → Browse TONE3000**. Sign in, browse the official catalog, and select a tone.
2. Choose **Load capture** for a supported **48 kHz A2 Lite** model. A Lite component inside an A2 file is supported; full A2 and other architectures are rejected.
3. The official picker opens **inside Captures**, keeping the controller page and its Bluetooth connection alive. Sign in inside that panel; an existing TONE3000 login in another Bluefy tab may not carry over. Selecting a tone returns to its model list here; **Load capture** downloads, validates and transfers the A2 Lite model. It becomes active only after checksum/readback confirmation.
4. **Back to captures** cancels browsing. If the embedded panel stays blank or sign-in restarts, use **Sign-in help → Continue in this tab**. This explicit fallback returns automatically after selection; reconnect Bluetooth before loading. No popup is required. If iOS suspends Bluetooth during embedded browsing, the controller tries to reconnect the previously selected device.
5. Star captures to keep multiple phone favorites. **Save to plug** separately stores one in a chosen color. Amp-and-cab captures bypass the stock cabinet.

The integration uses OAuth picker flows and bounded favorites/downloaded/created/trending/latest feeds. Full search stays on TONE3000. Downloads are user-requested, with creator and license metadata retained. No catalog mirroring, private API key, proxy account or bundled captures. Clearing browser data removes local favorites/downloads, not onboard presets. Up to 64 selected captures are cached locally. Tokens remain in memory; reloading requires signing in through the picker again.

On NAMLNK27+, the threshold slider also shows the recent raw guitar input peak. The white marker is the trigger threshold; the bar turns green when the input reaches it and blue below it. The reading updates while the panel is open. Version 0.9.0 keeps background reads visually quiet and waits for an active read before sending a user action. The control-state line shows the physical button mode and, on older firmware, forward/reverse preset order. Firmware 25/26 cannot supply this meter.

## Physical gestures (NAMLNK28)

| Action | Gesture |
| --- | --- |
| Next occupied preset | Tap PRESET outside Looper |
| Previous occupied preset, once | Hold PRESET for 800 ms outside Looper |
| Enter Looper | Double-tap POWER when no loop exists |
| Arm / cancel / finish / pause / resume | Tap PRESET in Looper, depending on state |
| Start recording | Play above threshold while armed; LED flashes while waiting |
| Toggle overdub | Hold PRESET for 800 ms in Looper with a retained loop |
| Clear | Tap PRESET, then press again within 300 ms and hold 800 ms |
| Switch preset/looper controls with a loop | Tap POWER once; recording finishes if leaving Looper |
| Stop and exit Looper | Double-tap POWER; completed recording is retained |
| Shutdown | Hold POWER normally |

On older NAMLNK26/27, holding PRESET in Looper clears, and outside Looper toggles
preset direction. On NAMLNK28 it moves backward only once; the next tap moves
forward. Opening this panel alone does not change button mode. Phone arming
sets Looper mode so PRESET can finish the recording.

## Compatibility and status

Controller **0.9.1** recognizes NAMLNK25–28 and retains earlier guitar controls. **FX A / FX B → Auto Wah** uses the Daisy-derived algorithm on 24–28; **Drive → Touch Wah** retains the stock effect. Connection/status reads do not change playback. The controller does not install firmware.

## Looper

On **NAMLNK26–28**, open **Looper** for Arm, Finish/Pause/Play, **Start overdub / Finish overdub**, Stop, **Mute loop**, **Delete loop**, trigger threshold and combined-loop volume. Controller **0.9.1** highlights active overdubbing and shows the confirmed loop cursor moving through the recording. Finish overdub keeps the take and continues playback; ordinary playback does not add guitar. Mute restores the last nonzero volume observed during this connection. It affects the entire loop and does not finish an overdub. Delete loop removes the entire recording after confirmation. **Looper controls / Preset controls** changes the hardware button mode. Selecting another preset leaves the loop/layer running. Opening or closing the panel does not stop playback. NAMLNK25 has basic transport only; settings, layers and button gestures need NAMLNK26.

Choose **30 s · 24 kHz** (default) or **60 s · 12 kHz** before recording. Long mode reduces loop bandwidth; live guitar remains 48 kHz. Overdubs merge into one mono loop without undo. The phone cannot display or independently mute, delete, or meter separate takes because the firmware does not retain them. The moving bar is loop position, not audio volume; the existing input meter is live guitar. Independent layers and exact one-pass overdubbing require firmware support. This controller does not add a timer that could fail while the browser is suspended. Loops are lost on power-off. On NAMLNK28, clear the retained loop and choose **Save looper settings** to retain threshold, level and duration. Live edits alone are not saved. New settings default to −50 dB and 100% level; lower levels are supported. Older firmware settings are volatile. Clear the loop before saving presets to flash.

The NAMLNK25 owner confirmed loop recording/playback through preset changes. The owner tested NAMLNK26 phone transport, but reported scratchy 30-second overdubs and missed physical PRESET finishes. NAMLNK27 fixes have offline coverage and need a new hardware/listening check. The latest local builder now offers the NAMLNK28 preview with licensed starters; exact hardware validation remains pending. [Implementation and button guide](https://github.com/santismo/mighty-nam/tree/main/tools/looper-prototype/layers).

| Firmware | Available features |
| --- | --- |
| NAMLNK12 | Legacy editing; incomplete metadata can limit save/tuner operations |
| NAMLNK13+ | Two FX blocks and paged replies |
| NAMLNK14+ | High / Low Cut and compatible capture transfers |
| NAMLNK15+ | Compact automatic tuner |
| NAMLNK18+ | Global persistent buffer |
| NAMLNK20+ | Active chain with Add / Remove / Change block |
| NAMLNK21–28 | NAM tone/mix/gain and independent USB recording gain |
| NAMLNK24–28 | Retained stock Touch Wah; Daisy-derived Auto Wah in FX A/B |
| NAMLNK25 | Basic looper transport |
| NAMLNK26 | Threshold/level, 30/60 s choice, merged overdubs and hardware control mode |
| NAMLNK27 | Live input meter on the threshold slider; overdub and short physical tap fixes |
| NAMLNK28 | Explicit saved looper settings, 100% level default, hold overdub, tap-then-hold clear, single backward preset |

Only explicitly recognized firmware identities are enabled. Automated protocol/browser tests use simulated Bluetooth; they do not establish physical iPhone transfer speed or all effects' real-time headroom. No firmware images are distributed here.

## Development and rights

Serve this directory over HTTPS, or localhost for development. No build step. Run `npm test` with Node.js 20+. A fork should register its own publishable TONE3000 client ID and exact HTTPS callback address; keep secret keys out of client code. The callback follows the page's current path. Internal storage keys remain stable to preserve existing browser libraries on the same origin.

The canonical page is now **https://santismo.github.io/mighty-nam-controller/**. Update bookmarks; GitHub Pages does not redirect repository project URLs automatically. This is the same origin, so retained local storage remains available in the same browser. Bluetooth permission may need to be granted again.

Original source: **MIT © 2026 santismo**. Mightier Amp notices are retained. NUX hardware/firmware and creator captures have separate rights. See [legal notes](LEGAL.md) and [privacy](PRIVACY.md). No affiliation or endorsement by NUX, Neural Amp Modeler or TONE3000 is claimed.

## Firmware compatibility

NAMLNK23 r2 fixes stereo phone-music playback in firmware. Controller 0.8.3 already supports its unchanged protocol; no page update or preset migration is needed. Get the [local firmware builder and guide](https://santismo.github.io/mighty-nam/looper-builder.html). The two wah choices are available in the NAMLNK24–28 test firmware. The latest local builder includes the experimental NAMLNK28 looper.

The development looper uses single POWER to switch between preset and loop controls, PRESET to arm/finish/pause/resume, and double POWER to stop and exit. See the [button and storage guide](https://github.com/santismo/mighty-nam/tree/main/tools/looper-prototype/layers).
