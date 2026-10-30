'use client';
import { CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  const Icon = notice.type === 'error' ? XCircle : notice.type === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`notice notice-${notice.type}`} role="status">
      <Icon size={16} className="notice-icon" />
      <div className="notice-body">
        {notice.title && <strong>{notice.title}</strong>}
        <span>{notice.text}</span>
      </div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Tutup pesan"><X size={14} /></button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Memuat data' }) {
  return <div className="loading"><Loader2 size={16} className="spin" />{label}</div>;
}

export function Modal({ title, children, actions, onClose }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function formatWaktu(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

// Mengubah respons gateway menjadi pesan untuk pengguna.
export function resultNotice(r, successText) {
  if (r.ok) return { type: 'success', text: successText || r.data?.message || 'Berhasil' };
  return {
    type: 'error',
    title: r.status === 0 ? 'Tidak terhubung' : `Ditolak (HTTP ${r.status})`,
    text: r.data?.message || 'Permintaan gagal diproses',
  };
}
