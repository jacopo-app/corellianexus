import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import { SwudbProvider } from '../deck/providers/swudb.provider';
import { LimitlessProvider } from './providers/limitless.provider';
import { SwuStatsProvider } from './providers/swustats.provider';
import * as fs from 'fs';
import * as path from 'path';

const ROTATION_DATE = new Date('2026-03-14'); // post-rotation: 13 March 2026

// Hub shorthand base names → canonical card names (most common/recent base for that aspect)
const HUB_BASE_ALIASES: Record<string, string> = {
  'blue': 'Data Vault',
  'yellow': 'Colossus',
  'red': 'Nadiri Dockyards',
  'green': 'Chopper Base',
  'blue force': 'Jedi Temple',
  'yellow force': 'Vergence Temple',
  'red force': 'Fortress Vader',
  'green force': 'Crystal Caves',
  'blue 27hp': 'Stygeon Spire',       // Command 27hp
  'red 27hp': 'Thermal Oscillator',   // Aggression 27hp
  'yellow 27hp': 'Daimyo\'s Palace',  // Vigilance 27hp
  'blue 27hp multiaspect': 'Stygeon Spire',
  'red 27hp multiaspect': 'Thermal Oscillator',
  'yellow 27hp multiaspect': 'Daimyo\'s Palace',
  'ecl': 'Energy Conversion Lab',
};
const CACHE_DIR = path.join(process.cwd(), 'data', 'meta');
const HUB_URL = 'https://www.swu-competitivehub.com/decklists/';

interface HubEntry {
  date: string;
  standing: number;
  leaderName: string;
  baseName: string;
  leaderId: string | null;
  baseId: string | null;
  eventLevel: string;
  playerCount: number;
  country: string;
  tournament: string;
  sourceUrl: string;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private provider = new SwudbProvider();
  private limitless = new LimitlessProvider();
  private swustats = new SwuStatsProvider();

  constructor(private prisma: PrismaService, private cards: CardsService) {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // ── Save raw fetch to local file ──────────────────────────────────────────

  private saveCache(filename: string, data: unknown) {
    const file = path.join(CACHE_DIR, filename);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.log(`Cached → ${file}`);
  }

  private loadCache<T>(filename: string): T | null {
    const file = path.join(CACHE_DIR, filename);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  }

  // ── Parse HTML table from competitive hub ────────────────────────────────

  private parseHubHtml(html: string): HubEntry[] {
    const entries: HubEntry[] = [];

    // Current layout (verified 2026-04-05):
    // cell[0]: date | cell[1]: standing | cell[2]: leader img
    // cell[3]: decklist link, text = "Leader/Base" | cell[4]: event
    // cell[5]: players | cell[6]: country flag img (alt=country) | cell[7]: tournament link
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const linkRe = /href="([^"]*(?:swudb\.com\/deck\/|melee\.gg\/Decklist\/View\/)[^"]*)"/i;
    const dateRe = /(\d{4}-\d{2}-\d{2})/;
    const numRe = /(\d+)/;
    const imgAltRe = /alt="([^"]+)"/i;

