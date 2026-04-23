'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CardSnippet {
  name: string;
  frontArt: string;
  aspects: string[];
}

interface Match {
  id: string;
  result: 'win' | 'loss';
  initiative: 'first' | 'second' | null;
  games: string[];
  createdAt: string;
  deckVersion: {
    id: string;
    versionNumber: number;
    deck: { id: string; name: string };
    leaderCard: CardSnippet | null;
    baseCard: CardSnippet | null;
  };
  opponentArchetype: { id: string; name: string };
  opponentDeckVersion: {
    id: string;
    leaderCard: CardSnippet | null;
    baseCard: CardSnippet | null;
  } | null;
}

interface Overview {
  totalMatches: number;
  wins: number;
  losses: number;
  winrate: number | null;
}

// ─── Card data for opponent decklist modal (reused from deck detail) ──────────

interface CardData {
  id: string;
  name: string;
  subtitle?: string;
  type: string;
  aspects: string[];
  cost?: string;
  power?: string;
  hp?: string;
  frontText?: string;
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

interface OpponentDecklist {
  id: string;
  sourceUrl: string | null;
  cards: DecklistCard[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ASPECT_COLORS: Record<string, string> = {
  Aggression: '#c0392b',
  Cunning:    '#d4a017',
  Heroism:    '#27ae60',
  Villainy:   '#8e44ad',
  Vigilance:  '#2980b9',
  Command:    '#e67e22',
};

const TYPE_ORDER = ['Unit', 'Event', 'Upgrade'];

function aspectGlow(aspects: string[]): string {
  const color = ASPECT_COLORS[aspects?.[0]];
  return color ? `0 0 12px ${color}66` : 'none';
}

function isLeader(c: DecklistCard) {
  return c.slot === 'leader' || c.slot === 'secondleader' || c.card.type === 'Leader';
}
function isBase(c: DecklistCard) {
  return c.slot === 'base' || c.card.type === 'Base';
}

function sortDeckCards(cards: DecklistCard[]) {
  const sideboard = cards.filter((c) => c.slot === 'sideboard');
  const nonSide   = cards.filter((c) => c.slot !== 'sideboard');
  const leader    = nonSide.filter(isLeader);
  const base      = nonSide.filter(isBase);
  const deck      = nonSide.filter((c) => !isLeader(c) && !isBase(c));

  const groups: { type: string; cards: DecklistCard[] }[] = [];
  for (const t of TYPE_ORDER) {
    const g = deck.filter((c) => c.card.type === t).sort((a, b) => parseInt(a.card.cost ?? '99') - parseInt(b.card.cost ?? '99'));
    if (g.length) groups.push({ type: t, cards: g });
  }
  const knownTypes = new Set([...TYPE_ORDER, 'Leader', 'Base']);
  const other = deck.filter((c) => !knownTypes.has(c.card.type));

  const sideGroups: { type: string; cards: DecklistCard[] }[] = [];
  for (const t of TYPE_ORDER) {
    const g = sideboard.filter((c) => c.card.type === t).sort((a, b) => parseInt(a.card.cost ?? '99') - parseInt(b.card.cost ?? '99'));
    if (g.length) sideGroups.push({ type: t, cards: g });
  }
  const sideOther = sideboard.filter((c) => !knownTypes.has(c.card.type));
  if (sideOther.length) sideGroups.push({ type: 'Other', cards: sideOther });

  return { leader, base, groups, other, sideGroups };
}

// ─── Mini card image (landscape thumb) ───────────────────────────────────────

function MiniLeader({ card, width = 90 }: { card: CardSnippet; width?: number }) {
  const h = Math.round(width * (1117 / 1560));
  return (
    <div
      style={{ width, height: h, flexShrink: 0, overflow: 'hidden', boxShadow: aspectGlow(card.aspects) }}
      className="rounded-md border border-white/10"
    >
      <Image src={card.frontArt} alt={card.name} width={width} height={h} style={{ width, height: h, objectFit: 'cover', display: 'block' }} unoptimized />
    </div>
  );
}

// ─── Deck card components for opponent decklist drawer ────────────────────────

function LandscapeThumb({ dc, onClick, width = 200 }: { dc: DecklistCard; onClick: (c: CardData) => void; width?: number }) {
  const h = Math.round(width * (1117 / 1560));
  return (
    <button onClick={() => onClick(dc.card)} style={{ width, height: h, flexShrink: 0, display: 'block' }} className="rounded-lg overflow-hidden border border-white/10 hover:border-white/25 transition-all">
      <Image src={dc.card.frontArt} alt={dc.card.name} width={width} height={h} style={{ width, height: h, objectFit: 'cover', display: 'block' }} unoptimized />
    </button>
  );
}

function CardThumb({ dc, onClick, width = 78 }: { dc: DecklistCard; onClick: (c: CardData) => void; width?: number }) {
  const h = Math.round(width * 1.4);
  return (
    <button onClick={() => onClick(dc.card)} style={{ width, height: h, flexShrink: 0, position: 'relative', overflow: 'hidden' }} className="rounded-md border border-white/10 hover:border-white/30 transition-all">
      <Image src={dc.card.frontArt} alt={dc.card.name} fill style={{ objectFit: 'cover' }} unoptimized />
      {dc.quantity > 1 && (
        <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)' }} className="bg-black/85 border border-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
          ×{dc.quantity}
        </div>
      )}
    </button>
  );
}

// ─── Card detail modal (used inside drawer) ───────────────────────────────────

function CardModal({ card, onClose }: { card: CardData; onClose: () => void }) {
  const isLandscape = ['Leader', 'Base'].includes(card.type);
  const imgW = isLandscape ? 260 : 140;
  const imgH = isLandscape ? Math.round(imgW * (1117 / 1560)) : Math.round(imgW * 1.4);
  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl border border-white/10 max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ boxShadow: `0 0 40px ${ASPECT_COLORS[card.aspects[0]] ?? '#fff'}33` }}>
        <div className="flex gap-4 p-5">
          <Image src={card.frontArt} alt={card.name} width={imgW} height={imgH} style={{ width: imgW, height: imgH, objectFit: 'cover', flexShrink: 0 }} className="rounded-lg" unoptimized />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between mb-2">
              <div>
                <h2 className="text-white font-bold text-base leading-tight">{card.name}</h2>
                {card.subtitle && <p className="text-gray-400 text-xs italic">{card.subtitle}</p>}
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-2">×</button>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{card.type}</span>
              {card.aspects.map((a) => (
                <span key={a} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${ASPECT_COLORS[a] ?? '#555'}33`, color: ASPECT_COLORS[a] ?? '#ccc' }}>{a}</span>
              ))}
            </div>
            {(card.cost || card.power || card.hp) && (
              <div className="flex gap-3 mb-2 pb-2 border-b border-white/10">
                {card.cost  && <div className="text-center"><p className="text-gray-500 text-xs">Cost</p><p className="text-white font-bold">{card.cost}</p></div>}
                {card.power && <div className="text-center"><p className="text-gray-500 text-xs">Power</p><p className="text-white font-bold">{card.power}</p></div>}
                {card.hp    && <div className="text-center"><p className="text-gray-500 text-xs">HP</p><p className="text-white font-bold">{card.hp}</p></div>}
              </div>
            )}
            {card.frontText && <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line">{card.frontText}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Opponent decklist panel (inside drawer) ──────────────────────────────────

function OpponentDeckPanel({ deckVersionId }: { deckVersionId: string }) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);

  const { data, isLoading } = useQuery<OpponentDecklist>({
    queryKey: ['opponent-deck', deckVersionId],
    queryFn: () => api.get(`/analytics/opponent-deck/${deckVersionId}`).then((r) => r.data),
  });

  const { leader, base, groups, other, sideGroups } = data
    ? sortDeckCards(data.cards)
    : { leader: [], base: [], groups: [], other: [], sideGroups: [] };

  if (isLoading) return <p className="text-gray-500 text-sm">Loading decklist…</p>;

  return (
    <div className="flex gap-4 items-start">
      {/* Left */}
      <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 160 }}>
        {leader[0] && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-600 uppercase tracking-widest text-center">Leader</span>
            <LandscapeThumb dc={leader[0]} onClick={setSelectedCard} width={160} />
          </div>
        )}
        {base[0] && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-600 uppercase tracking-widest text-center">Base</span>
            <LandscapeThumb dc={base[0]} onClick={setSelectedCard} width={160} />
          </div>
        )}
        {leader[0]?.card.aspects.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {leader[0].card.aspects.map((a) => (
              <span key={a} className="text-xs px-2 py-0.5 rounded-full font-medium text-center" style={{ backgroundColor: `${ASPECT_COLORS[a] ?? '#555'}22`, color: ASPECT_COLORS[a] ?? '#ccc', border: `1px solid ${ASPECT_COLORS[a] ?? '#555'}44` }}>{a}</span>
            ))}
          </div>
        )}
        {other.map((dc) => (
          <LandscapeThumb key={dc.cardId} dc={dc} onClick={setSelectedCard} width={160} />
        ))}
      </div>

      {/* Right */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {groups.map(({ type, cards }) => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{type}</span>
              <span className="text-xs text-gray-700">{cards.reduce((s, c) => s + c.quantity, 0)}</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>
            <div className="flex flex-wrap gap-1">
              {cards.map((dc) => <CardThumb key={dc.cardId} dc={dc} onClick={setSelectedCard} width={62} />)}
            </div>
          </div>
        ))}
        {sideGroups.length > 0 && (
          <div className="mt-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-yellow-600 uppercase tracking-widest">Sideboard</span>
              <div className="flex-1 h-px bg-yellow-900/30" />
            </div>
            {sideGroups.map(({ type, cards }) => (
              <div key={type} className="mb-2">
                <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">{type}</p>
                <div className="flex flex-wrap gap-1">
                  {cards.map((dc) => <CardThumb key={dc.cardId} dc={dc} onClick={setSelectedCard} width={62} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  );
}

// ─── Match Drawer ─────────────────────────────────────────────────────────────

function MatchDrawer({ match, onClose }: { match: Match; onClose: () => void }) {
  const [showOpponentDeck, setShowOpponentDeck] = useState(false);
  const date = new Date(match.createdAt);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-gray-950 border-l border-gray-800 z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-lg text-sm font-bold ${match.result === 'win' ? 'bg-green-900/50 text-green-400 border border-green-800' : 'bg-red-900/50 text-red-400 border border-red-800'}`}>
              {match.result.toUpperCase()}
            </span>
            <span className="text-gray-400 text-sm">
              {date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' · '}
              {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {match.initiative && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                {match.initiative === 'first' ? 'First' : 'Second'}
              </span>
            )}
            {match.games.length > 0 && (
              <div className="flex gap-1">
                {match.games.map((g, i) => (
                  <span key={i} className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${g === 'W' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{g}</span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* My deck */}
          <section>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Your Deck</p>
            <div className="flex items-center gap-3 mb-3">
              {match.deckVersion.leaderCard && <MiniLeader card={match.deckVersion.leaderCard} width={100} />}
              {match.deckVersion.baseCard && <MiniLeader card={match.deckVersion.baseCard} width={100} />}
              <div>
                <Link href={`/dashboard/decks/${match.deckVersion.deck.id}`} className="text-white font-semibold hover:text-blue-400 transition-colors">
                  {match.deckVersion.deck.name}
                </Link>
                <p className="text-gray-500 text-xs mt-0.5">v{match.deckVersion.versionNumber}</p>
                {match.deckVersion.leaderCard?.aspects && (
                  <div className="flex gap-1 mt-1.5">
                    {match.deckVersion.leaderCard.aspects.map((a) => (
                      <span key={a} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${ASPECT_COLORS[a] ?? '#555'}22`, color: ASPECT_COLORS[a] ?? '#ccc', border: `1px solid ${ASPECT_COLORS[a] ?? '#555'}44` }}>{a}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-gray-600 text-xs font-bold uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Opponent */}
          <section>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Opponent</p>
            <div className="flex items-center gap-3 mb-3">
              {match.opponentDeckVersion?.leaderCard && <MiniLeader card={match.opponentDeckVersion.leaderCard} width={100} />}
              {match.opponentDeckVersion?.baseCard && <MiniLeader card={match.opponentDeckVersion.baseCard} width={100} />}
              <div>
                <p className="text-white font-semibold">{match.opponentArchetype.name}</p>
                {!match.opponentDeckVersion && <p className="text-gray-600 text-xs mt-0.5">No decklist saved</p>}
              </div>
            </div>

            {match.opponentDeckVersion && (
              <button
                onClick={() => setShowOpponentDeck((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors mb-3"
              >
                {showOpponentDeck ? 'Hide decklist' : 'View decklist'}
              </button>
            )}

            {showOpponentDeck && match.opponentDeckVersion && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <OpponentDeckPanel deckVersionId={match.opponentDeckVersion.id} />
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchRow({ match, onClick }: { match: Match; onClick: () => void }) {
  const date = new Date(match.createdAt);

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800/50 transition-colors text-left"
    >
      {/* Result */}
      <span className={`w-10 text-center text-xs font-bold px-1.5 py-1 rounded-md flex-shrink-0 ${match.result === 'win' ? 'bg-green-900/40 text-green-400 border border-green-800/50' : 'bg-red-900/40 text-red-400 border border-red-800/50'}`}>
        {match.result === 'win' ? 'W' : 'L'}
      </span>

      {/* Opponent leader + base */}
      <div className="flex gap-1.5 flex-shrink-0">
        {match.opponentDeckVersion?.leaderCard
          ? <MiniLeader card={match.opponentDeckVersion.leaderCard} width={64} />
          : <div className="w-[64px] h-[46px] rounded-md bg-gray-800/50 border border-gray-800 flex items-center justify-center"><span className="text-gray-700 text-xs">?</span></div>
        }
        {match.opponentDeckVersion?.baseCard && (
          <MiniLeader card={match.opponentDeckVersion.baseCard} width={64} />
        )}
      </div>

      {/* Opponent name */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{match.opponentArchetype.name}</p>
        {match.deckVersion.versionNumber > 1 && (
          <p className="text-gray-600 text-xs">v{match.deckVersion.versionNumber}</p>
        )}
      </div>

      {/* Date + coin */}
      <div className="text-right flex-shrink-0">
        <p className="text-gray-500 text-xs">{date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</p>
        {match.initiative && <p className="text-gray-600 text-xs mt-0.5">{match.initiative}</p>}
      </div>

      <span className="text-gray-700 text-xs">›</span>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Per-deck matchup computation ────────────────────────────────────────────

interface DeckMatchupRow {
  archetypeId: string;
  name: string;
  wins: number;
  losses: number;
  latestOpponentDeckVersionId: string | null;
  leaderCard: CardSnippet | null;
  baseCard: CardSnippet | null;
}

function computeDeckMatchups(matches: Match[]): DeckMatchupRow[] {
  const map = new Map<string, DeckMatchupRow>();
  // Iterate oldest-first so "latest" ends up being the most recent
  for (const m of [...matches].reverse()) {
    const key = m.opponentArchetype.id;
    if (!map.has(key)) {
      map.set(key, { archetypeId: key, name: m.opponentArchetype.name, wins: 0, losses: 0, latestOpponentDeckVersionId: null, leaderCard: null, baseCard: null });
    }
    const row = map.get(key)!;
    if (m.result === 'win') row.wins++; else row.losses++;
    if (m.opponentDeckVersion) {
      row.latestOpponentDeckVersionId = m.opponentDeckVersion.id;
      row.leaderCard = m.opponentDeckVersion.leaderCard;
      row.baseCard = m.opponentDeckVersion.baseCard;
    }
  }
  return [...map.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
}

// ─── Per-deck box ─────────────────────────────────────────────────────────────

function DeckBox({ deckId, deckName, matches, onSelectMatch }: {
  deckId: string;
  deckName: string;
  matches: Match[];
  onSelectMatch: (m: Match) => void;
}) {
  const [open, setOpen] = useState(false);

  const wins    = matches.filter((m) => m.result === 'win').length;
  const losses  = matches.filter((m) => m.result === 'loss').length;
  const winrate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null;
  const matchups = computeDeckMatchups(matches);

  const sample     = matches.find((m) => m.deckVersion.leaderCard);
  const leaderCard = sample?.deckVersion.leaderCard ?? null;
  const baseCard   = sample?.deckVersion.baseCard ?? null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">

      {/* Clickable header */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Card images + deck name below */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-col items-start gap-1 flex-shrink-0 hover:opacity-80 transition-opacity text-left"
        >
          <div className="flex gap-2">
            {leaderCard && <MiniLeader card={leaderCard} width={80} />}
            {baseCard   && <MiniLeader card={baseCard}   width={80} />}
          </div>
          <p className="text-white font-semibold text-sm truncate max-w-[168px]">{deckName}</p>
          {leaderCard?.aspects && (
            <div className="flex gap-1">
              {leaderCard.aspects.map((a) => (
                <span key={a} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${ASPECT_COLORS[a] ?? '#555'}22`, color: ASPECT_COLORS[a] ?? '#ccc', border: `1px solid ${ASPECT_COLORS[a] ?? '#555'}44` }}>{a}</span>
              ))}
            </div>
          )}
        </button>

        {/* Stats + lightsaber + View Deck */}
        <div className="flex-1 flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">G</p>
            <p className="text-white font-bold text-lg">{matches.length}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">W</p>
            <p className="text-green-400 font-bold text-lg">{wins}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">L</p>
            <p className="text-red-400 font-bold text-lg">{losses}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Win Rate</p>
            {winrate != null
              ? <WinrateBar value={winrate / 100} />
              : <span className="text-gray-600 text-sm">—</span>
            }
          </div>
          <Link
            href={`/dashboard/decks/${deckId}`}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors flex-shrink-0"
          >
            View Deck →
          </Link>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >›</button>
      </div>

      {/* Expandable body */}
      {open && (
        <>
          {/* Matchup stats */}
          {matchups.length > 0 && (
            <div className="border-t border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 text-xs uppercase tracking-wider border-b border-gray-800/60">
                    <th className="text-left px-4 py-2">Archetype</th>
                    <th className="text-center px-4 py-2">G</th>
                    <th className="text-center px-4 py-2">W</th>
                    <th className="text-center px-4 py-2">L</th>
                    <th className="text-center px-4 py-2">Win Rate</th>
                    <th className="text-center px-4 py-2">Decklist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {matchups.map((mu) => {
                    const total = mu.wins + mu.losses;
                    const wr = total > 0 ? Math.round((mu.wins / total) * 100) / 100 : null;
                    return (
                      <tr key={mu.archetypeId} className="hover:bg-gray-800/30 transition-colors">
                        {/* Archetype: immagini + nome insieme */}
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1 flex-shrink-0">
                              {mu.leaderCard
                                ? <MiniLeader card={mu.leaderCard} width={56} />
                                : <div className="rounded-md bg-gray-800/50 border border-gray-800 flex items-center justify-center" style={{ width: 56, height: 40 }}><span className="text-gray-700 text-xs">?</span></div>
                              }
                              {mu.baseCard && <MiniLeader card={mu.baseCard} width={56} />}
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{mu.name}</p>
                              {total < 5 && <span className="text-xs text-yellow-700">low sample</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-400 text-xs">{total}</td>
                        <td className="px-4 py-2 text-center text-green-400 text-xs">{mu.wins}</td>
                        <td className="px-4 py-2 text-center text-red-400 text-xs">{mu.losses}</td>
                        <td className="px-4 py-2 text-center">
                          {wr != null ? <WinrateBar value={wr} /> : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {mu.latestOpponentDeckVersionId ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const match = matches.find((m) => m.opponentDeckVersion?.id === mu.latestOpponentDeckVersionId);
                                if (match) onSelectMatch(match);
                              }}
                              className="px-2 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                            >
                              View deck
                            </button>
                          ) : (
                            <span className="text-gray-700 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}


</>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const { data: overview } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get('/analytics/overview').then((r) => r.data),
  });

  const { data: matches = [], isLoading } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => api.get('/matches').then((r) => r.data),
  });

  // Group matches by deck id, preserving order of first appearance
  const deckGroups = (() => {
    const order: string[] = [];
    const map = new Map<string, { deckId: string; deckName: string; matches: Match[] }>();
    for (const m of matches) {
      const id = m.deckVersion.deck.id;
      if (!map.has(id)) {
        order.push(id);
        map.set(id, { deckId: id, deckName: m.deckVersion.deck.name, matches: [] });
      }
      map.get(id)!.matches.push(m);
    }
    return order.map((id) => map.get(id)!);
  })();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>

      {/* Overview */}
      {overview && (
        <section>
          <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Overview</h2>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Matches" value={overview.totalMatches} />
            <StatCard label="Win Rate" value={overview.winrate != null ? `${Math.round(overview.winrate * 100)}%` : '—'} />
            <StatCard label="W / L" value={`${overview.wins} / ${overview.losses}`} />
          </div>
        </section>
      )}

      {/* Per-deck boxes */}
      <section className="space-y-5">
        <h2 className="text-xs text-gray-500 uppercase tracking-widest">Matches</h2>
        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : deckGroups.length === 0 ? (
          <p className="text-gray-500 text-sm">No matches yet. Log one from the match page.</p>
        ) : (
          deckGroups.map((g) => (
            <DeckBox
              key={g.deckId}
              deckId={g.deckId}
              deckName={g.deckName}
              matches={g.matches}
              onSelectMatch={setSelectedMatch}
            />
          ))
        )}
      </section>

      {selectedMatch && (
        <MatchDrawer match={selectedMatch} onClose={() => setSelectedMatch(null)} />
      )}
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

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
