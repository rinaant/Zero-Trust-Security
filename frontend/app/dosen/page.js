'use client';
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Lock, Save } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useApp } from '@/components/Providers';
import { Modal, Notice, Pill, Spinner, resultNotice } from '@/components/ui';

function Penilaian() {
  const { request } = useApp();
  const [kelas, setKelas] = useState([]);
  const [kelasId, setKelasId] = useState(null);
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadKelas = useCallback(async () => {
    const r = await request('GET', '/kelas');
    if (!r.ok) { setNotice(resultNotice(r)); setLoading(false); return; }
    setKelas(r.data.data);
    setKelasId((cur) => cur ?? r.data.data[0]?.id ?? null);
    if (r.data.data.length === 0) setLoading(false);
  }, [request]);

  const loadRows = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    const r = await request('GET', `/nilai?kelas_id=${id}`);
    if (r.ok) { setRows(r.data.data); setEdits({}); } else setNotice(resultNotice(r));
    setLoading(false);
  }, [request]);

  useEffect(() => { loadKelas(); }, [loadKelas]);
  useEffect(() => { loadRows(kelasId); }, [kelasId, loadRows]);

  const current = kelas.find((k) => k.id === kelasId);
  const semuaFinal = rows.length > 0 && rows.every((r) => r.final);

  const simpan = async (row) => {
    setBusy(true);
    const r = await request('PUT', `/nilai/${row.id}`, { nilai_angka: Number(edits[row.id]) });
    setNotice(resultNotice(r, `Nilai ${row.nama_mahasiswa} disimpan`));
    if (r.ok) await loadRows(kelasId);
    setBusy(false);
  };

  const finalisasi = async () => {
    setConfirm(false);
    setBusy(true);
    const r = await request('POST', `/kelas/${kelasId}/finalisasi`);
    setNotice(resultNotice(r));
    await Promise.all([loadRows(kelasId), loadKelas()]);
    setBusy(false);
  };

  return (
    <>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {current && (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{current.nama_mk}</h2>
              <p className="muted">{current.nama_kelas}, kode {current.kode_mk}, {current.sks} SKS</p>
            </div>
            <div className="card-actions">
              {kelas.length > 1 && (
                <select className="input" value={kelasId} onChange={(e) => setKelasId(Number(e.target.value))} aria-label="Pilih kelas">
                  {kelas.map((k) => <option key={k.id} value={k.id}>{k.nama_kelas}</option>)}
                </select>
              )}
              <button className="btn btn-primary" disabled={busy || loading || semuaFinal} onClick={() => setConfirm(true)}>
                <Lock size={14} />Finalisasi kelas
              </button>
            </div>
          </div>
          <p className="small muted">
            {current.jumlah_final} dari {current.jumlah_mahasiswa} nilai sudah final. Nilai yang telah final tidak dapat diubah dan dikirim ke transkrip mahasiswa.
          </p>
        </div>
      )}

      <div className="card flush">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <p className="empty">Belum ada kelas atau peserta yang dapat ditampilkan.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>NIM</th><th>Nama</th><th className="num">Nilai angka</th><th>Huruf</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const edited = edits[row.id] !== undefined && edits[row.id] !== '' && Number(edits[row.id]) !== row.nilai_angka;
                  return (
                    <tr key={row.id}>
                      <td>{row.nim}</td>
                      <td>{row.nama_mahasiswa}</td>
                      <td className="num">
                        <input
                          className="input input-num" type="number" min="0" max="100" step="0.01"
                          disabled={Boolean(row.final)}
                          value={edits[row.id] ?? row.nilai_angka ?? ''}
                          onChange={(e) => setEdits({ ...edits, [row.id]: e.target.value })}
                          aria-label={`Nilai ${row.nama_mahasiswa}`}
                        />
                      </td>
                      <td>{row.nilai_huruf || '-'}</td>
                      <td>{row.final ? <Pill tone="ok">Final</Pill> : <Pill tone="warn">Draft</Pill>}</td>
                      <td className="right">
                        <button className="btn btn-outline" disabled={!edited || busy || Boolean(row.final)} onClick={() => simpan(row)}>
                          <Save size={14} />Simpan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && (
        <Modal
          title={`Finalisasi ${current?.nama_kelas}`}
          onClose={() => setConfirm(false)}
          actions={(
            <>
              <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Batal</button>
              <button className="btn btn-primary" onClick={finalisasi}>Finalisasi</button>
            </>
          )}
        >
          Seluruh nilai pada kelas ini akan dikunci, lalu dikirim ke Service Transkrip melalui gateway. Tindakan ini tidak dapat dibatalkan.
        </Modal>
      )}
    </>
  );
}

export default function DosenPage() {
  return (
    <AppShell role="dosen" title="Penilaian" nav={[{ key: 'nilai', label: 'Penilaian kelas', icon: ClipboardList }]} active="nilai">
      <Penilaian />
    </AppShell>
  );
}
