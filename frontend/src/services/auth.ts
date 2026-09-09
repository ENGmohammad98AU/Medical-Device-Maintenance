import axios from 'axios';
import { LoginRequest, RegisterRequest, AuthResponse, User } from '../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authService = {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const params = new URLSearchParams();
    params.append('username', credentials.username);
    params.append('password', credentials.password);
    
    
    try {
      const response = await api.post<AuthResponse>('/api/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  async register(data: RegisterRequest): Promise<User> {
    const response = await api.post<User>('/api/auth/register', data);
    return response.data;
  },

  async getCurrentUser(token: string): Promise<User> {
    const response = await api.get<User>('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  },

  setAuthToken(token: string) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  },

  clearAuthToken() {
    delete api.defaults.headers.common['Authorization'];
  },
};

export default api;
