'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
export const ROLE_HOME = { dosen: '/dosen', mahasiswa: '/mahasiswa', admin: '/admin' };

const SESSION_KEY = 'zt_session';
const SIM_KEY = 'zt_sim';
const DEFAULT_SIM = { device: '', time: '', noToken: false };

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sim, setSimState] = useState(DEFAULT_SIM);
  const [log, setLog] = useState([]);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef(null);
  const simRef = useRef(DEFAULT_SIM);
  const refreshing = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s) { sessionRef.current = s; setSession(s); }
      const m = JSON.parse(sessionStorage.getItem(SIM_KEY));
      if (m) { simRef.current = { ...DEFAULT_SIM, ...m }; setSimState(simRef.current); }
    } catch { /* abaikan */ }
    setReady(true);
  }, []);

  const saveSession = useCallback((s) => {
    sessionRef.current = s;
    setSession(s);
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* abaikan */ }
  }, []);

  const setSim = useCallback((patch) => {
    const next = { ...simRef.current, ...patch };
    simRef.current = next;
    setSimState(next);
    try { sessionStorage.setItem(SIM_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }, []);

  const pushLog = useCallback((entry) => {
    setLog((prev) => [{ ...entry, at: new Date() }, ...prev].slice(0, 15));
  }, []);

  const rawFetch = useCallback(async (method, path, { body, token, headers: extra } = {}) => {
    const headers = { ...extra };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const device = simRef.current.device || sessionRef.current?.device_id || '';
    if (device && !headers['X-Device-ID']) headers['X-Device-ID'] = device;
    if (simRef.current.time) headers['X-Demo-Time'] = simRef.current.time;
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(GATEWAY_URL + path, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch { /* tanpa body */ }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { message: `Gateway tidak dapat dihubungi di ${GATEWAY_URL}` } };
    }
  }, []);

  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s?.refresh_token) return false;
    if (!refreshing.current) {
      refreshing.current = (async () => {
        const r = await rawFetch('POST', '/auth/refresh', { body: { refresh_token: s.refresh_token } });
        refreshing.current = null;
        if (r.ok) {
          saveSession({ ...s, access_token: r.data.access_token, refresh_token: r.data.refresh_token });
          return true;
        }
        if (r.status === 401) saveSession(null); // sesi tidak berlaku lagi
        return false;
      })();
    }
    return refreshing.current;
  }, [rawFetch, saveSession]);

  // Request terautentikasi ke gateway; otomatis refresh token saat access token kedaluwarsa.
  const request = useCallback(async (method, path, body) => {
    const useToken = !simRef.current.noToken;
    const tokenNow = () => (useToken ? sessionRef.current?.access_token : undefined);
    let r = await rawFetch(method, path, { body, token: tokenNow() });
    if (r.status === 401 && useToken && /kedaluwarsa/i.test(r.data?.message || '') && (await refresh())) {
      r = await rawFetch(method, path, { body, token: tokenNow() });
    }
    pushLog({ method, path, status: r.status, message: r.data?.message || (r.ok ? 'OK' : '') });
    return r;
  }, [rawFetch, refresh, pushLog]);

  const login = useCallback(async (username, password, device) => {
    const r = await rawFetch('POST', '/auth/login', { body: { username, password }, headers: { 'X-Device-ID': device } });
    pushLog({ method: 'POST', path: '/auth/login', status: r.status, message: r.data?.message || (r.ok ? 'Login berhasil' : '') });
    if (r.ok) {
      setSim(DEFAULT_SIM);
      saveSession({
        access_token: r.data.access_token, refresh_token: r.data.refresh_token,
        user: r.data.user, device_id: device,
      });
    }
    return r;
  }, [rawFetch, pushLog, saveSession, setSim]);

  const logout = useCallback(async () => {
    const s = sessionRef.current;
    if (s?.refresh_token) await rawFetch('POST', '/auth/logout', { body: { refresh_token: s.refresh_token } });
    saveSession(null);
    setSim(DEFAULT_SIM);
    setLog([]);
  }, [rawFetch, saveSession, setSim]);

  const value = useMemo(
    () => ({ ready, session, sim, setSim, log, request, login, logout }),
    [ready, session, sim, setSim, log, request, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
