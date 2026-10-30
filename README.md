# Sistem Nilai - Zero Trust Security

Tugas Praktikum Individu, Keamanan Informasi (KP70065004), Informatika Universitas Siliwangi.
Implementasi prinsip zero trust (never trust, always verify; least privilege; assume breach) pada level aplikasi dengan arsitektur NIST SP 800-207.

## Arsitektur

```
Client (Next.js :3100 / Postman / curl)
        |  access token + X-Device-ID
        v
API Gateway (PEP + Policy Engine/Administrator)  :3000 ----> Audit Log (tabel audit_logs)
        |  jika ALLOW + X-Gateway-Secret
        +--------------------------+
        v                          v
Service Nilai :3001         Service Transkrip :3002
(verifikasi secret + JWT)   (verifikasi secret + JWT)
        |                          ^
        |  finalisasi: token service via /auth/service,
        +--> panggil POST /transkrip/sinkron MELALUI gateway
        v
Database SQLite bersama: database/database.sqlite
```

| Komponen | Peran NIST SP 800-207 | Lokasi |
|---|---|---|
| API Gateway | PEP | `gateway/src/pep.js`, `gateway/src/proxy.js` |
| Policy Engine | PE | `gateway/src/policy.js` |
| Policy Administrator | PA | `gateway/src/auth.js` (login, refresh, logout, token service) |
| Service Nilai | Resource | `service-nilai/src/` |
| Service Transkrip | Resource | `service-transkrip/src/` |
| Database (SQLite 3, driver `sqlite3`) | Resource | `database/` |
| Audit Log | Data source | `gateway/src/audit.js` (tabel `audit_logs`) |

## Struktur folder

```
zero-trust-nilai/
  package.json            dependensi + script backend (gateway, service, seed)
  .env.example            konfigurasi opsional
  shared/                 config, JWT, middleware keamanan service, konversi nilai
  database/               schema.sql, db.js (wrapper async sqlite3), seed.js, (database.sqlite hasil seed)
  gateway/src/            index, pep, policy, auth, audit, proxy
  service-nilai/src/      index, serviceToken
  service-transkrip/src/  index
  frontend/               Next.js (App Router), port 3100
  tests/scenarios.sh      uji otomatis skenario zero trust (curl)
```

## Prasyarat

- Node.js 18 atau lebih baru (diuji pada Node 22)
- npm
- Tidak perlu server database; SQLite 3 berupa satu file dan diakses lewat paket npm `sqlite3` (binary siap pakai diunduh otomatis saat `npm install`).

## Instalasi dan menjalankan

```bash
# 1. Pasang dependensi backend dan frontend
npm run install:all

# 2. Isi database awal (menjalankan ulang akan MERESET data)
npm run seed

# 3. Jalankan gateway (3000), Service Nilai (3001), Service Transkrip (3002), dan frontend (3100)
npm run dev
```

Buka http://localhost:3100. Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run backend` | Hanya gateway + dua service |
| `npm run gateway` / `npm run nilai` / `npm run transkrip` / `npm run frontend` | Menjalankan satu komponen per terminal |
| `npm run seed` | Reset database ke data awal |
| `bash tests/scenarios.sh` | Uji otomatis 39 skenario (backend harus berjalan) |

Konfigurasi opsional: salin `.env.example` menjadi `.env`. Tanpa `.env`, nilai bawaan pada `shared/config.js` dipakai. Frontend memakai `NEXT_PUBLIC_GATEWAY_URL` (bawaan `http://localhost:3000`).

Catatan: frontend berjalan di port 3100 karena port 3000 dipakai gateway.

## Akun data awal (seed)

| Username | Password | Role | NIM | Device ID terdaftar |
|---|---|---|---|---|
| admin | admin123 | Admin | - | DEV-ADMIN-01 |
| dosen.a | dosenA123 | Dosen (mengampu Kelas X) | - | DEV-DOSEN-A-01 |
| dosen.b | dosenB123 | Dosen (mengampu Kelas Y) | - | DEV-DOSEN-B-01 |
| mhs1 | mhs1123 | Mahasiswa | 2021001 | DEV-MHS-1-01 |
| mhs2 | mhs2123 | Mahasiswa | 2021002 | DEV-MHS-2-01 |
| mhs3 | mhs3123 | Mahasiswa | 2021003 | DEV-MHS-3-01 |

