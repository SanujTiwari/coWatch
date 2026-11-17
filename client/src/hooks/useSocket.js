import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';
import { API_ORIGIN } from '../api';

export const useSocket = (token) => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    socketRef.current = io(API_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current.on('connect', () => setConnected(true));
    socketRef.current.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') socketRef.current?.connect();
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token]);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
      return true;
    }
    return false;
  }, []);

  const on = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
  }, []);

  const off = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler);
    }
  }, []);

  return { socket: socketRef.current, connected, emit, on, off };
};
