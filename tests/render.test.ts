import { describe, expect, test } from 'claude-code/testing';

import { MAX_SOURCE, esc, svg } from '../hooks/render/svg';
import { g2048Svg, tetrisSvg, wordSvg } from '../hooks/render/board';
import { g2048Rows, tetrisRows, wordRows } from '../hooks/render/text';
import { gardenAlt, gardenSvg, gardenText } from '../hooks/scenes/garden';
import { ROW as GARDEN_ROW } from '../hooks/scenes/garden';
import { THRESHOLDS, aquariumAlt, aquariumSvg, aquariumText, nextSpeciesIn, speciesAt } from '../hooks/scenes/aquarium';
import { CELLS as T_CELLS, newGame as newTetris, type TetrisState } from '../hooks/games/tetris';
import { CELLS as G_CELLS, type G2048State } from '../hooks/games/g2048';
import type { WordState } from '../hooks/games/word';

const seq = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

const tetris: TetrisState = newTetris(seq([0]));
const g2048: G2048State = { grid: new Array<number>(G_CELLS).fill(0), score: 0, best: 0, over: false };
const word: WordState = { word: 'CRANE', guesses: ['PLANT'], played: 1, solved: 0, locale: 'en' };

/** Every SVG document the plugin can produce, at a few widths. */
const documents = (): { name: string; source: string; alt: string }[] => {
  const out: { name: string; source: string; alt: string }[] = [];
  for (const width of [240, 420, 560]) {
    out.push({ name: `garden@${width}`, source: gardenSvg({ flowers: 7, width }), alt: gardenAlt(7) });
    out.push({ name: `aquarium@${width}`, source: aquariumSvg({ waits: 130, width }), alt: aquariumAlt(130) });
    const t = tetrisSvg(tetris, width);
    const g = g2048Svg(g2048, width);
    const w = wordSvg(word, width, false);
    out.push({ name: `tetris@${width}`, ...t });
    out.push({ name: `2048@${width}`, ...g });
    out.push({ name: `word@${width}`, ...w });
  }
  return out;
};

