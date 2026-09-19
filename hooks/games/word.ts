/**
 * Word — a five-letter word, six guesses, one guess per wait.  [PURE]
 *
 * The answers ship in `words.ts`; nothing is fetched. Casing goes through
 * `toUpper` rather than `String.prototype.toUpperCase` so the module is ready
 * for a Turkish list, where `i` must become `İ` and `ı` must become `I`.
 */

import { WORDS } from './words';

export const LENGTH = 5;
export const TRIES = 6;

/** `hit` right letter in the right place, `near` in the word elsewhere, `miss` not in it. */
export type Mark = 'hit' | 'near' | 'miss';

export type WordState = {
  /** The answer, upper-cased in the game's locale. */
  word: string;
  /** The guesses so far, upper-cased, oldest first. */
  guesses: string[];
  /** Finished rounds and how many of them were solved; both persist. */
  played: number;
  solved: number;
  /** The locale whose casing rules apply; `en` for the shipped list. */
  locale: string;
};

export type Rand = () => number;

/** Rejections a guess can earn, so the pane can say why it was not taken. */
export type GuessProblem = 'length' | 'letters' | 'repeat' | 'finished';

/**
 * Upper-cases in a locale.
 *
 * Turkish is the reason this exists: the default mapping turns `i` into `I`,
 * which is a different letter there. `toLocaleUpperCase('tr')` gives `İ`, and
 * `ı` gives `I`.
 */
export function toUpper(text: string, locale: string): string {
  return locale === 'en' ? text.toUpperCase() : text.toLocaleUpperCase(locale);
}

/** Lower-cases in a locale, the inverse trap: `I` is `ı` in Turkish. */
export function toLower(text: string, locale: string): string {
  return locale === 'en' ? text.toLowerCase() : text.toLocaleLowerCase(locale);
}

/**
 * Scores a guess against the answer, the classic way.
 *
 * Exact matches are taken first; the letters left over are what the `near`
 * marks are drawn from, so a guess with two of a letter the answer has once
 * gets one mark, not two.
 */
export function score(answer: string, guess: string): Mark[] {
  const a = [...answer];
  const g = [...guess];
  const marks: Mark[] = new Array<Mark>(g.length).fill('miss');

  // Pass one: the letters that sit in the right place.
  const pool = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    const want = a[i] as string;
    if (g[i] === want) marks[i] = 'hit';
    else pool.set(want, (pool.get(want) ?? 0) + 1);
  }

  // Pass two: what is left over feeds the `near` marks, left to right.
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'hit') continue;
    const letter = g[i] as string;
    const left = pool.get(letter) ?? 0;
    if (left > 0) {
      marks[i] = 'near';
      pool.set(letter, left - 1);
    }
  }

  return marks;
}

/** The letters a guess may be made of, once upper-cased. Accented ones count. */
const LETTER = /^\p{L}+$/u;

/**
 * Checks a guess and returns the normalised form, or why it was refused.
 *
 * A guess already made is refused too: it would spend a wait for nothing.
 */
export function checkGuess(state: WordState, raw: string): { guess: string } | { problem: GuessProblem } {
  if (isFinished(state)) return { problem: 'finished' };
  const guess = toUpper(raw.trim(), state.locale);
  if ([...guess].length !== LENGTH) return { problem: 'length' };
  if (!LETTER.test(guess)) return { problem: 'letters' };
  if (state.guesses.includes(guess)) return { problem: 'repeat' };
  return { guess };
}

/** True once the answer was found or the guesses ran out. */
export function isFinished(state: WordState): boolean {
  const last = state.guesses[state.guesses.length - 1];
  return state.guesses.length >= TRIES || last === state.word;
}

/** True when the last guess was the answer. */
export function isSolved(state: WordState): boolean {
  return state.guesses[state.guesses.length - 1] === state.word;
}

export function newRound(rand: Rand, carry?: Pick<WordState, 'played' | 'solved' | 'locale'>): WordState {
  const locale = carry?.locale ?? 'en';
  const pick = WORDS[Math.floor(rand() * WORDS.length) % WORDS.length] as string;
  return {
    word: toUpper(pick, locale),
    guesses: [],
    played: carry?.played ?? 0,
    solved: carry?.solved ?? 0,
    locale,
  };
}

/**
 * One wait, one guess.
 *
 * A round that has ended is rolled over into a fresh one before the guess is
 * taken, so the player never has to ask for a new word.
 */
export function step(state: WordState, raw: string, rand: Rand): { state: WordState; problem?: GuessProblem } {
  const live = isFinished(state)
    ? newRound(rand, { played: state.played + 1, solved: state.solved + (isSolved(state) ? 1 : 0), locale: state.locale })
    : state;

  const checked = checkGuess(live, raw);
  if ('problem' in checked) return { state: live, problem: checked.problem };

  return { state: { ...live, guesses: [...live.guesses, checked.guess] } };
}

/** Every letter's best-known mark so far, for a keyboard hint row. */
export function letterMarks(state: WordState): Map<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };
  const out = new Map<string, Mark>();
  for (const guess of state.guesses) {
    const marks = score(state.word, guess);
    [...guess].forEach((letter, i) => {
      const mark = marks[i] as Mark;
      const held = out.get(letter);
      if (held === undefined || rank[mark] > rank[held]) out.set(letter, mark);
    });
  }
  return out;
}
