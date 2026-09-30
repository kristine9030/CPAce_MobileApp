import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSegments } from 'expo-router';
import { useAuth } from '@/lib/context/auth-context';
import { subscribeToOfflineQuizSync, syncPendingQuizzes } from '@/lib/offline-quizzes';
import { refreshOfflineQuestionBankIfStale } from '@/lib/offline-question-bank';
import { emitReconnectRefresh } from '@/lib/reconnect-refresh';

export function OfflineSyncManager() {
  const { user, refreshUser } = useAuth();
  const segments = useSegments();
  const segmentsRef = useRef(segments);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => subscribeToOfflineQuizSync(count => {
    Alert.alert(
      count === 1 ? 'Offline Result Saved' : 'Offline Results Saved',
      count === 1
        ? 'Your offline quiz result was successfully saved online. Your score, points, streak, and history are now updated.'
        : `${count} offline quiz results were successfully saved online. Your scores, points, streak, and history are now updated.`,
    );
  }), []);

  useEffect(() => {
    if (!user) return;

    let syncing = false;
    let wasOffline = false;
    const sync = async (refreshScreens = false) => {
      if (syncing) return false;
      syncing = true;
      try {
        const state = await NetInfo.fetch();
        if (state.isConnected && state.isInternetReachable !== false) {
          await syncPendingQuizzes(user.id);
          await refreshUser();
          await refreshOfflineQuestionBankIfStale(user.id);
          const inActiveQuiz = segmentsRef.current[0] === 'quiz' && segmentsRef.current[1] === '[id]';
          if (refreshScreens && !inActiveQuiz) emitReconnectRefresh();
          return true;
        }
      } catch {
        // Connectivity can disappear between the reachability check and sync.
      } finally {
        syncing = false;
      }
      return false;
    };

    sync();
    const unsubscribeNetwork = NetInfo.addEventListener(async state => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (!online) {
        wasOffline = true;
        return;
      }
      const shouldRefresh = wasOffline;
      const refreshed = await sync(shouldRefresh);
      if (shouldRefresh && refreshed) wasOffline = false;
    });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });

    return () => {
      unsubscribeNetwork();
      appStateSubscription.remove();
    };
  }, [user, refreshUser]);

  return null;
}
