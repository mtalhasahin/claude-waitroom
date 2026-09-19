/**
 * Aquarium — fish swim while the turn runs.  [PURE]
 *
 * Every fish carries its own `animateTransform`, because there is no `<g>` to
 * move a school with. The motion is SMIL, so the tank keeps swimming with no
 * re-render, no timer and no cost.
 */

import { MUTED, animate, animateTransform, circle, elapsedBar, ellipse, polygon, rect, svg, text } from '../render/svg';

/**
 * Completed waits at which a new species joins the tank.
 *
 * The first two arrive quickly so the tank is never empty for long; the rest
 * are spaced out, which is what makes the later ones worth noticing.
 */
export const THRESHOLDS: readonly number[] = [0, 5, 20, 60, 120, 240];

export type AquariumInput = {
  /** Completed waits, which is what unlocks species. */
  waits: number;
  width: number;
};

const WATER = '#e2eff5';
const DEEP = '#cfe3ec';
const SAND = '#e5dcc6';
const WEED = '#7aa87c';

const SPECIES = [
  { body: '#e9975a', fin: '#d97b3c', size: 1.0, depth: 0.42, dur: 21 },
  { body: '#6fa8c9', fin: '#4f88ab', size: 0.8, depth: 0.62, dur: 27 },
  { body: '#d8748f', fin: '#bb556f', size: 0.7, depth: 0.3, dur: 17 },
  { body: '#e0c15c', fin: '#c4a33c', size: 1.15, depth: 0.55, dur: 32 },
  { body: '#8f7fc4', fin: '#7060ab', size: 0.6, depth: 0.72, dur: 14 },
  { body: '#5fbaa0', fin: '#3e9b82', size: 0.95, depth: 0.5, dur: 24 },
];

/** How many species the tank has earned at this many completed waits. */
export function speciesAt(waits: number): number {
  return THRESHOLDS.filter((t) => waits >= t).length;
}

/** Completed waits still needed for the next species, or null once they are all in. */
export function nextSpeciesIn(waits: number): number | null {
  const next = THRESHOLDS.find((t) => waits < t);
  return next === undefined ? null : next - waits;
}

export function aquariumAlt(waits: number): string {
  const fish = speciesAt(waits);
  const more = nextSpeciesIn(waits);
  const tail = more === null ? 'every species has arrived' : `${more} more wait${more === 1 ? '' : 's'} until the next species`;
  return `An aquarium with ${fish} fish swimming, seaweed swaying and bubbles rising; ${tail}.`;
}

/**
 * One fish, swimming left to right and starting again off the left edge.
 *
 * The shape is drawn around the origin and carried across by its own
 * translate, so nothing depends on a parent transform.
 */
function fish(index: number, width: number, height: number): string {
  const spec = SPECIES[index % SPECIES.length] as (typeof SPECIES)[number];
  const s = spec.size;
  const y = height * spec.depth;
  const begin = -(index * 3.4) % spec.dur;
  const swim = animateTransform({
    values: `${-40 * s} 0;${width + 40 * s} 0`,
    dur: `${spec.dur}s`,
    begin: `${begin}s`,
  });
  // The tail flicks by wobbling the whole shape a little; same trick, own transform.
  const bob = animateTransform({
    values: '0 -2;0 2;0 -2',
    dur: `${2.6 + (index % 3) * 0.4}s`,
    begin: `${begin}s`,
  });

  return (
    ellipse({ cx: 0, cy: y, rx: 11 * s, ry: 6 * s, fill: spec.body }, swim + bob) +
    polygon({ points: `${-11 * s},${y} ${-19 * s},${y - 6 * s} ${-19 * s},${y + 6 * s}`, fill: spec.fin }, swim + bob) +
    circle({ cx: 5 * s, cy: y - 1.6 * s, r: 1.3 * s, fill: '#22303a' }, swim + bob)
  );
}

/** A frond of seaweed that sways in place. */
function weed(x: number, height: number, tall: number, dur: number): string {
  const base = height - 14;
  return ellipse(
    { cx: x, cy: base - tall / 2, rx: 3, ry: tall / 2, fill: WEED, opacity: 0.75 },
    animateTransform({ type: 'rotate', values: `-5 ${x} ${base};5 ${x} ${base};-5 ${x} ${base}`, dur: `${dur}s` }),
  );
}

/** A bubble rising from the sand and fading near the surface. */
function bubble(x: number, height: number, r: number, dur: number, begin: number): string {
  return circle(
    { cx: x, cy: height - 16, r, fill: '#ffffff', opacity: 0.55 },
    animate({ attributeName: 'cy', values: `${height - 16};10`, dur: `${dur}s`, begin: `${begin}s` }) +
      animate({ attributeName: 'opacity', values: '0.55;0.55;0', dur: `${dur}s`, begin: `${begin}s` }),
  );
}

export function aquariumSvg(input: AquariumInput): string {
  const width = Math.max(240, input.width);
  const height = 150;
  const count = speciesAt(input.waits);

  const body =
    rect({ x: 0, y: 0, width, height, fill: WATER, rx: 6 }) +
    rect({ x: 0, y: height * 0.55, width, height: height * 0.45, fill: DEEP }) +
    weed(width * 0.12, height, 46, 7) +
    weed(width * 0.2, height, 32, 9) +
    weed(width * 0.82, height, 52, 8) +
    weed(width * 0.9, height, 28, 6.5) +
    Array.from({ length: count }, (_unused, i) => fish(i, width, height)).join('') +
    bubble(width * 0.3, height, 2.2, 9, 0) +
    bubble(width * 0.33, height, 1.5, 11, 3) +
    bubble(width * 0.7, height, 1.8, 10, 5.5) +
    rect({ x: 0, y: height - 16, width, height: 16, fill: SAND }) +
    ellipse({ cx: width * 0.45, cy: height - 14, rx: 12, ry: 4, fill: '#d3c8ac' }) +
    text(`${count} species`, { x: width - 10, y: 16, 'text-anchor': 'end', 'font-size': 9, fill: MUTED }) +
    elapsedBar(26, height - 6, width - 52, 60);

  return svg(width, height, aquariumAlt(input.waits), body);
}

/** What the tank looks like drawn as text, for a surface with no `Svg`. */
export function aquariumText(waits: number): string[] {
  const count = speciesAt(waits);
  const more = nextSpeciesIn(waits);
  return [
    '~'.repeat(20),
    Array.from({ length: count }, () => '><> ').join(''),
    '░'.repeat(20),
    more === null ? `${count} species` : `${count} species · ${more} to go`,
  ];
}
