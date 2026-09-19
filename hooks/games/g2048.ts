/**
 * 2048 — 4x4, standard rules, one wait = one move.  [PURE]
 *
 * The grid is a flat array of 16 cells, row-major; 0 is empty.
 */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Grid = readonly number[];

export type G2048State = {
  grid: number[];
  score: number;
  best: number;
  /** True once no move is possible; the next move starts a fresh grid. */
  over: boolean;
};

/** A source of randomness, injected so every function here stays testable. */
export type Rand = () => number;

/**
 * Slides one line toward index 0 and merges equal neighbours once each.
 *
 * `2 2 2 2` becomes `4 4`, and `4 4 2 2` becomes `8 4`: a tile that has just
 * been merged is not merged again in the same move.
 */
export function slideLine(line: readonly number[]): { line: number[]; gained: number } {
  const tiles = line.filter((n) => n !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i] as number;
    const b = tiles[i + 1];
    if (b !== undefined && b === a) {
      const merged = a * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(a);
    }
  }
  while (out.length < line.length) out.push(0);
  return { line: out, gained };
}

/** The 4 indices of one line, ordered so that index 0 is the direction moved toward. */
function lineIndices(dir: Direction, n: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    switch (dir) {
      case 'left': idx.push(n * SIZE + i); break;
      case 'right': idx.push(n * SIZE + (SIZE - 1 - i)); break;
      case 'up': idx.push(i * SIZE + n); break;
      case 'down': idx.push((SIZE - 1 - i) * SIZE + n); break;
    }
  }
  return idx;
}

/** Applies one move. `moved` is false when the grid is unchanged. */
export function move(grid: Grid, dir: Direction): { grid: number[]; gained: number; moved: boolean } {
  const out = grid.slice();
  let gained = 0;
  let moved = false;
  for (let n = 0; n < SIZE; n++) {
    const idx = lineIndices(dir, n);
    const before = idx.map((i) => out[i] as number);
    const res = slideLine(before);
    gained += res.gained;
    for (let i = 0; i < SIZE; i++) {
      const value = res.line[i] as number;
      if (out[idx[i] as number] !== value) moved = true;
      out[idx[i] as number] = value;
    }
  }
  return { grid: out, gained, moved };
}

/** Puts a 2 (90%) or a 4 (10%) in a random empty cell. A full grid is returned as is. */
export function addTile(grid: Grid, rand: Rand): number[] {
  const out = grid.slice();
  const empty: number[] = [];
  for (let i = 0; i < CELLS; i++) if (out[i] === 0) empty.push(i);
  if (empty.length === 0) return out;
  const slot = empty[Math.floor(rand() * empty.length) % empty.length] as number;
  out[slot] = rand() < 0.9 ? 2 : 4;
  return out;
}

/**
 * True when the game is over: the grid is full and no neighbours match.
 *
 * Asking "does any direction change the grid" would be equivalent for a full
 * grid but wrong for an empty one, where nothing slides and yet the game has
 * plainly not ended.
 */
export function isDead(grid: Grid): boolean {
  if (grid.some((cell) => cell === 0)) return false;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const here = grid[r * SIZE + c] as number;
      if (c + 1 < SIZE && here === grid[r * SIZE + c + 1]) return false;
      if (r + 1 < SIZE && here === grid[(r + 1) * SIZE + c]) return false;
    }
  }
  return true;
}

/** The highest tile on the board. */
export function highest(grid: Grid): number {
  return grid.reduce<number>((max, n) => (n > max ? n : max), 0);
}

export function newGame(rand: Rand, best = 0): G2048State {
  let grid = new Array<number>(CELLS).fill(0);
  grid = addTile(grid, rand);
  grid = addTile(grid, rand);
  return { grid, score: 0, best, over: false };
}

/**
 * One wait, one move.
 *
 * A move that changes nothing is not a move: no tile is spawned and the state
 * is handed back untouched, so the wait is not spent.
 */
export function step(state: G2048State, dir: Direction, rand: Rand): G2048State {
  if (state.over) return newGame(rand, state.best);

  const res = move(state.grid, dir);
  if (!res.moved) return state;

  const grid = addTile(res.grid, rand);
  const score = state.score + res.gained;
  const best = Math.max(state.best, score);
  return { grid, score, best, over: isDead(grid) };
}
