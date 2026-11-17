import { fetch, Agent } from 'undici';
import { hueSatToXy, xyToHueSat } from './color-utils.js';

// The Hue Bridge's local CLIP v2 API only serves HTTPS with a self-signed
// cert, so TLS verification has to be disabled for bridge requests only.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

function normalizeLight(light) {
  const capabilities = ['power'];
  if (light.dimming) capabilities.push('brightness');
  if (light.color) capabilities.push('color');
  if (light.color_temperature) capabilities.push('colorTemp');

  return {
    id: `hue:${light.id}`,
    name: light.metadata?.name ?? 'Hue Light',
    vendor: 'hue',
    capabilities,
    state: stateFromLight(light),
  };
}

function stateFromLight(light) {
  const state = { online: true, on: Boolean(light.on?.on) };
  if (light.dimming) state.brightness = Math.round(light.dimming.brightness);
  if (light.color_temperature?.mirek) state.mireds = light.color_temperature.mirek;
  if (light.color?.xy) state.color = xyToHueSat(light.color.xy);
  return state;
}

/**
 * @param {{ bridgeIp: string, applicationKey: string }} config
 */
export function createHueAdapter(config) {
  const { bridgeIp, applicationKey } = config;
  const configured = Boolean(bridgeIp && applicationKey);

  async function request(pathname, options = {}) {
    const res = await fetch(`https://${bridgeIp}${pathname}`, {
      ...options,
      dispatcher: insecureAgent,
      headers: {
        'hue-application-key': applicationKey,
        'content-type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Hue API ${pathname} responded ${res.status}`);
    }
    return res.json();
  }

  async function getLightState(nativeId) {
    try {
      const data = await request(`/clip/v2/resource/light/${nativeId}`);
      const light = data.data?.[0];
      return light ? stateFromLight(light) : { online: false, error: 'not found' };
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function listDevices() {
    if (!configured) return [];
    try {
      const data = await request('/clip/v2/resource/light');
      return (data.data ?? []).map(normalizeLight);
    } catch (err) {
      return [];
    }
  }

  async function setPower(nativeId, on) {
    try {
      await request(`/clip/v2/resource/light/${nativeId}`, {
        method: 'PUT',
        body: JSON.stringify({ on: { on } }),
      });
      return getLightState(nativeId);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function setBrightness(nativeId, pct) {
    try {
      await request(`/clip/v2/resource/light/${nativeId}`, {
        method: 'PUT',
        body: JSON.stringify({ dimming: { brightness: pct } }),
      });
      return getLightState(nativeId);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function setColor(nativeId, { hue, sat, mireds }) {
    try {
      const body = mireds !== undefined
        ? { color_temperature: { mirek: Math.round(mireds) } }
        : { color: { xy: hueSatToXy(hue, sat) } };
      await request(`/clip/v2/resource/light/${nativeId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return getLightState(nativeId);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  return { listDevices, setPower, setBrightness, setColor };
}

/** Discover a Hue Bridge's IP via the N-UPnP cloud endpoint (setup-time only). */
export async function discoverBridgeIp() {
  try {
    const res = await fetch('https://discovery.meethue.com/');
    const results = await res.json();
    return results?.[0]?.internalipaddress ?? null;
  } catch {
    return null;
  }
}

/**
 * Attempt to pair with the bridge. Call repeatedly while the user holds the
 * bridge's physical link button; returns null until it succeeds.
 * @returns {Promise<string|null>} the application key, or null if not yet paired
 */
export async function tryPairBridge(bridgeIp) {
  const res = await fetch(`https://${bridgeIp}/api`, {
    method: 'POST',
    dispatcher: insecureAgent,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ devicetype: 'smart-home-dashboard#server' }),
  });
  const body = await res.json();
  const entry = Array.isArray(body) ? body[0] : null;
  if (entry?.success?.username) {
    return entry.success.username;
  }
  return null;
}
