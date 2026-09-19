/**
 * Game state to SVG.  [PURE]
 *
 * Each of these takes a game's state and a width and returns one `<svg>`
 * document plus the `alt` that goes with it. Nothing here reads the store or
 * the surface, so a board can be rendered in a test and compared as a string.
 */

import { INK, MUTED, rect, svg, text } from './svg';
import { COLS, ROWS, KINDS, collides, dropY, type TetrisState } from '../games/tetris';
import { SIZE, highest, type G2048State } from '../games/g2048';
import { LENGTH, TRIES, score, type Mark, type WordState } from '../games/word';

export type Drawing = { source: string; alt: string };

const PIECE_COLORS = ['#00000000', '#6fb3d2', '#e6c35c', '#b98ad1', '#e89b6a', '#7fc08a'];
const EMPTY_CELL = '#e7e3da';
const BOARD_BG = '#f2efe8';

/* ------------------------------------------------------------------ tetris */

export function tetrisAlt(state: TetrisState): string {
  const filled = state.board.filter((c) => c !== 0).length;
  const piece = state.piece ? `${state.piece.kind} piece in play` : 'no piece in play';
  return `Tetris, ${COLS} by ${ROWS}. ${state.lines} lines cleared, best ${state.best}. ${filled} cells filled, ${piece}.`;
}

export function tetrisSvg(state: TetrisState, width: number): Drawing {
  const pad = 8;
  const headroom = 16;
  const cell = Math.max(8, Math.min(18, Math.floor((width - pad * 2) / COLS)));
  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const w = boardW + pad * 2;
  const h = boardH + pad * 2 + headroom;
  const originY = pad + headroom;

  const cells: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const value = state.board[r * COLS + c] as number;
      cells.push(
        rect({
          x: pad + c * cell + 0.5,
          y: originY + r * cell + 0.5,
          width: cell - 1,
          height: cell - 1,
          rx: 2,
          fill: value === 0 ? EMPTY_CELL : (PIECE_COLORS[value] as string),
        }),
      );
    }
  }

  // The ghost first, so the live piece draws over it where they overlap.
  const ghost: string[] = [];
  const live: string[] = [];
  if (state.piece) {
    const { shape, x } = state.piece;
    const landing = dropY(state.board, shape, x, state.piece.y);
    for (let r = 0; r < shape.length; r++) {
      const row = shape[r] as readonly number[];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === 0) continue;
        const gx = pad + (x + c) * cell + 0.5;
        const gy = originY + (landing + r) * cell + 0.5;
        if (landing + r >= 0) {
          ghost.push(
            rect({
              x: gx,
              y: gy,
              width: cell - 1,
              height: cell - 1,
              rx: 2,
              fill: 'none',
              stroke: MUTED,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
              opacity: 0.8,
            }),
          );
        }
        const py = state.piece.y + r;
        if (py >= 0) {
          live.push(
            rect({
              x: gx,
              y: originY + py * cell + 0.5,
              width: cell - 1,
              height: cell - 1,
              rx: 2,
              fill: PIECE_COLORS[KINDS.indexOf(state.piece.kind) + 1] as string,
            }),
          );
        }
      }
    }
  }

  const header =
    text(`lines ${state.lines}`, { x: pad, y: pad + 9, 'text-anchor': 'start', 'font-size': 10, fill: INK }) +
    text(`best ${state.best}`, { x: w - pad, y: pad + 9, 'text-anchor': 'end', 'font-size': 10, fill: MUTED });

  const topped = state.toppedOut
    ? text('board cleared — new game', { x: w / 2, y: pad + 9, 'font-size': 10, fill: '#c2685a' })
    : '';

  const body =
    rect({ x: 0, y: 0, width: w, height: h, rx: 6, fill: BOARD_BG }) +
    header +
    topped +
    cells.join('') +
    ghost.join('') +
    live.join('');

  return { source: svg(w, h, tetrisAlt(state), body), alt: tetrisAlt(state) };
}

/** True when the piece cannot move that way, so the pane can dim the button. */
export function tetrisCanMove(state: TetrisState, dx: number): boolean {
  if (!state.piece) return true;
  return !collides(state.board, state.piece.shape, state.piece.x + dx, state.piece.y);
}

/* -------------------------------------------------------------------- 2048 */

const TILE_COLORS: Record<number, string> = {
  0: EMPTY_CELL,
  2: '#eee4da',
  4: '#ede0c8',
  8: '#f2b179',
  16: '#f59563',
  32: '#f67c5f',
  64: '#f65e3b',
  128: '#edcf72',
  256: '#edcc61',
  512: '#edc850',
  1024: '#edc53f',
  2048: '#edc22e',
};

export function g2048Alt(state: G2048State): string {
  const top = highest(state.grid);
  const over = state.over ? ' No move is possible; the next move starts a new game.' : '';
  return `2048. Score ${state.score}, best ${state.best}, highest tile ${top}.${over}`;
}

