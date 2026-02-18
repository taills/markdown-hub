import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage } from '@/types';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

const MAX_RETRIES = 8;
const BASE_DELAY_MS = 500;

interface UseWebSocketOptions {
  documentId: string;
  token: string;
  onMessage: (msg: WSMessage) => void;
}

export function useWebSocket({ documentId, token, onMessage }: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('connecting');
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}/ws?document_id=${documentId}&token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('connected');
      retryCountRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        onMessageRef.current(msg);
      } catch {
        // Ignore malformed messages.
      }
    };

    ws.onerror = () => setConnectionState('error');

    ws.onclose = () => {
      setConnectionState('disconnected');
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };
  }, [documentId, token]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: Omit<WSMessage, 'timestamp'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...msg, timestamp: Date.now() }));
    }
  }, []);

  return { connectionState, send };
}
