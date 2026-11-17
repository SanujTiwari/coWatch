import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { FiMail, FiArrowLeft, FiLock } from 'react-icons/fi';
import './Auth.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('request');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const data = await forgotPassword(email);
      setSuccess(data.message);
      setStep('sent');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send reset email.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page page">
      <motion.div
        className="auth-card glass-card"
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      >
        <div className="auth-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/login')}>
            <FiArrowLeft size={20} /> Back
          </button>
          <div className="auth-icon"><FiMail size={24} /></div>
          <h1>{step === 'request' ? 'Forgot Password' : 'Reset Link Sent'}</h1>
          <p>{step === 'request'
            ? "Enter your email and we'll send you a reset link."
            : 'If an account exists, a reset link has been sent.'}</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-error" style={{ background: 'rgba(0,217,130,.1)', borderColor: 'rgba(0,217,130,.25)', color: '#00D982' }}>{success}</div>}

        {step === 'request' && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <div className="input-with-icon">
                <FiMail className="input-icon" />
                <input
                  id="email" type="email" className="input-field"
                  placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={loading} id="forgot-submit">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        {step === 'sent' && (
          <div className="auth-form" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <p>Check your inbox for the reset link.</p>
            <Link to="/login" className="btn btn-primary btn-lg" id="back-to-login">Back to Sign In</Link>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
