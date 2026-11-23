import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotionPreference } from '../../../../hooks/useMotionMode';

// An option that only exists while its parent switch is on. The old
// `.settings-reveal` fade-only mount still let the sections below jump by the
// option's full height in one frame, which reads as a pop-in. This animates
// the wrapper's height together with the fade, so the layout glides in both
// directions. `initial={false}` keeps a reveal that is already open when the
// page mounts from animating; reduced/off motion swaps instantly.
//
// Shared by the Settings pages that own conditional rows (Metabolic
// Adjustments, Notifications) so their reveals move the same way.
export const SettingsReveal = ({ open, className = '', children }) => {
  const reduceMotion = useReducedMotionPreference();

  if (reduceMotion) {
    return open ? <div className={className}>{children}</div> : null;
  }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="settings-reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
            opacity: { duration: 0.18, ease: 'easeOut' },
          }}
          style={{ overflow: 'hidden' }}
        >
          <div className={className}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