Kelas dan nilai awal (semua berstatus draft):

| ID nilai | Kelas | Mahasiswa | Nilai |
|---|---|---|---|
| 1 | Kelas X (ID 1, Keamanan Informasi, dosen.a) | mhs1 | 88 |
| 2 | Kelas X | mhs2 | 72 |
| 3 | Kelas Y (ID 2, Basis Data Lanjut, dosen.b) | mhs2 | 81 |
| 4 | Kelas Y | mhs3 | 66 |

Service client untuk `POST /auth/service`: `client_id=service-nilai`, `client_secret=dev-service-client-secret`.

## Daftar endpoint (semua lewat gateway :3000)

| Endpoint | Ditangani | Diizinkan | Kondisi |
|---|---|---|---|
| POST /auth/login | Gateway | Semua user | Kredensial valid + device terdaftar |
| POST /auth/refresh, /auth/logout | Gateway | Semua user | Refresh token valid, belum dicabut |
| POST /auth/service | Gateway | Service Nilai | Client ID + secret valid |
| GET /nilai | Nilai | Mahasiswa, dosen | Mahasiswa: milik sendiri. Dosen: kelas yang diampu |
| PUT /nilai/:id | Nilai | Dosen | Kelas diampu, belum final, dalam jam akses |
| POST /nilai | Nilai | Dosen | Input nilai baru: `{kelas_id, nim, nilai_angka}`, kelas diampu, dalam jam akses |
| POST /kelas/:id/finalisasi | Nilai | Dosen | Kelas diampu, dalam jam akses; lalu sinkron transkrip |
| GET /transkrip/:nim | Transkrip | Mahasiswa, admin | Mahasiswa: NIM sendiri. Admin: semua |
| POST /transkrip/sinkron | Transkrip | Service Nilai | Hanya token service |
| GET /kelas | Nilai | Dosen | Tambahan: daftar kelas yang diampu (untuk frontend) |
| GET /transkrip | Transkrip | Admin | Tambahan: ringkasan semua mahasiswa |
| GET /audit | Gateway | Admin | Tambahan: membaca audit log |
| GET /demo/probe | Gateway | Semua user | Hanya `DEMO_MODE=true`: uji akses langsung ke service |

Kebijakan lain: tanpa route yang cocok maka request ditolak (default deny). Token service hanya boleh mengakses `POST /transkrip/sinkron`.

## Akses database (sqlite3)

Paket `sqlite3` bersifat asinkron, sehingga seluruh akses database memakai `async/await` melalui wrapper `database/db.js`:

- `db.get(sql, params)` satu baris, `db.all(sql, params)` banyak baris, `db.run(sql, params)` mengembalikan `{ lastID, changes }`, `db.exec(sql)` beberapa statement.
- `db.transaction(async (tx) => { ... })` menjalankan `BEGIN IMMEDIATE` sampai `COMMIT` (otomatis `ROLLBACK` jika error). Di dalam transaksi gunakan `tx.run/get/all`. Dipakai pada seed, finalisasi nilai, dan sinkron transkrip.
- Mode WAL, `foreign_keys` aktif, dan `busy_timeout` 5 detik, sehingga tiga proses (gateway, Service Nilai, Service Transkrip) dapat berbagi satu file `database.sqlite`.

## Pemetaan kebutuhan tugas ke kode (untuk video demo)

