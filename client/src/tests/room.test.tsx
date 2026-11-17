import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Room from '../pages/Room';
import CallRoom from '../pages/CallRoom';

vi.mock('../api', () => ({
  getAvatarUrl: (avatar: string) => avatar,
  roomAPI: {
    getRoom: vi.fn(),
    getMessages: vi.fn(),
    updateMedia: vi.fn(),
    addToPlaylist: vi.fn(),
    getPlaylist: vi.fn(),
    getModeration: vi.fn(),
    moderateParticipant: vi.fn(),
    deleteRoom: vi.fn(),
  },
  friendAPI: {
    getFriends: vi.fn(),
    search: vi.fn(),
    sendRequest: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
    cancelRequest: vi.fn(),
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
    reportUser: vi.fn(),
  },
}));

vi.mock('../hooks/useSocket', () => ({
  useSocket: vi.fn(() => ({
    socket: { connected: true },
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user1', name: 'Test User', email: 'test@example.com', avatar: '' },
    token: 'fake-token',
  })),
}));

vi.mock('../context/CallContext', () => ({
  useCalls: () => ({
    joinRequest: null, outgoing: null, ended: null, starting: false,
    start: vi.fn(), exit: vi.fn(), exitRoom: vi.fn(), consumeJoin: vi.fn(),
  }),
}));

import { roomAPI } from '../api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

