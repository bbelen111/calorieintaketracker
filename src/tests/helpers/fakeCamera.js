/**
 * jsdom has no camera and no media playback. `installFakeCamera()` provides both
 * for one test; call the returned `uninstall()` afterwards.
 */
import { vi } from 'vitest';

export const createFakeStream = ({
  facingMode = 'environment',
  torch = false,
} = {}) => {
  const track = {
    stop: vi.fn(),
    getSettings: () => ({ facingMode }),
    getCapabilities: () => ({ torch }),
    applyConstraints: vi.fn(async () => {}),
    addEventListener: vi.fn(),
  };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
};

export const installFakeCamera = ({ cameras = 2, torch = false } = {}) => {
  const streams = [];
  const getUserMedia = vi.fn(async ({ video }) => {
    const stream = createFakeStream({
      facingMode: video.facingMode.ideal,
      torch,
    });
    streams.push(stream);
    return stream;
  });
  const enumerateDevices = vi.fn(async () =>
    Array.from({ length: cameras }, () => ({ kind: 'videoinput' }))
  );

  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => {}
  );

  return {
    streams,
    getUserMedia,
    uninstall: () => {
      delete window.navigator.mediaDevices;
    },
  };
};
