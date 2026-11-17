import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallProvider, useCalls } from '../context/CallContext';

const { socket } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    handlers,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
    timeout: vi.fn(() => socket),
    emit: vi.fn((_event: string, _payload: unknown, callback?: (error: null, result: { ok: boolean }) => void) => callback?.(null, { ok: true })),
    emitWithAck: vi.fn(async (event: string) => event === 'call:invite'
      ? { sessionId: 'session', roomId: 'room', recipients: [{ userId: 'guest', userName: 'Guest', status: 'pending' }] }
      : { ok: true }),
    disconnect: vi.fn(),
    trigger: (event: string, value: unknown) => handlers.get(event)?.(value),
  };
  return { socket };
});

vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../api', () => ({ API_ORIGIN: 'http://localhost:5000', getAvatarUrl: (value: string) => value }));

const Probe = () => {
  const calls = useCalls();
  const location = useLocation();
  return <div>
    <span data-testid="path">{location.pathname}</span>
    <span data-testid="join">{calls.joinRequest?.sessionId || ''}</span>
    <span data-testid="response">{calls.outgoing?.recipients[0]?.status || ''}</span>
    <button onClick={() => calls.start('room')}>Start</button>
    <button onClick={() => calls.exitRoom('room')}>Leave room</button>
  </div>;
};

const renderProvider = () => render(<MemoryRouter initialEntries={['/dashboard']}>
  <CallProvider><Probe /></CallProvider>
</MemoryRouter>);

describe('call invitation interface', () => {
  beforeEach(() => {
    socket.handlers.clear();
    socket.emitWithAck.mockClear();
  });

  it('shows one incoming invitation, accepts it and opens the room', async () => {
    renderProvider();
    const invitation = {
      sessionId: 'session', roomId: 'room', roomName: 'Our room',
      caller: { id: 'host', name: 'Host', avatar: '/uploads/host.png' },
    };
    act(() => {
      socket.trigger('call:incoming', invitation);
      socket.trigger('call:incoming', invitation);
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Host')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/room/room'));
    expect(screen.getByTestId('join')).toHaveTextContent('session');
    expect(socket.emitWithAck).toHaveBeenCalledWith('call:respond', {
      roomId: 'room', sessionId: 'session', accept: true,
    });
  });

  it('clears ringing on cancellation and starts media only after acceptance', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('response')).toHaveTextContent('pending'));
    expect(screen.getByTestId('join')).toBeEmptyDOMElement();
    act(() => socket.trigger('call:invite-update', { sessionId: 'session', userId: 'guest', status: 'accepted' }));
    expect(screen.getByTestId('join')).toHaveTextContent('session');
    act(() => socket.trigger('call:ended', { sessionId: 'session', roomId: 'room', reason: 'Call cancelled.' }));
    expect(screen.getByTestId('join')).toBeEmptyDOMElement();
    expect(screen.getByText('Call cancelled.')).toBeInTheDocument();
  });

  it('rejects an invitation and does not reopen a cancelled invitation', async () => {
    renderProvider();
    const invitation = { sessionId: 'session', roomId: 'room', roomName: 'Our room', caller: { name: 'Host' } };
    act(() => socket.trigger('call:incoming', invitation));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(socket.emitWithAck).toHaveBeenCalledWith('call:respond', {
      roomId: 'room', sessionId: 'session', accept: false,
    });
    act(() => {
      socket.trigger('call:ended', { sessionId: 'session', roomId: 'room', reason: 'Call cancelled.' });
      socket.trigger('call:incoming', invitation);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels a call started while the caller is leaving the room', async () => {
    let resolveInvite: (value: { sessionId: string; roomId: string; recipients: never[] }) => void = () => {};
    socket.emitWithAck.mockImplementationOnce(() => new Promise((resolve) => { resolveInvite = resolve; }));
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
    await act(async () => resolveInvite({ sessionId: 'session', roomId: 'room', recipients: [] }));
    await waitFor(() => expect(socket.emitWithAck).toHaveBeenCalledWith('call:exit', {
      roomId: 'room', sessionId: 'session',
    }));
    expect(screen.getByTestId('response')).toBeEmptyDOMElement();
  });
});
