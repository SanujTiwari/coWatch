import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { FiUser, FiEdit, FiCamera, FiArrowLeft, FiUsers, FiShield } from 'react-icons/fi';
import { authAPI, friendAPI, getAvatarUrl } from '../api';
import './Profile.css';

const Profile = () => {
  const { user, updateUser, uploadAvatar } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [mood, setMood] = useState(user?.mood || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    setName(user?.name || '');
    setBio(user?.bio || '');
    setMood(user?.mood || '');
  }, [user]);

  useEffect(() => {
    fetchFriends();
  }, []);

  const fetchFriends = async () => {
    try {
      const res = await friendAPI.getFriends();
      setFriends(res.data.friends || []);
    } catch (err) { console.error(err); }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) setAvatarFile(e.target.files[0]);
  };

  const handleAvatarUpload = async (e) => {
    e.preventDefault();
    if (!avatarFile) return;
    setLoading(true);
    try {
      const updated = await uploadAvatar(avatarFile);
      updateUser(updated);
      setSuccess('Avatar updated');
      setAvatarFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Avatar upload failed');
    } finally { setLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await authAPI.updateProfile({ name, bio, mood });
      updateUser(res.data.user);
      setEditing(false);
      setSuccess('Profile saved');
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    } finally { setLoading(false); }
  };

  const moods = ['', 'happy', 'relaxed', 'romantic', 'adventurous', 'nostalgic', 'energetic'];

  const avatarUrl = getAvatarUrl(user?.avatar);

  return (
    <div className="profile-page page">
      <div className="container">
        <div className="profile-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <Link to="/dashboard" className="btn btn-ghost btn-sm"><FiArrowLeft size={20} /> Back</Link>
          <div className="profile-avatar" style={{ position: 'relative' }}>
            {avatarUrl ? <img src={avatarUrl} alt={user?.name} /> : <div className="profile-avatar-fallback">{user?.name?.charAt(0)?.toUpperCase()}</div>}
            <label className="avatar-upload" style={{ cursor: 'pointer' }}>
              <FiCamera size={16} />
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{user?.name}</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>{user?.email}</p>
            <span className="badge badge-primary">{user?.online ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="profile-grid">
          <div className="profile-sidebar glass-card" style={{ padding: 24, position: 'sticky', top: 90 }}>
            <div className="sidebar-section">
              <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiUsers size={16} /> Friends
              </h3>
              <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.25rem', margin: 0 }}>{friends.length}</p>
              <Link to="/friends" className="btn btn-ghost btn-sm mt">Manage Friends</Link>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 28 }}>
            <div className="section-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Profile</h2>
              {!editing && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><FiEdit size={18} /> Edit</button>}
            </div>

            <form onSubmit={editing ? handleSave : handleAvatarUpload} className="profile-form" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {!editing && (
                <>
                  <div className="avatar-section">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} style={{ display: 'none' }} id="avatar-input" />
                    <label htmlFor="avatar-input" className="btn btn-ghost btn-sm"><FiCamera size={16} /> Change Avatar</label>
                    {avatarFile && <p style={{ color: 'var(--primary-light)', fontSize: '0.85rem' }}>New avatar selected</p>}
                    {avatarFile && <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading ? 'Uploading...' : 'Upload avatar'}</button>}
                  </div>
                </>
              )}
              {editing && (
                <>
                  <div className="input-group">
                    <label>Display Name</label>
                    <input className="input-field" value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Bio</label>
                    <textarea className="input-field" value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={200} />
                  </div>
                  <div className="input-group">
                    <label>Mood</label>
                    <select className="input-field" value={mood} onChange={e => setMood(e.target.value)}>
                      {moods.map(m => (
                        <option key={m} value={m}>{m || 'Select mood'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions" style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setName(user?.name || ''); setBio(user?.bio || ''); setMood(user?.mood || ''); }}>Cancel</button>
                  </div>
                </>
              )}
            </form>

            {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
            {success && <div className="auth-error" style={{ marginTop: 12, background: 'rgba(0,217,130,.1)', borderColor: 'rgba(0,217,130,.25)', color: '#00D982' }}>{success}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
