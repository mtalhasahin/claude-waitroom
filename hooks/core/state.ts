/**
 * What the plugin keeps in `$.store`, and how it is read back.  [PURE]
 *
 * The store hands back whatever was written last, which may be from an older
 * version of this plugin or may have been corrupted. Every read here is
 * field-by-field defensive: a field that fails its check falls back to its
 * default rather than failing the whole read, so a bad store costs the player
 * their progress at worst and never breaks the session.
 */

import { DEFAULT_CONFIG, GAMES, MAX_DELAY, SCENES, isPage, type Config, type GameName, type SceneName } from './config';
import { CELLS as T_CELLS, type Piece, type TetrisState } from '../games/tetris';
import { CELLS as G_CELLS, type G2048State } from '../games/g2048';
import { LENGTH, TRIES, type WordState } from '../games/word';

/** The one key the plugin writes. Everything lives under it. */
export const STORE_KEY = 'waitroom';

/** The schema version, bumped whenever a migration becomes necessary. */
export const VERSION = 1;

export type SceneProgress = {
  garden: { flowers: number };
  aquarium: { fish: number };
};

export type Stats = {
  /** Completed waits, which is what the scenes grow on. */
  waits: number;
  totalWaitMs: number;
};

export type Persisted = {
  v: number;
  config: Config;
  games: { tetris?: TetrisState; '2048'?: G2048State; word?: WordState };
  scenes: SceneProgress;
  stats: Stats;
};

