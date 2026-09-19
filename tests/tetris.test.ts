import { describe, expect, test } from 'claude-code/testing';

import {
  CELLS,
  COLS,
  ROWS,
  clearLines,
  collides,
  dropY,
  emptyBoard,
  ensurePiece,
  newGame,
  rotate,
  spawn,
  stamp,
  step,
  type Piece,
  type Shape,
  type TetrisState,
} from '../hooks/games/tetris';

const seq = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

/** Always picks the first kind, `I`, a flat 4x1 bar. */
const firstKind = seq([0]);

const withBoard = (board: number[], piece: Piece | null = null): TetrisState => ({
  board,
  piece,
  lines: 0,
  best: 0,
  toppedOut: false,
});

/** Fills a whole row with the given colour. */
function fillRow(board: number[], row: number, value = 1): number[] {
  const out = board.slice();
  for (let c = 0; c < COLS; c++) out[row * COLS + c] = value;
  return out;
}

const BAR: Shape = [[1, 1, 1, 1]];
const ELL: Shape = [
  [1, 0],
  [1, 0],
  [1, 1],
];

describe('collides', () => {
  test('an empty board leaves a piece in the middle alone', () => {
    expect(collides(emptyBoard(), BAR, 4, 0)).toBe(false);
  });

  test('the left wall stops it', () => {
    expect(collides(emptyBoard(), BAR, -1, 0)).toBe(true);
  });

  test('the right wall stops it', () => {
    expect(collides(emptyBoard(), BAR, COLS - 3, 0)).toBe(true);
  });

  test('the floor stops it', () => {
    expect(collides(emptyBoard(), BAR, 0, ROWS)).toBe(true);
  });

  test('an occupied cell stops it', () => {
    const board = emptyBoard();
    board[3 * COLS + 5] = 2;
    expect(collides(board, BAR, 4, 3)).toBe(true);
    expect(collides(board, BAR, 4, 2)).toBe(false);
  });

  test('above the top is allowed, so a piece may spawn part way off screen', () => {
    expect(collides(emptyBoard(), ELL, 4, -2)).toBe(false);
  });
});

describe('rotate', () => {
  test('a quarter turn clockwise transposes and reverses', () => {
    expect(rotate(BAR)).toEqual([[1], [1], [1], [1]]);
  });

  test('four quarter turns come back to the start', () => {
    expect(rotate(rotate(rotate(rotate(ELL))))).toEqual(ELL);
  });

  test('every intermediate orientation keeps the same number of filled cells', () => {
    const filled = (shape: Shape): number => shape.flat().filter((n) => n === 1).length;
    let shape: Shape = ELL;
    for (let i = 0; i < 4; i++) {
      shape = rotate(shape);
      expect(filled(shape)).toBe(filled(ELL));
    }
  });

  test('the O piece is unchanged by rotation', () => {
    const square: Shape = [
      [1, 1],
      [1, 1],
    ];
    expect(rotate(square)).toEqual(square);
  });
});

describe('dropY', () => {
  test('a piece over an empty board lands on the floor', () => {
    expect(dropY(emptyBoard(), BAR, 0, 0)).toBe(ROWS - 1);
  });

  test('a piece lands on top of what is already there', () => {
    const board = fillRow(emptyBoard(), ROWS - 1);
    expect(dropY(board, BAR, 0, 0)).toBe(ROWS - 2);
  });
});

describe('clearLines', () => {
  test('one full row is removed and the rest drop down', () => {
    let board = emptyBoard();
    board = fillRow(board, ROWS - 1);
    board[(ROWS - 2) * COLS] = 3;
    const res = clearLines(board);
    expect(res.cleared).toBe(1);
    expect(res.board.length).toBe(CELLS);
    expect(res.board[(ROWS - 1) * COLS]).toBe(3);
  });

  test('two full rows clear together', () => {
    let board = emptyBoard();
    board = fillRow(board, ROWS - 1);
    board = fillRow(board, ROWS - 2);
    const res = clearLines(board);
    expect(res.cleared).toBe(2);
    expect(res.board.every((cell) => cell === 0)).toBe(true);
  });

  test('a board with no full row is left alone', () => {
    const board = emptyBoard();
    board[0] = 1;
    const res = clearLines(board);
    expect(res.cleared).toBe(0);
    expect(res.board).toEqual(board);
  });
});