    // Extract visible text, stripping all tags
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      cellRe.lastIndex = 0;
      while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1]);
      }
      if (cells.length < 7) continue;

      const dateM = dateRe.exec(cells[0] ?? '');
      if (!dateM) continue;
      const date = dateM[1];
      if (new Date(date) < ROTATION_DATE) continue;

      const standingM = numRe.exec(cells[1] ?? '');
      if (!standingM) continue;

      const linkM = linkRe.exec(rowHtml);
      if (!linkM) continue;
      const rawUrl = linkM[1].replace(/^https?:\/\//, '').trim();
      const sourceUrl = rawUrl.startsWith('swudb.com') || rawUrl.startsWith('melee.gg')
        ? `https://${rawUrl}`
        : rawUrl;

      // cell[3] text is "Leader Name/Base Name"
      const deckText = stripTags(cells[3] ?? '');
      const slashIdx = deckText.indexOf('/');
      const leaderText = slashIdx > 0 ? deckText.slice(0, slashIdx).trim() : deckText.trim();
      const baseText   = slashIdx > 0 ? deckText.slice(slashIdx + 1).trim() : '';

      const eventText = stripTags(cells[4] ?? '');
      const playersM = numRe.exec(cells[5] ?? '');

      // cell[6] is a country flag <img alt="CountryName">
      const countryText = (imgAltRe.exec(cells[6] ?? '') ?? [])[1]?.trim() ?? stripTags(cells[6] ?? '');

      const tournamentText = stripTags(cells[7] ?? '');

      if (!leaderText) continue;

      entries.push({
        date,
        standing: parseInt(standingM[1]),
        leaderName: leaderText,
        baseName: baseText,
        leaderId: null,
        baseId: null,
        eventLevel: eventText,
        playerCount: playersM ? parseInt(playersM[1]) : 0,
        country: countryText,
        tournament: tournamentText,
        sourceUrl,
      });
    }

    return entries;
  }

  // ── Fetch hub page (with local cache) ────────────────────────────────────

  private async fetchHub(): Promise<HubEntry[]> {
    const today = new Date().toISOString().slice(0, 10);
    const cacheFile = `hub_${today}.json`;
    const cached = this.loadCache<HubEntry[]>(cacheFile);
    if (cached) {
      this.logger.log(`Using cached hub data (${cached.length} entries)`);
      return cached;
    }

    this.logger.log('Fetching swu-competitivehub.com...');
    const res = await fetch(HUB_URL, { headers: { 'User-Agent': 'CorelliaNexus/1.0' } });
    if (!res.ok) throw new Error(`Hub fetch failed: ${res.status}`);
    const html = await res.text();

    // Save raw HTML
    this.saveCache(`hub_raw_${today}.html`, html);

    const entries = this.parseHubHtml(html);
    this.saveCache(cacheFile, entries);
    this.logger.log(`Parsed ${entries.length} post-rotation entries`);
    return entries;
  }

  // ── Fetch a swudb deck (with local cache) ─────────────────────────────────

  private async fetchSwudbDeck(url: string): Promise<{ cards: { card_id: string; qty: number; slot: string }[]; leader?: string; base?: string } | null> {
    if (!this.provider.canHandle(url)) return null;

    const deckId = url.match(/swudb\.com\/deck\/([a-zA-Z0-9]+)/)?.[1];
    if (!deckId) return null;

    const cacheFile = `deck_${deckId}.json`;
    const cached = this.loadCache<ReturnType<typeof this.provider.parse>>(cacheFile);
    if (cached) return { cards: cached.cards as { card_id: string; qty: number; slot: string }[], leader: cached.leader, base: cached.base };

    try {
      this.logger.log(`Fetching deck ${deckId}...`);
      const raw = await this.provider.fetch(url);
      const parsed = this.provider.parse(raw);
      this.saveCache(cacheFile, parsed);
      return { cards: parsed.cards as { card_id: string; qty: number; slot: string }[], leader: parsed.leader, base: parsed.base };
    } catch (e) {
      this.logger.warn(`Failed to fetch deck ${deckId}: ${e}`);
      return null;
    }
  }

  // ── Main sync ─────────────────────────────────────────────────────────────

  async sync(): Promise<{ synced: number; skipped: number; failed: number }> {
    const entries = await this.fetchHub();
    let synced = 0, skipped = 0, failed = 0;

    for (const entry of entries) {
      // Check if already imported
      const existing = await this.prisma.metaDeck.findUnique({
        where: { sourceUrl_standing: { sourceUrl: entry.sourceUrl, standing: entry.standing } },
      });
      // Re-process if existing entry has an empty leaderName (old parser bug)
      if (existing && existing.leaderName) { skipped++; continue; }
      if (existing && !existing.leaderName) {
        await this.prisma.metaDeck.update({
          where: { id: existing.id },
          data: { leaderName: entry.leaderName, baseName: entry.baseName },
        });
        skipped++;
        continue;
      }

      // Try to import full decklist for swudb links
      let cards: { card_id: string; qty: number; slot: string }[] = [];
      let leaderId = entry.leaderId;
      let baseId = entry.baseId;

      if (entry.sourceUrl.includes('swudb.com')) {
        const deck = await this.fetchSwudbDeck(entry.sourceUrl);
        if (deck) {
          cards = deck.cards;
          leaderId = deck.leader ?? null;
          baseId = deck.base ?? null;
        }
      }

      try {
        await this.prisma.metaDeck.create({
          data: {
            date: new Date(entry.date),
            standing: entry.standing,
            leaderName: entry.leaderName,
            baseName: entry.baseName,
            leaderId,
            baseId,
            eventLevel: entry.eventLevel,
            playerCount: entry.playerCount,
            country: entry.country,
            tournament: entry.tournament,
            sourceUrl: entry.sourceUrl,
            cards: cards.length > 0 ? {
              create: cards.map((c) => ({
                cardId: c.card_id,
                quantity: c.qty,
                slot: c.slot ?? 'main',
              })),
            } : undefined,
          },
        });
        synced++;
      } catch (e) {
        this.logger.error(`Failed to save ${entry.sourceUrl}: ${e}`);
        failed++;
      }
    }

    this.logger.log(`Sync complete: ${synced} synced, ${skipped} skipped, ${failed} failed`);
    return { synced, skipped, failed };
  }

  // ── Stats for frontend ────────────────────────────────────────────────────

  async getMetaStats() {
    const decks = await this.prisma.metaDeck.findMany({
      include: { cards: true },
      orderBy: { date: 'desc' },
    });

    // Top leaders
    const leaderCount: Record<string, { name: string; leaderId: string | null; count: number; top8: number; wins: number }> = {};
    for (const d of decks) {
      const key = d.leaderId ?? d.leaderName;
      if (!leaderCount[key]) leaderCount[key] = { name: d.leaderName, leaderId: d.leaderId, count: 0, top8: 0, wins: 0 };
      // Prefer a real leaderId over null — first entry may lack it
      if (!leaderCount[key].leaderId && d.leaderId) leaderCount[key].leaderId = d.leaderId;
      leaderCount[key].count++;
      if (d.standing <= 8) leaderCount[key].top8++;
      if (d.standing === 1) leaderCount[key].wins++;
    }

    const topLeadersSorted = Object.values(leaderCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Resolve frontArt for top leaders
    const topLeaders = await Promise.all(
      topLeadersSorted.map(async (l) => {
        let frontArt: string | null = null;
        if (l.leaderId) {
          try { frontArt = (await this.cards.getCard(l.leaderId)).frontArt; } catch { /* skip */ }
        }
        if (!frontArt && l.name) {
          try {
            // Hub appends set disambiguation like "Boba Fett (JTL)" — strip it for the search
            const cleanName = l.name.replace(/\s*\([A-Z]{2,4}\)\s*$/, '').trim();
            const card = await this.cards.searchByName(cleanName, undefined, 'Leader');
            if (card) frontArt = card.frontArt;
          } catch { /* skip */ }
        }
        return { ...l, frontArt };
      }),
    );

    // Most played cards (across all meta decks, main slot only)
    const cardCount: Record<string, number> = {};
    for (const d of decks) {
      const seen = new Set<string>();
      for (const c of d.cards) {
        if (!seen.has(c.cardId) && c.slot === 'main') {
          seen.add(c.cardId);
          cardCount[c.cardId] = (cardCount[c.cardId] ?? 0) + 1;
        }
      }
    }

    const totalDecks = decks.length;
    const topCardsSorted = Object.entries(cardCount)
      .filter(([cardId]) => !!cardId)
      .map(([cardId, count]) => ({ cardId, count, prevalence: Math.round((count / totalDecks) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    // Resolve frontArt + name for top cards
    const topCards = await Promise.all(
      topCardsSorted.map(async (c) => {
        let frontArt: string | null = null;
        let name: string = c.cardId;
        try {
          const card = await this.cards.getCard(c.cardId);
          frontArt = card.frontArt;
          name = card.name;
        } catch { /* skip */ }
        return { ...c, frontArt, name };
      }),
    );

    // Resolve frontArt for recent deck leader + base
    const recentRaw = decks.slice(0, 50);
    const recentDecks = await Promise.all(
      recentRaw.map(async (d) => {
        let leaderArt: string | null = null;
        let baseArt: string | null = null;
        if (d.leaderId) {
          try { leaderArt = (await this.cards.getCard(d.leaderId)).frontArt; } catch { /* skip */ }
        }
        if (!leaderArt && d.leaderName) {
          try {
            const cleanName = d.leaderName.replace(/\s*\([A-Z]{2,4}\)\s*$/, '').trim();
            const card = await this.cards.searchByName(cleanName, undefined, 'Leader');
            if (card) leaderArt = card.frontArt;
          } catch { /* skip */ }
        }
        if (d.baseId) {
          try { baseArt = (await this.cards.getCard(d.baseId)).frontArt; } catch { /* skip */ }
        }
        if (!baseArt && d.baseName) {
          try {
            const lookupName = HUB_BASE_ALIASES[d.baseName.toLowerCase()] ?? d.baseName;
            const card = await this.cards.searchByName(lookupName, undefined, 'Base');
            if (card) baseArt = card.frontArt;
          } catch { /* skip */ }
        }
        return {
          id: d.id,
          date: d.date,
          standing: d.standing,
          leaderName: d.leaderName,
          baseName: d.baseName,
          leaderId: d.leaderId,
          baseId: d.baseId,
          leaderArt,
          baseArt,
          eventLevel: d.eventLevel,
          playerCount: d.playerCount,
          country: d.country,
          tournament: d.tournament,
          sourceUrl: d.sourceUrl,
          cardCount: d.cards.length,
        };
      }),
    );

    return {
      totalDecks,
      lastSync: decks[0]?.createdAt ?? null,
      topLeaders,
      topCards,
      recentDecks,
    };
  }

  // ── Single meta deck with full card list ──────────────────────────────────

  async getMetaDeck(id: string) {
    const deck = await this.prisma.metaDeck.findUnique({
      where: { id },
      include: { cards: true },
    });
    if (!deck) return null;

    // Resolve leader + base art
    let leaderArt: string | null = null;
    let baseArt: string | null = null;
    if (deck.leaderId) {
      try { leaderArt = (await this.cards.getCard(deck.leaderId)).frontArt; } catch { /* skip */ }
    }
    if (deck.baseId) {
      try { baseArt = (await this.cards.getCard(deck.baseId)).frontArt; } catch { /* skip */ }
    }

    // Group cards by slot
    const leader = deck.cards.filter((c) => c.slot === 'leader' || c.cardId === deck.leaderId);
    const base   = deck.cards.filter((c) => c.slot === 'base'   || c.cardId === deck.baseId);
    const main   = deck.cards.filter((c) => c.slot === 'main' && c.cardId !== deck.leaderId && c.cardId !== deck.baseId);

    // Resolve card data for main deck
    const TYPE_ORDER = ['Leader', 'Base', 'Unit', 'Event', 'Upgrade'];
    const resolvedMain = await Promise.all(
      main.map(async (c) => {
        let name = c.cardId;
        let frontArt: string | null = null;
        let type = 'Unknown';
        let cost: string | null = null;
        try {
          const card = await this.cards.getCard(c.cardId);
          name = card.name;
          frontArt = card.frontArt;
          type = card.type;
          cost = card.cost ?? null;
        } catch { /* skip */ }
        return { cardId: c.cardId, quantity: c.quantity, slot: c.slot, name, frontArt, type, cost };
      }),
    );

    // Sort by type then cost
    resolvedMain.sort((a, b) => {
      const ti = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
      if (ti !== 0) return ti;
      return parseInt(a.cost ?? '99') - parseInt(b.cost ?? '99');
    });

    // Group by type
    const groups: { type: string; cards: typeof resolvedMain }[] = [];
    for (const card of resolvedMain) {
      const g = groups.find((g) => g.type === card.type);
      if (g) g.cards.push(card);
      else groups.push({ type: card.type, cards: [card] });
    }

    return {
      id: deck.id,
      date: deck.date,
      standing: deck.standing,
      leaderName: deck.leaderName,
      baseName: deck.baseName,
      leaderId: deck.leaderId,
      baseId: deck.baseId,
      leaderArt,
      baseArt,
      eventLevel: deck.eventLevel,
      playerCount: deck.playerCount,
      country: deck.country,
      tournament: deck.tournament,
      sourceUrl: deck.sourceUrl,
      hasCards: main.length > 0,
      groups,
    };
  }

  // ── SWUStats: leader winrates (reads from DB) ─────────────────────────────

  async getLeaderWinrates() {
    try {
      const stats = await this.prisma.deckStat.findMany({
        where: { numPlays: { gte: 5 } },
        orderBy: { winRate: 'desc' },
      });

      return Promise.all(
        stats.map(async (s) => {
          let leaderArt: string | null = null;
          let baseArt: string | null = null;
          try {
            const leaderCard = await this.cards.searchByName(s.leaderTitle, s.leaderSubtitle ?? undefined, 'Leader');
            if (leaderCard) leaderArt = leaderCard.frontArt;
          } catch { /* skip */ }
          try {
            const baseCard = await this.cards.searchByName(s.baseTitle, s.baseSubtitle ?? undefined, 'Base');
            if (baseCard) baseArt = baseCard.frontArt;
          } catch { /* skip */ }

          return {
            leaderID: s.leaderID,
            leaderTitle: s.leaderTitle,
            leaderSubtitle: s.leaderSubtitle,
            leaderArt,
            baseID: s.baseID,
            baseTitle: s.baseTitle,
            baseSubtitle: s.baseSubtitle,
            baseArt,
            numPlays: s.numPlays,
            winRate: s.winRate,
            avgTurnsInWins: s.avgTurnsInWins,
            avgTurnsInLosses: s.avgTurnsInLosses,
            avgCardsResourcedInWins: s.avgCardsResourcedInWins,
            avgRemainingHealthInWins: s.avgRemainingHealthInWins,
          };
        }),
      );
    } catch (e) {
      this.logger.warn(`Leader winrates failed: ${e}`);
      return [];
    }
  }

  // ── SWUStats: card winrates (reads from DB) ───────────────────────────────

  async getCardWinrates() {
    try {
      return await this.prisma.cardStat.findMany({
        where: { timesIncluded: { gte: 5 }, cardUid: { not: '' } },
        orderBy: { timesIncluded: 'desc' },
        take: 50,
        select: {
          cardUid: true, cardName: true,
          timesIncluded: true, percentIncludedInWins: true,
          timesPlayed: true, percentPlayedInWins: true,
          timesResourced: true, percentResourcedInWins: true,
        },
      });
    } catch (e) {
      this.logger.warn(`Card winrates failed: ${e}`);
      return [];
    }
  }

  // ── SWUStats: matchup matrix (reads from DB) ──────────────────────────────

  async getMatchupMatrix(leaderID: string, baseID: string) {
    try {
      const rows = await this.prisma.matchupStat.findMany({
        where: { leaderID, baseID, numPlays: { gte: 5 } },
        orderBy: { numPlays: 'desc' },
      });

      return Promise.all(
        rows.map(async (r) => {
          let opponentLeaderArt: string | null = null;
          // Try to resolve opponent leader art via card search
          // opponentLeaderID is a SWUStats UUID — not directly a card ID
          // We'll try finding a DeckStat entry with that leaderID to get the name
          try {
            const opponentDeckStat = await this.prisma.deckStat.findFirst({
              where: { leaderID: r.opponentLeaderID },
            });
            if (opponentDeckStat) {
              const card = await this.cards.searchByName(opponentDeckStat.leaderTitle, opponentDeckStat.leaderSubtitle ?? undefined, 'Leader');
              if (card) opponentLeaderArt = card.frontArt;
            }
          } catch { /* skip */ }

          const winRate = r.numPlays > 0 ? (r.numWins / r.numPlays) * 100 : 0;
          const firstWinRate = r.playsGoingFirst > 0 ? (r.winsGoingFirst / r.playsGoingFirst) * 100 : null;
          const secondWinRate = (r.numPlays - r.playsGoingFirst) > 0
            ? (r.winsGoingSecond / (r.numPlays - r.playsGoingFirst)) * 100
            : null;
          const avgTurns = r.totalTurns > 0 ? r.totalTurns / r.numPlays : null;

          // Get opponent display name
          const opponentDeckStat = await this.prisma.deckStat.findFirst({
            where: { leaderID: r.opponentLeaderID },
          });

          return {
            opponentLeaderID: r.opponentLeaderID,
            opponentBaseID: r.opponentBaseID,
            opponentLeaderTitle: opponentDeckStat?.leaderTitle ?? r.opponentLeaderID,
            opponentLeaderSubtitle: opponentDeckStat?.leaderSubtitle ?? null,
            opponentLeaderArt,
            numWins: r.numWins,
            numPlays: r.numPlays,
            winRate: Math.round(winRate * 10) / 10,
            firstWinRate: firstWinRate ? Math.round(firstWinRate * 10) / 10 : null,
            secondWinRate: secondWinRate ? Math.round(secondWinRate * 10) / 10 : null,
            avgTurns: avgTurns ? Math.round(avgTurns * 10) / 10 : null,
          };
        }),
      );
    } catch (e) {
      this.logger.warn(`Matchup matrix failed: ${e}`);
      return [];
    }
  }

  // ── SWUStats: Melee tournaments ───────────────────────────────────────────

  async getSwuStatsTournaments(limit = 50) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheFile = `swustats_tournaments_${today}.json`;
    const cached = this.loadCache<object[]>(cacheFile);
    if (cached) return cached;

    try {
      const tournaments = await this.swustats.fetchTournaments(limit);

      // Enrich each tournament with winner's leader/base art — batch 5 at a time
      const BATCH = 5;
      const enriched: object[] = [];
      for (let i = 0; i < tournaments.length; i += BATCH) {
        const batch = tournaments.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (t) => {
            try {
              const detail = await this.swustats.fetchTournamentDetail(t.id);
              const top = (detail?.decks ?? []).filter((d) => d.rank <= 3).slice(0, 3);
              const topDecks = await Promise.all(
                top.map(async (d) => {
                  let leaderArt: string | null = null;
                  let baseArt: string | null = null;
                  try {
                    const parts = d.leader.name.split(', ');
                    const lc = await this.cards.searchByName(parts[0], parts[1], 'Leader');
                    if (lc) leaderArt = lc.frontArt;
                  } catch { /* skip */ }
                  try {
                    const bc = await this.cards.searchByName(d.base.name, undefined, 'Base');
                    if (bc) baseArt = bc.frontArt;
                  } catch { /* skip */ }
                  return { rank: d.rank, player: d.player, leaderName: d.leader.name, baseName: d.base.name, leaderArt, baseArt };
                }),
              );
              return { ...t, decks_count: detail?.decks_count ?? 0, topDecks };
            } catch {
              return { ...t, decks_count: 0, topDecks: [] };
            }
          }),
        );
        enriched.push(...results);
      }

      this.saveCache(cacheFile, enriched);
      return enriched;
    } catch (e) {
      this.logger.warn(`SWUStats tournaments failed: ${e}`);
      return [];
    }
  }

  async getSwuStatsTournamentDetail(id: number) {
    try {
      const detail = await this.swustats.fetchTournamentDetail(id);
      if (!detail) return null;

      // Resolve leader + base art for all players in parallel batches of 10
      const BATCH = 10;
      const decks = [...detail.decks];
      const resolved: (typeof decks[0] & { leaderArt: string | null; baseArt: string | null })[] = [];

      for (let i = 0; i < decks.length; i += BATCH) {
        const batch = decks.slice(i, i + BATCH);
        const batchResolved = await Promise.all(
          batch.map(async (d) => {
            let leaderArt: string | null = null;
            let baseArt: string | null = null;
            try {
              const [leaderName, leaderSubtitle] = d.leader.name.split(', ').length > 1
                ? [d.leader.name.split(', ')[0], d.leader.name.split(', ').slice(1).join(', ')]
                : [d.leader.name, undefined];
              const leaderCard = await this.cards.searchByName(leaderName, leaderSubtitle, 'Leader');
              if (leaderCard) leaderArt = leaderCard.frontArt;
            } catch { /* skip */ }
            try {
              const baseCard = await this.cards.searchByName(d.base.name, undefined, 'Base');
              if (baseCard) baseArt = baseCard.frontArt;
            } catch { /* skip */ }
            return { ...d, leaderArt, baseArt };
          }),
        );
        resolved.push(...batchResolved);
      }

      return { ...detail, decks: resolved };
    } catch (e) {
      this.logger.warn(`SWUStats tournament detail failed for ${id}: ${e}`);
      return null;
    }
  }

  // ── Limitless TCG: recent tournaments ────────────────────────────────────

  async getTournaments(limit = 20) {
    try {
      const tournaments = await this.limitless.fetchTournaments(limit);
      return tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        date: t.date,
        format: t.format,
        players: t.players,
        organizerId: t.organizerId,
      }));
    } catch (e) {
      this.logger.warn(`Limitless tournaments failed: ${e}`);
      return [];
    }
  }

  // ── Limitless TCG: tournament standings ──────────────────────────────────

  async getTournamentStandings(tournamentId: string) {
    try {
      return await this.limitless.fetchStandings(tournamentId);
    } catch (e) {
      this.logger.warn(`Limitless standings failed for ${tournamentId}: ${e}`);
      return [];
    }
  }
}
