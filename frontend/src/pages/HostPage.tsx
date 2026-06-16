import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSong } from "../api";
import Toast from "../components/Toast";
import type { Song } from "../types";
import { useJukebox } from "../useJukebox";
import { useYouTubePlayer } from "../useYouTubePlayer";

const DEFAULT_VOLUME = 70;

function loadInitialVolume(): number {
  const v = Number(localStorage.getItem("host_volume"));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_VOLUME;
}

export default function HostPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [volume, setVolumeState] = useState<number>(loadInitialVolume);

  // useJukebox 의 send 를 onEnded(닫힌 콜백) 안에서 항상 최신으로 쓰기 위한 ref
  const sendRef = useRef<((m: Record<string, unknown>) => void) | null>(null);

  // 곡이 끝나면 서버에 알린다 (서버가 다음 곡을 자동 재생).
  const onEnded = useCallback(() => {
    sendRef.current?.({ type: "ended" });
  }, []);

  const { play, stop, setVolume } = useYouTubePlayer("yt-host-player", {
    onEnded,
    volume,
  });

  const handleVolumeChange = (v: number) => {
    setVolumeState(v);
    localStorage.setItem("host_volume", String(v));
    setVolume(v);
  };

  const handlePlay = useCallback((song: Song) => play(song.video_id), [play]);
  const handleStop = useCallback(() => stop(), [stop]);

  const { connected, songs, playback, error, clearError, send } = useJukebox(
    "host",
    { onPlay: handlePlay, onStop: handleStop }
  );
  sendRef.current = send;

  const hostPlay = (songId?: number) => {
    send({ type: "host_play", song_id: songId ?? null });
  };
  const hostStop = () => {
    send({ type: "host_stop" });
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>🖥️ 호스트 (재생 화면)</h1>
        <div className="status">
          <span className="dot" style={{ background: connected ? "#2ecc71" : "#ff4b4b" }} />
          {connected ? "연결됨" : "연결 끊김"}
          <Link className="role-link" to="/" style={{ marginLeft: 10 }}>
            ← 클라이언트 화면
          </Link>
        </div>
      </div>

      <div className="grid host">
        <div className="panel">
          <h2>▶️ 지금 재생</h2>
          <div className="player-wrap">
            <div id="yt-host-player" />
            {!playback.current_song && (
              <div className="player-placeholder">
                대기 중… 클라이언트가 ▶ 를 누르거나, 아래 “대기열 맨 앞 재생”을 누르세요.
              </div>
            )}
          </div>

          <div className="hostbtns">
            <button
              className="play"
              disabled={playback.is_playing || songs.length === 0}
              onClick={() => hostPlay()}
            >
              ▶ 대기열 맨 앞 재생
            </button>
            <button className="danger" disabled={!playback.is_playing} onClick={hostStop}>
              ■ 정지
            </button>
          </div>

          <div className="volume-row">
            <span className="volume-label">🔊 고정 볼륨</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
            />
            <span className="volume-value">{volume}%</span>
          </div>

          <div className="hint">
            브라우저 자동재생 정책 때문에 첫 재생이 막히면 플레이어를 한 번 클릭해 주세요.
            이후 클라이언트의 재생 요청이 자동으로 반영됩니다. 곡이 끝나면 다음 곡이 자동
            재생됩니다. 설정한 고정 볼륨은 곡이 바뀌어도 항상 동일하게 유지됩니다.
          </div>
        </div>

        <div className="panel">
          <h2>📋 대기열 ({songs.length})</h2>
          {playback.current_song && (
            <div className="now-banner">
              <img
                src={playback.current_song.thumbnail}
                alt=""
                style={{ width: 64, height: 36, objectFit: "cover", borderRadius: 6 }}
              />
              <div style={{ minWidth: 0 }}>
                <div className="label">● 재생 중</div>
                <div className="title" style={{ fontSize: "0.85rem" }}>
                  {playback.current_song.title}
                </div>
              </div>
            </div>
          )}
          <div className="list">
            {songs.length === 0 && <div className="empty">대기열이 비어 있어요.</div>}
            {songs.map((s) => {
              const isCurrent = playback.current_song?.id === s.id;
              return (
                <div className={`song ${isCurrent ? "current" : ""}`} key={s.id}>
                  <img src={s.thumbnail} alt="" />
                  <div className="meta">
                    <div className="title">{s.title}</div>
                    <div className="sub">
                      {[s.channel, s.duration].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="play"
                      disabled={playback.is_playing}
                      title="이 곡 재생"
                      onClick={() => hostPlay(s.id)}
                    >
                      ▶
                    </button>
                    <button className="danger" title="삭제" onClick={() => deleteSong(s.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Toast
        message={toast ?? error}
        onClose={toast ? () => setToast(null) : clearError}
      />
    </div>
  );
}
