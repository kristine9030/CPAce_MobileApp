import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { storage } from '@/lib/storage';
import client from '@/lib/api/client';

const CACHED_USER_KEY = 'cached_auth_user';

export interface AuthUser {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  profile_photo: string | null;
  avatar_color: string;
  streak_days: number;
  total_points: number;
  exam_target_date: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  offline: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (firstName: string, lastName: string, email: string, password: string, passwordConfirmation: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const cacheUser = useCallback(async (nextUser: AuthUser) => {
    setUser(nextUser);
    await storage.set(CACHED_USER_KEY, JSON.stringify(nextUser));
  }, []);

  useEffect(() => {
    (async () => {
      let cachedUser: AuthUser | null = null;
      try {
        const token = await storage.get('auth_token');
        if (token) {
          const cached = await storage.get(CACHED_USER_KEY);
          if (cached) {
            try {
              cachedUser = JSON.parse(cached) as AuthUser;
              setUser(cachedUser);
              setLoading(false);
            } catch {}
          }

          const res = await client.get('/user');
          await cacheUser(res.data.user);
          setOffline(false);
        }
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          await storage.del('auth_token');
          await storage.del(CACHED_USER_KEY);
          setUser(null);
        } else if (cachedUser) {
          setOffline(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [cacheUser]);

  useEffect(() => NetInfo.addEventListener(state => {
    setOffline(state.isConnected === false || state.isInternetReachable === false);
  }), []);

  const login = async (email: string, password: string) => {
    const res = await client.post('/login', { email, password });
    await storage.set('auth_token', res.data.token);
    await cacheUser(res.data.user);
    setOffline(false);
  };

  const signup = async (firstName: string, lastName: string, email: string, password: string, passwordConfirmation: string) => {
    const res = await client.post('/signup', {
      first_name: firstName,
      last_name: lastName,
      email,
      password,
      password_confirmation: passwordConfirmation,
    });
    await storage.set('auth_token', res.data.token);
    await cacheUser(res.data.user);
    setOffline(false);
  };

  const logout = async () => {
    try { await client.post('/logout'); } catch {}
    await storage.del('auth_token');
    await storage.del(CACHED_USER_KEY);
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    try {
      const res = await client.get('/user');
      await cacheUser(res.data.user);
      setOffline(false);
    } catch (err: any) {
      if (!err.response) setOffline(true);
    }
  }, [cacheUser]);

  return (
    <AuthContext.Provider value={{ user, loading, offline, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