describe('the scrub rules', () => {
  test('no document uses a group element', () => {
    for (const doc of documents()) {
      expect(doc.source.includes('<g ')).toBe(false);
      expect(doc.source.includes('<g>')).toBe(false);
    }
  });

  test('no document carries script or an event handler', () => {
    for (const doc of documents()) {
      expect(/<script/i.test(doc.source)).toBe(false);
      expect(/\son[a-z]+\s*=/i.test(doc.source)).toBe(false);
      expect(/javascript:/i.test(doc.source)).toBe(false);
    }
  });

  test('every document is a well-formed svg root with a title', () => {
    for (const doc of documents()) {
      expect(doc.source.startsWith('<svg ')).toBe(true);
      expect(doc.source.endsWith('</svg>')).toBe(true);
      expect(doc.source).toContain('<title>');
      expect(doc.source).toContain('viewBox=');
    }
  });

  test('every document stays under the surface limit', () => {
    for (const doc of documents()) {
      expect(doc.source.length).toBeLessThan(MAX_SOURCE);
    }
  });

  test('tags are balanced: every open tag is closed or self-closing', () => {
    for (const doc of documents()) {
      const opens = (doc.source.match(/<[a-zA-Z]/g) ?? []).length;
      const selfClosing = (doc.source.match(/\/>/g) ?? []).length;
      const closes = (doc.source.match(/<\//g) ?? []).length;
      expect(opens).toBe(selfClosing + closes);
    }
  });
});

describe('alt text', () => {
  test('every drawing carries a non-empty alt', () => {
    for (const doc of documents()) {
      expect(doc.alt.length).toBeGreaterThan(0);
    }
  });

  test('the alt says something specific, not just the name', () => {
    expect(gardenAlt(9)).toContain('9');
    expect(aquariumAlt(0)).toContain('1 fish');
    expect(gardenAlt(0)).toContain('growing');
  });

  test('a full row of flowers starts over', () => {
    expect(gardenAlt(GARDEN_ROW)).toContain('0 flowers');
    expect(gardenAlt(GARDEN_ROW)).toContain('1 bed');
  });
});

describe('escaping', () => {
  test('the five dangerous characters are escaped', () => {
    expect(esc(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  test('a title that looks like markup cannot close the tag', () => {
    const out = svg(10, 10, '</title><script>alert(1)</script>', '');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('aquarium progress', () => {
  test('the tank starts with one fish', () => {
    expect(speciesAt(0)).toBe(1);
  });

  test('species arrive at the thresholds and never go backwards', () => {
    let last = 0;
    for (let waits = 0; waits <= 300; waits += 1) {
      const now = speciesAt(waits);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(THRESHOLDS.length);
  });

  test('the countdown to the next species is right and ends at null', () => {
    expect(nextSpeciesIn(0)).toBe(5);
    expect(nextSpeciesIn(4)).toBe(1);
    expect(nextSpeciesIn(1000)).toBe(null);
  });
});

describe('the terminal rows', () => {
  test('the tetris board draws one row per board row plus a score line', () => {
    const rows = tetrisRows(tetris);
    expect(rows.length).toBeGreaterThanOrEqual(T_CELLS / 12);
    expect(rows[rows.length - 1]).toContain('lines');
  });

  test('the 2048 grid draws four rows and a score line', () => {
    const rows = g2048Rows(g2048);
    expect(rows.length).toBe(5);
    expect(rows[4]).toContain('score');
  });

  test('the word grid draws six rows plus two lines of state', () => {
    const rows = wordRows(word, false);
    expect(rows.length).toBe(8);
    expect(rows[6]).toContain('guesses left');
  });

  test('a revealed word round says the answer', () => {
    expect(wordRows(word, true)[6]).toContain('CRANE');
  });

  test('the scenes draw rows too', () => {
    expect(gardenText(3).length).toBeGreaterThan(0);
    expect(aquariumText(30).length).toBeGreaterThan(0);
  });

  test('a garden that has just wrapped still shows the bed it finished', () => {
    // The bug this pins: at exactly ROW flowers the new bed is empty, and the
    // scene drew four near-blank rows that read as broken rather than earned.
    const rows = gardenText(GARDEN_ROW, 60);
    expect(rows.join('\n')).toContain(`${GARDEN_ROW} grown`);
    expect(rows.join('\n')).toContain('bed 2');
    // The finished bed is drawn above the new one, so the patch is never bare.
    expect((rows[0] ?? '').trim().length).toBeGreaterThan(0);
  });

  test('a garden in its first bed counts what is in flower', () => {
    expect(gardenText(4, 60).join('\n')).toContain('4 grown');
  });

  test('the scenes fit the width they are given', () => {
    for (const columns of [30, 44, 80, 200]) {
      for (const rows of [gardenText(7, columns), aquariumText(130, columns)]) {
        for (const row of rows) expect(row.length).toBeLessThanOrEqual(Math.max(columns, 40));
      }
    }
  });

  test('the tank draws one fish per species and never two in a row', () => {
    const rows = aquariumText(300, 60);
    const fish = rows.join('\n').match(/[<>][<>=)(°]+[<>]/g) ?? [];
    expect(fish.length).toBe(speciesAt(300));
  });

  test('no row is empty of meaning', () => {
    for (const rows of [tetrisRows(tetris), g2048Rows(g2048), wordRows(word, false)]) {
      for (const row of rows) expect(typeof row).toBe('string');
    }
  });
});

describe('the boards react to their state', () => {
  test('a tetris board with a piece draws a ghost outline', () => {
    expect(tetrisSvg(tetris, 420).source).toContain('stroke-dasharray');
  });

  test('a finished 2048 game says so', () => {
    expect(g2048Svg({ ...g2048, over: true }, 420).source).toContain('no moves');
    expect(g2048Svg(g2048, 420).source).not.toContain('no moves');
  });

  test('a word board shows the answer only when asked to', () => {
    expect(wordSvg(word, 420, true).source).toContain('CRANE');
    expect(wordSvg(word, 420, false).source).not.toContain('CRANE');
  });

  test('a garden with more flowers draws more of them', () => {
    const few = gardenSvg({ flowers: 1, width: 420 }).length;
    const many = gardenSvg({ flowers: 8, width: 420 }).length;
    expect(many).toBeGreaterThan(few);
  });
});
