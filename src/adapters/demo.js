/**
 * A fake vendor adapter with in-memory state, so the dashboard can be tried (and
 * screenshotted, and tested) without any real lights. Start it with `npm run demo`.
 * It implements the same interface as the real adapters; see types.js.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function createDemoAdapter(vendor, seed) {
  const devices = new Map(
    seed.map((d) => [
      d.nativeId,
      { name: d.name, capabilities: d.capabilities, state: { online: true, ...d.state } },
    ])
  );

  const view = (nativeId, d) => ({
    id: `${vendor}:${nativeId}`,
    name: d.name,
    vendor,
    capabilities: d.capabilities,
    state: { ...d.state },
  });

  const update = (nativeId, patch) => {
    const d = devices.get(nativeId);
    if (!d) return { online: false, error: 'unknown device' };
    if (!d.state.online) return { ...d.state };
    d.state = { ...d.state, ...patch };
    return { ...d.state };
  };

  return {
    async listDevices() {
      return [...devices].map(([nativeId, d]) => view(nativeId, d));
    },
    async setPower(nativeId, on) {
      return update(nativeId, { on: Boolean(on) });
    },
    async setBrightness(nativeId, pct) {
      const brightness = clamp(Math.round(pct), 0, 100);
      return update(nativeId, { brightness, on: brightness > 0 });
    },
    async setColor(nativeId, color) {
      if (color.mireds !== undefined) return update(nativeId, { mireds: color.mireds, color: undefined });
      return update(nativeId, { color: { hue: clamp(color.hue, 0, 360), sat: clamp(color.sat, 0, 100) } });
    },
  };
}

export function createDemoAdapters() {
  return {
    hue: createDemoAdapter('hue', [
      { nativeId: 'living-lamp', name: 'Living Room Lamp', capabilities: ['power', 'brightness', 'color'], state: { on: true, brightness: 72, color: { hue: 32, sat: 55 } } },
      { nativeId: 'kitchen', name: 'Kitchen Ceiling', capabilities: ['power', 'brightness', 'colorTemp'], state: { on: true, brightness: 100, mireds: 280 } },
      { nativeId: 'hall', name: 'Hallway', capabilities: ['power', 'brightness'], state: { on: false, brightness: 40 } },
    ]),
    tapo: createDemoAdapter('tapo', [
      { nativeId: 'desk-strip', name: 'Desk Light Strip', capabilities: ['power', 'brightness', 'color'], state: { on: true, brightness: 55, color: { hue: 265, sat: 80 } } },
      { nativeId: 'bedside', name: 'Bedside Bulb', capabilities: ['power', 'brightness', 'colorTemp'], state: { on: false, brightness: 30, mireds: 400 } },
    ]),
    nanoleaf: createDemoAdapter('nanoleaf', [
      { nativeId: 'panels', name: 'Wall Panels', capabilities: ['power', 'brightness', 'color'], state: { on: true, brightness: 85, color: { hue: 190, sat: 90 } } },
      { nativeId: 'garage', name: 'Garage Light', capabilities: ['power', 'brightness'], state: { online: false, error: 'Device unreachable' } },
    ]),
  };
}
