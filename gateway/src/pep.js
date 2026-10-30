// Policy Enforcement Point (PEP): verifikasi token -> minta keputusan ke Policy Engine -> audit log -> teruskan/tolak.
const { verifyToken, describeTokenError } = require('../../shared/jwt');
const { decide } = require('./policy');
const audit = require('./audit');

async function pep(req, res, next) {
  try {
    const method = req.method;
    const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
    const deviceId = req.get('X-Device-ID') || null;
    const base = { method, endpoint: req.originalUrl.split('?')[0], device: deviceId, ip: req.ip };

    const finish = async (subjek, role, result) => {
      const id = await audit.logDecision({
        ...base, subjek, role, allow: result.allow, alasan: result.reason, statusCode: result.allow ? null : result.status,
      });
      if (result.allow) {
        res.on('finish', () => audit.updateStatus(id, res.statusCode).catch(() => {}));
        return next();
      }
      return res.status(result.status).json({ error: 'DENY', message: result.reason });
    };

    const header = req.get('Authorization') || '';
    if (!header.startsWith('Bearer ')) {
      return await finish('anonim', null, { allow: false, status: 401, reason: 'Access token tidak ada' });
    }

    let claims;
    try {
      claims = verifyToken(header.slice(7));
    } catch (err) {
      return await finish('anonim', null, { allow: false, status: 401, reason: `${describeTokenError(err)} (access token)` });
    }

    const subject = claims.role === 'service'
      ? { type: 'service', id: claims.sub, role: 'service' }
      : { type: 'user', id: Number(claims.sub), role: claims.role };
    const label = subject.type === 'service' ? `service:${claims.sub}` : (claims.username || `user:${claims.sub}`);

    const result = await decide({ subject, deviceId, method, path, req });
    req.subject = { ...subject, label };
    return await finish(label, claims.role, result);
  } catch (err) {
    return next(err);
  }
}

module.exports = pep;
