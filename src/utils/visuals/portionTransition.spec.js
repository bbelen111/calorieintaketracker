// UI tier (jsdom): `flyCard` manipulates real DOM, which the Node tier cannot.
// jsdom has no Web Animations API, so `window.Element.prototype.animate` is stubbed with
// a controllable fake - the contract under test is the clone/visibility
// bookkeeping, not the browser's interpolation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flyCard } from './portionTransition';

const rect = (top, left, width, height) => ({
  top,
  left,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

let lastAnimation;

beforeEach(() => {
  lastAnimation = null;
  window.Element.prototype.animate = vi.fn(function animate(frames, options) {
    lastAnimation = {
      frames,
      options,
      cancel: vi.fn(),
      onfinish: null,
    };
    return lastAnimation;
  });
});

afterEach(() => {
  delete window.Element.prototype.animate;
  document.body.innerHTML = '';
});

const makeCard = (box = rect(120, 30, 330, 68)) => {
  const card = document.createElement('div');
  card.id = 'portion-card';
  card.textContent = 'Abalone';
  card.getBoundingClientRect = () => box;
  document.body.appendChild(card);
  return card;
};

const clones = () =>
  [...document.body.children].filter(
    (el) => el.getAttribute('aria-hidden') === 'true'
  );

describe('flyCard', () => {
  it('flies a clone in from the origin and hides the real card meanwhile', () => {
    const card = makeCard();
    flyCard({ card, from: rect(284, 14, 348, 68) });

    expect(card.style.visibility).toBe('hidden');
    expect(clones()).toHaveLength(1);

    const [clone] = clones();
    expect(clone.id).toBe(''); // never a duplicate id in the document
    expect(clone.textContent).toBe('Abalone');
    expect(clone.style.position).toBe('fixed');
    expect(clone.style.pointerEvents).toBe('none');
    expect(clone.style.top).toBe('120px');
    expect(clone.style.left).toBe('30px');

    // Entering: starts displaced onto the origin, ends untransformed.
    const { frames } = lastAnimation;
    expect(frames[0].transform).toMatch(/^translate\(-16px, 164px\)/);
    expect(frames[frames.length - 1].transform).toBe('none');
  });

  it('lands: removes the clone and shows the real card again', () => {
    const card = makeCard();
    card.style.visibility = 'visible';
    flyCard({ card, from: rect(284, 14, 348, 68) });

    lastAnimation.onfinish();

    expect(clones()).toHaveLength(0);
    expect(card.style.visibility).toBe('visible');
  });

  it('leaving keeps the real card hidden (the sheet is fading out)', () => {
    const card = makeCard();
    const cancel = flyCard({ card, to: rect(284, 14, 348, 68) });

    // Leaving: starts untransformed, ends displaced onto the origin.
    const { frames } = lastAnimation;
    expect(frames[0].transform).toBe('none');
    expect(frames[frames.length - 1].transform).toMatch(/translate\(/);

    cancel();
    expect(clones()).toHaveLength(0);
    expect(card.style.visibility).toBe('hidden');
  });

  it('cancel ends an entering flight immediately and is idempotent', () => {
    const card = makeCard();
    const cancel = flyCard({ card, from: rect(284, 14, 348, 68) });

    cancel();
    cancel();

    expect(lastAnimation.cancel).toHaveBeenCalledTimes(1);
    expect(clones()).toHaveLength(0);
    expect(card.style.visibility).toBe('');
  });

  it('does nothing without an origin, a card, or a measurable card', () => {
    const card = makeCard();
    expect(flyCard({ card })).toBeTypeOf('function');
    expect(flyCard({ card: null, from: rect(1, 1, 1, 1) })).toBeTypeOf(
      'function'
    );
    const empty = makeCard(rect(0, 0, 0, 0));
    flyCard({ card: empty, from: rect(1, 1, 1, 1) });

    expect(clones()).toHaveLength(0);
    expect(card.style.visibility).toBe('');
    expect(empty.style.visibility).toBe('');
  });

  it('degrades to "the card just shows" where the Web Animations API is missing', () => {
    delete window.Element.prototype.animate;
    const card = makeCard();
    const cancel = flyCard({ card, from: rect(284, 14, 348, 68) });

    expect(clones()).toHaveLength(0);
    expect(card.style.visibility).toBe('');
    expect(() => cancel()).not.toThrow();
  });
});
