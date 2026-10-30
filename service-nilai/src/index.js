const express = require('express');
const config = require('../../shared/config');
const { getDb } = require('../../database/db');
const { toHuruf } = require('../../shared/grade');
const asyncHandler = require('../../shared/asyncHandler');
const { requireGatewaySecret, requireToken, allowRoles } = require('../../shared/serviceSecurity');
const { sinkronTranskrip } = require('./serviceToken');

const db = getDb();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Lapisan keamanan service: (1) gateway secret, (2) verifikasi ulang JWT.
app.use(requireGatewaySecret);
app.use(requireToken);

const SQL_NILAI_ROW = `
  SELECT n.id, n.kelas_id, u.nim, u.nama AS nama_mahasiswa, n.nilai_angka, n.nilai_huruf, n.final
  FROM nilai n JOIN users u ON u.id = n.mahasiswa_id WHERE n.id = ?`;

const q = {
  kelasDosen: (dosenId) => db.all(`
    SELECT k.*,
      (SELECT COUNT(*) FROM nilai WHERE kelas_id = k.id) AS jumlah_mahasiswa,
      (SELECT COUNT(*) FROM nilai WHERE kelas_id = k.id AND final = 1) AS jumlah_final
    FROM kelas k WHERE k.dosen_id = ? ORDER BY k.id`, [dosenId]),
  kelas: (id) => db.get('SELECT * FROM kelas WHERE id = ?', [id]),
  nilaiMhs: (mhsId) => db.all(`
    SELECT n.id, n.kelas_id, k.nama_kelas, k.kode_mk, k.nama_mk, k.sks, n.nilai_angka, n.nilai_huruf, n.final
    FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.mahasiswa_id = ? ORDER BY n.id`, [mhsId]),
  nilaiDosen: (dosenId, kelasId) => db.all(`
    SELECT n.id, n.kelas_id, k.nama_kelas, k.kode_mk, k.nama_mk, k.sks, u.nim, u.nama AS nama_mahasiswa,
           n.nilai_angka, n.nilai_huruf, n.final
    FROM nilai n JOIN kelas k ON k.id = n.kelas_id JOIN users u ON u.id = n.mahasiswa_id
    WHERE k.dosen_id = ? AND (? IS NULL OR n.kelas_id = ?) ORDER BY n.kelas_id, u.nim`, [dosenId, kelasId, kelasId]),
  nilaiById: (id) => db.get('SELECT n.*, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?', [id]),
  nilaiRow: (id) => db.get(SQL_NILAI_ROW, [id]),
  updNilai: (angka, huruf, id) => db.run('UPDATE nilai SET nilai_angka = ?, nilai_huruf = ?, updated_at = ? WHERE id = ?',
    [angka, huruf, new Date().toISOString(), id]),
  mhsByNim: (nim) => db.get("SELECT id FROM users WHERE nim = ? AND role = 'mahasiswa'", [nim]),
  nilaiByKelasMhs: (kelasId, mhsId) => db.get('SELECT * FROM nilai WHERE kelas_id = ? AND mahasiswa_id = ?', [kelasId, mhsId]),
  insNilai: (kelasId, mhsId, angka, huruf) => db.run(
    'INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, final, updated_at) VALUES (?,?,?,?,0,?)',
    [kelasId, mhsId, angka, huruf, new Date().toISOString()]),
  nilaiKelas: (kelasId) => db.all(`
    SELECT n.id, n.nilai_angka, n.nilai_huruf, n.final, u.nim, u.nama
    FROM nilai n JOIN users u ON u.id = n.mahasiswa_id WHERE n.kelas_id = ?`, [kelasId]),
};

// Mengubah status final untuk sekumpulan baris dalam satu transaksi.
const setFinal = (rows, value) => db.transaction(async (tx) => {
  const now = new Date().toISOString();
  for (const r of rows) await tx.run('UPDATE nilai SET final = ?, updated_at = ? WHERE id = ?', [value, now, r.id]);
});

const validAngka = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const bad = (res, message, status = 400) => res.status(status).json({ error: 'BAD_REQUEST', message });
const notOwner = (res) => res.status(403).json({ error: 'FORBIDDEN', message: 'Dosen tidak mengampu kelas ini (diperiksa service).' });

// GET /kelas : kelas yang diampu dosen
app.get('/kelas', allowRoles('dosen'), asyncHandler(async (req, res) => {
  res.json({ data: await q.kelasDosen(Number(req.auth.sub)) });
}));

