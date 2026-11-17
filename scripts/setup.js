#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig, saveConfig } from '../src/config.js';
import { discoverBridgeIp, tryPairBridge } from '../src/adapters/hue.js';
import { discoverNanoleafDevices, tryPairNanoleaf } from '../src/adapters/nanoleaf.js';

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question) {
  return (await rl.question(question)).trim();
}

async function confirm(question, defaultYes = true) {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await ask(`${question} ${suffix} `)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

async function setupHue(config) {
  console.log('\n=== Philips Hue ===');
  const hasExisting = Boolean(config.hue.bridgeIp && config.hue.applicationKey);
  if (hasExisting) {
    console.log(`Already configured: bridge at ${config.hue.bridgeIp}`);
    if (!(await confirm('Reconfigure Hue?', false))) return;
  } else if (!(await confirm('Set up Philips Hue?'))) {
    return;
  }

  let bridgeIp = config.hue.bridgeIp;
  console.log('Looking for your Hue Bridge...');
  const discovered = await discoverBridgeIp();
  if (discovered) {
    console.log(`Found bridge at ${discovered}`);
    if (await confirm('Use this bridge?')) {
      bridgeIp = discovered;
    }
  } else {
    console.log('Could not auto-discover a bridge.');
  }
  if (!bridgeIp) {
    bridgeIp = await ask('Enter your Hue Bridge IP address: ');
  }

  console.log('\nPress the physical link button on your Hue Bridge now.');
  await ask('Press Enter once you have pressed the button...');

  let applicationKey = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !applicationKey) {
    applicationKey = await tryPairBridge(bridgeIp);
    if (!applicationKey) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!applicationKey) {
    console.log('Pairing timed out. Run `npm run setup` again and press the link button right before continuing.');
    return;
  }

  config.hue = { bridgeIp, applicationKey };
  saveConfig(config);
  console.log('Hue paired successfully.');
}

async function pairOneNanoleaf(ip) {
  console.log('\nHold the power button on the device for 5-7 seconds until the LED flashes.');
  await ask('Press Enter once the LED is flashing...');

  let token = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !token) {
    token = await tryPairNanoleaf(ip);
    if (!token) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return token;
}

async function setupNanoleaf(config) {
  console.log('\n=== Nanoleaf ===');
  const existing = config.nanoleaf.devices;

  if (existing.length > 0) {
    console.log('Currently configured:');
    existing.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.ip})`));
    if (await confirm('Update the IP for one of these (e.g. it changed after a DHCP renewal)?', false)) {
      const idx = Number(await ask('Which number? ')) - 1;
      const device = existing[idx];
      if (device) {
        console.log('Scanning the network for Nanoleaf devices...');
        const found = await discoverNanoleafDevices();
        if (found.length > 0) {
          console.log('Found:');
          found.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.ip})`));
        }
        const choice = await ask('Select the new IP by number, or press Enter to type it manually: ');
        const foundIdx = Number(choice) - 1;
        device.ip = found[foundIdx] ? found[foundIdx].ip : await ask('New IP address: ');
        saveConfig(config);
        console.log(`Updated "${device.name}" to ${device.ip}.`);
      } else {
        console.log('No device with that number.');
      }
    }
  }

  if (!(await confirm('Add a new Nanoleaf device?', existing.length === 0))) return;

  let addMore = true;
  while (addMore) {
    console.log('Scanning the network for Nanoleaf devices...');
    const found = await discoverNanoleafDevices();
    let ip = null;
    if (found.length > 0) {
      console.log('Found:');
      found.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.ip})`));
      const choice = await ask('Select a number, or press Enter to type an IP manually: ');
      const idx = Number(choice) - 1;
      if (found[idx]) ip = found[idx].ip;
    } else {
      console.log('No devices found via network discovery.');
    }
    if (!ip) {
      ip = await ask('Enter the Nanoleaf device IP address: ');
    }

    const name = await ask('Name for this device (e.g. "Living Room Panels"): ');
    const id = slugify(name) || `nanoleaf-${Date.now()}`;

    const token = await pairOneNanoleaf(ip);
    if (!token) {
      console.log('Pairing timed out for this device. Skipping — you can retry by running setup again.');
    } else {
      const existingIndex = existing.findIndex((d) => d.id === id);
      const entry = { id, name, ip, token };
      if (existingIndex >= 0) existing[existingIndex] = entry;
      else existing.push(entry);
      saveConfig(config);
      console.log(`Paired "${name}".`);
    }

    addMore = await confirm('Add another Nanoleaf device?', false);
  }
}

async function setupTapo(config) {
  console.log('\n=== TP-Link Tapo ===');
  const hasAccount = Boolean(config.tapo.account.email && config.tapo.account.password);

  if (hasAccount) {
    console.log(`Account configured: ${config.tapo.account.email}`);
    if (await confirm('Update the Tapo account credentials?', false)) {
      config.tapo.account.email = await ask('TP-Link account email: ');
      config.tapo.account.password = await ask('TP-Link account password: ');
      saveConfig(config);
    }
  } else if (await confirm('Set up TP-Link Tapo?')) {
    config.tapo.account.email = await ask('TP-Link account email: ');
    config.tapo.account.password = await ask('TP-Link account password: ');
    saveConfig(config);
  } else {
    return;
  }

  const existing = config.tapo.devices;
  if (existing.length > 0) {
    console.log('Currently configured:');
    existing.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.ip}, ${d.model})`));
    if (await confirm('Update the IP for one of these (e.g. it changed)?', false)) {
      const idx = Number(await ask('Which number? ')) - 1;
      const device = existing[idx];
      if (device) {
        device.ip = await ask(`New IP address for "${device.name}": `);
        saveConfig(config);
        console.log('Updated.');
      } else {
        console.log('No device with that number.');
      }
    }
  }

  let addMore = await confirm('Add a new Tapo device?', existing.length === 0);
  while (addMore) {
    const name = await ask('Name for this device (e.g. "Living Room Strip"): ');
    const id = slugify(name) || `tapo-${Date.now()}`;
    const ip = await ask('Device IP address: ');
    const model = (await ask('Model (e.g. L530E, L900, P110) — press Enter if unsure: ')) || 'unknown';

    const existingIndex = existing.findIndex((d) => d.id === id);
    const entry = { id, name, ip, model };
    if (existingIndex >= 0) existing[existingIndex] = entry;
    else existing.push(entry);
    saveConfig(config);
    console.log(`Added "${name}".`);

    addMore = await confirm('Add another Tapo device?', false);
  }
}

async function main() {
  console.log('Smart Home Dashboard setup\n');
  const config = loadConfig();

  await setupHue(config);
  await setupNanoleaf(config);
  await setupTapo(config);

  rl.close();
  console.log('\nDone. Run `npm start` to launch the dashboard.');
}

main();
