'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import api from '@/lib/api';

// ── Utility ────────────────────────────────────────────────────────────────────

/** Costruisce URL immagine CDN direttamente da cardId (es. "SOR_017") */
function cdnArt(cardId: string | null | undefined): string | null {
  if (!cardId) return null;
  const parts = cardId.split('_');
  if (parts.length < 2) return null;
  const set = parts[0].toUpperCase();
  const num = parts[1].padStart(3, '0');
  return `https://cdn.swu-db.com/images/cards/${set}/${num}.png`;
}


// ── Types ──────────────────────────────────────────────────────────────────────

interface MetaDeck {
  id: string;
  date: string;
  standing: number;
  leaderName: string;
  baseName: string;
  leaderId: string | null;
  baseId: string | null;
  leaderArt: string | null;
  baseArt: string | null;
  eventLevel: string;
  playerCount: number;
  country: string;
  tournament: string;
  sourceUrl: string;
  cardCount: number;
}

interface TopLeader {
  name: string;
  leaderId: string | null;
  frontArt: string | null;
  count: number;
  top8: number;
  wins: number;
}

interface TopCard {
  cardId: string;
  name: string;
  frontArt: string | null;
  count: number;
  prevalence: number;
}

interface MetaStats {
  totalDecks: number;
  lastSync: string | null;
  topLeaders: TopLeader[];
  topCards: TopCard[];
  recentDecks: MetaDeck[];
}

interface DeckCard {
  cardId: string;
  quantity: number;
  slot: string;
  name: string;
  frontArt: string | null;
  type: string;
  cost: string | null;
}

interface MetaDeckDetail {
  id: string;
  date: string;
  standing: number;
  leaderName: string;
  baseName: string;
  leaderId: string | null;
  baseId: string | null;
  leaderArt: string | null;
  baseArt: string | null;
  eventLevel: string;
  playerCount: number;
  country: string;
  tournament: string;
  sourceUrl: string;
  hasCards: boolean;
  groups: { type: string; cards: DeckCard[] }[];
}

interface LeaderWinrate {
  leaderID: string;
  leaderTitle: string;
  leaderSubtitle: string | null;
  leaderArt: string | null;
  baseID: string;
  baseTitle: string;
  baseSubtitle: string | null;
  baseArt: string | null;
  numPlays: number;
  winRate: number;
  avgTurnsInWins: number | null;
  avgTurnsInLosses: number | null;
  avgCardsResourcedInWins: number | null;
  avgRemainingHealthInWins: number | null;
}

interface CardWinrate {
  cardUid: string;
  cardName: string | null;
  timesIncluded: number;
  percentIncludedInWins: number;
  timesPlayed: number;
  percentPlayedInWins: number;
  timesResourced: number;
  percentResourcedInWins: number;
}

interface MatchupRow {
  opponentLeaderID: string;
  opponentBaseID: string;
  opponentLeaderTitle: string;
  opponentLeaderSubtitle: string | null;
  opponentLeaderArt: string | null;
  numWins: number;
  numPlays: number;
  winRate: number;
  firstWinRate: number | null;
  secondWinRate: number | null;
  avgTurns: number | null;
}

interface TournamentTopDeck {
  rank: number;
  player: string;
  leaderName: string;
  baseName: string;
  leaderArt: string | null;
  baseArt: string | null;
}

interface SwuStatsTournament {
  id: number;
  name: string;
  date: string;
  melee_url: string;
  decks_count: number;
  topDecks: TournamentTopDeck[];
}

interface SwuStatsStanding {
  id: number;
  player: string;
  meleeId: string;
  leader: { uuid: string; name: string };
  base: { uuid: string; name: string };
  rank: number;
  leaderArt: string | null;
  baseArt: string | null;
  standings: {
    match_record: string;
    match_wins: number;
    match_losses: number;
    match_draws: number;
    match_win_rate: number;
    game_record: string;
    game_wins: number;
    game_losses: number;
    game_draws: number;
    game_win_rate: number;
  };
  points: number;
  tiebreakers: { omwp: number; tgwp: number; ogwp: number };
}

