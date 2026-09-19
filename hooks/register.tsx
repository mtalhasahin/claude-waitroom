/**
 * Waitroom — the hooks module.
 *
 * This file is deliberately thin. It wires events to the pure functions under
 * `core/`, `games/`, `scenes/` and `render/`, keeps the pane's lifecycle, and
 * routes the drawing. All the rules live in those modules, where they are
 * testable and where an EARLY ACCESS change to this API cannot reach them.
 *
 * Two shapes are forced by the engine's static scan, which derives the
 * plugin's declared capabilities from this source:
 *
 * - every function that takes `$` is declared at the top of this file, never
 *   nested inside `register`, because the scan follows `$` only through
 *   top-level declarations;
 * - the session's mutable state is a `Room` record created inside `register`
 *   and passed explicitly, so there are no module-level mutable globals and a
 *   module reload starts clean.
 *
 * Capabilities used: `ui`, `store`, `clock`, `command`. Nothing else — no
 * `fs`, no `http`, no `process`, no `model`, no `agent`, no `tool`, no `mcp`,
 * no `prompt`. See the README's zero-token notes.
 */

import type { EngineInterface, Register, RenderInputOf, RenderSurface, Timer } from 'claude-code';

import { HELP_LINES, applyCommand, type Config, type PaneView } from './core/config';
import { DEFAULT_PERSISTED, STORE_KEY, readPersisted, resetProgress, type Persisted } from './core/state';
import * as tetris from './games/tetris';
import * as g2048 from './games/g2048';
import * as word from './games/word';
import { gardenAlt, gardenSvg, gardenText } from './scenes/garden';
import { aquariumAlt, aquariumSvg, aquariumText } from './scenes/aquarium';
import { g2048Svg, tetrisSvg, wordSvg, type Drawing } from './render/board';
import { g2048Rows, tetrisRows, wordRows } from './render/text';

/** The pane's id, which is also its `requestId` at `ui.render`. */
const PANE_ID = 'waitroom';
const TITLE = 'Waitroom';

/** Roughly how many CSS pixels a character cell is worth on a remote surface. */
const PX_PER_COLUMN = 8;

type Surfaced<S extends RenderSurface> = RenderInputOf<'Pane', S>;

/**
 * Everything the plugin knows for the length of one session.
 *
 * One of these is made per `register` call, so a reload starts from scratch;
 * `saved` is the only part that outlives the session, through `$.store`.
 */
type Room = {
  /** The store's contents, read once at session start and written through. */
  saved: Persisted;
  /** True between our own `ui.open` and the matching `ui.close`. */
  isOpen: boolean;
  /** Which tree the pane draws. */
  view: PaneView;
  /** The delayed open, kept so a turn that ends first can cancel it. */
  openTimer: Timer | null;
  /**
   * Moves left in this wait. One wait is one move: the games are turn-based on
   * purpose, so a wait cannot become a real-time game competing with the work
   * being waited on.
   */
  movesLeft: number;
  /** A short line under the board — why a guess was refused, what just happened. */
  notice: string | undefined;
  /** Set while a Word round has just ended, so the answer may be shown. */
  reveal: boolean;
};

function newRoom(): Room {
  return {
    saved: DEFAULT_PERSISTED,
    isOpen: false,
    view: 'play',
    openTimer: null,
    movesLeft: 0,
    notice: undefined,
    reveal: false,
  };
}

const configOf = (room: Room): Config => room.saved.config;

const rand = (): number => Math.random();

const tetrisOf = (room: Room): tetris.TetrisState => room.saved.games.tetris ?? tetris.newGame(rand);
const g2048Of = (room: Room): g2048.G2048State => room.saved.games['2048'] ?? g2048.newGame(rand);
const wordOf = (room: Room): word.WordState => room.saved.games.word ?? word.newRound(rand);

/** Spends this wait's move, if there is one left. */
function spendMove(room: Room): boolean {
  if (room.movesLeft <= 0) return false;
  room.movesLeft--;
  return true;
}

/* ------------------------------------------------------------- engine calls */

/** Writes the state back. Failures are swallowed: a lost save must not break a turn. */
function persist($: EngineInterface, room: Room): void {
  void $.store.set(STORE_KEY, room.saved).catch(() => undefined);
}

function redraw($: EngineInterface): void {
  $.ui.invalidate('ui.render');
}