export function g2048Svg(state: G2048State, width: number): Drawing {
  const pad = 8;
  const headroom = 16;
  const gap = 3;
  const cell = Math.max(22, Math.min(40, Math.floor((Math.min(width, 260) - pad * 2 - gap * (SIZE - 1)) / SIZE)));
  const boardSide = cell * SIZE + gap * (SIZE - 1);
  const w = boardSide + pad * 2;
  const h = boardSide + pad * 2 + headroom;
  const originY = pad + headroom;

  const tiles: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = state.grid[r * SIZE + c] as number;
      const x = pad + c * (cell + gap);
      const y = originY + r * (cell + gap);
      tiles.push(rect({ x, y, width: cell, height: cell, rx: 4, fill: TILE_COLORS[value] ?? '#3c3a32' }));
      if (value !== 0) {
        const digits = String(value).length;
        tiles.push(
          text(String(value), {
            x: x + cell / 2,
            y: y + cell / 2 + cell * 0.14,
            'font-size': Math.round(cell * (digits > 3 ? 0.3 : digits > 2 ? 0.36 : 0.44)),
            'font-weight': '600',
            fill: value <= 4 ? '#776e65' : '#f9f6f2',
          }),
        );
      }
    }
  }

  const header =
    text(`score ${state.score}`, { x: pad, y: pad + 9, 'text-anchor': 'start', 'font-size': 10, fill: INK }) +
    text(`best ${state.best}`, { x: w - pad, y: pad + 9, 'text-anchor': 'end', 'font-size': 10, fill: MUTED });

  const over = state.over
    ? text('no moves — next move restarts', { x: w / 2, y: h - 2, 'font-size': 9, fill: '#c2685a' })
    : '';

  const body = rect({ x: 0, y: 0, width: w, height: h, rx: 6, fill: BOARD_BG }) + header + tiles.join('') + over;
  return { source: svg(w, h, g2048Alt(state), body), alt: g2048Alt(state) };
}

/* -------------------------------------------------------------------- word */

const MARK_FILL: Record<Mark, string> = { hit: '#6aaa64', near: '#c9b458', miss: '#9aa0a6' };

export function wordAlt(state: WordState, reveal: boolean): string {
  const rows = state.guesses.map((guess) => {
    const marks = score(state.word, guess);
    const spelled = [...guess]
      .map((letter, i) => `${letter} ${marks[i] === 'hit' ? 'right place' : marks[i] === 'near' ? 'wrong place' : 'not in the word'}`)
      .join(', ');
    return `${guess}: ${spelled}`;
  });
  const left = TRIES - state.guesses.length;
  const head = `Word, ${LENGTH} letters, ${left} guess${left === 1 ? '' : 'es'} left. Solved ${state.solved} of ${state.played}.`;
  const tail = reveal ? ` The word was ${state.word}.` : '';
  return [head, ...rows].join(' ') + tail;
}

export function wordSvg(state: WordState, width: number, reveal: boolean): Drawing {
  const pad = 8;
  const headroom = 16;
  const gap = 3;
  const cell = Math.max(20, Math.min(34, Math.floor((Math.min(width, 240) - pad * 2 - gap * (LENGTH - 1)) / LENGTH)));
  const boardW = cell * LENGTH + gap * (LENGTH - 1);
  const boardH = cell * TRIES + gap * (TRIES - 1);
  const w = boardW + pad * 2;
  const h = boardH + pad * 2 + headroom;
  const originY = pad + headroom;

  const cells: string[] = [];
  for (let r = 0; r < TRIES; r++) {
    const guess = state.guesses[r];
    const marks = guess ? score(state.word, guess) : undefined;
    const letters = guess ? [...guess] : [];
    for (let c = 0; c < LENGTH; c++) {
      const x = pad + c * (cell + gap);
      const y = originY + r * (cell + gap);
      const mark = marks?.[c];
      cells.push(
        rect({
          x,
          y,
          width: cell,
          height: cell,
          rx: 3,
          fill: mark ? MARK_FILL[mark] : EMPTY_CELL,
          stroke: mark ? 'none' : '#d3cec2',
          'stroke-width': mark ? undefined : 1,
        }),
      );
      const letter = letters[c];
      if (letter !== undefined) {
        cells.push(
          text(letter, {
            x: x + cell / 2,
            y: y + cell / 2 + cell * 0.16,
            'font-size': Math.round(cell * 0.5),
            'font-weight': '600',
            fill: '#ffffff',
          }),
        );
      }
    }
  }

  const left = TRIES - state.guesses.length;
  const header =
    text(reveal ? state.word : `${left} left`, {
      x: pad,
      y: pad + 9,
      'text-anchor': 'start',
      'font-size': 10,
      fill: reveal ? '#6aaa64' : INK,
    }) +
    text(`${state.solved}/${state.played}`, { x: w - pad, y: pad + 9, 'text-anchor': 'end', 'font-size': 10, fill: MUTED });

  const body = rect({ x: 0, y: 0, width: w, height: h, rx: 6, fill: BOARD_BG }) + header + cells.join('');
  return { source: svg(w, h, wordAlt(state, reveal), body), alt: wordAlt(state, reveal) };
}

/** A small dot row that says how many guesses are left, for a compact header. */
export function guessDots(used: number): string {
  return Array.from({ length: TRIES }, (_unused, i) => (i < used ? '●' : '○')).join(' ');
}

