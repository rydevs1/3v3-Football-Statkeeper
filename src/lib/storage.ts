export type Side = "A" | "B";

export type StoredPlayer = { id: string; name: string };

export type StoredPlayerStats = {
  touchdowns: number;
  conversions1: number;
  conversions2: number;
  passAttempts: number;
  passCompletions: number;
  receptions: number;
  interceptions: number;
  deflections: number;
  sacks: number;
  punts: number;
};

export type StoredGame = {
  id: string;
  createdAt: string;
  team1Name: string;
  team2Name: string;
  team1Players: StoredPlayer[];
  team2Players: StoredPlayer[];
  exhStartOffenseSide: Side;
  exhStartDirection: 1 | -1;
  finalScoreA?: number;
  finalScoreB?: number;
  endedAt?: string;

  // added for exhibition-only statkeeping
  playLog?: string[];
  playerStats?: Record<string, StoredPlayerStats>;
};

const GAMES_KEY = "footy_games";

function loadAll(): StoredGame[] {
  try {
    const raw = localStorage.getItem(GAMES_KEY);
    return raw ? (JSON.parse(raw) as StoredGame[]) : [];
  } catch {
    return [];
  }
}

function saveAll(games: StoredGame[]) {
  localStorage.setItem(GAMES_KEY, JSON.stringify(games));
}

export function createGame(
  input: Omit<StoredGame, "id" | "createdAt">
): StoredGame {
  const game: StoredGame = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const all = loadAll();
  saveAll([game, ...all]);
  return game;
}

export function getGame(id: string): StoredGame | null {
  return loadAll().find((g) => g.id === id) ?? null;
}

export function updateGame(id: string, patch: Partial<StoredGame>) {
  const all = loadAll();
  const idx = all.findIndex((g) => g.id === id);
  if (idx === -1) return;

  all[idx] = { ...all[idx], ...patch };
  saveAll(all);
}

export function listGames(): StoredGame[] {
  return loadAll();
}