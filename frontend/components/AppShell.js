'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, LogOut, ShieldCheck } from 'lucide-react';
import { ROLE_HOME, useApp } from '@/components/Providers';
import { Spinner } from '@/components/ui';
import SimPanel from '@/components/SimPanel';

const ROLE_LABEL = { dosen: 'Dosen', mahasiswa: 'Mahasiswa', admin: 'Admin' };

export default function AppShell({ role, title, nav, active, onNav, children }) {
  const { ready, session, sim, logout } = useApp();
  const router = useRouter();
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace('/login');
    else if (session.user.role !== role) router.replace(ROLE_HOME[session.user.role]);
  }, [ready, session, role, router]);

  if (!ready || !session || session.user.role !== role) {
    return <div className="center-screen"><Spinner /></div>;
  }

  const { user } = session;
  const simActive = Boolean(sim.device || sim.time || sim.noToken);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={22} />
          <div>
            <div className="brand-name">Sistem Nilai</div>
            <div className="brand-sub">Informatika UNSIL</div>
          </div>
        </div>
        <nav className="nav" aria-label="Menu utama">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-item ${active === item.key ? 'active' : ''}`}
                onClick={() => onNav && onNav(item.key)}
              >
                <Icon size={16} />{item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="user-card">
            <div className="user-name">{user.nama}</div>
            <div className="user-meta">{ROLE_LABEL[user.role]}{user.nim ? `, NIM ${user.nim}` : ''}</div>
            <div className="user-meta">Device {session.device_id}</div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={logout}><LogOut size={15} />Keluar</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <button className={`btn btn-outline ${simActive ? 'has-dot' : ''}`} onClick={() => setPanel(true)}>
            <FlaskConical size={15} />Simulasi pengujian
          </button>
        </header>
        <main className="content">{children}</main>
      </div>

      <SimPanel open={panel} onClose={() => setPanel(false)} />
    </div>
  );
}
