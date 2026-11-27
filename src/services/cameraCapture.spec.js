import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAMERA_CAPTURE_MAX_BYTES,
  CAMERA_ERROR,
  captureMealPhoto,
  classifyCameraError,
} from './cameraCapture';

const video = { videoWidth: 1440, videoHeight: 1920 };
const viewport = { viewportWidth: 320, viewportHeight: 240 };

// jsdom has no canvas: record what is drawn and hand back blobs of chosen sizes.
const stubCanvas = (blobSizes) => {
  const drawImage = vi.fn();
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  });
  const encodes = [];
  vi.spyOn(window.HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    function toBlob(callback, type, quality) {
      encodes.push({ width: this.width, height: this.height, quality });
      const size = blobSizes[Math.min(encodes.length, blobSizes.length) - 1];
      callback(new Blob([new Uint8Array(size)], { type }));
    }
  );
  return { drawImage, encodes };
};

describe('captureMealPhoto', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('crops to the visible region and returns a JPEG file', async () => {
    const { drawImage, encodes } = stubCanvas([1000]);

    const file = await captureMealPhoto(video, viewport);

    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/^meal-photo-\d+\.jpg$/);
    expect(drawImage).toHaveBeenCalledWith(
      video,
      0,
      420,
      1440,
      1080,
      0,
      0,
      1024,
      768
    );
    expect(encodes).toEqual([{ width: 1024, height: 768, quality: 0.82 }]);
  });

  it('keeps compressing until the photo fits the upload budget', async () => {
    const tooBig = CAMERA_CAPTURE_MAX_BYTES + 1;
    const { encodes } = stubCanvas([tooBig, tooBig, 2000]);

    const file = await captureMealPhoto(video, viewport);

    expect(file.size).toBe(2000);
    expect(encodes.map((step) => step.width)).toEqual([1024, 1024, 896]);
  });

  it('lets three photos fit the proxy payload cap once base64 encoded', () => {
    const encodedBytes = Math.ceil(CAMERA_CAPTURE_MAX_BYTES / 3) * 4;
    // MAX_CONTENTS_PAYLOAD_BYTES in api/openrouter.js, less room for text.
    expect(encodedBytes * 3).toBeLessThan(500000 - 40000);
  });

  it('rejects while the video has no frame', async () => {
    stubCanvas([1000]);

    await expect(
      captureMealPhoto({ videoWidth: 0, videoHeight: 0 }, viewport)
    ).rejects.toThrow('no frame');
  });
});

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', CAMERA_ERROR.PERMISSION],
    ['NotFoundError', CAMERA_ERROR.UNAVAILABLE],
    ['NotReadableError', CAMERA_ERROR.BUSY],
    ['SomethingElse', CAMERA_ERROR.UNKNOWN],
  ])('maps %s', (name, expected) => {
    expect(classifyCameraError({ name })).toBe(expected);
  });
});
