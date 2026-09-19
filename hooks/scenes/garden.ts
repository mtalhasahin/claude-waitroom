/**
 * Garden — one completed wait grows one flower.  [PURE]
 *
 * Nothing here instructs, counts down or asks for anything. The flowers that
 * were already grown stand faded; the one this wait is growing opens over the
 * turn's own length, so the wait reads as something arriving rather than
 * something being spent.
 */

import { MUTED, animate, circle, elapsedBar, ellipse, line, rect, svg, text } from '../render/svg';

/** After this many flowers the row starts over, so the bed never overflows. */
export const ROW = 10;

export type GardenInput = {
  /** Flowers grown so far, across every session. */
  flowers: number;
  /** How wide the drawing may be, in CSS pixels. */
  width: number;
};

const SKY = '#eaf2f6';
const SOIL = '#d8cfc0';
const STEM = '#6f9c5c';
const PETALS = ['#e8a0b4', '#f0c674', '#c9a0e8', '#87bde0', '#e89b7a'];

/** The alt text, which is required and is the whole drawing on a surface without `Svg`. */
export function gardenAlt(flowers: number): string {
  const grown = flowers % ROW;
  const plural = grown === 1 ? 'flower' : 'flowers';
  const rows = Math.floor(flowers / ROW);
  const bed = rows > 0 ? `, ${rows} bed${rows === 1 ? '' : 's'} finished before it` : '';
  return `A garden with ${grown} ${plural}${bed}; the next one is growing.`;
}

/** One flower, drawn whole and still. `fade` dims the ones grown earlier. */
function flower(x: number, base: number, index: number, fade: number): string {
  const color = PETALS[index % PETALS.length] as string;
  const height = 26 + ((index * 7) % 11);
  const top = base - height;
  const petals: string[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    petals.push(
      ellipse({
        cx: x + Math.cos(angle) * 5,
        cy: top + Math.sin(angle) * 5,
        rx: 4.2,
        ry: 4.2,
        fill: color,
        opacity: fade,
      }),
    );
  }
  return (
    line({ x1: x, y1: base, x2: x, y2: top, stroke: STEM, 'stroke-width': 1.6, opacity: fade }) +
    ellipse({ cx: x - 4, cy: base - height * 0.45, rx: 4, ry: 2.2, fill: STEM, opacity: fade * 0.9 }) +
    ellipse({ cx: x + 4, cy: base - height * 0.65, rx: 4, ry: 2.2, fill: STEM, opacity: fade * 0.9 }) +
    petals.join('') +
    circle({ cx: x, cy: top, r: 2.6, fill: '#fff6d8', opacity: fade })
  );
}

/**
 * The flower this wait is growing: seed, then stem, then bloom, over `dur`.
 *
 * Every piece animates its own attributes — there is no group to scale, so the
 * stem grows by moving `y2` and the petals open by growing their radii.
 */
function growing(x: number, base: number, index: number, dur: number): string {
  const color = PETALS[index % PETALS.length] as string;
  const height = 30;
  const top = base - height;
  const petals: string[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    petals.push(
      ellipse(
        { cx: x + Math.cos(angle) * 5, cy: top + Math.sin(angle) * 5, rx: 0, ry: 0, fill: color },
        animate({ attributeName: 'rx', values: '0;0;4.2', keyTimes: '0;0.55;1', dur: `${dur}s`, repeatCount: '1', fill: 'freeze' }) +
          animate({ attributeName: 'ry', values: '0;0;4.2', keyTimes: '0;0.55;1', dur: `${dur}s`, repeatCount: '1', fill: 'freeze' }),
      ),
    );
  }
  return (
    circle({ cx: x, cy: base - 1, r: 2, fill: '#9c8468' }) +
    line(
      { x1: x, y1: base, x2: x, y2: base, stroke: STEM, 'stroke-width': 1.6 },
      animate({ attributeName: 'y2', values: `${base};${top}`, keyTimes: '0;1', dur: `${dur * 0.6}s`, repeatCount: '1', fill: 'freeze' }),
    ) +
    petals.join('') +
    circle(
      { cx: x, cy: top, r: 0, fill: '#fff6d8' },
      animate({ attributeName: 'r', values: '0;0;2.6', keyTimes: '0;0.6;1', dur: `${dur}s`, repeatCount: '1', fill: 'freeze' }),
    )
  );
}

/** A few clouds drifting across, so a long wait still has something moving in it. */
function cloud(x: number, y: number, scale: number, dur: number, width: number): string {
  const drift = animate({ attributeName: 'cx', values: `${x};${width + 40}`, dur: `${dur}s`, repeatCount: 'indefinite' });
  return (
    ellipse({ cx: x, cy: y, rx: 14 * scale, ry: 6 * scale, fill: '#ffffff', opacity: 0.75 }, drift) +
    ellipse(
      { cx: x + 10 * scale, cy: y + 2 * scale, rx: 10 * scale, ry: 5 * scale, fill: '#ffffff', opacity: 0.65 },
      animate({ attributeName: 'cx', values: `${x + 10 * scale};${width + 50}`, dur: `${dur}s`, repeatCount: 'indefinite' }),
    )
  );
}

export function gardenSvg(input: GardenInput): string {
  const width = Math.max(240, input.width);
  const height = 150;
  const base = height - 26;
  const grown = input.flowers % ROW;
  const beds = Math.floor(input.flowers / ROW);

  const margin = 26;
  const gap = (width - margin * 2) / ROW;
  const spot = (i: number) => margin + gap * i + gap / 2;

  const body =
    rect({ x: 0, y: 0, width, height, fill: SKY, rx: 6 }) +
    cloud(width * 0.15, 26, 1, 46, width) +
    cloud(width * 0.55, 42, 0.7, 62, width) +
    rect({ x: 0, y: base, width, height: height - base, fill: SOIL, rx: 0 }) +
    line({ x1: 0, y1: base, x2: width, y2: base, stroke: '#c3b7a4', 'stroke-width': 1 }) +
    Array.from({ length: grown }, (_unused, i) => flower(spot(i), base, i + beds * ROW, 0.55)).join('') +
    growing(spot(grown), base, grown + beds * ROW, 24) +
    text(beds > 0 ? `${input.flowers} grown` : `${grown} grown`, {
      x: width - 10,
      y: 16,
      'text-anchor': 'end',
      'font-size': 9,
      fill: MUTED,
    }) +
    elapsedBar(margin, height - 8, width - margin * 2, 60);

  return svg(width, height, gardenAlt(input.flowers), body);
}

/** What the scene looks like drawn as text, for a surface with no `Svg`. */
export function gardenText(flowers: number): string[] {
  const grown = flowers % ROW;
  return [
    ' '.repeat(grown * 2) + '.',
    Array.from({ length: grown }, () => '❀ ').join('') + '·',
    '▔'.repeat(Math.max(2, ROW * 2)),
    `${flowers} grown`,
  ];
}
