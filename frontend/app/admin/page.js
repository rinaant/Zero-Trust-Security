'use client';
import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, ScrollText } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useApp } from '@/components/Providers';
import { Notice, Pill, Spinner, formatWaktu, resultNotice } from '@/components/ui';

function AuditLog() {
  const { request } = useApp();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [auto, setAuto] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    const r = await request('GET', `/audit?limit=150${filter ? `&hasil=${filter}` : ''}`);
    if (r.ok) { setRows(r.data.data); setNotice(null); } else setNotice(resultNotice(r));
  }, [request, filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [auto, load]);

  return (
    <div className="card flush">
      <div className="card-head pad">
        <div><h2>Audit log</h2><p className="muted">Setiap keputusan akses yang dibuat gateway.</p></div>
        <div className="card-actions">
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter hasil">
            <option value="">Semua hasil</option>
            <option value="ALLOW">Diizinkan</option>
            <option value="DENY">Ditolak</option>
          </select>
          <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Perbarui otomatis</label>
          <button className="btn btn-outline" onClick={load}><RefreshCw size={14} />Muat ulang</button>
        </div>
      </div>
      <div className="pad-x"><Notice notice={notice} /></div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table dense">
            <thead><tr><th>Waktu</th><th>Subjek</th><th>Permintaan</th><th>Device</th><th>Hasil</th><th>Alasan</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{formatWaktu(a.waktu)}</td>
                  <td>{a.subjek}{a.role && <div className="small muted">{a.role}</div>}</td>
                  <td className="nowrap"><strong>{a.method}</strong> {a.endpoint}{a.status_code ? <span className="small muted">, {a.status_code}</span> : null}</td>
                  <td className="small">{a.device || '-'}</td>
                  <td><Pill tone={a.hasil === 'ALLOW' ? 'ok' : 'err'}>{a.hasil === 'ALLOW' ? 'Diizinkan' : 'Ditolak'}</Pill></td>
                  <td>{a.alasan}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="empty">Belum ada catatan.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Transkrip() {
  const { request } = useApp();
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await request('GET', '/transkrip');
      if (r.ok) setList(r.data.data); else setNotice(resultNotice(r));
    })();
  }, [request]);

  const open = async (nim) => {
    const r = await request('GET', `/transkrip/${nim}`);
    if (r.ok) { setDetail(r.data.data); setNotice(null); } else setNotice(resultNotice(r));
  };

  return (
    <>
      <Notice notice={notice} />
      <div className="card flush">
        <div className="card-head pad"><div><h2>Transkrip mahasiswa</h2><p className="muted">Admin dapat melihat transkrip seluruh mahasiswa.</p></div></div>
        {!list ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>NIM</th><th>Nama</th><th className="num">Total SKS</th><th className="num">IPK</th><th /></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.nim}>
                    <td>{m.nim}</td><td>{m.nama}</td><td className="num">{m.total_sks}</td><td className="num">{m.ipk.toFixed(2)}</td>
                    <td className="right"><button className="btn btn-outline" onClick={() => open(m.nim)}>Lihat transkrip</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {detail && (
        <div className="card flush">
          <div className="card-head pad"><div><h2>{detail.mahasiswa.nama}</h2><p className="muted">NIM {detail.mahasiswa.nim}, IPK {detail.ipk.toFixed(2)}, {detail.total_sks} SKS</p></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kode</th><th>Mata kuliah</th><th className="num">SKS</th><th className="num">Nilai</th><th>Huruf</th></tr></thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.kode_mk}><td>{i.kode_mk}</td><td>{i.nama_mk}</td><td className="num">{i.sks}</td><td className="num">{i.nilai_angka}</td><td>{i.nilai_huruf}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('audit');
  const nav = [
    { key: 'audit', label: 'Audit log', icon: ScrollText },
    { key: 'transkrip', label: 'Transkrip mahasiswa', icon: FileText },
  ];
  return (
    <AppShell role="admin" title={tab === 'audit' ? 'Audit log' : 'Transkrip mahasiswa'} nav={nav} active={tab} onNav={setTab}>
      {tab === 'audit' ? <AuditLog /> : <Transkrip />}
    </AppShell>
  );
}
