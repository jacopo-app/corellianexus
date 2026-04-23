'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';

interface DeckVersion {
  id: string;
  versionNumber: number;
}

interface Deck {
  id: string;
  name: string;
  createdAt: string;
  versions: DeckVersion[];
  _count: { versions: number };
}

export default function DecksPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [importError, setImportError] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: decks = [], isLoading } = useQuery<Deck[]>({
    queryKey: ['decks'],
    queryFn: () => api.get('/decks').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (deckId: string) => api.delete(`/decks/${deckId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['matchups'] });
      setConfirmDeleteId(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: (payload: { url: string; name?: string }) =>
      api.post('/decks/import', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      setUrl('');
      setName('');
      setImportError('');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Import failed';
      setImportError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Decks</h1>

      {/* Import form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Import from SWUDB</h2>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://swudb.com/deck/..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Deck name (optional)"
            className="w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => importMutation.mutate({ url, name: name || undefined })}
            disabled={!url || importMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {importMutation.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
        {importError && <p className="text-red-400 text-sm mt-2">{importError}</p>}
      </div>

      {/* Deck list */}
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="text-gray-500">No decks yet. Import one above.</p>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
          {decks.map((deck) => (
            <div key={deck.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
              <Link href={`/dashboard/decks/${deck.id}`} className="flex-1 min-w-0">
                <p className="text-white font-medium">{deck.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {deck._count.versions} version{deck._count.versions !== 1 ? 's' : ''} · Latest: v
                  {deck.versions[0]?.versionNumber ?? 1}
                </p>
              </Link>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {confirmDeleteId === deck.id ? (
                  <>
                    <span className="text-gray-400 text-xs">Delete?</span>
                    <button
                      onClick={() => deleteMutation.mutate(deck.id)}
                      disabled={deleteMutation.isPending}
                      className="text-xs px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-medium transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    <Link href={`/dashboard/decks/${deck.id}`} className="text-gray-400 text-xs hover:text-white transition-colors">→</Link>
                    <button
                      onClick={() => setConfirmDeleteId(deck.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
