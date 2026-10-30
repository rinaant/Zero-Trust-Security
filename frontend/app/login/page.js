'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { ROLE_HOME, useApp } from '@/components/Providers';
import { Notice, resultNotice } from '@/components/ui';

const DEMO = [
  { u: 'admin', p: 'admin123', d: 'DEV-ADMIN-01', r: 'Admin' },
  { u: 'dosen.a', p: 'dosenA123', d: 'DEV-DOSEN-A-01', r: 'Dosen, Kelas X' },
  { u: 'dosen.b', p: 'dosenB123', d: 'DEV-DOSEN-B-01', r: 'Dosen, Kelas Y' },
  { u: 'mhs1', p: 'mhs1123', d: 'DEV-MHS-1-01', r: 'Mahasiswa 2021001' },
  { u: 'mhs2', p: 'mhs2123', d: 'DEV-MHS-2-01', r: 'Mahasiswa 2021002' },
  { u: 'mhs3', p: 'mhs3123', d: 'DEV-MHS-3-01', r: 'Mahasiswa 2021003' },
];

export default function LoginPage() {
  const { ready, session, login } = useApp();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '', device: '' });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && session) router.replace(ROLE_HOME[session.user.role]);
  }, [ready, session, router]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const r = await login(form.username.trim(), form.password, form.device.trim());
    if (!r.ok) setNotice(resultNotice(r));
    setBusy(false);
  };

  return (
    <div className="login">
      <section className="login-aside">
        <div className="brand brand-light">
          <ShieldCheck size={24} />
          <div>
            <div className="brand-name">Sistem Nilai</div>
            <div className="brand-sub">Informatika Universitas Siliwangi</div>
          </div>
        </div>
        <div className="login-claims">
          <h2>Setiap permintaan diperiksa ulang.</h2>
          <ul>
            <li>Identitas dan masa berlaku token</li>
            <li>Device yang terdaftar untuk akun</li>
            <li>Jam akses dan kepemilikan data</li>
            <li>Keputusan dicatat pada audit log</li>
          </ul>
        </div>
        <p className="small login-foot">Praktikum Keamanan Informasi, Zero Trust Security (NIST SP 800-207)</p>
      </section>

      <section className="login-main">
        <form className="login-card" onSubmit={submit}>
          <h1>Masuk</h1>
          <p className="muted">Gunakan akun dan perangkat yang telah terdaftar.</p>

          <label className="field">
            <span>Username</span>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>Device ID</span>
            <input className="input" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} placeholder="Contoh: DEV-MHS-1-01" required />
          </label>

          <Notice notice={notice} />
          <button className="btn btn-primary btn-block" disabled={busy}><LogIn size={15} />{busy ? 'Memproses' : 'Masuk'}</button>

          <details className="demo">
            <summary><KeyRound size={14} />Akun demo praktikum</summary>
            <table className="mini-table">
              <tbody>
                {DEMO.map((a) => (
                  <tr key={a.u}>
                    <td><strong>{a.u}</strong><div className="small muted">{a.r}</div></td>
                    <td className="small">{a.d}</td>
                    <td><button type="button" className="btn btn-ghost" onClick={() => setForm({ username: a.u, password: a.p, device: a.d })}>Isi</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </form>
      </section>
    </div>
  );
}
