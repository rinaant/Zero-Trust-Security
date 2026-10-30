// Policy Administrator (PA): login, penerbitan & pencabutan token. Semua keputusan dicatat ke audit log.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../../shared/config');
const asyncHandler = require('../../shared/asyncHandler');
const { signAccessToken, signServiceToken } = require('../../shared/jwt');
const audit = require('./audit');

const router = express.Router();
const db = audit.db;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10); // menyamakan waktu respons saat user tidak ada

const q = {
  userByName: (name) => db.get('SELECT * FROM users WHERE username = ?', [name]),
  userById: (id) => db.get('SELECT * FROM users WHERE id = ?', [id]),
  device: (userId, deviceId) => db.get('SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ?', [userId, deviceId]),
  insRefresh: (userId, hash, deviceId, expires) => db.run(
    'INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at, revoked, created_at) VALUES (?,?,?,?,0,?)',
    [userId, hash, deviceId, expires, new Date().toISOString()]),
  refresh: (hash) => db.get('SELECT * FROM refresh_tokens WHERE token_hash = ?', [hash]),
  revoke: (id) => db.run('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [id]),
  client: (clientId) => db.get('SELECT * FROM service_clients WHERE client_id = ?', [clientId]),
};

async function reply(req, res, status, body, { subjek, role, allow, alasan }) {
  await audit.logDecision({
    subjek, role, method: req.method, endpoint: req.originalUrl.split('?')[0],
    device: req.get('X-Device-ID') || null, allow, alasan, statusCode: status, ip: req.ip,
  });
  return res.status(status).json(body);
}

async function issueSession(user, deviceId) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await q.insRefresh(user.id, sha256(refreshToken), deviceId, Date.now() + config.refreshTokenTtlMs);
  return {
    token_type: 'Bearer',
    access_token: signAccessToken(user),
    expires_in: 600,
    refresh_token: refreshToken,
    user: { id: user.id, username: user.username, nama: user.nama, role: user.role, nim: user.nim },
  };
}

// POST /auth/login  -> kredensial valid + device terdaftar
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = req.get('X-Device-ID');
  const who = typeof username === 'string' ? username : 'anonim';

  if (typeof username !== 'string' || typeof password !== 'string') {
    return reply(req, res, 400, { error: 'BAD_REQUEST', message: 'username dan password wajib diisi' },
      { subjek: who, allow: false, alasan: 'Body login tidak lengkap' });
  }
  const user = await q.userByName(username);
  const valid = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH) && Boolean(user);
  if (!valid) {
    return reply(req, res, 401, { error: 'UNAUTHORIZED', message: 'Username atau password salah' },
      { subjek: who, allow: false, alasan: 'Kredensial tidak valid' });
  }
  if (!deviceId) {
    return reply(req, res, 403, { error: 'DENY', message: 'Header X-Device-ID tidak ada' },
      { subjek: who, role: user.role, allow: false, alasan: 'Header X-Device-ID tidak ada' });
  }
  if (!(await q.device(user.id, deviceId))) {
    return reply(req, res, 403, { error: 'DENY', message: 'Device tidak terdaftar untuk user ini' },
      { subjek: who, role: user.role, allow: false, alasan: 'Device tidak terdaftar untuk user ini' });
  }
  const session = await issueSession(user, deviceId);
  return reply(req, res, 200, session,
    { subjek: who, role: user.role, allow: true, alasan: 'Kredensial valid dan device terdaftar' });
}));

// POST /auth/refresh -> refresh token valid, belum dicabut; dirotasi setiap pemakaian
router.post('/refresh', asyncHandler(async (req, res) => {
  const token = (req.body || {}).refresh_token;
  const deviceId = req.get('X-Device-ID');
  const row = typeof token === 'string' ? await q.refresh(sha256(token)) : null;
  const info = (extra) => ({ subjek: row ? `user:${row.user_id}` : 'anonim', ...extra });

  if (!row) return reply(req, res, 401, { error: 'UNAUTHORIZED', message: 'Refresh token tidak valid' }, info({ allow: false, alasan: 'Refresh token tidak dikenal' }));
  if (row.revoked) return reply(req, res, 401, { error: 'UNAUTHORIZED', message: 'Refresh token sudah dicabut' }, info({ allow: false, alasan: 'Refresh token sudah dicabut' }));
  if (row.expires_at < Date.now()) return reply(req, res, 401, { error: 'UNAUTHORIZED', message: 'Refresh token kedaluwarsa' }, info({ allow: false, alasan: 'Refresh token kedaluwarsa' }));
  if (row.device_id !== deviceId || !(await q.device(row.user_id, deviceId || ''))) {
    return reply(req, res, 403, { error: 'DENY', message: 'Device tidak sesuai dengan sesi' }, info({ allow: false, alasan: 'Device tidak sesuai dengan refresh token' }));
  }
  const user = await q.userById(row.user_id);
  await q.revoke(row.id); // rotasi: token lama langsung tidak berlaku
  return reply(req, res, 200, await issueSession(user, deviceId),
    { subjek: user.username, role: user.role, allow: true, alasan: 'Refresh token valid, token baru diterbitkan' });
}));

// POST /auth/logout -> mencabut refresh token
router.post('/logout', asyncHandler(async (req, res) => {
  const token = (req.body || {}).refresh_token;
  const row = typeof token === 'string' ? await q.refresh(sha256(token)) : null;
  if (!row || row.revoked || row.expires_at < Date.now()) {
    return reply(req, res, 401, { error: 'UNAUTHORIZED', message: 'Refresh token tidak valid atau sudah dicabut' },
      { subjek: row ? `user:${row.user_id}` : 'anonim', allow: false, alasan: 'Logout dengan refresh token tidak valid' });
  }
  await q.revoke(row.id);
  const user = await q.userById(row.user_id);
  return reply(req, res, 200, { message: 'Logout berhasil, refresh token dicabut' },
    { subjek: user.username, role: user.role, allow: true, alasan: 'Refresh token dicabut' });
}));

// POST /auth/service -> token service (5 menit) untuk Service Nilai
router.post('/service', asyncHandler(async (req, res) => {
  const { client_id: clientId, client_secret: clientSecret } = req.body || {};
  const client = typeof clientId === 'string' ? await q.client(clientId) : null;
  const valid = bcrypt.compareSync(String(clientSecret || ''), client ? client.secret_hash : DUMMY_HASH) && Boolean(client);
  if (!valid) {
    return reply(req, res, 401, { error: 'UNAUTHORIZED', message: 'Client ID atau secret tidak valid' },
      { subjek: String(clientId || 'anonim'), role: 'service', allow: false, alasan: 'Kredensial service tidak valid' });
  }
  return reply(req, res, 200, { token_type: 'Bearer', access_token: signServiceToken(client.client_id), expires_in: 300 },
    { subjek: client.client_id, role: 'service', allow: true, alasan: 'Kredensial service valid, token service diterbitkan' });
}));

module.exports = router;
