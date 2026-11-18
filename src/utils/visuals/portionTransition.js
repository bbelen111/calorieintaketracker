// Shared-element ("hero") transition between a Food Search item card and the
// Food Portion modal's top card.
//
// Two small, framework-free pieces:
//
//  1. An origin registry. The item card that was tapped records its on-screen rect
//     right before the portion modal is opened; the modal reads it when it opens.
//     The tap and the modal live several components apart (list panel -> search
//     modal -> orchestrator -> portion modal), so a short-lived module value beats
//     threading a rect through every layer. It is deliberately age-limited and
//     read non-destructively, so a stale rect from an earlier tap can never be
//     picked up by a modal opened by some other route (editing a logged entry).
//
//  2. `flyCard`: animates a *clone* of the card between its resting place and the
//     origin rect. A clone in a fixed layer, not the card itself, because the
//     modal sheet scrolls (`overflow-y-auto`), which would clip anything flying in
//     from outside it. Only `transform` and `box-shadow` are animated, via the Web
//     Animations API, so it runs on the compositor and no React state is involved.

const ORIGIN_MAX_AGE_MS = 5000;
const FLIGHT_Z_INDEX = '2500';
const FLIGHT_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

let pendingOrigin = null;

const toPlainRect = ({ top, left, width, height }) => ({
  top,
  left,
  width,
  height,
});

/** Record where the tapped item card is, just before the portion modal opens. */
export const rememberPortionOrigin = (element) => {
  if (typeof element?.getBoundingClientRect !== 'function') {
    return;
  }
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    return;
  }
  pendingOrigin = { rect: toPlainRect(rect), at: Date.now() };
};

/** The recorded origin if it is recent enough, else `null`. Non-destructive. */
export const peekPortionOrigin = () => {
  if (!pendingOrigin) {
    return null;
  }
  if (Date.now() - pendingOrigin.at > ORIGIN_MAX_AGE_MS) {
    pendingOrigin = null;
    return null;
  }
  return pendingOrigin.rect;
};

export const clearPortionOrigin = () => {
  pendingOrigin = null;
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `translate + scale` that maps a box at `rest` onto the box at `other`. */
export const buildFlightTransform = (rest, other) => {
  const scaleX = rest.width > 0 ? other.width / rest.width : 1;
  const scaleY = rest.height > 0 ? other.height / rest.height : 1;
  return `translate(${other.left - rest.left}px, ${other.top - rest.top}px) scale(${scaleX}, ${scaleY})`;
};

/**
 * Fly a clone of `card` between the origin rect and the card's resting place.
 *
 *  - `from` (entering): the clone starts over the origin card and lands on the
 *    real card, which is hidden until it arrives.
 *  - `to` (leaving): the clone departs from the real card's place and lands on the
 *    origin rect; the real card stays hidden (the sheet is fading out).
 *
 * Returns a cancel function that ends the flight at once (removes the clone and,
 * for an entering flight, shows the real card). Safe to call repeatedly. Where
 * the Web Animations API is missing, it does nothing and the card just shows.
 */
export const flyCard = ({ card, from = null, to = null, durationMs = 440 }) => {
  const other = from || to;
  if (!card || !other || typeof card.animate !== 'function') {
    return () => {};
  }

  const rest = card.getBoundingClientRect();
  if (!(rest.width > 0) || !(rest.height > 0)) {
    return () => {};
  }

  const ghost = card.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed',
    top: `${rest.top}px`,
    left: `${rest.left}px`,
    width: `${rest.width}px`,
    height: `${rest.height}px`,
    margin: '0',
    zIndex: FLIGHT_Z_INDEX,
    pointerEvents: 'none',
    transformOrigin: '0 0',
    visibility: 'visible',
  });
  document.body.appendChild(ghost);

  const previousVisibility = card.style.visibility;
  card.style.visibility = 'hidden';

  const away = buildFlightTransform(rest, other);
  const lifted = '0 18px 36px -14px rgb(var(--overlay-base) / 0.55)';
  const flat = '0 0 0 0 rgb(var(--overlay-base) / 0)';
  const frames = from
    ? [
        { transform: away, boxShadow: flat },
        { boxShadow: lifted, offset: 0.55 },
        { transform: 'none', boxShadow: flat },
      ]
    : [
        { transform: 'none', boxShadow: flat },
        { boxShadow: lifted, offset: 0.45 },
        { transform: away, boxShadow: flat },
      ];

  const animation = ghost.animate(frames, {
    duration: durationMs,
    easing: FLIGHT_EASING,
    fill: 'both',
  });

  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    animation.cancel();
    ghost.remove();
    if (from) {
      card.style.visibility = previousVisibility;
    }
  };
  animation.onfinish = finish;

  return finish;
};
