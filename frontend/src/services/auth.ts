import axios, { AxiosError } from 'axios';
import { LoginRequest, RegisterRequest, AuthResponse, User } from '../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const SESSION_EXPIRED_MESSAGE = 'انتهت جلسة الدخول أو لم تعد صالحة. سجّل الدخول مجددًا بحساب الموقع ثم أعد التحليل.';
const sessionExpiredListeners = new Set<() => void>();
const isPublicAuth = (url?: string) => url === '/api/auth/login' || url === '/api/auth/register';

// This is only an early expiry check. The API must still verify the signature,
// account and permissions; decoded browser claims never authorize a request.
export function tokenIsCurrent(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now();
  } catch { return false; }
}

export function isAuthenticationError(error: unknown): boolean {
  return axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
}

function expireSession(expectedToken: string | null) {
  // A delayed 401 from an old request must not clear a newer login.
  if (localStorage.getItem('token') !== expectedToken) return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  for (const listener of sessionExpiredListeners) listener();
}

api.interceptors.request.use((request) => {
  if (isPublicAuth(request.url)) return request;
  const token = localStorage.getItem('token');
  if (!tokenIsCurrent(token)) {
    expireSession(token);
    const error = new AxiosError(SESSION_EXPIRED_MESSAGE, 'ERR_SESSION_EXPIRED', request);
    error.response = {status: 401, statusText: 'Unauthorized', headers: {}, config: request,
      data: {detail: SESSION_EXPIRED_MESSAGE}};
    throw error;
  }
  request.headers.set('Authorization', `Bearer ${token}`);
  return request;
});

api.interceptors.response.use(response => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && !isPublicAuth(error.config?.url)) {
    const authorization = error.config?.headers?.get('Authorization');
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      expireSession(authorization.slice(7));
    }
    error.response.data = {detail: SESSION_EXPIRED_MESSAGE};
  }
  return Promise.reject(error);
});

export const authService = {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const params = new URLSearchParams();
    params.append('username', credentials.username);
    params.append('password', credentials.password);
    
    
    const response = await api.post<AuthResponse>('/api/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    return response.data;
  },

  async register(data: RegisterRequest): Promise<User> {
    const response = await api.post<User>('/api/auth/register', data);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/api/auth/me', {timeout: 90000});
    return response.data;
  },

  setAuthToken(token: string) {
    localStorage.setItem('token', token);
  },

  clearAuthToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  onSessionExpired(listener: () => void) {
    sessionExpiredListeners.add(listener);
    return () => { sessionExpiredListeners.delete(listener); };
  },
};

export default api;
