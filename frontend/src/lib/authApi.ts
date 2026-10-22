import { api } from './api';

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    created_at?: string;
  };
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/api/auth/login', {
      email,
      password,
    });
    return data;
  },

  register: async (payload: RegisterPayload): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/api/auth/register', payload);
    return data;
  },

  me: async () => {
    const { data } = await api.get('/api/auth/me');
    return data;
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // silencioso — mesmo que falhe, limpamos o token local
    }
  },

  forgotPassword: async (email: string) => {
    const { data } = await api.post('/api/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (token: string, password: string) => {
    const { data } = await api.post('/api/auth/reset-password', { token, password });
    return data;
  },
};