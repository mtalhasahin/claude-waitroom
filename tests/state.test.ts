import { describe, expect, test } from 'claude-code/testing';

import { DEFAULT_CONFIG } from '../hooks/core/config';
import { DEFAULT_PERSISTED, VERSION, read2048, readConfig, readPersisted, readTetris, readWord, resetProgress } from '../hooks/core/state';
import { CELLS as T_CELLS } from '../hooks/games/tetris';
import { CELLS as G_CELLS } from '../hooks/games/g2048';

describe('readConfig', () => {
  test('nothing at all gives the defaults', () => {
    expect(readConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(readConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(readConfig('nonsense')).toEqual(DEFAULT_CONFIG);
    expect(readConfig([1, 2, 3])).toEqual(DEFAULT_CONFIG);
  });

  test('a good record is read back whole', () => {
    const stored = {
      enabled: false,
      mode: 'game',
      game: 'word',
      scene: 'aquarium',
      delay: 0,
      spinner: false,
      keepOpen: true,
      page: 'https://example.com/waitroom',
    };
    expect(readConfig(stored)).toEqual(stored);
  });

  test('a page is re-checked on the way out of the store, not only on the way in', () => {
    // It ends up in an argv, and the store is a file on disk that something
    // else could have written.
    expect(readConfig({ page: 'https://example.com/x' }).page).toBe('https://example.com/x');
    expect(readConfig({ page: 'file:///C:/waitroom/index.html' }).page).toBe('file:///C:/waitroom/index.html');
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'cmd.exe',
      'https://example.com/a b',
      '',
      42,
      null,
      { url: 'https://example.com' },
    ]) {
      expect(readConfig({ page: bad }).page).toBe('');
    }
  });

  test('one bad field falls back alone, the rest survive', () => {
    const out = readConfig({ enabled: 'yes', mode: 'game', game: 'tetris', delay: 9 });
    expect(out.enabled).toBe(DEFAULT_CONFIG.enabled);
    expect(out.mode).toBe('game');
    expect(out.game).toBe('tetris');
    expect(out.delay).toBe(9);
  });

  test('an unknown game or scene name falls back', () => {
    expect(readConfig({ game: 'chess' }).game).toBe(DEFAULT_CONFIG.game);
    expect(readConfig({ scene: 'volcano' }).scene).toBe(DEFAULT_CONFIG.scene);
  });

  test('a negative or absurd delay falls back or is clamped', () => {
    expect(readConfig({ delay: -5 }).delay).toBe(DEFAULT_CONFIG.delay);
    expect(readConfig({ delay: Number.NaN }).delay).toBe(DEFAULT_CONFIG.delay);
    expect(readConfig({ delay: 1e9 }).delay).toBe(600);
  });
});

describe('readTetris', () => {
  const board = new Array<number>(T_CELLS).fill(0);

  test('a board of the wrong size is rejected outright', () => {
    expect(readTetris({ board: [0, 0, 0] })).toBe(undefined);
    expect(readTetris({ board })).not.toBe(undefined);
  });

  test('a cell that is not a whole number in range is rejected', () => {
    const bad = board.slice();
    bad[0] = 9;
    expect(readTetris({ board: bad })).toBe(undefined);
    const fractional = board.slice();
    fractional[0] = 1.5;
    expect(readTetris({ board: fractional })).toBe(undefined);
  });

  test('a malformed piece is dropped but the board is kept', () => {
    const out = readTetris({ board, piece: { kind: 'I', shape: 'not a shape', x: 0, y: 0 }, lines: 4 });
    expect(out?.piece).toBe(null);
    expect(out?.lines).toBe(4);
  });

  test('a good piece is read back', () => {
    const piece = { kind: 'I', shape: [[1, 1, 1, 1]], x: 3, y: 0 };
    expect(readTetris({ board, piece })?.piece).toEqual(piece);
  });

  test('a shape holding anything but 0 and 1 is dropped', () => {
    expect(readTetris({ board, piece: { kind: 'I', shape: [[1, 2]], x: 0, y: 0 } })?.piece).toBe(null);
  });
});

describe('read2048', () => {
  const grid = new Array<number>(G_CELLS).fill(0);

  test('a grid of the wrong size is rejected', () => {
    expect(read2048({ grid: [2, 4] })).toBe(undefined);
  });

  test('scores that are not numbers fall back to zero', () => {
    const out = read2048({ grid, score: 'lots', best: -4 });
    expect(out?.score).toBe(0);
    expect(out?.best).toBe(0);
  });

  test('a good record survives', () => {
    const out = read2048({ grid, score: 120, best: 300, over: true });
    expect(out).toEqual({ grid, score: 120, best: 300, over: true });
  });
});

