import { writeFile } from 'node:fs/promises';
import { analyzePhrase, assertDailyLabelRotation, loadDictionary, measuredDifficultyById, root, STOP_WORDS, wordsIn } from './phrase-analysis-lib.mjs';

const sources = {
  Idioms: [
    'A BLESSING IN DISGUISE', 'BEAT AROUND THE BUSH', 'BURN THE MIDNIGHT OIL', 'GET YOUR ACT TOGETHER',
    'HIT THE NAIL ON THE HEAD', 'LET THE CAT OUT OF THE BAG', 'ONCE IN A BLUE MOON', 'PULL YOURSELF TOGETHER',
    'THE BALL IS IN YOUR COURT', 'THROW CAUTION TO THE WIND', 'UNDER THE WEATHER',
    'WATER UNDER THE BRIDGE', 'BEST OF BOTH WORLDS', 'BARKING UP THE WRONG TREE', 'COSTS AN ARM AND A LEG',
    'THE DEVIL IS IN THE DETAILS', 'KEEP YOUR EYE ON THE BALL', 'NO STONE LEFT UNTURNED', 'OUT OF THE FRYING PAN',
    'PUT ALL EGGS IN ONE BASKET', 'READ BETWEEN THE LINES', 'TAKE IT WITH A GRAIN OF SALT', 'TIP OF THE ICEBERG',
    'TWO SIDES OF THE SAME COIN', 'BACK TO THE DRAWING BOARD', 'JUST THE TIP OF THE ICEBERG'
  ],
  Proverbs: [
    'ALL GOOD THINGS MUST END', 'ALL THAT GLITTERS IS NOT GOLD', 'BETTER LATE THAN NEVER', 'FORTUNE FAVORS THE BOLD',
    'HONESTY IS THE BEST POLICY', 'IF IT AINT BROKE DONT FIX IT', 'KNOWLEDGE IS POWER', 'LAUGHTER IS THE BEST MEDICINE',
    'LOOK BEFORE YOU LEAP', 'PRACTICE MAKES PERFECT', 'ROME WAS NOT BUILT IN A DAY', 'THE EARLY BIRD GETS THE WORM',
    'TIME AND TIDE WAIT FOR NO ONE', 'TWO HEADS ARE BETTER THAN ONE', 'WHEN IN ROME DO AS ROMANS DO', 'YOU REAP WHAT YOU SOW',
    'BEAUTY IS IN THE EYE OF BEHOLDER', 'CURIOSITY KILLED THE CAT', 'EVERY DOG HAS ITS DAY', 'HASTE MAKES WASTE',
    'THE PEN IS MIGHTIER THAN SWORD', 'THE PROOF IS IN THE PUDDING', 'STILL WATERS RUN DEEP', 'TOO MANY COOKS SPOIL THE BROTH',
    'A WATCHED POT NEVER BOILS', 'A STITCH IN TIME SAVES NINE', 'HASTE ALWAYS MAKES WASTE'
  ],
  Weather: [
    'CALM BEFORE THE STORM', 'CHASING THE SUNSHINE', 'CLOUDS ON THE HORIZON', 'DANCING IN THE RAIN',
    'FIRST LIGHT AFTER RAIN', 'FROST ON THE WINDOWPANE', 'HOT ENOUGH TO MELT', 'LIGHTNING IN THE DISTANCE',
    'RAIN AGAINST THE GLASS', 'SUN BREAKS THROUGH CLOUDS', 'THUNDER ROLLS AT NIGHT', 'WARM WIND FROM THE SOUTH',
    'WEATHER TURNS ON A DIME', 'WINDS ARE PICKING UP', 'AFTER RAIN COMES THE SUN', 'STORM CLOUDS GATHER FAST',
    'A COLD FRONT MOVES IN', 'SKIES CLEAR BEFORE MORNING', 'QUICK FROST BEFORE DAWN', 'THICK FOG BEFORE SUNRISE',
    'WIND CHILL DROPS QUICKLY', 'SNOW FALLS ON QUIET STREETS', 'GRAY SKIES BEFORE SUNSET', 'BLACK CLOUDS ABOVE THE HILL',
    'COLD RAIN BEFORE DAYBREAK', 'BREEZY NIGHT AFTER THE STORM', 'HOT ENOUGH TO MELT ICE'
  ],
  Kitchen: [
    'BUTTER MAKES IT BETTER', 'COOK UNTIL GOLDEN BROWN', 'FRESH BREAD FROM THE OVEN', 'GARLIC SIZZLING IN THE PAN',
    'KITCHEN OPEN ALL NIGHT', 'MEASURE TWICE BAKE ONCE', 'PASS THE SALT AND PEPPER', 'A RECIPE HANDED DOWN',
    'SET THE TABLE FOR TWO', 'SIMMER LOW AND SLOW', 'SUGAR SPICE AND EVERYTHING NICE', 'TASTE BEFORE YOU SERVE',
    'THE SECRET IS IN THE SAUCE', 'TOO MANY COOKS IN THE KITCHEN', 'WHISK UNTIL SMOOTH', 'DINNER IS ALMOST READY',
    'SAVE ROOM FOR DESSERT', 'FRESH HERBS ON THE COUNTER'
  ],
  'Road Trip': [
    'BACK ROADS AFTER DARK', 'CHASING THE HORIZON', 'FILL UP BEFORE WE GO', 'FOLLOW THE OPEN ROAD',
    'MILES BEFORE MORNING', 'NEXT STOP SOMEWHERE NEW', 'PACK LIGHT AND DRIVE FAR', 'RADIO UP WINDOWS DOWN',
    'THE ROAD GOES ON FOREVER', 'TAKE THE SCENIC ROUTE', 'TWO LANES OUT OF TOWN', 'WE MISSED THE LAST EXIT',
    'WHEREVER THE ROAD LEADS', 'THE TANK IS ALMOST EMPTY', 'MOTEL LIGHTS IN THE DISTANCE', 'LAST STOP BEFORE THE BORDER',
    'TURN LEFT AT THE OLD SIGN', 'FOLLOW THE MAP TO NOWHERE'
  ],
  'Late Night': [
    'AFTER HOURS DOWNTOWN', 'THE CITY NEVER REALLY SLEEPS', 'LAST CALL CAME AND WENT', 'LIGHTS LOW MUSIC LOUD',
    'MIDNIGHT ON THE CLOCK', 'NEON FLICKERS OUTSIDE', 'NO SLEEP UNTIL MORNING', 'ONE MORE ROUND BEFORE BED',
    'QUIET STREETS AFTER RAIN', 'STARS OUT PAST MIDNIGHT', 'THE NIGHT IS STILL YOUNG', 'THOUGHTS KEEP ME AWAKE',
    'ONLY THE STREETLIGHTS KNOW', 'THE LAST TRAIN LEFT EARLY', 'MOONLIGHT THROUGH THE BLINDS', 'EVERY WINDOW HAS A STORY',
    'NOTHING GOOD HAPPENS EARLY', 'THE CLOCK MOVES SLOWLY NOW'
  ],
  Music: [
    'THE BEAT DROPS RIGHT ON TIME', 'BASS SHAKES THE FLOOR', 'A CHORUS STUCK IN MY HEAD', 'DANCE LIKE NOBODY IS WATCHING',
    'DROP THE NEEDLE AGAIN', 'EVERY SONG TELLS A STORY', 'FEEL THE RHYTHM TONIGHT', 'HARMONY HIDES IN SILENCE',
    'KEEP THE MUSIC PLAYING', 'LOST INSIDE THE MELODY', 'ONE MORE SONG BEFORE WE GO', 'PLAY IT LOUDER THIS TIME',
    'RHYTHM MOVES THE ROOM', 'SING IT FROM THE HEART', 'THAT OLD FAMILIAR SONG', 'THE BAND PLAYS ALL NIGHT',
    'TURN THE VOLUME UP', 'THE DRUMMER SETS THE PACE', 'A MELODY OUTLASTS WORDS', 'THE RECORD STARTS TO SPIN',
    'RHYTHM MOVES A DARK ROOM'
  ],
  Money: [
    'A PENNY FOR YOUR THOUGHTS', 'MONEY DOESNT GROW ON TREES', 'SAVE IT FOR A RAINY DAY', 'COUNTING EVERY LAST CENT',
    'DOLLARS MAKE NO SENSE', 'EARNED THE HARD WAY', 'EVERY PENNY COUNTS', 'FOLLOW THE MONEY TRAIL',
    'GOOD CREDIT TAKES TIME', 'LIVE WITHIN YOUR MEANS', 'MONEY TALKS PEOPLE LISTEN', 'PAY YOURSELF FIRST',
    'THE PRICE OF EVERYTHING', 'KEEP SOMETHING FOR LATER', 'A BARGAIN AT HALF THE PRICE', 'THE CHECK IS IN THE MAIL',
    'NOT EVERYTHING HAS A PRICE', 'SMALL SAVINGS ADD UP FAST'
  ],
  'The Sea': [
    'CAST AWAY FROM SHORE', 'DEEP BLUE OPEN WATER', 'FOLLOW THE NORTH STAR', 'HIGH TIDE AFTER MIDNIGHT',
    'LOST BEYOND THE HORIZON', 'SAIL CLOSE TO THE WIND', 'SALT AIR AND OPEN WATER', 'THE SHIP LEFT THE HARBOR',
    'A STORM RISING OVER SEA', 'THE TIDES ARE TURNING FAST', 'TREASURE BURIED BELOW', 'WAVES CRASH AGAINST SHORE',
    'THE LIGHTHOUSE GUIDES US', 'A MESSAGE IN A BOTTLE', 'SAFE HARBOR BEFORE NIGHT', 'THE CURRENT PULLS US HOME',
    'SAILS BRIGHT AGAINST THE SKY', 'DEEP WATER HIDES OLD SECRETS'
  ],
  'Game Night': [
    'DEAL THE CARDS AGAIN', 'EVERYBODY GETS A TURN', 'GAME NIGHT STARTS NOW', 'KEEP YOUR CARDS CLOSE',
    'LUCK CHANGES EVERY ROUND', 'MAKE YOUR NEXT MOVE COUNT', 'ONE LAST GAME BEFORE HOME', 'PLAY THE HAND YOURE DEALT',
    'ROLL THE DICE AND HOPE', 'THE SCORE IS TIED AGAIN', 'A TABLE FULL OF FRIENDS', 'WINNER TAKES THE GLORY',
    'YOUR MOVE BEFORE THE BELL', 'THE FINAL ROUND BEGINS', 'SAVE YOUR BEST MOVE FOR LAST', 'ONE POINT CHANGES EVERYTHING',
    'PLAY IT SMART OR PLAY IT SAFE', 'SHUFFLE THE DECK ONCE MORE', 'JOKER WAITS IN THE DECK', 'QUICK DRAW WINS THE POT',
    'SIX DICE ROLL AT ONCE', 'PUZZLE BOX ON THE TABLE', 'QUIZ NIGHT ENDS IN A TIE', 'CHECKMATE BEFORE LAST CALL',
    'BLUFF YOUR WAY TO THE WIN', 'EXACT SCORE TAKES THE ROUND'
  ],
  'City Life': [
    'CATCH THE LAST TRAIN', 'CITY LIGHTS AFTER RAIN', 'COFFEE BEFORE THE COMMUTE', 'DOWNTOWN AFTER MIDNIGHT',
    'EVERY STREET HAS A STORY', 'MISS THE MORNING TRAIN', 'NEON SIGNS AND TAXICABS', 'RUSH HOUR MOVES SLOWLY',
    'SIDEWALKS NEVER STAY EMPTY', 'THE STREETLIGHTS FLICKER ON', 'CROSS TOWN BEFORE SUNSET', 'THE CORNER STORE STAYS OPEN',
    'TRAFFIC LIGHTS TURN RED', 'A CAB WAITS BY THE CURB', 'WINDOWS GLOW ABOVE THE STREET', 'THE SUBWAY RUNS ALL NIGHT',
    'RAIN SHINES ON THE PAVEMENT', 'MEET ME UNDER THE MARQUEE'
  ],
  Weekend: [
    'BRUNCH CAN WAIT UNTIL NOON', 'LAZY MORNING NO REGRETS', 'LEAVE THE ALARM CLOCK OFF', 'MEET ME OUT AFTER DARK',
    'NO PLANS ARE GOOD PLANS', 'ONE MORE HOUR IN BED', 'SATURDAY STARTS SLOWLY', 'SLEEP IN AND STAY OUT LATE',
    'SUNDAY MOVES TOO FAST', 'TAKE THE LONG WAY HOME', 'NOTHING DUE UNTIL MONDAY', 'THE WEEK CAN WAIT OUTSIDE',
    'BREAKFAST BECOMES LUNCH', 'A QUIET AFTERNOON AT HOME', 'FRIENDS ARRIVE AFTER SUNSET', 'SAVE THE ERRANDS FOR LATER',
    'THE PHONE STAYS ON SILENT', 'TOMORROW CAN HANDLE IT'
  ],
  Coffee: [
    'ANOTHER CUP OF COFFEE', 'BETTER AFTER THE FIRST SIP', 'DARK ROAST BEFORE DAWN', 'A FRESH POT ON THE COUNTER',
    'MORNING STARTS WITH COFFEE', 'POUR IT STRONG AND HOT', 'STEAM RISES FROM THE MUG', 'TAKE YOUR COFFEE BLACK',
    'WHO NEEDS ANOTHER CUP', 'THE LAST DROP WENT COLD', 'A QUIET TABLE BY THE WINDOW', 'CREAM SWIRLS INTO THE CUP',
    'FIRST SIP BEFORE SUNRISE', 'THE KETTLE STARTS TO SING', 'COFFEE MAKES TIME MOVE', 'ONE CUP TURNS INTO TWO',
    'THE CAFE OPENS AT DAWN', 'FRESH GROUNDS ON THE COUNTER', 'QUICK CUP BEFORE WORK', 'EXTRA SHOT IN MY COFFEE',
    'GRIND BEANS BEFORE DAWN', 'LATTE ART LOOKS PERFECT', 'COZY CAFE AROUND THE BLOCK', 'PICK UP COFFEE ON THE WAY',
    'FRENCH PRESS TAKES ITS TIME', 'ESPRESSO SHOT AFTER LUNCH', 'BLACK COFFEE NO SUGAR', 'DRINK IT BEFORE IT COOLS',
    'QUIET CAFE BY THE PARK', 'STEAM FOGS THE WINDOW', 'LAST CUP BEFORE MIDNIGHT', 'WARM MUG IN BOTH HANDS'
  ],
  Outdoors: [
    'QUICK HIKE BEFORE SUNSET', 'LAZY DAY BESIDE THE LAKE', 'PACK LIGHT FOR THE TRAIL', 'WILD FLOWERS AFTER RAIN',
    'FOLLOW THE RIVER NORTH', 'BLACK BEAR ACROSS THE PATH', 'QUIET WOODS BEFORE DAWN', 'FIND SHADE UNDER THE PINES',
    'CAMPFIRE GLOWS AFTER DARK', 'CHECK THE MAP AT THE FORK', 'CLIMB UNTIL THE VIEW OPENS', 'FRESH AIR ABOVE THE VALLEY',
    'WALK BEYOND THE OLD BRIDGE', 'ZIP THE TENT BEFORE RAIN', 'KEEP YOUR BOOTS DRY', 'ROCKY TRAIL UP THE RIDGE',
    'MORNING FOG ABOVE THE LAKE', 'BACKPACK FULL OF SNACKS', 'TAKE ONLY PICTURES HOME', 'SUNSET FROM THE HIGHEST POINT'
  ],
  Travel: [
    'PACK YOUR BAGS AND GO', 'NEXT FLIGHT LEAVES AT SIX', 'CHECK THE GATE ONCE MORE', 'A WINDOW SEAT ABOVE CLOUDS',
    'PASSPORT SAFE IN MY POCKET', 'QUICK STOP BEFORE BOARDING', 'LAST TRAIN ACROSS THE BORDER', 'TAXI WAITS OUTSIDE',
    'WELCOME TO SOMEWHERE NEW', 'FOLLOW SIGNS TO BAGGAGE', 'JET LAG HITS AFTER DINNER', 'BOOK THE EARLY FLIGHT HOME',
    'ONE BACKPACK TWO WEEKS', 'HOTEL KEY IN MY WALLET', 'CATCH THE FERRY AT NOON', 'MEET ME BY THE DEPARTURES',
    'EXPLORE BEYOND THE GUIDEBOOK', 'THE JOURNEY STARTS AT DAWN', 'POSTCARD FROM ANOTHER CITY', 'VACATION ENDS TOO QUICKLY'
  ],
  'Movie Night': [
    'MOVIE STARTS AFTER DARK', 'SAVE ME A SEAT IN THE BACK', 'QUIET THE LIGHTS GO DOWN', 'ONE MORE SCENE BEFORE BED',
    'PLOT TWIST OUT OF NOWHERE', 'THE VILLAIN GETS AWAY', 'CREDITS ROLL AFTER MIDNIGHT', 'PICK A FILM ANY FILM',
    'POPCORN READY ON THE COUCH', 'FAST FORWARD PAST PREVIEWS', 'WATCH IT AGAIN FROM START', 'THE HERO ARRIVES JUST IN TIME',
    'NO SPOILERS BEFORE FRIDAY', 'BIG SCREEN BRIGHT LIGHTS', 'PAUSE IT FOR A SNACK', 'THAT ENDING CHANGES EVERYTHING',
    'KEEP THE VOLUME DOWN', 'A CLASSIC NEVER GETS OLD', 'THE SEQUEL OPENS TONIGHT', 'BEST SCENE IN THE WHOLE FILM',
    'PICK A FILM TO WATCH'
  ],
  'At Home': [
    'KEYS LEFT BY THE FRONT DOOR', 'OPEN A WINDOW FOR FRESH AIR', 'QUIET EVENING ON THE COUCH', 'FIX THE LEAK BEFORE RAIN',
    'LIGHTS OFF BEFORE BED', 'SHOES WAIT BY THE DOOR', 'FOLD THE BLANKETS AGAIN', 'A PACKAGE ON THE PORCH',
    'WARM LIGHT IN THE KITCHEN', 'CLOSE THE CURTAINS TIGHT', 'CHECK THE LOCK ONE MORE TIME', 'THE CLOCK HANGS CROOKED',
    'FRESH FLOWERS ON THE TABLE', 'VACUUM CAN WAIT UNTIL LATER', 'COZY CORNER BY THE WINDOW', 'WASH EVERY DISH TONIGHT',
    'FIND THE MISSING REMOTE', 'QUIET HOUSE AFTER MIDNIGHT', 'BOXES STACKED IN THE HALL', 'MAKE YOURSELF AT HOME'
  ],
  Workday: [
    'FIRST COFFEE THEN EMAIL', 'QUICK MEETING BEFORE LUNCH', 'DEADLINE MOVES TO FRIDAY', 'CLEAR THE DESK BEFORE FIVE',
    'CHECK THE NUMBERS TWICE', 'ONE MORE CALL BEFORE HOME', 'THE PRINTER JAMMED AGAIN', 'SAVE A COPY JUST IN CASE',
    'CLOSE EVERY OPEN TAB', 'LUNCH BREAK STARTS NOW', 'FOLLOW UP NEXT WEEK', 'WRITE IT DOWN BEFORE YOU FORGET',
    'INBOX BACK TO ZERO', 'THE PROJECT NEEDS A NAME', 'TAKE NOTES DURING THE CALL', 'CALENDAR FULL UNTIL FRIDAY',
    'QUIET OFFICE AFTER FIVE', 'SEND THE FINAL DRAFT', 'ASK THE RIGHT QUESTION', 'WORK SMART THEN GO HOME',
    'QUIET OFFICE AFTER FIVE PM', 'PLEASE FOLLOW UP NEXT WEEK'
  ],
  'Food & Drink': [
    'EXTRA CHEESE ON TOP', 'PIZZA FRESH FROM THE OVEN', 'QUICK SNACK BEFORE DINNER', 'JUICE THE LEMON FIRST',
    'PICKLES ON THE SIDE', 'FRESH TACOS AFTER MIDNIGHT', 'BREAKFAST SERVED ALL DAY', 'SAVE ROOM FOR THE CAKE',
    'SPICY SAUCE ON EVERYTHING', 'ORDER SOMETHING NEW', 'COLD DRINK ON A HOT DAY', 'THE LAST SLICE IS YOURS',
    'BURGERS READY ON THE GRILL', 'MIX THE PERFECT MOCKTAIL', 'FRIES TASTE BETTER SHARED', 'GRAB A BITE BEFORE THE SHOW',
    'FRESH FRUIT BY THE WINDOW', 'PASS THE HOT SAUCE', 'DESSERT COMES FIRST TONIGHT', 'A TABLE SET FOR FOUR'
  ],
  Nightlife: [
    'JAZZ FILLS THE BACK ROOM', 'NEON GLOWS ABOVE THE BAR', 'LAST CALL BEFORE TWO', 'DANCE FLOOR PACKED TIGHT',
    'MEET ME OUTSIDE THE CLUB', 'QUICK DRINK BEFORE THE SHOW', 'CITY BUZZ AFTER MIDNIGHT', 'THE DJ PLAYS ONE LAST TRACK',
    'ROOFTOP VIEW AFTER DARK', 'VELVET ROPE ACROSS THE DOOR', 'TAXI HOME BEFORE SUNRISE', 'LIGHTS FLASH WITH THE BEAT',
    'BACK ROOM STAYS OPEN LATE', 'THE LINE MOVES QUICKLY', 'QUIET BOOTH IN THE CORNER', 'FRIDAY NIGHT JUST BEGAN',
    'CHECK YOUR COAT AT THE DOOR', 'MUSIC SPILLS INTO THE STREET', 'MIDNIGHT CROWD MOVES OUTSIDE', 'ONE LAST STOP BEFORE HOME'
  ],
  Sports: [
    'FINAL WHISTLE BEFORE DARK', 'QUICK PASS DOWN THE FIELD', 'THE CROWD JUMPS TO ITS FEET', 'ONE POINT LEFT ON THE CLOCK',
    'GAME TIED IN THE NINTH', 'RUN THE PLAY ONE MORE TIME', 'FAST BREAK TO THE RIM', 'CHECK THE SCORE AGAIN',
    'VICTORY LAP AROUND THE TRACK', 'HOME TEAM TAKES THE LEAD', 'EXTRA INNINGS AFTER MIDNIGHT', 'BOXING BELL STARTS THE ROUND',
    'SERVE WIDE THEN MOVE IN', 'RACE HEATS BEGIN AT NOON', 'THE BALL DROPS JUST INSIDE', 'DEFENSE WINS THE FINAL',
    'BACKBOARD SHAKES ON IMPACT', 'PHOTO FINISH AT THE LINE', 'KEEP YOUR EYES ON THE BALL', 'UNDERDOGS TAKE THE FIELD'
  ]
};

