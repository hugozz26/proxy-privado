const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const { createServer } = require('node:http');
const { createBareServer } = require('@tomphttp/bare-server-node');

// 1. Setup Firebase Admin
try {
  const serviceAccount = require('./firebase-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.log('Firebase Admin Error: Ensure firebase-key.json exists.');
}

const bareServer = createBareServer('/bare/', {
    maintainer: {
      email: 'admin@localhost',
      website: 'http://localhost'
    },
    // Fix: Allow infinite socket loops/connections (default is a limit that blocks heavy resources like YouTube)
    logErrors: false,
    localAddress: undefined,
    connectionLimiter: { maxConnectionsPerIP: 99999 }
});
const app = express();

app.use(cors({ origin: '*' }));

// Auth
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/download', async (req, res) => {
  let url = req.query.url;
  // TODO: Add proper auth block here if required
  if (url && !url.startsWith('http')) url = 'https://' + url;
  if (!url) return res.status(400).send('No URL');
  try {
    const response = await axios({url, method:'GET', responseType:'stream', headers:{'User-Agent':'proxy'}});
    let fileName = 'downloaded_file';
    const cd = response.headers['content-disposition'];
    if (cd && cd.includes('filename=')) fileName = cd.split('filename=')[1].replace(/"/g, '');
    else { const p = new URL(url).pathname.split('/').pop(); if (p) fileName = p; }
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.data.pipe(res);
  } catch (error) { res.status(500).send('Error'); }
});

// Pass requests to bare server
app.use((req, res, next) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
    } else {
        next();
    }
});

const httpServer = createServer(app);

httpServer.on('upgrade', (req, socket, head) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
    } else {
        socket.end();
    }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Ultraviolet Bare server running on http://localhost:${PORT}`);
});