interface SwuStatsTournamentDetail {
  id: number;
  name: string;
  date: string;
  melee_url: string;
  decks_count: number;
  decks: SwuStatsStanding[];
}

// ── Shared components ──────────────────────────────────────────────────────────

function StandingBadge({ standing }: { standing: number }) {
  if (standing === 1) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">1st</span>;
  if (standing <= 4) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Top 4</span>;
  if (standing <= 8) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">Top 8</span>;
  return <span className="text-xs text-gray-500">#{standing}</span>;
}

function CardImg({ src, alt, w, h, position = 'top' }: { src: string | null; alt: string; w: number; h: number; position?: string }) {
  if (!src) return <div style={{ width: w, height: h }} className="bg-gray-800 rounded-lg flex items-center justify-center"><span className="text-gray-700 text-[9px] text-center px-1">{(alt ?? '').slice(0, 12)}</span></div>;
  return <Image src={src} alt={alt} width={w} height={h} style={{ width: w, height: h, objectFit: 'cover', objectPosition: position, borderRadius: 6 }} unoptimized />;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-white font-bold text-sm tabular-nums leading-none">{value}</p>
      <p className="text-gray-600 text-[10px] mt-0.5 uppercase tracking-wide whitespace-nowrap">{label}</p>
    </div>
  );
}

// ── Matchup panel ─────────────────────────────────────────────────────────────

