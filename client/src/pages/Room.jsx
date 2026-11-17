import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useRoomCall } from '../hooks/useRoomCall';
import { roomAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSend, FiCopy, FiCheck, FiArrowLeft, FiUsers, FiFilm,
  FiPlus, FiYoutube, FiTv, FiList, FiMaximize,
} from 'react-icons/fi';
import UnifiedMediaPlayer from '../components/media/UnifiedMediaPlayer';
import CallControls from '../components/call/CallControls';
import CallParticipant from '../components/call/CallParticipant';
import CallDuration from '../components/call/CallDuration';
import { detectProvider } from '../lib/mediaProviders';
import { mergeMessages } from '../lib/chat';
import './Room.css';

const EMOJIS = ['❤️','😂','🔥','😍','👏','😮','💯','🎉','😢','🤩','🍿','🥰'];

const Room = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { emit, on, off, connected } = useSocket(token);
  const call = useWebRTC({ roomId: id, token });
  const { calls, leaveCall } = useRoomCall(id, call);
  const chatEndRef = useRef(null);
  const playerContainerRef = useRef(null);
  const typingTimer = useRef(null);
  const playlistRequest = useRef(0);
  const moderationRequest = useRef(0);

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [currentMedia, setCurrentMedia] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [notification, setNotification] = useState('');
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaTitle, setNewMediaTitle] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [canManagePlaylist, setCanManagePlaylist] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [moderatedParticipants, setModeratedParticipants] = useState(null);
  const [moderating, setModerating] = useState(false);
  const [micRequest, setMicRequest] = useState('');
  const ownChatMuted = Boolean(participants.find((p) => p.id === user?.id)?.chatMuted ||
    participants.find((p) => p.id === user?.id)?.RoomParticipant?.chatMuted);

  const refreshPlaylist = useCallback(async () => {
    const request = ++playlistRequest.current;
    try {
      const response = await roomAPI.getPlaylist(id);
      if (request === playlistRequest.current) setPlaylist(response.data.items || []);
    } catch (error) {
      if (request === playlistRequest.current) setNotification('Unable to load the playlist.');
    }
  }, [id]);

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
    if (canManagePlaylist) void refreshModeration();
  }, [canManagePlaylist, refreshModeration]);

  // Load room data
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
        const membership = r.participants?.find((p) => p.id === user?.id);
        const host = r.host?.id === user?.id;
        setIsHost(host);
        setCanManagePlaylist(host || membership?.RoomParticipant?.role === 'moderator');
        try {
          const history = await roomAPI.getMessages(id);
          setMessages((current) => mergeMessages(current, history.data.messages || []));
        } catch (error) {
          setNotification('Unable to load message history.');
        }
        await refreshPlaylist();
      } catch (err) { navigate('/dashboard'); }
    };
    loadRoom();
  }, [id, refreshPlaylist]);

  // Join socket room
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

  // Socket event listeners
  useEffect(() => {
    const handleMsg = (msg) => {
      setMessages((prev) => prev.some((item) => item.id === msg.id) ? prev : [...prev, msg]);
    };
    const handlePlay = ({ currentTime, userName }) => {
      setCurrentTime(currentTime);
      setIsPlaying(true);
      setNotification(`${userName} pressed play`);
    };
    const handlePause = ({ currentTime, userName }) => {
      setCurrentTime(currentTime);
      setIsPlaying(false);
      setNotification(`${userName} paused`);
    };
    const handleSeek = ({ currentTime, userName }) => {
      setCurrentTime(currentTime);
      setNotification(`${userName} seeked`);
    };
    const handleMediaChange = ({ media, userName }) => {
      setCurrentMedia(media);
      setCurrentTime(0);
      setIsPlaying(false);
      setNotification(`${userName} changed media to "${media.title}"`);
    };
    const handleReaction = (data) => {
      setReactions(prev => [...prev, data]);
      setTimeout(() => { setReactions(prev => prev.filter(r => r.id !== data.id)); }, 3000);
    };
    const handleParticipants = ({ participants: p }) => {
      setParticipants(p || []);
      if (canManagePlaylist) void refreshModeration();
    };
    const handleUserJoined = ({ name }) => setNotification(`${name} joined the room`);
    const handleUserLeft = ({ id: userId, name }) => {
      setNotification(`${name} left the room`);
      setTypingUsers((users) => {
        const next = { ...users };
        delete next[userId];
        return next;
      });
    };
    const handleState = ({ currentMedia: m }) => {
      if (m) { setCurrentMedia(m); setIsPlaying(m.isPlaying); setCurrentTime(m.currentTime || 0); }
    };
    const handleTyping = ({ userId, userName }) => setTypingUsers((users) => ({ ...users, [userId]: userName }));
    const handleStopTyping = ({ userId }) => setTypingUsers((users) => {
      const next = { ...users };
      delete next[userId];
      return next;
    });
    const handleError = ({ message }) => setNotification(message);
    const handlePlaylistChange = () => { void refreshPlaylist(); };
    const handleModeration = ({ roomId, userId, action }) => {
      if (roomId !== id) return;
      setParticipants((current) => current
        .filter((participant) => action !== 'remove' || participant.id !== userId)
        .map((participant) => participant.id === userId
          ? { ...participant, chatMuted: action === 'mute-chat' ? true : action === 'unmute-chat' ? false : participant.chatMuted,
            RoomParticipant: { ...participant.RoomParticipant, chatMuted: action === 'mute-chat' ? true : action === 'unmute-chat' ? false : participant.RoomParticipant?.chatMuted } }
          : participant));
      if (action === 'reinstate') {
        roomAPI.getRoom(id).then((response) => setParticipants(response.data.room.participants || []))
          .catch(() => setNotification('Unable to refresh participants.'));
      }
      if (canManagePlaylist) void refreshModeration();
    };
    const handleRemoved = ({ roomId }) => {
      if (roomId !== id) return;
      call.endCall();
      navigate('/dashboard', { state: { notice: 'You were removed from the room.' } });
    };
    const handleClosed = ({ roomId }) => {
      if (roomId !== id) return;
      call.endCall();
      navigate('/dashboard', { state: { notice: 'The room was closed.' } });
    };
    const handleMicRequest = ({ roomId, userName }) => {
      if (roomId === id) setMicRequest(userName);
    };

    on('chat:message', handleMsg);
    on('media:play', handlePlay);
    on('media:pause', handlePause);
    on('media:seek', handleSeek);
    on('media:change', handleMediaChange);
    on('reaction:received', handleReaction);
    on('room:participants', handleParticipants);
    on('room:user-joined', handleUserJoined);
    on('room:user-left', handleUserLeft);
    on('media:state', handleState);
    on('chat:typing', handleTyping);
    on('chat:stop-typing', handleStopTyping);
    on('error', handleError);
    on('playlist:changed', handlePlaylistChange);
    on('room:moderation-changed', handleModeration);
    on('room:removed', handleRemoved);
    on('room:closed', handleClosed);
    on('room:mic-mute-request', handleMicRequest);

    return () => {
      off('chat:message', handleMsg);
      off('media:play', handlePlay);
      off('media:pause', handlePause);
      off('media:seek', handleSeek);
      off('media:change', handleMediaChange);
      off('reaction:received', handleReaction);
      off('room:participants', handleParticipants);
      off('room:user-joined', handleUserJoined);
      off('room:user-left', handleUserLeft);
      off('media:state', handleState);
      off('chat:typing', handleTyping);
      off('chat:stop-typing', handleStopTyping);
      off('error', handleError);
      off('playlist:changed', handlePlaylistChange);
      off('room:moderation-changed', handleModeration);
      off('room:removed', handleRemoved);
      off('room:closed', handleClosed);
      off('room:mic-mute-request', handleMicRequest);
    };
  }, [on, off, refreshPlaylist, refreshModeration, canManagePlaylist, call.endCall, id, navigate]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => clearTimeout(typingTimer.current), []);
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(''), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const handlePlaybackChange = (type, time) => {
    if (!emit(`media:${type}`, { roomId: id, currentTime: time })) {
      setNotification('Playback could not be synchronized: disconnected from the room.');
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (ownChatMuted) { setNotification('Your chat is muted in this room.'); return; }
    if (!msgInput.trim()) return;
    if (!emit('chat:message', { roomId: id, content: msgInput.trim(), type: 'text', replyToId: replyTo?.id })) {
      setNotification('Message not sent: disconnected from the room.');
      return;
    }
    emit('chat:stop-typing', { roomId: id });
    clearTimeout(typingTimer.current);
    setMsgInput('');
    setReplyTo(null);
  };

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

  const sendReaction = (emoji) => {
    if (!emit('reaction:send', { roomId: id, emoji })) setNotification('Reaction not sent: disconnected from the room.');
  };

  const changeMedia = (media) => {
    if (!isHost) { setNotification('Only the host can change media'); return; }
    const normalized = { title: media.title, url: media.url, type: detectProvider(media.url) };
    if (!emit('media:change', { roomId: id, media: normalized })) {
      setNotification('Media could not be changed: disconnected from the room.');
      return;
    }
    setShowPlaylist(false);
    setShowAddMedia(false);
  };

  const addMediaFromUrl = async (e) => {
    e.preventDefault();
    if (!newMediaUrl.trim()) return;
    const url = newMediaUrl.trim();
    const title = newMediaTitle.trim() || url;
    const type = detectProvider(url);
    try {
      await roomAPI.addToPlaylist(id, { title, url, type });
      await refreshPlaylist();
      setNotification('Added to playlist');
      setNewMediaUrl(''); setNewMediaTitle(''); setShowAddMedia(false);
    } catch (err) {
      setNotification(err.response?.data?.message || 'Failed to add media');
    }
  };

  const reorderPlaylist = async (index, direction) => {
    const next = [...playlist];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await roomAPI.reorderPlaylist(id, next.map((item) => item.id));
      await refreshPlaylist();
    } catch (error) {
      setNotification(error.response?.data?.message || 'Unable to reorder the playlist.');
      await refreshPlaylist();
    }
  };

  const removePlaylistItem = async (itemId) => {
    try {
      await roomAPI.removeFromPlaylist(id, itemId);
      await refreshPlaylist();
    } catch (error) {
      setNotification(error.response?.data?.message || 'Unable to remove the playlist item.');
    }
  };

  const copyToken = () => {
    if (room?.token) {
      if (!navigator.clipboard?.writeText) return setNotification('Clipboard access is unavailable.');
      navigator.clipboard.writeText(room.token).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => setNotification('Unable to copy the room token.'));
    }
  };
  const copyInvite = () => {
    if (!navigator.clipboard?.writeText) return setNotification('Clipboard access is unavailable.');
    const link = `${window.location.origin}/invite/${encodeURIComponent(room.token)}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    }).catch(() => setNotification('Unable to copy the invite link.'));
  };
  const enterFullscreen = async () => {
    if (!playerContainerRef.current?.requestFullscreen) {
      setNotification('Fullscreen is unavailable.');
      return;
    }
    try { await playerContainerRef.current.requestFullscreen(); }
    catch { setNotification('Fullscreen is unavailable.'); }
  };
  const togglePictureInPicture = async () => {
    try {
      const video = playerContainerRef.current?.querySelector('video');
      if (!document.pictureInPictureEnabled || !video?.requestPictureInPicture) {
        setNotification('Picture-in-picture is only available for supported direct videos.');
        return;
      }
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch (error) {
      setNotification(error.message || 'Picture-in-picture is unavailable.');
    }
  };

  if (!room) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div className="room-page">
      <div className="room-topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}><FiArrowLeft /> Back</button>
        <div className="room-info">
          <h2>{room.name}</h2>
          <span className="room-type-badge">{room.roomType || 'group'}</span>
          <button className="token-badge" onClick={copyToken}>{copied ? <><FiCheck /> Copied!</> : <><FiCopy /> {room.token}</>}</button>
          <button className="token-badge" onClick={copyInvite}>{copiedInvite ? 'Invite copied' : 'Copy invite link'}</button>
          {!connected && <span className="room-type-badge">Reconnecting…</span>}
        </div>
        <div className="room-members">
          <FiUsers />
          <span>{participants.length}</span>
          <div className="member-avatars">
            {participants.slice(0, 4).map(p => <div key={p.id} className="mini-avatar" title={p.name}>{p.name?.charAt(0)}</div>)}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div className="room-notification" initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}>
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="room-content">
        <div className="player-section">
          <div className="player-wrapper" ref={playerContainerRef}>
            <UnifiedMediaPlayer
              roomId={id}
              media={currentMedia}
              isPlaying={isPlaying}
              currentTime={currentTime}
              canControl={isHost}
              onPlaybackChange={handlePlaybackChange}
            />
            <div className="floating-reactions">
              <AnimatePresence>
                {reactions.map(r => (
                  <motion.span key={r.id} className="floating-emoji" initial={{ opacity:1, y:0, x: Math.random()*200-100 }} animate={{ opacity:0, y:-200 }} exit={{ opacity:0 }} transition={{ duration:2.5, ease:'easeOut' }}>
                    {r.emoji}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="media-controls">
            <div className="media-current">
              {currentMedia?.url ? (
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <span className="media-label">{currentMedia.type === 'youtube' ? <FiYoutube size={16} /> : currentMedia.type === 'reel' ? <FiTv size={16} /> : <FiFilm size={16} />}</span>
                  <span className="media-title">{currentMedia.title}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddMedia(!showAddMedia)}>
                    <FiPlus /> Add Media
                  </button>
                </div>
              ) : (
                <div className="player-empty">
                  <FiFilm size={48} />
                  <h3>No media loaded</h3>
                  <p>Choose something to watch from the playlist</p>
                  <button className="btn btn-primary" onClick={() => setShowAddMedia(true)}><FiPlus /> Add Media</button>
                </div>
              )}
            </div>
            <div className="media-actions">
              <button className="btn btn-icon" onClick={enterFullscreen} title="Fullscreen">
                <FiMaximize size={18} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={togglePictureInPicture}>Picture-in-picture</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPlaylist(!showPlaylist)}>
                <FiList size={16} /> Playlist
              </button>
              <div className="reaction-bar">
                {EMOJIS.map(emoji => (
                  <button key={emoji} className="reaction-btn" onClick={() => sendReaction(emoji)}>{emoji}</button>
                ))}
              </div>
            </div>
          </div>

          <section className="room-call glass-card" aria-label="Video call">
            <div className="room-call-header">
              <h3>Video call</h3>
              {call.isCallActive ? (
                <span>Signaling: {call.connectionStatus} · <CallDuration startedAt={call.startedAt} /></span>
              ) : calls.outgoing?.roomId === id || calls.starting ? (
                <button className="btn btn-ghost btn-sm" onClick={() => calls.outgoing ? calls.exit(calls.outgoing) : calls.cancelStart(id)}>Cancel call</button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={calls.starting || call.connectionStatus === 'connecting'} onClick={() => calls.start(id)}>
                  {calls.starting || call.connectionStatus === 'connecting' ? 'Connecting…' : 'Start call'}
                </button>
              )}
            </div>
            {calls.outgoing?.roomId === id && <div role="status">
              <p>{calls.outgoing.recipients.some((recipient) => recipient.status === 'pending') ? 'Ringing…' : 'Call responses'}</p>
              {calls.outgoing.recipients.map((recipient) => <p key={recipient.userId}>{recipient.userName}: {recipient.status}</p>)}
            </div>}
            {call.callError && <p className="room-call-error" role="alert">{call.callError}</p>}
            {micRequest && <div role="status">
              <p>{micRequest} requested that you mute your microphone. This is your choice.</p>
              {call.isCallActive && call.isMicEnabled && <button className="btn btn-ghost btn-sm" onClick={() => { call.toggleMic(); setMicRequest(''); }}>Mute my microphone</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => setMicRequest('')}>Dismiss</button>
            </div>}
            {call.isCallActive && (
              <>
                <div className="room-call-grid">
                  <CallParticipant user={user} stream={call.localStream} isLocal isMicEnabled={call.isMicEnabled} isCameraEnabled={call.isScreenSharing || call.isCameraEnabled} />
                  {call.remoteStreams.map((peer) => (
                    <CallParticipant key={peer.socketId} user={{ name: peer.userName }} stream={peer.stream} status={peer.status} />
                  ))}
                </div>
                <CallControls
                  isMicEnabled={call.isMicEnabled}
                  isCameraEnabled={call.isCameraEnabled}
                  isScreenSharing={call.isScreenSharing}
                  onToggleMic={call.toggleMic}
                  onToggleCamera={call.toggleCamera}
                  onSwitchCamera={call.switchCamera}
                  onStartScreenShare={call.startScreenShare}
                  onStopScreenShare={call.stopScreenShare}
                  onEndCall={leaveCall}
                />
              </>
            )}
          </section>

          <details className="room-participant-list glass-card">
            <summary>Participants ({participants.length})</summary>
            {canManagePlaylist && !moderatedParticipants && <p>Loading moderation controls...</p>}
            <ul>
              {(canManagePlaylist ? moderatedParticipants || [] : participants).map((participant) => (
                <li key={participant.id}>
                  {participant.name} · {participant.role || participant.RoomParticipant?.role || 'participant'} · {participant.online ? 'online' : 'offline'}
                  {(participant.chatMuted || participant.RoomParticipant?.chatMuted) && ' · chat muted'}
                  {participant.RoomParticipant?.isRemoved && ' · removed'}
                  {canManagePlaylist && participant.id !== user?.id && participant.id !== room.host?.id &&
                    (isHost || participant.RoomParticipant?.role === 'participant') && <div>
                      {participant.RoomParticipant?.isRemoved
                        ? <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(participant.id, 'reinstate')}>Reinstate</button>
                        : <>
                          <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(participant.id, 'remove')}>Remove</button>
                          <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(participant.id, participant.RoomParticipant?.chatMuted ? 'unmute-chat' : 'mute-chat')}>
                            {participant.RoomParticipant?.chatMuted ? 'Unmute chat' : 'Mute chat'}
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={moderating} onClick={() => moderateParticipant(participant.id, 'request-mic-mute')}>Request mic mute</button>
                        </>}
                    </div>}
                </li>
              ))}
            </ul>
          </details>

          {showAddMedia && (
            <div className="add-media-panel glass-card" style={{ margin:'12px 16px' }}>
              <h3 style={{ fontSize:'0.9rem', marginBottom:12, color:'var(--text-primary)' }}>Add Media</h3>
              <form onSubmit={addMediaFromUrl} className="add-media-form" style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <input
                  className="input-field" style={{ flex:1, minWidth:200 }}
                  placeholder="YouTube, Instagram, or direct video URL"
                  value={newMediaUrl} onChange={e => setNewMediaUrl(e.target.value)} required
                />
                <input
                  className="input-field" style={{ minWidth:150 }}
                  placeholder="Title (optional)"
                  value={newMediaTitle} onChange={e => setNewMediaTitle(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">Add</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddMedia(false)}>Cancel</button>
              </form>
              <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:8 }}>Supported: YouTube, direct MP4/WebM URLs. Instagram reels display as embed previews.</p>
            </div>
          )}

          <AnimatePresence>
            {showPlaylist && (
              <div className="playlist-panel glass-card" style={{ margin:'12px 16px', maxHeight: 300, overflowY:'auto' }}>
                <h3 style={{ fontSize:'0.95rem', marginBottom:12 }}>Playlist</h3>
                <div className="playlist-items">
                  {playlist.length === 0 && <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>Playlist is empty.</p>}
                  {playlist.map((item, i) => (
                    <div key={item.id} className={`playlist-item ${currentMedia?.url === item.url ? 'active' : ''}`}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:'0.85rem', color: currentMedia?.url === item.url ? 'var(--primary-light)' : 'var(--text-secondary)' }}>{item.title}</span>
                        <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{item.type}</span>
                      </div>
                      {canManagePlaylist && <div>
                        {isHost && <button className="btn btn-ghost btn-sm" onClick={() => changeMedia(item)}>Play</button>}
                        <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => reorderPlaylist(i, -1)} aria-label={`Move ${item.title} up`}>Up</button>
                        <button className="btn btn-ghost btn-sm" disabled={i === playlist.length - 1} onClick={() => reorderPlaylist(i, 1)} aria-label={`Move ${item.title} down`}>Down</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => removePlaylistItem(item.id)} aria-label={`Remove ${item.title}`}>Remove</button>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="chat-section glass-card">
          <div className="chat-header"><h3>💬 Live Chat</h3></div>
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`chat-msg ${msg.sender?.id === user?.id ? 'own' : ''}`}>
                {msg.sender?.id !== user?.id && <div className="chat-avatar">{msg.sender?.name?.charAt(0)}</div>}
                <div className="chat-bubble">
                  {msg.sender?.id !== user?.id && <span className="chat-name">{msg.sender?.name}</span>}
                  {msg.replyTo && <blockquote>
                    <strong>{msg.replyTo.sender?.name || 'Former participant'}:</strong> {msg.replyTo.content}
                  </blockquote>}
                  <p>{msg.content}</p>
                  {msg.createdAt && <time className="chat-time" dateTime={msg.createdAt}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyTo(msg)}>Reply</button>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {Object.values(typingUsers).length > 0 && <p className="chat-typing">{Object.values(typingUsers).join(', ')} typing…</p>}
          {replyTo && <p className="chat-typing">
            Replying to {replyTo.sender?.name || 'Former participant'}: {replyTo.content}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyTo(null)}>Cancel</button>
          </p>}
          <form className="chat-input-area" onSubmit={sendMessage}>
            <input className="input-field" disabled={ownChatMuted} placeholder={ownChatMuted ? 'Your chat is muted' : 'Type a message...'} maxLength={1000} value={msgInput} onChange={e => {
              setMsgInput(e.target.value);
              emit('chat:typing', { roomId: id });
              clearTimeout(typingTimer.current);
              typingTimer.current = setTimeout(() => emit('chat:stop-typing', { roomId: id }), 1500);
            }} />
            <button type="submit" disabled={ownChatMuted} className="btn btn-primary btn-icon"><FiSend /></button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Room;
