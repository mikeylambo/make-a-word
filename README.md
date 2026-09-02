# Make a Word

A phrase-mining word game built from the SLU Web Game Shell flow with a DOM-native game layer for web/mobile packaging.

## Current playable build

- Title → Main Menu → Mode Select → Game → Pause → Results
- Classic: reusable phrase letters
- Burn: submitted letters are permanently consumed
- Blitz: 60-second combo-focused run
- Daily Phrase: deterministic phrase of the day with a saved local best
- Phrase Road: 24-stage Classic journey with three medals per phrase
- 76 curated phrases, including 69 Phrase Doctor-certified Burn boards
- Offline validation against a frequency-filtered 15,000-word dictionary
- Visible Burn letter progress and a +1,000 Board Clear reward
- Length-weighted scoring and five-second combo chains
- Local stats, best scores, settings, reduced motion, and background auto-pause
- Keyboard-first desktop play plus touch/native mobile text input
- Responsive safe-area-aware layout intended for later Capacitor/iOS packaging

## Development

```bash
npm install
npm run dev
npm run build
npm run doctor
npm run verify
```

## Architecture

The repository follows the SLU Shell contract rather than modifying the shared shell itself: renderer-neutral screen flow, persistent save state, semantic menu navigation, settings, pause/results, and a game-specific DOM playfield on top.

`npm run doctor` rejects duplicate content, broken Journey ordering, invalid medal thresholds, uncommon Burn-solution words, repeated solution words, and any Burn route that does not consume the phrase exactly.

The curated dictionary is derived from Hermit Dave's MIT-licensed FrequencyWords corpus; its license is included in `licenses/FrequencyWords-LICENSE`.
