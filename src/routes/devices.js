import { Router } from 'express';
import {
  listAllDevices,
  getDevice,
  setPower,
  setBrightness,
  setColor,
} from '../device-registry.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await listAllDevices());
});

router.get('/:id', async (req, res) => {
  const device = await getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'device not found' });
  res.json(device);
});

router.post('/:id/power', async (req, res) => {
  const state = await setPower(req.params.id, Boolean(req.body.on));
  res.json({ id: req.params.id, state });
});

router.post('/:id/brightness', async (req, res) => {
  const brightness = Math.min(100, Math.max(0, Number(req.body.brightness)));
  const state = await setBrightness(req.params.id, brightness);
  res.json({ id: req.params.id, state });
});

router.post('/:id/color', async (req, res) => {
  const { hue, sat, mireds } = req.body;
  const state = await setColor(req.params.id, { hue, sat, mireds });
  res.json({ id: req.params.id, state });
});

export default router;
