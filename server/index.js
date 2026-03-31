const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

// 1. Setup Firebase Admin
// Make sure to add your service account key in firebase-key.json
try {
  const serviceAccount = require('./firebase-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.log('Firebase Admin Error: Ensure firebase-key.json exists.');
}

const app = express();
app.use(cors());
app.use(express.json());

// 2. Auth Middleware
async function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send('No token provided');

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).send('Invalid token');
  }
}

// 3. Proxy Route
app.get('/proxy', auth, async (req, res) => {
  const url = req.query.url;
  
  // Security Checks
  if (!url || url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168')) {
    return res.status(400).send('Invalid or blocked URL');
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer', // support binary as well
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) proxy' }
    });
    
    // Copy content-type
    res.set('Content-Type', response.headers['content-type']);
    res.send(response.data);
  } catch (error) {
    res.status(500).send('Error fetching URL: ' + error.message);
  }
});

// 4. Download Route
app.get('/download', auth, async (req, res) => {
  const url = req.query.url;
  
  if (!url) return res.status(400).send('No URL provided');

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) proxy' }
    });

    res.setHeader('Content-Disposition', 'attachment');
    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Error downloading URL: ' + error.message);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
});
