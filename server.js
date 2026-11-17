import os from 'node:os';
import express from 'express';
import devicesRouter from './src/routes/devices.js';

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/api/devices', devicesRouter);

app.listen(PORT, '0.0.0.0', () => {
  const urls = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => `http://${iface.address}:${PORT}`);

  console.log(`Smart home dashboard listening on port ${PORT}`);
  if (urls.length === 0) {
    console.log('No LAN-reachable IPv4 address found.');
  } else {
    console.log('Open one of these on any device on your network:');
    urls.forEach((url) => console.log(`  ${url}`));
  }
});
