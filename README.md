# Make a Word

A phrase-mining word game built from the SLU Web Game Shell flow with a DOM-native game layer for web/mobile packaging.

## Current playable build

- Title → Main Menu → Mode Select → Game → Pause → Results
- Classic: reusable phrase letters
- Burn: submitted letters are permanently consumed
- Blitz: 60-second combo-focused run
- Daily Phrase: deterministic phrase of the day with a saved local best
- Offline English validation using `an-array-of-english-words`
- Length-weighted scoring and five-second combo chains
- Local stats, best scores, settings, reduced motion, and background auto-pause
- Keyboard-first desktop play plus touch/native mobile text input
- Responsive safe-area-aware layout intended for later Capacitor/iOS packaging

## Development

```bash
npm install
npm run dev
npm run build
```

## Architecture

The repository follows the SLU Shell contract rather than modifying the shared shell itself: renderer-neutral screen flow, persistent save state, semantic menu navigation, settings, pause/results, and a game-specific DOM playfield on top.

Next production passes: curated dictionary policy, phrase-doctor/content tooling, onboarding, haptics/audio polish, progression/achievements, App Store packaging, and device testing.
