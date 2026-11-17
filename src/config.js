import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'devices.json');

const EMPTY_CONFIG = {
  hue: { bridgeIp: '', applicationKey: '' },
  tapo: { account: { email: '', password: '' }, devices: [] },
  nanoleaf: { devices: [] },
};

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return structuredClone(EMPTY_CONFIG);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    hue: { ...EMPTY_CONFIG.hue, ...raw.hue },
    tapo: {
      account: { ...EMPTY_CONFIG.tapo.account, ...raw.tapo?.account },
      devices: raw.tapo?.devices ?? [],
    },
    nanoleaf: { devices: raw.nanoleaf?.devices ?? [] },
  };
}

export function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
