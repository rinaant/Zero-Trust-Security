'use client';
import { useCallback, useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useApp } from '@/components/Providers';
import { Notice, Pill, Spinner, resultNotice } from '@/components/ui';

function Content() {
  const { session, request } = useApp();
  const ownNim = session.user.nim;
  const [nilai, setNilai] = useState(null);
  const [transkrip, setTranskrip] = useState(null);
  const [nim, setNim] = useState(ownNim);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTranskrip = useCallback(async (target) => {
    const r = await request('GET', `/transkrip/${encodeURIComponent(target)}`);
    if (r.ok) { setTranskrip(r.data.data); setNotice(null); } else { setTranskrip(null); setNotice(resultNotice(r)); }
  }, [request]);

  useEffect(() => {
    (async () => {
      const r = await request('GET', '/nilai');
      if (r.ok) setNilai(r.data.data); else setNotice(resultNotice(r));
      await loadTranskrip(ownNim);
      setLoading(false);
    })();
  }, [request, loadTranskrip, ownNim]);

  if (loading) return <Spinner />;

  return (
    <>
      <div className="card flush">
        <div className="card-head pad">
          <div><h2>Nilai semester berjalan</h2><p className="muted">Nilai berstatus final akan masuk ke transkrip.</p></div>
        </div>
        {nilai && nilai.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kode</th><th>Mata kuliah</th><th>Kelas</th><th className="num">SKS</th><th className="num">Nilai</th><th>Huruf</th><th>Status</th></tr></thead>
              <tbody>
                {nilai.map((n) => (
                  <tr key={n.id}>
                    <td>{n.kode_mk}</td><td>{n.nama_mk}</td><td>{n.nama_kelas}</td>
                    <td className="num">{n.sks}</td><td className="num">{n.nilai_angka ?? '-'}</td><td>{n.nilai_huruf ?? '-'}</td>
                    <td>{n.final ? <Pill tone="ok">Final</Pill> : <Pill tone="warn">Draft</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Belum ada nilai.</p>}
      </div>

      <div className="card flush">
        <div className="card-head pad">
          <div><h2>Transkrip nilai</h2>
            <p className="muted">{transkrip ? `${transkrip.mahasiswa.nama}, NIM ${transkrip.mahasiswa.nim}` : `NIM ${nim}`}</p></div>
          <form className="card-actions" onSubmit={(e) => { e.preventDefault(); loadTranskrip(nim.trim()); }}>
            <input className="input" value={nim} onChange={(e) => setNim(e.target.value)} aria-label="NIM transkrip" placeholder="NIM" />
            <button className="btn btn-outline"><Search size={14} />Tampilkan</button>
          </form>
        </div>
        <div className="pad-x"><Notice notice={notice} /></div>
        {transkrip && (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Kode</th><th>Mata kuliah</th><th className="num">SKS</th><th className="num">Nilai</th><th>Huruf</th></tr></thead>
                <tbody>
                  {transkrip.items.map((i) => (
                    <tr key={i.kode_mk}><td>{i.kode_mk}</td><td>{i.nama_mk}</td><td className="num">{i.sks}</td><td className="num">{i.nilai_angka}</td><td>{i.nilai_huruf}</td></tr>
                  ))}
                  {transkrip.items.length === 0 && <tr><td colSpan={5} className="empty">Transkrip masih kosong.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="summary">
              <div><span className="muted">Total SKS</span><strong>{transkrip.total_sks}</strong></div>
              <div><span className="muted">IPK</span><strong>{transkrip.ipk.toFixed(2)}</strong></div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function MahasiswaPage() {
  return (
    <AppShell role="mahasiswa" title="Nilai dan transkrip" nav={[{ key: 'nilai', label: 'Nilai dan transkrip', icon: FileText }]} active="nilai">
      <Content />
    </AppShell>
  );
}