describe('readWord', () => {
  test('a word of the wrong length is rejected', () => {
    expect(readWord({ word: 'TOOLONG' })).toBe(undefined);
    expect(readWord({ word: 'CRANE' })).not.toBe(undefined);
  });

  test('a guess of the wrong length rejects the whole record', () => {
    expect(readWord({ word: 'CRANE', guesses: ['PLANT', 'NO'] })).toBe(undefined);
  });

  test('a good record survives, locale and all', () => {
    const out = readWord({ word: 'CRANE', guesses: ['PLANT'], played: 3, solved: 2, locale: 'tr' });
    expect(out).toEqual({ word: 'CRANE', guesses: ['PLANT'], played: 3, solved: 2, locale: 'tr' });
  });

  test('a missing or silly locale falls back to English', () => {
    expect(readWord({ word: 'CRANE' })?.locale).toBe('en');
    expect(readWord({ word: 'CRANE', locale: 42 })?.locale).toBe('en');
  });
});

describe('readPersisted', () => {
  test('nothing at all gives the defaults', () => {
    const out = readPersisted(undefined);
    expect(out.v).toBe(VERSION);
    expect(out.config).toEqual(DEFAULT_CONFIG);
    expect(out.games).toEqual({});
    expect(out.scenes).toEqual(DEFAULT_PERSISTED.scenes);
  });

  test('junk gives the defaults rather than throwing', () => {
    for (const junk of ['', 0, false, [], 'waitroom', { v: 'one' }]) {
      expect(readPersisted(junk).config).toEqual(DEFAULT_CONFIG);
    }
  });

  test('a record of the current version keeps its games', () => {
    const stored = {
      v: VERSION,
      config: { ...DEFAULT_CONFIG, mode: 'game', game: 'tetris' },
      games: { '2048': { grid: new Array<number>(G_CELLS).fill(0), score: 8, best: 8, over: false } },
      scenes: { garden: { flowers: 4 }, aquarium: { fish: 2 } },
      stats: { waits: 40, totalWaitMs: 90000 },
    };
    const out = readPersisted(stored);
    expect(out.games['2048']?.score).toBe(8);
    expect(out.scenes.garden.flowers).toBe(4);
    expect(out.stats.waits).toBe(40);
    expect(out.config.game).toBe('tetris');
  });

  test('a record from another version keeps the config and the counters, drops the games', () => {
    const stored = {
      v: 99,
      config: { ...DEFAULT_CONFIG, scene: 'aquarium' },
      games: { '2048': { grid: new Array<number>(G_CELLS).fill(0), score: 8, best: 8, over: false } },
      scenes: { garden: { flowers: 6 }, aquarium: { fish: 1 } },
      stats: { waits: 12, totalWaitMs: 500 },
    };
    const out = readPersisted(stored);
    expect(out.v).toBe(VERSION);
    expect(out.games).toEqual({});
    expect(out.config.scene).toBe('aquarium');
    expect(out.scenes.garden.flowers).toBe(6);
    expect(out.stats.waits).toBe(12);
  });

  test('one corrupt game is dropped and the others are kept', () => {
    const stored = {
      v: VERSION,
      config: DEFAULT_CONFIG,
      games: {
        '2048': { grid: [1, 2, 3] },
        word: { word: 'CRANE', guesses: [], played: 1, solved: 1, locale: 'en' },
      },
      scenes: { garden: { flowers: 0 }, aquarium: { fish: 0 } },
      stats: { waits: 0, totalWaitMs: 0 },
    };
    const out = readPersisted(stored);
    expect(out.games['2048']).toBe(undefined);
    expect(out.games.word?.word).toBe('CRANE');
  });

  test('corrupt scene counters fall back to zero', () => {
    const out = readPersisted({ v: VERSION, scenes: { garden: { flowers: 'many' }, aquarium: null } });
    expect(out.scenes.garden.flowers).toBe(0);
    expect(out.scenes.aquarium.fish).toBe(0);
  });

  test('what it returns is JSON the store will accept back', () => {
    const out = readPersisted({ v: VERSION, config: { mode: 'game' } });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('resetProgress', () => {
  test('clears games, scenes and counters but keeps the config', () => {
    const before = {
      v: VERSION,
      config: { ...DEFAULT_CONFIG, mode: 'game' as const, game: 'word' as const },
      games: { word: { word: 'CRANE', guesses: ['PLANT'], played: 2, solved: 1, locale: 'en' } },
      scenes: { garden: { flowers: 9 }, aquarium: { fish: 3 } },
      stats: { waits: 77, totalWaitMs: 1000 },
    };
    const after = resetProgress(before);
    expect(after.config).toBe(before.config);
    expect(after.games).toEqual({});
    expect(after.scenes).toEqual({ garden: { flowers: 0 }, aquarium: { fish: 0 } });
    expect(after.stats).toEqual({ waits: 0, totalWaitMs: 0 });
  });
});
