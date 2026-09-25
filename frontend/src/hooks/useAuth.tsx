import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LoginRequest, AuthContextType, User } from '../types/auth';
import { authService, isAuthenticationError, SESSION_EXPIRED_MESSAGE } from '../services/auth';
import { localModelSession } from '../llm/localModelSession';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    let generation = 0;
    const clear = () => {
      localModelSession.reset();
      setToken(null); setUser(null); setIsAuthenticated(false);
    };
    const unsubscribe = authService.onSessionExpired(() => {
      clear(); setAuthError(SESSION_EXPIRED_MESSAGE);
    });
    const restore = async () => {
      const attempt = ++generation;
      const storedToken = localStorage.getItem('token');
      setIsInitializing(true);
      if (!storedToken) { setIsInitializing(false); return; }
      try {
        const currentUser = await authService.getCurrentUser();
        if (!active || attempt !== generation || localStorage.getItem('token') !== storedToken) return;
        setToken(storedToken); setUser(currentUser); setIsAuthenticated(true); setAuthError('');
      } catch (error) {
        if (!active || attempt !== generation) return;
        setAuthError(isAuthenticationError(error) ? SESSION_EXPIRED_MESSAGE
          : 'تعذر التحقق من جلسة الدخول. تحقق من الاتصال وحاول تسجيل الدخول مجددًا.');
      } finally {
        if (active && attempt === generation) setIsInitializing(false);
      }
    };
    const syncSession = (event: StorageEvent) => {
      if (event.key === 'token' || event.key === null) { clear(); void restore(); }
    };
    window.addEventListener('storage', syncSession);
    void restore();
    return () => { active = false; unsubscribe(); window.removeEventListener('storage', syncSession); };
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authService.login(credentials);
      setToken(response.access_token);
      setUser(response.user);
      setIsAuthenticated(true);
      
      localStorage.setItem('user', JSON.stringify(response.user));
      authService.setAuthToken(response.access_token);
      setAuthError('');
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localModelSession.reset();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setAuthError('');
    authService.clearAuthToken();
  };

  const contextValue: AuthContextType = {
    user,
    token,
    login,
    logout,
    isAuthenticated,
    isInitializing,
    authError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
