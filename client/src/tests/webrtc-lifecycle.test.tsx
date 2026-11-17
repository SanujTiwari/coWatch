import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebRTC } from '../hooks/useWebRTC';

const { socket, media } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger: (event: string, value: unknown) => handlers.get(event)?.(value),
    handlers,
  };
  const media = {
    fetchIceServers: vi.fn(async () => []),
    getUserMedia: vi.fn(),
    getDisplayMedia: vi.fn(),
  };
  return { socket, media };
});

vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('../api', () => ({ API_ORIGIN: 'http://localhost:5000' }));
vi.mock('../lib/webrtc', () => media);

describe('WebRTC lifecycle', () => {
  beforeEach(() => {
    socket.handlers.clear();
    socket.disconnect.mockClear();
    socket.emit.mockClear();
    media.fetchIceServers.mockReset();
    media.fetchIceServers.mockResolvedValue([]);
    media.getUserMedia.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('releases local tracks and disconnects signaling when the call ends', async () => {
    const audio = { stop: vi.fn() };
    const video = { stop: vi.fn() };
    media.getUserMedia.mockResolvedValue({
      getTracks: () => [audio, video],
      getAudioTracks: () => [audio],
      getVideoTracks: () => [video],
    });
    const { result } = renderHook(() => useWebRTC({ roomId: 'room', token: 'test-token' }));
    await act(async () => { await result.current.initLocalMedia('session'); });
    expect(result.current.isCallActive).toBe(true);
    act(() => socket.trigger('call:ended', { sessionId: 'session' }));
    expect(result.current.isCallActive).toBe(false);
    expect(audio.stop).toHaveBeenCalled();
    expect(video.stop).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('reports permission denial without starting a call', async () => {
    media.getUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
    const { result } = renderHook(() => useWebRTC({ roomId: 'room', token: 'test-token' }));
    await act(async () => { expect(await result.current.initLocalMedia('session')).toBe(false); });
    expect(result.current.callError).toMatch(/permission was denied/i);
    expect(result.current.isCallActive).toBe(false);
  });

  it('does not request devices after the call ends while ICE configuration is loading', async () => {
    let resolveIce: (value: never[]) => void = () => {};
    media.fetchIceServers.mockImplementationOnce(() => new Promise((resolve) => { resolveIce = resolve; }));
    const { result } = renderHook(() => useWebRTC({ roomId: 'room', token: 'test-token' }));
    let pending: Promise<boolean> | undefined;
    act(() => { pending = result.current.initLocalMedia('session'); });
    act(() => result.current.endCall());
    await act(async () => { resolveIce([]); await pending; });
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(result.current.isCallActive).toBe(false);
  });

  it('reports missing devices without starting a call', async () => {
    media.getUserMedia.mockRejectedValue({ name: 'NotFoundError' });
    const { result } = renderHook(() => useWebRTC({ roomId: 'room', token: 'test-token' }));
    await act(async () => { expect(await result.current.initLocalMedia('session')).toBe(false); });
    expect(result.current.callError).toMatch(/not found/i);
  });

  it('releases the new camera if replacing the peer track fails', async () => {
    const audio = { kind: 'audio', stop: vi.fn() };
    const camera = { kind: 'video', stop: vi.fn(), enabled: true, getSettings: () => ({ deviceId: 'old' }) };
    const replacement = { kind: 'video', stop: vi.fn(), enabled: true };
    const replaceTrack = vi.fn().mockRejectedValueOnce(new Error('replace failed')).mockResolvedValueOnce(undefined);
    vi.stubGlobal('RTCPeerConnection', class {
      addTrack() {}
      close() {}
      getSenders() { return [{ track: camera, replaceTrack }]; }
    });
    vi.stubGlobal('navigator', { mediaDevices: {
      enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'old' }, { kind: 'videoinput', deviceId: 'new' }],
    } });
    media.getUserMedia.mockResolvedValueOnce({
      getTracks: () => [audio, camera], getAudioTracks: () => [audio], getVideoTracks: () => [camera],
    }).mockResolvedValueOnce({
      getTracks: () => [replacement], getVideoTracks: () => [replacement],
    });
    const { result } = renderHook(() => useWebRTC({ roomId: 'room', token: 'test-token' }));
    await act(async () => { await result.current.initLocalMedia('session'); });
    act(() => socket.trigger('call:user-joined', { socketId: 'peer', userId: 'guest', userName: 'Guest' }));
    await act(async () => result.current.switchCamera());
    expect(replacement.stop).toHaveBeenCalled();
    expect(replaceTrack).toHaveBeenLastCalledWith(camera);
    expect(result.current.callError).toMatch(/replace failed/);
  });
});
