const express = require('express');
const config = require('../../shared/config');
const { getDb } = require('../../database/db');
const { hitungIpk } = require('../../shared/grade');
const asyncHandler = require('../../shared/asyncHandler');
const { requireGatewaySecret, requireToken, allowRoles } = require('../../shared/serviceSecurity');

const db = getDb();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '500kb' }));

// Lapisan keamanan service: (1) gateway secret, (2) verifikasi ulang JWT / token service.
app.use(requireGatewaySecret);
app.use(requireToken);

const UPSERT = `
  INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, sks, nilai_angka, nilai_huruf, synced_at)
  VALUES (?,?,?,?,?,?,?,?)
  ON CONFLICT (nim, kode_mk) DO UPDATE SET
    kelas_id = excluded.kelas_id, nama_mk = excluded.nama_mk, sks = excluded.sks,
    nilai_angka = excluded.nilai_angka, nilai_huruf = excluded.nilai_huruf, synced_at = excluded.synced_at`;

const q = {
  mhsByNim: (nim) => db.get("SELECT id, nim, nama FROM users WHERE nim = ? AND role = 'mahasiswa'", [nim]),
  mhsById: (id) => db.get('SELECT id, nim, nama FROM users WHERE id = ?', [id]),
  items: (nim) => db.all('SELECT kode_mk, nama_mk, sks, nilai_angka, nilai_huruf, synced_at FROM transkrip WHERE nim = ? ORDER BY kode_mk', [nim]),
  semuaMhs: () => db.all("SELECT nim, nama FROM users WHERE role = 'mahasiswa' ORDER BY nim"),
};

async function buildTranskrip(mhs) {
  const items = await q.items(mhs.nim);
  return { mahasiswa: { nim: mhs.nim, nama: mhs.nama }, items, ...hitungIpk(items) };
}

// GET /transkrip : daftar ringkas seluruh mahasiswa (admin)
app.get('/transkrip', allowRoles('admin'), asyncHandler(async (req, res) => {
  const list = await q.semuaMhs();
  const data = [];
  for (const m of list) data.push({ ...m, ...hitungIpk(await q.items(m.nim)) });
  res.json({ data });
}));

// POST /transkrip/sinkron : HANYA token service (didaftarkan sebelum /:nim agar tidak tertangkap parameter)
app.post('/transkrip/sinkron', allowRoles('service'), asyncHandler(async (req, res) => {
  const { kelas, entries } = req.body || {};
  const valid = kelas && kelas.kode_mk && kelas.nama_mk && Number.isInteger(kelas.sks) && Array.isArray(entries) && entries.length > 0
    && entries.every((e) => e && typeof e.nim === 'string' && typeof e.nilai_angka === 'number' && typeof e.nilai_huruf === 'string');
  if (!valid) return res.status(400).json({ error: 'BAD_REQUEST', message: 'Payload sinkron tidak valid' });

  const now = new Date().toISOString();
  let diterima = 0;
  const unknown = [];
  await db.transaction(async (tx) => {
    for (const e of entries) {
      const mhs = await tx.get("SELECT id FROM users WHERE nim = ? AND role = 'mahasiswa'", [e.nim]);
      if (!mhs) { unknown.push(e.nim); continue; }
      await tx.run(UPSERT, [e.nim, kelas.id ?? null, kelas.kode_mk, kelas.nama_mk, kelas.sks, e.nilai_angka, e.nilai_huruf, now]);
      diterima += 1;
    }
  });
  res.json({ message: 'Transkrip disinkronkan', status: 'ok', diterima, dilewati: unknown });
}));

// GET /transkrip/:nim : mahasiswa (NIM sendiri, diperiksa ulang oleh service) / admin
app.get('/transkrip/:nim', allowRoles('mahasiswa', 'admin'), asyncHandler(async (req, res) => {
  if (req.auth.role === 'mahasiswa') {
    const me = await q.mhsById(Number(req.auth.sub));
    if (!me || me.nim !== req.params.nim) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Mahasiswa hanya boleh melihat NIM sendiri (diperiksa service).' });
    }
  }
  const mhs = await q.mhsByNim(req.params.nim);
  if (!mhs) return res.status(404).json({ error: 'NOT_FOUND', message: 'NIM tidak ditemukan' });
  return res.json({ data: await buildTranskrip(mhs) });
}));

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_REQUEST', message: 'Body JSON tidak valid' });
  console.error(err);
  return res.status(500).json({ error: 'INTERNAL', message: 'Terjadi kesalahan pada Service Transkrip' });
});

app.listen(config.ports.transkrip, () => console.log(`[service-transkrip] berjalan di http://localhost:${config.ports.transkrip}`));
