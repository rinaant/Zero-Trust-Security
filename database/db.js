// Lapisan akses SQLite berbasis paket `sqlite3`, dibungkus menjadi API promise (async/await).
// Satu file database bersama; setiap service membuka koneksinya sendiri.
const fs = require('fs');
const sqlite3 = require('sqlite3');
const config = require('../shared/config');

function wrap(raw, opened) {
  const rawRun = (sql, params = []) => new Promise((resolve, reject) => {
    raw.run(sql, params, function onRun(err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
  const rawGet = (sql, params = []) => new Promise((resolve, reject) => {
    raw.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
  const rawAll = (sql, params = []) => new Promise((resolve, reject) => {
    raw.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
  const rawExec = (sql) => new Promise((resolve, reject) => {
    raw.exec(sql, (err) => (err ? reject(err) : resolve()));
  });

  // `ready`: koneksi terbuka + konfigurasi dasar selesai. Konfigurasi baru boleh dipanggil SETELAH open selesai.
  const ready = opened.then(async () => {
    raw.serialize(); // statement dijalankan berurutan sesuai urutan pemanggilan
    raw.configure('busyTimeout', 5000);
    await rawRun('PRAGMA journal_mode = WAL');
    await rawRun('PRAGMA foreign_keys = ON');
  });

  // Transaksi memakai satu koneksi, sehingga query di luar transaksi menunggu sampai transaksi selesai.
  let current = ready;
  const guarded = (fn) => async (...args) => { await current; return fn(...args); };

  const db = {
    run: guarded(rawRun),   // -> { lastID, changes }
    get: guarded(rawGet),   // -> satu baris atau undefined
    all: guarded(rawAll),   // -> array baris
    exec: guarded(rawExec), // -> beberapa statement sekaligus
    // Menjalankan fn(tx) dalam BEGIN ... COMMIT; ROLLBACK otomatis jika fn melempar error.
    // Di dalam fn WAJIB memakai tx.run / tx.get / tx.all (bukan db.*).
    async transaction(fn) {
      const previous = current;
      let release;
      current = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        await rawRun('BEGIN IMMEDIATE');
        const result = await fn({ run: rawRun, get: rawGet, all: rawAll });
        await rawRun('COMMIT');
        return result;
      } catch (err) {
        try { await rawRun('ROLLBACK'); } catch { /* sudah di-rollback */ }
        throw err;
      } finally {
        release();
      }
    },
    close: () => new Promise((resolve, reject) => raw.close((err) => (err ? reject(err) : resolve()))),
  };

  return db;
}

function open(file) {
  let raw;
  const opened = new Promise((resolve, reject) => {
    raw = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve()));
  });
  return wrap(raw, opened);
}

// Membuka database yang sudah ada (dipakai gateway dan service).
function getDb() {
  if (!fs.existsSync(config.dbPath)) {
    console.error(`Database tidak ditemukan di ${config.dbPath}. Jalankan: npm run seed`);
    process.exit(1);
  }
  return open(config.dbPath);
}

// Membuat/membuka file database tanpa pengecekan (dipakai seed.js).
function openDb(file = config.dbPath) {
  return open(file);
}

module.exports = { getDb, openDb };
