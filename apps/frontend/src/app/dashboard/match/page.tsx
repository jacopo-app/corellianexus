'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface DeckVersion { id: string; versionNumber: number; sourceUrl?: string }
interface Deck { id: string; name: string; versions: DeckVersion[] }
interface Matchup { opponentArchetypeId: string; name: string }

function OpponentDeckInput({
  value,
  onChange,
  decks,
}: {
  value: string;
  onChange: (v: string) => void;
  decks: Deck[];
}) {
  const [open, setOpen] = useState(false);

  // Flatten all versions that have a sourceUrl
  const savedOptions = decks.flatMap((d) =>
    d.versions
      .filter((v) => v.sourceUrl)
      .map((v) => ({ label: `${d.name} — v${v.versionNumber}`, url: v.sourceUrl! }))
  );

  const isUrl = value.startsWith('http');

  return (
    <div className="relative">
      <label className="block text-sm text-gray-400 mb-2">
        Opponent Decklist <span className="text-gray-600">(optional)</span>
      </label>

      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(false); }}
          placeholder="Incolla URL oppure scegli dal menu →"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
        />
        {savedOptions.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`px-3 py-2 rounded-lg border text-sm transition-colors flex-shrink-0 ${
              open ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            ▾
          </button>
        )}
      </div>

      {/* Saved decks dropdown */}
      {open && savedOptions.length > 0 && (
        <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 overflow-hidden shadow-xl">
          <p className="px-3 py-1.5 text-xs text-gray-600 uppercase tracking-wider border-b border-gray-700">Saved decks</p>
          {savedOptions.map((opt) => (
            <button
              key={opt.url}
              onClick={() => { onChange(opt.url); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between gap-2"
            >
              <span className="truncate">{opt.label}</span>
              <span className="text-gray-600 text-xs flex-shrink-0">saved</span>
            </button>
          ))}
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-700 border-t border-gray-700"
          >
            Inserisci URL manualmente
          </button>
        </div>
      )}

      {/* Show selected label if it's a known saved deck */}
      {isUrl && !open && savedOptions.find((o) => o.url === value) && (
        <p className="text-xs text-gray-500 mt-1 truncate">
          {savedOptions.find((o) => o.url === value)?.label}
        </p>
      )}
    </div>
  );
}

// Derive overall result from game scores
function deriveResult(games: string[]): 'win' | 'loss' | null {
  const wins   = games.filter((g) => g === 'W').length;
  const losses = games.filter((g) => g === 'L').length;
  if (wins >= 2)   return 'win';
  if (losses >= 2) return 'loss';
  return null;
}

export default function MatchPage() {
  const qc = useQueryClient();

  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [opponent, setOpponent]                   = useState('');
  const [opponentDeckUrl, setOpponentDeckUrl]     = useState('');
  const [initiative, setInitiative]               = useState<'first' | 'second' | ''>('');
  const [games, setGames]                         = useState<string[]>([]); // 'W' | 'L'
  const [saved, setSaved]                         = useState(false);

  const { data: decks = [] } = useQuery<Deck[]>({
    queryKey: ['decks'],
    queryFn: () => api.get('/decks').then((r) => r.data),
  });

  const { data: matchups = [] } = useQuery<Matchup[]>({
    queryKey: ['matchups'],
    queryFn: () => api.get('/analytics/matchups').then((r) => r.data),
  });

  const versions = decks.flatMap((d) => d.versions.map((v) => ({ ...v, deckName: d.name })));
  const activeVersionId = selectedVersionId || versions[0]?.id || '';
  const result = deriveResult(games);
  const canSave = !!opponent && !!activeVersionId && result !== null;

  const knownArchetypes = matchups.map((m) => m.name);
  const filteredArchetypes = opponent
    ? knownArchetypes.filter((a) => a.toLowerCase().includes(opponent.toLowerCase()) && a.toLowerCase() !== opponent.toLowerCase())
    : [];

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/matches', {
        deckVersionId: activeVersionId,
        opponentArchetype: opponent,
        result,
        initiative: initiative || undefined,
        games,
        opponentDeckUrl: opponentDeckUrl.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['matchups'] });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setOpponent('');
        setOpponentDeckUrl('');
        setInitiative('');
        setGames([]);
      }, 1500);
    },
  });

  function addGame(g: 'W' | 'L') {
    if (result !== null) return; // already finished
    setGames((prev) => [...prev, g]);
  }

  function resetGames() {
    setGames([]);
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-2">
        <div className="text-4xl">✓</div>
        <p className="text-green-400 text-xl font-semibold">Match saved!</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">New Match</h1>

      {/* Deck */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Deck</label>
        <select
          value={activeVersionId}
          onChange={(e) => setSelectedVersionId(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>{v.deckName} — v{v.versionNumber}</option>
          ))}
        </select>
      </div>

      {/* Opponent archetype */}
      <div className="relative">
        <label className="block text-sm text-gray-400 mb-2">Opponent Archetype</label>
        <input
          type="text"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Vader Control"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
        />
        {filteredArchetypes.length > 0 && (
          <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 overflow-hidden">
            {filteredArchetypes.map((a) => (
              <button key={a} onClick={() => setOpponent(a)} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700">
                {a}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Opponent deck URL or saved deck */}
      <OpponentDeckInput
        value={opponentDeckUrl}
        onChange={setOpponentDeckUrl}
        decks={decks}
      />

      {/* Iniziativa */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Iniziativa <span className="text-gray-600">(optional)</span></label>
        <div className="grid grid-cols-2 gap-2">
          {(['first', 'second'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setInitiative((prev) => prev === v ? '' : v)}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                initiative === v
                  ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                  : 'border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {v === 'first' ? 'First' : 'Second'}
            </button>
          ))}
        </div>
      </div>

      {/* Game-by-game score */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Risultato partite</label>
          {games.length > 0 && (
            <button onClick={resetGames} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Reset
            </button>
          )}
        </div>

        {/* Score display */}
        <div className="flex items-center gap-2 mb-3 min-h-[36px]">
          {games.map((g, i) => (
            <span
              key={i}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold border ${
                g === 'W'
                  ? 'bg-green-900/40 text-green-400 border-green-800/50'
                  : 'bg-red-900/40 text-red-400 border-red-800/50'
              }`}
            >
              {g}
            </span>
          ))}
          {games.length === 0 && (
            <span className="text-gray-700 text-sm">Nessuna partita registrata</span>
          )}
          {result && (
            <span className={`ml-auto text-sm font-bold px-3 py-1 rounded-lg border ${
              result === 'win'
                ? 'bg-green-900/50 text-green-400 border-green-800'
                : 'bg-red-900/50 text-red-400 border-red-800'
            }`}>
              {result === 'win' ? 'VITTORIA' : 'SCONFITTA'} {games.filter(g=>g==='W').length}-{games.filter(g=>g==='L').length}
            </span>
          )}
        </div>

        {/* W / L buttons per game */}
        {result === null && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => addGame('W')}
              disabled={!opponent || !activeVersionId}
              className="py-5 bg-green-800 hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-xl font-bold text-white transition-colors"
            >
              W
            </button>
            <button
              onClick={() => addGame('L')}
              disabled={!opponent || !activeVersionId}
              className="py-5 bg-red-900 hover:bg-red-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-xl font-bold text-white transition-colors"
            >
              L
            </button>
          </div>
        )}
      </div>

      {/* Save */}
      {result !== null && (
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full py-4 rounded-xl text-base font-bold text-white border-2 transition-colors disabled:opacity-50 bg-gray-800 hover:bg-gray-700 border-gray-600"
        >
          {mutation.isPending ? 'Saving…' : 'Save Match'}
        </button>
      )}

      {!activeVersionId && (
        <p className="text-yellow-500 text-sm text-center">Import a deck first.</p>
      )}
    </div>
  );
}