async function openPane($: EngineInterface, room: Room, view: PaneView): Promise<void> {
  room.view = view;
  // `help` and `reset` answer something the person typed, so they open as a
  // dialog: focused, closable with Escape, and placed at any width.
  const asDialog = view !== 'play';
  await $.ui
    .open(asDialog ? { id: PANE_ID, title: TITLE, focus: true, closeOnEscape: true, rows: 14 } : { id: PANE_ID, title: TITLE })
    .catch(() => undefined);
  room.isOpen = true;
  redraw($);
}

async function closePane($: EngineInterface, room: Room): Promise<void> {
  room.openTimer?.cancel();
  room.openTimer = null;
  if (!room.isOpen) return;
  await $.ui.close({ id: PANE_ID }).catch(() => undefined);
}

/** Leaves a dialog view: back to the game while a turn runs, otherwise gone. */
function leaveDialog($: EngineInterface, room: Room): void {
  if (room.movesLeft > 0 || configOf(room).keepOpen) {
    room.view = 'play';
    redraw($);
  } else {
    void closePane($, room);
  }
}

function clearProgress($: EngineInterface, room: Room): void {
  room.saved = resetProgress(room.saved);
  persist($, room);
  $.ui.toast('waitroom: progress cleared');
  leaveDialog($, room);
}

/* ------------------------------------------------------------------- moves */

function playTetris($: EngineInterface, room: Room, action: tetris.Action): void {
  if (!spendMove(room)) return;
  room.saved = { ...room.saved, games: { ...room.saved.games, tetris: tetris.step(tetrisOf(room), action, rand) } };
  room.notice = room.movesLeft === 0 ? 'moved — next wait, next move' : undefined;
  persist($, room);
  redraw($);
}

function play2048($: EngineInterface, room: Room, dir: g2048.Direction): void {
  const before = g2048Of(room);
  const after = g2048.step(before, dir, rand);
  if (after === before) {
    // A move that changes nothing is not a move: the wait is not spent.
    room.notice = 'that move changes nothing';
    redraw($);
    return;
  }
  if (!spendMove(room)) return;
  room.saved = { ...room.saved, games: { ...room.saved.games, '2048': after } };
  room.notice = room.movesLeft === 0 ? 'moved — next wait, next move' : undefined;
  persist($, room);
  redraw($);
}

function playWord($: EngineInterface, room: Room, guess: string): void {
  const result = word.step(wordOf(room), guess, rand);

  if (result.problem) {
    room.notice =
      result.problem === 'length'
        ? `${word.LENGTH} letters, please`
        : result.problem === 'letters'
          ? 'letters only'
          : result.problem === 'repeat'
            ? 'already guessed'
            : 'starting a new word';
    room.saved = { ...room.saved, games: { ...room.saved.games, word: result.state } };
    persist($, room);
    redraw($);
    return;
  }

  if (!spendMove(room)) return;
  room.saved = { ...room.saved, games: { ...room.saved.games, word: result.state } };
  room.reveal = word.isFinished(result.state);
  room.notice = room.reveal
    ? word.isSolved(result.state)
      ? 'solved'
      : `the word was ${result.state.word}`
    : room.movesLeft === 0
      ? 'guessed — next wait, next guess'
      : undefined;
  persist($, room);
  redraw($);
}

/* ---------------------------------------------------------------- drawings */

/** The board or the scene, as one SVG document, for a surface that draws vectors. */
function drawingFor(room: Room, bodyColumns: number): Drawing {
  const width = Math.max(240, Math.min(560, bodyColumns * PX_PER_COLUMN));
  const c = configOf(room);
  if (c.mode === 'scene') {
    const flowers = room.saved.scenes.garden.flowers;
    const waits = room.saved.stats.waits;
    return c.scene === 'garden'
      ? { source: gardenSvg({ flowers, width }), alt: gardenAlt(flowers) }
      : { source: aquariumSvg({ waits, width }), alt: aquariumAlt(waits) };
  }
  if (c.game === 'tetris') return tetrisSvg(tetrisOf(room), width);
  if (c.game === '2048') return g2048Svg(g2048Of(room), width);
  return wordSvg(wordOf(room), width, room.reveal);
}

/** The same content as rows of text, for the terminal, which draws no vector. */
function rowsFor(room: Room): string[] {
  const c = configOf(room);
  if (c.mode === 'scene') {
    return c.scene === 'garden' ? gardenText(room.saved.scenes.garden.flowers) : aquariumText(room.saved.stats.waits);
  }
  if (c.game === 'tetris') return tetrisRows(tetrisOf(room));
  if (c.game === '2048') return g2048Rows(g2048Of(room));
  return wordRows(wordOf(room), room.reveal);
}

