import { StrictMode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useRoomCall } from '../hooks/useRoomCall';

const { calls } = vi.hoisted(() => ({
  calls: {
    joinRequest: { roomId: 'room', sessionId: 'session' },
    ended: null,
    consumeJoin: vi.fn(),
    exit: vi.fn(),
    exitRoom: vi.fn(),
  },
}));
vi.mock('../context/CallContext', () => ({ useCalls: () => calls }));

it('joins once in StrictMode and only exits when the room actually unmounts', async () => {
  const call = { initLocalMedia: vi.fn(async () => true), endCall: vi.fn() };
  const { unmount } = renderHook(() => useRoomCall('room', call), { wrapper: StrictMode });
  await waitFor(() => expect(call.initLocalMedia).toHaveBeenCalledTimes(1));
  expect(calls.exitRoom).not.toHaveBeenCalled();
  unmount();
  await waitFor(() => expect(calls.exitRoom).toHaveBeenCalledWith('room'));
});
