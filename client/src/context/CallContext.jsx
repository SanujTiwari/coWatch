import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { API_ORIGIN, getAvatarUrl } from '../api';
import { useAuth } from './AuthContext';
import '../components/call/IncomingCall.css';

const CallContext = createContext(null);

export const useCalls = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCalls must be used within CallProvider');
  return context;
};

export const CallProvider = ({ children }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const socketRef = useRef(null);
  const outgoingRef = useRef(null);
  const incomingRef = useRef(null);
  const activeRef = useRef(null);
  const startingRef = useRef(null);
  const respondingRef = useRef(false);
  const endedRef = useRef(new Set());
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [joinRequest, setJoinRequest] = useState(null);
  const [ended, setEnded] = useState(null);
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const [responding, setResponding] = useState(false);

  const setOutgoingCall = useCallback((value) => {
    outgoingRef.current = value;
    setOutgoing(value);
  }, []);
  const setIncomingCall = useCallback((value) => {
    incomingRef.current = value;
    setIncoming(value);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API_ORIGIN, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.timeout(10000).emit('call:subscribe', {}, (error, result) => {
        if (error || !result?.ok) setNotice('Call notifications could not be connected.');
      });
    });
    socket.on('call:incoming', (invitation) => {
      if (!endedRef.current.has(invitation.sessionId) && incomingRef.current?.sessionId !== invitation.sessionId) {
        setIncomingCall(invitation);
      }
    });
    socket.on('call:invite-update', ({ sessionId, userId, status }) => {
      const current = outgoingRef.current;
      if (!current || current.sessionId !== sessionId) return;
      const next = {
        ...current,
        recipients: current.recipients.map((recipient) =>
          recipient.userId === userId ? { ...recipient, status } : recipient),
      };
      setOutgoingCall(next);
      if (status === 'accepted' && !activeRef.current) {
        activeRef.current = { sessionId, roomId: current.roomId };
        setJoinRequest(activeRef.current);
      }
    });
    socket.on('call:ended', (event) => {
      endedRef.current.add(event.sessionId);
      if (endedRef.current.size > 100) endedRef.current.delete(endedRef.current.values().next().value);
      const relevant = incomingRef.current?.sessionId === event.sessionId ||
        outgoingRef.current?.sessionId === event.sessionId || activeRef.current?.sessionId === event.sessionId;
      if (incomingRef.current?.sessionId === event.sessionId) setIncomingCall(null);
      if (outgoingRef.current?.sessionId === event.sessionId) setOutgoingCall(null);
      if (activeRef.current?.sessionId === event.sessionId) activeRef.current = null;
      setJoinRequest((current) => current?.sessionId === event.sessionId ? null : current);
      if (relevant) {
        setEnded(event);
        setNotice(event.reason);
      }
    });
    socket.on('disconnect', () => {
      if (outgoingRef.current || activeRef.current) setNotice('The call disconnected.');
      setIncomingCall(null);
      setOutgoingCall(null);
      if (activeRef.current) {
        setEnded({ ...activeRef.current, reason: 'Call notifications disconnected.' });
        activeRef.current = null;
      }
      setJoinRequest(null);
    });
    socket.on('connect_error', () => setNotice('Call notifications are disconnected.'));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, setIncomingCall, setOutgoingCall]);

  const request = useCallback(async (event, payload) => {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error('Call notifications are disconnected.');
    const result = await socket.timeout(10000).emitWithAck(event, payload);
    if (result?.error) {
      const details = result.recipients?.map((entry) => `${entry.userName}: ${entry.status}`).join(', ');
      throw new Error(details ? `${result.error}. ${details}` : result.error);
    }
    return result;
  }, []);

  const start = useCallback(async (roomId) => {
    if (startingRef.current || outgoingRef.current || activeRef.current) return;
    const pending = { roomId, cancelled: false };
    startingRef.current = pending;
    setStarting(true);
    setNotice('');
    try {
      const result = await request('call:invite', { roomId });
      if (pending.cancelled) await request('call:exit', { roomId, sessionId: result.sessionId });
      else if (!endedRef.current.has(result.sessionId)) setOutgoingCall(result);
    } catch (error) {
      if (socketRef.current?.connected) socketRef.current.emit('call:cancel-start', { roomId });
      if (!pending.cancelled) setNotice(error.message || 'Unable to start the call.');
    } finally {
      if (startingRef.current === pending) startingRef.current = null;
      setStarting(false);
    }
  }, [request, setOutgoingCall]);

  const respond = useCallback(async (accept) => {
    if (!incoming || respondingRef.current) return;
    respondingRef.current = true;
    setResponding(true);
    try {
      await request('call:respond', { roomId: incoming.roomId, sessionId: incoming.sessionId, accept });
      setIncomingCall(null);
      if (accept && !endedRef.current.has(incoming.sessionId)) {
        activeRef.current = { roomId: incoming.roomId, sessionId: incoming.sessionId };
        setJoinRequest(activeRef.current);
        if (location.pathname !== `/room/${incoming.roomId}` && location.pathname !== `/call/${incoming.roomId}`) {
          navigate(`/room/${incoming.roomId}`);
        }
      }
    } catch (error) {
      setIncomingCall(null);
      setNotice(error.message || 'Unable to respond to the call.');
    } finally {
      respondingRef.current = false;
      setResponding(false);
    }
  }, [incoming, location.pathname, navigate, request, setIncomingCall]);

  const exit = useCallback(async (session) => {
    if (!session) return;
    try {
      await request('call:exit', { roomId: session.roomId, sessionId: session.sessionId });
    } catch (error) {
      setNotice(error.message || 'Unable to end the call.');
    }
  }, [request]);

  const consumeJoin = useCallback(() => setJoinRequest(null), []);
  const cancelStart = useCallback((roomId) => {
    if (startingRef.current?.roomId !== roomId) return;
    startingRef.current.cancelled = true;
    if (socketRef.current?.connected) socketRef.current.emit('call:cancel-start', { roomId });
  }, []);
  const exitRoom = useCallback((roomId) => {
    cancelStart(roomId);
    const session = outgoingRef.current?.roomId === roomId ? outgoingRef.current :
      activeRef.current?.roomId === roomId ? activeRef.current : null;
    if (session) void exit(session);
  }, [cancelStart, exit]);

  return (
    <CallContext.Provider value={{ incoming, outgoing, joinRequest, ended, notice, starting, start, cancelStart, exit, exitRoom, consumeJoin }}>
      {children}
      {incoming && <section className="incoming-call glass-card" role="dialog" aria-label="Incoming call">
        <div className="incoming-call-person">
          {incoming.caller.avatar
            ? <img src={getAvatarUrl(incoming.caller.avatar)} alt="" />
            : <span aria-hidden="true">{incoming.caller.name?.charAt(0)}</span>}
          <div><strong>{incoming.caller.name}</strong><p>Incoming call in {incoming.roomName}</p></div>
        </div>
        <div className="incoming-call-actions">
          <button className="btn btn-primary btn-sm" disabled={responding} onClick={() => respond(true)}>Accept</button>
          <button className="btn btn-ghost btn-sm" disabled={responding} onClick={() => respond(false)}>Reject</button>
        </div>
      </section>}
      {notice && !incoming && <div className="incoming-call glass-card" role="status">
        <p>{notice}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>Dismiss</button>
      </div>}
    </CallContext.Provider>
  );
};
