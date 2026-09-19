/**
 * Game state to rows of text, for a surface with no `Svg`.  [PURE]
 *
 * The terminal draws `Box`/`Text` and no vector, so the same states are laid
 * out here as character cells. Each function returns the rows; the caller
 * turns them into `Text` elements.
 */

import { COLS, ROWS, dropY, type TetrisState } from '../games/tetris';
import { SIZE, type G2048State } from '../games/g2048';
import { LENGTH, TRIES, score, type WordState } from '../games/word';

const FULL = '██';
const GHOST = '░░';
const EMPTY = '· ';

export function tetrisRows(state: TetrisState): string[] {
  const grid = state.board.slice();
  const ghost = new Set<number>();
  const live = new Set<number>();

  if (state.piece) {
    const { shape, x, y } = state.piece;
    const landing = dropY(state.board, shape, x, y);
    for (let r = 0; r < shape.length; r++) {
      const row = shape[r] as readonly number[];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === 0) continue;
        const gy = landing + r;
        if (gy >= 0 && gy < ROWS) ghost.add(gy * COLS + (x + c));
        const py = y + r;
        if (py >= 0 && py < ROWS) live.add(py * COLS + (x + c));
      }
    }
  }

  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let line = '';
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (live.has(i)) line += FULL;
      else if ((grid[i] as number) !== 0) line += FULL;
      else if (ghost.has(i)) line += GHOST;
      else line += EMPTY;
    }
    rows.push(line);
  }
  rows.push(`lines ${state.lines}   best ${state.best}`);
  if (state.toppedOut) rows.push('board cleared — new game');
  return rows;
}

const pad = (value: number, width: number): string => {
  const shown = value === 0 ? '.' : String(value);
  const left = Math.floor((width - shown.length) / 2);
  return ' '.repeat(Math.max(0, left)) + shown + ' '.repeat(Math.max(0, width - shown.length - left));
};

export function g2048Rows(state: G2048State): string[] {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    const line: string[] = [];
    for (let c = 0; c < SIZE; c++) line.push(pad(state.grid[r * SIZE + c] as number, 6));
    rows.push(line.join(''));
  }
  rows.push(`score ${state.score}   best ${state.best}`);
  if (state.over) rows.push('no moves — next move restarts');
  return rows;
}

/** `[A]` a hit, `(A)` in the word elsewhere, ` A ` not in it. */
export function wordRows(state: WordState, reveal: boolean): string[] {
  const rows: string[] = [];
  for (let r = 0; r < TRIES; r++) {
    const guess = state.guesses[r];
    if (guess === undefined) {
      rows.push(Array.from({ length: LENGTH }, () => ' _ ').join(''));
      continue;
    }
    const marks = score(state.word, guess);
    rows.push(
      [...guess]
        .map((letter, i) => (marks[i] === 'hit' ? `[${letter}]` : marks[i] === 'near' ? `(${letter})` : ` ${letter} `))
        .join(''),
    );
  }
  rows.push(reveal ? `the word was ${state.word}` : `${TRIES - state.guesses.length} guesses left`);
  rows.push(`solved ${state.solved} of ${state.played}`);
  return rows;
}
