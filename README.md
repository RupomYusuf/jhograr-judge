# Jhograr Judge ⚖️

**Jhogra hoise? Judge daki.** — *Two sides. One way forward.*

An AI-powered conflict-resolution product for everyday interpersonal disagreements — couples, friends, siblings, family, roommates. Not a courtroom, not therapy software: it behaves like that unusually emotionally intelligent mutual friend who hears both sides privately, finds what the argument is *actually* about, and guides both people toward the most realistic resolution available.

The primary KPI is not "who won". It is: **did the conflict move meaningfully toward resolution?**

---

## Quick start

```bash
npm install
npx prisma db push      # creates SQLite database (prisma/dev.db)
npm run dev             # http://localhost:3000
```

No API keys required to run — the app ships with a deterministic `MockConflictAIProvider`. To upgrade to a live LLM, set:

```bash
OPENAI_API_KEY=sk-...     # optional; OPENAI_MODEL defaults to gpt-4o-mini
```

Tests: `npm test` (vitest, covers language/tone detection, safety screening, adaptive intake, privacy boundaries on the shared map).

Demo: open the landing page and click **"Or peek at a finished session"** — a fully seeded two-sided conflict ("The Reply Delay") playable without an account.

---

## The three entry modes

| Mode | Route | Job |
|---|---|---|
| **Solve a Jhogra** | `/start` → `/session/[code]` | Two-person conflict resolution (primary experience) |
| **Help me think** | `/solo` | One person only. Strictly separates *known* from *assumed* — never pretends to know the absent person's intentions |
| **Help me say it** | `/say` | Rewrites a draft message so it can be heard; never sanitizes a legitimate boundary, user keeps the final word |

## Session flow (state machine)

```
create → waiting (B not joined) → intake (two private AI conversations)
      → confirm (each side approves their structured readback)
      → predict (each side privately predicts the other's answers)
      → map (shared Jhogra Map: agreed / disputed / not established / hidden disagreement)
      → resolution (context-specific options, private votes, overlap search)
      → agreement (Peace Treaty) → followup (did the treaty survive?)
      → closed (resolved, or honestly "not solved — but clearer")
```

Safety overrides everything: any message matching the safety patterns locks ordinary joint mediation (`status: safety`), shows the private support screen, and never discloses what was reported to the other participant.

## Architecture

```
src/
  lib/
    types.ts          domain models + AIProvider interface
    ai/signals.ts     language (en/bn/banglish), tone, safety, conflict-type classification
    ai/mock.ts        MockConflictAIProvider — deterministic adaptive engine (default)
    ai/openai.ts      OpenAIConflictAIProvider — same interface, structured outputs, falls back to mock on outage
    ai/index.ts       provider factory (OPENAI_API_KEY switches providers)
    session.ts        state-machine transitions + shared projections (privacy boundaries)
    client.ts         token storage, polling hook, device-local history
  app/
    api/sessions/            create (POST), state (GET, auth'd), delete
    api/sessions/[code]/     action (all mutations, one discriminated union), join
    api/demo/                seeded flagship conflict
    api/say/                 message rewriting
    page.tsx                 landing
    start/ join/[code]/      relationship selection, invite page
    session/[code]/          the whole two-person experience (stage-driven)
    solo/ say/ history/      the other modes + device-local dashboard
  components/ui.tsx          hand-rolled warm UI primitives
prisma/schema.prisma         Session / Participant / Message
```

### Design decisions

- **No accounts for the MVP.** Each participant holds a secret participant token (24 random bytes). Every API request is authorized against that token. Low friction for the second person is a product requirement.
- **AI behind an interface.** `AIProvider` methods may be sync (mock) or async (live); the whole product runs identically on either. The live provider validates structured outputs with Zod and falls back to the mock engine on any failure so a live session never breaks mid-argument.
- **Realtime is polling** behind `useSession` (3s, visibility-aware). The hook is the only coupling point — swapping in Supabase Realtime or WebSockets later touches one file.
- **SQLite now, Postgres-ready.** The Prisma schema uses no SQLite-specific features; swap the datasource and push.
- **Language is detected, never selected.** Bangla script, Banglish markers, and English are handled per-message; Judge replies in the user's dominant register.
- **Analytics-ready events** are named in the state transitions (`session_created`, `conflict_map_generated`, `agreement_reached`, …) but no conflict content ever leaves the session row.

### Privacy boundaries (load-bearing)

- Private messages are per-participant and are **never** included in any projection the other side can read — not even truncated.
- The shared map contains only **processed, user-confirmed** content, rewritten into reported speech (`toReportedSpeech`) — raw first-person sentences never cross the boundary.
- Cross-side event matching never fabricates agreement: unmatched recollections are labeled *not established*, not "disputed".
- Safety disclosures stay on the participant row; the other participant only sees that the session is paused.
- `DELETE /api/sessions/[code]` removes the whole session. History on `/history` is device-local (localStorage) and removable.

### Anti-rigidity (the core product requirement)

The engine is not a 10-step questionnaire:

- The intake asks **one adaptive question at a time**, chosen by what's still missing (meaning → want → history → resolution), echoing the user's own words.
- Conflict-type classification (expectation mismatch, communication failure, broken promise, recurring pattern, trust, household, money, …) drives which map read and which resolution paths get generated.
- Tone classification (light / neutral / serious) controls humour — playful copy disappears the moment the situation is serious.
- Resolution paths span clarify / acknowledge / apologize / compromise / agreement / boundary / experiment / space / accept-difference — "no agreement, but clearer" is a first-class outcome, never a failure state.
- No artificial 50/50 responsibility; the map states what's agreed, what's disputed, and what's simply not established.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run test        # vitest
npx prisma studio   # inspect the database
```
