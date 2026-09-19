#!/usr/bin/env node
/**
 * Waitroom, as one line under the prompt.
 *
 * Why this exists: the plugin's own drawing goes through the surface's render
 * protocol, which the Claude desktop app does not implement yet — hooks fire
 * and the store fills up, but nothing is drawn. A status line is a different
 * road: the engine runs this command and shows what it prints. So the plugin
 * stays the brain (it is the thing that knows a turn began and ended) and this
 * is the display.
 *
 * It is a plain program, not part of the plugin, and the difference matters:
 * the plugin promises to touch no files, and keeps that promise. This reads
 * one file — the plugin's own store — and writes nothing.
 *
 * Install it by pointing `statusLine` at it in ~/.claude/settings.json:
 *
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node C:/path/to/statusline/waitroom-line.mjs",
 *     "refreshInterval": 1
 *   }
 *
 * `refreshInterval` is what makes the scene move: the engine re-runs this
 * every N seconds, so each run draws the next frame.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/* ------------------------------------------------------------------ input */

/** Everything this needs from the engine, with a safe answer for each. */
function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The plugin's store, or null when it has not run yet. */
function readStore() {
  try {
    const dir = join(homedir(), '.claude', 'plugins', 'store');
    const name = readdirSync(dir).find((f) => f.startsWith('waitroom_waitroom-') && f.endsWith('.json'));
    if (!name) return null;
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    return parsed?.waitroom ?? null;
  } catch {
    return null;
  }
}

const num = (value, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

/* ----------------------------------------------------------------- scenes */

const PETALS = ['\u2740', '\u273f', '\u2741', '\u273d', '\u2698'];
const ROW = 10;

/** The bed, filling one flower per completed wait, with a breath of breeze. */
function garden(flowers, frame, width) {
  const grown = flowers % ROW;
  const beds = Math.floor(flowers / ROW);

  const cells = [];
  for (let i = 0; i < ROW; i++) {
    if (i < grown) {
      // The breeze moves one flower at a time, so the row is never still but
      // never busy either.
      const swaying = i === frame % ROW;
      cells.push(swaying ? '\u2741' : (PETALS[(i + beds * ROW) % PETALS.length] ?? '\u2740'));
    } else if (i === grown) {
      cells.push('\u00b7');
    } else {
      cells.push(' ');
    }
  }

  const tail = beds > 0 ? `${flowers} grown \u00b7 bed ${beds + 1}` : `${grown} grown`;
  return clip(`${cells.join('')}  ${tail}`, width);
}

const FISH = ['><>', '<><', '><(>', '<)><', '><\u00b0>', '<\u00b0><'];
const THRESHOLDS = [0, 5, 20, 60, 120, 240];

/** The tank, swimming: each species crosses the line at its own pace. */
function aquarium(waits, frame, width) {
  const species = THRESHOLDS.filter((t) => waits >= t).length;
  const next = THRESHOLDS.find((t) => waits < t);

  const tail = next === undefined ? `${species} species` : `${species} species \u00b7 ${next - waits} to go`;
  const lane = Math.max(12, width - tail.length - 4);
  const cells = new Array(lane).fill('\u00b7');

  for (let i = 0; i < species; i++) {
    const shape = FISH[i % FISH.length] ?? '><>';
    const rightward = i % 2 === 0;
    const speed = 1 + (i % 3);
    const span = lane + shape.length;
    const walk = (frame * speed + i * 7) % span;
    const at = rightward ? walk - shape.length : lane - walk;
    for (let c = 0; c < shape.length; c++) {
      const x = at + c;
      if (x >= 0 && x < lane) cells[x] = shape[c];
    }
  }

  return clip(`${cells.join('')}  ${tail}`, width);
}

function clip(text, width) {
  return [...text].length > width ? `${[...text].slice(0, Math.max(0, width - 1)).join('')}\u2026` : text;
}

/* ------------------------------------------------------------------- draw */

const input = readInput();
const store = readStore();

// The engine has not run the plugin yet, or it is off: say nothing rather than
// occupying the line with an error.
if (!store || store?.config?.enabled === false) process.exit(0);

const config = store.config ?? {};
const width = num(input?.terminal?.width ?? input?.workspace?.width, 0) || 72;
// One frame per second of wall clock, so successive runs continue the motion.
const frame = Math.floor(Date.now() / 1000);

const scene =
  config.mode === 'game'
    ? gameLine(store, config)
    : config.scene === 'aquarium'
      ? aquarium(num(store?.stats?.waits), frame, width)
      : garden(num(store?.scenes?.garden?.flowers), frame, width);

/** In game mode the line reports the score; the board needs a real surface. */
function gameLine(state, cfg) {
  if (cfg.game === '2048') return `2048 \u00b7 ${num(state?.games?.['2048']?.score)} points`;
  if (cfg.game === 'tetris') return `tetris \u00b7 ${num(state?.games?.tetris?.lines)} lines`;
  const word = state?.games?.word;
  return `word \u00b7 solved ${num(word?.solved)} of ${num(word?.played)}`;
}

process.stdout.write(scene);
