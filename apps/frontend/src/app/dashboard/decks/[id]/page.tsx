'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import api from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CardData {
  id: string;
  name: string;
  subtitle?: string;
  type: string;
  aspects: string[];
  traits: string[];
  arenas: string[];
  cost?: string;
  power?: string;
  hp?: string;
  frontText?: string;
  backText?: string;
  epicAction?: string;
  rarity: string;
  unique: boolean;
  doubleSided: boolean;
  frontArt: string;
  backArt?: string;
}

interface DecklistCard {
  cardId: string;
  quantity: number;
  slot: string;
  card: CardData;
}

interface DecklistResponse {
  deck: { id: string; name: string };
  version: { id: string; versionNumber: number };
  allVersions: { id: string; versionNumber: number }[];
  cards: DecklistCard[];
}

interface DiffCard {
  cardId: string;
  qtyA: number;
  qtyB: number;
  delta: number;
  card: CardData;
}

interface DeckAnalytics {
  totalMatches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  byVersion: { deckVersionId: string; versionNumber: number; totalMatches: number; wins: number; winrate: number | null }[];
  byMatchup: { opponentArchetypeId: string; name: string; totalMatches: number; wins: number; winrate: number | null; reliable: boolean }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_ORDER = ['Unit', 'Event', 'Upgrade'];

const ASPECT_COLORS: Record<string, string> = {
  Aggression: '#c0392b',
  Cunning:    '#d4a017',
  Heroism:    '#27ae60',
  Villainy:   '#8e44ad',
  Vigilance:  '#2980b9',
  Command:    '#e67e22',
};

function aspectGlow(aspects: string[]): string {
  const color = ASPECT_COLORS[aspects[0]];
  return color ? `0 0 16px ${color}66` : 'none';
}

function isLeader(c: DecklistCard) {
  return c.slot === 'leader' || c.slot === 'secondleader' || c.card.type === 'Leader';
}
function isBase(c: DecklistCard) {
  return c.slot === 'base' || c.card.type === 'Base';
}

function sortByType(cards: DecklistCard[]) {
  const sideboard = cards.filter((c) => c.slot === 'sideboard');
  const nonSide   = cards.filter((c) => c.slot !== 'sideboard');

  const leader = nonSide.filter(isLeader);
  const base   = nonSide.filter(isBase);
  const deck   = nonSide.filter((c) => !isLeader(c) && !isBase(c));

  const groups: { type: string; cards: DecklistCard[] }[] = [];
  for (const t of TYPE_ORDER) {
    const g = deck
      .filter((c) => c.card.type === t)
      .sort((a, b) => parseInt(a.card.cost ?? '99') - parseInt(b.card.cost ?? '99'));
    if (g.length) groups.push({ type: t, cards: g });
  }
  const knownTypes = new Set([...TYPE_ORDER, 'Leader', 'Base']);
  const other = deck.filter((c) => !knownTypes.has(c.card.type));

  const sideGroups: { type: string; cards: DecklistCard[] }[] = [];
  for (const t of TYPE_ORDER) {
    const g = sideboard
      .filter((c) => c.card.type === t)
      .sort((a, b) => parseInt(a.card.cost ?? '99') - parseInt(b.card.cost ?? '99'));
    if (g.length) sideGroups.push({ type: t, cards: g });
  }
  const sideOther = sideboard.filter((c) => !knownTypes.has(c.card.type));
  if (sideOther.length) sideGroups.push({ type: 'Other', cards: sideOther });

  return { leader, base, groups, other, sideGroups };
}

// ─── LandscapeThumb: Leader / Base ────────────────────────────────────────────

function LandscapeThumb({
  dc,
  onClick,
  width = 200,
}: {
  dc: DecklistCard;
  onClick: (c: CardData) => void;
  width?: number;
}) {
  const [hovered, setHovered] = useState(false);
  // CDN images are 1560×1117 (landscape). Display at same ratio.
  const height = Math.round(width * (1117 / 1560));

  return (
    <button
      onClick={() => onClick(dc.card)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width,
        height,
        flexShrink: 0,
        display: 'block',
        boxShadow: hovered ? aspectGlow(dc.card.aspects) : 'none',
        transform: hovered ? 'scale(1.02)' : 'none',
        transition: 'all 0.15s ease',
      }}
      className="rounded-lg overflow-hidden border border-white/10 hover:border-white/25"
    >
      <Image
        src={dc.card.frontArt}
        alt={dc.card.name}
        width={width}
        height={height}
        style={{ width, height, objectFit: 'cover', display: 'block' }}
        unoptimized
      />
    </button>
  );
}