describe('step', () => {
  test('left and right nudge the piece and keep it in play', () => {
    const state = withBoard(emptyBoard(), { kind: 'I', shape: BAR, x: 4, y: 0 });
    const left = step(state, 'left', firstKind);
    expect(left.piece?.x).toBe(3);
    expect(left.piece).not.toBe(null);

    const right = step(state, 'right', firstKind);
    expect(right.piece?.x).toBe(5);
  });

  test('a nudge into a wall is refused and the piece stays put', () => {
    const state = withBoard(emptyBoard(), { kind: 'I', shape: BAR, x: 0, y: 0 });
    expect(step(state, 'left', firstKind).piece?.x).toBe(0);
  });

  test('rotation next to the left wall kicks the piece inward', () => {
    const tall = rotate(BAR);
    const state = withBoard(emptyBoard(), { kind: 'I', shape: tall, x: 0, y: 0 });
    const after = step(state, 'rotate', firstKind);
    // The bar becomes 4 wide; from x=0 it still fits, so it does not move.
    expect(after.piece?.shape).toEqual(BAR);
    expect(after.piece?.x).toBe(0);
  });

  test('rotation against the right wall kicks the piece back in', () => {
    const tall = rotate(BAR);
    const state = withBoard(emptyBoard(), { kind: 'I', shape: tall, x: COLS - 1, y: 0 });
    const after = step(state, 'rotate', firstKind);
    expect(after.piece).not.toBe(null);
    expect(collides(after.board, after.piece?.shape ?? BAR, after.piece?.x ?? 0, after.piece?.y ?? 0)).toBe(false);
  });

  test('drop locks the piece and leaves none in play', () => {
    const state = withBoard(emptyBoard(), { kind: 'I', shape: BAR, x: 0, y: 0 });
    const after = step(state, 'drop', firstKind);
    expect(after.piece).toBe(null);
    expect(after.board.slice((ROWS - 1) * COLS, (ROWS - 1) * COLS + 4)).toEqual([1, 1, 1, 1]);
  });

  test('a drop that completes a row counts a line', () => {
    let board = emptyBoard();
    for (let c = 4; c < COLS; c++) board[(ROWS - 1) * COLS + c] = 2;
    const state = withBoard(board, { kind: 'I', shape: BAR, x: 0, y: 0 });
    const after = step(state, 'drop', firstKind);
    expect(after.lines).toBe(1);
    expect(after.best).toBe(1);
    expect(after.board.every((cell) => cell === 0)).toBe(true);
  });

  test('the piece carries over: a nudge never spawns a new one', () => {
    const piece: Piece = { kind: 'I', shape: BAR, x: 4, y: 0 };
    const state = withBoard(emptyBoard(), piece);
    const after = step(step(state, 'left', firstKind), 'right', firstKind);
    expect(after.piece?.kind).toBe('I');
    expect(after.piece?.x).toBe(4);
  });
});

describe('ensurePiece', () => {
  test('spawns one when there is none', () => {
    const state = withBoard(emptyBoard(), null);
    expect(ensurePiece(state, firstKind).piece).not.toBe(null);
  });

  test('leaves an existing piece alone', () => {
    const piece: Piece = { kind: 'I', shape: BAR, x: 2, y: 1 };
    const state = withBoard(emptyBoard(), piece);
    expect(ensurePiece(state, firstKind).piece).toBe(piece);
  });

  test('a board too full to spawn into resets, keeping best', () => {
    const full = new Array<number>(CELLS).fill(1);
    const state: TetrisState = { board: full, piece: null, lines: 7, best: 3, toppedOut: false };
    const after = ensurePiece(state, firstKind);
    expect(after.board.every((cell) => cell === 0)).toBe(true);
    expect(after.lines).toBe(0);
    expect(after.best).toBe(7);
    expect(after.toppedOut).toBe(true);
    expect(after.piece).not.toBe(null);
  });
});

describe('spawn and stamp', () => {
  test('a spawned piece sits inside the board', () => {
    for (const roll of [0, 0.25, 0.45, 0.65, 0.95]) {
      const piece = spawn(seq([roll]));
      expect(collides(emptyBoard(), piece.shape, piece.x, piece.y)).toBe(false);
    }
  });

  test('stamp writes the piece colour and leaves the rest alone', () => {
    const out = stamp(emptyBoard(), { kind: 'I', shape: BAR, x: 0, y: 0 });
    expect(out.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(out.slice(4).every((cell) => cell === 0)).toBe(true);
  });

  test('a new game has a piece and an empty board', () => {
    const state = newGame(firstKind);
    expect(state.board.every((cell) => cell === 0)).toBe(true);
    expect(state.piece).not.toBe(null);
    expect(state.lines).toBe(0);
  });
});
