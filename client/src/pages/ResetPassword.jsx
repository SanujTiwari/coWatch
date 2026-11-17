import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { FiLock, FiArrowLeft } from 'react-icons/fi';
import './Auth.css';

const ResetPassword = () => {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess('Password reset successful!');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page page">
      <motion.div
        className="auth-card glass-card"
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      >
        <div className="auth-header">
          <Link to="/login" className="btn btn-ghost btn-sm"><FiArrowLeft size={20} /></Link>
          <div className="auth-icon"><FiLock size={24} /></div>
          <h1>Reset Password</h1>
          <p>Enter your new password below.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-error" style={{ background: 'rgba(0,217,130,.1)', borderColor: 'rgba(0,217,130,.25)', color: '#00D982' }}>{success}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="password">New Password</label>
            <div className="input-with-icon"><FiLock className="input-icon" /><input id="password" type="password" className="input-field" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          </div>
          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-with-icon"><FiLock className="input-icon" /><input id="confirmPassword" type="password" className="input-field" placeholder="Repeat password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={loading} id="reset-submit">
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        <div className="auth-footer"><p>Remember your password? <Link to="/login">Sign in</Link></p></div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
