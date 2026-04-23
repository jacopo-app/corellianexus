'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Link from 'next/link';

interface Overview {
  totalMatches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  reliable: boolean;
}

interface Match {
  id: string;
  result: 'win' | 'loss';
  createdAt: string;
  deckVersion: { deck: { name: string } };
  opponentArchetype: { name: string };
}

export default function DashboardPage() {
  const { data: overview } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get('/analytics/overview').then((r) => r.data),
  });

  const { data: matches } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => api.get('/matches').then((r) => r.data),
  });

  const recent = matches?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Matches" value={overview?.totalMatches ?? '—'} />
        <StatCard
          label="Win Rate"
          value={overview?.winrate != null ? `${Math.round(overview.winrate * 100)}%` : '—'}
          sub={!overview?.reliable ? 'low sample' : undefined}
        />
        <StatCard label="W / L" value={overview ? `${overview.wins} / ${overview.losses}` : '—'} />
      </div>

      {/* Recent matches */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Recent Matches</h2>
          <Link href="/dashboard/match" className="text-sm text-blue-400 hover:text-blue-300">
            + New match
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
            No matches yet.{' '}
            <Link href="/dashboard/match" className="text-blue-400 hover:underline">
              Add your first match →
            </Link>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-white text-sm font-medium">{m.deckVersion.deck.name}</span>
                  <span className="text-gray-400 text-sm"> vs </span>
                  <span className="text-gray-300 text-sm">{m.opponentArchetype.name}</span>
                </div>
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded ${
                    m.result === 'win'
                      ? 'bg-green-900/50 text-green-400'
                      : 'bg-red-900/50 text-red-400'
                  }`}
                >
                  {m.result.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-yellow-500 mt-1">{sub}</p>}
    </div>
  );
}
