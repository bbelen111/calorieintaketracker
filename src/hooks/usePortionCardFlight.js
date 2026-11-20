import { useLayoutEffect, useRef } from 'react';
import {
  clearPortionOrigin,
  flyCard,
  peekPortionOrigin,
} from '../utils/visuals/portionTransition';
import { prefersReducedMotion } from '../utils/visuals/motionPreference';

/**
 * Drives the Food Portion modal's shared-element transition: when the modal
 * opens from a tapped Food Search item card, a clone of the modal's top card
 * flies in from that card's position, and flies back to it on close.
 *
 * Does nothing when the modal was opened some other way (no recorded origin),
 * under `prefers-reduced-motion`, or where the Web Animations API is missing - in
 * all of which the card is simply there.
 *
 * Layout effects, not effects: the real card must be hidden *before* the first
 * paint or it would flash at its resting place for a frame before the clone takes
 * over. No React state is written, so the flight never re-renders anything.
 *
 * @param {object} args
 * @param {boolean} args.isOpen
 * @param {boolean} args.isClosing
 * @param {{ current: HTMLElement | null }} args.cardRef the modal's top card
 * @param {{ current: boolean }} [args.skipReturnRef] set true to skip the return
 *   flight (e.g. "Log & exit", where the list the card would fly back to is
 *   closing too)
 */
export const usePortionCardFlight = ({
  isOpen,
  isClosing,
  cardRef,
  skipReturnRef,
}) => {
  const originRef = useRef(null);
  const cancelEnterRef = useRef(null);

  // Entering
  useLayoutEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    if (skipReturnRef) {
      skipReturnRef.current = false;
    }

    originRef.current = peekPortionOrigin();
    if (!originRef.current || prefersReducedMotion()) {
      return undefined;
    }

    cancelEnterRef.current = flyCard({
      card: cardRef.current,
      from: originRef.current,
    });
    return () => {
      cancelEnterRef.current?.();
      cancelEnterRef.current = null;
    };
  }, [isOpen, cardRef, skipReturnRef]);

  // Leaving
  useLayoutEffect(() => {
    if (!isClosing) {
      return undefined;
    }
    // Closed while still flying in: end that flight first so only one clone exists.
    cancelEnterRef.current?.();
    cancelEnterRef.current = null;

    const origin = originRef.current;
    if (!origin || skipReturnRef?.current || prefersReducedMotion()) {
      clearPortionOrigin();
      return undefined;
    }

    const cancelFlight = flyCard({
      card: cardRef.current,
      to: origin,
      durationMs: 260,
    });
    clearPortionOrigin();
    return cancelFlight;
  }, [isClosing, cardRef, skipReturnRef]);
};
