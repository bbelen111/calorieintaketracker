import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnimatePresence, motion } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FoodSearchCameraViewfinder } from './FoodSearchCameraViewfinder';
import { captureMealPhoto } from '../../../../../services/cameraCapture';
import {
  createFakeStream,
  installFakeCamera,
} from '../../../../../tests/helpers/fakeCamera';

vi.mock('../../../../../services/cameraCapture', async (importOriginal) => ({
  ...(await importOriginal()),
  captureMealPhoto: vi.fn(),
}));

const photo = new File(['x'], 'meal-photo-1.jpg', { type: 'image/jpeg' });

const renderViewfinder = () => {
  const props = {
    onCapture: vi.fn(),
    onClose: vi.fn(),
    onUseSystemCamera: vi.fn(),
  };
  return { ...render(<FoodSearchCameraViewfinder {...props} />), props };
};

const findShutter = () =>
  screen.findByRole('button', { name: 'Capture photo' });

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
};

describe('FoodSearchCameraViewfinder', () => {
  let camera;

  beforeEach(() => {
    camera = installFakeCamera();
    captureMealPhoto.mockReset();
    captureMealPhoto.mockResolvedValue(photo);
  });

  afterEach(() => {
    camera.uninstall();
    delete document.visibilityState;
  });

  it('starts the rear camera and releases it on unmount', async () => {
    const { unmount } = renderViewfinder();

    expect(screen.getByRole('status')).toHaveTextContent('Starting camera');
    await findShutter();

    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    expect(camera.getUserMedia.mock.calls[0][0]).toMatchObject({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    expect(camera.streams[0].track.stop).not.toHaveBeenCalled();

    unmount();
    expect(camera.streams[0].track.stop).toHaveBeenCalled();
  });

  it('releases a stream that only arrives after it was closed', async () => {
    let deliver;
    camera.getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        })
    );
    const { unmount } = renderViewfinder();
    unmount();

    const stream = createFakeStream();
    await act(async () => deliver(stream));

    expect(stream.track.stop).toHaveBeenCalled();
  });

  it('hands the captured photo to the owner', async () => {
    const user = userEvent.setup();
    const { props } = renderViewfinder();

    await user.click(await findShutter());

    expect(props.onCapture).toHaveBeenCalledWith(photo);
  });

  it('reports a failed capture and stays usable', async () => {
    const user = userEvent.setup();
    captureMealPhoto.mockRejectedValueOnce(new Error('encode failed'));
    const { props } = renderViewfinder();

    await user.click(await findShutter());

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't take that photo"
    );
    expect(props.onCapture).not.toHaveBeenCalled();

    await user.click(await findShutter());
    expect(props.onCapture).toHaveBeenCalledWith(photo);
  });

  it('switches cameras, releasing the previous one first', async () => {
    const user = userEvent.setup();
    renderViewfinder();

    await user.click(
      await screen.findByRole('button', { name: 'Switch camera' })
    );
    await findShutter();

    expect(camera.streams[0].track.stop).toHaveBeenCalled();
    expect(camera.getUserMedia.mock.calls[1][0].video.facingMode).toEqual({
      ideal: 'user',
    });
    expect(screen.getByLabelText('Camera preview')).toHaveClass('-scale-x-100');
  });

  it('hides the switch and flash controls the device cannot use', async () => {
    camera.uninstall();
    camera = installFakeCamera({ cameras: 1 });
    renderViewfinder();
    await findShutter();

    expect(
      screen.queryByRole('button', { name: 'Switch camera' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Flash' })
    ).not.toBeInTheDocument();
  });

  it('toggles the flash when the camera has one', async () => {
    camera.uninstall();
    camera = installFakeCamera({ torch: true });
    const user = userEvent.setup();
    renderViewfinder();

    const flash = await screen.findByRole('button', { name: 'Flash' });
    expect(flash).toHaveAttribute('aria-pressed', 'false');
    await user.click(flash);

    expect(camera.streams[0].track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
    expect(flash).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains a denied permission and offers a way on', async () => {
    const user = userEvent.setup();
    camera.getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    );
    const { props } = renderViewfinder();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Camera access is off'
    );
    await user.click(screen.getByRole('button', { name: 'Use camera app' }));
    expect(props.onUseSystemCamera).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await findShutter()).toBeInTheDocument();
  });

  it('closes itself when the app is backgrounded', async () => {
    const { props } = renderViewfinder();
    await findShutter();

    setVisibility('hidden');

    expect(props.onClose).toHaveBeenCalled();
  });

  it('releases the camera as soon as its exit animation begins', async () => {
    const props = {
      onCapture: vi.fn(),
      onClose: vi.fn(),
      onUseSystemCamera: vi.fn(),
    };
    const Wrapper = ({ open }) => (
      <AnimatePresence>
        {open && (
          <motion.div
            key="cam"
            exit={{ opacity: 0 }}
            transition={{ duration: 10 }}
          >
            <FoodSearchCameraViewfinder {...props} />
          </motion.div>
        )}
      </AnimatePresence>
    );

    const { rerender } = render(<Wrapper open />);
    await findShutter();
    expect(camera.streams[0].track.stop).not.toHaveBeenCalled();

    rerender(<Wrapper open={false} />);

    // Still mounted while the exit animation runs, yet the hardware is released.
    expect(screen.getByRole('group', { name: 'Camera' })).toBeInTheDocument();
    expect(camera.streams[0].track.stop).toHaveBeenCalledTimes(1);
  });
});
