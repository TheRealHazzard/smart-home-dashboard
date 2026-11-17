# Smart Home Dashboard

A single web page, served from this machine, that controls Philips Hue lights, TP-Link Tapo bulbs/strips, and Nanoleaf panels from any device on your home network — no cloud relay for control traffic, no per-device apps.

## How it works

- **Philips Hue** — talks to your Hue Bridge's local API (`https://<bridge-ip>/clip/v2/...`).
- **Nanoleaf** — talks to each panel's local API (`http://<panel-ip>:16021/...`). This assumes your Thread border router is already bridging the panels onto your LAN (the Nanoleaf app already controls them locally today) — the dashboard doesn't talk Thread directly.
- **TP-Link Tapo** — talks to each device's local API using your TP-Link account credentials for the one-time auth handshake (no commands go through the cloud after that).

The dashboard binds to your LAN IP only — it is **not exposed to the internet** and has **no login**. Anyone on your home Wi-Fi can open it and control devices. Don't port-forward this.

## Setup

```
npm install
npm run setup
```

`npm run setup` is an interactive wizard that walks through pairing each vendor. Run it again any time to add a device, fix a stale IP, or update credentials — it won't disturb devices you've already paired.

- **Hue**: it'll try to auto-discover your bridge, then ask you to press the physical link button on the bridge before pairing.
- **Nanoleaf**: it scans the network for panels (mDNS), then asks you to hold the power button for 5-7 seconds (until the LED flashes) before pairing.
- **Tapo**: it asks for your TP-Link account email/password (stored locally in `config/devices.json`, gitignored, used only for the local device handshake) and each device's IP + model.

Then start the server:

```
npm start
```

It prints the LAN URL(s) to open, e.g. `http://192.168.1.22:3000` — open that on your phone or any device on the same Wi-Fi.

## A note on IP addresses

Nanoleaf devices are re-discovered via mDNS when you run `npm run setup`, so a changed IP is easy to fix — just re-run setup and choose "update the IP." Tapo has no reliable local discovery, so if a Tapo device stops responding, it's most likely a changed DHCP-assigned IP — re-run `npm run setup` and update it manually, or (recommended) set a DHCP reservation for each Tapo device's MAC address in your router so its IP never changes.

## Project layout

- `server.js` — Express app entrypoint
- `src/adapters/` — one file per vendor (`hue.js`, `tapo.js`, `nanoleaf.js`), each exposing the same normalized interface
- `src/device-registry.js` — aggregates all vendors into one device list for the API
- `src/routes/devices.js` — the `/api/devices` REST endpoints the frontend uses
- `scripts/setup.js` — the pairing wizard (`npm run setup`)
- `public/` — the dashboard itself (vanilla HTML/CSS/JS, no build step)
- `config/devices.json` — your real bridge IPs, tokens, and credentials (gitignored — never commit this file)
