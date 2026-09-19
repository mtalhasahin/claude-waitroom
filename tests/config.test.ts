import { describe, expect, test } from 'claude-code/testing';

import { DEFAULT_CONFIG, HELP_LINES, MAX_DELAY, applyCommand, statusLine, type Config } from '../hooks/core/config';

const base: Config = { ...DEFAULT_CONFIG };
const run = (args: string, from: Config = base) => applyCommand(from, args);

describe('no argument', () => {
  test('reports the status and changes nothing', () => {
    const out = run('');
    expect(out.changed).toBe(false);
    expect(out.config).toBe(base);
    expect(out.toast).toBe(statusLine(base));
  });

  test('surrounding whitespace is the same as nothing', () => {
    expect(run('   ').changed).toBe(false);
    expect(run('   ').toast).toBe(statusLine(base));
  });
});

describe('on and off', () => {
  test('off disables it', () => {
    const out = run('off');
    expect(out.changed).toBe(true);
    expect(out.config.enabled).toBe(false);
  });

  test('on enables it again', () => {
    const out = run('on', { ...base, enabled: false });
    expect(out.changed).toBe(true);
    expect(out.config.enabled).toBe(true);
  });

  test('turning on what is already on changes nothing', () => {
    expect(run('on').changed).toBe(false);
  });

  test('case does not matter', () => {
    expect(run('OFF').config.enabled).toBe(false);
  });
});

describe('scene', () => {
  test('a named scene switches mode and picks it', () => {
    const out = run('scene aquarium');
    expect(out.config.mode).toBe('scene');
    expect(out.config.scene).toBe('aquarium');
  });

  test('with no name it switches mode and keeps the scene', () => {
    const out = run('scene', { ...base, mode: 'game', scene: 'aquarium' });
    expect(out.config.mode).toBe('scene');
    expect(out.config.scene).toBe('aquarium');
  });

  test('an unknown scene asks for help and changes nothing', () => {
    const out = run('scene volcano');
    expect(out.view).toBe('help');
    expect(out.changed).toBe(false);
  });
});

describe('game', () => {
  test('a named game switches mode and picks it', () => {
    const out = run('game tetris');
    expect(out.config.mode).toBe('game');
    expect(out.config.game).toBe('tetris');
  });

  test('every shipped game is accepted', () => {
    for (const name of ['tetris', '2048', 'word']) {
      expect(run(`game ${name}`).config.game).toBe(name);
    }
  });

  test('with no name it switches mode and keeps the game', () => {
    const out = run('game', { ...base, mode: 'scene', game: 'word' });
    expect(out.config.mode).toBe('game');
    expect(out.config.game).toBe('word');
  });

  test('an unknown game asks for help', () => {
    expect(run('game chess').view).toBe('help');
    expect(run('game chess').changed).toBe(false);
  });
});

describe('delay', () => {
  test('a whole number of seconds is taken', () => {
    expect(run('delay 12').config.delay).toBe(12);
  });

  test('zero means at once', () => {
    const out = run('delay 0');
    expect(out.config.delay).toBe(0);
    expect(out.toast).toContain('at once');
  });

  test('a fraction is rounded', () => {
    expect(run('delay 2.6').config.delay).toBe(3);
  });

  test('a missing argument asks for help', () => {
    expect(run('delay').view).toBe('help');
  });

  test('something that is not a number asks for help', () => {
    expect(run('delay soon').view).toBe('help');
    expect(run('delay soon').changed).toBe(false);
  });

  test('a negative delay is refused', () => {
    expect(run('delay -3').view).toBe('help');
  });

  test('an absurd delay is refused rather than parking the pane forever', () => {
    expect(run(`delay ${MAX_DELAY + 1}`).view).toBe('help');
    expect(run(`delay ${MAX_DELAY}`).config.delay).toBe(MAX_DELAY);
  });

  test('infinity is refused', () => {
    expect(run('delay Infinity').view).toBe('help');
  });
});

