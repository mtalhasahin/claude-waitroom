/**
 * Configuration: the shape, the defaults, and the pure parser behind `/wait`.
 *
 * No engine, no surface, no `$` — everything here takes data and returns data,
 * which is what makes it testable and what keeps an EARLY ACCESS API change
 * confined to `register.tsx`.
 */

export type Mode = 'scene' | 'game';
export type GameName = 'tetris' | '2048' | 'word';
export type SceneName = 'garden' | 'aquarium';

/** Which tree the pane draws. `play` is the normal one. */
export type PaneView = 'play' | 'help' | 'reset';

export type Config = {
  /** Master switch: off means the pane never opens. */
  enabled: boolean;
  /** Scene mode is the calm default; games are opt-in. */
  mode: Mode;
  game: GameName;
  scene: SceneName;
  /** Seconds to wait after a turn starts before opening. 0 opens at once. */
  delay: number;
  /** Whether to write a one-line status into the engine's spinner. */
  spinner: boolean;
  /** Whether the pane stays up after the turn ends (§12.4). */
  keepOpen: boolean;
  /**
   * A page to open in the browser once per session, when the first turn starts.
   *
   * Empty by default, and empty means the plugin never starts a process at all.
   * It exists because the desktop app draws no plugin UI: a page opened beside
   * Claude is the only thing that can be there without being asked for.
   */
  page: string;
};

export const GAMES: readonly GameName[] = ['tetris', '2048', 'word'];
export const SCENES: readonly SceneName[] = ['garden', 'aquarium'];

export const DEFAULT_CONFIG: Config = {
  enabled: true,
  mode: 'scene',
  game: '2048',
  scene: 'garden',
  delay: 5,
  spinner: true,
  keepOpen: false,
  page: '',
};

/**
 * What a `page` may look like.
 *
 * The value is stored data that ends up in an argv, so it is checked on the way
 * in rather than trusted on the way out: a web page or a local file, nothing
 * else, and no whitespace to split on.
 */
export const PAGE_PATTERN = /^(?:https?|file):\/\/\S+$/i;

/** The longest a `page` may be, so the store stays small and the argv sane. */
export const MAX_PAGE = 2048;

/** The longest a `delay` may be, so a typo cannot park the pane forever. */
export const MAX_DELAY = 600;

/** True when `page` is something the plugin is willing to hand to the host. */
export const isPage = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_PAGE && PAGE_PATTERN.test(value);

export type CommandOutcome = {
  /** The config as the command leaves it; the same object when nothing changed. */
  config: Config;
  /** True when `config` differs from the one passed in. */
  changed: boolean;
  /** One line for a toast. Never returned to the transcript (see README). */
  toast?: string;
  /** When set, open the pane on this view. */
  view?: PaneView;
  /** True when the command asked for the saved progress to be cleared. */
  wantsReset?: boolean;
};

const isGame = (s: string): s is GameName => (GAMES as readonly string[]).includes(s);
const isScene = (s: string): s is SceneName => (SCENES as readonly string[]).includes(s);

/** `on` / `off` / `true` / `false` / `1` / `0`, or undefined when it is none. */
function asFlag(word: string | undefined): boolean | undefined {
  if (word === 'on' || word === 'true' || word === '1' || word === 'yes') return true;
  if (word === 'off' || word === 'false' || word === '0' || word === 'no') return false;
  return undefined;
}

/** The one-line summary `/wait` with no argument shows. */
export function statusLine(config: Config): string {
  if (!config.enabled) return 'waitroom: off — /wait on to enable';
  const what = config.mode === 'game' ? `game ${config.game}` : `scene ${config.scene}`;
  const when = config.delay === 0 ? 'opens at once' : `opens after ${config.delay}s`;
  const rest = [when];
  if (config.keepOpen) rest.push('stays open');
  if (!config.spinner) rest.push('no spinner line');
  return `waitroom: ${what} — ${rest.join(', ')}`;
}

/**
 * Applies one `/wait ...` invocation to a config.
 *
 * Pure: it never touches the store or the surface. An argument it does not
 * understand asks for the help view rather than guessing.
 */
