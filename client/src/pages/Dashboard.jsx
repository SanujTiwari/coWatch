import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roomAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiKey, FiUsers, FiCopy, FiCheck, FiTrash2, FiPlay } from 'react-icons/fi';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedToken, setCopiedToken] = useState('');

  useEffect(() => { fetchRooms(); }, []);

  const fetchRooms = async () => {
    try {
      const res = await roomAPI.getMyRooms();
      setRooms(res.data.rooms);
    } catch (err) { console.error(err); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await roomAPI.create({ name: roomName || `${user.name}'s Room` });
      setRooms(prev => [res.data.room, ...prev]);
      setShowCreate(false); setRoomName('');
    } catch (err) { setError(err.response?.data?.message || 'Failed to create room'); }
    finally { setLoading(false); }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await roomAPI.join(joinToken);
      navigate(`/room/${res.data.room._id}`);
    } catch (err) { setError(err.response?.data?.message || 'Failed to join room'); }
    finally { setLoading(false); }
  };

  const copyToken = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 2000);
  };

  const deleteRoom = async (id) => {
    try {
      await roomAPI.deleteRoom(id);
      setRooms(prev => prev.filter(r => r._id !== id));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="dashboard-page page">
      <div className="container">
        <motion.div className="dash-header" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
          <div>
            <h1>Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0]}</span> 👋</h1>
            <p className="dash-subtitle">Create a room or join one to start watching together.</p>
          </div>
          <div className="dash-actions">
            <button className="btn btn-primary" onClick={() => { setShowCreate(true); setShowJoin(false); }} id="dash-create"><FiPlus /> Create Room</button>
            <button className="btn btn-secondary" onClick={() => { setShowJoin(true); setShowCreate(false); }} id="dash-join"><FiKey /> Join Room</button>
          </div>
        </motion.div>

        <AnimatePresence>
          {showCreate && (
            <motion.div className="dash-modal glass-card" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}>
              <h3>Create a New Room</h3>
              {error && <div className="auth-error">{error}</div>}
              <form onSubmit={handleCreate} className="modal-form">
                <input className="input-field" placeholder="Room name (optional)" value={roomName} onChange={e => setRoomName(e.target.value)} />
                <button className="btn btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create Room'}</button>
              </form>
            </motion.div>
          )}
          {showJoin && (
            <motion.div className="dash-modal glass-card" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}>
              <h3>Join a Room</h3>
              {error && <div className="auth-error">{error}</div>}
              <form onSubmit={handleJoin} className="modal-form">
                <input className="input-field" placeholder="Enter room token (e.g. ABCD-EFGH-IJKL)" value={joinToken} onChange={e => setJoinToken(e.target.value.toUpperCase())} required />
                <button className="btn btn-primary" disabled={loading}>{loading ? 'Joining...' : 'Join Room'}</button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="rooms-section">
          <h2>Your Rooms</h2>
          {rooms.length === 0 ? (
            <div className="empty-state glass-card">
              <FiUsers size={40} />
              <h3>No rooms yet</h3>
              <p>Create your first room and invite someone special!</p>
            </div>
          ) : (
            <div className="rooms-grid">
              {rooms.map((room, i) => (
                <motion.div key={room._id} className="room-card glass-card" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.05 }}>
                  <div className="room-card-header">
                    <h3>{room.name}</h3>
                    <span className="badge badge-success">{room.participants?.length || 0} online</span>
                  </div>
                  <div className="room-token">
                    <code>{room.token}</code>
                    <button className="btn btn-ghost btn-sm" onClick={() => copyToken(room.token)} title="Copy token">
                      {copiedToken === room.token ? <FiCheck color="#00D982" /> : <FiCopy />}
                    </button>
                  </div>
                  <div className="room-participants">
                    {room.participants?.slice(0, 5).map(p => (
                      <div key={p._id} className="mini-avatar" title={p.name}>{p.name?.charAt(0)}</div>
                    ))}
                    {room.participants?.length > 5 && <span className="more-count">+{room.participants.length - 5}</span>}
                  </div>
                  <div className="room-card-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/room/${room._id}`)}><FiPlay /> Enter</button>
                    {room.host?._id === user?._id && (
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteRoom(room._id)}><FiTrash2 /></button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