// ─── CardThumb: Unit / Event / Upgrade ────────────────────────────────────────
// CDN images are landscape; shown portrait via objectFit cover (crops sides).

function CardThumb({
  dc,
  onClick,
  width = 78,
}: {
  dc: DecklistCard;
  onClick: (c: CardData) => void;
  width?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const height = Math.round(width * 1.4);

  return (
    <button
      onClick={() => onClick(dc.card)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width,
        height,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hovered ? aspectGlow(dc.card.aspects) : 'none',
        transform: hovered ? 'translateY(-2px) scale(1.03)' : 'none',
        transition: 'all 0.15s ease',
      }}
      className="rounded-md border border-white/10 hover:border-white/30"
    >
      <Image
        src={dc.card.frontArt}
        alt={dc.card.name}
        fill
        style={{ objectFit: 'cover' }}
        unoptimized
      />
      {dc.quantity > 1 && (
        <div
          style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)' }}
          className="bg-black/85 border border-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm"
        >
          ×{dc.quantity}
        </div>
      )}
    </button>
  );
}

// ─── Card Modal ───────────────────────────────────────────────────────────────

function CardModal({ card, onClose }: { card: CardData; onClose: () => void }) {
  const [showBack, setShowBack] = useState(false);
  const isLandscape = ['Leader', 'Base'].includes(card.type);
  const imgW = isLandscape ? 280 : 160;
  const imgH = isLandscape ? Math.round(imgW * (1117 / 1560)) : Math.round(imgW * 1.4);

  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl border border-white/10 max-w-lg w-full overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 0 40px ${ASPECT_COLORS[card.aspects[0]] ?? '#ffffff'}33` }}
      >
        <div className="flex gap-4 p-5">
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <Image
              src={showBack && card.backArt ? card.backArt : card.frontArt}
              alt={card.name}
              width={imgW}
              height={imgH}
              style={{ width: imgW, height: imgH, objectFit: 'cover', display: 'block' }}
              className="rounded-lg"
              unoptimized
            />
            {card.doubleSided && (
              <button
                onClick={() => setShowBack((b) => !b)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showBack ? '← Front' : 'Back side →'}
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">{card.name}</h2>
                {card.subtitle && <p className="text-gray-400 text-sm italic">{card.subtitle}</p>}
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-2">×</button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{card.type}</span>
              {card.aspects.map((a) => (
                <span
                  key={a}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${ASPECT_COLORS[a] ?? '#555'}33`, color: ASPECT_COLORS[a] ?? '#ccc' }}
                >
                  {a}
                </span>
              ))}
              {card.unique && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400">Unique</span>}
            </div>

            {(card.cost || card.power || card.hp) && (
              <div className="flex gap-4 mb-3 pb-3 border-b border-white/10">
                {card.cost  && <StatPill label="Cost"  value={card.cost} />}
                {card.power && <StatPill label="Power" value={card.power} />}
                {card.hp    && <StatPill label="HP"    value={card.hp} />}
              </div>
            )}

            {card.traits.length > 0 && (
              <p className="text-gray-500 text-xs italic mb-2">{card.traits.join(' · ')}</p>
            )}
            {card.frontText && (
              <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line">{card.frontText}</p>
            )}
            {card.epicAction && (
              <p className="text-yellow-400 text-xs leading-relaxed mt-2 whitespace-pre-line border-t border-yellow-900/40 pt-2">
                {card.epicAction}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-gray-500 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-white font-bold text-lg leading-none">{value}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);
  const [compareVersionId, setCompareVersionId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'decklist' | 'stats' | 'diff'>('decklist');
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);

  const { data: decklist, isLoading } = useQuery<DecklistResponse>({
    queryKey: ['decklist', id, selectedVersionId],
    queryFn: () =>
      api.get(`/decks/${id}/decklist`, {
        params: selectedVersionId ? { versionId: selectedVersionId } : {},
      }).then((r) => r.data),
  });

  const { data: analytics } = useQuery<DeckAnalytics>({
    queryKey: ['deck-analytics', id],
    queryFn: () => api.get(`/analytics/deck/${id}`).then((r) => r.data),
  });

  const allVersions = decklist?.allVersions ?? [];
  const currentVersionId = selectedVersionId ?? allVersions[0]?.id;
  const canDiff = allVersions.length >= 2;
  const diffFromId = compareVersionId ?? allVersions[allVersions.length - 2]?.id;

  const { data: diff } = useQuery<DiffCard[]>({
    queryKey: ['diff', id, diffFromId, currentVersionId],
    queryFn: () =>
      api.get(`/decks/${id}/diff`, { params: { from: diffFromId, to: currentVersionId } }).then((r) => r.data),
    enabled: activeTab === 'diff' && canDiff && !!diffFromId && !!currentVersionId,
  });

  const { leader, base, groups, other, sideGroups } = decklist
    ? sortByType(decklist.cards)
    : { leader: [], base: [], groups: [], other: [], sideGroups: [] };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/decks')} className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Decks
        </button>
        <h1 className="text-2xl font-bold text-white">{decklist?.deck.name ?? '…'}</h1>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 items-center">
          <span className="text-gray-500 text-xs uppercase tracking-wider">Version</span>
          <div className="flex gap-1">
            {allVersions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(v.id)}
                className={`px-3 py-1 text-sm rounded-lg font-medium transition-all ${
                  currentVersionId === v.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                v{v.versionNumber}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['decklist', 'stats', 'diff'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              disabled={tab === 'diff' && !canDiff}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors disabled:opacity-30 ${
                activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'decklist' ? 'Decklist' : tab === 'stats' ? 'Stats' : 'Diff'}
            </button>
          ))}
        </div>
      </div>

      {/* ── DECKLIST TAB ── */}
      {activeTab === 'decklist' && (
        isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-500">Loading cards…</div>
        ) : (
          <div className="flex gap-5 items-start">

            {/* LEFT — Leader + Base */}
            <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 200 }}>
              {leader.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600 uppercase tracking-widest text-center">Leader</span>
                  <LandscapeThumb dc={leader[0]} onClick={setSelectedCard} width={200} />
                </div>
              )}
              {base.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600 uppercase tracking-widest text-center">Base</span>
                  <LandscapeThumb dc={base[0]} onClick={setSelectedCard} width={200} />
                </div>
              )}
              {leader[0]?.card.aspects.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {leader[0].card.aspects.map((a) => (
                    <span
                      key={a}
                      className="text-xs px-2 py-0.5 rounded-full font-medium text-center"
                      style={{
                        backgroundColor: `${ASPECT_COLORS[a] ?? '#555'}22`,
                        color: ASPECT_COLORS[a] ?? '#ccc',
                        border: `1px solid ${ASPECT_COLORS[a] ?? '#555'}44`,
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
              {other.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  {other.map((dc) => (
                    <LandscapeThumb key={dc.cardId} dc={dc} onClick={setSelectedCard} width={200} />
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — Unit / Event / Upgrade + Sideboard */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {groups.map(({ type, cards }) => {
                const total = cards.reduce((s, c) => s + c.quantity, 0);
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{type}</span>
                      <span className="text-xs text-gray-700">{total}</span>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cards.map((dc) => (
                        <CardThumb key={dc.cardId} dc={dc} onClick={setSelectedCard} width={78} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Sideboard */}
              {sideGroups.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-yellow-600 uppercase tracking-widest">Sideboard</span>
                    <span className="text-xs text-gray-700">
                      {sideGroups.reduce((s, g) => s + g.cards.reduce((ss, c) => ss + c.quantity, 0), 0)}
                    </span>
                    <div className="flex-1 h-px bg-yellow-900/30" />
                  </div>
                  <div className="flex flex-col gap-3">
                    {sideGroups.map(({ type, cards }) => {
                      const total = cards.reduce((s, c) => s + c.quantity, 0);
                      return (
                        <div key={type}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">{type}</span>
                            <span className="text-xs text-gray-700">{total}</span>
                            <div className="flex-1 h-px bg-white/5" />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {cards.map((dc) => (
                              <CardThumb key={dc.cardId} dc={dc} onClick={setSelectedCard} width={78} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        )
      )}

      {/* ── STATS TAB ── */}
      {activeTab === 'stats' && analytics && (
        <div className="space-y-5">
          {/* Overview row */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Matches</p>
              <p className="text-2xl font-bold text-white">{analytics.totalMatches}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">W</p>
              <p className="text-2xl font-bold text-green-400">{analytics.wins}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">L</p>
              <p className="text-2xl font-bold text-red-400">{analytics.losses}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Win Rate</p>
              {analytics.winrate != null
                ? <WinrateBar value={analytics.winrate} />
                : <span className="text-gray-600">—</span>
              }
            </div>
          </div>

          {/* By Version */}
          {analytics.byVersion.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-white mb-3">By Version</h2>
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Version</th>
                      <th className="text-center px-4 py-3">G</th>
                      <th className="text-center px-4 py-3">W</th>
                      <th className="text-center px-4 py-3">L</th>
                      <th className="text-center px-4 py-3">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {analytics.byVersion.map((v) => (
                      <tr key={v.deckVersionId} className="hover:bg-gray-800/40">
                        <td className="px-4 py-3 text-white font-medium">v{v.versionNumber}</td>
                        <td className="px-4 py-3 text-center text-gray-300">{v.totalMatches}</td>
                        <td className="px-4 py-3 text-center text-green-400">{v.wins}</td>
                        <td className="px-4 py-3 text-center text-red-400">{v.totalMatches - v.wins}</td>
                        <td className="px-4 py-3 text-center">
                          {v.winrate != null ? <WinrateBar value={v.winrate} /> : <span className="text-gray-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Matchups */}
          {analytics.byMatchup.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-white mb-3">Matchups</h2>
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Archetype</th>
                      <th className="text-center px-4 py-3">G</th>
                      <th className="text-center px-4 py-3">W</th>
                      <th className="text-center px-4 py-3">L</th>
                      <th className="text-center px-4 py-3">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {analytics.byMatchup.map((m) => (
                      <tr key={m.opponentArchetypeId} className="hover:bg-gray-800/40">
                        <td className="px-4 py-3 text-white font-medium">
                          {m.name}
                          {!m.reliable && <span className="ml-2 text-xs text-yellow-700 font-normal">⚠ low sample</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-300">{m.totalMatches}</td>
                        <td className="px-4 py-3 text-center text-green-400">{m.wins}</td>
                        <td className="px-4 py-3 text-center text-red-400">{m.totalMatches - m.wins}</td>
                        <td className="px-4 py-3 text-center">
                          {m.winrate != null ? <WinrateBar value={m.winrate} /> : <span className="text-gray-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DIFF TAB ── */}
      {activeTab === 'diff' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>Compare</span>
            <select
              value={diffFromId}
              onChange={(e) => setCompareVersionId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
            >
              {allVersions.map((v) => (
                <option key={v.id} value={v.id}>v{v.versionNumber}</option>
              ))}
            </select>
            <span>→ v{allVersions.find((v) => v.id === currentVersionId)?.versionNumber}</span>
          </div>
          {!diff ? (
            <p className="text-gray-500">Loading diff…</p>
          ) : diff.length === 0 ? (
            <p className="text-gray-400">No differences between these versions.</p>
          ) : (
            <div className="space-y-2">
              {diff.map((d) => (
                <div key={d.cardId} className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 p-3">
                  <div style={{ position: 'relative', width: 44, height: 31, flexShrink: 0 }} className="rounded-md overflow-hidden">
                    <Image src={d.card.frontArt} alt={d.card.name} fill style={{ objectFit: 'cover' }} unoptimized />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{d.card.name}</p>
                    <p className="text-gray-500 text-xs">{d.card.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">{d.qtyA} → {d.qtyB}</p>
                    <p className={`text-sm font-bold ${d.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {d.delta > 0 ? `+${d.delta}` : d.delta}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  );
}

// ─── Utility components ───────────────────────────────────────────────────────


function WinrateBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70
    ? { blade: '#4ade80', mid: '#16a34a', glow: '#22c55e', core: '#f0fdf4' }
    : pct >= 40
    ? { blade: '#fde047', mid: '#ca8a04', glow: '#eab308', core: '#fefce8' }
    : { blade: '#f87171', mid: '#dc2626', glow: '#ef4444', core: '#fff1f2' };

  return (
    <div className="flex items-center gap-1.5 justify-center" style={{ minWidth: 190 }}>
      {/* ── Hilt ── */}
      <div className="flex items-center flex-shrink-0" style={{ gap: 0 }}>
        <div style={{ width: 9, height: 13, borderRadius: '4px 2px 2px 4px', background: 'radial-gradient(ellipse at 35% 30%, #6b7280, #1f2937 70%)', boxShadow: '2px 0 4px #000, inset -1px 0 3px #00000088' }} />
        <div style={{ width: 2, height: 13, background: 'linear-gradient(to bottom, #111, #374151, #111)', borderTop: '1px solid #4b5563', borderBottom: '1px solid #111' }} />
        <div style={{ width: 16, height: 10, background: 'repeating-linear-gradient(to right, #374151 0px, #374151 3px, #1f2937 3px, #1f2937 6px)', boxShadow: 'inset 0 2px 3px #000, inset 0 -2px 3px #000', borderTop: '1px solid #4b5563', borderBottom: '1px solid #111' }} />
        <div style={{ width: 2, height: 13, background: 'linear-gradient(to bottom, #111, #374151, #111)', borderTop: '1px solid #4b5563', borderBottom: '1px solid #111' }} />
        <div style={{ width: 7, height: 15, borderRadius: '1px 3px 3px 1px', background: 'radial-gradient(ellipse at 30% 30%, #9ca3af, #374151 60%, #111)', boxShadow: '2px 0 5px #000, inset -2px 0 3px #00000066', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 1 }}>
          <div style={{ width: 3, height: 3, borderRadius: '50%', background: color.blade, boxShadow: `0 0 4px 2px ${color.glow}, 0 0 8px 3px ${color.mid}` }} />
        </div>
      </div>

      {/* ── Blade track ── */}
      <div className="saber-blade relative flex-1" style={{ height: 10 }}>
        <div style={{ position: 'absolute', inset: 0, background: '#0d0d0d', borderRadius: '0 8px 8px 0' }} />
        {pct > 0 && <>
          <div style={{ position: 'absolute', top: '-60%', left: 0, width: `${pct}%`, height: '220%', background: color.mid, borderRadius: '0 8px 8px 0', filter: 'blur(8px)', opacity: 0.35, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
          <div style={{ position: 'absolute', top: '10%', left: 0, width: `${pct}%`, height: '80%', background: `linear-gradient(to bottom, ${color.blade}bb 0%, ${color.blade} 40%, ${color.blade} 60%, ${color.blade}bb 100%)`, borderRadius: '0 7px 7px 0', boxShadow: `0 0 8px 4px ${color.glow}77, 0 0 18px 6px ${color.mid}44`, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
          <div style={{ position: 'absolute', top: '25%', left: 0, width: `${pct}%`, height: '50%', background: `linear-gradient(to bottom, ${color.core}, #fff 40%, ${color.core})`, borderRadius: '0 6px 6px 0', boxShadow: `0 0 5px 2px #fff9, 0 0 10px 4px ${color.blade}`, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
        </>}
      </div>

      <span className="text-xs font-bold flex-shrink-0 w-9 text-right tabular-nums" style={{ color: color.blade, textShadow: `0 0 12px ${color.glow}` }}>{pct}%</span>
    </div>
  );
}
