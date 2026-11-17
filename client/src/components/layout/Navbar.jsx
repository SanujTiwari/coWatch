import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl } from '../../api';
import { motion } from 'framer-motion';
import { FiLogOut, FiUser, FiHome, FiGrid, FiUsers, FiSettings } from 'react-icons/fi';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <motion.nav
      className="navbar"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="navbar-inner container">
        <Link to="/" className="navbar-brand">
          <div className="brand-icon">
            <span className="brand-dot"></span>
            <span className="brand-dot secondary"></span>
          </div>
          <span className="brand-text">co<span className="brand-highlight">Watch</span></span>
        </Link>

        <div className="navbar-links">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="nav-link" id="nav-dashboard">
                <FiGrid size={18} />
                <span>Dashboard</span>
              </Link>
              <Link to="/friends" className="nav-link" id="nav-friends">
                <FiUsers size={18} />
                <span>Friends</span>
              </Link>
              <Link to="/profile" className="nav-link" id="nav-profile">
                <FiUser size={18} />
                <span>Profile</span>
              </Link>
              <div className="nav-user">
                <div className="user-avatar">
                  {user?.avatar ? (
                    <img src={getAvatarUrl(user.avatar)} alt={user.name} />
                  ) : (
                    <span>{user?.name?.charAt(0)?.toUpperCase()}</span>
                  )}
                  <div className="online-dot"></div>
                </div>
                <span className="user-name">{user?.name?.split(' ')[0]}</span>
              </div>
              <button onClick={handleLogout} className="btn btn-ghost nav-link" id="nav-logout">
                <FiLogOut size={18} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost nav-link" id="nav-login">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm" id="nav-register">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
