# NAM Plug controller

[Open controller](https://santismo.github.io/nam-plug-controller/?v=0.3.1)

A Bluetooth controller for NAM Plug running NAMLNK12. On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**.

- Choose one of the seven colored onboard presets.
- Tap a block's symbol to enable or bypass it. Tap its name for effect selection and controls. Move blocks with the arrow buttons or drag them on desktop.
- Controls apply live over Bluetooth. Rapid slider movements are combined, and the final settings are read back. They are **not saved automatically**.
- **Save to plug** keeps the active preset's name, effects, order, buffer, and existing NAM capture after power-off. Switching presets discards unsaved edits. The page cannot yet replace a capture or fill an empty slot.
- Choose an **8, 16, or 32 sample** output buffer. Changing it mutes output; tap **Listen on plug** to resume. Saving also leaves the plug muted.
- **Tuner → Check note** reads a short guitar snapshot from the plug. Pluck one string for each reading. It mutes the plug and stays muted when closed. It never accesses the phone or Mac microphone.

Use one controller at a time. If you change presets with the plug's physical button, tap **Refresh**. A failed edit stops further automatic writes until a fresh read. The page never retries a save automatically. Keep the page open and the plug connected while saving.

TONE3000 sign-in, capture downloads and Bluetooth model transfers are not included yet. Load captures with the Mac app for now. No firmware update is required to use this release's live-control fallback.

Version 0.3.1 handles the NAMLNK12 Bluetooth preset-read failure: the observed response contains only 75 of the expected 326 MIDI bytes. The missing data cannot be recovered by the page. When preset metadata is unavailable, the page verifies a fresh status snapshot and keeps live effects, buffer and output controls available. Preset selection, saving and tuner are disabled in that session, with a persistent notice. Use the plug's preset button followed by **Refresh**, and use the Mac app to save or tune. A manual **Refresh** can retry metadata reads; no save is retried automatically.

Version 0.2's Bluefy connection was confirmed on a physical plug. Version 0.3's editing, saving and tuner have automated browser/protocol tests and saved-firmware emulation; their end-to-end iPhone tests are still pending. Version 0.3.1 includes regression tests for the observed truncated reply, missing metadata, recovery, live controls and blocked save/tuner operations. Automated checks do not establish Bluetooth timing or audio quality on the device. Complete preset and tuner transfers on affected firmware require a firmware transport fix; this page update restores the controls that use small replies.

No firmware, captures, accounts or credentials are included. The page has no analytics and does not play audio. Connection reports stay in the browser until copied using **Connection details → Copy report**.

Serve this directory over HTTPS (or localhost for development). No build step. Run `npm test` with Node.js 20 or later.

MIT · © 2026 santismo. Effect descriptions and display formatting are adapted from Mightier Amp; see [third-party licenses](THIRD-PARTY-LICENSES.txt).
