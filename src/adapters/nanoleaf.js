import { Bonjour } from 'bonjour-service';

// Nanoleaf's "ct" field is degrees Kelvin (not mired like Hue), so it needs
// its own conversion to/from the dashboard's shared mireds wire format.
function kelvinToMireds(kelvin) {
  return Math.round(1_000_000 / kelvin);
}

function miredsToKelvin(mireds) {
  return Math.round(1_000_000 / mireds);
}

function stateFromPayload(payload) {
  const state = { online: true, on: Boolean(payload.state?.on?.value) };
  if (payload.state?.brightness) state.brightness = payload.state.brightness.value;
  if (payload.state?.hue && payload.state?.sat) {
    state.color = { hue: payload.state.hue.value, sat: payload.state.sat.value };
  }
  if (payload.state?.ct?.value) state.mireds = kelvinToMireds(payload.state.ct.value);
  return state;
}

function capabilitiesFromPayload(payload) {
  const capabilities = ['power'];
  if (payload.state?.brightness) capabilities.push('brightness');
  if (payload.state?.hue) capabilities.push('color');
  if (payload.state?.ct) capabilities.push('colorTemp');
  return capabilities;
}

/**
 * @param {{ devices: { id: string, name: string, ip: string, token: string }[] }} config
 */
export function createNanoleafAdapter(config) {
  const devices = config.devices ?? [];

  function baseUrl(device) {
    return `http://${device.ip}:16021/api/v1/${device.token}`;
  }

  async function request(device, path, options = {}) {
    const res = await fetch(`${baseUrl(device)}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers },
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      throw new Error(`Nanoleaf API ${path} responded ${res.status}`);
    }
    return res.json();
  }

  function findDevice(nativeId) {
    return devices.find((d) => d.id === nativeId);
  }

  async function getState(device) {
    try {
      const payload = await request(device, '/');
      return stateFromPayload(payload);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function listDevices() {
    return Promise.all(
      devices.map(async (device) => {
        try {
          const payload = await request(device, '/');
          return {
            id: `nanoleaf:${device.id}`,
            name: device.name,
            vendor: 'nanoleaf',
            capabilities: capabilitiesFromPayload(payload),
            state: stateFromPayload(payload),
          };
        } catch (err) {
          return {
            id: `nanoleaf:${device.id}`,
            name: device.name,
            vendor: 'nanoleaf',
            capabilities: ['power', 'brightness', 'color'],
            state: { online: false, error: err.message },
          };
        }
      })
    );
  }

  async function setPower(nativeId, on) {
    const device = findDevice(nativeId);
    if (!device) return { online: false, error: 'not configured' };
    try {
      await request(device, '/state', {
        method: 'PUT',
        body: JSON.stringify({ on: { value: on } }),
      });
      return getState(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function setBrightness(nativeId, pct) {
    const device = findDevice(nativeId);
    if (!device) return { online: false, error: 'not configured' };
    try {
      await request(device, '/state', {
        method: 'PUT',
        body: JSON.stringify({ brightness: { value: pct } }),
      });
      return getState(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function setColor(nativeId, { hue, sat, mireds }) {
    const device = findDevice(nativeId);
    if (!device) return { online: false, error: 'not configured' };
    try {
      const body = mireds !== undefined
        ? { ct: { value: miredsToKelvin(mireds) } }
        : { hue: { value: Math.round(hue) }, sat: { value: Math.round(sat) } };
      await request(device, '/state', { method: 'PUT', body: JSON.stringify(body) });
      return getState(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  return { listDevices, setPower, setBrightness, setColor };
}

/** mDNS-discover Nanoleaf devices on the LAN (setup-time only). */
export async function discoverNanoleafDevices(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found = [];
    const browser = bonjour.find({ type: 'nanoleafapi' }, (service) => {
      const address = service.addresses?.find((addr) => addr.includes('.'));
      if (address) {
        found.push({ name: service.name, ip: address });
      }
    });
    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve(found);
    }, timeoutMs);
  });
}

/**
 * Attempt to pair with a Nanoleaf device. Call within ~30s of holding the
 * power button for 5-7s to enter pairing mode.
 * @returns {Promise<string|null>} the auth token, or null if pairing hasn't started yet
 */
export async function tryPairNanoleaf(ip) {
  try {
    const res = await fetch(`http://${ip}:16021/api/v1/new`, { method: 'POST' });
    if (!res.ok) return null;
    const body = await res.json();
    return body.auth_token ?? null;
  } catch {
    return null;
  }
}
