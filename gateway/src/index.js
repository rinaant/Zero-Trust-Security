const express = require('express');
const cors = require('cors');
const config = require('../../shared/config');
const authRoutes = require('./auth');
const pep = require('./pep');
const asyncHandler = require('../../shared/asyncHandler');
const audit = require('./audit');
const { forward } = require('./proxy');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

app.use(cors({
  origin: config.corsOrigins,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Device-ID', 'X-Demo-Time'],
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
}));
app.use(express.json({ limit: '100kb' }));

// Endpoint autentikasi (ditangani gateway sendiri, tanpa access token).
app.use('/auth', authRoutes);

// Semua route lain wajib melewati PEP.
app.use(pep);

// Endpoint yang ditangani gateway.
app.get('/audit', asyncHandler(async (req, res) => {
  res.json({ data: await audit.list({ limit: req.query.limit, hasil: req.query.hasil }) });
}));

app.get('/demo/probe', async (req, res) => {
  const secret = config.gatewaySecret;
  const userAuth = req.get('Authorization');
  const call = async (label, expected, url, opts = {}) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000), ...opts });
      return { test: label, expected, actual: r.status, pass: r.status === expected };
    } catch (e) {
      return { test: label, expected, actual: 'tidak terhubung', pass: false };
    }
  };
  const results = await Promise.all([
    call('Service Nilai langsung, tanpa X-Gateway-Secret', 403, `${config.urls.nilai}/nilai`),
    call('Service Nilai langsung, secret salah', 403, `${config.urls.nilai}/nilai`, { headers: { 'X-Gateway-Secret': 'salah' } }),
    call('Service Transkrip langsung, tanpa X-Gateway-Secret', 403, `${config.urls.transkrip}/transkrip/2021001`),
    call('Secret benar tetapi tanpa token', 401, `${config.urls.nilai}/nilai`, { headers: { 'X-Gateway-Secret': secret } }),
    call('Secret benar tetapi token palsu', 401, `${config.urls.transkrip}/transkrip/2021001`, { headers: { 'X-Gateway-Secret': secret, Authorization: 'Bearer token.palsu.sekali' } }),
    call('Sinkron dengan token user (bukan service)', 403, `${config.urls.transkrip}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'X-Gateway-Secret': secret, Authorization: userAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    }),
  ]);
  res.json({ data: results });
});

app.use(forward);

// Penanganan error (mis. JSON tidak valid).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Body JSON tidak valid' });
  }
  console.error(err);
  res.status(500).json({ error: 'INTERNAL', message: 'Terjadi kesalahan pada gateway' });
});

app.listen(config.ports.gateway, () => {
  console.log(`[gateway] PEP/PE/PA berjalan di http://localhost:${config.ports.gateway}`);
  console.log(`[gateway] jam akses ${config.accessHours.start}-${config.accessHours.end} (${config.accessHours.timezone}), demo mode: ${config.demoMode}`);
});
