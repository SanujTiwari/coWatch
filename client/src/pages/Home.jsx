import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiPlay, FiUsers, FiHeart, FiZap, FiMessageCircle, FiMonitor, FiMusic, FiSmile } from 'react-icons/fi';
import './Home.css';

const features = [
  { icon: <FiPlay />, title: 'Sync Playback', desc: 'Watch movies perfectly synchronized in real-time with your loved ones.' },
  { icon: <FiMessageCircle />, title: 'Live Chat', desc: 'Share reactions, thoughts, and emotions while watching together.' },
  { icon: <FiHeart />, title: 'Reactions', desc: 'Send floating emoji reactions that everyone can see instantly.' },
  { icon: <FiUsers />, title: 'Private Rooms', desc: 'Create secure rooms with unique tokens for intimate gatherings.' },
  { icon: <FiMusic />, title: 'Playlists', desc: 'Build collaborative playlists and enjoy content back to back.' },
  { icon: <FiMonitor />, title: 'Multi-Device', desc: 'Seamless experience across all your devices and browsers.' },
];

const stats = [
  { value: '< 50ms', label: 'Sync Latency' },
  { value: '10+', label: 'Users per Room' },
  { value: '∞', label: 'Watch Together' },
  { value: '24/7', label: 'Always On' },
];

const Home = () => {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <motion.div
            className="hero-content"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="hero-badge">
              <FiZap />
              <span>Real-Time Synchronized Experience</span>
            </div>
            <h1 className="hero-title">
              Feel <span className="gradient-text">Together</span>,<br />
              No Matter the <span className="gradient-text-2">Distance</span>
            </h1>
            <p className="hero-subtitle">
              Watch movies, share reels, chat live, and create memories together.
              coWatch bridges the gap between hearts separated by miles.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn btn-primary btn-lg" id="hero-cta">
                <FiPlay size={20} />
                Start Watching Together
              </Link>
              <Link to="/login" className="btn btn-secondary btn-lg" id="hero-login">
                I Have an Account
              </Link>
            </div>

            {/* Stats */}
            <div className="hero-stats">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="stat-item"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                >
                  <span className="stat-value">{stat.value}</span>
                  <span className="stat-label">{stat.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Hero visual */}
          <motion.div
            className="hero-visual"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <div className="hero-mockup">
              <div className="mockup-header">
                <div className="mockup-dots">
                  <span></span><span></span><span></span>
                </div>
                <span className="mockup-title">coWatch Room — Movie Night 🍿</span>
              </div>
              <div className="mockup-body">
                <div className="mockup-player">
                  <div className="mockup-play-btn">
                    <FiPlay size={28} />
                  </div>
                  <div className="mockup-progress">
                    <div className="mockup-progress-fill"></div>
                  </div>
                </div>
                <div className="mockup-sidebar">
                  <div className="mockup-chat-msg">
                    <span className="msg-avatar">A</span>
                    <span className="msg-text">This scene is amazing! 😍</span>
                  </div>
                  <div className="mockup-chat-msg">
                    <span className="msg-avatar alt">B</span>
                    <span className="msg-text">I know right! ❤️</span>
                  </div>
                  <div className="mockup-chat-msg">
                    <span className="msg-avatar">A</span>
                    <span className="msg-text">Pause it for a sec 😂</span>
                  </div>
                  <div className="mockup-reactions">
                    <span>❤️</span><span>😂</span><span>🔥</span><span>😍</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" id="features">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="section-badge"><FiSmile /> Why coWatch?</span>
            <h2>Everything You Need to <span className="gradient-text">Stay Connected</span></h2>
            <p>Designed for couples, friends, and communities who want more than just a video call.</p>
          </motion.div>

          <div className="features-grid">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="feature-card glass-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <motion.div
            className="cta-card glass-card"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2>Ready to Watch <span className="gradient-text">Together</span>?</h2>
            <p>Create your first room in seconds and invite your loved ones.</p>
            <Link to="/register" className="btn btn-primary btn-lg">
              <FiHeart />
              Join coWatch Free
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="brand-text">co<span className="brand-highlight">Watch</span></span>
              <p>Bridging hearts, one stream at a time.</p>
            </div>
            <div className="footer-copy">
              <p>© 2026 coWatch. Built with ❤️ for those who love from afar.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
