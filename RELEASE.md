# Release log

## Finishing pass — Phase A: Measurement

### Found

- The shipped bank contains 376 phrases; 300 come from the generated expansion.
- The prior content gate verified only structural validity. It did not constrain phrase length, solution-space size, or the relationship between measured difficulty and authored difficulty.

### Measured

Run `npm run analyze` to reproduce these numbers against the 20,810-word shipped server dictionary.

| Measurement | Baseline |
| --- | ---: |
| Phrase count | 376 |
| Median letter count | 28 |
| Median findable words | 2,834 |
| Minimum findable words | 182 |
| Maximum findable words | 9,078 |
| Outside the 250–900 solution band | 362 |
| Outside the 15–22 letter band | 352 |

The tightest board is `leave-mark` at 182 words. The broadest is `arts-3-9` at 9,078 words. These values differ slightly from the hand-off snapshot because this run uses the exact dictionary currently generated and shipped by the repository.

### Changed

- Added `scripts/analyze-phrases.mjs` and a reusable analysis library.
- Added deterministic per-phrase measurements in `content/phrase-analysis.json`, including length buckets and the twenty highest-scoring words.
- Added failing `SOLUTION_BAND`, `LENGTH_BAND`, and `DIFFICULTY_TRUTH` gates for all non-legacy content.
- Marked the current bank as legacy so Phase A can establish the gate before Phase B replaces the bank.
- Added `npm run analyze` to the verification pipeline.

## Finishing pass — Phase B: Content reset

Status: **approved and shipped in the game.**

### Found

- The original single 250–900 solution band rejected most familiar sayings: only 27 of 127 tested canonical phrases passed it.
- Canonical phrases need a distinct 150-word floor because their familiarity gives players a foothold while the smaller solution space strengthens the letter constraint.
- The reviewed addendum supplied 48 unique additions after choosing `WILD GOOSE CHASE` over its duplicate variant. Those additions replaced weaker repetitive vignettes instead of expanding the launch bank beyond 150.

### Measured

- 150 shipped phrases pass their type-specific bands against the 20,810-word dictionary.
- Canonical band: 12–22 letters and 150–900 findable words. Invented band: 15–22 letters and 250–900 findable words.
- 53 of 150 phrases are canonical: **35.3%**, above the 30% product gate.
- 24 adult-oriented categories are represented, including the new Tongue Twisters, Game Show, and Mischief groups.
- Median board: 18 letters and 565 findable words. The full bank averages 554 findable words.
- `VARIETY` passes: no non-stopword appears in more than three phrases. `TEMPLATE` passes: no two-word pair appears in more than two phrases.
- The fixed seeded Daily order passes a 365-day adjacent-category test.
- The Burn solver found non-trivial, phrase-word-free partitions for 147 boards. `WHICH WRISTWATCH IS SWISS`, `RUBBER BABY BUGGY BUMPERS`, and `RUSH HOUR MOVES SLOWLY` remain valid Classic/Daily boards without Burn metadata.
- Burn search visited 5,675 states total, averaging 38 states per phrase.

The scripted Trial runner uses 15 words per minute for a 120-second round. Medal thresholds are the cumulative score at 35%, 65%, and 90% of that 30-word run.

| Trial | Phrase | 35% | 65% | 90% |
| ---: | --- | ---: | ---: | ---: |
| 1 | OLD HABITS DIE HARD | 15,174 | 26,838 | 35,910 |
| 2 | WASTE NOT WANT NOT | 8,892 | 13,752 | 17,532 |
| 3 | CHASING THE SUNSHINE | 18,090 | 33,318 | 44,658 |
| 4 | BUTTER MAKES IT BETTER | 13,482 | 25,146 | 34,218 |
| 5 | BACK ROADS AFTER DARK | 16,290 | 28,278 | 37,350 |
| 6 | LAST CALL CAME AND WENT | 13,572 | 25,236 | 34,308 |
| 7 | BASS SHAKES THE FLOOR | 15,588 | 29,520 | 38,592 |
| 8 | MONEY DOESNT GROW ON TREES | 18,270 | 33,174 | 44,514 |
| 9 | CAST AWAY FROM SHORE | 15,588 | 29,196 | 38,268 |
| 10 | MAKE YOUR NEXT MOVE COUNT | 16,182 | 30,762 | 39,834 |
| 11 | CATCH THE LAST TRAIN | 17,352 | 31,932 | 41,652 |
| 12 | BRUNCH CAN WAIT UNTIL NOON | 17,370 | 31,950 | 42,966 |
| 13 | ANOTHER CUP OF COFFEE | 12,672 | 24,336 | 33,408 |
| 14 | LAZY DAY BESIDE THE LAKE | 15,174 | 28,134 | 37,206 |
| 15 | PACK YOUR BAGS AND GO | 15,318 | 26,982 | 33,462 |
| 16 | SAVE ME A SEAT IN THE BACK | 17,370 | 31,950 | 42,318 |
| 17 | KEYS LEFT BY THE FRONT DOOR | 16,848 | 31,428 | 42,768 |
| 18 | CHECK THE NUMBERS TWICE | 15,786 | 30,042 | 39,114 |
| 19 | EXTRA CHEESE ON TOP | 16,110 | 30,690 | 41,706 |
| 20 | LAST CALL BEFORE TWO | 17,028 | 31,608 | 41,976 |
| 21 | ONE POINT LEFT ON THE CLOCK | 17,676 | 29,988 | 39,060 |
| 22 | WHICH WRISTWATCH IS SWISS | 10,980 | 18,756 | 24,804 |
| 23 | TELL THEM WHAT THEY WON | 12,222 | 20,430 | 26,478 |
| 24 | THAT WAS NOT THE PLAN | 12,042 | 21,978 | 28,026 |

### Changed

- Removed `SPEAK OF THE DEVIL`; `OLD HABITS DIE HARD` now occupies its reviewed slot.
- Replaced the legacy and combinatorial banks with the measured 150-phrase production bank; removed the expansion generator and runtime imports.
- Added `canonical`, display-text, variety, template, canonical-ratio, and exact display-letter gates to the build.
- Added proper apostrophe display without turning punctuation into playable letter tiles.
- Re-derived difficulty, 147 Burn partitions, and all 24 Trial medal sets from the shipped bank.
- Preserved the stable seeded Daily permutation and made bank review part of `npm run verify`.
