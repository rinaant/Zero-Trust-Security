const { getDb } = require('../../database/db');
const db = getDb();

// Mencatat setiap keputusan akses: waktu, subjek, endpoint, device, hasil, alasan.
async function logDecision({ subjek, role = null, method, endpoint, device = null, allow, alasan, statusCode = null, ip = null }) {
  const r = await db.run(
    `INSERT INTO audit_logs (waktu, subjek, role, method, endpoint, device, hasil, alasan, status_code, ip)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [new Date().toISOString(), subjek || 'anonim', role, method, endpoint, device, allow ? 'ALLOW' : 'DENY', alasan, statusCode, ip],
  );
  return r.lastID;
}

function updateStatus(id, status) {
  return db.run('UPDATE audit_logs SET status_code = ? WHERE id = ?', [status, id]);
}

function list({ limit = 100, hasil } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  if (hasil === 'ALLOW' || hasil === 'DENY') {
    return db.all('SELECT * FROM audit_logs WHERE hasil = ? ORDER BY id DESC LIMIT ?', [hasil, lim]);
  }
  return db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [lim]);
}

module.exports = { logDecision, updateStatus, list, db };
