/**
 * SVG helpers that survive the surface's scrub.  [PURE]
 *
 * Two rules shape everything here:
 *
 * 1. No `<g>`. Grouping is not relied on anywhere, so every element carries its
 *    own absolute position and its own `animateTransform` where it needs one.
 *    (Some builds do keep `<g>`; not depending on it costs nothing and removes
 *    a whole class of "why is the scene blank" from the equation.)
 * 2. No script and no event-handler attributes. They are stripped anyway, and
 *    the plugin has no use for them: motion is SMIL, which runs by itself with
 *    no re-render, and input comes from sibling `Button` elements.
 */

/** The palette, chosen to read on both a light and a dark pane. */
export const INK = '#1f2933';
export const MUTED = '#8b97a6';
export const PAPER = '#f7f5ef';

/** Escapes the five characters that would otherwise close a tag or an attribute. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rounds to two decimals so the generated document stays small and readable. */
export const n = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

export type Attrs = Record<string, string | number | undefined>;

function attrs(map: Attrs): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    parts.push(`${key}="${esc(typeof value === 'number' ? n(value) : value)}"`);
  }
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}

/** A leaf element, or one wrapping SMIL children. */
export function tag(name: string, map: Attrs, children = ''): string {
  return children === '' ? `<${name}${attrs(map)}/>` : `<${name}${attrs(map)}>${children}</${name}>`;
}

export const rect = (map: Attrs, children = ''): string => tag('rect', map, children);
export const circle = (map: Attrs, children = ''): string => tag('circle', map, children);
export const ellipse = (map: Attrs, children = ''): string => tag('ellipse', map, children);
export const path = (map: Attrs, children = ''): string => tag('path', map, children);
export const line = (map: Attrs, children = ''): string => tag('line', map, children);
export const polygon = (map: Attrs, children = ''): string => tag('polygon', map, children);

/** A text run. The content is escaped; `text-anchor` defaults to the middle. */
export function text(content: string, map: Attrs, children = ''): string {
  const body = esc(content) + children;
  return `<text${attrs({ 'text-anchor': 'middle', 'font-family': 'ui-sans-serif, system-ui, sans-serif', ...map })}>${body}</text>`;
}

/** `<animate>`, for an attribute that changes over time. */
export function animate(map: Attrs): string {
  return tag('animate', { repeatCount: 'indefinite', ...map });
}

/**
 * `<animateTransform>`, placed directly on the shape it moves.
 *
 * With no `<g>` to hang a group transform on, a shape that must move carries
 * its own; `from`/`to` are in the shape's own user units.
 */
export function animateTransform(map: Attrs): string {
  return tag('animateTransform', {
    attributeName: 'transform',
    type: 'translate',
    additive: 'sum',
    repeatCount: 'indefinite',
    ...map,
  });
}

/** Wraps a body in an `<svg>` root with a viewBox and an accessible title. */
export function svg(width: number, height: number, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}">` +
    `<title>${esc(title)}</title>${body}</svg>`
  );
}

/** The document limit the surface enforces, so a scene can check itself. */
export const MAX_SOURCE = 131072;

/**
 * A thin count-up bar: how long this wait has been going.
 *
 * It counts up rather than down on purpose — a countdown to a moment nobody
 * can predict reads as a broken promise, while elapsed time just says "still
 * going". The bar grows by SMIL, so nothing re-renders while it moves.
 */
export function elapsedBar(x: number, y: number, width: number, seconds: number): string {
  const span = Math.max(30, seconds);
  return (
    rect({ x, y, width, height: 2, rx: 1, fill: MUTED, opacity: 0.25 }) +
    rect(
      { x, y, width: 0, height: 2, rx: 1, fill: MUTED, opacity: 0.6 },
      animate({ attributeName: 'width', values: `0;${n(width)}`, dur: `${n(span)}s`, repeatCount: '1', fill: 'freeze' }),
    )
  );
}
