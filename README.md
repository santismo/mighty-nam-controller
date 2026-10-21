# NAM Plug controller

[Open controller](https://santismo.github.io/nam-plug-controller/)

A small, read-only Bluetooth connection preview. Shows the current signal chain, seven preset slots, buffer and output status from NAMLNK12. Selecting a block only inspects it. Editing, preset recall and model transfers are not implemented here yet.

On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**. Close other plug controllers if a connection times out. Actual iPhone-to-plug compatibility still needs verification; automated tests use simulated devices.

No firmware, captures, accounts or credentials are included. The page has no analytics and does not play audio. Device reads stay in the browser.

Serve this directory over HTTPS (or localhost for development). No build step. Run `npm test` with Node.js 20 or later.

MIT · © 2026 santismo
