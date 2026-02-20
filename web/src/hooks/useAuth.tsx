import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@/types';
import { authService } from '@/services/api';
import { setLanguage, type SupportedLanguage } from '@/i18n';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mh_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      console.log('[AuthProvider] No token found');
      setIsLoading(false);
      return;
    }
    console.log('[AuthProvider] Fetching user with token:', token.slice(0, 20) + '...');
    authService
      .me()
      .then((data) => {
        console.log('[AuthProvider] User loaded:', {
          id: data?.id,
          email: data?.email,
          isAdmin: data?.is_admin,
          username: data?.username,
        });
        setUser(data);
        if (data?.preferred_language) {
          setLanguage(data.preferred_language as SupportedLanguage);
        }
      })
      .catch((err) => {
        console.error('[AuthProvider] Failed to fetch user:', err);
        localStorage.removeItem('mh_token');
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authService.login(username, password);
    localStorage.setItem('mh_token', res.token);
    setToken(res.token);
    setUser(res.user);
    if (res.user?.preferred_language) {
      setLanguage(res.user.preferred_language as SupportedLanguage);
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await authService.register(username, email, password);
    localStorage.setItem('mh_token', res.token);
    setToken(res.token);
    setUser(res.user);
    if (res.user?.preferred_language) {
      setLanguage(res.user.preferred_language as SupportedLanguage);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mh_token');
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    if (nextUser?.preferred_language) {
      setLanguage(nextUser.preferred_language as SupportedLanguage);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
