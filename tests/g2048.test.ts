import { describe, expect, test } from 'claude-code/testing';

import { CELLS, SIZE, addTile, highest, isDead, move, newGame, slideLine, step, type Direction } from '../hooks/games/g2048';

/** A deterministic stand-in for Math.random that walks a fixed list. */
function seq(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

/** Builds a grid from rows, so the tests read like the board looks. */
const grid = (...rows: number[][]): number[] => rows.flat();

describe('slideLine', () => {
  test('merges a pair once and packs to the front', () => {
    expect(slideLine([2, 2, 0, 0])).toEqual({ line: [4, 0, 0, 0], gained: 4 });
  });

  test('2 2 2 2 becomes 4 4, not 8', () => {
    expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 });
  });

  test('4 4 2 2 becomes 8 4', () => {
    expect(slideLine([4, 4, 2, 2])).toEqual({ line: [8, 4, 0, 0], gained: 12 });
  });

  test('a merged tile is not merged again in the same move', () => {
    expect(slideLine([4, 2, 2, 0])).toEqual({ line: [4, 4, 0, 0], gained: 4 });
  });

  test('gaps close without merging unequal neighbours', () => {
    expect(slideLine([0, 2, 0, 4])).toEqual({ line: [2, 4, 0, 0], gained: 0 });
  });

  test('a full line of distinct tiles is unchanged', () => {
    expect(slideLine([2, 4, 8, 16])).toEqual({ line: [2, 4, 8, 16], gained: 0 });
  });
});

describe('move', () => {
  test('left packs every row toward column zero', () => {
    const before = grid([0, 0, 0, 2], [0, 0, 4, 4], [2, 0, 2, 0], [0, 0, 0, 0]);
    const after = move(before, 'left');
    expect(after.grid).toEqual(grid([2, 0, 0, 0], [8, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]));
    expect(after.gained).toBe(12);
    expect(after.moved).toBe(true);
  });

  test('right, up and down each pack the other way', () => {
    const before = grid([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    expect(move(before, 'right').grid[3]).toBe(2);
    expect(move(before, 'down').grid[12]).toBe(2);
    expect(move(before, 'up').grid[0]).toBe(2);
  });

  test('a move that changes nothing reports moved false', () => {
    const packed = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]);
    for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
      expect(move(packed, dir).moved).toBe(false);
    }
  });

  test('columns merge independently of each other', () => {
    const before = grid([2, 2, 0, 0], [2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    expect(move(before, 'up').grid.slice(0, 4)).toEqual([4, 4, 0, 0]);
  });
});

describe('addTile', () => {
  test('fills exactly one empty cell', () => {
    const before = new Array<number>(CELLS).fill(0);
    const after = addTile(before, seq([0, 0]));
    expect(after.filter((n) => n !== 0).length).toBe(1);
  });

  test('spawns a 4 when the roll is above nine tenths', () => {
    const before = new Array<number>(CELLS).fill(0);
    expect(addTile(before, seq([0, 0.95]))[0]).toBe(4);
  });

  test('spawns a 2 when the roll is below nine tenths', () => {
    const before = new Array<number>(CELLS).fill(0);
    expect(addTile(before, seq([0, 0.5]))[0]).toBe(2);
  });

  test('a full grid is handed back untouched', () => {
    const full = new Array<number>(CELLS).fill(2);
    expect(addTile(full, seq([0.5]))).toEqual(full);
  });
});

describe('isDead', () => {
  test('an empty grid is not dead', () => {
    expect(isDead(new Array<number>(CELLS).fill(0))).toBe(false);
  });

  test('a full grid with a matching neighbour is not dead', () => {
    const board = grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 64]);
    expect(isDead(board)).toBe(false);
  });

  test('a full grid with no matching neighbour is dead', () => {
    const board = grid([2, 4, 8, 16], [4, 8, 16, 2], [8, 16, 2, 4], [16, 2, 4, 8]);
    expect(isDead(board)).toBe(true);
  });
});

describe('step', () => {
  test('a move that changes nothing returns the same object and spawns no tile', () => {
    const state = {
      grid: grid([2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]),
      score: 10,
      best: 10,
      over: false,
    };
    expect(step(state, 'left', seq([0.5]))).toBe(state);
  });

  test('a real move accumulates score and adds one tile', () => {
    const state = { grid: grid([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), score: 6, best: 6, over: false };
    const after = step(state, 'left', seq([0, 0.5]));
    expect(after.score).toBe(10);
    expect(after.grid.filter((n) => n !== 0).length).toBe(2);
  });

  test('best keeps the highest score ever reached', () => {
    const state = { grid: grid([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), score: 0, best: 99, over: false };
    expect(step(state, 'left', seq([0, 0.5])).best).toBe(99);
  });

  test('a finished game starts over on the next move, keeping best', () => {
    const state = { grid: new Array<number>(CELLS).fill(2), score: 40, best: 77, over: true };
    const after = step(state, 'left', seq([0, 0.5, 0.3, 0.5]));
    expect(after.over).toBe(false);
    expect(after.score).toBe(0);
    expect(after.best).toBe(77);
    expect(after.grid.filter((n) => n !== 0).length).toBe(2);
  });
});

describe('newGame', () => {
  test('starts with exactly two tiles', () => {
    const state = newGame(seq([0, 0.5, 0.4, 0.5]));
    expect(state.grid.filter((n) => n !== 0).length).toBe(2);
    expect(state.score).toBe(0);
  });

  test('the grid is SIZE by SIZE', () => {
    expect(newGame(seq([0, 0.5, 0.4, 0.5])).grid.length).toBe(SIZE * SIZE);
  });
});

test('highest reports the largest tile', () => {
  expect(highest(grid([2, 4, 0, 0], [0, 512, 0, 0], [0, 0, 0, 0], [0, 0, 0, 8]))).toBe(512);
});
