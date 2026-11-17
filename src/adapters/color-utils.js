// Shared HSV <-> RGB <-> CIE xy conversions so every adapter can convert
// between the dashboard's wire format (hue 0-360, sat 0-100) and its own
// vendor's native color space. xy formulas follow Philips Hue's published
// conversion (https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/).

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

export function hsvToRgb(hue, sat) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp01(sat / 100);
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
  return { r: clamp01(r + m), g: clamp01(g + m), b: clamp01(b + m) };
}

export function rgbToHsv(r, g, b) {
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

function gammaCorrect(c) {
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function reverseGamma(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToXy(r, g, b) {
  const rc = gammaCorrect(r);
  const gc = gammaCorrect(g);
  const bc = gammaCorrect(b);
  const X = rc * 0.664511 + gc * 0.154324 + bc * 0.162028;
  const Y = rc * 0.283881 + gc * 0.668433 + bc * 0.047685;
  const Z = rc * 0.000088 + gc * 0.07231 + bc * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) return { x: 0, y: 0 };
  return { x: X / sum, y: Y / sum };
}

export function xyToRgb(x, y) {
  const z = 1 - x - y;
  const Y = 1;
  const X = y === 0 ? 0 : (Y / y) * x;
  const Z = y === 0 ? 0 : (Y / y) * z;
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  r = reverseGamma(r);
  g = reverseGamma(g);
  b = reverseGamma(b);
  const max = Math.max(r, g, b, 1e-9);
  if (max > 1) {
    r /= max;
    g /= max;
    b /= max;
  }
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

export function hueSatToXy(hue, sat) {
  const { r, g, b } = hsvToRgb(hue, sat);
  return rgbToXy(r, g, b);
}

export function xyToHueSat({ x, y }) {
  const { r, g, b } = xyToRgb(x, y);
  const { hue, sat } = rgbToHsv(r, g, b);
  return { hue, sat };
}

export function hueSatToHex(hue, sat) {
  const { r, g, b } = hsvToRgb(hue, sat);
  const toByte = (c) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function hexToHueSat(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgbToHsv(r, g, b);
}
