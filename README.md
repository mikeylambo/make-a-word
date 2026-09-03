# Make a Word

A phrase-based word game built from the SLU Web Game Shell flow with a DOM-native game layer for web/mobile packaging.

## Current playable build

- Title → Main Menu → Mode Select → Game → Pause → Results
- Classic: reusable phrase letters
- Burn: submitted letters are permanently consumed
- Blitz: 60-second combo-focused run
- Daily Phrase: deterministic phrase of the day with a saved local best
- Trials: 24 Classic challenges with three medals per phrase
- Play Together: named 2–4 player matches with 1, 3, or 5 rounds
- Word Relay, private-list Pass & Play, and two-strike Last Word party rules
- Online Word Race rooms for 2–8 players with live standings, readiness, host controls, and reconnectable sessions
- Server-authoritative online word validation, scoring, combos, timers, and round progression backed by Upstash Redis
- Shareable score challenges that preserve the exact phrase and rules
- 376 phrases across classroom, nature, play, arts, adventure, and original challenge themes
- Offline validation against a frequency-filtered dictionary plus 5,800+ verified common inflections
- Visible Burn letter progress and a +1,000 Board Clear reward
- Length-weighted scoring and five-second combo chains
- Player levels, achievements, Daily streaks, party/challenge stats, best scores, and local persistence
- Settings, reduced motion, and background auto-pause
- Keyboard-first desktop play plus touch/native mobile text input
- Responsive safe-area-aware layout intended for later Capacitor/iOS packaging

## Development

```bash
npm install
npm run dictionary:build
npm run phrases:build
npm run dev
npm run build
npm run doctor
npm run verify
```

## Architecture

The repository follows the SLU Shell contract rather than modifying the shared shell itself: renderer-neutral screen flow, persistent save state, semantic menu navigation, settings, pause/results, and a game-specific DOM playfield on top.

Online rooms are exposed through `api/room.ts`. Room codes are public join identifiers; per-player tokens are stored in session storage, hashed before persistence, and sent through authorization headers when polling. Rooms expire after six hours. The server remains authoritative for dictionary validation and scoring, while clients continuously synchronize the canonical Redis state.

`npm run doctor` rejects duplicate content, broken Trial ordering, invalid medal thresholds, uncommon Burn-solution words, repeated solution words, and any Burn route that does not consume the phrase exactly. It also checks required everyday inflections such as `heats`.

The curated dictionary is derived from Hermit Dave's MIT-licensed FrequencyWords corpus; its license is included in `licenses/FrequencyWords-LICENSE`. Static inflections are verified against `an-array-of-english-words`; its MIT license is included in `licenses/AnArrayEnglishWords-LICENSE`.
