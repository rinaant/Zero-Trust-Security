// Mengisi database awal. Menjalankan ulang script ini akan MERESET seluruh data.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../shared/config');
const { openDb } = require('./db');

const hash = (p) => bcrypt.hashSync(p, 10);

const users = [
  { username: 'admin',   password: 'admin123',  nama: 'Administrator Prodi', role: 'admin',     nim: null,      device: 'DEV-ADMIN-01' },
  { username: 'dosen.a', password: 'dosenA123', nama: 'Dr. Andi Pratama',    role: 'dosen',     nim: null,      device: 'DEV-DOSEN-A-01' },
  { username: 'dosen.b', password: 'dosenB123', nama: 'Dr. Budi Santoso',    role: 'dosen',     nim: null,      device: 'DEV-DOSEN-B-01' },
  { username: 'mhs1',    password: 'mhs1123',   nama: 'Citra Lestari',       role: 'mahasiswa', nim: '2021001', device: 'DEV-MHS-1-01' },
  { username: 'mhs2',    password: 'mhs2123',   nama: 'Dimas Saputra',       role: 'mahasiswa', nim: '2021002', device: 'DEV-MHS-2-01' },
  { username: 'mhs3',    password: 'mhs3123',   nama: 'Eka Wulandari',       role: 'mahasiswa', nim: '2021003', device: 'DEV-MHS-3-01' },
];

async function main() {
  const db = openDb();
  const now = new Date().toISOString();
  await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  await db.transaction(async (tx) => {
    const ids = {};
    for (const u of users) {
      const r = await tx.run('INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?,?,?,?,?)',
        [u.username, hash(u.password), u.nama, u.role, u.nim]);
      ids[u.username] = r.lastID;
      await tx.run('INSERT INTO devices (user_id, device_id, label) VALUES (?,?,?)', [r.lastID, u.device, 'Perangkat utama']);
    }

    // Dua kelas diampu dosen berbeda.
    const insKelas = 'INSERT INTO kelas (nama_kelas, kode_mk, nama_mk, sks, dosen_id) VALUES (?,?,?,?,?)';
    const kelasX = (await tx.run(insKelas, ['Kelas X', 'KP70065004', 'Keamanan Informasi', 3, ids['dosen.a']])).lastID;
    const kelasY = (await tx.run(insKelas, ['Kelas Y', 'KP70045002', 'Basis Data Lanjut', 3, ids['dosen.b']])).lastID;

    // Peserta kelas (id nilai: 1 = mhs1/X, 2 = mhs2/X, 3 = mhs2/Y, 4 = mhs3/Y).
    const insNilai = 'INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, final, updated_at) VALUES (?,?,?,?,0,?)';
    await tx.run(insNilai, [kelasX, ids.mhs1, 88, 'A', now]);
    await tx.run(insNilai, [kelasX, ids.mhs2, 72, 'B', now]);
    await tx.run(insNilai, [kelasY, ids.mhs2, 81, 'B', now]);
    await tx.run(insNilai, [kelasY, ids.mhs3, 66, 'C', now]);

    // Riwayat transkrip semester sebelumnya.
    const insTr = 'INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, sks, nilai_angka, nilai_huruf, synced_at) VALUES (?,?,?,?,?,?,?,?)';
    await tx.run(insTr, ['2021001', null, 'KP70015001', 'Algoritma dan Pemrograman', 3, 90, 'A', now]);
    await tx.run(insTr, ['2021002', null, 'KP70015001', 'Algoritma dan Pemrograman', 3, 76, 'B', now]);
    await tx.run(insTr, ['2021003', null, 'KP70015001', 'Algoritma dan Pemrograman', 3, 62, 'C', now]);

    // Kredensial service (client ID + secret) untuk POST /auth/service.
    await tx.run('INSERT INTO service_clients (client_id, secret_hash, nama) VALUES (?,?,?)',
      [config.serviceClient.id, hash(config.serviceClient.secret), 'Service Nilai']);
  });

  console.log('Seed selesai: ' + config.dbPath);
  console.table(users.map((u) => ({ username: u.username, password: u.password, role: u.role, nim: u.nim || '-', device_id: u.device })));
  console.log('Service client:', config.serviceClient.id);
  await db.close();
}

main().catch((err) => { console.error('Seed gagal:', err); process.exit(1); });
