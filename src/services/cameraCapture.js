/**
 * Camera bridge for the AI chat's inline viewfinder: a live `getUserMedia`
 * preview inside the page, and a still frame turned into an attachment file.
 *
 * Native permissions are handled by the shell: Capacitor's Android WebChromeClient
 * turns the WebView request into the CAMERA runtime prompt, and iOS shows its own
 * prompt using `NSCameraUsageDescription`. Frames never leave the device unless
 * the user sends the captured photo.
 */
import {
  computeCoverCrop,
  fitWithinMaxEdge,
} from '../utils/visuals/cameraFrame.js';

/**
 * Size budget for one captured photo. The AI proxy rejects a `messages` payload
 * over 500,000 bytes (`api/openrouter.js`), images travel as base64 (4/3 larger)
 * and a message holds up to 3 of them: 3 x 110 KiB encodes to about 450 KB,
 * which leaves room for the chat text.
 */
export const CAMERA_CAPTURE_MAX_BYTES = 110 * 1024;

// Tried in order until one fits the budget.
const ENCODE_STEPS = [
  { maxEdge: 1024, quality: 0.82 },
  { maxEdge: 1024, quality: 0.7 },
  { maxEdge: 896, quality: 0.65 },
  { maxEdge: 768, quality: 0.6 },
  { maxEdge: 640, quality: 0.5 },
];

export const CAMERA_ERROR = {
  PERMISSION: 'permission',
  UNAVAILABLE: 'unavailable',
  BUSY: 'busy',
  UNKNOWN: 'unknown',
};

export const isCameraCaptureSupported = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

export const openCameraStream = async ({ facingMode = 'environment' } = {}) =>
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1440 },
    },
  });

export const stopCameraStream = (stream) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const classifyCameraError = (error) => {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return CAMERA_ERROR.PERMISSION;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return CAMERA_ERROR.UNAVAILABLE;
    case 'NotReadableError':
    case 'AbortError':
      return CAMERA_ERROR.BUSY;
    default:
      return CAMERA_ERROR.UNKNOWN;
  }
};

/** Number of cameras; only meaningful once permission has been granted. */
export const countCameras = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput').length;
  } catch {
    return 1;
  }
};

export const supportsTorch = (track) =>
  Boolean(track?.getCapabilities?.()?.torch);

/** @returns {Promise<boolean>} whether the torch accepted the change */
export const setTorch = async (track, enabled) => {
  try {
    await track.applyConstraints({ advanced: [{ torch: enabled }] });
    return true;
  } catch {
    return false;
  }
};

const drawToCanvas = (source, crop, size) => {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable');
  }
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size.width,
    size.height
  );
  return canvas;
};

const encodeJpeg = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not encode the photo')),
      'image/jpeg',
      quality
    );
  });

/**
 * Turns the video's current frame into a JPEG attachment, cropped to what the
 * viewport shows and kept within `CAMERA_CAPTURE_MAX_BYTES`.
 *
 * The frame is copied before the first `await`, so a caller may pause or tear
 * down the video as soon as this returns its promise.
 */
export const captureMealPhoto = async (
  video,
  { viewportWidth, viewportHeight } = {}
) => {
  const crop = computeCoverCrop(
    video?.videoWidth,
    video?.videoHeight,
    viewportWidth,
    viewportHeight
  );
  if (!crop) {
    throw new Error('The camera has no frame yet');
  }

  const frame = drawToCanvas(
    video,
    crop,
    fitWithinMaxEdge(crop.width, crop.height, ENCODE_STEPS[0].maxEdge)
  );
  const wholeFrame = { x: 0, y: 0, width: frame.width, height: frame.height };

  let blob = null;
  for (const { maxEdge, quality } of ENCODE_STEPS) {
    const size = fitWithinMaxEdge(frame.width, frame.height, maxEdge);
    const canvas =
      size.width === frame.width && size.height === frame.height
        ? frame
        : drawToCanvas(frame, wholeFrame, size);
    blob = await encodeJpeg(canvas, quality);
    if (blob.size <= CAMERA_CAPTURE_MAX_BYTES) break;
  }

  return new File([blob], `meal-photo-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  });
};
