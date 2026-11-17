import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CallControls from '../components/call/CallControls';

describe('CallControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders call controls with mic, camera, share, and end call buttons', () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onStartScreenShare = vi.fn();
    const onStopScreenShare = vi.fn();
    const onEndCall = vi.fn();

    render(
      <CallControls
        isMicEnabled={true}
        isCameraEnabled={true}
        isScreenSharing={false}
        isCallActive={true}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onStartScreenShare={onStartScreenShare}
        onStopScreenShare={onStopScreenShare}
        onEndCall={onEndCall}
      />
    );

    expect(screen.getByTitle('Mute microphone')).toBeInTheDocument();
    expect(screen.getByTitle('Turn off camera')).toBeInTheDocument();
    expect(screen.getByTitle('Share screen')).toBeInTheDocument();
    expect(screen.getByTitle('End call')).toBeInTheDocument();
  });

  it('calls onToggleMic when mic button is clicked', () => {
    const onToggleMic = vi.fn();

    render(
      <CallControls
        isMicEnabled={true}
        isCameraEnabled={true}
        isScreenSharing={false}
        isCallActive={true}
        onToggleMic={onToggleMic}
        onToggleCamera={vi.fn()}
        onStartScreenShare={vi.fn()}
        onStopScreenShare={vi.fn()}
        onEndCall={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Mute microphone'));
    expect(onToggleMic).toHaveBeenCalledTimes(1);
  });

  it('shows stop share button when screen sharing is active', () => {
    render(
      <CallControls
        isMicEnabled={true}
        isCameraEnabled={true}
        isScreenSharing={true}
        isCallActive={true}
        onToggleMic={vi.fn()}
        onToggleCamera={vi.fn()}
        onStartScreenShare={vi.fn()}
        onStopScreenShare={vi.fn()}
        onEndCall={vi.fn()}
      />
    );

    expect(screen.getByTitle('Stop screen sharing')).toBeInTheDocument();
  });
});
