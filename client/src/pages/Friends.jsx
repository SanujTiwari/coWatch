import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { FiSearch, FiUserPlus, FiUsers, FiArrowLeft, FiClock, FiX, FiCheck } from 'react-icons/fi';
import { friendAPI, getAvatarUrl } from '../api';
import './Friends.css';

const Friends = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState('friends');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadFriends(); loadRequests(); loadBlockedUsers(); }, []);

  const loadBlockedUsers = async () => {
    try {
      const res = await friendAPI.getBlockedUsers();
      setBlockedUsers(res.data.users || []);
    } catch (err) { setError(err.response?.data?.message || 'Failed to load blocked users'); }
  };

  const loadFriends = async () => {
    setLoading(true);
    try {
      const res = await friendAPI.getFriends();
      setFriends(res.data.friends || []);
    } catch (err) { setError(err.response?.data?.message || 'Failed to load friends'); }
    finally { setLoading(false); }
  };

  const loadRequests = async () => {
    try {
      const res = await friendAPI.getPendingRequests();
      setReceived(res.data.received || []);
      setSent(res.data.sent || []);
    } catch (err) { console.error(err); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) { setUsers([]); return; }
    setSearching(true);
    try {
      const res = await friendAPI.search(query);
      setUsers(res.data.users || []);
    } catch (err) { setError(err.response?.data?.message || 'Search failed'); }
    finally { setSearching(false); }
  };

  const sendRequest = async (id) => {
    try {
      await friendAPI.sendRequest(id);
      setSuccess('Friend request sent');
      setUsers(users.map(u => u.id === id ? { ...u, requested: true } : u));
      loadRequests();
    } catch (err) { setError(err.response?.data?.message || 'Failed to send request'); }
  };

  const acceptRequest = async (id) => {
    try {
      await friendAPI.acceptRequest(id);
      setSuccess('Request accepted');
      setReceived(received.filter(u => u.id !== id));
      loadFriends();
    } catch (err) { setError(err.response?.data?.message || 'Failed to accept'); }
  };

  const rejectRequest = async (id) => {
    try {
      await friendAPI.rejectRequest(id);
      setSuccess('Request rejected');
      setReceived(received.filter(u => u.id !== id));
    } catch (err) { setError(err.response?.data?.message || 'Failed to reject'); }
  };

  const cancelRequest = async (id) => {
    try {
      await friendAPI.cancelRequest(id);
      setSent(sent.filter(u => u.id !== id));
    } catch (err) { setError(err.response?.data?.message || 'Failed to cancel'); }
  };

  const blockUser = async (id) => {
    if (!window.confirm('Block this user? They will no longer be able to join your shared rooms.')) return;
    try {
      await friendAPI.blockUser(id);
      setFriends((items) => items.filter((item) => item.id !== id));
      setUsers((items) => items.filter((item) => item.id !== id));
      await loadBlockedUsers();
      setSuccess('User blocked. Reconnect to any open rooms.');
    } catch (err) { setError(err.response?.data?.message || 'Failed to block user'); }
  };

  const unblockUser = async (id) => {
    try {
      await friendAPI.unblockUser(id);
      setBlockedUsers((items) => items.filter((item) => item.id !== id));
      setSuccess('User unblocked.');
    } catch (err) { setError(err.response?.data?.message || 'Failed to unblock user'); }
  };

  const reportUser = async (id) => {
    const description = window.prompt('Describe the issue (optional):');
    if (description === null) return;
    try {
      await friendAPI.reportUser({ reportedUserId: id, reason: 'other', description: description.slice(0, 1000) });
      setSuccess('Report submitted.');
    } catch (err) { setError(err.response?.data?.message || 'Failed to report user'); }
  };

  return (
    <div className="friends-page page">
      <div className="container">
        <div className="friends-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
          <Link to="/dashboard" className="btn btn-ghost btn-sm"><FiArrowLeft size={20} /> Back</Link>
          <div>
            <h1 style={{ fontSize:'1.5rem', fontWeight:800, margin:0 }}>Friends</h1>
            <p style={{ color:'var(--text-secondary)', margin: '4px 0 0' }}>Stay connected with the people you watch with.</p>
          </div>
        </div>

        <div className="friends-tabs" style={{ display:'flex', gap:8, marginBottom:28, borderBottom:'1px solid var(--border)', paddingBottom:12 }}>
          {['friends', 'requests', 'sent', 'blocked'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`tab-btn ${tab === t ? 'active' : ''}`}
              style={{
                background: 'transparent', border: 'none', color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                border: tab === t ? '1px solid var(--primary)' : 'transparent',
              }}
            >
              {t === 'friends' ? <><FiUsers size={16} /> Friends</> : t === 'requests' ? <><FiClock size={16} /> Requests</> : t === 'sent' ? <><FiUserPlus size={16} /> Sent</> : 'Blocked'}
            </button>
          ))}
        </div>

        {tab === 'friends' && (
          <>
            <div className="friends-list">
              {friends.length === 0 && (
                <div className="empty-state glass-card" style={{ textAlign:'center', padding:40 }}>
                  <p style={{ color:'var(--text-muted)' }}>No friends yet. Search for someone and send a request.</p>
                </div>
              )}
              {friends.map(f => (
                <div key={f.id} className="friend-row">
                  <div className="friend-avatar">
                    {f.avatar ? <img src={getAvatarUrl(f.avatar)} alt={f.name} /> : <span>{f.name?.charAt(0)}</span>}
                    <span className={`online-dot ${f.online ? 'online' : ''}`}></span>
                  </div>
                  <div className="friend-info">
                    <div className="friend-name">{f.name}</div>
                    <div className="friend-meta">{f.email}</div>
                  </div>
                  <div className="friend-status">{f.online ? 'Online' : 'Offline'}</div>
                  <Link to="/dashboard" className="btn btn-primary btn-sm">Create or join a room</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => blockUser(f.id)}>Block</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reportUser(f.id)}>Report</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'requests' && (
          <>
            <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:14, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Incoming Requests</h3>
            {received.length === 0 && <p style={{ color:'var(--text-muted)' }}>No pending requests.</p>}
            {received.map(f => (
              <div key={f.id} className="friend-row">
                <div className="friend-avatar">
                  {f.avatar ? <img src={getAvatarUrl(f.avatar)} alt={f.name} /> : <span>{f.name?.charAt(0)}</span>}
                </div>
                <div className="friend-info">
                  <div className="friend-name">{f.name}</div>
                  <div className="friend-meta">{f.email}</div>
                </div>
                <div className="friend-actions" style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => acceptRequest(f.id)}><FiCheck size={16} /> Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => rejectRequest(f.id)}><FiX size={16} /> Reject</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'sent' && (
          <>
            <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:14, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Sent Requests</h3>
            {sent.length === 0 && <p style={{ color:'var(--text-muted)' }}>No sent requests.</p>}
            {sent.map(f => (
              <div key={f.id} className="friend-row">
                <div className="friend-avatar">
                  {f.avatar ? <img src={getAvatarUrl(f.avatar)} alt={f.name} /> : <span>{f.name?.charAt(0)}</span>}
                </div>
                <div className="friend-info">
                  <div className="friend-name">{f.name}</div>
                  <div className="friend-meta">{f.email}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => cancelRequest(f.id)}>Cancel</button>
              </div>
            ))}
          </>
        )}

        {tab === 'blocked' && (
          <div className="friends-list">
            {blockedUsers.length === 0 && <p>No blocked users.</p>}
            {blockedUsers.map((blocked) => (
              <div key={blocked.id} className="friend-row">
                <div className="friend-info"><div className="friend-name">{blocked.name}</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => unblockUser(blocked.id)}>Unblock</button>
              </div>
            ))}
          </div>
        )}

        {/* Search panel */}
        <div className="search-panel glass-card" style={{ marginTop:32, padding:24 }}>
          <form onSubmit={handleSearch} className="search-form" style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div className="input-with-icon" style={{ flex:1, position:'relative' }}>
              <FiSearch className="input-icon" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
              <input
                className="input-field" style={{ paddingLeft:42 }}
                placeholder="Search users by name or email..."
                value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={searching} id="search-users">
              {searching ? 'Searching...' : <><FiSearch size={16} /> Search</>}
            </button>
          </form>
          {error && <div className="auth-error" style={{ marginTop:10 }}>{error}</div>}
          {success && <div className="auth-error" style={{ marginTop:10, background:'rgba(0,217,130,.1)', borderColor:'rgba(0,217,130,.25)', color:'#00D982' }}>{success}</div>}
          <h3 style={{ fontSize:'1rem', fontWeight:700, marginTop:20, marginBottom:12, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Users</h3>
          {searching ? <p style={{ color:'var(--text-muted)' }}>Searching...</p> :
            users.length === 0 ? <p style={{ color:'var(--text-muted)' }}>No users found.</p> :
            users.map(u => (
              <div key={u.id} className="friend-row">
                <div className="friend-avatar">
                  {u.avatar ? <img src={getAvatarUrl(u.avatar)} alt={u.name} /> : <span>{u.name?.charAt(0)}</span>}
                  <span className={`online-dot ${u.online ? 'online' : ''}`}></span>
                </div>
                <div className="friend-info">
                  <div className="friend-name">{u.name}</div>
                  <div className="friend-meta">{u.email}</div>
                </div>
                {u.requested ? (
                  <span className="badge badge-primary" style={{ fontSize:'0.7rem' }}>Requested</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => sendRequest(u.id)} id={`send-request-${u.id}`}>
                    <FiUserPlus size={16} /> Add
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => blockUser(u.id)}>Block</button>
                <button className="btn btn-ghost btn-sm" onClick={() => reportUser(u.id)}>Report</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Friends;
