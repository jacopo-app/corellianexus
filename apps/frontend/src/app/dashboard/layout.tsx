'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!token) router.push('/');
  }, [token, router]);

  if (!token) return null;

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/decks', label: 'Decks' },
    { href: '/dashboard/analytics', label: 'Analytics' },
    { href: '/dashboard/match', label: '+ Match' },
    { href: '/dashboard/meta', label: 'Meta' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Image src="/Logo.png" alt="Corellia Nexus" width={80} height={80} className="logo-3d" />
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:text-white'
                  } ${item.label.startsWith('+') ? 'bg-blue-600 hover:bg-blue-500 text-white' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <button
            onClick={() => { logout(); router.push('/'); }}
            className="text-sm text-gray-400 hover:text-white"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
