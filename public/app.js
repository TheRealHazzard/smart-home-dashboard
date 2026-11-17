const POLL_MS = 7000;
const VENDOR_LABEL = { hue: 'Hue', tapo: 'Tapo', nanoleaf: 'Nanoleaf' };

let devices = [];
const cardsById = new Map();

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

async function fetchDevices() {
  try {
    const res = await fetch('/api/devices');
    devices = await res.json();
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setStatus('Could not reach dashboard server');
    return;
  }
  render();
}

function render() {
  const container = document.getElementById('devices');

  if (devices.length === 0) {
    container.innerHTML = '<p class="empty-state">No devices configured yet. Run "npm run setup" on the server, then reload this page.</p>';
    cardsById.clear();
    return;
  }
  if (container.querySelector('.empty-state')) container.innerHTML = '';

  const seen = new Set();
  for (const device of devices) {
    seen.add(device.id);
    let card = cardsById.get(device.id);
    if (!card) {
      card = buildCard(device);
      cardsById.set(device.id, card);
      container.appendChild(card.el);
    }
    updateCard(card, device);
  }
  for (const [id, card] of cardsById) {
    if (!seen.has(id)) {
      card.el.remove();
      cardsById.delete(id);
    }
  }
}

function buildCard(device) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.deviceId = device.id;

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement('div');
  title.className = 'card-title';
  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  const badgeEl = document.createElement('div');
  badgeEl.className = 'badge';
  title.append(nameEl, badgeEl);

  const offlineBadge = document.createElement('span');
  offlineBadge.className = 'offline-badge';
  offlineBadge.textContent = 'Offline';
  offlineBadge.hidden = true;

  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  const powerInput = document.createElement('input');
  powerInput.type = 'checkbox';
  const sliderSpan = document.createElement('span');
  sliderSpan.className = 'slider-toggle';
  switchLabel.append(powerInput, sliderSpan);

  header.append(title, offlineBadge, switchLabel);
  el.appendChild(header);

  let brightnessInput = null;
  if (device.capabilities.includes('brightness')) {
    const row = document.createElement('div');
    row.className = 'control-row';
    const label = document.createElement('label');
    label.textContent = 'Brightness';
    brightnessInput = document.createElement('input');
    brightnessInput.type = 'range';
    brightnessInput.min = '1';
    brightnessInput.max = '100';
    row.append(label, brightnessInput);
    el.appendChild(row);
  }

  let colorInput = null;
  if (device.capabilities.includes('color')) {
    const row = document.createElement('div');
    row.className = 'control-row';
    const label = document.createElement('label');
    label.textContent = 'Color';
    colorInput = document.createElement('input');
    colorInput.type = 'color';
    row.append(label, colorInput);
    el.appendChild(row);
  }

  const card = { el, nameEl, badgeEl, offlineBadge, powerInput, brightnessInput, colorInput };

  powerInput.addEventListener('change', () => {
    postAction(device.id, 'power', { on: powerInput.checked }, card);
  });
  brightnessInput?.addEventListener('change', () => {
    postAction(device.id, 'brightness', { brightness: Number(brightnessInput.value) }, card);
  });
  colorInput?.addEventListener('change', () => {
    const { hue, sat } = hexToHueSat(colorInput.value);
    postAction(device.id, 'color', { hue, sat }, card);
  });

  return card;
}

function updateCard(card, device) {
  card.nameEl.textContent = device.name;
  card.badgeEl.textContent = VENDOR_LABEL[device.vendor] ?? device.vendor;

  const online = device.state.online !== false;
  card.el.classList.toggle('offline', !online);
  card.offlineBadge.hidden = online;

  card.powerInput.disabled = !online;
  if (document.activeElement !== card.powerInput) {
    card.powerInput.checked = Boolean(device.state.on);
  }

  if (card.brightnessInput) {
    card.brightnessInput.disabled = !online;
    if (document.activeElement !== card.brightnessInput && typeof device.state.brightness === 'number') {
      card.brightnessInput.value = String(device.state.brightness);
    }
  }

  if (card.colorInput) {
    card.colorInput.disabled = !online;
    if (document.activeElement !== card.colorInput && device.state.color) {
      card.colorInput.value = hueSatToHex(device.state.color.hue, device.state.color.sat);
    }
  }
}

async function postAction(id, action, body, card) {
  try {
    const res = await fetch(`/api/devices/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const device = devices.find((d) => d.id === id);
    if (device) {
      device.state = data.state;
      updateCard(card, device);
    }
  } catch (err) {
    setStatus('Action failed — will retry on next refresh');
  }
}

// --- HSV <-> hex helpers (mirrors src/adapters/color-utils.js server-side logic,
// duplicated here since the browser and server run as separate module contexts) ---

function hsvToRgb(hue, sat) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, sat / 100));
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = 1 - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  const sat = max === 0 ? 0 : delta / max;
  return { hue: h, sat: sat * 100 };
}

function hueSatToHex(hue, sat) {
  const { r, g, b } = hsvToRgb(hue, sat);
  const toByte = (c) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function hexToHueSat(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgbToHsv(r, g, b);
}

fetchDevices();
setInterval(fetchDevices, POLL_MS);
