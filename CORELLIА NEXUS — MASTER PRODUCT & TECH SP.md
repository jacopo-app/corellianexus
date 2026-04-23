CORELIА NEXUS — MASTER PRODUCT & TECH SPEC

## 0. RUOLO DELL’AI

Agisci come:
- Product Architect
- Senior Full-Stack Engineer
- System Designer

Obiettivo:
Costruire un'app production-ready (MVP avanzato) per tracking competitivo e analytics per Star Wars: Unlimited.

Vincoli:
- Non costruire un deckbuilder
- Non costruire un collection tracker
- Focus su performance reale, dati e insight

---

# 1. PRODUCT DEFINITION

## 1.1 Value Proposition

Corelia Nexus è un sistema di tracking competitivo che trasforma i match giocati in insight utili per:
- migliorare winrate
- identificare matchup deboli
- ottimizzare versioni di deck

Tagline:
“Track less. Understand more. Win smarter.”

---

## 1.2 Target Users

Primary:
- Competitive players
- Playtesters
- Tournament grinders

Secondary:
- Team competitivi
- Content creators

---

## 1.3 Core Problems

- Tracking inconsistente (Excel / memoria)
- Bias cognitivi
- Nessuna visione matchup reale
- Deck iteration non tracciata
- Dati non strutturati

---

## 1.4 Core Features (MVP)

- User account
- Deck import (via link)
- Deck versioning (immutabile)
- Match tracking rapido
- Basic analytics:
  - winrate globale
  - per deck
  - per matchup

---

## 1.5 NON Features (esplicito)

NON implementare:
- deck builder visuale
- gestione collezione carte
- marketplace
- editing carte manuale avanzato

---

# 2. MVP SCOPE

## 2.1 Must Have

- Create user
- Import deck → snapshot
- Create deck version
- Insert match (<20 sec)
- Basic analytics dashboard

---

## 2.2 Must NOT Have (v1)

- social features
- meta globale aggregato
- AI suggestions
- BO3 avanzato
- tagging complesso

---

## 2.3 Minimum Data per Match

- user_id
- deck_version_id
- opponent_archetype
- result (win/loss)
- coin (play/draw opzionale)
- timestamp

---

## 2.4 Fast Match Flow (<20s)

1. Select last used deck (default)
2. Select opponent archetype (autocomplete)
3. Tap Win/Loss
4. Save

NO form complessi.

---

## 2.5 MVP Definition

Un MVP è valido se:
- utente registra 10+ match facilmente
- vede winrate per deck
- vede matchup breakdown

---

# 3. DATA MODEL

## 3.1 Core Entities

- User
- Deck
- DeckVersion
- DeckCard
- Match
- OpponentArchetype

---

## 3.2 Relationships

- User 1—N Deck
- Deck 1—N DeckVersion
- DeckVersion 1—N Match
- DeckVersion 1—N DeckCard
- Match N—1 OpponentArchetype

---

## 3.3 SQL Schema (PostgreSQL)

### users
- id (uuid, pk)
- email
- created_at

### decks
- id (uuid)
- user_id
- name
- created_at

### deck_versions
- id (uuid)
- deck_id
- version_number
- deck_hash (unique)
- source_url
- created_at

### deck_cards
- id
- deck_version_id
- card_id
- quantity

### matches
- id
- user_id
- deck_version_id
- opponent_archetype_id
- result (enum: win/loss)
- coin (enum: play/draw/null)
- created_at

### opponent_archetypes
- id
- name
- normalized_name

---

## 3.4 Deck Snapshot Strategy

- Ogni import crea SEMPRE una nuova deck_version
- deck_version è IMMUTABILE
- deck_hash = hash(normalized_card_list)

---

## 3.5 Hash Strategy

- sort cards by card_id
- stringify: "card_id:qty"
- SHA256

Serve per:
- deduplicazione
- version tracking

---

## 3.6 Avoid Duplicate Deck Versions

Unique constraint:
- (deck_id, deck_hash)

---

## 3.7 Historical Integrity

Mai aggiornare:
- deck_version
- deck_cards

Solo append.

---

# 4. TECH ARCHITECTURE

## 4.1 Stack

Frontend:
- Next.js (React)
- Tailwind

Backend:
- Node.js + NestJS

Database:
- PostgreSQL

