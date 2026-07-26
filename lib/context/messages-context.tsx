import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { storage } from '@/lib/storage';
import { API_BASE } from '@/lib/api/client';

interface MessagesContextValue {
  socket: Socket | null;
  connected: boolean;
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  joinConversation: (id: number) => void;
  leaveConversation: (id: number) => void;
  onNewMessage: (cb: (data: any) => void) => () => void;
}

const MessagesContext = createContext<MessagesContextValue>({
  socket: null,
  connected: false,
  unreadCount: 0,
  refreshUnread: async () => {},
  joinConversation: () => {},
  leaveConversation: () => {},
  onNewMessage: () => () => {},
});

export const useMessages = () => useContext(MessagesContext);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const listenersRef = useRef<Set<(data: any) => void>>(new Set());

  const refreshUnread = useCallback(async () => {
    try {
      const { default: client } = await import('@/lib/api/client');
      const res = await client.get('/messages/unread-count');
      setUnreadCount(res.data.unread_count ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      const token = await storage.get('auth_token');
      if (!token || !mounted) return;

      const socket = io(API_BASE.replace('/api', ''), {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 30,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (mounted) setConnected(true);
        refreshUnread();
      });

      socket.on('disconnect', () => {
        if (mounted) setConnected(false);
      });

      socket.on('new-message', (data: any) => {
        listenersRef.current.forEach((cb) => cb(data));
        refreshUnread();
      });

      socket.on('connect_error', () => {
        if (mounted) setConnected(false);
      });
    };

    connect();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [refreshUnread]);

  const joinConversation = useCallback((id: number) => {
    socketRef.current?.emit('join-conversation', id);
  }, []);

  const leaveConversation = useCallback((id: number) => {
    socketRef.current?.emit('leave-conversation', id);
  }, []);

  const onNewMessage = useCallback((cb: (data: any) => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  return (
    <MessagesContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        unreadCount,
        refreshUnread,
        joinConversation,
        leaveConversation,
        onNewMessage,
      }}
    >
      {children}
    </MessagesContext.Provider>
  );
}
