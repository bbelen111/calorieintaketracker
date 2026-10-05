import { useCallback, useRef } from 'react';
import { registerCarouselDragVarSink } from '../utils/visuals/carouselDragVars';

/**
 * Register an element as a sink for the swipe shell's live drag variables
 * (`--screen-drag-progress` / `--screen-drag-duration`), returning a stable ref
 * callback to attach to the element.
 *
 * The variables are written onto the element itself rather than `:root`, so a
 * drag frame only invalidates the chrome's own small subtree instead of the whole
 * document (see utils/visuals/carouselDragVars.js). React never owns the element's
 * transform/transition — the shell writes them imperatively — so re-renders never
 * clobber the live values.
 */
export const useCarouselDragVarSink = () => {
  const unregisterRef = useRef(null);

  // Stable identity (`[]`) so React never detaches/reattaches the sink on
  // re-render.
  return useCallback((node) => {
    if (unregisterRef.current) {
      unregisterRef.current();
      unregisterRef.current = null;
    }

    if (node) {
      unregisterRef.current = registerCarouselDragVarSink(node);
    }
  }, []);
};
