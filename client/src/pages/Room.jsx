import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { roomAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiPlay, FiPause, FiCopy, FiCheck, FiArrowLeft, FiUsers, FiFilm } from 'react-icons/fi';
import './Room.css';

const SAMPLE_VIDEOS = [
  { title: 'Big Buck Bunny', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', type: 'video' },
  { title: 'Elephant Dream', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', type: 'video' },
  { title: 'Sintel', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', type: 'video' },
  { title: 'Tears of Steel', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', type: 'video' },
];

const EMOJIS = ['❤️','😂','🔥','😍','👏','😮','💯','🎉','😢','🤩'];

const Room = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { emit, on, off } = useSocket(token);
  const videoRef = useRef(null);
  const chatEndRef = useRef(null);
  const isSyncingRef = useRef(false);

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [participants, setParticipants] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [currentMedia, setCurrentMedia] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [notification, setNotification] = useState('');

  // Load room data
  useEffect(() => {
    const loadRoom = async () => {
      try {
        const res = await roomAPI.getRoom(id);
        setRoom(res.data.room);
        setParticipants(res.data.room.participants);
        setCurrentMedia(res.data.room.currentMedia);
        const msgRes = await roomAPI.getMessages(id);
        setMessages(msgRes.data.messages);
      } catch (err) { navigate('/dashboard'); }
    };
    loadRoom();
  }, [id]);

  // Join socket room
  useEffect(() => {
    if (!room) return;
    emit('room:join', { roomId: id });
    return () => { emit('room:leave', { roomId: id }); };
  }, [room, id]);

  // Socket event listeners
  useEffect(() => {
    const handleMsg = (msg) => { setMessages(prev => [...prev, msg]); };
    const handlePlay = ({ currentTime, userName }) => {
      isSyncingRef.current = true;
      if (videoRef.current) { videoRef.current.currentTime = currentTime; videoRef.current.play(); }
      setIsPlaying(true);
      showNotif(`${userName} pressed play`);
      setTimeout(() => { isSyncingRef.current = false; }, 500);
    };
    const handlePause = ({ currentTime, userName }) => {
      isSyncingRef.current = true;
      if (videoRef.current) { videoRef.current.currentTime = currentTime; videoRef.current.pause(); }
      setIsPlaying(false);
      showNotif(`${userName} paused`);
      setTimeout(() => { isSyncingRef.current = false; }, 500);
    };
    const handleSeek = ({ currentTime, userName }) => {
      isSyncingRef.current = true;
      if (videoRef.current) videoRef.current.currentTime = currentTime;
      showNotif(`${userName} seeked`);
      setTimeout(() => { isSyncingRef.current = false; }, 500);
    };
    const handleMediaChange = ({ media, userName }) => {
      setCurrentMedia(media);
      showNotif(`${userName} changed media to "${media.title}"`);
    };
    const handleReaction = (data) => {
      setReactions(prev => [...prev, data]);
      setTimeout(() => { setReactions(prev => prev.filter(r => r.id !== data.id)); }, 3000);
    };
    const handleParticipants = ({ participants: p }) => setParticipants(p);
    const handleUserJoined = ({ user: u }) => showNotif(`${u.name} joined the room`);
    const handleUserLeft = ({ user: u }) => showNotif(`${u.name} left the room`);
    const handleState = ({ currentMedia: m }) => {
      if (m) setCurrentMedia(m);
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
    };
  }, [on, off]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const showNotif = (text) => { setNotification(text); setTimeout(() => setNotification(''), 3000); };

  const handleVideoPlay = () => {
    if (isSyncingRef.current) return;
    emit('media:play', { roomId: id, currentTime: videoRef.current?.currentTime || 0 });
    setIsPlaying(true);
  };
  const handleVideoPause = () => {
    if (isSyncingRef.current) return;
    emit('media:pause', { roomId: id, currentTime: videoRef.current?.currentTime || 0 });
    setIsPlaying(false);
  };
  const handleVideoSeek = () => {
    if (isSyncingRef.current) return;
    emit('media:seek', { roomId: id, currentTime: videoRef.current?.currentTime || 0 });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    emit('chat:message', { roomId: id, content: msgInput.trim(), type: 'text' });
    setMsgInput('');
  };

  const sendReaction = (emoji) => {
    emit('reaction:send', { roomId: id, emoji });
  };

  const changeMedia = (media) => {
    emit('media:change', { roomId: id, media });
    setCurrentMedia(media);
    setShowPlaylist(false);
  };

  const copyToken = () => {
    if (room?.token) { navigator.clipboard.writeText(room.token); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (!room) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div className="room-page">
      {/* Top bar */}
      <div className="room-topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}><FiArrowLeft /> Back</button>
        <div className="room-info">
          <h2>{room.name}</h2>
          <button className="token-badge" onClick={copyToken}>{copied ? <><FiCheck /> Copied!</> : <><FiCopy /> {room.token}</>}</button>
        </div>
        <div className="room-members">
          <FiUsers />
          <span>{participants.length}</span>
          <div className="member-avatars">
            {participants.slice(0, 4).map(p => <div key={p._id} className="mini-avatar" title={p.name}>{p.name?.charAt(0)}</div>)}
          </div>
        </div>
      </div>

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div className="room-notification" initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}>
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="room-content">
        {/* Video player */}
        <div className="player-section">
          <div className="player-wrapper">
            {currentMedia?.url ? (
              <video
                ref={videoRef}
                src={currentMedia.url}
                className="video-player"
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onSeeked={handleVideoSeek}
                controls
              />
            ) : (
              <div className="player-empty">
                <FiFilm size={48} />
                <h3>No media loaded</h3>
                <p>Choose something to watch from the playlist</p>
                <button className="btn btn-primary" onClick={() => setShowPlaylist(true)}><FiPlay /> Browse Content</button>
              </div>
            )}

            {/* Floating reactions */}
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

          {/* Reaction bar */}
          <div className="reaction-bar">
            {EMOJIS.map(emoji => (
              <button key={emoji} className="reaction-btn" onClick={() => sendReaction(emoji)}>{emoji}</button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPlaylist(!showPlaylist)}>
              <FiFilm /> Playlist
            </button>
          </div>

          {/* Playlist panel */}
          <AnimatePresence>
            {showPlaylist && (
              <motion.div className="playlist-panel glass-card" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}>
                <h3>Choose Content</h3>
                <div className="playlist-items">
                  {SAMPLE_VIDEOS.map((v, i) => (
                    <button key={i} className={`playlist-item ${currentMedia?.url === v.url ? 'active' : ''}`} onClick={() => changeMedia(v)}>
                      <FiPlay /> <span>{v.title}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat sidebar */}
        <div className="chat-section glass-card">
          <div className="chat-header"><h3>💬 Live Chat</h3></div>
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={msg._id || i} className={`chat-msg ${msg.sender?._id === user?._id ? 'own' : ''}`}>
                {msg.sender?._id !== user?._id && <div className="chat-avatar">{msg.sender?.name?.charAt(0)}</div>}
                <div className="chat-bubble">
                  {msg.sender?._id !== user?._id && <span className="chat-name">{msg.sender?.name}</span>}
                  <p>{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-input-area" onSubmit={sendMessage}>
            <input className="input-field" placeholder="Type a message..." value={msgInput} onChange={e => setMsgInput(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-icon"><FiSend /></button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Room;
