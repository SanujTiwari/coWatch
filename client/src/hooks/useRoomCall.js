import { useEffect, useRef } from 'react';
import { useCalls } from '../context/CallContext';

export const useRoomCall = (roomId, call) => {
  const calls = useCalls();
  const startedCall = useRef(null);
  const exitTimer = useRef(null);

  useEffect(() => {
    const request = calls.joinRequest;
    if (!request || request.roomId !== roomId || startedCall.current === request.sessionId) return undefined;
    // Let StrictMode replay effects before starting or abandoning media.
    const timer = setTimeout(() => {
      startedCall.current = request.sessionId;
      calls.consumeJoin();
      void call.initLocalMedia(request.sessionId, () => { void calls.exit(request); }).then((started) => {
        if (!started) void calls.exit(request);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [calls.joinRequest, calls.consumeJoin, calls.exit, call.initLocalMedia, roomId]);

  useEffect(() => {
    if (calls.ended?.sessionId === startedCall.current) call.endCall();
  }, [calls.ended, call.endCall]);

  useEffect(() => {
    if (exitTimer.current?.roomId === roomId) {
      clearTimeout(exitTimer.current.timer);
      exitTimer.current = null;
    }
    return () => {
      exitTimer.current = { roomId, timer: setTimeout(() => calls.exitRoom(roomId), 0) };
    };
  }, [calls.exitRoom, roomId]);

  const leaveCall = () => {
    call.endCall();
    if (startedCall.current) void calls.exit({ roomId, sessionId: startedCall.current });
  };

  return { calls, leaveCall };
};
