import { describe, expect, test } from 'claude-code/testing';

import { WORDS } from '../hooks/games/words';
import {
  LENGTH,
  TRIES,
  checkGuess,
  isFinished,
  isSolved,
  letterMarks,
  newRound,
  score,
  step,
  toLower,
  toUpper,
  type WordState,
} from '../hooks/games/word';

const seq = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

const round = (word: string, guesses: string[] = [], locale = 'en'): WordState => ({
  word,
  guesses,
  played: 0,
  solved: 0,
  locale,
});

describe('the word list', () => {
  test('every answer is exactly five letters', () => {
    const wrong = WORDS.filter((w) => [...w].length !== LENGTH);
    expect(wrong).toEqual([]);
  });

  test('every answer is lowercase letters only', () => {
    const wrong = WORDS.filter((w) => !/^[a-z]{5}$/.test(w));
    expect(wrong).toEqual([]);
  });

  test('there are no duplicates', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  test('the list is long enough to stay interesting', () => {
    expect(WORDS.length).toBeGreaterThan(500);
  });
});

describe('locale casing', () => {
  test('English upper-casing is the plain mapping', () => {
    expect(toUpper('crane', 'en')).toBe('CRANE');
  });

  test('Turkish maps dotted i to dotted I', () => {
    expect(toUpper('iyi', 'tr')).toBe('İYİ');
  });

  test('Turkish maps dotless i to plain I', () => {
    expect(toUpper('kız', 'tr')).toBe('KIZ');
  });

  test('the default mapping would corrupt Turkish, which is why locale is carried', () => {
    expect('iyi'.toUpperCase()).toBe('IYI');
    expect(toUpper('iyi', 'tr')).not.toBe('iyi'.toUpperCase());
  });

  test('lower-casing back is the inverse in Turkish too', () => {
    expect(toLower('İYİ', 'tr')).toBe('iyi');
    expect(toLower('KIZ', 'tr')).toBe('kız');
  });
});

describe('score', () => {
  test('an exact guess is all hits', () => {
    expect(score('CRANE', 'CRANE')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
  });

  test('a guess sharing nothing is all misses', () => {
    expect(score('CRANE', 'FLOUT')).toEqual(['miss', 'miss', 'miss', 'miss', 'miss']);
  });

  test('a letter in the word but the wrong place is near', () => {
    // CRANE against ENACT: A alone lands in place, the rest are elsewhere.
    expect(score('CRANE', 'ENACT')).toEqual(['near', 'near', 'hit', 'near', 'miss']);
  });

  test('two of a letter the answer has once earns one mark, not two', () => {
    // ABBEY has one B; the second B of BBBBB gets nothing beyond the exact one.
    expect(score('ABBEY', 'BBBBB')).toEqual(['miss', 'hit', 'hit', 'miss', 'miss']);
  });

  test('exact matches are taken before the near marks are handed out', () => {
    // SPEED has two E. GEESE has three: one lands exactly, one is near, and
    // the last gets nothing, because the pool the near marks draw from is empty.
    expect(score('SPEED', 'GEESE')).toEqual(['miss', 'near', 'hit', 'near', 'miss']);
  });

  test('an exact match consumes the letter, so the extra guesses of it miss', () => {
    // CRANE has one E, and EERIE spends it on the exact match at the end;
    // the two leading E have nothing left to claim.
    expect(score('CRANE', 'EERIE')).toEqual(['miss', 'miss', 'near', 'miss', 'hit']);
  });

  test('a repeated guess letter against a single answer letter marks one only', () => {
    // LEVEL has two E: EERIE lands one exactly and takes the other as near.
    expect(score('LEVEL', 'EERIE')).toEqual(['near', 'hit', 'miss', 'miss', 'miss']);
  });

  test('accented letters score like any other', () => {
    expect(score('ÇİÇEK', 'ÇİÇEK')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
  });
});

describe('checkGuess', () => {
  test('a five-letter guess is normalised to upper case', () => {
    expect(checkGuess(round('CRANE'), 'plant')).toEqual({ guess: 'PLANT' });
  });

  test('surrounding space is trimmed', () => {
    expect(checkGuess(round('CRANE'), '  plant  ')).toEqual({ guess: 'PLANT' });
  });

  test('a guess of the wrong length is refused', () => {
    expect(checkGuess(round('CRANE'), 'four')).toEqual({ problem: 'length' });
    expect(checkGuess(round('CRANE'), 'sixsix')).toEqual({ problem: 'length' });
  });

  test('a guess that is not all letters is refused', () => {
    expect(checkGuess(round('CRANE'), 'pl4nt')).toEqual({ problem: 'letters' });
    expect(checkGuess(round('CRANE'), 'pl nt')).toEqual({ problem: 'letters' });
  });

  test('a guess already made is refused', () => {
    expect(checkGuess(round('CRANE', ['PLANT']), 'plant')).toEqual({ problem: 'repeat' });
  });

  test('accented letters are accepted', () => {
    expect(checkGuess(round('ÇIÇEK', [], 'tr'), 'çiçek')).toEqual({ guess: 'ÇİÇEK' });
  });
});

describe('the round', () => {
  test('it is finished once the answer is guessed', () => {
    expect(isFinished(round('CRANE', ['PLANT', 'CRANE']))).toBe(true);
    expect(isSolved(round('CRANE', ['PLANT', 'CRANE']))).toBe(true);
  });

  test('it is finished once the guesses run out', () => {
    const state = round('CRANE', ['PLANT', 'FLOUT', 'BRICK', 'SHEEP', 'GUARD', 'MOUSE']);
    expect(state.guesses.length).toBe(TRIES);
    expect(isFinished(state)).toBe(true);
    expect(isSolved(state)).toBe(false);
  });

  test('it is not finished half way through', () => {
    expect(isFinished(round('CRANE', ['PLANT']))).toBe(false);
  });
});

describe('step', () => {
  test('a good guess is appended', () => {
    const after = step(round('CRANE'), 'plant', seq([0]));
    expect(after.state.guesses).toEqual(['PLANT']);
    expect(after.problem).toBe(undefined);
  });

  test('a refused guess reports the problem and appends nothing', () => {
    const after = step(round('CRANE'), 'four', seq([0]));
    expect(after.problem).toBe('length');
    expect(after.state.guesses).toEqual([]);
  });

  test('a finished round rolls into a new word and counts the last one', () => {
    const solved = { ...round('CRANE', ['CRANE']), played: 2, solved: 1 };
    const after = step(solved, 'plant', seq([0]));
    expect(after.state.played).toBe(3);
    expect(after.state.solved).toBe(2);
    expect(after.state.guesses).toEqual(['PLANT']);
    expect(after.state.word).not.toBe('CRANE');
  });

  test('a lost round rolls over without counting a solve', () => {
    const lost = { ...round('CRANE', ['PLANT', 'FLOUT', 'BRICK', 'SHEEP', 'GUARD', 'MOUSE']), played: 1, solved: 1 };
    const after = step(lost, 'grape', seq([0]));
    expect(after.state.played).toBe(2);
    expect(after.state.solved).toBe(1);
  });
});

describe('newRound', () => {
  test('picks an answer from the list, upper-cased', () => {
    const state = newRound(seq([0]));
    expect(state.word).toBe((WORDS[0] as string).toUpperCase());
    expect(state.guesses).toEqual([]);
    expect(state.locale).toBe('en');
  });

  test('carries the counters and the locale forward', () => {
    const state = newRound(seq([0.5]), { played: 4, solved: 3, locale: 'tr' });
    expect(state.played).toBe(4);
    expect(state.solved).toBe(3);
    expect(state.locale).toBe('tr');
  });
});

describe('letterMarks', () => {
  test('a letter keeps its best mark across guesses', () => {
    const marks = letterMarks(round('CRANE', ['ENACT', 'CRANE']));
    expect(marks.get('C')).toBe('hit');
    expect(marks.get('E')).toBe('hit');
  });

  test('a letter never seen is absent', () => {
    expect(letterMarks(round('CRANE', ['CRANE'])).get('Z')).toBe(undefined);
  });
});
