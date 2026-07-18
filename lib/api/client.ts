import axios, { AxiosInstance } from 'axios';
import { storage } from '@/lib/storage';
import { mockRequest } from '@/lib/api/mock';

// ── Toggle: true = fully offline, false = real Laravel backend ────────────────
export const MOCK_MODE = true;

// ── LAN IP for physical device — run `ipconfig` and use your IPv4 address ────
export const API_BASE = 'http://10.0.2.2/api';

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
