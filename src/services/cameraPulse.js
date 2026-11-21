/**
 * EXPERIMENTAL camera pulse measurement (photoplethysmography): the user
 * covers the rear camera + torch with a fingertip, and each frame's mean red
 * intensity rises and falls with blood volume. The signal processing is in
 * utils/calculations/pulseSignal.js (pure, tested); this module only owns the
 * camera.
 *
 * Honest limits, surfaced in the UI:
 * - Resting, seated, still only. Motion ruins the signal.
 * - Needs the torch. Android WebView exposes it through the `torch` track
 *   constraint; where a platform does not (some iOS versions), the measurement
 *   relies on ambient light and usually reports low quality, so no value is
 *   saved rather than a wrong one.
 * - The camera permission is requested by the WebView on first use
 *   (Capacitor's bridge maps it to the native CAMERA / NSCamera permission).
 */
import {
  PULSE_MIN_DURATION_SECONDS,
  estimatePulseFromSignal,
  isFingerCovering,
} from '../utils/calculations/pulseSignal.js';

export const CAMERA_PULSE_TARGET_SECONDS = 25;
const CANVAS_WIDTH = 32;
const CANVAS_HEIGHT = 24;

export const isCameraPulseSupported = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof document !== 'undefined';

const enableTorch = async (track) => {
  try {
    const capabilities = track.getCapabilities?.() ?? {};
    if (!capabilities.torch) {
      return false;
    }
    await track.applyConstraints({ advanced: [{ torch: true }] });
    return true;
  } catch {
    return false;
  }
};

/**
 * Starts a measurement.
 *
 * @param {{ onUpdate?: (update: { phase: 'starting'|'no-finger'|'measuring', progress: number, torch: boolean }) => void }} options
 * @returns {{ result: Promise<{ bpm: number|null, quality: number, torch: boolean, reason?: string }>, cancel: () => void }}
 */
export const measureRestingPulse = ({ onUpdate } = {}) => {
  let cancelled = false;
  let stream = null;
  let frameHandle = null;
  let video = null;

  const cleanup = () => {
    if (frameHandle != null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video) {
      video.srcObject = null;
      video = null;
    }
  };

  const result = (async () => {
    if (!isCameraPulseSupported()) {
      return { bpm: null, quality: 0, torch: false, reason: 'unsupported' };
    }
    onUpdate?.({ phase: 'starting', progress: 0, torch: false });
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 160 },
          height: { ideal: 120 },
          frameRate: { ideal: 30 },
        },
      });
    } catch {
      return { bpm: null, quality: 0, torch: false, reason: 'permission' };
    }
    if (cancelled) {
      cleanup();
      return { bpm: null, quality: 0, torch: false, reason: 'cancelled' };
    }

    const [track] = stream.getVideoTracks();
    const torch = track ? await enableTorch(track) : false;

    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      cleanup();
      return { bpm: null, quality: 0, torch, reason: 'camera' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      cleanup();
      return { bpm: null, quality: 0, torch, reason: 'camera' };
    }

    return new Promise((resolve) => {
      let samples = [];
      let firstCoveredAt = null;

      const finish = (outcome) => {
        cleanup();
        resolve(outcome);
      };

      const tick = () => {
        if (cancelled) {
          finish({ bpm: null, quality: 0, torch, reason: 'cancelled' });
          return;
        }
        context.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const { data } = context.getImageData(
          0,
          0,
          CANVAS_WIDTH,
          CANVAS_HEIGHT
        );
        let red = 0;
        let green = 0;
        let blue = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          red += data[i];
          green += data[i + 1];
          blue += data[i + 2];
        }
        const frame = {
          red: red / pixels,
          green: green / pixels,
          blue: blue / pixels,
        };
        const now = performance.now();

        if (!isFingerCovering(frame)) {
          // Lifting the finger restarts the window: a gap would corrupt it.
          samples = [];
          firstCoveredAt = null;
          onUpdate?.({ phase: 'no-finger', progress: 0, torch });
        } else {
          if (firstCoveredAt == null) {
            firstCoveredAt = now;
          }
          samples.push({ t: now, v: frame.red });
          const elapsedSeconds = (now - firstCoveredAt) / 1000;
          onUpdate?.({
            phase: 'measuring',
            progress: Math.min(1, elapsedSeconds / CAMERA_PULSE_TARGET_SECONDS),
            torch,
          });
          if (elapsedSeconds >= CAMERA_PULSE_TARGET_SECONDS) {
            // Drop the first seconds: the finger settles and the sensor
            // re-exposes right after contact.
            const settled = samples.filter(
              (sample) => sample.t - firstCoveredAt >= 3000
            );
            const estimate = estimatePulseFromSignal(settled);
            finish({
              bpm: estimate.bpm,
              quality: estimate.quality,
              torch,
              reason:
                estimate.bpm == null
                  ? estimate.durationSeconds < PULSE_MIN_DURATION_SECONDS
                    ? 'short'
                    : 'quality'
                  : undefined,
            });
            return;
          }
        }
        frameHandle = requestAnimationFrame(tick);
      };

      frameHandle = requestAnimationFrame(tick);
    });
  })();

  return {
    result,
    cancel: () => {
      cancelled = true;
      if (!frameHandle) {
        cleanup();
      }
    },
  };
};
