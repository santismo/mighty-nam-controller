# NAM Plug controller

[Open controller](https://santismo.github.io/nam-plug-controller/?v=0.6.3)

A Bluetooth controller for NAM Plug. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**.

- Choose one of the seven colored onboard presets.
- Tap a block's symbol to enable or bypass it. Tap its name for controls below the chain; the **Enabled / Bypassed** button there toggles the same block. Move blocks with the arrows or drag them on desktop.
- On **NAMLNK13–16**, the chain includes two independent blocks, **FX A** and **FX B**, in addition to the stock modulation block. Each offers **Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo, and Vibrato**. Both can run together and move anywhere in the chain.
- Pitch moves in semitone steps from **−12 to +12**. The first implementation is intended for single notes. Its additional processing delay is separate from the output buffer; chord quality and hardware headroom are still experimental.
- On **NAMLNK14–16**, choose **Equalizer → High / Low Cut**. Low Cut covers 20 Hz–1 kHz; High Cut covers 1–20 kHz. Both are 12 dB/oct filters, each with an **Off** position. The EQ block can move and save with the preset. This new choice is hidden on older firmware.
- Controls apply live. Rapid slider movements are combined, and final settings are read back. They are **not saved automatically**.
- **Save to plug** keeps the preset name, effects, order, buffer, NAM capture, and both FX blocks after power-off. A phone-loaded capture can be saved to any of the seven colors, including an empty slot. The dialog identifies an occupied destination before replacing it. **Play when powered on** defaults on for saves, including older presets saved muted during testing. The page shows the actual saved startup setting separately; tap Save to plug once for each color to change it. Saving itself always leaves output muted. Switching presets discards unsaved edits.
- Choose an **8, 16, or 32 sample** output buffer. The page shows the confirmed device value separately from the saved preset value. Changing it mutes output; tap **Listen on plug** to resume. Eight retains the existing minimum output path. Pitch, chorus, flanger and vibrato can add effect delay regardless of this setting.
- **Tuner** starts reading automatically. Pluck one string and let it ring. Clear guitar notes use a shorter snapshot; low or uncertain notes use more samples. Bluetooth updates take time and are not an audio stream. Closing the tuner or hiding the page stops polling; closing leaves the plug muted. It never accesses the phone or Mac microphone.

Use one controller at a time. After changing presets with the plug's button, tap **Refresh**. A failed edit stops automatic writes until a fresh read. The page never retries a save automatically. Keep the page open and connected while saving.

## TONE3000 captures

1. Open **Captures** (or **NAM → Choose capture**) and choose **Browse TONE3000**. Sign in there, browse/filter/search, open a tone and tap **Select Tone** to return.
2. Tap **Load capture** on a model. The controller extracts and validates the compatible **48 kHz A2 Lite** model, including Lite inside an A2 container. A1, other topologies and other sample rates cannot run on this firmware.
3. Returning from the catalog disconnects Bluetooth. Tap **Connect** to send the selected download to the plug in normal mode. Keep the page open during transfer. No Mac, proxy, private API key, paid plan or firmware update is required on **NAMLNK14–16**.
4. After checksum/readback confirmation the selected capture becomes the active NAM model. The plug stays muted. Amp + cabinet captures automatically bypass the stock cabinet. Tap **Listen on plug** when ready, with headphone volume low.
5. **☆ Favorite** keeps multiple favorites on this phone. **Save to plug** is separate: choose a color to keep the capture and chain after power-off.

The browser offers TONE3000 account favorites, downloaded/created tones and bounded trending/latest feeds. Full catalog search uses the official picker, in accordance with [TONE3000's API terms](https://www.tone3000.com/api/terms). Phone favorites are local and do not alter your TONE3000 favorites. Tap More to request another page; there is no catalog mirroring or bulk downloading.

Up to 64 selected downloads are kept in this browser's local storage. Clearing browser data removes that phone library, but not onboard presets. The saved capture retains creator/license information; the repository includes no captures. Access/refresh tokens stay in memory, so reloading the page requires using Browse TONE3000 again. The short-lived PKCE verifier is stored only until return. Sign-in uses the project's public client ID; no private API key is embedded. An interrupted Bluetooth upload is aborted only for the exact prior session belonging to this browser/device pair, then restarted on an explicit new load. Preset saves are never retried automatically.

Model transfers require NAMLNK14, NAMLNK15 or NAMLNK16. FX A/B require NAMLNK13–16; updating the page alone cannot add them to older firmware. Mac app 0.3.8 also includes both extra FX editors.

## Firmware compatibility

**NAMLNK16 / controller 0.6.3:** recognizes the NAM processing optimization and retains the existing controls, capture transfers and compact tuner. It is installed on the development plug; seven presets survived restart and button cycling. Quiet matched-chain USB measurements used 4.0–4.6% fewer median processing cycles than 15. The fixed audio path is unchanged, and guitar-to-headphone latency has not been measured. Firmware installation remains separate and clears the onboard bank; preserve presets first.

**NAMLNK15 / controller 0.6.2:** adds compact automatic tuner readings calculated on the plug, avoiding multi-page audio transfers. The capture is 85 ms; Bluetooth and computation add time. NAMLNK14 keeps its previous tuner path. Firmware 15 also skips fully bypassed FX A/B after their fade and avoids reloading the same saved color when PRESET wraps to itself. Only occupied colors cycle: save another color if the page reports that only Green is saved. These firmware behaviors passed offline ARM checks. NAMLNK15 is installed on the development plug; saved presets survived restart and the user confirmed all seven colors cycle. Quiet compact USB tuner readings completed in 113–118 ms. Listening latency and Bluefy tuner cadence remain unmeasured.

**NAMLNK14 experimental:** High / Low Cut and FX A/B are installed on the development plug; muted USB controls/preset checks passed and the user confirmed the EQ works. Controller 0.6.0 added model transfers using the existing firmware protocol. Controller 0.6.1 added automatic tuning, confirmed/saved buffer readouts and standalone startup-output defaults without requiring a firmware update. Real TONE3000 sign-in, selection, account downloads and A2 extraction passed in the desktop browser. BLE simulations and the exact NAMLNK14 ARM Bluetooth-channel parser pass transfer/readback checks; the first end-to-end Bluefy phone transfer remains to be confirmed on the physical plug.

**NAMLNK12:** The existing nine-block controller and v0.3.1 fallback remain available. Some devices deliver only 75 of the expected 326 bytes of preset metadata over Bluetooth. In that case, the page verifies a fresh status snapshot and keeps live effects, buffer and output controls available. Preset selection, saving and tuner remain disabled for that session with a persistent notice. Use the physical preset button followed by **Refresh**, and the Mac app for saving or tuning. Manual Refresh retries metadata reads; saves are never retried automatically.

**NAMLNK13 experimental:** Long preset and tuner replies are pulled in short, numbered Bluetooth pages. The controller rejects missing, reordered or mixed-generation pages. The new firmware and page have automated protocol, browser and firmware-emulation checks; initial USB checks and muted effects runs passed on the development plug, and the user confirmed Bluefy reaches Ready with both FX blocks visible. Phone save/tuner checks, listening quality and calibrated processing deadlines remain unverified. The installer clears the onboard bank; preserve presets before updating if you want to keep them.

No firmware images, captures, account sessions or private credentials are included in this repository. The TONE3000 publishable client ID is public by design. The page has no analytics and does not play audio. Connection reports stay in the browser until copied using **Connection details → Copy report**.

Serve this directory over HTTPS (or localhost for development). No build step. Run `npm test` with Node.js 20 or later.

MIT · © 2026 santismo. Stock effect descriptions and display formatting are adapted from Mightier Amp; see [third-party licenses](THIRD-PARTY-LICENSES.txt).
