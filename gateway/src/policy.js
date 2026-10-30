// Policy Engine (PE): memutuskan allow/deny berdasarkan kebijakan (Tabel 3) + atribut dari database.
// Default: DENY. Setiap keputusan mengembalikan { allow, status, reason }.
const config = require('../../shared/config');
const { db } = require('./audit');

const allow = (reason) => ({ allow: true, status: 200, reason });
const deny = (reason, status = 403) => ({ allow: false, status, reason });

// Atribut yang dibaca dari database.
const q = {
  user: (id) => db.get('SELECT id, username, role, nim FROM users WHERE id = ?', [id]),
  device: (userId, deviceId) => db.get('SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ?', [userId, deviceId]),
  kelas: (id) => db.get('SELECT id, dosen_id, nama_kelas FROM kelas WHERE id = ?', [id]),
  nilai: (id) => db.get(
    'SELECT n.id, n.final, n.kelas_id, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?', [id]),
  nilaiByKelasNim: (kelasId, nim) => db.get(
    'SELECT n.final FROM nilai n JOIN users u ON u.id = n.mahasiswa_id WHERE n.kelas_id = ? AND u.nim = ?', [kelasId, nim]),
};

// ---------- Konteks: jam akses ----------
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

function currentTime(req) {
  // X-Demo-Time hanya dihormati saat DEMO_MODE=true (untuk simulasi di video demo).
  const demo = req.get('X-Demo-Time');
  if (config.demoMode && demo && /^([01]\d|2[0-3]):[0-5]\d$/.test(demo)) {
    return { label: demo, minutes: toMinutes(demo), simulated: true };
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.accessHours.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour').value.replace('24', '00');
  const m = parts.find((p) => p.type === 'minute').value;
  return { label: `${h}:${m}`, minutes: toMinutes(`${h}:${m}`), simulated: false };
}

function checkAccessHours(req) {
  const { start, end } = config.accessHours;
  const t = currentTime(req);
  const ok = t.minutes >= toMinutes(start) && t.minutes < toMinutes(end);
  return {
    ok,
    reason: `Di luar jam akses ${start}-${end} (waktu ${t.simulated ? 'simulasi' : 'saat ini'}: ${t.label})`,
  };
}

// ---------- Tabel kebijakan ----------
const rules = [
  {
    method: 'GET', pattern: /^\/nilai$/, roles: ['mahasiswa', 'dosen'],
    check: async ({ user, req }) => {
      if (user.role === 'dosen' && req.query.kelas_id) {
        const kelas = await q.kelas(Number(req.query.kelas_id));
        if (!kelas) return deny('Kelas tidak ditemukan', 404);
        if (kelas.dosen_id !== user.id) return deny('Dosen hanya boleh melihat nilai kelas yang diampu');
      }
      return allow(user.role === 'mahasiswa' ? 'Mahasiswa melihat nilai miliknya' : 'Dosen melihat nilai kelas yang diampu');
    },
  },
  {
    method: 'GET', pattern: /^\/kelas$/, roles: ['dosen'],
    check: async () => allow('Dosen melihat daftar kelas yang diampu'),
  },
  {
    method: 'PUT', pattern: /^\/nilai\/(\d+)$/, roles: ['dosen'],
    check: async ({ user, match, req }) => {
      const nilai = await q.nilai(Number(match[1]));
      if (!nilai) return deny('Data nilai tidak ditemukan', 404);
      if (nilai.dosen_id !== user.id) return deny('Dosen tidak mengampu kelas dari nilai ini');
      if (nilai.final) return deny('Nilai sudah difinalisasi dan tidak dapat diubah');
      const jam = checkAccessHours(req);
      if (!jam.ok) return deny(jam.reason);
      return allow('Dosen mengubah nilai pada kelas yang diampu, nilai belum final, dalam jam akses');
    },
  },
  {
    method: 'POST', pattern: /^\/nilai$/, roles: ['dosen'],
    check: async ({ user, req }) => {
      const { kelas_id: kelasId, nim } = req.body || {};
      const kelas = await q.kelas(Number(kelasId));
      if (!kelas) return deny('Kelas tidak ditemukan', 404);
      if (kelas.dosen_id !== user.id) return deny('Dosen tidak mengampu kelas ini');
      const existing = await q.nilaiByKelasNim(kelas.id, String(nim));
      if (existing && existing.final) return deny('Nilai sudah difinalisasi dan tidak dapat diubah');
      const jam = checkAccessHours(req);
      if (!jam.ok) return deny(jam.reason);
      return allow('Dosen menginput nilai pada kelas yang diampu dalam jam akses');
    },
  },
  {
    method: 'POST', pattern: /^\/kelas\/(\d+)\/finalisasi$/, roles: ['dosen'],
    check: async ({ user, match, req }) => {
      const kelas = await q.kelas(Number(match[1]));
      if (!kelas) return deny('Kelas tidak ditemukan', 404);
      if (kelas.dosen_id !== user.id) return deny('Dosen tidak mengampu kelas ini');
      const jam = checkAccessHours(req);
      if (!jam.ok) return deny(jam.reason);
      return allow('Dosen memfinalisasi kelas yang diampu dalam jam akses');
    },
  },
  {
    method: 'GET', pattern: /^\/transkrip$/, roles: ['admin'],
    check: async () => allow('Admin melihat daftar transkrip seluruh mahasiswa'),
  },
  {
    method: 'GET', pattern: /^\/transkrip\/([^/]+)$/, roles: ['mahasiswa', 'admin'],
    check: async ({ user, match }) => {
      if (user.role === 'admin') return allow('Admin melihat transkrip seluruh mahasiswa');
      if (user.nim !== decodeURIComponent(match[1])) return deny('Mahasiswa hanya boleh melihat transkrip dengan NIM sendiri');
      return allow('Mahasiswa melihat transkrip miliknya');
    },
  },
  {
    method: 'GET', pattern: /^\/audit$/, roles: ['admin'],
    check: async () => allow('Admin melihat audit log'),
  },
  {
    method: 'GET', pattern: /^\/demo\/probe$/, roles: ['mahasiswa', 'dosen', 'admin'],
    check: async () => (config.demoMode ? allow('Probe keamanan (DEMO_MODE)') : deny('Endpoint demo dinonaktifkan', 404)),
  },
];

// ---------- Keputusan utama ----------
// subject: { type: 'user'|'service', id, role }, deviceId: string|null
async function decide({ subject, deviceId, method, path, req }) {
  // Service token: hanya boleh POST /transkrip/sinkron.
  if (subject.type === 'service') {
    if (method === 'POST' && path === '/transkrip/sinkron') return allow('Token service valid untuk sinkron transkrip');
    return deny('Token service hanya boleh digunakan untuk POST /transkrip/sinkron');
  }

  // Endpoint khusus service: token user mana pun ditolak.
  if (method === 'POST' && path === '/transkrip/sinkron') {
    return deny('Endpoint sinkron hanya untuk token service; token user ditolak');
  }

  const user = await q.user(subject.id);
  if (!user) return deny('Subjek tidak ditemukan', 401);
  if (user.role !== subject.role) return deny('Role pada token tidak sesuai dengan data user');

  // Verifikasi konteks: device terdaftar.
  if (!deviceId) return deny('Header X-Device-ID tidak ada');
  if (!(await q.device(user.id, deviceId))) return deny('Device tidak terdaftar untuk user ini');

  let rule = null;
  let match = null;
  for (const r of rules) {
    if (r.method !== method) continue;
    const m = path.match(r.pattern);
    if (m) { rule = r; match = m; break; }
  }
  if (!rule) return deny('Tidak ada kebijakan untuk endpoint ini (default deny)', 404);
  if (!rule.roles.includes(user.role)) return deny(`Role '${user.role}' tidak diizinkan mengakses endpoint ini`);

  return rule.check({ user, match, req });
}

module.exports = { decide, checkAccessHours };