const addendumSources = {
  Idioms: [
    'OLD HABITS DIE HARD', 'TAKE THE PLUNGE', 'BURY THE HATCHET', 'DODGE A BULLET', 'HOLD YOUR HORSES',
    'FACE THE MUSIC', 'SIGHT FOR SORE EYES', 'TURN OVER A NEW LEAF', 'ONCE BITTEN TWICE SHY',
    'COOL AS A CUCUMBER', 'DRAW THE SHORT STRAW', 'HIT THE GROUND RUNNING', 'THINK OUTSIDE THE BOX',
    'WILD GOOSE CHASE', 'MUSIC TO MY EARS', 'SECOND NATURE', 'SPILL THE BEANS',
    'THROUGH THICK AND THIN', 'RAINING CATS AND DOGS', 'LET SLEEPING DOGS LIE', 'COSTS A PRETTY PENNY'
  ],
  Proverbs: [
    'WASTE NOT WANT NOT', 'SEEING IS BELIEVING', 'LIVE AND LET LIVE', 'NO NEWS IS GOOD NEWS',
    'SILENCE IS GOLDEN', 'ALL IN GOOD TIME', 'OPPOSITES ATTRACT', 'IT TAKES ALL KINDS',
    'YOU LIVE AND LEARN', 'FIRST COME FIRST SERVED', 'MONEY TALKS LOUDLY', 'PATIENCE IS A VIRTUE'
  ],
  'Tongue Twisters': [
    'WHICH WRISTWATCH IS SWISS', 'RUBBER BABY BUGGY BUMPERS', 'PETER PIPER PICKED A PECK',
    'GREEN GLASS GLOBES GLOW', 'SIX SICK SEA SERPENTS'
  ],
  'Game Show': [
    'TELL THEM WHAT THEY WON', 'RING THE BELL TWICE', 'NO WRONG ANSWERS HERE', 'SPIN THE WHEEL AGAIN'
  ],
  Mischief: [
    'THAT WAS NOT THE PLAN', 'I SWEAR IT WAS RIGHT HERE', 'THE DOG ATE MY HOMEWORK',
    'WET PAINT DO NOT TOUCH', 'NOBODY SAW THAT HAPPEN', 'THE CAT KNOCKED IT OVER'
  ]
};