/** The one line the spinner shows, when it is asked for. */
function spinnerLine(room: Room): string {
  const c = configOf(room);
  if (c.mode === 'scene') {
    return c.scene === 'garden'
      ? `${room.saved.scenes.garden.flowers} flowers · one more growing`
      : `${room.saved.stats.waits} waits · the tank is swimming`;
  }
  const turn = room.movesLeft > 0 ? 'your move' : 'moved';
  if (c.game === 'tetris') return `${tetrisOf(room).lines} lines · ${turn}`;
  if (c.game === '2048') return `${g2048Of(room).score} points · ${turn}`;
  return `${word.TRIES - wordOf(room).guesses.length} guesses left · ${turn}`;
}

type Control = { key: string; label: string; press: () => void };

/**
 * The controls for the current game, or none in scene mode.
 *
 * `hotkey` is deliberately not set: the engine honours one only in the
 * `AbovePrompt` band, which does not exist on desktop. These are pressed with
 * the pointer, or with Tab and Enter once the pane holds the keyboard.
 */
function controlsFor($: EngineInterface, room: Room): readonly Control[] {
  const c = configOf(room);
  if (c.mode === 'scene') return [];
  if (c.game === 'tetris') {
    return [
      { key: 'left', label: '◀', press: () => playTetris($, room, 'left') },
      { key: 'rotate', label: '↻', press: () => playTetris($, room, 'rotate') },
      { key: 'right', label: '▶', press: () => playTetris($, room, 'right') },
      { key: 'drop', label: 'drop', press: () => playTetris($, room, 'drop') },
    ];
  }
  if (c.game === '2048') {
    return [
      { key: 'up', label: '▲', press: () => play2048($, room, 'up') },
      { key: 'left', label: '◀', press: () => play2048($, room, 'left') },
      { key: 'down', label: '▼', press: () => play2048($, room, 'down') },
      { key: 'right', label: '▶', press: () => play2048($, room, 'right') },
    ];
  }
  return [];
}

/** Desktop, VS Code and mobile: one `Svg` plus sibling controls. */
function drawVector($: EngineInterface, room: Room, e: Surfaced<'desktop'>) {
  const { Box, Text, Button, Input, Svg } = $.ui.resolve(e);
  const c = configOf(room);

  if (room.view === 'help') {
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Text bold>Waitroom</Text>
        {HELP_LINES.map(([command, what]) => (
          <Box flexDirection="row" gap={1}>
            <Text color="cyan">{command}</Text>
            <Text dimColor>{what}</Text>
          </Box>
        ))}
        <Button key="help-close" label="Close" autoFocus onPress={() => leaveDialog($, room)} />
      </Box>
    );
  }

  if (room.view === 'reset') {
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Text bold>Clear all progress?</Text>
        <Text dimColor>Games, scenes and counters go back to zero. Settings stay.</Text>
        <Box flexDirection="row" gap={1}>
          <Button key="reset-yes" label="Clear it" onPress={() => clearProgress($, room)} />
          <Button key="reset-no" label="Keep it" autoFocus onPress={() => leaveDialog($, room)} />
        </Box>
      </Box>
    );
  }

  const drawn = drawingFor(room, e.props.bodyColumns);
  const buttons = controlsFor($, room);

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Svg source={drawn.source} alt={drawn.alt} isInteractive />
      {buttons.length > 0 ? (
        <Box flexDirection="row" gap={1}>
          {buttons.map((control, i) => (
            <Button
              key={control.key}
              label={control.label}
              dimColor={room.movesLeft === 0}
              autoFocus={i === 0 ? true : undefined}
              onPress={control.press}
            />
          ))}
        </Box>
      ) : null}
      {c.mode === 'game' && c.game === 'word' ? (
        <Input
          key="guess"
          label="guess"
          placeholder={`${word.LENGTH} letters`}
          submitLabel="guess"
          onSubmit={(value) => playWord($, room, value)}
        />
      ) : null}
      {room.notice ? <Text dimColor>{room.notice}</Text> : null}
    </Box>
  );
}

