import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoading = false;
const readyCallbacks: Array<() => void> = [];

function loadApi(onReady: () => void) {
  if (window.YT && window.YT.Player) {
    onReady();
    return;
  }
  readyCallbacks.push(onReady);
  if (apiLoading) return;
  apiLoading = true;

  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    readyCallbacks.splice(0).forEach((cb) => cb());
  };

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

interface Options {
  onEnded: () => void;
  /** 0~100 으로 고정할 볼륨. 곡이 바뀌거나 재생이 시작될 때마다 이 값으로 다시 맞춘다. */
  volume?: number;
}

export function useYouTubePlayer(
  containerId: string,
  { onEnded, volume = 70 }: Options
) {
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const applyVolume = useCallback(() => {
    const p = playerRef.current;
    if (p && readyRef.current) {
      try {
        p.unMute?.();
        p.setVolume?.(Math.max(0, Math.min(100, volumeRef.current)));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadApi(() => {
      if (cancelled) return;
      playerRef.current = new window.YT.Player(containerId, {
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          autoplay: 1,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            applyVolume();
          },
          onStateChange: (e: any) => {
            // 0 === ENDED, 1 === PLAYING
            if (e.data === 0) onEndedRef.current();
            if (e.data === 1) applyVolume(); // 재생 시작 때마다 고정 볼륨 재적용
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
  }, [containerId, applyVolume]);

  const play = useCallback(
    (videoId: string) => {
      const loadAndFix = (pl: any) => {
        pl.loadVideoById(videoId);
        setTimeout(applyVolume, 300);
      };
      const p = playerRef.current;
      if (p && readyRef.current && p.loadVideoById) {
        loadAndFix(p);
      } else {
        // 플레이어가 아직 준비 안됐으면 잠깐 뒤 재시도
        const t = setInterval(() => {
          const pl = playerRef.current;
          if (pl && readyRef.current && pl.loadVideoById) {
            loadAndFix(pl);
            clearInterval(t);
          }
        }, 200);
        setTimeout(() => clearInterval(t), 4000);
      }
    },
    [applyVolume]
  );

  const stop = useCallback(() => {
    try {
      playerRef.current?.stopVideo?.();
    } catch {
      /* ignore */
    }
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      volumeRef.current = v;
      applyVolume();
    },
    [applyVolume]
  );

  return { play, stop, setVolume };
}