// GET /nilai : mahasiswa -> miliknya; dosen -> kelas yang diampu (difilter ulang oleh service)
app.get('/nilai', allowRoles('mahasiswa', 'dosen'), asyncHandler(async (req, res) => {
  const uid = Number(req.auth.sub);
  if (req.auth.role === 'mahasiswa') return res.json({ data: await q.nilaiMhs(uid) });
  const kelas = req.query.kelas_id ? Number(req.query.kelas_id) : null;
  return res.json({ data: await q.nilaiDosen(uid, kelas) });
}));

// PUT /nilai/:id : ubah nilai (kelas diampu, belum final)
app.put('/nilai/:id', allowRoles('dosen'), asyncHandler(async (req, res) => {
  const row = await q.nilaiById(Number(req.params.id));
  if (!row) return bad(res, 'Data nilai tidak ditemukan', 404);
  if (row.dosen_id !== Number(req.auth.sub)) return notOwner(res);
  if (row.final) return res.status(409).json({ error: 'CONFLICT', message: 'Nilai sudah final.' });
  const angka = (req.body || {}).nilai_angka;
  if (!validAngka(angka)) return bad(res, 'nilai_angka harus berupa angka 0-100');
  await q.updNilai(angka, toHuruf(angka), row.id);
  return res.json({ message: 'Nilai diperbarui', data: await q.nilaiRow(row.id) });
}));

// POST /nilai : input nilai baru (atau menimpa draft) untuk mahasiswa pada kelas yang diampu
app.post('/nilai', allowRoles('dosen'), asyncHandler(async (req, res) => {
  const { kelas_id: kelasId, nim, nilai_angka: angka } = req.body || {};
  const kelas = await q.kelas(Number(kelasId));
  if (!kelas) return bad(res, 'Kelas tidak ditemukan', 404);
  if (kelas.dosen_id !== Number(req.auth.sub)) return notOwner(res);
  if (!validAngka(angka)) return bad(res, 'nilai_angka harus berupa angka 0-100');
  const mhs = await q.mhsByNim(String(nim));
  if (!mhs) return bad(res, 'Mahasiswa dengan NIM tersebut tidak ditemukan', 404);

  const existing = await q.nilaiByKelasMhs(kelas.id, mhs.id);
  if (existing) {
    if (existing.final) return res.status(409).json({ error: 'CONFLICT', message: 'Nilai sudah final.' });
    await q.updNilai(angka, toHuruf(angka), existing.id);
    return res.json({ message: 'Nilai diperbarui', data: await q.nilaiRow(existing.id) });
  }
  const ins = await q.insNilai(kelas.id, mhs.id, angka, toHuruf(angka));
  return res.status(201).json({ message: 'Nilai ditambahkan', data: await q.nilaiRow(ins.lastID) });
}));

// POST /kelas/:id/finalisasi : finalisasi, lalu sinkron ke Service Transkrip melalui gateway
app.post('/kelas/:id/finalisasi', allowRoles('dosen'), asyncHandler(async (req, res) => {
  const kelas = await q.kelas(Number(req.params.id));
  if (!kelas) return bad(res, 'Kelas tidak ditemukan', 404);
  if (kelas.dosen_id !== Number(req.auth.sub)) return notOwner(res);

  const rows = await q.nilaiKelas(kelas.id);
  if (rows.length === 0) return bad(res, 'Kelas belum memiliki peserta', 409);
  const kosong = rows.filter((r) => r.nilai_angka === null);
  if (kosong.length) return bad(res, `Nilai belum lengkap untuk NIM: ${kosong.map((r) => r.nim).join(', ')}`, 422);
  const draft = rows.filter((r) => !r.final);
  if (draft.length === 0) return res.status(409).json({ error: 'CONFLICT', message: 'Semua nilai pada kelas ini sudah final.' });

  await setFinal(draft, 1);
  try {
    const sinkron = await sinkronTranskrip({
      kelas: { id: kelas.id, kode_mk: kelas.kode_mk, nama_mk: kelas.nama_mk, sks: kelas.sks },
      entries: rows.map((r) => ({ nim: r.nim, nilai_angka: r.nilai_angka, nilai_huruf: r.nilai_huruf })),
    });
    return res.json({
      message: `Kelas ${kelas.nama_kelas} difinalisasi dan transkrip disinkronkan`,
      data: { kelas_id: kelas.id, jumlah_final: rows.length, sinkron },
    });
  } catch (err) {
    // Rollback finalisasi agar data tetap konsisten dengan transkrip.
    await setFinal(draft, 0);
    return res.status(502).json({ error: 'SYNC_FAILED', message: `Finalisasi dibatalkan: ${err.message}` });
  }
}));

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'Body JSON tidak valid');
  console.error(err);
  return res.status(500).json({ error: 'INTERNAL', message: 'Terjadi kesalahan pada Service Nilai' });
});

app.listen(config.ports.nilai, () => console.log(`[service-nilai] berjalan di http://localhost:${config.ports.nilai}`));
