import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import client from '@/lib/api/client';

export interface AuthUser {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  profile_photo: string | null;
  streak_days: number;
  total_points: number;
  exam_target_date: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (firstName: string, lastName: string, email: string, password: string, passwordConfirmation: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.get('auth_token');
        if (token) {
          const res = await client.get('/user');
          setUser(res.data.user);
        }
      } catch {
        await storage.del('auth_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await client.post('/login', { email, password });
    await storage.set('auth_token', res.data.token);
    setUser(res.data.user);
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
    setUser(res.data.user);
  };

  const logout = async () => {
    try { await client.post('/logout'); } catch {}
    await storage.del('auth_token');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await client.get('/user');
      setUser(res.data.user);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
