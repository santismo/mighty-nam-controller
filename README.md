# mighty-nam controller

[Open controller](https://santismo.github.io/nam-plug-controller/?v=0.8.1)

A Bluetooth controller for mighty-nam. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**.

- Choose one of the seven colored onboard presets.
- Tap a block's symbol to enable or bypass it. Tap its name for controls below the chain; the **Enabled / Bypassed** button there toggles the same block. Move blocks with the arrows or drag them on desktop.
- On **NAMLNK13–16**, the chain includes two independent blocks, **FX A** and **FX B**, in addition to the stock modulation block. Each offers **Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo, and Vibrato**. Both can run together and move anywhere in the chain.
- Pitch moves in semitone steps from **−12 to +12**. The first implementation is intended for single notes. Its additional processing delay is separate from the output buffer; chord quality and hardware headroom are still experimental.
- On **NAMLNK14–16**, choose **Equalizer → High / Low Cut**. Low Cut covers 20 Hz–1 kHz; High Cut covers 1–20 kHz. Both are 12 dB/oct filters, each with an **Off** position. The EQ block can move and save with the preset. This new choice is hidden on older firmware.
- Controls apply live. Rapid slider movements are combined, and final settings are read back. They are **not saved automatically**.
- **Save to plug** keeps the preset name, effects, order, NAM capture, and both FX blocks after power-off. A phone-loaded capture can be saved to any of the seven colors, including an empty slot. The dialog identifies an occupied destination before replacing it. Saved presets play when powered on. **Master volume** applies live and is kept with that color when saved. Switching presets discards unsaved edits.
- Choose an **8, 16, or 32 sample** output buffer. The page shows the confirmed device value. With NAMLNK18, it is saved globally for all colors; older firmware retains per-preset settings. Playback resumes after a successful change if it was on beforehand. Eight retains the existing minimum output path. Pitch, chorus, flanger and vibrato can add effect delay regardless of this setting.
- **Tuner** starts reading automatically. Pluck one string and let it ring. Clear guitar notes use a shorter snapshot; low or uncertain notes use more samples. Bluetooth updates take time and are not an audio stream. Closing the tuner or hiding the page stops polling; closing resumes playback after checking the current capture and preset. It never accesses the phone or Mac microphone.

Use one controller at a time. After changing presets with the plug's button, tap **Refresh**. A failed edit stops automatic writes until a fresh read. The page never retries a save automatically. Keep the page open and connected while saving.

## TONE3000 captures

1. Open **Captures** (or **NAM → Choose capture**) and choose **Browse TONE3000**. Sign in there, browse/filter/search, open a tone and tap **Select Tone** to return.
2. Tap **Load capture** on a model. The controller extracts and validates the compatible **48 kHz A2 Lite** model, including Lite inside an A2 container. A1, other topologies and other sample rates cannot run on this firmware.
3. Returning from the catalog disconnects Bluetooth. Tap **Connect** to send the selected download to the plug in normal mode. Keep the page open during transfer. No Mac, proxy, private API key, paid plan or firmware update is required on **NAMLNK14–16**.
4. After checksum/readback confirmation the selected capture becomes the active NAM model. Playback resumes automatically after validation. Amp + cabinet captures automatically bypass the stock cabinet. Keep headphone volume low when trying an unfamiliar capture.
5. **☆ Favorite** keeps multiple favorites on this phone. **Save to plug** is separate: choose a color to keep the capture and chain after power-off.

The browser offers TONE3000 account favorites, downloaded/created tones and bounded trending/latest feeds. Full catalog search uses the official picker, in accordance with [TONE3000's API terms](https://www.tone3000.com/api/terms). Phone favorites are local and do not alter your TONE3000 favorites. Tap More to request another page; there is no catalog mirroring or bulk downloading.

Up to 64 selected downloads are kept in this browser's local storage. Clearing browser data removes that phone library, but not onboard presets. The saved capture retains creator/license information; the repository includes no captures. Access/refresh tokens stay in memory, so reloading the page requires using Browse TONE3000 again. The short-lived PKCE verifier is stored only until return. Sign-in uses the project's public client ID; no private API key is embedded. An interrupted Bluetooth upload is aborted only for the exact prior session belonging to this browser/device pair, then restarted on an explicit new load. Preset saves are never retried automatically.

Model transfers support NAMLNK14 through NAMLNK17. FX A/B support NAMLNK13–17; updating the page alone cannot add them to older firmware. Mac app 0.3.9 also includes both extra FX editors.

## NAM controls and browsing — controller 0.7.2

On NAMLNK21/22, select NAM to adjust input/output gain (−24 to +24 dB), bass/middle/treble (−12 to +12 dB), and wet/dry mix. Changes apply live with confirmed readback; Save to plug keeps them with the color. Older firmware keeps its existing controls. NAMLNK21 is staged and offline-tested, not yet installed or verified with physical USB audio.

Loading a capture keeps the Captures browser open, preserving the current details, filters and scroll position. The selected model is marked active after the plug confirms it. Keep browsing to try another capture, or close the browser when finished. Offline downloads also keep the browser open; close it and connect to send the queued capture. The official TONE3000 sign-in/picker still returns to this controller page as before.

Protocol tests and browser checks use simulated BLE; they do not establish physical phone-transfer performance. No firmware or capture files are included here.

## Bypass and changing blocks — controller 0.8.0

On NAMLNK20/21, tapping a block symbol or Enabled/Bypassed badge toggles processing while keeping the tile. **Remove** is separate. **Change block** swaps it for an available block type at the same position, retaining its enabled/bypassed state. The effect chooser selects an effect within that block; FX A and FX B each offer Pitch, Auto Wah and modulation choices. Each stock engine is available once, plus the two flexible FX engines.

Bypassed engines still do not run in the active DSP graph. Firmware stores their parameters and bypass state with Save. The choice to display a bypassed tile is remembered locally per color by this controller; it is not new firmware metadata shared between the phone and Mac. A newly connected controller always displays every enabled block.

## Playback — controller 0.7.1

Master volume replaces the manual Listen/Mute controls. Capture loading and tuning still briefly stop output while their work completes, then resume the checked capture. Failed transfers and processing faults do not enable output. There is no startup-mute checkbox. The volume command was checked over USB on NAMLNK20; 108 controller tests pass. Bluetooth volume/tuner return on the physical iPhone still needs user confirmation.

## Active chains — controller 0.7.0

With experimental NAMLNK20, the chain shows only effects that actually execute. Use **Add block** to insert an available effect; use the selected block’s Remove control to remove it; tapping its symbol bypasses it while keeping its tile. Settings are retained when adding it again. Removing reverb or delay stops its tail. Controls apply live; **Save to plug** persists the chosen chain. Earlier firmware retains the full enable/bypass view.

All existing NAMLNK19 controls and transfer paths remain supported, with NAMLNK20 added. Offline protocol and browser tests pass with simulated Bluetooth; physical NAMLNK20 validation is pending. Firmware installation is separate and clears the preset bank, so back up before updating. Fewer active processors do not by themselves establish lower measured audio latency.

## Firmware compatibility

**NAMLNK17 / controller 0.6.4:** recognizes the converter-filter trial and reports its cached startup check in Connection details. Existing controls, captures, presets and compact tuning remain available; 16 remains supported. The trial is installed on the development plug: startup readback, all seven saved presets, power cycling and quiet eight-sample checks passed. Actual audio latency is not yet measured, and higher CPU snapshots versus the immediate 16 baseline remain under investigation. Firmware installation is separate and requires preserving the onboard presets first.

**NAMLNK16 / controller 0.6.3:** recognizes the NAM processing optimization and retains the existing controls, capture transfers and compact tuner. It is installed on the development plug; seven presets survived restart and button cycling. Quiet matched-chain USB measurements used 4.0–4.6% fewer median processing cycles than 15. The fixed audio path is unchanged, and guitar-to-headphone latency has not been measured. Firmware installation remains separate and clears the onboard bank; preserve presets first.

**NAMLNK15 / controller 0.6.2:** adds compact automatic tuner readings calculated on the plug, avoiding multi-page audio transfers. The capture is 85 ms; Bluetooth and computation add time. NAMLNK14 keeps its previous tuner path. Firmware 15 also skips fully bypassed FX A/B after their fade and avoids reloading the same saved color when PRESET wraps to itself. Only occupied colors cycle: save another color if the page reports that only Green is saved. These firmware behaviors passed offline ARM checks. NAMLNK15 is installed on the development plug; saved presets survived restart and the user confirmed all seven colors cycle. Quiet compact USB tuner readings completed in 113–118 ms. Listening latency and Bluefy tuner cadence remain unmeasured.

**NAMLNK14 experimental:** High / Low Cut and FX A/B are installed on the development plug; muted USB controls/preset checks passed and the user confirmed the EQ works. Controller 0.6.0 added model transfers using the existing firmware protocol. Controller 0.6.1 added automatic tuning, confirmed/saved buffer readouts and standalone startup-output defaults without requiring a firmware update. Real TONE3000 sign-in, selection, account downloads and A2 extraction passed in the desktop browser. BLE simulations and the exact NAMLNK14 ARM Bluetooth-channel parser pass transfer/readback checks; the first end-to-end Bluefy phone transfer remains to be confirmed on the physical plug.

**NAMLNK12:** The existing nine-block controller and v0.3.1 fallback remain available. Some devices deliver only 75 of the expected 326 bytes of preset metadata over Bluetooth. In that case, the page verifies a fresh status snapshot and keeps live effects, buffer and output controls available. Preset selection, saving and tuner remain disabled for that session with a persistent notice. Use the physical preset button followed by **Refresh**, and the Mac app for saving or tuning. Manual Refresh retries metadata reads; saves are never retried automatically.

**NAMLNK13 experimental:** Long preset and tuner replies are pulled in short, numbered Bluetooth pages. The controller rejects missing, reordered or mixed-generation pages. The new firmware and page have automated protocol, browser and firmware-emulation checks; initial USB checks and muted effects runs passed on the development plug, and the user confirmed Bluefy reaches Ready with both FX blocks visible. Phone save/tuner checks, listening quality and calibrated processing deadlines remain unverified. The installer clears the onboard bank; preserve presets before updating if you want to keep them.

No firmware images, captures, account sessions or private credentials are included in this repository. The TONE3000 publishable client ID is public by design. The page has no analytics and does not play audio. Connection reports stay in the browser until copied using **Connection details → Copy report**.

**Controller 0.6.5 / NAMLNK18:** The buffer becomes a global saved setting across all seven colors and restarts. Choosing 8, 16 or 32 saves it immediately; no preset save is needed. The page labels older firmware as per-preset. Successful buffer changes, model loads and saves resume output if it was on before the operation; explicit mute, tuner mute and faults remain. Firmware 18 is offline-tested and is not yet installed on the development plug. Controller/browser checks use simulated BLE and do not establish physical phone latency.

Serve this directory over HTTPS (or localhost for development). No build step. Run `npm test` with Node.js 20 or later.

MIT · © 2026 santismo. Stock effect descriptions and display formatting are adapted from Mightier Amp; see [third-party licenses](THIRD-PARTY-LICENSES.txt).

## mighty-nam — controller 0.8.0

The minimal black interface uses effect colors for blocks and controls. Tap any saved color to recall that exact preset; it does not step through intervening colors.

On the refreshed NAMLNK21 candidate, **USB recording gain** adjusts processed guitar sent to the computer from −24 to +24 dB in 0.5 dB steps, independently of headphone Master volume. It starts at 0 dB, applies live with readback, and is kept with the color by Save to plug. Raising gain can clip a loud capture; use the recording meter in your DAW. The update also revises Auto Wah’s envelope sweep/resonance in firmware. The page alone cannot change that sound.

115 offline controller tests pass. The new firmware is staged; physical USB audio and listening checks remain pending. No device was accessed or auto-muted while making this update. The repository URL stays unchanged to preserve bookmarks and the registered TONE3000 redirect.

Controller 0.8.1 recognizes NAMLNK22, including live pitch/octave controls, NAM controls, recording gain, global buffer and the compact tuner. Firmware remains a test build; physical pitch timing and listening are pending.
