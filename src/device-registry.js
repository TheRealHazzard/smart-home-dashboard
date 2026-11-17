import { loadConfig } from './config.js';
import { createHueAdapter } from './adapters/hue.js';
import { createNanoleafAdapter } from './adapters/nanoleaf.js';
import { createTapoAdapter } from './adapters/tapo.js';

const CACHE_MS = 2000;

let cache = { at: 0, devices: [] };

function buildAdapters() {
  const config = loadConfig();
  return {
    hue: createHueAdapter(config.hue),
    nanoleaf: createNanoleafAdapter(config.nanoleaf),
    tapo: createTapoAdapter(config.tapo),
  };
}

let adapters = buildAdapters();

/** Re-reads config/devices.json and rebuilds adapters (e.g. after `npm run setup`). */
export function reloadAdapters() {
  adapters = buildAdapters();
  invalidateCache();
}

function vendorOf(id) {
  return id.split(':')[0];
}

function nativeIdOf(id) {
  return id.slice(id.indexOf(':') + 1);
}

function adapterFor(id) {
  return adapters[vendorOf(id)];
}

function invalidateCache() {
  cache = { at: 0, devices: [] };
}

export async function listAllDevices() {
  const now = Date.now();
  if (now - cache.at < CACHE_MS) {
    return cache.devices;
  }
  const results = await Promise.allSettled(
    Object.values(adapters).map((adapter) => adapter.listDevices())
  );
  const devices = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);
  cache = { at: now, devices };
  return devices;
}

export async function getDevice(id) {
  const devices = await listAllDevices();
  return devices.find((d) => d.id === id) ?? null;
}

export async function setPower(id, on) {
  const adapter = adapterFor(id);
  if (!adapter) return { online: false, error: 'unknown device' };
  const state = await adapter.setPower(nativeIdOf(id), on);
  invalidateCache();
  return state;
}

export async function setBrightness(id, pct) {
  const adapter = adapterFor(id);
  if (!adapter) return { online: false, error: 'unknown device' };
  const state = await adapter.setBrightness(nativeIdOf(id), pct);
  invalidateCache();
  return state;
}

export async function setColor(id, color) {
  const adapter = adapterFor(id);
  if (!adapter) return { online: false, error: 'unknown device' };
  const state = await adapter.setColor(nativeIdOf(id), color);
  invalidateCache();
  return state;
}
