// Mengambil token service dari gateway (POST /auth/service) dan menyimpannya sampai hampir kedaluwarsa.
const config = require('../../shared/config');

let cache = null; // { token, exp }

async function getServiceToken(force = false) {
  if (!force && cache && cache.exp - 30_000 > Date.now()) return cache.token;
  const res = await fetch(`${config.urls.gateway}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.serviceClient.id, client_secret: config.serviceClient.secret }),
  });
  if (!res.ok) throw new Error(`Gagal memperoleh token service (HTTP ${res.status})`);
  const data = await res.json();
  cache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cache.token;
}

// Memanggil Service Transkrip MELALUI gateway dengan token service.
async function sinkronTranskrip(payload) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getServiceToken(attempt > 0);
    const res = await fetch(`${config.urls.gateway}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 && attempt === 0) continue; // token kedaluwarsa, ambil ulang
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Sinkron transkrip gagal (HTTP ${res.status})`);
    return body;
  }
  throw new Error('Sinkron transkrip gagal');
}

module.exports = { getServiceToken, sinkronTranskrip };
