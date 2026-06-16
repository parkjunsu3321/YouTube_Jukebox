import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackState, Song } from "./types";

type Role = "host" | "client";

interface Handlers {
  onPlay?: (song: Song) => void;
  onStop?: () => void;
}

interface JukeboxState {
  connected: boolean;
  songs: Song[];
  playback: PlaybackState;
  error: string | null;
  clearError: () => void;
  send: (msg: Record<string, unknown>) => void;
}

const DEFAULT_PLAYBACK: PlaybackState = {
  is_playing: false,
  current_song: null,
  host_online: false,
};

export function useJukebox(role: Role, handlers: Handlers = {}): JukeboxState {
  const [connected, setConnected] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>(DEFAULT_PLAYBACK);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldRunRef = useRef(true);

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws/${role}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "queue":
          setSongs(msg.songs ?? []);
          break;
        case "playback":
          setPlayback({
            is_playing: !!msg.is_playing,
            current_song: msg.current_song ?? null,
            host_online: !!msg.host_online,
          });
          break;
        case "play":
          if (msg.song) handlersRef.current.onPlay?.(msg.song);
          break;
        case "stop":
          handlersRef.current.onStop?.();
          break;
        case "error":
          setError(msg.message ?? "오류가 발생했습니다.");
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (shouldRunRef.current && !reconnectRef.current) {
        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null;
          connect();
        }, 1500);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [role]);

  useEffect(() => {
    shouldRunRef.current = true;
    connect();
    return () => {
      shouldRunRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { connected, songs, playback, error, clearError, send };
}
