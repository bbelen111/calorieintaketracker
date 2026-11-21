/**
 * Pulse estimation from a camera photoplethysmography (PPG) signal: the mean
 * red intensity of frames from a fingertip held over the lens + torch. Pure
 * and Node-tested (tests/utils/pulseSignal.test.js); the camera plumbing lives
 * in services/cameraPulse.js.
 *
 * Method: resample to a uniform rate, remove the slow baseline (moving-average
 * detrend), then pick the strongest autocorrelation lag inside the plausible
 * resting range. Autocorrelation is far more robust to the camera's frame
 * jitter and small motion than counting peaks. The normalized autocorrelation
 * at that lag doubles as a quality score; low quality returns no reading
 * rather than a wrong one.
 *
 * EXPERIMENTAL: valid only for a still, seated, resting measurement.
 */

export const PULSE_SAMPLE_RATE_HZ = 30;
export const PULSE_MIN_BPM = 40;
export const PULSE_MAX_BPM = 180;
export const PULSE_MIN_DURATION_SECONDS = 15;
export const PULSE_MIN_QUALITY = 0.5;

/** Linear resample of `{ t (ms), v }` samples onto a uniform grid. */
export const resampleUniform = (samples, rateHz = PULSE_SAMPLE_RATE_HZ) => {
  const points = (Array.isArray(samples) ? samples : [])
    .filter(
      (sample) => Number.isFinite(sample?.t) && Number.isFinite(sample?.v)
    )
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) {
    return [];
  }
  const stepMs = 1000 / rateHz;
  const out = [];
  let cursor = 0;
  for (let t = points[0].t; t <= points[points.length - 1].t; t += stepMs) {
    while (cursor < points.length - 2 && points[cursor + 1].t < t) {
      cursor += 1;
    }
    const a = points[cursor];
    const b = points[cursor + 1];
    const span = b.t - a.t;
    const ratio = span > 0 ? (t - a.t) / span : 0;
    out.push(a.v + (b.v - a.v) * Math.min(Math.max(ratio, 0), 1));
  }
  return out;
};

/** Subtracts a centred moving average (removes the slow DC/baseline drift). */
export const detrend = (values, windowSize) => {
  const half = Math.max(1, Math.floor(windowSize / 2));
  return values.map((value, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(values.length, index + half + 1);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      sum += values[i];
    }
    return value - sum / (end - start);
  });
};

/**
 * Estimates pulse from a PPG trace.
 *
 * @param {Array<{ t: number, v: number }>} samples - t in ms, v = mean red
 * @returns {{ bpm: number|null, quality: number, durationSeconds: number }}
 */
export const estimatePulseFromSignal = (
  samples,
  rateHz = PULSE_SAMPLE_RATE_HZ
) => {
  const uniform = resampleUniform(samples, rateHz);
  const durationSeconds = uniform.length / rateHz;
  if (durationSeconds < PULSE_MIN_DURATION_SECONDS) {
    return { bpm: null, quality: 0, durationSeconds };
  }

  const signal = detrend(uniform, rateHz);
  const mean = signal.reduce((sum, value) => sum + value, 0) / signal.length;
  const centred = signal.map((value) => value - mean);
  const energy = centred.reduce((sum, value) => sum + value * value, 0);
  if (energy <= 0) {
    return { bpm: null, quality: 0, durationSeconds };
  }

  const minLag = Math.floor((60 * rateHz) / PULSE_MAX_BPM);
  const maxLag = Math.ceil((60 * rateHz) / PULSE_MIN_BPM);
  const correlation = (lag) => {
    let sum = 0;
    for (let i = 0; i + lag < centred.length; i += 1) {
      sum += centred[i] * centred[i + lag];
    }
    // Normalize for the shrinking overlap so long lags are not penalized.
    return (sum / energy) * (centred.length / (centred.length - lag));
  };

  let bestLag = -1;
  let bestValue = -Infinity;
  const values = new Map();
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const value = correlation(lag);
    values.set(lag, value);
    if (value > bestValue) {
      bestValue = value;
      bestLag = lag;
    }
  }
  if (bestLag < 0) {
    return { bpm: null, quality: 0, durationSeconds };
  }

  // Prefer the fundamental: a strong peak at half the lag means the "best"
  // lag is a harmonic (two beats).
  const halfLag = Math.round(bestLag / 2);
  if (
    halfLag >= minLag &&
    (values.get(halfLag) ?? -Infinity) > 0.8 * bestValue
  ) {
    bestLag = halfLag;
    bestValue = values.get(halfLag);
  }

  // Parabolic interpolation for a sub-sample lag.
  const left = correlation(bestLag - 1);
  const right = correlation(bestLag + 1);
  const denominator = left - 2 * bestValue + right;
  const offset =
    denominator !== 0
      ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator))
      : 0;
  const refinedLag = bestLag + offset;

  const quality = Math.max(0, Math.min(1, Math.round(bestValue * 100) / 100));
  if (quality < PULSE_MIN_QUALITY) {
    return { bpm: null, quality, durationSeconds };
  }
  const bpm = Math.round((60 * rateHz) / refinedLag);
  if (bpm < PULSE_MIN_BPM || bpm > PULSE_MAX_BPM) {
    return { bpm: null, quality, durationSeconds };
  }
  return { bpm, quality, durationSeconds };
};

/**
 * Is a frame's colour consistent with a fingertip covering a lit lens?
 * (Strongly red-dominant and bright.)
 */
export const isFingerCovering = ({ red, green, blue }) =>
  Number.isFinite(red) &&
  red > 120 &&
  red > (Number(green) || 0) * 1.8 &&
  red > (Number(blue) || 0) * 1.8;
