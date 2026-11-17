import { loginDeviceByIp } from 'tp-link-tapo-connect';

// Capability lookup by model so a plug (power-only, or power+brightness for
// dimmer plugs) can be added later via config alone, no code changes.
const MODEL_CAPABILITIES = {
  P100: ['power'],
  P105: ['power'],
  P110: ['power', 'brightness'],
  P115: ['power', 'brightness'],
  L510E: ['power', 'brightness'],
  L530E: ['power', 'brightness', 'color'],
  L630: ['power', 'brightness', 'color'],
  L900: ['power', 'brightness', 'color'],
  L920: ['power', 'brightness', 'color'],
};
const DEFAULT_CAPABILITIES = ['power', 'brightness', 'color'];

function capabilitiesForModel(model) {
  return MODEL_CAPABILITIES[model] ?? DEFAULT_CAPABILITIES;
}

function stateFromInfo(info) {
  const state = { online: true, on: Boolean(info.device_on) };
  if (typeof info.brightness === 'number') state.brightness = info.brightness;
  if (typeof info.hue === 'number' && typeof info.saturation === 'number') {
    state.color = { hue: info.hue, sat: info.saturation };
  }
  return state;
}

/**
 * @param {{ account: { email: string, password: string }, devices: { id: string, name: string, ip: string, model: string }[] }} config
 */
export function createTapoAdapter(config) {
  const account = config.account ?? {};
  const devices = config.devices ?? [];
  const configured = Boolean(account.email && account.password);

  // Login sessions occasionally expire; re-login lazily on the next failure.
  const sessions = new Map(); // device.id -> tapo-connect session handle

  async function getSession(device) {
    if (sessions.has(device.id)) return sessions.get(device.id);
    const session = await loginDeviceByIp(account.email, account.password, device.ip);
    sessions.set(device.id, session);
    return session;
  }

  async function withSession(device, fn) {
    if (!configured) throw new Error('Tapo account not configured');
    let session = await getSession(device);
    try {
      return await fn(session);
    } catch {
      sessions.delete(device.id);
      session = await getSession(device);
      return fn(session);
    }
  }

  function findDevice(nativeId) {
    return devices.find((d) => d.id === nativeId);
  }

  async function readState(device) {
    const info = await withSession(device, (session) => session.getDeviceInfo());
    return stateFromInfo(info);
  }

  async function listDevices() {
    if (!configured) return [];
    return Promise.all(
      devices.map(async (device) => {
        const base = {
          id: `tapo:${device.id}`,
          name: device.name,
          vendor: 'tapo',
          capabilities: capabilitiesForModel(device.model),
        };
        try {
          return { ...base, state: await readState(device) };
        } catch (err) {
          return { ...base, state: { online: false, error: err.message } };
        }
      })
    );
  }

  async function setPower(nativeId, on) {
    const device = findDevice(nativeId);
    if (!device) return { online: false, error: 'not configured' };
    try {
      await withSession(device, (session) => (on ? session.turnOn() : session.turnOff()));
      return await readState(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function setBrightness(nativeId, pct) {
    const device = findDevice(nativeId);
    if (!device) return { online: false, error: 'not configured' };
    try {
      await withSession(device, (session) => session.setBrightness(pct));
      return await readState(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  async function setColor(nativeId, { hue, sat }) {
    const device = findDevice(nativeId);
    if (!device) return { online: false, error: 'not configured' };
    try {
      const current = await readState(device);
      const brightness = typeof current.brightness === 'number' ? current.brightness : 100;
      // setHSL always writes brightness too, so pass the current value through
      // to avoid silently changing brightness on a color-only request.
      await withSession(device, (session) => session.setHSL(hue, sat, brightness));
      return await readState(device);
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  return { listDevices, setPower, setBrightness, setColor };
}
