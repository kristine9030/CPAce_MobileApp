import React, { createContext, useContext, useState, useCallback } from 'react';

interface AiTutorContextType {
  visible: boolean;
  open: () => void;
  close: () => void;
  /** Opens the panel and immediately sends `question` as a user message. */
  askAI: (question: string) => void;
  pendingQuestion: string | null;
  consumePendingQuestion: () => void;
}

const AiTutorContext = createContext<AiTutorContextType | null>(null);

export function AiTutorProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const open  = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const askAI = useCallback((question: string) => {
    setPendingQuestion(question);
    setVisible(true);
  }, []);

  const consumePendingQuestion = useCallback(() => setPendingQuestion(null), []);

  return (
    <AiTutorContext.Provider value={{ visible, open, close, askAI, pendingQuestion, consumePendingQuestion }}>
      {children}
    </AiTutorContext.Provider>
  );
}

export function useAiTutor() {
  const ctx = useContext(AiTutorContext);
  if (!ctx) throw new Error('useAiTutor must be used inside AiTutorProvider');
  return ctx;
}
