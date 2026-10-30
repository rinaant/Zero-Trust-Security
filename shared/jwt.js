const jwt = require('jsonwebtoken');
const config = require('./config');

const BASE = { issuer: config.jwtIssuer, algorithm: 'HS256' };

// Access token user: berlaku 10 menit, berisi sub dan role.
function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, username: user.username, typ: 'access' },
    config.jwtSecret,
    { ...BASE, expiresIn: config.accessTokenTtl }
  );
}

// Token service: berlaku 5 menit, role: service.
function signServiceToken(clientId) {
  return jwt.sign(
    { sub: clientId, role: 'service', typ: 'service' },
    config.jwtSecret,
    { ...BASE, expiresIn: config.serviceTokenTtl }
  );
}

// Verifikasi tanda tangan, issuer, dan masa berlaku. Melempar error jika tidak valid.
function verifyToken(token) {
  const claims = jwt.verify(token, config.jwtSecret, {
    issuer: config.jwtIssuer,
    algorithms: ['HS256'],
  });
  const consistent =
    (claims.typ === 'access' && ['mahasiswa', 'dosen', 'admin'].includes(claims.role)) ||
    (claims.typ === 'service' && claims.role === 'service');
  if (!consistent) {
    const err = new Error('Klaim token tidak konsisten');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return claims;
}

function describeTokenError(err) {
  return err && err.name === 'TokenExpiredError'
    ? 'Token kedaluwarsa'
    : 'Token tidak valid';
}

module.exports = { signAccessToken, signServiceToken, verifyToken, describeTokenError };
