import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import Login from '../pages/Login';
import Register from '../pages/Register';

vi.mock('../api', () => ({
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
  },
}));

import { authAPI } from '../api';

const renderWithAuthAndRouter = (ui: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('Authentication Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Login page', () => {
    it('renders login form with email and password fields', () => {
      renderWithAuthAndRouter(<Login />);
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('shows error when login fails', async () => {
      vi.mocked(authAPI.login).mockRejectedValueOnce({
        response: { data: { message: 'Invalid credentials' } },
      });

      renderWithAuthAndRouter(<Login />);

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('calls login API with correct data', async () => {
      vi.mocked(authAPI.login).mockResolvedValueOnce({
        data: { token: 'fake-token', user: { id: '1', name: 'Test User', email: 'test@example.com' } },
      });

      renderWithAuthAndRouter(<Login />);

      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(authAPI.login).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });
  });

  describe('Register page', () => {
    it('renders registration form', () => {
      renderWithAuthAndRouter(<Register />);
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/password/i).length).toBe(2);
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    it('shows error when passwords do not match', async () => {
      renderWithAuthAndRouter(<Register />);

      const passwordInputs = screen.getAllByLabelText(/password/i);
      fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
      fireEvent.change(passwordInputs[1], { target: { value: 'different' } });
      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test User' } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });
  });
});
