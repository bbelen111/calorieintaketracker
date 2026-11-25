import React, { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotionPreference } from '../../../hooks/useMotionMode';

const HEIGHT_TRANSITION = 'height 260ms cubic-bezier(0.32, 0.72, 0, 1)';
// While the height moves, hide only what spills past the top and bottom edges;
// the negative sides leave shadows and focus rings whole.
const CLIP_WHILE_MOVING = 'inset(0 -24px)';

/**
 * Wraps a region whose content changes size (a mode switch swapping one set of
 * fields for another) and glides to the new height instead of snapping, so
 * whatever sits below - and a centred modal around it - moves with it.
 *
 * Content that changes size for any reason is followed (ResizeObserver, no
 * React state). Pass `swapKey` (the mode) to also fade the new content in when
 * it changes; nothing fades on first mount. Reduced / off motion snaps.
 */
export const SmoothHeight = ({ swapKey, children }) => {
  const reduceMotion = useReducedMotionPreference();
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  const [track, setTrack] = useState({ key: swapKey, hasSwapped: false });
  if (track.key !== swapKey) {
    setTrack({ key: swapKey, hasSwapped: true });
  }

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content || typeof ResizeObserver !== 'function') {
      return undefined;
    }

    let height = null;
    const observer = new ResizeObserver(() => {
      // `offsetHeight` ignores the modal's entrance scale.
      const next = content.offsetHeight;
      if (next === height) return;
      // The first reading only pins the starting height: nothing moves yet.
      if (height !== null && !reduceMotion) {
        frame.style.clipPath = CLIP_WHILE_MOVING;
      }
      height = next;
      frame.style.height = `${next}px`;
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
      frame.style.height = '';
      frame.style.clipPath = '';
    };
  }, [reduceMotion]);

  return (
    <div
      ref={frameRef}
      style={{ transition: reduceMotion ? undefined : HEIGHT_TRANSITION }}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === 'height'
        ) {
          event.currentTarget.style.clipPath = '';
        }
      }}
    >
      {/* `flow-root` keeps child margins inside the measured height. */}
      <div ref={contentRef} className="flow-root">
        <div
          key={swapKey}
          className={track.hasSwapped ? 'header-stat-in' : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