ORM:
- Prisma

---

## 4.2 Architecture Pattern

- Monolith modulare (MVP)
- Clean separation:
  - API layer
  - Service layer
  - Data layer

---

## 4.3 Components

- Auth module
- Deck module
- Import module
- Match module
- Analytics module

---

## 4.4 External API Strategy

NON usare API esterne come source of truth.

Usale solo per:
- import iniziale
- arricchimento dati

---

## 4.5 Adapter Layer

Creare:
DeckProviderInterface

Implementazioni:
- SWUDBProvider
- Future providers

---

## 4.6 Caching

- Cache card data (Redis opzionale)
- Cache deck imports (short TTL)

---

## 4.7 Resilience

- Se provider fallisce → fallback error controllato
- Non bloccare app

---

# 5. DECK IMPORT FLOW

## 5.1 Flow

Input:
- URL

Steps:
1. Detect provider
2. Fetch raw data
3. Parse
4. Normalize
5. Generate hash
6. Save deck_version
7. Save deck_cards

---

## 5.2 Internal Deck Format

{
  "leader": "...",
  "base": "...",
  "cards": [
    { "card_id": "...", "qty": 3 }
  ]
}

---

## 5.3 Provider Interface

interface DeckProvider {
  canHandle(url): boolean
  fetch(url): rawData
  parse(rawData): DeckDTO
}

---

## 5.4 Error Handling

- invalid URL
- parsing failure
- unknown card

Return:
- structured error

---

## 5.5 Future Support

- paste text decklist
- manual input

---

# 6. API DESIGN

## 6.1 Principles

- REST
- clear separation read/write
- validation server-side

---

## 6.2 Endpoints

### Auth
POST /auth/register

---

### Decks
POST /decks/import
GET /decks
GET /decks/:id
GET /decks/:id/versions

---

### Matches
POST /matches
GET /matches

---

### Analytics
GET /analytics/overview
GET /analytics/deck/:id
GET /analytics/matchups

---

## 6.3 Example: Create Match

POST /matches

{
  "deckVersionId": "...",
  "opponentArchetype": "Control Vader",
  "result": "win"
}

---

## 6.4 Validation Rules

- deckVersion must exist
- archetype normalized
- result required

---

# 7. UX / SCREENS

## 7.1 Screens

- Login/Register
- Dashboard
- Deck List
- Deck Detail
- Import Deck
- Match Entry
- Analytics

---

## 7.2 Core UX Principle

Minimize friction.

---

## 7.3 Match Entry UX

- Default last deck
- Archetype autocomplete
- Big Win/Loss buttons
- One tap save

---

## 7.4 Dashboard

- Winrate
- Matches count
- Recent matches

---

## 7.5 Deck Detail

- Versions list
- Stats per version
- Matchup table

---

# 8. ANALYTICS

## 8.1 Metrics MVP

- Winrate = wins / total
- Match count
- Winrate per matchup

---

## 8.2 Advanced (future)

- play vs draw
- trend over time
- confidence intervals

---

## 8.3 Sample Size Awareness

Mostrare sempre:
- n partite

Evidenziare:
- low sample size

---

## 8.4 Avoid Misleading Data

- non mostrare matchup < 5 games come “reliable”

---

# 9. DEVELOPMENT PLAN

## 9.1 Milestones

1. Setup project
2. Auth + DB
3. Deck import
4. Match tracking
5. Analytics basic
6. UI polish

---

## 9.2 Timeline

2 settimane:
- backend base
- schema DB

1 mese:
- MVP completo

2 mesi:
- stabile + UX migliorata

---

## 9.3 Backlog (High Priority)

- deck import
- match insert
- analytics overview

---

## 9.4 Testing

- import deck
- insert match flow
- analytics correctness

---

# 10. FINAL OUTPUTS

## 10.1 DB Schema
(vedi sezione 3)

## 10.2 Backend Architecture
NestJS modular

## 10.3 API List
(vedi sezione 6)

## 10.4 User Flow

Import deck → create version → insert match → view analytics

---

## 10.5 Sprint 1

- setup repo
- auth
- DB schema
- deck import base

---

## 10.6 Key Risks

### Input friction
→ soluzione: UX minimal

### External dependency
→ adapter layer

### Low initial value
→ insight progressivi

---

# END OF SPEC