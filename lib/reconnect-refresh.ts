import { useEffect, useRef } from 'react';

type RefreshListener = () => void | Promise<void>;

const listeners = new Set<RefreshListener>();

export function emitReconnectRefresh() {
  for (const listener of listeners) {
    try {
      void Promise.resolve(listener()).catch(() => {});
    } catch {}
  }
}

export function useReconnectRefresh(callback: RefreshListener) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const listener = () => callbackRef.current();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
