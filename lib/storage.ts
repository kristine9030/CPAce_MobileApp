import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Web fallback — SecureStore only works on iOS / Android native
const mem = new Map<string, string>();

export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return mem.get(key) ?? null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { mem.set(key, value); return; }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },

  async del(key: string): Promise<void> {
    if (Platform.OS === 'web') { mem.delete(key); return; }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};
