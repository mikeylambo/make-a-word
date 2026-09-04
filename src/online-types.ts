export type OnlinePhase = "lobby" | "playing" | "round-results" | "match-results";

export type OnlineSettings = {
  rounds: 1 | 3 | 5;
  roundSeconds: 60 | 90 | 120;
  maxPlayers: number;
};

export type OnlineFoundWord = {
  word: string;
  points: number;
};

export type OnlinePlayerView = {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  online: boolean;
  score: number;
  roundScore: number;
  foundCount: number;
  longestWord: string;
  combo: number;
};

export type OnlineRoomView = {
  code: string;
  matchId: string;
  version: number;
  phase: OnlinePhase;
  settings: OnlineSettings;
  roundNumber: number;
  players: OnlinePlayerView[];
  phrase?: {
    id: string;
    text: string;
    display?: string;
    label: string;
    difficulty: number;
  };
  startsAt?: number;
  endsAt?: number;
  words: OnlineFoundWord[];
  serverNow: number;
};

export type OnlineCredentials = {
  code: string;
  playerId: string;
  token: string;
};

export type OnlineResponse =
  | { ok: true; room: OnlineRoomView; credentials?: OnlineCredentials }
  | { ok: false; error: string; code?: string };

export type OnlineAction =
  | { action: "create"; name: string; settings: OnlineSettings }
  | { action: "join"; code: string; name: string }
  | { action: "ready"; credentials: OnlineCredentials; ready: boolean }
  | { action: "heartbeat"; credentials: OnlineCredentials }
  | { action: "kick"; credentials: OnlineCredentials; playerId: string }
  | { action: "start"; credentials: OnlineCredentials }
  | { action: "submit"; credentials: OnlineCredentials; word: string }
  | { action: "next-round"; credentials: OnlineCredentials }
  | { action: "rematch"; credentials: OnlineCredentials }
  | { action: "leave"; credentials: OnlineCredentials };
