'use client';
import { useState } from 'react';
import { Play, RotateCcw, Send, X } from 'lucide-react';
import { useApp } from '@/components/Providers';
import { Pill } from '@/components/ui';

const UNREGISTERED = 'DEV-TIDAK-TERDAFTAR';

const PRESETS = [
  { label: 'Ubah nilai pada Kelas X (nilai ID 1)', method: 'PUT', path: '/nilai/1', body: '{ "nilai_angka": 90 }' },
  { label: 'Ubah nilai pada Kelas Y (nilai ID 3)', method: 'PUT', path: '/nilai/3', body: '{ "nilai_angka": 90 }' },
  { label: 'Finalisasi Kelas X', method: 'POST', path: '/kelas/1/finalisasi', body: '' },
  { label: 'Finalisasi Kelas Y', method: 'POST', path: '/kelas/2/finalisasi', body: '' },
  { label: 'Lihat transkrip NIM 2021001', method: 'GET', path: '/transkrip/2021001', body: '' },
  { label: 'Lihat transkrip NIM 2021002', method: 'GET', path: '/transkrip/2021002', body: '' },
  { label: 'Daftar transkrip seluruh mahasiswa', method: 'GET', path: '/transkrip', body: '' },
  { label: 'Lihat audit log', method: 'GET', path: '/audit', body: '' },
  {
    label: 'Sinkron transkrip dengan token user',
    method: 'POST', path: '/transkrip/sinkron',
    body: '{ "kelas": { "id": 1, "kode_mk": "KP70065004", "nama_mk": "Keamanan Informasi", "sks": 3 }, "entries": [ { "nim": "2021001", "nilai_angka": 100, "nilai_huruf": "A" } ] }',
  },
];

export default function SimPanel({ open, onClose }) {
  const { session, sim, setSim, request, log } = useApp();
  const [form, setForm] = useState({ method: 'GET', path: '/nilai', body: '' });
  const [result, setResult] = useState(null);
  const [probe, setProbe] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeDevice = sim.device || session?.device_id || '-';
  const deviceMode = !sim.device ? 'asli' : sim.device === UNREGISTERED ? 'asing' : 'kustom';
  const timeMode = !sim.time ? 'server' : sim.time === '10:00' ? 'dalam' : sim.time === '23:30' ? 'luar' : 'kustom';

  const applyPreset = (idx) => {
    if (idx === '') return;
    const p = PRESETS[Number(idx)];
    setForm({ method: p.method, path: p.path, body: p.body });
  };

  const send = async () => {
    setBusy(true);
    let body;
    if (form.body.trim()) {
      try { body = JSON.parse(form.body); } catch {
        setResult({ status: 0, data: { message: 'Body bukan JSON yang valid' } });
        setBusy(false);
        return;
      }
    }
    const r = await request(form.method, form.path, body);
    setResult(r);
    setBusy(false);
  };

  const runProbe = async () => {
    setBusy(true);
    const r = await request('GET', '/demo/probe');
    setProbe(r);
    setBusy(false);
  };

  const reset = () => { setSim({ device: '', time: '', noToken: false }); setResult(null); setProbe(null); };

  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} />}
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Panel simulasi pengujian">
        <div className="drawer-head">
          <div>
            <h2>Simulasi pengujian</h2>
            <p className="muted small">Mengubah konteks request untuk menguji kebijakan zero trust.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup panel"><X size={16} /></button>
        </div>

        <section className="drawer-sec">
          <h4>Device ID</h4>
          <p className="small muted">Device aktif: <strong>{activeDevice}</strong></p>
          <div className="seg">
            <button className={deviceMode === 'asli' ? 'on' : ''} onClick={() => setSim({ device: '' })}>Terdaftar</button>
            <button className={deviceMode === 'asing' ? 'on' : ''} onClick={() => setSim({ device: UNREGISTERED })}>Tidak terdaftar</button>
          </div>
          <input
            className="input" placeholder="Device ID kustom" value={deviceMode === 'kustom' ? sim.device : ''}
            onChange={(e) => setSim({ device: e.target.value })}
          />
        </section>

        <section className="drawer-sec">
          <h4>Jam akses (07.00 sampai 21.00)</h4>
          <div className="seg">
            <button className={timeMode === 'server' ? 'on' : ''} onClick={() => setSim({ time: '' })}>Waktu server</button>
            <button className={timeMode === 'dalam' ? 'on' : ''} onClick={() => setSim({ time: '10:00' })}>10:00</button>
            <button className={timeMode === 'luar' ? 'on' : ''} onClick={() => setSim({ time: '23:30' })}>23:30</button>
          </div>
          <input className="input" type="time" value={sim.time} onChange={(e) => setSim({ time: e.target.value })} aria-label="Jam simulasi kustom" />
          <p className="small muted">Dikirim sebagai header X-Demo-Time. Hanya berlaku jika DEMO_MODE aktif di gateway.</p>
        </section>

        <section className="drawer-sec">
          <h4>Access token</h4>
          <label className="check">
            <input type="checkbox" checked={sim.noToken} onChange={(e) => setSim({ noToken: e.target.checked })} />
            Kirim request tanpa access token
          </label>
          <button className="btn btn-ghost" onClick={reset}><RotateCcw size={14} />Kembalikan semua simulasi</button>
        </section>

        <section className="drawer-sec">
          <h4>Uji endpoint</h4>
          <select className="input" defaultValue="" onChange={(e) => applyPreset(e.target.value)} aria-label="Contoh skenario">
            <option value="">Pilih contoh skenario</option>
            {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
          </select>
          <div className="row">
            <select className="input method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {['GET', 'POST', 'PUT'].map((m) => <option key={m}>{m}</option>)}
            </select>
            <input className="input" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} aria-label="Path" />
          </div>
          <textarea className="input" rows={3} placeholder="Body JSON (opsional)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <button className="btn btn-primary" onClick={send} disabled={busy}><Send size={14} />Kirim request</button>
          {result && (
            <div className="result">
              <Pill tone={result.ok ? 'ok' : 'err'}>HTTP {result.status || 'gagal'}</Pill>
              <pre>{JSON.stringify(result.data, null, 2)}</pre>
            </div>
          )}
        </section>

        <section className="drawer-sec">
          <h4>Uji akses langsung ke service</h4>
          <p className="small muted">Gateway memanggil port 3001 dan 3002 secara langsung tanpa melalui kebijakan, lalu melaporkan hasilnya.</p>
          <button className="btn btn-outline" onClick={runProbe} disabled={busy}><Play size={14} />Jalankan uji</button>
          {probe && !probe.ok && <p className="small err-text">{probe.data?.message}</p>}
          {probe?.ok && (
            <table className="mini-table">
              <tbody>
                {probe.data.data.map((t) => (
                  <tr key={t.test}>
                    <td>{t.test}</td>
                    <td className="nowrap">{t.actual}</td>
                    <td><Pill tone={t.pass ? 'ok' : 'err'}>{t.pass ? 'Sesuai' : 'Tidak sesuai'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="drawer-sec">
          <h4>Request terakhir</h4>
          {log.length === 0 && <p className="small muted">Belum ada request.</p>}
          <ul className="reqlog">
            {log.map((l, i) => (
              <li key={i}>
                <Pill tone={l.status >= 200 && l.status < 300 ? 'ok' : 'err'}>{l.status || 'ERR'}</Pill>
                <div>
                  <div className="small"><strong>{l.method}</strong> {l.path}</div>
                  <div className="small muted">{l.message}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  );
}
