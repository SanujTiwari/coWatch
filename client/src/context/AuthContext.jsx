import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('cowatch_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const res = await authAPI.getMe();
      setUser(res.data.user);
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token: newToken, user: newUser } = res.data;
    localStorage.setItem('cowatch_token', newToken);
    localStorage.setItem('cowatch_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  };

  const register = async (name, email, password) => {
    const res = await authAPI.register({ name, email, password });
    const { token: newToken, user: newUser } = res.data;
    localStorage.setItem('cowatch_token', newToken);
    localStorage.setItem('cowatch_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  };

  const forgotPassword = async (email) => {
    const res = await authAPI.forgotPassword(email);
    return res.data;
  };

  const resetPassword = async (token, password) => {
    const res = await authAPI.resetPassword(token, password);
    return res.data;
  };

  const uploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await authAPI.uploadAvatar(formData);
    const updatedUser = res.data.user;
    setUser(updatedUser);
    localStorage.setItem('cowatch_user', JSON.stringify(updatedUser));
    return updatedUser;
  };

  const logout = () => {
    localStorage.removeItem('cowatch_token');
    localStorage.removeItem('cowatch_user');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('cowatch_user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      updateUser,
      uploadAvatar,
      forgotPassword,
      resetPassword,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