export function applyCommand(config: Config, rawArgs: string): CommandOutcome {
  const spelled = rawArgs.trim().split(/\s+/).filter(Boolean);
  const words = spelled.map((word) => word.toLowerCase());
  const verb = words[0];
  const arg = words[1];
  // A URL is not a keyword: its path and query can be case-sensitive, so the
  // `page` argument is read as the person typed it.
  const typed = spelled[1];

  const same: CommandOutcome = { config, changed: false };
  const set = (patch: Partial<Config>, toast: string): CommandOutcome => {
    const next: Config = { ...config, ...patch };
    return { config: next, changed: true, toast };
  };

  if (verb === undefined) return { config, changed: false, toast: statusLine(config) };

  switch (verb) {
    case 'on':
      return config.enabled ? { ...same, toast: statusLine(config) } : set({ enabled: true }, 'waitroom: on');
    case 'off':
      return !config.enabled ? { ...same, toast: statusLine(config) } : set({ enabled: false }, 'waitroom: off');

    case 'scene': {
      if (arg === undefined) return set({ mode: 'scene' }, `waitroom: scene ${config.scene}`);
      if (!isScene(arg)) return { ...same, view: 'help' };
      return set({ mode: 'scene', scene: arg }, `waitroom: scene ${arg}`);
    }

    case 'game': {
      if (arg === undefined) return set({ mode: 'game' }, `waitroom: game ${config.game}`);
      if (!isGame(arg)) return { ...same, view: 'help' };
      return set({ mode: 'game', game: arg }, `waitroom: game ${arg}`);
    }

    case 'delay': {
      if (arg === undefined) return { ...same, view: 'help' };
      const n = Number(arg);
      if (!Number.isFinite(n) || n < 0 || n > MAX_DELAY) return { ...same, view: 'help' };
      const delay = Math.round(n);
      return set({ delay }, delay === 0 ? 'waitroom: opens at once' : `waitroom: opens after ${delay}s`);
    }

    case 'spinner': {
      const flag = asFlag(arg);
      if (flag === undefined) return { ...same, view: 'help' };
      return set({ spinner: flag }, `waitroom: spinner line ${flag ? 'on' : 'off'}`);
    }

    case 'keep': {
      const flag = asFlag(arg);
      if (flag === undefined) return { ...same, view: 'help' };
      return set({ keepOpen: flag }, `waitroom: ${flag ? 'stays open after the turn' : 'closes when the turn ends'}`);
    }

    case 'page': {
      if (typed === undefined) {
        return { ...same, toast: config.page ? `waitroom: opens ${config.page}` : 'waitroom: no page set' };
      }
      if (arg === 'off' || arg === 'none') {
        return config.page ? set({ page: '' }, 'waitroom: no page') : { ...same, toast: 'waitroom: no page set' };
      }
      if (!isPage(typed)) return { ...same, view: 'help' };
      return set({ page: typed }, 'waitroom: opens that page once a session');
    }

    case 'reset':
      return { config, changed: false, view: 'reset' };

    case 'help':
      return { config, changed: false, view: 'help' };

    default:
      return { config, changed: false, view: 'help' };
  }
}

/** The lines the `help` view draws. Data, so the renderer stays dumb. */
export const HELP_LINES: readonly (readonly [string, string])[] = [
  ['/wait', 'show this room’s status'],
  ['/wait on | off', 'enable or disable it entirely'],
  ['/wait scene garden|aquarium', 'switch to scene mode, pick the scene'],
  ['/wait game tetris|2048|word', 'switch to game mode, pick the game'],
  ['/wait delay <seconds>', 'how long before it opens (0 = at once)'],
  ['/wait spinner on|off', 'write a status line into the spinner'],
  ['/wait keep on|off', 'stay open after the turn ends'],
  ['/wait page <url> | off', 'open a page in the browser, once a session'],
  ['/wait reset', 'clear game and scene progress'],
  ['/wait help', 'this list'],
];
