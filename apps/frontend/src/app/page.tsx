'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth';
import AuthForm from '@/components/AuthForm';

export default function Home() {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.push('/dashboard');
  }, [token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/Logo.png"
            alt="Corellia Nexus"
            width={200}
            height={200}
            className="mx-auto mb-4 logo-3d"
            priority
          />
          <p className="text-gray-400 text-sm">Track less. Understand more. Win smarter.</p>
        </div>
        <AuthForm />
      </div>
    </main>
  );
}
