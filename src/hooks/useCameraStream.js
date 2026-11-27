import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAMERA_ERROR,
  classifyCameraError,
  countCameras,
  openCameraStream,
  setTorch,
  stopCameraStream,
  supportsTorch,
} from '../services/cameraCapture';

const STARTING = { status: 'starting' };

/**
 * A live camera stream bound to a `<video>` while `isActive` is true and the
 * owner is mounted: becoming inactive (e.g. while an exit animation runs),
 * unmounting, flipping or retrying immediately releases the previous stream,
 * including one that only arrives after it stopped being wanted.
 *
 * `status` is derived: an outcome counts only for the request that produced it,
 * so a flip or retry reads as `'starting'` at once, while becoming inactive
 * keeps the last frozen frame visible until unmount.
 *
 * @param {boolean} [isActive=true]
 * @returns {{
 *   videoRef: import('react').RefObject<HTMLVideoElement>,
 *   status: 'starting'|'live'|'error',
 *   errorReason?: string,
 *   canFlip: boolean,
 *   canTorch: boolean,
 *   isTorchOn: boolean,
 *   isMirrored: boolean,
 *   flipCamera: () => void,
 *   retry: () => void,
 *   toggleTorch: () => Promise<void>,
 * }}
 */
export const useCameraStream = (isActive = true) => {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const [request, setRequest] = useState({ facingMode: 'environment' });
  const [outcome, setOutcome] = useState(null);
  const current = outcome?.request === request ? outcome : STARTING;

  useEffect(() => {
    if (!isActive) return undefined;

    const video = videoRef.current;
    let cancelled = false;
    let stream = null;

    const fail = (errorReason) => {
      stopCameraStream(stream);
      if (video) {
        video.srcObject = null;
      }
      if (!cancelled) {
        setOutcome({ request, status: 'error', errorReason });
      }
    };

    const start = async () => {
      try {
        stream = await openCameraStream({ facingMode: request.facingMode });
      } catch (error) {
        fail(classifyCameraError(error));
        return;
      }

      const track = stream.getVideoTracks()[0];
      if (cancelled || !track || !video) {
        fail(CAMERA_ERROR.UNKNOWN);
        return;
      }

      try {
        video.srcObject = stream;
        await video.play();
      } catch {
        fail(CAMERA_ERROR.UNKNOWN);
        return;
      }

      const cameraCount = await countCameras();
      if (cancelled) return;

      // Fires only when the system takes the camera away, not on our own stop().
      track.addEventListener?.('ended', () => fail(CAMERA_ERROR.BUSY));
      trackRef.current = track;
      setOutcome({
        request,
        status: 'live',
        canFlip: cameraCount > 1,
        canTorch: supportsTorch(track),
        isTorchOn: false,
        isMirrored: track.getSettings?.().facingMode === 'user',
      });
    };

    void start();

    return () => {
      cancelled = true;
      trackRef.current = null;
      video?.pause?.();
      stopCameraStream(stream);
    };
  }, [isActive, request]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  const flipCamera = useCallback(() => {
    setRequest((previous) => ({
      facingMode:
        previous.facingMode === 'environment' ? 'user' : 'environment',
    }));
  }, []);

  const retry = useCallback(() => {
    setRequest((previous) => ({ ...previous }));
  }, []);

  const isTorchOn = Boolean(current.isTorchOn);
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;

    const applied = await setTorch(track, !isTorchOn);
    if (applied && trackRef.current === track) {
      setOutcome((previous) => ({ ...previous, isTorchOn: !isTorchOn }));
    }
  }, [isTorchOn]);

  return {
    videoRef,
    status: current.status,
    errorReason: current.errorReason,
    canFlip: Boolean(current.canFlip),
    canTorch: Boolean(current.canTorch),
    isTorchOn,
    isMirrored: Boolean(current.isMirrored),
    flipCamera,
    retry,
    toggleTorch,
  };
};