export const DEFAULT_PERSISTED: Persisted = {
  v: VERSION,
  config: DEFAULT_CONFIG,
  games: {},
  scenes: { garden: { flowers: 0 }, aquarium: { fish: 0 } },
  stats: { waits: 0, totalWaitMs: 0 },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** A finite, non-negative whole number, clamped; anything else is the fallback. */
const count = (v: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fallback;
  return Math.min(Math.floor(v), max);
};

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

/** A flat board of `size` whole numbers in 0..max; any deviation rejects the lot. */
function cells(v: unknown, size: number, max: number): number[] | undefined {
  if (!Array.isArray(v) || v.length !== size) return undefined;
  const out: number[] = [];
  for (const cell of v) {
    if (typeof cell !== 'number' || !Number.isFinite(cell) || cell < 0 || cell > max || !Number.isInteger(cell)) {
      return undefined;
    }
    out.push(cell);
  }
  return out;
}

export function readConfig(raw: unknown): Config {
  if (!isObject(raw)) return DEFAULT_CONFIG;
  return {
    enabled: bool(raw['enabled'], DEFAULT_CONFIG.enabled),
    mode: oneOf(raw['mode'], ['scene', 'game'] as const, DEFAULT_CONFIG.mode),
    game: oneOf<GameName>(raw['game'], GAMES, DEFAULT_CONFIG.game),
    scene: oneOf<SceneName>(raw['scene'], SCENES, DEFAULT_CONFIG.scene),
    delay: count(raw['delay'], DEFAULT_CONFIG.delay, MAX_DELAY),
    spinner: bool(raw['spinner'], DEFAULT_CONFIG.spinner),
    keepOpen: bool(raw['keepOpen'], DEFAULT_CONFIG.keepOpen),
    // Checked again on the way out of the store, not only on the way in: this
    // one ends up in an argv, and the store is a file on disk.
    page: typeof raw['page'] === 'string' && isPage(raw['page']) ? raw['page'] : '',
  };
}

function readPiece(raw: unknown): Piece | null {
  if (!isObject(raw)) return null;
  const shape = raw['shape'];
  if (!Array.isArray(shape) || shape.length === 0) return null;
  const rows: number[][] = [];
  for (const row of shape) {
    if (!Array.isArray(row) || row.length === 0) return null;
    const cleaned: number[] = [];
    for (const cell of row) {
      if (cell !== 0 && cell !== 1) return null;
      cleaned.push(cell);
    }
    rows.push(cleaned);
  }
  const kind = raw['kind'];
  if (typeof kind !== 'string') return null;
  const x = raw['x'];
  const y = raw['y'];
  if (typeof x !== 'number' || !Number.isInteger(x)) return null;
  if (typeof y !== 'number' || !Number.isInteger(y)) return null;
  return { kind: kind as Piece['kind'], shape: rows, x, y };
}

export function readTetris(raw: unknown): TetrisState | undefined {
  if (!isObject(raw)) return undefined;
  const board = cells(raw['board'], T_CELLS, 5);
  if (!board) return undefined;
  return {
    board,
    piece: readPiece(raw['piece']),
    lines: count(raw['lines'], 0),
    best: count(raw['best'], 0),
    toppedOut: bool(raw['toppedOut'], false),
  };
}

export function read2048(raw: unknown): G2048State | undefined {
  if (!isObject(raw)) return undefined;
  const grid = cells(raw['grid'], G_CELLS, 2 ** 20);
  if (!grid) return undefined;
  return {
    grid,
    score: count(raw['score'], 0),
    best: count(raw['best'], 0),
    over: bool(raw['over'], false),
  };
}

export function readWord(raw: unknown): WordState | undefined {
  if (!isObject(raw)) return undefined;
  const word = raw['word'];
  if (typeof word !== 'string' || [...word].length !== LENGTH) return undefined;
  const rawGuesses = raw['guesses'];
  const guesses: string[] = [];
  if (Array.isArray(rawGuesses)) {
    for (const guess of rawGuesses) {
      if (typeof guess !== 'string' || [...guess].length !== LENGTH) return undefined;
      guesses.push(guess);
      if (guesses.length >= TRIES) break;
    }
  }
  const locale = raw['locale'];
  return {
    word,
    guesses,
    played: count(raw['played'], 0),
    solved: count(raw['solved'], 0),
    locale: typeof locale === 'string' && locale.length > 0 && locale.length <= 16 ? locale : 'en',
  };
}

function readScenes(raw: unknown): SceneProgress {
  const fallback = DEFAULT_PERSISTED.scenes;
  if (!isObject(raw)) return { garden: { ...fallback.garden }, aquarium: { ...fallback.aquarium } };
  const garden = raw['garden'];
  const aquarium = raw['aquarium'];
  return {
    garden: { flowers: count(isObject(garden) ? garden['flowers'] : undefined, 0) },
    aquarium: { fish: count(isObject(aquarium) ? aquarium['fish'] : undefined, 0) },
  };
}

function readStats(raw: unknown): Stats {
  if (!isObject(raw)) return { ...DEFAULT_PERSISTED.stats };
  return {
    waits: count(raw['waits'], 0),
    totalWaitMs: count(raw['totalWaitMs'], 0),
  };
}

/**
 * Turns whatever the store held into a `Persisted`.
 *
 * `v` is read but nothing is migrated yet: version 1 is the first schema, so
 * a record stamped with anything else keeps its config (which is cheap to
 * re-validate) and drops the game states, whose shape is what a migration
 * would have to translate.
 */
export function readPersisted(raw: unknown): Persisted {
  if (!isObject(raw)) return { ...DEFAULT_PERSISTED, scenes: readScenes(undefined) };

  const version = count(raw['v'], 0);
  const config = readConfig(raw['config']);
  if (version !== VERSION) {
    return { v: VERSION, config, games: {}, scenes: readScenes(raw['scenes']), stats: readStats(raw['stats']) };
  }

  const games = isObject(raw['games']) ? (raw['games'] as Record<string, unknown>) : {};
  const tetris = readTetris(games['tetris']);
  const g2048 = read2048(games['2048']);
  const word = readWord(games['word']);

  return {
    v: VERSION,
    config,
    games: {
      ...(tetris ? { tetris } : {}),
      ...(g2048 ? { '2048': g2048 } : {}),
      ...(word ? { word } : {}),
    },
    scenes: readScenes(raw['scenes']),
    stats: readStats(raw['stats']),
  };
}

/** Clears game and scene progress but keeps the config: what `/wait reset` does. */
export function resetProgress(state: Persisted): Persisted {
  return {
    v: VERSION,
    config: state.config,
    games: {},
    scenes: { garden: { flowers: 0 }, aquarium: { fish: 0 } },
    stats: { waits: 0, totalWaitMs: 0 },
  };
}
