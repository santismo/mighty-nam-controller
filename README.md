# NAM Plug controller

[Open controller](https://santismo.github.io/nam-plug-controller/)

A small, read-only Bluetooth connection preview. Shows the current signal chain, seven preset slots, buffer and output status from NAMLNK12. Selecting a block only inspects it. Editing, preset recall and model transfers are not implemented here yet.

On iPhone, open the page in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055), keep the plug in normal mode, and tap **Connect**. Actual iPhone-to-plug compatibility still needs verification; automated tests use simulated devices.

Version 0.2.0 prefers writes without response, uses fixed request timestamps, and assembles the plug's three-part Bluetooth chain reply. Failed reads leave Bluetooth connected for manual retry. If a request fails, expand **Connection details → Copy report**. The bounded report stays in the browser until you copy it; it is not uploaded. A stuck native write requires Disconnect before reconnecting.

No firmware, captures, accounts or credentials are included. The page has no analytics and does not play audio. Device reads stay in the browser.

Serve this directory over HTTPS (or localhost for development). No build step. Run `npm test` with Node.js 20 or later.

MIT · © 2026 santismo
