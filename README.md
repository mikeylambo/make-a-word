# Make a Word

A phrase-based word game built from the SLU Web Game Shell flow with a DOM-native game layer for web/mobile packaging.

## Current playable build

- Title → Main Menu → Mode Select → Game → Pause → Results
- Classic: reusable phrase letters
- Burn: submitted letters are permanently consumed
- Blitz: 60-second combo-focused run
- Daily Phrase: deterministic phrase of the day with a saved local best
- Trials: 24 Classic challenges with three medals per phrase
- Play Together: same-device Word Relay and Pass & Play for 2–4 players
- 376 phrases across classroom, nature, play, arts, adventure, and original challenge themes
- Offline validation against a frequency-filtered dictionary plus 5,800+ verified common inflections
- Visible Burn letter progress and a +1,000 Board Clear reward
- Length-weighted scoring and five-second combo chains
- Local stats, best scores, settings, reduced motion, and background auto-pause
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

`npm run doctor` rejects duplicate content, broken Trial ordering, invalid medal thresholds, uncommon Burn-solution words, repeated solution words, and any Burn route that does not consume the phrase exactly. It also checks required everyday inflections such as `heats`.

The curated dictionary is derived from Hermit Dave's MIT-licensed FrequencyWords corpus; its license is included in `licenses/FrequencyWords-LICENSE`. Static inflections are verified against `an-array-of-english-words`; its MIT license is included in `licenses/AnArrayEnglishWords-LICENSE`.
