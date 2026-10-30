'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp, ROLE_HOME } from '@/components/Providers';
import { Spinner } from '@/components/ui';

export default function Home() {
  const { ready, session } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(session ? ROLE_HOME[session.user.role] : '/login');
  }, [ready, session, router]);
  return <div className="center-screen"><Spinner /></div>;
}
