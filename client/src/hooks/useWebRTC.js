import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_ORIGIN } from '../api';
import { fetchIceServers, getDisplayMedia, getUserMedia } from '../lib/webrtc';

const mediaError = (error) => {
  if (error?.name === 'NotAllowedError') return 'Camera or microphone permission was denied.';
  if (error?.name === 'NotFoundError') return 'A camera or microphone was not found.';
  if (error?.name === 'NotReadableError') return 'A camera or microphone is unavailable or already in use.';
  return error?.message || 'Unable to start the call.';
};

export const useWebRTC = ({ roomId, token }) => {
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRef = useRef(null);
  const screenRef = useRef(null);
  const peersRef = useRef(new Map());
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const sharingPendingRef = useRef(false);
  const generationRef = useRef(0);
  const connectionTimerRef = useRef(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [callError, setCallError] = useState('');
  const [startedAt, setStartedAt] = useState(null);

  const publishPeers = useCallback(() => {
    setRemoteStreams([...peersRef.current.values()].map(({ socketId, userId, userName, stream, status }) => ({
      socketId, userId, userName, stream, status,
    })));
  }, []);

  const clearPeers = useCallback(() => {
    for (const peer of peersRef.current.values()) peer.pc.close();
    peersRef.current.clear();
    publishPeers();
  }, [publishPeers]);

  const endCall = useCallback(() => {
    generationRef.current += 1;
    activeRef.current = false;
    startingRef.current = false;
    sharingPendingRef.current = false;
    clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      if (socket.connected) socket.emit('call:leave', { roomId });
      socket.disconnect();
    }
    clearPeers();
    if (screenRef.current) {
      screenRef.current.onended = null;
      screenRef.current.stop();
    }
    if (cameraRef.current) cameraRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    cameraRef.current = null;
    streamRef.current = null;
    setLocalStream(null);
    setIsCallActive(false);
    setIsScreenSharing(false);
    setConnectionStatus('idle');
    setStartedAt(null);
  }, [clearPeers, roomId]);

  useEffect(() => () => endCall(), [endCall]);

  const initLocalMedia = useCallback(async (sessionId, onJoinFailed) => {
    if (activeRef.current || startingRef.current) return false;
    const generation = ++generationRef.current;
    startingRef.current = true;
    setCallError('');
    setConnectionStatus('connecting');
    let stream;
    try {
      const iceServers = await fetchIceServers(API_ORIGIN, token);
      if (generation !== generationRef.current) return false;
      stream = await getUserMedia({ video: true, audio: true });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      streamRef.current = stream;
      cameraRef.current = stream.getVideoTracks()[0] || null;
      activeRef.current = true;
      setLocalStream(stream);
      setIsMicEnabled(true);
      setIsCameraEnabled(true);
      setIsCallActive(true);
      setStartedAt(Date.now());

      const socket = io(API_ORIGIN, { auth: { token }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      const waitForConnection = () => {
        clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = setTimeout(() => {
          if (!activeRef.current || socketRef.current !== socket) return;
          endCall();
          setCallError('Unable to connect to call signaling.');
          onJoinFailed?.();
        }, 15000);
      };
      waitForConnection();
      const sendSignal = (targetId, type, signal) => {
        if (socket.connected && activeRef.current) socket.emit('call:signal', { roomId, targetId, type, signal });
      };
      const createPeer = (participant, initiator = false) => {
        const existing = peersRef.current.get(participant.socketId);
        if (existing) return existing;
        const pc = new RTCPeerConnection({ iceServers });
        const peer = { ...participant, pc, initiator, pending: [], stream: null, status: 'connecting', restarting: false };
        peersRef.current.set(participant.socketId, peer);
        streamRef.current?.getTracks().forEach((track) => pc.addTrack(track, streamRef.current));
        pc.onicecandidate = ({ candidate }) => {
          if (candidate) sendSignal(peer.socketId, 'ice-candidate', candidate.toJSON());
        };
        pc.ontrack = ({ streams }) => {
          if (streams[0]) peer.stream = streams[0];
          publishPeers();
        };
        pc.onconnectionstatechange = () => {
          peer.status = pc.connectionState;
          publishPeers();
        };
        pc.oniceconnectionstatechange = async () => {
          if (pc.iceConnectionState !== 'failed' || !peer.initiator || peer.restarting) return;
          peer.restarting = true;
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            sendSignal(peer.socketId, 'offer', pc.localDescription.toJSON());
          } catch (error) {
            setCallError(`Unable to reconnect to ${peer.userName}: ${error.message}`);
          } finally {
            peer.restarting = false;
          }
        };
        publishPeers();
        return peer;
      };
      const offerPeer = async (participant) => {
        const peer = createPeer(participant, true);
        try {
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          sendSignal(peer.socketId, 'offer', peer.pc.localDescription.toJSON());
        } catch (error) {
          setCallError(`Unable to connect to ${participant.userName}: ${error.message}`);
        }
      };
      socket.on('connect', () => {
        if (!activeRef.current) return;
        clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = null;
        setConnectionStatus('connecting');
        socket.timeout(10000).emit('call:join', { roomId, sessionId }, (error, result) => {
          if (!activeRef.current || socketRef.current !== socket) return;
          if (error || result?.error || !Array.isArray(result?.participants)) {
            const message = result?.error || 'Unable to join the call.';
            endCall();
            setCallError(message);
            onJoinFailed?.();
            return;
          }
          setConnectionStatus('connected');
          result.participants.forEach((participant) => { void offerPeer(participant); });
        });
      });
      socket.on('call:user-joined', (participant) => createPeer(participant));
      socket.on('call:user-left', ({ socketId }) => {
        const peer = peersRef.current.get(socketId);
        if (peer) peer.pc.close();
        peersRef.current.delete(socketId);
        publishPeers();
      });
      socket.on('call:signal', async ({ from, userId, userName, signal, type }) => {
        if (!activeRef.current) return;
        const peer = createPeer({ socketId: from, userId, userName });
        try {
          if (type === 'ice-candidate') {
            if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal);
            else peer.pending.push(signal);
            return;
          }
          await peer.pc.setRemoteDescription(signal);
          for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
          if (type === 'offer') {
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            sendSignal(from, 'answer', peer.pc.localDescription.toJSON());
          }
        } catch (error) {
          setCallError(`Call negotiation failed with ${userName}: ${error.message}`);
        }
      });
      socket.on('call:error', ({ message }) => setCallError(message));
      socket.on('call:ended', ({ sessionId: endedSession }) => {
        if (endedSession === sessionId) endCall();
      });
      socket.on('disconnect', () => {
        if (!activeRef.current) return;
        clearPeers();
        setConnectionStatus('reconnecting');
        waitForConnection();
      });
      socket.on('connect_error', () => {
        if (activeRef.current) setConnectionStatus('reconnecting');
      });
      return true;
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (generation === generationRef.current) {
        if (activeRef.current) endCall();
        else setConnectionStatus('idle');
        setCallError(mediaError(error));
      }
      return false;
    } finally {
      if (generation === generationRef.current) startingRef.current = false;
    }
  }, [clearPeers, endCall, publishPeers, roomId, token]);

  const replaceVideo = useCallback(async (track, generation) => {
    if (generation !== generationRef.current) return;
    const previous = streamRef.current?.getVideoTracks()[0] || null;
    const senders = [...peersRef.current.values()]
      .map(({ pc }) => pc.getSenders().find((item) => item.track?.kind === 'video'))
      .filter(Boolean);
    try {
      await Promise.all(senders.map((sender) => sender.replaceTrack(track)));
    } catch (error) {
      try {
        await Promise.all(senders.map((sender) => sender.replaceTrack(previous)));
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], 'Video track replacement and recovery failed.');
      }
      throw error;
    }
    if (generation !== generationRef.current || !streamRef.current) return;
    const next = new MediaStream([...streamRef.current.getAudioTracks(), track]);
    streamRef.current = next;
    setLocalStream(next);
  }, []);

  const stopScreenShare = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) return;
    const generation = generationRef.current;
    try {
      if (!cameraRef.current || cameraRef.current.readyState !== 'live') {
        const stream = await getUserMedia({ video: true, audio: false });
        if (generation !== generationRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraRef.current = stream.getVideoTracks()[0];
      }
      await replaceVideo(cameraRef.current, generation);
      if (generation !== generationRef.current) return;
      screen.onended = null;
      screen.stop();
      screenRef.current = null;
      setIsScreenSharing(false);
    } catch (error) {
      setCallError(`Unable to restore the camera: ${mediaError(error)}`);
    }
  }, [replaceVideo]);

  const startScreenShare = useCallback(async () => {
    if (!activeRef.current || screenRef.current || sharingPendingRef.current) return;
    const generation = generationRef.current;
    sharingPendingRef.current = true;
    let stream;
    try {
      stream = await getDisplayMedia();
      const track = stream.getVideoTracks()[0];
      stream.getAudioTracks().forEach((item) => item.stop());
      if (!activeRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      if (!track) throw new Error('No screen was selected.');
      await replaceVideo(track, generation);
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      screenRef.current = track;
      track.onended = () => { void stopScreenShare(); };
      setIsScreenSharing(true);
    } catch (error) {
      if (stream) stream.getTracks().forEach((item) => item.stop());
      setCallError(`Screen sharing failed: ${mediaError(error)}`);
    } finally {
      if (generation === generationRef.current) sharingPendingRef.current = false;
    }
  }, [replaceVideo, stopScreenShare]);

  const switchCamera = useCallback(async () => {
    if (!activeRef.current || screenRef.current) return;
    const generation = generationRef.current;
    let stream;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      if (devices.length < 2) throw new Error('No other camera is available.');
      const current = cameraRef.current?.getSettings().deviceId;
      const index = devices.findIndex((device) => device.deviceId === current);
      const next = devices[(index + 1) % devices.length];
      if (generation !== generationRef.current) return;
      stream = await getUserMedia({ video: { deviceId: { exact: next.deviceId } }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!activeRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      track.enabled = cameraRef.current?.enabled ?? true;
      await replaceVideo(track, generation);
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      cameraRef.current?.stop();
      cameraRef.current = track;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setCallError(`Unable to switch camera: ${mediaError(error)}`);
    }
  }, [replaceVideo]);

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMicEnabled(track.enabled); }
  }, []);
  const toggleCamera = useCallback(() => {
    const track = cameraRef.current;
    if (track) { track.enabled = !track.enabled; setIsCameraEnabled(track.enabled); }
  }, []);

  return {
    isCallActive, localStream, remoteStreams, isMicEnabled, isCameraEnabled, isScreenSharing,
    connectionStatus, callError, startedAt, initLocalMedia, startScreenShare, stopScreenShare,
    switchCamera, toggleMic, toggleCamera, endCall,
  };
};
