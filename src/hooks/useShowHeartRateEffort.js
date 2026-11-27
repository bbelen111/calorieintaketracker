import { useState } from 'react';

/**
 * Whether a cardio / training form offers the "Intensity | Average Heart Rate"
 * choice. With heart-rate tracking off it is hidden, except for a session that
 * already uses a heart rate: then it stays for as long as the form is open, so
 * the value can be seen and edited, and switching to Intensity can be undone.
 *
 * @param {object} params
 * @param {boolean} params.isOpen
 * @param {boolean} params.isClosing
 * @param {boolean} params.usesHeartRate - the draft's effort type is heart rate
 * @param {boolean} params.trackingEnabled
 * @returns {boolean}
 */
export const useShowHeartRateEffort = ({
  isOpen,
  isClosing,
  usesHeartRate,
  trackingEnabled,
}) => {
  const [hasUsedHeartRate, setHasUsedHeartRate] = useState(usesHeartRate);

  // Latched during render (not in an effect) so the choice never blinks out.
  if (isOpen && usesHeartRate && !hasUsedHeartRate) {
    setHasUsedHeartRate(true);
  } else if (!isOpen && !isClosing && hasUsedHeartRate) {
    setHasUsedHeartRate(false);
  }

  return trackingEnabled || usesHeartRate || hasUsedHeartRate;
};
