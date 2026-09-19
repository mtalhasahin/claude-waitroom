import { describe, expect, test } from 'claude-code/testing';

import type { RenderElement, RenderSurface } from 'claude-code';

/**
 * Does the pane's tree actually draw?
 *
 * The pure tests above prove the rules; these prove the shell. They run the
 * real `ui.render` chain over the loaded plugin, which is the only way to
 * catch a tree the surface refuses — a refused tree is not an error, it just
 * silently draws the engine's own, which on a pane is nothing at all.
 */

const paneProps = (bodyColumns = 52) => ({
  title: 'Waitroom',
  isFocused: false,
  bodyColumns,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 20, isAtStart: true, isAtEnd: true },
  view: {},
});

/** Walks a drawn tree and lists the element names in it. */
function namesIn(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  const record = node as Record<string, unknown>;
  const name = record['type'] ?? record['name'] ?? record['element'];
  if (typeof name === 'string') out.push(name);
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) for (const child of value) namesIn(child, out);
    else if (value && typeof value === 'object') namesIn(value, out);
  }
  return out;
}

const SURFACES: RenderSurface[] = ['desktop', 'terminal', 'vscode', 'mobile'];

describe('the pane draws', () => {
  for (const surface of SURFACES) {
    test(`a tree comes back on ${surface}`, async ($) => {
      const drawn: RenderElement = await $.ui.render({
        component: 'Pane',
        surface,
        requestId: 'waitroom',
        props: paneProps(),
      });
      expect(drawn).not.toBe(undefined);
      expect(drawn).not.toBe(null);
    });
  }

  test('the desktop tree holds an Svg, which is the whole point of the pane', async ($) => {
    const drawn = await $.ui.render({
      component: 'Pane',
      surface: 'desktop',
      requestId: 'waitroom',
      props: paneProps(),
    });
    expect(namesIn(drawn)).toContain('Svg');
  });

  test('the terminal tree holds Text rather than Svg', async ($) => {
    const drawn = await $.ui.render({
      component: 'Pane',
      surface: 'terminal',
      requestId: 'waitroom',
      props: paneProps(),
    });
    const names = namesIn(drawn);
    expect(names).toContain('Text');
    expect(names).not.toContain('Svg');
  });

  test('a pane that is not ours is left to whoever owns it', async ($, on) => {
    // Nothing sits beneath the plugins in a test, so the pass-through this
    // asserts needs a floor to land on.
    on('ui.render', { component: 'Pane' }, ($$, e) => {
      const { Text } = $$.ui.resolve(e);
      return Text({ children: `owned by ${e.requestId}` });
    });

    const drawn = await $.ui.render({
      component: 'Pane',
      surface: 'desktop',
      requestId: 'somebody-else',
      props: paneProps(),
    });
    const names = namesIn(drawn);
    expect(names).not.toContain('Svg');
    expect(names).toContain('Text');
  });

  test('a narrow pane still draws', async ($) => {
    const drawn = await $.ui.render({
      component: 'Pane',
      surface: 'desktop',
      requestId: 'waitroom',
      props: paneProps(20),
    });
    expect(namesIn(drawn)).toContain('Svg');
  });
});

describe('the spinner line', () => {
  test('our line reaches the props the surface draws', async ($, on) => {
    let seen: string | null = null;
    on('ui.render', { component: 'Spinner' }, ($$, e) => {
      seen = e.props.message;
      const { Text } = $$.ui.resolve(e);
      return Text({ children: e.props.message ?? e.props.word });
    });

    await $.ui.render({
      component: 'Spinner',
      surface: 'desktop',
      requestId: 'main',
      props: { word: 'Sauteing', message: null, mode: 'responding' },
    });

    // The scene is the default, so the line counts flowers rather than moves.
    expect(seen).not.toBe(null);
    expect(String(seen)).toContain('flowers');
  });
});

/** What the engine fills in when the person types a command. */
const asTyped = {
  origin: { kind: 'composer' } as const,
  presentation: { isFullscreen: false, columns: 100 },
};

describe('mobile', () => {
  test('the Word board draws there, without the text field mobile has no element for', async ($) => {
    await $.ui.render({
      component: 'Pane',
      surface: 'desktop',
      requestId: 'waitroom',
      props: paneProps(),
    });

    // Switch to Word, which is the only mode that wants an `Input`.
    await $.command.run({ command: 'wait', args: 'game word', ...asTyped });

    const drawn = await $.ui.render({
      component: 'Pane',
      surface: 'mobile',
      requestId: 'waitroom',
      props: paneProps(),
    });

    const names = namesIn(drawn);
    expect(names).toContain('Svg');
    expect(names).not.toContain('Input');

    // And the surfaces that do have one still draw it.
    const onDesktop = await $.ui.render({
      component: 'Pane',
      surface: 'desktop',
      requestId: 'waitroom',
      props: paneProps(),
    });
    expect(namesIn(onDesktop)).toContain('Input');

    await $.command.run({ command: 'wait', args: 'scene garden', ...asTyped });
  });
});
