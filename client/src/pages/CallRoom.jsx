import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useRoomCall } from '../hooks/useRoomCall';
import { roomAPI, getAvatarUrl } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSend, FiArrowLeft, FiVideo, FiMaximize, FiMinimize,
} from 'react-icons/fi';
import CallParticipant from '../components/call/CallParticipant';
import CallControls from '../components/call/CallControls';
import CallDuration from '../components/call/CallDuration';
import UnifiedMediaPlayer from '../components/media/UnifiedMediaPlayer';
import { mergeMessages } from '../lib/chat';
import './CallRoom.css';

const CallRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { emit, on, off, connected } = useSocket(token);
  const call = useWebRTC({
    roomId: id,
    token,
    userId: user?.id,
    userName: user?.name,
  });
  const { calls, leaveCall } = useRoomCall(id, call);
  const {
    isCallActive,
    localStream,
    remoteStreams,
    isMicEnabled,
    isCameraEnabled,
    isScreenSharing,
    connectionStatus,
    startedAt,
    callError: mediaError,
    startScreenShare,
    stopScreenShare,
    toggleMic,
    toggleCamera,
    switchCamera,
    endCall,
  } = call;

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInputStr, setMsgInputStr] = useState('');
  const [participants, setParticipants] = useState([]);
  const [currentMedia, setCurrentMedia] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [canControl, setCanControl] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [moderatedParticipants, setModeratedParticipants] = useState(null);
  const [moderating, setModerating] = useState(false);
  const [notification, setNotification] = useState('');
  const [callError, setCallError] = useState(null);
  const [isPip, setIsPip] = useState(false);
  const [micRequest, setMicRequest] = useState('');
  const ownChatMuted = Boolean(participants.find((p) => p.id === user?.id)?.chatMuted ||
    participants.find((p) => p.id === user?.id)?.RoomParticipant?.chatMuted);

  const videoContainerRef = useRef(null);
  const chatEndRef = useRef(null);
  const moderationRequest = useRef(0);

  const refreshModeration = useCallback(async () => {
    const request = ++moderationRequest.current;
    try {
      const response = await roomAPI.getModeration(id);
      if (request === moderationRequest.current) setModeratedParticipants(response.data.participants || []);
    } catch (error) {
      if (request === moderationRequest.current) setNotification(error.response?.data?.message || 'Unable to load moderation controls.');
    }
  }, [id]);

  useEffect(() => {
    if (canModerate) void refreshModeration();
  }, [canModerate, refreshModeration]);

  useEffect(() => {
    const loadRoom = async () => {
      try {
        const res = await roomAPI.getRoom(id);
        const r = res.data.room;
        setRoom(r);
        setCurrentMedia(r.currentMedia);
        setIsPlaying(r.currentMedia.isPlaying);
        setCurrentTime(r.currentMedia.currentTime || 0);
        setParticipants(r.participants || []);
        setCanControl(r.host?.id === user?.id);
        const membership = r.participants?.find((participant) => participant.id === user?.id);
        setCanModerate(r.host?.id === user?.id || membership?.RoomParticipant?.role === 'moderator');
        try {
          const history = await roomAPI.getMessages(id);
          setMessages((current) => mergeMessages(current, history.data.messages || []));
        } catch (error) {
          setNotification('Unable to load message history.');
        }
      } catch (err) { navigate('/dashboard'); }
    };
    loadRoom();
  }, [id]);

  useEffect(() => {
    if (!room || !connected) return;
    emit('room:join', { roomId: id });
    let cancelled = false;
    roomAPI.getMessages(id).then((response) => {
      if (!cancelled) setMessages((current) => mergeMessages(current, response.data.messages || []));
    }).catch(() => {
      if (!cancelled) setNotification('Unable to refresh message history.');
    });
    return () => { cancelled = true; emit('room:leave', { roomId: id }); };
  }, [room, id, emit, connected]);

  useEffect(() => {
    const handleMsg = (msg) => setMessages((prev) => prev.some((item) => item.id === msg.id) ? prev : [...prev, msg]);
    const handlePlay = ({ currentTime, userName }) => {
      setIsPlaying(true);
      setCurrentTime(currentTime);
      setNotification(`${userName} pressed play`);
    };
    const handlePause = ({ currentTime, userName }) => {
      setIsPlaying(false);
      setCurrentTime(currentTime);
      setNotification(`${userName} paused`);
    };
    const handleMediaChange = ({ media, userName }) => {
      setCurrentMedia(media);
      setCurrentTime(0);
      setIsPlaying(false);
      setNotification(`${userName} changed media`);
    };
    const handleParticipants = ({ participants: p }) => {
      setParticipants(p || []);
      if (canModerate) void refreshModeration();
    };
    const handleSeek = ({ currentTime: time }) => setCurrentTime(time);
    const handleState = ({ currentMedia: media }) => {
      if (media) {
        setCurrentMedia(media);
        setCurrentTime(media.currentTime || 0);
        setIsPlaying(media.isPlaying);
      }
    };
    const handleUserJoined = ({ name }) => setNotification(`${name} joined`);
    const handleUserLeft = ({ name }) => setNotification(`${name} left`);
    const handleCallUserJoined = ({ userId: uid, userName: uname, avatar }) => {
      setNotification(`${uname} joined the call`);
    };
    const handleCallUserLeft = ({ userId: uid }) => {
      setNotification(`Participant left the call`);
    };
    const handleRemoved = ({ roomId }) => {
      if (roomId !== id) return;
      endCall();
      navigate('/dashboard', { state: { notice: 'You were removed from the room.' } });
    };
    const handleClosed = ({ roomId }) => {
      if (roomId !== id) return;
      endCall();
      navigate('/dashboard', { state: { notice: 'The room was closed.' } });
    };
    const handleMicRequest = ({ roomId, userName }) => {
      if (roomId === id) setMicRequest(userName);
    };
    const handleModeration = ({ roomId, userId, action }) => {
      if (roomId !== id) return;
      setParticipants((current) => current
        .filter((participant) => action !== 'remove' || participant.id !== userId)
        .map((participant) => participant.id === userId && (action === 'mute-chat' || action === 'unmute-chat')
          ? { ...participant, chatMuted: action === 'mute-chat', RoomParticipant: { ...participant.RoomParticipant, chatMuted: action === 'mute-chat' } }
          : participant));
      if (action === 'reinstate') {
        roomAPI.getRoom(id).then((response) => setParticipants(response.data.room.participants || []))
          .catch(() => setNotification('Unable to refresh participants.'));
      }
      if (canModerate) void refreshModeration();
    };
    const handleError = ({ message }) => setNotification(message);

    on('chat:message', handleMsg);
    on('media:play', handlePlay);
    on('media:pause', handlePause);
    on('media:change', handleMediaChange);
    on('media:seek', handleSeek);
    on('media:state', handleState);
    on('room:participants', handleParticipants);
    on('room:user-joined', handleUserJoined);
    on('room:user-left', handleUserLeft);
    on('call:user-joined', handleCallUserJoined);
    on('call:user-left', handleCallUserLeft);
    on('room:removed', handleRemoved);
    on('room:closed', handleClosed);
    on('room:mic-mute-request', handleMicRequest);
    on('room:moderation-changed', handleModeration);
    on('error', handleError);

    return () => {
      off('chat:message', handleMsg);
      off('media:play', handlePlay);
      off('media:pause', handlePause);
      off('media:change', handleMediaChange);
      off('media:seek', handleSeek);
      off('media:state', handleState);
      off('room:participants', handleParticipants);
      off('room:user-joined', handleUserJoined);
      off('room:user-left', handleUserLeft);
      off('call:user-joined', handleCallUserJoined);
      off('call:user-left', handleCallUserLeft);
      off('room:removed', handleRemoved);
      off('room:closed', handleClosed);
      off('room:mic-mute-request', handleMicRequest);
      off('room:moderation-changed', handleModeration);
      off('error', handleError);
    };
  }, [on, off, id, endCall, navigate, canModerate, refreshModeration]);

  const moderateParticipant = async (userId, action) => {
    setModerating(true);
    try {
      const response = await roomAPI.moderateParticipant(id, userId, action);
      setNotification(response.data.message);
      if (action !== 'request-mic-mute') await refreshModeration();
    } catch (error) {
      setNotification(error.response?.data?.message || 'Moderation action failed.');
    } finally {
      setModerating(false);
    }
  };

  const handleStartCall = async () => {
    setCallError(null);
    await calls.start(id);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (ownChatMuted) { setNotification('Your chat is muted in this room.'); return; }
    if (!msgInputStr.trim()) return;
    if (!emit('chat:message', { roomId: id, content: msgInputStr.trim(), type: 'text' })) {
      setNotification('Message not sent: disconnected from the room.');
      return;
    }
    setMsgInputStr('');
  };

  const togglePip = async () => {
    try {
      if (!isPip && document.pictureInPictureEnabled) {
        const videoEl = document.querySelector('.main-video video');
        if (!videoEl?.requestPictureInPicture) throw new Error('Picture-in-picture is only available for supported direct videos.');
        await videoEl.requestPictureInPicture();
        setIsPip(true);
      } else if (document.exitPictureInPicture) {
        await document.exitPictureInPicture();
        setIsPip(false);
      }
    } catch (e) { setNotification(e.message || 'Picture-in-picture is unavailable.'); }
  };
  if (!room) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div className="call-room-page">
      {(callError || mediaError) && (
        <div className="call-error">
          {callError || mediaError}
          <button className="btn btn-primary" onClick={handleStartCall}>Retry Call</button>
        </div>
      )}

      <div className="call-topbar">
        <button className="btn btn-ghost" onClick={() => { leaveCall(); navigate('/dashboard'); }}>
          <FiArrowLeft /> Exit Room
        </button>
        <div className="call-room-info">
          <h2>{room.name}</h2>
          <span className="call-type-badge">{room.roomType || 'group'}</span>
        </div>
        <div className="call-status">
          {isCallActive ? (
            <span className="status-badge status-active">Call: {connectionStatus} · <CallDuration startedAt={startedAt} /></span>
          ) : calls.outgoing?.roomId === id || calls.starting ? (
            <button className="btn btn-ghost btn-sm" onClick={() => calls.outgoing ? calls.exit(calls.outgoing) : calls.cancelStart(id)}>Cancel call</button>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={calls.starting} onClick={handleStartCall}>
              <FiVideo size={16} /> Start Call
            </button>
          )}
        </div>
        {calls.outgoing?.roomId === id && <div role="status" className="glass-card">
          <p>{calls.outgoing.recipients.some((recipient) => recipient.status === 'pending') ? 'Ringing…' : 'Call responses'}</p>
          {calls.outgoing.recipients.map((recipient) => <p key={recipient.userId}>{recipient.userName}: {recipient.status}</p>)}
        </div>}
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div className="call-notification" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="call-main">
        {micRequest && <div role="status" className="glass-card">
          <p>{micRequest} requested that you mute your microphone. This is your choice.</p>
          {isCallActive && isMicEnabled && <button className="btn btn-ghost btn-sm" onClick={() => { toggleMic(); setMicRequest(''); }}>Mute my microphone</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setMicRequest('')}>Dismiss</button>
        </div>}
        <div className="call-video-area" ref={videoContainerRef}>
          <div className="main-video">
            <UnifiedMediaPlayer
              roomId={id}
              media={currentMedia}
              isPlaying={isPlaying}
              currentTime={currentTime}
              canControl={canControl}
              onPlaybackChange={(type, time) => {
                if (!emit(`media:${type}`, { roomId: id, currentTime: time })) setNotification('Playback synchronization is disconnected.');
              }}
            />
            <div className="video-overlay">
              <button className="btn btn-ghost btn-sm pip-btn" onClick={togglePip} title="Picture-in-Picture">
                {isPip ? <FiMinimize size={16} /> : <FiMaximize size={16} />}
              </button>
            </div>
          </div>

          <div className="call-grid">
            {localStream && (
              <CallParticipant
                user={user}
                stream={localStream}
                isLocal
                isMicEnabled={isMicEnabled}
                isCameraEnabled={isScreenSharing || isCameraEnabled}
              />
            )}
            {remoteStreams.map(({ socketId, userId: uid, userName, stream, status }) => {
              const participant = participants.find((p) => p.id === uid);
              return (
                <CallParticipant
                  key={socketId}
                  user={participant || { name: userName }}
                  stream={stream}
                  status={status}
                />
              );
            })}
          </div>
        </div>

        <div className="call-sidebar glass-card">
          <div className="call-controls-bar">
            {isCallActive && <CallControls
              isMicEnabled={isMicEnabled}
              isCameraEnabled={isCameraEnabled}
              isScreenSharing={isScreenSharing}
              isCallActive={isCallActive}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              onSwitchCamera={switchCamera}
              onStartScreenShare={startScreenShare}
              onStopScreenShare={stopScreenShare}
              onEndCall={leaveCall}
            />}
          </div>

          <div className="call-chat">
            <div className="chat-header">
              <h3>💬 Chat</h3>
              <span className="chat-count">{messages.length}</span>
            </div>
            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-msg ${msg.senderId === user?.id ? 'own' : ''}`}>
                  {msg.senderId !== user?.id && <div className="chat-avatar">{msg.sender?.name?.charAt(0)}</div>}
                  <div className="chat-bubble">
                    {msg.senderId !== user?.id && <span className="chat-name">{msg.sender?.name}</span>}
                    {msg.replyTo && <blockquote><strong>{msg.replyTo.sender?.name || 'Former participant'}:</strong> {msg.replyTo.content}</blockquote>}
                    <p>{msg.content}</p>
                    {msg.createdAt && <time className="chat-time" dateTime={msg.createdAt}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input-area" onSubmit={handleSendMessage}>
              <input
                className="input-field"
                disabled={ownChatMuted}
                placeholder={ownChatMuted ? 'Your chat is muted' : 'Type a message...'}
                value={msgInputStr}
                onChange={(e) => setMsgInputStr(e.target.value)}
              />
              <button type="submit" disabled={ownChatMuted} className="btn btn-primary btn-icon">
                <FiSend />
              </button>
            </form>
          </div>

          <div className="call-participants-list">
            <h3>👥 Participants ({participants.length})</h3>
            {canModerate && !moderatedParticipants && <p>Loading moderation controls...</p>}
            <div className="participants-list">
              {(canModerate ? moderatedParticipants || [] : participants).map((p) => (
                <div key={p.id} className="participant-item">
                  <div className="participant-avatar">
                    {p.avatar ? <img src={getAvatarUrl(p.avatar)} alt={p.name} /> : <span>{p.name?.charAt(0)}</span>}
                  </div>
                  <div className="participant-info">
                    <div className="participant-name">{p.name}</div>
                    <div className="participant-role">
                      {p.role || p.RoomParticipant?.role || 'participant'}
                      {(p.chatMuted || p.RoomParticipant?.chatMuted) && ' · chat muted'}
                      {p.RoomParticipant?.isRemoved && ' · removed'}
                    </div>
                    {canModerate && p.id !== user?.id && p.id !== room.host?.id &&
                      (canControl || p.RoomParticipant?.role === 'participant') && <div>
                        {p.RoomParticipant?.isRemoved
                          ? <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(p.id, 'reinstate')}>Reinstate</button>
                          : <>
                            <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(p.id, 'remove')}>Remove</button>
                            <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(p.id, p.RoomParticipant?.chatMuted ? 'unmute-chat' : 'mute-chat')}>
                              {p.RoomParticipant?.chatMuted ? 'Unmute chat' : 'Mute chat'}
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(p.id, 'request-mic-mute')}>Request mic mute</button>
                          </>}
                      </div>}
                  </div>
                  <span className={`presence-dot ${p.online ? 'online' : 'offline'}`}></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallRoom;
