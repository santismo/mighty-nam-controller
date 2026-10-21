# NAM Plug controller

[Open controller](https://santismo.github.io/nam-plug-controller/?v=0.4.1)

A Bluetooth controller for NAM Plug. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**.

- Choose one of the seven colored onboard presets.
- Tap a block's symbol to enable or bypass it. Tap its name for controls below the chain; the **Enabled / Bypassed** button there toggles the same block. Move blocks with the arrows or drag them on desktop.
- On **NAMLNK13**, the chain includes two independent blocks, **FX A** and **FX B**, in addition to the stock modulation block. Each offers **Pitch, Auto Wah, Chorus, Flanger, Phaser, Tremolo, and Vibrato**. Both can run together and move anywhere in the chain.
- Pitch moves in semitone steps from **−12 to +12**. The first implementation is intended for single notes. Its additional processing delay is separate from the output buffer; chord quality and hardware headroom are still experimental.
- Controls apply live. Rapid slider movements are combined, and final settings are read back. They are **not saved automatically**.
- **Save to plug** keeps the active preset's name, effects, order, buffer, existing NAM capture, and both new FX blocks after power-off. Switching presets discards unsaved edits. The page cannot yet replace a capture or fill an empty slot.
- Choose an **8, 16, or 32 sample** output buffer. Changing it mutes output; tap **Listen on plug** to resume. Saving also leaves the plug muted.
- **Tuner → Check note** reads a short guitar snapshot from the plug. Pluck one string for each reading. It mutes the plug and stays muted when closed. It never accesses the phone or Mac microphone.

Use one controller at a time. After changing presets with the plug's button, tap **Refresh**. A failed edit stops automatic writes until a fresh read. The page never retries a save automatically. Keep the page open and connected while saving.

TONE3000 sign-in, capture downloads and Bluetooth model transfers are not included yet. Load captures with the Mac app for now. FX A/B require NAMLNK13; updating the page alone cannot add them to older firmware. The Mac compatibility update supports NAMLNK13 USB, but the two new FX editors are on this page.

## Firmware compatibility

**NAMLNK12:** The existing nine-block controller and v0.3.1 fallback remain available. Some devices deliver only 75 of the expected 326 bytes of preset metadata over Bluetooth. In that case, the page verifies a fresh status snapshot and keeps live effects, buffer and output controls available. Preset selection, saving and tuner remain disabled for that session with a persistent notice. Use the physical preset button followed by **Refresh**, and the Mac app for saving or tuning. Manual Refresh retries metadata reads; saves are never retried automatically.

**NAMLNK13 experimental:** Long preset and tuner replies are pulled in short, numbered Bluetooth pages. The controller rejects missing, reordered or mixed-generation pages. The new firmware and page have automated protocol, browser and firmware-emulation checks; initial USB checks and muted effects runs passed on the development plug, and the user confirmed Bluefy reaches Ready with both FX blocks visible. Phone save/tuner checks, listening quality and calibrated processing deadlines remain unverified. The installer clears the onboard bank; preserve presets before updating if you want to keep them.

No firmware, captures, accounts or credentials are included in this repository. The page has no analytics and does not play audio. Connection reports stay in the browser until copied using **Connection details → Copy report**.

Serve this directory over HTTPS (or localhost for development). No build step. Run `npm test` with Node.js 20 or later.

MIT · © 2026 santismo. Stock effect descriptions and display formatting are adapted from Mightier Amp; see [third-party licenses](THIRD-PARTY-LICENSES.txt).