const CANONICAL_LABELS = new Set(['Idioms', 'Proverbs', 'Tongue Twisters']);
const DISPLAY_TEXT = new Map([
  ['IF IT AINT BROKE DONT FIX IT', "IF IT AIN'T BROKE DON'T FIX IT"],
  ['MONEY DOESNT GROW ON TREES', "MONEY DOESN'T GROW ON TREES"]
]);
function passesBand(phrase, analysis) {
  const minimumLetters = phrase.canonical ? 12 : 15;
  const minimumFindable = phrase.canonical ? 150 : 250;
  return analysis.letterCount >= minimumLetters
    && analysis.letterCount <= 22
    && analysis.findableWordCount >= minimumFindable
    && analysis.findableWordCount <= 900;
}

function canAddForVariety(phrase, wordUse, bigramUse) {
  const words = wordsIn(phrase.text);
  const contentWords = new Set(words.filter((word) => !STOP_WORDS.has(word)));
  if ([...contentWords].some((word) => (wordUse.get(word) ?? 0) >= 3)) return false;
  const bigrams = new Set(words.slice(1).map((word, index) => `${words[index]} ${word}`));
  if ([...bigrams].some((bigram) => (bigramUse.get(bigram) ?? 0) >= 2)) return false;
  return true;
}

function recordVariety(phrase, wordUse, bigramUse) {
  const words = wordsIn(phrase.text);
  for (const word of new Set(words.filter((entry) => !STOP_WORDS.has(entry)))) {
    wordUse.set(word, (wordUse.get(word) ?? 0) + 1);
  }
  for (const bigram of new Set(words.slice(1).map((word, index) => `${words[index]} ${word}`))) {
    bigramUse.set(bigram, (bigramUse.get(bigram) ?? 0) + 1);
  }
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const dictionary = await loadDictionary();
const measured = [];
const allCandidates = [];
for (const [label, texts] of Object.entries(sources)) {
  for (const text of texts) {
    const phrase = {
      id: slug(text), text, label, difficulty: 1,
      ...(CANONICAL_LABELS.has(label) ? { canonical: true } : {}),
      ...(DISPLAY_TEXT.has(text) ? { display: DISPLAY_TEXT.get(text) } : {})
    };
    const analysis = analyzePhrase(phrase, dictionary);
    allCandidates.push({ phrase, analysis });
    if (passesBand(phrase, analysis)) {
      measured.push({ phrase, analysis });
    }
  }
}

const byLabel = new Map(Object.keys(sources).map((label) => [label, measured.filter((entry) => entry.phrase.label === label)]));
const originalSelection = [];
while (originalSelection.length < 150) {
  let added = false;
  for (const label of Object.keys(sources)) {
    const next = byLabel.get(label)?.shift();
    if (!next) continue;
    originalSelection.push(next);
    added = true;
    if (originalSelection.length === 150) break;
  }
  if (!added) break;
}

if (originalSelection.length < 150) {
  console.error(`Only ${originalSelection.length} original candidates passed the bands; 150 are required before addendum curation.`);
  console.table(Object.keys(sources).map((label) => ({ label, supplied: sources[label].length, passing: measured.filter((entry) => entry.phrase.label === label).length })));
  const nearest = allCandidates
    .filter(({ analysis }) => analysis.letterCount < 15 || analysis.letterCount > 22 || analysis.findableWordCount < 250 || analysis.findableWordCount > 900)
    .sort((a, b) => {
      const distance = (entry) => Math.max(0, 15 - entry.analysis.letterCount, entry.analysis.letterCount - 22) * 1_000 + Math.max(0, 250 - entry.analysis.findableWordCount, entry.analysis.findableWordCount - 900);
      return distance(a) - distance(b);
    })
    .slice(0, 40)
    .map(({ phrase, analysis }) => ({ label: phrase.label, phrase: phrase.text, letters: analysis.letterCount, words: analysis.findableWordCount }));
  console.log('Nearest rejected candidates:');
  console.table(nearest);
  process.exit(1);
}

const additions = [];
for (const [label, texts] of Object.entries(addendumSources)) {
  for (const text of texts) {
    const phrase = {
      id: slug(text), text, label, difficulty: 1,
      ...(CANONICAL_LABELS.has(label) ? { canonical: true } : {})
    };
    const analysis = analyzePhrase(phrase, dictionary);
    if (!passesBand(phrase, analysis)) {
      throw new Error(`${text} fails its ${phrase.canonical ? 'canonical' : 'invented'} band (${analysis.letterCount} letters, ${analysis.findableWordCount} words)`);
    }
    additions.push({ phrase, analysis });
  }
}

const selectedIds = new Set();
const wordUse = new Map();
const bigramUse = new Map();
const selected = [];
for (const entry of additions) {
  if (!canAddForVariety(entry.phrase, wordUse, bigramUse)) throw new Error(`Approved addendum conflicts with variety gates: ${entry.phrase.text}`);
  selected.push(entry);
  selectedIds.add(entry.phrase.id);
  recordVariety(entry.phrase, wordUse, bigramUse);
}
for (const entry of originalSelection) {
  if (selected.length >= 150) break;
  if (selectedIds.has(entry.phrase.id) || !canAddForVariety(entry.phrase, wordUse, bigramUse)) continue;
  selected.push(entry);
  selectedIds.add(entry.phrase.id);
  recordVariety(entry.phrase, wordUse, bigramUse);
}
if (selected.length !== 150) throw new Error(`Variety-constrained bank reached only ${selected.length} of 150 phrases`);

const allLabels = [...new Set([...Object.keys(sources), ...Object.keys(addendumSources)])];
const selectedByLabel = new Map(allLabels.map((label) => [label, selected.filter((entry) => entry.phrase.label === label)]));
const orderedSelected = [];
while (orderedSelected.length < selected.length) {
  for (const label of allLabels) {
    const next = selectedByLabel.get(label)?.shift();
    if (next) orderedSelected.push(next);
  }
}

const difficulty = measuredDifficultyById(orderedSelected.map((entry) => entry.analysis));
const bank = orderedSelected.map(({ phrase }) => ({ ...phrase, difficulty: difficulty.get(phrase.id) }));
assertDailyLabelRotation(bank);
await writeFile(new URL('content/phrases.json', root), `${JSON.stringify(bank, null, 2)}\n`);

const labels = [...new Set(bank.map((phrase) => phrase.label))];
const grouped = labels.map((label) => {
  const rows = orderedSelected.filter((entry) => entry.phrase.label === label);
  const lines = rows.map(({ phrase, analysis }) => `| ${phrase.text} | ${analysis.letterCount} | ${analysis.findableWordCount.toLocaleString()} |`);
  return `## ${label} (${rows.length})\n\n| Phrase | Letters | Findable |\n| --- | ---: | ---: |\n${lines.join('\n')}`;
});

const canonicalCount = bank.filter((phrase) => phrase.canonical).length;
const review = `# Phrase bank review\n\nShipped bank: **${bank.length} phrases** across **${labels.length} categories**. Canonical phrases pass the 12–22 letter and 150–900 findable-word bands; invented phrases pass 15–22 and 250–900. **${canonicalCount} phrases (${Math.round(canonicalCount / bank.length * 100)}%) are canonical.** This file is generated by \`npm run phrases:bank\`.\n\n${grouped.join('\n\n')}\n`;
await writeFile(new URL('PHRASE_BANK_REVIEW.md', root), review);

console.log(`Selected ${bank.length} measured phrases: ${additions.length} approved addendum entries plus ${bank.length - additions.length} retained boards.`);
console.log(`Canonical ratio: ${canonicalCount}/${bank.length} (${(canonicalCount / bank.length * 100).toFixed(1)}%).`);
console.table(labels.map((label) => ({ label, selected: bank.filter((phrase) => phrase.label === label).length })));
