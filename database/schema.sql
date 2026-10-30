DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS transkrip;
DROP TABLE IF EXISTS nilai;
DROP TABLE IF EXISTS kelas;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS service_clients;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim           TEXT UNIQUE
);

CREATE TABLE devices (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label     TEXT,
  UNIQUE (user_id, device_id)
);

CREATE TABLE kelas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_kelas TEXT NOT NULL,
  kode_mk    TEXT NOT NULL,
  nama_mk    TEXT NOT NULL,
  sks        INTEGER NOT NULL,
  dosen_id   INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE nilai (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id      INTEGER NOT NULL REFERENCES kelas(id),
  mahasiswa_id  INTEGER NOT NULL REFERENCES users(id),
  nilai_angka   REAL,
  nilai_huruf   TEXT,
  final         INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT,
  UNIQUE (kelas_id, mahasiswa_id)
);

CREATE TABLE transkrip (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nim         TEXT NOT NULL,
  kelas_id    INTEGER,
  kode_mk     TEXT NOT NULL,
  nama_mk     TEXT NOT NULL,
  sks         INTEGER NOT NULL,
  nilai_angka REAL NOT NULL,
  nilai_huruf TEXT NOT NULL,
  synced_at   TEXT NOT NULL,
  UNIQUE (nim, kode_mk)
);

CREATE TABLE refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  waktu       TEXT NOT NULL,
  subjek      TEXT NOT NULL,
  role        TEXT,
  method      TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  device      TEXT,
  hasil       TEXT NOT NULL CHECK (hasil IN ('ALLOW','DENY')),
  alasan      TEXT NOT NULL,
  status_code INTEGER,
  ip          TEXT
);
CREATE INDEX idx_audit_waktu ON audit_logs(waktu DESC);

CREATE TABLE service_clients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  nama        TEXT
);
