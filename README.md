# mighty-nam controller

[Open controller](https://santismo.github.io/mighty-nam-controller/?v=0.11.3) · [License](LICENSE) · [Notices](THIRD-PARTY-LICENSES.txt) · [Privacy](PRIVACY.md)

A free Bluetooth controller for **mighty-nam**, by **santismo**. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**. This public repository contains the web controller only. Firmware and Mac development remain in the public [mighty-nam repository](https://github.com/santismo/mighty-nam).

## 0.11.3

Preset recall now reports a latched processing fault directly and keeps the observed color and stopped state on screen. Reading the saved preset bank no longer overwrites that state with Ready. A failed recall is not retried or saved, and the page does not change output to clear a fault. These UI fixes do not resolve the firmware timing overrun.

## 0.11.2

Reorder checks stop further edits if the firmware reports a processing fault. The page shows a restart instruction instead of Ready or a generic edit mismatch. Connection details retain recent control commands and the last error across Refresh, and include the firmware's raw maximum timer value on a fault. These diagnostics do not reset faults, retry writes, change volume, or enable output. No firmware update is required for the controller changes; the cause of the reported physical IR-reorder fault remains under investigation.

## 0.11.1

NAMLNK30 revision 2 corrects Amp discovery and fills all seven colors by default. The original NAMLNK30 firmware reports Amp as unsupported; this page now explains that it needs the corrected image. Storage errors retain the failed result and include firmware diagnostics when available, with no automatic retry or output change. Mac 0.7.0 is compatible with revision 2.

## Signal chain

- Select any saved color directly. Controls apply live; **Save to plug** stores the capture, name, effects and settings after power-off.
- Tap a block symbol or its **Enabled / Bypassed** badge to toggle processing. Bypass retains the tile and settings. **Remove** and **Change block** are separate actions; drag or use arrows to reorder.
- **FX A / FX B** each offer Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo and Vibrato. Pitch spans −12 to +12 semitones and is intended for single notes.
- **Amp** on NAMLNK30 adds all 29 original amp types. Choose Add block → Amp, then choose an Amplifier. One stock amp can run alongside NAM and the other FX block. Ordinary NAMLNK29 keeps its existing controls; the earlier five-amp extension exposes only those five choices. The firmware capability decides what appears.
- **High / Low Cut** provides independent adjustable filters, each with Off.
- **Master volume** controls the plug. On NAMLNK21–30, NAM has input/output gain, bass/middle/treble and mix; **USB recording gain** adjusts the computer recording feed separately.
- Choose an **8 / 16 / 32-sample** output buffer. NAMLNK18+ saves it globally. This is not a measurement of total guitar latency; time-based effects can add their own delay.
- Open **Tuner**, pluck one string, and let it ring. The plug measures the input; the page polls over Bluetooth. No microphone or browser audio playback is used.

Use one controller at a time. Refresh after using the physical PRESET button. Rapid edits are combined and confirmed by readback. Save is explicit and never automatically retried. Choose Save to plug to copy the current onboard capture into any empty color; a local capture download is not required. Use one to seven occupied colors. Capture loading and tuning temporarily stop plug output and resume after successful checks; failed transfers and processing faults do not enable playback.

## TONE3000

**Powered by [TONE3000](https://www.tone3000.com).**

1. Open **Captures → Browse TONE3000**. Version **0.9.2** checks the controller's authorized account session first. A valid session opens TONE3000 Favorites inside the controller; switch to Downloads, Created, Trending or Latest as needed.
2. If sign-in is needed, use the same-tab flow that works in Bluefy. After selecting a tone you return automatically. Where `getDevices()` is supported, the controller attempts to restore the previously authorized plug. Otherwise tap Connect once. Navigating away cannot preserve the old page's Bluetooth connection.
3. Use the in-page collections or phone downloads for subsequent captures: **Load capture** downloads a supported **48 kHz A2 Lite** model, transfers it over the existing Bluetooth connection, and resumes playback after checksum/readback confirmation. It does not save over a preset. A failed prior operation triggers a read-only refresh before a new load when possible.
4. **Full catalog / search** uses same-tab navigation. **Other browsing option → Try embedded catalog** keeps the page alive, but Bluefy may isolate its sign-in cookies. The controller cannot inspect another website's login cookies.
5. Star captures for phone favorites. **Save to plug** separately stores one in a chosen color. Amp-and-cab captures bypass the stock cabinet.

The integration uses OAuth picker flows and bounded favorites/downloaded/created/trending/latest feeds. Full search stays on TONE3000. Downloads are user-requested, with creator and license metadata retained. No catalog mirroring, private API key, proxy account or bundled captures. Clearing browser data removes local favorites/downloads, not onboard presets. Up to 64 selected captures are cached locally. Tokens stay in this tab’s session storage, survive reloads, and are removed by Sign out. An expired session is refreshed or signed out; it is not inferred from a separate Tone3000 tab.

On NAMLNK27+, the threshold slider also shows the recent raw guitar input peak. The white marker is the trigger threshold; the bar turns green when the input reaches it and blue below it. The reading updates while the panel is open. Version 0.9.0 keeps background reads visually quiet and waits for an active read before sending a user action. The control-state line shows the physical button mode and, on older firmware, forward/reverse preset order. Firmware 25/26 cannot supply this meter.

## Independent lanes (NAMLNK29/30 preview)

After recording a base loop, **Start overdub** creates a lane. Use **Record into lane** to add notes to an existing lane. Every pass between Start and Finish belongs to one edit. **Undo edit** restores the sound from before that edit; **Redo edit** restores it again. Starting the next edit replaces the single undo history. Each lane has its own volume, mute, meter and delete control. The base has volume and mute; Delete loop clears everything.

Recording waits while the firmware prepares space, then the lane shows **Recording**. Finish overdub keeps playback running. These controls apply live to RAM; recordings and per-lane mix disappear on power-off. Saving looper settings stores only the global threshold, combined level and 30/60-second mode.

The fixed recording pool holds at most a base plus three overdub lanes. Shorter loops leave space for more lanes and an undo copy. Approximate base-length limits for three lanes **and** editing an existing lane are **6 seconds in 30 s mode**, or **12 seconds in 60 s mode**; block rounding makes the exact limits slightly shorter. A full-length base leaves no space for independent overdubs. The panel reports available capacity and disables edits that do not fit. These are offline-tested preview controls; hardware timing and Bluetooth behavior still need a trial on NAMLNK29. NAMLNK28 and older keep their existing merged-overdub behavior.

## Physical gestures (NAMLNK28–30)

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

Controller **0.11.0** recognizes NAMLNK12–30 and retains each version’s supported controls. **FX A / FX B → Auto Wah** uses the Daisy-derived algorithm on 24–30; **Drive → Touch Wah** retains the stock effect. Connection/status reads do not change playback. The controller does not install firmware.

## Looper

On **NAMLNK26–28**, open **Looper** for Arm, Finish/Pause/Play, **Start overdub / Finish overdub**, Stop, **Mute loop**, **Delete loop**, trigger threshold and combined-loop volume. Controller **0.9.1** highlights active overdubbing and shows the confirmed loop cursor moving through the recording. Finish overdub keeps the take and continues playback; ordinary playback does not add guitar. Mute restores the last nonzero volume observed during this connection. It affects the entire loop and does not finish an overdub. Delete loop removes the entire recording after confirmation. **Looper controls / Preset controls** changes the hardware button mode. Selecting another preset leaves the loop/layer running. Opening or closing the panel does not stop playback. NAMLNK25 has basic transport only; settings, layers and button gestures need NAMLNK26.

Choose **30 s · 24 kHz** (default) or **60 s · 12 kHz** before recording. Long mode reduces loop bandwidth; live guitar remains 48 kHz. On NAMLNK26–28, overdubs merge into one mono loop without undo; separate lanes require NAMLNK29. The moving bar is loop position, not audio volume; the existing input meter is live guitar. Overdubbing continues across as many loop passes as you play until Finish overdub; it does not stop automatically after one revolution. This controller does not add a timer that could fail while the browser is suspended. Loops are lost on power-off. On NAMLNK28–30, clear the retained loop and choose **Save looper settings** to retain threshold, level and duration. Live edits alone are not saved. New settings default to −50 dB and 100% level; lower levels are supported. Older firmware settings are volatile. Clear the loop before saving presets to flash.

The NAMLNK25 owner confirmed loop recording/playback through preset changes. The owner tested NAMLNK26 phone transport, but reported scratchy 30-second overdubs and missed physical PRESET finishes. NAMLNK27 fixes have offline coverage and need a new hardware/listening check. The latest local builder offers NAMLNK29, NAMLNK28 and NAMLNK23 r2 with licensed starters; exact hardware validation remains pending. [Implementation and button guide](https://github.com/santismo/mighty-nam/tree/main/tools/looper-prototype/layers).

| Firmware | Available features |
| --- | --- |
| NAMLNK12 | Legacy editing; incomplete metadata can limit save/tuner operations |
| NAMLNK13+ | Two FX blocks and paged replies |
| NAMLNK14+ | High / Low Cut and compatible capture transfers |
| NAMLNK15+ | Compact automatic tuner |
| NAMLNK18+ | Global persistent buffer |
| NAMLNK20+ | Active chain with Add / Remove / Change block |
| NAMLNK21–30 | NAM tone/mix/gain and independent USB recording gain |
| NAMLNK24–30 | Retained stock Touch Wah; Daisy-derived Auto Wah in FX A/B |
| NAMLNK25 | Basic looper transport |
| NAMLNK26 | Threshold/level, 30/60 s choice, merged overdubs and hardware control mode |
| NAMLNK27 | Live input meter on the threshold slider; overdub and short physical tap fixes |
| NAMLNK29 preview | Independent reusable overdub lanes, one-edit undo/redo and seven-slot save refresh fix |
| NAMLNK28 | Explicit saved looper settings, 100% level default, hold overdub, tap-then-hold clear, single backward preset |

The current page works with explicitly recognized NAMLNK12–30 firmware. It reads the identity on every connection and enables only that version’s commands. No firmware update is required to continue using older features. NAMLNK25 has transport only, NAMLNK26–28 retain merged overdubs, and only NAMLNK29 gets independent lanes and undo. Unknown identities remain rejected. Automated protocol/browser tests use simulated Bluetooth; they do not establish physical iPhone transfer speed or all effects' real-time headroom. No firmware images are distributed here.

## Development and rights

Serve this directory over HTTPS, or localhost for development. No build step. Run `npm test` with Node.js 20+. A fork should register its own publishable TONE3000 client ID and exact HTTPS callback address; keep secret keys out of client code. The callback follows the page's current path. Internal storage keys remain stable to preserve existing browser libraries on the same origin.

The canonical page is now **https://santismo.github.io/mighty-nam-controller/**. Update bookmarks; GitHub Pages does not redirect repository project URLs automatically. This is the same origin, so retained local storage remains available in the same browser. Bluetooth permission may need to be granted again.

Original source: **MIT © 2026 santismo**. Mightier Amp notices are retained. NUX hardware/firmware and creator captures have separate rights. See [legal notes](LEGAL.md) and [privacy](PRIVACY.md). No affiliation or endorsement by NUX, Neural Amp Modeler or TONE3000 is claimed.

## Phone navigation and loop station

Controller **0.10.2** keeps **Signal chain**, **Captures**, **Looper**, and **Tuner** at the top. Signal chain shows presets and effects. Changing pages does not disconnect Bluetooth or stop a loop. Leaving Tuner waits for the current read and restores checked playback output.

The Looper page uses a shared circular position display, large Arm/Finish/Play and Stop controls, and **Add layer / Finish overdub**. NAMLNK29 displays the base and up to three independent layers with audio meters, mute, level, Record and Delete; available layers depend on loop length and memory. Undo/redo are firmware-confirmed. The base is removed with **Clear all loops**, which also clears every layer after confirmation. Recording settings and hardware gestures are collapsed by default. NAMLNK25–28 retain their supported transport/combined-loop controls without showing unsupported independent layers. Opening Looper offline shows the layout with recording controls disabled.

## Firmware compatibility

NAMLNK23 r2 fixes stereo phone-music playback in firmware. Controller 0.8.3 already supports its unchanged protocol; no page update or preset migration is needed. Get the [local firmware builder and guide](https://santismo.github.io/mighty-nam/looper-builder.html). The two wah choices are available in the NAMLNK24–30 test firmware. The latest local builder lets you select NAMLNK29, NAMLNK28 or NAMLNK23 r2. Choose Firmware at the bottom of the controller to open it; updating is optional and uses the NUX desktop updater, never Bluetooth.

The development looper uses single POWER to switch between preset and loop controls, PRESET to arm/finish/pause/resume, and double POWER to stop and exit. See the [button and storage guide](https://github.com/santismo/mighty-nam/tree/main/tools/looper-prototype/layers).

## NAMLNK28 preset-save I/O report

The owner's controller 0.9.1 trace for preset 4 returns preset error **3** (`io_error`), with active slot 2 and occupied mask 7 unchanged. All Bluetooth reply pages arrive. The protocol and firmware support seven colors; this report is not a three-slot limit. The failing storage substep (read, erase, program, or verification) is not included in this protocol reply, so the report alone cannot identify the exact hardware/firmware cause.

Controller 0.9.2 names the flash-storage failure in the UI and diagnostics, keeps the connection, and does not retry the write automatically. Regression tests cover rejection without false success and successful creation of colors 4–7 on a simulated NAMLNK28 device. They do not establish that the owner's physical flash-write failure is fixed. Firmware-level investigation remains necessary; no firmware is installed by this page.