function MatchupPanel({ leaderID, baseID }: { leaderID: string; baseID: string }) {
  const { data: matchups = [], isLoading } = useQuery<MatchupRow[]>({
    queryKey: ['meta-matchup', leaderID, baseID],
    queryFn: () => api.get('/meta/matchup', { params: { leaderID, baseID } }).then((r) => r.data),
  });

  if (isLoading) return <p className="text-gray-500 text-sm p-4 text-center">Loading matchups…</p>;
  if (!matchups.length) return <p className="text-gray-600 text-sm p-4 text-center">No matchup data.</p>;

  const sorted = [...matchups].sort((a, b) => b.winRate - a.winRate);

  return (
    <div className="divide-y divide-gray-800/60">
      {sorted.map((m) => {
        const wr = Math.round(m.winRate);
        const winColor = wr >= 55 ? 'text-green-400' : wr <= 45 ? 'text-red-400' : 'text-yellow-400';
        return (
          <div key={`${m.opponentLeaderID}-${m.opponentBaseID}`} className="flex items-center gap-3 px-4 py-2">
            <CardImg src={m.opponentLeaderArt} alt={m.opponentLeaderTitle} w={52} h={37} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{m.opponentLeaderTitle}</p>
              {m.opponentLeaderSubtitle && (
                <p className="text-gray-500 text-xs truncate">{m.opponentLeaderSubtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-gray-500 text-xs tabular-nums">{m.numWins}W–{m.numPlays - m.numWins}L</span>
              <span className={`font-bold text-sm tabular-nums w-11 text-right ${winColor}`}>{wr}%</span>
              {m.firstWinRate != null && (
                <div className="text-center hidden sm:block">
                  <p className={`text-xs tabular-nums font-medium ${Math.round(m.firstWinRate) >= 55 ? 'text-green-400' : Math.round(m.firstWinRate) <= 45 ? 'text-red-400' : 'text-yellow-400'}`}>{Math.round(m.firstWinRate)}%</p>
                  <p className="text-[9px] text-gray-600 uppercase">1st</p>
                </div>
              )}
              {m.secondWinRate != null && (
                <div className="text-center hidden sm:block">
                  <p className={`text-xs tabular-nums font-medium ${Math.round(m.secondWinRate) >= 55 ? 'text-green-400' : Math.round(m.secondWinRate) <= 45 ? 'text-red-400' : 'text-yellow-400'}`}>{Math.round(m.secondWinRate)}%</p>
                  <p className="text-[9px] text-gray-600 uppercase">2nd</p>
                </div>
              )}
              {m.avgTurns != null && <StatPill label="turns" value={m.avgTurns.toFixed(1)} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WinRate bar (spada laser) ──────────────────────────────────────────────────

function WinrateBar({ value }: { value: number }) {
  const pct = Math.round(value);
  const color = pct >= 70
    ? { blade: '#4ade80', mid: '#16a34a', glow: '#22c55e', core: '#f0fdf4' }
    : pct >= 40
    ? { blade: '#fde047', mid: '#ca8a04', glow: '#eab308', core: '#fefce8' }
    : { blade: '#f87171', mid: '#dc2626', glow: '#ef4444', core: '#fff1f2' };

  return (
    <div className="flex items-center gap-1.5" style={{ minWidth: 190 }}>
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

      <span className="text-xs font-bold flex-shrink-0 w-9 text-right tabular-nums"
        style={{ color: color.blade, textShadow: `0 0 12px ${color.glow}` }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Deck drawer ────────────────────────────────────────────────────────────────

function DeckDrawer({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<MetaDeckDetail>({
    queryKey: ['meta-deck', deckId],
    queryFn: () => api.get(`/meta/decks/${deckId}`).then((r) => r.data),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div>
            {data && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-base">{data.leaderName}</span>
                  <StandingBadge standing={data.standing} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.tournament} · {new Date(data.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-4">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading && <p className="text-gray-500 text-center py-8">Loading…</p>}
          {data && (
            <>
              {/* Leader + Base large */}
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-xs text-gray-600 uppercase tracking-widest">Leader</span>
                  <CardImg src={data.leaderArt ?? cdnArt(data.leaderId)} alt={data.leaderName} w={180} h={129} />
                  <span className="text-xs text-gray-400 text-center">{data.leaderName}</span>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-xs text-gray-600 uppercase tracking-widest">Base</span>
                  <CardImg src={data.baseArt ?? cdnArt(data.baseId)} alt={data.baseName} w={180} h={129} />
                  <span className="text-xs text-gray-400 text-center">{data.baseName}</span>
                </div>
              </div>

              {/* Pills */}
              <div className="flex flex-wrap gap-2">
                {[data.eventLevel, `${data.playerCount} players`, data.country].filter(Boolean).map((v) => (
                  <span key={v} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">{v}</span>
                ))}
                {data.sourceUrl && (
                  <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400 border border-blue-800 hover:bg-blue-900/60">
                    View source →
                  </a>
                )}
              </div>

              {/* Card groups */}
              {!data.hasCards ? (
                <p className="text-gray-500 text-sm text-center py-4">Full decklist not available.</p>
              ) : (
                data.groups.map(({ type, cards }) => {
                  const total = cards.reduce((s, c) => s + c.quantity, 0);
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{type}</span>
                        <span className="text-xs text-gray-700">{total}</span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {cards.map((c, i) => {
                          const art = c.frontArt ?? cdnArt(c.cardId);
                          return (
                            <div key={`${c.cardId}-${i}`} className="relative">
                              {art ? (
                                <div style={{ width: 72, height: 100, position: 'relative' }} className="rounded-md overflow-hidden border border-white/10">
                                  <Image src={art} alt={c.name} fill style={{ objectFit: 'cover' }} unoptimized />
                                  {c.quantity > 1 && (
                                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/80 border border-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">×{c.quantity}</div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ width: 72, height: 100 }} className="rounded-md border border-gray-700 bg-gray-800 flex flex-col items-center justify-center gap-1 p-1">
                                  <span className="text-gray-500 text-[10px] text-center leading-tight">{c.name}</span>
                                  {c.quantity > 1 && <span className="text-gray-600 text-xs font-bold">×{c.quantity}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}


// ── Tab: Top Leaders ───────────────────────────────────────────────────────────

function LeadersTab({ stats }: { stats: MetaStats }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Post-rotation tournament results ·{' '}
        <a href="https://www.swu-competitivehub.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">SWU Competitive Hub</a>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.topLeaders.map((l, i) => {
          const art = l.frontArt ?? cdnArt(l.leaderId);
          return (
            <div key={`${l.name}-${i}`} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="relative w-full" style={{ paddingBottom: `${(1117 / 1560) * 100}%` }}>
                {art ? (
                  <Image src={art} alt={l.name} fill style={{ objectFit: 'cover', objectPosition: 'top' }} unoptimized />
                ) : (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-600 text-xs text-center px-2">{l.name}</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-full border border-white/10">#{i + 1}</div>
                {l.wins > 0 && (
                  <div className="absolute top-2 right-2 bg-yellow-500/20 backdrop-blur-sm text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full border border-yellow-500/30">{l.wins}× 🏆</div>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-white font-semibold text-sm truncate">{l.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <StatPill label="entries" value={l.count} />
                  <StatPill label="top 8" value={l.top8} />
                  <StatPill label="wins" value={l.wins} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Winrates ──────────────────────────────────────────────────────────────

function WinratesTab({ stats, onSelectDeck }: { stats: MetaStats | undefined; onSelectDeck: (id: string) => void }) {
  const [sub, setSub] = useState<'leaders' | 'cards'>('leaders');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [matchupKey, setMatchupKey] = useState<string | null>(null);

  const { data: leaders = [], isLoading: loadingLeaders } = useQuery<LeaderWinrate[]>({
    queryKey: ['meta-winrates-leaders'],
    queryFn: () => api.get('/meta/winrates/leaders').then((r) => r.data),
  });
  const { data: cards = [], isLoading: loadingCards } = useQuery<CardWinrate[]>({
    queryKey: ['meta-winrates-cards'],
    queryFn: () => api.get('/meta/winrates/cards').then((r) => r.data),
    enabled: sub === 'cards',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800">
          {(['leaders', 'cards'] as const).map((t) => (
            <button key={t} onClick={() => setSub(t)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${sub === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'leaders' ? 'Leader / Base' : 'Cards'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          <a href="https://www.swustats.net" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">SWUStats.net</a>
          {' '}· community-submitted games
        </p>
      </div>

      {/* Leaders */}
      {sub === 'leaders' && (
        <div className="space-y-3">
          {loadingLeaders && <p className="text-gray-500 text-sm py-8 text-center">Loading…</p>}
          {leaders.map((l, i) => {
            const key = `${l.leaderID}-${l.baseID}`;
            const isOpen = expandedKey === key;
            // Immagini: prima usa quelle risolte dal backend, poi CDN diretto
            const leaderArt = l.leaderArt ?? cdnArt(`${l.leaderID}`);
            const baseArt = l.baseArt ?? cdnArt(`${l.baseID}`);
            const matchingDecks = stats?.recentDecks.filter(
              (d) => (d.leaderName ?? '').toLowerCase().includes((l.leaderTitle ?? '').toLowerCase())
            ) ?? [];

            return (
              <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <span className="text-gray-600 text-sm w-5 flex-shrink-0 tabular-nums text-center">{i + 1}</span>

                  {/* Immagini leader + base */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <CardImg src={leaderArt} alt={l.leaderTitle} w={80} h={57} />
                    <CardImg src={baseArt} alt={l.baseTitle} w={80} h={57} />
                  </div>

                  {/* Nome + stats */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">
                      {l.leaderTitle}
                      {l.leaderSubtitle && <span className="text-gray-500 font-normal text-xs"> · {l.leaderSubtitle}</span>}
                    </p>
                    <p className="text-gray-500 text-xs truncate mb-2">{l.baseTitle}</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <StatPill label="Games" value={l.numPlays} />
                      {l.avgTurnsInWins != null && <StatPill label="Turns W" value={Number(l.avgTurnsInWins).toFixed(1)} />}
                      {l.avgTurnsInLosses != null && <StatPill label="Turns L" value={Number(l.avgTurnsInLosses).toFixed(1)} />}
                      {l.avgCardsResourcedInWins != null && <StatPill label="Res. W" value={Number(l.avgCardsResourcedInWins).toFixed(1)} />}
                      {l.avgRemainingHealthInWins != null && <StatPill label="HP W" value={Number(l.avgRemainingHealthInWins).toFixed(1)} />}
                    </div>
                  </div>

                  {/* Win rate + bottoni */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <WinrateBar value={l.winRate} />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setMatchupKey(matchupKey === key ? null : key); setExpandedKey(null); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${matchupKey === key ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                      >
                        Matchup {matchupKey === key ? '▲' : '▼'}
                      </button>
                      {matchingDecks.length > 0 && (
                        <button
                          onClick={() => { setExpandedKey(isOpen ? null : key); setMatchupKey(null); }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${isOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                        >
                          {matchingDecks.length} decks {isOpen ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Matchup matrix espandibile */}
                {matchupKey === key && (
                  <div className="border-t border-gray-800">
                    <div className="px-4 py-2 bg-purple-900/20 flex items-center gap-2">
                      <p className="text-xs text-purple-400 uppercase tracking-widest font-semibold">Matchup Matrix</p>
                      <span className="text-xs text-gray-600">sorted by win rate</span>
                    </div>
                    <MatchupPanel leaderID={l.leaderID} baseID={l.baseID} />
                  </div>
                )}

                {/* Decklists espandibili */}
                {isOpen && (
                  <div className="border-t border-gray-800">
                    <div className="px-4 py-2 bg-gray-800/30">
                      <p className="text-xs text-gray-500 uppercase tracking-widest">Tournament Decklists</p>
                    </div>
                    <div className="divide-y divide-gray-800/60">
                      {matchingDecks.map((deck) => (
                        <div key={deck.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/30 transition-colors">
                          <div className="flex gap-1 flex-shrink-0">
                            <CardImg src={deck.leaderArt ?? cdnArt(deck.leaderId)} alt={deck.leaderName} w={48} h={34} />
                            <CardImg src={deck.baseArt ?? cdnArt(deck.baseId)} alt={deck.baseName} w={48} h={34} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white truncate">{deck.tournament}</span>
                              <StandingBadge standing={deck.standing} />
                            </div>
                            <span className="text-xs text-gray-500">
                              {deck.eventLevel} · {deck.playerCount}p · {deck.country} · {new Date(deck.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </span>
                          </div>
                          {deck.cardCount > 0
                            ? <button onClick={() => onSelectDeck(deck.id)} className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors">Decklist →</button>
                            : <span className="text-xs text-gray-700 flex-shrink-0">no list</span>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cards */}
      {sub === 'cards' && (
        <div className="space-y-1.5">
          {loadingCards && <p className="text-gray-500 text-sm py-8 text-center">Loading…</p>}
          {cards.map((c, i) => (
            <div key={c.cardUid} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-4">
              <span className="text-gray-600 text-sm w-5 flex-shrink-0 tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{c.cardName ?? c.cardUid}</p>
                <p className="text-gray-600 text-xs font-mono">{c.cardUid}</p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <StatPill label="included" value={c.timesIncluded} />
                <StatPill label="played" value={c.timesPlayed} />
                {c.timesResourced > 0 && <StatPill label="resourced" value={c.timesResourced} />}
                <div className="flex flex-col gap-1">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-gray-600 text-[10px] uppercase tracking-wide">Win% played</p>
                    <WinrateBar value={c.percentPlayedInWins} />
                  </div>
                  {c.timesResourced > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <p className="text-gray-600 text-[10px] uppercase tracking-wide">Win% resourced</p>
                      <WinrateBar value={c.percentResourcedInWins} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tournament modal ───────────────────────────────────────────────────────────

function TournamentModal({ tournament, onClose }: { tournament: SwuStatsTournament; onClose: () => void }) {
  const { data: detail, isLoading } = useQuery<SwuStatsTournamentDetail>({
    queryKey: ['meta-swustats-tournament', tournament.id],
    queryFn: () => api.get(`/meta/swustats/tournaments/${tournament.id}`).then((r) => r.data),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-4 sm:inset-8 bg-gray-950 border border-gray-800 rounded-2xl z-50 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0 gap-4">
          <div className="min-w-0">
            <h2 className="text-white font-bold text-base truncate">{tournament.name.replace(/\s*\|\s*Melee\s*$/i, '')}</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {new Date(tournament.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {detail && <> · {detail.decks_count} players</>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {detail && (
              <a href={detail.melee_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900/40 border border-blue-700 text-blue-400 hover:bg-blue-900/60 transition-colors">
                Melee.gg ↗
              </a>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none w-8 text-center">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading && <p className="text-gray-500 text-sm p-8 text-center">Loading standings…</p>}
          {detail && detail.decks.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-950 z-10">
                <tr className="border-b border-gray-800 text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left font-medium w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-medium">Player</th>
                  <th className="px-3 py-2.5 text-left font-medium">Deck</th>
                  <th className="px-3 py-2.5 text-center font-medium">Matches</th>
                  <th className="px-3 py-2.5 text-center font-medium">MWR%</th>
                  <th className="px-3 py-2.5 text-center font-medium">Games</th>
                  <th className="px-3 py-2.5 text-center font-medium">GWR%</th>
                  <th className="px-3 py-2.5 text-center font-medium">Pts</th>
                  <th className="px-3 py-2.5 text-center font-medium">OMW%</th>
                  <th className="px-3 py-2.5 text-center font-medium">TGW%</th>
                  <th className="px-3 py-2.5 text-center font-medium">OGW%</th>
                  <th className="px-3 py-2.5 text-center font-medium">List</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {detail.decks.map((s) => {
                  const mwr = s.standings.match_win_rate;
                  const gwr = s.standings.game_win_rate;
                  const mwrColor = mwr >= 60 ? 'text-green-400' : mwr >= 40 ? 'text-yellow-400' : 'text-red-400';
                  const gwrColor = gwr >= 60 ? 'text-green-400' : gwr >= 40 ? 'text-yellow-400' : 'text-red-400';
                  return (
                    <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-center">
                        {s.rank === 1 ? <span className="font-bold text-yellow-400">1</span>
                          : s.rank <= 4 ? <span className="font-bold text-blue-400">{s.rank}</span>
                          : <span className="text-gray-500">{s.rank}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-white font-medium whitespace-nowrap">{s.player}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 flex-shrink-0">
                            <CardImg src={s.leaderArt} alt={s.leader.name} w={44} h={32} />
                            <CardImg src={s.baseArt} alt={s.base.name} w={44} h={32} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-white whitespace-nowrap">{s.leader.name}</p>
                            <p className="text-gray-500 whitespace-nowrap">{s.base.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-green-400 font-medium tabular-nums">{s.standings.match_wins}</span>
                        <span className="text-gray-600 mx-0.5">–</span>
                        <span className="text-red-400 font-medium tabular-nums">{s.standings.match_losses}</span>
                        {s.standings.match_draws > 0 && <><span className="text-gray-600 mx-0.5">–</span><span className="text-gray-400 tabular-nums">{s.standings.match_draws}</span></>}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${mwrColor}`}>{mwr.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-green-400 font-medium tabular-nums">{s.standings.game_wins}</span>
                        <span className="text-gray-600 mx-0.5">–</span>
                        <span className="text-red-400 font-medium tabular-nums">{s.standings.game_losses}</span>
                        {s.standings.game_draws > 0 && <><span className="text-gray-600 mx-0.5">–</span><span className="text-gray-400 tabular-nums">{s.standings.game_draws}</span></>}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${gwrColor}`}>{gwr.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-center text-white font-medium tabular-nums">{s.points}</td>
                      <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{s.tiebreakers.omwp.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{s.tiebreakers.tgwp.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{s.tiebreakers.ogwp.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-center">
                        {s.meleeId
                          ? <a href={`https://melee.gg/Decklist/View/${s.meleeId}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 font-medium">↗</a>
                          : <span className="text-gray-700">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!isLoading && detail && detail.decks.length === 0 && (
            <p className="text-gray-600 text-sm p-8 text-center">No standings available.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Tab: Tournaments ───────────────────────────────────────────────────────────

function TournamentsTab() {
  const [modalTournament, setModalTournament] = useState<SwuStatsTournament | null>(null);

  const { data: tournaments = [], isLoading } = useQuery<SwuStatsTournament[]>({
    queryKey: ['meta-swustats-tournaments'],
    queryFn: () => api.get('/meta/swustats/tournaments').then((r) => r.data),
  });

  return (
    <>
      <div className="space-y-4">
        <p className="text-xs text-gray-600">
          Tournament data ·{' '}
          <a href="https://www.swustats.net" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">SWUStats.net</a>
          {' '}via{' '}
          <a href="https://melee.gg" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">Melee.gg</a>
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Tournaments</p>
            <span className="text-xs text-gray-700">{tournaments.length}</span>
          </div>
          {isLoading && <p className="text-gray-500 text-sm p-4">Loading…</p>}
          <div className="divide-y divide-gray-800">
            {tournaments.map((t) => (
              <button key={t.id}
                onClick={() => setModalTournament(t)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/50 transition-colors">

                {/* Top 3 leader images */}
                <div className="flex -space-x-2 flex-shrink-0">
                  {t.topDecks.slice(0, 3).map((d, i) => (
                    <div key={i} style={{ zIndex: 3 - i }} className="relative rounded overflow-hidden border border-gray-800">
                      <CardImg src={d.leaderArt} alt={d.leaderName} w={44} h={32} />
                    </div>
                  ))}
                  {t.topDecks.length === 0 && (
                    <div style={{ width: 44, height: 32 }} className="rounded bg-gray-800 border border-gray-700" />
                  )}
                </div>

                {/* Name + date + players */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.name.replace(/\s*\|\s*Melee\s*$/i, '')}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {t.decks_count > 0 && <> · {t.decks_count} players</>}
                  </p>
                </div>

                {/* Winner badge */}
                {t.topDecks[0] && (
                  <div className="flex-shrink-0 text-right hidden sm:block">
                    <p className="text-yellow-400 text-xs font-semibold truncate max-w-[120px]">{t.topDecks[0].player}</p>
                    <p className="text-gray-600 text-[10px] truncate max-w-[120px]">{t.topDecks[0].leaderName}</p>
                  </div>
                )}

                <span className="text-gray-600 text-sm flex-shrink-0">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {modalTournament && (
        <TournamentModal tournament={modalTournament} onClose={() => setModalTournament(null)} />
      )}
    </>
  );
}

// ── Tab: Decks ─────────────────────────────────────────────────────────────────

function DecksTab({ stats, onSelectDeck }: { stats: MetaStats; onSelectDeck: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Decklists ·{' '}
        <a href="https://www.swu-competitivehub.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">SWU Competitive Hub</a>
        {' '}&amp;{' '}
        <a href="https://swudb.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">SWUDB</a>
      </p>
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="divide-y divide-gray-800">
          {stats.recentDecks.map((deck) => {
            const leaderArt = deck.leaderArt ?? cdnArt(deck.leaderId);
            const baseArt = deck.baseArt ?? cdnArt(deck.baseId);
            return (
              <div key={deck.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors">
                <div className="flex gap-1 flex-shrink-0">
                  <CardImg src={leaderArt} alt={deck.leaderName} w={56} h={40} />
                  <CardImg src={baseArt} alt={deck.baseName} w={56} h={40} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{deck.leaderName}</span>
                    <StandingBadge standing={deck.standing} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">{deck.baseName}</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-xs text-gray-600">{deck.eventLevel}</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-xs text-gray-600">{deck.playerCount}p</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-xs text-gray-600">{deck.country}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-gray-500">{new Date(deck.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                </div>
                {deck.cardCount > 0 && (
                  <button onClick={() => onSelectDeck(deck.id)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors">
                    Decklist →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Top Cards ─────────────────────────────────────────────────────────────

function CardsTab({ stats }: { stats: MetaStats }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Play rate across post-rotation decklists ·{' '}
        <a href="https://www.swu-competitivehub.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">SWU Competitive Hub</a>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {stats.topCards.filter((c) => c.cardId).map((c, i) => {
          const art = c.frontArt ?? cdnArt(c.cardId);
          return (
            <div key={`${c.cardId}-${i}`} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Full card image */}
              <div className="relative w-full" style={{ paddingBottom: '140%' }}>
                {art ? (
                  <Image src={art} alt={c.name} fill style={{ objectFit: 'cover', objectPosition: 'top' }} unoptimized />
                ) : (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-600 text-xs text-center px-2">{c.name}</span>
                  </div>
                )}
                {/* Rank badge */}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-full border border-white/10">
                  #{i + 1}
                </div>
              </div>
              {/* Stats */}
              <div className="px-3 py-2">
                <p className="text-white text-xs font-semibold truncate">{c.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <StatPill label="decks" value={c.count} />
                  <div className="text-center">
                    <p className="text-blue-400 font-bold text-sm leading-none">{c.prevalence}%</p>
                    <p className="text-gray-600 text-[10px] mt-0.5 uppercase tracking-wide">play rate</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MetaPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'leaders' | 'winrates' | 'tournaments' | 'decks' | 'cards'>('leaders');
  const [openDeckId, setOpenDeckId] = useState<string | null>(null);

  const { data: stats, isLoading } = useQuery<MetaStats>({
    queryKey: ['meta-stats'],
    queryFn: () => api.get('/meta/stats').then((r) => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/meta/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meta-stats'] }),
  });

  const syncStatsMutation = useMutation({
    mutationFn: () => api.post('/meta/sync/stats'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meta-winrates-leaders'] });
      qc.invalidateQueries({ queryKey: ['meta-winrates-cards'] });
    },
  });

  const syncResult = syncMutation.data?.data as { synced: number; skipped: number; failed: number } | undefined;
  const syncStatsResult = syncStatsMutation.data?.data as { matchups: number; decks: number; cards: number } | undefined;

  const tabs = [
    { key: 'leaders',     label: 'Top Leaders' },
    { key: 'winrates',    label: 'Winrates' },
    { key: 'tournaments', label: 'Tournaments' },
    { key: 'decks',       label: 'Decks' },
    { key: 'cards',       label: 'Top Cards' },
  ] as const;

  const showTabs = (stats?.totalDecks ?? 0) > 0 || tab === 'winrates' || tab === 'tournaments';

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Meta</h1>
            {stats?.lastSync && (
              <p className="text-xs text-gray-500 mt-0.5">
                Last sync: {new Date(stats.lastSync).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{stats.totalDecks} post-rotation decks
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
              {syncMutation.isPending ? 'Syncing…' : 'Sync Decks'}
            </button>
            <button onClick={() => syncStatsMutation.mutate()} disabled={syncStatsMutation.isPending}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
              {syncStatsMutation.isPending ? 'Syncing…' : 'Sync Stats'}
            </button>
          </div>
        </div>

        {syncMutation.isSuccess && syncResult && (
          <div className="bg-green-900/30 border border-green-800 rounded-lg px-4 py-3 text-sm text-green-400">
            Sync Decks: {syncResult.synced} new · {syncResult.skipped} skipped · {syncResult.failed} failed
          </div>
        )}
        {syncStatsMutation.isSuccess && syncStatsResult && (
          <div className="bg-purple-900/30 border border-purple-800 rounded-lg px-4 py-3 text-sm text-purple-400">
            Sync Stats: {syncStatsResult.decks} decks · {syncStatsResult.cards} cards · {syncStatsResult.matchups} matchups
          </div>
        )}

        {isLoading && <div className="text-center py-16 text-gray-500">Loading meta data…</div>}

        {!isLoading && !showTabs && (
          <div className="text-center py-16 space-y-3">
            <p className="text-gray-400">No meta data yet.</p>
            <p className="text-gray-600 text-sm">Click <strong className="text-gray-400">Sync</strong> to import post-rotation tournament results.</p>
          </div>
        )}

        {showTabs && (
          <>
            <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${tab === t.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'leaders'     && stats && <LeadersTab stats={stats} />}
            {tab === 'winrates'    && <WinratesTab stats={stats} onSelectDeck={setOpenDeckId} />}
            {tab === 'tournaments' && <TournamentsTab />}
            {tab === 'decks'       && stats && <DecksTab stats={stats} onSelectDeck={setOpenDeckId} />}
            {tab === 'cards'       && stats && <CardsTab stats={stats} />}
          </>
        )}
      </div>

      {openDeckId && <DeckDrawer deckId={openDeckId} onClose={() => setOpenDeckId(null)} />}
    </>
  );
}
