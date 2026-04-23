import { create } from 'zustand';
import api from '@/lib/api';

interface AuthState {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,

  init: () => {
    const token = localStorage.getItem('token');
    if (token) set({ token });
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    set({ token: data.access_token });
  },

  register: async (email, password) => {
    const { data } = await api.post('/auth/register', { email, password });
    localStorage.setItem('token', data.access_token);
    set({ token: data.access_token });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null });
  },
}));
