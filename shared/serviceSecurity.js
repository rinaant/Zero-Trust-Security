// Pemeriksaan keamanan yang dijalankan MANDIRI oleh setiap service (Service Nilai & Transkrip),
// terlepas dari keputusan gateway. Ini adalah penerapan "assume breach" / double verification.
const crypto = require('crypto');
const config = require('./config');
const { verifyToken, describeTokenError } = require('./jwt');

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();

// 1) Direct access blocked: tolak request tanpa X-Gateway-Secret yang valid.
function requireGatewaySecret(req, res, next) {
  const given = req.get('X-Gateway-Secret') || '';
  const ok = crypto.timingSafeEqual(sha(given), sha(config.gatewaySecret));
  if (!ok) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Akses langsung ke service ditolak: X-Gateway-Secret tidak ada atau tidak valid.',
    });
  }
  next();
}

// 2) Verifikasi ulang tanda tangan & masa berlaku token (access token atau token service).
function requireToken(req, res, next) {
  const header = req.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token tidak ada.' });
  }
  try {
    const claims = verifyToken(header.slice(7));
    req.auth = { sub: claims.sub, role: claims.role, typ: claims.typ };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: `${describeTokenError(err)} (diverifikasi ulang oleh service).` });
  }
}

// 3) Pembatasan role di level service.
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Role '${req.auth.role}' tidak diizinkan pada endpoint ini (diperiksa service).`,
      });
    }
    next();
  };
}

module.exports = { requireGatewaySecret, requireToken, allowRoles };
