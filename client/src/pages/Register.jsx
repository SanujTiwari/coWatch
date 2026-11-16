import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiUserPlus } from 'react-icons/fi';
import './Auth.css';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page page">
      <motion.div className="auth-card glass-card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="auth-header">
          <div className="auth-icon"><FiUserPlus size={24} /></div>
          <h1>Create Account</h1>
          <p>Join coWatch and start watching together</p>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="name">Full Name</label>
            <div className="input-with-icon"><FiUser className="input-icon" /><input id="name" type="text" className="input-field" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required /></div>
          </div>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <div className="input-with-icon"><FiMail className="input-icon" /><input id="email" type="email" className="input-field" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          </div>
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon"><FiLock className="input-icon" /><input id="password" type="password" className="input-field" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          </div>
          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-with-icon"><FiLock className="input-icon" /><input id="confirmPassword" type="password" className="input-field" placeholder="Repeat password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg auth-btn" id="register-submit" disabled={loading}>
            {loading ? <div className="spinner" style={{width:20,height:20,borderWidth:2}}></div> : 'Create Account'}
          </button>
        </form>
        <div className="auth-footer"><p>Already have an account? <Link to="/login">Sign in</Link></p></div>
      </motion.div>
    </div>
  );
};

export default Register;
