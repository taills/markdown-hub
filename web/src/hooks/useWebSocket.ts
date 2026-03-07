import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage } from '@/types';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000; // Max 30 seconds between retries
const HEARTBEAT_INTERVAL = 30000; // Send heartbeat every 30 seconds
const HEARTBEAT_TIMEOUT = 10000; // Expect pong within 10 seconds

interface UseWebSocketOptions {
  documentId: string;
  token: string;
  onMessage: (msg: WSMessage) => void;
  onConnectionChange?: (state: ConnectionState) => void;
}

export function useWebSocket({ documentId, token, onMessage, onConnectionChange }: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const isManualCloseRef = useRef(false);

  onMessageRef.current = onMessage;

  const updateConnectionState = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    onConnectionChange?.(state);
  }, [onConnectionChange]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();

    const sendHeartbeat = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Send ping and wait for pong
        wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

        // Set timeout to detect missing pong
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('[WebSocket] Heartbeat timeout - closing connection');
          wsRef.current?.close();
        }, HEARTBEAT_TIMEOUT);

        // Schedule next heartbeat
        heartbeatTimerRef.current = setTimeout(sendHeartbeat, HEARTBEAT_INTERVAL);
      }
    };

    heartbeatTimerRef.current = setTimeout(sendHeartbeat, HEARTBEAT_INTERVAL);
  }, [clearHeartbeat]);

  const connect = useCallback(() => {
    if (!documentId || !token) {
      updateConnectionState('disconnected');
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const isReconnecting = retryCountRef.current > 0;
    updateConnectionState(isReconnecting ? 'reconnecting' : 'connecting');

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}/ws?document_id=${documentId}&token=${token}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        updateConnectionState('connected');
        retryCountRef.current = 0;
        startHeartbeat();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage;

          // Handle pong response
          if (msg.type === 'pong') {
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            return;
          }

          onMessageRef.current(msg);
        } catch (error) {
          console.warn('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        updateConnectionState('error');
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        clearHeartbeat();
        updateConnectionState('disconnected');

        // Only retry if not manually closed and under retry limit
        if (!isManualCloseRef.current && retryCountRef.current < MAX_RETRIES) {
          // Exponential backoff with jitter
          const exponentialDelay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current);
          const jitter = Math.random() * 1000; // Add random jitter up to 1 second
          const delay = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);

          retryCountRef.current++;
          console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);

          retryTimerRef.current = setTimeout(connect, delay);
        } else if (retryCountRef.current >= MAX_RETRIES) {
          console.error('[WebSocket] Max retries reached');
          updateConnectionState('error');
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      updateConnectionState('error');
    }
  }, [documentId, token, updateConnectionState, startHeartbeat, clearHeartbeat]);

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true;
    clearHeartbeat();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    retryCountRef.current = 0;
  }, [clearHeartbeat]);

  const reconnect = useCallback(() => {
    console.log('[WebSocket] Manual reconnect triggered');
    disconnect();
    isManualCloseRef.current = false;
    retryCountRef.current = 0;
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  useEffect(() => {
    isManualCloseRef.current = false;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const send = useCallback((msg: Omit<WSMessage, 'timestamp'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...msg, timestamp: Date.now() }));
      return true;
    }
    console.warn('[WebSocket] Cannot send - connection not open');
    return false;
  }, []);

  return {
    connectionState,
    send,
    reconnect,
    isConnected: connectionState === 'connected',
    canRetry: retryCountRef.current < MAX_RETRIES,
  };
}
