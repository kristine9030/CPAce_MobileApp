import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { storage } from '@/lib/storage';
import { mockRequest } from '@/lib/api/mock';

// ── Toggle: true = fully offline, false = real Express backend (server/) ─────
export const MOCK_MODE = false;

// The Express backend (server/ folder) listens on this port.
const API_PORT = 4000;

// Resolve the dev machine's address automatically:
//  - Expo Go / dev build on a physical device or emulator: derive the LAN IP
//    from the Metro bundler host (Constants.expoConfig.hostUri).
//  - Android emulator fallback: 10.0.2.2 maps to the host machine.
//  - Web: localhost.
function resolveHost(): string {
  const hostUri: string | undefined =
    (Constants.expoConfig as any)?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return host;
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost';
}

export const API_BASE = `http://${resolveHost()}:${API_PORT}/api`;

// ─── Mock client (same interface as axios instance) ───────────────────────────
type Resp<T = any> = Promise<{ data: T }>;

const mock = {
  get:    (url: string, cfg?: any): Resp => mockRequest('GET',    url, cfg?.params).then(data => ({ data })),
  post:   (url: string, body?: any): Resp => mockRequest('POST',   url, body).then(data => ({ data })),
  put:    (url: string, body?: any): Resp => mockRequest('PUT',    url, body).then(data => ({ data })),
  patch:  (url: string, body?: any): Resp => mockRequest('PATCH',  url, body).then(data => ({ data })),
  delete: (url: string): Resp            => mockRequest('DELETE', url).then(data => ({ data })),
};

// ─── Real axios client ────────────────────────────────────────────────────────
const real = axios.create({
  baseURL: API_BASE,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  timeout: 15000,
});

real.interceptors.request.use(async (config) => {
  const token = await storage.get('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

real.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    if (data?.errors) {
      const first = Object.values(data.errors as Record<string, string[]>)[0];
      err.message = Array.isArray(first) ? first[0] : String(first);
    } else if (data?.message) {
      err.message = data.message;
    }
    return Promise.reject(err);
  },
);

const client: Pick<AxiosInstance, 'get' | 'post' | 'put' | 'patch' | 'delete'> =
  MOCK_MODE ? (mock as any) : real;

export default client;