describe('Room Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user1', name: 'Test User', email: 'test@example.com', avatar: '' },
      token: 'fake-token',
    });
    vi.mocked(useSocket).mockReturnValue({
      socket: { connected: true },
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing when room data loads', async () => {
    vi.mocked(roomAPI.getRoom).mockResolvedValue({
      data: {
        room: {
          id: 'room1',
          name: 'Test Room',
          token: 'ABCD-EFGH',
          hostId: 'user1',
          roomType: 'group',
          participants: [],
          currentMedia: { title: '', url: '', type: 'video', currentTime: 0, isPlaying: false },
        },
      },
    });
    vi.mocked(roomAPI.getMessages).mockResolvedValue({ data: { messages: [] } });

    render(
      <MemoryRouter initialEntries={['/room/room1']}>
        <Routes>
          <Route path="/room/:id" element={<Room />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Room')).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('sends chat message via socket emit', async () => {
    vi.mocked(roomAPI.getRoom).mockResolvedValue({
      data: {
        room: {
          id: 'room1',
          name: 'Test Room',
          token: 'ABCD-EFGH',
          hostId: 'user1',
          roomType: 'group',
          participants: [],
          currentMedia: { title: '', url: '', type: 'video', currentTime: 0, isPlaying: false },
        },
      },
    });
    vi.mocked(roomAPI.getMessages).mockResolvedValue({ data: { messages: [] } });
    const emit = vi.fn();
    vi.mocked(useSocket).mockReturnValue({
      socket: { connected: true },
      emit,
      on: vi.fn(),
      off: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/room/room1']}>
        <Routes>
          <Route path="/room/:id" element={<Room />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    }, { timeout: 10000 });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello world' } });
    fireEvent.submit(document.querySelector('.chat-input-area') as HTMLFormElement);

    expect(emit).toHaveBeenCalledWith('chat:message', {
      roomId: 'room1',
      content: 'Hello world',
      type: 'text',
    });
  });

  it('offers authorized moderation and shows voluntary microphone requests', async () => {
      const listeners = new Map<string, (payload: { roomId: string; userName: string }) => void>();
      vi.mocked(useSocket).mockReturnValue({
        socket: { connected: true },
        connected: true,
        emit: vi.fn(() => true),
        on: vi.fn((event, handler) => listeners.set(event, handler)),
        off: vi.fn(),
      });
      const participant = {
        id: 'guest', name: 'Guest', online: true,
        RoomParticipant: { role: 'participant', chatMuted: false, isRemoved: false },
      };
      vi.mocked(roomAPI.getRoom).mockResolvedValue({ data: { room: {
        id: 'room1', name: 'Test Room', token: 'ABCD-EFGH', host: { id: 'user1' },
        participants: [participant], currentMedia: { title: '', url: '', type: 'video', currentTime: 0, isPlaying: false },
      } } });
      vi.mocked(roomAPI.getMessages).mockResolvedValue({ data: { messages: [] } });
      vi.mocked(roomAPI.getPlaylist).mockResolvedValue({ data: { items: [] } });
      vi.mocked(roomAPI.getModeration).mockResolvedValue({ data: { participants: [participant] } });
      vi.mocked(roomAPI.moderateParticipant).mockResolvedValue({ data: { message: 'Microphone mute requested' } });

      render(<MemoryRouter initialEntries={['/room/room1']}>
        <Routes><Route path="/room/:id" element={<Room />} /></Routes>
      </MemoryRouter>);
      fireEvent.click(await screen.findByRole('button', { name: 'Request mic mute' }, { timeout: 10000 }));
      await waitFor(() => expect(roomAPI.moderateParticipant).toHaveBeenCalledWith('room1', 'guest', 'request-mic-mute'));
      act(() => listeners.get('room:mic-mute-request')?.({ roomId: 'room1', userName: 'Host' }));
      expect(screen.getByText(/This is your choice/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mute my microphone' })).not.toBeInTheDocument();
  });

  it('lets the host moderate and reinstate participants in the legacy call view', async () => {
    const guest = {
      id: 'guest', name: 'Guest', online: true,
      RoomParticipant: { role: 'participant', chatMuted: false, isRemoved: false },
    };
    vi.mocked(roomAPI.getRoom).mockResolvedValue({ data: { room: {
      id: 'room1', name: 'Test Room', host: { id: 'user1' },
      participants: [guest], currentMedia: { title: '', url: '', type: 'video', currentTime: 0, isPlaying: false },
    } } });
    vi.mocked(roomAPI.getMessages).mockResolvedValue({ data: { messages: [] } });
    vi.mocked(roomAPI.getModeration).mockImplementation(async () => ({ data: { participants: [{ ...guest, RoomParticipant: { ...guest.RoomParticipant } }] } }));
    vi.mocked(roomAPI.moderateParticipant).mockImplementation(async (_roomId, _userId, action) => {
      if (action === 'remove') guest.RoomParticipant.isRemoved = true;
      if (action === 'reinstate') guest.RoomParticipant.isRemoved = false;
      if (action === 'mute-chat') guest.RoomParticipant.chatMuted = true;
      return { data: { message: 'Participant updated' } };
    });

    render(<MemoryRouter initialEntries={['/call/room1']}>
      <Routes><Route path="/call/:id" element={<CallRoom />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Mute chat' }));
    expect(await screen.findByText(/chat muted/)).toBeInTheDocument();
    expect(roomAPI.moderateParticipant).toHaveBeenCalledWith('room1', 'guest', 'mute-chat');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/removed/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Reinstate' }));
    await screen.findByRole('button', { name: 'Remove' });
    expect(roomAPI.moderateParticipant).toHaveBeenCalledWith('room1', 'guest', 'reinstate');
    fireEvent.click(screen.getByRole('button', { name: 'Request mic mute' }));
    await waitFor(() => expect(roomAPI.moderateParticipant).toHaveBeenCalledWith('room1', 'guest', 'request-mic-mute'));
  });

  it('does not expose legacy moderation controls to ordinary participants', async () => {
    const listeners = new Map<string, (payload: { roomId: string; userId: string; action: string }) => void>();
    vi.mocked(useSocket).mockReturnValue({
      socket: { connected: true }, connected: true, emit: vi.fn(),
      on: vi.fn((event, handler) => listeners.set(event, handler)), off: vi.fn(),
    });
    vi.mocked(roomAPI.getRoom).mockResolvedValue({ data: { room: {
      id: 'room1', name: 'Test Room', host: { id: 'host' },
      participants: [{ id: 'user1', name: 'Test User', RoomParticipant: { role: 'participant' } }],
      currentMedia: { title: '', url: '', type: 'video', currentTime: 0, isPlaying: false },
    } } });
    vi.mocked(roomAPI.getMessages).mockResolvedValue({ data: { messages: [] } });
    render(<MemoryRouter initialEntries={['/call/room1']}>
      <Routes><Route path="/call/:id" element={<CallRoom />} /></Routes>
    </MemoryRouter>);
    await screen.findByText('Test Room');
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(roomAPI.getModeration).not.toHaveBeenCalled();
    act(() => listeners.get('room:moderation-changed')?.({ roomId: 'room1', userId: 'user1', action: 'mute-chat' }));
    expect(screen.getByPlaceholderText('Your chat is muted')).toBeDisabled();
    act(() => listeners.get('room:moderation-changed')?.({ roomId: 'room1', userId: 'user1', action: 'unmute-chat' }));
    expect(screen.getByPlaceholderText('Type a message...')).toBeEnabled();
  });

  it.each([
    ['/room/room1', '/room/:id', Room],
    ['/call/room1', '/call/:id', CallRoom],
  ] as const)('leaves %s when the host closes the room', async (path, route, Page) => {
    const listeners = new Map<string, (payload: { roomId: string }) => void>();
    vi.mocked(useSocket).mockReturnValue({
      socket: { connected: true }, connected: true, emit: vi.fn(),
      on: vi.fn((event, handler) => listeners.set(event, handler)), off: vi.fn(),
    });
    vi.mocked(roomAPI.getRoom).mockResolvedValue({ data: { room: {
      id: 'room1', name: 'Test Room', host: { id: 'host' },
      participants: [{ id: 'user1', name: 'Test User', RoomParticipant: { role: 'participant' } }],
      currentMedia: { title: '', url: '', type: 'video', currentTime: 0, isPlaying: false },
    } } });
    vi.mocked(roomAPI.getMessages).mockResolvedValue({ data: { messages: [] } });
    vi.mocked(roomAPI.getPlaylist).mockResolvedValue({ data: { items: [] } });
    render(<MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={<Page />} />
        <Route path="/dashboard" element={<div>Dashboard after closure</div>} />
      </Routes>
    </MemoryRouter>);
    await screen.findByText('Test Room');
    act(() => listeners.get('room:closed')?.({ roomId: 'room1' }));
    expect(await screen.findByText('Dashboard after closure')).toBeInTheDocument();
  });
});