describe('spinner and keep', () => {
  test('spinner off turns the status line off', () => {
    expect(run('spinner off').config.spinner).toBe(false);
  });

  test('keep on leaves the pane up after the turn', () => {
    expect(run('keep on').config.keepOpen).toBe(true);
  });

  test('true, yes and 1 all read as on', () => {
    for (const word of ['on', 'true', 'yes', '1']) {
      expect(run(`spinner ${word}`, { ...base, spinner: false }).config.spinner).toBe(true);
    }
  });

  test('false, no and 0 all read as off', () => {
    for (const word of ['off', 'false', 'no', '0']) {
      expect(run(`spinner ${word}`).config.spinner).toBe(false);
    }
  });

  test('a missing or unknown flag asks for help', () => {
    expect(run('spinner').view).toBe('help');
    expect(run('spinner maybe').view).toBe('help');
    expect(run('keep sometimes').view).toBe('help');
  });
});

describe('page', () => {
  test('a http or https page is taken', () => {
    expect(run('page https://claude.ai/artifact/abc').config.page).toBe('https://claude.ai/artifact/abc');
    expect(run('page http://localhost:8080/waitroom').config.page).toBe('http://localhost:8080/waitroom');
  });

  test('a local file is taken', () => {
    const url = 'file:///C:/Users/me/claude-waitroom/web/index.html';
    expect(run(`page ${url}`).config.page).toBe(url);
  });

  test('the URL keeps the case it was typed in', () => {
    // Lower-casing the argument, as every other subcommand does, would break
    // any path or query that is case-sensitive.
    const url = 'https://Claude.ai/artifact/NeiY9GN36w9upyL1zV5Wip';
    expect(run(`page ${url}`).config.page).toBe(url);
  });

  test('anything that is not a web page or a file is refused', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'cmd.exe', 'ftp://example.com/x', '/etc/passwd', 'example.com']) {
      const out = run(`page ${bad}`);
      expect(out.view).toBe('help');
      expect(out.changed).toBe(false);
    }
  });

  test('off clears it', () => {
    const withPage = { ...base, page: 'https://example.com/x' };
    expect(run('page off', withPage).config.page).toBe('');
    expect(run('page none', withPage).config.page).toBe('');
  });

  test('with no argument it reports rather than changing anything', () => {
    expect(run('page').changed).toBe(false);
    expect(run('page').toast).toContain('no page');
    expect(run('page', { ...base, page: 'https://example.com/x' }).toast).toContain('https://example.com/x');
  });

  test('the default is empty, so a fresh install starts no process at all', () => {
    expect(DEFAULT_CONFIG.page).toBe('');
  });
});

describe('reset and help', () => {
  test('reset asks for the confirmation view and changes nothing by itself', () => {
    const out = run('reset');
    expect(out.view).toBe('reset');
    expect(out.changed).toBe(false);
  });

  test('help asks for the help view', () => {
    expect(run('help').view).toBe('help');
  });

  test('an unknown argument falls back to help', () => {
    expect(run('wibble').view).toBe('help');
    expect(run('scene garden extra nonsense').config.scene).toBe('garden');
  });

  test('the help text covers every subcommand the parser knows', () => {
    const shown = HELP_LINES.map(([command]) => command).join(' ');
    for (const verb of ['on', 'off', 'scene', 'game', 'delay', 'spinner', 'keep', 'page', 'reset', 'help']) {
      expect(shown).toContain(verb);
    }
  });
});

describe('statusLine', () => {
  test('says so when it is off', () => {
    expect(statusLine({ ...base, enabled: false })).toContain('off');
  });

  test('names the scene in scene mode', () => {
    expect(statusLine({ ...base, mode: 'scene', scene: 'aquarium' })).toContain('aquarium');
  });

  test('names the game in game mode', () => {
    expect(statusLine({ ...base, mode: 'game', game: 'tetris' })).toContain('tetris');
  });

  test('mentions the delay', () => {
    expect(statusLine({ ...base, delay: 7 })).toContain('7s');
    expect(statusLine({ ...base, delay: 0 })).toContain('at once');
  });
});

test('the defaults are the calm ones: scene mode, games opt-in', () => {
  expect(DEFAULT_CONFIG.mode).toBe('scene');
  expect(DEFAULT_CONFIG.enabled).toBe(true);
  expect(DEFAULT_CONFIG.keepOpen).toBe(false);
});