| Kebutuhan | Bagian kode |
|---|---|
| 4.1 Access token JWT 10 menit (sub, role) | `shared/jwt.js` fungsi `signAccessToken` |
| 4.1 Refresh token 1 hari, disimpan di DB, dapat dicabut | `gateway/src/auth.js` (`/login`, `/refresh` dengan rotasi, `/logout`), tabel `refresh_tokens` |
| 4.1 Token service 5 menit, role service | `gateway/src/auth.js` `/service`; `shared/jwt.js` `signServiceToken`; `service-nilai/src/serviceToken.js` |
| 4.1 Gateway secret | Disisipkan di `gateway/src/proxy.js`, diperiksa di `shared/serviceSecurity.js` `requireGatewaySecret` |
| 4.1 Verifikasi ulang token di service | `shared/serviceSecurity.js` `requireToken` + `allowRoles`, dipasang di kedua service |
| 4.2 Kebijakan akses (Tabel 3) | `gateway/src/policy.js` (tabel `rules`, default deny); atribut dibaca dari DB |
| 4.3 Device terdaftar | `gateway/src/policy.js` fungsi `decide` (tabel `devices`) |
| 4.3 Jam akses dapat dikonfigurasi | `gateway/src/policy.js` `checkAccessHours`; `ACCESS_HOUR_START/END` di `.env` |
| 4.4 Audit log | `gateway/src/audit.js`, dipanggil dari `gateway/src/pep.js` dan `auth.js` |
| Panggilan antar-service via gateway | `service-nilai/src/serviceToken.js` `sinkronTranskrip`, dipakai di `service-nilai/src/index.js` (finalisasi) |

Service juga memeriksa ulang kepemilikan data (mis. dosen hanya kelas miliknya, mahasiswa hanya NIM sendiri) sebagai lapisan kedua, sesuai prinsip assume breach.

## Panduan pengujian skenario (untuk rekaman video demo)

Panel **Simulasi pengujian** (tombol di pojok kanan atas aplikasi) dipakai untuk mengubah Device ID, jam akses, dan mengirim request bebas. Hasil keputusan dapat dilihat langsung di akun admin (menu Audit log, centang "Perbarui otomatis").

Saran urutan demo (6 sampai 9 menit):

| Menit | Langkah |
|---|---|
| 0:00 | Tunjukkan arsitektur (bagian di atas) dan struktur folder |
| 1:00 | Tunjukkan `policy.js`, `pep.js`, `serviceSecurity.js`, `auth.js` sambil menjelaskan 4.1 sampai 4.4 |
| 3:00 | Jalankan skenario 1 sampai 8 di bawah |
| 7:30 | Buka audit log (admin) untuk menunjukkan semua keputusan allow/deny beserta alasan |
| 8:30 | Ringkasan |

| # | Skenario | Cara uji di UI | Hasil yang diharapkan |
|---|---|---|---|
| 1 | Login device tidak terdaftar | Halaman login: `dosen.a` / `dosenA123`, Device ID `DEV-ASING` | Ditolak 403 "Device tidak terdaftar untuk user ini" |
| 2 | Login valid | Gunakan Device ID `DEV-DOSEN-A-01` | Masuk ke halaman Penilaian |
| 3 | Dosen mengedit kelas yang bukan miliknya | Panel simulasi, contoh "Ubah nilai pada Kelas Y (nilai ID 3)" (login sebagai dosen.a) | Ditolak 403 "Dosen tidak mengampu kelas dari nilai ini" |
| 4 | Edit di luar jam akses | Panel simulasi, jam akses `23:30`, lalu ubah dan simpan nilai di tabel | Ditolak 403 "Di luar jam akses 07:00-21:00" |
| 5 | Device tidak terdaftar saat sesi berjalan | Panel simulasi, tombol "Tidak terdaftar", lalu muat ulang atau simpan nilai | Ditolak 403 "Device tidak terdaftar untuk user ini" |
| 6 | Finalisasi kelas + sinkron antar-service | Kembalikan simulasi, jam `10:00`, klik Finalisasi kelas | Sukses; login sebagai mahasiswa untuk melihat mata kuliah baru pada transkrip |
| 7 | Edit nilai yang sudah final | Ubah nilai kelas yang sudah final | Ditolak (nilai sudah final) |
| 8 | Mahasiswa melihat transkrip NIM lain | Login `mhs1` (device `DEV-MHS-1-01`), isi kolom NIM dengan `2021002` | Ditolak 403 "Mahasiswa hanya boleh melihat transkrip dengan NIM sendiri" |
| 9 | Direct access diblokir + double verification | Panel simulasi, "Uji akses langsung ke service", atau curl di bawah | Semua baris berstatus Sesuai (403 tanpa secret, 401 tanpa token) |
| 10 | Token service vs token user | Panel simulasi, contoh "Sinkron transkrip dengan token user" | Ditolak 403 "Endpoint sinkron hanya untuk token service" |
| 11 | Tanpa access token | Panel simulasi, centang "Kirim request tanpa access token" | Ditolak 401 "Access token tidak ada" |