/** The terminal has no `Svg`: the same content as rows of text. */
function drawTerminal($: EngineInterface, room: Room, e: Surfaced<'terminal'>) {
  const { Box, Text, Button, Input } = $.ui.resolve(e);
  const c = configOf(room);

  if (room.view === 'help') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Waitroom</Text>
        {HELP_LINES.map(([command, what]) => (
          <Text>
            {command}
            {'  '}
            {what}
          </Text>
        ))}
        <Button key="help-close" label="Close" autoFocus onPress={() => leaveDialog($, room)} />
      </Box>
    );
  }

  if (room.view === 'reset') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Clear all progress?</Text>
        <Text dimColor>Games, scenes and counters go back to zero. Settings stay.</Text>
        <Box flexDirection="row" gap={1}>
          <Button key="reset-yes" label="Clear it" onPress={() => clearProgress($, room)} />
          <Button key="reset-no" label="Keep it" autoFocus onPress={() => leaveDialog($, room)} />
        </Box>
      </Box>
    );
  }

  const buttons = controlsFor($, room);

  return (
    <Box flexDirection="column" paddingX={1}>
      {rowsFor(room).map((row) => (
        <Text>{row}</Text>
      ))}
      {buttons.length > 0 ? (
        <Box flexDirection="row" gap={1}>
          {buttons.map((control, i) => (
            <Button
              key={control.key}
              label={control.label}
              dimColor={room.movesLeft === 0}
              autoFocus={i === 0 ? true : undefined}
              onPress={control.press}
            />
          ))}
        </Box>
      ) : null}
      {c.mode === 'game' && c.game === 'word' ? (
        <Input key="guess" label="guess" submitLabel="guess" onSubmit={(value) => playWord($, room, value)} />
      ) : null}
      {room.notice ? <Text dimColor>{room.notice}</Text> : null}
    </Box>
  );
}

/* ------------------------------------------------------------------- hooks */

export const register: Register = (on) => {
  const room = newRoom();

  on('session.start', async ($, e, next) => {
    room.saved = readPersisted(await $.store.get(STORE_KEY).catch(() => undefined));
    await $.command
      .register({
        name: 'wait',
        description: 'Waitroom: what fills the pane while Claude works.',
        argumentHint: 'on|off|scene|game|delay|spinner|keep|reset|help',
        immediate: true,
      })
      .catch(() => undefined);
    return next(e);
  });

  on('command.run', { command: 'wait' }, ($, e) => {
    const outcome = applyCommand(configOf(room), e.args ?? '');
    if (outcome.changed) {
      room.saved = { ...room.saved, config: outcome.config };
      persist($, room);
      redraw($);
    }
    if (outcome.view) void openPane($, room, outcome.view);
    else if (outcome.toast) $.ui.toast(outcome.toast);

    // No `{ text }` and no `{ context }`: both are transcript content the model
    // reads on the next turn, and this plugin spends no tokens. The answer goes
    // to a toast, or to the pane for the views that need more than a line.
    return {};
  });

  on('turn.start', async ($, e, next) => {
    room.movesLeft = 1;
    room.reveal = false;
    room.notice = undefined;
    if (!configOf(room).enabled) return next(e);

    const delay = configOf(room).delay;
    room.openTimer?.cancel();
    room.openTimer = null;

    if (delay === 0) {
      void openPane($, room, 'play');
    } else {
      room.openTimer = $.clock.after(delay * 1000, () => {
        room.openTimer = null;
        void openPane($, room, 'play');
      });
    }
    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    // A subagent's run raises its own `turn.complete` and no `turn.start`;
    // acting on one would close the pane in the middle of the main turn.
    if (e.agentId !== undefined) return next(e);

    room.openTimer?.cancel();
    room.openTimer = null;
    room.movesLeft = 0;

    // The wait counted, whatever ended it: answered, interrupted, refused or
    // failed. The garden grows on waits, not on successes.
    room.saved = {
      ...room.saved,
      stats: {
        waits: room.saved.stats.waits + 1,
        totalWaitMs: room.saved.stats.totalWaitMs + Math.max(0, e.durationMs),
      },
      scenes: { ...room.saved.scenes, garden: { flowers: room.saved.scenes.garden.flowers + 1 } },
    };
    persist($, room);

    if (configOf(room).keepOpen) redraw($);
    else await closePane($, room);

    // Never our own text here: whatever this returns is shown beneath the
    // answer and is read by the model. Pass the chain's result through verbatim.
    return next(e);
  });

  on('ui.close', { id: PANE_ID }, ($, e, next) => {
    room.isOpen = false;
    room.view = 'play';
    return next(e);
  });

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const c = configOf(room);
    if (!c.enabled || !c.spinner) return next(e);
    return next({ ...e, props: { ...e.props, message: spinnerLine(room) } });
  });

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e);
    return e.surface === 'terminal' ? drawTerminal($, room, e) : drawVector($, room, e as Surfaced<'desktop'>);
  });
};
