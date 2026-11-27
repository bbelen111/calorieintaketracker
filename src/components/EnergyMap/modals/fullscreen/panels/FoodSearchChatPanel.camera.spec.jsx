import React, { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FoodSearchChatPanel } from './FoodSearchChatPanel';
import { captureMealPhoto } from '../../../../../services/cameraCapture';
import { installFakeCamera } from '../../../../../tests/helpers/fakeCamera';

vi.mock('../../../../../services/cameraCapture', async (importOriginal) => ({
  ...(await importOriginal()),
  captureMealPhoto: vi.fn(),
}));

const photo = new File(['x'], 'meal-photo-1.jpg', { type: 'image/jpeg' });
const noop = () => {};

const Harness = ({ attachments = [], onAddFiles, onSend = noop }) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatTextareaRef = useRef(null);

  return (
    <FoodSearchChatPanel
      isOnline
      chatMessages={[]}
      chatAttachments={attachments}
      chatAttachmentErrors={[]}
      isSendingChat={false}
      chatStatusNowMs={0}
      chatScrollRef={chatScrollRef}
      fileInputRef={fileInputRef}
      cameraInputRef={cameraInputRef}
      chatTextareaRef={chatTextareaRef}
      chatPlaceholder="Describe food + portion..."
      chatInput="eggs"
      setChatInput={noop}
      handleChatInputKeyDown={noop}
      handleChatInputPaste={noop}
      sendChat={onSend}
      handleAddAttachmentFiles={onAddFiles}
      removeAttachment={noop}
      isCameraOpen={isCameraOpen}
      onCameraOpenChange={setIsCameraOpen}
      maxImageCount={3}
    />
  );
};

const cameraButton = () => screen.getByRole('button', { name: 'Take photo' });
const viewfinder = () => screen.queryByRole('group', { name: 'Camera' });
const systemCameraInput = (container) =>
  container.querySelector('input[capture="environment"]');

describe('FoodSearchChatPanel inline camera', () => {
  let camera;

  beforeEach(() => {
    camera = installFakeCamera();
    captureMealPhoto.mockReset();
    captureMealPhoto.mockResolvedValue(photo);
  });

  afterEach(() => {
    camera.uninstall();
  });

  it('opens a viewfinder inside the composer, not the system camera', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness onAddFiles={vi.fn()} />);
    const systemCamera = vi.spyOn(systemCameraInput(container), 'click');

    await user.click(cameraButton());

    expect(viewfinder()).toBeInTheDocument();
    expect(cameraButton()).toHaveAttribute('aria-expanded', 'true');
    expect(systemCamera).not.toHaveBeenCalled();
  });

  it('attaches the shot, then collapses and releases the camera', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(<Harness onAddFiles={onAddFiles} />);

    await user.click(cameraButton());
    await user.click(
      await screen.findByRole('button', { name: 'Capture photo' })
    );

    expect(onAddFiles).toHaveBeenCalledWith([photo]);
    await waitFor(() => expect(viewfinder()).not.toBeInTheDocument());
    expect(camera.streams[0].track.stop).toHaveBeenCalled();
    expect(cameraButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it.each([
    ['the camera button', () => cameraButton()],
    ['the text box', () => screen.getByRole('textbox')],
    ['Send', () => screen.getByRole('button', { name: 'Send message' })],
    ['Attach', () => screen.getByRole('button', { name: 'Attach image' })],
    ['Close', () => screen.getByRole('button', { name: 'Close camera' })],
  ])('closes through %s', async (_label, target) => {
    const user = userEvent.setup();
    render(<Harness onAddFiles={vi.fn()} />);
    await user.click(cameraButton());
    await screen.findByRole('button', { name: 'Capture photo' });

    await user.click(target());

    await waitFor(() => expect(viewfinder()).not.toBeInTheDocument());
    expect(camera.streams[0].track.stop).toHaveBeenCalled();
  });

  it('falls back to the system camera without live preview support', async () => {
    camera.uninstall();
    const user = userEvent.setup();
    const { container } = render(<Harness onAddFiles={vi.fn()} />);
    const systemCamera = vi.spyOn(systemCameraInput(container), 'click');

    await user.click(cameraButton());

    expect(systemCamera).toHaveBeenCalled();
    expect(viewfinder()).not.toBeInTheDocument();
  });

  it('disables the camera once every photo slot is used', () => {
    const attachments = [1, 2, 3].map((id) => ({
      id,
      previewUrl: `blob:${id}`,
    }));
    render(<Harness attachments={attachments} onAddFiles={vi.fn()} />);

    expect(cameraButton()).toBeDisabled();
  });
});
