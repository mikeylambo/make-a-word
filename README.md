# Make a Word

A phrase-based word game built from the SLU Web Game Shell flow with a DOM-native game layer for web/mobile packaging.

## Current playable build

- Main Menu → Mode Select → Game → Pause → Results
- Classic: reusable phrase letters
- Burn: submitted letters are permanently consumed
- Classic: selectable 1-, 2-, or 3-minute rounds with separate best scores
- Daily Phrase: deterministic phrase of the day with a saved local best
- Trials: 24 Classic challenges with three medals per phrase
- Play Together: named 2–4 player matches with 1, 3, or 5 rounds
- Word Relay, private-list Pass & Play, and two-strike Last Word party rules
- Online Word Race rooms for 2–8 players with live standings, readiness, host controls, and reconnectable sessions
- Server-authoritative online word validation, shared score/rarity rules, timers, and round progression backed by Upstash Redis
- Online final standings and lifetime progression use full-match word/score totals and idempotent match completion
- Shareable score challenges that preserve the exact phrase and rules
- 150 measured launch phrases, including 50 familiar/canonical phrases, with 147 verified Burn boards and 24 authored Trials
- Offline validation against one shared 18,704-word client/server dictionary authority
- Visible Burn letter progress, leftover costs, and a +1,000 Board Clear reward
- Rank-weighted word values and a five-second bank-or-risk chain system
- Aggregate, opt-out analytics with no submitted words or player names; collection begins only after the saved preference is loaded
- Player levels, achievements, Daily streaks, party/challenge stats, best scores, and local persistence
- Save recovery for malformed/restricted storage plus monotonic reconciliation against stale in-session writers
- Settings, reduced motion, background auto-pause, and background audio suspension
- Keyboard-first desktop play plus touch/native mobile text input
- Responsive safe-area-aware layout intended for later Capacitor/iOS packaging

## Development

```bash
npm install
npm run dictionary:build
npm run phrases:bank
npm run dev
npm run build
npm run doctor
npm run verify
```

`npm run verify` is the release gate. CI installs from the lockfile with `npm ci`, then runs dictionary parity, phrase analysis/review, Phrase Doctor, Burn performance, score and word-rule runtime tests, theme/board checks, mobile/runtime checks, menu routing, full game-flow invariants, save recovery/reconciliation tests, telemetry privacy/rate-limit checks, TypeScript, and the production build.

## Architecture

The repository follows the SLU Shell contract rather than modifying the shared shell itself: renderer-neutral screen flow, persistent save state, semantic menu navigation, settings, pause/results, and a game-specific DOM playfield on top.

Online rooms are exposed through `api/room.ts`. Room codes are public join identifiers; per-player tokens are stored in session storage, hashed before persistence, and sent through authorization headers when polling. Rooms expire after six hours. The server remains authoritative for dictionary validation and scoring, while clients continuously synchronize the canonical Redis state.

`npm run doctor` rejects duplicate content, broken Trial ordering, invalid medal thresholds, uncommon Burn-solution words, repeated solution words, and any Burn route that does not consume the phrase exactly. It also checks required everyday inflections such as `heats`.

The curated dictionary is derived from Hermit Dave's MIT-licensed FrequencyWords corpus; its license is included in `licenses/FrequencyWords-LICENSE`. Static inflections are verified against `an-array-of-english-words`; its MIT license is included in `licenses/AnArrayEnglishWords-LICENSE`.