Setelah skenario finalisasi, jalankan `npm run seed` untuk mengembalikan data awal.

### Pengujian dengan curl (Git Bash / Linux / macOS)

```bash
# Login dan ambil token
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" -H "X-Device-ID: DEV-DOSEN-A-01" \
  -d '{"username":"dosen.a","password":"dosenA123"}'

TOKEN=<isi access_token>

# Dosen A edit nilai kelas Y -> 403
curl -i -X PUT http://localhost:3000/nilai/3 \
  -H "Authorization: Bearer $TOKEN" -H "X-Device-ID: DEV-DOSEN-A-01" \
  -H "Content-Type: application/json" -d '{"nilai_angka":95}'

# Di luar jam akses (simulasi, butuh DEMO_MODE=true) -> 403
curl -i -X PUT http://localhost:3000/nilai/1 \
  -H "Authorization: Bearer $TOKEN" -H "X-Device-ID: DEV-DOSEN-A-01" -H "X-Demo-Time: 23:30" \
  -H "Content-Type: application/json" -d '{"nilai_angka":95}'

# Akses langsung ke service tanpa X-Gateway-Secret -> 403
curl -i http://localhost:3001/nilai
curl -i http://localhost:3002/transkrip/2021001

# Secret benar tetapi tanpa token -> 401 (service tetap memverifikasi JWT)
curl -i http://localhost:3001/nilai -H "X-Gateway-Secret: dev-gateway-secret-ganti-di-produksi"
```

Pengguna PowerShell sebaiknya memakai Git Bash, Postman, atau `curl.exe` dengan tanda kutip yang disesuaikan.

## Catatan keamanan

- Jam akses: `07:00` sampai sebelum `21:00` pada zona `ACCESS_TIMEZONE` (bawaan Asia/Jakarta). Ubah lewat `ACCESS_HOUR_START` dan `ACCESS_HOUR_END`.
- `DEMO_MODE=true` mengaktifkan header `X-Demo-Time` dan `/demo/probe` agar mudah didemokan. Pada lingkungan nyata, setel `DEMO_MODE=false`.
- JWT memakai HS256 dengan secret bersama sesuai rekomendasi tugas. Untuk produksi, gunakan RS256 (service hanya memegang public key) dan ganti semua secret pada `.env`.
- Refresh token disimpan sebagai hash SHA-256, terikat ke device, dan dirotasi setiap dipakai.
- Frontend menyimpan token di `sessionStorage` (hilang saat tab ditutup) untuk keperluan praktikum.

## Pemecahan masalah

- `sqlite3` gagal terpasang: pastikan Node 18+ dan koneksi internet (binary diunduh dari GitHub saat install); jika tidak tersedia untuk platform Anda, paket dikompilasi dari sumber sehingga memerlukan Python dan Build Tools C++ (Windows) atau `build-essential` (Linux).
- Peringatan `DEP0060 util._extend is deprecated` saat gateway berjalan berasal dari pustaka proxy pada Node 22 dan tidak memengaruhi fungsi.
- "Database tidak ditemukan": jalankan `npm run seed`.
- Port bentrok: ubah `GATEWAY_PORT`, `NILAI_PORT`, `TRANSKRIP_PORT` di `.env` (dan `NEXT_PUBLIC_GATEWAY_URL` serta `CORS_ORIGINS` bila gateway/frontend berpindah).
- Frontend menampilkan "Gateway tidak dapat dihubungi": pastikan `npm run backend` berjalan.
