import React, { useEffect, useRef, useState } from 'react';
import { useIsPresent } from 'framer-motion';
import { AlertCircle, SwitchCamera, X, Zap, ZapOff } from 'lucide-react';
import { useCameraStream } from '../../../../../hooks/useCameraStream';
import {
  CAMERA_ERROR,
  captureMealPhoto,
} from '../../../../../services/cameraCapture';

const CAMERA_ERROR_MESSAGES = {
  [CAMERA_ERROR.PERMISSION]:
    'Camera access is off. Allow it for Energy Map in your device settings, then try again.',
  [CAMERA_ERROR.UNAVAILABLE]: 'No camera was found on this device.',
  [CAMERA_ERROR.BUSY]:
    'The camera is being used elsewhere. Close the other app, then try again.',
  [CAMERA_ERROR.UNKNOWN]: "The camera preview couldn't start.",
};

// Glass controls that stay readable on top of any picture, in every theme.
const CONTROL_CLASS =
  'w-10 h-10 rounded-full flex items-center justify-center border border-border/50 bg-surface/60 text-foreground backdrop-blur-md pressable-inline focus-ring';

/**
 * Compact live camera preview that sits inside the AI chat composer. The camera
 * stops as soon as the viewfinder begins leaving (or unmounts), so switching to
 * the barcode scanner or reopening never contends for hardware.
 */
export const FoodSearchCameraViewfinder = ({
  onCapture,
  onClose,
  onUseSystemCamera,
}) => {
  const isPresent = useIsPresent();
  const {
    videoRef,
    status,
    errorReason,
    canFlip,
    canTorch,
    isTorchOn,
    isMirrored,
    flipCamera,
    retry,
    toggleTorch,
  } = useCameraStream(isPresent);
  const [captureState, setCaptureState] = useState('idle');
  const isActiveRef = useRef(false);
  const isLive = status === 'live';

  useEffect(() => {
    isActiveRef.current = isPresent;
    return () => {
      isActiveRef.current = false;
    };
  }, [isPresent]);

  // A backgrounded app must not hold the camera. Only once it is live: the
  // permission prompt itself may hide the page while the stream is still pending.
  useEffect(() => {
    if (!isLive || !isPresent) return undefined;

    const closeIfHidden = () => {
      if (document.visibilityState === 'hidden') onClose();
    };

    closeIfHidden();
    document.addEventListener('visibilitychange', closeIfHidden);
    return () =>
      document.removeEventListener('visibilitychange', closeIfHidden);
  }, [isLive, isPresent, onClose]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !isPresent) return;

    setCaptureState('capturing');
    try {
      const pendingPhoto = captureMealPhoto(video, {
        viewportWidth: video.clientWidth,
        viewportHeight: video.clientHeight,
      });
      // Freeze on the shot as feedback while it is encoded.
      video.pause();
      const photo = await pendingPhoto;
      if (isActiveRef.current) onCapture(photo);
    } catch {
      if (!isActiveRef.current) return;
      setCaptureState('failed');
      video.play()?.catch(() => {});
    }
  };

  return (
    <div
      role="group"
      aria-label="Camera"
      className={`relative overflow-hidden rounded-[22px] bg-background ${
        isPresent ? '' : 'pointer-events-none'
      }`}
      style={{ height: 'min(17rem, 38dvh)' }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Camera preview"
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          isLive ? 'opacity-100' : 'opacity-0'
        } ${isMirrored ? '-scale-x-100' : ''}`}
      />

      {status === 'starting' && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted"
        >
          <span className="w-5 h-5 rounded-full border-2 border-accent-blue/30 border-t-accent-blue animate-spin-fast" />
          Starting camera...
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <AlertCircle size={22} className="text-accent-amber" />
          <p className="text-foreground text-[13px] leading-relaxed">
            {CAMERA_ERROR_MESSAGES[errorReason] ??
              CAMERA_ERROR_MESSAGES[CAMERA_ERROR.UNKNOWN]}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onUseSystemCamera}
              className="rounded-full border border-border bg-surface-highlight text-foreground px-4 py-2 text-xs font-semibold pressable-card focus-ring"
            >
              Use camera app
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className={`absolute top-2 left-2 ${CONTROL_CLASS}`}
        aria-label="Close camera"
      >
        <X size={18} />
      </button>

      {isLive && canTorch && (
        <button
          type="button"
          onClick={toggleTorch}
          className={`absolute top-2 right-2 ${CONTROL_CLASS}`}
          aria-label="Flash"
          aria-pressed={isTorchOn}
        >
          {isTorchOn ? (
            <Zap size={17} className="text-accent-yellow" />
          ) : (
            <ZapOff size={17} />
          )}
        </button>
      )}

      {isLive && (
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5 px-2">
          {captureState === 'failed' && (
            <p
              role="alert"
              className="rounded-full bg-surface/85 text-accent-red px-3 py-1 text-[11px]"
            >
              Couldn&apos;t take that photo. Try again.
            </p>
          )}
          <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center">
            <button
              type="button"
              onClick={handleCapture}
              disabled={captureState === 'capturing'}
              className="col-start-2 w-14 h-14 rounded-full border-[3px] border-primary-foreground p-1 shadow-xl transition-opacity disabled:opacity-60 press-feedback focus-ring"
              aria-label="Capture photo"
            >
              <span className="block w-full h-full rounded-full bg-primary-foreground" />
            </button>
            {canFlip && (
              <button
                type="button"
                onClick={flipCamera}
                disabled={captureState === 'capturing'}
                className={`col-start-3 justify-self-end ${CONTROL_CLASS}`}
                aria-label="Switch camera"
              >
                <SwitchCamera size={18} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
