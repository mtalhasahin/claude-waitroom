/**
 * Tetris — 12 columns x 9 rows, one wait = one move.  [PURE]
 *
 * The pane is wide and short, so the classic vertical well does not fit; the
 * board is laid out to that shape instead. A piece that has not been dropped
 * carries over to the next wait, so no move is ever lost.
 */

export const COLS = 12;
export const ROWS = 9;
export const CELLS = COLS * ROWS;

export type PieceKind = 'I' | 'O' | 'T' | 'L' | 'S';
export const KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'L', 'S'];

/** A shape is a rectangular matrix of 0/1 rows. */
export type Shape = readonly (readonly number[])[];

export type Piece = { kind: PieceKind; shape: Shape; x: number; y: number };

export type TetrisState = {
  /** Flat, row-major; 0 is empty, otherwise 1..5 indexing KINDS. */
  board: number[];
  /** The piece in play, carried between waits; null until one is spawned. */
  piece: Piece | null;
  lines: number;
  best: number;
  /** True for one wait after the board filled up, so the pane can say so. */
  toppedOut: boolean;
};

export type Action = 'left' | 'right' | 'rotate' | 'drop';
export type Rand = () => number;

const SHAPES: Record<PieceKind, Shape> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[1, 1, 1], [0, 1, 0]],
  L: [[1, 0], [1, 0], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
};

export const colorOf = (kind: PieceKind): number => KINDS.indexOf(kind) + 1;

export function emptyBoard(): number[] {
  return new Array<number>(CELLS).fill(0);
}

/** Rotates a shape a quarter turn clockwise. */
export function rotate(shape: Shape): Shape {
  const h = shape.length;
  const w = (shape[0] ?? []).length;
  const out: number[][] = [];
  for (let x = 0; x < w; x++) {
    const row: number[] = [];
    for (let y = h - 1; y >= 0; y--) row.push((shape[y] as readonly number[])[x] as number);
    out.push(row);
  }
  return out;
}

/**
 * True when the shape placed at (x, y) would leave the board or overlap a
 * cell already filled. Above the top (y < 0) is allowed, so a piece may spawn
 * partly off screen and still be legal.
 */
export function collides(board: readonly number[], shape: Shape, x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    const row = shape[r] as readonly number[];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 0) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= COLS) return true;
      if (by >= ROWS) return true;
      if (by < 0) continue;
      if ((board[by * COLS + bx] as number) !== 0) return true;
    }
  }
  return false;
}

/** How far down the piece falls from (x, y): the ghost's row. */
export function dropY(board: readonly number[], shape: Shape, x: number, y: number): number {
  let out = y;
  while (!collides(board, shape, x, out + 1)) out++;
  return out;
}

/** Stamps a shape into a copy of the board. */
export function stamp(board: readonly number[], piece: Piece): number[] {
  const out = board.slice();
  const color = colorOf(piece.kind);
  for (let r = 0; r < piece.shape.length; r++) {
    const row = piece.shape[r] as readonly number[];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 0) continue;
      const by = piece.y + r;
      const bx = piece.x + c;
      if (by < 0 || by >= ROWS || bx < 0 || bx >= COLS) continue;
      out[by * COLS + bx] = color;
    }
  }
  return out;
}

/** Removes every full row, dropping the rows above it down. */
export function clearLines(board: readonly number[]): { board: number[]; cleared: number } {
  const kept: number[][] = [];
  let cleared = 0;
  for (let r = 0; r < ROWS; r++) {
    const row = board.slice(r * COLS, r * COLS + COLS);
    if (row.every((cell) => cell !== 0)) cleared++;
    else kept.push(row);
  }
  const out: number[] = [];
  for (let i = 0; i < cleared; i++) out.push(...new Array<number>(COLS).fill(0));
  for (const row of kept) out.push(...row);
  return { board: out, cleared };
}

/** A fresh piece of a random kind, centred on the top row. */
export function spawn(rand: Rand): Piece {
  const kind = KINDS[Math.floor(rand() * KINDS.length) % KINDS.length] as PieceKind;
  const shape = SHAPES[kind];
  const width = (shape[0] ?? []).length;
  return { kind, shape, x: Math.floor((COLS - width) / 2), y: 0 };
}

export function newGame(rand: Rand, best = 0): TetrisState {
  return { board: emptyBoard(), piece: spawn(rand), lines: 0, best, toppedOut: false };
}

/** Makes sure the state has a piece to move; spawns one when it does not. */
export function ensurePiece(state: TetrisState, rand: Rand): TetrisState {
  if (state.piece) return state;
  const piece = spawn(rand);
  if (collides(state.board, piece.shape, piece.x, piece.y)) {
    // The board filled up: keep the score in `best` and start over.
    return {
      board: emptyBoard(),
      piece: spawn(rand),
      lines: 0,
      best: Math.max(state.best, state.lines),
      toppedOut: true,
    };
  }
  return { ...state, piece, toppedOut: false };
}

/**
 * One wait, one move.
 *
 * `left`, `right` and `rotate` nudge the piece and leave it in play; `drop`
 * hard-drops it, locks it, clears whatever rows it completed, and leaves the
 * next wait to spawn the next piece.
 */
export function step(state: TetrisState, action: Action, rand: Rand): TetrisState {
  const ready = ensurePiece(state, rand);
  const piece = ready.piece;
  if (!piece) return ready;
  const board = ready.board;

  if (action === 'left' || action === 'right') {
    const x = piece.x + (action === 'left' ? -1 : 1);
    if (collides(board, piece.shape, x, piece.y)) return { ...ready, toppedOut: false };
    return { ...ready, piece: { ...piece, x }, toppedOut: false };
  }

  if (action === 'rotate') {
    const shape = rotate(piece.shape);
    // Try in place, then one cell in from either wall: a classic wall kick.
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!collides(board, shape, piece.x + dx, piece.y)) {
        return { ...ready, piece: { ...piece, shape, x: piece.x + dx }, toppedOut: false };
      }
    }
    return { ...ready, toppedOut: false };
  }

  // drop
  const y = dropY(board, piece.shape, piece.x, piece.y);
  const locked = stamp(board, { ...piece, y });
  const res = clearLines(locked);
  const lines = ready.lines + res.cleared;
  return {
    board: res.board,
    piece: null,
    lines,
    best: Math.max(ready.best, lines),
    toppedOut: false,
  };
}
