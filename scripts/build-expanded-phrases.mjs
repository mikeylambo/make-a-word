import { writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const groups = [
  {
    key: "classroom",
    labels: ["Classroom", "Learning", "Ideas", "Friends", "Discovery", "Teamwork"],
    subjects: ["CURIOUS STUDENTS", "BRIGHT THINKERS", "YOUNG READERS", "KIND CLASSMATES", "EAGER LEARNERS", "CREATIVE TEAMS"],
    endings: ["SHARE GREAT IDEAS", "FIND HIDDEN ANSWERS", "BUILD NEW SKILLS", "SOLVE EVERY PUZZLE", "MAKE LEARNING FUN", "HELP FRIENDS GROW", "ASK BETTER QUESTIONS", "DISCOVER NEW STORIES", "TURN PAGES TOGETHER", "LEARN SOMETHING DAILY"]
  },
  {
    key: "nature",
    labels: ["Wild Places", "Open Air", "Seasons", "Small Wonders", "Green World", "Outdoors"],
    subjects: ["BRIGHT FIREFLIES", "TALL FORESTS", "QUIET RIVERS", "GENTLE BREEZES", "GOLDEN SUNSETS", "MORNING BIRDS"],
    endings: ["FILL THE EVENING", "FOLLOW THE VALLEY", "WAKE THE GARDEN", "MOVE UNDER STARS", "BRING FRESH COLORS", "CROSS OPEN FIELDS", "GLOW AFTER RAIN", "MAKE SHADOWS DANCE", "WELCOME EVERY SEASON", "GUIDE TRAVELERS HOME"]
  },
  {
    key: "play",
    labels: ["Game Day", "Play", "Team Spirit", "The Crowd", "Big Finish", "Good Sport"],
    subjects: ["QUICK RUNNERS", "BRAVE PLAYERS", "STRONG TEAMS", "HAPPY CAMPERS", "SKILLED SKATERS", "FAST RACERS"],
    endings: ["CHASE THE FINISH", "CHEER EACH OTHER", "PLAY THE NEXT ROUND", "SHARE EVERY VICTORY", "TURN SPEED INTO POINTS", "MAKE THE CROWD ROAR", "KEEP THE GAME MOVING", "TRY ONE MORE TIME", "BRING THEIR BEST", "CELEBRATE TOGETHER TODAY"]
  },
  {
    key: "arts",
    labels: ["Music", "Color", "The Stage", "Imagination", "Stories", "Creative Spark"],
    subjects: ["BOLD ARTISTS", "YOUNG WRITERS", "LIVE MUSICIANS", "GREAT DANCERS", "CLEVER MAKERS", "BRIGHT DREAMERS"],
    endings: ["CREATE SOMETHING NEW", "FILL THE STAGE", "TELL AMAZING STORIES", "MAKE COLORS SING", "TURN IDEAS INTO ART", "SHARE THEIR VOICES", "FOLLOW EVERY RHYTHM", "BRING CHARACTERS ALIVE", "BUILD WORLDS TOGETHER", "START WITH WONDER"]
  },
  {
    key: "adventure",
    labels: ["Adventure", "New Roads", "The Summit", "Exploration", "Moving Forward", "New Horizons"],
    subjects: ["BOLD EXPLORERS", "READY TRAVELERS", "BRAVE CLIMBERS", "HAPPY HIKERS", "CURIOUS FRIENDS", "STEADY WALKERS"],
    endings: ["FIND THE NEXT PATH", "FOLLOW TRUE NORTH", "CROSS EVERY BRIDGE", "REACH HIGHER GROUND", "WELCOME NEW ADVENTURES", "MAKE MEMORIES TOGETHER", "TRAVEL BEYOND HOME", "CLIMB TOWARD SUNRISE", "DISCOVER HIDDEN PLACES", "KEEP MOVING FORWARD"]
  }
];

const phrases = [];
for (const group of groups) {
  group.subjects.forEach((subject, subjectIndex) => {
    group.endings.forEach((ending, endingIndex) => {
      const text = `${subject} ${ending}`;
      const words = text.toLowerCase().split(" ");
      phrases.push({
        id: `${group.key}-${subjectIndex + 1}-${endingIndex + 1}`,
        text,
        label: group.labels[subjectIndex],
        difficulty: Math.min(5, 2 + Math.floor((subjectIndex + endingIndex) / 5)),
        burnSolution: words
      });
    });
  });
}

await writeFile(new URL("content/expanded-phrases.json", root), `${JSON.stringify(phrases, null, 2)}\n`);
console.log(`Wrote ${phrases.length} additional phrases.`);
